// ══════════════════════════════════════════════════════════════════════════════
//  MILCHSPERREN
//  Erfassung außergewöhnlicher Wartezeiten (Mastitis, Kolostrum, Zellzahl,
//  Verletzung, Sonstiges) direkt im Milchmess-Formular.
//  Sperre gilt rückwirkend für X Tage VOR dem Messtag (exklusiv Messtag selbst).
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '1.0';
  window.MILCHSPERRE_VERSION = VERSION;

  const GRUENDE = ['Mastitis', 'Kolostrum', 'Hohe Zellzahl', 'Verletzung', 'Sonstiges'];

  // ── Helper: aktuelle Sperre für Kuh finden (die für den Mess-Zeitraum relevant ist) ──
  // Sperre gilt als "aktiv für diese Woche" wenn ihr Zeitraum den 7-Tage-Bereich
  // vor dem gewählten Messtermin überlappt.
  window.milchSperreFuerKuh = function(kuhId, messTs) {
    if(!kuhId) return null;
    const sperren = window.milchSperren || {};
    const wocheStart = messTs - 7 * 86400000;
    let treffer = null;
    Object.entries(sperren).forEach(([id, s]) => {
      if(!s || s.kuhId !== kuhId || !s.vonTs || !s.bisTs) return;
      // Sperre überlappt mit Woche vor Messtermin?
      if(s.bisTs >= wocheStart && s.vonTs <= messTs) {
        treffer = { id, ...s };
      }
    });
    return treffer;
  };

  // ── Popup öffnen: Neu erfassen oder Bearbeiten ──
  window.showMilchSperrePopup = function(kuhId) {
    const kuh = (window.kuehe || {})[kuhId];
    if(!kuh) { alert('Kuh nicht gefunden'); return; }
    const datumStr = document.getElementById('m-datum')?.value || new Date().toISOString().slice(0,10);
    const messTs = new Date(datumStr + 'T12:00:00').getTime();
    const existing = window.milchSperreFuerKuh(kuhId, messTs);

    // Alte Popup entfernen
    const alt = document.getElementById('milchsperre-popup');
    if(alt) alt.remove();

    // Style einmalig injizieren
    if(!document.getElementById('milchsperre-style')) {
      const st = document.createElement('style');
      st.id = 'milchsperre-style';
      st.textContent = `
        #milchsperre-popup { position:fixed; inset:0; z-index:99000; background:rgba(0,0,0,.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:1rem; }
        #milchsperre-popup .msp-card { background:var(--bg2,#1a1a1a); border:1px solid rgba(220,60,60,.4); border-radius:14px; max-width:440px; width:100%; padding:1.2rem; color:var(--text,#eee); box-shadow:0 20px 60px rgba(0,0,0,.5); animation:msp-in .25s ease; }
        @keyframes msp-in { from{opacity:0;transform:scale(.93)} to{opacity:1;transform:scale(1)} }
        #milchsperre-popup h3 { color:var(--red,#dc3c3c); margin:0 0 .4rem 0; font-size:1.1rem; }
        #milchsperre-popup .msp-sub { color:var(--text2,#aaa); font-size:.78rem; margin-bottom:.9rem; }
        #milchsperre-popup label { display:block; font-size:.7rem; letter-spacing:.1em; text-transform:uppercase; color:var(--text3,#888); margin:.7rem 0 .3rem 0; }
        #milchsperre-popup select, #milchsperre-popup input[type="text"] { width:100%; background:rgba(255,255,255,.05); border:1px solid var(--border,#333); color:var(--text,#eee); padding:.6rem .7rem; border-radius:8px; font-size:.95rem; box-sizing:border-box; }
        #milchsperre-popup .msp-tage-chips { display:flex; gap:.35rem; flex-wrap:wrap; }
        #milchsperre-popup .msp-tage-chip { flex:1; min-width:42px; padding:.55rem .3rem; background:rgba(255,255,255,.05); border:1.5px solid var(--border,#333); border-radius:8px; color:var(--text,#eee); font-size:.95rem; font-weight:700; cursor:pointer; text-align:center; transition:all .15s; }
        #milchsperre-popup .msp-tage-chip.active { background:var(--red,#dc3c3c); border-color:var(--red,#dc3c3c); color:#fff; }
        #milchsperre-popup .msp-zeitraum { padding:.5rem .7rem; background:rgba(220,60,60,.1); border-left:3px solid var(--red,#dc3c3c); border-radius:6px; margin-top:.5rem; font-size:.82rem; color:var(--text2,#ccc); }
        #milchsperre-popup .msp-btns { display:flex; gap:.5rem; margin-top:1.2rem; }
        #milchsperre-popup .msp-btns button { flex:1; padding:.75rem; border-radius:10px; font-size:.95rem; font-weight:600; cursor:pointer; border:none; }
        #milchsperre-popup .msp-cancel { background:rgba(255,255,255,.08); color:var(--text,#eee); }
        #milchsperre-popup .msp-save { background:var(--red,#dc3c3c); color:#fff; }
        #milchsperre-popup .msp-delete { background:rgba(220,60,60,.15); color:var(--red,#dc3c3c); border:1px solid rgba(220,60,60,.4); }
        #milchsperre-popup .msp-save:disabled { opacity:.5; cursor:wait; }
      `;
      document.head.appendChild(st);
    }

    const defaultTage = existing?.tage || 3;
    const defaultGrund = existing?.grund || 'Mastitis';
    const defaultNotiz = existing?.notiz || '';

    const pop = document.createElement('div');
    pop.id = 'milchsperre-popup';
    pop.innerHTML =
      '<div class="msp-card">' +
        '<h3>⚠ Außergewöhnliche Wartezeit</h3>' +
        '<div class="msp-sub">#' + (kuh.nr || '?') + ' ' + (kuh.name || '') + '</div>' +
        '<label>Grund</label>' +
        '<select id="msp-grund">' +
          GRUENDE.map(g => '<option value="' + g + '"' + (g === defaultGrund ? ' selected' : '') + '>' + g + '</option>').join('') +
        '</select>' +
        '<label>Wie viele Tage betroffen? <span style="color:var(--text3);font-weight:400;text-transform:none;letter-spacing:0"> · rückwirkend vor dem Messtag</span></label>' +
        '<div class="msp-tage-chips" id="msp-tage-chips">' +
          [1,2,3,4,5,6,7].map(t => '<div class="msp-tage-chip' + (t === defaultTage ? ' active' : '') + '" data-tage="' + t + '" onclick="_mspSelectTage(' + t + ')">' + t + '</div>').join('') +
        '</div>' +
        '<div class="msp-zeitraum" id="msp-zeitraum-anzeige"></div>' +
        '<label>Notiz (optional)</label>' +
        '<input type="text" id="msp-notiz" value="' + defaultNotiz.replace(/"/g,'&quot;') + '" placeholder="z.B. linkes Hinterviertel" />' +
        '<div class="msp-btns">' +
          '<button class="msp-cancel" onclick="_mspClose()">Abbrechen</button>' +
          (existing ? '<button class="msp-delete" onclick="_mspDelete(\'' + existing.id + '\')">Löschen</button>' : '') +
          '<button class="msp-save" onclick="_mspSave(\'' + kuhId + '\'' + (existing ? ',\'' + existing.id + '\'' : ',null') + ')">Speichern</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(pop);
    window._mspSelectedTage = defaultTage;
    _mspUpdateZeitraumAnzeige();
  };

  function _mspUpdateZeitraumAnzeige() {
    const tage = window._mspSelectedTage || 3;
    const datumStr = document.getElementById('m-datum')?.value || new Date().toISOString().slice(0,10);
    const messMitternacht = new Date(datumStr + 'T00:00:00').getTime();
    const vonTs = messMitternacht - tage * 86400000;
    const bisTs = messMitternacht - 1000;   // Ende des Vortages
    const dt = (ts) => new Date(ts).toLocaleDateString('de-AT', {weekday: 'short', day: '2-digit', month: '2-digit'});
    const el = document.getElementById('msp-zeitraum-anzeige');
    if(el) el.innerHTML = 'Zeitraum: <b>' + dt(vonTs) + ' – ' + dt(bisTs) + '</b> (' + tage + ' Tag' + (tage!==1?'e':'') + ')';
  }

  window._mspSelectTage = function(tage) {
    window._mspSelectedTage = tage;
    document.querySelectorAll('#milchsperre-popup .msp-tage-chip').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.tage, 10) === tage);
    });
    _mspUpdateZeitraumAnzeige();
  };

  window._mspClose = function() {
    document.getElementById('milchsperre-popup')?.remove();
  };

  window._mspSave = async function(kuhId, existingId) {
    const btn = document.querySelector('#milchsperre-popup .msp-save');
    if(btn) { btn.disabled = true; btn.textContent = '⏳'; }
    try {
      const tage = window._mspSelectedTage || 3;
      const grund = document.getElementById('msp-grund')?.value || 'Sonstiges';
      const notiz = (document.getElementById('msp-notiz')?.value || '').trim();
      const datumStr = document.getElementById('m-datum')?.value || new Date().toISOString().slice(0,10);
      const messMitternacht = new Date(datumStr + 'T00:00:00').getTime();
      const vonTs = messMitternacht - tage * 86400000;
      const bisTs = messMitternacht - 1000;
      const data = {
        kuhId,
        vonTs,
        bisTs,
        tage,
        grund,
        notiz,
        messTag: datumStr,
        updatedAt: Date.now(),
        erstelltVon: (firebase.auth && firebase.auth().currentUser && firebase.auth().currentUser.email) || null
      };
      const _retry = window.withAuthRetry || (async fn => await fn());
      if(existingId) {
        await _retry(() => firebase.database().ref('milchSperren/' + existingId).update(data));
        window.milchSperren = window.milchSperren || {};
        window.milchSperren[existingId] = { ...(window.milchSperren[existingId] || {}), ...data };
      } else {
        data.erstelltAm = Date.now();
        const pushRef = firebase.database().ref('milchSperren').push();
        const newId = pushRef.key;
        await _retry(() => pushRef.set(data));
        window.milchSperren = window.milchSperren || {};
        window.milchSperren[newId] = data;
      }
      _mspClose();
      // Kuh-Zeile im Milchformular sofort updaten
      _mspRefreshKuhZeile(kuhId);
      if(window.showSaveToast) window.showSaveToast('✓ Milchsperre gespeichert (' + tage + ' Tage · ' + grund + ')');
    } catch(err) {
      console.error('[Milchsperre] Save:', err);
      alert('Fehler beim Speichern:\n\n' + (err.message || err));
      if(btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
    }
  };

  window._mspDelete = async function(id) {
    if(!confirm('Milchsperre wirklich löschen?')) return;
    const btn = document.querySelector('#milchsperre-popup .msp-delete');
    if(btn) { btn.disabled = true; btn.textContent = '⏳'; }
    try {
      const _retry = window.withAuthRetry || (async fn => await fn());
      const kuhId = (window.milchSperren?.[id] || {}).kuhId;
      await _retry(() => firebase.database().ref('milchSperren/' + id).remove());
      if(window.milchSperren) delete window.milchSperren[id];
      _mspClose();
      if(kuhId) _mspRefreshKuhZeile(kuhId);
      if(window.showSaveToast) window.showSaveToast('✓ Milchsperre gelöscht');
    } catch(err) {
      console.error('[Milchsperre] Delete:', err);
      alert('Fehler beim Löschen:\n\n' + (err.message || err));
      if(btn) { btn.disabled = false; btn.textContent = 'Löschen'; }
    }
  };

  // Kuh-Zeile im Milchmess-Formular neu berechnen (Button-Text + Rand)
  function _mspRefreshKuhZeile(kuhId) {
    const row = document.querySelector('.milch-kuh-row[data-kid="' + kuhId + '"]');
    if(!row) return;
    const datumStr = document.getElementById('m-datum')?.value || new Date().toISOString().slice(0,10);
    const messTs = new Date(datumStr + 'T12:00:00').getTime();
    const sperre = window.milchSperreFuerKuh(kuhId, messTs);
    const btn = row.querySelector('.msp-btn');
    if(btn) {
      if(sperre) {
        btn.classList.add('msp-btn-active');
        btn.innerHTML = '⚠ Sperre ' + sperre.tage + 'T (' + sperre.grund + ')';
        btn.style.background = 'rgba(220,60,60,.15)';
        btn.style.borderColor = 'rgba(220,60,60,.5)';
        btn.style.color = 'var(--red,#dc3c3c)';
        row.style.borderLeft = '4px solid var(--red,#dc3c3c)';
        row.style.paddingLeft = '.4rem';
      } else {
        btn.classList.remove('msp-btn-active');
        btn.innerHTML = '⚠ außergew. WZ erfassen';
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
        row.style.borderLeft = '';
        row.style.paddingLeft = '';
      }
    }
  }

  console.log('[Milchsperre] Modul geladen v' + VERSION);
})();
