// ══════════════════════════════════════════════════════════════════════════════
//  SENNEREI-MODUL — Wochen-Abholungsverwaltung
//  Datenmodell: sennerei/wochen/{yyyy-Www}/bauern/{normalisierterName}/
//  Rolle "sennerei" (oder admin) hat Zugriff.
//  Phase A: Import via PDF-Upload + Wochen-Liste
//  Phase B (später): Abholung + Touch-Signatur + PDF-Export
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '2.0';
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

    // Header-Row-Muster erkennen (auf JEDER Seite: "Bauer Produkt Verk% Soll ...")
    // Diese müssen komplett übersprungen werden, sonst landen sie im Bauer-Namen
    const isHeaderRow = (row) => {
      const text = row.items.map(i => i.str).join(' ');
      return /Bauer/i.test(text) && /Produkt/i.test(text) &&
             (/Verk/i.test(text) || /Soll/i.test(text) || /Guthaben/i.test(text) || /Naturalr/i.test(text) || /Chargen/i.test(text) || /Unterschrift/i.test(text));
    };
    const isFooterRow = (row) => {
      const text = row.items.map(i => i.str).join(' ');
      return /Nassereinalm|Sommer\s*20\d\d|Engineering\s+by/i.test(text);
    };
    // Alle Header-Wörter die NICHT in einen Bauernamen gehören
    const isNoiseText = (text) => {
      return /^(Bauer|Produkt|Verk%|Soll|Guthaben|Vorwoche|Zum|Abholen|Klötze|Abgeholt|Naturalr\.?|Anspruch|abgeholt|Chargen|Abholung|Gesamt|Unterschrift|Neu|Max\.?\s*verkaufbar|Wochenabholung|Woche\s+\d)$/i.test(text.trim());
    };

    const dataRows = rows.slice(headerRowIdx + 1).filter(r => {
      if(!r.items.length) return false;
      if(isHeaderRow(r)) return false;
      if(isFooterRow(r)) return false;
      const text = r.items.map(i => i.str).join('').trim();
      if(!text) return false;
      // Max-verkaufbar-Zeile skippen
      if(/^Max\.?\s*verkaufbar/i.test(text)) return false;
      return true;
    });

    // Bauer-Name kann über 2 Zeilen gehen (z.B. "Achenrainer" / "Simon" ODER "Auer Günther" auf 1 Zeile)
    // Muster: [Name-Zeile(n)] → Käse-Zeile → Butter-Zeile → nächster Bauer
    const bauern = [];
    let currentBauer = null;
    let pendingName = '';

    // Text-Fragmente die als Bauer-Name durchgehen (nicht Header/Noise)
    const cleanNameFragment = (text) => {
      const parts = text.split(/\s+/).filter(p => p && !isNoiseText(p) && !/^\d/.test(p) && !/^-?\d+[,.]\d/.test(p));
      return parts.join(' ').trim();
    };

    dataRows.forEach(row => {
      const hasKaese = row.items.some(i => /^Käse$/i.test(i.str));
      const hasButter = row.items.some(i => /^Butter$/i.test(i.str));

      if(hasKaese) {
        const kaeseIdx = row.items.findIndex(i => /^Käse$/i.test(i.str));
        const nameFragmente = row.items.slice(0, kaeseIdx).map(i => i.str).join(' ').trim();
        const nameHier = cleanNameFragment(nameFragmente);
        const finalName = (pendingName + ' ' + nameHier).trim().replace(/\s+/g, ' ') || pendingName || nameHier || 'UNBEKANNT';
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
        // Nach Butter-Zeile: Bauer ist fertig, pendingName resetten
        pendingName = '';
      } else {
        // Zeile ohne Käse/Butter — potenzieller Name-Fragment für den NÄCHSTEN Bauer
        const cleaned = cleanNameFragment(row.items.map(i => i.str).join(' '));
        if(cleaned) {
          pendingName = (pendingName + ' ' + cleaned).trim().replace(/\s+/g, ' ');
        }
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
  let _wochenCache = null;   // null = noch nie geladen, [] = geladen aber leer
  let _wochenLoading = false;

  window.sennereiInvalidateCache = function() {
    _wochenCache = null;
    _wochenLoading = false;
  };

  window.renderSennerei = function() {
    // Nur EINMAL laden (nicht nach jedem render neu triggern → verhindert Flackern)
    if(_wochenCache === null && !_wochenLoading) {
      _wochenLoading = true;
      window.sennereiLadeWochen(w => {
        _wochenCache = w || [];
        _wochenLoading = false;
        if(window.currentView === 'sennerei' && typeof render === 'function') render();
      });
    }
    const wochen = _wochenCache || [];
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
      ${_wochenCache === null ? '<div class="empty-state">⏳ Lade Wochen…</div>' :
        wochen.length === 0
          ? '<div class="empty-state">Noch keine Wochen importiert.<br>Tippe oben auf „📥 Woche via PDF importieren" um zu starten.</div>'
          : ''}
      <div class="card-list">
        ${wochen.map(w => {
          const bauernAnz = w.bauern ? Object.keys(w.bauern).length : 0;
          const startEnde = (w.startDatum || '') + (w.endeDatum ? ' – ' + w.endeDatum : '');
          return `
            <div class="list-card">
              <div class="list-card-left" onclick="sennereiOeffneWoche('${w.id}')" style="cursor:pointer;flex:1"><div>
                <div class="list-card-title">Woche ${w.wocheNr || w.id}</div>
                <div class="list-card-sub">${startEnde} · ${bauernAnz} Bauern</div>
              </div></div>
              <div class="list-card-right">
                <button class="btn-xs-danger" onclick="sennereiLoescheWoche('${w.id}','${w.wocheNr||w.id}')">✕ Löschen</button>
              </div>
            </div>`;
        }).join('')}
      </div>
    `;
  };

  window.sennereiLoescheWoche = async function(id, wocheNr) {
    if(!confirm('Woche ' + wocheNr + ' wirklich löschen?\n\nAlle Abholungs-Daten dieser Woche gehen verloren.')) return;
    try {
      const _retry = window.withAuthRetry || (async fn => await fn());
      await _retry(() => firebase.database().ref('sennerei/wochen/' + id).remove());
      window.sennereiInvalidateCache();
      if(window.showSaveToast) window.showSaveToast('✓ Woche ' + wocheNr + ' gelöscht');
      if(typeof render === 'function') render();
    } catch(e) {
      alert('Fehler beim Löschen: ' + (e.message||e));
    }
  };

  window.renderSennereiWoche = function() {
    const wid = window._sennereiAktiveWoche;
    const woche = (_wochenCache || []).find(w => w.id === wid);
    if(!woche) {
      return `
        <div class="page-header"><h2>🥛 Sennerei-Woche</h2><button class="btn-secondary" onclick="navigate('sennerei')">← Zurück</button></div>
        <div class="empty-state">Woche nicht gefunden. <a onclick="navigate('sennerei')" style="color:var(--gold);cursor:pointer">Zurück zur Übersicht</a></div>
      `;
    }
    const bauern = Object.entries(woche.bauern || {}).sort((a,b) => (a[1].name||'').localeCompare(b[1].name||''));
    const abgeholtCount = bauern.filter(([,b]) => b.abgeholtAm).length;
    return `
      <div class="page-header">
        <h2>🥛 Woche ${woche.wocheNr}</h2>
        <button class="btn-secondary" onclick="navigate('sennerei')">← Zurück</button>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.6rem .8rem;margin-bottom:.8rem;font-size:.82rem;color:var(--text2)">
        ${woche.startDatum || ''} – ${woche.endeDatum || ''}<br>
        Max. verkaufbar: <b>Käse ${woche.maxVerkaufbar?.kaese||0} kg</b> · <b>Butter ${woche.maxVerkaufbar?.butter||0} kg</b><br>
        <span style="color:var(--gold);font-weight:600">${abgeholtCount} / ${bauern.length} abgeholt</span>
      </div>
      <div class="section-title">Bauern (${bauern.length})</div>
      <div class="card-list">
        ${bauern.map(([bid, b]) => {
          const matched = window.sennereiMatchBauer(bid);
          const matchIcon = matched ? '' : '<span style="color:#ff9632" title="Bauer nicht in App-Liste gefunden">⚠</span>';
          const kaeseZ = b.kaese?.zumAbholen || 0;
          const butterZ = b.butter?.zumAbholen || 0;
          const isAbgeholt = !!b.abgeholtAm;
          const statusHtml = isAbgeholt
            ? '<span style="color:var(--green);font-weight:600">✓ abgeholt ' + new Date(b.abgeholtAm).toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'}) + '</span>'
            : '<span style="color:var(--gold);font-weight:600">⏳ offen</span>';
          return `
            <div class="list-card" onclick="sennereiOeffneBauer('${bid}')" style="cursor:pointer;border-left:3px solid ${isAbgeholt?'var(--green)':'var(--gold)'}">
              <div class="list-card-left"><div>
                <div class="list-card-title">${b.name} ${matchIcon}</div>
                <div class="list-card-sub">Käse: ${kaeseZ} kg · Butter: ${butterZ} kg</div>
                <div style="font-size:.7rem;margin-top:.2rem">${statusHtml}</div>
              </div></div>
              <div class="list-card-right">
                <span style="font-size:1.1rem;color:var(--text3)">▸</span>
              </div>
            </div>`;
        }).join('')}
      </div>
    `;
  };

  window.sennereiOeffneWoche = function(id) {
    window._sennereiAktiveWoche = id;
    if(typeof navigate === 'function') navigate('sennerei_woche');
  };

  window.sennereiOeffneBauer = function(bid) {
    window._sennereiAktiverBauer = bid;
    if(typeof navigate === 'function') navigate('sennerei_bauer');
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // BAUER-DETAIL / ABHOLUNGS-FORMULAR
  // ══════════════════════════════════════════════════════════════════════════════
  window.renderSennereiBauer = function() {
    const wid = window._sennereiAktiveWoche;
    const bid = window._sennereiAktiverBauer;
    const woche = (_wochenCache || []).find(w => w.id === wid);
    if(!woche || !woche.bauern || !woche.bauern[bid]) {
      return `
        <div class="page-header"><h2>🥛 Bauer</h2><button class="btn-secondary" onclick="navigate('sennerei_woche')">← Zurück</button></div>
        <div class="empty-state">Bauer nicht gefunden. <a onclick="navigate('sennerei_woche')" style="color:var(--gold);cursor:pointer">Zurück zur Woche</a></div>
      `;
    }
    const b = woche.bauern[bid];
    const k = b.kaese || {};
    const bt = b.butter || {};
    const isAbgeholt = !!b.abgeholtAm;
    const chargenStr = (k.chargen || []).join(', ');

    return `
      <div class="page-header">
        <h2>🥛 ${b.name}</h2>
        <button class="btn-secondary" onclick="navigate('sennerei_woche')">← Zurück</button>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.6rem .8rem;margin-bottom:.8rem;font-size:.82rem;color:var(--text2)">
        Woche ${woche.wocheNr} · ${woche.startDatum || ''} – ${woche.endeDatum || ''}
        ${isAbgeholt ? '<br><span style="color:var(--green);font-weight:600">✓ Bereits abgeholt am ' + new Date(b.abgeholtAm).toLocaleString('de-AT') + '</span>' : ''}
      </div>

      <!-- KÄSE -->
      <div class="section-title">🧀 Käse</div>
      <div class="card-section" style="padding:.7rem .8rem;margin-bottom:.8rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;font-size:.85rem;margin-bottom:.6rem">
          <div style="color:var(--text3)">Verk%: <b style="color:var(--text)">${k.verkProzent||0}%</b></div>
          <div style="color:var(--text3)">Zum Abholen: <b style="color:var(--gold)">${k.zumAbholen||0} kg</b></div>
          <div style="color:var(--text3)">Soll: <b style="color:var(--text)">${k.soll||0} kg</b></div>
          <div style="color:var(--text3)">Guthaben Vorwoche: <b style="color:var(--text)">${k.guthabenVorwoche||0} kg</b></div>
          ${k.naturalrAnspruch ? '<div style="color:var(--text3);grid-column:1/-1">Naturalr.-Anspruch: <b style="color:#ff9632">' + k.naturalrAnspruch + ' kg</b></div>' : ''}
        </div>
        <label class="inp-label">Klötze (Stück)</label>
        <input id="sb-k-klotze" class="inp" type="number" step="1" min="0" inputmode="numeric" value="${k.klotze||''}" style="margin-bottom:.4rem" />
        <label class="inp-label">Abgeholt (kg)</label>
        <input id="sb-k-abgeholt" class="inp" type="number" step="0.1" min="0" inputmode="decimal" value="${k.abgeholt||''}" style="margin-bottom:.4rem" />
        ${k.naturalrAnspruch ? '<label class="inp-label">Naturalrabatt abgeholt (kg)</label><input id="sb-k-natabg" class="inp" type="number" step="0.1" min="0" inputmode="decimal" value="' + (k.naturalrAbgeholt||'') + '" style="margin-bottom:.4rem" />' : '<input type="hidden" id="sb-k-natabg" value="0" />'}
        <label class="inp-label">Chargen (kommagetrennt: z.B. 28, 32, 15)</label>
        <input id="sb-k-chargen" class="inp" type="text" placeholder="z.B. 28, 32" value="${chargenStr}" />
      </div>

      <!-- BUTTER -->
      <div class="section-title">🧈 Butter</div>
      <div class="card-section" style="padding:.7rem .8rem;margin-bottom:.8rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;font-size:.85rem;margin-bottom:.6rem">
          <div style="color:var(--text3)">Verk%: <b style="color:var(--text)">${bt.verkProzent||0}%</b></div>
          <div style="color:var(--text3)">Zum Abholen: <b style="color:var(--gold)">${bt.zumAbholen||0} kg</b></div>
          <div style="color:var(--text3)">Soll: <b style="color:var(--text)">${bt.soll||0} kg</b></div>
          <div style="color:var(--text3)">Guthaben Vorwoche: <b style="color:var(--text)">${bt.guthabenVorwoche||0} kg</b></div>
          ${bt.naturalrAnspruch ? '<div style="color:var(--text3);grid-column:1/-1">Naturalr.-Anspruch: <b style="color:#ff9632">' + bt.naturalrAnspruch + ' kg</b></div>' : ''}
        </div>
        <label class="inp-label">Klötze / Stück</label>
        <input id="sb-b-klotze" class="inp" type="number" step="1" min="0" inputmode="numeric" value="${bt.klotze||''}" style="margin-bottom:.4rem" />
        <label class="inp-label">Abgeholt (kg)</label>
        <input id="sb-b-abgeholt" class="inp" type="number" step="0.1" min="0" inputmode="decimal" value="${bt.abgeholt||''}" style="margin-bottom:.4rem" />
        ${bt.naturalrAnspruch ? '<label class="inp-label">Naturalrabatt abgeholt (kg)</label><input id="sb-b-natabg" class="inp" type="number" step="0.1" min="0" inputmode="decimal" value="' + (bt.naturalrAbgeholt||'') + '" style="margin-bottom:.4rem" />' : '<input type="hidden" id="sb-b-natabg" value="0" />'}
      </div>

      <!-- UNTERSCHRIFT -->
      <div class="section-title">✍ Unterschrift ${b.name}</div>
      <div class="card-section" style="padding:.7rem .8rem;margin-bottom:.8rem">
        <div style="background:#ffffff;border:2px dashed #d4a84b;border-radius:10px;position:relative;height:180px;touch-action:none;overflow:hidden">
          <canvas id="sb-signatur-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;touch-action:none"></canvas>
          ${b.unterschriftPng ? '<img id="sb-signatur-existing" src="' + b.unterschriftPng + '" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;pointer-events:none;opacity:.7" />' : ''}
        </div>
        <div style="display:flex;gap:.4rem;margin-top:.4rem">
          <button class="btn-secondary" style="flex:1" onclick="sennereiSignaturLoeschen()">🗑 Löschen</button>
          <span style="flex:1;text-align:center;color:var(--text3);font-size:.75rem;align-self:center">Mit Finger unterschreiben</span>
        </div>
      </div>

      <div class="form-actions" style="position:sticky;bottom:0;background:linear-gradient(180deg,transparent,var(--bg) 30%);padding-top:1rem">
        <button class="btn-secondary" style="flex:1" onclick="navigate('sennerei_woche')">Abbrechen</button>
        <button class="btn-primary" style="flex:1" onclick="sennereiSpeichereAbholung()">${isAbgeholt ? '💾 Änderung speichern' : '✓ Abholung speichern'}</button>
      </div>
    `;
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // TOUCH-SIGNATUR (Canvas)
  // ══════════════════════════════════════════════════════════════════════════════
  function _initSignatur() {
    const canvas = document.getElementById('sb-signatur-canvas');
    if(!canvas || canvas.dataset._init === '1') return;
    canvas.dataset._init = '1';
    const ctx = canvas.getContext('2d');
    // Canvas-Auflösung an DPR anpassen
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#0a1a04';
    let drawing = false;
    let lastX = 0, lastY = 0;

    const getPos = (e) => {
      const r = canvas.getBoundingClientRect();
      const p = (e.touches && e.touches[0]) || e;
      return { x: p.clientX - r.left, y: p.clientY - r.top };
    };
    const start = (e) => {
      e.preventDefault();
      drawing = true;
      window._sennereiSignaturDirty = true;
      // Existing signature image ausblenden sobald neu gezeichnet wird
      const img = document.getElementById('sb-signatur-existing');
      if(img) img.style.display = 'none';
      const pos = getPos(e);
      lastX = pos.x; lastY = pos.y;
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
    };
    const move = (e) => {
      if(!drawing) return;
      e.preventDefault();
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastX = pos.x; lastY = pos.y;
    };
    const end = (e) => {
      e.preventDefault();
      drawing = false;
    };
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('mouseleave', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end, { passive: false });
  }

  window.sennereiSignaturLoeschen = function() {
    const canvas = document.getElementById('sb-signatur-canvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const img = document.getElementById('sb-signatur-existing');
    if(img) { img.style.display = 'none'; img.remove(); }
    window._sennereiSignaturDirty = true;
  };

  // Auto-Init des Canvas nach Render — via MutationObserver / Timer
  setInterval(() => {
    if(window.currentView === 'sennerei_bauer' && document.getElementById('sb-signatur-canvas')) {
      _initSignatur();
    }
  }, 300);

  // ══════════════════════════════════════════════════════════════════════════════
  // SPEICHERN: Abholung + Signatur → Firebase
  // ══════════════════════════════════════════════════════════════════════════════
  window.sennereiSpeichereAbholung = async function() {
    const wid = window._sennereiAktiveWoche;
    const bid = window._sennereiAktiverBauer;
    if(!wid || !bid) return;
    const woche = (_wochenCache || []).find(w => w.id === wid);
    if(!woche || !woche.bauern[bid]) { alert('Bauer nicht gefunden'); return; }

    const btn = document.querySelector('button.btn-primary[onclick*="sennereiSpeichereAbholung"]');
    if(btn) { btn.disabled = true; btn.textContent = '⏳ Speichere…'; }

    try {
      // Werte lesen
      const parseNum = (id) => {
        const v = document.getElementById(id)?.value;
        const n = parseFloat(String(v||'').replace(',','.'));
        return isNaN(n) ? 0 : n;
      };
      const parseInt2 = (id) => parseInt(document.getElementById(id)?.value) || 0;
      const chargenText = document.getElementById('sb-k-chargen')?.value || '';
      const chargen = chargenText.split(/[,;]/).map(s => s.trim()).filter(Boolean);

      // Signatur als PNG (base64) — nur wenn was gezeichnet wurde
      let signaturPng = woche.bauern[bid].unterschriftPng || null;
      const canvas = document.getElementById('sb-signatur-canvas');
      if(canvas && window._sennereiSignaturDirty) {
        // Prüfen ob Canvas komplett leer ist (nichts gezeichnet)
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let hasContent = false;
        for(let i = 3; i < imgData.data.length; i += 4) {
          if(imgData.data[i] > 0) { hasContent = true; break; }
        }
        if(hasContent) {
          signaturPng = canvas.toDataURL('image/png');
        } else {
          signaturPng = null;
        }
      }

      if(!signaturPng) {
        if(!confirm('Keine Unterschrift vorhanden. Trotzdem speichern?')) {
          if(btn) { btn.disabled = false; btn.textContent = '✓ Abholung speichern'; }
          return;
        }
      }

      // Payload aufbauen
      const kaeseUpdate = {
        klotze: parseInt2('sb-k-klotze'),
        abgeholt: parseNum('sb-k-abgeholt'),
        naturalrAbgeholt: parseNum('sb-k-natabg'),
        chargen: chargen
      };
      const butterUpdate = {
        klotze: parseInt2('sb-b-klotze'),
        abgeholt: parseNum('sb-b-abgeholt'),
        naturalrAbgeholt: parseNum('sb-b-natabg')
      };

      const path = 'sennerei/wochen/' + wid + '/bauern/' + bid;
      const uid = firebase.auth && firebase.auth().currentUser && firebase.auth().currentUser.uid;
      const _retry = window.withAuthRetry || (async fn => await fn());

      // Nur die Abholungs-Felder updaten (Anspruch etc. unverändert)
      await _retry(() => firebase.database().ref(path + '/kaese').update(kaeseUpdate));
      await _retry(() => firebase.database().ref(path + '/butter').update(butterUpdate));
      await _retry(() => firebase.database().ref(path).update({
        unterschriftPng: signaturPng,
        abgeholtAm: Date.now(),
        abgeholtVon: uid || null
      }));

      // Lokal auch updaten
      Object.assign(woche.bauern[bid].kaese || {}, kaeseUpdate);
      Object.assign(woche.bauern[bid].butter || {}, butterUpdate);
      woche.bauern[bid].unterschriftPng = signaturPng;
      woche.bauern[bid].abgeholtAm = Date.now();
      woche.bauern[bid].abgeholtVon = uid;
      window._sennereiSignaturDirty = false;

      if(window.showSaveToast) window.showSaveToast('✓ Abholung für ' + woche.bauern[bid].name + ' gespeichert');
      if(navigator.vibrate) navigator.vibrate([30,10,30]);
      // Zurück zur Wochenliste
      if(typeof navigate === 'function') navigate('sennerei_woche');
    } catch(err) {
      console.error('[Sennerei] Speichern fail:', err);
      alert('Fehler beim Speichern:\n\n' + (err.message||err));
      if(btn) { btn.disabled = false; btn.textContent = '✓ Abholung speichern'; }
    }
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
      window.sennereiInvalidateCache();
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
