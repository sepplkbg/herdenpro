// HerdenPro – modulare Zerlegung – TEIL 1: Core (Firebase, State, Init, Navigation, Render Router, Milch-Chart). Reihenfolge in index.html: app-core.js → app-views.js → app-features.js
// Klassische Scripts (kein type=module): teilen sich denselben globalen Lexical Environment.

// HerdenPro – extrahiertes Hauptskript (vormals inline in index.html, Zeilen 1203–12993)
// Backup der alten app.js liegt unter app.js.legacy.bak


// Firebase compat wrappers
var db_instance = null;
function getDb() { return db_instance || firebase.database(); }
function ref(db, path) { 
  if(typeof path === 'undefined') { path = db; return firebase.database().ref(path); }
  return firebase.database().ref(path); 
}
function onValue(refObj, callback, errCallback) {
  refObj.on('value', function(snap) { callback(snap); }, errCallback||function(){});
}
function set(refObj, val) { return refObj.set(val); }
function update(refObj, val) { return refObj.update(val); }
function remove(refObj) { return refObj.remove(); }
function push(refObj, val) { return refObj.push(val); }
function serverTimestamp() { return firebase.database.ServerValue.TIMESTAMP; }

// ── parseFloat: Komma als Dezimaltrennzeichen akzeptieren ────────────────────
// Wrapped die globale parseFloat damit "3,14" und "3.14" beide funktionieren.
// Berührt nur Strings — bei Zahlen-Args bleibt das Verhalten identisch.
(function(){
  var origParseFloat = window.parseFloat;
  window.parseFloat = function(s) {
    if(typeof s === 'string') s = s.replace(',', '.');
    return origParseFloat(s);
  };
  // Number.parseFloat zeigt auf dieselbe Funktion in modernen Browsern, aber
  // sicherheitshalber explizit überschreiben:
  if(Number && Number.parseFloat !== window.parseFloat) Number.parseFloat = window.parseFloat;
})();

// ── Bottom-Sheet-System (Phase B4) ────────────────────────────────────────────
// markBottomSheet(overlayId) markiert ein vorhandenes form-overlay als Bottom-Sheet.
// Wird einmal pro Overlay aufgerufen. Drag-Handler wird automatisch aktiviert.
window.markBottomSheet = function(overlayId) {
  var ov = document.getElementById(overlayId);
  if(!ov || ov.classList.contains('bottom-sheet')) return;
  ov.classList.add('bottom-sheet');

  // Swipe-down-dismiss am Header
  var sheet = ov.querySelector('.form-sheet');
  if(!sheet) return;
  var header = sheet.querySelector('.form-header') || sheet;
  var startY = 0, dy = 0, dragging = false;

  function onStart(e) {
    if(sheet.scrollTop > 2) return; // nur am oberen Rand erlauben
    var t = e.touches ? e.touches[0] : e;
    startY = t.clientY; dy = 0; dragging = true;
    ov.classList.add('dragging');
  }
  function onMove(e) {
    if(!dragging) return;
    var t = e.touches ? e.touches[0] : e;
    dy = Math.max(0, t.clientY - startY);
    sheet.style.transform = 'translateY('+dy+'px)';
  }
  function onEnd() {
    if(!dragging) return;
    dragging = false;
    ov.classList.remove('dragging');
    if(dy > 80) {
      // dismiss
      sheet.style.transform = 'translateY(100%)';
      setTimeout(function(){
        ov.style.display = 'none';
        sheet.style.transform = '';
      }, 220);
    } else {
      sheet.style.transform = '';
    }
    dy = 0;
  }
  header.addEventListener('touchstart', onStart, {passive:true});
  header.addEventListener('touchmove',  onMove,  {passive:true});
  header.addEventListener('touchend',   onEnd,   {passive:true});

  // Tap auf Backdrop schließt
  ov.addEventListener('click', function(e){
    if(e.target === ov) {
      ov.style.display = 'none';
    }
  });
};
// Bei jedem render() automatisch alle markierten Overlays aktivieren.
// Liste der "kurzen" Forms die als Bottom-Sheet erscheinen (≤5 Felder).
// Lange Forms (Behandlung, Besamung, Kuh, Saisonstart, Wartung-Maschine,
// Lager-Artikel etc.) bleiben Fullscreen.
window._bottomSheetIds = [
  'milch-form-overlay',
  'sp-stall-overlay',
  'sp-kuh-overlay',
  'traenke-overlay',
  'klauen-overlay',
  'kf-vorrat-overlay',
  'kf-lieferung-overlay',
  'gruppe-overlay',
  'kalender-overlay',
  'aufgabe-overlay',
  'abtrieb-overlay',
  'lager-verbrauch-overlay',
  'lager-zugang-overlay',
  'kontakt-overlay'
];
window.applyBottomSheets = function() {
  (window._bottomSheetIds || []).forEach(function(id){
    if(document.getElementById(id)) window.markBottomSheet(id);
  });
};

