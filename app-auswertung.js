// ═══════════════════════════════════════════════════════════════════════════
//  PAKET 4 – Auswertungen
//  A) Leistungs-Auffälligkeiten im Kuh-Fenster
//     • Milch fällt ab: die letzten 2 Melkungen je mind. 20 % unter dem
//       eigenen Schnitt derselben Melkzeit (7 Tage davor)
//     • Schalmtest schlechter als der vorige Test derselben Kuh
// ═══════════════════════════════════════════════════════════════════════════
(function() {
  const TAG = 86400000;
  const ABFALL = 0.20;            // 20 % weniger
  const SCHALM_RANG = { 'negativ': 0, '+': 1, '++': 2, '+++': 3 };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const lit = n => (Math.round(n * 10) / 10).toString().replace('.', ',');
  const dat = ts => new Date(ts).toLocaleDateString('de-AT', { day: 'numeric', month: 'numeric' });
  const zeitTxt = z => (z === 'abend' ? 'abends' : 'morgens');
  const mW = v => (window.milchWert ? window.milchWert(v)
    : (typeof v === 'number' ? v : (v && v.wert != null ? parseFloat(v.wert) || 0 : parseFloat(v) || 0)));

  // Alle Melkungen einer Kuh: [{d, z, l}] chronologisch, eine pro Tag+Melkzeit
  function melkungen(kuhId) {
    const map = new Map();
    Object.values(window.milchEintraege || (typeof milchEintraege !== 'undefined' ? milchEintraege : {}) || {}).forEach(e => {
      if(!e || !e.datum || !e.prokuh || e.prokuh[kuhId] == null) return;
      const l = mW(e.prokuh[kuhId]);
      if(!(l > 0)) return;
      const z = e.zeit || 'morgen';
      const key = new Date(e.datum).toDateString() + '|' + z;
      const alt = map.get(key);
      if(!alt || e.datum >= alt.d) map.set(key, { d: e.datum, z, l });
    });
    return [...map.values()].sort((a, b) => a.d - b.d);
  }

  function milchAbfall(kuhId) {
    const k = (window.kuehe || (typeof kuehe !== 'undefined' ? kuehe : {}))[kuhId];
    if(!k || k.laktation === 'trocken' || k.laktation === 'trockengestellt') return null;
    const alle = melkungen(kuhId);
    if(alle.length < 4) return null;
    const letzte = alle.slice(-2);
    if(Date.now() - letzte[1].d > 3 * TAG) return null;          // nur aktuelle Daten
    const vorher = alle.slice(0, -2);
    const details = [];
    for(const m of letzte) {
      const basis = vorher.filter(x => x.z === m.z && x.d >= m.d - 7 * TAG && x.d < m.d);
      if(basis.length < 2) return null;
      const schnitt = basis.reduce((s, x) => s + x.l, 0) / basis.length;
      if(!(schnitt > 1) || m.l > schnitt * (1 - ABFALL)) return null;
      details.push({ ...m, schnitt, minus: Math.round((1 - m.l / schnitt) * 100) });
    }
    return details;
  }

  function schalmSchlechter(kuhId) {
    const tests = Object.values(window.schalmtest || {})
      .filter(t => t && t.kuhId === kuhId && t.datum && SCHALM_RANG[t.wertGesamt] != null)
      .sort((a, b) => a.datum - b.datum);
    if(tests.length < 2) return null;
    const neu = tests[tests.length - 1], alt = tests[tests.length - 2];
    if(SCHALM_RANG[neu.wertGesamt] <= SCHALM_RANG[alt.wertGesamt]) return null;
    return { alt, neu };
  }
  const schalmTxt = w => (w === 'negativ' ? 'negativ' : w);

  window.hpLeistungsHinweise = function(kuhId) {
    return { milch: milchAbfall(kuhId), schalm: schalmSchlechter(kuhId) };
  };

  window.hpLeistungsHinweiseHTML = function(kuhId) {
    let h;
    try { h = window.hpLeistungsHinweise(kuhId); } catch(e) { console.warn('[Auffälligkeit]', e); return ''; }
    const zeilen = [];
    if(h.milch) {
      zeilen.push('<div style="margin-top:.25rem"><b>🥛 Milch fällt ab:</b> ' +
        h.milch.map(m => esc(dat(m.d) + ' ' + zeitTxt(m.z)) + ' <b>' + lit(m.l) + ' L</b> statt Ø ' + lit(m.schnitt) + ' L (−' + m.minus + ' %)').join(' · ') +
        '</div>');
    }
    if(h.schalm) {
      zeilen.push('<div style="margin-top:.25rem"><b>🧪 Schalmtest schlechter:</b> ' +
        esc(schalmTxt(h.schalm.alt.wertGesamt)) + ' (' + esc(dat(h.schalm.alt.datum)) + ') → <b>' +
        esc(schalmTxt(h.schalm.neu.wertGesamt)) + '</b> (' + esc(dat(h.schalm.neu.datum)) + ')</div>');
    }
    if(!zeilen.length) return '';
    return '<div class="hp-auffaellig" style="background:rgba(231,76,60,.12);border:1px solid rgba(231,76,60,.5);border-radius:12px;padding:.6rem .8rem;margin-bottom:.75rem;font-size:.85rem;line-height:1.45;color:var(--text)">' +
      '<div style="font-weight:700;color:#e74c3c">⚠ Auffällig – bitte anschauen</div>' + zeilen.join('') + '</div>';
  };
})();

