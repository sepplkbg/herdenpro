// ══════════════════════════════════════════════════════════════════════════════
//  SENNEREI-MODUL — Wochen-Abholungsverwaltung
//  Datenmodell: sennerei/wochen/{yyyy-Www}/bauern/{normalisierterName}/
//  Rolle "sennerei" (oder admin) hat Zugriff.
//  Phase A: Import via PDF-Upload + Wochen-Liste
//  Phase B (später): Abholung + Touch-Signatur + PDF-Export
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '1.0';
  window.SENNEREI_VERSION = VERSION;

  // ── Utilities ──
  function normalisierName(s) {
    return String(s || '').toLowerCase()
      .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  }

  function isoWochenId(datum) {
    // ISO week number, format YYYY-Www
    const d = new Date(datum || Date.now());
    d.setHours(0,0,0,0);
    // Donnerstag der aktuellen Woche (ISO 8601 Wochendef.)
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const yearStart = new Date(d.getFullYear(), 0, 4);
    const week = Math.ceil((((d - yearStart) / 86400000) + yearStart.getDay() + 1) / 7);
    return d.getFullYear() + '-W' + String(week).padStart(2, '0');
  }

  // ── PDF-Parser (via PDF.js) ──
  // Erwartet die Struktur der Sennerei-Abholungsliste.
  // Extrahiert Text mit Positionen, gruppiert nach Y-Zeilen, teilt in Spalten auf.
  async function parseSennereiPdf(file) {
    if(typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js nicht geladen. Bitte App neu laden.');
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // Alle Text-Items aus allen Seiten sammeln (mit y-offset pro Seite)
    const allItems = [];
    let yOffset = 0;
    for(let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      textContent.items.forEach(item => {
        if(!item.str || !item.str.trim()) return;
        // transform = [scaleX, skewY, skewX, scaleY, x, y]
        const x = item.transform[4];
        const y = viewport.height - item.transform[5] + yOffset; // Y invertieren, PDF-Koord
        allItems.push({ str: item.str.trim(), x, y });
      });
      yOffset += viewport.height + 20; // Puffer zwischen Seiten
    }

    // Zeilen bilden (nach y-Koordinate mit Toleranz von 3 pt)
    allItems.sort((a,b) => a.y - b.y || a.x - b.x);
    const rows = [];
    let currentRow = null;
    const Y_TOL = 3;
    allItems.forEach(item => {
      if(currentRow && Math.abs(item.y - currentRow.y) < Y_TOL) {
        currentRow.items.push(item);
      } else {
        currentRow = { y: item.y, items: [item] };
        rows.push(currentRow);
      }
    });
    // Innerhalb jeder Zeile nach x sortieren
    rows.forEach(r => r.items.sort((a,b) => a.x - b.x));

    // Struktur analysieren: Erkennt Header-Zeile "Bauer Produkt Verk% Soll Guthaben..."
    // Danach Datenzeilen (Käse/Butter im Wechsel), Bauer-Name kann in eigener Zeile davor stehen
    const headerRowIdx = rows.findIndex(r =>
      r.items.some(i => /^Bauer$/i.test(i.str)) &&
      r.items.some(i => /^Produkt$/i.test(i.str))
    );
    if(headerRowIdx < 0) throw new Error('Kein Header "Bauer Produkt" gefunden — ist das die richtige PDF?');

    // Meta aus dem oberen Bereich
    const headerText = rows.slice(0, headerRowIdx).map(r => r.items.map(i => i.str).join(' ')).join(' ');
    let wocheNr = null, jahr = new Date().getFullYear(), startDatum = null, endeDatum = null;
    const wocheMatch = headerText.match(/Woche\s+(\d+)\s*\((\d{2}\.\d{2}\.)-\s*(\d{2}\.\d{2}\.\d{4})\)/);
    if(wocheMatch) {
      wocheNr = parseInt(wocheMatch[1]);
      jahr = parseInt(wocheMatch[3].slice(-4));
      startDatum = wocheMatch[2] + jahr;
      endeDatum = wocheMatch[3];
    }
    let maxKaese = 0, maxButter = 0;
    const maxMatch = headerText.match(/Neu\s+K:\s*([\d,.-]+)\s*\/\s*B:\s*([\d,.-]+)/i);
    if(maxMatch) {
      maxKaese = parseFloat(maxMatch[1].replace(',', '.')) || 0;
      maxButter = parseFloat(maxMatch[2].replace(',', '.')) || 0;
    }

    // Datenzeilen: nach Header, jeweils 2 Zeilen pro Bauer (Käse + Butter)
    // Muster: [Bauer-Name-Fragment(e)] Käse VerkProz SollKg GuthKg ZumAbholenKg [KloetzeKäse] [AbgeholtKg] [NaturalrAnspruch] [NaturalrAbgeholt] [Chargen] [AbholungGesamt] [Unterschrift]
    // Bauern werden extrahiert indem wir Zeilen mit "Käse" bzw "Butter" als Produkt-Indikator finden.
    const dataRows = rows.slice(headerRowIdx + 1).filter(r => {
      const text = r.items.map(i => i.str).join(' ');
      // Footer-Zeilen ausfiltern
      if(/Nassereinalm|Sommer\s*20|Engineering by/i.test(text)) return false;
      if(!text.trim()) return false;
      return true;
    });

    // Jeweils 2 Zeilen zusammen: Käse-Zeile + Butter-Zeile (mit Bauer-Name)
    // Bauer-Name kann in der Käse-Zeile stehen ODER in der Zeile darüber
    const bauern = [];
    let currentBauer = null;
    let pendingName = ''; // Sammelt Text vor der Käse-Zeile

    dataRows.forEach(row => {
      const text = row.items.map(i => i.str).join(' ');
      const hasKaese = row.items.some(i => /^Käse$/i.test(i.str));
      const hasButter = row.items.some(i => /^Butter$/i.test(i.str));

      if(hasKaese) {
        // Bauer-Name = alles vor dem "Käse"-Wort
        const kaeseIdx = row.items.findIndex(i => /^Käse$/i.test(i.str));
        const nameFragmente = row.items.slice(0, kaeseIdx).map(i => i.str);
        let nameHier = nameFragmente.join(' ').trim();
        // Falls Name in Vorzeile war (pendingName gesetzt), nutze diesen
        const finalName = (pendingName + ' ' + nameHier).trim() || pendingName || nameHier || 'UNBEKANNT';

        // Werte extrahieren aus den Items nach "Käse"
        const vals = row.items.slice(kaeseIdx + 1);
        currentBauer = {
          name: finalName,
          nameNorm: normalisierName(finalName),
          kaese: extractProduktZeile(vals),
          butter: null
        };
        bauern.push(currentBauer);
        pendingName = '';
      } else if(hasButter && currentBauer) {
        const butterIdx = row.items.findIndex(i => /^Butter$/i.test(i.str));
        const vals = row.items.slice(butterIdx + 1);
        currentBauer.butter = extractProduktZeile(vals);
      } else {
        // Zeile ohne Käse/Butter — vermutlich Name der nächsten Käse-Zeile
        pendingName = (pendingName + ' ' + text).trim();
      }
    });

    return {
      wocheId: wocheNr ? (jahr + '-W' + String(wocheNr).padStart(2, '0')) : isoWochenId(),
      wocheNr,
      jahr,
      startDatum,
      endeDatum,
      maxVerkaufbar: { kaese: maxKaese, butter: maxButter },
      bauern
    };
  }

  // Extrahiert Zahlen aus einer Produkt-Zeile
  // Reihenfolge in PDF: Verk%, Soll, GuthabenVorwoche, ZumAbholen, Klötze, Abgeholt, NaturalrAnspruch, NaturalrAbgeholt, Chargen, AbholungGesamt
  function extractProduktZeile(items) {
    const nums = items.map(i => i.str);
    // Verk% = erster mit "%" oder erste Zahl
    let verkProz = 0;
    let numStartIdx = 0;
    const procIdx = nums.findIndex(s => /^\d+%$/.test(s));
    if(procIdx >= 0) {
      verkProz = parseInt(nums[procIdx]) || 0;
      numStartIdx = procIdx + 1;
    }
    const parseZahl = (s) => {
      if(!s) return 0;
      const n = parseFloat(String(s).replace(',', '.'));
      return isNaN(n) ? 0 : n;
    };
    return {
      verkProzent: verkProz,
      soll: parseZahl(nums[numStartIdx]),
      guthabenVorwoche: parseZahl(nums[numStartIdx + 1]),
      zumAbholen: parseZahl(nums[numStartIdx + 2]),
      klotze: 0,           // Wird bei Abholung eingetragen
      abgeholt: 0,         // Wird bei Abholung eingetragen
      naturalrAnspruch: parseZahl(nums[numStartIdx + 5]) || parseZahl(nums[numStartIdx + 4]),
      naturalrAbgeholt: 0, // Wird bei Abholung eingetragen
      chargen: [],         // Wird bei Abholung eingetragen
      _rawItems: nums      // Debug: alle Zahlen für Nachbearbeitung
    };
  }

  window.parseSennereiPdf = parseSennereiPdf;
  window.sennereiIsoWochenId = isoWochenId;
  window.sennereiNormalisierName = normalisierName;

  // ── Wochen laden/speichern ──
  window.sennereiLadeWochen = function(callback) {
    if(!firebase || !firebase.database) return callback && callback([]);
    firebase.database().ref('sennerei/wochen').orderByKey().limitToLast(20).once('value')
      .then(snap => {
        const val = snap.val() || {};
        const wochen = Object.entries(val).map(([id, w]) => ({ id, ...w })).sort((a,b) => b.id.localeCompare(a.id));
        callback && callback(wochen);
      })
      .catch(e => { console.warn('[Sennerei] Wochen laden:', e); callback && callback([]); });
  };

  window.sennereiSpeichereWoche = async function(wocheData) {
    if(!wocheData || !wocheData.wocheId) throw new Error('Keine wocheId');
    const _retry = window.withAuthRetry || (async fn => await fn());
    // Bauern-Struktur für Firebase (nur was gebraucht wird, kein _rawItems)
    const bauern = {};
    (wocheData.bauern || []).forEach(b => {
      const id = b.nameNorm;
      if(!id) return;
      const strip = (p) => p ? {
        verkProzent: p.verkProzent, soll: p.soll,
        guthabenVorwoche: p.guthabenVorwoche, zumAbholen: p.zumAbholen,
        klotze: p.klotze, abgeholt: p.abgeholt,
        naturalrAnspruch: p.naturalrAnspruch, naturalrAbgeholt: p.naturalrAbgeholt,
        chargen: p.chargen || []
      } : null;
      bauern[id] = {
        name: b.name,
        kaese: strip(b.kaese),
        butter: strip(b.butter)
      };
    });
    const payload = {
      wocheNr: wocheData.wocheNr || null,
      jahr: wocheData.jahr || new Date().getFullYear(),
      startDatum: wocheData.startDatum || null,
      endeDatum: wocheData.endeDatum || null,
      importiertAm: Date.now(),
      importiertVon: (firebase.auth && firebase.auth().currentUser && firebase.auth().currentUser.uid) || null,
      maxVerkaufbar: wocheData.maxVerkaufbar || { kaese: 0, butter: 0 },
      bauern: bauern
    };
    await _retry(() => firebase.database().ref('sennerei/wochen/' + wocheData.wocheId).set(payload));
    return wocheData.wocheId;
  };

  // ── Bauer-Matching mit App-Bauern (window.bauern) ──
  window.sennereiMatchBauer = function(nameNorm) {
    const bauern = window.bauern || {};
    for(const [id, b] of Object.entries(bauern)) {
      const matchName = normalisierName(b.name || '');
      if(matchName === nameNorm) return { id, ...b };
      // Fuzzy: "Auer Günther" vs "Günther Auer"
      const parts1 = nameNorm.split('-').filter(Boolean).sort().join('-');
      const parts2 = matchName.split('-').filter(Boolean).sort().join('-');
      if(parts1 === parts2 && parts1.length > 3) return { id, ...b };
    }
    return null;
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // VIEWS
  // ══════════════════════════════════════════════════════════════════════════════
  let _wochenCache = [];
  let _wochenLoading = false;

  window.renderSennerei = function() {
    // Wochen im Hintergrund laden
    if(!_wochenLoading) {
      _wochenLoading = true;
      window.sennereiLadeWochen(w => {
        _wochenCache = w;
        _wochenLoading = false;
        // Neu rendern falls User noch auf Sennerei-Seite
        if(window.currentView === 'sennerei' && typeof render === 'function') render();
      });
    }
    const wochen = _wochenCache;
    return `
      <div class="page-header">
        <h2>🥛 Sennerei — Abholung</h2>
        <div style="display:flex;gap:.4rem">
          <button class="btn-primary" onclick="sennereiUploadPdf()">📥 Woche via PDF importieren</button>
        </div>
      </div>

      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:.8rem;margin-bottom:.8rem">
        <div style="font-size:.85rem;color:var(--text2);line-height:1.5">
          Lade jede Woche die aktuelle Abholungsliste (PDF von deinem Sennerei-System) hoch.
          Die App liest die Werte aus, matcht die Bauern und speichert die Woche.
          Danach kannst du für jeden Bauer die Abholung digital erfassen.
        </div>
      </div>

      <div class="section-title">Aktuelle & vergangene Wochen</div>
      ${wochen.length === 0 ? (
        _wochenLoading
          ? '<div class="empty-state">⏳ Lade Wochen…</div>'
          : '<div class="empty-state">Noch keine Wochen importiert.<br>Tippe oben auf „📥 Woche via PDF importieren" um zu starten.</div>'
      ) : ''}
      <div class="card-list">
        ${wochen.map(w => {
          const bauernAnz = w.bauern ? Object.keys(w.bauern).length : 0;
          const startEnde = (w.startDatum || '') + (w.endeDatum ? ' – ' + w.endeDatum : '');
          return `
            <div class="list-card" onclick="sennereiOeffneWoche('${w.id}')" style="cursor:pointer">
              <div class="list-card-left"><div>
                <div class="list-card-title">Woche ${w.wocheNr || w.id}</div>
                <div class="list-card-sub">${startEnde} · ${bauernAnz} Bauern</div>
              </div></div>
              <div class="list-card-right">
                <span style="font-size:.7rem;color:var(--text3)">▸</span>
              </div>
            </div>`;
        }).join('')}
      </div>
    `;
  };

  window.renderSennereiWoche = function() {
    const wid = window._sennereiAktiveWoche;
    const woche = _wochenCache.find(w => w.id === wid);
    if(!woche) {
      return `
        <div class="page-header"><h2>🥛 Sennerei-Woche</h2><button class="btn-secondary" onclick="navigate('sennerei')">← Zurück</button></div>
        <div class="empty-state">Woche nicht gefunden. <a onclick="navigate('sennerei')" style="color:var(--gold);cursor:pointer">Zurück zur Übersicht</a></div>
      `;
    }
    const bauern = Object.entries(woche.bauern || {}).sort((a,b) => (a[1].name||'').localeCompare(b[1].name||''));
    return `
      <div class="page-header">
        <h2>🥛 Woche ${woche.wocheNr}</h2>
        <button class="btn-secondary" onclick="navigate('sennerei')">← Zurück</button>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.6rem .8rem;margin-bottom:.8rem;font-size:.82rem;color:var(--text2)">
        ${woche.startDatum || ''} – ${woche.endeDatum || ''}<br>
        Max. verkaufbar: <b>Käse ${woche.maxVerkaufbar?.kaese||0} kg</b> · <b>Butter ${woche.maxVerkaufbar?.butter||0} kg</b>
      </div>
      <div class="section-title">Bauern (${bauern.length})</div>
      <div class="card-list">
        ${bauern.map(([bid, b]) => {
          const matched = window.sennereiMatchBauer(bid);
          const matchIcon = matched ? '' : '<span style="color:#ff9632" title="Bauer nicht in App-Liste gefunden">⚠</span>';
          const kaeseZ = b.kaese?.zumAbholen || 0;
          const butterZ = b.butter?.zumAbholen || 0;
          return `
            <div class="list-card" style="cursor:default">
              <div class="list-card-left"><div>
                <div class="list-card-title">${b.name} ${matchIcon}</div>
                <div class="list-card-sub">Käse: ${kaeseZ} kg · Butter: ${butterZ} kg</div>
              </div></div>
              <div class="list-card-right">
                <span style="color:var(--text3);font-size:.75rem">Phase 2</span>
              </div>
            </div>`;
        }).join('')}
      </div>
      <div class="empty-state" style="margin-top:1rem">
        Die Abholungs-Erfassung (Phase 2) kommt im nächsten Update — dann tippst du hier auf einen Bauer und trägst Klötze, kg, Chargen + Unterschrift ein.
      </div>
    `;
  };

  window.sennereiOeffneWoche = function(id) {
    window._sennereiAktiveWoche = id;
    if(typeof navigate === 'function') navigate('sennerei_woche');
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // PDF-UPLOAD
  // ══════════════════════════════════════════════════════════════════════════════
  window.sennereiUploadPdf = function() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/pdf,.pdf';
    inp.style.display = 'none';
    inp.onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if(!file) return;
      try {
        if(window.showSaveToast) window.showSaveToast('⏳ PDF wird geparst…');
        const parsed = await window.parseSennereiPdf(file);
        // Vorschau anzeigen
        window.sennereiZeigeImportVorschau(parsed);
      } catch(err) {
        console.error('[Sennerei] PDF-Parse fail:', err);
        alert('Fehler beim PDF-Parsen:\n\n' + (err.message || err) + '\n\nIst das die richtige PDF-Datei?');
      }
    };
    document.body.appendChild(inp);
    inp.click();
    setTimeout(() => document.body.removeChild(inp), 1000);
  };

  window.sennereiZeigeImportVorschau = function(parsed) {
    let ov = document.getElementById('sennerei-import-overlay');
    if(!ov) {
      ov = document.createElement('div');
      ov.id = 'sennerei-import-overlay';
      ov.className = 'form-overlay';
      ov.style.cssText = 'display:flex;z-index:700';
      document.body.appendChild(ov);
    }
    const bauernRows = (parsed.bauern || []).map(b => {
      const match = window.sennereiMatchBauer(b.nameNorm);
      const status = match ? '<span style="color:var(--green)">✓</span>' : '<span style="color:#ff9632">⚠</span>';
      return `<tr>
        <td style="padding:.3rem .5rem">${status}</td>
        <td style="padding:.3rem .5rem;font-weight:600">${b.name}</td>
        <td style="padding:.3rem .5rem;text-align:right;font-family:monospace">${b.kaese?.zumAbholen||0}</td>
        <td style="padding:.3rem .5rem;text-align:right;font-family:monospace">${b.butter?.zumAbholen||0}</td>
        <td style="padding:.3rem .5rem;text-align:right;font-family:monospace;color:var(--text3);font-size:.75rem">${b.kaese?.verkProzent||0}%/${b.butter?.verkProzent||0}%</td>
      </tr>`;
    }).join('');
    const nichtGematcht = (parsed.bauern||[]).filter(b => !window.sennereiMatchBauer(b.nameNorm)).length;

    ov.innerHTML =
      '<div class="form-sheet" style="max-height:90vh;overflow-y:auto">' +
        '<div class="form-header">' +
          '<h3>📥 Import-Vorschau · Woche ' + (parsed.wocheNr||'?') + '</h3>' +
          '<button class="close-btn" onclick="document.getElementById(\'sennerei-import-overlay\').remove()">✕</button>' +
        '</div>' +
        '<div class="form-body">' +
          '<div style="background:var(--bg2);padding:.6rem;border-radius:8px;margin-bottom:.8rem;font-size:.85rem">' +
            '<b>Zeitraum:</b> ' + (parsed.startDatum||'?') + ' – ' + (parsed.endeDatum||'?') + '<br>' +
            '<b>Max. verkaufbar:</b> Käse ' + parsed.maxVerkaufbar.kaese + ' kg · Butter ' + parsed.maxVerkaufbar.butter + ' kg<br>' +
            '<b>Bauern erkannt:</b> ' + parsed.bauern.length +
            (nichtGematcht > 0 ? ' · <span style="color:#ff9632">' + nichtGematcht + ' nicht in App-Bauern gefunden ⚠</span>' : '') +
          '</div>' +
          '<div style="max-height:50vh;overflow-y:auto;border:1px solid var(--border);border-radius:8px">' +
            '<table style="width:100%;border-collapse:collapse;font-size:.85rem">' +
              '<thead style="background:var(--bg3);position:sticky;top:0"><tr>' +
                '<th style="padding:.4rem;text-align:left;font-size:.7rem;color:var(--text3)"></th>' +
                '<th style="padding:.4rem;text-align:left;font-size:.7rem;color:var(--text3)">BAUER</th>' +
                '<th style="padding:.4rem;text-align:right;font-size:.7rem;color:var(--text3)">KÄSE kg</th>' +
                '<th style="padding:.4rem;text-align:right;font-size:.7rem;color:var(--text3)">BUTTER kg</th>' +
                '<th style="padding:.4rem;text-align:right;font-size:.7rem;color:var(--text3)">VERK%</th>' +
              '</tr></thead>' +
              '<tbody>' + bauernRows + '</tbody>' +
            '</table>' +
          '</div>' +
          '<div style="display:flex;gap:.5rem;margin-top:1rem">' +
            '<button class="btn-secondary" style="flex:1" onclick="document.getElementById(\'sennerei-import-overlay\').remove()">Abbrechen</button>' +
            '<button class="btn-primary" style="flex:1" onclick="sennereiImportBestaetigen()">✓ Woche speichern</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    window._sennereiImportPending = parsed;
  };

  window.sennereiImportBestaetigen = async function() {
    const parsed = window._sennereiImportPending;
    if(!parsed) return;
    const btn = document.querySelector('#sennerei-import-overlay .btn-primary');
    if(btn) { btn.disabled = true; btn.textContent = '⏳ Speichere…'; }
    try {
      const id = await window.sennereiSpeichereWoche(parsed);
      _wochenCache = []; // Cache leeren, wird beim nächsten Render neu geladen
      _wochenLoading = false;
      document.getElementById('sennerei-import-overlay')?.remove();
      window._sennereiImportPending = null;
      if(window.showSaveToast) window.showSaveToast('✓ Woche ' + parsed.wocheNr + ' gespeichert (' + parsed.bauern.length + ' Bauern)');
      if(typeof render === 'function') render();
    } catch(err) {
      console.error('[Sennerei] Import-Save fail:', err);
      alert('Fehler beim Speichern:\n\n' + (err.message || err));
      if(btn) { btn.disabled = false; btn.textContent = '✓ Woche speichern'; }
    }
  };

  console.log('[Sennerei] Modul geladen v' + VERSION);
})();