// ── Pull-to-Refresh (Phase B6) ────────────────────────────────────────────────
// Auf bestimmten Views: bei scrollTop=0 + finger pull-down zeigt sich ein
// Refresh-Indikator. Wenn weit genug gezogen → render() wird neu gefeuert.
window._ptrEnabledViews = ['dashboard','herde','behandlung','bestandsbuch','wetter'];
(function setupPullToRefresh(){
  if(window._ptrInstalled) return;
  window._ptrInstalled = true;
  var startY = 0, currentY = 0, pulling = false, fired = false;
  var THRESHOLD = 70; // px

  // Indikator-Element on demand erzeugen
  function getIndicator() {
    var ind = document.getElementById('ptr-indicator');
    if(!ind) {
      ind = document.createElement('div');
      ind.id = 'ptr-indicator';
      ind.style.cssText = 'position:absolute;top:0;left:50%;transform:translate(-50%,-100%);background:var(--gold);color:#000;font-size:.78rem;font-weight:bold;padding:6px 14px;border-radius:0 0 14px 14px;z-index:60;transition:transform .2s ease,opacity .2s ease;pointer-events:none;opacity:0;box-shadow:0 4px 14px rgba(0,0,0,.4)';
      ind.textContent = '↓ Ziehen zum Aktualisieren';
      document.body.appendChild(ind);
    }
    return ind;
  }

  function activeView() { return window.currentView || (document.body && document.body.getAttribute('data-view')); }
  function isAllowed() {
    var v = activeView();
    return window._ptrEnabledViews.indexOf(v) >= 0;
  }

  document.addEventListener('touchstart', function(e){
    if(!isAllowed()) return;
    var main = document.getElementById('main-content');
    if(!main || main.scrollTop > 2) return;
    if(e.touches.length !== 1) return;
    startY = e.touches[0].clientY;
    pulling = true; fired = false;
  }, {passive:true});

  document.addEventListener('touchmove', function(e){
    if(!pulling) return;
    currentY = e.touches[0].clientY;
    var dy = currentY - startY;
    if(dy <= 0) return;
    var ind = getIndicator();
    var prog = Math.min(1, dy / THRESHOLD);
    ind.style.opacity = String(prog);
    ind.style.transform = 'translate(-50%,'+(Math.min(dy*0.6, 50))+'px)';
    if(dy >= THRESHOLD && !fired) {
      ind.textContent = '↻ Loslassen…';
      ind.style.background = 'var(--green)';
    } else if(dy < THRESHOLD) {
      ind.textContent = '↓ Ziehen zum Aktualisieren';
      ind.style.background = 'var(--gold)';
    }
  }, {passive:true});

  document.addEventListener('touchend', function(){
    if(!pulling) return;
    var dy = currentY - startY;
    var ind = getIndicator();
    if(dy >= THRESHOLD && !fired) {
      fired = true;
      ind.textContent = '✓ Aktualisiert';
      ind.style.background = 'var(--green)';
      if(typeof window.haptic==='function') window.haptic('save');
      try { if(typeof render==='function') render(); } catch(e){ console.warn(e); }
      setTimeout(function(){
        ind.style.opacity='0';
        ind.style.transform='translate(-50%,-100%)';
      }, 600);
    } else {
      ind.style.opacity='0';
      ind.style.transform='translate(-50%,-100%)';
    }
    pulling = false;
    startY = 0; currentY = 0;
  }, {passive:true});
})();

