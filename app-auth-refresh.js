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

  // ── Fix B: Auto-Retry-Wrapper ──
  // Nutzung:
  //   await withAuthRetry(() => update(ref(db,'behandlungen/'+id), data));
  //   await withAuthRetry(() => firebase.database().ref(path).update(payload));
  // Bei PERMISSION_DENIED: Token refresh + retry EINMAL. Sonst normaler Fehler.
  window.withAuthRetry = async function(writeFn) {
    try {
      return await writeFn();
    } catch(err) {
      const msg = String(err && err.message || err && err.code || err || '');
      const isPermission = /permission[_-]?denied/i.test(msg);
      if(!isPermission) throw err;

      console.warn('[Auth-Refresh] PERMISSION_DENIED — versuche Token-Refresh + Retry');
      const ok = await doRefresh('on-permission-denied');
      if(!ok) throw err;
      // Kurz warten damit Firebase das neue Token verbreitet
      await new Promise(r => setTimeout(r, 300));
      try {
        const result = await writeFn();
        console.log('[Auth-Refresh] Retry nach Token-Refresh erfolgreich');
        // Sync-Error-Banner (falls milch-Modul einen gesetzt hatte) räumen
        if(typeof window.clearMilchSyncError === 'function') {
          try { window.clearMilchSyncError(); } catch(e) {}
        }
        return result;
      } catch(retryErr) {
        console.error('[Auth-Refresh] Retry auch fehlgeschlagen:', retryErr);
        throw retryErr;  // echter Permissions-Fehler → an Aufrufer weitergeben
      }
    }
  };

  console.log('[Auth-Refresh] Modul geladen v' + VERSION);
})();
