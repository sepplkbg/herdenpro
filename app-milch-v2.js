// ══════════════════════════════════════════════════════════════
//  HERDENPRO – MILCH v2  (LocalStorage-first Persistence)
// ══════════════════════════════════════════════════════════════
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
window.getMilchSessionId = function() {
  const u = window._currentUser;
  if(u && u.uid) return 'user_' + u.uid;
  // Fallback: sessionStorage
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

  const kuhPayload = { wert: wertVal, session: sessionId, userName: userName, ts: now };

  // 1. LocalStorage sofort (Wahrheit auf Gerät)
  const pending = getPending();
  if(wertVal > 0) {
    if(!pending[entryKey]) pending[entryKey] = {};
    pending[entryKey][kuhId] = kuhPayload;
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
      // Aus Firebase entfernen
      firebase.database().ref(entryPath + '/prokuh/' + kuhId).remove()
        .then(() => updateSyncBanner())
        .catch(e => console.warn('[Milch v2] remove failed (bleibt lokal):', e));
    } else {
      // Wert setzen (Termin-Metadaten + Kuh-Wert in einem update)
      let datumTs;
      if(typeof datum === 'string' && datum.length >= 10) {
        datumTs = new Date(datum.slice(0,10) + 'T12:00').getTime();
      } else {
        const d = new Date(datum);
        d.setHours(12,0,0,0);
        datumTs = d.getTime();
      }
      const updatePayload = {};
      updatePayload['prokuh/' + kuhId] = kuhPayload;
      updatePayload['datum'] = datumTs;
      updatePayload['zeit'] = zeit || 'morgen';
      updatePayload['art'] = 'prokuh';
      updatePayload['lastUpdate'] = now;

      firebase.database().ref(entryPath).update(updatePayload)
        .then(() => {
          // Bestätigung folgt via Listener (onMilchEintraegeChanged)
          console.log('[Milch v2] Server-Bestätigt:', kuhId, '=', wertVal);
        })
        .catch(e => console.warn('[Milch v2] Write failed (bleibt lokal):', e));
    }
  } catch(e) {
    console.warn('[Milch v2] Firebase-Fehler (Wert bleibt lokal):', e);
  }

  // 3. Banner updaten
  updateSyncBanner();
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
      updatePayload['prokuh/' + kuhId] = payload;
    });

    firebase.database().ref('milch/' + entryKey).update(updatePayload)
      .then(() => console.log('[Milch v2] Retry-Sync OK für', entryKey))
      .catch(e => console.warn('[Milch v2] Retry-Sync err:', e));
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
    Object.entries(cows).forEach(([kuhId, payload]) => {
      const fbVal = fbEntry.prokuh[kuhId];
      if(fbVal == null) return;
      // Alter Wert (Zahl) → keine Attribution, wir nehmen an unser Wert ist synced
      if(typeof fbVal === 'number') {
        delete p[entryKey][kuhId];
        if(Object.keys(p[entryKey]).length === 0) delete p[entryKey];
        changed = true;
        return;
      }
      if(typeof fbVal !== 'object') return;
      // Match: Server-Session = meine Session UND Server-ts >= mein ts
      if(fbVal.session === payload.session && (fbVal.ts || 0) >= (payload.ts || 0)) {
        delete p[entryKey][kuhId];
        if(Object.keys(p[entryKey]).length === 0) delete p[entryKey];
        changed = true;
      }
      // Konflikt: anderer Melker hat NACH mir geschrieben
      else if(fbVal.session && fbVal.session !== payload.session && (fbVal.ts || 0) > (payload.ts || 0)) {
        addKonflikt({
          entryKey, kuhId,
          meinWert: payload.wert,
          meineSession: payload.session,
          fremdWert: parseFloat(fbVal.wert) || 0,
          fremdSession: fbVal.session,
          fremdName: fbVal.userName || 'Anderer Melker',
          ts: Date.now()
        });
        // Aus pending entfernen (Server-Wert gilt)
        delete p[entryKey][kuhId];
        if(Object.keys(p[entryKey]).length === 0) delete p[entryKey];
        changed = true;
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
      ' auf Gerät gesichert · Sync sobald online</span>';
  } else {
    banner.className = 'milch-sync-banner milch-sync-pending';
    banner.innerHTML = '<span>📤</span><span>' + n + ' Wert' + (n > 1 ? 'e' : '') +
      ' werden übertragen…</span>' +
      '<button class="milch-sync-action" onclick="syncMilchPending()">Jetzt versuchen</button>';
  }
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

  // Kuh mit dieser Nummer finden (String-Vergleich damit "07" auch matcht)
  const kuhEintrag = Object.entries(window.kuehe || {}).find(([id, k]) =>
    String(k?.nr).trim() === nrRaw
  );

  if(!kuhEintrag) {
    // Nicht gefunden — visuelles Feedback
    nrInp.style.borderColor = 'var(--orange)';
    nrInp.style.background = 'rgba(230,126,34,.15)';
    setTimeout(() => { nrInp.style.borderColor = ''; nrInp.style.background = ''; }, 1500);
    if(window.showSaveToast) window.showSaveToast('⚠ Keine Kuh mit Nummer ' + nrRaw);
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
    Object.entries(fbEntry.prokuh).forEach(([kuhId, v]) => {
      if(v == null) return;
      if(typeof v === 'object') {
        if(v.session && v.session !== mySession) {
          const w = parseFloat(v.wert) || 0;
          if(w > 0) andereWerte[kuhId] = { wert: w, name: v.userName || 'Anderer' };
        }
      }
      // Alte Struktur (Zahl): können wir Melker nicht unterscheiden → ignorieren
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

        // Aus Firebase-Eintrag: EIGENE Werte übernehmen
        const eigene = {};
        if(fbEntry && fbEntry.prokuh) {
          Object.entries(fbEntry.prokuh).forEach(([kuhId, v]) => {
            if(v && typeof v === 'object' && v.session === mySession) {
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
//  App-Start: initial pending sync + Banner
// ══════════════════════════════════════════════════════════════
window.addEventListener('load', () => {
  setTimeout(() => {
    updateSyncBanner();
    if(navigator.onLine) syncMilchPending();
  }, 1500);
});

// Online/Offline Handler
window.addEventListener('online', () => {
  updateSyncBanner();
  setTimeout(() => { syncMilchPending(); }, 500);
});
window.addEventListener('offline', () => {
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