// ── Haptic-Feedback (Phase B7) ───────────────────────────────────────────────
// Aufruf z.B. window.haptic('save') – führt navigator.vibrate aus, wenn vorhanden.
// Settings können mit localStorage 'hapticOff'='1' deaktiviert werden.
window.haptic = function(typ) {
  try {
    if(localStorage.getItem('hapticOff') === '1') return;
    if(!navigator.vibrate) return;
    var pattern;
    switch(typ) {
      case 'tap':    pattern = 5;          break;  // ganz leichter Touch
      case 'save':   pattern = 12;         break;  // erfolgreiches Speichern
      case 'success':pattern = [10,60,30]; break;  // mehrfacher Erfolg/Abschluss
      case 'delete': pattern = [15,40,15]; break;  // Doppel-Tick
      case 'warn':   pattern = 50;         break;  // einmaliger Warnungs-Buzz
      case 'alarm':  pattern = [200,80,200];break; // Wartezeit-Alarm
      default:       pattern = 8;
    }
    navigator.vibrate(pattern);
  } catch(e) { /* iOS Safari etc. – ignore */ }
};


// ── app.js – HerdenPro v2 · Alm-Edition ──────────────────────────────────────




// ══════════════════════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════════════════════
let db;
let kuehe={}, behandlungen={}, besamungen={}, zaehlSession=null;
let milchEintraege={}, weideTage={}, weiden={}, bauern={};
let saisonInfo=null;
let gruppen={}, fotos={}, zaehlVerlauf={}, chatNachrichten={}, kraftfutter={};
let kalenderTermine={};   // manuelle Kalendertermine
let traenkeLog={};         // Tränke/Wasser-Protokoll
let saisonArchiv={};       // Saisonvergleich-Archivdaten
let stallplan={};          // Stallplan: {stallId: {name, reihen, spalten, boxen: {boxId: kuhId}}}
let klauenpflege={};       // Klauenpflege-Protokoll pro Kuh
let _editStore = {};
let _chatName=localStorage.getItem('chatName')||'';
let currentView='dashboard', editId=null;
let _kalbungIds={};

