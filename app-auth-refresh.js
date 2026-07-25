// ══════════════════════════════════════════════════════════════════════════════
//  AUTH-REFRESH & AUTO-RETRY
//  Verhindert PERMISSION_DENIED-Fehler durch abgelaufene Firebase-Tokens.
//
//  Fix A: Alle 25 Minuten proaktiv Token erneuern (Firebase-Tokens leben 60 min).
//  Fix B: Wrapper `withAuthRetry(fn)` fängt PERMISSION_DENIED ab, erneuert Token,
//         und versucht den Write EINMAL erneut. Meistens klappt's dann.
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '1.0';
  const REFRESH_INTERVAL_MS = 25 * 60 * 1000;  // 25 min (unter 60 min Ablauf)
  let _refreshTimer = null;
  window._lastTokenRefresh = 0;
  window._authRefreshVersion = VERSION;

  // ── Fix A: Periodischer Token-Refresh ──
  async function doRefresh(reason) {
    try {
      if(typeof firebase === 'undefined' || !firebase.auth) return false;
      const user = firebase.auth().currentUser;
      if(!user) return false;
      await user.getIdToken(true);  // force refresh
      window._lastTokenRefresh = Date.now();
      console.log('[Auth-Refresh] Token erneuert (' + reason + ')');
      return true;
    } catch(e) {
      console.warn('[Auth-Refresh] Refresh fehlgeschlagen (' + reason + '):', e && e.message || e);
      return false;
    }
  }

  window.startAuthRefreshLoop = function() {
    if(_refreshTimer) clearInterval(_refreshTimer);
    // Sofort einmal ausführen (falls Token schon alt), dann alle 25 min
    doRefresh('startup');
    _refreshTimer = setInterval(() => doRefresh('periodic'), REFRESH_INTERVAL_MS);
  };

  window.stopAuthRefreshLoop = function() {
    if(_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
  };

  // Bei App-Wake-Up (Tab wird sichtbar): sofort refresh wenn > 10 min alt
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') {
      const age = Date.now() - (window._lastTokenRefresh || 0);
      if(age > 10 * 60 * 1000) doRefresh('visibility');
    }
  });
  // Bei Online-Werden: sofort refresh
  window.addEventListener('online', () => {
    setTimeout(() => doRefresh('online'), 500);
  });

  // ── Auto-Login mit gespeicherten Credentials (nur wenn kein currentUser mehr) ──
  async function tryAutoLogin(reason) {
    try {
      if(!firebase || !firebase.auth) return false;
      const stored = localStorage.getItem('hp_autoauth');
      if(!stored) return false;
      const decoded = JSON.parse(decodeURIComponent(escape(atob(stored))));
      if(!decoded || !decoded.e || !decoded.p) return false;
      console.log('[Auth-Refresh] Auto-Login versucht (' + reason + ')…');
      await firebase.auth().signInWithEmailAndPassword(decoded.e, decoded.p);
      window._lastTokenRefresh = Date.now();
      console.log('[Auth-Refresh] Auto-Login OK (' + reason + ')');
      return true;
    } catch(e) {
      console.warn('[Auth-Refresh] Auto-Login fail (' + reason + '):', e.code || e.message);
      // Bei falschem Passwort → Credentials löschen (User muss manuell neu anmelden)
      if(e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential' || e.code === 'auth/user-not-found') {
        try { localStorage.removeItem('hp_autoauth'); } catch(x) {}
      }
      return false;
    }
  }

  // ── Fix B: Auto-Retry-Wrapper ──
  // Bei PERMISSION_DENIED: 1) Token refresh 2) falls kein User: Auto-Login 3) Retry.
  window.withAuthRetry = async function(writeFn) {
    try {
      return await writeFn();
    } catch(err) {
      const msg = String(err && err.message || err && err.code || err || '');
      const isPermission = /permission[_-]?denied/i.test(msg);
      if(!isPermission) throw err;

      console.warn('[Auth-Refresh] PERMISSION_DENIED — Recovery-Kette startet');
      let recovered = false;
      // Weg A: einfacher Token-Refresh (funktioniert wenn currentUser noch da)
      if(await doRefresh('on-permission-denied')) recovered = true;
      // Weg B: Auto-Login mit gespeicherten Credentials (wenn currentUser null)
      if(!recovered) recovered = await tryAutoLogin('on-permission-denied');
      if(!recovered) throw err;

      await new Promise(r => setTimeout(r, 500));
      try {
        const result = await writeFn();
        console.log('[Auth-Refresh] Retry nach Recovery erfolgreich');
        if(typeof window.clearMilchSyncError === 'function') {
          try { window.clearMilchSyncError(); } catch(e) {}
        }
        return result;
      } catch(retryErr) {
        console.error('[Auth-Refresh] Retry auch fehlgeschlagen:', retryErr);
        throw retryErr;
      }
    }
  };

  console.log('[Auth-Refresh] Modul geladen v' + VERSION);
})();
