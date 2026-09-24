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
  // ⚠ kesselmilch ist ein isoliertes Anzeige-Feld — wird NUR hier in der Sennerei-Produktion
  //   summiert und angezeigt, NIEMALS für andere Berechnungen (Carry-Forward, Molkerei, etc.)
  //   weiterverarbeitet.
  function _summen(eintraege) {
    let sumKaese = 0, sumButter = 0, sumKesselmilch = 0, ausbKm = 0, ausbKaese = 0;
    const spezMap = {};   // { 'Graukäse|kg': gesamtMenge }
    eintraege.forEach(e => {
      sumKaese += parseFloat(e.kaeseKg) || 0;
      sumButter += parseFloat(e.butterKg) || 0;
      sumKesselmilch += parseFloat(e.kesselmilchL) || 0;
      if((parseFloat(e.kesselmilchL) || 0) > 0 && (parseFloat(e.kaeseKg) || 0) > 0) { ausbKm += parseFloat(e.kesselmilchL); ausbKaese += parseFloat(e.kaeseKg); }
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
    return { ausbKm, ausbKaese, kaese: sumKaese, butter: sumButter, kesselmilch: sumKesselmilch, spezialitaeten: spezArr, tage: eintraege.length };
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

      <!-- Kesselmilch (isolierte Anzeige — nur hier, keine anderen Berechnungen) -->
      <div style="background:linear-gradient(90deg,rgba(122,203,255,.12),rgba(122,203,255,.04));border:1px solid rgba(122,203,255,.35);border-radius:10px;padding:.7rem .9rem;margin-bottom:.6rem;text-align:center">
        <div style="font-size:.72rem;color:#7acbff;letter-spacing:.08em;font-weight:700">🥛 KESSELMILCH GESAMT</div>
        <div style="font-size:1.9rem;color:#7acbff;font-weight:900;line-height:1.1">${_fmtZahl(summ.kesselmilch)} <span style="font-size:.85rem;color:rgba(122,203,255,.6);font-weight:400">L</span></div>
        ${(summ.ausbKm > 0 && summ.ausbKaese > 0) ? `<div style="font-size:.8rem;color:#7acbff;margin-top:.25rem">🧀 Käse-Ausbeute: <b>${_fmtZahl(Math.round(summ.ausbKm / summ.ausbKaese * 10) / 10)} L Milch pro kg Käse</b> · ${_fmtZahl(Math.round(summ.ausbKaese / summ.ausbKm * 1000) / 10)} kg aus 100 L</div>` : ''}
      </div>

      <!-- Summen Käse + Butter -->
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
              const spezText = (e.spezialitaeten||[]).filter(s => s && s.name && s.menge).map(s => _esc(s.name) + ' ' + _fmtZahl(s.menge) + ' ' + _esc(s.einheit||'kg') + (s.charge?' ['+_esc(s.charge)+']':'')).join(', ');
              const chargeText = [
                e.kaeseCharge ? '🧀 ['+_esc(e.kaeseCharge)+']' : '',
                e.butterCharge ? '🧈 ['+_esc(e.butterCharge)+']' : ''
              ].filter(Boolean).join(' · ');
              const kmText = (e.kesselmilchL != null && e.kesselmilchL > 0)
                ? `<div style="font-size:.75rem;color:#7acbff;font-weight:600;margin-bottom:.1rem">🥛 Kesselmilch: ${_fmtZahl(e.kesselmilchL)} L${(e.kaeseKg > 0) ? ' · Ausbeute ' + _fmtZahl(Math.round(e.kesselmilchL / e.kaeseKg * 10) / 10) + ' L/kg' : ''}</div>`
                : '';
              return `
              <div class="list-card" style="cursor:pointer" onclick="_prodBearbeiten('${e.id}')">
                <div class="list-card-left"><div>
                  <div class="list-card-title" style="font-weight:700">${_fmtDatum(e.datum)}</div>
                  ${kmText}
                  <div class="list-card-sub" style="font-size:.82rem">🧀 ${_fmtZahl(e.kaeseKg)} kg · 🧈 ${_fmtZahl(e.butterKg)} kg</div>
                  ${chargeText ? `<div style="font-size:.7rem;color:var(--text3);margin-top:.15rem">${chargeText}</div>` : ''}
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
    const btn = (route, actKey, icon, label) => {
      const isActive = active === actKey;
      return `<button onclick="navigate('${route}')" style="flex:1;padding:.55rem .3rem;background:${isActive?'var(--gold)':'transparent'};color:${isActive?'#000':'var(--text2)'};border:none;border-radius:7px;font-size:.78rem;font-weight:600;cursor:pointer;white-space:nowrap">${icon} ${label}</button>`;
    };
    return `
      <div style="display:flex;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:3px;margin-bottom:.7rem;gap:2px">
        ${btn('sennerei', 'abholung', '📦', 'Abholung')}
        ${btn('sennerei_produktion', 'produktion', '🧀', 'Produktion')}
        ${btn('sennerei_verkauf', 'verkauf', '💰', 'Verkauf')}
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

  // Helper: sammelt alle bisher benutzten Spezialitäten-Namen mit letzten Einheiten aus der Historie.
  // Sortiert nach Häufigkeit (meistgenutzte zuerst).
  function _sammleSpezVorlagen() {
    const einträge = window.sennereiProduktion || {};
    const zaehler = {};   // { name+'|'+einheit: {name, einheit, count, lastUsed} }
    Object.values(einträge).forEach(e => {
      (e.spezialitaeten || []).forEach(s => {
        if(!s || !s.name) return;
        const key = s.name.trim() + '|' + (s.einheit || 'kg');
        if(!zaehler[key]) zaehler[key] = { name: s.name.trim(), einheit: s.einheit || 'kg', count: 0, lastUsed: 0 };
        zaehler[key].count += 1;
        const ts = e.datumTs || (e.datum ? _isoToTs(e.datum) : 0);
        if(ts > zaehler[key].lastUsed) zaehler[key].lastUsed = ts;
      });
    });
    return Object.values(zaehler).sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);
  }

  function _showForm(existingId) {
    const alt = document.getElementById('prod-form');
    if(alt) alt.remove();

    if(!document.getElementById('prod-form-style')) {
      const st = document.createElement('style');
      st.id = 'prod-form-style';
      st.textContent = `
        /* FULLSCREEN-Overlay statt zentriertem Popup */
        #prod-form { position:fixed; inset:0; z-index:99500; background:var(--bg,#0c1a09); display:flex; flex-direction:column; overflow:hidden; }
        #prod-form .pf-head { background:linear-gradient(180deg,#152912,#0c1a09); border-bottom:1px solid rgba(212,168,75,.3); padding:.7rem 1rem; display:flex; align-items:center; justify-content:space-between; gap:.5rem; flex-shrink:0; box-shadow:0 2px 12px rgba(0,0,0,.3); }
        #prod-form .pf-title { font-family:Georgia,serif; font-size:1.1rem; color:var(--gold,#d4a84b); font-weight:700; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #prod-form .pf-head-save { background:var(--gold,#d4a84b); color:#000; border:none; padding:.55rem 1rem; border-radius:10px; font-size:.9rem; font-weight:800; cursor:pointer; font-family:inherit; white-space:nowrap; box-shadow:0 2px 8px rgba(212,168,75,.35); }
        #prod-form .pf-head-save:disabled { opacity:.5; cursor:wait; }
        #prod-form .pf-close { background:transparent; border:none; color:var(--text3,#888); font-size:1.8rem; cursor:pointer; padding:.2rem .5rem; line-height:1; }
        #prod-form .pf-body { flex:1; overflow-y:auto; padding:1rem; padding-bottom:6rem; -webkit-overflow-scrolling:touch; }
        #prod-form .pf-datum { display:flex; align-items:center; gap:.6rem; margin-bottom:1.2rem; padding:.6rem .8rem; background:rgba(212,168,75,.06); border:1px solid rgba(212,168,75,.25); border-radius:10px; }
        #prod-form .pf-datum label { font-size:.72rem; letter-spacing:.1em; text-transform:uppercase; color:var(--text3,#888); margin:0; white-space:nowrap; }
        #prod-form .pf-datum input { flex:1; background:transparent; border:none; color:var(--text,#eee); padding:.4rem 0; font-size:1rem; font-family:inherit; text-align:right; }

        #prod-form .pf-tabs { display:flex; gap:4px; background:rgba(255,255,255,.04); padding:4px; border-radius:12px; margin-bottom:1.2rem; }
        #prod-form .pf-tab { flex:1; padding:.75rem; background:transparent; border:none; color:var(--text3,#888); font-size:.95rem; font-weight:700; cursor:pointer; border-radius:9px; font-family:inherit; }
        #prod-form .pf-tab.active { background:var(--gold,#d4a84b); color:#000; box-shadow:0 2px 8px rgba(212,168,75,.4); }

        #prod-form .pf-field { margin-bottom:1.4rem; }
        #prod-form .pf-kesselmilch-field { padding:.7rem .8rem .8rem; background:linear-gradient(180deg,rgba(122,203,255,.06),rgba(122,203,255,.02)); border:1px solid rgba(122,203,255,.25); border-radius:12px; margin-bottom:1.6rem; }
        #prod-form .pf-kesselmilch-field .pf-flabel .icon { color:#7acbff; }
        #prod-form .pf-flabel { display:flex; align-items:center; justify-content:space-between; font-size:.75rem; letter-spacing:.08em; text-transform:uppercase; color:var(--text3,#888); margin-bottom:.4rem; font-weight:600; }
        #prod-form .pf-flabel .icon { font-size:1.2rem; margin-right:.35rem; }
        #prod-form .pf-input-wrap { display:flex; align-items:center; background:rgba(255,255,255,.05); border:2px solid var(--border,#333); border-radius:12px; padding:.4rem .7rem; transition:border-color .15s; }
        #prod-form .pf-input-wrap:focus-within { border-color:var(--gold,#d4a84b); background:rgba(212,168,75,.06); }
        #prod-form .pf-input-wrap input { flex:1; background:transparent; border:none; color:var(--text,#eee); font-size:2rem; font-weight:800; padding:.6rem 0; text-align:right; outline:none; font-family:inherit; min-width:0; }
        #prod-form .pf-input-wrap .unit { font-size:1.1rem; color:var(--text3,#888); margin-left:.4rem; font-weight:600; }

        /* Charge-Zeile unter dem kg-Feld */
        #prod-form .pf-charge-wrap { display:flex; align-items:center; gap:.5rem; margin-top:.5rem; background:rgba(255,255,255,.03); border:1px solid var(--border,#333); border-radius:10px; padding:.4rem .7rem; }
        #prod-form .pf-charge-wrap .pf-charge-label { font-size:.72rem; color:var(--text3,#888); letter-spacing:.05em; text-transform:uppercase; white-space:nowrap; }
        #prod-form .pf-charge-wrap input { flex:1; background:transparent; border:none; color:var(--text,#eee); padding:.4rem 0; font-size:.95rem; font-family:inherit; outline:none; text-align:right; }
        #prod-form .pf-charge-wrap input:focus { color:var(--gold); }

        /* Spezialitäten-Vorlagen (Chips) */
        #prod-form .pf-vorlagen-label { font-size:.72rem; color:var(--text3,#888); letter-spacing:.08em; text-transform:uppercase; margin-bottom:.4rem; }
        #prod-form .pf-vorlagen { display:flex; flex-wrap:wrap; gap:.35rem; margin-bottom:1rem; padding-bottom:.9rem; border-bottom:1px solid var(--border,#333); }
        #prod-form .pf-vorlage { padding:.55rem .8rem; background:rgba(212,168,75,.1); color:var(--gold,#d4a84b); border:1.5px solid rgba(212,168,75,.35); border-radius:10px; font-size:.85rem; font-weight:700; cursor:pointer; font-family:inherit; -webkit-tap-highlight-color:transparent; transition:transform .07s, background .15s; }
        #prod-form .pf-vorlage:active { transform:scale(.94); background:rgba(212,168,75,.3); color:#000; }

        #prod-form .pf-notiz { width:100%; background:rgba(255,255,255,.05); border:2px solid var(--border,#333); border-radius:12px; color:var(--text,#eee); padding:.75rem 1rem; font-size:1rem; font-family:inherit; min-height:80px; resize:vertical; box-sizing:border-box; }
        #prod-form .pf-notiz:focus { outline:none; border-color:var(--gold,#d4a84b); }

        #prod-form .pf-spez-row { display:flex; flex-wrap:wrap; gap:.35rem; margin-bottom:.5rem; align-items:center; background:rgba(255,255,255,.03); border:1px solid var(--border,#333); border-radius:10px; padding:.5rem; }
        #prod-form .pf-spez-row input, #prod-form .pf-spez-row select { background:rgba(255,255,255,.05); border:1px solid var(--border,#333); color:var(--text,#eee); padding:.55rem .6rem; border-radius:8px; font-size:.95rem; font-family:inherit; box-sizing:border-box; }
        #prod-form .pf-spez-row .row1 { display:flex; gap:.35rem; align-items:center; width:100%; }
        #prod-form .pf-spez-row .row2 { display:flex; gap:.35rem; align-items:center; width:100%; }
        #prod-form .pf-spez-row input.name { flex:1; min-width:0; }
        #prod-form .pf-spez-row input.menge { width:5.5rem; flex-shrink:0; text-align:center; font-weight:700; }
        #prod-form .pf-spez-row select.einheit { width:5rem; flex-shrink:0; }
        #prod-form .pf-spez-row input.charge { flex:1; min-width:0; }
        #prod-form .pf-spez-row .charge-label { font-size:.72rem; color:var(--text3,#888); letter-spacing:.05em; text-transform:uppercase; padding-left:.2rem; white-space:nowrap; }
        #prod-form .pf-spez-row .del { background:rgba(220,60,60,.15); color:var(--red,#dc3c3c); border:1px solid rgba(220,60,60,.35); width:36px; height:40px; border-radius:8px; cursor:pointer; padding:0; flex-shrink:0; font-size:1rem; align-self:flex-start; }

        #prod-form .pf-add-spez { width:100%; padding:.85rem; background:rgba(212,168,75,.1); color:var(--gold,#d4a84b); border:1.5px dashed rgba(212,168,75,.4); border-radius:12px; font-size:.95rem; font-weight:700; cursor:pointer; font-family:inherit; margin-top:.5rem; }

        /* Sticky footer mit Buttons */
        #prod-form .pf-foot { position:sticky; bottom:0; background:linear-gradient(180deg,transparent,var(--bg,#0c1a09) 25%); padding:1rem; padding-top:1.5rem; border-top:1px solid rgba(212,168,75,.15); flex-shrink:0; display:flex; gap:.5rem; }
        #prod-form .pf-foot button { padding:1rem; border-radius:12px; font-size:1rem; font-weight:700; cursor:pointer; border:none; font-family:inherit; }
        #prod-form .pf-cancel { flex:1; background:rgba(255,255,255,.08); color:var(--text,#eee); }
        #prod-form .pf-save { flex:2; background:var(--gold,#d4a84b); color:#000; }
        #prod-form .pf-save:disabled { opacity:.5; cursor:wait; }
        #prod-form .pf-delete { flex:1; background:rgba(220,60,60,.15); color:var(--red,#dc3c3c); border:1px solid rgba(220,60,60,.4); }
      `;
      document.head.appendChild(st);
    }

    const existing = existingId ? (window.sennereiProduktion || {})[existingId] : null;
    const datumVal = existing?.datum || _isoHeute();
    // ⚠ KESSELMILCH ist ein ISOLIERTES Feld nur für dieses Blatt.
    // Wird NIE für Carry-Forward-Berechnungen, Molkerei-Abrechnung, Verworfen o.ä. verwendet.
    // Nur Anzeige + PDF hier.
    const kesselmilchVal = existing?.kesselmilchL != null ? existing.kesselmilchL : '';
    const kaeseVal = existing?.kaeseKg != null ? existing.kaeseKg : '';
    const butterVal = existing?.butterKg != null ? existing.butterKg : '';
    const kaeseChargeVal = existing?.kaeseCharge || '';
    const butterChargeVal = existing?.butterCharge || '';
    const notizVal = existing?.notiz || '';
    const spezArr = (existing?.spezialitaeten || []).slice();

    // Bestehende Spezialitäten-Vorlagen aus Historie
    const vorlagen = _sammleSpezVorlagen();
    const vorlagenChips = vorlagen.length
      ? '<div class="pf-vorlagen-label">Häufige Spezialitäten · Tap = hinzufügen</div>' +
        '<div class="pf-vorlagen">' + vorlagen.slice(0, 12).map(v =>
          `<button type="button" class="pf-vorlage" onclick="_pfAddSpezVorlage(${JSON.stringify(v.name).replace(/"/g,'&quot;')},'${_esc(v.einheit)}')">${_esc(v.name)} <span style="opacity:.65;font-weight:400">(${_esc(v.einheit)})</span></button>`
        ).join('') + '</div>'
      : '';

    const wrap = document.createElement('div');
    wrap.id = 'prod-form';
    wrap.innerHTML =
      // Header (sticky top) mit Speichern-Button — immer sichtbar auch bei offener Tastatur
      '<div class="pf-head">' +
        '<div class="pf-title">🧀 ' + (existing ? 'Bearbeiten' : 'Tagesproduktion') + '</div>' +
        '<button class="pf-head-save" onclick="_pfSave(' + (existingId ? '\'' + existingId + '\'' : 'null') + ')">✓ Speichern</button>' +
        '<button class="pf-close" onclick="_pfClose()" title="Schließen">✕</button>' +
      '</div>' +
      // Body (scrollable)
      '<div class="pf-body">' +
        // Datum-Zeile
        '<div class="pf-datum">' +
          '<label>Datum</label>' +
          '<input type="date" id="pf-datum" value="' + datumVal + '" max="' + _isoHeute() + '"/>' +
        '</div>' +
        // Tabs
        '<div class="pf-tabs">' +
          '<button class="pf-tab active" data-tab="std" onclick="_pfSwitchTab(\'std\')">🧀 Standard</button>' +
          '<button class="pf-tab" data-tab="spez" onclick="_pfSwitchTab(\'spez\')">✨ Spezialitäten</button>' +
        '</div>' +
        // Tab Standard
        '<div id="pf-tab-std">' +
          // Kesselmilch (GANZ OBEN, isoliert — wird NIE für andere Berechnungen verwendet)
          '<div class="pf-field pf-kesselmilch-field">' +
            '<div class="pf-flabel"><span><span class="icon">🥛</span>Kesselmilch</span><span style="color:var(--gold);text-transform:none;letter-spacing:0">L</span></div>' +
            '<div class="pf-input-wrap">' +
              '<input type="text" inputmode="decimal" id="pf-kesselmilch" value="' + kesselmilchVal + '" placeholder="0"/>' +
              '<span class="unit">L</span>' +
            '</div>' +
          '</div>' +
          // Käse
          '<div class="pf-field">' +
            '<div class="pf-flabel"><span><span class="icon">🧀</span>Käse produziert</span><span style="color:var(--gold);text-transform:none;letter-spacing:0">kg</span></div>' +
            '<div class="pf-input-wrap">' +
              '<input type="text" inputmode="decimal" id="pf-kaese" value="' + kaeseVal + '" placeholder="0"/>' +
              '<span class="unit">kg</span>' +
            '</div>' +
            '<div class="pf-charge-wrap">' +
              '<span class="pf-charge-label">Charge</span>' +
              '<input type="text" id="pf-kaese-charge" value="' + _esc(kaeseChargeVal) + '" placeholder="z.B. K-2026-37"/>' +
            '</div>' +
          '</div>' +
          // Butter
          '<div class="pf-field">' +
            '<div class="pf-flabel"><span><span class="icon">🧈</span>Butter produziert</span><span style="color:var(--gold);text-transform:none;letter-spacing:0">kg</span></div>' +
            '<div class="pf-input-wrap">' +
              '<input type="text" inputmode="decimal" id="pf-butter" value="' + butterVal + '" placeholder="0"/>' +
              '<span class="unit">kg</span>' +
            '</div>' +
            '<div class="pf-charge-wrap">' +
              '<span class="pf-charge-label">Charge</span>' +
              '<input type="text" id="pf-butter-charge" value="' + _esc(butterChargeVal) + '" placeholder="z.B. B-2026-37"/>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // Tab Spezialitäten
        '<div id="pf-tab-spez" style="display:none">' +
          vorlagenChips +
          '<div id="pf-spez-list">' +
            (spezArr.length
              ? spezArr.map((s,i) => _spezRowHtml(s, i)).join('')
              : (vorlagen.length
                  ? '<div style="color:var(--text3);text-align:center;padding:.9rem 0;font-size:.85rem">Vorlage antippen oder unten „+ Spezialität hinzufügen"</div>'
                  : '<div style="color:var(--text3);text-align:center;padding:1.2rem 0;font-size:.9rem">Noch keine Spezialitäten.</div>')
            ) +
          '</div>' +
          '<button type="button" class="pf-add-spez" onclick="_pfAddSpez()">+ Spezialität hinzufügen</button>' +
        '</div>' +
        // Notiz (immer sichtbar am Ende)
        '<div class="pf-field" style="margin-top:1.5rem">' +
          '<div class="pf-flabel"><span>📝 Notiz (optional)</span></div>' +
          '<textarea class="pf-notiz" id="pf-notiz" placeholder="z.B. Kessel 2 nachmittags, Wetter mild">' + _esc(notizVal) + '</textarea>' +
        '</div>' +
      '</div>' +
      // Footer (sticky bottom)
      '<div class="pf-foot">' +
        '<button class="pf-cancel" onclick="_pfClose()">Abbrechen</button>' +
        (existing ? '<button class="pf-delete" onclick="_pfDelete(\'' + existingId + '\',\'' + datumVal + '\')">Löschen</button>' : '') +
        '<button class="pf-save" onclick="_pfSave(' + (existingId ? '\'' + existingId + '\'' : 'null') + ')">✓ Speichern</button>' +
      '</div>';
    document.body.appendChild(wrap);
    // KEIN Auto-Fokus (verhindert dass Tastatur sofort aufgeht)
  }

  function _fmtNum(n) {
    if(Number.isInteger(n)) return String(n);
    return String(n).replace('.', ',');
  }

  // Spezialität aus Vorlage hinzufügen (Menge leer, muss noch eingegeben werden)
  window._pfAddSpezVorlage = function(name, einheit) {
    const list = document.getElementById('pf-spez-list');
    if(!list) return;
    if(list.querySelector('.empty-state, [style*="text-align:center"]')) {
      list.innerHTML = '';
    }
    const idx = list.querySelectorAll('.pf-spez-row').length;
    const div = document.createElement('div');
    div.innerHTML = _spezRowHtml({name, menge:'', einheit, charge:''}, idx);
    list.appendChild(div.firstChild);
    // Fokus auf Menge-Feld der neuen Zeile
    setTimeout(() => {
      const rows = list.querySelectorAll('.pf-spez-row');
      const last = rows[rows.length-1];
      if(last) { const menge = last.querySelector('.menge'); if(menge) menge.focus(); }
    }, 60);
    if(navigator.vibrate) navigator.vibrate(12);
  };

  function _spezRowHtml(s, i) {
    const einheiten = _EINHEITEN.map(e => `<option value="${e}"${s.einheit===e?' selected':''}>${e}</option>`).join('');
    return `<div class="pf-spez-row" data-idx="${i}">
      <div class="row1">
        <input type="text" class="name" value="${_esc(s.name||'')}" placeholder="z.B. Graukäse"/>
        <input type="text" class="menge" inputmode="decimal" value="${s.menge||''}" placeholder="Menge"/>
        <select class="einheit">${einheiten}</select>
        <button type="button" class="del" onclick="_pfDelSpez(${i})">✕</button>
      </div>
      <div class="row2">
        <span class="charge-label">Charge</span>
        <input type="text" class="charge" value="${_esc(s.charge||'')}" placeholder="z.B. G-2026-37"/>
      </div>
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
    // Beide Speichern-Buttons ansprechen (Footer + Header)
    const btns = document.querySelectorAll('#prod-form .pf-save, #prod-form .pf-head-save');
    btns.forEach(b => { b.disabled = true; b._origText = b.textContent; b.textContent = '⏳'; });
    const btn = btns[0];   // für Fehler-Restore-Text
    try {
      const datum = document.getElementById('pf-datum').value;
      if(!datum) { alert('Bitte Datum wählen'); btns.forEach(b => { b.disabled=false; b.textContent = b._origText || (b.classList.contains('pf-head-save') ? '✓ Speichern' : '✓ Speichern'); }); return; }
      const kaeseRaw = (document.getElementById('pf-kaese').value||'').replace(',','.');
      const butterRaw = (document.getElementById('pf-butter').value||'').replace(',','.');
      const kaeseKg = kaeseRaw === '' ? null : parseFloat(kaeseRaw);
      const butterKg = butterRaw === '' ? null : parseFloat(butterRaw);
      if(kaeseKg != null && isNaN(kaeseKg)) { alert('Käse-Wert ungültig'); btns.forEach(b => { b.disabled=false; b.textContent = b._origText || (b.classList.contains('pf-head-save') ? '✓ Speichern' : '✓ Speichern'); }); return; }
      if(butterKg != null && isNaN(butterKg)) { alert('Butter-Wert ungültig'); btns.forEach(b => { b.disabled=false; b.textContent = b._origText || (b.classList.contains('pf-head-save') ? '✓ Speichern' : '✓ Speichern'); }); return; }
      // Kesselmilch (ISOLIERT — nur für dieses Blatt, nie für andere Berechnungen)
      const kesselmilchRaw = (document.getElementById('pf-kesselmilch')?.value || '').replace(',','.');
      const kesselmilchL = kesselmilchRaw === '' ? null : parseFloat(kesselmilchRaw);
      if(kesselmilchL != null && isNaN(kesselmilchL)) { alert('Kesselmilch-Wert ungültig'); btns.forEach(b => { b.disabled=false; b.textContent = b._origText || (b.classList.contains('pf-head-save') ? '✓ Speichern' : '✓ Speichern'); }); return; }
      // Chargen
      const kaeseCharge = (document.getElementById('pf-kaese-charge')?.value || '').trim();
      const butterCharge = (document.getElementById('pf-butter-charge')?.value || '').trim();
      // Spezialitäten sammeln
      const rows = document.querySelectorAll('#pf-spez-list .pf-spez-row');
      const spezialitaeten = [];
      rows.forEach(r => {
        const name = r.querySelector('.name').value.trim();
        const mengeRaw = r.querySelector('.menge').value.trim().replace(',','.');
        const menge = parseFloat(mengeRaw);
        const einheit = r.querySelector('.einheit').value || 'kg';
        const charge = (r.querySelector('.charge')?.value || '').trim();
        if(name && !isNaN(menge)) spezialitaeten.push({ name, menge, einheit, charge });
      });
      const notiz = document.getElementById('pf-notiz').value.trim();

      const data = {
        datum,
        datumTs: _isoToTs(datum),
        // ⚠ ISOLIERTES FELD — nur Sennerei-Produktion-Blatt, NIE für andere Rechnungen
        kesselmilchL: kesselmilchL,
        kaeseKg: kaeseKg,
        kaeseCharge: kaeseCharge || null,
        butterKg: butterKg,
        butterCharge: butterCharge || null,
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
      btns.forEach(b => { b.disabled=false; b.textContent = b._origText || '✓ Speichern'; });
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

  // ── PDF-DRUCK: separate Tabelle pro Produkt (Käse / Butter / je Spezialität) ──
  window._prodDruckePDF = function() {
    const { eintraege, von, bis } = _getEintraege();
    const almName = (window.saisonInfo && window.saisonInfo.alm) || 'Alm';
    const jahr = (window.saisonInfo && window.saisonInfo.jahr) || new Date().getFullYear();
    const fmtNum = (n) => n == null || isNaN(n) ? '–' : String(Math.round(n*10)/10).replace('.',',');
    // Chronologisch aufsteigend
    const chron = eintraege.slice().sort((a,b) => _isoToTs(a.datum) - _isoToTs(b.datum));

    // ── Tabelle bauen (generische Helper) ──
    function _buildProduktTabelle(icon, produktName, einheit, extractor) {
      // extractor: (eintrag) => { menge, charge, notiz } | null
      const zeilen = [];
      let summe = 0;
      chron.forEach(e => {
        const val = extractor(e);
        if(!val || val.menge == null || val.menge === '' || isNaN(val.menge) || val.menge <= 0) return;
        zeilen.push({
          datum: e.datum,
          menge: val.menge,
          charge: val.charge || '',
          notiz: val.notiz || e.notiz || ''
        });
        summe += val.menge;
      });
      if(!zeilen.length) return '';
      const rows = zeilen.map(z => {
        return '<tr>' +
          '<td>' + _fmtDatum(z.datum, {weekday:'short', day:'2-digit', month:'2-digit', year:'numeric'}) + '</td>' +
          '<td class="r">' + fmtNum(z.menge) + '</td>' +
          '<td>' + (z.charge ? _esc(z.charge) : '<span style="color:#bbb">–</span>') + '</td>' +
          '<td>' + (z.notiz ? _esc(z.notiz) : '<span style="color:#bbb">–</span>') + '</td>' +
        '</tr>';
      }).join('');
      return '<h2>' + icon + ' ' + _esc(produktName) + '</h2>' +
        '<table>' +
          '<thead><tr>' +
            '<th style="width:22%">Datum</th>' +
            '<th style="width:15%;text-align:right">Menge (' + _esc(einheit) + ')</th>' +
            '<th style="width:23%">Charge</th>' +
            '<th>Notiz</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
          '<tfoot><tr>' +
            '<td style="font-weight:700;text-align:right;padding-top:8px">SUMME</td>' +
            '<td class="r" style="font-weight:800;color:#8b6914;font-size:14px;padding-top:8px">' + fmtNum(summe) + ' ' + _esc(einheit) + '</td>' +
            '<td colspan="2" style="border-top:2px solid #d4a84b;padding-top:8px"></td>' +
          '</tr></tfoot>' +
        '</table>';
    }

    // Kesselmilch-Tabelle GANZ OBEN (isoliert — nur hier, keine anderen Rechnungen)
    let tables = _buildProduktTabelle('🥛', 'Kesselmilch', 'L', (e) => ({
      menge: e.kesselmilchL
    }));
    // Käse-Tabelle
    tables += _buildProduktTabelle('🧀', 'Käse', 'kg', (e) => ({
      menge: e.kaeseKg, charge: e.kaeseCharge
    }));
    // Butter-Tabelle
    tables += _buildProduktTabelle('🧈', 'Butter', 'kg', (e) => ({
      menge: e.butterKg, charge: e.butterCharge
    }));

    // Für jede Spezialität eigene Tabelle
    // Erst alle vorkommenden Spez-Namen (name+einheit) sammeln
    const spezKeys = {};   // { name+'|'+einheit: {name, einheit} }
    chron.forEach(e => {
      (e.spezialitaeten||[]).forEach(s => {
        if(!s || !s.name || s.menge == null || isNaN(s.menge) || s.menge <= 0) return;
        const key = s.name.trim() + '|' + (s.einheit || 'kg');
        if(!spezKeys[key]) spezKeys[key] = { name: s.name.trim(), einheit: s.einheit || 'kg' };
      });
    });
    Object.values(spezKeys).sort((a,b) => a.name.localeCompare(b.name)).forEach(sp => {
      tables += _buildProduktTabelle('✨', sp.name, sp.einheit, (e) => {
        const match = (e.spezialitaeten||[]).find(s => s && s.name && s.name.trim() === sp.name && (s.einheit || 'kg') === sp.einheit);
        return match ? { menge: match.menge, charge: match.charge, notiz: e.notiz } : null;
      });
    });

    if(!tables) tables = '<p style="color:#999;font-style:italic">Keine Einträge in diesem Zeitraum.</p>';

    const html =
      '<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Sennerei-Produktion ' + almName + '</title>' +
      '<style>' +
        'body{font-family:Georgia,serif;color:#222;padding:24px;max-width:900px;margin:0 auto}' +
        'h1{color:#6a4a10;border-bottom:2px solid #d4a84b;padding-bottom:8px;margin-bottom:14px}' +
        'h2{color:#8b6914;margin-top:26px;margin-bottom:8px;font-size:1.15rem;padding:4px 10px;background:#fff4d0;border-radius:6px 6px 0 0;border-left:4px solid #d4a84b}' +
        '.meta{color:#666;font-size:12px;margin-bottom:16px}' +
        'table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:12px;page-break-inside:avoid}' +
        'th{background:#f0e0b0;text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#5a4010;border-bottom:2px solid #d4a84b}' +
        'td{padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top}' +
        'td.r{text-align:right;font-family:monospace}' +
        'tfoot td{border-bottom:none}' +
        '.footer{margin-top:24px;padding-top:8px;border-top:1px solid #eee;color:#999;font-size:10px;text-align:center;font-style:italic}' +
        '@media print{body{padding:0}}' +
      '</style></head><body>' +
      '<h1>🧀 Sennerei-Produktion — ' + _esc(almName) + '</h1>' +
      '<div class="meta">Saison ' + _esc(String(jahr)) + ' &nbsp;·&nbsp; Zeitraum: <b>' + von.toLocaleDateString('de-AT') + ' – ' + bis.toLocaleDateString('de-AT') + '</b> &nbsp;·&nbsp; Erstellt: ' + new Date().toLocaleString('de-AT') + ' &nbsp;·&nbsp; ' + eintraege.length + ' Einträge</div>' +
      tables +
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