// ══════════════════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════════════════
function initApp() {
  // Apply role permissions to visible modules
  applyRoleToModules();
  // Sofort rendern ohne Firebase
  render();
  
  // Firebase muss initialisiert sein
  if(!db && typeof firebase !== 'undefined' && firebase.apps.length) {
    try { db = firebase.database(); db_instance = db; } catch(e) {}
  }
  if(!db) {
    console.warn('initApp: db not ready, retrying in 500ms');
    setTimeout(initApp, 500);
    return;
  }

  onValue(ref(db,'kuehe'),        s=>{ kuehe=s.val()||{};          render(); checkWartezeiten(); });
  onValue(ref(db,'behandlungen'), s=>{ behandlungen=s.val()||{};   render(); checkWartezeiten(); });
  onValue(ref(db,'besamungen'),   s=>{ besamungen=s.val()||{};     render(); });
  onValue(ref(db,'zaehlung'),     s=>{ zaehlSession=s.val();       render(); });
  onValue(ref(db,'milch'),        s=>{ milchEintraege=s.val()||{}; render(); });
  onValue(ref(db,'weideTage'),    s=>{ weideTage=s.val()||{};      render(); });
  onValue(ref(db,'weiden'),       s=>{ weiden=s.val()||{};         render(); });
  onValue(ref(db,'bauern'),       s=>{ bauern=s.val()||{};         render(); });
  onValue(ref(db,'saison'),       s=>{ saisonInfo=s.val();         render(); });
  onValue(ref(db,'journal'),      s=>{ journal=s.val()||{};        render(); });
  onValue(ref(db,'kontakte'),     s=>{ kontakte=s.val()||{};       render(); });
  onValue(ref(db,'gruppen'),       s=>{ gruppen=s.val()||{};        render(); });
  onValue(ref(db,'fotos'),         s=>{ fotos=s.val()||{};          render(); });
  onValue(ref(db,'chat'),           s=>{ chatNachrichten=s.val()||{}; renderChat(); });
  onValue(ref(db,'kraftfutter'),    s=>{ kraftfutter=s.val()||{};      render(); });
  onValue(ref(db,'zaehlVerlauf'),   s=>{ zaehlVerlauf=s.val()||{};   render(); });
  onValue(ref(db,'kalenderTermine'),s=>{ kalenderTermine=s.val()||{}; render(); });
  onValue(ref(db,'traenkeLog'),     s=>{ traenkeLog=s.val()||{};      render(); });
  onValue(ref(db,'saisonArchiv'),   s=>{ saisonArchiv=s.val()||{};    render(); });
  onValue(ref(db,'stallplan'),      s=>{ stallplan=s.val()||{};        render(); });
  onValue(ref(db,'kfLieferungen'), s=>{ window._kfLieferungen=s.val()||{}; render(); });
  onValue(ref(db,'wartung'),       s=>{ window._wartungData=s.val()||{};   render(); });
  onValue(ref(db,'lager'),         s=>{ window._lagerData=s.val()||{};     render(); });
  onValue(ref(db,'aufgaben'),      s=>{ window._aufgabenData=s.val()||{};  render(); });
  onValue(ref(db,'klauenpflege'), s=>{ klauenpflege=s.val()||{};           render(); });

  // Stallplan-Listener (war früher Top-Level → crashte das Skript)
  if(typeof window._spRegisterStallplanListener === 'function') {
    window._spRegisterStallplanListener();
  }

  registerSW();
  requestNotificationPermission();
  setInterval(checkWartezeiten, 3600000);
  renderNav();
}

// ══════════════════════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════════════════════
window.navigate = function(view) {
  if(view==='chat') markChatRead();
  currentView=view; editId=null; _kalbungIds={};
  document.getElementById('mehr-menu').style.display='none';
  render();
  try{renderNav();}catch(e){}
};

// ══════════════════════════════════════════════════════════════════════════════
//  RENDER ROUTER
// ══════════════════════════════════════════════════════════════════════════════
// Navigation-Richtung tracken (Phase B2)
window._lastView = null;
window._navStack = window._navStack || [];

