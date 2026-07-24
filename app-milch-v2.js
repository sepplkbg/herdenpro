// ══════════════════════════════════════════════════════════════
//  HERDENPRO – MILCH v2  (LocalStorage-first Persistence)
//  MODUL-VERSION: 5.0  ← wenn du das siehst, ist der Fix geladen
// ══════════════════════════════════════════════════════════════
window.MILCH_V2_VERSION = '5.7';
//  Löst die alten Probleme (Datenverlust, hängende Saves offline,
//  Multi-Melker-Kollisionen, Aggregations-Verdopplung).
//
//  Prinzipien:
//   1. Bei jedem Tippen → localStorage sofort (Wahrheit auf Gerät)
//   2. Parallel → Firebase-Update fire-and-forget
//   3. Firebase-Listener bestätigt Sync → pending entfernen
//   4. Ein einziger deterministischer Firebase-Eintrag pro Termin
//      (Key = "v2_YYYY-MM-DD_zeit"), alle Melker schreiben rein
//   5. Pro Kuh Attribution: {wert, session, userName, ts}
//   6. Session = user.uid (persistent pro User)
//   7. Globaler Sync-Banner ganz oben in der App
//   8. Konflikt-Dialog wenn anderer Melker einen Wert überschreibt
// ══════════════════════════════════════════════════════════════

