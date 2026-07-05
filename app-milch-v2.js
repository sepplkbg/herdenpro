// ══════════════════════════════════════════════════════════════
//  HERDENPRO – MILCH v2  (LocalStorage-first Persistence)
//  MODUL-VERSION: 3.3  ← wenn du das siehst, ist der Fix geladen
// ══════════════════════════════════════════════════════════════
window.MILCH_V2_VERSION = '3.3';
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

// ── Session-ID: gekoppelt an user.uid (persistent, nicht pro Tab)
// Fällt zurück auf firebase.auth().currentUser wenn window._currentUser noch nicht gesetzt ist
window.getMilchSessionId = function() {
  const u = window._currentUser;
  if(u && u.uid) return 'user_' + u.uid;
  // Fallback 1: Firebase Auth direkt (verfügbar sobald Session restored, vor DB-Load)
  try {
    if(typeof firebase !== 'undefined' && firebase.auth) {
      const authUser = firebase.auth().currentUser;
      if(authUser && authUser.uid) return 'user_' + authUser.uid;
    }
  } catch(e) {}
  // Fallback 2: sessionStorage
  let sid = sessionStorage.getItem('milkSessionId');
  if(!sid) {
    sid = 'anon_' + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('milkSessionId', sid);
  }
  return sid;
};

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
  const userName = getUserName();
  const now = Date.now();
  const wertVal = Math.round((parseFloat(wert) || 0) * 10) / 10;

  // Attribution separat vom Wert speichern (Firebase-Rules-freundlich: prokuh bleibt Zahl!)
  const metaPayload = { session: sessionId, userName: userName, ts: now };

  // 1. LocalStorage sofort (Wahrheit auf Gerät). Kombinierte Payload für internes Tracking.
  const pending = getPending();
  if(wertVal > 0) {
    if(!pending[entryKey]) pending[entryKey] = {};
    pending[entryKey][kuhId] = { wert: wertVal, session: sessionId, userName: userName, ts: now };
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

      // Firebase-Write mit TIMEOUT: wenn kein Ack in 15 Sekunden → Fehler zeigen
      // Sonst hängt der Client stumm wenn interne WebSocket-Verbindung tot ist
      const writePromise = firebase.database().ref(entryPath).update(updatePayload);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout (15s) — Firebase-Verbindung möglicherweise blockiert')), 15000)
      );
      Promise.race([writePromise, timeoutPromise])
        .then(() => {
          console.log('[Milch v2] Server-Bestätigt:', kuhId, '=', wertVal);
          // EXPLIZIT: nach erfolgreichem Write direkt aus Firebase lesen und pending clearen
          confirmMilchPendingDirect(entryKey, kuhId, wertVal);
        })
        .catch(e => handleSyncError(e, 'write'));
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

// ── Alle Pending gegen Firebase abgleichen (Bestätigung erzwingen) ──
// silent=true → kein Alert, für Auto-Aufrufe
async function _milchConfirmAllInternal(silent) {
  if(typeof firebase === 'undefined' || !firebase.database) return {checked:0, confirmed:0};
  const p = getPending();
  const entries = Object.entries(p);
  if(entries.length === 0) return {checked:0, confirmed:0};
  let confirmed = 0, checked = 0;
  for(const [entryKey, cows] of entries) {
    try {
      const snap = await firebase.database().ref('milch/' + entryKey).once('value');
      const val = snap.val();
      if(!val || !val.prokuh) continue;
      for(const [kuhId, payload] of Object.entries(cows)) {
        checked++;
        const fbVal = val.prokuh[kuhId];
        if(fbVal == null) continue;
        const num = parseFloat(fbVal) || (fbVal && fbVal.wert) || 0;
        if(Math.abs(num - payload.wert) < 0.05) {
          const pNow = getPending();
          if(pNow[entryKey] && pNow[entryKey][kuhId]) {
            delete pNow[entryKey][kuhId];
            if(Object.keys(pNow[entryKey]).length === 0) delete pNow[entryKey];
            setPending(pNow);
            confirmed++;
          }
        }
      }
    } catch(e) { console.warn('[Milch v2] confirmAll err:', e); }
  }
  updateSyncBanner();
  return {checked, confirmed};
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

    // Timeout auf Retry-Sync (15s pro Termin)
    const wp = firebase.database().ref('milch/' + entryKey).update(updatePayload);
    const tp = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Retry-Timeout (15s) — Verbindung neu aufbauen')), 15000)
    );
    Promise.race([wp, tp])
      .then(() => console.log('[Milch v2] Retry-Sync OK für', entryKey))
      .catch(e => handleSyncError(e, 'retry-sync'));
  });
};