// ═══════════════════════════════════════════════════════════════════════════
//  B) TAGESABSCHLUSS BARKASSE (Sennerei-Verkauf → 🧾 Abschluss)
//     Tagessumme nach Produkt · Kassensturz (Wechselgeld + Umsatz = Soll,
//     gezählt − Soll = Differenz) · Speichern unter sennerei/tagesabschluss/<Tag>
//     · PDF zum Ausdrucken
// ═══════════════════════════════════════════════════════════════════════════
(function() {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const eur = n => (Math.round((n || 0) * 100) / 100).toFixed(2).replace('.', ',');
  const kg = n => String(Math.round((n || 0) * 1000) / 1000).replace('.', ',');
  const zahl = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? null : Math.round(n * 100) / 100; };
  const isoTag = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const tagLang = iso => new Date(iso + 'T12:00').toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const _cache = {};     // { 'YYYY-MM-DD': gespeicherter Abschluss | null }
  const _laedt = {};

  function tagesDaten(iso) {
    const von = new Date(iso + 'T00:00:00').getTime(), bis = new Date(iso + 'T23:59:59.999').getTime();
    const verk = Object.values(window.sennereiVerkaeufe || {}).filter(v => v && v.datumTs >= von && v.datumTs <= bis);
    const pro = {};
    verk.forEach(v => (v.positionen || []).forEach(p => {
      const n = p.name || '?';
      if(!pro[n]) pro[n] = { name: n, kg: 0, stk: 0, umsatz: 0 };
      if(p.mengeKg != null) pro[n].kg += p.mengeKg || 0; else pro[n].stk += p.menge || 1;
      pro[n].umsatz += p.gesamt || 0;
    }));
    const umsatz = Math.round(verk.reduce((s, v) => s + (v.summe || 0), 0) * 100) / 100;
    return { anzahl: verk.length, umsatz, produkte: Object.values(pro).sort((a, b) => b.umsatz - a.umsatz) };
  }

  function laden(iso) {
    if(iso in _cache || _laedt[iso]) return;
    _laedt[iso] = true;
    firebase.database().ref('sennerei/tagesabschluss/' + iso).once('value')
      .then(s => { _cache[iso] = s.val() || null; })
      .catch(e => { console.warn('[Tagesabschluss]', e && e.message); _cache[iso] = null; })
      .finally(() => { _laedt[iso] = false; if(window._verkaufSubView === 'abschluss' && typeof render === 'function') render(); });
  }

  window.hpRenderTagesabschluss = function() {
    const iso = window._taDatum || isoTag(new Date());
    laden(iso);
    setTimeout(() => window.hpTaRechnen(), 0);
    const d = tagesDaten(iso);
    const gesp = _cache[iso];
    const wert = f => (gesp && gesp[f] != null) ? eur(gesp[f]) : '';
    const geaendert = gesp && (Math.abs((gesp.umsatz || 0) - d.umsatz) > 0.004 || (gesp.anzahl || 0) !== d.anzahl);
    const zeilen = d.produkte.map(p =>
      '<tr><td style="padding:.3rem 0">' + esc(p.name) + '</td>' +
      '<td style="text-align:right;padding:.3rem .4rem;color:var(--text2)">' + (p.kg ? kg(p.kg) + ' kg' : '') + (p.stk ? (p.kg ? ' + ' : '') + p.stk + ' Stk' : '') + '</td>' +
      '<td style="text-align:right;padding:.3rem 0;font-weight:700">' + eur(p.umsatz) + ' €</td></tr>').join('');
    return `
      <div class="card-section" style="padding:.7rem .8rem;margin-bottom:.7rem">
        <label class="inp-label">Tag</label>
        <input type="date" class="inp" value="${iso}" max="${isoTag(new Date())}" onchange="window._taDatum=this.value||null;render()" style="margin-bottom:.4rem" />
        <div style="font-size:.8rem;color:var(--text3)">${esc(tagLang(iso))}</div>
      </div>

      <div class="card-section" style="padding:.7rem .8rem;margin-bottom:.7rem">
        <div class="section-label" style="margin-bottom:.4rem">🧾 TAGESSUMME</div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:.3rem">
          <span style="color:var(--text2)">${d.anzahl} Verkäufe</span>
          <span style="font-size:1.6rem;font-weight:800;color:var(--gold)">${eur(d.umsatz)} €</span>
        </div>
        ${d.produkte.length ? '<table style="width:100%;border-collapse:collapse;font-size:.88rem;margin-top:.5rem;border-top:1px solid var(--border)">' + zeilen + '</table>'
          : '<div class="empty-state" style="padding:.6rem 0">Keine Verkäufe an diesem Tag.</div>'}
      </div>

      <div class="card-section" style="padding:.7rem .8rem;margin-bottom:.7rem">
        <div class="section-label" style="margin-bottom:.4rem">💶 KASSENSTURZ</div>
        <label class="inp-label">Wechselgeld am Morgen (€)</label>
        <input id="ta-anfang" class="inp" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${wert('anfang')}" oninput="hpKgEingabe&&hpKgEingabe(this);hpTaRechnen()" style="margin-bottom:.5rem" />
        <label class="inp-label">Bargeld gezählt am Abend (€)</label>
        <input id="ta-gezaehlt" class="inp" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${wert('gezaehlt')}" oninput="hpKgEingabe&&hpKgEingabe(this);hpTaRechnen()" style="margin-bottom:.5rem" />
        <label class="inp-label">Notiz (optional)</label>
        <input id="ta-notiz" class="inp" type="text" value="${esc(gesp && gesp.notiz || '')}" placeholder="z.B. 20 € für Einkauf entnommen" style="margin-bottom:.6rem" />
        <div id="ta-ergebnis" data-umsatz="${d.umsatz}"></div>
      </div>

      ${geaendert ? '<div style="background:rgba(230,126,34,.15);border:1px solid #e67e22;border-radius:10px;padding:.5rem .7rem;margin-bottom:.6rem;font-size:.85rem">⚠ Seit dem gespeicherten Abschluss haben sich die Verkäufe geändert (vorher ' + eur(gesp.umsatz) + ' €). Bitte neu speichern.</div>' : ''}
      ${gesp ? '<div style="font-size:.78rem;color:var(--text3);margin-bottom:.5rem">Gespeichert am ' + esc(new Date(gesp.am).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + (gesp.von ? ' · ' + esc(gesp.von) : '') + '</div>' : ''}
      <div style="display:flex;flex-wrap:wrap;gap:.5rem">
        <button class="btn-primary" style="flex:1 1 9rem;white-space:normal" onclick="hpTaSpeichern()">💾 Abschluss speichern</button>
        <button class="btn-secondary" style="flex:1 1 9rem;white-space:normal" onclick="hpTaPdf()">📄 PDF</button>
      </div>
    `;
  };

  function eingaben() {
    const box = document.getElementById('ta-ergebnis');
    const umsatz = box ? parseFloat(box.dataset.umsatz) || 0 : 0;
    const anfang = zahl(document.getElementById('ta-anfang')?.value);
    const gezaehlt = zahl(document.getElementById('ta-gezaehlt')?.value);
    const soll = Math.round(((anfang || 0) + umsatz) * 100) / 100;
    const diff = gezaehlt == null ? null : Math.round((gezaehlt - soll) * 100) / 100;
    return { umsatz, anfang, gezaehlt, soll, diff, notiz: (document.getElementById('ta-notiz')?.value || '').trim() };
  }
  function diffTxt(diff) {
    if(diff == null) return { t: 'Bargeld zählen und eintragen', f: 'var(--text3)' };
    if(Math.abs(diff) < 0.005) return { t: '✓ Kasse stimmt', f: 'var(--green)' };
    return diff > 0 ? { t: '+' + eur(diff) + ' € zu viel in der Kasse', f: '#e67e22' } : { t: eur(Math.abs(diff)) + ' € fehlen in der Kasse', f: '#e74c3c' };
  }

  window.hpTaRechnen = function() {
    const box = document.getElementById('ta-ergebnis');
    if(!box) return;
    const e = eingaben(), dt = diffTxt(e.diff);
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;font-size:.9rem;padding:.2rem 0"><span>Wechselgeld</span><span>' + eur(e.anfang) + ' €</span></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:.9rem;padding:.2rem 0"><span>+ Umsatz</span><span>' + eur(e.umsatz) + ' €</span></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:.95rem;padding:.3rem 0;border-top:1px solid var(--border);font-weight:700"><span>= Soll in der Kasse</span><span>' + eur(e.soll) + ' €</span></div>' +
      (e.gezaehlt != null ? '<div style="display:flex;justify-content:space-between;font-size:.9rem;padding:.2rem 0"><span>Gezählt</span><span>' + eur(e.gezaehlt) + ' €</span></div>' : '') +
      '<div style="margin-top:.4rem;padding:.5rem .6rem;border-radius:8px;background:rgba(0,0,0,.2);font-weight:800;color:' + dt.f + '">' + esc(dt.t) + '</div>';
  };

  window.hpTaSpeichern = async function() {
    const iso = window._taDatum || isoTag(new Date());
    const d = tagesDaten(iso), e = eingaben();
    if(e.gezaehlt == null && !confirm('Kein gezähltes Bargeld eingetragen. Trotzdem speichern?')) return;
    const u = firebase.auth && firebase.auth().currentUser;
    const daten = {
      datum: iso, anzahl: d.anzahl, umsatz: d.umsatz,
      anfang: e.anfang, gezaehlt: e.gezaehlt, soll: e.soll, differenz: e.diff,
      notiz: e.notiz || '',
      produkte: d.produkte.map(p => ({ name: p.name, kg: Math.round(p.kg * 1000) / 1000, stk: p.stk, umsatz: Math.round(p.umsatz * 100) / 100 })),
      am: Date.now(), von: (u && (u.email || u.uid)) || null
    };
    try {
      const _retry = window.withAuthRetry || (async fn => await fn());
      await _retry(() => firebase.database().ref('sennerei/tagesabschluss/' + iso).set(daten));
      _cache[iso] = daten;
      if(window.showSaveToast) window.showSaveToast('Tagesabschluss gespeichert');
      if(typeof render === 'function') render();
    } catch(err) { alert('Speichern fehlgeschlagen: ' + (err && err.message || err)); }
  };

  window.hpTaPdf = function() {
    const iso = window._taDatum || isoTag(new Date());
    const d = tagesDaten(iso), e = eingaben(), dt = diffTxt(e.diff);
    const alm = (window.saisonInfo && window.saisonInfo.alm) || 'Alm';
    const rows = d.produkte.map(p => '<tr><td>' + esc(p.name) + '</td><td class="r">' + (p.kg ? kg(p.kg) + ' kg' : '') + (p.stk ? (p.kg ? ' + ' : '') + p.stk + ' Stk' : '') + '</td><td class="r"><b>' + eur(p.umsatz) + ' €</b></td></tr>').join('');
    const html = '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/><title>Tagesabschluss ' + esc(iso) + '</title><style>' +
      'body{font-family:Georgia,serif;color:#222;padding:24px;max-width:700px;margin:0 auto}' +
      'h1{color:#6a4a10;border-bottom:2px solid #d4a84b;padding-bottom:8px}' +
      'h2{color:#8b6914;font-size:1.05rem;margin-top:20px}' +
      'table{border-collapse:collapse;width:100%;font-size:13px}' +
      'th{background:#f0e0b0;text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase;color:#5a4010;border-bottom:2px solid #d4a84b}' +
      'td{padding:5px 8px;border-bottom:1px solid #eee}td.r{text-align:right;font-family:monospace}' +
      '.sum td{font-weight:800;border-top:2px solid #d4a84b}' +
      '.erg{margin-top:12px;padding:10px 14px;border-radius:8px;border:2px solid #d4a84b;font-weight:800;font-size:15px}' +
      '.sign{margin-top:40px;display:flex;gap:40px}.sign div{flex:1;border-top:1px solid #999;padding-top:4px;font-size:11px;color:#666}' +
      '.footer{margin-top:24px;padding-top:8px;border-top:1px solid #eee;color:#999;font-size:10px;text-align:center}' +
      '</style></head><body>' +
      '<h1>🧾 Tagesabschluss Barkasse</h1>' +
      '<div>' + esc(alm) + ' · <b>' + esc(tagLang(iso)) + '</b> · ' + d.anzahl + ' Verkäufe</div>' +
      '<h2>Verkauf nach Produkt</h2>' +
      '<table><thead><tr><th>Produkt</th><th style="text-align:right">Menge</th><th style="text-align:right">Umsatz</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="3"><i>Keine Verkäufe</i></td></tr>') +
      '<tr class="sum"><td>Umsatz gesamt</td><td></td><td class="r">' + eur(d.umsatz) + ' €</td></tr></tbody></table>' +
      '<h2>Kassensturz</h2><table><tbody>' +
      '<tr><td>Wechselgeld am Morgen</td><td class="r">' + eur(e.anfang) + ' €</td></tr>' +
      '<tr><td>+ Umsatz</td><td class="r">' + eur(d.umsatz) + ' €</td></tr>' +
      '<tr class="sum"><td>= Soll in der Kasse</td><td class="r">' + eur(e.soll) + ' €</td></tr>' +
      '<tr><td>Bargeld gezählt</td><td class="r">' + (e.gezaehlt == null ? '–' : eur(e.gezaehlt) + ' €') + '</td></tr>' +
      '</tbody></table>' +
      '<div class="erg">' + esc(dt.t) + '</div>' +
      (e.notiz ? '<p><b>Notiz:</b> ' + esc(e.notiz) + '</p>' : '') +
      '<div class="sign"><div>Datum, Unterschrift</div><div>Kontrolliert</div></div>' +
      '<div class="footer">HerdenPro · Engineering by LNMachinery · Bruttopreise inkl. USt · Bar-Zahlung</div>' +
      '<script>setTimeout(()=>window.print(),300);<\/script></body></html>';
    const w = window.open('', '_blank');
    if(!w) { alert('Popup blockiert — bitte für diese Seite erlauben.'); return; }
    w.document.write(html); w.document.close();
  };
})();

