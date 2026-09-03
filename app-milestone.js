// ══════════════════════════════════════════════════════════════════════════════
//  MILESTONE-CELEBRATION
//  Zeigt beim ersten App-Öffnen nach Überschreiten einer Milch-Schwelle
//  (z.B. 60.000 L) ein feierliches Vollbild-Popup mit persönlichem Danke.
//  Jeder User sieht es nur einmal pro Milestone.
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '1.0';
  window.MILESTONE_VERSION = VERSION;

  // Konfigurierbare Milestones (in aufsteigender Reihenfolge)
  const MILESTONES = [
    { schwelle: 60000, label: '60.000 LITER', kicker: 'Ein Meilenstein' },
    { schwelle: 75000, label: '75.000 LITER', kicker: 'Nicht zu stoppen' },
    { schwelle: 100000, label: '100.000 LITER', kicker: 'Sechsstellig' }
  ];

  function _getFirstName() {
    const u = window._currentUser;
    if(!u) return '';
    if(u.name && String(u.name).trim()) return String(u.name).split(' ')[0];
    if(u.email) return String(u.email).split('@')[0].split(/[._-]/)[0].charAt(0).toUpperCase() + String(u.email).split('@')[0].split(/[._-]/)[0].slice(1);
    return '';
  }

  function _seenKey(schwelle) {
    const uid = window._currentUser?.uid || window._currentUser?.email || 'anon';
    return 'milestone_' + schwelle + '_seen_' + uid;
  }

  function _wasSeen(schwelle) {
    try { return !!localStorage.getItem(_seenKey(schwelle)); } catch(e) { return false; }
  }
  function _markSeen(schwelle) {
    try { localStorage.setItem(_seenKey(schwelle), String(Date.now())); } catch(e) {}
  }

  // ── Prüfung ob ein Milestone jetzt fällig ist ──
  function _checkMilestones() {
    if(!window.computeCarryForwardGesamt) return;
    if(!window._currentUser) return;   // erst nach Auth
    const total = (window.computeCarryForwardGesamt().gesamt) || 0;
    // Höchsten überschrittenen und noch nicht gesehenen Milestone finden
    let toShow = null;
    for(const m of MILESTONES) {
      if(total >= m.schwelle && !_wasSeen(m.schwelle)) toShow = m;
    }
    if(toShow) {
      // Kurz warten damit die App fertig gerendert ist
      setTimeout(() => _zeigeMilestone(toShow, total), 1500);
    }
  }

  // ── Anzeige ──
  function _zeigeMilestone(m, total) {
    if(document.getElementById('milestone-overlay')) return;
    _markSeen(m.schwelle);   // sofort markieren um Doppel-Anzeige zu verhindern

    const name = _getFirstName();
    const almName = window.saisonInfo?.alm || 'die Alm';

    // Styles einmalig injizieren
    if(!document.getElementById('milestone-styles')) {
      const st = document.createElement('style');
      st.id = 'milestone-styles';
      st.textContent = `
        #milestone-overlay {
          position:fixed; inset:0; z-index:99999; overflow:hidden;
          background:radial-gradient(ellipse at center, #2a1a05 0%, #0a0800 100%);
          font-family:Georgia,'Times New Roman',serif; color:#fff;
          display:flex; align-items:center; justify-content:center;
          animation:ms-fade-in 1s ease;
        }
        @keyframes ms-fade-in { from{opacity:0} to{opacity:1} }
        @keyframes ms-pop { from{opacity:0; transform:scale(.3) rotate(-8deg)} to{opacity:1; transform:scale(1) rotate(0)} }
        @keyframes ms-fade-up { from{opacity:0; transform:translateY(30px)} to{opacity:1; transform:translateY(0)} }
        @keyframes ms-glow { 0%{text-shadow:0 0 40px rgba(232,217,168,.6),0 0 80px rgba(232,217,168,.3)} 50%{text-shadow:0 0 60px rgba(232,217,168,.9),0 0 120px rgba(232,217,168,.5)} 100%{text-shadow:0 0 40px rgba(232,217,168,.6),0 0 80px rgba(232,217,168,.3)} }
        @keyframes ms-shine { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes ms-confetti-fall { 0%{transform:translateY(-10vh) rotate(0)} 100%{transform:translateY(110vh) rotate(720deg)} }
        @keyframes ms-particle-up { 0%{transform:translateY(0) scale(0);opacity:0} 20%{opacity:.7;transform:scale(1)} 100%{transform:translateY(-100vh) scale(.3);opacity:0} }
        @keyframes ms-ring { 0%{transform:scale(.5);opacity:1} 100%{transform:scale(3);opacity:0} }

        #milestone-overlay .ms-content { text-align:center; z-index:2; max-width:800px; padding:2rem; }
        #milestone-overlay .ms-kicker {
          font-family:'Helvetica Neue',sans-serif; font-size:.85rem; letter-spacing:.4em;
          text-transform:uppercase; color:#e8d9a8; opacity:.7; margin-bottom:1.5rem;
          animation:ms-fade-up 1s ease .3s both;
        }
        #milestone-overlay .ms-icon {
          font-size:5rem; margin-bottom:1rem; display:inline-block;
          animation:ms-pop 1.2s cubic-bezier(.34,1.56,.64,1) both;
          filter:drop-shadow(0 0 30px rgba(232,217,168,.6));
        }
        #milestone-overlay .ms-number {
          font-size:clamp(4rem, 15vw, 10rem); font-weight:400; line-height:1;
          margin:.5rem 0 .3rem 0; letter-spacing:-.04em;
          background:linear-gradient(90deg,#c9b280 0%,#f5e6b8 25%,#fff5cc 50%,#f5e6b8 75%,#c9b280 100%);
          background-size:200% 100%;
          -webkit-background-clip:text; background-clip:text;
          -webkit-text-fill-color:transparent; color:transparent;
          animation:ms-pop 1.4s cubic-bezier(.34,1.56,.64,1) both, ms-shine 6s linear infinite;
        }
        #milestone-overlay .ms-subtitle {
          font-size:clamp(1.1rem, 2.5vw, 1.6rem); color:rgba(255,255,255,.8);
          font-style:italic; margin-bottom:2.5rem;
          animation:ms-fade-up 1s ease .7s both;
        }
        #milestone-overlay .ms-danke {
          font-size:clamp(1.3rem, 3vw, 2rem); color:#f5e6b8; font-weight:400;
          margin-bottom:.8rem; letter-spacing:-.01em;
          animation:ms-fade-up 1s ease 1.0s both;
        }
        #milestone-overlay .ms-message {
          font-size:clamp(1rem, 1.8vw, 1.2rem); color:rgba(255,255,255,.85);
          line-height:1.7; max-width:560px; margin:0 auto 2.5rem auto;
          animation:ms-fade-up 1s ease 1.3s both;
        }
        #milestone-overlay .ms-btn {
          background:linear-gradient(135deg,#e8d9a8,#c9b280);
          color:#0a0800; border:none;
          padding:1.1rem 3rem; border-radius:32px;
          font-size:1.15rem; font-weight:600; cursor:pointer;
          font-family:'Helvetica Neue',sans-serif; letter-spacing:.02em;
          box-shadow:0 8px 40px rgba(232,217,168,.4), 0 0 60px rgba(232,217,168,.2);
          transition:transform .2s, box-shadow .2s;
          animation:ms-fade-up 1s ease 1.6s both;
        }
        #milestone-overlay .ms-btn:hover { transform:scale(1.04); box-shadow:0 12px 50px rgba(232,217,168,.5), 0 0 80px rgba(232,217,168,.3); }

        /* Konfetti */
        #milestone-overlay .ms-confetti {
          position:absolute; width:10px; height:14px; top:-20px;
          animation:ms-confetti-fall linear infinite;
          z-index:1;
        }
        /* Gold-Partikel die aufsteigen */
        #milestone-overlay .ms-particle {
          position:absolute; bottom:0; width:6px; height:6px;
          border-radius:50%; background:radial-gradient(circle,#f5e6b8,transparent);
          animation:ms-particle-up linear infinite;
          z-index:1;
        }
        /* Ring-Puls hinter der Zahl */
        #milestone-overlay .ms-ring {
          position:absolute; top:50%; left:50%;
          width:200px; height:200px; border-radius:50%;
          border:2px solid #e8d9a8;
          transform:translate(-50%,-50%) scale(.5);
          animation:ms-ring 2.5s ease-out infinite;
          z-index:0; opacity:0;
        }
      `;
      document.head.appendChild(st);
    }

    const ov = document.createElement('div');
    ov.id = 'milestone-overlay';

    // Konfetti-Elemente generieren
    const konfettiFarben = ['#e8d9a8', '#c9b280', '#f5e6b8', '#fff5cc', '#b8952f'];
    let confettiHtml = '';
    for(let i = 0; i < 60; i++) {
      const links = Math.random() * 100;
      const dauer = 3 + Math.random() * 4;
      const delay = Math.random() * 5;
      const farbe = konfettiFarben[Math.floor(Math.random() * konfettiFarben.length)];
      const rot = Math.random() * 360;
      confettiHtml += '<div class="ms-confetti" style="left:' + links + '%;background:' + farbe + ';animation-duration:' + dauer + 's;animation-delay:' + delay + 's;transform:rotate(' + rot + 'deg)"></div>';
    }
    // Aufsteigende Partikel
    let particleHtml = '';
    for(let i = 0; i < 30; i++) {
      const links = Math.random() * 100;
      const dauer = 4 + Math.random() * 6;
      const delay = Math.random() * 8;
      particleHtml += '<div class="ms-particle" style="left:' + links + '%;animation-duration:' + dauer + 's;animation-delay:' + delay + 's"></div>';
    }

    ov.innerHTML =
      confettiHtml +
      particleHtml +
      '<div class="ms-ring" style="animation-delay:0s"></div>' +
      '<div class="ms-ring" style="animation-delay:.8s"></div>' +
      '<div class="ms-ring" style="animation-delay:1.6s"></div>' +
      '<div class="ms-content">' +
        '<div class="ms-kicker">' + m.kicker + ' · ' + almName + '</div>' +
        '<div class="ms-icon">🏆</div>' +
        '<div class="ms-number">' + m.label + '</div>' +
        '<div class="ms-subtitle">und noch ist die Saison nicht zu Ende.</div>' +
        '<div class="ms-danke">Danke, ' + (name || 'du') + '.</div>' +
        '<div class="ms-message">' +
          'Diese Zahl ist nicht nur eine Zahl. Sie ist die Summe unzähliger Handgriffe, ' +
          'früher Morgen und langer Abende. Ohne dich wären diese ' + m.label.toLowerCase() + ' nie zusammengekommen.<br><br>' +
          '<b style="color:#f5e6b8">Du bist ein Teil davon. Ein großer Teil.</b>' +
        '</div>' +
        '<button class="ms-btn" onclick="_milestoneClose()">Ich bin stolz.</button>' +
      '</div>';

    document.body.appendChild(ov);

    // Sanfte Bell-/Fanfaren-Sound via Web Audio API
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain();
      master.gain.value = 0.2;
      master.connect(ctx.destination);
      // Chord: A-Dur (A, C#, E) — feierlich
      const noten = [440, 554.4, 659.3, 880];
      noten.forEach((freq, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime + i * 0.15);
        g.gain.linearRampToValueAtTime(0.3 / (i+1), ctx.currentTime + i * 0.15 + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 3);
        o.connect(g); g.connect(master);
        o.start(ctx.currentTime + i * 0.15);
        o.stop(ctx.currentTime + i * 0.15 + 3.1);
      });
      setTimeout(() => { try { ctx.close(); } catch(e) {} }, 5000);
    } catch(e) { /* Audio nicht kritisch */ }

    // Vibration
    if(navigator.vibrate) navigator.vibrate([80, 40, 80, 40, 200]);
  }

  window._milestoneClose = function() {
    const ov = document.getElementById('milestone-overlay');
    if(!ov) return;
    ov.style.transition = 'opacity .6s ease';
    ov.style.opacity = '0';
    setTimeout(() => ov.remove(), 700);
  };

  // Manueller Test — z.B. via Console: `zeigeMilestoneTest(60000)`
  window.zeigeMilestoneTest = function(schwelle) {
    const m = MILESTONES.find(x => x.schwelle === schwelle) || MILESTONES[0];
    // Bei Test: seen-Flag temporär entfernen
    try { localStorage.removeItem(_seenKey(m.schwelle)); } catch(e) {}
    _zeigeMilestone(m, m.schwelle);
  };

  // Auto-Check: nach App-Load (mit Delay für Daten)
  window.addEventListener('load', () => setTimeout(_checkMilestones, 4000));
  // Auch nach dem force-refresh (da laufen die Daten frisch)
  setInterval(_checkMilestones, 60000);

  console.log('[Milestone] Modul geladen v' + VERSION);
})();
