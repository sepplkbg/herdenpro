// ══════════════════════════════════════════════════════════════════════════════
//  ONBOARDING-TUTORIAL für neue User
//  - Zeigt beim ersten Öffnen eine Slideshow mit 7 Slides
//  - Erklärt die Kern-Funktionen: Herde, Milch, Behandlung, Sennerei, Verkauf, etc.
//  - Kann jederzeit erneut aufgerufen werden via Einstellungen
//  - Speichert pro User „gesehen"-Flag in localStorage
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '1.0';
  window.ONBOARDING_VERSION = VERSION;

  // ── Slide-Definitionen ──
  const SLIDES = [
    {
      icon: '🐄',
      title: 'Willkommen bei HerdenPro',
      subtitle: 'Deine digitale Alm-Helferin',
      body: 'HerdenPro begleitet dich durch die ganze Alm-Saison — vom Auftrieb bis zum Abschluss.<br><br>Wir zeigen dir in 6 kurzen Schritten, was du mit der App alles machen kannst.',
      bg: 'linear-gradient(160deg,#1e3d1a,#0c1a09)'
    },
    {
      icon: '🐄',
      title: 'Deine Herde verwalten',
      subtitle: 'Alle Kühe an einem Ort',
      body: '<b>Jede Kuh</b> mit Nr., Namen, Rasse, Bauer, Fotos und Laktations-Status.<br><br>Über <b>„Herde"</b> siehst du alle Kühe und tippst auf eine, um Details zu sehen: Milch-Verlauf, Behandlungen, Besamungen, Klauenpflege.',
      bg: 'linear-gradient(160deg,#152912,#0c1a09)'
    },
    {
      icon: '🥛',
      title: 'Milch messen',
      subtitle: 'Morgens und abends — schnell erfasst',
      body: 'Über <b>„Milch"</b> → „+ Neu" das Datum wählen, Morgen oder Abend, und pro Kuh die Liter eintippen.<br><br>Der <b>Schnell-Eingabe-Modus</b> spart Zeit: Nummer + Liter + Enter.<br><br>Die App rechnet Gesamt, Durchschnitt, Vergleich zum Vortag automatisch.',
      bg: 'linear-gradient(160deg,#1a2a10,#0c1a09)'
    },
    {
      icon: '⚕',
      title: 'Behandlungen dokumentieren',
      subtitle: 'Rechtssicher gemäß § 12 TAKG',
      body: 'Behandlungen mit Medikament, Diagnose, Wartezeit-Milch und -Fleisch erfassen.<br><br><b>Der Trick:</b> Die App warnt automatisch bei WZ-Milch — betroffene Kühe werden im Milch-Formular rot markiert, und ihre Milch als „verworfen" gezählt (fließt nicht in die Sennerei-Abrechnung).',
      bg: 'linear-gradient(160deg,#2a1a10,#0c1a09)'
    },
    {
      icon: '🧀',
      title: 'Sennerei',
      subtitle: '3 Bereiche in einem Blatt',
      body: '<b>Abholung:</b> PDF von der Sennerei importieren, Bauern bekommen ihren Käse/Butter mit Signatur.<br><br><b>Produktion:</b> Tages-Produktion (Käse, Butter, Spezialitäten) mit Chargen dokumentieren.<br><br><b>Verkauf:</b> Blitzschnelle Kasse für Almwirt-Verkauf an Gäste — 1-Tap-Verkauf mit Preset-Gewichten.',
      bg: 'linear-gradient(160deg,#2a2010,#0c1a09)'
    },
    {
      icon: '📱',
      title: 'Offline & App-Modus',
      subtitle: 'Auch ohne WLAN einsatzbereit',
      body: 'HerdenPro läuft auch <b>offline</b> — alle Werte werden lokal gespeichert und automatisch synchronisiert, sobald wieder Netz da ist.<br><br>Für ein echtes App-Gefühl: <b>Installiere HerdenPro als App</b> (Einstellungen → Als App installieren). Dann läuft alles im Vollbild ohne Browser-Leiste.',
      bg: 'linear-gradient(160deg,#101a2a,#0c1a09)'
    },
    {
      icon: '🎉',
      title: 'Bereit für die Alm!',
      subtitle: 'Los geht\'s',
      body: 'Alles Wichtige weißt du jetzt.<br><br>Falls du nochmal reinschauen willst — das Tutorial ist immer da:<br><b>Einstellungen → Tutorial anzeigen</b>.<br><br><b>Tipp:</b> Falls du dich verirrst — oben rechts der 🔍-Button findet alles was du suchst (Kuh, Bauer, Behandlung, Weide).<br><br>Viel Erfolg auf der Alm!',
      bg: 'linear-gradient(160deg,#1e3d1a,#0c1a09)'
    }
  ];

  window._onboardingSlide = 0;

  function _seenKey() {
    const uid = (window._currentUser && (window._currentUser.uid || window._currentUser.email)) || 'anon';
    return 'hp_onboarding_seen_' + uid;
  }

  function _wasSeen() {
    try { return !!localStorage.getItem(_seenKey()); } catch(e) { return false; }
  }
  function _markSeen() {
    try { localStorage.setItem(_seenKey(), String(Date.now())); } catch(e) {}
  }

  // ── Automatischer Start beim ersten Öffnen (nach Auth) ──
  window.hpCheckOnboarding = function() {
    if(_wasSeen()) return;
    if(!window._currentUser) return;   // erst nach Login
    setTimeout(() => window.hpZeigeOnboarding(), 800);
  };

  // ── Manuelles Öffnen (z.B. aus Einstellungen) ──
  window.hpZeigeOnboarding = function() {
    document.getElementById('onb-overlay')?.remove();
    _injectStyles();
    window._onboardingSlide = 0;
    _render();
  };

  function _injectStyles() {
    if(document.getElementById('onb-styles')) return;
    const st = document.createElement('style');
    st.id = 'onb-styles';
    st.textContent = `
      #onb-overlay { position:fixed; inset:0; z-index:99700; overflow:hidden; display:flex; flex-direction:column; font-family:Georgia,serif; color:#fff; animation:onb-fade .3s ease; }
      @keyframes onb-fade { from{opacity:0} to{opacity:1} }
      #onb-overlay .onb-bg { position:absolute; inset:0; transition:background .6s ease; }
      #onb-overlay .onb-content { position:relative; z-index:2; flex:1; display:flex; flex-direction:column; padding:1.5rem 1.2rem 1rem; overflow-y:auto; }
      #onb-overlay .onb-skip { position:absolute; top:1rem; right:1rem; background:rgba(255,255,255,.08); border:none; color:#fff; padding:.55rem 1rem; border-radius:20px; font-size:.82rem; cursor:pointer; font-family:inherit; }
      #onb-overlay .onb-skip:hover { background:rgba(255,255,255,.15); }

      #onb-overlay .onb-slide { flex:1; display:flex; flex-direction:column; justify-content:center; text-align:center; max-width:520px; margin:0 auto; padding:1.5rem 0; }
      #onb-overlay .onb-icon { font-size:5.5rem; line-height:1; margin-bottom:1.5rem; animation:onb-pop .5s cubic-bezier(.34,1.56,.64,1) both; filter:drop-shadow(0 0 30px rgba(212,168,75,.4)); }
      @keyframes onb-pop { 0%{opacity:0;transform:scale(.3) rotate(-15deg)} 100%{opacity:1;transform:scale(1) rotate(0)} }
      #onb-overlay .onb-title { font-size:1.9rem; color:#f5e6b8; margin:0 0 .3rem 0; font-weight:400; letter-spacing:-.02em; animation:onb-up .5s ease .1s both; }
      #onb-overlay .onb-sub { font-size:.9rem; color:rgba(255,255,255,.65); letter-spacing:.15em; text-transform:uppercase; margin-bottom:1.5rem; font-family:sans-serif; animation:onb-up .5s ease .2s both; }
      #onb-overlay .onb-body { font-size:1.05rem; line-height:1.6; color:rgba(255,255,255,.9); animation:onb-up .5s ease .3s both; padding:0 .5rem; }
      #onb-overlay .onb-body b { color:#f5e6b8; }
      @keyframes onb-up { from{opacity:0;transform:translateY(15px)} to{opacity:1;transform:translateY(0)} }

      #onb-overlay .onb-nav { padding:.8rem 1rem 1.5rem; position:relative; z-index:2; }
      #onb-overlay .onb-dots { display:flex; justify-content:center; gap:.4rem; margin-bottom:1rem; }
      #onb-overlay .onb-dot { width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,.25); transition:all .25s; cursor:pointer; }
      #onb-overlay .onb-dot.active { background:#f5e6b8; width:28px; border-radius:4px; }
      #onb-overlay .onb-buttons { display:flex; gap:.5rem; max-width:520px; margin:0 auto; }
      #onb-overlay .onb-buttons button { padding:1rem; border-radius:12px; font-size:1rem; font-weight:600; cursor:pointer; border:none; font-family:sans-serif; }
      #onb-overlay .onb-back { flex:1; background:rgba(255,255,255,.08); color:#fff; }
      #onb-overlay .onb-back:disabled { opacity:.3; cursor:not-allowed; }
      #onb-overlay .onb-next { flex:2; background:#f5e6b8; color:#0a0800; font-weight:800; }
      #onb-overlay .onb-final { background:linear-gradient(135deg,#f5e6b8,#c9a05a); color:#0a0800; font-weight:800; }
    `;
    document.head.appendChild(st);
  }

  function _render() {
    const idx = window._onboardingSlide;
    const slide = SLIDES[idx];
    const isFirst = idx === 0;
    const isLast = idx === SLIDES.length - 1;

    let ov = document.getElementById('onb-overlay');
    if(!ov) {
      ov = document.createElement('div');
      ov.id = 'onb-overlay';
      document.body.appendChild(ov);
    }

    const dotsHtml = SLIDES.map((_, i) =>
      `<div class="onb-dot ${i===idx?'active':''}" onclick="_onbGoto(${i})"></div>`
    ).join('');

    ov.innerHTML =
      '<div class="onb-bg" style="background:' + slide.bg + '"></div>' +
      '<button class="onb-skip" onclick="_onbSchliessen()">Überspringen ✕</button>' +
      '<div class="onb-content">' +
        '<div class="onb-slide" key="' + idx + '">' +
          '<div class="onb-icon">' + slide.icon + '</div>' +
          '<h2 class="onb-title">' + slide.title + '</h2>' +
          '<div class="onb-sub">' + slide.subtitle + '</div>' +
          '<div class="onb-body">' + slide.body + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="onb-nav">' +
        '<div class="onb-dots">' + dotsHtml + '</div>' +
        '<div class="onb-buttons">' +
          '<button class="onb-back" ' + (isFirst?'disabled':'') + ' onclick="_onbZurueck()">◂ Zurück</button>' +
          '<button class="' + (isLast?'onb-final':'onb-next') + '" onclick="_onbWeiter()">' +
            (isLast ? '🚀 Los geht\'s!' : 'Weiter ▸') +
          '</button>' +
        '</div>' +
      '</div>';
  }

  window._onbZurueck = function() {
    if(window._onboardingSlide > 0) {
      window._onboardingSlide--;
      _render();
    }
  };
  window._onbWeiter = function() {
    if(window._onboardingSlide < SLIDES.length - 1) {
      window._onboardingSlide++;
      _render();
    } else {
      _onbSchliessen();
    }
  };
  window._onbGoto = function(i) {
    window._onboardingSlide = i;
    _render();
  };
  window._onbSchliessen = function() {
    _markSeen();
    const ov = document.getElementById('onb-overlay');
    if(!ov) return;
    ov.style.opacity = '0';
    ov.style.transition = 'opacity .3s';
    setTimeout(() => ov.remove(), 350);
  };

  // Trigger nach Auth-Load
  window.addEventListener('load', () => {
    // 2 Sekunden warten damit _currentUser da ist
    setTimeout(() => window.hpCheckOnboarding(), 2500);
  });

  console.log('[Onboarding] Modul geladen v' + VERSION);
})();
