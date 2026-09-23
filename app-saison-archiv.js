// ══════════════════════════════════════════════════════════════════════════════
//  SAISON-ARCHIV (v1.0, v54.26) — "Neue Saison = ALLES NEU"
//  ------------------------------------------------------------------
//  Beim Start einer neuen Saison werden alle Daten der alten Saison atomar nach
//  saisonArchivDaten/<jahr>/ verschoben. Die App startet leer. Übernommen werden
//  nur Kontakte + Alm-Infrastruktur (Weiden/Weidekarte, Maschinen, Lager).
//  Das Archiv bleibt ansehbar (Bestandsbuch drucken, Datei speichern) —
//  Behandlungsnachweise unterliegen einer mehrjährigen Aufbewahrungspflicht.
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  // Was ins Archiv wandert (Saison-Daten)
  const ARCHIV_PFADE = ['kuehe','bauern','milch','behandlungen','besamungen','weideTage','gruppen','journal',
    'sennerei','milchSperren','schalmtest','zellzahl','kaese_produktion','zaehlung','zaehlVerlauf',
    'kraftfutter','kfLieferungen','aufgaben','kalenderTermine','traenkeLog','klauenpflege',
    'stallplan','stallplanV','fotos','chat'];
  // Was bleibt: kontakte, benutzer, saisonArchiv (Kennzahlen), weiden, almKarteWeiden, wartung, lager, spielScores
  window.HP_ARCHIV_PFADE = ARCHIV_PFADE;

  const ARCHIV_ROOT = 'saisonArchivDaten';
  const _cnt = o => (o && typeof o === 'object') ? Object.keys(o).length : 0;
  // saisonArchiv ist eine globale let-Variable aus app-core.js (nicht auf window)
  const _sa = () => (typeof saisonArchiv !== 'undefined' && saisonArchiv) ? saisonArchiv : (window.saisonArchiv || {});

  // Gibt es überhaupt Daten einer alten Saison?
  window.hpHatSaisonDaten = function() {
    return _cnt(window.kuehe) > 0 || _cnt(window.bauern) > 0 || _cnt(window.milchEintraege) > 0 || _cnt(window.behandlungen) > 0;
  };

  // Kurzübersicht für den Assistenten (aus dem Speicher, ohne DB-Zugriff)
  window.hpArchivUebersicht = function() {
    return {
      kuehe: _cnt(window.kuehe), bauern: _cnt(window.bauern), milch: _cnt(window.milchEintraege),
      behandlungen: _cnt(window.behandlungen), besamungen: _cnt(window.besamungen),
      verkaeufe: _cnt(window.sennereiVerkaeufe), gruppen: _cnt(window.gruppen)
    };
  };

  // Darf dieses Konto ins Archiv schreiben? (Firebase-Regeln)
  window.hpArchivSchreibbar = async function() {
    const p = ARCHIV_ROOT + '/__schreibtest';
    try {
      await firebase.database().ref(p).set({ t: Date.now() });
      await firebase.database().ref(p).remove();
      return true;
    } catch(e) { return false; }
  };

  // ── Kern: alte Saison archivieren (atomar) ──────────────────────────────
  window.hpSaisonArchivieren = async function(jahr) {
    const db = firebase.database();
    if(!(await window.hpArchivSchreibbar())) {
      throw new Error('Keine Berechtigung für das Archiv (Firebase-Regel für "' + ARCHIV_ROOT + '" fehlt). Es wurde NICHTS verändert.');
    }
    // 1) Alles lesen
    const daten = {}, zaehler = {};
    for(const p of ARCHIV_PFADE) {
      const snap = await db.ref(p).once('value');
      if(snap.exists()) { daten[p] = snap.val(); zaehler[p] = _cnt(daten[p]); }
    }
    // 2) Freien Archiv-Schlüssel wählen (2026, 2026-2, …)
    let key = String(jahr || new Date().getFullYear());
    for(let i = 2; (await db.ref(ARCHIV_ROOT + '/' + key + '/meta').once('value')).exists(); i++) key = jahr + '-' + i;
    // 3) EIN atomares Update: kopieren + Original leeren (alles oder nichts)
    const updates = {};
    const meta = { jahr: jahr || null, archiviertAm: Date.now(), zaehler,
      archiviertVon: (firebase.auth().currentUser && firebase.auth().currentUser.email) || null,
      alm: (window.saisonInfo && window.saisonInfo.alm) || null,
      saison: window.saisonInfo ? JSON.parse(JSON.stringify(window.saisonInfo)) : null };
    updates[ARCHIV_ROOT + '/' + key + '/meta'] = meta;
    for(const p of Object.keys(daten)) {
      updates[ARCHIV_ROOT + '/' + key + '/daten/' + p] = daten[p];
      updates[p] = null;
    }
    // Verweis in der (kleinen) Saison-Kennzahlen-Liste, damit der Archiv-Knoten nie komplett geladen werden muss
    updates['saisonArchiv/' + key + '/archivDatenKey'] = key;
    updates['saisonArchiv/' + key + '/archiviertAm'] = meta.archiviertAm;
    if(!(_sa()[key] && _sa()[key].jahr)) updates['saisonArchiv/' + key + '/jahr'] = jahr || null;
    await db.ref('/').update(updates);
    // 4) Kontrolle: Archiv vollständig?
    for(const p of Object.keys(daten)) {
      const n = _cnt((await db.ref(ARCHIV_ROOT + '/' + key + '/daten/' + p).once('value')).val());
      if(n !== zaehler[p]) throw new Error('Archiv-Kontrolle fehlgeschlagen bei "' + p + '" (' + n + ' statt ' + zaehler[p] + ')');
    }
    return { key, zaehler };
  };

  // ── Archiv ansehen ──────────────────────────────────────────────────────
  function _archivListe() {
    return Object.entries(_sa())
      .filter(([k, v]) => v && v.archivDatenKey)
      .map(([k, v]) => ({ key: v.archivDatenKey, jahr: v.jahr || k, am: v.archiviertAm }))
      .sort((a, b) => String(b.key).localeCompare(String(a.key)));
  }

  window.hpArchivBestandsbuch = async function(key) {
    const db = firebase.database();
    const [beh, kh, meta] = await Promise.all([
      db.ref(ARCHIV_ROOT + '/' + key + '/daten/behandlungen').once('value'),
      db.ref(ARCHIV_ROOT + '/' + key + '/daten/kuehe').once('value'),
      db.ref(ARCHIV_ROOT + '/' + key + '/meta').once('value')
    ]);
    const m = meta.val() || {};
    // Kurz die Archiv-Daten einsetzen, drucken (synchron), sofort zurücktauschen
    const altB = behandlungen, altK = kuehe, altS = saisonInfo;
    try {
      behandlungen = beh.val() || {}; kuehe = kh.val() || {};
      saisonInfo = Object.assign({}, m.saison || {}, { jahr: m.jahr || (m.saison && m.saison.jahr), alm: m.alm || (m.saison && m.saison.alm) });
      window.druckeBestandsbuch();
    } finally {
      behandlungen = altB; kuehe = altK; saisonInfo = altS;
    }
  };

  window.hpArchivSpeichern = async function(key) {
    const snap = await firebase.database().ref(ARCHIV_ROOT + '/' + key).once('value');
    const blob = new Blob([JSON.stringify(Object.assign({ archivKey: key, exportDatum: new Date().toISOString() }, snap.val() || {}), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'HerdenPro_Archiv_' + key + '.json';
    a.click();
  };

  function _renderArchivBox() {
    if(window.currentView !== 'backup') return;
    const mc = document.getElementById('main-content');
    if(!mc || document.getElementById('hp-archiv-box')) return;
    const liste = _archivListe();
    const box = document.createElement('div');
    box.id = 'hp-archiv-box';
    box.className = 'card-section';
    box.style.cssText = 'margin-top:1rem';
    box.innerHTML = '<div class="section-label" style="margin-bottom:.4rem">ARCHIVIERTE SAISONS</div>' +
      (liste.length ? liste.map(e =>
        '<div style="display:flex;align-items:center;gap:.5rem;padding:.45rem 0;border-bottom:1px solid var(--border)">' +
          '<b style="flex:1">Saison ' + window.hpEsc(e.jahr) + '</b>' +
          '<button class="btn-xs" onclick="hpArchivBestandsbuch(\'' + window.hpEsc(e.key) + '\')">Bestandsbuch drucken</button>' +
          '<button class="btn-xs" onclick="hpArchivSpeichern(\'' + window.hpEsc(e.key) + '\')">Als Datei speichern</button>' +
        '</div>').join('')
      : '<div style="font-size:.8rem;color:var(--text3)">Noch keine archivierte Saison. Beim Start einer neuen Saison wird die alte automatisch hierher verschoben.</div>');
    mc.appendChild(box);
  }

  // Nach jedem Seitenwechsel prüfen (navigate wird von mehreren Modulen umhüllt)
  (function hookNavigate() {
    const orig = window.navigate;
    if(!orig) { setTimeout(hookNavigate, 200); return; }
    if(orig._hpArchivHooked) return;
    window.navigate = function() {
      const r = orig.apply(this, arguments);
      setTimeout(_renderArchivBox, 300);
      return r;
    };
    window.navigate._hpArchivHooked = true;
  })();

  console.log('[Saison-Archiv] Modul geladen');
})();
