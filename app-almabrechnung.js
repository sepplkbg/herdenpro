// ══════════════════════════════════════════════════════════════════════════════
// HerdenPro – Austausch mit der Almabrechnung (Excel) + Butter-Etiketten
// Engineering by LNMachinery  ·  v1.1 (HerdenPro v54.60)
// ──────────────────────────────────────────────────────────────────────────────
//  1. (entfallen in v1.1: Bauern & Kühe aus Excel kommen über den
//     Saisonstart-Import – die Almabrechnung enthält ein Blatt "Saisonstart")
//  2. hpKuhNrVorschlag(trocken)  nächste freie Kuh-Nummer
//       Melkkühe 1, 2, 3 … lückenlos, trockene ab "trockenStartNr" (Vorgabe 200)
//  3. Butter-Etiketten bei Sennerei → Produktion
//       Anzahl = Butter-kg ÷ Klotzgewicht, Charge aus dem Eintrag,
//       MHD ab Produktionsdatum; Druck auf A4-Etikettenbogen.
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
    ['startNr', 'Start bei Etikett Nr. (angebrochener Bogen)', 'number']
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
    let pos = Math.max(0, (parseInt(_et.startNr) || 1) - 1);
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
  };
})();
