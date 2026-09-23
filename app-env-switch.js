// ══════════════════════════════════════════════════════════════════════════════
//  ENV-SWITCH: Prod ↔ Test-Firebase
//  - Banner oben wenn Test-Modus aktiv
//  - Admin-UI in Einstellungen zum Konfigurieren des Test-Firebase
//  - Umschaltung setzt localStorage-Flags und macht Page-Reload
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '1.0';
  window.ENV_SWITCH_VERSION = VERSION;

  const isTest = window.HP_ENV === 'test';

  // ── Banner oben wenn Test-Modus aktiv ──
  function _showTestBanner() {
    if(!isTest) return;
    if(document.getElementById('hp-env-banner')) return;
    if(!document.getElementById('hp-env-banner-style')) {
      const st = document.createElement('style');
      st.id = 'hp-env-banner-style';
      st.textContent = `
        #hp-env-banner { position:fixed; top:0; left:0; right:0; z-index:999999; background:linear-gradient(90deg,#c0392b,#e67e22); color:#fff; padding:.35rem .7rem; text-align:center; font-size:.75rem; font-weight:700; letter-spacing:.05em; font-family:sans-serif; box-shadow:0 2px 8px rgba(0,0,0,.3); cursor:pointer; }
        #hp-env-banner:hover { background:linear-gradient(90deg,#d94a3d,#f0932b); }
        body.hp-env-test #app-container, body.hp-env-test #topbar { padding-top:.5rem; }
        body.hp-env-test #topbar { top:22px !important; }
      `;
      document.head.appendChild(st);
    }
    const cfg = window.FIREBASE_CONFIG || {};
    const banner = document.createElement('div');
    banner.id = 'hp-env-banner';
    banner.onclick = () => navigate('einstellungen');
    banner.innerHTML = '⚠ TEST-MODUS · Projekt: ' + (cfg.projectId || '?') + ' · Tap = Einstellungen';
    document.body.appendChild(banner);
    document.body.classList.add('hp-env-test');
  }

  window.addEventListener('load', () => setTimeout(_showTestBanner, 100));

  // ── HTML-Snippet für Einstellungen-Bereich ──
  window.hpEnvSwitchHTML = function() {
    const cfg = window.FIREBASE_CONFIG || {};
    const testCfg = _getTestConfig();
    const testProjectId = testCfg?.projectId || 'noch nicht konfiguriert';
    return `
      <div class="card-section" style="margin-bottom:.8rem">
        <div class="section-label" style="margin-bottom:.6rem">🔧 UMGEBUNG (ADMIN)</div>
        <div style="padding:.6rem .8rem;background:${isTest?'rgba(220,60,60,.12)':'rgba(77,184,78,.12)'};border:1px solid ${isTest?'rgba(220,60,60,.4)':'rgba(77,184,78,.35)'};border-radius:10px;margin-bottom:.5rem">
          <div style="font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:${isTest?'var(--red)':'var(--green)'};font-weight:800">
            ${isTest ? '⚠ TEST-MODUS AKTIV' : '✓ Produktiv-Modus'}
          </div>
          <div style="font-size:.85rem;color:var(--text);margin-top:.2rem;font-weight:700">${cfg.projectId || '?'}</div>
          <div style="font-size:.7rem;color:var(--text3);word-break:break-all;margin-top:.15rem">${cfg.databaseURL || ''}</div>
        </div>

        ${isTest ? `
          <button class="btn-secondary" style="width:100%;margin-bottom:.4rem" onclick="hpEnvSwitchToProd()">
            🔙 Zurück zum Produktiv-Modus
          </button>
          <div style="font-size:.7rem;color:var(--text3);text-align:center;line-height:1.4;padding:.3rem">Änderungen im Test-Modus wirken NUR im Test-Firebase.<br>Deine echten Daten bleiben unberührt.</div>
        ` : `
          <div style="font-size:.75rem;color:var(--text3);margin-bottom:.5rem;line-height:1.5">
            Test-Firebase: <b style="color:var(--gold)">${testProjectId}</b>
          </div>
          <button class="btn-secondary" style="width:100%;margin-bottom:.4rem" onclick="hpEnvConfigure()">
            ⚙ Test-Firebase konfigurieren
          </button>
          ${testCfg ? `<button class="btn-primary" style="width:100%;background:linear-gradient(135deg,#c0392b,#e67e22);color:#fff" onclick="hpEnvSwitchToTest()">
            🧪 In Test-Modus wechseln
          </button>` : `<div style="font-size:.72rem;color:var(--text3);text-align:center;padding:.3rem">Erst Test-Firebase konfigurieren, dann kannst du wechseln.</div>`}
        `}
      </div>
    `;
  };

  function _getTestConfig() {
    try { return JSON.parse(localStorage.getItem('hp_test_config') || 'null'); } catch(e) { return null; }
  }

  // ── Konfigurations-Dialog ──
  window.hpEnvConfigure = function() {
    document.getElementById('env-cfg-dlg')?.remove();
    _injectDlgStyles();
    const cur = _getTestConfig() || {};
    const dlg = document.createElement('div');
    dlg.id = 'env-cfg-dlg';
    dlg.innerHTML =
      '<div class="env-head">' +
        '<h3>⚙ Test-Firebase konfigurieren</h3>' +
        '<button class="env-close" onclick="document.getElementById(\'env-cfg-dlg\').remove()">✕</button>' +
      '</div>' +
      '<div class="env-body">' +
        '<div class="env-hint">' +
          '<p><b>1.</b> Neues Firebase-Projekt anlegen auf <a href="https://console.firebase.google.com/" target="_blank" style="color:var(--gold)">console.firebase.google.com</a></p>' +
          '<p><b>2.</b> Realtime Database aktivieren (europe-west1 empfohlen), Regeln erstmal offen: <code style="font-size:.75rem;background:#000;padding:2px 5px;border-radius:3px">{ "rules": { ".read": true, ".write": true } }</code></p>' +
          '<p><b>3.</b> Authentication → Sign-in-Methode: „E-Mail/Passwort" aktivieren</p>' +
          '<p><b>4.</b> Projekt-Einstellungen → deine App → SDK Setup → Config kopieren und unten in die Felder einfügen:</p>' +
        '</div>' +
        '<label>apiKey</label><input type="text" id="env-apiKey" value="' + _esc(cur.apiKey||'') + '" placeholder="AIzaSy..."/>' +
        '<label>authDomain</label><input type="text" id="env-authDomain" value="' + _esc(cur.authDomain||'') + '" placeholder="test-projekt.firebaseapp.com"/>' +
        '<label>databaseURL</label><input type="text" id="env-databaseURL" value="' + _esc(cur.databaseURL||'') + '" placeholder="https://test-projekt-default-rtdb.europe-west1.firebasedatabase.app"/>' +
        '<label>projectId</label><input type="text" id="env-projectId" value="' + _esc(cur.projectId||'') + '" placeholder="test-projekt"/>' +
        '<label>storageBucket</label><input type="text" id="env-storageBucket" value="' + _esc(cur.storageBucket||'') + '" placeholder="test-projekt.firebasestorage.app"/>' +
        '<label>messagingSenderId</label><input type="text" id="env-messagingSenderId" value="' + _esc(cur.messagingSenderId||'') + '" placeholder="123456789"/>' +
        '<label>appId</label><input type="text" id="env-appId" value="' + _esc(cur.appId||'') + '" placeholder="1:123:web:abc..."/>' +
        '<div class="env-shortcut">' +
          '<label style="margin-top:1rem">⚡ Oder: Config-JSON komplett einfügen (aus Firebase-Console)</label>' +
          '<textarea id="env-json-paste" placeholder=\'{"apiKey":"...","authDomain":"...", "databaseURL":"...", ...}\' rows="4"></textarea>' +
          '<button class="env-parse" onclick="_hpEnvParseJson()">↻ JSON in Felder übernehmen</button>' +
        '</div>' +
      '</div>' +
      '<div class="env-foot">' +
        '<button class="env-cancel" onclick="document.getElementById(\'env-cfg-dlg\').remove()">Abbrechen</button>' +
        (cur.apiKey ? '<button class="env-clear" onclick="_hpEnvClearConfig()">✕ Löschen</button>' : '') +
        '<button class="env-save" onclick="_hpEnvSaveConfig()">✓ Speichern</button>' +
      '</div>';
    document.body.appendChild(dlg);
  };

  function _esc(s) { return String(s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

  window._hpEnvParseJson = function() {
    const raw = document.getElementById('env-json-paste').value.trim();
    if(!raw) { alert('Bitte JSON einfügen'); return; }
    try {
      // Erlaubt sowohl JSON als auch JS-Objekt-Literal
      let clean = raw;
      // Falls es ein JS-Objekt-Literal ist (mit unquoted keys): grob normalisieren
      if(!clean.startsWith('{') || !clean.includes('"')) {
        clean = clean.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
      }
      // Entferne Kommas hinter letztem Element
      clean = clean.replace(/,(\s*[}\]])/g, '$1');
      const cfg = JSON.parse(clean);
      ['apiKey','authDomain','databaseURL','projectId','storageBucket','messagingSenderId','appId'].forEach(k => {
        const inp = document.getElementById('env-' + k);
        if(inp && cfg[k] != null) inp.value = cfg[k];
      });
      document.getElementById('env-json-paste').value = '';
      alert('✓ Übernommen — nun oben „Speichern" tippen');
    } catch(err) {
      alert('Ungültiges JSON:\n\n' + err.message);
    }
  };

  window._hpEnvSaveConfig = function() {
    const cfg = {
      apiKey:            document.getElementById('env-apiKey').value.trim(),
      authDomain:        document.getElementById('env-authDomain').value.trim(),
      databaseURL:       document.getElementById('env-databaseURL').value.trim(),
      projectId:         document.getElementById('env-projectId').value.trim(),
      storageBucket:     document.getElementById('env-storageBucket').value.trim(),
      messagingSenderId: document.getElementById('env-messagingSenderId').value.trim(),
      appId:             document.getElementById('env-appId').value.trim()
    };
    if(!cfg.apiKey || !cfg.databaseURL || !cfg.projectId) {
      alert('Mindestens apiKey, databaseURL und projectId müssen ausgefüllt sein.');
      return;
    }
    try {
      localStorage.setItem('hp_test_config', JSON.stringify(cfg));
      document.getElementById('env-cfg-dlg').remove();
      if(window.showSaveToast) window.showSaveToast('✓ Test-Config gespeichert · ' + cfg.projectId);
      if(typeof render === 'function') render();
    } catch(err) {
      alert('Fehler beim Speichern: ' + err.message);
    }
  };

  window._hpEnvClearConfig = function() {
    if(!confirm('Test-Firebase-Config wirklich löschen?')) return;
    try { localStorage.removeItem('hp_test_config'); } catch(e) {}
    document.getElementById('env-cfg-dlg').remove();
    if(typeof render === 'function') render();
  };

  window.hpEnvSwitchToTest = function() {
    if(!_getTestConfig()) { alert('Erst Test-Firebase konfigurieren.'); return; }
    if(!confirm('In Test-Modus wechseln?\n\nDie App wird neu geladen und mit dem Test-Firebase verbunden.\n\nDeine echten Daten bleiben unberührt.')) return;
    try { localStorage.setItem('hp_env', 'test'); } catch(e) {}
    // Auth-Token wegräumen (anderes Firebase-Projekt)
    try {
      Object.keys(localStorage).forEach(k => {
        if(k.startsWith('firebase:') || k.startsWith('hp_autoauth')) localStorage.removeItem(k);
      });
    } catch(e) {}
    location.reload();
  };

  window.hpEnvSwitchToProd = function() {
    if(!confirm('Zurück zum Produktiv-Modus?\n\nDie App wird neu geladen.')) return;
    try { localStorage.setItem('hp_env', 'prod'); } catch(e) {}
    try {
      Object.keys(localStorage).forEach(k => {
        if(k.startsWith('firebase:') || k.startsWith('hp_autoauth')) localStorage.removeItem(k);
      });
    } catch(e) {}
    location.reload();
  };

  function _injectDlgStyles() {
    if(document.getElementById('env-dlg-style')) return;
    const st = document.createElement('style');
    st.id = 'env-dlg-style';
    st.textContent = `
      #env-cfg-dlg { position:fixed; inset:0; z-index:99900; background:var(--bg,#0c1a09); display:flex; flex-direction:column; overflow:hidden; }
      #env-cfg-dlg .env-head { background:linear-gradient(180deg,#152912,#0c1a09); border-bottom:1px solid rgba(212,168,75,.3); padding:.85rem 1rem; display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
      #env-cfg-dlg .env-head h3 { color:var(--gold,#d4a84b); margin:0; font-size:1.05rem; }
      #env-cfg-dlg .env-close { background:transparent; border:none; color:var(--text3,#888); font-size:1.6rem; cursor:pointer; padding:.2rem .5rem; }
      #env-cfg-dlg .env-body { flex:1; overflow-y:auto; padding:1rem; }
      #env-cfg-dlg .env-hint { background:rgba(212,168,75,.06); border:1px solid rgba(212,168,75,.25); border-radius:10px; padding:.7rem .9rem; margin-bottom:1rem; font-size:.82rem; line-height:1.5; color:var(--text2); }
      #env-cfg-dlg .env-hint p { margin:.3rem 0; }
      #env-cfg-dlg label { display:block; font-size:.7rem; letter-spacing:.1em; text-transform:uppercase; color:var(--text3,#888); margin:.7rem 0 .3rem 0; font-weight:600; }
      #env-cfg-dlg input, #env-cfg-dlg textarea { width:100%; background:rgba(255,255,255,.05); border:1.5px solid var(--border,#333); color:var(--text,#eee); padding:.6rem .8rem; border-radius:8px; font-size:.9rem; font-family:monospace; box-sizing:border-box; }
      #env-cfg-dlg input:focus, #env-cfg-dlg textarea:focus { outline:none; border-color:var(--gold,#d4a84b); }
      #env-cfg-dlg textarea { min-height:80px; resize:vertical; }
      #env-cfg-dlg .env-shortcut { border-top:1px dashed var(--border); margin-top:1.5rem; padding-top:.5rem; }
      #env-cfg-dlg .env-parse { background:rgba(212,168,75,.15); color:var(--gold); border:1px solid rgba(212,168,75,.4); padding:.5rem 1rem; border-radius:8px; cursor:pointer; margin-top:.5rem; font-family:inherit; font-weight:600; }
      #env-cfg-dlg .env-foot { position:sticky; bottom:0; background:linear-gradient(180deg,transparent,var(--bg,#0c1a09) 30%); padding:1rem; padding-top:1.5rem; border-top:1px solid rgba(212,168,75,.15); flex-shrink:0; display:flex; gap:.5rem; }
      #env-cfg-dlg .env-foot button { padding:.9rem; border-radius:12px; font-size:.95rem; font-weight:700; cursor:pointer; border:none; font-family:inherit; }
      #env-cfg-dlg .env-cancel { flex:1; background:rgba(255,255,255,.08); color:var(--text); }
      #env-cfg-dlg .env-clear { flex:1; background:rgba(220,60,60,.15); color:var(--red); border:1px solid rgba(220,60,60,.35); }
      #env-cfg-dlg .env-save { flex:2; background:var(--gold); color:#000; }
    `;
    document.head.appendChild(st);
  }

  console.log('[Env-Switch] Modul geladen v' + VERSION + ' · Modus:', window.HP_ENV);
})();
