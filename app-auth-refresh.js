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

  // ══════════════════════════════════════════════════════════════════════════════
  // SAVE-WRAPPER: schützt alle window.saveXxx-Funktionen mit
  //   • Button-Disable (verhindert Doppel-Klick → Duplikate)
  //   • Try/Catch mit Alert (keine stummen Fehler)
  //   • Overall-Timeout (verhindert ewiges Hängen)
  // ══════════════════════════════════════════════════════════════════════════════
  window._wrapSaveFn = function(fnName, overlayId, timeoutMs) {
    timeoutMs = timeoutMs || 30000;
    const original = window[fnName];
    if(!original || typeof original !== 'function' || original._wrapped) return;

    window[fnName] = async function(...args) {
      // Button finden (im Overlay ODER global auf der Seite)
      let btn = null;
      if(overlayId) {
        const ov = document.getElementById(overlayId);
        if(ov) btn = ov.querySelector('.btn-primary');
      }
      if(!btn) btn = document.querySelector('button.btn-primary[onclick*="'+fnName+'"]');
      const origLabel = btn ? btn.textContent : '';
      if(btn && !btn.disabled) {
        btn.disabled = true;
        btn.dataset._origLabel = origLabel;
        btn.textContent = '⏳ Speichern…';
        btn.style.opacity = '.7';
      }
      const restore = () => {
        if(btn && btn.dataset._origLabel !== undefined) {
          btn.disabled = false;
          btn.textContent = btn.dataset._origLabel || 'Speichern';
          btn.style.opacity = '';
          delete btn.dataset._origLabel;
        }
      };
      // Timeout-Wrapper
      const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error(fnName+' Timeout '+timeoutMs+'ms')), timeoutMs));
      try {
        return await Promise.race([original.apply(this, args), timeoutPromise]);
      } catch(err) {
        console.error('['+fnName+'] FEHLER:', err);
        alert('Fehler beim Speichern:\n\n' + (err && err.message || err));
        throw err;
      } finally {
        restore();
      }
    };
    window[fnName]._wrapped = true;
    console.log('[Wrap] '+fnName+' geschützt');
  };

  // Beim Start: alle bekannten Save-Funktionen wrappen (nach kurzer Verzögerung)
  // Wichtig: manuell schon geschützte Funktionen (saveMilch, saveBehandlung, saveKlauen, saveWeide)
  //          werden NICHT nochmal gewrappt (per _wrapped Flag verhindert).
  setTimeout(() => {
    const saves = [
      ['saveKuh',            'kuh-form-overlay'],
      ['saveBesamung',       'besamung-form-overlay'],
      ['saveKalbung',        'kalbung-form-overlay'],
      ['saveJournal',        'journal-form-overlay'],
      ['saveKontakt',        'kontakt-form-overlay'],
      ['saveNotfallKontakt', 'notfall-kontakt-overlay'],
      ['saveGruppe',         'gruppe-form-overlay'],
      ['saveKalenderTermin', 'kalender-form-overlay'],
      ['saveMaschine',       'maschine-form-overlay'],
      ['saveChecklistePunkt','checkliste-form-overlay'],
      ['saveService',        'service-form-overlay'],
      ['saveAufgabe',        'aufgabe-form-overlay'],
      ['saveLagerArtikel',   'lager-artikel-overlay'],
      ['saveLagerVerbrauch', 'lager-verbrauch-overlay'],
      ['saveLagerZugang',    'lager-zugang-overlay'],
      ['saveSaisonArchiv',   'saison-archiv-overlay'],
      ['saveTraenke',        'traenke-form-overlay'],
      ['saveBauer',          'bauer-form-overlay'],
      ['saveKfLieferung',    'kf-lieferung-overlay'],
      ['saveKraftfutter',    'kf-overlay'],
      ['saveSchalmViertel',  'schalm-form-overlay'],
      ['saveAbtrieb',        'abtrieb-overlay'],
      ['saveWeide',          'weide-overlay'],
      ['saveWeideTag',       'weidetag-overlay']
    ];
    saves.forEach(([name, ovId]) => { try { window._wrapSaveFn(name, ovId); } catch(e) { console.warn('Wrap '+name+' fail:', e); } });
    console.log('[Wrap] ' + saves.length + ' Save-Funktionen geprüft');
  }, 3000);
})();
