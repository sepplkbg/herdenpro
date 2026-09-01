// ══════════════════════════════════════════════════════════════════════════════
//  SAISON-ABSCHLUSS-SLIDESHOW
//  Vollbild-Slideshow mit Statistiken + sentimentalen Sprüchen.
//  Nur "Vorschau"-Modus verändert keine Daten. Regulärer Modus archiviert die
//  Saison + setzt Cleanup-Aktionen.
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '1.1';
  window.SAISON_ABSCHLUSS_VERSION = VERSION;

  // Sentimentale Sprüche — mit Platzhaltern für dynamische Werte
  // Werden mit data-Werten interpoliert ({kuh}, {weide}, {melker}, {alm}, {jahr}, {tage}, {rekordkuh}, {medikament})
  const SPRUECHE_TEMPLATES = [
    // Bergsprüche (klassisch sentimental)
    'Der Sommer geht — die Erinnerungen bleiben.',
    'Am Ende zählen nicht die Liter, sondern die Momente.',
    'Wer die Alm einmal erlebt hat, trägt sie für immer im Herzen.',
    'Die Kühe wissen den Weg — wir folgen nur.',
    'Zwischen Wiesen, Wolken und Wolldecken — hier bist du zuhause.',
    'Der Bergwind trägt, was wir nicht sagen.',
    'Was wir hier oben lernen, tragen wir für immer.',

    // Mit Alm-Name
    'Die {alm} ist mehr als ein Ort — sie ist eine Lebensart.',
    'Auf der {alm} vergeht die Zeit anders. Langsamer. Ehrlicher.',
    'Wenn die letzte Kuh die {alm} verlässt, bleibt eine Stille die nur wir verstehen.',
    'Die {alm} vergisst niemanden, der ihr Herz gegeben hat.',

    // Mit Kuh-Namen (Top-Kuh)
    'Wenn ich an {rekordkuh} denke, weiß ich wieder warum wir das tun.',
    '{rekordkuh} hat uns gezeigt was eine Kuh sein kann. Danke, alte Freundin.',
    'Sie hat einen Namen, ein Gesicht, eine Geschichte. {rekordkuh} — bis nächstes Jahr.',
    'Manche Kühe geben Milch. {rekordkuh} hat Geschichten geschenkt.',

    // Mit Weide-Name
    'Die Wiese auf {weide} wartet schon auf das nächste Jahr — und auf euch.',
    'Auf {weide} wächst das Gras noch, wenn wir längst wieder im Tal sind.',
    'Wenn im Frühling die {weide} wieder grünt, ruft sie leise unseren Namen.',

    // Mit Zahlen
    '{kuehe} Kühe. {tage} Tage. Ein Herz. Das ist die Alm.',
    '{tage} Sonnenaufgänge. {tage} Sonnenuntergänge. Kein einziger vergeudet.',
    '{kuehe} Herzen schlagen für die Alm. Deins schlägt am lautesten.',
    'Millionen Grashalme. {tage} Tage. Eine Familie.',

    // Melker-Namen
    'Ohne dich wäre die Alm nur ein Berg. Danke, {melker}.',
    '{melker}, du hast der Alm ihre Stimme gegeben — jeden Morgen, jeden Abend.',

    // Trost & Zuversicht (Lust auf nächste Saison)
    'Der Winter kommt. Aber der nächste Sommer auch. Und er wird noch schöner.',
    'Die Alm schläft nur. Sie wartet auf uns. Wie jedes Jahr.',
    'Jedes Kalb ist ein Versprechen für morgen. Wir sehen uns nächstes Jahr.',
    'Nimm ein Stück von uns mit ins Tal. Der Rest wartet hier auf dich.',
    'Der Duft der Bergblumen bleibt bis zum nächsten Frühling.',

    // Stolz & Anerkennung
    'Ihr habt {milch} Liter Milch gegeben. Jeder Tropfen ein Stück Alm.',
    '{behandlungen} mal habt ihr geholfen wo Hilfe nötig war. Das ist wahre Alpwirtschaft.',
    'Kein einziges Tier hier oben war je alleine. Das ist euer Verdienst.',
    'Es gibt Sommer, die vergisst man nicht. Dieser wird einer davon sein.',
    'Ihr seid die Hüter dieser Berge. Und die Berge wissen es.',

    // Ganz weich, ganz zart
    'Und dann kommt der Tag, an dem die Kuhglocken verstummen. Bis zum nächsten Jahr.',
    'Der letzte Melkgang. Der letzte Sonnenuntergang. Der erste Schritt Richtung Winter.',
    'Die Bergkette bleibt. Die Erinnerung auch. Und wir kommen wieder.'
  ];

  function _renderSpruch(template, data) {
    return template
      .replace(/\{alm\}/g, data.almName || 'Alm')
      .replace(/\{jahr\}/g, data.saisonJahr || '')
      .replace(/\{tage\}/g, data.alpungTage || '')
      .replace(/\{kuehe\}/g, data.kueheAlle || '')
      .replace(/\{milch\}/g, (data.milchGesamt || 0).toLocaleString('de-AT'))
      .replace(/\{behandlungen\}/g, data.behAnzahl || 0)
      .replace(/\{rekordkuh\}/g, data.top3Kuehe[0]?.kuh?.name || 'die Beste')
      .replace(/\{weide\}/g, data.topWeide?.[0] || 'der Alm')
      .replace(/\{melker\}/g, data.fleissigsterMelker?.[0] || 'ihr alle')
      .replace(/\{medikament\}/g, data.topDiagnosen[0]?.[0] || 'die Medikamente');
  }

  // Zufällige Auswahl von N Sprüchen, mit ersten den generischen bevorzugt
  function _selectSprueche(n, data) {
    const rendered = SPRUECHE_TEMPLATES
      .map(t => _renderSpruch(t, data))
      .filter(s => !s.includes('{'));  // Nur die wo Interpolation erfolgreich
    // Mische
    for(let i = rendered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rendered[i], rendered[j]] = [rendered[j], rendered[i]];
    }
    return rendered.slice(0, n);
  }

  // ── Daten für die Slides berechnen ──
  function _computeSaisonData() {
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

    // Alpungstage
    const alpungTage = saisonInfo?.auftriebDatum
      ? Math.floor((heute - saisonInfo.auftriebDatum)/86400000) + 1
      : Object.keys(milchEintraege).length > 0
        ? Math.floor((heute - Math.min(...Object.values(milchEintraege).map(m => m.datum || heute)))/86400000) + 1
        : 0;

    // Kühe / Bauern
    const kueheOben = Object.values(kuehe).filter(k => k.almStatus === 'oben').length;
    const kueheAlle = Object.keys(kuehe).length;
    const bauernAnzahl = Object.keys(bauern).length;

    // Milch — via Carry-Forward Helper
    const cfMilch = typeof window.computeCarryForwardGesamt === 'function'
      ? window.computeCarryForwardGesamt()
      : { gesamt: 0, morgen: 0, abend: 0, molkerei: 0, sennerei: 0, tage: 0 };

    // Rekord-Tagesmilch (höchster einzelner Tagestotal)
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

    // Top-3 Kühe (nach Gesamt-Milch aus prokuh)
    const kuhSum = {};
    Object.values(milchEintraege).forEach(m => {
      if(m.prokuh) Object.entries(m.prokuh).forEach(([kid, v]) => {
        kuhSum[kid] = (kuhSum[kid] || 0) + _mW(v);
      });
    });
    const top3Kuehe = Object.entries(kuhSum)
      .sort((a,b) => b[1] - a[1]).slice(0, 3)
      .map(([kid, l]) => ({ kuh: kuehe[kid], liter: Math.round(l) }));

    // Top-3 Bauern (nach Gesamt-Milch ihrer Kühe)
    const bauerSum = {};
    Object.entries(kuhSum).forEach(([kid, l]) => {
      const bauer = kuehe[kid]?.bauer || '–';
      bauerSum[bauer] = (bauerSum[bauer] || 0) + l;
    });
    const top3Bauern = Object.entries(bauerSum)
      .filter(([b]) => b && b !== '–')
      .sort((a,b) => b[1] - a[1]).slice(0, 3)
      .map(([name, l]) => ({ name, liter: Math.round(l) }));

    // Fleißigster Melker (Anzahl unique Milchmessungen)
    const melkerZahl = {};
    Object.values(milchEintraege).forEach(m => {
      if(!m.meta) return;
      Object.values(m.meta).forEach(mt => {
        const name = mt?.userName || '?';
        if(name && name !== '?') melkerZahl[name] = (melkerZahl[name] || 0) + 1;
      });
    });
    const fleissigsterMelker = Object.entries(melkerZahl).sort((a,b) => b[1] - a[1])[0];

    // Behandlungen
    const behListe = Object.values(behandlungen);
    const behAnzahl = behListe.length;
    const behDiagnosen = {};
    behListe.forEach(b => {
      const d = String(b.diagnose || 'Unbekannt').trim();
      behDiagnosen[d] = (behDiagnosen[d] || 0) + 1;
    });
    const topDiagnosen = Object.entries(behDiagnosen)
      .sort((a,b) => b[1] - a[1]).slice(0, 5);

    // Trockenstellungen (Behandlungen mit Diagnose "Trockenstellen")
    const trockenAnzahl = behListe.filter(b => /trockenstell|trocken stell|trockenlegen/i.test(b.diagnose || '')).length;

    // Kälber
    const bsListe = Object.values(besamungen);
    const kaelber = bsListe.filter(bs => bs.status === 'kalbung').length;
    const traechtig = bsListe.filter(bs => bs.status === 'tragend').length;
    const besamungAnzahl = bsListe.length;

    // Weide
    const wtListe = Object.values(weideTage);
    const wechselAnzahl = wtListe.length;
    const proWeide = {};
    wtListe.forEach(w => {
      const wid = w.weideId || '__text__';
      const name = wid === '__text__' ? (w.weideText || 'Freitext') : (weiden[wid]?.name || '?');
      proWeide[name] = (proWeide[name] || 0) + 1;
    });
    const topWeide = Object.entries(proWeide).sort((a,b) => b[1] - a[1])[0];

    // Klauenpflege
    const klauenAnzahl = Object.keys(window.klauenpflege || {}).length;

    // Sennerei (letzte Woche)
    const sennereiWochen = window._sennereiWochenCache || [];  // fallback wenn nicht geladen

    return {
      alpungTage,
      kueheOben, kueheAlle, bauernAnzahl,
      milchGesamt: cfMilch.gesamt,
      milchMorgen: cfMilch.morgen,
      milchAbend: cfMilch.abend,
      milchMolkerei: cfMilch.molkerei,
      milchSennerei: cfMilch.sennerei,
      rekordTag, rekordL: Math.round(rekordL),
      top3Kuehe, top3Bauern,
      fleissigsterMelker,
      behAnzahl, topDiagnosen, trockenAnzahl,
      kaelber, traechtig, besamungAnzahl,
      wechselAnzahl, topWeide, klauenAnzahl,
      saisonJahr: saisonInfo?.jahr || new Date().getFullYear(),
      almName: saisonInfo?.alm || 'Alm'
    };
  }

  // ── Slide-Definitionen ──
  function _buildSlides(data, isTest) {
    const s = [];
    // Slide 1: Titelbild
    s.push({
      type: 'title',
      icon: '🏔',
      title: 'Saison ' + data.saisonJahr,
      subtitle: data.almName,
      big: 'Ein Sommer geht zu Ende.'
    });
    // Spruch
    s.push({ type: 'spruch', text: '__PICK__' });
    // Alpungstage
    s.push({
      type: 'zahl', icon: '📅', label: 'Tage auf der Alm',
      zahl: data.alpungTage, einheit: 'Tage',
      subtitle: 'von Auftrieb bis heute'
    });
    // Kühe
    s.push({
      type: 'zahl', icon: '🐄', label: 'Kühe',
      zahl: data.kueheAlle, einheit: 'Tiere',
      subtitle: (data.kueheOben > 0 ? data.kueheOben + ' aktuell noch oben' : 'alle bereits abgetrieben')
    });
    // Bauern
    s.push({
      type: 'zahl', icon: '👥', label: 'Bauern',
      zahl: data.bauernAnzahl, einheit: 'Betriebe',
      subtitle: 'die dir ihre Tiere anvertraut haben'
    });
    // Spruch
    s.push({ type: 'spruch', text: '__PICK__' });
    // Milch total (Highlight)
    s.push({
      type: 'zahl-big', icon: '🥛', label: 'Milch gesamt',
      zahl: data.milchGesamt, einheit: 'Liter',
      subtitle: 'in dieser Saison',
      farbe: 'var(--gold)'
    });
    // Milch morgen/abend
    s.push({
      type: 'zwei-zahlen', icon: '🌅🌇', label: 'Milchmengen',
      links: { label: 'Morgens', wert: data.milchMorgen + ' L' },
      rechts: { label: 'Abends', wert: data.milchAbend + ' L' }
    });
    // Rekord-Tag
    if(data.rekordTag) {
      s.push({
        type: 'rekord', icon: '🏆', label: 'Rekord-Tag',
        big: data.rekordL + ' L',
        subtitle: 'am ' + new Date(data.rekordTag + 'T12:00').toLocaleDateString('de-AT', {weekday:'long', day:'numeric', month:'long'})
      });
    }
    // Spruch
    s.push({ type: 'spruch', text: '__PICK__' });
    // Top-3 Kühe
    if(data.top3Kuehe.length > 0) {
      s.push({
        type: 'top3', icon: '👑', label: 'Top 3 Milch-Königinnen',
        items: data.top3Kuehe.map(k => ({
          name: '#' + (k.kuh?.nr||'?') + ' ' + (k.kuh?.name||''),
          wert: k.liter + ' L'
        }))
      });
    }
    // Top-3 Bauern
    if(data.top3Bauern.length > 0) {
      s.push({
        type: 'top3', icon: '🏅', label: 'Top 3 Bauern nach Milch',
        items: data.top3Bauern.map(b => ({ name: b.name, wert: b.liter + ' L' }))
      });
    }
    // Fleißigster Melker
    if(data.fleissigsterMelker) {
      s.push({
        type: 'rekord', icon: '💪', label: 'Fleißigster Melker',
        big: data.fleissigsterMelker[0],
        subtitle: data.fleissigsterMelker[1] + ' Milchmessungen'
      });
    }
    // Spruch
    s.push({ type: 'spruch', text: '__PICK__' });
    // Behandlungen
    s.push({
      type: 'zahl', icon: '⚕', label: 'Behandlungen',
      zahl: data.behAnzahl, einheit: '',
      subtitle: data.trockenAnzahl > 0 ? 'davon ' + data.trockenAnzahl + ' Trockenstellungen' : 'keine Trockenstellungen'
    });
    // Top-Diagnosen
    if(data.topDiagnosen.length > 0) {
      s.push({
        type: 'liste', icon: '🩺', label: 'Häufigste Diagnosen',
        items: data.topDiagnosen.map(([diag, n]) => ({ name: diag, wert: n + '×' }))
      });
    }
    // Klauen
    if(data.klauenAnzahl > 0) {
      s.push({
        type: 'zahl', icon: '🐾', label: 'Klauenpflegen',
        zahl: data.klauenAnzahl, einheit: '',
        subtitle: 'für gesunde Kuhklauen'
      });
    }
    // Spruch
    s.push({ type: 'spruch', text: '__PICK__' });
    // Kälber
    if(data.kaelber > 0) {
      s.push({
        type: 'zahl', icon: '🐮', label: 'Neue Leben',
        zahl: data.kaelber, einheit: 'Kälber',
        subtitle: 'im Sommer geboren'
      });
    }
    // Trächtige
    if(data.traechtig > 0) {
      s.push({
        type: 'zahl', icon: '🌱', label: 'Trächtige Kühe',
        zahl: data.traechtig, einheit: '',
        subtitle: 'tragen den Frühling in sich'
      });
    }
    // Spruch
    s.push({ type: 'spruch', text: '__PICK__' });
    // Weidewechsel
    if(data.wechselAnzahl > 0) {
      s.push({
        type: 'zahl', icon: '🌿', label: 'Weidewechsel',
        zahl: data.wechselAnzahl, einheit: '',
        subtitle: data.topWeide ? 'Am meisten: ' + data.topWeide[0] : ''
      });
    }
    // Sennerei
    if(data.milchMolkerei > 0 || data.milchSennerei > 0) {
      s.push({
        type: 'zwei-zahlen', icon: '🏭🧀', label: 'Verwendung der Milch',
        links: { label: 'An Molkerei', wert: data.milchMolkerei + ' L' },
        rechts: { label: 'An Sennerei', wert: data.milchSennerei + ' L' }
      });
    }
    // Spruch
    s.push({ type: 'spruch', text: '__PICK__' });
    // Danke
    s.push({
      type: 'title', icon: '💚',
      title: 'Danke, ' + (window._currentUser?.email?.split('@')[0] || 'Bauer'),
      subtitle: 'für die vielen fleißigen Stunden',
      big: 'Ohne dich wäre die Alm nur ein Berg.'
    });
    // Spruch
    s.push({ type: 'spruch', text: '__PICK__' });
    // Cleanup-Warnung wenn pending
    const pending = typeof window.getMilchPendingCount === 'function' ? window.getMilchPendingCount() : 0;
    if(pending > 0) {
      s.push({
        type: 'warnung', icon: '⚠', label: 'Achtung!',
        text: pending + ' Milchwerte sind noch nicht am Server bestätigt.\nBitte vor dem endgültigen Abschluss synchronisieren.'
      });
    }
    // Abschluss
    s.push({
      type: 'final', icon: '🏔',
      title: isTest ? 'Ende der Vorschau' : 'Bereit für den Abschluss?',
      subtitle: isTest ? 'Die Saison bleibt aktiv.' : 'Klicke unten um die Saison offiziell zu archivieren.',
      isTest: isTest
    });
    // __PICK__-Platzhalter durch zufällige gerenderte Sprüche ersetzen
    const spruchAnzahl = s.filter(sl => sl.type === 'spruch' && sl.text === '__PICK__').length;
    const gewaehlt = _selectSprueche(spruchAnzahl, data);
    let pickIdx = 0;
    s.forEach(sl => {
      if(sl.type === 'spruch' && sl.text === '__PICK__') {
        sl.text = gewaehlt[pickIdx++] || 'Die Alm dankt dir.';
      }
    });
    return s;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AMBIENT-MUSIK via Web Audio API
  // Sanfte Drone-Töne + zufällige Kuhglocken für sentimentale Atmosphäre
  // Auto-Play erlaubt nach User-Klick (Vorschau-Button gilt als Interaktion)
  // ══════════════════════════════════════════════════════════════════════════
  let _audioCtx = null;
  let _audioNodes = [];
  let _audioActive = false;

  function _startAmbient() {
    if(_audioActive) return;
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      _audioActive = true;

      // Master gain für sanften Fade-In
      const master = _audioCtx.createGain();
      master.gain.setValueAtTime(0, _audioCtx.currentTime);
      master.gain.linearRampToValueAtTime(0.15, _audioCtx.currentTime + 3); // 3s Fade-In
      master.connect(_audioCtx.destination);

      // Reverb via ConvolverNode-Simulation mit LowPass + Delay
      const filter = _audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      filter.Q.value = 1;
      filter.connect(master);

      // Grundton-Drones (Dur-Terz-Quinte in tiefen Oktaven — sehr warm)
      const grundToene = [110, 138.6, 164.8]; // A2, C#3, E3 (A-Dur, warm)
      grundToene.forEach((freq, i) => {
        const osc = _audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = _audioCtx.createGain();
        g.gain.value = 0.3;
        osc.connect(g);
        g.connect(filter);
        osc.start();
        _audioNodes.push({osc, g});
      });

      // Höhere Textur-Töne die sanft ein-/ausblenden
      const luftFreq = [440, 554.4, 659.3]; // A4, C#5, E5
      luftFreq.forEach((freq, i) => {
        const osc = _audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = _audioCtx.createGain();
        g.gain.value = 0;
        // Sinus-artige Modulation für "atmende" Lautstärke
        const lfo = _audioCtx.createOscillator();
        lfo.frequency.value = 0.05 + i * 0.03;
        const lfoGain = _audioCtx.createGain();
        lfoGain.gain.value = 0.08;
        lfo.connect(lfoGain);
        lfoGain.connect(g.gain);
        osc.connect(g);
        g.connect(filter);
        osc.start(); lfo.start();
        _audioNodes.push({osc, g, lfo, lfoGain});
      });

      // Gelegentliche Kuhglocken (alle 8-15 Sekunden)
      const glocke = () => {
        if(!_audioActive) return;
        const t = _audioCtx.currentTime;
        // Glockenton — kurze abklingende hohe Frequenz mit Obertönen
        [880, 1320, 1760].forEach((f, i) => {
          const o = _audioCtx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = f + (Math.random() * 20 - 10);
          const gg = _audioCtx.createGain();
          gg.gain.setValueAtTime(0, t);
          gg.gain.linearRampToValueAtTime(0.05 / (i+1), t + 0.02);
          gg.gain.exponentialRampToValueAtTime(0.0001, t + 2 + i * 0.5);
          o.connect(gg);
          gg.connect(filter);
          o.start(t);
          o.stop(t + 3);
        });
        setTimeout(glocke, 8000 + Math.random() * 7000);
      };
      setTimeout(glocke, 3000);

      console.log('[SaisonAbschluss] Ambient-Musik läuft');
    } catch(e) {
      console.warn('[SaisonAbschluss] Web Audio nicht verfügbar:', e);
    }
  }

  function _stopAmbient() {
    if(!_audioActive || !_audioCtx) return;
    try {
      const t = _audioCtx.currentTime;
      _audioNodes.forEach(n => {
        try {
          if(n.g && n.g.gain) {
            n.g.gain.cancelScheduledValues(t);
            n.g.gain.linearRampToValueAtTime(0, t + 1);
          }
          if(n.osc) n.osc.stop(t + 1.2);
          if(n.lfo) n.lfo.stop(t + 1.2);
        } catch(e) {}
      });
      setTimeout(() => { try { _audioCtx.close(); } catch(e) {} _audioCtx = null; _audioNodes = []; _audioActive = false; }, 1500);
    } catch(e) { _audioActive = false; }
  }
  window._saisonAbschlussStartAudio = _startAmbient;
  window._saisonAbschlussStopAudio = _stopAmbient;
  window._saisonAbschlussToggleMusik = function() {
    if(_audioActive) _stopAmbient();
    else _startAmbient();
  };

  // ── Rendering ──
  function _renderSlide(slide, isTest, current, total) {
    const testBadge = isTest ? '<div style="position:absolute;top:1rem;left:50%;transform:translateX(-50%);background:#c8003c;color:#fff;padding:.3rem .8rem;border-radius:20px;font-size:.7rem;font-weight:700;letter-spacing:.05em;z-index:20">🎬 VORSCHAU · NICHTS WIRD GESPEICHERT</div>' : '';
    let body = '';
    switch(slide.type) {
      case 'title':
        body = `
          <div style="font-size:5rem;margin-bottom:1rem;animation:sa-pop .6s ease-out">${slide.icon||''}</div>
          <div style="font-size:2.5rem;font-weight:700;color:var(--gold);margin-bottom:.5rem;animation:sa-fade .8s ease-out">${slide.title||''}</div>
          ${slide.subtitle ? '<div style="font-size:1.2rem;color:var(--text2);margin-bottom:1.5rem;animation:sa-fade 1.2s ease-out">' + slide.subtitle + '</div>' : ''}
          ${slide.big ? '<div style="font-size:1.4rem;color:var(--gold);font-style:italic;line-height:1.5;max-width:600px;margin:0 auto;animation:sa-fade 1.6s ease-out">' + slide.big + '</div>' : ''}
        `;
        break;
      case 'spruch':
        body = `
          <div style="font-size:2.5rem;color:var(--gold);opacity:.4;margin-bottom:1.5rem;animation:sa-fade 1s">"</div>
          <div style="font-size:1.6rem;color:#f5e6b8;font-style:italic;line-height:1.5;max-width:700px;margin:0 auto;letter-spacing:.02em;animation:sa-fade 1.5s">${slide.text}</div>
          <div style="font-size:2.5rem;color:var(--gold);opacity:.4;margin-top:1.5rem;transform:rotate(180deg);animation:sa-fade 2s">"</div>
        `;
        break;
      case 'zahl':
        body = `
          <div style="font-size:4rem;margin-bottom:.5rem;animation:sa-pop .6s">${slide.icon||''}</div>
          <div style="font-size:.9rem;color:var(--text3);letter-spacing:.15em;text-transform:uppercase;margin-bottom:.5rem;animation:sa-fade 1s">${slide.label}</div>
          <div style="font-size:6rem;font-weight:800;color:var(--gold);line-height:1;margin-bottom:.5rem;animation:sa-pop 1s cubic-bezier(.16,1,.3,1)">${slide.zahl}${slide.einheit ? '<span style="font-size:2rem;color:var(--text2);margin-left:.3rem">' + slide.einheit + '</span>' : ''}</div>
          ${slide.subtitle ? '<div style="font-size:1rem;color:var(--text2);animation:sa-fade 1.4s">' + slide.subtitle + '</div>' : ''}
        `;
        break;
      case 'zahl-big':
        body = `
          <div style="font-size:5rem;margin-bottom:.5rem;animation:sa-pop .6s">${slide.icon||''}</div>
          <div style="font-size:.9rem;color:var(--text3);letter-spacing:.15em;text-transform:uppercase;margin-bottom:.5rem;animation:sa-fade 1s">${slide.label}</div>
          <div style="font-size:8rem;font-weight:800;color:${slide.farbe||'var(--gold)'};line-height:1;margin-bottom:.5rem;text-shadow:0 0 40px rgba(212,168,75,.5);animation:sa-pop 1s cubic-bezier(.16,1,.3,1)">${slide.zahl}<span style="font-size:2.5rem;color:var(--text2);margin-left:.4rem">${slide.einheit||''}</span></div>
          ${slide.subtitle ? '<div style="font-size:1.1rem;color:var(--text2);animation:sa-fade 1.4s">' + slide.subtitle + '</div>' : ''}
        `;
        break;
      case 'zwei-zahlen':
        body = `
          <div style="font-size:3.5rem;margin-bottom:.5rem;animation:sa-pop .6s">${slide.icon||''}</div>
          <div style="font-size:.9rem;color:var(--text3);letter-spacing:.15em;text-transform:uppercase;margin-bottom:1rem;animation:sa-fade 1s">${slide.label}</div>
          <div style="display:flex;justify-content:center;gap:3rem;animation:sa-fade 1.2s">
            <div>
              <div style="font-size:3rem;font-weight:800;color:var(--gold)">${slide.links.wert}</div>
              <div style="color:var(--text3);margin-top:.3rem">${slide.links.label}</div>
            </div>
            <div style="width:1px;background:var(--border)"></div>
            <div>
              <div style="font-size:3rem;font-weight:800;color:var(--gold)">${slide.rechts.wert}</div>
              <div style="color:var(--text3);margin-top:.3rem">${slide.rechts.label}</div>
            </div>
          </div>
        `;
        break;
      case 'rekord':
        body = `
          <div style="font-size:4rem;margin-bottom:.5rem;animation:sa-pop .6s">${slide.icon||''}</div>
          <div style="font-size:.9rem;color:var(--text3);letter-spacing:.15em;text-transform:uppercase;margin-bottom:.5rem;animation:sa-fade 1s">${slide.label}</div>
          <div style="font-size:4rem;font-weight:800;color:var(--gold);line-height:1.1;margin-bottom:.5rem;animation:sa-pop 1s">${slide.big}</div>
          ${slide.subtitle ? '<div style="font-size:1.1rem;color:var(--text2);animation:sa-fade 1.4s">' + slide.subtitle + '</div>' : ''}
        `;
        break;
      case 'top3':
        body = `
          <div style="font-size:3.5rem;margin-bottom:.5rem;animation:sa-pop .6s">${slide.icon||''}</div>
          <div style="font-size:.9rem;color:var(--text3);letter-spacing:.15em;text-transform:uppercase;margin-bottom:1.2rem;animation:sa-fade 1s">${slide.label}</div>
          <div style="max-width:500px;margin:0 auto">
            ${slide.items.map((it,i) => {
              const medaille = ['🥇','🥈','🥉'][i] || '';
              const delay = 1 + i * 0.3;
              return '<div style="display:flex;justify-content:space-between;align-items:center;padding:.7rem 1rem;background:rgba(212,168,75,.08);border:1px solid rgba(212,168,75,.25);border-radius:12px;margin-bottom:.4rem;animation:sa-slidein '+delay+'s ease-out both">' +
                '<span style="font-size:1.5rem">'+medaille+'</span>' +
                '<span style="flex:1;text-align:left;padding-left:.8rem;font-size:1.05rem;color:var(--text)">'+it.name+'</span>' +
                '<span style="font-size:1.1rem;font-weight:700;color:var(--gold)">'+it.wert+'</span>' +
              '</div>';
            }).join('')}
          </div>
        `;
        break;
      case 'liste':
        body = `
          <div style="font-size:3.5rem;margin-bottom:.5rem;animation:sa-pop .6s">${slide.icon||''}</div>
          <div style="font-size:.9rem;color:var(--text3);letter-spacing:.15em;text-transform:uppercase;margin-bottom:1.2rem;animation:sa-fade 1s">${slide.label}</div>
          <div style="max-width:500px;margin:0 auto">
            ${slide.items.map((it,i) => '<div style="display:flex;justify-content:space-between;padding:.5rem .8rem;border-bottom:1px solid var(--border);font-size:1rem;animation:sa-fade '+(1+i*0.15)+'s">' +
              '<span style="color:var(--text)">'+it.name+'</span>' +
              '<span style="color:var(--gold);font-weight:600">'+it.wert+'</span>' +
            '</div>').join('')}
          </div>
        `;
        break;
      case 'warnung':
        body = `
          <div style="font-size:5rem;margin-bottom:.5rem;color:#ff9632;animation:sa-pop .6s">${slide.icon||''}</div>
          <div style="font-size:1.5rem;font-weight:700;color:#ff9632;margin-bottom:1rem;animation:sa-fade 1s">${slide.label}</div>
          <div style="font-size:1.1rem;color:var(--text);max-width:500px;margin:0 auto;line-height:1.5;white-space:pre-wrap;animation:sa-fade 1.4s">${slide.text}</div>
        `;
        break;
      case 'final':
        body = `
          <div style="font-size:5rem;margin-bottom:1rem;animation:sa-pop .6s">${slide.icon||''}</div>
          <div style="font-size:2rem;font-weight:700;color:var(--gold);margin-bottom:.5rem;animation:sa-fade 1s">${slide.title}</div>
          <div style="font-size:1.1rem;color:var(--text2);margin-bottom:2rem;animation:sa-fade 1.4s">${slide.subtitle||''}</div>
          ${!slide.isTest ? '<button onclick="saisonAbschlussEndgueltig()" style="background:var(--gold);color:#0a0800;border:none;padding:1rem 2rem;border-radius:14px;font-size:1.1rem;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(212,168,75,.4);animation:sa-pop 1.8s">🏔 Saison offiziell abschließen</button>' : '<div style="color:var(--text3);font-style:italic">Dies ist nur eine Vorschau.</div>'}
        `;
        break;
    }
    return `
      <div style="position:relative;width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:2rem;box-sizing:border-box">
        ${testBadge}
        <div style="max-width:800px;width:100%">${body}</div>
      </div>
    `;
  }

  // ── Hauptfunktion ──
  window.zeigeSaisonAbschluss = function(isTest) {
    isTest = !!isTest;
    // Alte Instanz löschen
    const alt = document.getElementById('saison-abschluss-overlay');
    if(alt) alt.remove();
    _stopAmbient(); // falls schon läuft

    const data = _computeSaisonData();
    const slides = _buildSlides(data, isTest);
    let current = 0;

    // Ambient-Musik starten (User-Klick auf Vorschau-Button zählt als Interaktion → autoplay OK)
    setTimeout(_startAmbient, 300);

    const ov = document.createElement('div');
    ov.id = 'saison-abschluss-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:linear-gradient(160deg,#0a1a04 0%,#1a3a0a 50%,#0d2e03 100%);color:var(--text);display:flex;flex-direction:column;overflow:hidden';

    // CSS für Animationen
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      @keyframes sa-pop { from{opacity:0;transform:scale(.8)} to{opacity:1;transform:scale(1)} }
      @keyframes sa-fade { from{opacity:0} to{opacity:1} }
      @keyframes sa-slidein { from{opacity:0;transform:translateX(-30px)} to{opacity:1;transform:translateX(0)} }
      #sa-slide-content { animation: sa-fade .4s ease-out; }
    `;
    ov.appendChild(styleEl);

    function drawFrame() {
      ov.innerHTML =
        styleEl.outerHTML +
        // Close-Button
        '<button onclick="_saisonAbschlussToggleMusik()" title="Musik an/aus" style="position:absolute;top:1rem;right:4rem;background:rgba(255,255,255,.1);color:#fff;border:none;width:40px;height:40px;border-radius:50%;font-size:1.1rem;cursor:pointer;z-index:20">🎵</button>' +
        '<button onclick="_saisonAbschlussStopAudio();document.getElementById(\'saison-abschluss-overlay\').remove()" style="position:absolute;top:1rem;right:1rem;background:rgba(255,255,255,.1);color:#fff;border:none;width:40px;height:40px;border-radius:50%;font-size:1.3rem;cursor:pointer;z-index:20">✕</button>' +
        // Slide-Content
        '<div id="sa-slide-content" style="flex:1;overflow-y:auto">' + _renderSlide(slides[current], isTest, current, slides.length) + '</div>' +
        // Fortschritts-Punkte
        '<div style="display:flex;justify-content:center;gap:.3rem;padding:.5rem">' +
          slides.map((_, i) => '<div style="width:8px;height:8px;border-radius:50%;background:' + (i === current ? 'var(--gold)' : 'rgba(255,255,255,.2)') + ';transition:all .3s' + (i === current ? ';transform:scale(1.4)' : '') + '"></div>').join('') +
        '</div>' +
        // Navigation
        '<div style="display:flex;gap:.5rem;padding:1rem;background:rgba(0,0,0,.3)">' +
          '<button onclick="_saisonAbschlussPrev()" style="flex:1;background:var(--bg3);color:var(--text);border:1px solid var(--border);padding:.8rem;border-radius:10px;font-size:1rem;cursor:pointer' + (current === 0 ? ';opacity:.3' : '') + '"' + (current === 0 ? ' disabled' : '') + '>◂ Zurück</button>' +
          '<div style="flex:0 0 auto;padding:.8rem;color:var(--text3);font-size:.85rem;align-self:center">' + (current + 1) + ' / ' + slides.length + '</div>' +
          '<button onclick="_saisonAbschlussNext()" style="flex:1;background:var(--gold);color:#0a0800;border:none;padding:.8rem;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer' + (current === slides.length - 1 ? ';opacity:.3' : '') + '"' + (current === slides.length - 1 ? ' disabled' : '') + '>Weiter ▸</button>' +
        '</div>';
      // Style-Element nach dem Rewrite neu appenden
      const s = document.createElement('style');
      s.textContent = styleEl.textContent;
      ov.appendChild(s);
    }

    window._saisonAbschlussNext = function() {
      if(current < slides.length - 1) { current++; drawFrame(); }
    };
    window._saisonAbschlussPrev = function() {
      if(current > 0) { current--; drawFrame(); }
    };

    drawFrame();
    document.body.appendChild(ov);
  };

  // Endgültiger Abschluss (nur wenn nicht im Test-Modus)
  window.saisonAbschlussEndgueltig = function() {
    if(!confirm('Saison wirklich abschließen?\n\nAlle Kühe werden auf almStatus „unten" gesetzt.\nDie Saison wird archiviert.\n\nDas kann nicht rückgängig gemacht werden.')) return;
    if(typeof window.saveSaisonArchiv === 'function') {
      window.saveSaisonArchiv();
    } else if(typeof window.saveAbtrieb === 'function') {
      window.saveAbtrieb();
    } else {
      alert('Archiv-Funktion nicht gefunden. Bitte manuell im Saison-Blatt abschließen.');
    }
    document.getElementById('saison-abschluss-overlay')?.remove();
  };

  console.log('[Saison-Abschluss] Modul geladen v' + VERSION);
})();
