// ══════════════════════════════════════════════════════════════════════════════
//  APP-INSTALLATION
//  - Fängt beforeinstallprompt-Event ab und zeigt einen Install-Button
//  - Erkennt Standalone-Modus (App bereits installiert)
//  - Bietet iOS-Anleitung (kein programmatischer Prompt möglich)
//  - Verarbeitet PWA-Shortcuts (?shortcut=milch etc.)
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '1.0';
  window.APP_INSTALL_VERSION = VERSION;

  // Deferred prompt event (Chrome/Edge/Android)
  let _deferredPrompt = null;

  // ── Standalone-Detection ──
  function _isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) ||
           (window.navigator && window.navigator.standalone === true);
  }
  function _isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }
  function _isAndroid() {
    return /Android/.test(navigator.userAgent);
  }

  window.hpIsStandalone = _isStandalone;
  window.hpIsIOS = _isIOS;

  // ── beforeinstallprompt abfangen ──
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e;
    console.log('[Install] Install-Prompt verfügbar');
    // Optional: Badge auf Install-Button anzeigen
    document.querySelectorAll('.hp-install-btn').forEach(b => b.classList.add('hp-install-available'));
  });

  window.addEventListener('appinstalled', () => {
    console.log('[Install] App installiert!');
    _deferredPrompt = null;
    // Toast anzeigen
    if(window.showSaveToast) window.showSaveToast('✓ HerdenPro als App installiert');
    // Install-Button ausblenden
    document.querySelectorAll('.hp-install-btn').forEach(b => b.style.display = 'none');
    // Rerender damit Standalone-Badge angezeigt wird
    if(typeof render === 'function') setTimeout(render, 500);
  });

  // ── Install-Button-Handler ──
  window.hpInstallApp = async function() {
    // iOS: nur Anleitung zeigen
    if(_isIOS()) {
      _showIOSInstallDialog();
      return;
    }
    // Andere: nativer Prompt
    if(!_deferredPrompt) {
      alert('Installation ist derzeit nicht verfügbar.\n\nBitte öffne die App über den Menüpunkt „Zum Startbildschirm hinzufügen" im Browser-Menü.');
      return;
    }
    _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    console.log('[Install] User choice:', outcome);
    if(outcome === 'accepted') {
      _deferredPrompt = null;
      if(window.showSaveToast) window.showSaveToast('🚀 Installation läuft...');
    }
  };

  // ── iOS Install-Anleitung ──
  function _showIOSInstallDialog() {
    if(document.getElementById('ios-install-dlg')) return;
    if(!document.getElementById('ios-install-style')) {
      const st = document.createElement('style');
      st.id = 'ios-install-style';
      st.textContent = `
        #ios-install-dlg { position:fixed; inset:0; z-index:99500; background:rgba(0,0,0,.75); backdrop-filter:blur(6px); display:flex; align-items:flex-end; justify-content:center; padding:1rem; }
        #ios-install-dlg .ios-card { background:var(--bg2,#1a1a1a); border:1px solid var(--border,#333); border-radius:20px 20px 8px 8px; max-width:440px; width:100%; padding:1.4rem 1.2rem 1.2rem; color:var(--text,#eee); animation:iosin .35s cubic-bezier(.2,.9,.3,1); position:relative; }
        @keyframes iosin { from{transform:translateY(80px);opacity:0} to{transform:translateY(0);opacity:1} }
        #ios-install-dlg h3 { margin:0 0 .3rem 0; color:var(--gold,#d4a84b); font-size:1.15rem; }
        #ios-install-dlg .ios-sub { color:var(--text2,#aaa); font-size:.82rem; margin-bottom:1rem; }
        #ios-install-dlg .ios-step { display:flex; gap:.7rem; padding:.7rem 0; border-top:1px solid var(--border,#333); font-size:.9rem; align-items:flex-start; }
        #ios-install-dlg .ios-step:first-of-type { border-top:none; }
        #ios-install-dlg .ios-num { flex-shrink:0; width:28px; height:28px; background:var(--gold,#d4a84b); color:#000; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:.85rem; }
        #ios-install-dlg .ios-icon { display:inline-flex; padding:2px 7px; background:rgba(255,255,255,.1); border-radius:6px; margin:0 3px; font-size:.9rem; vertical-align:middle; }
        #ios-install-dlg .ios-close { position:absolute; top:.8rem; right:.9rem; background:transparent; border:none; color:var(--text3,#888); font-size:1.4rem; cursor:pointer; padding:0 .3rem; }
        #ios-install-dlg .ios-done { margin-top:1rem; padding:.8rem; background:var(--gold,#d4a84b); color:#000; border:none; border-radius:10px; width:100%; font-weight:700; font-size:.95rem; cursor:pointer; }
      `;
      document.head.appendChild(st);
    }
    const dlg = document.createElement('div');
    dlg.id = 'ios-install-dlg';
    dlg.innerHTML =
      '<div class="ios-card">' +
        '<button class="ios-close" onclick="document.getElementById(\'ios-install-dlg\').remove()">×</button>' +
        '<h3>📱 HerdenPro als App installieren</h3>' +
        '<div class="ios-sub">Auf dem iPhone/iPad in Safari:</div>' +
        '<div class="ios-step"><div class="ios-num">1</div><div>Tippe unten auf das <span class="ios-icon">⬆︎</span> <b>Teilen-Symbol</b></div></div>' +
        '<div class="ios-step"><div class="ios-num">2</div><div>Scrolle nach unten und tippe auf <span class="ios-icon">➕ Zum Home-Bildschirm</span></div></div>' +
        '<div class="ios-step"><div class="ios-num">3</div><div>Tippe rechts oben auf <b>Hinzufügen</b></div></div>' +
        '<div class="ios-step"><div class="ios-num">✓</div><div>HerdenPro erscheint als App-Icon auf deinem Home-Bildschirm und startet ohne Browser-Leiste.</div></div>' +
        '<button class="ios-done" onclick="document.getElementById(\'ios-install-dlg\').remove()">Verstanden</button>' +
      '</div>';
    document.body.appendChild(dlg);
  }

  // ── PWA-Shortcuts verarbeiten (?shortcut=milch etc.) ──
  function _handleShortcuts() {
    try {
      const params = new URLSearchParams(location.search);
      const shortcut = params.get('shortcut');
      if(!shortcut) return;
      // URL bereinigen damit's beim Reload nicht immer wieder springt
      history.replaceState(null, '', location.pathname);
      setTimeout(() => {
        try {
          if(shortcut === 'milch' && typeof navigate === 'function') navigate('milch_erfassen');
          else if(shortcut === 'behandlung' && typeof showBehandlungForm === 'function') showBehandlungForm(null);
          else if(shortcut === 'bauern' && typeof navigate === 'function') navigate('bauern');
          else if(shortcut === 'statistik' && typeof navigate === 'function') navigate('statistik');
        } catch(e) { console.warn('[Install] Shortcut-Fehler:', e); }
      }, 800);
    } catch(e) { /* ignore */ }
  }
  window.addEventListener('load', _handleShortcuts);

  // ── Standalone-Badge in Einstellungen (globales HTML-Snippet) ──
  window.hpInstallStatusHTML = function() {
    if(_isStandalone()) {
      return '<div style="display:flex;align-items:center;gap:.5rem;padding:.7rem .9rem;background:rgba(77,184,78,.12);border:1px solid rgba(77,184,78,.35);border-radius:10px;color:var(--green,#4ab54e);font-size:.85rem">' +
        '<span style="font-size:1.1rem">✓</span>' +
        '<div><b>Als App installiert</b><div style="font-size:.72rem;color:var(--text2,#aaa);font-weight:400">Läuft im Standalone-Modus — nicht im Browser</div></div>' +
      '</div>';
    }
    return '<div style="padding:.7rem .9rem;background:rgba(212,168,75,.12);border:1px solid rgba(212,168,75,.35);border-radius:10px">' +
      '<div style="display:flex;align-items:center;gap:.5rem;color:var(--gold,#d4a84b);font-size:.9rem;font-weight:700;margin-bottom:.3rem">' +
        '<span style="font-size:1.1rem">📱</span> Als App installieren' +
      '</div>' +
      '<div style="font-size:.75rem;color:var(--text2,#aaa);margin-bottom:.6rem">Icon auf Home-Bildschirm · Vollbild · Ohne Browser-Leiste · Offline-fähig</div>' +
      '<button class="hp-install-btn" onclick="hpInstallApp()" style="width:100%;padding:.7rem;background:var(--gold,#d4a84b);color:#000;border:none;border-radius:8px;font-weight:700;font-size:.9rem;cursor:pointer">Jetzt installieren</button>' +
    '</div>';
  };

  console.log('[Install] Modul geladen v' + VERSION + ' · Standalone:', _isStandalone(), '· iOS:', _isIOS());
})();