// ═══════════════════════════════════════════════════════════════════════════
//  C) MEHRJAHRES-VERGLEICH PRO BAUER  (Bauer-Fenster → 📈 Saisonen im Vergleich)
//     Pro Saison: Kühe, Alpungstage, Milch gesamt, verworfen, Ø L/Kuh/Tag,
//     Käse/Butter abgeholt. Laufende Saison aus den App-Daten, frühere Saisonen
//     aus saisonArchivDaten (nur Admin darf das Archiv lesen).
//     Milch wird mit derselben Rechnung wie in der App ermittelt
//     (computeCarryForwardGesamt) – für Archiv-Saisonen mit deren Daten.
// ═══════════════════════════════════════════════════════════════════════════
(function() {
  const TAG = 86400000;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const zahl1 = n => (Math.round((n || 0) * 10) / 10).toLocaleString('de-AT');
  const ganz = n => Math.round(n || 0).toLocaleString('de-AT');
  const norm = s => (window.sennereiNormalisierName ? window.sennereiNormalisierName(s)
    : String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-'));
  let _daten = null, _laedt = false, _fehler = null;

  const istAdmin = () => window._currentRole === 'admin';
  const saisonArchivListe = () => {
    const sa = (typeof saisonArchiv !== 'undefined' && saisonArchiv) ? saisonArchiv : (window.saisonArchiv || {});
    return Object.entries(sa).filter(([, v]) => v && v.archivDatenKey).map(([k, v]) => ({ key: v.archivDatenKey, jahr: v.jahr || k }));
  };

  // Werte pro Bauer für EINE Saison (Daten-Objekt wie in der DB)
  function saisonAuswerten(d, saisonInfo, label) {
    const kuehe = d.kuehe || {}, wochen = (d.sennerei && d.sennerei.wochen) || {};
    const heute = Date.now();
    const auf = saisonInfo && saisonInfo.auftriebDatum;
    const ende = (saisonInfo && (saisonInfo.abtriebtDatum || saisonInfo.saisonEndeDatum)) || heute;
    // Milch mit der App-Rechnung: globale Daten kurz austauschen (synchron, kein Render dazwischen)
    const sicher = {
      kuehe: window.kuehe, milchEintraege: window.milchEintraege, behandlungen: window.behandlungen,
      milchSperren: window.milchSperren, saisonInfo: window.saisonInfo
    };
    const ergebnis = {};
    const bauernNamen = {};
    // Kühe, die in dieser Saison überhaupt Milch gegeben haben
    const milchQuelle = (d && d._archiv) ? (d.milch || {}) : (window.milchEintraege || {});
    const mitMilch = new Set();
    Object.values(milchQuelle).forEach(e => { if(e && e.prokuh) Object.entries(e.prokuh).forEach(([id, v]) => {
      const l = window.milchWert ? window.milchWert(v) : (typeof v === 'number' ? v : parseFloat(v && v.wert != null ? v.wert : v) || 0);
      if(l > 0) mitMilch.add(id);
    }); });
    Object.values(kuehe).forEach(k => { if(k && k.bauer) bauernNamen[norm(k.bauer)] = k.bauer; });
    try {
      if(d !== null && d._archiv) {
        window.kuehe = kuehe; window.milchEintraege = d.milch || {}; window.behandlungen = d.behandlungen || {};
        window.milchSperren = d.milchSperren || {}; window.saisonInfo = saisonInfo || {};
      }
      Object.entries(bauernNamen).forEach(([n, name]) => {
        const ids = Object.entries(kuehe).filter(([, k]) => k && norm(k.bauer) === n).map(([id]) => id);
        let cf = { gesamt: 0, verworfen: 0 };
        try { cf = window.computeCarryForwardGesamt ? window.computeCarryForwardGesamt(new Set(ids)) : cf; } catch(e) { console.warn('[Bauer-Vergleich] Milch', e); }
        let tage = 0, milchTage = 0;
        ids.forEach(id => {
          const k = kuehe[id];
          if(!auf) return;
          const bis = Math.min(ende, (k.vorzeitigAbtrieb && k.vorzeitigAbtrieb.datum) || Infinity);
          const t = Math.max(0, Math.floor((bis - auf) / TAG));
          tage += t;
          if(mitMilch.has(id)) milchTage += t;
        });
        ergebnis[n] = { name, kuehe: ids.length, tage, milch: cf.gesamt || 0, verworfen: cf.verworfen || 0,
          schnitt: milchTage > 0 && cf.gesamt > 0 ? cf.gesamt / milchTage : null, kaese: 0, butter: 0 };
      });
    } finally {
      if(d !== null && d._archiv) Object.assign(window, sicher);
    }
    Object.values(wochen).forEach(w => Object.entries((w && w.bauern) || {}).forEach(([bid, b]) => {
      const n = ergebnis[bid] ? bid : norm(b && b.name);
      if(!ergebnis[n]) ergebnis[n] = { name: b.name, kuehe: 0, tage: 0, milch: 0, verworfen: 0, schnitt: null, kaese: 0, butter: 0 };
      ergebnis[n].kaese += parseFloat(b.kaese && b.kaese.abgeholt) || 0;
      ergebnis[n].butter += parseFloat(b.butter && b.butter.abgeholt) || 0;
    }));
    return { label, proBauer: ergebnis };
  }

  window._hpSaisonAuswerten = saisonAuswerten;

  async function ladeSennereiWochen(pfad) {
    const s = await firebase.database().ref(pfad).once('value');
    return s.val() || {};
  }

  window.hpBauerVergleichLaden = async function(neu) {
    if(_laedt) return;
    if(_daten && !neu) return;
    _laedt = true; _fehler = null; if(typeof render === 'function') render();
    try {
      const saisonen = [];
      // laufende Saison
      const aktWochen = await ladeSennereiWochen('sennerei/wochen');
      const akt = saisonAuswerten({ kuehe: window.kuehe || {}, sennerei: { wochen: aktWochen } }, window.saisonInfo, String((window.saisonInfo && window.saisonInfo.jahr) || new Date().getFullYear()) + ' (laufend)');
      saisonen.push(akt);
      // Archiv (nur Admin)
      if(istAdmin()) {
        for(const a of saisonArchivListe()) {
          const root = 'saisonArchivDaten/' + a.key;
          const [meta, kuehe, milch, beh, sperren, wochen] = await Promise.all(
            ['/meta', '/daten/kuehe', '/daten/milch', '/daten/behandlungen', '/daten/milchSperren', '/daten/sennerei/wochen']
              .map(p => firebase.database().ref(root + p).once('value').then(s => s.val())));
          const d = { _archiv: true, kuehe: kuehe || {}, milch: milch || {}, behandlungen: beh || {}, milchSperren: sperren || {}, sennerei: { wochen: wochen || {} } };
          saisonen.push(saisonAuswerten(d, (meta && meta.saison) || {}, String(a.jahr)));
        }
      }
      saisonen.sort((x, y) => String(y.label).localeCompare(String(x.label)));
      _daten = { saisonen, am: Date.now(), nurAktuell: !istAdmin() };
    } catch(e) {
      console.warn('[Bauer-Vergleich]', e);
      _fehler = (e && e.message) || String(e);
    } finally {
      _laedt = false;
      if(typeof render === 'function') render();
    }
  };

  window.hpBauerVergleichHTML = function(bauerName) {
    const n = norm(bauerName);
    let inhalt;
    if(_laedt) inhalt = '<div class="empty-state">⏳ Lade Saisonen…</div>';
    else if(_fehler) inhalt = '<div class="empty-state">Fehler: ' + esc(_fehler) + '</div><button class="btn-secondary btn-block" onclick="hpBauerVergleichLaden(true)">Nochmal versuchen</button>';
    else if(!_daten) inhalt = '<button class="btn-secondary btn-block" onclick="hpBauerVergleichLaden()">📈 Saisonen vergleichen</button>';
    else {
      const zeilen = _daten.saisonen.map(s => ({ label: s.label, w: s.proBauer[n] })).filter(z => z.w);
      inhalt = zeilen.length ? zeilen.map(({ label, w }) => `
        <div class="list-card" style="display:block;padding:.6rem .7rem">
          <div style="font-weight:700;color:var(--gold);margin-bottom:.3rem">Saison ${esc(label)}</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr));gap:.25rem .8rem;font-size:.85rem">
            <div>🐄 Kühe: <b>${w.kuehe}</b></div>
            <div>📅 Alpungstage: <b>${ganz(w.tage)}</b></div>
            <div>🥛 Milch: <b>${ganz(w.milch)} L</b></div>
            <div>🚫 verworfen: <b>${ganz(w.verworfen)} L</b></div>
            <div>Ø pro Kuh/Tag: <b>${w.schnitt != null ? zahl1(w.schnitt) + ' L' : '–'}</b></div>
            <div>🧀 Käse: <b>${zahl1(w.kaese)} kg</b></div>
            <div>🧈 Butter: <b>${zahl1(w.butter)} kg</b></div>
          </div>
        </div>`).join('') : '<div class="empty-state">Keine Daten zu diesem Bauern.</div>';
      inhalt += '<div style="font-size:.72rem;color:var(--text3);margin-top:.3rem">' +
        (_daten.nurAktuell ? 'Frühere Saisonen sieht nur der Admin. ' : '') +
        'Ø pro Kuh/Tag = Milch ÷ Alpungstage der Milchkühe. <a href="#" onclick="hpBauerVergleichLaden(true);return false" style="color:var(--gold)">Neu laden</a></div>';
    }
    return '<div class="section-title">📈 Saisonen im Vergleich</div><div style="margin-bottom:1rem">' + inhalt + '</div>';
  };
})();

// ═══════════════════════════════════════════════════════════════════════════
//  D) SAISON-RÜCKBLICK ALS PDF  (Herdenvergleich → 📄 Rückblick)
// ═══════════════════════════════════════════════════════════════════════════
(function() {
  const TAG = 86400000;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const ganz = n => Math.round(n || 0).toLocaleString('de-AT');
  const z1 = n => (Math.round((n || 0) * 10) / 10).toLocaleString('de-AT');
  const eur = n => (Math.round((n || 0) * 100) / 100).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dat = ts => ts ? new Date(ts).toLocaleDateString('de-AT') : '–';
  const g = name => (typeof window[name] !== 'undefined' ? window[name] : undefined);

  window.hpSaisonRueckblickPdf = async function() {
    const w = window.open('', '_blank');
    if(!w) { alert('Popup blockiert — bitte für diese Seite erlauben.'); return; }
    w.document.write('<p style="font-family:Georgia,serif;padding:24px">⏳ Saison-Rückblick wird erstellt…</p>');
    try {
      const si = g('saisonInfo') || {};
      const kuehe = g('kuehe') || {}, beh = g('behandlungen') || {}, bes = g('besamungen') || {};
      const heute = Date.now();
      const auf = si.auftriebDatum || null;
      const ende = si.abtriebtDatum || si.saisonEndeDatum || null;
      const tage = auf ? Math.max(0, Math.floor(((ende || heute) - auf) / TAG) + 1) : 0;
      const cf = window.computeCarryForwardGesamt ? window.computeCarryForwardGesamt() : { gesamt: 0 };
      const milch = window.hpMilchDerSaison ? window.hpMilchDerSaison() : (g('milchEintraege') || {});
      const mW = v => (window.milchWert ? window.milchWert(v) : (typeof v === 'number' ? v : parseFloat(v && v.wert != null ? v.wert : v) || 0));

      // Rekord-Tag
      const proTag = {};
      Object.values(milch).forEach(e => { if(!e || !e.datum || !e.prokuh) return;
        const t = new Date(e.datum).toDateString(); let s = 0; Object.values(e.prokuh).forEach(v => s += mW(v)); proTag[t] = (proTag[t] || 0) + s; });
      const rekord = Object.entries(proTag).sort((a, b) => b[1] - a[1])[0];

      // Top-Kühe (App-Rechnung je Kuh)
      const top = Object.keys(kuehe).map(id => {
        let l = 0; try { l = window.computeCarryForwardGesamt ? window.computeCarryForwardGesamt(new Set([id])).gesamt : 0; } catch(e) {}
        return { k: kuehe[id], l };
      }).filter(x => x.l > 0).sort((a, b) => b.l - a.l).slice(0, 5);

      // Behandlungen
      const bl = Object.values(beh).filter(b => b && b.datum);
      const diag = {};
      bl.forEach(b => { const d = (b.diagnose || 'ohne Angabe').trim(); diag[d] = (diag[d] || 0) + 1; });
      const topDiag = Object.entries(diag).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const bsl = Object.values(bes);

      // Sennerei
      const wochen = (await firebase.database().ref('sennerei/wochen').once('value')).val() || {};
      let kaese = 0, butter = 0;
      Object.values(wochen).forEach(wo => Object.values((wo && wo.bauern) || {}).forEach(b => {
        kaese += parseFloat(b.kaese && b.kaese.abgeholt) || 0; butter += parseFloat(b.butter && b.butter.abgeholt) || 0; }));
      const verk = Object.values(g('sennereiVerkaeufe') || {}).filter(v => v && (!auf || v.datumTs >= auf - 30 * TAG));
      const umsatz = verk.reduce((s, v) => s + (v.summe || 0), 0);

      // Pro Bauer
      const pb = window._hpSaisonAuswerten ? window._hpSaisonAuswerten({ kuehe, sennerei: { wochen } }, si, '').proBauer : {};
      const bauernRows = Object.values(pb).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(b =>
        '<tr><td>' + esc(b.name) + '</td><td class="r">' + b.kuehe + '</td><td class="r">' + ganz(b.milch) + '</td><td class="r">' + ganz(b.verworfen) +
        '</td><td class="r">' + (b.schnitt != null ? z1(b.schnitt) : '–') + '</td><td class="r">' + z1(b.kaese) + '</td><td class="r">' + z1(b.butter) + '</td></tr>').join('');

      const kz = (label, wert) => '<div class="kz"><div class="l">' + label + '</div><div class="w">' + wert + '</div></div>';
      const html = '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/><title>Saison-Rückblick ' + esc(si.alm || '') + ' ' + esc(si.jahr || '') + '</title><style>' +
        'body{font-family:Georgia,serif;color:#222;padding:24px;max-width:900px;margin:0 auto}' +
        'h1{color:#6a4a10;border-bottom:2px solid #d4a84b;padding-bottom:8px;margin-bottom:4px}' +
        'h2{color:#8b6914;font-size:1.1rem;margin-top:22px;border-bottom:1px solid #eee;padding-bottom:4px}' +
        '.meta{color:#666;font-size:13px;margin-bottom:14px}' +
        '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}' +
        '.kz{border:1px solid #e6d3a3;border-radius:8px;padding:8px 10px;background:#fbf6ea}.kz .l{font-size:11px;color:#7a6330;text-transform:uppercase;letter-spacing:.04em}.kz .w{font-size:20px;font-weight:800;color:#3a2a05}' +
        'table{border-collapse:collapse;width:100%;font-size:12px}' +
        'th{background:#f0e0b0;text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase;color:#5a4010;border-bottom:2px solid #d4a84b}' +
        'td{padding:5px 8px;border-bottom:1px solid #eee}td.r,th.r{text-align:right}' +
        '.footer{margin-top:28px;padding-top:8px;border-top:1px solid #eee;color:#999;font-size:10px;text-align:center}' +
        '@media print{body{padding:0}h2{break-after:avoid}table{break-inside:auto}}' +
        '</style></head><body>' +
        '<h1>🏔 Saison-Rückblick ' + esc(si.alm || '') + ' ' + esc(si.jahr || '') + '</h1>' +
        '<div class="meta">Auftrieb ' + dat(auf) + ' · ' + (ende ? 'Abtrieb ' + dat(ende) : 'Stand ' + dat(heute)) + ' · ' + tage + ' Tage · erstellt ' + dat(heute) + '</div>' +
        '<h2>Kennzahlen</h2><div class="grid">' +
          kz('Milch gesamt', ganz(cf.gesamt) + ' L') +
          kz('davon verworfen', ganz(cf.verworfen) + ' L') +
          kz('Ø pro Tag', tage ? ganz(cf.gesamt / tage) + ' L' : '–') +
          kz('Molkerei', ganz(cf.molkerei) + ' L') +
          kz('Sennerei', ganz(cf.sennerei) + ' L') +
          kz('Rekordtag', rekord ? ganz(rekord[1]) + ' L · ' + dat(new Date(rekord[0]).getTime()) : '–') +
          kz('Kühe', Object.keys(kuehe).length) +
          kz('Bauern', Object.keys(pb).length) +
          kz('Behandlungen', bl.length) +
          kz('Besamungen', bsl.length + ' (' + bsl.filter(b => b.status === 'tragend').length + ' tragend)') +
          kz('Käse abgeholt', z1(kaese) + ' kg') +
          kz('Butter abgeholt', z1(butter) + ' kg') +
          (umsatz ? kz('Alm-Verkauf', eur(umsatz) + ' €') : '') +
        '</div>' +
        (top.length ? '<h2>Top-Kühe (Milch)</h2><table><thead><tr><th>Nr</th><th>Name</th><th>Bauer</th><th class="r">Liter</th></tr></thead><tbody>' +
          top.map(t => '<tr><td>#' + esc(t.k.nr) + '</td><td>' + esc(t.k.name || '–') + '</td><td>' + esc(t.k.bauer || '–') + '</td><td class="r"><b>' + ganz(t.l) + '</b></td></tr>').join('') + '</tbody></table>' : '') +
        (topDiag.length ? '<h2>Häufigste Behandlungsgründe</h2><table><tbody>' +
          topDiag.map(([d, n]) => '<tr><td>' + esc(d) + '</td><td class="r">' + n + '×</td></tr>').join('') + '</tbody></table>' : '') +
        (bauernRows ? '<h2>Pro Bauer</h2><table><thead><tr><th>Bauer</th><th class="r">Kühe</th><th class="r">Milch L</th><th class="r">verworfen L</th><th class="r">Ø L/Kuh/Tag</th><th class="r">Käse kg</th><th class="r">Butter kg</th></tr></thead><tbody>' + bauernRows + '</tbody></table>' : '') +
        '<div class="footer">HerdenPro · Engineering by LNMachinery</div>' +
        '<script>setTimeout(()=>window.print(),400);<\/script></body></html>';
      w.document.open(); w.document.write(html); w.document.close();
    } catch(e) {
      console.warn('[Rückblick]', e);
      w.document.open(); w.document.write('<p style="font-family:Georgia,serif;padding:24px;color:#a00">Fehler beim Erstellen: ' + esc(e && e.message || e) + '</p>'); w.document.close();
    }
  };
})();
