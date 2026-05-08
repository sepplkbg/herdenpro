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
function render() {
  const main=document.getElementById('main-content');
  if(!main) return;
  // Smooth transition
  main.style.opacity='0';
  main.style.transform='translateY(4px)';
  
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
    bauern_menu:  function(){return renderBauernMenu();},
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
  
  // Animate in
  requestAnimationFrame(()=>{
    main.style.transition='opacity .18s ease,transform .18s ease';
    main.style.opacity='1';
    main.style.transform='translateY(0)';
    setTimeout(()=>{main.style.transition='';},200);
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

