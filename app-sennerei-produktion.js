// ══════════════════════════════════════════════════════════════════════════════
//  SENNEREI-TAGESPRODUKTION
//  Erfassung: Datum · Käse · Butter · Spezialitäten · Notiz
//  Übersicht mit Zeitraum-Filter (Woche/Saison/frei)
//  PDF-Export
//  Alle User dürfen eintragen und einsehen.
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '1.0';
  window.SENNEREI_PRODUKTION_VERSION = VERSION;

  // ── State: Zeitraum-Filter ──
  // Optionen: 'this-week', 'last-week', 'season', 'custom'
  window._prodZeitraum = window._prodZeitraum || 'this-week';
  window._prodVon = window._prodVon || null;
  window._prodBis = window._prodBis || null;

  const _EINHEITEN = ['kg', 'L', 'Stk', 'Gläser'];

  // ── Helper: Zeitraum berechnen ──
  function _getZeitraum() {
    const heute = new Date(); heute.setHours(0,0,0,0);
    const zeitraum = window._prodZeitraum || 'this-week';
    let von, bis;
    if(zeitraum === 'this-week') {
      // Sonntag als Wochenstart (0=So, 6=Sa)
      const tag = heute.getDay();
      const diffZuSo = tag;   // 0 wenn heute So, 1 wenn heute Mo etc.
      von = new Date(heute); von.setDate(heute.getDate() - diffZuSo);
      bis = new Date(von); bis.setDate(von.getDate() + 6); bis.setHours(23,59,59,999);
    } else if(zeitraum === 'last-week') {
      const tag = heute.getDay();
      von = new Date(heute); von.setDate(heute.getDate() - tag - 7);
      bis = new Date(von); bis.setDate(von.getDate() + 6); bis.setHours(23,59,59,999);
    } else if(zeitraum === 'season') {
      const start = window.saisonInfo && window.saisonInfo.auftriebDatum
        ? new Date(window.saisonInfo.auftriebDatum) : new Date(heute.getFullYear(), 4, 1);
      von = new Date(start); von.setHours(0,0,0,0);
      bis = new Date(heute); bis.setHours(23,59,59,999);
    } else if(zeitraum === 'custom' && window._prodVon && window._prodBis) {
      von = new Date(window._prodVon + 'T00:00:00');
      bis = new Date(window._prodBis + 'T23:59:59');
    } else {
      // Fallback: diese Woche
      const tag = heute.getDay();
      von = new Date(heute); von.setDate(heute.getDate() - tag);
      bis = new Date(von); bis.setDate(von.getDate() + 6); bis.setHours(23,59,59,999);
    }
    return { von, bis };
  }

  // ── Einträge nach Zeitraum + nach Datum sortiert ──
  function _getEintraege() {
    const { von, bis } = _getZeitraum();
    const alle = Object.entries(window.sennereiProduktion || {}).map(([id, e]) => ({ id, ...e }));
    const gefiltert = alle.filter(e => {
      if(!e.datum) return false;
      const ts = _isoToTs(e.datum);
      return ts >= von.getTime() && ts <= bis.getTime();
    });
    // Sortiert: neuestes zuerst
    gefiltert.sort((a, b) => _isoToTs(b.datum) - _isoToTs(a.datum) || (b.erstelltAm || 0) - (a.erstelltAm || 0));
    return { eintraege: gefiltert, von, bis };
  }

  function _isoToTs(iso) {
    return new Date(iso + 'T12:00:00').getTime();
  }
  function _fmtDatum(iso, opts) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('de-AT', opts || { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' });
  }
  function _isoHeute() {
    return new Date().toISOString().slice(0,10);
  }
  function _fmtZahl(n) {
    if(n == null || n === '' || isNaN(n)) return '–';
    return String(Math.round(parseFloat(n) * 10) / 10).replace('.', ',');
  }

  // ── Summen berechnen ──
  function _summen(eintraege) {
    let sumKaese = 0, sumButter = 0;
    const spezMap = {};   // { 'Graukäse|kg': gesamtMenge }
    eintraege.forEach(e => {
      sumKaese += parseFloat(e.kaeseKg) || 0;
      sumButter += parseFloat(e.butterKg) || 0;
      (e.spezialitaeten || []).forEach(s => {
        if(!s || !s.name) return;
        const key = s.name + '|' + (s.einheit || 'kg');
        spezMap[key] = (spezMap[key] || 0) + (parseFloat(s.menge) || 0);
      });
    });
    const spezArr = Object.entries(spezMap).map(([k, m]) => {
      const [name, einheit] = k.split('|');
      return { name, einheit, menge: m };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return { kaese: sumKaese, butter: sumButter, spezialitaeten: spezArr, tage: eintraege.length };
  }

  // ── HAUPT-VIEW: Übersichts-Seite ──
  window.renderSennereiProduktion = function() {
    const { eintraege, von, bis } = _getEintraege();
    const summ = _summen(eintraege);
    const zeitraum = window._prodZeitraum;
    const isoVon = window._prodVon || von.toISOString().slice(0,10);
    const isoBis = window._prodBis || bis.toISOString().slice(0,10);

    // Zeitraum-Chip-Buttons
    const chip = (val, label) => {
      const active = zeitraum === val;
      return `<button class="filter-chip${active?' active':''}" onclick="_prodSetZeitraum('${val}')">${label}</button>`;
    };

    return `
      <div class="page-header">
        <h2>🧀 Sennerei-Produktion</h2>
        <button class="btn-primary" onclick="_prodNeuerEintrag()">+ Neu</button>
      </div>

      ${_renderSennereiTabs('produktion')}

      <!-- Zeitraum-Auswahl -->
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.6rem .7rem;margin-bottom:.6rem">
        <div style="display:flex;gap:.35rem;flex-wrap:wrap">
          ${chip('this-week','Diese Woche')}
          ${chip('last-week','Letzte Woche')}
          ${chip('season','Ganze Saison')}
          ${chip('custom','Frei wählen')}
        </div>
        ${zeitraum === 'custom' ? `
          <div style="display:flex;gap:.4rem;margin-top:.5rem;align-items:center;font-size:.8rem;color:var(--text3)">
            Von: <input type="date" class="inp" style="width:auto;padding:.3rem .4rem" value="${isoVon}" onchange="_prodSetVon(this.value)"/>
            Bis: <input type="date" class="inp" style="width:auto;padding:.3rem .4rem" value="${isoBis}" onchange="_prodSetBis(this.value)"/>
          </div>` : ''}
        <div style="font-size:.72rem;color:var(--text3);margin-top:.4rem;text-align:center">
          Zeitraum: <b>${von.toLocaleDateString('de-AT')} – ${bis.toLocaleDateString('de-AT')}</b> · ${summ.tage} Eintrag${summ.tage!==1?'ungen':''}
        </div>
      </div>

      <!-- Summen -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:.7rem">
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.6rem .8rem;text-align:center">
          <div style="font-size:.75rem;color:var(--text3);letter-spacing:.05em">🧀 KÄSE GESAMT</div>
          <div style="font-size:1.6rem;color:var(--gold);font-weight:800">${_fmtZahl(summ.kaese)} <span style="font-size:.85rem;color:var(--text3);font-weight:400">kg</span></div>
        </div>
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.6rem .8rem;text-align:center">
          <div style="font-size:.75rem;color:var(--text3);letter-spacing:.05em">🧈 BUTTER GESAMT</div>
          <div style="font-size:1.6rem;color:var(--gold);font-weight:800">${_fmtZahl(summ.butter)} <span style="font-size:.85rem;color:var(--text3);font-weight:400">kg</span></div>
        </div>
      </div>

      ${summ.spezialitaeten.length ? `
      <div class="section-title">✨ Spezialitäten Gesamt</div>
      <div class="card-section" style="padding:.4rem .7rem;margin-bottom:.7rem;font-size:.9rem">
        ${summ.spezialitaeten.map(s => `<div style="display:flex;justify-content:space-between;padding:.25rem 0;border-bottom:1px solid var(--border)"><span>${_esc(s.name)}</span><b style="color:var(--gold)">${_fmtZahl(s.menge)} ${_esc(s.einheit)}</b></div>`).join('')}
      </div>` : ''}

      <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>📋 Einträge (${eintraege.length})</span>
        <button class="btn-xs" onclick="_prodDruckePDF()" title="Zeitraum als PDF drucken">📄 PDF drucken</button>
      </div>
      ${eintraege.length === 0
        ? '<div class="empty-state">Keine Einträge in diesem Zeitraum.<br>Tippe oben auf „+ Neu" um zu starten.</div>'
        : `<div class="card-list">
            ${eintraege.map(e => {
              const spezText = (e.spezialitaeten||[]).filter(s => s && s.name && s.menge).map(s => _esc(s.name) + ' ' + _fmtZahl(s.menge) + ' ' + _esc(s.einheit||'kg')).join(', ');
              return `
              <div class="list-card" style="cursor:pointer" onclick="_prodBearbeiten('${e.id}')">
                <div class="list-card-left"><div>
                  <div class="list-card-title" style="font-weight:700">${_fmtDatum(e.datum)}</div>
                  <div class="list-card-sub" style="font-size:.82rem">🧀 ${_fmtZahl(e.kaeseKg)} kg · 🧈 ${_fmtZahl(e.butterKg)} kg</div>
                  ${spezText ? `<div style="font-size:.72rem;color:var(--text3);margin-top:.15rem">✨ ${spezText}</div>` : ''}
                  ${e.notiz ? `<div style="font-size:.72rem;color:var(--text3);margin-top:.15rem;font-style:italic">📝 ${_esc(e.notiz)}</div>` : ''}
                </div></div>
                <div class="list-card-right" style="display:flex;align-items:center;gap:.3rem">
                  <button class="btn-xs-danger" onclick="event.stopPropagation();_prodLoeschen('${e.id}','${_esc(e.datum)}')">✕</button>
                </div>
              </div>`;
            }).join('')}
          </div>`}
    `;
  };

  function _esc(s) { return String(s||'').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]); }

  // Tab-Bar für Sennerei-Blatt
  function _renderSennereiTabs(active) {
    return `
      <div style="display:flex;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:3px;margin-bottom:.7rem">
        <button onclick="navigate('sennerei')" style="flex:1;padding:.55rem;background:${active==='abholung'?'var(--gold)':'transparent'};color:${active==='abholung'?'#000':'var(--text2)'};border:none;border-radius:7px;font-size:.85rem;font-weight:600;cursor:pointer">📦 Abholung</button>
        <button onclick="navigate('sennerei_produktion')" style="flex:1;padding:.55rem;background:${active==='produktion'?'var(--gold)':'transparent'};color:${active==='produktion'?'#000':'var(--text2)'};border:none;border-radius:7px;font-size:.85rem;font-weight:600;cursor:pointer">🧀 Produktion</button>
      </div>
    `;
  }
  window._renderSennereiTabs = _renderSennereiTabs;

  // ── Zeitraum-Setter ──
  window._prodSetZeitraum = function(val) {
    window._prodZeitraum = val;
    if(val === 'custom' && (!window._prodVon || !window._prodBis)) {
      const { von, bis } = _getZeitraum();
      window._prodVon = von.toISOString().slice(0,10);
      window._prodBis = bis.toISOString().slice(0,10);
    }
    if(typeof render === 'function') render();
  };
  window._prodSetVon = function(v) { window._prodVon = v; if(typeof render === 'function') render(); };
  window._prodSetBis = function(v) { window._prodBis = v; if(typeof render === 'function') render(); };

  // ── ERFASSUNGS-FORMULAR ──
  window._prodNeuerEintrag = function() {
    _showForm(null);
  };
  window._prodBearbeiten = function(id) {
    _showForm(id);
  };

  function _showForm(existingId) {
    const alt = document.getElementById('prod-form');
    if(alt) alt.remove();

    if(!document.getElementById('prod-form-style')) {
      const st = document.createElement('style');
      st.id = 'prod-form-style';
      st.textContent = `
        #prod-form { position:fixed; inset:0; z-index:99500; background:rgba(0,0,0,.7); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; padding:1rem; overflow-y:auto; }
        #prod-form .pf-card { background:var(--bg2); border:1px solid rgba(212,168,75,.3); border-radius:14px; max-width:520px; width:100%; padding:1.2rem; color:var(--text); box-shadow:0 20px 60px rgba(0,0,0,.5); max-height:90vh; overflow-y:auto; }
        #prod-form h3 { color:var(--gold); margin:0 0 .2rem 0; font-size:1.15rem; }
        #prod-form .pf-sub { color:var(--text3); font-size:.8rem; margin-bottom:.9rem; }
        #prod-form label { display:block; font-size:.7rem; letter-spacing:.1em; text-transform:uppercase; color:var(--text3); margin:.7rem 0 .3rem 0; }
        #prod-form input, #prod-form textarea, #prod-form select { width:100%; background:rgba(255,255,255,.05); border:1px solid var(--border); color:var(--text); padding:.6rem .7rem; border-radius:8px; font-size:.95rem; box-sizing:border-box; font-family:inherit; }
        #prod-form textarea { min-height:70px; resize:vertical; }
        #prod-form .pf-tabs { display:flex; gap:3px; background:rgba(255,255,255,.04); padding:3px; border-radius:8px; margin-bottom:.8rem; }
        #prod-form .pf-tab { flex:1; padding:.55rem; background:transparent; border:none; color:var(--text3); font-size:.85rem; font-weight:600; cursor:pointer; border-radius:6px; }
        #prod-form .pf-tab.active { background:var(--gold); color:#000; }
        #prod-form .pf-spez-row { display:flex; gap:.35rem; margin-bottom:.4rem; align-items:center; }
        #prod-form .pf-spez-row input { flex:1; }
        #prod-form .pf-spez-row .menge { width:5rem; flex-shrink:0; }
        #prod-form .pf-spez-row .einheit { width:4.5rem; flex-shrink:0; }
        #prod-form .pf-spez-row .del { background:rgba(220,60,60,.15); color:var(--red); border:1px solid rgba(220,60,60,.35); width:32px; height:38px; border-radius:6px; cursor:pointer; padding:0; flex-shrink:0; }
        #prod-form .pf-btns { display:flex; gap:.5rem; margin-top:1.2rem; }
        #prod-form .pf-btns button { flex:1; padding:.75rem; border-radius:10px; font-size:.95rem; font-weight:600; cursor:pointer; border:none; }
        #prod-form .pf-cancel { background:rgba(255,255,255,.08); color:var(--text); }
        #prod-form .pf-save { background:var(--gold); color:#000; }
        #prod-form .pf-delete { background:rgba(220,60,60,.15); color:var(--red); border:1px solid rgba(220,60,60,.4); }
        #prod-form .pf-save:disabled { opacity:.5; cursor:wait; }
      `;
      document.head.appendChild(st);
    }

    const existing = existingId ? (window.sennereiProduktion || {})[existingId] : null;
    const datumVal = existing?.datum || _isoHeute();
    const kaeseVal = existing?.kaeseKg != null ? existing.kaeseKg : '';
    const butterVal = existing?.butterKg != null ? existing.butterKg : '';
    const notizVal = existing?.notiz || '';
    const spezArr = (existing?.spezialitaeten || []).slice();

    const wrap = document.createElement('div');
    wrap.id = 'prod-form';
    wrap.innerHTML =
      '<div class="pf-card">' +
        '<h3>🧀 ' + (existing ? 'Tagesproduktion bearbeiten' : 'Neue Tagesproduktion') + '</h3>' +
        '<div class="pf-sub">Was wurde an diesem Tag produziert?</div>' +
        '<label>Datum</label>' +
        '<input type="date" id="pf-datum" value="' + datumVal + '" max="' + _isoHeute() + '"/>' +
        '<div class="pf-tabs">' +
          '<button class="pf-tab active" data-tab="std" onclick="_pfSwitchTab(\'std\')">🧀 Standard</button>' +
          '<button class="pf-tab" data-tab="spez" onclick="_pfSwitchTab(\'spez\')">✨ Spezialitäten</button>' +
        '</div>' +
        '<div id="pf-tab-std">' +
          '<label>🧀 Käse (kg)</label>' +
          '<input type="text" inputmode="decimal" id="pf-kaese" value="' + kaeseVal + '" placeholder="z.B. 15,5"/>' +
          '<label>🧈 Butter (kg)</label>' +
          '<input type="text" inputmode="decimal" id="pf-butter" value="' + butterVal + '" placeholder="z.B. 3,2"/>' +
        '</div>' +
        '<div id="pf-tab-spez" style="display:none">' +
          '<label style="display:flex;justify-content:space-between;align-items:center">Spezialitäten <button type="button" onclick="_pfAddSpez()" style="background:var(--gold);color:#000;border:none;padding:.25rem .55rem;border-radius:6px;font-size:.72rem;font-weight:700;cursor:pointer">+ Hinzufügen</button></label>' +
          '<div id="pf-spez-list">' +
            (spezArr.length ? spezArr.map((s,i) => _spezRowHtml(s, i)).join('') : '<div style="color:var(--text3);text-align:center;padding:.7rem 0;font-size:.8rem">Noch keine Spezialitäten. Tipp „+ Hinzufügen".</div>') +
          '</div>' +
        '</div>' +
        '<label>📝 Notiz (optional)</label>' +
        '<textarea id="pf-notiz" placeholder="z.B. Kessel 2 nachmittags, Wetter mild">' + _esc(notizVal) + '</textarea>' +
        '<div class="pf-btns">' +
          '<button class="pf-cancel" onclick="_pfClose()">Abbrechen</button>' +
          (existing ? '<button class="pf-delete" onclick="_pfDelete(\'' + existingId + '\',\'' + datumVal + '\')">Löschen</button>' : '') +
          '<button class="pf-save" onclick="_pfSave(' + (existingId ? '\'' + existingId + '\'' : 'null') + ')">Speichern</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    // Focus auf Käse-Feld
    setTimeout(() => { try { document.getElementById('pf-kaese').focus(); } catch(e){} }, 100);
  }

  function _spezRowHtml(s, i) {
    const einheiten = _EINHEITEN.map(e => `<option value="${e}"${s.einheit===e?' selected':''}>${e}</option>`).join('');
    return `<div class="pf-spez-row" data-idx="${i}">
      <input type="text" class="name" value="${_esc(s.name||'')}" placeholder="z.B. Graukäse"/>
      <input type="text" class="menge" inputmode="decimal" value="${s.menge||''}" placeholder="Menge"/>
      <select class="einheit">${einheiten}</select>
      <button type="button" class="del" onclick="_pfDelSpez(${i})">✕</button>
    </div>`;
  }

  window._pfSwitchTab = function(tab) {
    document.querySelectorAll('#prod-form .pf-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('pf-tab-std').style.display = tab === 'std' ? 'block' : 'none';
    document.getElementById('pf-tab-spez').style.display = tab === 'spez' ? 'block' : 'none';
  };

  window._pfAddSpez = function() {
    const list = document.getElementById('pf-spez-list');
    if(!list) return;
    // Erstes „leer"-Placeholder entfernen falls vorhanden
    if(list.children.length === 1 && list.children[0].tagName === 'DIV' && !list.children[0].classList.contains('pf-spez-row')) {
      list.innerHTML = '';
    }
    const idx = list.querySelectorAll('.pf-spez-row').length;
    const div = document.createElement('div');
    div.innerHTML = _spezRowHtml({name:'', menge:'', einheit:'kg'}, idx);
    list.appendChild(div.firstChild);
  };

  window._pfDelSpez = function(idx) {
    const row = document.querySelector('#pf-spez-list .pf-spez-row[data-idx="' + idx + '"]');
    if(row) row.remove();
    // Wenn leer: Placeholder wieder anzeigen
    const list = document.getElementById('pf-spez-list');
    if(list && !list.querySelector('.pf-spez-row')) {
      list.innerHTML = '<div style="color:var(--text3);text-align:center;padding:.7rem 0;font-size:.8rem">Noch keine Spezialitäten. Tipp „+ Hinzufügen".</div>';
    }
  };

  window._pfClose = function() {
    document.getElementById('prod-form')?.remove();
  };

  window._pfSave = async function(existingId) {
    const btn = document.querySelector('#prod-form .pf-save');
    if(btn) { btn.disabled = true; btn.textContent = '⏳'; }
    try {
      const datum = document.getElementById('pf-datum').value;
      if(!datum) { alert('Bitte Datum wählen'); if(btn) { btn.disabled=false; btn.textContent='Speichern'; } return; }
      const kaeseRaw = (document.getElementById('pf-kaese').value||'').replace(',','.');
      const butterRaw = (document.getElementById('pf-butter').value||'').replace(',','.');
      const kaeseKg = kaeseRaw === '' ? null : parseFloat(kaeseRaw);
      const butterKg = butterRaw === '' ? null : parseFloat(butterRaw);
      if(kaeseKg != null && isNaN(kaeseKg)) { alert('Käse-Wert ungültig'); if(btn) { btn.disabled=false; btn.textContent='Speichern'; } return; }
      if(butterKg != null && isNaN(butterKg)) { alert('Butter-Wert ungültig'); if(btn) { btn.disabled=false; btn.textContent='Speichern'; } return; }
      // Spezialitäten sammeln
      const rows = document.querySelectorAll('#pf-spez-list .pf-spez-row');
      const spezialitaeten = [];
      rows.forEach(r => {
        const name = r.querySelector('.name').value.trim();
        const mengeRaw = r.querySelector('.menge').value.trim().replace(',','.');
        const menge = parseFloat(mengeRaw);
        const einheit = r.querySelector('.einheit').value || 'kg';
        if(name && !isNaN(menge)) spezialitaeten.push({ name, menge, einheit });
      });
      const notiz = document.getElementById('pf-notiz').value.trim();

      const data = {
        datum,
        kaeseKg: kaeseKg,
        butterKg: butterKg,
        spezialitaeten,
        notiz,
        updatedAt: Date.now(),
        erstelltVon: (firebase.auth && firebase.auth().currentUser && firebase.auth().currentUser.email) || null
      };
      const _retry = window.withAuthRetry || (async fn => await fn());
      if(existingId) {
        await _retry(() => firebase.database().ref('sennerei/produktion/' + existingId).update(data));
        window.sennereiProduktion = window.sennereiProduktion || {};
        window.sennereiProduktion[existingId] = { ...(window.sennereiProduktion[existingId] || {}), ...data };
      } else {
        data.erstelltAm = Date.now();
        const pushRef = firebase.database().ref('sennerei/produktion').push();
        const newId = pushRef.key;
        await _retry(() => pushRef.set(data));
        window.sennereiProduktion = window.sennereiProduktion || {};
        window.sennereiProduktion[newId] = data;
      }
      _pfClose();
      if(window.showSaveToast) window.showSaveToast('✓ Produktion ' + new Date(datum + 'T12:00').toLocaleDateString('de-AT') + ' gespeichert');
      if(typeof render === 'function') render();
    } catch(err) {
      console.error('[SennereiProd] Save:', err);
      alert('Fehler beim Speichern:\n\n' + (err.message || err));
      if(btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
    }
  };

  window._pfDelete = async function(id, datum) {
    if(!confirm('Eintrag vom ' + new Date(datum + 'T12:00').toLocaleDateString('de-AT') + ' wirklich löschen?')) return;
    try {
      const _retry = window.withAuthRetry || (async fn => await fn());
      await _retry(() => firebase.database().ref('sennerei/produktion/' + id).remove());
      if(window.sennereiProduktion) delete window.sennereiProduktion[id];
      _pfClose();
      if(window.showSaveToast) window.showSaveToast('✓ Eintrag gelöscht');
      if(typeof render === 'function') render();
    } catch(err) {
      alert('Fehler beim Löschen: ' + (err.message || err));
    }
  };

  window._prodLoeschen = async function(id, datum) {
    _pfDelete(id, datum);
  };

  // ── PDF-DRUCK ──
  window._prodDruckePDF = function() {
    const { eintraege, von, bis } = _getEintraege();
    const summ = _summen(eintraege);
    const almName = (window.saisonInfo && window.saisonInfo.alm) || 'Alm';
    const jahr = (window.saisonInfo && window.saisonInfo.jahr) || new Date().getFullYear();
    const fmtNum = (n) => n == null || isNaN(n) ? '–' : String(Math.round(n*10)/10).replace('.',',');
    const rows = eintraege.slice().reverse().map(e => {
      const spez = (e.spezialitaeten||[]).filter(s=>s&&s.name&&s.menge).map(s => _esc(s.name)+' '+fmtNum(s.menge)+' '+_esc(s.einheit||'kg')).join(', ');
      return '<tr>' +
        '<td>' + _fmtDatum(e.datum, {weekday:'short', day:'2-digit', month:'2-digit', year:'numeric'}) + '</td>' +
        '<td class="r">' + fmtNum(e.kaeseKg) + '</td>' +
        '<td class="r">' + fmtNum(e.butterKg) + '</td>' +
        '<td>' + (spez || '–') + '</td>' +
        '<td>' + (_esc(e.notiz) || '–') + '</td>' +
      '</tr>';
    }).join('');
    const spezSum = summ.spezialitaeten.map(s => _esc(s.name)+': <b>'+fmtNum(s.menge)+' '+_esc(s.einheit)+'</b>').join(' &nbsp;·&nbsp; ');
    const html =
      '<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Sennerei-Produktion ' + almName + '</title>' +
      '<style>' +
        'body{font-family:Georgia,serif;color:#222;padding:24px;max-width:900px;margin:0 auto}' +
        'h1{color:#6a4a10;border-bottom:2px solid #d4a84b;padding-bottom:8px;margin-bottom:14px}' +
        'h2{color:#8b6914;margin-top:22px;font-size:1.05rem;border-bottom:1px solid #eee;padding-bottom:4px}' +
        '.meta{color:#666;font-size:12px;margin-bottom:16px}' +
        '.summ{background:#fff9e5;border-left:4px solid #d4a84b;padding:10px 14px;margin-bottom:16px;font-size:14px}' +
        '.summ b{color:#8b6914;font-size:16px}' +
        'table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:16px}' +
        'th{background:#f0e0b0;text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#5a4010;border-bottom:2px solid #d4a84b}' +
        'td{padding:5px 8px;border-bottom:1px solid #eee;vertical-align:top}' +
        'td.r{text-align:right;font-family:monospace}' +
        '.footer{margin-top:24px;padding-top:8px;border-top:1px solid #eee;color:#999;font-size:10px;text-align:center;font-style:italic}' +
        '@media print{body{padding:0}}' +
      '</style></head><body>' +
      '<h1>🧀 Sennerei-Produktion — ' + _esc(almName) + '</h1>' +
      '<div class="meta">Saison ' + _esc(String(jahr)) + ' &nbsp;·&nbsp; Zeitraum: <b>' + von.toLocaleDateString('de-AT') + ' – ' + bis.toLocaleDateString('de-AT') + '</b> &nbsp;·&nbsp; Erstellt: ' + new Date().toLocaleString('de-AT') + '</div>' +
      '<div class="summ">' +
        '🧀 Käse gesamt: <b>' + fmtNum(summ.kaese) + ' kg</b> &nbsp;·&nbsp; ' +
        '🧈 Butter gesamt: <b>' + fmtNum(summ.butter) + ' kg</b>' +
        (spezSum ? '<br>✨ Spezialitäten: ' + spezSum : '') +
      '</div>' +
      '<h2>📋 Einzelne Einträge (' + eintraege.length + ')</h2>' +
      (eintraege.length ?
        '<table>' +
          '<thead><tr><th>Datum</th><th style="text-align:right">Käse (kg)</th><th style="text-align:right">Butter (kg)</th><th>Spezialitäten</th><th>Notiz</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>'
        : '<p style="color:#999;font-style:italic">Keine Einträge in diesem Zeitraum.</p>') +
      '<div class="footer">HerdenPro · Sennerei-Produktion · Automatisch generiert</div>' +
      '<script>setTimeout(()=>window.print(), 300);<\/script>' +
      '</body></html>';
    const w = window.open('', '_blank');
    if(!w) { alert('Popup wurde blockiert. Bitte in den Browser-Einstellungen für diese Seite erlauben.'); return; }
    w.document.write(html);
    w.document.close();
  };

  console.log('[SennereiProd] Modul geladen v' + VERSION);
})();
