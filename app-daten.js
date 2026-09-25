// ══════════════════════════════════════════════════════════════════════════════
//  HP-DATEN (v1.0, v54.30) — Datensicherheit & Datenpflege
//   A6  Papierkorb: gelöschte Einträge 30 Tage wiederherstellbar
//   A12 Wiederherstellungspunkte: wöchentlich automatisch (Admin), 4 bleiben
//   A7  Daten-Check: Unstimmigkeiten finden (Bauer fehlt, doppelte Nr, Ohrmarke …)
//   A9  Schnell-Behandlung: häufige Behandlungen mit einem Tipp übernehmen
//   A15 Saisonstart-Vorlage: Excel mit Auswahllisten, optional mit Bauern & Kühen
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  'use strict';
  const esc = s => (window.hpEsc ? window.hpEsc(s) : String(s == null ? '' : s));
  const TAG = 86400000;
  const istAdmin = () => window._currentRole === 'admin';
  const wer = () => { const u = window._currentUser || {}; return u.name || u.email || ''; };
  const fdat = ts => { try { const d = new Date(ts); return d.toLocaleDateString('de-AT') + ' ' + d.toLocaleTimeString('de-AT', {hour:'2-digit', minute:'2-digit'}); } catch(e) { return '–'; } };
  // globale let-Variablen aus app-core (nicht alle hängen an window)
  const G = (n) => {
    switch(n) {
      case 'kuehe': return typeof kuehe !== 'undefined' ? kuehe : window.kuehe;
      case 'bauern': return typeof bauern !== 'undefined' ? bauern : window.bauern;
      case 'behandlungen': return typeof behandlungen !== 'undefined' ? behandlungen : window.behandlungen;
      case 'besamungen': return typeof besamungen !== 'undefined' ? besamungen : window.besamungen;
      case 'gruppen': return typeof gruppen !== 'undefined' ? gruppen : window.gruppen;
      case 'currentView': return typeof currentView !== 'undefined' ? currentView : window.currentView;
    }
    return window[n];
  };
  const mW = v => (window.milchWert ? window.milchWert(v) : (typeof v === 'number' ? v : parseFloat(v && v.wert != null ? v.wert : v) || 0));
  const normOm = s => String(s || '').toUpperCase().replace(/[\s\-\.]/g, '');

  // ═══ A6: PAPIERKORB ═════════════════════════════════════════════════════
  // Nur EINZELNE Einträge (Pfad/Schlüssel) — ganze Bereiche (Saison-Archivierung,
  // Wiederherstellung) laufen nicht über den Papierkorb.
  const PK_RE = new RegExp('^(' + [
    'kuehe', 'behandlungen', 'besamungen', 'milch', 'bauern', 'journal', 'kontakte', 'klauenpflege',
    'kraftfutter', 'kfLieferungen', 'aufgaben', 'kalenderTermine', 'traenkeLog', 'zellzahl', 'schalmtest',
    'almKarteWeiden', 'weiden', 'gruppen', 'milchSperren', 'saisonArchiv', 'fotos', 'zaehlVerlauf',
    'lager/artikel', 'wartung/maschinen', 'bauern/[^/]+/notizen',
    'sennerei/produktion', 'sennerei/verkaeufe', 'sennerei/wochen', 'sennerei/preisliste', 'sennerei/abholungen'
  ].join('|') + ')/[^/]+$');
  const PK_TAGE = 30;
  const PK_MAX_BYTES = 2 * 1024 * 1024;

  function pfadVon(r) {
    try { return decodeURIComponent(r.toString().substring(r.root.toString().length)).replace(/^\/+/, ''); }
    catch(e) { return ''; }
  }

  async function inPapierkorb(r, pfad) {
    try {
      const snap = await Promise.race([
        r.once('value'),
        new Promise(res => setTimeout(() => res(null), 1500))   // offline & nicht im Cache → nicht blockieren
      ]);
      const val = snap && snap.val ? snap.val() : null;
      if(val == null || (typeof val === 'object' && val.test === true)) return;          // Diagnose-Testeinträge
      if(/^milch\//.test(pfad) && (!val.prokuh || !Object.keys(val.prokuh).length)) return;   // leere Milch-Termine
      if(JSON.stringify(val).length > PK_MAX_BYTES) return;
      // nicht awaiten: offline landet der Eintrag in der Warteschlange, VOR dem Löschen
      firebase.database().ref('papierkorb').push({ pfad, daten: val, zeit: Date.now(), von: wer() })
        .catch(e => console.warn('[Papierkorb] nicht gesichert:', e && e.message));
    } catch(e) { console.warn('[Papierkorb]', e && e.message); }
  }

  (function patchRemove() {
    if(!window.firebase || !firebase.database || !firebase.database.Reference) { setTimeout(patchRemove, 100); return; }
    const P = firebase.database.Reference.prototype;
    if(P._hpPkPatched) return;
    const orig = P.remove;
    window._hpRemoveOhnePapierkorb = function(r) { return orig.call(r); };
    P.remove = function() {
      const pfad = pfadVon(this);
      if(!window._hpPkAus && PK_RE.test(pfad)) {
        const self = this, args = arguments;
        return inPapierkorb(this, pfad).then(() => orig.apply(self, args));
      }
      return orig.apply(this, arguments);
    };
    P._hpPkPatched = true;
  })();

  const PK_ART = [
    [/^kuehe\//, '🐄', 'Kuh'], [/^behandlungen\//, '⚕', 'Behandlung'], [/^besamungen\//, '🐮', 'Besamung'],
    [/^milch\//, '🥛', 'Milchwerte'], [/^bauern\/[^/]+\/notizen/, '📝', 'Bauern-Notiz'], [/^bauern\//, '👨‍🌾', 'Bauer'],
    [/^journal\//, '📓', 'Journal'], [/^kontakte\//, '📞', 'Kontakt'], [/^klauenpflege\//, '🦶', 'Klauenpflege'],
    [/^kraftfutter\//, '🌾', 'Kraftfutter'], [/^kfLieferungen\//, '🚚', 'Kraftfutter-Lieferung'], [/^aufgaben\//, '✅', 'Aufgabe'],
    [/^kalenderTermine\//, '📅', 'Termin'], [/^traenkeLog\//, '💧', 'Tränke'], [/^(zellzahl|schalmtest)\//, '🧪', 'Milchqualität'],
    [/^(almKarteWeiden|weiden)\//, '🌿', 'Weide'], [/^gruppen\//, '🏷', 'Gruppe'], [/^milchSperren\//, '⛔', 'Milchsperre'],
    [/^saisonArchiv\//, '🗂', 'Saison-Archiv'], [/^fotos\//, '📷', 'Foto'], [/^zaehlVerlauf\//, '✓', 'Zählung'],
    [/^lager\//, '📦', 'Lager-Artikel'], [/^wartung\//, '🔧', 'Maschine'], [/^sennerei\/produktion/, '🧀', 'Käse-Produktion'],
    [/^sennerei\/verkaeufe/, '💶', 'Verkauf'], [/^sennerei\/wochen/, '🧀', 'Sennerei-Woche'], [/^sennerei\//, '🧀', 'Sennerei']
  ];
  function pkBeschreibung(e) {
    const a = PK_ART.find(x => x[0].test(e.pfad || '')) || [null, '🗑', 'Eintrag'];
    const d = e.daten || {};
    const k = (G('kuehe') || {});
    let text = '';
    const kuhTxt = id => { const x = k[id]; return x ? ('#' + x.nr + (x.name ? ' ' + x.name : '')) : ''; };
    if(/^kuehe\//.test(e.pfad)) text = '#' + (d.nr || '?') + (d.name ? ' ' + d.name : '') + (d.bauer ? ' · ' + d.bauer : '');
    else if(/^behandlungen\//.test(e.pfad)) text = [kuhTxt(d.kuhId), d.medikament, d.diagnose, d.datum ? new Date(d.datum).toLocaleDateString('de-AT') : ''].filter(Boolean).join(' · ');
    else if(/^besamungen\//.test(e.pfad)) text = [kuhTxt(d.kuhId), d.datum ? new Date(d.datum).toLocaleDateString('de-AT') : ''].filter(Boolean).join(' · ');
    else if(/^milch\//.test(e.pfad)) text = (d.datum ? new Date(d.datum).toLocaleDateString('de-AT') : '') + ' ' + (d.zeit || '') + (d.prokuh ? ' · ' + Object.keys(d.prokuh).length + ' Kühe' : '');
    else text = d.name || d.titel || d.text || d.bezeichnung || d.medikament || d.produkt || d.kaeufer || (typeof d === 'string' ? d : '');
    return { icon: a[1], art: a[2], text: String(text || '').slice(0, 90) };
  }

  let _pkCache = null;
  async function pkLaden() {
    const snap = await firebase.database().ref('papierkorb').once('value');
    const alle = snap.val() || {};
    const grenze = Date.now() - PK_TAGE * TAG;
    const liste = [];
    for(const [id, e] of Object.entries(alle)) {
      if(!e || !e.pfad) continue;
      if((e.zeit || 0) < grenze) { window._hpRemoveOhnePapierkorb(firebase.database().ref('papierkorb/' + id)).catch(() => {}); continue; }
      liste.push({ id, ...e });
    }
    liste.sort((a, b) => (b.zeit || 0) - (a.zeit || 0));
    _pkCache = liste;
    return liste;
  }

  window.renderPapierkorb = function() {
    setTimeout(pkZeichnen, 0);
    return '<div class="page-header"><h2>🗑 Papierkorb</h2></div>' +
      '<p style="font-size:.8rem;color:var(--text3);margin:-.3rem 0 .7rem">Gelöschte Einträge bleiben ' + PK_TAGE + ' Tage hier und können wiederhergestellt werden.</p>' +
      '<div id="hp-pk-liste"><div class="empty-state">⏳ Lade…</div></div>';
  };
  async function pkZeichnen() {
    const box = document.getElementById('hp-pk-liste');
    if(!box) return;
    let liste;
    try { liste = await pkLaden(); }
    catch(e) { box.innerHTML = '<div class="empty-state">Papierkorb nicht erreichbar (' + esc(e.message) + ')</div>'; return; }
    if(!liste.length) { box.innerHTML = '<div class="empty-state">🗑 Der Papierkorb ist leer.</div>'; return; }
    box.innerHTML = liste.map(e => {
      const b = pkBeschreibung(e);
      const rest = Math.max(0, Math.ceil(((e.zeit || 0) + PK_TAGE * TAG - Date.now()) / TAG));
      return '<div class="list-card" style="display:flex;align-items:center;gap:.6rem;padding:.6rem .7rem">' +
        '<div style="font-size:1.4rem">' + b.icon + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:700">' + esc(b.art) + '</div>' +
          '<div style="font-size:.8rem;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(b.text || '–') + '</div>' +
          '<div style="font-size:.7rem;color:var(--text3)">gelöscht ' + esc(fdat(e.zeit)) + (e.von ? ' · ' + esc(e.von) : '') + ' · noch ' + rest + ' Tage</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:.3rem">' +
          '<button class="btn-xs" style="background:var(--green);color:#fff;border:none" onclick="hpPkWiederherstellen(\'' + esc(e.id) + '\')">↩ Zurückholen</button>' +
          (istAdmin() ? '<button class="btn-xs" style="color:var(--red)" onclick="hpPkEndgueltig(\'' + esc(e.id) + '\')">Endgültig löschen</button>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }
  window.hpPkWiederherstellen = async function(id) {
    const e = (_pkCache || []).find(x => x.id === id);
    if(!e) return;
    const b = pkBeschreibung(e);
    try {
      const vorhanden = await firebase.database().ref(e.pfad).once('value');
      if(vorhanden.exists() && !confirm(b.art + ' existiert an dieser Stelle schon wieder.\nMit dem gelöschten Stand überschreiben?')) return;
      await firebase.database().ref(e.pfad).set(e.daten);
      await window._hpRemoveOhnePapierkorb(firebase.database().ref('papierkorb/' + id));
      if(typeof showToast === 'function') showToast('↩ ' + b.art + ' wiederhergestellt'); else alert('✓ ' + b.art + ' wiederhergestellt');
      pkZeichnen();
    } catch(err) { alert('Wiederherstellen fehlgeschlagen: ' + err.message); }
  };
  window.hpPkEndgueltig = async function(id) {
    if(!istAdmin()) return;
    if(!confirm('Endgültig löschen? Das kann nicht rückgängig gemacht werden.')) return;
    await window._hpRemoveOhnePapierkorb(firebase.database().ref('papierkorb/' + id));
    pkZeichnen();
  };

  // ═══ A12: WIEDERHERSTELLUNGSPUNKTE ══════════════════════════════════════
  // Kompletter Datenstand (ohne Fotos/Chat/Benutzer/Archiv), gzip+base64, in der DB
  // unter wiederherstellung/ (nur Admin). Automatisch alle 7 Tage, die 4 neuesten bleiben.
  const WH_BASIS = ['kuehe','behandlungen','besamungen','milch','weideTage','weiden','bauern','gruppen','saison','journal','kontakte'];
  const WH_AUS = ['fotos', 'chat', 'saisonArchivDaten'];
  const WH_BEHALTEN = 4, WH_TAGE = 7, WH_CHUNK = 4 * 1024 * 1024;
  const whPfade = () => WH_BASIS.concat((window.HP_BACKUP_PFADE_ZUSATZ || []).filter(p => !WH_AUS.includes(p) && !WH_BASIS.includes(p)));

  function b64(bytes) { let s = ''; for(let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(str) { const s = atob(str); const a = new Uint8Array(s.length); for(let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  async function packen(text) {
    const roh = new TextEncoder().encode(text);
    if(typeof CompressionStream === 'undefined') return { format: 'b64', str: b64(roh) };
    const gz = await new Response(new Blob([roh]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    return { format: 'gz64', str: b64(new Uint8Array(gz)) };
  }
  async function entpacken(format, str) {
    const bytes = unb64(str);
    if(format === 'b64') return new TextDecoder().decode(bytes);
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    return new TextDecoder().decode(buf);
  }

  async function whErstellen(art) {
    if(!istAdmin()) throw new Error('Nur für Admin');
    const daten = {};
    for(const p of whPfade()) {
      const snap = await Promise.race([
        firebase.database().ref(p).once('value'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung bei ' + p)), 20000))
      ]);
      daten[p] = snap.exists() ? snap.val() : null;
    }
    const text = JSON.stringify(daten);
    const pk = await packen(text);
    const teile = {};
    for(let i = 0, n = 0; i < pk.str.length; i += WH_CHUNK, n++) teile['t' + n] = pk.str.slice(i, i + WH_CHUNK);
    const key = firebase.database().ref('wiederherstellung/meta').push().key;
    await firebase.database().ref('wiederherstellung/daten/' + key).set(teile);
    await firebase.database().ref('wiederherstellung/meta/' + key).set({
      zeit: Date.now(), art: art || 'auto', von: wer(), format: pk.format,
      groesseKB: Math.round(pk.str.length / 1024), rohKB: Math.round(text.length / 1024),
      kuehe: Object.keys(daten.kuehe || {}).length, milch: Object.keys(daten.milch || {}).length
    });
    await whAufraeumen();
    return key;
  }
  async function whMeta() {
    const s = await firebase.database().ref('wiederherstellung/meta').once('value');
    return Object.entries(s.val() || {}).map(([id, m]) => ({ id, ...m })).sort((a, b) => (b.zeit || 0) - (a.zeit || 0));
  }
  async function whAufraeumen() {
    const liste = await whMeta();
    const auto = liste.filter(m => m.art === 'auto');
    const weg = auto.slice(WH_BEHALTEN).concat(liste.filter(m => m.art !== 'auto').slice(WH_BEHALTEN));   // auch manuelle max. 4
    for(const m of weg) {
      await window._hpRemoveOhnePapierkorb(firebase.database().ref('wiederherstellung/daten/' + m.id));
      await window._hpRemoveOhnePapierkorb(firebase.database().ref('wiederherstellung/meta/' + m.id));
    }
  }
  async function whAutoPruefen() {
    try {
      if(!istAdmin() || !navigator.onLine) return;
      const heute = new Date().toISOString().slice(0, 10);
      if(localStorage.getItem('hp_wh_check') === heute) return;   // max. 1× pro Tag prüfen
      const liste = await whMeta();
      const letzte = liste.find(m => m.art === 'auto');
      localStorage.setItem('hp_wh_check', heute);
      if(letzte && Date.now() - letzte.zeit < WH_TAGE * TAG) return;
      await whErstellen('auto');
      console.log('[Wiederherstellung] automatischer Punkt erstellt');
    } catch(e) { console.warn('[Wiederherstellung] Auto:', e && e.message); }
  }
  setTimeout(function warte() {
    if(!window._currentRole) { setTimeout(warte, 5000); return; }
    setTimeout(whAutoPruefen, 20000);
  }, 5000);

  window.renderWiederherstellung = function() {
    setTimeout(whZeichnen, 0);
    return '<div class="page-header"><h2>⏪ Wiederherstellungspunkte</h2></div>' +
      '<p style="font-size:.8rem;color:var(--text3);margin:-.3rem 0 .7rem;line-height:1.5">Einmal pro Woche speichert die App automatisch den kompletten Datenstand (ohne Fotos und Chat). ' +
      'Die letzten ' + WH_BEHALTEN + ' bleiben erhalten. Beim Zurücksetzen wird vorher automatisch ein Punkt vom jetzigen Stand gemacht.</p>' +
      (istAdmin() ? '<button class="btn-primary btn-block" style="margin-bottom:.8rem" onclick="hpWhJetzt()">➕ Jetzt einen Punkt erstellen</button>' : '') +
      '<div id="hp-wh-liste"><div class="empty-state">⏳ Lade…</div></div>';
  };
  async function whZeichnen() {
    const box = document.getElementById('hp-wh-liste');
    if(!box) return;
    if(!istAdmin()) { box.innerHTML = '<div class="empty-state">Nur für Admin.</div>'; return; }
    let liste;
    try { liste = await whMeta(); } catch(e) { box.innerHTML = '<div class="empty-state">Nicht erreichbar (' + esc(e.message) + ')</div>'; return; }
    if(!liste.length) { box.innerHTML = '<div class="empty-state">Noch kein Wiederherstellungspunkt.</div>'; return; }
    const ARTEN = { auto: 'automatisch', manuell: 'von Hand', vorher: 'vor dem Zurücksetzen' };
    box.innerHTML = liste.map(m =>
      '<div class="list-card" style="display:flex;align-items:center;gap:.6rem;padding:.6rem .7rem">' +
        '<div style="flex:1">' +
          '<div style="font-weight:700">' + esc(fdat(m.zeit)) + '</div>' +
          '<div style="font-size:.75rem;color:var(--text3)">' + esc(ARTEN[m.art] || m.art) + ' · ' + (m.kuehe || 0) + ' Kühe · ' + (m.milch || 0) + ' Milch-Termine · ' + (m.groesseKB || 0) + ' KB</div>' +
        '</div>' +
        '<button class="btn-xs" style="border-color:var(--orange);color:var(--orange)" onclick="hpWhZuruecksetzen(\'' + esc(m.id) + '\')">Zurücksetzen</button>' +
      '</div>').join('');
  }
  window.hpWhJetzt = async function() {
    const box = document.getElementById('hp-wh-liste');
    if(box) box.innerHTML = '<div class="empty-state">⏳ Erstelle Punkt…</div>';
    try { await whErstellen('manuell'); } catch(e) { alert('Fehler: ' + e.message); }
    whZeichnen();
  };
  window.hpWhZuruecksetzen = async function(id) {
    if(!istAdmin()) return;
    const liste = await whMeta();
    const m = liste.find(x => x.id === id);
    if(!m) return;
    if(!confirm('Alle Daten auf den Stand vom ' + fdat(m.zeit) + ' zurücksetzen?\n\nAlles, was danach eingegeben wurde, ist dann weg (der jetzige Stand wird vorher als Punkt gesichert).')) return;
    if(!confirm('Wirklich zurücksetzen?')) return;
    const box = document.getElementById('hp-wh-liste');
    const status = t => { if(box) box.innerHTML = '<div class="empty-state">' + esc(t) + '</div>'; };
    try {
      status('⏳ Sichere jetzigen Stand…');
      await whErstellen('vorher');
      status('⏳ Lade Punkt…');
      const s = await firebase.database().ref('wiederherstellung/daten/' + id).once('value');
      const teile = s.val() || {};
      const str = Object.keys(teile).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))).map(k => teile[k]).join('');
      const daten = JSON.parse(await entpacken(m.format, str));
      status('⏳ Stelle wieder her…');
      window._hpPkAus = true;
      try {
        for(const [p, v] of Object.entries(daten)) await firebase.database().ref(p).set(v == null ? null : v);
      } finally { window._hpPkAus = false; }
      alert('✓ Daten auf den Stand vom ' + fdat(m.zeit) + ' zurückgesetzt. Die App lädt neu.');
      setTimeout(() => location.reload(), 800);
    } catch(e) { window._hpPkAus = false; alert('Fehler beim Zurücksetzen: ' + e.message); whZeichnen(); }
  };
  window._hpWh = { erstellen: whErstellen, meta: whMeta, entpacken };

  // ═══ A7: DATEN-CHECK ════════════════════════════════════════════════════
  function datenCheck() {
    const kuehe = G('kuehe') || {}, bauern = G('bauern') || {}, beh = G('behandlungen') || {}, bes = G('besamungen') || {};
    const P = [];   // {stufe:'rot'|'gelb'|'info', titel, eintraege:[{text, aktion}]}
    const kuhLink = (id, x) => ({ text: '#' + (x.nr || '?') + (x.name ? ' ' + x.name : '') + (x.bauer ? ' · ' + x.bauer : ''), aktion: "showKuhDetail('" + id + "')" });
    const oben = Object.entries(kuehe).filter(([, x]) => x && x.almStatus === 'oben');
    const bauernNamen = new Set(Object.values(bauern).map(b => String(b && b.name || '').trim()).filter(Boolean));

    // 1 Kuh ohne / mit unbekanntem Bauer
    const ohneBauer = oben.filter(([, x]) => !String(x.bauer || '').trim() || !bauernNamen.has(String(x.bauer).trim()));
    if(ohneBauer.length) P.push({ stufe: 'rot', titel: 'Kühe ohne gültigen Bauer (Milch wird niemandem zugerechnet)', eintraege: ohneBauer.map(([id, x]) => kuhLink(id, x)) });

    // 2 doppelte Kuhnummern (auf der Alm)
    const nrMap = {};
    oben.forEach(([id, x]) => { const n = String(x.nr || '').trim(); if(n) (nrMap[n] = nrMap[n] || []).push([id, x]); });
    const dupNr = Object.values(nrMap).filter(l => l.length > 1).flat();
    if(dupNr.length) P.push({ stufe: 'rot', titel: 'Doppelte Kuhnummern auf der Alm', eintraege: dupNr.map(([id, x]) => kuhLink(id, x)) });

    // 3 doppelte Ohrmarken (alle Kühe)
    const omMap = {};
    Object.entries(kuehe).forEach(([id, x]) => { const o = normOm(x && x.ohrmarke); if(o) (omMap[o] = omMap[o] || []).push([id, x]); });
    const dupOm = Object.values(omMap).filter(l => l.length > 1).flat();
    if(dupOm.length) P.push({ stufe: 'rot', titel: 'Gleiche Ohrmarke bei mehreren Kühen', eintraege: dupOm.map(([id, x]) => kuhLink(id, x)) });

    // 4 Ohrmarke fehlt / falsches Format
    const omFehlt = oben.filter(([, x]) => !normOm(x.ohrmarke));
    const omFalsch = oben.filter(([, x]) => normOm(x.ohrmarke) && !/^AT\d{9}$/.test(normOm(x.ohrmarke)));
    if(omFehlt.length) P.push({ stufe: 'gelb', titel: 'Ohrmarke fehlt (Bestandsbuch!)', eintraege: omFehlt.map(([id, x]) => kuhLink(id, x)) });
    if(omFalsch.length) P.push({ stufe: 'gelb', titel: 'Ohrmarke nicht im Format AT 12 3456 789', eintraege: omFalsch.map(([id, x]) => ({ ...kuhLink(id, x), text: kuhLink(id, x).text + ' · ' + x.ohrmarke })) });

    // 5 verwaiste Behandlungen/Besamungen
    const verwBeh = Object.entries(beh).filter(([, b]) => b && b.kuhId && !kuehe[b.kuhId]);
    const verwBes = Object.entries(bes).filter(([, b]) => b && b.kuhId && !kuehe[b.kuhId]);
    if(verwBeh.length || verwBes.length) P.push({ stufe: 'gelb', titel: 'Einträge zu gelöschten Kühen', eintraege: [
      verwBeh.length ? { text: verwBeh.length + ' Behandlung(en) ohne Kuh → in den Papierkorb', aktion: "hpCheckAufraeumen('behandlungen')" } : null,
      verwBes.length ? { text: verwBes.length + ' Besamung(en) ohne Kuh → in den Papierkorb', aktion: "hpCheckAufraeumen('besamungen')" } : null
    ].filter(Boolean) });

    // 6 unplausible Milchwerte (laufende Saison)
    const milch = window.hpMilchDerSaison ? window.hpMilchDerSaison() : (window.milchEintraege || {});
    const komisch = [];
    Object.values(milch).forEach(e => {
      if(!e || !e.prokuh) return;
      for(const [kid, v] of Object.entries(e.prokuh)) {
        const l = mW(v);
        if(l < 0 || l > 35) {
          const x = kuehe[kid] || {};
          komisch.push({ text: new Date(e.datum).toLocaleDateString('de-AT') + ' ' + (e.zeit || '') + ' · #' + (x.nr || '?') + ' · ' + String(l).replace('.', ',') + ' L', aktion: kuehe[kid] ? "showKuhDetail('" + kid + "')" : '' });
        }
      }
    });
    if(komisch.length) P.push({ stufe: 'gelb', titel: 'Unwahrscheinliche Milchwerte (unter 0 oder über 35 L pro Melkung)', eintraege: komisch.slice(0, 40) });

    // 7 melkende Kuh oben ohne Wert in den letzten 3 Tagen (nur wenn überhaupt gemessen wurde)
    const seit = Date.now() - 3 * TAG;
    const letzte = Object.values(milch).filter(e => e && e.datum >= seit && e.prokuh);
    if(letzte.length >= 2) {
      const mitWert = new Set();
      letzte.forEach(e => Object.keys(e.prokuh).forEach(k => mitWert.add(k)));
      const fehlt = oben.filter(([id, x]) => {
        const l = String(x.laktation || '').toLowerCase();
        return l !== 'trocken' && l !== 'trockengestellt' && !mitWert.has(id) && !(x.createdAt && x.createdAt > seit);
      });
      if(fehlt.length) P.push({ stufe: 'info', titel: 'Melkende Kühe ohne Milchwert in den letzten 3 Tagen (trocken? krank? vergessen?)', eintraege: fehlt.map(([id, x]) => kuhLink(id, x)) });
    }

    // 8 Anzahl pro Bauer stimmt nicht
    const istPro = {};
    oben.forEach(([, x]) => { const b = String(x.bauer || '').trim(); if(b) istPro[b] = (istPro[b] || 0) + 1; });
    const anzahlFalsch = Object.entries(bauern).filter(([, b]) => b && b.name && b.anzahl && (istPro[b.name] || 0) !== b.anzahl);
    if(anzahlFalsch.length) P.push({ stufe: 'info', titel: 'Angemeldete Anzahl ≠ Kühe auf der Alm', eintraege: anzahlFalsch.map(([id, b]) => ({ text: b.name + ': angemeldet ' + b.anzahl + ', auf der Alm ' + (istPro[b.name] || 0), aktion: typeof window.showBauerPopup === 'function' ? "showBauerPopup('" + id + "')" : '' })) });

    // 9 aktive Behandlungen, deren Wartezeit schon lange vorbei ist
    const alt = Object.entries(beh).filter(([, b]) => b && b.aktiv && kuehe[b.kuhId] && (b.wartezeitEnde || b.wzMilchEnde) && Math.max(b.wzMilchEnde || 0, b.wzFleischEnde || 0, b.wartezeitEnde || 0) < Date.now() - 14 * TAG);
    if(alt.length) P.push({ stufe: 'info', titel: 'Behandlungen noch „aktiv", Wartezeit seit über 14 Tagen vorbei', eintraege: alt.map(([, b]) => ({ ...kuhLink(b.kuhId, kuehe[b.kuhId]), text: kuhLink(b.kuhId, kuehe[b.kuhId]).text + ' · ' + (b.medikament || 'Behandlung') })) });

    return P;
  }
  window.hpDatenCheck = datenCheck;
  window.renderDatenCheck = function() {
    const P = datenCheck();
    const FARBE = { rot: 'var(--red)', gelb: 'var(--orange)', info: 'var(--blue)' };
    const ICON = { rot: '⛔', gelb: '⚠', info: 'ℹ' };
    const n = s => P.filter(p => p.stufe === s).reduce((a, p) => a + p.eintraege.length, 0);
    return '<div class="page-header"><h2>🩺 Daten-Check</h2><button class="btn-xs" onclick="render()">↻ Neu prüfen</button></div>' +
      (P.length
        ? '<div style="display:flex;gap:.4rem;margin-bottom:.7rem;font-size:.78rem;flex-wrap:wrap">' +
            '<span style="color:var(--red);font-weight:700">⛔ ' + n('rot') + ' Fehler</span>' +
            '<span style="color:var(--orange);font-weight:700">⚠ ' + n('gelb') + ' Warnungen</span>' +
            '<span style="color:var(--blue);font-weight:700">ℹ ' + n('info') + ' Hinweise</span></div>' +
          P.map(p =>
            '<div class="card-section" style="border-left:4px solid ' + FARBE[p.stufe] + ';margin-bottom:.6rem">' +
              '<div style="font-weight:700;color:' + FARBE[p.stufe] + ';margin-bottom:.35rem">' + ICON[p.stufe] + ' ' + esc(p.titel) + ' (' + p.eintraege.length + ')</div>' +
              p.eintraege.map(e => '<div style="padding:.3rem 0;border-top:1px solid var(--border);font-size:.85rem;display:flex;align-items:center;gap:.4rem' + (e.aktion ? ';cursor:pointer' : '') + '"' +
                (e.aktion ? ' onclick="' + esc(e.aktion) + '"' : '') + '><span style="flex:1">' + esc(e.text) + '</span>' + (e.aktion ? '<span style="color:var(--text3)">›</span>' : '') + '</div>').join('') +
            '</div>').join('')
        : '<div class="card-section" style="text-align:center;padding:1.5rem"><div style="font-size:2rem">✅</div><div style="font-weight:700;margin-top:.3rem">Alles in Ordnung</div><div style="font-size:.8rem;color:var(--text3)">Keine Unstimmigkeiten gefunden.</div></div>');
  };
  window.hpCheckAufraeumen = async function(bereich) {
    const kuehe = G('kuehe') || {};
    const quelle = bereich === 'besamungen' ? (G('besamungen') || {}) : (G('behandlungen') || {});
    const ids = Object.entries(quelle).filter(([, b]) => b && b.kuhId && !kuehe[b.kuhId]).map(([id]) => id);
    if(!ids.length || !confirm(ids.length + ' Einträge ohne Kuh in den Papierkorb verschieben?\n(30 Tage wiederherstellbar)')) return;
    for(const id of ids) await firebase.database().ref(bereich + '/' + id).remove();
    setTimeout(() => render(), 500);
  };

  // ═══ Einstiege: Karte oben im Backup-Menü ═══════════════════════════════
  function sicherheitsKarte() {
    if(G('currentView') !== 'backup') return;
    const mc = document.getElementById('main-content');
    if(!mc || document.getElementById('hp-daten-karte')) return;
    const kopf = mc.querySelector('.page-header');
    const box = document.createElement('div');
    box.id = 'hp-daten-karte';
    box.className = 'card-section';
    box.style.cssText = 'margin-bottom:.8rem;border-color:var(--green)';
    box.innerHTML = '<div class="section-label" style="margin-bottom:.5rem">🛡 DATEN-SICHERHEIT</div>' +
      '<div style="display:flex;flex-direction:column;gap:.45rem">' +
        '<button class="btn-secondary" onclick="navigate(\'datencheck\')">🩺 Daten-Check</button>' +
        '<button class="btn-secondary" onclick="navigate(\'papierkorb\')">🗑 Papierkorb (30 Tage)</button>' +
        (istAdmin() ? '<button class="btn-secondary" onclick="navigate(\'wiederherstellung\')">⏪ Wiederherstellungspunkte</button>' : '') +
      '</div>';
    if(kopf && kopf.nextSibling) mc.insertBefore(box, kopf.nextSibling); else mc.insertBefore(box, mc.firstChild);
  }
  (function hookNavigate() {
    const orig = window.navigate;
    if(!orig) { setTimeout(hookNavigate, 200); return; }
    if(orig._hpDatenHooked) return;
    window.navigate = function() { const r = orig.apply(this, arguments); setTimeout(sicherheitsKarte, 320); return r; };
    window.navigate._hpDatenHooked = true;
    for(const k in orig) if(!(k in window.navigate)) try { window.navigate[k] = orig[k]; } catch(e) {}
  })();

  // ═══ A9: SCHNELL-BEHANDLUNG ═════════════════════════════════════════════
  function vorlagen() {
    const beh = G('behandlungen') || {};
    const m = {};
    Object.values(beh).forEach(b => {
      const med = String(b && b.medikament || '').trim();
      if(!med) return;
      const v = { medikament: med, dosis: String(b.dosis || '').trim(), diagnose: String(b.diagnose || '').trim(),
        wzMilchTage: b.wzMilchTage || 0, wzFleischTage: b.wzFleischTage || 0, behandler: b.behandler || 'personal', medizinQuelle: b.medizinQuelle || 'alm' };
      const key = [v.medikament.toLowerCase(), v.dosis.toLowerCase(), v.wzMilchTage, v.wzFleischTage].join('|');
      if(!m[key]) m[key] = { ...v, n: 0, zuletzt: 0 };
      m[key].n++;
      if((b.datum || 0) > m[key].zuletzt) { m[key].zuletzt = b.datum || 0; m[key].diagnose = v.diagnose || m[key].diagnose; m[key].behandler = v.behandler; m[key].medizinQuelle = v.medizinQuelle; }
    });
    return Object.values(m).sort((a, b) => b.n - a.n || b.zuletzt - a.zuletzt).slice(0, 6);
  }
  function setVal(id, v) { const el = document.getElementById(id); if(el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } }
  window.hpSchnellBeh = function(i) {
    const v = (window._hpVorlagen || [])[i];
    if(!v) return;
    setVal('b-medikament', v.medikament);
    setVal('b-dosis', v.dosis);
    const dg = document.getElementById('b-diagnose'); if(dg && !dg.value.trim() && v.diagnose) dg.value = v.diagnose;
    setVal('b-wz-milch-tage', v.wzMilchTage || '');
    setVal('b-wz-fleisch-tage', v.wzFleischTage || '');
    ['b-wz-milch-ts', 'b-wz-fleisch-ts'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    if(typeof window.setBehBehandler === 'function') window.setBehBehandler(v.behandler, document.getElementById(v.behandler === 'tierarzt' ? 'b-btn-tierarzt' : 'b-btn-personal'));
    if(typeof window.setMedizinQuelle === 'function') window.setMedizinQuelle(v.medizinQuelle, document.getElementById(v.medizinQuelle === 'bauer' ? 'b-med-bauer' : 'b-med-alm'));
    const sugg = document.getElementById('b-med-suggestions'); if(sugg) sugg.style.display = 'none';
    if(typeof window.berechneWartezeiten === 'function') window.berechneWartezeiten();
    document.querySelectorAll('.hp-schnell-chip').forEach((c, j) => { c.style.background = j === i ? 'var(--gold)' : 'var(--bg3)'; c.style.color = j === i ? '#000' : 'var(--text)'; });
  };
  (function hookForm() {
    const orig = window.showBehandlungForm;
    if(!orig) { setTimeout(hookForm, 200); return; }
    if(orig._hpSchnell) return;
    window.showBehandlungForm = function(kuhId, editBId, editData) {
      const r = orig.apply(this, arguments);
      try {
        if(editBId) return r;
        const liste = vorlagen();
        window._hpVorlagen = liste;
        const datum = document.getElementById('b-datum');
        if(!liste.length || !datum || document.getElementById('hp-schnell-beh')) return r;
        const zeile = datum.parentElement;                       // Grid mit Datum + Zeit
        const anker = (zeile.previousElementSibling && zeile.previousElementSibling.tagName === 'LABEL') ? zeile.previousElementSibling : zeile;
        const box = document.createElement('div');
        box.id = 'hp-schnell-beh';
        box.style.cssText = 'margin:.2rem 0 .6rem';
        box.innerHTML = '<div style="font-size:.72rem;color:var(--text3);font-weight:700;margin-bottom:.3rem">⚡ SCHNELL: HÄUFIGE BEHANDLUNGEN</div>' +
          '<div style="display:flex;gap:.35rem;overflow-x:auto;padding-bottom:.2rem">' +
          liste.map((v, i) => '<button type="button" class="hp-schnell-chip" onclick="hpSchnellBeh(' + i + ')" style="flex:0 0 auto;border:1.5px solid var(--gold2);background:var(--bg3);color:var(--text);border-radius:10px;padding:.35rem .6rem;font-size:.78rem;text-align:left;cursor:pointer;line-height:1.25">' +
            '<b>' + esc(v.medikament) + '</b>' + (v.dosis ? ' · ' + esc(v.dosis) : '') +
            '<br><span style="font-size:.68rem;opacity:.8">WZ ' + (v.wzMilchTage || 0) + ' / ' + (v.wzFleischTage || 0) + ' Tage · ' + v.n + '×</span></button>').join('') +
          '</div>';
        anker.parentElement.insertBefore(box, anker);
      } catch(e) { console.warn('[Schnell-Behandlung]', e); }
      return r;
    };
    window.showBehandlungForm._hpSchnell = true;
  })();

  // ═══ A15: SAISONSTART-VORLAGE (Excel mit Auswahllisten) ══════════════════
  function ladeExcelJS() {
    if(window.ExcelJS) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'lib/exceljs.min.js';
      s.onload = res; s.onerror = () => rej(new Error('Excel-Bibliothek nicht ladbar (Internet?)'));
      document.head.appendChild(s);
    });
  }
  window.hpSaisonVorlage = async function(mitDaten) {
    const st = document.getElementById('saisonstart-status');
    if(st) st.innerHTML = '⏳ Erstelle Vorlage…';
    try {
      await ladeExcelJS();
      const bauern = G('bauern') || {}, kuehe = G('kuehe') || {}, gruppen = G('gruppen') || {};
      const wb = new ExcelJS.Workbook();
      wb.creator = 'HerdenPro';
      const ws = wb.addWorksheet('Saisonstart', { views: [{ state: 'frozen', ySplit: 4 }] });
      const li = wb.addWorksheet('Listen', { state: 'hidden' });
      const bauernNamen = [...new Set(Object.values(bauern).map(b => String(b && b.name || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
      const gruppenNamen = [...new Set(Object.values(gruppen).map(g => String(g && g.name || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
      li.getCell('A1').value = 'Bauern'; bauernNamen.forEach((n, i) => li.getCell('A' + (i + 2)).value = n);
      li.getCell('B1').value = 'Gruppen'; gruppenNamen.forEach((n, i) => li.getCell('B' + (i + 2)).value = n);
      li.getCell('C1').value = 'JA/NEIN'; li.getCell('C2').value = 'JA'; li.getCell('C3').value = 'NEIN';

      ws.columns = [26, 11, 8, 11, 11, 28, 18, 11, 16, 22, 24, 15].map(w => ({ width: w }));
      ws.mergeCells('A1:L1'); ws.getCell('A1').value = '🐄 HerdenPro – Saisonstart-Erfassung ' + new Date().getFullYear();
      ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF2E5E1E' } };
      ws.mergeCells('A2:L2');
      ws.getCell('A2').value = 'Eine Zeile pro Kuh. Grüne Spalten (Bauer) nur beim ERSTEN Eintrag eines Bauern ausfüllen, darunter leer lassen. Gelbe Spalten für jede Kuh. Ohrmarke: AT 12 3456 789. Mehrere Gruppen mit Komma trennen.';
      ws.getCell('A2').alignment = { wrapText: true, vertical: 'top' }; ws.getRow(2).height = 32;
      ws.getCell('A2').font = { size: 9, italic: true };
      ws.mergeCells('A3:F3'); ws.getCell('A3').value = '👨‍🌾 BAUER (nur beim ersten Eintrag)';
      ws.mergeCells('G3:L3'); ws.getCell('G3').value = '🐄 KUH (jede Zeile)';
      const GRUEN = 'FFD9EAD3', GELB = 'FFFFF2CC';
      ['A3', 'G3'].forEach((c, i) => { const z = ws.getCell(c); z.font = { bold: true }; z.alignment = { horizontal: 'center' }; z.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i ? GELB : GRUEN } }; });
      const kopf = ['Bauer', 'Anzahl Kühe', 'BIO', 'Verkauf % Butter', 'Verkauf % Käse', 'Adresse', 'Ohrmarke', 'Kuhnummer', 'Name der Kuh', 'Gruppe(n)', 'Notiz', 'Besamungsdatum'];
      const r4 = ws.getRow(4); kopf.forEach((t, i) => { const c = r4.getCell(i + 1); c.value = t; c.font = { bold: true }; c.alignment = { wrapText: true, vertical: 'middle' };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i < 6 ? GRUEN : GELB } }; c.border = { bottom: { style: 'medium' } }; });
      r4.height = 30;

      // Vorbefüllen: pro Bauer seine Kühe (die heuer auf der Alm waren)
      let zeile = 5;
      if(mitDaten) {
        const proBauer = {};
        Object.values(kuehe).forEach(k => { if(!k) return; const b = String(k.bauer || '').trim(); if(b) (proBauer[b] = proBauer[b] || []).push(k); });
        const namen = [...new Set(bauernNamen.concat(Object.keys(proBauer)))].sort((a, b) => a.localeCompare(b, 'de'));
        for(const name of namen) {
          const b = Object.values(bauern).find(x => x && String(x.name || '').trim() === name) || {};
          const liste = (proBauer[name] || []).sort((a, c) => (parseInt(a.nr) || 0) - (parseInt(c.nr) || 0));
          const kopfZeile = [name, liste.length || b.anzahl || '', b.bio ? 'JA' : 'NEIN', b.verkButter != null ? b.verkButter : '', b.verkKase != null ? b.verkKase : '', b.adresse || ''];
          if(!liste.length) { ws.getRow(zeile++).values = kopfZeile; continue; }
          liste.forEach((k, i) => {
            const nr = parseInt(k.nr);
            ws.getRow(zeile++).values = (i === 0 ? kopfZeile : ['', '', '', '', '', ''])
              .concat([k.ohrmarke || '', isNaN(nr) ? (k.nr || '') : nr, k.name || '', k.gruppe || '', k.notiz || '', '']);
          });
        }
      }
      const bis = Math.max(zeile + 60, 200);
      for(let r = 5; r <= bis; r++) {
        for(let c = 1; c <= 12; c++) ws.getRow(r).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c <= 6 ? 'FFF3F9F0' : 'FFFFFBEA' } };
        ws.getCell('L' + r).numFmt = 'dd.mm.yyyy';
      }
      const dv = (bereich, def) => { for(let r = 5; r <= bis; r++) ws.getCell(bereich + r).dataValidation = def; };
      if(bauernNamen.length) dv('A', { type: 'list', allowBlank: true, formulae: ['Listen!$A$2:$A$' + (bauernNamen.length + 1)], showErrorMessage: true, errorStyle: 'information', errorTitle: 'Neuer Bauer?', error: 'Dieser Name ist noch nicht in der App – er wird beim Import neu angelegt.' });
      dv('B', { type: 'whole', operator: 'between', allowBlank: true, formulae: [1, 300], showErrorMessage: true, errorTitle: 'Ungültig', error: 'Bitte ganze Zahl 1–300' });
      dv('C', { type: 'list', allowBlank: true, formulae: ['Listen!$C$2:$C$3'], showErrorMessage: true, errorTitle: 'Nur JA/NEIN', error: 'Bitte JA oder NEIN wählen' });
      dv('D', { type: 'whole', operator: 'between', allowBlank: true, formulae: [0, 100], showErrorMessage: true, errorTitle: 'Ungültig', error: 'Bitte 0–100 (Prozent)' });
      dv('E', { type: 'whole', operator: 'between', allowBlank: true, formulae: [0, 100], showErrorMessage: true, errorTitle: 'Ungültig', error: 'Bitte 0–100 (Prozent)' });
      dv('G', { type: 'textLength', operator: 'between', allowBlank: true, formulae: [11, 16], showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Ohrmarke prüfen', error: 'Format: AT 12 3456 789' });
      dv('H', { type: 'whole', operator: 'between', allowBlank: true, formulae: [1, 99999], showErrorMessage: true, errorTitle: 'Kuhnummer', error: 'Bitte eine Zahl eingeben' });
      if(gruppenNamen.length) dv('J', { type: 'list', allowBlank: true, formulae: ['Listen!$B$2:$B$' + (gruppenNamen.length + 1)], showErrorMessage: true, errorStyle: 'information', errorTitle: 'Gruppe', error: 'Neue Gruppe oder mehrere Gruppen mit Komma? Passt – wird beim Import angelegt.' });
      dv('L', { type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [new Date(2000, 0, 1)], showErrorMessage: true, errorTitle: 'Datum', error: 'Bitte ein Datum eingeben (TT.MM.JJJJ)' });

      const an = wb.addWorksheet('Anleitung');
      an.getColumn(1).width = 110;
      ['📖 Anleitung – Saisonstart-Erfassung', '',
       '1. Im Blatt „Saisonstart" ab Zeile 5 eintragen – eine Zeile pro Kuh.',
       '2. Bauer-Spalten (grün) nur in der ersten Zeile eines Bauern ausfüllen; die Kühe darunter gehören automatisch dazu.',
       '3. BIO, Bauer und Gruppe haben Auswahllisten (Pfeil rechts in der Zelle). Neue Bauern/Gruppen darf man einfach hineinschreiben.',
       '4. Ohrmarke im Format AT 12 3456 789 – die App prüft und vereinheitlicht beim Import.',
       '5. Kuhnummer ist Pflicht. Besamungsdatum optional (daraus wird der Abkalbetermin berechnet).',
       '6. Kühe, die heuer nicht mehr kommen: Zeile löschen. Neue Kühe: Zeile einfügen.',
       '7. In der App: Backup → Saisonstart Excel importieren. Danach zeigt die App, ob die Anzahl pro Bauer passt.',
       '', 'Hinweis: Diese Datei enthält Namen und Adressen – bitte nicht öffentlich weitergeben.'
      ].forEach((t, i) => { const c = an.getCell('A' + (i + 1)); c.value = t; if(i === 0) c.font = { bold: true, size: 14 }; c.alignment = { wrapText: true }; });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Saisonstart_Vorlage_' + new Date().getFullYear() + (mitDaten ? '_mit_Daten' : '') + '.xlsx';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      if(st) st.innerHTML = '✓ Vorlage erstellt' + (mitDaten ? ' (' + (zeile - 5) + ' Zeilen vorbefüllt)' : '');
      window._hpLetzteVorlage = { zeilen: zeile - 5, bytes: buf.byteLength };
    } catch(e) {
      if(st) st.innerHTML = '✗ ' + esc(e.message);
      alert('Vorlage konnte nicht erstellt werden: ' + e.message);
    }
  };

  // ═══ A14: SELBSTTEST ════════════════════════════════════════════════════
  // Für jeden Benutzer (AA-Menü oben rechts): prüft Version, Module, Verbindung,
  // Rechte, Uhrzeit, Offline-Speicher, wartende Werte. Bericht kann kopiert werden.
  const zeitlimit = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('keine Antwort (' + ms / 1000 + ' s)')), ms))]);
  async function selbsttest(melde) {
    const E = [];
    const add = (s, titel, info) => { E.push({ s, titel, info: info || '' }); if(melde) melde(E); };
    // 1 Version
    const v = localStorage.getItem('hp_version') || '?';
    add('ok', 'App-Version', v);
    // 2 Module & Bibliotheken
    const mods = { 'Sicherheit': window.hpEsc, 'Milch': window.pushMilchWert, 'Sennerei': window.renderSennerei, 'Saison-Archiv': window.hpSaisonArchivieren,
      'Extras': window.hpSonnenmodus, 'Daten': window.hpDatenCheck, 'Suche': window.hpSuche, 'Excel': window.ExcelJS,
      'Karte': window.L, 'QR': window.jsQR, 'PDF': window.pdfjsLib, 'Bild': window.html2canvas, 'Icons': window.customElements && customElements.get('iconify-icon') };
    const fehlt = Object.entries(mods).filter(([, f]) => !f).map(([n]) => n);
    add(fehlt.length ? 'err' : 'ok', 'Programmteile', fehlt.length ? 'fehlen: ' + fehlt.join(', ') : Object.keys(mods).length + ' geladen');
    // 3 Internet & Datenbank
    add(navigator.onLine ? 'ok' : 'warn', 'Internet', navigator.onLine ? 'verbunden' : 'offline – Eingaben werden gespeichert und später übertragen');
    let verbunden = false;
    try { verbunden = (await zeitlimit(firebase.database().ref('.info/connected').once('value'), 5000)).val() === true; } catch(e) {}
    add(verbunden ? 'ok' : (navigator.onLine ? 'err' : 'warn'), 'Datenbank', verbunden ? 'verbunden (' + ((firebase.app().options || {}).projectId || '') + ')' : 'nicht verbunden');
    // 4 Anmeldung
    const u = firebase.auth && firebase.auth().currentUser;
    add(u ? 'ok' : 'err', 'Anmeldung', u ? (u.email || 'angemeldet') + ' · Rolle: ' + (window._currentRole || '?') : 'nicht angemeldet');
    // 5 Lesen & Schreiben
    if(verbunden && u) {
      try { await zeitlimit(firebase.database().ref('kuehe').limitToFirst(1).once('value'), 8000); add('ok', 'Daten lesen', 'erlaubt'); }
      catch(e) { add('err', 'Daten lesen', e.message); }
      try {
        const r = firebase.database().ref('papierkorb/__selbsttest_' + u.uid);
        await zeitlimit(r.set({ zeit: Date.now(), pfad: '__selbsttest' }), 8000);
        await zeitlimit(window._hpRemoveOhnePapierkorb(r), 8000);
        add('ok', 'Daten schreiben', 'erlaubt');
      } catch(e) { add(/permission/i.test(e.message) ? 'warn' : 'err', 'Daten schreiben', /permission/i.test(e.message) ? 'Test-Bereich gesperrt – Firebase-Regeln neu veröffentlichen' : e.message); }
      try {
        const off = (await zeitlimit(firebase.database().ref('.info/serverTimeOffset').once('value'), 5000)).val() || 0;
        const min = Math.round(Math.abs(off) / 60000);
        add(min >= 5 ? 'err' : 'ok', 'Uhrzeit am Gerät', min >= 5 ? 'weicht ' + min + ' Minuten ab – bitte Datum/Uhrzeit im Handy auf automatisch stellen' : 'stimmt');
      } catch(e) {}
    }
    // 6 wartende Milchwerte & Konflikte
    try {
      const pid = (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.projectId) || 'default';
      const p = JSON.parse(localStorage.getItem('milchPendingV2:' + pid) || '{}');
      let n = 0; for(const k in p) n += Object.keys(p[k] || {}).length;
      const kf = JSON.parse(localStorage.getItem('milchKonflikteV2:' + pid) || '[]');
      const nk = Array.isArray(kf) ? kf.length : Object.keys(kf || {}).length;
      add(n ? 'warn' : 'ok', 'Wartende Milchwerte', n ? n + ' noch nicht übertragen' : 'keine');
      if(nk) add('warn', 'Milch-Konflikte', nk + ' offen');
    } catch(e) {}
    // 7 Offline-Speicher
    try {
      const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
      const keys = await caches.keys();
      const scope = (navigator.serviceWorker && (await navigator.serviceWorker.getRegistration()) || {}).scope || location.href;
      const appId = new URL(scope).pathname.replace(/\W+/g, '_');
      const eigen = keys.filter(k => k.endsWith(appId));
      let dateien = 0; for(const k of eigen) dateien += (await (await caches.open(k)).keys()).length;
      add(sw && dateien > 20 ? 'ok' : 'warn', 'Offline-Betrieb', (sw ? 'aktiv' : 'Service Worker fehlt') + ' · ' + dateien + ' Dateien gespeichert');
    } catch(e) { add('warn', 'Offline-Betrieb', e.message); }
    try {
      if(navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        const frei = (est.quota - est.usage) / 1048576;
        add(frei < 50 ? 'warn' : 'ok', 'Speicherplatz', Math.round(est.usage / 1048576) + ' MB belegt' + (frei < 50 ? ' – Handy fast voll' : ''));
      }
    } catch(e) {}
    // 8 Daten-Check
    try {
      const P = datenCheck();
      const rot = P.filter(p => p.stufe === 'rot').reduce((a, p) => a + p.eintraege.length, 0);
      add(rot ? 'warn' : 'ok', 'Daten-Check', rot ? rot + ' Fehler in den Daten (Backup → Daten-Check)' : 'keine Fehler');
    } catch(e) {}
    add('ok', 'Gerät', (navigator.userAgent.match(/Android [\d.]+|iPhone OS [\d_]+|Windows NT [\d.]+|Mac OS X [\d_]+/) || ['?'])[0] + ' · ' + screen.width + '×' + screen.height);
    return E;
  }
  window.hpSelbsttest = selbsttest;
  window.hpSelbsttestZeigen = async function() {
    document.getElementById('schrift-popup') && (document.getElementById('schrift-popup').style.display = 'none');
    document.getElementById('hp-selbsttest')?.remove();
    const ov = document.createElement('div');
    ov.id = 'hp-selbsttest';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99500;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:1rem';
    ov.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--gold2);border-radius:14px;max-width:440px;width:100%;max-height:88vh;overflow:auto;padding:1rem 1.1rem">' +
      '<div style="font-family:Georgia,serif;color:var(--gold);font-size:1.2rem;font-weight:700;margin-bottom:.5rem">🧪 Selbsttest</div>' +
      '<div id="hp-st-liste" style="font-size:.86rem">⏳ Prüfe…</div>' +
      '<div style="display:flex;gap:.5rem;margin-top:.9rem"><button class="btn-secondary" style="flex:1" id="hp-st-kopie">📋 Bericht kopieren</button>' +
      '<button class="btn-primary" style="flex:1" onclick="document.getElementById(\'hp-selbsttest\').remove()">Schließen</button></div></div>';
    ov.addEventListener('click', e => { if(e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    const SYM = { ok: ['✓', 'var(--green)'], warn: ['⚠', 'var(--orange)'], err: ['✗', 'var(--red)'] };
    const zeichne = E => { const l = document.getElementById('hp-st-liste'); if(!l) return;
      l.innerHTML = E.map(e => '<div style="display:flex;gap:.5rem;padding:.35rem 0;border-bottom:1px solid var(--border)"><b style="color:' + SYM[e.s][1] + ';width:1rem">' + SYM[e.s][0] + '</b>' +
        '<div style="flex:1"><b>' + esc(e.titel) + '</b><div style="font-size:.76rem;color:var(--text3)">' + esc(e.info) + '</div></div></div>').join(''); };
    const E = await selbsttest(zeichne);
    zeichne(E);
    const fehler = E.filter(e => e.s === 'err').length, warn = E.filter(e => e.s === 'warn').length;
    const l = document.getElementById('hp-st-liste');
    if(l) l.insertAdjacentHTML('afterbegin', '<div style="font-weight:700;margin-bottom:.4rem;color:' + (fehler ? 'var(--red)' : warn ? 'var(--orange)' : 'var(--green)') + '">' +
      (fehler ? fehler + ' Problem(e) gefunden' : warn ? 'Läuft, mit ' + warn + ' Hinweis(en)' : 'Alles in Ordnung ✓') + '</div>');
    const btn = document.getElementById('hp-st-kopie');
    if(btn) btn.onclick = async () => {
      const txt = 'HerdenPro Selbsttest ' + new Date().toLocaleString('de-AT') + '\n' + E.map(e => SYM[e.s][0] + ' ' + e.titel + ': ' + e.info).join('\n');
      try { await navigator.clipboard.writeText(txt); btn.textContent = '✓ Kopiert'; } catch(e) { prompt('Bericht:', txt); }
    };
  };
  (function stKnopf() {
    const pop = document.getElementById('schrift-popup');
    if(!pop) { setTimeout(stKnopf, 1000); return; }
    if(document.getElementById('hp-st-btn')) return;
    const b = document.createElement('button');
    b.id = 'hp-st-btn'; b.type = 'button';
    b.textContent = '🧪 Selbsttest';
    b.style.cssText = 'display:block;width:100%;margin-top:.5rem;padding:.55rem;border-radius:8px;border:1.5px solid var(--border2);background:var(--bg3);color:var(--text);font-weight:700;cursor:pointer';
    b.onclick = e => { e.stopPropagation(); window.hpSelbsttestZeigen(); };
    pop.appendChild(b);
  })();

  console.log('[HP-Daten] geladen');
})();
