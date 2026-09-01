// ══════════════════════════════════════════════════════════════════════════════
//  SAISON-ABSCHLUSS — Cinematic Slideshow
//  Vollbild-Farbverläufe die morphen · Ken-Burns-Effekt · Serif-Typografie
//  Zahlen die live hochzählen · Piano-Ambient statt Drones
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '2.0';
  window.SAISON_ABSCHLUSS_VERSION = VERSION;

  // ── Sprüche: kürzer, ehrlicher, weniger Klischee ──────────────────────────
  // Werden mit Daten interpoliert. {alm} {rekordkuh} {weide} {melker} {milch} {tage} {kuehe} {behandlungen}
  const SPRUECHE = [
    // Direkt & kurz
    'Fertig.',
    'Ein Sommer weniger. Ein Sommer mehr.',
    'Heute ist der letzte Tag. Morgen der erste.',
    'Manche Orte gehen nicht mehr weg.',
    'Der Berg ändert sich nicht. Wir schon.',
    'Nichts vergeht ohne Grund.',

    // Faktenbasiert-poetisch
    '{milch} Liter Milch. Aus Gras. Aus Sonne. Aus Zeit.',
    '{tage} Tage. Kein einziger war umsonst.',
    '{kuehe} Kühe. Jede kennt jeden Stein.',
    '{behandlungen} mal habt ihr geholfen. Keinmal weggeschaut.',

    // Persönlich
    'An {rekordkuh} werden wir uns erinnern.',
    'Wenn du an diesen Sommer denkst, denkst du an {rekordkuh}.',
    'Wenn {weide} nächstes Frühjahr grün wird — dann wisst ihr, warum.',
    'Die Wiese auf {weide} vergisst euch nicht.',
    '{melker} war jeden Morgen da. Kein Wort. Nur Arbeit.',
    'Ohne {melker} wäre es nicht das gleiche gewesen.',

    // Zeit & Wandel
    'Im Juni war alles neu. Jetzt ist alles anders.',
    'Der erste Auftrieb war lang. Der Abtrieb wird kurz sein.',
    'Was hier passiert ist, bleibt hier. Und bleibt in euch.',

    // Trost & Zuversicht
    'Der Winter ist kurz. Der nächste Sommer wartet schon.',
    'Es kommt ein neues Jahr. Und mit ihm ein neuer Sommer.',
    'Bis nächstes Jahr, {alm}.',

    // Ganz still
    'Danke.'
  ];

  function _renderSpruch(t, d) {
    return t
      .replace(/\{alm\}/g, d.almName || 'Alm')
      .replace(/\{tage\}/g, d.alpungTage || '')
      .replace(/\{kuehe\}/g, d.kueheAlle || '')
      .replace(/\{milch\}/g, (d.milchGesamt || 0).toLocaleString('de-AT'))
      .replace(/\{behandlungen\}/g, d.behAnzahl || 0)
      .replace(/\{rekordkuh\}/g, d.top3Kuehe[0]?.kuh?.name || 'die Beste')
      .replace(/\{weide\}/g, d.topWeide?.[0] || 'der Alm')
      .replace(/\{melker\}/g, d.fleissigsterMelker?.[0] || 'ihr alle');
  }

  function _shuffled(arr) {
    const a = arr.slice();
    for(let i = a.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; }
    return a;
  }

  // ── Farbverläufe (7 Stimmungen, morphed per slide) ─────────────────────────
  const GRADIENTS = [
    'linear-gradient(160deg, #0a1a04 0%, #1a3a0a 100%)',         // Nachtwald tief
    'linear-gradient(160deg, #1a2a0a 0%, #3a4a1a 100%)',         // Almwiese Dämmerung
    'linear-gradient(160deg, #2a1a0a 0%, #4a2a1a 100%)',         // Erdverbunden warm
    'linear-gradient(160deg, #0a2a3a 0%, #1a4a5a 100%)',         // Bergsee Blau
    'linear-gradient(160deg, #3a2a1a 0%, #6a4a2a 100%)',         // Sonnenuntergang Herbst
    'linear-gradient(160deg, #1a0a1a 0%, #3a1a2a 100%)',         // Berg-Purpur Sturm
    'linear-gradient(160deg, #0a1a1a 0%, #1a3a3a 100%)'          // Nebel-Grün still
  ];

  // ── Daten berechnen ────────────────────────────────────────────────────────
  function _data() {
    const heute = Date.now();
    const kuehe = window.kuehe || {};
    const behandlungen = window.behandlungen || {};
    const besamungen = window.besamungen || {};
    const milchEintraege = window.milchEintraege || {};
    const bauern = window.bauern || {};
    const weideTage = window.weideTage || {};
    const weiden = window.weiden || {};
    const saisonInfo = window.saisonInfo || {};
    const _mW = window.milchWert || function(v){ return typeof v === 'number' ? v : (v && v.wert != null ? parseFloat(v.wert)||0 : parseFloat(v)||0); };

    const alpungTage = saisonInfo?.auftriebDatum
      ? Math.floor((heute - saisonInfo.auftriebDatum)/86400000) + 1
      : Object.keys(milchEintraege).length > 0
        ? Math.floor((heute - Math.min(...Object.values(milchEintraege).map(m => m.datum || heute)))/86400000) + 1
        : 0;
    const kueheOben = Object.values(kuehe).filter(k => k.almStatus === 'oben').length;
    const kueheAlle = Object.keys(kuehe).length;
    const bauernAnzahl = Object.keys(bauern).length;
    const cfMilch = typeof window.computeCarryForwardGesamt === 'function' ? window.computeCarryForwardGesamt() : {gesamt:0,morgen:0,abend:0,molkerei:0,sennerei:0,tage:0};

    // Rekord-Tagesmilch
    const tagesSum = {};
    Object.values(milchEintraege).forEach(m => {
      if(!m || !m.datum) return;
      const iso = new Date(m.datum).toISOString().slice(0,10);
      let val = 0;
      if(m.gesamt) val = m.gesamt;
      else if(m.prokuh) Object.values(m.prokuh).forEach(v => val += _mW(v));
      tagesSum[iso] = (tagesSum[iso] || 0) + val;
    });
    let rekordTag = null, rekordL = 0;
    Object.entries(tagesSum).forEach(([iso, v]) => { if(v > rekordL) { rekordL = v; rekordTag = iso; } });

    // Top-3 Kühe
    const kuhSum = {};
    Object.values(milchEintraege).forEach(m => {
      if(m.prokuh) Object.entries(m.prokuh).forEach(([kid, v]) => { kuhSum[kid] = (kuhSum[kid] || 0) + _mW(v); });
    });
    const top3Kuehe = Object.entries(kuhSum).sort((a,b) => b[1]-a[1]).slice(0,3).map(([kid,l]) => ({kuh:kuehe[kid], liter:Math.round(l)}));

    // Top-3 Bauern
    const bauerSum = {};
    Object.entries(kuhSum).forEach(([kid, l]) => {
      const bauer = kuehe[kid]?.bauer || '–';
      bauerSum[bauer] = (bauerSum[bauer] || 0) + l;
    });
    const top3Bauern = Object.entries(bauerSum).filter(([b]) => b && b !== '–').sort((a,b) => b[1]-a[1]).slice(0,3).map(([name,l]) => ({name, liter:Math.round(l)}));

    // Fleißigster Melker
    const melkerZahl = {};
    Object.values(milchEintraege).forEach(m => {
      if(!m.meta) return;
      Object.values(m.meta).forEach(mt => { const name = mt?.userName || '?'; if(name && name !== '?') melkerZahl[name] = (melkerZahl[name] || 0) + 1; });
    });
    const fleissigsterMelker = Object.entries(melkerZahl).sort((a,b) => b[1]-a[1])[0];

    // Behandlungen
    const behListe = Object.values(behandlungen);
    const behAnzahl = behListe.length;
    const behDiagnosen = {};
    behListe.forEach(b => { const d = String(b.diagnose||'Unbekannt').trim(); behDiagnosen[d] = (behDiagnosen[d]||0) + 1; });
    const topDiagnosen = Object.entries(behDiagnosen).sort((a,b) => b[1]-a[1]).slice(0,5);
    const trockenAnzahl = behListe.filter(b => /trockenstell|trocken stell|trockenlegen/i.test(b.diagnose||'')).length;

    // Kälber
    const kaelber = Object.values(besamungen).filter(bs => bs.status === 'kalbung').length;
    const traechtig = Object.values(besamungen).filter(bs => bs.status === 'tragend').length;

    // Weide
    const wtListe = Object.values(weideTage);
    const wechselAnzahl = wtListe.length;
    const proWeide = {};
    wtListe.forEach(w => {
      const wid = w.weideId || '__text__';
      const name = wid === '__text__' ? (w.weideText || 'Freitext') : (weiden[wid]?.name || '?');
      proWeide[name] = (proWeide[name] || 0) + 1;
    });
    const topWeide = Object.entries(proWeide).sort((a,b) => b[1]-a[1])[0];
    const klauenAnzahl = Object.keys(window.klauenpflege || {}).length;

    return {
      alpungTage, kueheOben, kueheAlle, bauernAnzahl,
      milchGesamt: cfMilch.gesamt, milchMorgen: cfMilch.morgen, milchAbend: cfMilch.abend,
      milchMolkerei: cfMilch.molkerei, milchSennerei: cfMilch.sennerei,
      rekordTag, rekordL: Math.round(rekordL),
      top3Kuehe, top3Bauern, fleissigsterMelker,
      behAnzahl, topDiagnosen, trockenAnzahl,
      kaelber, traechtig, wechselAnzahl, topWeide, klauenAnzahl,
      saisonJahr: saisonInfo?.jahr || new Date().getFullYear(),
      almName: saisonInfo?.alm || 'Alm'
    };
  }

  // ── Slide-Definitionen (cinematic, wenig text pro slide) ───────────────────
  function _slides(d, isTest) {
    const sprueche = _shuffled(SPRUECHE.map(t => _renderSpruch(t, d)).filter(s => !s.includes('{')));
    let spruchIdx = 0;
    const spruch = () => sprueche[spruchIdx++ % sprueche.length];
    const arr = [];

    // 1. Cinematic Titel
    arr.push({ type:'hero', kicker: 'SAISON ' + d.saisonJahr, title: d.almName, subtitle: 'Eine Rückschau.' });

    // 2. Erste Zahl — Tage
    arr.push({ type:'stat', kicker:'Tage auf der Alm', value: d.alpungTage, unit:'', note: d.alpungTage > 100 ? 'ein ganzer Sommer' : 'jeder einzelne wichtig' });

    // 3. Spruch
    arr.push({ type:'quote', text: spruch() });

    // 4. Kühe
    arr.push({ type:'stat', kicker:'Kühe waren oben', value: d.kueheAlle, unit:'', note: d.kueheOben > 0 ? d.kueheOben + ' warten noch auf den Abtrieb' : 'alle sind wieder heim' });

    // 5. Bauern
    if(d.bauernAnzahl > 0) arr.push({ type:'stat', kicker:'Bauern', value: d.bauernAnzahl, unit:'', note: 'haben euch ihre Tiere anvertraut' });

    // 6. Spruch
    arr.push({ type:'quote', text: spruch() });

    // 7. Milch — Hero-Stat
    arr.push({ type:'hero-stat', kicker:'Milch', value: d.milchGesamt, unit:'Liter', note: 'in dieser Saison' });

    // 8. Morgens/Abends
    arr.push({ type:'dual-stat',
      links: {label:'Morgens', value: d.milchMorgen, unit:'L'},
      rechts: {label:'Abends', value: d.milchAbend, unit:'L'}
    });

    // 9. Rekord-Tag
    if(d.rekordTag && d.rekordL > 0) {
      arr.push({ type:'record',
        kicker: 'Der beste Tag',
        big: d.rekordL + ' L',
        note: new Date(d.rekordTag + 'T12:00').toLocaleDateString('de-AT', {weekday:'long', day:'numeric', month:'long'})
      });
    }

    // 10. Spruch
    arr.push({ type:'quote', text: spruch() });

    // 11. Top-3 Kühe (visuell)
    if(d.top3Kuehe.length > 0) {
      arr.push({ type:'podium',
        kicker: 'Milch-Königinnen',
        items: d.top3Kuehe.map(k => ({name: (k.kuh?.name||'?') + ' · #' + (k.kuh?.nr||'?'), value: k.liter + ' L'}))
      });
    }

    // 12. Top-3 Bauern
    if(d.top3Bauern.length > 0) {
      arr.push({ type:'podium', kicker:'Top-Bauern', items: d.top3Bauern.map(b => ({name: b.name, value: b.liter + ' L'})) });
    }

    // 13. Fleißigster Melker
    if(d.fleissigsterMelker) {
      arr.push({ type:'record', kicker:'Der fleißigste Melker', big: d.fleissigsterMelker[0], note: d.fleissigsterMelker[1] + ' Melkgänge' });
    }

    // 14. Spruch
    arr.push({ type:'quote', text: spruch() });

    // 15. Behandlungen
    if(d.behAnzahl > 0) {
      arr.push({ type:'stat', kicker:'Behandlungen', value: d.behAnzahl, unit:'', note: d.trockenAnzahl > 0 ? d.trockenAnzahl + ' Kühe wurden trockengestellt' : 'jedes Tier war versorgt' });
    }

    // 16. Klauen
    if(d.klauenAnzahl > 0) arr.push({ type:'stat', kicker:'Klauen gepflegt', value: d.klauenAnzahl, unit:'', note: 'für jeden Schritt' });

    // 17. Kälber
    if(d.kaelber > 0) arr.push({ type:'stat', kicker:'Neue Leben', value: d.kaelber, unit:'', note: 'im Sommer geboren' });
    if(d.traechtig > 0) arr.push({ type:'stat', kicker:'Trächtige Kühe', value: d.traechtig, unit:'', note: 'tragen den nächsten Frühling' });

    // 18. Spruch
    arr.push({ type:'quote', text: spruch() });

    // 19. Weide
    if(d.wechselAnzahl > 0) {
      arr.push({ type:'stat', kicker:'Weidewechsel', value: d.wechselAnzahl, unit:'', note: d.topWeide ? 'am meisten: ' + d.topWeide[0] : '' });
    }

    // 20. Sennerei
    if(d.milchMolkerei > 0 || d.milchSennerei > 0) {
      arr.push({ type:'dual-stat',
        links: {label:'An Molkerei', value: d.milchMolkerei, unit:'L'},
        rechts: {label:'An Sennerei', value: d.milchSennerei, unit:'L'}
      });
    }

    // 21. Spruch
    arr.push({ type:'quote', text: spruch() });

    // 22. Danke
    arr.push({ type:'hero', kicker: 'Und jetzt?', title: 'Danke.', subtitle: 'für alles was ihr getan habt.' });

    // 23. Letzter Spruch
    arr.push({ type:'quote', text: spruch() });

    // 24. Finale
    arr.push({ type:'final', isTest });

    return arr;
  }

  // ── Number Count-Up-Animation ──────────────────────────────────────────────
  function _startCountUp(el, target, duration) {
    if(!el) return;
    target = Number(target) || 0;
    duration = duration || 1400;
    const start = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const v = Math.floor(target * ease(t));
      el.textContent = v.toLocaleString('de-AT');
      if(t < 1) requestAnimationFrame(step);
      else el.textContent = target.toLocaleString('de-AT');
    }
    requestAnimationFrame(step);
  }

  // ── Slide-Rendering ────────────────────────────────────────────────────────
  function _renderSlide(sl, i, total, isTest) {
    const bg = GRADIENTS[i % GRADIENTS.length];
    let body = '';
    switch(sl.type) {
      case 'hero':
        body = `
          <div class="sa-kicker">${sl.kicker||''}</div>
          <h1 class="sa-hero-title">${sl.title||''}</h1>
          ${sl.subtitle ? '<div class="sa-subtitle">' + sl.subtitle + '</div>' : ''}
        `;
        break;
      case 'quote':
        body = `<div class="sa-quote">${sl.text}</div>`;
        break;
      case 'stat':
        body = `
          <div class="sa-kicker">${sl.kicker}</div>
          <div class="sa-stat"><span class="sa-count" data-target="${sl.value}">0</span>${sl.unit ? ' <span class="sa-unit">'+sl.unit+'</span>' : ''}</div>
          ${sl.note ? '<div class="sa-note">' + sl.note + '</div>' : ''}
        `;
        break;
      case 'hero-stat':
        body = `
          <div class="sa-kicker">${sl.kicker}</div>
          <div class="sa-hero-stat"><span class="sa-count" data-target="${sl.value}">0</span> <span class="sa-hero-unit">${sl.unit||''}</span></div>
          ${sl.note ? '<div class="sa-note">' + sl.note + '</div>' : ''}
        `;
        break;
      case 'dual-stat':
        body = `
          <div class="sa-dual">
            <div class="sa-dual-half">
              <div class="sa-dual-label">${sl.links.label}</div>
              <div class="sa-dual-value"><span class="sa-count" data-target="${sl.links.value}">0</span> ${sl.links.unit||''}</div>
            </div>
            <div class="sa-dual-line"></div>
            <div class="sa-dual-half">
              <div class="sa-dual-label">${sl.rechts.label}</div>
              <div class="sa-dual-value"><span class="sa-count" data-target="${sl.rechts.value}">0</span> ${sl.rechts.unit||''}</div>
            </div>
          </div>
        `;
        break;
      case 'record':
        body = `
          <div class="sa-kicker">${sl.kicker}</div>
          <div class="sa-record">${sl.big}</div>
          ${sl.note ? '<div class="sa-note">' + sl.note + '</div>' : ''}
        `;
        break;
      case 'podium':
        body = `
          <div class="sa-kicker">${sl.kicker}</div>
          <div class="sa-podium">
            ${sl.items.map((it, idx) => {
              const medals = ['🥇', '🥈', '🥉'];
              return '<div class="sa-podium-item" style="animation-delay:' + (0.3 + idx * 0.25) + 's">' +
                '<span class="sa-podium-medal">' + medals[idx] + '</span>' +
                '<span class="sa-podium-name">' + it.name + '</span>' +
                '<span class="sa-podium-value">' + it.value + '</span>' +
              '</div>';
            }).join('')}
          </div>
        `;
        break;
      case 'final':
        body = `
          <div class="sa-kicker">${sl.isTest ? 'Ende der Vorschau' : 'Bereit für den Abschluss'}</div>
          <div class="sa-final-icon">🏔</div>
          ${sl.isTest
            ? '<div class="sa-note">Die Saison bleibt aktiv. Nichts wurde geändert.</div>'
            : '<button onclick="saisonAbschlussEndgueltig()" class="sa-final-btn">Saison offiziell abschließen</button>'
          }
        `;
        break;
    }
    return `
      <div class="sa-bg" style="background: ${bg}"></div>
      <div class="sa-content-outer">
        <div class="sa-content-inner">${body}</div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AMBIENT: piano-artige Klänge mit ADSR + langem Reverb-Tail
  // ══════════════════════════════════════════════════════════════════════════
  let _audio = null;
  let _audioTimer = null;
  let _audioOn = false;

  function _startAudio() {
    if(_audioOn) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      _audio = { ctx };
      _audioOn = true;

      // Master + Kompressor
      const master = ctx.createGain();
      master.gain.setValueAtTime(0, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 4);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ctx.destination);

      // "Reverb"-Emulation via mehrere Delays
      const delay1 = ctx.createDelay(2); delay1.delayTime.value = 0.28;
      const delay2 = ctx.createDelay(2); delay2.delayTime.value = 0.53;
      const delay3 = ctx.createDelay(2); delay3.delayTime.value = 0.87;
      const feedback = ctx.createGain(); feedback.gain.value = 0.35;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 1200;
      delay1.connect(delay2); delay2.connect(delay3);
      delay3.connect(filter); filter.connect(feedback); feedback.connect(delay1);
      delay1.connect(master); delay2.connect(master); delay3.connect(master);

      _audio.master = master;
      _audio.reverbIn = delay1;

      // Piano-artige Note spielen (ADSR envelope, mehrere Sinusoide für Obertöne)
      function playNote(freq, duration, volume) {
        const t = ctx.currentTime;
        volume = volume || 0.3;
        [1, 2, 3].forEach((harmonic, i) => {
          const osc = ctx.createOscillator();
          osc.type = i === 0 ? 'triangle' : 'sine';
          osc.frequency.value = freq * harmonic;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(volume / (harmonic * 1.5), t + 0.02);  // attack
          g.gain.exponentialRampToValueAtTime(volume / (harmonic * 3), t + 0.3); // decay
          g.gain.exponentialRampToValueAtTime(0.0001, t + duration);              // release
          osc.connect(g);
          g.connect(master);
          g.connect(_audio.reverbIn);  // Reverb-Sends
          osc.start(t);
          osc.stop(t + duration + 0.1);
        });
      }

      // Sanfte Ambient-Progression (langsam, in A-Dur, kein Rhythmus, meditativ)
      const noten = {
        A2: 110, A3: 220, C4: 261.6, D4: 293.7, E4: 329.6, A4: 440, C5: 523.3, E5: 659.3, A5: 880
      };
      // Chord-Progressionen: Am, F, C, G — klassisch melancholisch
      const progressionen = [
        [noten.A2, noten.E4, noten.A4, noten.C5],  // Am
        [noten.A2, noten.C4, noten.E4, noten.A4],
        [noten.A2, noten.D4, noten.E4, noten.A4],
        [noten.A2, noten.E4, noten.C5, noten.E5]
      ];
      let progIdx = 0;

      function spielSchleife() {
        if(!_audioOn) return;
        const chord = progressionen[progIdx % progressionen.length];
        // Bassnote (lange)
        playNote(chord[0], 8, 0.22);
        // Akkord-Noten leicht versetzt spielen (arpeggio)
        chord.slice(1).forEach((n, i) => {
          setTimeout(() => { if(_audioOn) playNote(n, 5, 0.14); }, 400 + i * 800);
        });
        // Zufällige hohe Melodie-Note (nur manchmal)
        if(Math.random() > 0.4) {
          setTimeout(() => {
            if(!_audioOn) return;
            const melody = [noten.A4, noten.C5, noten.E5, noten.A5];
            playNote(melody[Math.floor(Math.random() * melody.length)], 3, 0.1);
          }, 2500 + Math.random() * 2000);
        }
        progIdx++;
        _audioTimer = setTimeout(spielSchleife, 6000);
      }
      spielSchleife();
      console.log('[SA] Piano-Ambient läuft');
    } catch(e) { console.warn('[SA] Web Audio fail:', e); }
  }

  function _stopAudio() {
    if(!_audioOn) return;
    _audioOn = false;
    if(_audioTimer) clearTimeout(_audioTimer);
    if(_audio && _audio.ctx) {
      try {
        const t = _audio.ctx.currentTime;
        if(_audio.master && _audio.master.gain) {
          _audio.master.gain.cancelScheduledValues(t);
          _audio.master.gain.linearRampToValueAtTime(0, t + 1.5);
        }
        setTimeout(() => { try { _audio.ctx.close(); } catch(e) {} _audio = null; }, 1800);
      } catch(e) { _audio = null; }
    }
  }

  window._saTogAudio = () => { if(_audioOn) _stopAudio(); else _startAudio(); };

  // ══════════════════════════════════════════════════════════════════════════
  // Overlay + Navigation
  // ══════════════════════════════════════════════════════════════════════════
  window.zeigeSaisonAbschluss = function(isTest) {
    isTest = !!isTest;
    document.getElementById('sa-overlay')?.remove();
    _stopAudio();

    const data = _data();
    const slides = _slides(data, isTest);
    let current = 0;

    // Style einmalig injizieren
    if(!document.getElementById('sa-styles')) {
      const st = document.createElement('style');
      st.id = 'sa-styles';
      st.textContent = `
        #sa-overlay { position:fixed; inset:0; z-index:9999; overflow:hidden; font-family:Georgia,'Times New Roman',serif; color:#fff; }
        #sa-overlay .sa-bg { position:absolute; inset:0; opacity:0; transition:opacity 1.2s ease; z-index:1; will-change:opacity; }
        #sa-overlay .sa-bg.sa-active { opacity:1; }
        #sa-overlay .sa-content-outer { position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center; padding:2rem; box-sizing:border-box; }
        #sa-overlay .sa-content-inner { max-width:800px; width:100%; text-align:center; opacity:0; transform:scale(1); transition:opacity .8s ease .2s, transform 6s ease; will-change:opacity,transform; }
        #sa-overlay .sa-content-inner.sa-active { opacity:1; transform:scale(1.04); }
        #sa-overlay .sa-testbadge { position:absolute; top:1.4rem; left:50%; transform:translateX(-50%); background:rgba(200,0,60,.9); color:#fff; padding:.35rem 1rem; border-radius:20px; font-size:.7rem; font-weight:700; letter-spacing:.1em; font-family:sans-serif; z-index:10; text-transform:uppercase; }
        #sa-overlay .sa-topbar { position:absolute; top:1rem; right:1rem; display:flex; gap:.4rem; z-index:10; }
        #sa-overlay .sa-topbtn { background:rgba(255,255,255,.12); backdrop-filter:blur(10px); color:#fff; border:none; width:42px; height:42px; border-radius:50%; font-size:1.1rem; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background .2s; }
        #sa-overlay .sa-topbtn:hover { background:rgba(255,255,255,.22); }
        #sa-overlay .sa-navbar { position:absolute; bottom:0; left:0; right:0; padding:1.2rem 1.5rem; background:linear-gradient(to top, rgba(0,0,0,.5), transparent); z-index:10; display:flex; align-items:center; gap:1rem; font-family:sans-serif; }
        #sa-overlay .sa-progress { flex:1; height:3px; background:rgba(255,255,255,.15); border-radius:2px; overflow:hidden; }
        #sa-overlay .sa-progress-fill { height:100%; background:#e8d9a8; transition:width .5s ease; }
        #sa-overlay .sa-navbtn { background:rgba(255,255,255,.14); color:#fff; border:none; padding:.6rem 1.4rem; border-radius:24px; font-size:.9rem; cursor:pointer; font-family:sans-serif; font-weight:500; transition:background .2s; }
        #sa-overlay .sa-navbtn:hover { background:rgba(255,255,255,.24); }
        #sa-overlay .sa-navbtn:disabled { opacity:.3; cursor:default; }
        #sa-overlay .sa-navcount { color:rgba(255,255,255,.6); font-size:.8rem; letter-spacing:.05em; }

        /* Typographie */
        #sa-overlay .sa-kicker { font-family:sans-serif; font-size:.75rem; letter-spacing:.3em; text-transform:uppercase; color:rgba(255,255,255,.55); margin-bottom:1.5rem; font-weight:500; }
        #sa-overlay .sa-hero-title { font-size:clamp(3rem, 8vw, 5.5rem); font-weight:400; letter-spacing:-.02em; line-height:1; margin:0 0 1.2rem 0; color:#f5e6b8; text-shadow:0 4px 30px rgba(0,0,0,.4); }
        #sa-overlay .sa-subtitle { font-size:clamp(1rem, 2vw, 1.4rem); color:rgba(255,255,255,.7); font-style:italic; }
        #sa-overlay .sa-quote { font-size:clamp(1.5rem, 3.5vw, 2.5rem); line-height:1.4; color:#f5e6b8; font-style:italic; max-width:700px; margin:0 auto; letter-spacing:-.005em; text-shadow:0 2px 20px rgba(0,0,0,.4); }
        #sa-overlay .sa-stat { font-size:clamp(4rem, 12vw, 8rem); font-weight:400; color:#f5e6b8; line-height:1; margin:.5rem 0; letter-spacing:-.03em; text-shadow:0 4px 40px rgba(0,0,0,.4); }
        #sa-overlay .sa-hero-stat { font-size:clamp(5rem, 15vw, 10rem); font-weight:400; color:#f5e6b8; line-height:.9; margin:.5rem 0; letter-spacing:-.04em; text-shadow:0 4px 50px rgba(0,0,0,.5); }
        #sa-overlay .sa-unit { font-size:.35em; color:rgba(255,255,255,.6); font-style:italic; }
        #sa-overlay .sa-hero-unit { font-size:.3em; color:rgba(255,255,255,.6); font-style:italic; }
        #sa-overlay .sa-note { font-size:clamp(.9rem, 1.8vw, 1.2rem); color:rgba(255,255,255,.7); font-style:italic; margin-top:1rem; }
        #sa-overlay .sa-record { font-size:clamp(3rem, 8vw, 5rem); color:#f5e6b8; font-weight:400; line-height:1; margin:.5rem 0; letter-spacing:-.02em; text-shadow:0 4px 30px rgba(0,0,0,.4); }

        #sa-overlay .sa-dual { display:flex; gap:2rem; align-items:center; justify-content:center; max-width:700px; margin:0 auto; }
        #sa-overlay .sa-dual-half { flex:1; }
        #sa-overlay .sa-dual-label { font-family:sans-serif; font-size:.7rem; letter-spacing:.2em; text-transform:uppercase; color:rgba(255,255,255,.55); margin-bottom:.6rem; }
        #sa-overlay .sa-dual-value { font-size:clamp(2.5rem, 6vw, 4rem); color:#f5e6b8; font-weight:400; letter-spacing:-.02em; }
        #sa-overlay .sa-dual-line { width:1px; height:60%; background:rgba(255,255,255,.15); }

        #sa-overlay .sa-podium { display:flex; flex-direction:column; gap:.6rem; max-width:560px; margin:0 auto; }
        #sa-overlay .sa-podium-item { display:flex; align-items:center; gap:.9rem; padding:.9rem 1.3rem; background:rgba(255,255,255,.06); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,.1); border-radius:14px; opacity:0; animation:sa-podium-in .8s ease forwards; font-family:Georgia,serif; }
        #sa-overlay .sa-podium-medal { font-size:1.5rem; }
        #sa-overlay .sa-podium-name { flex:1; text-align:left; font-size:1.1rem; color:#fff; }
        #sa-overlay .sa-podium-value { font-size:1.15rem; color:#f5e6b8; font-weight:500; }

        #sa-overlay .sa-final-icon { font-size:5rem; margin:1.5rem 0; }
        #sa-overlay .sa-final-btn { background:linear-gradient(135deg,#e8d9a8,#c9b280); color:#0a0800; border:none; padding:1.1rem 2.4rem; border-radius:32px; font-size:1.1rem; font-weight:600; cursor:pointer; font-family:sans-serif; letter-spacing:.02em; box-shadow:0 8px 30px rgba(0,0,0,.4); transition:transform .2s; }
        #sa-overlay .sa-final-btn:hover { transform:scale(1.03); }

        @keyframes sa-podium-in { from{opacity:0;transform:translateX(-30px)} to{opacity:1;transform:translateX(0)} }
      `;
      document.head.appendChild(st);
    }

    const ov = document.createElement('div');
    ov.id = 'sa-overlay';
    document.body.appendChild(ov);

    setTimeout(_startAudio, 400);

    function draw() {
      const slide = slides[current];
      ov.innerHTML =
        (isTest ? '<div class="sa-testbadge">🎬 Vorschau · nichts wird gespeichert</div>' : '') +
        '<div class="sa-topbar">' +
          '<button class="sa-topbtn" onclick="_saTogAudio()" title="Musik">🎵</button>' +
          '<button class="sa-topbtn" onclick="_saCloseOverlay()" title="Schließen">✕</button>' +
        '</div>' +
        _renderSlide(slide, current, slides.length, isTest) +
        '<div class="sa-navbar">' +
          '<button class="sa-navbtn" onclick="_saPrev()"' + (current === 0 ? ' disabled' : '') + '>◂</button>' +
          '<div class="sa-progress"><div class="sa-progress-fill" style="width:' + Math.round((current+1)/slides.length*100) + '%"></div></div>' +
          '<div class="sa-navcount">' + (current+1) + ' / ' + slides.length + '</div>' +
          '<button class="sa-navbtn" onclick="_saNext()"' + (current === slides.length-1 ? ' disabled' : '') + '>▸</button>' +
        '</div>';

      // Aktivieren nach reflow (für CSS-Transitions)
      requestAnimationFrame(() => {
        ov.querySelector('.sa-bg')?.classList.add('sa-active');
        ov.querySelector('.sa-content-inner')?.classList.add('sa-active');
      });
      // Count-Up-Animationen starten
      setTimeout(() => {
        ov.querySelectorAll('.sa-count').forEach(el => _startCountUp(el, parseInt(el.dataset.target) || 0, 1400));
      }, 400);
    }

    window._saNext = function() { if(current < slides.length-1) { current++; draw(); } };
    window._saPrev = function() { if(current > 0) { current--; draw(); } };
    window._saCloseOverlay = function() { _stopAudio(); ov.remove(); };

    // Keyboard Navigation
    ov.tabIndex = 0;
    ov.addEventListener('keydown', e => {
      if(e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); window._saNext(); }
      else if(e.key === 'ArrowLeft') { e.preventDefault(); window._saPrev(); }
      else if(e.key === 'Escape') window._saCloseOverlay();
    });
    setTimeout(() => ov.focus(), 100);

    draw();
  };

  window.saisonAbschlussEndgueltig = function() {
    if(!confirm('Saison wirklich abschließen?\n\nAlle Kühe werden auf „unten" gesetzt.\nDie Saison wird archiviert.\n\nDas kann nicht rückgängig gemacht werden.')) return;
    if(typeof window.saveSaisonArchiv === 'function') window.saveSaisonArchiv();
    else if(typeof window.saveAbtrieb === 'function') window.saveAbtrieb();
    else alert('Archiv-Funktion nicht gefunden.');
    document.getElementById('sa-overlay')?.remove();
    _stopAudio();
  };

  console.log('[SaisonAbschluss] v' + VERSION + ' geladen');
})();