(function() {
'use strict';

// ── Helper: Wert aus prokuh-Feld extrahieren (backward-kompat: Zahl ODER Objekt)
window.milchWert = function(v) {
  if(v == null) return 0;
  if(typeof v === 'number') return v;
  if(typeof v === 'object' && v.wert != null) return parseFloat(v.wert) || 0;
  return parseFloat(v) || 0;
};

// ── User-UID: STABILE Identität, überlebt App-Neustarts und Session-Wechsel
// Vorzug: Firebase-Auth → sofort in localStorage cachen → nachfolgende Aufrufe stabil
window.getMilchUserUid = function() {
  // 1) Firebase Auth direkt (wenn verfügbar)
  try {
    if(typeof firebase !== 'undefined' && firebase.auth) {
      const authUser = firebase.auth().currentUser;
      if(authUser && authUser.uid) {
        localStorage.setItem('milkUserUid_v2', authUser.uid);
        return authUser.uid;
      }
    }
  } catch(e) {}
  // 2) window._currentUser
  const u = window._currentUser;
  if(u && u.uid) {
    localStorage.setItem('milkUserUid_v2', u.uid);
    return u.uid;
  }
  // 3) LocalStorage-Cache (aus früherer Session — SEHR wichtig!)
  const cached = localStorage.getItem('milkUserUid_v2');
  if(cached) return cached;
  // 4) Kein Login → anonymous, aber persistent
  let anon = localStorage.getItem('milkAnonUid_v2');
  if(!anon) {
    anon = 'anon_' + Math.random().toString(36).slice(2, 12);
    localStorage.setItem('milkAnonUid_v2', anon);
  }
  return anon;
};

// ── Session-ID: nutzt die stabile UID
window.getMilchSessionId = function() {
  const uid = window.getMilchUserUid();
  return uid.startsWith('anon_') ? uid : 'user_' + uid;
};

// ── Prüfen ob eine Meta-Eintrag zum aktuellen User gehört (auch Legacy-Vergleich)
function isOwnMeta(meta) {
  if(!meta) return false;
  const myUid = window.getMilchUserUid();
  // Neu: userUid direkt vergleichen
  if(meta.userUid && meta.userUid === myUid) return true;
  // Legacy: session = 'user_UID' extrahieren
  if(meta.session && meta.session.startsWith('user_')) {
    const uid = meta.session.slice(5);
    if(uid === myUid) return true;
  }
  // Legacy: session = 'anon_XXX' — für früher gespeicherte Werte großzügig sein
  // (kann nur derselbe Tab gewesen sein, aber nicht garantiert derselbe User)
  return false;
}
window._milchIsOwnMeta = isOwnMeta;

// ── User-Name für Attribution
function getUserName() {
  const cu = window._currentUser || {};
  return cu.name || cu.displayName || (cu.email ? cu.email.split('@')[0] : '') || 'Unbekannt';
}

// ── Deterministic Firebase-Key pro Termin
function getMilchEntryKey(datum, zeit) {
  let iso;
  if(typeof datum === 'string' && datum.length >= 10) {
    iso = datum.slice(0, 10);
  } else {
    const d = new Date(datum);
    iso = d.getFullYear() + '-' +
          String(d.getMonth()+1).padStart(2,'0') + '-' +
          String(d.getDate()).padStart(2,'0');
  }
  return 'v2_' + iso + '_' + (zeit || 'morgen');
}

// ── LocalStorage-Pending-Queue
// Struktur: { entryKey: { kuhId: {wert, session, userName, ts}, ... } }
function getPending() {
  try { return JSON.parse(localStorage.getItem('milchPendingV2') || '{}'); }
  catch(e) { return {}; }
}
function setPending(data) {
  try { localStorage.setItem('milchPendingV2', JSON.stringify(data)); }
  catch(e) { console.warn('[Milch v2] Pending save failed:', e); }
}
function countPending() {
  const p = getPending();
  let n = 0;
  Object.values(p).forEach(entry => n += Object.keys(entry).length);
  return n;
}
window.getMilchPendingCount = countPending;

// ── Konflikt-Speicher
function getKonflikte() {
  try { return JSON.parse(localStorage.getItem('milchKonflikteV2') || '[]'); }
  catch(e) { return []; }
}
function setKonflikte(k) {
  try { localStorage.setItem('milchKonflikteV2', JSON.stringify(k)); }
  catch(e) {}
}
function addKonflikt(k) {
  const list = getKonflikte();
  if(list.find(x => x.entryKey === k.entryKey && x.kuhId === k.kuhId)) return;
  list.push(k);
  setKonflikte(list);
}

// ══════════════════════════════════════════════════════════════
//  KERN: Wert für eine Kuh schreiben (localStorage + Firebase)
// ══════════════════════════════════════════════════════════════
window.pushMilchWert = function(kuhId, wert, datum, zeit) {
  if(!kuhId || datum == null) return;
  const entryKey = getMilchEntryKey(datum, zeit);
  const sessionId = getMilchSessionId();
  const userUid = window.getMilchUserUid();
  const userName = getUserName();
  const now = Date.now();
  const wertVal = Math.round((parseFloat(wert) || 0) * 10) / 10;

  // Attribution: NEUE stabile userUid + Session-ID (kompatibel mit alter Logik)
  const metaPayload = { session: sessionId, userUid: userUid, userName: userName, ts: now };

  // 1. LocalStorage sofort (Wahrheit auf Gerät). Kombinierte Payload für internes Tracking.
  const pending = getPending();
  if(wertVal > 0) {
    if(!pending[entryKey]) pending[entryKey] = {};
    pending[entryKey][kuhId] = { wert: wertVal, session: sessionId, userUid: userUid, userName: userName, ts: now };
    setPending(pending);
  } else {
    // Wert 0 = löschen
    if(pending[entryKey] && pending[entryKey][kuhId]) {
      delete pending[entryKey][kuhId];
      if(Object.keys(pending[entryKey]).length === 0) delete pending[entryKey];
      setPending(pending);
    }
  }

  // 2. Firebase fire-and-forget
  try {
    if(typeof firebase === 'undefined' || !firebase.database) return;
    const entryPath = 'milch/' + entryKey;

    if(wertVal === 0) {
      // Aus Firebase entfernen (Wert + Meta)
      const rmPayload = {};
      rmPayload['prokuh/' + kuhId] = null;
      rmPayload['meta/' + kuhId] = null;
      firebase.database().ref(entryPath).update(rmPayload)
        .then(() => updateSyncBanner())
        .catch(e => handleSyncError(e, 'remove'));
    } else {
      // Wert setzen — WICHTIG: prokuh/kuhId ist eine ZAHL, Attribution getrennt unter meta/
      let datumTs;
      if(typeof datum === 'string' && datum.length >= 10) {
        datumTs = new Date(datum.slice(0,10) + 'T12:00').getTime();
      } else {
        const d = new Date(datum);
        d.setHours(12,0,0,0);
        datumTs = d.getTime();
      }
      const updatePayload = {};
      updatePayload['prokuh/' + kuhId] = wertVal;          // ← plain number (Rules-friendly)
      updatePayload['meta/' + kuhId] = metaPayload;        // ← Attribution separat
      updatePayload['datum'] = datumTs;
      updatePayload['zeit'] = zeit || 'morgen';
      updatePayload['art'] = 'prokuh';
      updatePayload['lastUpdate'] = now;

      // Firebase-Write mit TIMEOUT: erst nach 30s als Fehler behandeln (schwache Alm-Verbindung).
      // WICHTIG: Nach Timeout NICHT gleich Fehler — erst READ machen ob der Wert doch am Server ist.
      // Denn oft geht der Write durch, nur die Ack-Bestätigung braucht > 10s wegen schlechter Verbindung.
      const writePromise = firebase.database().ref(entryPath).update(updatePayload);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout (30s) — Firebase-Verbindung möglicherweise blockiert')), 30000)
      );
      const clearPending = () => {
        const p2 = getPending();
        if(p2[entryKey] && p2[entryKey][kuhId] && Math.abs((p2[entryKey][kuhId].wert || 0) - wertVal) < 0.05) {
          delete p2[entryKey][kuhId];
          if(Object.keys(p2[entryKey]).length === 0) delete p2[entryKey];
          setPending(p2);
        }
        // Bei erfolgreichem Write: alten Sync-Error auto-clearen (schwache Verbindung war nur temporär)
        if(window._milchSyncError) { window._milchSyncError = null; window._milchErrorToastShown = false; }
        updateSyncBanner();
      };
      Promise.race([writePromise, timeoutPromise])
        .then(() => {
          console.log('[Milch v2] Server-Ack für:', kuhId, '=', wertVal);
          clearPending();
        })
        .catch(async (e) => {
          // Fix: VOR Fehler-Anzeige via REST (nicht SDK!) prüfen ob Wert am Server angekommen ist.
          try {
            const serverEntry = await _milchRestGet(entryPath);
            const serverVal = serverEntry && serverEntry.prokuh && serverEntry.prokuh[kuhId];
            if(serverVal != null && Math.abs(parseFloat(serverVal) - wertVal) < 0.05) {
              console.log('[Milch v2] Timeout — aber Wert IST am Server (REST):', serverVal, '→ clear pending');
              clearPending();
              return;
            }
            console.warn('[Milch v2] Timeout & Wert NICHT am Server (REST) → echter Fehler');
          } catch(readErr) {
            console.warn('[Milch v2] REST-Verify-Read fehlgeschlagen:', readErr);
          }
          handleSyncError(e, 'write');
        });
    }
  } catch(e) {
    handleSyncError(e, 'exception');
  }

  // 3. Banner updaten
  updateSyncBanner();
};

// ══════════════════════════════════════════════════════════════
//  Verbindungs-Reset: bei hängenden Writes hilft es Firebase's
//  WebSocket zu killen und neu aufbauen zu lassen.
// ══════════════════════════════════════════════════════════════
window.milchForceReconnect = function() {
  try {
    if(typeof firebase === 'undefined' || !firebase.database) {
      alert('Firebase nicht verfügbar');
      return;
    }
    firebase.database().goOffline();
    if(window.showSaveToast) window.showSaveToast('🔌 Verbindung getrennt…');
    setTimeout(() => {
      firebase.database().goOnline();
      if(window.showSaveToast) window.showSaveToast('🔌 Verbindung neu aufgebaut');
      setTimeout(() => {
        syncMilchPending();
        updateSyncBanner();
      }, 1000);
    }, 1500);
  } catch(e) {
    console.error('[Milch v2] Reconnect err:', e);
    alert('Fehler beim Neuverbinden: ' + e.message);
  }
};

// ── Zusätzlich: Firebase-Verbindungs-Status live abfragen ──
window.getFirebaseConnected = function(cb) {
  try {
    if(typeof firebase === 'undefined' || !firebase.database) { cb(false); return; }
    firebase.database().ref('.info/connected').once('value')
      .then(s => cb(!!s.val()))
      .catch(() => cb(null));
  } catch(e) { cb(null); }
};

// ── DIREKT-Bestätigung: nach erfolgreichem Write direkt aus Firebase lesen und
//    pending clearen (unabhängig von render-hook der bei manchen Builds nicht greift)
function confirmMilchPendingDirect(entryKey, kuhId, expectedWert) {
  if(typeof firebase === 'undefined' || !firebase.database) return;
  firebase.database().ref('milch/' + entryKey + '/prokuh/' + kuhId).once('value')
    .then(snap => {
      const val = snap.val();
      if(val == null) return;
      const p = getPending();
      if(!p[entryKey] || !p[entryKey][kuhId]) return;
      const num = parseFloat(val) || (val && val.wert) || 0;
      // Wenn Server-Wert ≈ erwarteter Wert → als synced markieren
      if(Math.abs(num - expectedWert) < 0.05) {
        delete p[entryKey][kuhId];
        if(Object.keys(p[entryKey]).length === 0) delete p[entryKey];
        setPending(p);
        console.log('[Milch v2] Direkt bestätigt:', kuhId, '=', expectedWert);
        updateSyncBanner();
      }
    })
    .catch(e => console.warn('[Milch v2] Direkt-Bestätigung read err:', e));
}

// ── REST-basierter Server-Read (bypasst Firebase-SDK-Cache komplett) ──
// KRITISCH: .get()/.once() im SDK können Werte aus lokalem Cache zurückgeben, auch wenn
// der Write auf dem Server mit PERMISSION_DENIED abgelehnt wurde. Deshalb REST.
async function _milchRestGet(path) {
  if(typeof firebase === 'undefined' || !firebase.auth) throw new Error('Firebase nicht geladen');
  const user = firebase.auth().currentUser;
  if(!user) throw new Error('Kein Auth-User (currentUser == null)');
  const token = await user.getIdToken(false);
  const dbUrl = (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.databaseURL) || '';
  if(!dbUrl) throw new Error('Keine databaseURL');
  const url = dbUrl.replace(/\/$/, '') + '/' + path.replace(/^\//, '') + '.json?auth=' + encodeURIComponent(token);
  const res = await fetch(url, { method: 'GET', cache: 'no-store' });
  if(!res.ok) throw new Error('REST ' + res.status + ' ' + res.statusText);
  return await res.json();
}

// ── Alle Pending gegen Firebase abgleichen (Bestätigung erzwingen) ──
// Nutzt REST statt SDK — garantiert echter Server-Zustand.
async function _milchConfirmAllInternal(silent) {
  if(typeof firebase === 'undefined' || !firebase.database) return {checked:0, confirmed:0, errors:0};
  const p = getPending();
  const entries = Object.entries(p);
  if(entries.length === 0) return {checked:0, confirmed:0, errors:0};
  let confirmed = 0, checked = 0, errors = 0;
  console.log('[Milch v2] confirmAll START (REST): ' + entries.length + ' Termine');
  for(const [entryKey, cows] of entries) {
    try {
      // REST-GET: echte Server-Daten, KEIN lokaler Cache
      const val = await _milchRestGet('milch/' + entryKey);
      if(!val || !val.prokuh) {
        console.log('[Milch v2] confirmAll ' + entryKey + ': KEIN val.prokuh am Server');
        // KEINE cows dieses Termins bestätigen (Werte sind nicht am Server!)
        for(const [kuhId] of Object.entries(cows)) { checked++; }
        continue;
      }
      for(const [kuhId, payload] of Object.entries(cows)) {
        checked++;
        const fbVal = val.prokuh[kuhId];
        if(fbVal == null) {
          console.log('[Milch v2] confirmAll ' + kuhId + ': NICHT am Server');
          continue;
        }
        const num = parseFloat(fbVal) || (fbVal && fbVal.wert) || 0;
        if(Math.abs(num - payload.wert) < 0.05) {
          const pNow = getPending();
          if(pNow[entryKey] && pNow[entryKey][kuhId]) {
            delete pNow[entryKey][kuhId];
            if(Object.keys(pNow[entryKey]).length === 0) delete pNow[entryKey];
            setPending(pNow);
            confirmed++;
          }
        } else {
          console.log('[Milch v2] confirmAll ' + kuhId + ': Werte weichen ab (Server:' + num + ' vs Pending:' + payload.wert + ')');
        }
      }
    } catch(e) {
      errors++;
      console.warn('[Milch v2] confirmAll err für ' + entryKey + ':', e);
    }
  }
  console.log('[Milch v2] confirmAll ENDE (REST): ' + confirmed + '/' + checked + ' bestätigt, ' + errors + ' Fehler');
  updateSyncBanner();
  return {checked, confirmed, errors};
}

window.milchConfirmAllPending = async function() {
  const before = countPending();
  if(before === 0) {
    if(window.showSaveToast) window.showSaveToast('✓ Keine pending Werte');
    return;
  }
  const {checked, confirmed} = await _milchConfirmAllInternal(false);
  alert('🔍 Bestätigungs-Prüfung fertig:\n\n' +
        checked + ' Werte geprüft\n' +
        confirmed + ' Werte als synced markiert\n' +
        (countPending() > 0 ? '\n' + countPending() + ' Werte übrig — sind wirklich noch nicht in Cloud' : '\n\n✓ Alles bestätigt!'));
};

// ── NEU ANMELDEN: bei verlorener Firebase-Auth-Session ohne Umweg über Einstellungen ──
// Wichtig: Pending-Werte bleiben in localStorage. Nach dem Login → auto Smart Retry.
window.milchNeuAnmelden = async function() {
  const pendingCount = countPending();
  // ── Wenn Auto-Login-Credentials existieren: erst still versuchen die zu nutzen ──
  const stored = localStorage.getItem('hp_autoauth');
  if(stored) {
    try {
      const decoded = JSON.parse(decodeURIComponent(escape(atob(stored))));
      if(decoded && decoded.e && decoded.p) {
        console.log('[Milch v2] Neu anmelden: probiere Auto-Login zuerst');
        try {
          await firebase.auth().signInWithEmailAndPassword(decoded.e, decoded.p);
          // Klappt → warte 2s bis Auth propagiert, dann SmartRetry
          if(window.showSaveToast) window.showSaveToast('🔑 Auto-angemeldet — Werte werden hochgeladen…');
          setTimeout(() => { if(window.milchSmartRetry) window.milchSmartRetry(); }, 2000);
          return;
        } catch(err) {
          console.warn('[Milch v2] Auto-Login-Retry failed:', err.code);
          // Falsche Credentials → weiter zur manuellen Anmeldung
          if(err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
            localStorage.removeItem('hp_autoauth');
          }
        }
      }
    } catch(e) {}
  }
  // Auto-Login gescheitert → manuelle Anmeldung
  const ok = confirm(
    '🔑 Firebase-Session verloren\n\n' +
    'Zur Anmeldeseite wechseln. Deine ' + pendingCount + ' Pending-Werte bleiben sicher gespeichert ' +
    'und werden nach dem Login automatisch hochgeladen.\n\nFortfahren?'
  );
  if(!ok) return;
  try { localStorage.setItem('milch_autoRetryAfterLogin', '1'); } catch(e) {}
  window._userExplicitlyLoggedOut = true;
  try {
    if(typeof firebase !== 'undefined' && firebase.auth) await firebase.auth().signOut();
  } catch(e) { console.warn('signOut err:', e); }
  try {
    const uid = localStorage.getItem('lastAuthUid');
    if(uid) localStorage.removeItem('cache_userProfile_' + uid);
    localStorage.removeItem('lastAuthUid');
    // hp_autoauth NICHT löschen — User will nicht dauerhaft raus, nur Session refreshen
  } catch(e) {}
  window._currentUser = null;
  window._currentRole = null;
  window._appInitialized = false;
  if(typeof window._handleAuthLogout === 'function') window._handleAuthLogout();
};

// ── RECOVERY: Werte aus Firebase-SDK-Cache holen und mit Server abgleichen ──
// Wenn Werte fälschlich als "in Cloud" markiert wurden aber am Server fehlen (weil
// PERMISSION_DENIED beim Write): findet sie im lokalen milchEintraege-Cache und
// pusht sie sauber neu zum Server.
window.milchRecoverLostValues = async function() {
  if(typeof firebase === 'undefined' || !firebase.auth || !firebase.auth().currentUser) {
    alert('❌ Bitte zuerst neu anmelden (currentUser == null)');
    return;
  }
  console.log('[Milch v2] RECOVERY: Start');
  const localEintraege = window.milchEintraege || {};
  const heuteIso = new Date().toISOString().slice(0,10);
  const gestern = new Date(Date.now() - 24*3600*1000).toISOString().slice(0,10);
  // Vergleiche für die letzten 2 Tage: lokal vs. Server via REST
  const zuPushen = [];   // [{entryKey, kuhId, wert}]
  const eintrageKeys = Object.keys(localEintraege);
  for(const entryKey of eintrageKeys) {
    const local = localEintraege[entryKey];
    if(!local || !local.prokuh) continue;
    // Nur letzte 2 Tage (Recovery ist für frische Werte)
    const localDay = (entryKey.match(/^v2_(\d{4}-\d{2}-\d{2})_/) || [])[1];
    if(localDay !== heuteIso && localDay !== gestern) continue;
    try {
      const serverVal = await _milchRestGet('milch/' + entryKey);
      const serverProkuh = (serverVal && serverVal.prokuh) || {};
      Object.entries(local.prokuh).forEach(([kuhId, val]) => {
        const localW = parseFloat(val && val.wert != null ? val.wert : val) || 0;
        if(localW <= 0) return;
        const serverW = parseFloat(serverProkuh[kuhId]);
        if(isNaN(serverW) || Math.abs(serverW - localW) >= 0.05) {
          zuPushen.push({entryKey, kuhId, wert: localW});
        }
      });
    } catch(e) { console.warn('[Recovery] REST err:', e); }
  }

  if(zuPushen.length === 0) {
    alert('✓ Alles konsistent — nichts wiederherzustellen.\n\nAlle lokalen Werte für heute/gestern sind auch am Server.');
    return;
  }

  const ok = confirm(
    '🔧 RECOVERY: ' + zuPushen.length + ' Werte gefunden die LOKAL da sind aber NICHT am Server.\n\n' +
    'Wenn du OK klickst, werden sie ins Pending gelegt und automatisch hochgeladen.\n\n' +
    'Beispiele:\n' +
    zuPushen.slice(0, 5).map(z => {
      const k = (window.kuehe||{})[z.kuhId];
      return '  · #' + (k?.nr||'?') + ' ' + (k?.name||'?') + ': ' + z.wert + ' L';
    }).join('\n') +
    (zuPushen.length > 5 ? '\n  … und ' + (zuPushen.length - 5) + ' weitere' : '')
  );
  if(!ok) return;

  // Zurück in pending legen und sync starten
  const p = getPending();
  const sessionId = getMilchSessionId();
  const userUid = window.getMilchUserUid();
  const userName = getUserName();
  const now = Date.now();
  zuPushen.forEach(({entryKey, kuhId, wert}) => {
    if(!p[entryKey]) p[entryKey] = {};
    p[entryKey][kuhId] = { wert: wert, session: sessionId, userUid: userUid, userName: userName, ts: now };
  });
  setPending(p);
  updateSyncBanner();
  console.log('[Milch v2] RECOVERY: ' + zuPushen.length + ' Werte ins Pending gelegt → sync');
  syncMilchPending();
  setTimeout(() => {
    alert('✓ Recovery gestartet — ' + zuPushen.length + ' Werte werden hochgeladen.\n\n' +
          'In 30 Sekunden auf "?"-Icon tippen zum Prüfen.');
  }, 500);
};

// ── SMART RETRY: Auth-Check → Token refresh → Confirm (READ) → gezielter Write ──
window.milchSmartRetry = async function() {
  console.log('[Milch v2] SMART RETRY: gestartet');

  // 0. KRITISCH: Prüfen ob Firebase-Auth einen User hat.
  // Wenn nicht → versuche stumm Auto-Login mit gespeicherten Credentials.
  let hasAuth = typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser;
  if(!hasAuth) {
    console.warn('[Milch v2] SMART RETRY: currentUser == NULL — versuche Auto-Login');
    const stored = localStorage.getItem('hp_autoauth');
    if(stored) {
      try {
        const decoded = JSON.parse(decodeURIComponent(escape(atob(stored))));
        if(decoded && decoded.e && decoded.p) {
          try {
            await firebase.auth().signInWithEmailAndPassword(decoded.e, decoded.p);
            await new Promise(r => setTimeout(r, 1500)); // Auth propagieren lassen
            hasAuth = !!firebase.auth().currentUser;
            console.log('[Milch v2] SMART RETRY: Auto-Login erfolgreich? ' + hasAuth);
          } catch(err) {
            console.warn('[Milch v2] SMART RETRY: Auto-Login fehlgeschlagen:', err.code);
          }
        }
      } catch(e) {}
    }
    if(!hasAuth) {
      window._milchSyncError = {
        msg: 'Firebase-Session weg + Auto-Login gescheitert. Bitte auf "🔑 Neu anmelden" tippen.',
        op: 'auth-missing',
        ts: Date.now()
      };
      updateSyncBanner();
      return;
    }
  }

  // 1. Sync-Error clearen damit Banner sich normal updated
  window._milchSyncError = null;
  window._milchErrorToastShown = false;
  updateSyncBanner();
  // 2. Token erneuern
  try {
    await firebase.auth().currentUser.getIdToken(true);
    console.log('[Milch v2] SMART RETRY: Token erneuert');
  } catch(e) { console.warn('[Milch v2] Token refresh:', e); }
  // 3. Server-READ + auto-clear
  try {
    const {checked, confirmed} = await _milchConfirmAllInternal(true);
    console.log('[Milch v2] SMART RETRY: Confirm ' + confirmed + '/' + checked);
  } catch(e) { console.warn('[Milch v2] Confirm:', e); }
  // 4. Rest neu schreiben
  const stillPending = countPending();
  if(stillPending > 0) {
    console.log('[Milch v2] SMART RETRY: ' + stillPending + ' echt fehlende → syncMilchPending');
    try { syncMilchPending(); } catch(e) {}
  } else {
    console.log('[Milch v2] SMART RETRY: alles am Server, nichts zu tun');
    if(window.showSaveToast) window.showSaveToast('✓ Alle Werte in der Cloud gesichert');
  }
};

// Interne Version für Auto-Aufrufe (kein Alert)
window._milchConfirmAllPendingSilent = () => _milchConfirmAllInternal(true);

// ── Sync-Fehler PERSISTENT machen (Banner nicht mehr überschreiben lassen) ──
window._milchSyncError = null;  // { msg, op, ts }

function handleSyncError(err, op) {
  console.error('[Milch v2] Sync-Fehler (' + op + '):', err);
  const msg = err && err.message ? err.message : String(err);
  // Timeout-Fehler bei offline sind normal → nur loggen, kein Banner
  if(msg.toLowerCase().includes('timeout') && !navigator.onLine) {
    console.log('[Milch v2] Timeout offline — ignoriert, wird bei online neu versucht');
    return;
  }
  // Fix: Bei PERMISSION_DENIED → milchSmartRetry (refresh + READ-Confirm + gezieltes syncMilchPending)
  // Damit: Werte die AM SERVER SIND werden aus pending gecleart, auch wenn PERMISSION_DENIED noch wirkt.
  if(/permission[_-]?denied/i.test(msg) && !window._milchPermissionRetryPending) {
    window._milchPermissionRetryPending = true;
    console.warn('[Milch v2] PERMISSION_DENIED — starte Smart-Retry (refresh + confirm + resync)');
    (async () => {
      try { if(window.milchSmartRetry) await window.milchSmartRetry(); }
      catch(e) { console.warn('[Milch v2] SmartRetry in handleSyncError:', e); }
      finally { setTimeout(() => { window._milchPermissionRetryPending = false; }, 8000); }
    })();
    return;
  }
  // Persistent speichern damit updateSyncBanner nicht überschreibt
  window._milchSyncError = { msg: msg, op: op, ts: Date.now() };
  // Auch in localStorage loggen für spätere Diagnose
  try {
    const log = JSON.parse(localStorage.getItem('milchSyncErrorLog') || '[]');
    log.push({ msg, op, ts: Date.now() });
    if(log.length > 20) log.splice(0, log.length - 20);
    localStorage.setItem('milchSyncErrorLog', JSON.stringify(log));
  } catch(e) {}
  updateSyncBanner();
  // Toast (nur einmal pro Session, nicht spammen)
  if(!window._milchErrorToastShown && window.showSaveToast) {
    window._milchErrorToastShown = true;
    if(msg.toLowerCase().includes('permission')) {
      window.showSaveToast('❌ Firebase-Rechte verweigern Schreiben. Admin kontaktieren.');
    } else if(msg.toLowerCase().includes('timeout')) {
      window.showSaveToast('❌ Firebase-Timeout — auf „🔌 Neu verbinden" tippen');
    } else {
      window.showSaveToast('❌ Sync-Fehler: ' + msg.slice(0, 80));
    }
    setTimeout(() => { window._milchErrorToastShown = false; }, 60000);
  }
}

window.clearMilchSyncError = function() {
  window._milchSyncError = null;
  window._milchErrorToastShown = false;
  updateSyncBanner();
};

// ── EINZELNEN Pending-Wert live synchen und Ergebnis genau zeigen ──
window.milchSyncOneAndReport = async function(entryKey, kuhId) {
  const pending = getPending();
  const payload = pending[entryKey] && pending[entryKey][kuhId];
  if(!payload) { alert('Wert nicht mehr in pending.'); return; }

  const raw = entryKey.replace(/^v2_/, '');
  const parts = raw.split('_');
  const iso = parts[0];
  const zeit = parts[1] || 'morgen';
  const datumTs = new Date(iso + 'T12:00').getTime();

  const updatePayload = {};
  updatePayload['datum'] = datumTs;
  updatePayload['zeit'] = zeit;
  updatePayload['art'] = 'prokuh';
  updatePayload['lastUpdate'] = Date.now();
  updatePayload['prokuh/' + kuhId] = parseFloat(payload.wert) || 0;
  updatePayload['meta/' + kuhId] = {
    session: payload.session,
    userName: payload.userName,
    ts: payload.ts
  };

  const targetPath = 'milch/' + entryKey;
  const start = Date.now();
  let writeResult, readResult;
  try {
    const wp = firebase.database().ref(targetPath).update(updatePayload);
    const tp = new Promise((_, reject) => setTimeout(() => reject(new Error('Write-Timeout 10s')), 10000));
    await Promise.race([wp, tp]);
    writeResult = '✓ OK (' + (Date.now() - start) + 'ms)';
  } catch(e) {
    writeResult = '❌ FAIL: ' + (e.message || String(e)).slice(0, 100);
  }

  // Jetzt gleich lesen was ankam
  const readStart = Date.now();
  try {
    const snap = await firebase.database().ref(targetPath).once('value');
    const val = snap.val();
    if(val && val.prokuh && val.prokuh[kuhId] != null) {
      readResult = '✓ Wert am Server: ' + val.prokuh[kuhId] + ' (Read ' + (Date.now() - readStart) + 'ms)';
    } else {
      readResult = '❌ Wert NICHT am Server nach Write! Entry vorhanden: ' + (val ? 'ja' : 'nein');
    }
  } catch(e) {
    readResult = '❌ Read fail: ' + (e.message || e);
  }

  alert(
    '🔬 EINZEL-SYNC-TEST\n\n' +
    'Pfad: ' + targetPath + '\n' +
    'Kuh-ID: ' + kuhId + '\n' +
    'Wert: ' + payload.wert + ' L\n' +
    'Session (pending): ' + payload.session + '\n' +
    'Session (aktuell): ' + getMilchSessionId() + '\n\n' +
    'WRITE: ' + writeResult + '\n' +
    'READ nach Write: ' + readResult + '\n\n' +
    (writeResult.startsWith('✓') && readResult.startsWith('✓')
      ? '→ Write geht durch! Falls Banner trotzdem hängt: Bestätigungs-Logik ist buggy.\n   Auf „🔄 Retry alle" tippen sollte pending clearen.'
      : '→ Hier ist der Fehler. Details oben.')
  );
};

// ── Test-Write: testet 3 verschiedene Firebase-Pfade um die Rules zu diagnostizieren ──
window.milchTestWrite = async function() {
  if(typeof firebase === 'undefined' || !firebase.database) {
    alert('Firebase nicht verfügbar');
    return;
  }
  const runOne = async function(path, payload) {
    const start = Date.now();
    try {
      const wp = firebase.database().ref(path).set(payload);
      const tp = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout 8s')), 8000));
      await Promise.race([wp, tp]);
      // Cleanup wenn erfolgreich (auf altem Pfad)
      firebase.database().ref(path).remove().catch(() => {});
      return { ok: true, ms: Date.now() - start };
    } catch(e) {
      return { ok: false, ms: Date.now() - start, err: (e.message || String(e)).slice(0, 100) };
    }
  };

  const now = Date.now();
  const results = {};

  // Test 1: alter random-key Pfad wie bisher (funktionierte vor v2)
  results.oldStyle = await runOne('milch/-TEST_' + now, {
    datum: now, zeit: 'test', art: 'prokuh', gesamt: 0, test: true
  });

  // Test 2: neuer v2_ deterministic Pfad wie im aktuellen Code
  results.newStyle = await runOne('milch/v2_TEST_' + now, {
    datum: now, zeit: 'test', art: 'prokuh', lastUpdate: now, test: true
  });

  // Test 3: v2_-Pfad MIT meta/-Zweig (das ist was die App wirklich schreibt)
  const kuhTestId = '-testcowid_' + now;
  results.newStyleFull = await runOne('milch/v2_TEST2_' + now, {
    datum: now, zeit: 'test', art: 'prokuh', lastUpdate: now,
    prokuh: { [kuhTestId]: 3.3 },
    meta:   { [kuhTestId]: { session: getMilchSessionId(), userName: 'Test', ts: now } }
  });

  const mark = r => r.ok ? '✓ OK (' + r.ms + 'ms)' : '❌ FAIL (' + r.err + ')';
  const diag =
    '📋 FIREBASE-WRITE DIAGNOSE:\n\n' +
    '1) milch/-TEST_… (alter Stil):\n   ' + mark(results.oldStyle) + '\n\n' +
    '2) milch/v2_TEST_… (nur Metadaten):\n   ' + mark(results.newStyle) + '\n\n' +
    '3) milch/v2_TEST2_… (mit prokuh+meta):\n   ' + mark(results.newStyleFull) + '\n\n';

  let hinweis = '';
  if(results.oldStyle.ok && !results.newStyle.ok) {
    hinweis = '👉 ALTE Pfade ok, aber v2_ wird abgelehnt.\nRules blockieren Keys die nicht mit „-" beginnen.\n\n' +
              'FIREBASE-CONSOLE öffnen:\n' +
              'https://console.firebase.google.com\n→ Realtime Database → Regeln → prüfen ob es .validate auf $id gibt';
  } else if(results.newStyle.ok && !results.newStyleFull.ok) {
    hinweis = '👉 v2_-Pfad OK, aber meta/ oder prokuh/ wird abgelehnt.\n' +
              'Rules haben wahrscheinlich .validate auf prokuh/$kid oder verbieten unbekannte Felder.';
  } else if(!results.oldStyle.ok && !results.newStyle.ok && !results.newStyleFull.ok) {
    hinweis = '👉 GAR NICHTS schreibbar auf /milch. Rules komplett zu.\n' +
              'Firebase-Console öffnen und Regel setzen:\n\n' +
              '"milch": {\n  ".read": "auth != null",\n  ".write": "auth != null"\n}';
  } else if(results.oldStyle.ok && results.newStyle.ok && results.newStyleFull.ok) {
    hinweis = '👉 Alle Tests OK! Rules erlauben alles. Wenn Milch trotzdem hängt,\n' +
              'ist es kein Rules-Problem. Nächster Schritt: Konsole prüfen.';
  }

  alert(diag + hinweis);
};

// ══════════════════════════════════════════════════════════════
//  Retry-Sync: alle pending Werte nochmal an Firebase pushen
// ══════════════════════════════════════════════════════════════
window.syncMilchPending = function() {
  const pending = getPending();
  const entryKeys = Object.keys(pending);
  if(entryKeys.length === 0) return;
  if(typeof firebase === 'undefined' || !firebase.database) return;

  entryKeys.forEach(entryKey => {
    const cows = pending[entryKey];
    if(!cows || Object.keys(cows).length === 0) return;
    // Datum + Zeit aus entryKey extrahieren
    const raw = entryKey.replace(/^v2_/, '');
    const parts = raw.split('_');
    const iso = parts[0];
    const zeit = parts[1] || 'morgen';
    const datumTs = new Date(iso + 'T12:00').getTime();

    const updatePayload = {};
    updatePayload['datum'] = datumTs;
    updatePayload['zeit'] = zeit;
    updatePayload['art'] = 'prokuh';
    updatePayload['lastUpdate'] = Date.now();
    Object.entries(cows).forEach(([kuhId, payload]) => {
      // Wert als plain number, Meta separat
      updatePayload['prokuh/' + kuhId] = parseFloat(payload.wert) || 0;
      updatePayload['meta/' + kuhId] = {
        session: payload.session,
        userName: payload.userName,
        ts: payload.ts
      };
    });

    // Timeout auf Retry-Sync: 30s (schwache Alm-Verbindung — Websocket-Ack kann sehr lange dauern)
    const snapshotCows = Object.entries(cows).map(([kuhId, p]) => ({ kuhId, wert: p.wert }));
    const wp = firebase.database().ref('milch/' + entryKey).update(updatePayload);
    const tp = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Retry-Timeout (30s) — Verbindung neu aufbauen')), 30000)
    );
    const clearRetryPending = () => {
      const p2 = getPending();
      if(p2[entryKey]) {
        snapshotCows.forEach(({kuhId, wert}) => {
          if(p2[entryKey][kuhId] && Math.abs((p2[entryKey][kuhId].wert || 0) - wert) < 0.05) {
            delete p2[entryKey][kuhId];
          }
        });
        if(Object.keys(p2[entryKey]).length === 0) delete p2[entryKey];
        setPending(p2);
      }
      // Bei erfolgreichem Retry-Write: alten Sync-Error auto-clearen
      if(window._milchSyncError) { window._milchSyncError = null; window._milchErrorToastShown = false; }
      updateSyncBanner();
    };
    Promise.race([wp, tp])
      .then(() => {
        console.log('[Milch v2] Retry-Sync Server-Ack für', entryKey);
        clearRetryPending();
      })
      .catch(async (e) => {
        // Fix: bei Timeout via REST (nicht SDK!) prüfen
        try {
          const serverEntry = await _milchRestGet('milch/' + entryKey);
          const serverProkuh = (serverEntry && serverEntry.prokuh) || {};
          let alleDrin = true;
          snapshotCows.forEach(({kuhId, wert}) => {
            const sv = parseFloat(serverProkuh[kuhId]);
            if(isNaN(sv) || Math.abs(sv - wert) >= 0.05) alleDrin = false;
          });
          if(alleDrin) {
            console.log('[Milch v2] Retry-Timeout — aber ALLE Werte am Server (REST) → clear pending');
            clearRetryPending();
            return;
          }
          console.warn('[Milch v2] Retry-Timeout & Werte nicht komplett am Server (REST) → Fehler');
        } catch(readErr) {
          console.warn('[Milch v2] REST-Verify-Read fehlgeschlagen:', readErr);
        }
        handleSyncError(e, 'retry-sync');
      });
  });
};

// ══════════════════════════════════════════════════════════════
//  Listener-Confirmation: von Firebase kommende Werte prüfen
//  - Wenn eigener Wert bestätigt → aus pending entfernen
//  - Wenn anderer Melker überschrieben hat → Konflikt merken
// ══════════════════════════════════════════════════════════════
window.onMilchEintraegeChanged = function() {
  // ── WICHTIG: NICHT automatisch pending clearen, weil Firebase-Listener
  // auch mit LOKAL-optimistischen Werten feuert (die noch nicht am Server sind).
  // Das war der Kernbug: Banner ging grün obwohl Werte nur lokal im Cache waren.
  // Pending wird JETZT NUR noch von pushMilchWert.then geklärt (nach echtem Server-Ack).
  // Diese Funktion prüft NUR noch auf Konflikte (andere User haben überschrieben).

  const p = getPending();
  const eintraege = window.milchEintraege || {};
  const isOwn = window._milchIsOwnMeta;
  let changed = false;

  Object.entries(p).forEach(([entryKey, cows]) => {
    const fbEntry = eintraege[entryKey];
    if(!fbEntry || !fbEntry.prokuh) return;
    const fbMeta = fbEntry.meta || {};
    Object.entries(cows).forEach(([kuhId, payload]) => {
      const fbVal = fbEntry.prokuh[kuhId];
      const meta = fbMeta[kuhId];
      if(fbVal == null) return;
      // ── NUR NOCH KONFLIKT-DETECTION, KEIN AUTO-CONFIRM ──
      // Konflikt: ANDERER User mit späterem ts → hat unseren Wert überschrieben
      if(typeof fbVal === 'number' || typeof fbVal === 'string') {
        if(meta && (meta.userUid || meta.session) && isOwn && !isOwn(meta) && (meta.ts || 0) > (payload.ts || 0)) {
          addKonflikt({
            entryKey, kuhId,
            meinWert: payload.wert,
            meineSession: payload.session,
            fremdWert: parseFloat(fbVal) || 0,
            fremdSession: meta.session,
            fremdName: meta.userName || 'Anderer Melker',
            ts: Date.now()
          });
          delete p[entryKey][kuhId];
          if(Object.keys(p[entryKey]).length === 0) delete p[entryKey];
          changed = true;
        }
      }
    });
  });
  if(changed) setPending(p);
  updateSyncBanner();
};

// ══════════════════════════════════════════════════════════════
//  Globaler Sync-Banner (ganz oben in der App)
// ══════════════════════════════════════════════════════════════
window.updateSyncBanner = function() {
  let banner = document.getElementById('milch-sync-banner');
  if(!banner) return;

  const setBannerVisible = (v) => document.body.classList.toggle('milch-banner-visible', !!v);

  // Auf Login-Screen: Banner ausblenden
  const loginVisible = document.getElementById('login-screen')?.style.display !== 'none';
  const rootVisible  = document.getElementById('root')?.style.display !== 'none';
  if(loginVisible || !rootVisible) {
    banner.style.display = 'none';
    setBannerVisible(false);
    return;
  }

  // ── NEU: Banner NUR auf Milch-Views anzeigen ──
  // Auf allen anderen Ansichten (Kühe, Bauern, Behandlungen, Startseite, …) verbergen.
  // Ausnahme: Wenn ein akuter Fehler vorliegt (Sync-Error oder Konflikt) trotzdem zeigen,
  // damit der User es sieht und nicht Werte verliert.
  const view = window.currentView;
  const istMilchView = view === 'milch' || view === 'milch_erfassen';
  const hatFehler = !!window._milchSyncError || (getKonflikte().length > 0);
  if(!istMilchView && !hatFehler) {
    banner.style.display = 'none';
    setBannerVisible(false);
    return;
  }

  const n = countPending();
  const konfl = getKonflikte().length;
  const online = navigator.onLine;
  const v = ' <span style="opacity:.5;font-size:.65rem">[v' + (window.MILCH_V2_VERSION || '?') + ']</span>';
  const qBtn = '<button class="milch-sync-action" onclick="showMilchPendingDetails()" title="Details / Diagnose">?</button>';

  let stateClass, iconEmoji, msg, actionBtn = '';

  // ── PRIO 1: Auth ist verloren (currentUser == null) → das ist der ECHTE Fehler ──
  // Bevor irgendwas anderes gezeigt wird: prüfen ob Firebase überhaupt einen Auth-User hat.
  // Wenn nicht → prominenter Neu-Anmelden-Button, weil kein Write geht ohne Auth.
  const hasAuth = typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser;
  if(!hasAuth && n > 0) {
    stateClass = 'milch-sync-error';
    iconEmoji = '🔑';
    msg = 'Session verloren · ' + n + ' Wert' + (n > 1 ? 'e' : '') + ' warten · Neu anmelden!';
    actionBtn = '<button class="milch-sync-action" style="background:#e05a5a;color:#fff;font-weight:700" onclick="milchNeuAnmelden()">🔑 Neu anmelden</button>';
    banner.style.display = 'flex';
    setBannerVisible(true);
    banner.className = 'milch-sync-banner ' + stateClass;
    banner.innerHTML = '<span>' + iconEmoji + '</span>' + '<span>' + msg + v + '</span>' + qBtn + actionBtn;
    return;
  }

  if(window._milchSyncError && n > 0) {
    stateClass = 'milch-sync-error';
    iconEmoji = '❌';
    msg = 'Sync-Fehler: ' + window._milchSyncError.msg.slice(0, 60);
    actionBtn = '<button class="milch-sync-action" onclick="milchSmartRetry()">Retry</button>';
  } else if(konfl > 0) {
    stateClass = 'milch-sync-error';
    iconEmoji = '⚠';
    msg = konfl + ' Milch-Konflikt' + (konfl > 1 ? 'e' : '') + ' — bitte klären';
    actionBtn = '<button class="milch-sync-action" onclick="showMilchKonflikte()">Anzeigen</button>';
  } else if(!online && n > 0) {
    stateClass = 'milch-sync-offline';
    iconEmoji = '📵';
    msg = 'Offline · ' + n + ' Wert' + (n > 1 ? 'e' : '') + ' lokal gesichert · Sync sobald online';
  } else if(!online) {
    stateClass = 'milch-sync-offline';
    iconEmoji = '📵';
    msg = 'Offline — Werte werden gesichert sobald wieder online';
  } else if(n > 0) {
    stateClass = 'milch-sync-pending';
    iconEmoji = '📤';
    msg = n + ' Wert' + (n > 1 ? 'e' : '') + ' werden übertragen…';
    actionBtn = '<button class="milch-sync-action" onclick="milchSmartRetry()">Jetzt versuchen</button>';
  } else {
    stateClass = 'milch-sync-ok';
    iconEmoji = '✓';
    msg = 'Alle Milchwerte in der Cloud gesichert';
  }

  banner.style.display = 'flex';
  setBannerVisible(true);
  banner.className = 'milch-sync-banner ' + stateClass;
  banner.innerHTML = '<span>' + iconEmoji + '</span>' +
    '<span>' + msg + v + '</span>' +
    qBtn + actionBtn;
  return;

  // ── Alter Code (nicht mehr verwendet) ──
  if(!online) {
    banner.className = 'milch-sync-banner milch-sync-offline';
    banner.innerHTML = '<span>📵</span><span>Offline · ' + n + ' Wert' + (n > 1 ? 'e' : '') +
      ' auf Gerät gesichert · Sync sobald online <span style="opacity:.5;font-size:.65rem">[v' + (window.MILCH_V2_VERSION || '?') + ']</span></span>';
  } else {
    banner.className = 'milch-sync-banner milch-sync-pending';
    banner.innerHTML = '<span>📤</span><span>' + n + ' Wert' + (n > 1 ? 'e' : '') +
      ' werden übertragen… <span style="opacity:.5;font-size:.65rem">[v' + (window.MILCH_V2_VERSION || '?') + ']</span></span>' +
      '<button class="milch-sync-action" onclick="showMilchPendingDetails()">?</button>' +
      '<button class="milch-sync-action" onclick="syncMilchPending()">Jetzt versuchen</button>';
  }
};

// ── Debug: zeigt was in pending steckt (mit Aktions-Buttons) ──
window.showMilchPendingDetails = function() {
  // Beim Öffnen: sofort still confirmen — cleart alle pending die schon am Server sind.
  // Damit du direkt den echten Zustand siehst und nicht 40 Zombie-Einträge.
  const _pBefore = countPending();
  if(_pBefore > 0 && window._milchConfirmAllPendingSilent) {
    window._milchConfirmAllPendingSilent().then(() => {
      const after = countPending();
      if(after !== _pBefore) {
        // Popup neu rendern mit aktuellem Stand
        setTimeout(() => window.showMilchPendingDetails(), 50);
      }
    }).catch(() => {});
  }

  const p = getPending();
  const entries = Object.entries(p);

  // Debug-Menü IMMER anzeigen (auch wenn alles synced ist)
  // Zeigt Info + Connection-Test + Retry-Optionen
  let ov = document.getElementById('milch-debug-overlay');
  if(!ov) {
    ov = document.createElement('div');
    ov.id = 'milch-debug-overlay';
    ov.className = 'form-overlay';
    ov.style.cssText = 'display:flex;z-index:700';
    document.body.appendChild(ov);
  }

  const total = entries.reduce((s,[,c]) => s + Object.keys(c).length, 0);
  let rowsHtml = '';
  entries.forEach(([entryKey, cows]) => {
    const raw = entryKey.replace(/^v2_/, '');
    rowsHtml += '<div style="margin:.7rem 0 .3rem;font-weight:700;color:var(--gold);font-size:.82rem">📅 ' + raw + '</div>';
    Object.entries(cows).forEach(([kuhId, payload]) => {
      const k = (window.kuehe || {})[kuhId];
      const nr = k ? '#' + k.nr : ('?' + kuhId.slice(-6));
      const name = k ? (k.name || '') : '(unbekannte Kuh)';
      const fbHas = ((window.milchEintraege||{})[entryKey]||{}).prokuh?.[kuhId];
      const fbMark = fbHas != null ? ' <span style="color:var(--green);font-size:.7rem">✓ in Cloud</span>' : ' <span style="color:var(--orange);font-size:.7rem">✗ nicht in Cloud</span>';
      rowsHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:.35rem .5rem;border:1px solid var(--border);border-radius:6px;margin-bottom:.25rem;font-size:.78rem;flex-wrap:wrap;gap:.3rem">' +
        '<span style="flex:1;min-width:60%">' + nr + ' ' + name + fbMark + '</span>' +
        '<div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap">' +
          '<b style="color:var(--gold)">' + payload.wert + ' L</b>' +
          '<button onclick="milchSyncOneAndReport(\'' + entryKey + '\',\'' + kuhId + '\')" style="background:rgba(74,184,232,.15);border:1px solid rgba(74,184,232,.5);color:#4ab8e8;padding:.2rem .5rem;border-radius:4px;font-size:.68rem;cursor:pointer">🔬 Test</button>' +
          '<button onclick="discardMilchPending(\'' + entryKey + '\',\'' + kuhId + '\')" style="background:rgba(200,60,60,.15);border:1px solid rgba(200,60,60,.5);color:#e05a5a;padding:.2rem .5rem;border-radius:4px;font-size:.68rem;cursor:pointer">Verwerfen</button>' +
        '</div>' +
      '</div>';
    });
  });

  ov.innerHTML =
    '<div class="form-sheet" style="max-height:85vh;overflow-y:auto">' +
      '<div class="form-header">' +
        '<h3>🔍 Milch-Sync Details</h3>' +
        '<button class="close-btn" onclick="document.getElementById(\'milch-debug-overlay\').remove()">✕</button>' +
      '</div>' +
      '<div class="form-body">' +
        '<div id="milch-debug-info" style="font-size:.75rem;color:var(--text2);background:var(--bg2);padding:.5rem .7rem;border-radius:6px;margin-bottom:.7rem;line-height:1.5">' +
          '<b>Modul-Version:</b> v' + (window.MILCH_V2_VERSION || '?') + '<br>' +
          '<b>Session-ID:</b> <span style="font-family:monospace;font-size:.7rem">' + getMilchSessionId() + '</span><br>' +
          '<b>Firebase geladen:</b> ' + (typeof firebase !== 'undefined' && firebase.database ? 'ja' : 'NEIN!') + '<br>' +
          '<b>Firebase-Auth-User:</b> ' + (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser
            ? '<span style="color:var(--green)">✓ ' + (firebase.auth().currentUser.email || firebase.auth().currentUser.uid.slice(0,8)) + '</span>'
            : '<span style="color:#e05a5a">❌ NULL — nicht authentifiziert! → Neu anmelden</span>') + '<br>' +
          '<b>navigator.onLine:</b> ' + navigator.onLine + '<br>' +
          '<b>Firebase-Socket:</b> <span id="milch-debug-conn">wird geprüft…</span><br>' +
          '<b>Ausstehend:</b> ' + total + ' Wert' + (total > 1 ? 'e' : '') +
          (window._milchSyncError ? '<br><b style="color:#e05a5a">Letzter Fehler:</b> <span style="color:#e05a5a">' + window._milchSyncError.msg + '</span>' : '') +
        '</div>' +
        (total > 0 ?
          '<div style="font-size:.75rem;color:var(--text3);margin-bottom:.4rem">' +
            '<b>„✓ in Cloud"</b> = Wert ist bereits am Server.<br>' +
            '<b>„✗ nicht in Cloud"</b> = Wert kam nie beim Server an.' +
          '</div>' +
          rowsHtml
        :
          '<div style="text-align:center;padding:1rem .5rem;color:var(--green);font-size:.9rem;background:rgba(77,184,78,.08);border:1px solid rgba(77,184,78,.25);border-radius:8px;margin-bottom:.7rem">' +
            '<div style="font-size:2rem;margin-bottom:.3rem">✅</div>' +
            '<b>Alles in der Cloud gesichert</b><br>' +
            '<span style="font-size:.72rem;color:var(--text3)">Keine ausstehenden Werte</span>' +
          '</div>'
        ) +
        '<div style="display:flex;gap:.5rem;margin-top:1rem;padding-top:.8rem;border-top:1px solid var(--border);flex-wrap:wrap">' +
          '<button class="btn-secondary" style="flex:1;min-width:7rem;background:rgba(77,184,78,.15);border-color:var(--green);color:var(--green)" onclick="milchConfirmAllPending();setTimeout(showMilchPendingDetails,1500)">🔍 Bestätigen</button>' +
          '<button class="btn-secondary" style="flex:1;min-width:7rem" onclick="milchTestWrite()">🧪 Test-Write</button>' +
          '<button class="btn-secondary" style="flex:1;min-width:7rem" onclick="milchSmartRetry();setTimeout(showMilchPendingDetails,1500)">🔄 Retry alle</button>' +
          '<button class="btn-secondary" style="flex:1;min-width:7rem;background:rgba(255,150,50,.15);border-color:#ff9632;color:#ff9632" onclick="milchRecoverLostValues()" title="Werte die lokal noch da sind aber am Server fehlen zurückholen">🔧 Recovery</button>' +
          '<button class="btn-secondary" style="flex:1;min-width:7rem;background:rgba(74,184,232,.15);border-color:#4ab8e8;color:#4ab8e8" onclick="milchForceReconnect();setTimeout(showMilchPendingDetails,3000)">🔌 Neu verbinden</button>' +
          '<button style="flex:1;min-width:7rem;background:rgba(200,60,60,.15);border:1px solid rgba(200,60,60,.5);color:#e05a5a;padding:.5rem;border-radius:8px;font-family:inherit;cursor:pointer;font-weight:600" onclick="clearMilchPending();document.getElementById(\'milch-debug-overlay\').remove()">🗑 ALLE verwerfen</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Live Firebase-Socket-Status abfragen und einblenden
  window.getFirebaseConnected(function(connected) {
    const el = document.getElementById('milch-debug-conn');
    if(!el) return;
    if(connected === true) el.innerHTML = '<span style="color:var(--green)">✓ verbunden</span>';
    else if(connected === false) el.innerHTML = '<span style="color:var(--orange)">✗ getrennt (WebSocket tot!)</span>';
    else el.innerHTML = '<span style="color:var(--text3)">unbekannt</span>';
  });
};

// ── Einzelnen Pending-Wert verwerfen (aus Debug-Dialog) ──
window.discardMilchPending = function(entryKey, kuhId) {
  const p = getPending();
  if(p[entryKey] && p[entryKey][kuhId]) {
    const wert = p[entryKey][kuhId].wert;
    delete p[entryKey][kuhId];
    if(Object.keys(p[entryKey]).length === 0) delete p[entryKey];
    setPending(p);
    updateSyncBanner();
    if(window.showSaveToast) window.showSaveToast('✓ Wert ' + wert + ' L verworfen');
    // Dialog neu rendern
    setTimeout(showMilchPendingDetails, 100);
  }
};

// ── Notfall: alle pending löschen ──
window.clearMilchPending = function() {
  if(!confirm('Wirklich ALLE ' + countPending() + ' ausstehenden Milchwerte VERWERFEN?\n\nDies löscht sie nur lokal — Werte die schon in der Cloud sind bleiben. Fortfahren?')) return;
  try { localStorage.removeItem('milchPendingV2'); } catch(e) {}
  updateSyncBanner();
  if(window.showSaveToast) window.showSaveToast('✓ Alle Pending gelöscht');
};

// ══════════════════════════════════════════════════════════════
//  Konflikt-Dialog
// ══════════════════════════════════════════════════════════════
window.showMilchKonflikte = function() {
  const list = getKonflikte();
  if(list.length === 0) {
    const ov = document.getElementById('milch-konflikt-overlay');
    if(ov) ov.remove();
    return;
  }

  let ov = document.getElementById('milch-konflikt-overlay');
  if(!ov) {
    ov = document.createElement('div');
    ov.id = 'milch-konflikt-overlay';
    ov.className = 'form-overlay';
    ov.style.cssText = 'display:flex;z-index:600';
    document.body.appendChild(ov);
  }

  const rows = list.map((k, i) => {
    const kuh = (window.kuehe || {})[k.kuhId] || {};
    const nr = kuh.nr || '?';
    const name = kuh.name || '';
    const raw = k.entryKey.replace(/^v2_/, '');
    const parts = raw.split('_');
    const iso = parts[0];
    const zeit = parts[1] || 'morgen';
    const datStr = iso ? new Date(iso + 'T12:00').toLocaleDateString('de-AT', {day:'numeric', month:'short'}) : '';
    const zeitStr = zeit === 'abend' ? '🌇 abends' : '🌅 morgens';
    return '<div style="border:1px solid var(--border);border-radius:8px;padding:.6rem;margin-bottom:.5rem;background:var(--bg2)">' +
      '<div style="font-weight:700;margin-bottom:.3rem">#' + nr + ' ' + name + ' · ' + datStr + ' ' + zeitStr + '</div>' +
      '<div style="font-size:.78rem;color:var(--text2);margin-bottom:.5rem;line-height:1.6">' +
        'Dein Wert war: <b style="color:var(--gold)">' + k.meinWert + ' L</b><br>' +
        (k.fremdName || 'Anderer Melker') + ' hat überschrieben mit: <b style="color:var(--orange)">' + k.fremdWert + ' L</b>' +
      '</div>' +
      '<div style="display:flex;gap:.4rem;flex-wrap:wrap">' +
        '<button class="btn-secondary" style="flex:1;font-size:.75rem;min-width:100px" onclick="resolveMilchKonflikt(' + i + ',\'mein\')">Mein Wert (' + k.meinWert + ' L)</button>' +
        '<button class="btn-secondary" style="flex:1;font-size:.75rem;min-width:100px" onclick="resolveMilchKonflikt(' + i + ',\'fremd\')">' + (k.fremdName || 'Anderer') + ' behalten (' + k.fremdWert + ' L)</button>' +
      '</div>' +
    '</div>';
  }).join('');

  ov.innerHTML =
    '<div class="form-sheet" style="max-height:85vh;overflow-y:auto">' +
      '<div class="form-header">' +
        '<h3>⚠ Milch-Konflikte (' + list.length + ')</h3>' +
        '<button class="close-btn" onclick="document.getElementById(\'milch-konflikt-overlay\').remove()">✕</button>' +
      '</div>' +
      '<div class="form-body">' +
        '<div style="font-size:.8rem;color:var(--text2);margin-bottom:.7rem;padding:.5rem .7rem;background:rgba(230,126,34,.08);border-radius:6px">' +
          'Ein anderer Melker hat einige deiner Werte überschrieben. Bitte klär welcher richtig ist:' +
        '</div>' +
        rows +
      '</div>' +
    '</div>';
  ov.style.display = 'flex';
};

window.resolveMilchKonflikt = function(idx, wahl) {
  const list = getKonflikte();
  const k = list[idx];
  if(!k) return;
  if(wahl === 'mein') {
    const raw = k.entryKey.replace(/^v2_/, '');
    const parts = raw.split('_');
    const iso = parts[0];
    const zeit = parts[1] || 'morgen';
    pushMilchWert(k.kuhId, k.meinWert, iso, zeit);
  }
  list.splice(idx, 1);
  setKonflikte(list);
  updateSyncBanner();
  if(list.length === 0) {
    const ov = document.getElementById('milch-konflikt-overlay');
    if(ov) ov.remove();
  } else {
    showMilchKonflikte();
  }
};

// ══════════════════════════════════════════════════════════════
//  OVERRIDE: onMilchInput – bei jedem Tippen sofort speichern
// ══════════════════════════════════════════════════════════════
window.onMilchInput = function(inp) {
  const row = inp.closest('.milch-kuh-row');
  const val = parseFloat((inp.value||'').replace(',','.')) || 0;
  if(row) {
    row.style.background = val > 0 ? 'rgba(77,184,78,.08)' : '';
    const badge = row.querySelector('.nr-badge');
    if(badge) badge.style.background = val > 0 ? 'var(--green)' : '';
  }
  // Summe live updaten
  let sum = 0, count = 0;
  document.querySelectorAll('.kuh-liter').forEach(i => {
    const v = parseFloat((i.value||'').replace(',','.')) || 0;
    if(v > 0) { sum += v; count++; }
  });
  const sumEl = document.getElementById('m-summe'); if(sumEl) sumEl.textContent = Math.round(sum*10)/10;
  const cntEl = document.getElementById('m-count'); if(cntEl) cntEl.textContent = count;

  // Wert für DIESE Kuh sofort speichern (debounced pro Kuh — 400ms)
  const kuhId = inp.dataset.id;
  const datum = document.getElementById('m-datum')?.value;
  const zeit = document.getElementById('m-zeit')?.value || 'morgen';
  if(kuhId && datum) {
    if(!window._milchInputTimers) window._milchInputTimers = {};
    if(window._milchInputTimers[kuhId]) clearTimeout(window._milchInputTimers[kuhId]);
    window._milchInputTimers[kuhId] = setTimeout(() => {
      pushMilchWert(kuhId, val, datum, zeit);
      delete window._milchInputTimers[kuhId];
    }, 400);
  }

  // Statusanzeige im Formular
  const el = document.getElementById('milch-autosave-indicator');
  if(el) {
    const t = new Date().toLocaleTimeString('de-AT', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    el.textContent = '🛡 ' + count + ' Kühe · ' + t;
    el.style.color = 'var(--green)';
  }
};

// ══════════════════════════════════════════════════════════════
//  OVERRIDE: saveMilch – nur noch „Fertig", schließt Form
// ══════════════════════════════════════════════════════════════
// Bildschirmfüllender roter Warnung-Dialog wenn Save nicht verifiziert werden kann
window._milchZeigeSaveFehler = function(titel, text, retryFn) {
  let ov = document.getElementById('milch-save-fehler-ov');
  if(!ov) {
    ov = document.createElement('div');
    ov.id = 'milch-save-fehler-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(120,20,20,.97);display:flex;align-items:center;justify-content:center;padding:1rem;font-family:inherit';
    document.body.appendChild(ov);
  }
  ov.innerHTML =
    '<div style="max-width:520px;width:100%;background:var(--bg2);border:3px solid #e05a5a;border-radius:14px;padding:1.4rem;color:var(--text)">' +
      '<div style="font-size:3rem;text-align:center;margin-bottom:.5rem">⚠️</div>' +
      '<h2 style="color:#e05a5a;text-align:center;font-size:1.35rem;margin-bottom:.7rem">' + titel + '</h2>' +
      '<div style="font-size:.95rem;line-height:1.5;color:var(--text);background:rgba(255,255,255,.06);padding:.8rem 1rem;border-radius:8px;margin-bottom:1rem;white-space:pre-wrap">' + text + '</div>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' +
        (retryFn ? '<button class="btn-primary" style="flex:1;background:#e05a5a;border:none;color:#fff" onclick="document.getElementById(\'milch-save-fehler-ov\').remove();(' + retryFn + ')()">🔄 Erneut versuchen</button>' : '') +
        '<button class="btn-secondary" style="flex:1" onclick="document.getElementById(\'milch-save-fehler-ov\').remove()">OK, ich verstehe</button>' +
      '</div>' +
    '</div>';
  ov.style.display = 'flex';
};

window.saveMilch = async function() {
  const datum = document.getElementById('m-datum')?.value;
  const zeit = document.getElementById('m-zeit')?.value || 'morgen';
  if(!datum) { alert('Datum fehlt'); return; }

  // Alle Werte aus dem Formular einsammeln
  const prokuh = {};
  let gesamt = 0;
  document.querySelectorAll('.kuh-liter').forEach(i => {
    const v = parseFloat((i.value||'').replace(',','.')) || 0;
    if(v > 0) { prokuh[i.dataset.id] = v; gesamt += v; }
  });

  if(Object.keys(prokuh).length === 0) {
    alert('Keine Werte eingetragen. Bitte mindestens eine Kuh eintragen.');
    return;
  }

  // Save-Button visuell blockieren
  const saveBtn = document.querySelector('.btn-primary[onclick*="saveMilch"]');
  const origLabel = saveBtn ? saveBtn.textContent : '';
  if(saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Warte auf Server-Ack…'; saveBtn.style.opacity = '.7'; }
  const restoreBtn = () => { if(saveBtn) { saveBtn.disabled = false; saveBtn.textContent = origLabel || '✓ Fertig'; saveBtn.style.opacity = ''; } };

  // ── Offline-Block ──
  if(!navigator.onLine) {
    restoreBtn();
    window._milchZeigeSaveFehler(
      'Kein Internet',
      'Deine Werte sind auf dem Gerät gespeichert. Sobald wieder Netz da ist, tipp erneut auf „Fertig".\n\n' +
      'Bis dahin: LASSE DAS FORMULAR OFFEN!'
    );
    return;
  }

  // ── Alle Debounce-Timer flushen (jeder Wert wird zu Firebase gepusht) ──
  if(window._milchInputTimers) {
    Object.keys(window._milchInputTimers).forEach(kuhId => {
      clearTimeout(window._milchInputTimers[kuhId]);
      const inp = document.querySelector('.kuh-liter[data-id="' + kuhId + '"]');
      if(inp) {
        const val = parseFloat((inp.value||'').replace(',','.')) || 0;
        pushMilchWert(kuhId, val, datum, zeit);
      }
    });
    window._milchInputTimers = {};
  }

  // ── Molkerei/Notiz zusätzlich schreiben (mit Auth-Retry) ──
  const molkerei = document.getElementById('m-molkerei')?.checked || false;
  const notiz = document.getElementById('m-notiz')?.value.trim() || '';
  const entryKey = getMilchEntryKey(datum, zeit);
  try {
    const _retryMN = window.withAuthRetry || (async fn => await fn());
    await _retryMN(() => firebase.database().ref('milch/' + entryKey).update({
      molkerei: molkerei, notiz: notiz, lastUpdate: Date.now()
    }));
  } catch(e) { console.warn('[Milch v2] Molkerei/Notiz:', e); }

  // ── VERIFIKATION: pending muss auf 0 gehen ──
  // Jedes pushMilchWert schreibt asynchron. pending wird nach Server-Ack ODER Read-Fallback geklärt.
  // MAX_WAIT: 40s — passt zum 30s-Write-Timeout + READ-Fallback (schwache Alm-Verbindung).
  const startTime = Date.now();
  const MAX_WAIT = 40000;
  let lastRetry = 0;
  while(countPending() > 0 && Date.now() - startTime < MAX_WAIT) {
    if(Date.now() - lastRetry > 3000) {
      lastRetry = Date.now();
      try { syncMilchPending(); } catch(e) {}
    }
    await new Promise(r => setTimeout(r, 300));
    // Fortschritts-Anzeige im Button
    if(saveBtn) saveBtn.textContent = '⏳ Warte auf Server (' + countPending() + ' offen)…';
  }

  // ── Wenn NACH 40s noch pending → REST-Verifikation als letzter Rettungsversuch ──
  if(countPending() > 0) {
    try {
      const p = getPending();
      const eintragKeys = Object.keys(p);
      for(const entryKey of eintragKeys) {
        const cows = p[entryKey];
        if(!cows) continue;
        try {
          const serverEntry = await _milchRestGet('milch/' + entryKey);
          const sv = (serverEntry && serverEntry.prokuh) || {};
          Object.entries(cows).forEach(([kuhId, payload]) => {
            const server = parseFloat(sv[kuhId]);
            if(!isNaN(server) && Math.abs(server - (payload.wert || 0)) < 0.05) {
              const p2 = getPending();
              if(p2[entryKey] && p2[entryKey][kuhId]) {
                delete p2[entryKey][kuhId];
                if(Object.keys(p2[entryKey]).length === 0) delete p2[entryKey];
                setPending(p2);
              }
            }
          });
        } catch(e) { console.warn('[saveMilch] REST-Verify-Fallback:', e); }
      }
      updateSyncBanner();
    } catch(e) { console.warn('[saveMilch] Final-Verify:', e); }
  }

  // Nach Final-Verify: wenn IMMER NOCH pending → echter Fehler
  if(countPending() > 0) {
    restoreBtn();
    const stillPending = countPending();
    const p = getPending();
    let details = [];
    Object.entries(p).forEach(([, cows]) => {
      Object.entries(cows).forEach(([kuhId, payload]) => {
        const k = (window.kuehe || {})[kuhId];
        if(details.length < 8) details.push('#' + (k?.nr || '?') + ' ' + (k?.name || '') + ': ' + payload.wert + ' L');
      });
    });
    window._milchZeigeSaveFehler(
      stillPending + ' Werte nicht am Server bestätigt',
      'Nach 40 Sekunden Wartezeit hat der Server ' + stillPending + ' Werte noch nicht bestätigt:\n\n' +
      details.join('\n') +
      (stillPending > 8 ? '\n… und ' + (stillPending - 8) + ' weitere' : '') +
      '\n\nFormular bleibt OFFEN. Werte sind lokal gesichert und werden weiter versucht.\n\n' +
      'BITTE:\n' +
      '1. Netzwerk-Empfang prüfen (WLAN?)\n' +
      '2. Auf „🔄 Erneut versuchen" tippen',
      'window.saveMilch'
    );
    return;
  }

  // 7) Warnsystem
  try {
    const prozent = parseInt(localStorage.getItem('milchWarnProzent')) || 50;
    const warnungen = [];
    Object.entries(prokuh).forEach(([kuhId, liter]) => {
      const k = (window.kuehe || {})[kuhId];
      if(!k) return;
      if(k.laktation === 'trocken' || k.laktation === 'trockengestellt') return;
      if(typeof window.getMilchDurchschnitt !== 'function') return;
      const schnitt = window.getMilchDurchschnitt(kuhId, zeit);
      if(schnitt === null) return;
      const unter = schnitt * (1 - prozent/100);
      const ober = schnitt * (1 + prozent/100);
      if(liter < unter) warnungen.push({kuhId, kuhNr:k.nr, kuhName:k.name, liter, schnitt, typ:'wenig'});
      if(liter > ober) warnungen.push({kuhId, kuhNr:k.nr, kuhName:k.name, liter, schnitt, typ:'viel'});
    });
    const datumTs = new Date(datum + 'T12:00').getTime();
    if(warnungen.length > 0) {
      localStorage.setItem('milchWarnungen', JSON.stringify({datum: datumTs, warnungen}));
    } else {
      localStorage.removeItem('milchWarnungen');
    }
  } catch(e) { console.warn('[Milch v2] Warn-System:', e); }

  // 8) EDIT: wenn Datum/Zeit geändert wurde, EIGENE Werte am ALTEN Termin löschen
  //    (Werte anderer Melker am alten Termin bleiben unangetastet)
  try {
    const origMeta = window._milchEditOriginal;
    if(origMeta && (origMeta.datum !== datum || origMeta.zeit !== zeit)) {
      const origEntryKey = getMilchEntryKey(origMeta.datum, origMeta.zeit);
      const newEntryKey = entryKey;
      if(origEntryKey !== newEntryKey) {
        console.log('[Milch v2] Datum geändert — räume alten Termin auf:', origEntryKey);
        const myUid = window.getMilchUserUid();
        const origSnap = await firebase.database().ref('milch/' + origEntryKey).once('value');
        const origData = origSnap.val();
        if(origData) {
          const updates = {};
          const _isOwn = window._milchIsOwnMeta || function(m){
            if(!m) return false;
            if(m.userUid && m.userUid === myUid) return true;
            if(m.session && m.session.startsWith('user_') && m.session.slice(5) === myUid) return true;
            return false;
          };
          // Nur EIGENE prokuh-Einträge entfernen
          if(origData.meta) {
            Object.entries(origData.meta).forEach(([kuhId, m]) => {
              if(_isOwn(m)) {
                updates['prokuh/' + kuhId] = null;
                updates['meta/' + kuhId] = null;
              }
            });
          }
          const _retryCleanup = window.withAuthRetry || (async fn => await fn());
          if(Object.keys(updates).length > 0) {
            await _retryCleanup(() => firebase.database().ref('milch/' + origEntryKey).update(updates));
            console.log('[Milch v2] Alte Werte am Termin', origEntryKey, 'entfernt:', Object.keys(updates).length / 2);
          }
          // Wenn danach der alte Eintrag komplett leer ist, ganz löschen
          const nachSnap = await firebase.database().ref('milch/' + origEntryKey + '/prokuh').once('value');
          const nachProkuh = nachSnap.val();
          if(!nachProkuh || Object.keys(nachProkuh).length === 0) {
            await _retryCleanup(() => firebase.database().ref('milch/' + origEntryKey).remove());
            console.log('[Milch v2] Alter Eintrag komplett gelöscht:', origEntryKey);
          }
        }
      }
    }
  } catch(e) { console.warn('[Milch v2] Cleanup alter Termin:', e); }
  window._milchEditOriginal = null;

  // 9) FINAL-VERIFIKATION via REST — sind wirklich alle Werte am Server?
  // Bei false-positive "gesichert" durch SDK-Cache-Bug würde User denken alles OK, aber Server hätte nix.
  let fehlend = 0;
  try {
    const entryKey = getMilchEntryKey(datum, zeit);
    const serverEntry = await _milchRestGet('milch/' + entryKey);
    const serverProkuh = (serverEntry && serverEntry.prokuh) || {};
    const sessionId = getMilchSessionId();
    const userUid = window.getMilchUserUid();
    const userName = getUserName();
    const now = Date.now();
    Object.entries(prokuh).forEach(([kuhId, wert]) => {
      const sv = parseFloat(serverProkuh[kuhId]);
      if(isNaN(sv) || Math.abs(sv - wert) >= 0.05) {
        // FEHLT am Server — wieder in pending legen
        fehlend++;
        const p = getPending();
        if(!p[entryKey]) p[entryKey] = {};
        p[entryKey][kuhId] = { wert: wert, session: sessionId, userUid: userUid, userName: userName, ts: now };
        setPending(p);
      }
    });
    console.log('[saveMilch] REST-Final-Verify: ' + fehlend + ' von ' + Object.keys(prokuh).length + ' fehlen');
  } catch(e) {
    console.warn('[saveMilch] REST-Final-Verify Fehler:', e);
  }

  // 10) ERFOLG (nur wenn nichts fehlt) — sonst Warnung + Sync starten
  const gesRund = Math.round(gesamt * 10) / 10;
  restoreBtn();
  if(fehlend > 0) {
    window.showSaveToast && window.showSaveToast('⚠ ' + fehlend + ' Werte NICHT am Server — läuft Sync…');
    // Sofort erneut versuchen mit Smart Retry
    setTimeout(() => { if(window.milchSmartRetry) window.milchSmartRetry(); }, 300);
  } else {
    window.showSaveToast && window.showSaveToast('✓ ' + gesRund + ' L / ' + Object.keys(prokuh).length + ' Kühe — REST-verifiziert am Server');
  }
  if(navigator.vibrate) navigator.vibrate([30,10,30]);

  // Zur Milch-Übersicht navigieren (statt Form-Overlay schließen)
  if(typeof navigate === 'function') navigate('milch');

  // Bericht anzeigen — 1.5s warten damit Firebase-Listener die neuen Daten in milchEintraege hat
  const berDatumTs = new Date(datum + 'T12:00').getTime();
  setTimeout(() => {
    if(window.showMilchBericht) {
      try { window.showMilchBericht(berDatumTs, zeit); } catch(e) { console.warn('showMilchBericht:', e); }
    }
  }, 1500);

  // Automatischer Email-Versand (debounced, wartet 30s auf weitere Speichervorgänge)
  try {
    if(typeof window.scheduleMilchEmail === 'function') {
      window.scheduleMilchEmail(berDatumTs);
    }
  } catch(e) { console.warn('[Milch-Email] schedule:', e); }
};

// ══════════════════════════════════════════════════════════════
//  SCREEN-WAKE-LOCK: Handy bleibt an während Milch-Formular offen
// ══════════════════════════════════════════════════════════════
window._milchWakeLock = null;

async function requestMilchWakeLock() {
  try {
    if(!('wakeLock' in navigator)) {
      console.log('[Milch v2] Wake Lock API nicht unterstützt (Browser zu alt oder iOS < 16.4)');
      return;
    }
    if(window._milchWakeLock) return;  // schon aktiv
    window._milchWakeLock = await navigator.wakeLock.request('screen');
    console.log('[Milch v2] 🔒 Wake Lock aktiv — Handy bleibt an');
    // Wenn das System das Lock freigibt (z.B. weil User Tab wechselt), Referenz löschen
    window._milchWakeLock.addEventListener('release', () => {
      console.log('[Milch v2] 🔓 Wake Lock freigegeben');
      window._milchWakeLock = null;
    });
  } catch(e) {
    console.warn('[Milch v2] Wake Lock fehlgeschlagen:', e.message || e);
    window._milchWakeLock = null;
  }
}

function releaseMilchWakeLock() {
  if(window._milchWakeLock) {
    try {
      window._milchWakeLock.release().then(() => {
        window._milchWakeLock = null;
        console.log('[Milch v2] 🔓 Wake Lock explizit freigegeben');
      }).catch(e => console.warn('[Milch v2] Wake Lock release:', e));
    } catch(e) { window._milchWakeLock = null; }
  }
}

// Wenn User Tab wechselt und wieder zurückkommt: Wake Lock neu anfordern falls Form noch offen
document.addEventListener('visibilitychange', () => {
  const formOffen = window.currentView === 'milch_erfassen';
  if(document.visibilityState === 'visible' && formOffen && !window._milchWakeLock) {
    requestMilchWakeLock();
  }
});

// Hook auf showMilchForm — Wake Lock anfordern beim Öffnen der Seite
(function hookMilchFormWake() {
  const _origShow = window.showMilchForm;
  if(!_origShow) { setTimeout(hookMilchFormWake, 200); return; }
  if(_origShow._wakeLockHooked) return;
  window.showMilchForm = function() {
    const r = _origShow.apply(this, arguments);
    setTimeout(requestMilchWakeLock, 200);
    return r;
  };
  window.showMilchForm._wakeLockHooked = true;
})();

// Hook auf navigate — Wake Lock freigeben wenn User milch_erfassen verlässt
(function hookNavigateWake() {
  const _origNav = window.navigate;
  if(!_origNav) { setTimeout(hookNavigateWake, 200); return; }
  if(_origNav._wakeLockHooked) return;
  window.navigate = function(view) {
    // Wenn wir milch_erfassen VERLASSEN → Wake Lock freigeben
    if(window.currentView === 'milch_erfassen' && view !== 'milch_erfassen') {
      releaseMilchWakeLock();
    }
    return _origNav.apply(this, arguments);
  };
  window.navigate._wakeLockHooked = true;
})();

// ══════════════════════════════════════════════════════════════
//  QUICK-ENTRY: Kuhnummer + Liter ohne Scrollen
// ══════════════════════════════════════════════════════════════
window.milchQuickKey = function(e) {
  if(e.key !== 'Enter') return;
  e.preventDefault();
  const target = e.target;
  if(target && target.id === 'mq-nr' && target.value.trim()) {
    // Von Nr-Feld: springe zu Liter-Feld
    const l = document.getElementById('mq-liter');
    if(l) { l.focus(); l.select(); }
  } else {
    window.milchQuickAdd();
  }
};

window.milchQuickAdd = function() {
  const nrInp = document.getElementById('mq-nr');
  const literInp = document.getElementById('mq-liter');
  if(!nrInp || !literInp) return;

  const nrRaw = nrInp.value.trim();
  const literRaw = literInp.value.trim().replace(',', '.');
  const liter = parseFloat(literRaw);

  if(!nrRaw) {
    nrInp.focus();
    return;
  }
  if(!liter || liter <= 0) {
    // Kein / ungültiger Wert
    literInp.style.borderColor = 'var(--orange)';
    literInp.style.background = 'rgba(230,126,34,.1)';
    setTimeout(() => { literInp.style.borderColor = ''; literInp.style.background = ''; }, 1200);
    literInp.focus(); literInp.select();
    return;
  }

  // Kuh mit dieser Nummer finden — SMART MATCHING: String, Integer, führende Nullen tolerieren
  const nrInt = parseInt(nrRaw, 10);
  const kuhEintrag = Object.entries(window.kuehe || {}).find(([id, k]) => {
    if(!k) return false;
    const knr = k.nr;
    if(knr == null) return false;
    // Direktvergleich als String
    if(String(knr).trim() === nrRaw) return true;
    // Integer-Vergleich (falls "03" vs 3)
    const knrInt = parseInt(knr, 10);
    if(!isNaN(nrInt) && !isNaN(knrInt) && knrInt === nrInt) return true;
    return false;
  });

  if(!kuhEintrag) {
    // Nicht gefunden — visuelles Feedback + Diagnose
    nrInp.style.borderColor = 'var(--orange)';
    nrInp.style.background = 'rgba(230,126,34,.15)';
    setTimeout(() => { nrInp.style.borderColor = ''; nrInp.style.background = ''; }, 1500);
    const anzahl = Object.keys(window.kuehe || {}).length;
    if(window.showSaveToast) window.showSaveToast('⚠ Keine Kuh mit Nr "' + nrRaw + '" (von ' + anzahl + ' Kühen)');
    if(navigator.vibrate) navigator.vibrate([50, 50, 50]);
    nrInp.focus(); nrInp.select();
    return;
  }

  const [kuhId, k] = kuhEintrag;
  // Input für diese Kuh in der Liste finden
  const targetInp = document.querySelector('.kuh-liter[data-id="' + kuhId + '"]');
  if(!targetInp) {
    if(window.showSaveToast) window.showSaveToast('⚠ Kuh #' + nrRaw + ' nicht im Formular sichtbar (Filter?)');
    nrInp.focus(); nrInp.select();
    return;
  }

  // Wert setzen und Standard-Handler triggern (schreibt in localStorage + Firebase)
  targetInp.value = Math.round(liter * 10) / 10;
  try { if(window.onMilchInput) window.onMilchInput(targetInp); } catch(err) {}
  try { if(window.checkMilchWert) window.checkMilchWert(targetInp, kuhId); } catch(err) {}

  // Zeile visuell hervorheben (kurzer Puls)
  const row = targetInp.closest('.milch-kuh-row');
  if(row) {
    row.style.transition = 'background .35s ease';
    row.style.background = 'rgba(77,184,78,.35)';
    setTimeout(() => { row.style.background = 'rgba(77,184,78,.08)'; }, 500);
  }

  // Toast
  if(window.showSaveToast) {
    window.showSaveToast('✓ #' + k.nr + ' ' + (k.name || '') + ': ' + (Math.round(liter*10)/10) + ' L');
  }
  if(navigator.vibrate) navigator.vibrate(20);

  // Felder leeren, Fokus zurück auf Nr. für die nächste Kuh
  nrInp.value = '';
  literInp.value = '';
  setTimeout(() => { nrInp.focus(); }, 50);
};

// ══════════════════════════════════════════════════════════════
//  OVERRIDE: updateAndereMelkerHinweise (nutzt neue Struktur)
// ══════════════════════════════════════════════════════════════
window.updateAndereMelkerHinweise = function() {
  // Nur auf der Milch-Erfassen-Seite aktualisieren
  if(window.currentView !== 'milch_erfassen') return;

  const mySession = getMilchSessionId();
  const datum = document.getElementById('m-datum')?.value;
  if(!datum) return;
  const zeit = document.getElementById('m-zeit')?.value || 'morgen';
  const entryKey = getMilchEntryKey(datum, zeit);
  const fbEntry = (window.milchEintraege || {})[entryKey];

  // Werte anderer USER einsammeln (per userUid-Vergleich, nicht Session)
  const andereWerte = {}; // kuhId → {wert, name}
  const isOwn = window._milchIsOwnMeta;
  if(fbEntry && fbEntry.prokuh) {
    const meta = fbEntry.meta || {};
    Object.entries(fbEntry.prokuh).forEach(([kuhId, v]) => {
      if(v == null) return;
      const w = milchWert(v);
      if(w <= 0) return;
      // Neue Struktur: Wert ist Zahl, Attribution in meta/kuhId
      if(typeof v === 'number' || typeof v === 'string') {
        const m = meta[kuhId];
        // Nur wenn wir SICHER sind dass es ein ANDERER User war
        if(m && (m.userUid || m.session) && isOwn && !isOwn(m)) {
          andereWerte[kuhId] = { wert: w, name: m.userName || 'Anderer' };
        }
      }
      // Legacy-Objekt-Struktur
      else if(typeof v === 'object' && v.session) {
        if(isOwn && !isOwn(v)) {
          andereWerte[kuhId] = { wert: w, name: v.userName || 'Anderer' };
        }
      }
    });
  }

  // DOM updaten
  document.querySelectorAll('.milch-kuh-row').forEach(row => {
    const input = row.querySelector('.kuh-liter');
    if(!input) return;
    const kuhId = input.dataset.id;
    let hinweis = row.querySelector('.andere-melker-hinweis');
    const fremd = andereWerte[kuhId];

    if(fremd) {
      if(!hinweis) {
        hinweis = document.createElement('div');
        hinweis.className = 'andere-melker-hinweis';
        hinweis.style.cssText = 'background:rgba(230,126,34,.14);border:1px solid rgba(230,126,34,.40);border-radius:6px;padding:.3rem .55rem;margin-top:.25rem;font-size:.7rem;color:#e67e22;font-weight:600;display:flex;align-items:center;gap:.4rem';
        row.appendChild(hinweis);
      }
      hinweis.innerHTML = '👥 ' + fremd.name + ': <b style="color:#e67e22">' + (Math.round(fremd.wert*10)/10) + ' L</b>';
      input.style.borderColor = '#e67e22';
    } else if(hinweis) {
      hinweis.remove();
      input.style.borderColor = '';
    }
  });
};

// ══════════════════════════════════════════════════════════════
//  Auto-Save Reset (alte Funktion, bleibt für Form-Init erhalten)
// ══════════════════════════════════════════════════════════════
window.resetMilchAutoSaveState = function() {
  window._milchAutoSaveDraftId = null;
  window._milchOriginalGroupKey = null;
  window._milchSaveInProgress = false;
  window._milchAutoSaveInFlight = false;
  window._milchInputTimers = {};
  if(window._milchAutoSaveTimer) { clearTimeout(window._milchAutoSaveTimer); window._milchAutoSaveTimer = null; }
  const el = document.getElementById('milch-autosave-indicator');
  if(el) { el.textContent = ''; el.style.color = 'var(--text3)'; }
};

// ══════════════════════════════════════════════════════════════
//  Hook: showMilchForm – nach Öffnen eigene Werte für heute+Zeit
//  aus Firebase + LocalStorage-Pending wieder in Form eintragen
// ══════════════════════════════════════════════════════════════
(function hookShowForm() {
  const _origShow = window.showMilchForm;
  if(!_origShow) { setTimeout(hookShowForm, 200); return; }
  if(_origShow._milchV2Hooked) return;
  window.showMilchForm = function() {
    const r = _origShow.apply(this, arguments);
    // Nach Öffnen: eigene Werte für heute+aktuelle Schicht wieder eintragen
    // MUSS nach _milchFormInit (150ms) laufen, sonst überschreibt Init unsere Restore
    setTimeout(() => {
      try {
        // Formular ist jetzt eine eigene Seite — prüfe currentView
        if(window.currentView !== 'milch_erfassen') return;
        const datumInp = document.getElementById('m-datum');
        const zeitInp = document.getElementById('m-zeit');
        if(!datumInp || !zeitInp) return;
        const datum = datumInp.value;
        const zeit = zeitInp.value || 'morgen';
        if(!datum) return;
        // Nur wenn NEUER Eintrag (kein Edit)
        const editId = document.getElementById('m-edit-id')?.value;
        if(editId) return;

        const entryKey = getMilchEntryKey(datum, zeit);
        const mySession = getMilchSessionId();
        const fbEntry = (window.milchEintraege || {})[entryKey];

        // Molkerei-Checkbox und Notiz aus Firebase restaurieren
        if(fbEntry) {
          const molkereiEl = document.getElementById('m-molkerei');
          if(molkereiEl) molkereiEl.checked = !!fbEntry.molkerei;
          const notizEl = document.getElementById('m-notiz');
          if(notizEl && !notizEl.value) notizEl.value = fbEntry.notiz || '';
        }

        // Aus Firebase-Eintrag: EIGENE Werte übernehmen (per userUid-Attribution)
        const eigene = {};
        if(fbEntry && fbEntry.prokuh) {
          const meta = fbEntry.meta || {};
          Object.entries(fbEntry.prokuh).forEach(([kuhId, v]) => {
            const w = milchWert(v);
            if(w <= 0) return;
            const m = meta[kuhId];
            // Neue Struktur: userUid- oder session-basierte Zuordnung zum aktuellen User
            if(m && window._milchIsOwnMeta && window._milchIsOwnMeta(m)) {
              eigene[kuhId] = w;
            }
            // Legacy-Objekt-Struktur (Zwischen-Version) mit .wert und .session
            else if(typeof v === 'object' && v && window._milchIsOwnMeta && window._milchIsOwnMeta(v)) {
              eigene[kuhId] = parseFloat(v.wert) || 0;
            }
            // Fallback: wenn KEIN meta existiert (ganz alte Werte oder legacy random-key),
            // dann trotzdem restaurieren — Melker sieht was da ist, verwaltet selbst
            else if(!m || (!m.userUid && !m.session)) {
              eigene[kuhId] = w;
            }
          });
        }
        // Aus LocalStorage-Pending (noch nicht synced): überschreiben
        const pending = getPending();
        if(pending[entryKey]) {
          Object.entries(pending[entryKey]).forEach(([kuhId, v]) => {
            if(v && v.session === mySession) eigene[kuhId] = parseFloat(v.wert) || 0;
          });
        }

        // Werte in Formular eintragen (ohne pushMilchWert erneut zu triggern)
        let count = 0, sum = 0;
        Object.entries(eigene).forEach(([kuhId, wert]) => {
          if(wert <= 0) return;
          const inp = document.querySelector('.kuh-liter[data-id="' + kuhId + '"]');
          if(!inp) return;
          inp.value = Math.round(wert * 10) / 10;
          const row = inp.closest('.milch-kuh-row');
          if(row) {
            row.style.background = 'rgba(77,184,78,.08)';
            const badge = row.querySelector('.nr-badge');
            if(badge) badge.style.background = 'var(--green)';
          }
          count++;
          sum += wert;
        });
        const sumEl = document.getElementById('m-summe'); if(sumEl) sumEl.textContent = Math.round(sum*10)/10;
        const cntEl = document.getElementById('m-count'); if(cntEl) cntEl.textContent = count;
        if(count > 0) {
          const el = document.getElementById('milch-autosave-indicator');
          if(el) {
            el.textContent = '↺ ' + count + ' Kühe wiederhergestellt';
            el.style.color = 'var(--gold)';
          }
        }
        if(window.updateAndereMelkerHinweise) window.updateAndereMelkerHinweise();
      } catch(e) { console.warn('[Milch v2] showForm restore err:', e); }
    }, 350);
    return r;
  };
  window.showMilchForm._milchV2Hooked = true;
})();

// ══════════════════════════════════════════════════════════════
//  Hook: Firebase-Listener-Change nach jedem render() prüfen
// ══════════════════════════════════════════════════════════════
(function hookRender() {
  const _origRender = window.render;
  if(!_origRender) {
    // render() noch nicht definiert – später nochmal probieren
    setTimeout(hookRender, 200);
    return;
  }
  if(window.render._milchV2Hooked) return;
  window.render = function() {
    const r = _origRender.apply(this, arguments);
    try {
      if(window.onMilchEintraegeChanged) window.onMilchEintraegeChanged();
      updateSyncBanner();
    } catch(e) { console.warn('[Milch v2] Render-Hook err:', e); }
    return r;
  };
  window.render._milchV2Hooked = true;
})();

// ══════════════════════════════════════════════════════════════
//  Hook: beim Öffnen der Milch-View auf Konflikte prüfen
// ══════════════════════════════════════════════════════════════
(function hookNavigate() {
  const _origNavigate = window.navigate;
  if(!_origNavigate) { setTimeout(hookNavigate, 200); return; }
  if(_origNavigate._milchV2Hooked) return;
  window.navigate = function(view) {
    const r = _origNavigate.apply(this, arguments);
    if(view === 'milch') {
      setTimeout(() => {
        if(getKonflikte().length > 0) window.showMilchKonflikte();
      }, 400);
    }
    return r;
  };
  window.navigate._milchV2Hooked = true;
})();

// ══════════════════════════════════════════════════════════════
//  Direkter Firebase-Listener für Bestätigung (unabhängig von render-Hook)
// ══════════════════════════════════════════════════════════════
(function attachOwnListener() {
  if(typeof firebase === 'undefined' || !firebase.database || !firebase.auth) {
    setTimeout(attachOwnListener, 500);
    return;
  }
  // Warte bis der User eingeloggt ist
  const attach = function() {
    try {
      firebase.database().ref('milch').on('value', function(snap) {
        // Nach jeder Änderung Bestätigung prüfen
        setTimeout(function() {
          if(window.onMilchEintraegeChanged) window.onMilchEintraegeChanged();
          updateSyncBanner();
        }, 100);
      });
      console.log('[Milch v2] Eigener Firebase-Listener installiert');
    } catch(e) { console.warn('[Milch v2] Own listener err:', e); }
  };
  if(firebase.auth().currentUser) {
    attach();
  } else {
    firebase.auth().onAuthStateChanged(function(u) { if(u) attach(); });
  }
})();

// ══════════════════════════════════════════════════════════════
//  App-Start: User-UID cachen + initial pending sync + Banner
// ══════════════════════════════════════════════════════════════
window.addEventListener('load', () => {
  setTimeout(() => {
    // Sofort User-UID etablieren und in localStorage sichern
    try { window.getMilchUserUid(); } catch(e) {}
    updateSyncBanner();
    if(navigator.onLine) {
      syncMilchPending();
      // 3 Sekunden warten und stille Bestätigung erzwingen (Alt-Werte aufräumen)
      setTimeout(() => { if(window._milchConfirmAllPendingSilent) window._milchConfirmAllPendingSilent(); }, 3500);
    }
  }, 1500);
  // Firebase-Auth-State: bei Login/Logout UID neu setzen
  try {
    if(typeof firebase !== 'undefined' && firebase.auth) {
      firebase.auth().onAuthStateChanged(function(user) {
        if(user && user.uid) {
          localStorage.setItem('milkUserUid_v2', user.uid);
        }
      });
    }
  } catch(e) {}
});

// ── System-Offline-Banner (das orangene ganz oben) automatisch togglen
function toggleSystemOfflineBanner() {
  const el = document.getElementById('offline-banner');
  if(!el) return;
  el.style.display = navigator.onLine ? 'none' : 'flex';
}

// Online/Offline Handler
window.addEventListener('online', () => {
  // Alte Timeout-Fehler aus Offline-Phase löschen — sind nicht mehr relevant
  if(window._milchSyncError && (window._milchSyncError.msg||'').toLowerCase().includes('timeout')) {
    window._milchSyncError = null;
    window._milchErrorToastShown = false;
  }
  toggleSystemOfflineBanner();
  updateSyncBanner();
  setTimeout(() => {
    syncMilchPending();
    // Nach kurzer Wartezeit Bestätigung prüfen (viele Werte könnten synced sein)
    setTimeout(() => { if(window._milchConfirmAllPendingSilent) window._milchConfirmAllPendingSilent(); }, 3000);
  }, 500);
});
window.addEventListener('offline', () => {
  // Bereits gemerkte Timeout-Fehler nicht als Fehler anzeigen — offline ist normal
  if(window._milchSyncError && (window._milchSyncError.msg||'').toLowerCase().includes('timeout')) {
    window._milchSyncError = null;
  }
  toggleSystemOfflineBanner();
  updateSyncBanner();
});

// Beim Start einmal den System-Offline-Banner-Status prüfen
window.addEventListener('load', () => {
  setTimeout(toggleSystemOfflineBanner, 500);
});

// Retry-Loop alle 30s: Smart Retry (READ-Confirm bevor neu geschrieben wird)
setInterval(() => {
  if(navigator.onLine && countPending() > 0) {
    // Erst still confirmen (Werte die schon am Server sind → aus pending raus)
    if(window._milchConfirmAllPendingSilent) {
      window._milchConfirmAllPendingSilent().then(() => {
        // Dann nur den Rest neu schreiben
        if(countPending() > 0) syncMilchPending();
      }).catch(() => { syncMilchPending(); });
    } else {
      syncMilchPending();
    }
  }
}, 30000);

console.log('[Milch v2] Persistence-Modul geladen (LocalStorage-first, per-Kuh Attribution)');

})();
