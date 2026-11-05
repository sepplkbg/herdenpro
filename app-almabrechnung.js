// ══════════════════════════════════════════════════════════════════════════════
// HerdenPro – Austausch mit der Almabrechnung (Excel) + Butter-Etiketten
// Engineering by LNMachinery  ·  v1.4 (HerdenPro v54.62)
// ──────────────────────────────────────────────────────────────────────────────
//  1. (entfallen in v1.1: Bauern & Kühe aus Excel kommen über den
//     Saisonstart-Import – die Almabrechnung enthält ein Blatt "Saisonstart")
//  2. hpKuhNrVorschlag(trocken)  nächste freie Kuh-Nummer
//       Melkkühe 1, 2, 3 … lückenlos, trockene ab "trockenStartNr" (Vorgabe 200)
//  3. Butter-Etiketten bei Sennerei → Produktion
//       Anzahl = Butter-kg ÷ Klotzgewicht, Charge aus dem Eintrag,
//       MHD ab Produktionsdatum; Druck auf A4-Etikettenbogen.
//  5. allesFuerExcel()   EINE Datei mit allem für Excel ("herdenpro-alles")
//  6. almabrechnungEinlesen()  .xlsm hochladen: Saisonstart (Kühe) + Abholliste (Blatt "App-Abholliste")
//  4. sennereiPVFuerExcel()  Produktion + Verkäufe der Saison als Datei
//       "Produktion_Verkauf_fuer_Excel_<Datum>.json" (Format "herdenpro-produktion-verkauf").
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  const db = () => firebase.database();
  const toast = (m) => { if(window.showSaveToast) window.showSaveToast(m); };
  const normOm = (s) => String(s || '').toUpperCase().replace(/[\s\-\.]/g, '');
  const norm = (s) => String(s || '').trim().toLowerCase();
  const esc = (s) => String(s == null ? '' : s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]);

  // ── Einstellungen (Firebase: sennerei/einstellungen) ──────────────────────
  let _einst = { trockenStartNr: 200 };
  // v54.60: Listener erst nach Login anhaengen (vor dem Login waeren sie abgelehnt und blieben tot)
  function _nachLogin(fn) {
    try { firebase.auth().onAuthStateChanged(u => { if(u) { try { fn(); } catch(e) {} } }); } catch(e) {}
  }
  _nachLogin(() => {
    db().ref('sennerei/einstellungen').off('value');
    db().ref('sennerei/einstellungen').on('value', s => { _einst = Object.assign({ trockenStartNr: 200 }, s.val() || {}); }, () => {});
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. KUH-NUMMER VORSCHLAGEN
  // ══════════════════════════════════════════════════════════════════════════
  window.hpKuhNrVorschlag = function(trocken) {
    const ts = parseInt(_einst.trockenStartNr) || 200;
    const belegt = new Set();
    Object.values(window.kuehe || {}).forEach(k => {
      if(!k || k.almStatus === 'abgetrieben' || k.almStatus === 'vorzeitig') return;
      const n = parseInt(k.nr); if(!isNaN(n)) belegt.add(n);
    });
    if(trocken) { let n = ts; while(belegt.has(n)) n++; return n; }
    let max = 0; belegt.forEach(n => { if(n < ts && n > max) max = n; });
    let n = max + 1; while(belegt.has(n)) n++;
    return n;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 3. BUTTER-ETIKETTEN
  // ══════════════════════════════════════════════════════════════════════════
  const ET_VORGABE = {
    bezeichnung: 'Alpbutter', zutaten: 'Rahm aus Rohmilch', lagerhinweis: 'Gekühlt lagern (+2 bis +8 °C)',
    mhdTage: '', rohmilch: true, preisKg: '', klotzKg: 0.5, hersteller: '',
    spalten: 3, zeilen: 8, breiteMm: 70, hoeheMm: 37, randObenMm: 0.5, randLinksMm: 0, startNr: 1
  };
  let _et = Object.assign({}, ET_VORGABE);
  _nachLogin(() => {
    db().ref('sennerei/etiketten').off('value');
    db().ref('sennerei/etiketten').on('value', s => { _et = Object.assign({}, ET_VORGABE, s.val() || {}); }, () => {});
  });

  const FELDER = [
    ['bezeichnung', 'Bezeichnung auf dem Etikett', 'text'],
    ['zutaten', 'Zutaten (das Wort Milch/Rahm wird fett gedruckt)', 'text'],
    ['lagerhinweis', 'Lagerhinweis', 'text'],
    ['mhdTage', 'Mindestens haltbar: Tage ab Produktion', 'number'],
    ['rohmilch', '„hergestellt aus Rohmilch" drucken', 'checkbox'],
    ['preisKg', 'Preis (€ je kg)', 'number'],
    ['klotzKg', 'Klotzgewicht (kg)', 'number'],
    ['hersteller', 'Hersteller (Name, Adresse)', 'text'],
    ['spalten', 'Bogen: Spalten', 'number'], ['zeilen', 'Bogen: Zeilen', 'number'],
    ['breiteMm', 'Etikettenbreite (mm)', 'number'], ['hoeheMm', 'Etikettenhöhe (mm)', 'number'],
    ['randObenMm', 'Rand oben (mm)', 'number'], ['randLinksMm', 'Rand links (mm)', 'number'],
    ['startNr', 'Nächster Druck beginnt bei Etikett Nr. (1 = neuer Bogen; stellt sich nach jedem Druck selbst weiter)', 'number']
  ];

  window.sennereiEtikettenEinstellungen = function() {
    const alt = document.getElementById('et-overlay'); if(alt) alt.remove();
    const ov = document.createElement('div');
    ov.id = 'et-overlay'; ov.className = 'form-overlay'; ov.style.display = 'flex';
    ov.innerHTML = '<div class="form-sheet"><div class="form-header"><h3>🏷 Butter-Etiketten – Einstellungen</h3>' +
      '<button class="close-btn" onclick="document.getElementById(\'et-overlay\').remove()">✕</button></div><div class="form-body">' +
      FELDER.map(([k, lbl, typ]) => typ === 'checkbox'
        ? '<label style="display:flex;gap:.5rem;align-items:center;margin:.4rem 0"><input type="checkbox" id="et-' + k + '"' + (_et[k] ? ' checked' : '') + '> ' + esc(lbl) + '</label>'
        : '<label class="lbl" style="display:block;margin-top:.45rem;font-size:.78rem">' + esc(lbl) + '</label><input class="inp" id="et-' + k + '" type="' + typ + '" step="any" value="' + esc(_et[k]) + '">').join('') +
      '<p class="hint" style="margin-top:.6rem">Das fertige Etikett bitte einmal mit der Lebensmittelaufsicht abstimmen. Beim Drucken „Tatsächliche Größe" / 100 % wählen.</p>' +
      '<div class="form-actions"><button class="btn-secondary" onclick="document.getElementById(\'et-overlay\').remove()">Abbrechen</button>' +
      '<button class="btn-primary" onclick="sennereiEtikettenSpeichern()">Speichern</button></div>' +
      '<div style="font-size:.65rem;color:var(--text3);text-align:center;margin-top:.6rem">Engineering by LNMachinery</div></div></div>';
    document.body.appendChild(ov);
  };

  window.sennereiEtikettenSpeichern = async function() {
    const neu = {};
    FELDER.forEach(([k, , typ]) => {
      const el = document.getElementById('et-' + k); if(!el) return;
      neu[k] = typ === 'checkbox' ? el.checked : (typ === 'number' ? (el.value === '' ? '' : parseFloat(el.value)) : el.value.trim());
    });
    try { await db().ref('sennerei/etiketten').set(neu); }
    catch(err) { alert('Speichern fehlgeschlagen: ' + (err && err.message || err)); return; }
    _et = Object.assign({}, ET_VORGABE, neu);
    document.getElementById('et-overlay')?.remove();
    toast('🏷 Etiketten-Einstellungen gespeichert');
  };

  function _milchFett(s) {
    return esc(s).split(' ').map(w => /milch|rahm|butter/i.test(w) ? '<b>' + w + '</b>' : w).join(' ');
  }

  window.sennereiButterEtiketten = function(eintragId) {
    const e = (window.sennereiProduktion || {})[eintragId];
    if(!e) { alert('Eintrag nicht gefunden.'); return; }
    const kg = parseFloat(e.butterKg) || 0;
    const klotz = parseFloat(_et.klotzKg) || 0.5;
    const vorschlag = Math.round(kg / klotz);
    if(vorschlag < 1) { alert('In diesem Eintrag ist keine Butter eingetragen.'); return; }
    const antwort = prompt('Butter ' + kg + ' kg ÷ Klotz ' + klotz + ' kg = ' + vorschlag + ' Etiketten.\n\nAnzahl Etiketten:', String(vorschlag));
    if(antwort === null) return;
    const anzahl = parseInt(antwort) || 0;
    if(anzahl < 1) return;
    // v54.62: angebrochenen Bogen weiterverwenden – Start beim nächsten freien Etikett
    const proBogen0 = (parseInt(_et.spalten) || 3) * (parseInt(_et.zeilen) || 8);
    const startAlt = Math.min(proBogen0, Math.max(1, parseInt(_et.startNr) || 1));
    const startAntwort = prompt('Auf welchem Etikett des Bogens soll der Druck beginnen?\n\n' +
      (startAlt > 1 ? 'Der letzte Bogen ist bis Etikett ' + (startAlt - 1) + ' bedruckt → weiter bei ' + startAlt + '.\n' : '') +
      '1 = neuer, leerer Bogen (1 bis ' + proBogen0 + ')', String(startAlt));
    if(startAntwort === null) return;
    const startNr = Math.min(proBogen0, Math.max(1, parseInt(startAntwort) || 1));

    let mhd = '_____________';
    const tage = parseInt(_et.mhdTage);
    if(e.datum && tage > 0) {
      const dt = new Date(e.datum + 'T12:00:00'); dt.setDate(dt.getDate() + tage);
      mhd = dt.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    const preis = parseFloat(_et.preisKg) || 0;
    const inhalt =
      '<div class="t">' + esc(_et.bezeichnung) + '</div>' +
      (_et.rohmilch ? '<div class="r">hergestellt aus Rohmilch</div>' : '') +
      '<div class="z"><b>Zutaten:</b> ' + _milchFett(_et.zutaten) + '</div>' +
      '<div class="z">' + esc(_et.lagerhinweis) + '</div>' +
      '<div class="z">Mindestens haltbar bis: <b>' + mhd + '</b> · Los: ' + esc(e.butterCharge || '') + '</div>' +
      '<div class="p">' + Math.round(klotz * 1000) + ' g' + (preis > 0 ? ' · ' + preis.toFixed(2) + ' €/kg · <b>' + (klotz * preis).toFixed(2) + ' €</b>' : '') + '</div>' +
      '<div class="h">' + esc(_et.hersteller) + '</div>';

    const sp = parseInt(_et.spalten) || 3, ze = parseInt(_et.zeilen) || 8;
    const bw = parseFloat(_et.breiteMm) || 70, bh = parseFloat(_et.hoeheMm) || 37;
    const ro = parseFloat(_et.randObenMm) || 0, rl = parseFloat(_et.randLinksMm) || 0;
    const proBogen = sp * ze;
    let pos = startNr - 1;
    let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Butter-Etiketten</title><style>' +
      '@page{size:A4;margin:0}body{margin:0;font-family:Calibri,Arial,sans-serif}' +
      '.bogen{position:relative;width:210mm;height:297mm;page-break-after:always}' +
      '.e{position:absolute;box-sizing:border-box;padding:2mm 3mm;overflow:hidden;width:' + bw + 'mm;height:' + bh + 'mm}' +
      '.t{font-size:10pt;font-weight:bold}.r{font-size:6.5pt;font-weight:bold}.z{font-size:6pt;line-height:1.15}' +
      '.p{font-size:7pt;margin-top:.6mm}.h{font-size:5.5pt;color:#444;margin-top:.4mm}</style></head><body>';
    let offen = false;
    for(let i = 0; i < anzahl; i++) {
      if(!offen) { html += '<div class="bogen">'; offen = true; }
      const x = rl + (pos % sp) * bw, y = ro + (Math.floor(pos / sp) % ze) * bh;
      html += '<div class="e" style="left:' + x + 'mm;top:' + y + 'mm">' + inhalt + '</div>';
      pos++;
      if(pos % proBogen === 0) { html += '</div>'; offen = false; }
    }
    if(offen) html += '</div>';
    html += '<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script></body></html>';
    const w = window.open('', '_blank');
    if(!w) { alert('Der Browser hat das Druckfenster blockiert. Bitte Pop-ups für diese Seite erlauben.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    // nächstes freies Etikett merken (für alle Geräte)
    const naechste = (pos % proBogen) + 1;
    _et.startNr = naechste;
    try { db().ref('sennerei/etiketten/startNr').set(naechste).catch(() => {}); } catch(err) {}
    toast('🏷 ' + anzahl + ' Etiketten · nächster Druck beginnt bei Etikett ' + naechste + (naechste === 1 ? ' (neuer Bogen)' : ''));
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 4. PRODUKTION + VERKAUF FÜR DIE ALMABRECHNUNG (Excel)
  // ══════════════════════════════════════════════════════════════════════════
  window.sennereiPVFuerExcel = function() {
    const r2 = v => Math.round((parseFloat(v) || 0) * 1000) / 1000;
    const preis = window.sennereiPreisliste || {};
    const produktion = Object.values(window.sennereiProduktion || {})
      .filter(e => e && e.datum)
      .map(e => ({ datum: e.datum, kaeseKg: r2(e.kaeseKg), butterKg: r2(e.butterKg) }))
      .sort((a, b) => a.datum.localeCompare(b.datum));
    const verkaeufe = Object.values(window.sennereiVerkaeufe || {})
      .filter(v => v && v.datum && Array.isArray(v.positionen))
      .map(v => ({ datum: v.datum, positionen: v.positionen.filter(Boolean).map(p => ({
          name: p.name || '', mengeKg: r2(p.mengeKg),
          kategorie: p.kategorie || (preis[p.preisId] && preis[p.preisId].kategorie) || '' })) }))
      .sort((a, b) => a.datum.localeCompare(b.datum));
    if(!produktion.length && !verkaeufe.length) { alert('Es sind noch keine Produktionen oder Verkäufe erfasst.'); return; }
    const daten = { format: 'herdenpro-produktion-verkauf', version: 1, app: 'HerdenPro',
                    exportiertAm: new Date().toISOString(), produktion, verkaeufe };
    const blob = new Blob([JSON.stringify(daten, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    a.download = 'Produktion_Verkauf_fuer_Excel_' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast('📤 Datei für Excel gespeichert: ' + produktion.length + ' Produktionstage, ' + verkaeufe.length + ' Verkäufe');
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 5. ALLES FÜR EXCEL (eine Datei)
  // ══════════════════════════════════════════════════════════════════════════
  window.allesFuerExcel = async function() {
    try {
      toast('⏳ Datei für Excel wird erstellt…');
      const r2 = v => Math.round((parseFloat(v) || 0) * 1000) / 1000;
      const kuehe = window.kuehe || {};
      const kuhListe = Object.entries(kuehe).map(([id, k]) => Object.assign({}, k, { id, trocken: k.laktation === 'trocken' }));
      const behandlungen = Object.entries(window.behandlungen || {}).map(([id, b]) => {
        const k = kuehe[b.kuhId] || {};
        return { id, kuhId: b.kuhId, kuhNr: k.nr || '', kuhName: k.name || '', bauer: k.bauer || '',
                 datum: b.datum || null, datumEnde: b.datumEnde || null, medizinQuelle: b.medizinQuelle || '',
                 diagnose: b.diagnose || '', medikament: b.medikament || '', dosis: b.dosis || '' };
      });
      // Abholungen aller Wochen (aktueller Stand aus der Datenbank)
      let wochen = {};
      try {   // v54.61: max. 30 s warten (offline sonst endlos)
        wochen = (await Promise.race([firebase.database().ref('sennerei/wochen').once('value'),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), 30000))])).val() || {};
      } catch(e) { console.warn('[Almabrechnung] Abholungen nicht geladen:', e); toast('⚠ Abholungen konnten nicht geladen werden – Datei ohne Abholungen'); }
      const teil = p => ({ abgeholt: r2(p && p.abgeholt), naturalrAbgeholt: r2(p && p.naturalrAbgeholt), chargen: (p && p.chargen) || [] });
      const abholungen = Object.entries(wochen).map(([wid, w]) => ({
        format: 'herdenpro-abholung', wocheId: wid, wocheNr: w.wocheNr || null, jahr: w.jahr || null,
        startDatum: w.startDatum || null, endeDatum: w.endeDatum || null,
        bauern: Object.values(w.bauern || {}).filter(b => b && b.name).map(b => ({
          name: b.name, kaese: teil(b.kaese), butter: teil(b.butter),
          abgeholtAm: b.abgeholtAm ? new Date(b.abgeholtAm).toISOString() : null,
          anzahlAbholungen: b.abholungen ? Object.values(b.abholungen).filter(Boolean).length : (b.abgeholtAm ? 1 : 0) }))
      }));
      const preis = window.sennereiPreisliste || {};
      const produktion = Object.values(window.sennereiProduktion || {}).filter(e => e && e.datum)
        .map(e => ({ datum: e.datum, kaeseKg: r2(e.kaeseKg), butterKg: r2(e.butterKg) }));
      const verkaeufe = Object.values(window.sennereiVerkaeufe || {}).filter(v => v && v.datum && Array.isArray(v.positionen))
        .map(v => ({ datum: v.datum, positionen: v.positionen.filter(Boolean).map(p => ({
            name: p.name || '', mengeKg: r2(p.mengeKg),
            kategorie: p.kategorie || (preis[p.preisId] && preis[p.preisId].kategorie) || '' })) }));
      const daten = {
        format: 'herdenpro-alles', version: 1, app: 'HerdenPro', exportiertAm: new Date().toISOString(),
        bauern: Object.values(window.bauern || {}), kuehe: kuhListe,
        besamungen: Object.values(window.besamungen || {}), behandlungen,
        milch_wochen: [], milchCsv: (window.milchCsvText ? window.milchCsvText() : ''),
        abholungen, produktion, verkaeufe
      };
      const blob = new Blob([JSON.stringify(daten)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const d = new Date(), p2 = n => String(n).padStart(2, '0');
      a.download = 'HerdenPro_Alles_fuer_Excel_' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '_' + p2(d.getHours()) + p2(d.getMinutes()) + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      toast('📤 Alles für Excel gespeichert – in Excel „ALLES AUS APP EINLESEN“');
    } catch(err) {
      console.error('[Almabrechnung] Alles für Excel:', err);
      alert('Export fehlgeschlagen:\n\n' + (err.message || err));
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 6. ALMABRECHNUNG EINLESEN (Saisonstart + Abholliste aus EINER Datei)
  // ══════════════════════════════════════════════════════════════════════════
  function _xlsxLaden() {
    return new Promise((ok, fehler) => {
      if(typeof XLSX !== 'undefined') return ok();
      const s = document.createElement('script');
      s.src = 'lib/xlsx.full.min.js'; s.onload = () => ok(); s.onerror = () => fehler(new Error('Excel-Bibliothek nicht geladen'));
      document.head.appendChild(s);
    });
  }

  // v54.61: was = 'kuehe' (nur beim Saisonstart: Kühe aus Blatt "Saisonstart")
  //         sonst (Sennerei): NUR die Abholliste – Kühe bleiben unverändert
  window.almabrechnungEinlesen = function(was) {
    const nurKuehe = was === 'kuehe';
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.xlsm,.xlsx';
    inp.onchange = async () => {
      const file = inp.files && inp.files[0];
      if(!file) return;
      try {
        await _xlsxLaden();
        // 1) Kühe über den Saisonstart-Import der App – nur zum Saisonstart
        if(nurKuehe) {
          if(window.importSaisonstartExcel) await window.importSaisonstartExcel({ files: [file], value: '' });
          return;
        }
        // 2) Abholliste der gewählten Woche (Blatt "App-Abholliste", JSON in A1, A2, ...)
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const ws = wb.Sheets['App-Abholliste'];
        if(!ws) { alert('In der Almabrechnung ist keine Abholliste enthalten.\nIn Excel die Woche in der Abholung wählen und die Datei speichern.'); return; }
        let text = '';
        for(let r = 1; r <= 200; r++) { const c = ws['A' + r]; if(!c || c.v == null) break; text += String(c.v); }
        if(!text) { alert('Die Abholliste in der Almabrechnung ist leer.'); return; }
        const parsed = await window.sennereiParseJson({ name: 'abholliste.json', text: async () => text });
        if(window.sennereiZeigeImportVorschau) window.sennereiZeigeImportVorschau(parsed);
      } catch(err) {
        console.error('[Almabrechnung] Einlesen:', err);
        alert('Einlesen fehlgeschlagen:\n\n' + (err.message || err));
      }
    };
    inp.click();
  };
})();