function render() {
  const main=document.getElementById('main-content');
  if(!main) return;

  // Richtung der Animation bestimmen
  // Forward = neue View auf Stack legen → slide-up + fade-in
  // Backward = wenn neue currentView eine Stufe vorher im Stack war → slide-down + fade-in
  var prev = window._lastView;
  var cur = currentView;
  var isBack = false;
  if(prev) {
    var idx = window._navStack.indexOf(cur);
    if(idx >= 0 && idx < window._navStack.length - 1) {
      // currentView ist im Stack vor der prev → wir gehen zurück
      isBack = true;
      window._navStack = window._navStack.slice(0, idx + 1);
    } else if(prev !== cur) {
      window._navStack.push(cur);
      // Stack-Begrenzung
      if(window._navStack.length > 20) window._navStack.shift();
    }
  } else {
    window._navStack = [cur];
  }
  window._lastView = cur;

  // body[data-view] setzen (Phase B3: FAB sichtbar nur auf dashboard via CSS)
  if(document.body) document.body.setAttribute('data-view', cur);

  // Out-Animation (kurz)
  main.style.transition='opacity .12s ease-out,transform .12s ease-out';
  main.style.opacity='0';
  main.style.transform = isBack ? 'translateY(-6px)' : 'translateY(10px)';

  const map = {
    dashboard:    function(){return renderDashboard();},
    herde:        function(){return renderHerde();},
    'kuh-detail': function(){return renderKuhDetail();},
    zaehlung:     function(){return renderZaehlung();},
    behandlung:   function(){return renderBehandlung();},
    reproduktion: function(){return renderBesamungModule();},
    besamung:     function(){return renderBesamungModule();},
    milch:        function(){return renderMilch();},
    weide:        function(){return renderWeide();},
    saison:       function(){return renderSaison();},
    bestandsbuch: function(){return renderBestandsbuch();},
    einstellungen:function(){return renderEinstellungen();},
    benutzer:     function(){return (window.renderBenutzer||renderDashboard)();},
    journal:      function(){return renderJournal();},
    alpung:       function(){return renderAlpung();},
    kontakte:     function(){return renderKontakte();},
    gruppen:      function(){return renderGruppen();},
    kontrolle:    function(){return renderKontrolle();},
    kalender:     function(){return renderKalender();},
    statistik:    function(){return renderStatistik();},
    backup:       function(){return renderBackup();},
    suche:        function(){return renderSuche();},
    chat:         function(){return renderChatPage();},
    kraftfutter:  function(){return renderKraftfutter();},
    wetter:       function(){return renderWetter();},
    kaese:        function(){return (window.renderKaese||function(){return '<div class="empty-state">Käse-Modul lädt…</div>';})();},
    bauer_detail: function(){return renderBauerDetail();},
    saisonvergleich: function(){return renderSaisonvergleich();},
    traenke:      function(){return renderTraenke();},
    stallplan:    function(){return renderStallplan();},
    qrscanner:    function(){return renderQRScanner();},
    wartung:      function(){return renderWartung();},
    lager:        function(){return renderLager();},
    aufgaben:     function(){return renderAufgaben();},
  };
  main.innerHTML = (map[currentView]||renderDashboard)();
  attachListeners();

  // Bottom-Sheets nach jedem Render markieren (Phase B4)
  if(typeof window.applyBottomSheets === 'function') window.applyBottomSheets();

  // After-render hooks
  requestAnimationFrame(function(){
    // Milch Saison Chart
    if(currentView==='milch') {
      var mc=document.getElementById('milch-saison-canvas');
      if(mc) drawMilchSaisonChart(mc);
    }
    // Kuh Detail Chart
    if(currentView==='kuh-detail' && window._kdChartData) {
      setTimeout(window.drawKdChart, 120);
    }
    // Fieberkurve zeichnen wenn Canvas vorhanden
    if(typeof window.drawFieberChart === 'function') {
      setTimeout(window.drawFieberChart, 80);
    }
    // Stallplan Kuh-Animation
    if(currentView==='stallplan' && typeof window.spStartAnimation === 'function') {
      var aktivStall = window._aktivStall || Object.keys(stallplan)[0] || null;
      if(aktivStall) setTimeout(function(){ window.spStartAnimation(aktivStall); }, 200);
    }
  });
  
  // In-Animation: doppelter rAF damit der Browser den Initial-State garantiert anwendet (Phase B2)
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      main.style.transition='opacity .22s cubic-bezier(.2,.8,.2,1),transform .22s cubic-bezier(.2,.8,.2,1)';
      main.style.opacity='1';
      main.style.transform='translateY(0)';
      setTimeout(function(){ main.style.transition=''; }, 250);
    });
  });
}