// ══════════════════════════════════════════════════════════════
//  Listener-Confirmation: von Firebase kommende Werte prüfen
//  - Wenn eigener Wert bestätigt → aus pending entfernen
//  - Wenn anderer Melker überschrieben hat → Konflikt merken
// ══════════════════════════════════════════════════════════════
window.onMilchEintraegeChanged = function() {
  const p = getPending();
  const eintraege = window.milchEintraege || {};
  const mySession = getMilchSessionId();
  let changed = false;

  Object.entries(p).forEach(([entryKey, cows]) => {
    const fbEntry = eintraege[entryKey];
    if(!fbEntry || !fbEntry.prokuh) return;
    const fbMeta = fbEntry.meta || {};
    Object.entries(cows).forEach(([kuhId, payload]) => {
      const fbVal = fbEntry.prokuh[kuhId];
      const meta = fbMeta[kuhId];
      if(fbVal == null) return;
      // Neue Struktur: Wert ist Zahl, Attribution in meta/
      if(typeof fbVal === 'number' || typeof fbVal === 'string') {
        // Wenn Meta vorhanden und session/ts passen → bestätigt
        if(meta && meta.session === payload.session && (meta.ts || 0) >= (payload.ts || 0)) {
          delete p[entryKey][kuhId];
          if(Object.keys(p[entryKey]).length === 0) delete p[entryKey];
          changed = true;
          return;
        }
        // Konflikt: Meta zeigt andere Session mit späterem ts → anderer Melker hat überschrieben
        if(meta && meta.session && meta.session !== payload.session && (meta.ts || 0) > (payload.ts || 0)) {
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
          return;
        }
        // Auto-Confirm für Legacy-Pending: wenn Firebase-Wert existiert und
        // ≈ dem lokalen pending-Wert entspricht, ist er bereits synced —
        // unabhängig von Session-Mismatch (kann durch Session-ID-Wechsel entstehen)
        const fbNum = parseFloat(fbVal) || 0;
        if(Math.abs(fbNum - payload.wert) < 0.05) {
          delete p[entryKey][kuhId];
          if(Object.keys(p[entryKey]).length === 0) delete p[entryKey];
          changed = true;
        }
        return;
      }
      // Legacy-Struktur (Objekt mit .wert): Backward-Compat für alte v2-Zwischenversion
      if(typeof fbVal === 'object') {
        // Session/ts-Match → bestätigt
        if(fbVal.session === payload.session && (fbVal.ts || 0) >= (payload.ts || 0)) {
          delete p[entryKey][kuhId];
          if(Object.keys(p[entryKey]).length === 0) delete p[entryKey];
          changed = true;
        }
        // Auto-Confirm: wenn .wert in Firebase ≈ unser pending-Wert → bereits synced
        else if(fbVal.wert != null && Math.abs(parseFloat(fbVal.wert) - payload.wert) < 0.05) {
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
  if(!banner) {
    // Nicht rendered yet — kein Panic, kommt später
    return;
  }
  const n = countPending();
  const konfl = getKonflikte().length;
  const online = navigator.onLine;

  // ── PERSISTENT-ERROR hat Priorität: bleibt sichtbar bis explicitly cleared ──
  if(window._milchSyncError && n > 0) {
    const err = window._milchSyncError;
    banner._wasVisible = true;
    banner.style.display = 'flex';
    banner.className = 'milch-sync-banner milch-sync-error';
    banner.innerHTML = '<span>❌</span><span>Sync-Fehler: ' + err.msg.slice(0, 80) + '</span>' +
      '<button class="milch-sync-action" onclick="showMilchPendingDetails()">Details</button>' +
      '<button class="milch-sync-action" onclick="clearMilchSyncError();syncMilchPending()">Retry</button>';
    return;
  }

  if(n === 0 && konfl === 0) {
    // Alles sauber
    if(banner._wasVisible) {
      // Kurz „✓" zeigen, dann ausblenden
      banner.style.display = 'flex';
      banner.className = 'milch-sync-banner milch-sync-ok';
      banner.innerHTML = '<span>✓</span><span>Alle Milchwerte in der Cloud gesichert</span>';
      if(banner._hideTimer) clearTimeout(banner._hideTimer);
      banner._hideTimer = setTimeout(() => {
        banner.style.display = 'none';
        banner._wasVisible = false;
      }, 3000);
    } else {
      banner.style.display = 'none';
    }
    return;
  }

  banner._wasVisible = true;
  banner.style.display = 'flex';

  if(konfl > 0) {
    banner.className = 'milch-sync-banner milch-sync-error';
    banner.innerHTML = '<span>⚠</span><span>' + konfl + ' Milch-Konflikt' + (konfl > 1 ? 'e' : '') +
      ' – bitte klären</span>' +
      '<button class="milch-sync-action" onclick="showMilchKonflikte()">Anzeigen</button>';
    return;
  }

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
  const p = getPending();
  const entries = Object.entries(p);
  if(entries.length === 0) {
    alert('✓ Keine ausstehenden Werte. Alles synchron.');
    return;
  }

  // Statt alert(): richtiges Overlay mit Aktions-Buttons
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
          '<b>navigator.onLine:</b> ' + navigator.onLine + '<br>' +
          '<b>Firebase-Socket:</b> <span id="milch-debug-conn">wird geprüft…</span><br>' +
          '<b>Ausstehend:</b> ' + total + ' Wert' + (total > 1 ? 'e' : '') +
          (window._milchSyncError ? '<br><b style="color:#e05a5a">Letzter Fehler:</b> <span style="color:#e05a5a">' + window._milchSyncError.msg + '</span>' : '') +
        '</div>' +
        '<div style="font-size:.75rem;color:var(--text3);margin-bottom:.4rem">' +
          '<b>„✓ in Cloud"</b> = Wert ist bereits am Server, wird gleich als synced markiert.<br>' +
          '<b>„✗ nicht in Cloud"</b> = Wert kam nie beim Server an. „Verwerfen" nur wenn du sicher bist dass er weg darf.' +
        '</div>' +
        rowsHtml +
        '<div style="display:flex;gap:.5rem;margin-top:1rem;padding-top:.8rem;border-top:1px solid var(--border);flex-wrap:wrap">' +
          '<button class="btn-secondary" style="flex:1;min-width:7rem;background:rgba(77,184,78,.15);border-color:var(--green);color:var(--green)" onclick="milchConfirmAllPending();setTimeout(showMilchPendingDetails,1500)">🔍 Bestätigen</button>' +
          '<button class="btn-secondary" style="flex:1;min-width:7rem" onclick="milchTestWrite()">🧪 Test-Write</button>' +
          '<button class="btn-secondary" style="flex:1;min-width:7rem" onclick="syncMilchPending();setTimeout(showMilchPendingDetails,1500)">🔄 Retry alle</button>' +
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
window.saveMilch = function() {
  const datum = document.getElementById('m-datum')?.value;
  const zeit = document.getElementById('m-zeit')?.value || 'morgen';
  if(!datum) { alert('Datum fehlt'); return; }

  // Alle noch offenen Debounce-Timer sofort ausführen
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

  // Aggregation für Warnungen + Toast
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

  // Molkerei/Notiz auf Termin-Ebene speichern (nur wenn tatsächlich Werte da sind)
  const molkerei = document.getElementById('m-molkerei')?.checked || false;
  const notiz = document.getElementById('m-notiz')?.value.trim() || '';
  const entryKey = getMilchEntryKey(datum, zeit);
  try {
    if(typeof firebase !== 'undefined' && firebase.database) {
      firebase.database().ref('milch/' + entryKey).update({
        molkerei: molkerei, notiz: notiz, lastUpdate: Date.now()
      }).catch(e => console.warn('[Milch v2] Molkerei/Notiz:', e));
    }
  } catch(e) {}

  // Warnsystem
  try {
    const prozent = parseInt(localStorage.getItem('milchWarnProzent')) || 50;
    const warnungen = [];
    Object.entries(prokuh).forEach(([kuhId, liter]) => {
      const k = (window.kuehe || {})[kuhId];
      if(!k) return;
      if(k.laktation === 'trocken' || k.laktation === 'trockengestellt') return;
      if(typeof window.getMilchDurchschnitt !== 'function') return;
      // Zeit-spezifisch: morgens vs. abends getrennt vergleichen
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

  const gesRund = Math.round(gesamt * 10) / 10;
  window.showSaveToast && window.showSaveToast('✓ Fertig: ' + gesRund + ' L / ' + Object.keys(prokuh).length + ' Kühe');
  if(navigator.vibrate) navigator.vibrate([30,10,30]);

  window.closeForm && window.closeForm('milch-form-overlay');

  // Bericht anzeigen (kurz warten damit Firebase-Listener nachzieht)
  const berDatumTs = new Date(datum + 'T12:00').getTime();
  setTimeout(() => {
    if(window.showMilchBericht) {
      try { window.showMilchBericht(berDatumTs, zeit); } catch(e) {}
    }
  }, 500);
};

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
  const formOv = document.getElementById('milch-form-overlay');
  if(!formOv || formOv.style.display !== 'flex') return;

  const mySession = getMilchSessionId();
  const datum = document.getElementById('m-datum')?.value;
  if(!datum) return;
  const zeit = document.getElementById('m-zeit')?.value || 'morgen';
  const entryKey = getMilchEntryKey(datum, zeit);
  const fbEntry = (window.milchEintraege || {})[entryKey];

  // Werte anderer Sessions einsammeln
  const andereWerte = {}; // kuhId → {wert, name}
  if(fbEntry && fbEntry.prokuh) {
    const meta = fbEntry.meta || {};
    Object.entries(fbEntry.prokuh).forEach(([kuhId, v]) => {
      if(v == null) return;
      const w = milchWert(v);
      if(w <= 0) return;
      // Neue Struktur: Wert ist Zahl, Attribution in meta/kuhId
      if(typeof v === 'number' || typeof v === 'string') {
        const m = meta[kuhId];
        if(m && m.session && m.session !== mySession) {
          andereWerte[kuhId] = { wert: w, name: m.userName || 'Anderer' };
        }
        // Ohne Meta: können wir Melker nicht unterscheiden → ignorieren
      }
      // Legacy-Objekt-Struktur
      else if(typeof v === 'object') {
        if(v.session && v.session !== mySession) {
          andereWerte[kuhId] = { wert: w, name: v.userName || 'Anderer' };
        }
      }
    });
  }

  // Auch alte Firebase-Einträge (mit random-key + _session) berücksichtigen für Übergangsphase
  const datumTs = new Date(datum + 'T12:00').getTime();
  const startTag = new Date(datumTs); startTag.setHours(0,0,0,0);
  const endeTag = startTag.getTime() + 86400000;
  Object.values(window.milchEintraege || {}).forEach(e => {
    if(!e || !e.datum) return;
    if(e.datum < startTag.getTime() || e.datum >= endeTag) return;
    if((e.zeit || 'morgen') !== zeit) return;
    if(e._session === mySession) return;
    if(!e.prokuh) return;
    Object.entries(e.prokuh).forEach(([kuhId, v]) => {
      const w = milchWert(v);
      if(w > 0 && !andereWerte[kuhId]) {
        andereWerte[kuhId] = { wert: w, name: e._userName || 'Anderer' };
      }
    });
  });

  // DOM updaten
  document.querySelectorAll('#milch-form-overlay .milch-kuh-row').forEach(row => {
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
    setTimeout(() => {
      try {
        const ov = document.getElementById('milch-form-overlay');
        if(!ov || ov.style.display !== 'flex') return;
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

        // Aus Firebase-Eintrag: EIGENE Werte übernehmen (per Meta-Attribution identifiziert)
        const eigene = {};
        if(fbEntry && fbEntry.prokuh) {
          const meta = fbEntry.meta || {};
          Object.entries(fbEntry.prokuh).forEach(([kuhId, v]) => {
            const w = milchWert(v);
            const m = meta[kuhId];
            if(m && m.session === mySession && w > 0) {
              eigene[kuhId] = w;
            }
            // Legacy-Objekt-Struktur (Zwischen-Version)
            else if(typeof v === 'object' && v && v.session === mySession) {
              eigene[kuhId] = parseFloat(v.wert) || 0;
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
    }, 120);
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
//  App-Start: initial pending sync + Banner
// ══════════════════════════════════════════════════════════════
window.addEventListener('load', () => {
  setTimeout(() => {
    updateSyncBanner();
    if(navigator.onLine) {
      syncMilchPending();
      // 3 Sekunden warten und stille Bestätigung erzwingen (Alt-Werte aufräumen)
      setTimeout(() => { if(window._milchConfirmAllPendingSilent) window._milchConfirmAllPendingSilent(); }, 3500);
    }
  }, 1500);
});

// Online/Offline Handler
window.addEventListener('online', () => {
  // Alte Timeout-Fehler aus Offline-Phase löschen — sind nicht mehr relevant
  if(window._milchSyncError && (window._milchSyncError.msg||'').toLowerCase().includes('timeout')) {
    window._milchSyncError = null;
    window._milchErrorToastShown = false;
  }
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
  updateSyncBanner();
});

// Retry-Loop alle 30s
setInterval(() => {
  if(navigator.onLine && countPending() > 0) {
    syncMilchPending();
  }
}, 30000);

console.log('[Milch v2] Persistence-Modul geladen (LocalStorage-first, per-Kuh Attribution)');

})();
