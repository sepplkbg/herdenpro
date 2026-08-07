// ══════════════════════════════════════════════════════════════════════════════
//  SENNEREI-MODUL — Wochen-Abholungsverwaltung
//  Datenmodell: sennerei/wochen/{yyyy-Www}/bauern/{normalisierterName}/
//  Rolle "sennerei" (oder admin) hat Zugriff.
//  Phase A: Import via PDF-Upload + Wochen-Liste
//  Phase B (später): Abholung + Touch-Signatur + PDF-Export
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '4.0';
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

    // Meta aus komplettem Text extrahieren (bevor wir in Zeilen aufteilen)
    const gesamtText = allItems.map(i => i.str).join(' ');
    let wocheNr = null, jahr = new Date().getFullYear(), startDatum = null, endeDatum = null;
    const wocheMatch = gesamtText.match(/Woche\s+(\d+)\s*\((\d{2}\.\d{2}\.)-\s*(\d{2}\.\d{2}\.\d{4})\)/);
    if(wocheMatch) {
      wocheNr = parseInt(wocheMatch[1]);
      jahr = parseInt(wocheMatch[3].slice(-4));
      startDatum = wocheMatch[2] + jahr;
      endeDatum = wocheMatch[3];
    }
    let maxKaese = 0, maxButter = 0;
    const maxMatch = gesamtText.match(/Neu\s+K:\s*([\d,.-]+)\s*\/\s*B:\s*([\d,.-]+)/i);
    if(maxMatch) {
      maxKaese = parseFloat(maxMatch[1].replace(',', '.')) || 0;
      maxButter = parseFloat(maxMatch[2].replace(',', '.')) || 0;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // NEUER Parser-Ansatz: nutze x/y-Position von "Käse"/"Butter"-Wörtern als Anker
    // Bauer-Name = alle Text-Items links vom Produkt-Wort im y-Bereich zwischen
    // Ende des vorherigen Bauers und Ende dieses Bauers (Butter-Zeile).
    // ══════════════════════════════════════════════════════════════════════════

    // 1) Alle Käse/Butter-Anker finden
    const produktAnker = allItems
      .filter(i => /^(Käse|Butter)$/i.test(i.str))
      .sort((a,b) => a.y - b.y);

    // 2) Zu Paaren gruppieren (jeder Käse gehört mit dem folgenden Butter zusammen)
    const paare = [];
    for(let i = 0; i < produktAnker.length; i++) {
      const p = produktAnker[i];
      if(!/^Käse$/i.test(p.str)) continue;
      // Nächsten Butter finden (y-Abstand < 30 pt = gleiche Bauer-Zeile)
      const next = produktAnker.slice(i + 1).find(x => /^Butter$/i.test(x.str) && x.y - p.y > 0 && x.y - p.y < 30);
      if(next) { paare.push({ kaese: p, butter: next }); i++; }
    }
    if(paare.length === 0) throw new Error('Keine Käse/Butter-Paare gefunden — ist das die richtige PDF?');

    // 3) Produkt-Spalten-X ermitteln (durchschnittliche x-Position von Käse/Butter)
    const produktX = produktAnker.reduce((s,p) => s + p.x, 0) / produktAnker.length;

    // 4) Für jedes Paar: Name + Werte extrahieren
    const bauern = [];
    let prevButterY = 0;
    // Noise-Words (Header/Footer die niemals als Bauer-Name gelten dürfen)
    const NOISE_WORDS = /^(Bauer|Produkt|Verk%|Soll|Guthaben|Vorwoche|Zum|Abholen|Klötze|Abgeholt|Naturalr\.?|Anspruch|abgeholt|Chargen|Abholung|Gesamt|Unterschrift|Neu|Max\.?|verkaufbar|Wochenabholung|Woche|Nassereinalm|Sommer|Engineering|by|LN|Machinery|Erstellt:|K:|B:|kg|\|)$/i;

    paare.forEach(paar => {
      // Name-Items: x < produktX (links vom Produkt) UND y > prevButterY UND y <= paar.butter.y + 3
      const nameItems = allItems.filter(item => {
        if(item.x >= produktX - 3) return false;
        if(item.y <= prevButterY) return false;
        if(item.y > paar.butter.y + 5) return false;
        if(/^(Käse|Butter)$/i.test(item.str)) return false;
        if(NOISE_WORDS.test(item.str.trim())) return false;
        if(/^\d+([,.]\d+)?%?$/.test(item.str.trim())) return false;
        return true;
      });
      nameItems.sort((a,b) => a.y - b.y || a.x - b.x);
      const name = nameItems.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim() || 'UNBEKANNT';

      // Käse-Werte: y ≈ paar.kaese.y (±3), x > paar.kaese.x
      const kaeseVals = allItems
        .filter(i => Math.abs(i.y - paar.kaese.y) < 4 && i.x > paar.kaese.x + 5)
        .sort((a,b) => a.x - b.x);
      const butterVals = allItems
        .filter(i => Math.abs(i.y - paar.butter.y) < 4 && i.x > paar.butter.x + 5)
        .sort((a,b) => a.x - b.x);

      bauern.push({
        name: name,
        nameNorm: normalisierName(name),
        kaese: extractProduktZeile(kaeseVals),
        butter: extractProduktZeile(butterVals)
      });
      prevButterY = paar.butter.y;
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
    // Auswertung: Summen aus tatsächlich abgeholten Werten
    let sumKaese = 0, sumButter = 0, sumKaeseNatur = 0, sumButterNatur = 0;
    let sumKaeseKlotze = 0, sumButterKlotze = 0;
    bauern.forEach(([,b]) => {
      sumKaese += (b.kaese?.abgeholt || 0);
      sumButter += (b.butter?.abgeholt || 0);
      sumKaeseNatur += (b.kaese?.naturalrAbgeholt || 0);
      sumButterNatur += (b.butter?.naturalrAbgeholt || 0);
      sumKaeseKlotze += (b.kaese?.klotze || 0);
      sumButterKlotze += (b.butter?.klotze || 0);
    });
    const fmt = (n) => Math.round(n * 10) / 10;
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

      <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>📊 Wochenauswertung</span>
        <button class="btn-xs" onclick="sennereiDruckeWoche('${wid}')" title="Wochen-Übersicht als PDF drucken">📄 PDF drucken</button>
      </div>
      <div class="card-section" style="padding:.7rem .8rem;margin-bottom:.8rem;font-size:.85rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem">
          <div>🧀 <b>Käse abgeholt:</b> ${fmt(sumKaese)} kg</div>
          <div>🧈 <b>Butter abgeholt:</b> ${fmt(sumButter)} kg</div>
          <div style="color:var(--text3)">Klötze Käse: ${sumKaeseKlotze}</div>
          <div style="color:var(--text3)">Klötze Butter: ${sumButterKlotze}</div>
          ${sumKaeseNatur > 0 || sumButterNatur > 0 ? `
            <div style="color:#ff9632">Naturalr. Käse: ${fmt(sumKaeseNatur)} kg</div>
            <div style="color:#ff9632">Naturalr. Butter: ${fmt(sumButterNatur)} kg</div>
          ` : ''}
        </div>
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
    window._sennereiWizardStep = 1;
    // Wizard-Daten von bestehendem Eintrag vorbelegen
    const woche = (_wochenCache || []).find(w => w.id === window._sennereiAktiveWoche);
    const b = woche && woche.bauern && woche.bauern[bid];
    window._sennereiWizardData = {
      kaese: {
        klotze: b?.kaese?.klotze || 0,
        abgeholt: b?.kaese?.abgeholt || 0,
        naturalrAbgeholt: b?.kaese?.naturalrAbgeholt || 0,
        chargen: (b?.kaese?.chargen || []).join(', ')
      },
      butter: {
        klotze: b?.butter?.klotze || 0,
        abgeholt: b?.butter?.abgeholt || 0,
        naturalrAbgeholt: b?.butter?.naturalrAbgeholt || 0,
        chargen: (b?.butter?.chargen || []).join(', ')
      },
      signaturPng: b?.unterschriftPng || null
    };
    if(typeof navigate === 'function') navigate('sennerei_bauer');
  };

  // Speichert aktuelle Formular-Eingaben im Wizard-State (bevor Step-Wechsel)
  function _sennereiSaveCurrentStepData() {
    const step = window._sennereiWizardStep;
    const data = window._sennereiWizardData || {};
    const parseNum = (id) => {
      const v = document.getElementById(id)?.value;
      const n = parseFloat(String(v||'').replace(',','.'));
      return isNaN(n) ? 0 : n;
    };
    const parseI = (id) => parseInt(document.getElementById(id)?.value) || 0;
    if(step === 2) {
      // Butter-Seite
      data.butter.klotze = parseI('sb-b-klotze');
      data.butter.abgeholt = parseNum('sb-b-abgeholt');
      data.butter.naturalrAbgeholt = parseNum('sb-b-natabg');
      data.butter.chargen = document.getElementById('sb-b-chargen')?.value || '';
    } else if(step === 3) {
      // Käse-Seite
      data.kaese.klotze = parseI('sb-k-klotze');
      data.kaese.abgeholt = parseNum('sb-k-abgeholt');
      data.kaese.naturalrAbgeholt = parseNum('sb-k-natabg');
      data.kaese.chargen = document.getElementById('sb-k-chargen')?.value || '';
    } else if(step === 5) {
      // Signatur-Seite
      const canvas = document.getElementById('sb-signatur-canvas');
      if(canvas && window._sennereiSignaturDirty) {
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let hasContent = false;
        for(let i = 3; i < imgData.data.length; i += 4) {
          if(imgData.data[i] > 0) { hasContent = true; break; }
        }
        if(hasContent) data.signaturPng = canvas.toDataURL('image/png');
      }
    }
    window._sennereiWizardData = data;
  }

  window.sennereiWizardWeiter = function() {
    _sennereiSaveCurrentStepData();
    const step = window._sennereiWizardStep || 1;
    if(step < 6) {
      window._sennereiWizardStep = step + 1;
      window._sennereiSignaturDirty = false;
      if(typeof render === 'function') render();
    }
  };
  window.sennereiWizardZurueck = function() {
    _sennereiSaveCurrentStepData();
    const step = window._sennereiWizardStep || 1;
    if(step > 1) {
      window._sennereiWizardStep = step - 1;
      window._sennereiSignaturDirty = false;
      if(typeof render === 'function') render();
    }
  };

  // Letzte Tagesmilch aller Kühe eines Bauern berechnen (aus window.milchEintraege + window.kuehe)
  function _sennereiTagesmilchFuerBauer(bauerName) {
    const kuehe = window.kuehe || {};
    const eintraege = window.milchEintraege || {};
    const bauerNameNorm = normalisierName(bauerName);
    // Kühe dieses Bauern finden
    const meineKuehe = Object.entries(kuehe).filter(([, k]) => {
      return normalisierName(k.bauer || '') === bauerNameNorm ||
             (k.bauer || '').toLowerCase().includes(bauerName.toLowerCase().split(' ')[0]);
    });
    if(!meineKuehe.length) return null;
    const _mW = window.milchWert || function(v){ return typeof v === 'number' ? v : (v && v.wert != null ? parseFloat(v.wert)||0 : parseFloat(v)||0); };
    // Für jede Kuh: letzte morgens + letzte abends Werte finden
    let sumTagesmilch = 0;
    let kuhCount = 0;
    let kuehePergreifTag = [];
    meineKuehe.forEach(([kid, k]) => {
      let letzterM = 0, letzterA = 0, tsM = 0, tsA = 0;
      Object.values(eintraege).forEach(e => {
        if(!e || !e.prokuh || !e.datum) return;
        const val = _mW(e.prokuh[kid]);
        if(val <= 0) return;
        if((e.zeit || 'morgen') === 'abend') {
          if(e.datum > tsA) { letzterA = val; tsA = e.datum; }
        } else {
          if(e.datum > tsM) { letzterM = val; tsM = e.datum; }
        }
      });
      const tages = letzterM + letzterA;
      if(tages > 0) {
        sumTagesmilch += tages;
        kuhCount++;
        kuehePergreifTag.push({ nr: k.nr, name: k.name, m: letzterM, a: letzterA, tages });
      }
    });
    return { sum: sumTagesmilch, count: kuhCount, kuehe: kuehePergreifTag, gesamtKuehe: meineKuehe.length };
  }

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
    const step = window._sennereiWizardStep || 1;
    const data = window._sennereiWizardData || {};

    const stepNames = ['Übersicht', 'Butter', 'Käse', 'Zwischenbilanz', 'Unterschrift', 'Bestätigung'];
    const stepIndicator = '<div style="display:flex;justify-content:center;gap:.3rem;margin-bottom:.8rem">' +
      stepNames.map((n, i) => {
        const active = (i + 1) === step;
        const done = (i + 1) < step;
        return '<div style="flex:1;max-width:60px;text-align:center;padding:.3rem;border-radius:8px;background:' +
          (active ? 'var(--gold)' : done ? 'rgba(77,184,78,.2)' : 'var(--bg3)') +
          ';border:1px solid ' + (active ? 'var(--gold)' : 'var(--border)') +
          ';font-size:.65rem;color:' + (active ? '#0a0800' : done ? 'var(--green)' : 'var(--text3)') +
          ';font-weight:' + (active ? '700' : '400') + '">' + (i+1) + '</div>';
      }).join('') +
    '</div>';

    let body = '';
    let footerButtons = '';
    switch(step) {
      case 1: body = _wizardStep1(b, woche); break;
      case 2: body = _wizardStep2Butter(b, data); break;
      case 3: body = _wizardStep3Kaese(b, data); break;
      case 4: body = _wizardStep4Zwischen(b, data); break;
      case 5: body = _wizardStep5Signatur(b, data); break;
      case 6: body = _wizardStep6Final(b, data); break;
    }
    if(step === 1) {
      footerButtons = `<button class="btn-secondary" style="flex:1" onclick="navigate('sennerei_woche')">Abbrechen</button>
                      <button class="btn-primary" style="flex:1" onclick="sennereiWizardWeiter()">Weiter ▸</button>`;
    } else if(step < 6) {
      footerButtons = `<button class="btn-secondary" style="flex:1" onclick="sennereiWizardZurueck()">◂ Zurück</button>
                      <button class="btn-primary" style="flex:1" onclick="sennereiWizardWeiter()">Weiter ▸</button>`;
    } else {
      footerButtons = `<button class="btn-secondary" style="flex:1" onclick="sennereiWizardZurueck()">◂ Zurück</button>
                      <button class="btn-primary" style="flex:1;background:var(--green)" onclick="sennereiWizardFinalSpeichern()">✓ Abholung speichern</button>`;
    }

    return `
      <div class="page-header">
        <h2>🥛 ${b.name}</h2>
        <button class="btn-secondary" onclick="navigate('sennerei_woche')">✕</button>
      </div>
      ${stepIndicator}
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.4rem .7rem;margin-bottom:.6rem;font-size:.75rem;color:var(--text3);text-align:center">
        Schritt ${step} / 6 · <b style="color:var(--gold)">${stepNames[step-1]}</b>
      </div>
      ${body}
      <div class="form-actions" style="position:sticky;bottom:0;background:linear-gradient(180deg,transparent,var(--bg) 30%);padding-top:1rem">
        ${footerButtons}
      </div>
    `;
  };

  // ─── Step 1: Übersicht ─────────────────────────────────────────────────────
  function _wizardStep1(b, woche) {
    const k = b.kaese || {};
    const bt = b.butter || {};
    const isAbgeholt = !!b.abgeholtAm;
    const tm = _sennereiTagesmilchFuerBauer(b.name);
    let tagesmilchHtml = '';
    if(tm && tm.count > 0) {
      const kuhZeilen = tm.kuehe.map(k => `<div style="display:flex;justify-content:space-between;padding:.2rem .3rem;font-size:.8rem;border-bottom:1px solid var(--border)">
        <span>#${k.nr} ${k.name||''}</span>
        <span style="color:var(--text3)">M ${k.m||'–'}L · A ${k.a||'–'}L · <b style="color:var(--gold)">T ${Math.round(k.tages*10)/10}L</b></span>
      </div>`).join('');
      tagesmilchHtml = `
        <div class="section-title">🥛 Letzte Tagesmilch (${tm.count} von ${tm.gesamtKuehe} Kühen)</div>
        <div class="card-section" style="padding:.3rem;margin-bottom:.8rem">
          ${kuhZeilen}
          <div style="padding:.4rem .3rem;font-weight:700;color:var(--gold);border-top:2px solid var(--gold);margin-top:.2rem">
            SUMME: ${Math.round(tm.sum*10)/10} L
          </div>
        </div>`;
    } else {
      tagesmilchHtml = '<div class="card-section" style="padding:.6rem;margin-bottom:.8rem;color:var(--text3);font-size:.85rem;text-align:center">Keine Kuh-Zuordnung für „' + b.name + '" gefunden</div>';
    }
    return `
      ${isAbgeholt ? '<div style="background:rgba(77,184,78,.15);border:1px solid var(--green);padding:.5rem .7rem;border-radius:8px;margin-bottom:.7rem;color:var(--green);font-size:.85rem;font-weight:600">✓ Bereits abgeholt am ' + new Date(b.abgeholtAm).toLocaleString('de-AT') + '</div>' : ''}
      <div class="section-title">📦 Zum Abholen</div>
      <div class="card-section" style="padding:.7rem;margin-bottom:.8rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;font-size:.9rem">
          <div>🧀 <b>Käse:</b> ${k.zumAbholen||0} kg</div>
          <div>🧈 <b>Butter:</b> ${bt.zumAbholen||0} kg</div>
          ${k.naturalrAnspruch ? '<div style="color:#ff9632;font-size:.8rem">Naturalr. Käse: ' + k.naturalrAnspruch + ' kg</div>' : '<div></div>'}
          ${bt.naturalrAnspruch ? '<div style="color:#ff9632;font-size:.8rem">Naturalr. Butter: ' + bt.naturalrAnspruch + ' kg</div>' : '<div></div>'}
        </div>
      </div>
      ${isAbgeholt ? `
      <div class="section-title">✓ Bereits abgeholt</div>
      <div class="card-section" style="padding:.7rem;margin-bottom:.8rem;font-size:.85rem">
        🧀 ${k.abgeholt||0} kg (+ ${k.naturalrAbgeholt||0} kg Natur) · ${(k.chargen||[]).join(', ')||'keine Chargen'}<br>
        🧈 ${bt.abgeholt||0} kg (+ ${bt.naturalrAbgeholt||0} kg Natur)
      </div>` : ''}
      ${tagesmilchHtml}
    `;
  }

  // ─── Step 2: Butter ────────────────────────────────────────────────────────
  function _wizardStep2Butter(b, data) {
    const bt = b.butter || {};
    const d = data.butter || {};
    // Abholvorschlag = zumAbholen minus naturalr.Anspruch (nur der aktive Selbst-Anteil)
    const abholvorschlag = Math.round(((bt.zumAbholen||0) - (bt.naturalrAnspruch||0)) * 10) / 10;
    return `
      <div class="section-title">🧈 Butter</div>
      <div class="card-section" style="padding:.7rem .8rem;margin-bottom:.8rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;font-size:.85rem;margin-bottom:.7rem">
          <div style="color:var(--text3)">Verkauf%: <b style="color:var(--text)">${bt.verkProzent||0}%</b></div>
          <div style="color:var(--text3)">Zum Abholen: <b style="color:var(--gold)">${bt.zumAbholen||0} kg</b></div>
          <div style="color:var(--text3);grid-column:1/-1">
            📌 <b style="color:#ff9632;font-size:1rem">Abholvorschlag: ${abholvorschlag} kg</b>
            ${bt.naturalrAnspruch ? '<span style="font-size:.75rem;color:var(--text3)"> (= ' + bt.zumAbholen + ' − ' + bt.naturalrAnspruch + ' Naturalr.)</span>' : ''}
          </div>
        </div>
        <label class="inp-label">Tatsächlich abgeholt (kg)</label>
        <input id="sb-b-abgeholt" class="inp" type="number" step="0.1" min="0" inputmode="decimal" value="${d.abgeholt || ''}" placeholder="${abholvorschlag}" style="margin-bottom:.5rem" />
        <label class="inp-label">Chargen (kommagetrennt)</label>
        <input id="sb-b-chargen" class="inp" type="text" placeholder="z.B. 15, 22" value="${d.chargen || ''}" style="margin-bottom:.5rem" />
        ${bt.naturalrAnspruch ? `<label class="inp-label">Naturalrückgabe abgeholt (kg) — Anspruch: ${bt.naturalrAnspruch} kg</label>
          <input id="sb-b-natabg" class="inp" type="number" step="0.1" min="0" inputmode="decimal" value="${d.naturalrAbgeholt || ''}" />` : '<input type="hidden" id="sb-b-natabg" value="0" />'}
        <input type="hidden" id="sb-b-klotze" value="${d.klotze || 0}" />
      </div>
    `;
  }

  // ─── Step 3: Käse ──────────────────────────────────────────────────────────
  function _wizardStep3Kaese(b, data) {
    const k = b.kaese || {};
    const d = data.kaese || {};
    return `
      <div class="section-title">🧀 Käse</div>
      <div class="card-section" style="padding:.7rem .8rem;margin-bottom:.8rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;font-size:.85rem;margin-bottom:.7rem">
          <div style="color:var(--text3)">Verkauf%: <b style="color:var(--text)">${k.verkProzent||0}%</b></div>
          <div style="color:var(--text3)">Zum Abholen: <b style="color:var(--gold)">${k.zumAbholen||0} kg</b></div>
        </div>
        <label class="inp-label">Klötze (Stück)</label>
        <input id="sb-k-klotze" class="inp" type="number" step="1" min="0" inputmode="numeric" value="${d.klotze || ''}" style="margin-bottom:.5rem" />
        <label class="inp-label">Tatsächlich abgeholt (kg)</label>
        <input id="sb-k-abgeholt" class="inp" type="number" step="0.1" min="0" inputmode="decimal" value="${d.abgeholt || ''}" style="margin-bottom:.5rem" />
        <label class="inp-label">Chargen (kommagetrennt: z.B. 28, 32, 15)</label>
        <input id="sb-k-chargen" class="inp" type="text" placeholder="z.B. 28, 32" value="${d.chargen || ''}" style="margin-bottom:.5rem" />
        ${k.naturalrAnspruch ? `<label class="inp-label">Naturalrückgabe abgeholt (kg) — Anspruch: ${k.naturalrAnspruch} kg</label>
          <input id="sb-k-natabg" class="inp" type="number" step="0.1" min="0" inputmode="decimal" value="${d.naturalrAbgeholt || ''}" />` : '<input type="hidden" id="sb-k-natabg" value="0" />'}
      </div>
    `;
  }

  // ─── Step 4: Zwischen-Übersicht ────────────────────────────────────────────
  function _wizardStep4Zwischen(b, data) {
    const k = data.kaese || {};
    const bt = data.butter || {};
    const chargenB = String(bt.chargen||'').trim();
    const chargenK = String(k.chargen||'').trim();
    return `
      <div class="section-title">📋 Zwischenbilanz</div>
      <div class="card-section" style="padding:.7rem .8rem;margin-bottom:.8rem">
        <div style="font-weight:700;color:var(--gold);margin-bottom:.3rem">🧈 Butter</div>
        <div style="font-size:.9rem;padding-left:.5rem">
          Abgeholt: <b>${bt.abgeholt||0} kg</b><br>
          ${bt.naturalrAbgeholt ? 'Naturalrückgabe: <b>' + bt.naturalrAbgeholt + ' kg</b><br>' : ''}
          ${chargenB ? 'Chargen: ' + chargenB + '<br>' : ''}
        </div>
        <div style="font-weight:700;color:var(--gold);margin:.7rem 0 .3rem">🧀 Käse</div>
        <div style="font-size:.9rem;padding-left:.5rem">
          Klötze: <b>${k.klotze||0}</b><br>
          Abgeholt: <b>${k.abgeholt||0} kg</b><br>
          ${k.naturalrAbgeholt ? 'Naturalrückgabe: <b>' + k.naturalrAbgeholt + ' kg</b><br>' : ''}
          ${chargenK ? 'Chargen: ' + chargenK + '<br>' : ''}
        </div>
      </div>
      <div style="font-size:.8rem;color:var(--text3);text-align:center;padding:.5rem">
        Sind die Werte korrekt? Falls nein → mit „◂ Zurück" korrigieren.<br>
        Sonst → „Weiter ▸" zur Unterschrift.
      </div>
    `;
  }

  // ─── Step 5: Unterschrift ──────────────────────────────────────────────────
  function _wizardStep5Signatur(b, data) {
    const existing = data.signaturPng;
    return `
      <div class="section-title">✍ Unterschrift ${b.name}</div>
      <div class="card-section" style="padding:.7rem .8rem;margin-bottom:.8rem">
        <div style="background:#ffffff;border:2px dashed #d4a84b;border-radius:10px;position:relative;height:220px;touch-action:none;overflow:hidden">
          <canvas id="sb-signatur-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;touch-action:none"></canvas>
          ${existing ? '<img id="sb-signatur-existing" src="' + existing + '" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;pointer-events:none;opacity:.7" />' : ''}
        </div>
        <div style="display:flex;gap:.4rem;margin-top:.4rem">
          <button class="btn-secondary" style="flex:1" onclick="sennereiSignaturLoeschen()">🗑 Löschen</button>
          <span style="flex:2;text-align:center;color:var(--text3);font-size:.75rem;align-self:center">Mit Finger unterschreiben</span>
        </div>
      </div>
    `;
  }

  // ─── Step 6: Final-Übersicht ──────────────────────────────────────────────
  function _wizardStep6Final(b, data) {
    const k = data.kaese || {};
    const bt = data.butter || {};
    const sig = data.signaturPng;
    return `
      <div class="section-title">✓ Alle Werte auf einen Blick</div>
      <div class="card-section" style="padding:.7rem .8rem;margin-bottom:.7rem">
        <div style="font-size:1rem;font-weight:700;color:var(--gold);margin-bottom:.4rem">${b.name}</div>
        <div style="font-weight:700;margin-bottom:.2rem">🧈 Butter</div>
        <div style="font-size:.9rem;padding-left:.5rem;margin-bottom:.5rem">
          Abgeholt: <b>${bt.abgeholt||0} kg</b>${bt.naturalrAbgeholt ? ' · Naturalr.: <b>' + bt.naturalrAbgeholt + ' kg</b>' : ''}${bt.chargen ? '<br>Chargen: ' + bt.chargen : ''}
        </div>
        <div style="font-weight:700;margin-bottom:.2rem">🧀 Käse</div>
        <div style="font-size:.9rem;padding-left:.5rem;margin-bottom:.5rem">
          Klötze: <b>${k.klotze||0}</b> · Abgeholt: <b>${k.abgeholt||0} kg</b>${k.naturalrAbgeholt ? ' · Naturalr.: <b>' + k.naturalrAbgeholt + ' kg</b>' : ''}${k.chargen ? '<br>Chargen: ' + k.chargen : ''}
        </div>
      </div>
      <div class="section-title">✍ Unterschrift</div>
      <div class="card-section" style="padding:.5rem;margin-bottom:.8rem">
        ${sig ? '<img src="' + sig + '" style="width:100%;max-height:120px;object-fit:contain;background:white;border-radius:6px" />' : '<div style="color:#ff9632;padding:.5rem;text-align:center;font-size:.85rem">⚠ Keine Unterschrift vorhanden</div>'}
      </div>
      <div style="font-size:.85rem;color:var(--gold);text-align:center;padding:.5rem;font-weight:600">
        Jetzt „✓ Abholung speichern" drücken um fertigzustellen.
      </div>
    `;
  }

  // Final speichern (nur Step 6)
  window.sennereiWizardFinalSpeichern = async function() {
    _sennereiSaveCurrentStepData();
    const wid = window._sennereiAktiveWoche;
    const bid = window._sennereiAktiverBauer;
    const data = window._sennereiWizardData || {};
    if(!wid || !bid) return;
    const woche = (_wochenCache || []).find(w => w.id === wid);
    if(!woche || !woche.bauern[bid]) { alert('Bauer nicht gefunden'); return; }
    if(!data.signaturPng) {
      if(!confirm('Keine Unterschrift vorhanden. Trotzdem speichern?')) return;
    }
    const btn = document.querySelector('button.btn-primary[onclick*="sennereiWizardFinalSpeichern"]');
    if(btn) { btn.disabled = true; btn.textContent = '⏳ Speichere…'; }
    try {
      const chargenB = String(data.butter.chargen || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
      const chargenK = String(data.kaese.chargen || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
      const kaeseUpdate = {
        klotze: parseInt(data.kaese.klotze) || 0,
        abgeholt: parseFloat(data.kaese.abgeholt) || 0,
        naturalrAbgeholt: parseFloat(data.kaese.naturalrAbgeholt) || 0,
        chargen: chargenK
      };
      const butterUpdate = {
        klotze: parseInt(data.butter.klotze) || 0,
        abgeholt: parseFloat(data.butter.abgeholt) || 0,
        naturalrAbgeholt: parseFloat(data.butter.naturalrAbgeholt) || 0,
        chargen: chargenB
      };
      const path = 'sennerei/wochen/' + wid + '/bauern/' + bid;
      const uid = firebase.auth && firebase.auth().currentUser && firebase.auth().currentUser.uid;
      const _retry = window.withAuthRetry || (async fn => await fn());
      await _retry(() => firebase.database().ref(path + '/kaese').update(kaeseUpdate));
      await _retry(() => firebase.database().ref(path + '/butter').update(butterUpdate));
      await _retry(() => firebase.database().ref(path).update({
        unterschriftPng: data.signaturPng || null,
        abgeholtAm: Date.now(),
        abgeholtVon: uid || null
      }));
      Object.assign(woche.bauern[bid].kaese || {}, kaeseUpdate);
      Object.assign(woche.bauern[bid].butter || {}, butterUpdate);
      woche.bauern[bid].unterschriftPng = data.signaturPng;
      woche.bauern[bid].abgeholtAm = Date.now();
      woche.bauern[bid].abgeholtVon = uid;
      window._sennereiSignaturDirty = false;
      if(window.showSaveToast) window.showSaveToast('✓ Abholung ' + woche.bauern[bid].name + ' gespeichert');
      if(navigator.vibrate) navigator.vibrate([30,10,30]);
      if(typeof navigate === 'function') navigate('sennerei_woche');
    } catch(err) {
      console.error('[Sennerei] Speichern fail:', err);
      alert('Fehler beim Speichern:\n\n' + (err.message||err));
      if(btn) { btn.disabled = false; btn.textContent = '✓ Abholung speichern'; }
    }
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

  // ══════════════════════════════════════════════════════════════════════════════
  // PDF-DRUCK: Wochen-Übersicht (mit ausgefüllten Werten + Unterschriften)
  // ══════════════════════════════════════════════════════════════════════════════
  window.sennereiDruckeWoche = function(wid) {
    const woche = (_wochenCache || []).find(w => w.id === wid);
    if(!woche) { alert('Woche nicht gefunden'); return; }
    const bauern = Object.entries(woche.bauern || {}).sort((a,b) => (a[1].name||'').localeCompare(b[1].name||''));

    const fmt = (n) => n == null || n === 0 ? '' : String(Math.round(n * 10) / 10).replace('.', ',');
    const fmtI = (n) => n == null || n === 0 ? '' : String(n);
    const escapeHtml = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

    // Header + Zeilen
    let rows = '';
    bauern.forEach(([bid, b]) => {
      const k = b.kaese || {};
      const bt = b.butter || {};
      const chargen = (k.chargen || []).join(', ');
      const kaeseGesamt = (k.abgeholt||0) + (k.naturalrAbgeholt||0);
      const butterGesamt = (bt.abgeholt||0) + (bt.naturalrAbgeholt||0);
      const sigImg = b.unterschriftPng ? '<img src="' + b.unterschriftPng + '" style="max-height:35px;max-width:110px;object-fit:contain">' : '';
      rows += `
        <tr class="bauer-erste">
          <td rowspan="2" class="bauer">${escapeHtml(b.name)}</td>
          <td class="prod">Käse</td>
          <td class="num">${fmtI(k.verkProzent)}%</td>
          <td class="num">${fmt(k.soll)}</td>
          <td class="num">${fmt(k.guthabenVorwoche)}</td>
          <td class="num zumab">${fmt(k.zumAbholen)}</td>
          <td class="num klotze">${fmtI(k.klotze)}</td>
          <td class="num abgeh">${fmt(k.abgeholt)}</td>
          <td class="num natur">${fmt(k.naturalrAnspruch)}</td>
          <td class="num naturabg">${fmt(k.naturalrAbgeholt)}</td>
          <td class="chargen">${escapeHtml(chargen)}</td>
          <td class="num gesamt">${fmt(kaeseGesamt) || '0,0'}</td>
          <td rowspan="2" class="sig">${sigImg}</td>
        </tr>
        <tr class="bauer-zweite">
          <td class="prod">Butter</td>
          <td class="num">${fmtI(bt.verkProzent)}%</td>
          <td class="num">${fmt(bt.soll)}</td>
          <td class="num">${fmt(bt.guthabenVorwoche)}</td>
          <td class="num zumab">${fmt(bt.zumAbholen)}</td>
          <td class="num klotze">${fmtI(bt.klotze)}</td>
          <td class="num abgeh">${fmt(bt.abgeholt)}</td>
          <td class="num natur">${fmt(bt.naturalrAnspruch)}</td>
          <td class="num naturabg">${fmt(bt.naturalrAbgeholt)}</td>
          <td class="chargen"></td>
          <td class="num gesamt">${fmt(butterGesamt) || '0,0'}</td>
        </tr>
      `;
    });

    // Auswertung
    let sumKaese = 0, sumButter = 0, sumKaeseNatur = 0, sumButterNatur = 0;
    bauern.forEach(([,b]) => {
      sumKaese += (b.kaese?.abgeholt || 0);
      sumButter += (b.butter?.abgeholt || 0);
      sumKaeseNatur += (b.kaese?.naturalrAbgeholt || 0);
      sumButterNatur += (b.butter?.naturalrAbgeholt || 0);
    });

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Abholung Woche ${woche.wocheNr}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 15mm 8mm; color: #1a2a08; font-size: 9pt; }
  h1 { color: #1a4a6e; font-size: 14pt; margin: 0 0 4pt 0; }
  .meta { background: #fff8e0; border: 1px solid #d4a84b; padding: 4pt 8pt; margin-bottom: 6pt; font-size: 9pt; border-radius: 4pt; }
  .erstellt { color: #666; font-size: 8pt; float: right; }
  table { width: 100%; border-collapse: collapse; margin-top: 4pt; }
  th { background: #e8ebc7; color: #1a4a6e; font-weight: 700; text-align: left; padding: 3pt 4pt; border: .5pt solid #999; font-size: 7.5pt; }
  th.num { text-align: right; }
  td { padding: 2pt 4pt; border: .5pt solid #ccc; vertical-align: middle; font-size: 8pt; }
  td.bauer { font-weight: 700; background: #f7f7ee; text-align: left; }
  td.prod { font-weight: 600; background: #f7f7ee; }
  td.num { text-align: right; font-family: 'Courier New', monospace; }
  td.zumab { background: #e6f4d8; color: #2a5a15; font-weight: 700; }
  td.klotze { background: #dcf3d0; }
  td.abgeh { background: #fff2c4; }
  td.natur { background: #e8d9f3; color: #4a2a70; }
  td.naturabg { background: #f0e5f8; }
  td.gesamt { background: #e6f4d8; font-weight: 700; }
  td.sig { text-align: center; padding: 2pt; background: #fafafa; }
  td.sig img { display: block; margin: 0 auto; }
  .bauer-erste td { border-bottom: none; }
  .bauer-zweite td { border-top: none; padding-top: 0; }
  .footer { margin-top: 8pt; padding-top: 4pt; border-top: 1pt solid #999; display: flex; justify-content: space-between; font-size: 8pt; color: #666; }
  .auswertung { background: #f0f7e5; border: 1px solid #4b8b0d; padding: 6pt 10pt; margin-top: 8pt; border-radius: 4pt; font-size: 9pt; }
  .auswertung h3 { margin: 0 0 4pt 0; color: #2a5a15; font-size: 10pt; }
  @page { size: A4 landscape; margin: 10mm; }
  @media print {
    body { margin: 0; }
    .no-print { display: none !important; }
  }
</style>
</head><body>
<div class="no-print" style="text-align:right;margin-bottom:8pt">
  <button onclick="window.print()" style="padding:6pt 14pt;font-size:11pt;cursor:pointer;background:#d4a84b;border:none;border-radius:4pt;font-weight:700">🖨 Drucken / Als PDF speichern</button>
  <button onclick="window.close()" style="padding:6pt 14pt;font-size:11pt;cursor:pointer;margin-left:6pt">Schließen</button>
</div>
<h1>Abholungsliste Sennerei Nasserein — Woche ${woche.wocheNr} (${escapeHtml(woche.startDatum||'')} – ${escapeHtml(woche.endeDatum||'')})</h1>
<div class="erstellt">Gedruckt: ${new Date().toLocaleString('de-AT')}</div>
<div class="meta"><b>Max. verkaufbar (Woche ${woche.wocheNr}):</b> Käse ${woche.maxVerkaufbar?.kaese||0} kg &middot; Butter ${woche.maxVerkaufbar?.butter||0} kg</div>
<table>
  <thead>
    <tr>
      <th>Bauer</th>
      <th>Produkt</th>
      <th class="num">Verk%</th>
      <th class="num">Soll</th>
      <th class="num">Guthaben<br>Vorwoche</th>
      <th class="num">Zum<br>Abholen</th>
      <th class="num">Klötze</th>
      <th class="num">Abgeholt</th>
      <th class="num">Naturalr.<br>Anspruch</th>
      <th class="num">Naturalr.<br>abgeholt</th>
      <th>Chargen</th>
      <th class="num">Abholung<br>Gesamt</th>
      <th>Unterschrift</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="auswertung">
  <h3>📊 Wochenauswertung</h3>
  Käse abgeholt: <b>${fmt(sumKaese) || '0,0'} kg</b> &middot;
  Butter abgeholt: <b>${fmt(sumButter) || '0,0'} kg</b> &middot;
  Naturalr. Käse: <b>${fmt(sumKaeseNatur) || '0,0'} kg</b> &middot;
  Naturalr. Butter: <b>${fmt(sumButterNatur) || '0,0'} kg</b><br>
  <span style="color:#666">Abgeholt: ${bauern.filter(([,b])=>b.abgeholtAm).length} / ${bauern.length} Bauern</span>
</div>
<div class="footer">
  <span>Nassereinalm | Sommer ${new Date().getFullYear()}</span>
  <span>Engineering by LN Machinery</span>
</div>
</body></html>`;

    // Neues Fenster öffnen und Print-Dialog triggern
    const win = window.open('', '_blank');
    if(!win) { alert('Popup blockiert. Bitte im Browser Popups für diese Seite erlauben.'); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // BAUER-HISTORIE: alle Wochen für einen bestimmten Bauer laden
  // ══════════════════════════════════════════════════════════════════════════════
  // Wird direkt in der Bauer-Detail-Ansicht angezeigt (unten anhängen)
  window.sennereiLadeBauerHistorie = async function(nameNorm) {
    if(typeof firebase === 'undefined' || !firebase.database) return [];
    try {
      const snap = await firebase.database().ref('sennerei/wochen').orderByKey().limitToLast(20).once('value');
      const wochen = snap.val() || {};
      const rows = [];
      Object.entries(wochen).forEach(([wid, w]) => {
        const b = w.bauern && w.bauern[nameNorm];
        if(b) rows.push({ wid, wocheNr: w.wocheNr, startDatum: w.startDatum, endeDatum: w.endeDatum, bauer: b });
      });
      return rows.sort((a,b) => (b.wid||'').localeCompare(a.wid||''));
    } catch(e) { console.warn('[Sennerei] Historie laden:', e); return []; }
  };

  // Erweitert die Bauer-Detail-Anzeige (im renderSennereiBauer) um vergangene Wochen
  // Wird per setInterval nachgeladen wenn User auf Bauer-Detail-View ist
  let _historieLoaded = false;
  let _historieForBauer = null;
  setInterval(async () => {
    if(window.currentView !== 'sennerei_bauer') { _historieLoaded = false; return; }
    const bid = window._sennereiAktiverBauer;
    if(!bid || _historieForBauer === bid) return;
    const el = document.getElementById('sennerei-bauer-historie');
    if(!el) return;
    _historieForBauer = bid;
    el.innerHTML = '<div style="color:var(--text3);font-size:.8rem;padding:.4rem">⏳ Lade Historie…</div>';
    const rows = await window.sennereiLadeBauerHistorie(bid);
    const currentWid = window._sennereiAktiveWoche;
    const filtered = rows.filter(r => r.wid !== currentWid);
    if(filtered.length === 0) {
      el.innerHTML = '<div style="color:var(--text3);font-size:.8rem;padding:.4rem">Keine früheren Abholungen für diesen Bauern.</div>';
      return;
    }
    el.innerHTML = filtered.map(r => {
      const b = r.bauer;
      const kAbg = b.kaese?.abgeholt || 0;
      const btAbg = b.butter?.abgeholt || 0;
      const kNat = b.kaese?.naturalrAbgeholt || 0;
      const btNat = b.butter?.naturalrAbgeholt || 0;
      const datum = b.abgeholtAm ? new Date(b.abgeholtAm).toLocaleDateString('de-AT') : '–';
      const status = b.abgeholtAm ? '<span style="color:var(--green)">✓</span>' : '<span style="color:#ff9632">⏳</span>';
      return `<div style="padding:.4rem .5rem;border-bottom:1px solid var(--border);font-size:.82rem">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <b>Woche ${r.wocheNr||r.wid}</b>
          <span style="color:var(--text3);font-size:.75rem">${status} ${datum}</span>
        </div>
        <div style="color:var(--text2);font-size:.75rem;margin-top:.15rem">
          🧀 ${Math.round(kAbg*10)/10}kg${kNat?' (+ '+Math.round(kNat*10)/10+' Natur)':''} · 🧈 ${Math.round(btAbg*10)/10}kg${btNat?' (+ '+Math.round(btNat*10)/10+' Natur)':''}
        </div>
      </div>`;
    }).join('');
  }, 400);

  console.log('[Sennerei] Modul geladen v' + VERSION);
})();
