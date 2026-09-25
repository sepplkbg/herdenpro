// ══════════════════════════════════════════════════════════════════════════════
//  HP-EXTRAS (v1.0, v54.29) — kleine Verbesserungen
//   A4  Sync-Anzeige: wartende Milchwerte neben dem Verbindungspunkt
//   A5  Milchliste: Hinweis wenn sich die Kühe auf der Alm geändert haben
//   A11 Sonnenmodus: helles Farbschema mit hohem Kontrast (im AA-Menü)
//   A13 "Was ist neu" nach einem Update
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  'use strict';
  const esc = s => (window.hpEsc ? window.hpEsc(s) : String(s == null ? '' : s));

  // ═══ A13: Was ist neu ═══════════════════════════════════════════════════
  // Neueste Version oben. Nur Punkte, die Nutzer merken.
  const CHANGELOG = [
    { v: 'v54.31', punkte: [
      'Selbsttest: AA-Menü oben rechts → 🧪 Selbsttest (Bericht kann an den Admin geschickt werden)',
      'Alle Programmteile und Symbole kommen jetzt direkt von der App – schnellerer Start, besser offline'
    ]},
    { v: 'v54.30', punkte: [
      'Papierkorb: Gelöschtes 30 Tage zurückholbar (Backup → Daten-Sicherheit)',
      'Daten-Check findet Unstimmigkeiten (fehlender Bauer, doppelte Nummer, Ohrmarke …)',
      'Behandlung: häufige Behandlungen mit einem Tipp übernehmen',
      'Saisonstart-Vorlage mit Auswahllisten, auf Wunsch mit Bauern & Kühen von heuer',
      'Admin: wöchentliche Wiederherstellungspunkte'
    ]},
    { v: 'v54.29', punkte: [
      'Sonnenmodus: helle Ansicht für draußen (AA-Menü oben rechts)',
      'Neben dem Verbindungspunkt siehst du, wie viele Milchwerte noch auf Internet warten',
      'Milchliste zeigt an, wenn eine Kuh neu auf die Alm gekommen ist',
      'Ohrmarken werden auf das österreichische Format geprüft',
      'Sennerei: Käse-Ausbeute (Liter Milch pro kg Käse)'
    ]},
    { v: 'v54.28', punkte: [
      'Eine Suche für alles: Mehr → Suche (auch Chargen, Verkäufe, Weiden, Gruppen)',
      'Abholungsliste zeigt jede Unterschrift einzeln',
      'Datenschutzerklärung'
    ]}
  ];
  window.HP_CHANGELOG = CHANGELOG;

  function zeigeWasIstNeu(force) {
    const aktuell = localStorage.getItem('hp_version');
    if(!aktuell) return;
    const gesehen = localStorage.getItem('hp_whatsnew_seen');
    if(!force && gesehen === aktuell) return;
    if(!force && !gesehen) { localStorage.setItem('hp_whatsnew_seen', aktuell); return; } // Erstinstallation: nichts zeigen
    // alle Einträge seit der zuletzt gesehenen Version (neueste zuerst)
    let neu = [];
    for(const c of CHANGELOG) { if(!force && c.v === gesehen) break; neu.push(c); if(force) break; }
    if(!neu.length) { localStorage.setItem('hp_whatsnew_seen', aktuell); return; }   // nur Fehlerbehebungen
    const eintrag = { v: neu.length > 1 ? neu[neu.length - 1].v + ' – ' + neu[0].v : neu[0].v, punkte: [].concat.apply([], neu.map(c => c.punkte)) };
    if(!eintrag.punkte.length) return;
    localStorage.setItem('hp_whatsnew_seen', aktuell);
    document.getElementById('hp-whatsnew')?.remove();
    const ov = document.createElement('div');
    ov.id = 'hp-whatsnew';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99500;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:1rem';
    ov.innerHTML =
      '<div style="background:var(--bg2);border:1px solid var(--gold2);border-radius:14px;max-width:420px;width:100%;padding:1.1rem 1.2rem;box-shadow:var(--shadow)">' +
        '<div style="font-family:Georgia,serif;color:var(--gold);font-size:1.2rem;font-weight:700;margin-bottom:.2rem">✨ Was ist neu</div>' +
        '<div style="font-size:.75rem;color:var(--text3);margin-bottom:.7rem">HerdenPro ' + esc(eintrag.v) + '</div>' +
        '<ul style="margin:0 0 1rem 1.1rem;padding:0;color:var(--text);font-size:.9rem;line-height:1.5">' +
          eintrag.punkte.map(p => '<li>' + esc(p) + '</li>').join('') +
        '</ul>' +
        '<button class="btn-primary" style="width:100%" onclick="document.getElementById(\'hp-whatsnew\').remove()">Alles klar</button>' +
      '</div>';
    ov.addEventListener('click', e => { if(e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  }
  window.hpZeigeWasIstNeu = function() { zeigeWasIstNeu(true); };

  // ═══ A11: Sonnenmodus ═══════════════════════════════════════════════════
  const HELL_CSS = `
    html.hp-hell {
      --bg:#f4f1e6; --bg2:#fbfaf5; --bg3:#ebe6d4; --bg4:#e0d9c3;
      --border:#cbc2a6; --border2:#ada282;
      --text:#17170f; --text2:#35521a; --text3:#5a624b;
      --gold:#7d5a0f; --gold2:#6e4f0c; --gold3:#94701a;
      --green:#2a7a2e; --green2:#226626; --red:#b3261e; --orange:#a8520f; --blue:#1d5d8a; --purple:#5a3789;
      --shadow:0 4px 18px rgba(0,0,0,.14); --shadow-sm:0 2px 6px rgba(0,0,0,.1);
      color-scheme: light;
    }
    html.hp-hell body { background: var(--bg) !important; color: var(--text); }
    html.hp-hell #root { background: var(--bg) !important; }
    html.hp-hell #topbar, html.hp-hell #bottom-nav, html.hp-hell .bottom-nav { background: var(--bg2) !important; border-color: var(--border) !important; }
    html.hp-hell .list-card, html.hp-hell .card-section, html.hp-hell .stat-card, html.hp-hell .form-sheet { background: var(--bg2) !important; }
    html.hp-hell input, html.hp-hell select, html.hp-hell textarea, html.hp-hell .inp { background: #fff !important; color: var(--text) !important; border-color: var(--border2) !important; }
    html.hp-hell .btn-primary { color: #fff !important; }
  `;
  function setzeHell(an) {
    document.documentElement.classList.toggle('hp-hell', !!an);
    try { localStorage.setItem('hp_hell', an ? '1' : '0'); } catch(e) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute('content', an ? '#f4f1e6' : '#0c1a09');
    const b = document.getElementById('hp-hell-btn');
    if(b) b.textContent = an ? '🌙 Dunkle Ansicht' : '☀️ Sonnenmodus (hell)';
  }
  window.hpSonnenmodus = function() { setzeHell(!document.documentElement.classList.contains('hp-hell')); };
  (function initHell() {
    const st = document.createElement('style'); st.id = 'hp-hell-css'; st.textContent = HELL_CSS; document.head.appendChild(st);
    try { if(localStorage.getItem('hp_hell') === '1') setzeHell(true); } catch(e) {}
  })();
  function hellKnopfEinbauen() {
    const pop = document.getElementById('schrift-popup');
    if(!pop) return false;
    if(document.getElementById('hp-hell-btn')) return true;
    const b = document.createElement('button');
    b.id = 'hp-hell-btn';
    b.type = 'button';
    b.style.cssText = 'display:block;width:100%;margin-top:.6rem;padding:.55rem;border-radius:8px;border:1.5px solid var(--gold2);background:var(--bg3);color:var(--text);font-weight:700;cursor:pointer';
    b.onclick = function(e) { e.stopPropagation(); window.hpSonnenmodus(); };
    pop.appendChild(b);
    setzeHell(document.documentElement.classList.contains('hp-hell'));
    return true;
  }

  // ═══ A4: Sync-Anzeige ═══════════════════════════════════════════════════
  function wartendeMilchwerte() {
    try {
      const pid = (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.projectId) || 'default';
      const p = JSON.parse(localStorage.getItem('milchPendingV2:' + pid) || '{}');
      let n = 0; for(const k in p) n += Object.keys(p[k] || {}).length;
      return n;
    } catch(e) { return 0; }
  }
  function syncAnzeige() {
    const dot = document.getElementById('sync-dot');
    if(!dot) return;
    let pill = document.getElementById('hp-sync-pill');
    const n = wartendeMilchwerte();
    const offline = !navigator.onLine;
    if(!n && !offline) { if(pill) pill.remove(); return; }
    if(!pill) {
      pill = document.createElement('button');
      pill.id = 'hp-sync-pill';
      pill.type = 'button';
      pill.style.cssText = 'border:1.5px solid var(--orange);background:rgba(208,112,48,.15);color:var(--orange);border-radius:10px;padding:.1rem .45rem;font-size:.7rem;font-weight:800;cursor:pointer;line-height:1.3;white-space:nowrap';
      pill.onclick = function() {
        if(typeof window.showMilchPendingDetails === 'function') window.showMilchPendingDetails();
        else alert(wartendeMilchwerte() + ' Milchwert(e) warten auf Internet. Sie werden automatisch übertragen, sobald wieder Empfang ist.');
      };
      dot.parentNode.insertBefore(pill, dot);
    }
    pill.textContent = (offline ? '📴 offline' : '⏳') + (n ? ' · ' + n + ' wartend' : '');
    pill.title = n ? n + ' Milchwert(e) noch nicht übertragen' : 'Keine Internetverbindung';
  }

  // ═══ A5: Milchliste – Kühe geändert? ════════════════════════════════════
  function melkKuehe() {
    const k = window.kuehe || {};
    return Object.keys(k).filter(id => {
      const x = k[id];
      if(!x || x.almStatus !== 'oben') return false;
      const l = String(x.laktation || '').toLowerCase();
      return l !== 'trocken' && l !== 'trockengestellt';
    });
  }
  function milchListeCheck() {
    if(window.currentView !== 'milch_erfassen') { document.getElementById('hp-milch-neu')?.remove(); return; }
    if(window._milchZeigeAlle === true) return;   // "alle Kühe"-Ansicht: nicht vergleichen
    const rows = [...new Set([...document.querySelectorAll('#main-content input.kuh-liter[data-id]')].map(i => i.dataset.id))];
    if(!rows.length) return;
    const soll = melkKuehe();
    const neu = soll.filter(id => !rows.includes(id));
    const weg = rows.filter(id => !soll.includes(id));
    let box = document.getElementById('hp-milch-neu');
    if(!neu.length && !weg.length) { if(box) box.remove(); return; }
    const k = window.kuehe || {};
    const txt = [];
    if(neu.length) txt.push('Neu auf der Alm: ' + neu.slice(0, 4).map(id => '#' + esc(k[id] && k[id].nr)).join(', ') + (neu.length > 4 ? ' …' : ''));
    if(weg.length) txt.push(weg.length + ' nicht mehr in der Melkliste');
    const html = '<div style="flex:1;font-size:.82rem">🐄 ' + txt.join(' · ') + '</div>' +
      '<button type="button" class="btn-xs" style="background:var(--gold);color:#000;border:none;font-weight:800" onclick="hpMilchListeNeu()">Liste aktualisieren</button>';
    if(!box) {
      box = document.createElement('div');
      box.id = 'hp-milch-neu';
      box.style.cssText = 'display:flex;align-items:center;gap:.5rem;background:rgba(212,168,75,.12);border:1px solid var(--gold2);border-radius:10px;padding:.5rem .7rem;margin:.4rem 0 .6rem';
      const mc = document.getElementById('main-content');
      if(mc) mc.insertBefore(box, mc.firstChild);
    }
    box.innerHTML = html;
  }
  // Neu zeichnen, aber gewähltes Datum + Melkzeit behalten (Werte kommen aus DB/Zwischenspeicher)
  window.hpMilchListeNeu = function() {
    const datum = document.getElementById('m-datum')?.value;
    const zeit = document.getElementById('m-zeit')?.value || 'morgen';
    window._lastView = null;
    if(typeof render === 'function') render();
    setTimeout(() => {
      const d = document.getElementById('m-datum');
      if(d && datum) { d.value = datum; d.dispatchEvent(new Event('change', { bubbles: true })); d.dispatchEvent(new Event('input', { bubbles: true })); }
      const btn = document.getElementById('m-zeit-' + zeit);
      if(btn && typeof window.selectMilchZeit === 'function') window.selectMilchZeit(zeit, btn);
      document.getElementById('hp-milch-neu')?.remove();
    }, 150);
  };

  // ═══ Takt ═══════════════════════════════════════════════════════════════
  function tick() {
    try { syncAnzeige(); } catch(e) {}
    try { milchListeCheck(); } catch(e) {}
    try { hellKnopfEinbauen(); } catch(e) {}
  }
  window.addEventListener('online', tick);
  window.addEventListener('offline', tick);
  setInterval(tick, 3000);
  setTimeout(tick, 1500);
  setTimeout(() => zeigeWasIstNeu(false), 4000);

  console.log('[HP-Extras] geladen');
})();