// ══════════════════════════════════════════════════════════════
//  MILCH SAISON CHART (Canvas)
// ══════════════════════════════════════════════════════════════
window.drawMilchSaisonChart = function(canvas) {
  if(!canvas) return;
  var tage={};
  Object.values(milchEintraege).forEach(function(e){
    if(!e.datum) return;
    var tag=new Date(e.datum).toISOString().slice(0,10);
    tage[tag]=(tage[tag]||0)+(e.gesamt||0);
  });
  var data=Object.entries(tage).sort(function(a,b){return a[0].localeCompare(b[0]);})
    .map(function(d){return {d:new Date(d[0]+'T12:00').getTime(), l:Math.round(d[1]*10)/10};});
  if(data.length<2){canvas.style.display='none';return;}

  // ── Lineare Regression für Prognose ──
  var zeigPrognose = window._milchPrognoseSaison;
  var prognosePunkte = [];
  var proVal14 = 0, proVal30 = 0;
  if(zeigPrognose && data.length >= 5) {
    var n = data.length;
    var sumX=0,sumY=0,sumXY=0,sumX2=0;
    data.forEach(function(d,i){ sumX+=i; sumY+=d.l; sumXY+=i*d.l; sumX2+=i*i; });
    var slope=(n*sumXY-sumX*sumY)/(n*sumX2-sumX*sumX);
    var intercept=(sumY-slope*sumX)/n;
    var ms86400=86400000;
    // Prognose: nächste 30 Tage
    for(var j=1;j<=30;j++){
      var idx=n-1+j;
      var wert=Math.max(0,Math.round((intercept+slope*idx)*10)/10);
      var datum=new Date(data[n-1].d+j*ms86400);
      prognosePunkte.push({d:datum.getTime(),l:wert,idx:idx});
    }
    proVal14 = prognosePunkte[13]?.l || 0;
    proVal30 = prognosePunkte[29]?.l || 0;
    var trend = slope > 0.1 ? '📈 Steigend' : slope < -0.1 ? '📉 Sinkend' : '➡ Stabil';
    // Info-Box befüllen
    setTimeout(function(){
      var el = document.getElementById('milch-prognose-werte');
      if(el) el.innerHTML =
        'In 14 Tagen: <b style="color:var(--gold)">~'+proVal14+'L/Tag</b> · '+
        'In 30 Tagen: <b style="color:var(--gold)">~'+proVal30+'L/Tag</b> · '+
        'Trend: <b>'+trend+'</b><br>'+
        '<span style="font-size:.65rem;color:var(--text3)">Basis: letzte '+n+' Messtage · Steigung: '+(slope>=0?'+':'')+Math.round(slope*100)/100+'L/Tag</span>';
    }, 50);
  }

  var allData = zeigPrognose ? data.concat(prognosePunkte) : data;
  var ctx=canvas.getContext('2d');
  var dpr=window.devicePixelRatio||1;
  var W=canvas.offsetWidth, H=130;
  canvas.width=W*dpr; canvas.height=H*dpr;
  ctx.scale(dpr,dpr);
  var pad={t:14,r:8,b:8,l:32};
  var gW=W-pad.l-pad.r, gH=H-pad.t-pad.b;
  var maxV=Math.max.apply(null,allData.map(function(d){return d.l;}));
  var minV=0; var range=maxV-minV||1;
  var totalPts=allData.length;

  var pts=data.map(function(d,i){return {
    x:pad.l+i*(gW/(totalPts-1)),
    y:pad.t+gH-((d.l-minV)/range)*gH,
    l:d.l, d:d.d, istPrognose:false
  };});

  var progPts = prognosePunkte.map(function(d,j){return {
    x:pad.l+(data.length+j)*(gW/(totalPts-1)),
    y:pad.t+gH-((d.l-minV)/range)*gH,
    l:d.l, d:d.d, istPrognose:true
  };});

  // Grid
  [0.33,0.66,1].forEach(function(f){
    var y=pad.t+gH*(1-f);
    ctx.strokeStyle='rgba(255,255,255,.05)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+gW,y); ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.25)'; ctx.font='9px sans-serif'; ctx.textAlign='right';
    ctx.fillText(Math.round(minV+range*f)+'L', pad.l-3, y+3);
  });

  // Area (nur Ist-Daten)
  var g=ctx.createLinearGradient(0,pad.t,0,pad.t+gH);
  g.addColorStop(0,'rgba(77,184,78,.3)'); g.addColorStop(1,'rgba(77,184,78,.02)');
  ctx.beginPath(); ctx.moveTo(pts[0].x,pad.t+gH);
  pts.forEach(function(p){ctx.lineTo(p.x,p.y);}); ctx.lineTo(pts[pts.length-1].x,pad.t+gH);
  ctx.closePath(); ctx.fillStyle=g; ctx.fill();

  // Ist-Linie
  ctx.beginPath();
  pts.forEach(function(p,i){if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});
  ctx.strokeStyle='#4db84e'; ctx.lineWidth=2; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.stroke();

  // Prognose-Linie (gestrichelt, gold)
  if(zeigPrognose && progPts.length) {
    var lastIst=pts[pts.length-1];
    ctx.beginPath();
    ctx.moveTo(lastIst.x,lastIst.y);
    progPts.forEach(function(p){ctx.lineTo(p.x,p.y);});
    ctx.strokeStyle='rgba(212,168,75,.8)'; ctx.lineWidth=2;
    ctx.setLineDash([5,4]); ctx.stroke(); ctx.setLineDash([]);

    // Prognose-Endpunkt
    var ep=progPts[progPts.length-1];
    ctx.beginPath(); ctx.arc(ep.x,ep.y,4,0,Math.PI*2);
    ctx.fillStyle='rgba(212,168,75,.4)'; ctx.fill();
    ctx.beginPath(); ctx.arc(ep.x,ep.y,2.5,0,Math.PI*2);
    ctx.fillStyle='#d4a84b'; ctx.fill();

    // Trennlinie Ist/Prognose
    ctx.strokeStyle='rgba(212,168,75,.3)'; ctx.lineWidth=1;
    ctx.setLineDash([2,3]);
    ctx.beginPath(); ctx.moveTo(lastIst.x,pad.t); ctx.lineTo(lastIst.x,pad.t+gH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='rgba(212,168,75,.7)'; ctx.font='bold 8px sans-serif'; ctx.textAlign='center';
    ctx.fillText('Prognose →', lastIst.x+gW*0.15, pad.t+8);
  }

  // Letzter Ist-Punkt
  var lp=pts[pts.length-1];
  ctx.beginPath(); ctx.arc(lp.x,lp.y,5,0,Math.PI*2);
  ctx.fillStyle='rgba(77,184,78,.25)'; ctx.fill();
  ctx.beginPath(); ctx.arc(lp.x,lp.y,3,0,Math.PI*2);
  ctx.fillStyle='#4db84e'; ctx.fill();

  // Touch-Tooltip
  var allPts = pts.concat(progPts);
  if(!canvas._milchTouch) {
    canvas._milchTouch=true;
    canvas.addEventListener('touchstart',function(e){
      e.preventDefault();
      var rect=canvas.getBoundingClientRect();
      var tx=(e.touches[0].clientX-rect.left)*(W/rect.width);
      var closest=allPts[0],minD=Infinity;
      allPts.forEach(function(p){var d=Math.abs(p.x-tx);if(d<minD){minD=d;closest=p;}});
      ctx.clearRect(0,0,W,H); window.drawMilchSaisonChart(canvas);
      var tw=80,th=22,tx2=Math.min(W-tw-4,Math.max(4,closest.x-tw/2));
      ctx.fillStyle=closest.istPrognose?'rgba(212,168,75,.95)':'rgba(77,184,78,.95)';
      ctx.beginPath();
      if(ctx.roundRect)ctx.roundRect(tx2,closest.y-th-8,tw,th,5);else ctx.rect(tx2,closest.y-th-8,tw,th);
      ctx.fill();
      ctx.fillStyle='#060e05'; ctx.font='bold 10px sans-serif'; ctx.textAlign='center';
      var label=new Date(closest.d).toLocaleDateString('de-AT',{day:'numeric',month:'short'});
      ctx.fillText((closest.istPrognose?'~':'')+closest.l+'L · '+label, tx2+tw/2, closest.y-th/2-4);
    },{passive:false});
  }
};

// ══════════════════════════════════════════════════════════════════════════════
