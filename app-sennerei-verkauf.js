// ══════════════════════════════════════════════════════════════════════════════
//  SENNEREI-VERKAUF (Alm-Verkauf an Gäste)
//  - Speed-optimiert: Preisliste als Grid, 1-Tap-Sofortverkauf
//  - Optional Warenkorb-Modus für Mehrfach-Käufe
//  - Preisliste editierbar (Kategorien, Preise, Reihenfolge)
//  - Historie mit Löschen
//  - PDF-Export pro Zeitraum
//  - Undo für 5 Sekunden nach letztem Verkauf
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '1.0';
  window.SENNEREI_VERKAUF_VERSION = VERSION;

  // Preset-Gewichte pro Kategorie (kg-Modus)
  function _range(from, to, step) {
    const arr = []; const inv = 1 / step;
    for(let v = from; v <= to + 0.0001; v += step) arr.push(Math.round(v * inv) / inv);
    return arr;
  }
  const KATEGORIEN = [
    { id: 'kaese',       icon: '🧀', label: 'Käse',          presets: _range(0.8, 5.0, 0.1) },
    { id: 'butter',      icon: '🧈', label: 'Butter',        presets: _range(0.5, 4.0, 0.5) },
    { id: 'spezialitaet', icon: '✨', label: 'Spezialitäten', presets: _range(0.5, 4.0, 0.5) },
    { id: 'getraenk',    icon: '🥛', label: 'Getränke',      presets: [] },
    { id: 'sonstiges',   icon: '📦', label: 'Sonstiges',     presets: _range(0.5, 4.0, 0.5) }
  ];

  // Standard-Preisliste v2 — alles €/kg
  const DEFAULT_PRODUKTE = [
    { name: 'Käse',       preisProKg: 32.00, kategorie: 'kaese',       sortierung: 10 },
    { name: 'Bergkäse',   preisProKg: 36.00, kategorie: 'kaese',       sortierung: 20 },
    { name: 'Butter',     preisProKg: 26.00, kategorie: 'butter',      sortierung: 10 },
    { name: 'Graukäse',   preisProKg: 24.00, kategorie: 'spezialitaet', sortierung: 10 }
  ];

  // ── View-State ──
  window._verkaufWarenkorb = window._verkaufWarenkorb || [];  // [{name, preis, menge}]
  window._verkaufWarenkorbAktiv = window._verkaufWarenkorbAktiv || false;
  window._verkaufSubView = window._verkaufSubView || 'kasse';   // kasse | historie | preisliste
  window._verkaufZeitraum = window._verkaufZeitraum || 'today';
  window._verkaufVon = window._verkaufVon || null;
  window._verkaufBis = window._verkaufBis || null;
  window._verkaufLetzter = null;   // für Undo

  // ── Helpers ──
  function _fmtEUR(n) {
    if(n == null || isNaN(n)) return '0,00';
    return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
  }
  function _esc(s) { return String(s||'').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]); }
  function _isoHeute() { return new Date().toISOString().slice(0,10); }
  function _tsHeuteStart() { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }
  function _tsHeuteEnde()  { const d = new Date(); d.setHours(23,59,59,999); return d.getTime(); }

  function _katMeta(id) {
    return KATEGORIEN.find(k => k.id === id) || KATEGORIEN[KATEGORIEN.length-1];
  }

  function _getPreisliste() {
    const list = window.sennereiPreisliste || {};
    return Object.entries(list).map(([id, p]) => ({ id, ...p }))
      .filter(p => p.aktiv !== false)
      .sort((a,b) => {
        const kA = KATEGORIEN.findIndex(k => k.id === (a.kategorie||'sonstiges'));
        const kB = KATEGORIEN.findIndex(k => k.id === (b.kategorie||'sonstiges'));
        if(kA !== kB) return kA - kB;
        return (a.sortierung || 0) - (b.sortierung || 0);
      });
  }

  function _getVerkaeufeZeitraum() {
    const heute = new Date(); heute.setHours(0,0,0,0);
    const z = window._verkaufZeitraum;
    let von, bis;
    if(z === 'today') { von = new Date(heute); bis = new Date(heute); bis.setHours(23,59,59,999); }
    else if(z === 'yesterday') { von = new Date(heute); von.setDate(von.getDate()-1); bis = new Date(von); bis.setHours(23,59,59,999); }
    else if(z === 'this-week') { const t = heute.getDay(); von = new Date(heute); von.setDate(heute.getDate()-t); bis = new Date(von); bis.setDate(von.getDate()+6); bis.setHours(23,59,59,999); }
    else if(z === 'last-week') { const t = heute.getDay(); von = new Date(heute); von.setDate(heute.getDate()-t-7); bis = new Date(von); bis.setDate(von.getDate()+6); bis.setHours(23,59,59,999); }
    else if(z === 'season') {
      const s = window.saisonInfo && window.saisonInfo.auftriebDatum ? new Date(window.saisonInfo.auftriebDatum) : new Date(heute.getFullYear(), 4, 1);
      von = new Date(s); von.setHours(0,0,0,0);
      bis = new Date(heute); bis.setHours(23,59,59,999);
    } else if(z === 'custom' && window._verkaufVon && window._verkaufBis) {
      von = new Date(window._verkaufVon + 'T00:00:00');
      bis = new Date(window._verkaufBis + 'T23:59:59');
    } else { von = new Date(heute); bis = new Date(heute); bis.setHours(23,59,59,999); }
    return { von, bis };
  }

  function _getVerkaeufeGefiltert() {
    const { von, bis } = _getVerkaeufeZeitraum();
    const alle = Object.entries(window.sennereiVerkaeufe || {}).map(([id, v]) => ({ id, ...v }));
    const gefiltert = alle.filter(v => v.datumTs && v.datumTs >= von.getTime() && v.datumTs <= bis.getTime());
    gefiltert.sort((a,b) => (b.datumTs||0) - (a.datumTs||0));
    return { verkaeufe: gefiltert, von, bis };
  }

  function _tagesStats() {
    const von = _tsHeuteStart(), bis = _tsHeuteEnde();
    const heutige = Object.values(window.sennereiVerkaeufe || {}).filter(v => v.datumTs >= von && v.datumTs <= bis);
    const summe = heutige.reduce((s, v) => s + (v.summe || 0), 0);
    return { anzahl: heutige.length, summe };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  MAIN RENDER
  // ══════════════════════════════════════════════════════════════════════════
  window.renderSennereiVerkauf = function() {
    _injectStyles();
    const preisliste = _getPreisliste();
    const isEmpty = preisliste.length === 0;
    const stats = _tagesStats();
    const sub = window._verkaufSubView;

    return `
      <div class="page-header">
        <h2>💰 Sennerei — Verkauf</h2>
      </div>

      ${typeof window._renderSennereiTabs === 'function' ? window._renderSennereiTabs('verkauf') : ''}

      <!-- Sub-Tabs: Kasse | Historie | Preisliste -->
      <div style="display:flex;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:3px;margin-bottom:.6rem">
        <button onclick="_svSubView('kasse')" style="flex:1;padding:.5rem;background:${sub==='kasse'?'var(--gold)':'transparent'};color:${sub==='kasse'?'#000':'var(--text2)'};border:none;border-radius:7px;font-size:.85rem;font-weight:600;cursor:pointer">🛒 Kasse</button>
        <button onclick="_svSubView('historie')" style="flex:1;padding:.5rem;background:${sub==='historie'?'var(--gold)':'transparent'};color:${sub==='historie'?'#000':'var(--text2)'};border:none;border-radius:7px;font-size:.85rem;font-weight:600;cursor:pointer">📋 Historie</button>
        <button onclick="_svSubView('preisliste')" style="flex:1;padding:.5rem;background:${sub==='preisliste'?'var(--gold)':'transparent'};color:${sub==='preisliste'?'#000':'var(--text2)'};border:none;border-radius:7px;font-size:.85rem;font-weight:600;cursor:pointer">⚙ Preisliste</button>
      </div>

      ${sub === 'kasse' ? _renderKasse(preisliste, isEmpty, stats) : ''}
      ${sub === 'historie' ? _renderHistorie() : ''}
      ${sub === 'preisliste' ? _renderPreislisteEditor(preisliste) : ''}
    `;
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  KASSE (Speed-optimiert)
  // ══════════════════════════════════════════════════════════════════════════
  function _renderKasse(preisliste, isEmpty, stats) {
    const warenkorbAktiv = window._verkaufWarenkorbAktiv;
    const warenkorb = window._verkaufWarenkorb || [];
    // Positionen sind jetzt kg-basiert: {preisId, name, preisProKg, mengeKg, gesamt}
    const wkSumme = warenkorb.reduce((s, p) => s + (p.gesamt || 0), 0);
    const wkCount = warenkorb.length;

    // Nach Kategorie gruppieren
    const gruppen = {};
    preisliste.forEach(p => {
      const k = p.kategorie || 'sonstiges';
      if(!gruppen[k]) gruppen[k] = [];
      gruppen[k].push(p);
    });

    let gridHtml = '';
    if(isEmpty) {
      gridHtml = `
        <div class="empty-state" style="padding:2rem 1rem">
          <div style="font-size:2rem;margin-bottom:.5rem">💰</div>
          <div style="margin-bottom:.5rem"><b>Keine Preisliste angelegt.</b></div>
          <div style="font-size:.85rem;color:var(--text3);margin-bottom:1rem">Lege die Preisliste einmal an, dann kannst du blitzschnell Verkäufe erfassen.</div>
          <button class="btn-primary" onclick="_svInitPreisliste()">📥 Standard-Preisliste laden</button><br>
          <button class="btn-secondary" style="margin-top:.4rem" onclick="_svSubView('preisliste')">✎ Preisliste selbst anlegen</button>
        </div>
      `;
    } else {
      // Kategorie-Sektionen mit Grid (alle Produkte kg-basiert)
      KATEGORIEN.forEach(kat => {
        const items = gruppen[kat.id];
        if(!items || !items.length) return;
        gridHtml += `<div style="font-size:.7rem;color:var(--text3);letter-spacing:.1em;text-transform:uppercase;margin:.7rem 0 .3rem 0">${kat.icon} ${kat.label}</div>`;
        gridHtml += '<div class="sv-grid">' + items.map(p => {
          const preisKg = p.preisProKg != null ? p.preisProKg : p.preis;   // Fallback für alte Einträge
          return `
          <button class="sv-btn" onclick="_svTapVerkauf('${p.id}')">
            <div class="sv-btn-icon">${_esc(kat.icon)}</div>
            <div class="sv-btn-name">${_esc(p.name)}</div>
            <div class="sv-btn-preis">${_fmtEUR(preisKg)} €/kg</div>
          </button>
          `;
        }).join('') + '</div>';
      });
    }

    return `
      <!-- Live-Tages-Statistik -->
      <div style="background:linear-gradient(90deg,rgba(212,168,75,.15),rgba(212,168,75,.05));border:1px solid rgba(212,168,75,.4);border-radius:10px;padding:.55rem .8rem;margin-bottom:.5rem;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:.78rem;color:var(--text2)">Heute: <b style="color:var(--gold)">${stats.anzahl}</b> Verkäufe</div>
        <div style="font-size:1.05rem;color:var(--gold);font-weight:800">${_fmtEUR(stats.summe)} €</div>
      </div>

      ${!isEmpty ? `
      <!-- Warenkorb-Modus Toggle -->
      <div style="display:flex;gap:.4rem;margin-bottom:.5rem;align-items:center">
        <label style="display:flex;align-items:center;gap:.4rem;padding:.4rem .6rem;background:${warenkorbAktiv?'rgba(212,168,75,.15)':'var(--bg3)'};border:1px solid ${warenkorbAktiv?'var(--gold)':'var(--border)'};border-radius:8px;font-size:.8rem;cursor:pointer;flex:1">
          <input type="checkbox" ${warenkorbAktiv?'checked':''} onchange="_svToggleWarenkorb()" style="accent-color:var(--gold);width:16px;height:16px"/>
          <span style="color:${warenkorbAktiv?'var(--gold)':'var(--text2)'};font-weight:600">🧺 Warenkorb-Modus</span>
        </label>
      </div>` : ''}

      ${warenkorbAktiv && warenkorb.length ? `
      <!-- Warenkorb -->
      <div style="background:rgba(212,168,75,.08);border:2px solid var(--gold);border-radius:10px;padding:.55rem .7rem;margin-bottom:.6rem">
        <div style="font-size:.72rem;color:var(--gold);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.35rem">🧺 Warenkorb (${wkCount})</div>
        ${warenkorb.map((p, i) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:.25rem 0;font-size:.85rem;border-bottom:1px solid var(--border)">
            <span>${_esc(p.name)} <span style="color:var(--text3)">${_fmtKg(p.mengeKg)} kg</span></span>
            <span style="display:flex;align-items:center;gap:.5rem">
              <b>${_fmtEUR(p.gesamt)} €</b>
              <button class="btn-xs-danger" style="padding:.15rem .4rem" onclick="_svWkEntfernen(${i})">✕</button>
            </span>
          </div>
        `).join('')}
        <div style="display:flex;justify-content:space-between;padding:.5rem 0 .3rem 0;font-size:1.05rem;font-weight:800;color:var(--gold)">
          <span>SUMME</span><span>${_fmtEUR(wkSumme)} €</span>
        </div>
        <div style="display:flex;gap:.4rem">
          <button class="btn-secondary" style="flex:1;padding:.5rem" onclick="_svWkLeeren()">✕ Leeren</button>
          <button class="btn-primary" style="flex:2;padding:.6rem;background:var(--green);border-color:var(--green);font-weight:700" onclick="_svWkBezahlen()">✓ Verkauf abschließen</button>
        </div>
      </div>` : ''}

      ${gridHtml}
    `;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  TAP-VERKAUF (öffnet kg-Popup)
  // ══════════════════════════════════════════════════════════════════════════
  window._svTapVerkauf = function(preisId) {
    const p = (window.sennereiPreisliste || {})[preisId];
    if(!p) return;
    _svShowKgPopup(preisId, p);
  };

  // Speichert Verkauf mit Gewicht (Sofort oder in Warenkorb)
  async function _svVerkaufMitKg(preisId, p, kg) {
    if(!kg || isNaN(kg) || kg <= 0) return;
    const preisKg = p.preisProKg != null ? p.preisProKg : p.preis;
    const gesamt = Math.round(kg * preisKg * 100) / 100;
    if(window._verkaufWarenkorbAktiv) {
      // In Warenkorb hinzufügen (immer neue Position, weil Gewicht individuell)
      window._verkaufWarenkorb.push({ preisId, name: p.name, preisProKg: preisKg, mengeKg: kg, gesamt });
      _svHapticShort();
      if(typeof render === 'function') render();
      return;
    }
    // Sofort-Verkauf
    const now = Date.now();
    const data = {
      datum: _isoHeute(),
      datumTs: now,
      positionen: [{ preisId, name: p.name, preisProKg: preisKg, mengeKg: kg, gesamt }],
      summe: gesamt,
      erfasstAm: now,
      erfasstVon: (firebase.auth && firebase.auth().currentUser && firebase.auth().currentUser.email) || null
    };
    try {
      const pushRef = firebase.database().ref('sennerei/verkaeufe').push();
      const newId = pushRef.key;
      window.sennereiVerkaeufe = window.sennereiVerkaeufe || {};
      window.sennereiVerkaeufe[newId] = data;
      window._verkaufLetzter = { id: newId, at: now };
      _svHapticShort();
      _svToastVerkauf(p.name + ' · ' + _fmtKg(kg) + ' kg', gesamt, newId);
      if(typeof render === 'function') render();
      const _retry = window.withAuthRetry || (async fn => await fn());
      await _retry(() => pushRef.set(data));
    } catch(err) {
      console.error('[Verkauf] Save fail:', err);
      if(window.showSaveToast) window.showSaveToast('⚠ Verkauf-Sync fehler');
    }
  }

  // ── kg-Popup mit Preset-Chips + freier Eingabe ──
  function _svShowKgPopup(preisId, p) {
    document.getElementById('sv-kg-popup')?.remove();
    if(!document.getElementById('sv-kg-popup-style')) {
      const st = document.createElement('style');
      st.id = 'sv-kg-popup-style';
      st.textContent = `
        #sv-kg-popup { position:fixed; inset:0; z-index:99400; background:rgba(0,0,0,.7); backdrop-filter:blur(6px); display:flex; align-items:flex-end; justify-content:center; padding:0; }
        #sv-kg-popup .kg-card { background:var(--bg2); border-top:1px solid rgba(212,168,75,.4); border-radius:18px 18px 0 0; max-width:560px; width:100%; padding:1rem 1rem 1.2rem; color:var(--text); box-shadow:0 -10px 40px rgba(0,0,0,.4); max-height:88vh; overflow-y:auto; animation:kgIn .22s cubic-bezier(.2,.9,.3,1); }
        @keyframes kgIn { from{transform:translateY(60px);opacity:0} to{transform:translateY(0);opacity:1} }
        #sv-kg-popup h3 { color:var(--gold); margin:0 0 .2rem 0; font-size:1.1rem; display:flex; align-items:center; gap:.4rem; }
        #sv-kg-popup .kg-preis-info { color:var(--text3); font-size:.85rem; margin-bottom:.85rem; }
        #sv-kg-popup .kg-label { display:block; font-size:.7rem; letter-spacing:.1em; text-transform:uppercase; color:var(--text3); margin:.85rem 0 .35rem 0; }
        #sv-kg-popup .kg-presets { display:grid; grid-template-columns:repeat(auto-fill,minmax(64px,1fr)); gap:.35rem; }
        #sv-kg-popup .kg-chip { padding:.65rem .3rem; background:linear-gradient(180deg,var(--bg3),rgba(0,0,0,.15)); border:1.5px solid var(--border); border-radius:9px; color:var(--text); font-size:.9rem; font-weight:700; cursor:pointer; text-align:center; -webkit-tap-highlight-color:transparent; transition:transform .07s, border-color .15s, background .15s; }
        #sv-kg-popup .kg-chip:active { transform:scale(.92); border-color:var(--gold); background:rgba(212,168,75,.25); }
        #sv-kg-popup .kg-chip:hover { border-color:var(--gold); }
        #sv-kg-popup .kg-frei-row { display:flex; gap:.4rem; align-items:center; }
        #sv-kg-popup .kg-frei-row input { flex:1; background:rgba(255,255,255,.05); border:1px solid var(--border); color:var(--text); padding:.65rem .7rem; border-radius:8px; font-size:1.05rem; font-family:inherit; box-sizing:border-box; text-align:center; font-weight:700; }
        #sv-kg-popup .kg-frei-row .einheit { color:var(--text3); font-size:.9rem; padding:0 .4rem; }
        #sv-kg-popup .kg-frei-row .btn-frei { background:var(--gold); color:#000; border:none; padding:.65rem 1rem; border-radius:8px; font-weight:700; cursor:pointer; font-size:.95rem; white-space:nowrap; }
        #sv-kg-popup .kg-frei-row .btn-frei:disabled { opacity:.4; cursor:not-allowed; }
        #sv-kg-popup .kg-berechnung { text-align:center; padding:.55rem; background:rgba(212,168,75,.08); border:1px solid rgba(212,168,75,.3); border-radius:8px; margin-top:.5rem; font-size:.9rem; color:var(--text2); min-height:2.2rem; }
        #sv-kg-popup .kg-berechnung b { color:var(--gold); font-size:1.05rem; }
        #sv-kg-popup .kg-abbrechen { background:transparent; color:var(--text3); border:none; padding:.6rem; margin-top:.7rem; width:100%; font-size:.85rem; cursor:pointer; }
      `;
      document.head.appendChild(st);
    }
    const kat = KATEGORIEN.find(k => k.id === (p.kategorie || 'sonstiges')) || KATEGORIEN[KATEGORIEN.length-1];
    const preisKg = p.preisProKg != null ? p.preisProKg : p.preis;
    const presets = (kat.presets || []).slice();
    const chipsHtml = presets.length
      ? presets.map(kg => `<button class="kg-chip" onclick="_svKgTap('${preisId}',${kg})">${_fmtKg(kg)}</button>`).join('')
      : '<div style="color:var(--text3);font-size:.82rem;text-align:center;padding:.5rem 0">Keine Standard-Gewichte für diese Kategorie.</div>';
    const wrap = document.createElement('div');
    wrap.id = 'sv-kg-popup';
    wrap.onclick = (e) => { if(e.target.id === 'sv-kg-popup') _svKgClose(); };
    wrap.innerHTML =
      '<div class="kg-card">' +
        '<h3>' + _esc(kat.icon) + ' ' + _esc(p.name) + '</h3>' +
        '<div class="kg-preis-info">' + _fmtEUR(preisKg) + ' € / kg</div>' +
        '<div class="kg-label">Standard-Gewichte (kg) · Tap = sofort verkaufen</div>' +
        '<div class="kg-presets">' + chipsHtml + '</div>' +
        '<div class="kg-label">Oder freies Gewicht</div>' +
        '<div class="kg-frei-row">' +
          '<input type="text" inputmode="decimal" id="kg-frei-input" placeholder="z.B. 0,35 oder 1,25" oninput="_svKgFreiCalc(\'' + preisId + '\')"/>' +
          '<span class="einheit">kg</span>' +
          '<button class="btn-frei" id="kg-frei-btn" disabled onclick="_svKgFreiSpeichern(\'' + preisId + '\')">✓ Speichern</button>' +
        '</div>' +
        '<div class="kg-berechnung" id="kg-berechnung">' + preisKg.toFixed(2).replace('.',',') + ' € / kg</div>' +
        '<button class="kg-abbrechen" onclick="_svKgClose()">Abbrechen</button>' +
      '</div>';
    document.body.appendChild(wrap);
    setTimeout(() => { try { document.getElementById('kg-frei-input').focus(); } catch(e){} }, 100);
  }

  window._svKgTap = function(preisId, kg) {
    const p = (window.sennereiPreisliste || {})[preisId];
    if(!p) return;
    _svVerkaufMitKg(preisId, p, kg);
    _svKgClose();
  };
  window._svKgFreiCalc = function(preisId) {
    const p = (window.sennereiPreisliste || {})[preisId];
    if(!p) return;
    const preisKg = p.preisProKg != null ? p.preisProKg : p.preis;
    const raw = (document.getElementById('kg-frei-input').value || '').replace(',','.');
    const kg = parseFloat(raw);
    const btn = document.getElementById('kg-frei-btn');
    const info = document.getElementById('kg-berechnung');
    if(!isNaN(kg) && kg > 0) {
      const gesamt = Math.round(kg * preisKg * 100) / 100;
      info.innerHTML = _fmtKg(kg) + ' kg × ' + preisKg.toFixed(2).replace('.',',') + ' €/kg = <b>' + _fmtEUR(gesamt) + ' €</b>';
      btn.disabled = false;
    } else {
      info.innerHTML = preisKg.toFixed(2).replace('.',',') + ' € / kg';
      btn.disabled = true;
    }
  };
  window._svKgFreiSpeichern = function(preisId) {
    const p = (window.sennereiPreisliste || {})[preisId];
    if(!p) return;
    const raw = (document.getElementById('kg-frei-input').value || '').replace(',','.');
    const kg = parseFloat(raw);
    if(isNaN(kg) || kg <= 0) return;
    _svVerkaufMitKg(preisId, p, kg);
    _svKgClose();
  };
  window._svKgClose = function() {
    document.getElementById('sv-kg-popup')?.remove();
  };

  function _fmtKg(kg) {
    if(kg == null || isNaN(kg)) return '0';
    // Trim trailing zeros: 1.5 → "1,5", 1.0 → "1", 0.35 → "0,35"
    const rounded = Math.round(kg * 1000) / 1000;
    let s = rounded.toFixed(3);
    s = s.replace(/0+$/,'').replace(/\.$/,'');
    return s.replace('.', ',');
  }
  window._fmtKg = _fmtKg;

  window._svWkBezahlen = async function() {
    const wk = window._verkaufWarenkorb || [];
    if(!wk.length) return;
    const now = Date.now();
    const summe = wk.reduce((s, p) => s + (p.gesamt || 0), 0);
    const data = {
      datum: _isoHeute(),
      datumTs: now,
      positionen: wk.map(p => ({ preisId: p.preisId, name: p.name, preisProKg: p.preisProKg, mengeKg: p.mengeKg, gesamt: p.gesamt })),
      summe: Math.round(summe * 100) / 100,
      erfasstAm: now,
      erfasstVon: (firebase.auth && firebase.auth().currentUser && firebase.auth().currentUser.email) || null
    };
    try {
      const pushRef = firebase.database().ref('sennerei/verkaeufe').push();
      const newId = pushRef.key;
      window.sennereiVerkaeufe = window.sennereiVerkaeufe || {};
      window.sennereiVerkaeufe[newId] = data;
      window._verkaufLetzter = { id: newId, at: now };
      window._verkaufWarenkorb = [];
      _svHapticLong();
      _svToastVerkauf(wk.length + ' Positionen', summe, newId);
      if(typeof render === 'function') render();
      const _retry = window.withAuthRetry || (async fn => await fn());
      await _retry(() => pushRef.set(data));
    } catch(err) {
      console.error('[Verkauf] Warenkorb-Save fail:', err);
      alert('Fehler beim Speichern:\n\n' + (err.message||err));
    }
  };

  window._svWkEntfernen = function(idx) {
    if(!window._verkaufWarenkorb[idx]) return;
    // kg-Positionen: immer die ganze Position raus (kein Menge-1)
    window._verkaufWarenkorb.splice(idx, 1);
    if(typeof render === 'function') render();
  };
  window._svWkLeeren = function() {
    window._verkaufWarenkorb = [];
    if(typeof render === 'function') render();
  };
  window._svToggleWarenkorb = function() {
    window._verkaufWarenkorbAktiv = !window._verkaufWarenkorbAktiv;
    if(!window._verkaufWarenkorbAktiv) window._verkaufWarenkorb = [];
    if(typeof render === 'function') render();
  };

  window._svSubView = function(v) {
    window._verkaufSubView = v;
    if(typeof render === 'function') render();
  };

  // ── UNDO-Toast (5 Sekunden) ──
  function _svToastVerkauf(bezeichnung, summe, verkaufId) {
    // Alte Toasts wegräumen
    document.querySelectorAll('.sv-toast').forEach(el => el.remove());
    const t = document.createElement('div');
    t.className = 'sv-toast';
    t.innerHTML =
      '<div class="sv-toast-check">✓</div>' +
      '<div class="sv-toast-text">' +
        '<div class="sv-toast-name">' + _esc(bezeichnung) + '</div>' +
        '<div class="sv-toast-preis">' + _fmtEUR(summe) + ' €</div>' +
      '</div>' +
      '<button class="sv-toast-undo" onclick="_svUndo(\'' + verkaufId + '\')">↺ Rückgängig</button>';
    document.body.appendChild(t);
    setTimeout(() => { if(t.parentNode) t.classList.add('sv-toast-out'); setTimeout(() => t.remove(), 300); }, 5000);
  }

  window._svUndo = async function(verkaufId) {
    document.querySelectorAll('.sv-toast').forEach(el => el.remove());
    try {
      if(window.sennereiVerkaeufe) delete window.sennereiVerkaeufe[verkaufId];
      const _retry = window.withAuthRetry || (async fn => await fn());
      await _retry(() => firebase.database().ref('sennerei/verkaeufe/' + verkaufId).remove());
      if(window.showSaveToast) window.showSaveToast('↺ Verkauf zurückgenommen');
      if(typeof render === 'function') render();
    } catch(err) {
      console.error('[Verkauf] Undo fail:', err);
    }
  };

  function _svHapticShort() { if(navigator.vibrate) navigator.vibrate(15); }
  function _svHapticLong()  { if(navigator.vibrate) navigator.vibrate([30, 20, 30]); }

  // ══════════════════════════════════════════════════════════════════════════
  //  HISTORIE
  // ══════════════════════════════════════════════════════════════════════════
  function _renderHistorie() {
    const { verkaeufe, von, bis } = _getVerkaeufeGefiltert();
    const summe = verkaeufe.reduce((s, v) => s + (v.summe || 0), 0);
    const z = window._verkaufZeitraum;
    const chip = (val, label) => `<button class="filter-chip${z===val?' active':''}" onclick="_svSetZeitraum('${val}')">${label}</button>`;

    // Beste Produkte (kg-basiert, mit Fallback für alte Stück-Einträge)
    const proProdukt = {};
    verkaeufe.forEach(v => {
      (v.positionen||[]).forEach(p => {
        const k = p.name;
        if(!proProdukt[k]) proProdukt[k] = { name: k, mengeKg: 0, stueck: 0, umsatz: 0 };
        if(p.mengeKg != null) proProdukt[k].mengeKg += (p.mengeKg || 0);
        else proProdukt[k].stueck += (p.menge || 1);
        proProdukt[k].umsatz += p.gesamt || 0;
      });
    });
    const topProdukte = Object.values(proProdukt).sort((a,b) => b.umsatz - a.umsatz).slice(0, 5);

    return `
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.6rem .7rem;margin-bottom:.6rem">
        <div style="display:flex;gap:.35rem;flex-wrap:wrap">
          ${chip('today','Heute')}
          ${chip('yesterday','Gestern')}
          ${chip('this-week','Diese Woche')}
          ${chip('last-week','Letzte Woche')}
          ${chip('season','Ganze Saison')}
          ${chip('custom','Frei')}
        </div>
        ${z === 'custom' ? `
          <div style="display:flex;gap:.4rem;margin-top:.5rem;align-items:center;font-size:.8rem;color:var(--text3)">
            Von: <input type="date" class="inp" style="width:auto;padding:.3rem .4rem" value="${window._verkaufVon||von.toISOString().slice(0,10)}" onchange="_svSetVon(this.value)"/>
            Bis: <input type="date" class="inp" style="width:auto;padding:.3rem .4rem" value="${window._verkaufBis||bis.toISOString().slice(0,10)}" onchange="_svSetBis(this.value)"/>
          </div>` : ''}
      </div>

      <!-- Umsatz-Karte -->
      <div style="background:linear-gradient(135deg,var(--gold),#b88428);color:#000;border-radius:12px;padding:1rem;margin-bottom:.7rem;text-align:center;box-shadow:0 4px 20px rgba(212,168,75,.25)">
        <div style="font-size:.7rem;letter-spacing:.15em;text-transform:uppercase;opacity:.75">Umsatz</div>
        <div style="font-size:2.2rem;font-weight:900;line-height:1">${_fmtEUR(summe)} €</div>
        <div style="font-size:.85rem;opacity:.8;margin-top:.3rem">${verkaeufe.length} Verkäufe · ${von.toLocaleDateString('de-AT')} – ${bis.toLocaleDateString('de-AT')}</div>
      </div>

      ${topProdukte.length ? `
      <div class="section-title" style="display:flex;justify-content:space-between">
        <span>🏆 Beste Produkte</span>
        <button class="btn-xs" onclick="_svDruckePDF()">📄 PDF</button>
      </div>
      <div class="card-section" style="padding:.4rem .7rem;margin-bottom:.7rem">
        ${topProdukte.map((p, i) => {
          const mengeText = p.mengeKg > 0 ? _fmtKg(p.mengeKg) + ' kg' : (p.stueck > 0 ? '×' + p.stueck : '');
          return `<div style="display:flex;justify-content:space-between;padding:.3rem 0;border-bottom:1px solid var(--border);font-size:.88rem">
          <span><span style="color:var(--text3)">${i+1}.</span> ${_esc(p.name)} <span style="color:var(--text3);font-size:.75rem">${mengeText}</span></span>
          <b style="color:var(--gold)">${_fmtEUR(p.umsatz)} €</b>
        </div>`;
        }).join('')}
      </div>` : ''}

      <div class="section-title">📋 Verkäufe (${verkaeufe.length})</div>
      ${verkaeufe.length === 0
        ? '<div class="empty-state">Keine Verkäufe in diesem Zeitraum.</div>'
        : `<div class="card-list">
            ${verkaeufe.map(v => {
              const uhr = new Date(v.datumTs).toLocaleTimeString('de-AT', {hour:'2-digit', minute:'2-digit'});
              const dat = new Date(v.datumTs).toLocaleDateString('de-AT', {day:'2-digit', month:'2-digit'});
              const pos = (v.positionen||[]).map(p => {
                if(p.mengeKg != null) return _esc(p.name) + ' ' + _fmtKg(p.mengeKg) + ' kg';
                return (p.menge>1?p.menge+'× ':'') + _esc(p.name);   // Fallback alte Einträge
              }).join(', ');
              return `<div class="list-card">
                <div class="list-card-left" style="flex:1"><div>
                  <div style="font-size:.72rem;color:var(--text3)">${dat} · ${uhr}</div>
                  <div class="list-card-sub" style="font-size:.85rem;color:var(--text2)">${pos}</div>
                </div></div>
                <div class="list-card-right" style="display:flex;align-items:center;gap:.4rem">
                  <b style="color:var(--gold);font-size:.95rem">${_fmtEUR(v.summe)} €</b>
                  <button class="btn-xs-danger" onclick="_svLoescheVerkauf('${v.id}')">✕</button>
                </div>
              </div>`;
            }).join('')}
          </div>`}
    `;
  }

  window._svSetZeitraum = function(v) {
    window._verkaufZeitraum = v;
    if(v === 'custom' && (!window._verkaufVon || !window._verkaufBis)) {
      const { von, bis } = _getVerkaeufeZeitraum();
      window._verkaufVon = von.toISOString().slice(0,10);
      window._verkaufBis = bis.toISOString().slice(0,10);
    }
    if(typeof render === 'function') render();
  };
  window._svSetVon = function(v) { window._verkaufVon = v; if(typeof render === 'function') render(); };
  window._svSetBis = function(v) { window._verkaufBis = v; if(typeof render === 'function') render(); };

  window._svLoescheVerkauf = async function(id) {
    const v = (window.sennereiVerkaeufe || {})[id];
    if(!v) return;
    if(!confirm('Verkauf über ' + _fmtEUR(v.summe) + ' € wirklich löschen?')) return;
    try {
      if(window.sennereiVerkaeufe) delete window.sennereiVerkaeufe[id];
      const _retry = window.withAuthRetry || (async fn => await fn());
      await _retry(() => firebase.database().ref('sennerei/verkaeufe/' + id).remove());
      if(window.showSaveToast) window.showSaveToast('✓ Verkauf gelöscht');
      if(typeof render === 'function') render();
    } catch(err) {
      alert('Fehler beim Löschen: ' + (err.message||err));
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  PREISLISTE-EDITOR
  // ══════════════════════════════════════════════════════════════════════════
  function _renderPreislisteEditor(preisliste) {
    const gruppen = {};
    preisliste.forEach(p => {
      const k = p.kategorie || 'sonstiges';
      if(!gruppen[k]) gruppen[k] = [];
      gruppen[k].push(p);
    });

    let listHtml = '';
    KATEGORIEN.forEach(kat => {
      const items = gruppen[kat.id];
      if(!items || !items.length) return;
      listHtml += `<div style="font-size:.7rem;color:var(--text3);letter-spacing:.1em;text-transform:uppercase;margin:.7rem 0 .3rem 0">${kat.icon} ${kat.label}</div>`;
      listHtml += '<div class="card-list">' + items.map(p => {
        const preisKg = p.preisProKg != null ? p.preisProKg : p.preis;
        return `
        <div class="list-card">
          <div class="list-card-left" style="flex:1"><div>
            <div class="list-card-title">${_esc(p.name)}</div>
            <div class="list-card-sub" style="color:var(--gold);font-weight:700">${_fmtEUR(preisKg)} € / kg</div>
          </div></div>
          <div class="list-card-right" style="display:flex;gap:.3rem">
            <button class="btn-xs" onclick="_svPreisBearbeiten('${p.id}')">✎</button>
            <button class="btn-xs-danger" onclick="_svPreisLoeschen('${p.id}','${_esc(p.name)}')">✕</button>
          </div>
        </div>`;
      }).join('') + '</div>';
    });

    return `
      <div style="display:flex;gap:.4rem;margin-bottom:.6rem">
        <button class="btn-primary" style="flex:1" onclick="_svPreisNeu()">+ Neuer Preisliste-Eintrag</button>
        ${preisliste.length === 0 ? '<button class="btn-secondary" onclick="_svInitPreisliste()" title="Standard-Preisliste laden">📥 Standard</button>' : ''}
      </div>
      ${preisliste.length === 0
        ? '<div class="empty-state">Preisliste ist leer. Tippe „+ Neu" oder „📥 Standard" zum Starten.</div>'
        : listHtml}
    `;
  }

  window._svInitPreisliste = async function() {
    if(!confirm('Standard-Preisliste (' + DEFAULT_PRODUKTE.length + ' Produkte, alle €/kg) hinzufügen? Vorhandene Einträge bleiben erhalten.')) return;
    try {
      const _retry = window.withAuthRetry || (async fn => await fn());
      for(const item of DEFAULT_PRODUKTE) {
        const pushRef = firebase.database().ref('sennerei/preisliste').push();
        // preis-Feld doppelt setzen (Fallback für alte Aufrufer)
        await _retry(() => pushRef.set({ ...item, preis: item.preisProKg, aktiv: true, erstelltAm: Date.now() }));
      }
      if(window.showSaveToast) window.showSaveToast('✓ Standard-Preisliste geladen (€/kg)');
      if(typeof render === 'function') render();
    } catch(err) {
      alert('Fehler: ' + (err.message || err));
    }
  };

  window._svPreisNeu = function() { _svPreisForm(null); };
  window._svPreisBearbeiten = function(id) { _svPreisForm(id); };

  function _svPreisForm(existingId) {
    document.getElementById('sv-preis-form')?.remove();
    const existing = existingId ? (window.sennereiPreisliste || {})[existingId] : null;
    if(!document.getElementById('sv-preis-form-style')) {
      const st = document.createElement('style');
      st.id = 'sv-preis-form-style';
      st.textContent = `
        #sv-preis-form { position:fixed; inset:0; z-index:99500; background:rgba(0,0,0,.7); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; padding:1rem; }
        #sv-preis-form .pf-card { background:var(--bg2); border:1px solid rgba(212,168,75,.3); border-radius:14px; max-width:440px; width:100%; padding:1.2rem; color:var(--text); box-shadow:0 20px 60px rgba(0,0,0,.5); }
        #sv-preis-form h3 { color:var(--gold); margin:0 0 .8rem 0; font-size:1.1rem; }
        #sv-preis-form label { display:block; font-size:.7rem; letter-spacing:.1em; text-transform:uppercase; color:var(--text3); margin:.7rem 0 .3rem 0; }
        #sv-preis-form input, #sv-preis-form select { width:100%; background:rgba(255,255,255,.05); border:1px solid var(--border); color:var(--text); padding:.6rem .7rem; border-radius:8px; font-size:.95rem; box-sizing:border-box; font-family:inherit; }
        #sv-preis-form .pf-btns { display:flex; gap:.5rem; margin-top:1.2rem; }
        #sv-preis-form .pf-btns button { flex:1; padding:.7rem; border-radius:10px; font-size:.9rem; font-weight:600; cursor:pointer; border:none; }
        #sv-preis-form .pf-cancel { background:rgba(255,255,255,.08); color:var(--text); }
        #sv-preis-form .pf-save { background:var(--gold); color:#000; }
      `;
      document.head.appendChild(st);
    }
    const w = document.createElement('div');
    w.id = 'sv-preis-form';
    w.innerHTML =
      '<div class="pf-card">' +
        '<h3>' + (existing ? '✎ Preisliste-Eintrag' : '+ Neuer Preisliste-Eintrag') + '</h3>' +
        '<label>Bezeichnung</label>' +
        '<input type="text" id="sv-pname" value="' + _esc(existing?.name || '') + '" placeholder="z.B. Käse"/>' +
        '<label>Preis (€ pro kg, brutto inkl. USt)</label>' +
        '<input type="text" inputmode="decimal" id="sv-ppreis" value="' + (existing?.preisProKg != null ? existing.preisProKg : (existing?.preis || '')) + '" placeholder="z.B. 32,00"/>' +
        '<label>Kategorie</label>' +
        '<select id="sv-pkat">' +
          KATEGORIEN.map(k => '<option value="' + k.id + '"' + ((existing?.kategorie || 'kaese') === k.id ? ' selected' : '') + '>' + k.icon + ' ' + k.label + '</option>').join('') +
        '</select>' +
        '<label>Sortierung (kleinere Zahl = vorne)</label>' +
        '<input type="number" id="sv-psort" value="' + (existing?.sortierung || 10) + '" min="0" step="10"/>' +
        '<div class="pf-btns">' +
          '<button class="pf-cancel" onclick="document.getElementById(\'sv-preis-form\').remove()">Abbrechen</button>' +
          '<button class="pf-save" onclick="_svPreisSave(' + (existingId ? '\'' + existingId + '\'' : 'null') + ')">Speichern</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(w);
    setTimeout(() => document.getElementById('sv-pname')?.focus(), 100);
  }

  window._svPreisSave = async function(existingId) {
    const name = document.getElementById('sv-pname').value.trim();
    const preisProKg = parseFloat((document.getElementById('sv-ppreis').value || '').replace(',','.'));
    const kategorie = document.getElementById('sv-pkat').value;
    const sortierung = parseInt(document.getElementById('sv-psort').value) || 0;
    if(!name) { alert('Bitte Bezeichnung eintragen'); return; }
    if(isNaN(preisProKg) || preisProKg < 0) { alert('Bitte gültigen Preis eintragen (€/kg)'); return; }
    const data = { name, preisProKg, preis: preisProKg, kategorie, sortierung, aktiv: true, updatedAt: Date.now() };
    try {
      const _retry = window.withAuthRetry || (async fn => await fn());
      if(existingId) {
        await _retry(() => firebase.database().ref('sennerei/preisliste/' + existingId).update(data));
        window.sennereiPreisliste = window.sennereiPreisliste || {};
        window.sennereiPreisliste[existingId] = { ...(window.sennereiPreisliste[existingId] || {}), ...data };
      } else {
        data.erstelltAm = Date.now();
        const pushRef = firebase.database().ref('sennerei/preisliste').push();
        await _retry(() => pushRef.set(data));
        window.sennereiPreisliste = window.sennereiPreisliste || {};
        window.sennereiPreisliste[pushRef.key] = data;
      }
      document.getElementById('sv-preis-form')?.remove();
      if(window.showSaveToast) window.showSaveToast('✓ Preisliste gespeichert');
      if(typeof render === 'function') render();
    } catch(err) {
      alert('Fehler: ' + (err.message||err));
    }
  };

  window._svPreisLoeschen = async function(id, name) {
    if(!confirm('Preisliste-Eintrag „' + name + '" löschen?\n\n(Bereits erfasste Verkäufe bleiben erhalten.)')) return;
    try {
      const _retry = window.withAuthRetry || (async fn => await fn());
      await _retry(() => firebase.database().ref('sennerei/preisliste/' + id).remove());
      if(window.sennereiPreisliste) delete window.sennereiPreisliste[id];
      if(typeof render === 'function') render();
    } catch(err) {
      alert('Fehler: ' + (err.message||err));
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  PDF-EXPORT
  // ══════════════════════════════════════════════════════════════════════════
  window._svDruckePDF = function() {
    const { verkaeufe, von, bis } = _getVerkaeufeGefiltert();
    const summe = verkaeufe.reduce((s, v) => s + (v.summe || 0), 0);
    const almName = (window.saisonInfo && window.saisonInfo.alm) || 'Alm';
    const jahr = (window.saisonInfo && window.saisonInfo.jahr) || new Date().getFullYear();

    // Beste Produkte (kg-basiert)
    const proProdukt = {};
    verkaeufe.forEach(v => {
      (v.positionen||[]).forEach(p => {
        const k = p.name;
        if(!proProdukt[k]) proProdukt[k] = { name: k, mengeKg: 0, stueck: 0, umsatz: 0 };
        if(p.mengeKg != null) proProdukt[k].mengeKg += (p.mengeKg || 0);
        else proProdukt[k].stueck += (p.menge || 1);
        proProdukt[k].umsatz += p.gesamt || 0;
      });
    });
    const topRows = Object.values(proProdukt).sort((a,b) => b.umsatz - a.umsatz).map(p => {
      const mengeText = p.mengeKg > 0 ? _fmtKg(p.mengeKg) + ' kg' : (p.stueck > 0 ? p.stueck + ' Stk' : '');
      return `<tr><td>${_esc(p.name)}</td><td class="r">${mengeText}</td><td class="r"><b>${_fmtEUR(p.umsatz)} €</b></td></tr>`;
    }).join('');

    const rows = verkaeufe.slice().reverse().map(v => {
      const uhr = new Date(v.datumTs).toLocaleTimeString('de-AT', {hour:'2-digit', minute:'2-digit'});
      const dat = new Date(v.datumTs).toLocaleDateString('de-AT');
      const pos = (v.positionen||[]).map(p => {
        if(p.mengeKg != null) {
          const pk = p.preisProKg != null ? p.preisProKg : p.preis;
          return _esc(p.name) + ' · ' + _fmtKg(p.mengeKg) + ' kg × ' + _fmtEUR(pk) + '€/kg = ' + _fmtEUR(p.gesamt) + '€';
        }
        return (p.menge>1 ? p.menge + '× ' : '') + _esc(p.name) + ' (' + _fmtEUR(p.preis || p.gesamt) + '€)';
      }).join('<br>');
      return `<tr><td>${dat} ${uhr}</td><td>${pos}</td><td class="r"><b>${_fmtEUR(v.summe)} €</b></td></tr>`;
    }).join('');

    const html =
      '<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Sennerei-Verkauf ' + almName + '</title>' +
      '<style>' +
        'body{font-family:Georgia,serif;color:#222;padding:24px;max-width:900px;margin:0 auto}' +
        'h1{color:#6a4a10;border-bottom:2px solid #d4a84b;padding-bottom:8px;margin-bottom:14px}' +
        'h2{color:#8b6914;margin-top:22px;font-size:1.05rem;border-bottom:1px solid #eee;padding-bottom:4px}' +
        '.meta{color:#666;font-size:12px;margin-bottom:16px}' +
        '.summ{background:linear-gradient(135deg,#d4a84b,#b88428);color:#000;padding:14px 18px;margin-bottom:18px;border-radius:10px;text-align:center}' +
        '.summ .big{font-size:32px;font-weight:900}' +
        '.summ .sm{font-size:12px;opacity:.75;letter-spacing:.15em;text-transform:uppercase}' +
        'table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:16px}' +
        'th{background:#f0e0b0;text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#5a4010;border-bottom:2px solid #d4a84b}' +
        'td{padding:5px 8px;border-bottom:1px solid #eee;vertical-align:top}' +
        'td.r{text-align:right;font-family:monospace}' +
        '.footer{margin-top:24px;padding-top:8px;border-top:1px solid #eee;color:#999;font-size:10px;text-align:center;font-style:italic}' +
        '@media print{body{padding:0}}' +
      '</style></head><body>' +
      '<h1>💰 Sennerei-Verkauf — ' + _esc(almName) + '</h1>' +
      '<div class="meta">Saison ' + _esc(String(jahr)) + ' · Zeitraum: <b>' + von.toLocaleDateString('de-AT') + ' – ' + bis.toLocaleDateString('de-AT') + '</b> · Erstellt: ' + new Date().toLocaleString('de-AT') + '</div>' +
      '<div class="summ"><div class="sm">Umsatz gesamt</div><div class="big">' + _fmtEUR(summe) + ' €</div><div style="font-size:12px;margin-top:4px">' + verkaeufe.length + ' Verkäufe (Bruttopreise inkl. USt)</div></div>' +
      (topRows ?
        '<h2>🏆 Umsatz nach Produkt</h2>' +
        '<table><thead><tr><th>Produkt</th><th style="text-align:right">Menge</th><th style="text-align:right">Umsatz</th></tr></thead><tbody>' + topRows + '</tbody></table>'
        : '') +
      (rows ?
        '<h2>📋 Alle Verkäufe (chronologisch, neuste unten)</h2>' +
        '<table><thead><tr><th>Datum · Zeit</th><th>Positionen</th><th style="text-align:right">Summe</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<p style="color:#999;font-style:italic">Keine Verkäufe in diesem Zeitraum.</p>') +
      '<div class="footer">HerdenPro · Sennerei-Verkauf · Alle Preise Bruttopreise inkl. USt · Bar-Zahlung</div>' +
      '<script>setTimeout(()=>window.print(), 300);<\/script>' +
      '</body></html>';
    const w = window.open('', '_blank');
    if(!w) { alert('Popup blockiert — bitte für diese Seite erlauben.'); return; }
    w.document.write(html);
    w.document.close();
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  STYLES
  // ══════════════════════════════════════════════════════════════════════════
  function _injectStyles() {
    if(document.getElementById('sv-styles')) return;
    const st = document.createElement('style');
    st.id = 'sv-styles';
    st.textContent = `
      .sv-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(105px,1fr)); gap:.5rem; }
      .sv-btn { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.15rem; padding:.7rem .4rem; background:linear-gradient(180deg,var(--bg3),rgba(0,0,0,.15)); border:1.5px solid var(--border); border-radius:12px; color:var(--text); cursor:pointer; font-family:inherit; min-height:92px; text-align:center; transition:transform .08s, box-shadow .12s, border-color .15s; -webkit-tap-highlight-color:transparent; }
      .sv-btn:active { transform:scale(.94); border-color:var(--gold); box-shadow:0 0 0 3px rgba(212,168,75,.25); }
      .sv-btn:hover { border-color:var(--gold); }
      .sv-btn-icon { font-size:1.5rem; line-height:1; }
      .sv-btn-name { font-size:.72rem; font-weight:600; line-height:1.15; color:var(--text2); }
      .sv-btn-preis { font-size:.95rem; font-weight:800; color:var(--gold); line-height:1; margin-top:.1rem; }

      .sv-toast { position:fixed; left:50%; bottom:1.2rem; transform:translateX(-50%); background:var(--bg2); border:2px solid var(--green); border-radius:14px; padding:.55rem .75rem; display:flex; align-items:center; gap:.7rem; box-shadow:0 8px 30px rgba(0,0,0,.4); z-index:9999; max-width:95vw; animation:svTin .2s ease; }
      @keyframes svTin { from{opacity:0;transform:translateX(-50%) translateY(15px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
      .sv-toast.sv-toast-out { animation:svTout .3s ease forwards; }
      @keyframes svTout { to{opacity:0;transform:translateX(-50%) translateY(15px)} }
      .sv-toast-check { color:var(--green); font-size:1.6rem; font-weight:900; line-height:1; }
      .sv-toast-text { flex:1; min-width:0; }
      .sv-toast-name { font-size:.85rem; font-weight:700; color:var(--text); line-height:1.1; }
      .sv-toast-preis { font-size:1rem; font-weight:800; color:var(--gold); line-height:1.1; }
      .sv-toast-undo { background:rgba(255,255,255,.08); color:var(--text); border:1px solid var(--border); padding:.4rem .7rem; border-radius:8px; font-size:.78rem; font-weight:700; cursor:pointer; }
    `;
    document.head.appendChild(st);
  }

  console.log('[SennereiVerkauf] Modul geladen v' + VERSION);
})();
