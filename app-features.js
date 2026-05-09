// HerdenPro – modulare Zerlegung – TEIL 3: Features (Vorzeitig Abtrieb, Sync, Rohdaten Import, Saisonstart, Wetter, Auth, Käse, Einstellungen, Milch, Herde, Bestandsbuch, Benutzer). Reihenfolge in index.html: app-core.js → app-views.js → app-features.js
// Klassische Scripts (kein type=module): teilen sich denselben globalen Lexical Environment.

// ══════════════════════════════════════════════════════════════
//  VORZEITIGER ABTRIEB
// ══════════════════════════════════════════════════════════════
window.showVorzeitigAbtrieb = function(kuhId) {
  const k = kuehe[kuhId];
  if(!k) return;
  showPopupHTML(`
    <h3 style="color:var(--orange);margin:0 0 .8rem">↓ Vorzeitiger Abtrieb</h3>
    <p style="font-size:.85rem;color:var(--text2);margin-bottom:.8rem">
      <b style="color:var(--gold)">#${k.nr} ${k.name||'–'}</b> vorzeitig von der Alm abtreiben?
    </p>
    <label class="inp-label">Datum</label>
    <input id="vz-datum" class="inp" type="date" value="${isoDate(new Date())}" style="margin-bottom:.5rem" />
    <label class="inp-label">Grund</label>
    <select id="vz-grund" class="inp" style="margin-bottom:.5rem">
      <option value="krank">Krank / Verletzt</option>
      <option value="trocken">Trockengestellt</option>
      <option value="geburt">Geburt bevorstehend</option>
      <option value="verkauf">Verkauf</option>
      <option value="verhaltensauffaellig">Verhaltensauffällig</option>
      <option value="sonstige">Sonstiges</option>
    </select>
    <textarea id="vz-notiz" class="inp" rows="2" placeholder="Notizen"></textarea>
    <div style="display:flex;gap:.5rem;margin-top:.8rem">
      <button class="btn-secondary" style="flex:1" onclick="closePopup()">Abbrechen</button>
      <button class="btn-primary" style="flex:1;background:var(--orange)" onclick="saveVorzeitigAbtrieb('${kuhId}')">↓ Abtreiben</button>
    </div>
  `);
};

window.saveVorzeitigAbtrieb = async function(kuhId) {
  const datum = document.getElementById('vz-datum')?.value;
  const grund = document.getElementById('vz-grund')?.value;
  const notiz = document.getElementById('vz-notiz')?.value.trim();
  await update(ref(db,'kuehe/'+kuhId), {
    almStatus: 'unten',
    vorzeitigAbtrieb: {datum: new Date(datum).getTime(), grund, notiz},
    updatedAt: Date.now()
  });
  closePopup();
  // Show confirmation
  setTimeout(()=>{
    const k=kuehe[kuhId];
    alert(`✓ ${k?.name||'Kuh'} #${k?.nr||kuhId} wurde abgetrieben.`);
  }, 300);
};

// ── Edit helper functions ──
window.editBehandlung = function(bid) {
  const b = behandlungen[bid];
  if(!b) { alert('Eintrag nicht gefunden'); return; }
  showBehandlungForm(b.kuhId, bid, b);
};
window.editBesamung = function(bsid) {
  const bs = besamungen[bsid];
  if(!bs) { alert('Eintrag nicht gefunden'); return; }
  showBesamungForm(bs.kuhId, bsid, bs);
};

// ══════════════════════════════════════════════════════════════
//  NAV ↔ MEHR DRAG SWAP
// ══════════════════════════════════════════════════════════════
function setupNavMehrDrag() {
  var nav = document.getElementById('bottom-nav');
  if(!nav) return;

  var longTimer = null;
  var navGhost = null;
  var navDragId = null;
  var navOffsetX = 0, navOffsetY = 0;

  function startNavDrag(btn, clientX, clientY) {
    navDragId = btn.dataset.view || btn.dataset.navid;
    if(!navDragId || navDragId==='dashboard' || navDragId==='mehr') return;
    window._navDragging = true;
    document.body.style.userSelect='none';
    document.body.style.webkitUserSelect='none';
    btn.style.opacity='0.3';

    navGhost = btn.cloneNode(true);
    var rect = btn.getBoundingClientRect();
    navOffsetX = clientX - rect.left;
    navOffsetY = clientY - rect.top;
    navGhost.style.cssText='position:fixed;z-index:9999;pointer-events:none;opacity:0.9;'+
      'width:'+rect.width+'px;transform:scale(1.1);'+
      'background:var(--bg4);border:2px solid var(--gold);border-radius:var(--radius-sm);'+
      'box-shadow:0 8px 24px rgba(0,0,0,.5);';
    navGhost.style.left=(clientX-navOffsetX)+'px';
    navGhost.style.top=(clientY-navOffsetY)+'px';
    document.body.appendChild(navGhost);
    if(navigator.vibrate) navigator.vibrate(50);
    // Open mehr menu so user can drag into it
    var mehr = document.getElementById('mehr-menu');
    if(mehr) mehr.style.display='';
    if(window.getSelection) window.getSelection().removeAllRanges();
  }

  function moveNavDrag(clientX, clientY) {
    if(!navGhost) return;
    navGhost.style.left=(clientX-navOffsetX)+'px';
    navGhost.style.top=(clientY-navOffsetY)+'px';
    // Highlight mehr item under cursor
    navGhost.style.display='none';
    var el=document.elementFromPoint(clientX,clientY);
    navGhost.style.display='';
    var target=el&&el.closest?el.closest('.mehr-drag-item'):null;
    document.querySelectorAll('.mehr-drag-item').forEach(function(b){
      b.style.outline=target&&b===target?'2px solid var(--gold)':'';
    });
  }

  function endNavDrag(clientX, clientY) {
    if(!navGhost||!navDragId) return;
    navGhost.style.display='none';
    var el=document.elementFromPoint(clientX,clientY);
    navGhost.style.display='';
    navGhost.remove(); navGhost=null;

    document.querySelectorAll('.mehr-drag-item').forEach(function(b){b.style.outline='';});
    document.querySelectorAll('.nav-item').forEach(function(b){b.style.opacity='';});

    var target=el&&el.closest?el.closest('.mehr-drag-item'):null;
    if(target&&target.dataset.mid) {
      var mehrId=target.dataset.mid;
      // Swap: navDragId goes to mehr, mehrId goes to nav
      var navIdx=(_mainNav||[]).indexOf(navDragId);
      if(navIdx>-1) {
        _mainNav[navIdx]=mehrId;
        window._mainNav=_mainNav;
        localStorage.setItem('mainNav',JSON.stringify(_mainNav));
        // Update mehr order: replace mehrId with navDragId
        var order=JSON.parse(localStorage.getItem('mehrOrder')||'null')||(window.ALLE_MODULE||[]).filter(function(m){return !(_mainNav||[]).includes(m.id);}).map(function(m){return m.id;});
        var oi=order.indexOf(mehrId);
        if(oi>-1) order[oi]=navDragId; else order.push(navDragId);
        localStorage.setItem('mehrOrder',JSON.stringify(order));
        renderNav();
        renderMehrGrid();
        if(navigator.vibrate) navigator.vibrate([30,10,30]);
      }
    }
    document.getElementById('mehr-menu').style.display='none';
    navDragId=null; window._navDragging=false;
    document.body.style.userSelect='';
    document.body.style.webkitUserSelect='';
  }

  function cancelNavDrag() {
    clearTimeout(longTimer);
    if(navGhost){navGhost.remove();navGhost=null;}
    document.querySelectorAll('.nav-item').forEach(function(b){b.style.opacity='';});
    document.querySelectorAll('.mehr-drag-item').forEach(function(b){b.style.outline='';});
    navDragId=null; window._navDragging=false;
    document.body.style.userSelect='';
    document.body.style.webkitUserSelect='';
    document.getElementById('mehr-menu').style.display='none';
  }

  // Attach to nav items (excluding dashboard and mehr)
  Array.from(nav.querySelectorAll('.nav-item')).forEach(function(btn){
    var vid=btn.dataset.view;
    if(vid==='dashboard'||vid==='mehr') return;

    btn.addEventListener('mousedown',function(e){
      var self=this;
      longTimer=setTimeout(function(){startNavDrag(self,e.clientX,e.clientY);},400);
    });
    btn.addEventListener('touchstart',function(e){
      var touch=e.touches[0]; var self=this;
      longTimer=setTimeout(function(){startNavDrag(self,touch.clientX,touch.clientY);},400);
    },{passive:true});
  });

  document.addEventListener('mousemove',function(e){if(navGhost)moveNavDrag(e.clientX,e.clientY);});
  document.addEventListener('mouseup',function(e){if(navGhost){clearTimeout(longTimer);endNavDrag(e.clientX,e.clientY);}else clearTimeout(longTimer);});
  document.addEventListener('touchmove',function(e){if(navGhost){e.preventDefault();moveNavDrag(e.touches[0].clientX,e.touches[0].clientY);}},{passive:false});
  document.addEventListener('touchend',function(e){if(navGhost){clearTimeout(longTimer);endNavDrag(e.changedTouches[0].clientX,e.changedTouches[0].clientY);}else clearTimeout(longTimer);});
  document.addEventListener('touchcancel',function(){if(navGhost)cancelNavDrag();clearTimeout(longTimer);});
}

// ══════════════════════════════════════════════════════════════
//  SYNC EXPORT/IMPORT (App ↔ Sennerei Excel via OneDrive)
// ══════════════════════════════════════════════════════════════
window.exportSyncJSON = function() {
  const ts = Date.now();
  const saisonStart = saisonInfo?.auftriebDatum || null;

  // Milch nach Wochen gruppieren pro Kuh
  const milchWochen = {};
  Object.values(milchEintraege).forEach(m => {
    if(!m.datum || !saisonStart) return;
    const tageSeit = Math.floor((m.datum - saisonStart) / 86400000);
    const woche = Math.min(14, Math.max(1, Math.floor(tageSeit/7) + 1));
    const wKey = 'w' + woche;
    if(m.art === 'prokuh' && m.prokuh) {
      Object.entries(m.prokuh).forEach(([kuhId, liter]) => {
        if(!milchWochen[kuhId]) milchWochen[kuhId] = {};
        milchWochen[kuhId][wKey] = (milchWochen[kuhId][wKey]||0) + liter;
      });
    }
  });

  // Kühe mit Milchdaten
  const milchArray = Object.entries(kuehe).map(([id,k]) => {
    const w = milchWochen[id] || {};
    const obj = {nr: k.nr, name: k.name||'', bauer: k.bauer||'', updatedAt: k.updatedAt||0};
    for(let i=1;i<=14;i++) obj['w'+i] = Math.round((w['w'+i]||0)*10)/10;
    return obj;
  });

  // Behandlungen mit Kuh-Info
  const behandlArray = Object.entries(behandlungen).map(([id,b]) => {
    const k = kuehe[b.kuhId];
    return {...b, id, kuhNr: k?.nr||'', kuhName: k?.name||''};
  });

  // Kraftfutter mit Kuh-Info
  const kfArray = Object.entries(kraftfutter).map(([id,kf]) => {
    const k = kuehe[kf.kuhId];
    const heute = Date.now();
    const saisonEnde = saisonInfo?.abtriebtDatum || (saisonInfo?.aktiv ? heute : heute);
    const tage = kf.datum ? Math.max(0, Math.floor((saisonEnde - kf.datum) / 86400000)) : 0;
    return {...kf, id, kuhNr: k?.nr||'', kuhName: k?.name||'', tage};
  });

  // Bauern
  const bauernArray = Object.values(bauern);

  const sync = {
    exportiert_von: 'herdenpro',
    exportiert_am: ts,
    version: '1.0',
    saison: saisonInfo,
    bauern: bauernArray,
    kuehe: Object.values(kuehe),
    milch_wochen: milchArray,
    behandlungen: behandlArray,
    kraftfutter: kfArray,
    besamungen: Object.values(besamungen),
  };

  const blob = new Blob([JSON.stringify(sync, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const datum = new Date().toISOString().slice(0,10);
  a.download = 'herdenpro_sync_' + datum + '.json';
  a.click();

  document.getElementById('sync-status').innerHTML = 
    '✓ Exportiert: ' + datum + ' · Jetzt Datei in OneDrive speichern';
};

window.importSyncJSON = async function(input) {
  const file = input.files[0];
  if(!file) return;
  const statusEl = document.getElementById('sync-status');
  statusEl.innerHTML = '⏳ Importiere...';

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if(!data.exportiert_von) {
      statusEl.innerHTML = '✗ Ungültige Sync-Datei';
      return;
    }

    let imported = 0;
    const myTs = Date.now();

    // Bauern synchronisieren (neuester Stand gewinnt)
    if(data.bauern && Array.isArray(data.bauern)) {
      for(const b of data.bauern) {
        if(!b.name) continue;
        // Suche bestehenden Bauer
        const existing = Object.entries(bauern).find(([,v])=>v.name===b.name);
        if(existing) {
          const [bid, bv] = existing;
          if((b.updatedAt||0) > (bv.updatedAt||0)) {
            await update(ref(db,'bauern/'+bid), {...b, updatedAt: b.updatedAt||myTs});
            imported++;
          }
        } else {
          await push(ref(db,'bauern'), {...b, updatedAt: b.updatedAt||myTs});
          imported++;
        }
      }
    }

    // Milchdaten synchronisieren
    if(data.milch_wochen && Array.isArray(data.milch_wochen)) {
      for(const mw of data.milch_wochen) {
        if(!mw.nr || !saisonInfo?.auftriebDatum) continue;
        // Finde Kuh
        const kuhEntry = Object.entries(kuehe).find(([,k])=>k.nr===mw.nr);
        if(!kuhEntry) continue;
        const kuhId = kuhEntry[0];
        
        // Erstelle Milcheintrag pro Woche
        for(let w=1; w<=14; w++) {
          const liter = mw['w'+w];
          if(!liter || liter <= 0) continue;
          
          // Prüfe ob bereits vorhanden
          const wocheDatum = new Date(saisonInfo.auftriebDatum + (w-1)*7*86400000);
          const wocheKey = wocheDatum.toISOString().slice(0,10);
          
          const exists = Object.values(milchEintraege).find(m => 
            m.art==='prokuh' && m.prokuh?.[kuhId] && 
            Math.abs(m.datum - wocheDatum.getTime()) < 7*86400000
          );
          
          if(!exists) {
            const prokuh = {};
            prokuh[kuhId] = liter;
            await push(ref(db,'milch'), {
              datum: wocheDatum.getTime(),
              art: 'prokuh',
              prokuh,
              gesamt: liter,
              zeit: 'morgen',
              quelle: 'excel_sync',
              createdAt: myTs
            });
            imported++;
          }
        }
      }
    }

    statusEl.innerHTML = '✓ Import abgeschlossen: ' + imported + ' Datensätze synchronisiert';
    alert('✓ Sync Import abgeschlossen\n' + imported + ' Datensätze importiert.');
  } catch(e) {
    statusEl.innerHTML = '✗ Fehler: ' + e.message;
    alert('Fehler beim Import: ' + e.message);
  }
  input.value = '';
};

// ══════════════════════════════════════════════════════════════
//  ROHDATEN EXCEL IMPORT
// ══════════════════════════════════════════════════════════════
window.importRohdatenExcel = async function(input) {
  const file = input.files[0];
  if(!file) return;
  const statusEl = document.getElementById('rohdaten-status');
  statusEl.innerHTML = '⏳ Lese Excel-Datei...';

  // Need SheetJS
  if(typeof XLSX === 'undefined') {
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => importRohdatenExcel(input);
    document.head.appendChild(s);
    return;
  }

  try {
    // Check file type
    const fname = file.name.toLowerCase();
    if(!fname.endsWith('.xlsx') && !fname.endsWith('.xls') && !fname.endsWith('.xlsm')) {
      statusEl.innerHTML = '✗ Falsches Format – bitte .xlsx oder .xlsm verwenden';
      alert('Falsches Dateiformat.\nBitte speichere die Datei als .xlsx oder .xlsm');
      input.value = ''; return;
    }
    if(fname.endsWith('.xlsm')) {
      statusEl.innerHTML = '⚠ .xlsm erkannt – Makros werden ignoriert, Daten werden gelesen...';
    }
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array', cellDates:true, bookVBA:false});
    
    let total = 0;
    const ts = Date.now();

    // ── Saison ──
    const wsSaison = wb.Sheets['Saison'];
    if(wsSaison) {
      const sd = XLSX.utils.sheet_to_json(wsSaison, {header:1, defval:''});
      const saisonUpdate = {};
      sd.forEach(row => {
        if(!row[0] || !row[1]) return;
        const key = String(row[0]).toLowerCase();
        if(key.includes('almname')) saisonUpdate.alm = String(row[1]);
        if(key.includes('jahr')) saisonUpdate.jahr = parseInt(row[1]);
        if(key.includes('auftrieb')) {
          const d = parseExcelDatum(row[1]);
          if(d) { saisonUpdate.auftriebDatum = d; saisonUpdate.aktiv = true; }
        }
        if(key.includes('preis pro kuh')) saisonUpdate.preisProKuh = parseFloat(row[1])||0;
        if(key.includes('kraftfutter bio')) saisonUpdate.kraftfutterBioGesamt = parseFloat(row[1])||0;
        if(key.includes('kraftfutter konv')) saisonUpdate.kraftfutterKonvGesamt = parseFloat(row[1])||0;
        if(key.includes('heu gesamt')) saisonUpdate.heuGesamt = parseFloat(row[1])||0;
        if(key.includes('käsepreis')) saisonUpdate.kaesepreis = parseFloat(row[1])||0;
        if(key.includes('butterpreis')) saisonUpdate.butterpreis = parseFloat(row[1])||0;
      });
      if(Object.keys(saisonUpdate).length > 0) {
        await update(ref(db,'saison'), saisonUpdate);
        total++;
      }
    }

    // ── Bauern ──
    const wsBauern = wb.Sheets['Bauern'];
    if(wsBauern) {
      const rows = XLSX.utils.sheet_to_json(wsBauern, {header:1, defval:'', range:3});
      for(const row of rows) {
        const name = String(row[0]||'').trim();
        if(!name) continue;
        const data = {
          name,
          anzahl: parseInt(row[1])||0,
          bio: String(row[2]||'').toLowerCase().includes('ja'),
          verkKase: parseFloat(row[3])||0,
          verkButter: parseFloat(row[4])||0,
          strasse: String(row[5]||'').trim(),
          plzOrt: String(row[6]||'').trim(),
          tel: String(row[7]||'').trim(),
          email: String(row[8]||'').trim(),
          kuhStartNr: String(row[9]||'').trim(),
          kuhNamen: String(row[10]||'').trim(),
          updatedAt: ts
        };
        // Check if exists
        const existing = Object.entries(bauern).find(([,b])=>b.name===name);
        if(existing) {
          await update(ref(db,'bauern/'+existing[0]), data);
        } else {
          await push(ref(db,'bauern'), data);
        }
        total++;
      }
    }

    // ── Kühe ──
    const wsKuehe = wb.Sheets['Kühe'];
    if(wsKuehe) {
      const rows = XLSX.utils.sheet_to_json(wsKuehe, {header:1, defval:'', range:2});
      for(const row of rows) {
        const nr = String(row[0]||'').trim();
        const name = String(row[1]||'').trim();
        if(!nr) continue;
        // Skip header/hint rows
        if(nr.includes('#') || nr.includes('↓') || nr.toLowerCase().includes('kuhnr') || 
           nr.toLowerCase().includes('auto') || nr.toLowerCase().includes('klicke') ||
           name.toLowerCase().includes('(auto)') || name.toLowerCase().includes('kuhname') ||
           isNaN(parseInt(nr))) continue;
        const data = {
          nr, name,
          bauer:    String(row[2]||'').trim(),
          ohrmarke: String(row[3]||'').trim(),
          rasse:    String(row[4]||'').trim(),
          gruppe:   String(row[5]||'').trim(),
          laktation:String(row[7]||'').trim().toLowerCase()||'melkend',
          notiz:    String(row[8]||'').trim(),
          updatedAt: ts
        };
        // Extract gruppe from data
        const gruppeNamen = data.gruppe ? data.gruppe.split(/[,;\/]/).map(g=>g.trim()).filter(Boolean) : [];
        
        // Check if exists
        const existing = Object.entries(kuehe).find(([,k])=>k.nr===nr);
        let kuhId;
        if(existing) {
          await update(ref(db,'kuehe/'+existing[0]), data);
          kuhId = existing[0];
        } else {
          const ref2 = await push(ref(db,'kuehe'), data);
          kuhId = ref2.key;
        }
        
        // Create/assign Gruppen
        for(const gName of gruppeNamen) {
          if(!gName) continue;
          // Find or create group
          let gruppeId = Object.entries(gruppen||{}).find(([,g])=>g.name===gName)?.[0];
          if(!gruppeId) {
            // Create new group with random color
            const colors = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#3498db','#9b59b6','#1abc9c'];
            const col = colors[Object.keys(gruppen||{}).length % colors.length];
            const newGRef = await push(ref(db,'gruppen'), {name:gName, farbe:col, createdAt:Date.now()});
            gruppeId = newGRef.key;
          }
          // Assign kuh to gruppe
          if(kuhId && gruppeId) {
            const gData = gruppen[gruppeId] || {};
            const members = gData.mitglieder || {};
            members[kuhId] = true;
            await update(ref(db,'gruppen/'+gruppeId), {mitglieder: members});
          }
        }
        total++;
      }
    }

    // ── Milch ──
    const wsMilch = wb.Sheets['Milch'];
    if(wsMilch) {
      const rows = XLSX.utils.sheet_to_json(wsMilch, {header:1, defval:'', range:3});
      for(const row of rows) {
        const datumRaw = row[0];
        const kuhNr = String(row[1]||'').trim();
        const liter = parseFloat(row[2])||0;
        if(!datumRaw || !kuhNr || !liter) continue;
        
        const datum = parseExcelDatum(datumRaw);
        if(!datum) continue;
        
        const zeit = String(row[3]||'morgen').toLowerCase().includes('abend') ? 'abend' : 'morgen';
        
        // Find kuh ID
        const kuhEntry = Object.entries(kuehe).find(([,k])=>k.nr===kuhNr);
        if(!kuhEntry) continue;
        const kuhId = kuhEntry[0];
        
        // Check if already exists
        const exists = Object.values(milchEintraege).find(m =>
          m.art==='prokuh' && m.prokuh?.[kuhId] && 
          m.datum && Math.abs(m.datum - datum) < 12*3600000 &&
          m.zeit === zeit
        );
        if(exists) continue;
        
        const prokuh = {}; prokuh[kuhId] = liter;
        await push(ref(db,'milch'), {
          datum, art:'prokuh', prokuh,
          gesamt: liter, zeit,
          quelle:'rohdaten_import', createdAt: ts
        });
        total++;
      }
    }

    // ── Behandlungen ──
    const wsBeh = wb.Sheets['Behandlungen'];
    if(wsBeh) {
      const rows = XLSX.utils.sheet_to_json(wsBeh, {header:1, defval:'', range:2});
      for(const row of rows) {
        const datumRaw = row[0];
        const kuhNr = String(row[1]||'').trim();
        if(!datumRaw || !kuhNr) continue;
        
        const datum = parseExcelDatum(datumRaw);
        if(!datum) continue;
        
        const kuhEntry = Object.entries(kuehe).find(([,k])=>k.nr===kuhNr);
        const kuhId = kuhEntry ? kuhEntry[0] : null;
        
        const data = {
          kuhId: kuhId||kuhNr,
          datum,
          diagnose: String(row[3]||'').trim(),
          medikament: String(row[4]||'').trim(),
          dosis: String(row[5]||'').trim(),
          tierarzt: String(row[6]||'').trim(),
          abgabeDatum: parseExcelDatum(row[7]),
          wzMilchTage: parseInt(row[8])||0,
          wzMilchEnde: parseExcelDatum(row[9]),
          wzFleischTage: parseInt(row[10])||0,
          wzFleischEnde: parseExcelDatum(row[11]),
          behandlungZeit: String(row[12]||'morgen').toLowerCase().includes('abend')?'abend':'morgen',
          aktiv: true,
          wartezeitEnde: parseExcelDatum(row[9])||parseExcelDatum(row[11]),
          createdAt: ts
        };
        if(!data.medikament) continue;
        await push(ref(db,'behandlungen'), data);
        total++;
      }
    }

    // ── Kraftfutter ──
    const wsKF = wb.Sheets['Kraftfutter'];
    if(wsKF) {
      const rows = XLSX.utils.sheet_to_json(wsKF, {header:1, defval:'', range:2});
      for(const row of rows) {
        const datumRaw = row[0];
        const kuhNr = String(row[1]||'').trim();
        const menge = parseFloat(row[4])||0;
        if(!datumRaw || !kuhNr || !menge) continue;
        
        const datum = parseExcelDatum(datumRaw);
        if(!datum) continue;
        
        const kuhEntry = Object.entries(kuehe).find(([,k])=>k.nr===kuhNr);
        const kuhId = kuhEntry ? kuhEntry[0] : null;
        if(!kuhId) continue;
        
        // Check if exists
        const exists = Object.values(kraftfutter).find(kf=>kf.kuhId===kuhId);
        const data = {kuhId, datum, menge, notiz: String(row[6]||'').trim(), createdAt:ts};
        if(exists) {
          const [kid] = Object.entries(kraftfutter).find(([,kf])=>kf.kuhId===kuhId);
          await update(ref(db,'kraftfutter/'+kid), data);
        } else {
          await push(ref(db,'kraftfutter'), data);
        }
        total++;
      }
    }

    statusEl.innerHTML = '✓ Import abgeschlossen: ' + total + ' Datensätze importiert';
    alert('✓ Rohdaten Import abgeschlossen!\n' + total + ' Datensätze importiert.\n\nDie Daten sind jetzt in der App verfügbar.');
    
    // Auto-trigger sync export for Excel
    setTimeout(() => {
      if(confirm('Soll jetzt auch automatisch der Sync-Export für das Sennerei-Excel erstellt werden?')) {
        exportSyncJSON();
      }
    }, 1000);

  } catch(e) {
    statusEl.innerHTML = '✗ Fehler: ' + e.message;
    alert('Fehler beim Import: ' + e.message);
  }
  input.value = '';
};

function parseExcelDatum(val) {
  if(!val) return null;
  if(typeof val === 'number') {
    // Excel serial date
    return Math.round((val - 25569) * 86400000);
  }
  if(val instanceof Date) {
    return val.getTime();
  }
  if(typeof val === 'string') {
    // DD.MM.YYYY
    const m = val.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if(m) return new Date(parseInt(m[3]), parseInt(m[2])-1, parseInt(m[1])).getTime();
    // YYYY-MM-DD
    const d = new Date(val);
    if(!isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

window.showMilchDetail = function(id, e) {
  if(!e) { e = milchEintraege[id]; if(!e) return; }
  if(typeof e === 'string') { try { e = JSON.parse(e); } catch(x) { e = milchEintraege[id]; if(!e) return; } }
  const datum = new Date(e.datum).toLocaleDateString('de-AT', {weekday:'short',day:'numeric',month:'short',year:'numeric'});
  const zeit = e.zeit === 'abend' ? '🌇 Abends' : '🌅 Morgens';
  
  let kuhZeilen = '';
  if(e.prokuh && Object.keys(e.prokuh).length > 0) {
    const kuhEntries = Object.entries(e.prokuh)
      .map(([kuhId, liter]) => {
        const k = kuehe[kuhId];
        return {nr: parseInt(k?.nr)||0, name: k?.name||'–', bauer: k?.bauer||'', liter};
      })
      .sort((a,b) => a.nr - b.nr);
    
    kuhZeilen = '<div style="margin-top:.8rem">' +
      '<div style="font-size:.75rem;color:var(--text3);margin-bottom:.4rem;font-weight:bold">PRO KUH:</div>' +
      '<div style="display:grid;grid-template-columns:auto 1fr auto;gap:.25rem .6rem;font-size:.82rem">' +
      kuhEntries.map(k => 
        '<span style="color:var(--text3)">#' + k.nr + '</span>' +
        '<span>' + k.name + (k.bauer ? ' <span style="color:var(--text3);font-size:.72rem">· ' + k.bauer + '</span>' : '') + '</span>' +
        '<span style="color:var(--gold);font-weight:bold;text-align:right">' + k.liter + ' L</span>'
      ).join('') +
      '</div>' +
      '<div style="border-top:1px solid var(--border);margin-top:.5rem;padding-top:.5rem;display:flex;justify-content:space-between">' +
        '<span style="font-weight:bold">Gesamt:</span>' +
        '<span style="color:var(--gold);font-weight:bold">' + Math.round(e.gesamt*10)/10 + ' L</span>' +
      '</div></div>';
  } else {
    kuhZeilen = '<div style="margin-top:.8rem;text-align:center;color:var(--gold);font-size:1.3rem;font-weight:bold">' +
      Math.round(e.gesamt*10)/10 + ' L Gesamt</div>';
  }
  
  window._milchDetailId = id;
  showPopupHTML(
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem">' +
    '<div><div style="font-weight:bold;font-size:1rem">' + datum + '</div>' +
    '<div style="font-size:.78rem;color:var(--text3)">' + zeit + (e.molkerei ? ' · an Molkerei' : '') + '</div></div>' +
    '<div style="font-size:1.4rem;color:var(--gold);font-weight:bold">' + Math.round(e.gesamt*10)/10 + ' L</div>' +
    '</div>' +
    kuhZeilen +
    '<div style="margin-top:1rem;display:flex;gap:.5rem">' +
    '<button class="btn-secondary" style="flex:1" onclick="closePopup()">Schließen</button>' +
    '<button class="btn-primary" onclick="closePopup();editMilchEintrag(window._milchDetailId)">✎ Bearbeiten</button>' +
    '<button class="btn-xs-danger" onclick="closePopup();window.deleteMilch(window._milchDetailId)">Löschen</button>' +
    '</div>'
  );
};

// ══════════════════════════════════════════════════════════════
//  DATEN BEREINIGEN
// ══════════════════════════════════════════════════════════════
window.bereinigeMilch = async function() {
  const kuhIds = new Set(Object.keys(kuehe));
  let count = 0;
  for(const [id, e] of Object.entries(milchEintraege)) {
    if(e.prokuh) {
      const hasValidKuh = Object.keys(e.prokuh).some(kid => kuhIds.has(kid));
      if(!hasValidKuh) {
        await remove(ref(db, 'milch/' + id));
        count++;
      }
    }
  }
  alert('✓ ' + count + ' Milcheinträge ohne gültige Kuh gelöscht.');
};

window.bereinigeBeh = async function() {
  const kuhIds = new Set(Object.keys(kuehe));
  let count = 0;
  for(const [id, b] of Object.entries(behandlungen)) {
    if(b.kuhId && !kuhIds.has(b.kuhId)) {
      await remove(ref(db, 'behandlungen/' + id));
      count++;
    }
  }
  alert('✓ ' + count + ' Behandlungen ohne gültige Kuh gelöscht.');
};

window.bereinigeFull = async function() {
  if(!confirm('Alle Daten bereinigen?\nMilch, Behandlungen und Kraftfutter ohne gültige Kuh werden gelöscht.\n\nDieser Vorgang kann nicht rückgängig gemacht werden!')) return;
  const kuhIds = new Set(Object.keys(kuehe));
  let count = 0;
  
  for(const [id, e] of Object.entries(milchEintraege)) {
    if(e.prokuh) {
      const hasValid = Object.keys(e.prokuh).some(kid => kuhIds.has(kid));
      if(!hasValid) { await remove(ref(db,'milch/'+id)); count++; }
    }
  }
  for(const [id, b] of Object.entries(behandlungen)) {
    if(b.kuhId && !kuhIds.has(b.kuhId)) { await remove(ref(db,'behandlungen/'+id)); count++; }
  }
  for(const [id, kf] of Object.entries(kraftfutter)) {
    if(kf.kuhId && !kuhIds.has(kf.kuhId)) { await remove(ref(db,'kraftfutter/'+id)); count++; }
  }
  alert('✓ Bereinigung abgeschlossen: ' + count + ' verwaiste Einträge gelöscht.');
};
// ── Zählung Splash Animation ──
let _zaehlAnimShown = false;

window._hyperAudioB64 = 'data:audio/mp3;base64,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';

window._showZaehlungAnim = function(cb) {
  if(_zaehlAnimShown) { if(cb) cb(); return; }
  _zaehlAnimShown = true;

  // Play Hyper Hyper snippet
  try {
    const audio = new Audio(window._hyperAudioB64);
    audio.volume = 0.85;
    audio.play().catch(()=>{});
    // Fade out last 1.5 seconds
    setTimeout(() => {
      const fadeDuration = 1500;
      const fadeSteps = 40;
      const fadeInterval = fadeDuration / fadeSteps;
      let vol = audio.volume;
      const fade = setInterval(() => {
        vol = Math.max(0, vol - (0.85 / fadeSteps));
        audio.volume = vol;
        if(vol <= 0) { clearInterval(fade); audio.pause(); }
      }, fadeInterval);
    }, Math.max(0, 2660 - 1500));
  } catch(e) {}

  const DURATION = 2500;
  const almName = (saisonInfo?.alm || 'Almzählung').toUpperCase();
  const tierCount = Object.keys(kuehe).length;

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow:hidden;background:#1a4a0a;cursor:pointer';

  ov.innerHTML = `

  <!-- SKY GRADIENT -->
  <div style="position:absolute;inset:0;animation:za-sky ${DURATION}ms ease both;
    background:linear-gradient(180deg,#0d2e03 0%,#1a5208 35%,#2d7a10 65%,#3d9416 80%,#4aad1a 100%)">
  </div>

  <!-- CLOUDS -->
  <svg style="position:absolute;top:8%;left:0;width:100%;opacity:.18;animation:za-cloud 4s ease-in-out infinite alternate"
    viewBox="0 0 400 60" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="80"  cy="30" rx="55" ry="18" fill="#c8f0a0"/>
    <ellipse cx="95"  cy="22" rx="35" ry="16" fill="#d8f8b0"/>
    <ellipse cx="65"  cy="22" rx="28" ry="14" fill="#d8f8b0"/>
    <ellipse cx="270" cy="28" rx="45" ry="14" fill="#c8f0a0"/>
    <ellipse cx="285" cy="20" rx="28" ry="13" fill="#d8f8b0"/>
    <ellipse cx="255" cy="20" rx="22" ry="11" fill="#d8f8b0"/>
  </svg>

  <!-- BERGKETTE Hintergrund -->
  <svg style="position:absolute;bottom:28%;left:0;width:100%;opacity:.22"
    viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <polygon points="0,120 0,80 40,30 80,60 120,15 160,50 200,5 240,45 280,20 320,55 360,25 400,55 400,120" fill="#1a6e08"/>
    <polygon points="0,120 0,90 50,55 90,75 130,40 170,68 210,30 250,62 290,42 330,70 370,45 400,65 400,120" fill="#0f4a05" opacity=".6"/>
  </svg>

  <!-- ALMWIESE Vordergrund -->
  <svg style="position:absolute;bottom:0;left:0;width:100%;height:35%"
    viewBox="0 0 400 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <rect width="400" height="100" fill="#3d9416"/>
    <ellipse cx="0"  cy="5" rx="80" ry="12" fill="#4aad1a" opacity=".7"/>
    <ellipse cx="200" cy="3" rx="100" ry="10" fill="#4aad1a" opacity=".5"/>
    <ellipse cx="400" cy="6" rx="80"  ry="11" fill="#4aad1a" opacity=".6"/>
    <!-- Grashalme -->
    <g fill="#5dc922" opacity=".6">
      ${Array.from({length:30},(_,i)=>{
        const x=i*14+Math.random()*8; const h=6+Math.random()*8;
        return `<path d="M${x},100 Q${x-3},${100-h} ${x+2},${100-h*1.4}" stroke="#5dc922" stroke-width="1.5" fill="none"/>`;
      }).join('')}
    </g>
  </svg>

  <!-- STAUBWOLKEN (hinter Kuh) -->
  <div id="za-dust1" style="position:absolute;bottom:32%;right:45%;
    width:40px;height:20px;border-radius:50%;background:rgba(255,255,220,.25);
    animation:za-dust 0.4s ease-out infinite;animation-delay:.1s"></div>
  <div id="za-dust2" style="position:absolute;bottom:34%;right:43%;
    width:25px;height:14px;border-radius:50%;background:rgba(255,255,220,.18);
    animation:za-dust 0.4s ease-out infinite;animation-delay:.25s"></div>

  <!-- KUH SVG - läuft von rechts nach links -->
  <div id="za-kuh" style="position:absolute;bottom:28%;right:0;
    animation:za-kuh ${DURATION * 0.88}ms cubic-bezier(.2,.0,.25,1) both">
    <svg width="90" height="60" viewBox="0 0 90 60" xmlns="http://www.w3.org/2000/svg">
      <!-- Beine (animiert) -->
      <g transform="translate(22,42)">
        <rect id="kl1" x="-3" y="0" width="6" height="16" rx="3" fill="#2a1a0a"
          style="transform-origin:3px 0;animation:za-leg-f .35s ease-in-out infinite"/>
        <rect id="kl2" x="5"  y="0" width="6" height="16" rx="3" fill="#2a1a0a"
          style="transform-origin:3px 0;animation:za-leg-b .35s ease-in-out infinite"/>
      </g>
      <g transform="translate(58,42)">
        <rect x="-3" y="0" width="6" height="16" rx="3" fill="#2a1a0a"
          style="transform-origin:3px 0;animation:za-leg-b .35s ease-in-out infinite"/>
        <rect x="5"  y="0" width="6" height="16" rx="3" fill="#2a1a0a"
          style="transform-origin:3px 0;animation:za-leg-f .35s ease-in-out infinite"/>
      </g>
      <!-- Körper -->
      <ellipse cx="44" cy="34" rx="30" ry="16" fill="#f5f0e8"/>
      <!-- Flecken -->
      <ellipse cx="35" cy="30" rx="9"  ry="7"  fill="#2a1a0a" opacity=".85"/>
      <ellipse cx="55" cy="36" rx="7"  ry="5"  fill="#2a1a0a" opacity=".7"/>
      <!-- Hals -->
      <ellipse cx="18" cy="26" rx="8" ry="10" fill="#f0ebe0"/>
      <!-- Kopf -->
      <ellipse cx="10" cy="18" rx="10" ry="8" fill="#f0ebe0"/>
      <!-- Schnauze -->
      <ellipse cx="4" cy="22" rx="5" ry="4" fill="#e8d8c8"/>
      <circle  cx="3" cy="21" r="1.2" fill="#3a2010"/>
      <circle  cx="6" cy="22" r="1.2" fill="#3a2010"/>
      <!-- Auge -->
      <circle cx="7" cy="15" r="2.5" fill="#1a0a00"/>
      <circle cx="6.5" cy="14.5" r=".8" fill="#fff" opacity=".9"/>
      <!-- Hörner -->
      <path d="M10,11 Q8,6 12,8" stroke="#c8a060" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M16,10 Q18,5 14,7" stroke="#c8a060" stroke-width="2" fill="none" stroke-linecap="round"/>
      <!-- Ohr -->
      <ellipse cx="18" cy="12" rx="4" ry="3" fill="#e8c8a0" transform="rotate(-20,18,12)"/>
      <!-- Euter -->
      <ellipse cx="38" cy="48" rx="8" ry="5" fill="#f0c0b0"/>
      <!-- Schwanz -->
      <path d="M72,30 Q82,20 78,12" stroke="#c8b890" stroke-width="3" fill="none"
        stroke-linecap="round" style="transform-origin:72px 30px;animation:za-tail .4s ease-in-out infinite"/>
      <ellipse cx="78" cy="11" rx="5" ry="4" fill="#8a7850"/>
      <!-- Glocke -->
      <rect x="15" y="28" width="6" height="7" rx="1" fill="#c8a030"/>
      <ellipse cx="18" cy="35" rx="3" ry="2" fill="#a08020"/>
    </svg>
  </div>

  <!-- HIRTE SVG - läuft von rechts nach links, etwas langsamer = jagt -->
  <div id="za-hirte" style="position:absolute;bottom:27%;right:0;
    animation:za-hirte ${DURATION * 0.92}ms cubic-bezier(.2,.0,.2,1) both">
    <svg width="50" height="80" viewBox="0 0 50 80" xmlns="http://www.w3.org/2000/svg">
      <!-- Beine -->
      <rect x="17" y="55" width="7" height="22" rx="3.5" fill="#2a3a6a"
        style="transform-origin:20px 55px;animation:za-leg-f .3s ease-in-out infinite"/>
      <rect x="26" y="55" width="7" height="22" rx="3.5" fill="#1a2a5a"
        style="transform-origin:29px 55px;animation:za-leg-b .3s ease-in-out infinite"/>
      <!-- Körper -->
      <rect x="14" y="32" width="22" height="26" rx="5" fill="#4a6a2a"/>
      <!-- Hemd/Weste Detail -->
      <rect x="19" y="32" width="12" height="26" rx="2" fill="#5a7a3a" opacity=".5"/>
      <!-- Arme -->
      <rect x="6"  y="33" width="7" height="18" rx="3.5" fill="#4a6a2a"
        style="transform-origin:9px 33px;animation:za-arm-f .3s ease-in-out infinite"/>
      <!-- Arm mit Stock ausgestreckt -->
      <rect x="37" y="28" width="7" height="20" rx="3.5" fill="#4a6a2a"
        style="transform-origin:40px 33px;transform:rotate(-35deg)"/>
      <!-- Stock/Hirtenstab -->
      <path d="M46,18 L38,45" stroke="#8a6030" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M46,18 Q50,14 47,11" stroke="#8a6030" stroke-width="2" fill="none" stroke-linecap="round"/>
      <!-- Hände -->
      <circle cx="9"  cy="50" r="4" fill="#c8a080"/>
      <circle cx="40" cy="45" r="4" fill="#c8a080"/>
      <!-- Hals -->
      <rect x="20" y="24" width="10" height="10" rx="3" fill="#c8a080"/>
      <!-- Kopf -->
      <ellipse cx="25" cy="18" rx="10" ry="11" fill="#c8a080"/>
      <!-- Haare -->
      <ellipse cx="25" cy="9"  rx="10" ry="5"  fill="#3a2010"/>
      <!-- Augen -->
      <circle cx="20" cy="17" r="2" fill="#1a0a00"/>
      <circle cx="19.5" cy="16.5" r=".6" fill="#fff"/>
      <!-- Mund (lächelnd - er hat Spaß beim Nachjagen) -->
      <path d="M21,23 Q25,27 29,23" stroke="#8a5030" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <!-- Hut (Tirolerhut) -->
      <ellipse cx="25" cy="9"  rx="14" ry="4"  fill="#2a3a10"/>
      <ellipse cx="25" cy="7"  rx="9"  ry="6"  fill="#2a3a10"/>
      <!-- Hutband -->
      <path d="M16,8 Q25,5 34,8" stroke="#c8a030" stroke-width="1.5" fill="none"/>
      <!-- Feder am Hut -->
      <path d="M33,5 Q38,-2 35,8" stroke="#e8c060" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>
  </div>

  <!-- TITEL -->
  <div style="position:absolute;top:12%;left:0;right:0;text-align:center;
    animation:za-sky ${DURATION}ms ease both">
    <div style="font-size:min(11vw,3.2rem);font-weight:900;letter-spacing:.06em;
      color:#e8f8d0;text-shadow:0 2px 20px rgba(0,80,0,.8),0 0 60px rgba(100,220,50,.3);
      animation:za-title ${DURATION}ms cubic-bezier(.16,1,.3,1) both">
      ZÄHLUNG
    </div>
    <div style="font-size:min(3vw,.78rem);letter-spacing:.3em;color:#a0d870;
      margin-top:.3rem;animation:za-sub ${DURATION}ms ease both">
      ${almName}
    </div>
  </div>

  <!-- TIERANZAHL -->
  <div style="position:absolute;bottom:8%;left:0;right:0;text-align:center;
    font-size:.7rem;letter-spacing:.2em;color:#a0d870;
    animation:za-count ${DURATION}ms ease both">
    ${tierCount} TIERE · HEUTE
  </div>

  <!-- FORTSCHRITTSBALKEN -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:rgba(100,200,50,.15)">
    <div style="height:100%;background:linear-gradient(90deg,#2a7a10,#5dc922,#a0e860);
      box-shadow:0 0 10px #5dc922;animation:za-bar ${DURATION}ms linear both"></div>
  </div>`;

  document.body.appendChild(ov);

  let dismissed = false;
  function dismiss() {
    if(dismissed) return;
    dismissed = true;
    ov.classList.add('za-dismissing');
    setTimeout(() => {
      ov.remove();
      _zaehlAnimShown = false;
      if(cb) cb();
    }, 340);
  }

  ov.addEventListener('pointerdown', dismiss);
  setTimeout(dismiss, DURATION);
};

const _origNav2 = window.navigate;
window.navigate = function(view) {
  if(view === 'zaehlung' && currentView !== 'zaehlung') {
    window._showZaehlungAnim(() => _origNav2(view));
    setTimeout(() => _origNav2(view), 300);
    return;
  }
  _origNav2(view);
};

function renderSuche() {
  return `
    <div class="page-header"><h2>🔍 Suche</h2></div>
    <div class="search-bar" style="margin-bottom:.6rem">
      <input id="suche-input" class="search-inp" placeholder="Kühe, Bauern, Behandlungen, Journal…"
        oninput="globalSearch(this.value)" autofocus
        style="font-size:1rem;padding:.65rem .9rem" />
    </div>
    <div id="suche-results">
      <div style="text-align:center;color:var(--text3);font-size:.85rem;margin-top:2rem;padding:1rem">
        <div style="font-size:2rem;margin-bottom:.5rem">🔍</div>
        Suchbegriff eingeben…<br>
        <span style="font-size:.75rem">Kühe · Bauern · Behandlungen · Besamungen · Milch · Journal · Kontakte</span>
      </div>
    </div>
  `;
}

window.globalSearch = function(q) {
  const el = document.getElementById('suche-results');
  if(!el) return;
  q = (q||'').trim().toLowerCase();
  if(q.length < 1) {
    el.innerHTML = '<div style="text-align:center;color:var(--text3);font-size:.85rem;margin-top:2rem">Suchbegriff eingeben…</div>';
    return;
  }

  const results = [];

  // ── Kühe ──
  Object.entries(kuehe).forEach(([id, k]) => {
    const score = matchScore(q, [k.nr, k.name, k.bauer, k.rasse, k.gruppe, k.ohrmarke, k.notiz]);
    if(score > 0) results.push({
      type:'kuh', score, id,
      title: `#${k.nr} ${k.name||'–'}`,
      sub: [k.bauer, k.rasse, k.gruppe, k.ohrmarke].filter(Boolean).join(' · '),
      icon:'🐄',
      action: `showKuhDetail('${id}')`,
      tag: k.almStatus==='oben' ? {label:'auf Alm', color:'green'} : null
    });
  });

  // ── Bauern ──
  Object.entries(bauern).forEach(([id, b]) => {
    const score = matchScore(q, [b.name, b.betrieb, b.tel, b.email, b.adresse, b.plzOrt]);
    if(score > 0) {
      // Auch Kühe dieses Bauern anzeigen
      const kueheDesBauern = Object.values(kuehe).filter(k => k.bauer === b.name);
      results.push({
        type:'bauer', score, id,
        title: b.name,
        sub: [
          b.betrieb ? 'LFBIS: '+b.betrieb : null,
          b.tel,
          kueheDesBauern.length + ' Kühe'
        ].filter(Boolean).join(' · '),
        icon:'👤',
        action: `showBauerDetailPage('${id}')`,
        tag: null
      });
    }
  });

  // ── Behandlungen ──
  Object.entries(behandlungen).forEach(([id, b]) => {
    const k = kuehe[b.kuhId];
    const score = matchScore(q, [b.diagnose, b.medikament, b.tierarzt, b.dosis, b.notiz, k?.name, k?.nr]);
    if(score > 0) results.push({
      type:'behandlung', score, id,
      title: b.diagnose || b.medikament || 'Behandlung',
      sub: [
        k ? `#${k.nr} ${k.name}` : '–',
        b.medikament,
        b.datum ? new Date(b.datum).toLocaleDateString('de-AT') : null
      ].filter(Boolean).join(' · '),
      icon:'⚕',
      action: `navigate('behandlung')`,
      tag: b.aktiv ? {label:'aktiv', color:'red'} : null
    });
  });

  // ── Besamungen ──
  Object.entries(besamungen).forEach(([id, bs]) => {
    const k = kuehe[bs.kuhId];
    const score = matchScore(q, [bs.stier, bs.samen, bs.status, bs.notiz, k?.name, k?.nr, bs.besamungstechniker]);
    if(score > 0) results.push({
      type:'besamung', score, id,
      title: bs.stier || bs.samen || 'Besamung',
      sub: [
        k ? `#${k.nr} ${k.name}` : '–',
        bs.status,
        bs.datum ? new Date(bs.datum).toLocaleDateString('de-AT') : null
      ].filter(Boolean).join(' · '),
      icon:'🐮',
      action: `navigate('besamung')`,
      tag: bs.status==='tragend' ? {label:'tragend', color:'green'} : null
    });
  });

  // ── Milch ──
  const milchMatches = [];
  Object.entries(milchEintraege).forEach(([id, m]) => {
    if(!m.datum) return;
    const datStr = new Date(m.datum).toLocaleDateString('de-AT');
    const score = matchScore(q, [datStr, m.gesamt?.toString()]);
    if(score > 0 && milchMatches.length < 3) milchMatches.push({
      type:'milch', score, id,
      title: `${m.gesamt} L Milch`,
      sub: datStr + (m.zeit==='abend' ? ' · Abends' : ' · Morgens'),
      icon:'🥛',
      action: `navigate('milch')`,
      tag: null
    });
  });
  results.push(...milchMatches);

  // ── Kontakte ──
  Object.entries(kontakte).forEach(([id, k]) => {
    const score = matchScore(q, [k.name, k.tel, k.kategorie, k.notiz]);
    if(score > 0) results.push({
      type:'kontakt', score, id,
      title: k.name,
      sub: [k.kategorie, k.tel].filter(Boolean).join(' · '),
      icon:'📞',
      action: `navigate('kontakte')`,
      tag: null
    });
  });

  // ── Journal ──
  Object.entries(journal||{}).forEach(([id, j]) => {
    const score = matchScore(q, [j.text, j.wetter, j.datum ? new Date(j.datum).toLocaleDateString('de-AT') : null]);
    if(score > 0) results.push({
      type:'journal', score, id,
      title: j.datum ? new Date(j.datum).toLocaleDateString('de-AT', {day:'numeric',month:'short'}) : 'Journal',
      sub: (j.text||'').slice(0,60) + ((j.text||'').length>60?'…':''),
      icon:'📓',
      action: `navigate('journal')`,
      tag: null
    });
  });

  // Sortieren: Bauer zuerst wenn gesucht, dann Kühe des gefundenen Bauers, dann Rest
  const typePrio = {bauer:1,kuh:2,behandlung:3,besamung:4,kontakt:5,milch:6,journal:7};
  results.sort((a,b) => {
    // Bauer immer ganz oben
    if(a.type==='bauer' && b.type!=='bauer') return -1;
    if(b.type==='bauer' && a.type!=='bauer') return 1;
    // Kühe eines gefundenen Bauers direkt nach dem Bauer
    const bauerNames = results.filter(r=>r.type==='bauer').map(r=>r.title);
    const aIsBauerKuh = a.type==='kuh' && bauerNames.some(n=>a.sub.includes(n));
    const bIsBauerKuh = b.type==='kuh' && bauerNames.some(n=>b.sub.includes(n));
    if(aIsBauerKuh && !bIsBauerKuh) return -1;
    if(bIsBauerKuh && !aIsBauerKuh) return 1;
    return b.score - a.score || (typePrio[a.type]||9) - (typePrio[b.type]||9);
  });

  if(results.length === 0) {
    el.innerHTML = `<div style="text-align:center;color:var(--text3);font-size:.85rem;margin-top:2rem">
      Keine Ergebnisse für „${q}"
    </div>`;
    return;
  }

  // Wenn Bauer gefunden: Kühe dieses Bauers direkt darunter anzeigen (nicht separat gruppiert)
  const bauerResults = results.filter(r => r.type === 'bauer');
  const bauerNamen = bauerResults.map(r => r.title);
  
  // Gruppieren nach Typ - aber Kühe eines Bauers unter den Bauer schieben
  const groups = {};
  results.forEach(r => {
    // Kühe die einem gefundenen Bauer gehören → unter "bauer" gruppieren
    if(r.type==='kuh' && bauerNamen.some(n => r.sub.includes(n))) {
      if(!groups['bauer_kuehe']) groups['bauer_kuehe'] = [];
      groups['bauer_kuehe'].push(r);
      return;
    }
    if(!groups[r.type]) groups[r.type] = [];
    groups[r.type].push(r);
  });

  const typeLabels = {bauer:'Bauern',bauer_kuehe:'Kühe',kuh:'Kühe',behandlung:'Behandlungen',besamung:'Besamungen',milch:'Milch',kontakt:'Kontakte',journal:'Journal'};
  const typeOrder = ['bauer','bauer_kuehe','kuh','behandlung','besamung','kontakt','milch','journal'];
  const orderedGroups = typeOrder.map(t => [t, groups[t]]).filter(([,v])=>v&&v.length);

  el.innerHTML = orderedGroups.map(([type, items]) => `
    <div class="section-title" style="${type==='bauer_kuehe'?'margin-top:0;padding-top:0;border-top:none;padding-left:2.5rem':''}">${typeLabels[type]||type} (${items.length})</div>
    ${items.slice(0,8).map(r => `
      <div class="list-card" onclick="${r.action}" style="cursor:pointer">
        <div class="list-card-left">
          <div style="width:34px;height:34px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">${r.icon}</div>
          <div>
            <div class="list-card-title">${highlightMatch(r.title, q)}</div>
            <div class="list-card-sub">${r.sub}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:.4rem">
          ${r.tag ? `<span class="tag tag-${r.tag.color}">${r.tag.label}</span>` : ''}
          <span class="chevron">›</span>
        </div>
      </div>
    `).join('')}
  `).join('');
};

function matchScore(q, fields) {
  const terms = q.split(/\s+/).filter(Boolean);
  let score = 0;
  fields.forEach(f => {
    if(!f) return;
    const fLow = String(f).toLowerCase();
    terms.forEach(term => {
      if(fLow === term) score += 10;           // Exakter Match
      else if(fLow.startsWith(term)) score += 6; // Beginnt damit
      else if(fLow.includes(term)) score += 3;   // Enthält
    });
  });
  return score;
}

function highlightMatch(text, q) {
  if(!text || !q) return text;
  try {
    const terms = q.split(/\s+/).filter(t => t.length > 1);
    let result = String(text);
    terms.forEach(term => {
      const re = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'gi');
      result = result.replace(re, '<mark style="background:rgba(212,168,75,.35);color:var(--gold);border-radius:2px;padding:0 2px">$1</mark>');
    });
    return result;
  } catch(e) { return text; }
}


// ── Komma → Punkt Konvertierung für alle Dezimalfelder ──
document.addEventListener('input', function(e) {
  const inp = e.target;
  if(inp.inputMode === 'decimal' || inp.classList.contains('kuh-liter')) {
    const pos = inp.selectionStart;
    const hadComma = inp.value.includes(',');
    inp.value = inp.value.replace(',', '.');
    if(hadComma) {
      try { inp.setSelectionRange(pos, pos); } catch(x){}
    }
  }
}, true);

// Wrap parseFloat to handle commas
const _origParseFloat = window.parseFloat;
window.parseFloat = function(v) {
  if(typeof v === 'string') v = v.replace(',', '.');
  return _origParseFloat(v);
};

window.editMilchEintrag = function(id) {
  const e = milchEintraege[id];
  if(!e) return;
  
  // Open milch form pre-filled
  const ov = document.getElementById('milch-form-overlay');
  if(!ov) return;
  
  // Set edit ID
  let eid = document.getElementById('m-edit-id');
  if(!eid) {
    eid = document.createElement('input');
    eid.type = 'hidden'; eid.id = 'm-edit-id';
    ov.querySelector('.form-body').appendChild(eid);
  }
  eid.value = id;
  
  // Fill form
  document.getElementById('m-datum').value = isoDate(new Date(e.datum));
  
  // Zeit
  const zeitVal = e.zeit || 'morgen';
  document.getElementById('m-zeit').value = zeitVal;
  document.querySelector('#m-zeit-morgen')?.classList.toggle('active', zeitVal === 'morgen');
  document.querySelector('#m-zeit-abend')?.classList.toggle('active', zeitVal === 'abend');
  
  // Modus
  const modus = e.art === 'gesamt' ? 'gesamt' : 'prokuh';
  setMilchModus(modus);
  
  // Molkerei + Notiz
  const molkereiEl = document.getElementById('m-molkerei');
  if(molkereiEl) molkereiEl.checked = e.molkerei || false;
  const notizEl = document.getElementById('m-notiz');
  if(notizEl) notizEl.value = e.notiz || '';
  
  if(modus === 'gesamt') {
    const gestEl = document.getElementById('m-gesamt');
    if(gestEl) gestEl.value = e.gesamt || '';
  } else if(e.prokuh) {
    // Fill per-cow values
    document.querySelectorAll('.kuh-liter').forEach(inp => {
      inp.value = '';
      const row = inp.closest('.milch-kuh-row');
      if(row) { row.style.background=''; inp.closest('.milch-kuh-row')?.querySelector('.nr-badge')?.style && (inp.closest('.milch-kuh-row').querySelector('.nr-badge').style.background=''); }
    });
    Object.entries(e.prokuh).forEach(([kuhId, liter]) => {
      const inp = document.querySelector(`.kuh-liter[data-id="${kuhId}"]`);
      if(inp) {
        inp.value = liter;
        onMilchInput(inp);
      }
    });
  }
  
  // Update title
  const titleEl = document.getElementById('m-form-title');
  if(titleEl) titleEl.textContent = '✎ Milcheintrag bearbeiten';
  
  ov.style.display = 'flex';
};

// saveMilch – handles both new entry and edit
window.saveMilch = async function() {
  const datum = document.getElementById('m-datum')?.value;
  if(!datum) { alert('Datum fehlt'); return; }
  const prokuhBlock = document.getElementById('m-prokuh-block');
  const modus = prokuhBlock && prokuhBlock.style.display !== 'none' ? 'prokuh' : 'gesamt';
  const zeit = document.getElementById('m-zeit')?.value || 'morgen';
  const molkerei = document.getElementById('m-molkerei')?.checked || false;
  const notiz = document.getElementById('m-notiz')?.value.trim() || '';
  let gesamt = 0, prokuh = {};
  if(modus === 'prokuh') {
    document.querySelectorAll('.kuh-liter').forEach(inp => {
      const l = parseFloat((inp.value||'').replace(',','.')) || 0;
      if(l > 0) { prokuh[inp.dataset.id] = l; gesamt += l; }
    });
    if(Object.keys(prokuh).length === 0) { alert('Bitte mindestens eine Kuh eintragen'); return; }
  } else {
    gesamt = parseFloat((document.getElementById('m-gesamt')?.value||'').replace(',','.')) || 0;
    if(!gesamt) { alert('Bitte Menge eingeben'); return; }
  }
  gesamt = Math.round(gesamt * 10) / 10;
  const datumTs = new Date(datum + 'T12:00').getTime();

  const editMilchId = document.getElementById('m-edit-id')?.value;
  if(editMilchId) {
    await update(ref(db, 'milch/' + editMilchId), {
      datum: datumTs, art: modus, zeit, gesamt,
      prokuh: modus==='prokuh' ? prokuh : null, molkerei, notiz, updatedAt: Date.now()
    });
    const eid = document.getElementById('m-edit-id'); if(eid) eid.value='';
    const titleEl = document.getElementById('m-form-title'); if(titleEl) titleEl.textContent='🥛 Milch erfassen';
  } else {
    await push(ref(db,'milch'), {
      datum: datumTs, art: modus, zeit, gesamt,
      prokuh: modus==='prokuh' ? prokuh : null, molkerei, notiz, createdAt: Date.now()
    });
  }
  window.showSaveToast && showSaveToast('Milch gespeichert');
  if(navigator.vibrate) navigator.vibrate([30,10,30]);

  // Warnsystem: nach Speichern prüfen und im localStorage merken
  if(modus === 'prokuh') {
    const prozent = parseInt(localStorage.getItem('milchWarnProzent'))||50;
    const warnungen = [];
    Object.entries(prokuh).forEach(([kuhId, liter]) => {
      const k = kuehe[kuhId];
      if(k?.laktation === 'trocken' || k?.laktation === 'trockengestellt') return;
      const schnitt = window.getMilchDurchschnitt(kuhId);
      if(schnitt === null) return;
      const unter = schnitt * (1 - prozent/100);
      const ober  = schnitt * (1 + prozent/100);
      if(liter < unter) warnungen.push({kuhId, kuhNr:k?.nr, kuhName:k?.name, liter, schnitt, typ:'wenig'});
      if(liter > ober)  warnungen.push({kuhId, kuhNr:k?.nr, kuhName:k?.name, liter, schnitt, typ:'viel'});
    });
    if(warnungen.length > 0) {
      localStorage.setItem('milchWarnungen', JSON.stringify({datum: datumTs, warnungen}));
    } else {
      localStorage.removeItem('milchWarnungen');
    }
  }

  closeForm('milch-form-overlay');
};

window.loescheAlleDaten = async function() {
  // Triple confirmation
  if(!confirm('⚠ ACHTUNG\n\nALLE Daten werden unwiderruflich gelöscht!\n\nKühe, Bauern, Milch, Behandlungen, Besamungen, Kraftfutter, Saison, Journal, Weide, Zählung, Chat...\n\nWirklich fortfahren?')) return;
  if(!confirm('Bist du SICHER?\n\nDiese Aktion kann NICHT rückgängig gemacht werden!')) return;
  
  const eingabe = prompt('Zur Bestätigung "LÖSCHEN" eingeben:');
  if(eingabe !== 'LÖSCHEN') { alert('Abgebrochen.'); return; }
  
  const paths = ['kuehe','behandlungen','besamungen','milch','weideTage','weiden','bauern',
    'saison','journal','kontakte','gruppen','fotos','herde_session','chat','kraftfutter',
    'zaehlung','zaehlVerlauf'];
  
  for(const p of paths) {
    try { await remove(ref(db, p)); } catch(e) {}
  }
  
  // Clear localStorage too
  const hp_v = localStorage.getItem('hp_version');
  localStorage.clear();
  if(hp_v) localStorage.setItem('hp_version', hp_v);
  
  alert('✓ Alle Daten gelöscht.\nApp wird neu geladen.');
  location.reload();
};

// ── Verbindungsstatus ──
let _warOffline = false;
let _offlineChangesPending = false;
function updateVerbindungsDot(online) {
  const dot = document.getElementById('status-dot');
  if(!dot) return;
  if(online) {
    dot.style.background = 'var(--green)';
    dot.style.boxShadow = '0 0 6px var(--green)';
    dot.title = 'Online – Firebase verbunden';
    // Warnung wenn offline Änderungen möglich waren
    if(_warOffline && _offlineChangesPending) {
      const banner = document.getElementById('offline-sync-banner');
      if(banner) {
        banner.style.display = '';
        setTimeout(()=>{ if(banner) banner.style.display='none'; }, 8000);
      }
      _offlineChangesPending = false;
    }
    _warOffline = false;
  } else {
    dot.style.background = 'var(--red)';
    dot.style.boxShadow = '0 0 6px var(--red)';
    dot.title = 'Offline – keine Verbindung';
    _warOffline = true;
  }
}
window.addEventListener('online',  () => updateVerbindungsDot(true));
window.addEventListener('offline', () => { updateVerbindungsDot(false); _offlineChangesPending = true; });

window.showVerbindungsInfo = function() {
  const online = navigator.onLine;
  showPopupHTML(
    '<div style="text-align:center;padding:.5rem 0">' +
    '<div style="font-size:2rem;margin-bottom:.5rem">' + (online?'🟢':'🔴') + '</div>' +
    '<div style="font-weight:bold;font-size:1rem;color:' + (online?'var(--green)':'var(--red)') + '">' + (online?'Online':'Offline') + '</div>' +
    '<div style="font-size:.8rem;color:var(--text3);margin-top:.4rem">' + (online?'Firebase verbunden · Daten werden synchronisiert':'Keine Internetverbindung · Daten werden lokal gespeichert und später synchronisiert') + '</div>' +
    '</div>' +
    '<button class="btn-secondary" style="width:100%;margin-top:.8rem" onclick="closePopup()">OK</button>'
  );
};

// ── Speichern-Feedback (Vibration + Toast) ──
window.showSaveToast = function(msg) {
  if(typeof window.haptic === 'function') window.haptic('save');
  let toast = document.getElementById('save-toast');
  if(!toast) {
    toast = document.createElement('div');
    toast.id = 'save-toast';
    toast.style.cssText = 'position:fixed;bottom:calc(var(--nav-h) + var(--safe-b) + 12px);left:50%;transform:translateX(-50%);background:rgba(77,184,78,.95);color:#fff;padding:.4rem 1.2rem;border-radius:20px;font-size:.82rem;font-weight:bold;z-index:1000;pointer-events:none;transition:opacity .3s';
    document.body.appendChild(toast);
  }
  toast.textContent = '✓ ' + (msg || 'Gespeichert');
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1800);
};

window._fabOpen = false;
window.toggleFab = function() {
  const actions = document.getElementById('fab-actions');
  const btn = document.getElementById('fab-main');
  window._fabOpen = !window._fabOpen;
  if(actions) actions.style.display = window._fabOpen ? 'flex' : 'none';
  if(btn) btn.style.transform = window._fabOpen ? 'rotate(45deg)' : '';
  if(navigator.vibrate && window._fabOpen) navigator.vibrate(15);
};
window.closeFab = function() {
  const actions = document.getElementById('fab-actions');
  const btn = document.getElementById('fab-main');
  window._fabOpen = false;
  if(actions) actions.style.display = 'none';
  if(btn) btn.style.transform = '';
};
// Close FAB when navigating
const _navBeforeFab = window.navigate;
window.navigate = function(v) {
  window.closeFab && window.closeFab();
  _navBeforeFab(v);
};

// ── Wetter (Open-Meteo, kostenlos, kein API-Key) ──
const WETTER_ORTE = {
  'Innsbruck':   {lat:47.2692, lon:11.4041},
  'Lienz':       {lat:46.8289, lon:12.7693},
  'Imst':        {lat:47.2448, lon:10.7397},
  'Landeck':     {lat:47.1408, lon:10.5650},
  'Kitzbühel':   {lat:47.4467, lon:12.3926},
  'Reutte':      {lat:47.4833, lon:10.7167},
  'Schwaz':      {lat:47.3531, lon:11.7092},
  'Bregenz':     {lat:47.5031, lon:9.7471},
  'Feldkirch':   {lat:47.2372, lon:9.5973},
  'Bludenz':     {lat:47.1528, lon:9.8218},
  'Klagenfurt':  {lat:46.6228, lon:14.3053},
  'Villach':     {lat:46.6133, lon:13.8558},
  'Salzburg':    {lat:47.8095, lon:13.0550},
  'Zell am See': {lat:47.3256, lon:12.7956},
  'St. Johann':  {lat:47.5261, lon:12.4228},
};

const WMO_ICONS = {
  0:'☀️', 1:'🌤️', 2:'⛅', 3:'☁️',
  45:'🌫️', 48:'🌫️',
  51:'🌦️', 53:'🌦️', 55:'🌦️',
  61:'🌧️', 63:'🌧️', 65:'🌧️',
  71:'🌨️', 73:'🌨️', 75:'❄️',
  77:'❄️',
  80:'🌦️', 81:'🌧️', 82:'⛈️',
  85:'🌨️', 86:'❄️',
  95:'⛈️', 96:'⛈️', 99:'⛈️',
};
const WMO_DESC = {
  0:'Klar', 1:'Überwiegend klar', 2:'Teils bewölkt', 3:'Bedeckt',
  45:'Nebel', 48:'Nebel',
  51:'Leichter Nieselregen', 53:'Nieselregen', 55:'Starker Nieselregen',
  61:'Leichter Regen', 63:'Regen', 65:'Starker Regen',
  71:'Leichter Schnee', 73:'Schnee', 75:'Starker Schnee',
  80:'Schauer', 81:'Starke Schauer', 82:'Sehr starke Schauer',
  95:'Gewitter', 96:'Gewitter mit Hagel', 99:'Starkes Gewitter',
};

window.ladeWetter = async function() {
  const ort = localStorage.getItem('wetterOrt') || 'Innsbruck';
  const coords = WETTER_ORTE[ort];
  if(!coords) return;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&wind_speed_unit=kmh&timezone=Europe%2FVienna`;
    const res = await fetch(url);
    const data = await res.json();
    const c = data.current;
    window._wetterData = {
      temp: Math.round(c.temperature_2m),
      feels: Math.round(c.apparent_temperature),
      wind: Math.round(c.wind_speed_10m),
      icon: WMO_ICONS[c.weather_code] || '⛅',
      desc: WMO_DESC[c.weather_code] || '',
      ort,
      updated: new Date().toLocaleTimeString('de-AT', {hour:'2-digit',minute:'2-digit'}) + ' Uhr',
      ts: Date.now()
    };
    // Refresh dashboard
    if(currentView === 'dashboard') render();
    else {
      const el = document.getElementById('dashboard-wetter');
      if(el && window._wetterData) {
        const w = window._wetterData;
        el.innerHTML = `<div style="background:linear-gradient(135deg,rgba(30,80,140,.25),rgba(30,80,140,.1));border:1px solid rgba(80,140,200,.3);border-radius:var(--radius-sm);padding:.6rem 1rem;display:flex;align-items:center;gap:.8rem">
          <div style="font-size:2rem">${w.icon}</div>
          <div style="flex:1">
            <div style="font-size:1.1rem;color:#7acbff;font-weight:bold">${w.temp}°C <span style="font-size:.75rem;color:var(--text3)">${w.desc}</span></div>
            <div style="font-size:.7rem;color:var(--text3)">${w.ort} · Gefühlt ${w.feels}°C · Wind ${w.wind} km/h</div>
          </div>
          <div style="text-align:right;font-size:.7rem;color:var(--text3)">${w.updated}</div>
        </div>`;
      }
    }
  } catch(e) { console.warn('Wetter:', e); }
};

// Auto-load Wetter on start
window.addEventListener('load', () => {
  setTimeout(() => ladeWetter(), 2000);
  // Refresh every 30 min
  setInterval(() => ladeWetter(), 30 * 60 * 1000);
});
function renderMilch() {
  const eintraege=Object.entries(milchEintraege).sort((a,b)=>b[1].datum-a[1].datum);
  const letzten14=eintraege.slice(0,14);
  const gesamtL14=letzten14.reduce((s,[,e])=>s+(e.gesamt||0),0);
  const gesamtAll=eintraege.reduce((s,[,e])=>s+(e.gesamt||0),0);
  const proMonat={};
  eintraege.forEach(([,e])=>{if(!e.datum)return;const m=new Date(e.datum).toLocaleDateString('de-AT',{month:'short',year:'numeric'});proMonat[m]=(proMonat[m]||0)+(e.gesamt||0);});
  const kueheOben=Object.entries(kuehe).sort((a,b)=>{const nA=parseInt(a[1].nr)||0,nB=parseInt(b[1].nr)||0;return nA-nB;});

  // Saison-Chart Daten: Tagessummen chronologisch
  const tagesMilch={};
  [...eintraege].reverse().forEach(([,e])=>{
    if(!e.datum) return;
    const tag=new Date(e.datum).toISOString().slice(0,10);
    tagesMilch[tag]=(tagesMilch[tag]||0)+(e.gesamt||0);
  });
  const chartTage=Object.entries(tagesMilch).sort((a,b)=>a[0].localeCompare(b[0]));

  // Build chart JSON for canvas
  const chartJson=JSON.stringify(chartTage.map(([d,l])=>({d:new Date(d+'T12:00').getTime(),l:Math.round(l*10)/10})));

  return `
    <div class="page-header"><h2>🥛 Milchleistung</h2><button class="btn-primary" onclick="showMilchForm()">+ Eintrag</button></div>
    <div class="stats-grid" style="grid-template-columns:1fr 1fr 1fr">
      <div class="stat-card"><div class="stat-icon" style="font-size:.9rem">Ø/Tag</div><div class="stat-num" style="font-size:1.4rem">${letzten14.length?Math.round(gesamtL14/letzten14.length):'–'}L</div><div class="stat-label">14 Tage</div></div>
      <div class="stat-card"><div class="stat-icon" style="font-size:.9rem">Gesamt</div><div class="stat-num" style="font-size:1.4rem">${Math.round(gesamtAll)}L</div><div class="stat-label">Saison</div></div>
      <div class="stat-card" onclick="exportMilchMolkerei()"><div class="stat-icon">📤</div><div class="stat-num" style="font-size:.9rem">Export</div><div class="stat-label">→ Molkerei</div></div>
    </div>

    ${chartTage.length >= 2 ? `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:14px;padding:.8rem .8rem .4rem;margin-bottom:.8rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <div style="font-size:.68rem;color:var(--text3);font-weight:700;letter-spacing:.06em">📈 MILCHLEISTUNG SAISON</div>
        <button onclick="window._milchPrognoseSaison=!window._milchPrognoseSaison;render()" 
          style="font-size:.65rem;background:${window._milchPrognoseSaison?'rgba(212,168,75,.2)':'var(--bg2)'};border:1px solid ${window._milchPrognoseSaison?'var(--gold)':'var(--border)'};color:${window._milchPrognoseSaison?'var(--gold)':'var(--text3)'};border-radius:8px;padding:2px 7px;cursor:pointer">
          ${window._milchPrognoseSaison?'✓':'+'} 30-Tage-Prognose
        </button>
      </div>
      <canvas id="milch-saison-canvas" height="130" style="width:100%;display:block;border-radius:6px"></canvas>
      <div style="display:flex;justify-content:space-between;font-size:.62rem;color:var(--text3);margin-top:.3rem;padding:0 2px">
        <span>${new Date(chartTage[0][0]+'T12:00').toLocaleDateString('de-AT',{day:'numeric',month:'short'})}</span>
        <span style="color:var(--gold)">${chartTage.length} Messtage · Ø ${Math.round(gesamtAll/chartTage.length*10)/10}L</span>
        <span>${new Date(chartTage[chartTage.length-1][0]+'T12:00').toLocaleDateString('de-AT',{day:'numeric',month:'short'})}</span>
      </div>
      ${window._milchPrognoseSaison ? `
      <!-- Prognose-Info -->
      <div id="milch-prognose-info" style="margin-top:.5rem;padding:.5rem .6rem;background:rgba(212,168,75,.06);border:1px solid rgba(212,168,75,.2);border-radius:8px;font-size:.72rem">
        <div style="color:var(--gold);font-weight:700;margin-bottom:.2rem">📊 30-Tage-Prognose (lineare Regression)</div>
        <div id="milch-prognose-werte" style="color:var(--text2)">Wird berechnet…</div>
      </div>` : ''}
    </div>` : ''}

    ${Object.keys(proMonat).length?`<div class="section-title">Monatsübersicht</div><div class="card-section" style="padding:.5rem .8rem">${Object.entries(proMonat).slice(0,6).map(([m,l])=>`<div class="info-row"><span>${m}</span><b>${Math.round(l)} L</b></div>`).join('')}</div>`:''}

    <div class="section-title">Einträge <span style="color:var(--text3);font-size:.72rem;font-weight:400">· antippen für Details</span></div>
    <div class="card-list">
      ${eintraege.length ? eintraege.slice(0,50).map(([id,e])=>`
        <div class="list-card" onclick="showMilchDetail('${id}')" style="cursor:pointer;transition:background .15s" onpointerdown="this.style.background='rgba(212,168,75,.06)'" onpointerup="this.style.background=''" onpointerleave="this.style.background=''">
          <div class="list-card-left"><div>
            <div class="list-card-title">${new Date(e.datum).toLocaleDateString('de-AT',{weekday:'short',day:'numeric',month:'short'})}</div>
            <div class="list-card-sub">${e.art==='gesamt'?'Gesamtmenge':'Pro Kuh'} · ${e.zeit==='abend'?'🌇 Abends':'🌅 Morgens'}${e.molkerei?' · 🏭 Molkerei':''}${e.prokuh?' · '+Object.keys(e.prokuh).length+' Kühe':''}</div>
          </div></div>
          <div class="list-card-right">
            <span style="font-size:1.1rem;color:var(--gold);font-weight:bold">${e.gesamt} L</span>
            <button class="btn-xs-danger" onclick="event.stopPropagation();deleteMilch('${id}')">✕</button>
          </div>
        </div>`).join('') : `<div class="empty-state">Noch keine Einträge</div>`}
    </div>
    <div id="milch-form-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet" style="max-height:calc(100vh - var(--topbar-h,56px) - var(--nav-h,60px));overflow-y:auto">
        <div class="form-header">
          <h3 id="m-form-title">🥛 Milch erfassen</h3>
          <button class="close-btn" onclick="closeForm('milch-form-overlay')">✕</button>
        </div>
        <div class="form-body">
          <div style="display:grid;grid-template-columns:1fr auto;gap:.5rem;margin-bottom:.6rem">
            <input id="m-datum" class="inp" type="date" value="${isoDate(new Date())}" />
            <div style="display:flex;gap:.4rem">
              <button class="filter-chip active" id="m-zeit-morgen" onclick="selectMilchZeit('morgen',this)">🌅 Mo.</button>
              <button class="filter-chip" id="m-zeit-abend" onclick="selectMilchZeit('abend',this)">🌇 Ab.</button>
            </div>
          </div>
          <input type="hidden" id="m-zeit" value="morgen" />
          <div style="display:flex;gap:.4rem;margin-bottom:.8rem">
            <button id="m-tab-prokuh" onclick="setMilchModus('prokuh')" style="flex:1;padding:.45rem;border-radius:var(--radius-sm);border:2px solid var(--gold);background:var(--gold);color:#000;font-weight:bold;font-family:inherit;font-size:.82rem;cursor:pointer">Pro Kuh</button>
            <button id="m-tab-gesamt" onclick="setMilchModus('gesamt')" style="flex:1;padding:.45rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:transparent;color:var(--text3);font-family:inherit;font-size:.82rem;cursor:pointer">Gesamt</button>
          </div>
          <div id="m-prokuh-block">
            <div style="font-size:.72rem;color:var(--text3);margin-bottom:.5rem">Liter pro Kuh · 0 oder leer = nicht gemolken</div>
            <div id="m-bauer-filter" style="display:flex;gap:.3rem;flex-wrap:wrap;margin-bottom:.6rem">
              <button class="filter-chip active" onclick="filterMilchBauer('',this)">Alle</button>
              ${[...new Set(kueheOben.map(([,k])=>k.bauer).filter(Boolean))].map(b=>`<button class="filter-chip" onclick="filterMilchBauer('${b}',this)">${b.split(' ').pop()}</button>`).join('')}
            </div>
            <div id="m-kuh-liste">
              ${kueheOben.map(([id,k])=>`
                <div class="milch-kuh-row" data-bauer="${k.bauer||''}" style="display:flex;flex-direction:column;padding:.35rem 0;border-bottom:1px solid var(--border)">
                  <div style="display:flex;align-items:center;gap:.5rem">
                    <span class="nr-badge" style="min-width:38px;text-align:center">#${k.nr}</span>
                    <div style="flex:1;min-width:0">
                      <div style="font-size:.85rem;font-weight:bold;color:var(--text)">${k.name||'–'}</div>
                      <div style="font-size:.7rem;color:var(--text3)">${k.bauer||''}</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:.3rem">
                      <button onclick="milchStep('${id}',-1)" style="width:28px;height:28px;border-radius:50%;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit">−</button>
                      <input class="inp kuh-liter" data-id="${id}" data-nr="${k.nr}" data-name="${k.name||''}" placeholder="L" inputmode="decimal" style="width:5rem;min-width:5rem;text-align:center;font-size:1rem;font-weight:bold;padding:.4rem .3rem" oninput="onMilchInput(this);checkMilchWert(this,'${id}')" onfocus="this.select()" />
                      <button onclick="milchStep('${id}',1)" style="width:28px;height:28px;border-radius:50%;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit">+</button>
                    </div>
                  </div>
                  <div id="milch-warn-${id}" style="display:none;font-size:.68rem;font-weight:600;padding:.1rem .5rem .1rem 42px;animation:kd-in .2s ease both"></div>
                </div>`).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:.6rem;padding-top:.5rem;border-top:1px solid var(--border2)">
              <span style="font-size:.82rem;color:var(--text3)">Eingetragen: <span id="m-count">0</span> Kühe</span>
              <span style="font-size:1rem;color:var(--gold);font-weight:bold">∑ <span id="m-summe">0</span> L</span>
            </div>
          </div>
          <div id="m-gesamt-block" style="display:none">
            <label class="inp-label">Gesamtmenge Alm (Liter)</label>
            <input id="m-gesamt" class="inp" placeholder="z.B. 850" inputmode="decimal" style="font-size:1.2rem;text-align:center;font-weight:bold" />
          </div>
          <label class="checkbox-row" style="margin-top:.6rem"><input type="checkbox" id="m-molkerei" /> An Molkerei abgegeben</label>
          <textarea id="m-notiz" class="inp" rows="2" placeholder="Notizen" style="margin-top:.4rem"></textarea>
          <div class="form-actions" style="margin-top:.8rem">
            <button class="btn-secondary" onclick="closeForm('milch-form-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveMilch()">💾 Speichern</button>
          </div>
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
//  SAISONSTART-WIZARD
// ══════════════════════════════════════════════════════════════
window._wizardData = {};

window.showSaisonWizard = function() {
  window._wizardData = {
    schritt: 1,
    alm: saisonInfo?.alm || '',
    jahr: new Date().getFullYear(),
    auftrieb: isoDate(new Date()),
    ausgewaehlteKuehe: new Set(Object.keys(kuehe)), // alle vorausgewählt
  };
  renderWizard();
};

window.renderWizard = function() {
  let existing = document.getElementById('saison-wizard-ov');
  if(!existing) {
    existing = document.createElement('div');
    existing.id = 'saison-wizard-ov';
    existing.className = 'form-overlay';
    existing.style.cssText = 'display:flex;z-index:500';
    document.body.appendChild(existing);
  }

  const d = window._wizardData;
  const kuhListe = Object.entries(kuehe).sort((a,b)=>(parseInt(a[1].nr)||0)-(parseInt(b[1].nr)||0));
  const schritte = ['Alminfos','Kühe & Bauern','Behandlungen','Zusammenfassung'];

  // Progress bar
  const progressHTML = `
    <div style="display:flex;gap:0;margin-bottom:1.2rem">
      ${schritte.map((s,i)=>`
        <div style="flex:1;text-align:center">
          <div style="display:flex;align-items:center">
            ${i>0?`<div style="flex:1;height:2px;background:${i<d.schritt?'var(--green)':'var(--border)'}"></div>`:''}
            <div style="width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;margin:0 auto;flex-shrink:0;
              background:${i+1<d.schritt?'var(--green)':i+1===d.schritt?'var(--gold)':'var(--bg3)'};
              color:${i+1<=d.schritt?'#0a0800':'var(--text3)'};
              border:2px solid ${i+1<d.schritt?'var(--green)':i+1===d.schritt?'var(--gold)':'var(--border)'}">
              ${i+1<d.schritt?'✓':i+1}
            </div>
            ${i<schritte.length-1?`<div style="flex:1;height:2px;background:${i+1<d.schritt?'var(--green)':'var(--border)'}"></div>`:''}
          </div>
          <div style="font-size:.6rem;color:${i+1===d.schritt?'var(--gold)':'var(--text3)'};margin-top:.3rem">${s}</div>
        </div>`).join('')}
    </div>`;

  let inhalt = '';

  // ── Schritt 1: Alminfos ──
  if(d.schritt === 1) {
    inhalt = `
      <h3 style="color:var(--gold);margin-bottom:.2rem">⛰ Schritt 1: Alminfos</h3>
      <p style="font-size:.78rem;color:var(--text2);margin-bottom:.8rem">Grunddaten für die neue Saison.</p>
      <label class="inp-label">Almname *</label>
      <input id="wiz-alm" class="inp" placeholder="z.B. Nassereinalm" value="${d.alm}" />
      <label class="inp-label">Jahr</label>
      <input id="wiz-jahr" class="inp" type="number" value="${d.jahr}" inputmode="numeric" style="width:7rem" />
      <label class="inp-label">Auftriebsdatum</label>
      <input id="wiz-auftrieb" class="inp" type="date" value="${d.auftrieb}" />
      <div class="form-actions" style="margin-top:1rem">
        <button class="btn-secondary" onclick="document.getElementById('saison-wizard-ov').remove()">Abbrechen</button>
        <button class="btn-primary" onclick="wizardWeiter1()">Weiter →</button>
      </div>`;
  }

  // ── Schritt 2: Kühe & Bauern ──
  else if(d.schritt === 2) {
    const bauernListe = [...new Set(kuhListe.map(([,k])=>k.bauer).filter(Boolean))].sort();
    inhalt = `
      <h3 style="color:var(--gold);margin-bottom:.2rem">🐄 Schritt 2: Kühe & Bauern</h3>
      <p style="font-size:.78rem;color:var(--text2);margin-bottom:.5rem">Welche Kühe kommen auf die Alm? Alle sind vorausgewählt.</p>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <span style="font-size:.78rem;color:var(--gold);font-weight:600">${d.ausgewaehlteKuehe.size} / ${kuhListe.length} ausgewählt</span>
        <div style="display:flex;gap:.3rem">
          <button class="btn-xs" onclick="wizardAlleKuehe(true)">Alle</button>
          <button class="btn-xs" onclick="wizardAlleKuehe(false)">Keine</button>
        </div>
      </div>
      ${bauernListe.length ? `<div style="display:flex;gap:.3rem;flex-wrap:wrap;margin-bottom:.5rem">
        ${bauernListe.map(b=>`<button class="filter-chip" onclick="wizardFilterBauer('${b}',this)" style="font-size:.7rem">${b.split(' ').pop()}</button>`).join('')}
      </div>` : ''}
      <div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm)">
        ${kuhListe.map(([id,k])=>`
          <label style="display:flex;align-items:center;gap:.6rem;padding:.45rem .7rem;border-bottom:1px solid var(--border);cursor:pointer" id="wiz-kuh-row-${id}">
            <input type="checkbox" id="wiz-kuh-${id}" ${d.ausgewaehlteKuehe.has(id)?'checked':''} onchange="wizardToggleKuh('${id}',this.checked)" style="width:16px;height:16px;accent-color:var(--green);flex-shrink:0" />
            <span class="nr-badge" style="flex-shrink:0">#${k.nr}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:.83rem;font-weight:600">${k.name||'–'}</div>
              <div style="font-size:.68rem;color:var(--text3)">${k.bauer||''}${k.rasse?' · '+k.rasse:''}</div>
            </div>
          </label>`).join('')}
      </div>
      <div class="form-actions" style="margin-top:1rem">
        <button class="btn-secondary" onclick="window._wizardData.schritt=1;renderWizard()">← Zurück</button>
        <button class="btn-primary" onclick="wizardWeiter2()">Weiter →</button>
      </div>`;
  }

  // ── Schritt 3: Offene Behandlungen ──
  else if(d.schritt === 3) {
    const offeneBeh = Object.entries(behandlungen).filter(([,b])=>b.aktiv && b.wzMilchEnde && b.wzMilchEnde > Date.now());
    inhalt = `
      <h3 style="color:var(--gold);margin-bottom:.2rem">⚕ Schritt 3: Behandlungen</h3>
      <p style="font-size:.78rem;color:var(--text2);margin-bottom:.8rem">Aktive Wartezeiten die beim Saisonstart noch laufen.</p>
      ${offeneBeh.length ? `
        <div style="background:rgba(200,120,0,.08);border:1px solid rgba(200,120,0,.25);border-radius:var(--radius-sm);padding:.6rem .8rem;margin-bottom:.6rem">
          <div style="font-size:.75rem;color:var(--orange);font-weight:700;margin-bottom:.4rem">⚠ ${offeneBeh.length} aktive Wartezeit${offeneBeh.length>1?'en':''}</div>
          ${offeneBeh.map(([,b])=>{
            const k=kuehe[b.kuhId];
            const endeDate=new Date(b.wzMilchEnde);endeDate.setHours(0,0,0,0);
            const heute=new Date();heute.setHours(0,0,0,0);
            const diff=Math.round((endeDate.getTime()-heute.getTime())/86400000);
            return `<div style="font-size:.8rem;color:var(--text2);padding:.25rem 0;border-bottom:1px solid var(--border2)">
              #${k?.nr||''} ${k?.name||''} · ${b.medikament||'–'} · noch <b style="color:var(--orange)">${diff} Tage</b>
            </div>`;
          }).join('')}
        </div>
        <p style="font-size:.75rem;color:var(--text3)">Diese Kühe dürfen trotzdem aufgetrieben werden – die Wartezeit läuft weiter. Dashboard zeigt Alerts.</p>
      ` : `
        <div style="background:rgba(77,184,78,.08);border:1px solid rgba(77,184,78,.25);border-radius:var(--radius-sm);padding:.7rem .9rem;text-align:center">
          <div style="font-size:1.2rem">✓</div>
          <div style="font-size:.82rem;color:var(--green);margin-top:.2rem">Keine offenen Wartezeiten</div>
        </div>`}
      <div class="form-actions" style="margin-top:1rem">
        <button class="btn-secondary" onclick="window._wizardData.schritt=2;renderWizard()">← Zurück</button>
        <button class="btn-primary" onclick="window._wizardData.schritt=4;renderWizard()">Weiter →</button>
      </div>`;
  }

  // ── Schritt 4: Zusammenfassung & Start ──
  else if(d.schritt === 4) {
    const ausgewaehlteKueheListe = kuhListe.filter(([id])=>d.ausgewaehlteKuehe.has(id));
    const bauernMap = {};
    ausgewaehlteKueheListe.forEach(([,k])=>{ if(k.bauer) bauernMap[k.bauer]=(bauernMap[k.bauer]||0)+1; });
    inhalt = `
      <h3 style="color:var(--gold);margin-bottom:.2rem">🚀 Schritt 4: Zusammenfassung</h3>
      <p style="font-size:.78rem;color:var(--text2);margin-bottom:.8rem">Alles korrekt? Dann Saison starten!</p>
      <div class="card-section" style="margin-bottom:.6rem">
        <div class="info-row"><span>Alm</span><b>${d.alm}</b></div>
        <div class="info-row"><span>Jahr</span><b>${d.jahr}</b></div>
        <div class="info-row"><span>Auftrieb</span><b>${new Date(d.auftrieb+'T12:00').toLocaleDateString('de-AT',{weekday:'long',day:'numeric',month:'long'})}</b></div>
        <div class="info-row"><span>Kühe</span><b style="color:var(--green)">${d.ausgewaehlteKuehe.size} von ${kuhListe.length}</b></div>
        <div class="info-row"><span>Bauern</span><b>${Object.keys(bauernMap).length}</b></div>
      </div>
      ${Object.entries(bauernMap).length ? `
        <div class="section-label" style="margin-bottom:.3rem">KÜHE PRO BAUER</div>
        ${Object.entries(bauernMap).sort().map(([b,n])=>`
          <div style="display:flex;justify-content:space-between;font-size:.8rem;color:var(--text2);padding:.2rem 0">
            <span>${b}</span><span style="color:var(--gold)">${n} Kuh${n>1?'e':''}</span>
          </div>`).join('')}` : ''}
      <div style="background:rgba(77,184,78,.08);border:1px solid rgba(77,184,78,.3);border-radius:var(--radius-sm);padding:.6rem .9rem;margin-top:.6rem;font-size:.78rem;color:var(--green)">
        ▲ Mit Klick auf „Saison starten" werden alle gewählten Kühe auf Status „Auf der Alm" gesetzt.
      </div>
      <div class="form-actions" style="margin-top:1rem">
        <button class="btn-secondary" onclick="window._wizardData.schritt=3;renderWizard()">← Zurück</button>
        <button class="btn-primary" style="background:var(--green);border-color:var(--green)" onclick="wizardStartSaison()">▲ Saison starten</button>
      </div>`;
  }

  existing.innerHTML = `
    <div class="form-sheet" style="max-height:92vh;overflow-y:auto">
      <div class="form-header">
        <span style="font-size:.78rem;color:var(--text3)">Saisonstart-Assistent</span>
        <button class="close-btn" onclick="document.getElementById('saison-wizard-ov').remove()">✕</button>
      </div>
      <div class="form-body">
        ${progressHTML}
        ${inhalt}
      </div>
    </div>`;
};

window.wizardWeiter1 = function() {
  const alm = document.getElementById('wiz-alm')?.value.trim();
  const jahr = parseInt(document.getElementById('wiz-jahr')?.value)||new Date().getFullYear();
  const auftrieb = document.getElementById('wiz-auftrieb')?.value;
  if(!alm) { alert('Bitte Almname eingeben'); return; }
  if(!auftrieb) { alert('Bitte Auftriebsdatum eingeben'); return; }
  window._wizardData.alm = alm;
  window._wizardData.jahr = jahr;
  window._wizardData.auftrieb = auftrieb;
  window._wizardData.schritt = 2;
  renderWizard();
};

window.wizardWeiter2 = function() {
  if(window._wizardData.ausgewaehlteKuehe.size === 0) {
    alert('Bitte mindestens eine Kuh auswählen');
    return;
  }
  window._wizardData.schritt = 3;
  renderWizard();
};

window.wizardToggleKuh = function(id, checked) {
  if(checked) window._wizardData.ausgewaehlteKuehe.add(id);
  else window._wizardData.ausgewaehlteKuehe.delete(id);
  // Update counter
  const counter = document.querySelector('#saison-wizard-ov span[style*="gold"]');
  if(counter) counter.textContent = window._wizardData.ausgewaehlteKuehe.size + ' / ' + Object.keys(kuehe).length + ' ausgewählt';
};

window.wizardAlleKuehe = function(alle) {
  const kuhListe = Object.keys(kuehe);
  if(alle) kuhListe.forEach(id => window._wizardData.ausgewaehlteKuehe.add(id));
  else window._wizardData.ausgewaehlteKuehe.clear();
  // Re-render step 2
  renderWizard();
};

window.wizardFilterBauer = function(bauer, btn) {
  document.querySelectorAll('#saison-wizard-ov .filter-chip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  // Scroll to first Kuh of this bauer
  const kuhListe = Object.entries(kuehe);
  const erste = kuhListe.find(([,k])=>k.bauer===bauer);
  if(erste) {
    const row = document.getElementById('wiz-kuh-row-'+erste[0]);
    if(row) row.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
};

window.wizardStartSaison = async function() {
  const d = window._wizardData;
  const btn = document.querySelector('#saison-wizard-ov .btn-primary:last-child');
  if(btn) { btn.disabled=true; btn.textContent='Starte…'; }

  try {
    // 1. Saison setzen
    await set(ref(db,'saison'), {
      aktiv: true,
      alm: d.alm,
      jahr: d.jahr,
      auftriebDatum: new Date(d.auftrieb+'T06:00').getTime(),
    });

    // 2. Ausgewählte Kühe → oben, Rest → unten
    const updates = {};
    Object.keys(kuehe).forEach(id => {
      updates['kuehe/'+id+'/almStatus'] = d.ausgewaehlteKuehe.has(id) ? 'oben' : 'unten';
    });
    await update(ref(db), updates);

    // Wizard schließen
    document.getElementById('saison-wizard-ov')?.remove();
    showSaveToast && showSaveToast('Saison '+d.jahr+' gestartet · '+d.ausgewaehlteKuehe.size+' Kühe auf der Alm');
    navigate('saison');
  } catch(e) {
    alert('Fehler: '+e.message);
    if(btn) { btn.disabled=false; btn.textContent='▲ Saison starten'; }
  }
};

function renderAbtriebOverlay() {
  return `<div id="abtrieb-overlay" class="form-overlay" style="display:none">
    <div class="form-sheet">
      <div class="form-header"><h3>↓ Abtrieb & Saisonende</h3><button class="close-btn" onclick="closeForm('abtrieb-overlay')">✕</button></div>
      <div class="form-body">
        <label class="inp-label">Abtriebsdatum</label>
        <input id="ab-datum" class="inp" type="date" value="${isoDate(new Date())}" />
        <textarea id="ab-notiz" class="inp" rows="2" placeholder="Notiz (optional)"></textarea>
        <p style="font-size:.78rem;color:var(--text2);margin:.4rem 0">Alle Kühe die noch oben sind werden auf „unten" gesetzt. Die Saison wird beendet und automatisch archiviert.</p>
        <div class="form-actions">
          <button class="btn-secondary" onclick="closeForm('abtrieb-overlay')">Abbrechen</button>
          <button class="btn-primary" style="background:var(--red);border-color:var(--red)" onclick="saveAbtrieb()">↓ Abtrieb speichern</button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderSaison() {
  const kuhListe = Object.entries(kuehe).sort((a,b)=>(parseInt(a[1].nr)||0)-(parseInt(b[1].nr)||0));
  const oben      = kuhListe.filter(([,k])=>k.almStatus==='oben');
  const vorzeitig = kuhListe.filter(([,k])=>k.almStatus==='vorzeitig');
  const unten     = kuhListe.filter(([,k])=>k.almStatus!=='oben' && k.almStatus!=='vorzeitig');
  const heute = Date.now();
  const tageOben = saisonInfo?.auftriebDatum ? Math.floor((heute - saisonInfo.auftriebDatum)/86400000) : 0;

  return `
    <div class="page-header"><h2>⛰ Saison</h2></div>

    ${!saisonInfo?.aktiv ? `
    <div class="card-section" style="margin-bottom:.8rem;border-color:rgba(77,184,78,.3)">
      <div class="section-label" style="margin-bottom:.5rem">NEUE SAISON STARTEN</div>
      <p style="font-size:.8rem;color:var(--text2);margin-bottom:.7rem">Der Assistent führt dich durch alle Schritte.</p>
      <button class="btn-primary" style="width:100%" onclick="showSaisonWizard()">▲ Saisonstart-Assistent</button>
    </div>` : `

    <!-- Saison Info -->
    <div class="card-section" style="margin-bottom:.8rem">
      <div class="info-row"><span>Alm</span><b>${saisonInfo.alm||'–'}</b></div>
      <div class="info-row"><span>Jahr</span><b>${saisonInfo.jahr||'–'}</b></div>
      <div class="info-row"><span>Auftrieb</span><b>${saisonInfo.auftriebDatum?new Date(saisonInfo.auftriebDatum).toLocaleDateString('de-AT'):'–'}</b></div>
      <div class="info-row"><span>Tage auf Alm</span><b>${tageOben}</b></div>
      <div class="info-row"><span>Kühe oben</span><b>${oben.length} / ${kuhListe.length}</b></div>
    </div>

    <!-- OBEN -->
    ${oben.length ? `
    <div class="section-title" style="color:var(--green)">⛰ Auf der Alm (${oben.length})</div>
    <div class="card-list" style="margin-bottom:.6rem">
      ${oben.map(([id,k])=>`
        <div class="list-card list-card-sm">
          <span class="nr-badge">#${k.nr}</span>
          <span class="list-card-title">${k.name||'–'}</span>
          <span style="font-size:.72rem;color:var(--text3);flex:1">${k.bauer||''}</span>
          <button class="btn-xs" onclick="showVorzeitigAbtrieb('${id}')">↓ vorzeitig</button>
          <button class="btn-xs-danger" onclick="setAlmStatus('${id}','unten')">↓ ab</button>
        </div>`).join('')}
    </div>` : ''}

    <!-- VORZEITIG ABGETRIEBEN -->
    ${vorzeitig.length ? `
    <div class="section-title" style="color:var(--orange)">⚠ Vorzeitig abgetrieben (${vorzeitig.length})</div>
    <div class="card-list" style="margin-bottom:.6rem">
      ${vorzeitig.map(([id,k])=>`
        <div class="list-card list-card-sm" style="border-left:3px solid var(--orange)">
          <span class="nr-badge" style="background:var(--orange)">#${k.nr}</span>
          <span class="list-card-title">${k.name||'–'}</span>
          <div style="flex:1;min-width:0">
            <span style="font-size:.72rem;color:var(--text3)">${k.bauer||''}</span>
            ${k.vorzeitigDatum?`<span style="font-size:.68rem;color:var(--orange);display:block">${new Date(k.vorzeitigDatum).toLocaleDateString('de-AT')}${k.vorzeitigGrund?' · '+k.vorzeitigGrund:''}</span>`:''}
          </div>
          <button class="btn-xs" onclick="setAlmStatus('${id}','oben')">↑ zurück</button>
          <button class="btn-xs-danger" onclick="setAlmStatus('${id}','unten')">✓ abgerechnet</button>
        </div>`).join('')}
    </div>` : ''}

    <!-- NOCH NICHT AUFGETRIEBEN -->
    ${unten.length ? `
    <div class="section-title" style="color:var(--text3)">🏠 Noch nicht aufgetrieben (${unten.length})</div>
    <div class="card-list" style="margin-bottom:.6rem">
      ${unten.map(([id,k])=>`
        <div class="list-card list-card-sm">
          <span class="nr-badge">#${k.nr}</span>
          <span class="list-card-title">${k.name||'–'}</span>
          <span style="font-size:.72rem;color:var(--text3);flex:1">${k.bauer||''}</span>
          <button class="btn-xs" onclick="setAlmStatus('${id}','oben')">↑ aufgetrieben</button>
        </div>`).join('')}
    </div>
    <button class="btn-secondary btn-block" onclick="alleAuftreiben()" style="margin-bottom:.8rem">↑ Alle als aufgetrieben markieren</button>
    ` : ''}

    <!-- SAISON BEENDEN -->
    <div class="section-title">Saisonende</div>
    <div class="card-section" style="border-color:var(--red)">
      <p style="font-size:.8rem;color:var(--text2);margin-bottom:.6rem">Wenn alle Kühe abgetrieben wurden, hier den Abtrieb erfassen. Die Alpungstage werden dann berechnet.</p>
      <button class="btn-primary" style="background:var(--red);border-color:var(--red);width:100%" onclick="showAbtriebbForm()">↓ Abtrieb erfassen &amp; Saison beenden</button>
    </div>
    `}

    ${renderAbtriebOverlay()}
  `;
}
function renderWeide() {
  const heuteDatum=isoDate(new Date());
  const weidenListe=Object.entries(weiden).sort((a,b)=>a[1].name?.localeCompare(b[1].name));
  const verlauf=Object.entries(weideTage).sort((a,b)=>b[1].datum?.localeCompare(a[1].datum)).slice(0,30);
  const heuteEintrag=Object.entries(weideTage).find(([,w])=>w.datum===heuteDatum);
  const kueheOben=Object.entries(kuehe).sort((a,b)=>{const nA=parseInt(a[1].nr)||0,nB=parseInt(b[1].nr)||0;return nA-nB;});
  return `
    <div class="page-header"><h2>🌿 Weidegang</h2><button class="btn-primary" onclick="showWeideTagForm()">+ Heute</button></div>
    <div class="section-title">Weiden <button class="btn-xs" style="margin-left:.5rem" onclick="showWeideForm()">+ anlegen</button></div>
    <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.8rem">
      ${weidenListe.map(([id,w])=>`<div class="weide-chip"><span>${w.name}</span>${w.ha?`<span style="font-size:.68rem;color:var(--text3)"> ${w.ha}ha</span>`:''}<button onclick="deleteWeide('${id}')" style="background:none;border:none;color:var(--text3);cursor:pointer;padding:0 0 0 4px;font-size:.8rem">✕</button></div>`).join('')||`<span style="color:var(--text3);font-size:.82rem">Noch keine Weiden</span>`}
    </div>
    ${heuteEintrag?`<div class="card-section" style="border-color:var(--green);margin-bottom:.8rem">
      <div class="info-row"><span>Heute</span><b style="color:var(--green)">${weiden[heuteEintrag[1].weideId]?.name||heuteEintrag[1].weideText||'–'}</b></div>
      <div class="info-row"><span>Tiere</span><b>${heuteEintrag[1].kuhIds?.length||0}</b></div>
      ${heuteEintrag[1].notiz?`<div class="info-row"><span>Notiz</span><span>${heuteEintrag[1].notiz}</span></div>`:''}
      <button class="btn-xs-danger" style="margin-top:.4rem" onclick="deleteWeideTag('${heuteEintrag[0]}')">Löschen</button>
    </div>`:''}
    <div class="section-title">Verlauf</div>
    <div class="card-list">
      ${verlauf.length?verlauf.map(([id,w])=>`<div class="list-card"><div class="list-card-left"><div><div class="list-card-title">${new Date(w.datum+'T12:00').toLocaleDateString('de-AT',{weekday:'short',day:'numeric',month:'short'})}</div><div class="list-card-sub">${weiden[w.weideId]?.name||w.weideText||'–'} · ${w.kuhIds?.length||0} Tiere${w.notiz?' · '+w.notiz:''}</div></div></div><button class="btn-xs-danger" onclick="deleteWeideTag('${id}')">✕</button></div>`).join(''):`<div class="empty-state">Noch keine Einträge</div>`}
    </div>
    <div id="weidetag-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>Weidegang erfassen</h3><button class="close-btn" onclick="closeForm('weidetag-overlay')">✕</button></div>
        <div class="form-body">
          <input id="wt-datum" class="inp" type="date" value="${heuteDatum}" />
          <label class="inp-label">Weide</label>
          <select id="wt-weide" class="inp" onchange="document.getElementById('wt-freitext').style.display=this.value==='__text__'?'':'none'">
            <option value="">– wählen –</option>
            ${weidenListe.map(([id,w])=>`<option value="${id}">${w.name}${w.ha?' ('+w.ha+'ha)':''}</option>`).join('')}
            <option value="__text__">Andere (Freitext)</option>
          </select>
          <input id="wt-freitext" class="inp" placeholder="Weidename" style="display:none" />
          <label class="inp-label">Tiere auf dieser Weide</label>
          <div style="display:flex;gap:.4rem;margin-bottom:.4rem"><button class="btn-xs" onclick="alleKueheWeide(true)">Alle</button><button class="btn-xs" onclick="alleKueheWeide(false)">Keine</button></div>
          <div id="wt-kuehe" style="display:flex;flex-wrap:wrap;gap:.4rem;max-height:150px;overflow-y:auto;background:var(--bg);border-radius:8px;padding:.5rem">
            ${kueheOben.map(([id,k])=>`<label class="kuh-select-chip"><input type="checkbox" class="kuh-cb" value="${id}" checked />#${k.nr} ${k.name||''}</label>`).join('')}
          </div>
          <textarea id="wt-notiz" class="inp" rows="2" placeholder="Notizen (Wetter, Zaunschäden…)"></textarea>
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('weidetag-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveWeideTag()">Speichern</button>
          </div>
        </div>
      </div>
    </div>
    <div id="weide-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>Weide anlegen</h3><button class="close-btn" onclick="closeForm('weide-overlay')">✕</button></div>
        <div class="form-body">
          <input id="w-name" class="inp" placeholder="Name (z.B. Hochweide)" />
          <input id="w-ha" class="inp" placeholder="Fläche in ha" inputmode="decimal" />
          <textarea id="w-notiz" class="inp" rows="2" placeholder="Notizen"></textarea>
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('weide-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveWeide()">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderEinstellungen() {
  const bauernListe=Object.entries(bauern).sort((a,b)=>a[1].name?.localeCompare(b[1].name));
  return `
    <div class="page-header"><h2>⚙ Einstellungen</h2></div>

    <div class="card-section" style="margin-bottom:.8rem">
      <div class="section-label" style="margin-bottom:.6rem">ALM-EINSTELLUNGEN</div>
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem">
        <input id="einst-almname" class="inp" placeholder="Almname" value="${saisonInfo?.alm||''}" style="flex:1" />
        <button class="btn-xs" onclick="saveAlmName()">✓ Speichern</button>
      </div>
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem">
        <input id="einst-almjahr" class="inp" placeholder="Saison-Jahr" value="${saisonInfo?.jahr||new Date().getFullYear()}" style="width:6rem" inputmode="numeric" />
        <label style="font-size:.8rem;color:var(--text3)">Saison-Jahr</label>
      </div>
      <button class="btn-secondary" style="width:100%;margin-top:.3rem" <label class="inp-label">Nächste Stadt (für Wetter)</label>
          <select id="einst-wetterort" class="inp" style="margin-bottom:.4rem" onchange="localStorage.setItem('wetterOrt',this.value);window.ladeWetter&&ladeWetter()">
            <option value="Innsbruck">Innsbruck</option><option value="Lienz">Lienz</option><option value="Imst">Imst</option><option value="Landeck">Landeck</option><option value="Kitzbühel">Kitzbühel</option><option value="Reutte">Reutte</option><option value="Schwaz">Schwaz</option><option value="Bregenz">Bregenz</option><option value="Feldkirch">Feldkirch</option><option value="Bludenz">Bludenz</option><option value="Klagenfurt">Klagenfurt</option><option value="Villach">Villach</option><option value="Salzburg">Salzburg</option><option value="Zell am See">Zell am See</option><option value="St. Johann">St. Johann</option>
          </select>
          onclick="saveAlmEinstellungen()">💾 Alm-Einstellungen speichern</button>
    </div>

    <div class="card-section" style="margin-bottom:.8rem">
      <div class="section-label" style="margin-bottom:.5rem">ANGEMELDET ALS</div>
      <div class="info-row">
        <span>E-Mail</span>
        <b>${window._currentUser?.email||'–'}</b>
      </div>
      <div class="info-row">
        <span>Rolle</span>
        <span class="role-badge role-${window._currentRole||'hirte'}">${{admin:'Admin',hirte:'Hirte',molkerei:'Molkerei',milchmesser:'Milchmesser'}[window._currentRole]||window._currentRole||'–'}</span>
      </div>
      <button class="btn-secondary" style="width:100%;margin-top:.5rem;border-color:var(--red);color:var(--red)" onclick="doLogout()">⎋ Abmelden</button>
    </div>
    <div class="card-section" style="margin-bottom:.8rem">
      <div class="section-label" style="margin-bottom:.5rem">APP INFO</div>
      <div class="info-row"><span>Version</span><b>HerdenPro v2</b></div>
      <div class="info-row"><span>Datenbank</span><b style="color:var(--green)">● Firebase verbunden</b></div>
      <div class="info-row"><span>Alm</span><b>${saisonInfo?.alm||'–'}</b></div>
      <div class="info-row"><span>Saison</span><b>${saisonInfo?.aktiv?'Aktiv '+saisonInfo.jahr:saisonInfo?.jahr||'–'}</b></div>
    </div>

    <div class="card-section" style="margin-bottom:.8rem">
      <div class="section-label" style="margin-bottom:.5rem">GESPEICHERTE DATEN</div>
      <div class="info-row"><span>🐄 Kühe</span><b>${Object.keys(kuehe).length}</b></div>
      <div class="info-row"><span>⚕ Behandlungen</span><b>${Object.keys(behandlungen).length}</b></div>
      <div class="info-row"><span>🐮 Besamungen</span><b>${Object.keys(besamungen).length}</b></div>
      <div class="info-row"><span>🥛 Milcheinträge</span><b>${Object.keys(milchEintraege).length}</b></div>
      <div class="info-row"><span>📓 Journaleinträge</span><b>${Object.keys(journal).length}</b></div>
      <div class="info-row"><span>🌿 Weidetage</span><b>${Object.keys(weideTage).length}</b></div>
    </div>



    <div class="card-section" style="margin-bottom:.8rem">
      <div class="section-label" style="margin-bottom:.5rem">🥛 MILCH-WARNSYSTEM</div>
      <p style="font-size:.78rem;color:var(--text2);margin-bottom:.6rem">Warnung wenn Milchmenge einer Kuh mehr als X% vom Durchschnitt abweicht (zu wenig oder zu viel). Trockengestellte Kühe werden ignoriert.</p>
      <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.4rem">
        <label style="font-size:.82rem;color:var(--text2);white-space:nowrap">Schwellenwert</label>
        <input id="einst-milch-warn" class="inp" type="number" min="10" max="90" step="5"
          value="${parseInt(localStorage.getItem('milchWarnProzent'))||50}"
          style="width:80px;text-align:center" inputmode="numeric" />
        <span style="font-size:.82rem;color:var(--text3)">%</span>
      </div>
      <div style="font-size:.72rem;color:var(--text3);margin-bottom:.5rem">Beispiel: 50% → Warnung wenn Kuh weniger als die Hälfte oder mehr als das 1,5-fache ihres Durchschnitts gibt.</div>
      <button class="btn-secondary" onclick="saveMilchWarnSchwelle()">💾 Speichern</button>
    </div>
    <div class="card-section" style="margin-bottom:.8rem">
      <p style="font-size:.82rem;color:var(--text2);margin-bottom:.7rem">
        Milchdaten als Excel exportieren – fertig formatiert für das Molkerei-System (Stall-Sheet Format, W1–W14).
      </p>
      <button class="btn-primary" onclick="exportMolkereiExcel()">🧀 Molkerei Excel exportieren</button>
    </div>

    <div class="section-title">Datensicherung</div>
    <div class="card-section" style="margin-bottom:.8rem;border-color:var(--green)">
      <div style="display:flex;gap:.7rem;align-items:flex-start">
        <span style="font-size:1.5rem">🛡</span>
        <div>
          <div style="font-size:.88rem;color:var(--text);font-weight:bold;margin-bottom:.3rem">Automatische Sicherung aktiv</div>
          <div style="font-size:.78rem;color:var(--text3);line-height:1.6">Firebase (Google Cloud) sichert alle Daten automatisch täglich. Für manuelle Backups →
            <span style="color:var(--gold);cursor:pointer" onclick="navigate('backup')">Backup & Export</span>.</div>
        </div>
      </div>
    </div>

    <div class="section-title">App neu laden</div>
    <div class="card-section" style="margin-bottom:.8rem">
      <p style="font-size:.82rem;color:var(--text2);margin-bottom:.7rem">Falls die App eine veraltete Version anzeigt → Cache leeren und neu laden.</p>
      <button class="btn-secondary" onclick="clearCache()">↺ Cache leeren & neu laden</button>
    </div>

    <div class="section-title">🔔 Benachrichtigungen</div>
    <div class="card-section" style="margin-bottom:.8rem">
      <!-- Status + Erlauben -->
      <div class="info-row" style="margin-bottom:.4rem">
        <span>Status</span>
        <b style="color:${'Notification' in window ? (Notification.permission==='granted'?'var(--green)':Notification.permission==='denied'?'var(--red)':'var(--orange)') : 'var(--text3)'}">
          ${'Notification' in window ? (Notification.permission==='granted'?'✓ Erlaubt':Notification.permission==='denied'?'✗ Blockiert':'Noch nicht gesetzt') : 'Nicht unterstützt'}
        </b>
      </div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.8rem">
        ${'Notification' in window && Notification.permission !== 'granted' ? `<button class="btn-primary" onclick="benachrichtigungErlauben()">🔔 Erlauben</button>` : ''}
        <button class="btn-secondary" onclick="testBenachrichtigung()">🧪 Test senden</button>
      </div>

      ${'Notification' in window && Notification.permission === 'granted' ? `
      <!-- Kategorie-Toggles -->
      <div style="font-size:.7rem;font-weight:700;color:var(--text3);letter-spacing:.06em;margin-bottom:.5rem">KATEGORIEN</div>
      ${(function(){
        var cats=[
          {key:'wartezeiten',icon:'⚕',label:'Wartezeiten',sub:'Milch/Fleisch endet heute/morgen'},
          {key:'geburten',icon:'🐮',label:'Geburten',sub:'3 und 7 Tage vor erwartetem Termin'},
          {key:'brunst',icon:'🔁',label:'Brunst-Kontrolle',sub:'Tag 19 nach Besamung'},
          {key:'kalender',icon:'📅',label:'Kalender-Erinnerungen',sub:'Eigene Termine mit gesetzter Erinnerung'},
          {key:'backup',icon:'💾',label:'Backup-Erinnerung',sub:'Wöchentlich (nur Admin)'},
          {key:'wartung',icon:'🔧',label:'Maschinenwartung',sub:'7 Tage vor Wartungstermin'},
        ];
        return cats.map(function(cat){
          var aktiv=localStorage.getItem('pushEin_'+cat.key)!=='0';
          var col=aktiv?'color:var(--text)':'color:var(--text3)';
          var bg=aktiv?'var(--green)':'var(--border2)';
          var left=aktiv?'21px':'3px';
          var chk=aktiv?'checked':'';
          return '<div style="display:flex;align-items:center;gap:.7rem;padding:.5rem 0;border-bottom:1px solid var(--border)">'+
            '<span style="font-size:1.1rem;flex-shrink:0">'+cat.icon+'</span>'+
            '<div style="flex:1;min-width:0">'+
              '<div style="font-size:.82rem;font-weight:600;'+col+'">'+cat.label+'</div>'+
              '<div style="font-size:.68rem;color:var(--text3)">'+cat.sub+'</div>'+
            '</div>'+
            '<label style="position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0;cursor:pointer">'+
              '<input type="checkbox" '+chk+' onchange="setPushEnabled(\''+cat.key+'\',this.checked);render()" style="opacity:0;width:0;height:0;position:absolute" />'+
              '<span style="position:absolute;inset:0;border-radius:12px;background:'+bg+';transition:background .2s">'+
                '<span style="position:absolute;top:3px;left:'+left+';width:18px;height:18px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 4px rgba(0,0,0,.3)"></span>'+
              '</span>'+
            '</label>'+
          '</div>';
        }).join('');
      })()}
      ` : '<p style="font-size:.75rem;color:var(--text3)">Benachrichtigungen aktivieren um Kategorien zu verwalten.</p>'}
    </div>

    <div class="section-title">Datenbank</div>
    <div class="card-section">
      <div class="info-row"><span>Projekt</span><b style="font-size:.72rem">herdenmanagement-33ff5</b></div>
      <div class="info-row"><span>Region</span><b>Europa West (Belgien)</b></div>
      <div class="info-row"><span>Tarif</span><b>Spark (kostenlos)</b></div>
    </div>

    
    <div class="card-section" style="margin-bottom:.8rem;border:1px solid rgba(200,60,60,.4)">
      <div class="section-label" style="margin-bottom:.5rem;color:var(--red)">⚠ DATEN VERWALTEN</div>
      <!-- Neue Saison / Alles löschen -->
      <div style="background:rgba(200,60,60,.08);border:1px solid rgba(200,60,60,.3);border-radius:var(--radius-sm);padding:.8rem;margin-bottom:.8rem">
        <div style="font-size:.82rem;font-weight:bold;color:var(--red);margin-bottom:.4rem">🗑 Alle Daten löschen</div>
        <p style="font-size:.78rem;color:var(--text2);margin-bottom:.7rem">Löscht ALLE Daten (Kühe, Milch, Behandlungen, Bauern, Saison usw.) – z.B. für neue Saison. Nicht rückgängig machbar!</p>
        <button class="btn-secondary" style="border-color:var(--red);color:var(--red);width:100%" onclick="loescheAlleDaten()">☢ ALLE DATEN LÖSCHEN</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:.4rem">
        <button class="btn-secondary" style="border-color:var(--orange);color:var(--orange)" onclick="bereinigeMilch()">🥛 Milcheinträge ohne Kuh löschen</button>
        <button class="btn-secondary" style="border-color:var(--orange);color:var(--orange)" onclick="bereinigeBeh()">⚕ Behandlungen ohne Kuh löschen</button>
        <button class="btn-secondary" style="border-color:var(--red);color:var(--red)" onclick="bereinigeFull()">🗑 Alle Daten bereinigen</button>
      </div>
    </div>

    <div id="bauer-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>Bauer erfassen</h3><button class="close-btn" onclick="closeForm('bauer-overlay')">✕</button></div>
        <div class="form-body">
          <input id="ba-name" class="inp" placeholder="Name *" />
          <input id="ba-betrieb" class="inp" placeholder="LFBIS-Nummer" />
          <input id="ba-tel" class="inp" placeholder="Telefon" inputmode="tel" />
          <input id="ba-email" class="inp" placeholder="E-Mail" inputmode="email" />
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('bauer-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveBauer()">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderBestandsbuch() {
  const alleBehandlungen=Object.entries(behandlungen).filter(([,b])=>b.medikament).sort((a,b)=>b[1].datum-a[1].datum);
  const medFilter = window._bbMedFilter||'';
  const bListe = medFilter ? alleBehandlungen.filter(([,b])=>b.medikament?.toLowerCase().includes(medFilter.toLowerCase())) : alleBehandlungen;

  // Unique Medikamente für Filter
  const medListe = [...new Set(alleBehandlungen.map(([,b])=>b.medikament).filter(Boolean))].sort();

  return `
    <div class="page-header"><h2>📋 Bestandsbuch</h2><button class="btn-primary" onclick="druckeBestandsbuch()">🖨 Drucken</button></div>
    <p style="font-size:.75rem;color:var(--text3);margin-bottom:.8rem">Gemäß § 12 TAKG – alle Behandlungen mit Medikamenten.</p>
    <div class="card-section" style="margin-bottom:.8rem">
      <div class="info-row"><span>Betrieb / Alm</span><b>${saisonInfo?.alm||'–'}</b></div>
      <div class="info-row"><span>Tiere</span><b>${Object.keys(kuehe).length}</b></div>
      <div class="info-row"><span>Saison</span><b>${saisonInfo?.jahr||new Date().getFullYear()}</b></div>
    </div>

    <!-- Medikamenten-Filter -->
    ${medListe.length>1?`
    <div style="margin-bottom:.7rem">
      <div style="font-size:.7rem;color:var(--text3);margin-bottom:.35rem;font-weight:600">FILTER MEDIKAMENT</div>
      <div style="display:flex;flex-wrap:wrap;gap:.3rem">
        <button class="filter-chip ${!medFilter?'active':''}" onclick="window._bbMedFilter='';render()">Alle (${alleBehandlungen.length})</button>
        ${medListe.map(m=>`<button class="filter-chip ${medFilter===m?'active':''}" data-med="${m.replace(/"/g,'&quot;')}" onclick="window._bbMedFilter=this.dataset.med;render()">${m} (${alleBehandlungen.filter(([,b])=>b.medikament===m).length})</button>`).join('')}
      </div>
    </div>`:''}

    ${bListe.length?`
    <div style="overflow-x:auto">
    <table class="bb-table">
      <thead><tr>
        <th>Datum</th><th>Tier</th><th>Ohrmarke</th><th>Diagnose</th>
        <th>Medikament</th><th>Dosis</th><th>Abgabe</th>
        <th>WZ Milch (T)</th><th>WZ Ende Milch</th>
        <th>WZ Fleisch (T)</th><th>WZ Ende Fleisch</th><th>Tierarzt</th>
      </tr></thead>
      <tbody>${bListe.map(([,b])=>{
        const k=kuehe[b.kuhId];
        return `<tr>
          <td>${new Date(b.datum).toLocaleDateString('de-AT')}</td>
          <td>#${k?.nr||'?'} ${k?.name||''}</td>
          <td>${k?.ohrmarke||'–'}</td>
          <td>${b.diagnose||'–'}</td>
          <td>${b.medikament}</td>
          <td>${b.dosis||'–'}</td>
          <td>${b.abgabeDatum?new Date(b.abgabeDatum).toLocaleDateString('de-AT'):'–'}</td>
          <td>${b.wzMilchTage||'–'}</td>
          <td>${b.wzMilchEnde?new Date(b.wzMilchEnde).toLocaleDateString('de-AT'):'–'}</td>
          <td>${b.wzFleischTage||'–'}</td>
          <td>${b.wzFleischEnde?new Date(b.wzFleischEnde).toLocaleDateString('de-AT'):'–'}</td>
          <td>${b.tierarzt||'–'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    <div style="font-size:.72rem;color:var(--text3);margin-top:.4rem;text-align:right">${bListe.length} Einträge${medFilter?' (gefiltert)':''}</div>
    ` : `<div class="empty-state">Keine Behandlungen mit Medikamenten${medFilter?' für dieses Medikament':''}</div>`}
  `;
}


window.behandlungFotoPreview = function(input) {
  const file = input.files[0];
  if(!file) return;
  komprimiereBild(file, function(data) {
    const preview = document.getElementById('b-foto-preview');
    const img = document.getElementById('b-foto-img');
    const d = document.getElementById('b-foto-data');
    if(preview && img && d) { img.src = data; preview.style.display = ''; d.value = data; }
  });
};

window.showFotoPopup = function(src) {
  showPopupHTML(
    '<img src="' + src + '" style="width:100%;border-radius:8px;max-height:60vh;object-fit:contain" />' +
    '<button class="btn-secondary" style="width:100%;margin-top:.8rem" onclick="closePopup()">Schließen</button>'
  );
};

// ── Push Benachrichtigungen: Wartezeit-Check ──
// ── Push-Notification Kategorie-Check ──
window.isPushEnabled = function(kategorie) {
  if(!('Notification' in window) || Notification.permission !== 'granted') return false;
  var key = 'pushEin_' + kategorie;
  var val = localStorage.getItem(key);
  return val === null ? true : val === '1'; // Standard: alle aktiv
};

window.setPushEnabled = function(kategorie, aktiv) {
  localStorage.setItem('pushEin_' + kategorie, aktiv ? '1' : '0');
};

window.checkWartezeiten = function() {
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  const heute = Date.now();
  const morgen = heute + 86400000;
  
  if(isPushEnabled('wartezeiten')) {
    Object.entries(behandlungen).forEach(([id, b]) => {
      if(!b.aktiv) return;
      const k = kuehe[b.kuhId];
      const name = k ? '#'+k.nr+' '+k.name : 'Kuh';
      if(b.wzMilchEnde && b.wzMilchEnde >= heute && b.wzMilchEnde <= morgen)
        swNotify('⚕ Wartezeit Milch endet heute', {body: name+' · '+(b.medikament||b.diagnose||'Behandlung'), icon:'./icon-192.png', tag:'wz-milch-'+id});
      if(b.wzFleischEnde && b.wzFleischEnde >= heute && b.wzFleischEnde <= morgen)
        swNotify('⚕ Wartezeit Fleisch endet heute', {body: name+' · '+(b.medikament||b.diagnose||'Behandlung'), icon:'./icon-192.png', tag:'wz-fleisch-'+id});
      if(b.folgeTermin && b.folgeTermin >= heute && b.folgeTermin <= morgen)
        swNotify('📅 Tierarzt-Termin heute', {body: name+' · '+(b.tierarzt||''), icon:'./icon-192.png', tag:'termin-'+id});
    });
  }

  if(isPushEnabled('geburten')) {
    Object.entries(besamungen).forEach(([id, bs]) => {
      if(bs.status !== 'tragend' || !bs.erwartetGeburt) return;
      const k = kuehe[bs.kuhId];
      const diff = Math.floor((bs.erwartetGeburt - heute) / 86400000);
      if(diff === 3 || diff === 7)
        swNotify('🐮 Geburt in '+diff+' Tagen', {body: k ? '#'+k.nr+' '+k.name : 'Kuh', icon:'./icon-192.png', tag:'geburt-'+id+'-'+diff});
    });
  }

  if(isPushEnabled('brunst')) {
    Object.entries(besamungen).forEach(([id, bs]) => {
      if(bs.status === 'tragend' || !bs.datum) return;
      const k = kuehe[bs.kuhId];
      const tagSeit = Math.floor((heute - bs.datum) / 86400000);
      if(tagSeit === 19)
        swNotify('🔁 Brunst-Kontrolle', {body: '#'+(k?.nr||'')+' '+(k?.name||'Kuh')+' · Tag 19 nach Besamung', icon:'./icon-192.png', tag:'brunst-'+id});
    });
  }

  if(isPushEnabled('kalender') && typeof window.checkKalenderErinnerungen === 'function')
    window.checkKalenderErinnerungen();

  if(isPushEnabled('backup') && typeof window.checkBackupErinnerung === 'function')
    window.checkBackupErinnerung();
  if(typeof window.checkWartungErinnerungen === 'function') window.checkWartungErinnerungen();
};

// Abend-Check: Wartezeiten die MORGEN ablaufen (für 20:00 Benachrichtigung)
window.checkWartezeiten_abend = function() {
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  const heute = Date.now();
  const morgenStart = heute + 86400000;
  const morgenEnde  = heute + 2 * 86400000;

  if(isPushEnabled('wartezeiten')) {
    Object.entries(behandlungen).forEach(([id, b]) => {
      if(!b.aktiv) return;
      const k = kuehe[b.kuhId];
      const name = k ? '#'+k.nr+' '+k.name : 'Kuh';

      if(b.wzMilchEnde && b.wzMilchEnde >= morgenStart && b.wzMilchEnde < morgenEnde) {
        const zeit = b.behandlungZeit === 'abend' ? 'abends' : 'morgens';
        swNotify('⚕ Morgen: WZ Milch endet ' + zeit, {body: name+' · '+(b.medikament||b.diagnose||'Behandlung'), icon:'./icon-192.png', tag:'wz-milch-abend-'+id});
      }
      if(b.wzFleischEnde && b.wzFleischEnde >= morgenStart && b.wzFleischEnde < morgenEnde) {
        const zeit = b.behandlungZeit === 'abend' ? 'abends' : 'morgens';
        swNotify('⚕ Morgen: WZ Fleisch endet ' + zeit, {body: name+' · '+(b.medikament||b.diagnose||'Behandlung'), icon:'./icon-192.png', tag:'wz-fleisch-abend-'+id});
      }
      if(b.folgeTermin && b.folgeTermin >= morgenStart && b.folgeTermin < morgenEnde)
        swNotify('📅 Morgen: Tierarzt-Termin', {body: name+' · '+(b.tierarzt||''), icon:'./icon-192.png', tag:'termin-abend-'+id});
    });
  }

  if(isPushEnabled('geburten')) {
    Object.entries(besamungen).forEach(([id, bs]) => {
      if(bs.status !== 'tragend' || !bs.erwartetGeburt) return;
      const k = kuehe[bs.kuhId];
      const diff = Math.floor((bs.erwartetGeburt - heute) / 86400000);
      if(diff === 1)
        swNotify('🐮 Morgen: Geburt erwartet', {body: k ? '#'+k.nr+' '+k.name : 'Kuh', icon:'./icon-192.png', tag:'geburt-abend-'+id});
    });
  }
};

// Run check on load, then schedule for 07:00 AND 20:00
window.addEventListener('load', () => {
  setTimeout(() => {
    if(Notification.permission === 'granted') {
      checkWartezeiten();
    }
  }, 3000);

  function scheduleAt(hour, fn) {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);
    if(next <= now) next.setDate(next.getDate() + 1);
    const ms = next.getTime() - now.getTime();
    setTimeout(() => { fn(); setInterval(fn, 24 * 60 * 60 * 1000); }, ms);
  }

  scheduleAt(7,  () => { if(Notification.permission==='granted') checkWartezeiten(); });
  scheduleAt(20, () => { if(Notification.permission==='granted') checkWartezeiten_abend(); });
});

window.renderAlpungsKalender = function() {
  const auftrieb = saisonInfo?.auftriebDatum;
  if(!auftrieb) return '<div class="empty-state">Keine aktive Saison</div>';
  
  const heute = Date.now();
  const tage = Math.min(98, Math.floor((heute - auftrieb) / 86400000) + 1);
  if(tage <= 0) return '<div class="empty-state">Saison noch nicht begonnen</div>';
  
  // Count cows per day from weideTage data
  const tagMap = {};
  Object.values(weideTage||{}).forEach(wt => {
    if(!wt.datum) return;
    const d = new Date(wt.datum).toLocaleDateString('de-AT', {day:'2-digit',month:'2-digit'});
    tagMap[d] = (tagMap[d]||0) + 1;
  });
  
  const obenCount = Object.values(kuehe).filter(k=>k.almStatus==='oben').length;
  
  let html = '<div style="margin-bottom:.5rem;font-size:.75rem;color:var(--text3)">Kühe auf der Alm pro Tag (Zählung)</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:1rem">';
  
  // Weekday headers
  ['Mo','Di','Mi','Do','Fr','Sa','So'].forEach(d => {
    html += `<div style="text-align:center;font-size:.6rem;color:var(--text3);padding:.2rem">${d}</div>`;
  });
  
  // Fill empty cells for first week
  const firstDay = new Date(auftrieb);
  const firstWeekday = (firstDay.getDay() + 6) % 7; // 0=Mo
  for(let i=0; i<firstWeekday; i++) {
    html += '<div></div>';
  }
  
  for(let t=0; t<tage; t++) {
    const d = new Date(auftrieb + t * 86400000);
    const key = d.toLocaleDateString('de-AT', {day:'2-digit',month:'2-digit'});
    const count = tagMap[key] || 0;
    const isToday = t === tage - 1;
    const ratio = obenCount > 0 ? count / obenCount : 0;
    const alpha = count === 0 ? 0.08 : 0.2 + ratio * 0.7;
    const dayNum = d.getDate();
    
    html += `<div style="aspect-ratio:1;background:rgba(77,184,78,${alpha});border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:.6rem;color:${count>0?'var(--text)':'var(--text3)'};border:${isToday?'1.5px solid var(--gold)':'none'};cursor:${count>0?'pointer':'default'}" title="${key}: ${count} Kühe">
      ${dayNum}
    </div>`;
  }
  
  html += '</div>';
  html += `<div style="display:flex;gap:1rem;font-size:.7rem;color:var(--text3)">
    <span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:rgba(77,184,78,.08);vertical-align:middle"></span> Keine Daten</span>
    <span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:rgba(77,184,78,.5);vertical-align:middle"></span> Teilweise</span>
    <span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:rgba(77,184,78,.9);vertical-align:middle"></span> Voll belegt</span>
  </div>`;
  
  return html;
};

window.setAlpTab = function(tab, btn) {
  document.querySelectorAll('#alp-tab-liste,#alp-tab-kalender').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  const kalEl = document.getElementById('alp-kalender-view');
  const listeEl = document.getElementById('alp-liste-view');
  if(tab === 'kalender') {
    if(kalEl) kalEl.style.display=''; else {
      const div=document.createElement('div'); div.id='alp-kalender-view';
      div.innerHTML=renderAlpungsKalender();
      const page=document.querySelector('.page');
      if(page) page.appendChild(div);
    }
    if(listeEl) listeEl.style.display='none';
  } else {
    if(kalEl) kalEl.style.display='none';
    if(listeEl) listeEl.style.display='';
  }
};

window.showMilchForm = function() {
  const ov = document.getElementById('milch-form-overlay');
  if(!ov) { navigate('milch'); setTimeout(showMilchForm, 300); return; }
  // Reset
  document.getElementById('m-datum').value = isoDate(new Date());
  document.getElementById('m-zeit').value = 'morgen';
  const molkereiEl = document.getElementById('m-molkerei');
  if(molkereiEl) molkereiEl.checked = false;
  const notizEl = document.getElementById('m-notiz');
  if(notizEl) notizEl.value = '';
  document.querySelectorAll('.kuh-liter').forEach(inp => {
    inp.value = '';
    const row = inp.closest('.milch-kuh-row');
    if(row) { row.style.background=''; const badge=row.querySelector('.nr-badge'); if(badge) badge.style.background=''; }
  });
  const sumEl=document.getElementById('m-summe'); if(sumEl) sumEl.textContent='0';
  const cntEl=document.getElementById('m-count'); if(cntEl) cntEl.textContent='0';
  document.querySelector('#m-zeit-morgen')?.classList.add('active');
  document.querySelector('#m-zeit-abend')?.classList.remove('active');
  if(window.setMilchModus) setMilchModus('prokuh');
  document.querySelectorAll('.milch-kuh-row').forEach(r=>r.style.display='');
  // Last entry hint
  const letzteEintraege = Object.values(milchEintraege).sort((a,b)=>b.datum-a.datum);
  const letzte = letzteEintraege[0];
  let hintEl = document.getElementById('m-letzte-hint');
  if(!hintEl) {
    hintEl = document.createElement('div');
    hintEl.id = 'm-letzte-hint';
    hintEl.style.cssText = 'font-size:.72rem;color:var(--text3);margin:.2rem 0 .4rem;text-align:center';
    const body = ov.querySelector('.form-body');
    if(body) body.insertBefore(hintEl, body.firstChild);
  }
  if(letzte) {
    const diff = Math.floor((Date.now()-letzte.datum)/86400000);
    const wann = diff===0?'heute':diff===1?'gestern':diff+' Tage zuvor';
    hintEl.textContent = 'Letzter: '+Math.round(letzte.gesamt*10)/10+'L · '+(letzte.zeit==='abend'?'🌇':'🌅')+' '+wann;
  }
  // Edit ID reset
  const eid = document.getElementById('m-edit-id'); if(eid) eid.value='';
  const titleEl = document.getElementById('m-form-title'); if(titleEl) titleEl.textContent='🥛 Milch erfassen';
  ov.style.display='flex';
  setTimeout(()=>{ document.querySelector('.kuh-liter')?.focus(); }, 150);
};

function renderWetter() {
  const w = window._wetterData;
  const ort = localStorage.getItem('wetterOrt') || 'Innsbruck';
  const aktTab = window._wetterTab || 'wetter';

  setTimeout(() => {
    if(!window._wetterForecast) ladeWetterPrognose();
    if(aktTab === 'karte') setTimeout(initAlmKarte, 200);
  }, 100);

  return `
    <div class="page-header"><h2>⛅ Wetter & Karte</h2>
      <button class="btn-xs" onclick="ladeWetter();ladeWetterPrognose()">↻</button>
    </div>

    <!-- Tab-Chips -->
    <div style="display:flex;gap:.4rem;margin-bottom:.8rem">
      <button class="filter-chip ${aktTab==='wetter'?'active':''}" onclick="window._wetterTab='wetter';render()">⛅ Wetter</button>
      <button class="filter-chip ${aktTab==='karte'?'active':''}" onclick="window._wetterTab='karte';render()">🗺 Almkarte</button>
    </div>

    ${aktTab === 'wetter' ? `
    <!-- WETTER TAB -->
    ${w ? `
    <div style="background:linear-gradient(135deg,rgba(30,80,140,.3),rgba(30,80,140,.1));border:1px solid rgba(80,140,200,.3);border-radius:var(--radius-sm);padding:1rem;margin-bottom:.8rem;text-align:center">
      <div style="font-size:.75rem;color:var(--text3);margin-bottom:.3rem">${w.ort} · ${w.updated}</div>
      <div style="font-size:3.5rem;margin-bottom:.3rem">${w.icon}</div>
      <div style="font-size:2.2rem;font-weight:900;color:#7acbff">${w.temp}°C</div>
      <div style="font-size:.9rem;color:var(--text2)">${w.desc}</div>
      <div style="font-size:.78rem;color:var(--text3);margin-top:.3rem">Gefühlt ${w.feels}°C · Wind ${w.wind} km/h</div>
    </div>` : `<div style="text-align:center;padding:1rem;color:var(--text3)">⏳ Wetterdaten werden geladen…</div>`}
    <div class="section-title">7-Tage Prognose</div>
    <div id="wetter-prognose"><div style="text-align:center;color:var(--text3);padding:1rem">⏳ Prognose wird geladen…</div></div>
    <div class="section-title" style="margin-top:.8rem">Ort</div>
    <select class="inp" onchange="localStorage.setItem('wetterOrt',this.value);ladeWetter();ladeWetterPrognose();render()">
      ${['Innsbruck','Lienz','Imst','Landeck','Kitzbühel','Reutte','Schwaz','Bregenz','Feldkirch','Bludenz','Klagenfurt','Villach','Salzburg','Zell am See','St. Johann'].map(o=>`<option value="${o}" ${ort===o?'selected':''}>${o}</option>`).join('')}
    </select>
    ` : `

    <!-- KARTE TAB -->
    <!-- GPS / manuelle Koordinaten -->
    <div style="display:flex;gap:.4rem;margin-bottom:.5rem;flex-wrap:wrap;align-items:center">
      <button class="btn-secondary" style="font-size:.75rem;padding:.35rem .7rem" onclick="almKarteGPS()">📍 GPS-Standort</button>
      <button class="btn-secondary" style="font-size:.75rem;padding:.35rem .7rem" onclick="almKarteManuelleKoords()">✎ Manuell</button>
      <button class="btn-secondary ${window._radarAktiv?'active':''}" style="font-size:.75rem;padding:.35rem .7rem" onclick="toggleRadar()">🌧 Radar</button>
      <button class="btn-secondary ${window._weideZeichnen?'active':''}" style="font-size:.75rem;padding:.35rem .7rem;${window._weideZeichnen?'border-color:var(--green);color:var(--green)':''}" onclick="toggleWeideZeichnen()">🌿 Weide zeichnen</button>
    </div>
    ${window._weideZeichnen?`<div style="background:rgba(77,184,78,.08);border:1px solid rgba(77,184,78,.3);border-radius:var(--radius-sm);padding:.35rem .7rem;margin-bottom:.4rem;font-size:.73rem;color:var(--green)">🌿 Auf Karte tippen um Weidegrenze zu zeichnen · Doppeltippen zum Abschließen</div>`:''}

    <!-- Leaflet Karte -->
    <div id="alm-karte" style="width:100%;height:420px;border-radius:var(--radius-sm);border:1px solid var(--border);overflow:hidden;background:var(--bg3)"></div>

    <!-- Weiden-Liste -->
    <div id="alm-weiden-liste" style="margin-top:.6rem"></div>

    <!-- Manuelle Koords Overlay -->
    <div id="alm-koords-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>📍 Almstandort setzen</h3><button class="close-btn" onclick="closeForm('alm-koords-overlay')">✕</button></div>
        <div class="form-body">
          <label class="inp-label">Breitengrad (Latitude)</label>
          <input id="alm-lat" class="inp" type="number" step="0.0001" placeholder="z.B. 47.2692" value="${localStorage.getItem('almLat')||''}" inputmode="decimal"/>
          <label class="inp-label">Längengrad (Longitude)</label>
          <input id="alm-lon" class="inp" type="number" step="0.0001" placeholder="z.B. 11.4041" value="${localStorage.getItem('almLon')||''}" inputmode="decimal"/>
          <p style="font-size:.72rem;color:var(--text3)">Tipp: Koordinaten aus Google Maps kopieren (rechtsklick → Koordinaten)</p>
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('alm-koords-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="almKarteSpeichereKoords()">Speichern & Karte öffnen</button>
          </div>
        </div>
      </div>
    </div>
    `}
  `;
}

// ══════════════════════════════════════════════════════════════
//  ALM-WETTERKARTE
// ══════════════════════════════════════════════════════════════
window._almKarte = null;
window._radarLayer = null;
window._radarAktiv = false;
window._weideZeichnen = false;
window._weideLayer = null;
window._weidePunkte = [];
window._weidePolygone = []; // [{name, coords, color}]

window.initAlmKarte = async function() {
  if(!document.getElementById('alm-karte')) return;
  if(typeof L === 'undefined') { setTimeout(window.initAlmKarte, 300); return; }

  // Koordinaten bestimmen
  let lat = parseFloat(localStorage.getItem('almLat')) || 47.27;
  let lon = parseFloat(localStorage.getItem('almLon')) || 11.40;
  const zoom = parseInt(localStorage.getItem('almZoom')) || 13;

  // Karte initialisieren (oder wiederverwenden)
  if(window._almKarte) {
    window._almKarte.remove();
    window._almKarte = null;
  }

  const map = L.map('alm-karte', {
    center: [lat, lon],
    zoom: zoom,
    zoomControl: true,
    attributionControl: true,
  });
  window._almKarte = map;

  // Basis-Layer: OpenStreetMap
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19
  });

  // Satelliten-Layer: Esri
  const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri',
    maxZoom: 19
  });

  // Layer-Control
  L.control.layers({'🗺 Karte': osmLayer, '🛰 Satellit': satLayer}).addTo(map);
  osmLayer.addTo(map);

  // Standort-Marker
  const almIcon = L.divIcon({
    html: '<div style="font-size:1.6rem;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">🏔</div>',
    className: '', iconSize: [30,30], iconAnchor: [15,15]
  });
  L.marker([lat, lon], {icon: almIcon})
    .addTo(map)
    .bindPopup('<b>Almstandort</b><br>'+lat.toFixed(4)+', '+lon.toFixed(4))
    .openPopup();

  // Radar laden wenn aktiv
  if(window._radarAktiv) await ladeRadarLayer(map);

  // Gespeicherte Weiden einzeichnen
  ladeGespeicherteWeiden(map);

  // Klick-Handler für Weide-Zeichnen
  map.on('click', function(e) {
    if(!window._weideZeichnen) return;
    window._weidePunkte.push([e.latlng.lat, e.latlng.lng]);
    aktualisiereWeidePreview(map);
  });

  map.on('dblclick', function(e) {
    if(!window._weideZeichnen || window._weidePunkte.length < 3) return;
    L.DomEvent.stop(e);
    weideAbschliessen(map);
  });

  // Zoom speichern
  map.on('zoomend', function() {
    localStorage.setItem('almZoom', map.getZoom());
  });
  map.on('moveend', function() {
    const c = map.getCenter();
    localStorage.setItem('almLat', c.lat.toFixed(5));
    localStorage.setItem('almLon', c.lng.toFixed(5));
  });

  // Weiden-Liste rendern
  renderWeidenListe();
};

window.ladeRadarLayer = async function(map) {
  try {
    // RainViewer API – kostenlos, kein Key
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    const data = await res.json();
    const frames = data.radar?.past || [];
    if(!frames.length) return;
    const latest = frames[frames.length-1];
    const url = 'https://tilecache.rainviewer.com'+latest.path+'/256/{z}/{x}/{y}/2/1_1.png';

    if(window._radarLayer) { map.removeLayer(window._radarLayer); }
    window._radarLayer = L.tileLayer(url, {
      opacity: 0.6,
      attribution: '© <a href="https://rainviewer.com">RainViewer</a>'
    }).addTo(map);

    // Zeitstempel anzeigen
    const zeit = new Date(latest.time * 1000).toLocaleTimeString('de-AT', {hour:'2-digit',minute:'2-digit'});
    const info = document.createElement('div');
    info.style.cssText = 'position:absolute;bottom:8px;left:8px;z-index:999;background:rgba(0,0,0,.7);color:#fff;font-size:.65rem;padding:2px 6px;border-radius:4px';
    info.textContent = '🌧 Radar: '+zeit+' Uhr';
    document.getElementById('alm-karte')?.appendChild(info);
  } catch(e) {
    console.warn('Radar laden fehlgeschlagen:', e);
  }
};

window.toggleRadar = async function() {
  window._radarAktiv = !window._radarAktiv;
  const map = window._almKarte;
  if(!map) return;
  if(window._radarAktiv) {
    await ladeRadarLayer(map);
  } else {
    if(window._radarLayer) { map.removeLayer(window._radarLayer); window._radarLayer = null; }
  }
  render();
};

window.toggleWeideZeichnen = function() {
  window._weideZeichnen = !window._weideZeichnen;
  window._weidePunkte = [];
  if(window._weidePreview) { window._almKarte?.removeLayer(window._weidePreview); window._weidePreview = null; }
  render();
};

window.aktualisiereWeidePreview = function(map) {
  if(window._weidePreview) map.removeLayer(window._weidePreview);
  if(window._weidePunkte.length < 2) return;
  window._weidePreview = L.polyline(window._weidePunkte, {
    color:'#4db84e', weight:3, dashArray:'6,6', opacity:.8
  }).addTo(map);
};

window.weideAbschliessen = function(map) {
  const farben = ['#4db84e','#4ab8e8','#d4a84b','#d44b4b','#a04bc8'];
  const farbe = farben[Object.keys(window._weidePolygone||[]).length % farben.length];
  const name = prompt('Name für diese Weide:', 'Weide '+(Object.keys(stallplan||{}).length+1)) || 'Weide';

  // Preview entfernen
  if(window._weidePreview) { map.removeLayer(window._weidePreview); window._weidePreview = null; }

  // Polygon hinzufügen
  const polygon = L.polygon(window._weidePunkte, {
    color: farbe, fillColor: farbe, fillOpacity: 0.2, weight: 2
  }).addTo(map).bindPopup('<b>'+name+'</b>');

  // In Firebase speichern
  const weideData = { name, coords: window._weidePunkte, farbe, erstellt: Date.now() };
  push(ref(db, 'almKarteWeiden'), weideData).catch(function(e){console.warn('Weide-Save:',e);});

  window._weidePunkte = [];
  window._weideZeichnen = false;
  render();
};

window.ladeGespeicherteWeiden = function(map) {
  onValue(ref(db, 'almKarteWeiden'), function(snap) {
    const weiden = snap.val() || {};
    // Alte Layer entfernen
    if(window._weideLayerGroup) map.removeLayer(window._weideLayerGroup);
    window._weideLayerGroup = L.layerGroup().addTo(map);
    Object.entries(weiden).forEach(([id, w]) => {
      if(!w.coords || w.coords.length < 3) return;
      L.polygon(w.coords, {
        color: w.farbe||'#4db84e', fillColor: w.farbe||'#4db84e',
        fillOpacity: 0.2, weight: 2
      }).addTo(window._weideLayerGroup)
        .bindPopup('<b>'+w.name+'</b><br><button onclick="loescheWeide(\''+id+'\')" style="font-size:.75rem;color:var(--red);background:none;border:none;cursor:pointer;padding:0;margin-top:4px">🗑 Löschen</button>');
    });
    window._almWeiden = weiden;
    renderWeidenListe();
  }, {onlyOnce: true});
};

window.loescheWeide = async function(id) {
  if(!confirm('Weide löschen?')) return;
  await remove(ref(db, 'almKarteWeiden/'+id));
  if(window._almKarte) ladeGespeicherteWeiden(window._almKarte);
};

window.renderWeidenListe = function() {
  const el = document.getElementById('alm-weiden-liste');
  if(!el) return;
  const weiden = window._almWeiden || {};
  const liste = Object.entries(weiden);
  if(!liste.length) { el.innerHTML = ''; return; }
  el.innerHTML =
    '<div class="section-label" style="margin-bottom:.3rem">EINGEZEICHNETE WEIDEN</div>'+
    '<div style="display:flex;flex-wrap:wrap;gap:.3rem">'+
    liste.map(([id,w])=>
      '<span style="display:inline-flex;align-items:center;gap:.3rem;background:var(--bg3);border:1px solid '+(w.farbe||'#4db84e')+
      '44;border-radius:12px;padding:3px 10px;font-size:.75rem">'+
      '<span style="width:8px;height:8px;border-radius:50%;background:'+(w.farbe||'#4db84e')+'"></span>'+
      w.name+
      '<button onclick="loescheWeide(\''+id+'\')" style="background:none;border:none;color:var(--text3);cursor:pointer;padding:0;font-size:.75rem;margin-left:2px">✕</button>'+
      '</span>'
    ).join('')+'</div>';
};

window.almKarteGPS = function() {
  if(!navigator.geolocation) { alert('GPS nicht verfügbar'); return; }
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      localStorage.setItem('almLat', lat.toFixed(5));
      localStorage.setItem('almLon', lon.toFixed(5));
      if(window._almKarte) {
        window._almKarte.setView([lat,lon], 14);
      } else {
        initAlmKarte();
      }
      showSaveToast && showSaveToast('GPS: '+lat.toFixed(4)+', '+lon.toFixed(4));
    },
    function(e) { alert('GPS-Fehler: '+e.message); },
    {enableHighAccuracy: true, timeout: 10000}
  );
};

window.almKarteManuelleKoords = function() {
  document.getElementById('alm-koords-overlay').style.display = 'flex';
};

window.almKarteSpeichereKoords = function() {
  const lat = parseFloat(document.getElementById('alm-lat')?.value);
  const lon = parseFloat(document.getElementById('alm-lon')?.value);
  if(isNaN(lat)||isNaN(lon)||lat<40||lat>52||lon<8||lon>18) {
    alert('Ungültige Koordinaten. Österreich: Lat 46-49, Lon 9-17');
    return;
  }
  localStorage.setItem('almLat', lat.toFixed(5));
  localStorage.setItem('almLon', lon.toFixed(5));
  closeForm('alm-koords-overlay');
  initAlmKarte();
};

// Karte stoppen wenn Navigation weg
const _origNavWetter = window.navigate;
window.navigate = function(view) {
  if(view !== 'wetter' && window._almKarte) {
    window._almKarte.remove();
    window._almKarte = null;
  }
  _origNavWetter(view);
};

window.ladeWetterPrognose = async function() {
  const ORTE = {
    'Innsbruck':{lat:47.2692,lon:11.4041},'Lienz':{lat:46.8289,lon:12.7693},
    'Imst':{lat:47.2448,lon:10.7397},'Landeck':{lat:47.1408,lon:10.5650},
    'Kitzbühel':{lat:47.4467,lon:12.3926},'Reutte':{lat:47.4833,lon:10.7167},
    'Schwaz':{lat:47.3531,lon:11.7092},'Bregenz':{lat:47.5031,lon:9.7471},
    'Feldkirch':{lat:47.2372,lon:9.5973},'Bludenz':{lat:47.1528,lon:9.8218},
    'Klagenfurt':{lat:46.6228,lon:14.3053},'Villach':{lat:46.6133,lon:13.8558},
    'Salzburg':{lat:47.8095,lon:13.0550},'Zell am See':{lat:47.3256,lon:12.7956},
    'St. Johann':{lat:47.5261,lon:12.4228},
  };
  const WMO_ICONS2 = {0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',51:'🌦️',53:'🌦️',55:'🌦️',61:'🌧️',63:'🌧️',65:'🌧️',71:'🌨️',73:'🌨️',75:'❄️',80:'🌦️',81:'🌧️',82:'⛈️',95:'⛈️',99:'⛈️'};
  const WMO_DESC2 = {0:'Klar',1:'Klar',2:'Teils bewölkt',3:'Bedeckt',45:'Nebel',48:'Nebel',51:'Nieselregen',53:'Nieselregen',55:'Nieselregen',61:'Leichter Regen',63:'Regen',65:'Starker Regen',71:'Leichter Schnee',73:'Schnee',75:'Starker Schnee',80:'Schauer',81:'Schauer',82:'Starke Schauer',95:'Gewitter',99:'Gewitter'};
  
  const coords = ORTE[ort];
  if(!coords) return;
  
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,wind_speed_10m_max&wind_speed_unit=kmh&timezone=Europe%2FVienna&forecast_days=7`;
    const res = await fetch(url);
    const data = await res.json();
    const d = data.daily;
    window._wetterForecast = d;
    
    const el = document.getElementById('wetter-prognose');
    if(!el) return;
    
    const heute = new Date().toISOString().slice(0,10);
    el.innerHTML = d.time.map((day, i) => {
      const isHeute = day === heute;
      const datum = new Date(day);
      const tagName = isHeute ? 'Heute' : datum.toLocaleDateString('de-AT', {weekday:'short', day:'numeric', month:'short'});
      const icon = WMO_ICONS[d.weather_code[i]] || '⛅';
      const desc = WMO_DESC[d.weather_code[i]] || '';
      const tmax = Math.round(d.temperature_2m_max[i]);
      const tmin = Math.round(d.temperature_2m_min[i]);
      const regen = d.precipitation_sum[i];
      const wind = Math.round(d.wind_speed_10m_max[i]);
      
      return `<div style="display:flex;align-items:center;gap:.6rem;padding:.6rem .8rem;background:${isHeute?'rgba(80,140,200,.12)':'var(--bg2)'};border-radius:var(--radius-sm);margin-bottom:.3rem;border:${isHeute?'1px solid rgba(80,140,200,.3)':'1px solid var(--border)'}">
        <div style="width:72px;font-size:.78rem;color:${isHeute?'#7acbff':'var(--text3)'};font-weight:${isHeute?'bold':'normal'}">${tagName}</div>
        <div style="font-size:1.5rem;width:32px;text-align:center">${icon}</div>
        <div style="flex:1">
          <div style="font-size:.8rem;color:var(--text2)">${desc}</div>
          <div style="font-size:.68rem;color:var(--text3)">${regen>0?'🌧 '+regen+'mm · ':''} 💨 ${wind} km/h</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:.9rem;font-weight:bold;color:#ff7a7a">${tmax}°</div>
          <div style="font-size:.78rem;color:#7acbff">${tmin}°</div>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    const el = document.getElementById('wetter-prognose');
    if(el) el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:1rem">Prognose nicht verfügbar</div>';
  }
};

// ══════════════════════════════════════════════════════════════
//  AUTHENTICATION & ROLES
// ══════════════════════════════════════════════════════════════

// Role definitions: what each role can do
const ROLE_PERMISSIONS = {
  admin:       {read:true, write:true, milch:true, behandlung:true, zaehlung:true, benutzer:true, alles:true},
  hirte:       {read:true, write:true, milch:true, behandlung:true, zaehlung:true, benutzer:false, alles:false},
  milchmesser: {read:false, write:false, milch:true, behandlung:false, zaehlung:false, benutzer:false, alles:false},
  molkerei:    {read:true, write:false, milch:true, behandlung:false, zaehlung:false, benutzer:false, alles:false},
};

// Hidden modules per role
var ROLE_HIDDEN_MODULES = {
  milchmesser: ['zaehlung','weide','behandlung','besamung','bestandsbuch','einstellungen','journal','alpung','kontakte','gruppen','kontrolle','kalender','statistik','backup','suche','chat','kraftfutter','wetter','bauern_menu','saison','__drucken__'],
  molkerei:    ['behandlung','besamung','bestandsbuch','einstellungen','journal','alpung','kontakte','gruppen','kontrolle','chat','kraftfutter','wetter','bauern_menu','zaehlung','__drucken__'],
  hirte:       ['einstellungen','benutzer'],
  admin:       [],
};

window._currentUser = null;
window._currentRole = null;
window._auth = null;

function initAuth() {
  if(!firebase.auth) { console.error('Auth not loaded'); return; }
  window._auth = firebase.auth();
  
  // Show login screen immediately
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('root').style.display = 'none';
  
  firebase.auth().onAuthStateChanged(async function(user) {
    if(user) {
      // Load role from DB
      try {
        const snap = await firebase.database().ref('benutzer/' + user.uid).get();
        const userData = snap.val() || {};
        window._currentUser = {...user, ...userData};
        window._currentRole = userData.rolle || 'hirte';
        
        // Check if approved
        if(userData.aktiv === false) {
          await firebase.auth().signOut();
          showLoginError('Dein Konto wurde noch nicht freigegeben. Bitte Admin kontaktieren.');
          return;
        }
        
        // Show app
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('root').style.display = '';
        
        // Update topbar with user info
        updateUserDisplay();
        
        // Init app
        if(typeof initApp === 'function' && !window._appInitialized) {
          window._appInitialized = true;
        
          initApp();
        }
      } catch(e) {
        console.error('Role load error:', e);
        showLoginError && showLoginError('Fehler beim Laden. Bitte neu laden.');
      }
    } else {
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('root').style.display = 'none';
      window._appInitialized = false;
    }
  });
}

window.alleAuftreiben = async function() {
  if(!confirm('Alle Kühe als aufgetrieben markieren?')) return;
  const updates = {};
  Object.entries(kuehe).forEach(([id, k]) => {
    if(k.almStatus !== 'oben') updates['kuehe/' + id + '/almStatus'] = 'oben';
  });
  if(Object.keys(updates).length === 0) { alert('Alle Kühe sind bereits aufgetrieben.'); return; }
  await update(ref(db, '/'), updates);
  showSaveToast && showSaveToast(Object.keys(updates).length + ' Kühe aufgetrieben');
};

window.changeRolle = async function(uid, neueRolle) {
  await firebase.database().ref('benutzer/' + uid + '/rolle').set(neueRolle);
  showSaveToast && showSaveToast('Rolle geändert');
};

window.setMilchModus = function(modus) {
  document.getElementById('m-prokuh-block').style.display = modus==='prokuh' ? '' : 'none';
  document.getElementById('m-gesamt-block').style.display = modus==='gesamt' ? '' : 'none';
  const tb1 = document.getElementById('m-tab-prokuh');
  const tb2 = document.getElementById('m-tab-gesamt');
  if(tb1) { tb1.style.background=modus==='prokuh'?'var(--gold)':'transparent'; tb1.style.color=modus==='prokuh'?'#000':'var(--text3)'; tb1.style.border=modus==='prokuh'?'2px solid var(--gold)':'1px solid var(--border)'; tb1.style.fontWeight=modus==='prokuh'?'bold':'normal'; }
  if(tb2) { tb2.style.background=modus==='gesamt'?'var(--gold)':'transparent'; tb2.style.color=modus==='gesamt'?'#000':'var(--text3)'; tb2.style.border=modus==='gesamt'?'2px solid var(--gold)':'1px solid var(--border)'; tb2.style.fontWeight=modus==='gesamt'?'bold':'normal'; }
};
window.toggleMilchArt = window.setMilchModus;

window.filterMilchBauer = function(bauer, btn) {
  document.querySelectorAll('#m-bauer-filter .filter-chip').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  document.querySelectorAll('.milch-kuh-row').forEach(row => {
    row.style.display = (!bauer || row.dataset.bauer === bauer) ? '' : 'none';
  });
};

window.milchStep = function(kuhId, delta) {
  const inp = document.querySelector('.kuh-liter[data-id="' + kuhId + '"]');
  if(!inp) return;
  const cur = parseFloat(inp.value)||0;
  const neu = Math.max(0, Math.round((cur + delta) * 10) / 10);
  inp.value = neu || '';
  onMilchInput(inp);
};

window.onMilchInput = function(inp) {
  const row = inp.closest('.milch-kuh-row');
  const val = parseFloat(inp.value)||0;
  if(row) {
    row.style.background = val > 0 ? 'rgba(77,184,78,.08)' : '';
    const badge = row.querySelector('.nr-badge');
    if(badge) badge.style.background = val > 0 ? 'var(--green)' : '';
  }
  let sum = 0, count = 0;
  document.querySelectorAll('.kuh-liter').forEach(i => { const v=parseFloat(i.value)||0; if(v>0){sum+=v;count++;} });
  const sumEl=document.getElementById('m-summe'); if(sumEl) sumEl.textContent=Math.round(sum*10)/10;
  const cntEl=document.getElementById('m-count'); if(cntEl) cntEl.textContent=count;
};

window.selectMilchZeit = function(zeit, btn) {
  document.getElementById('m-zeit').value = zeit;
  document.querySelectorAll('#m-zeit-morgen,#m-zeit-abend').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');
};

// ══════════════════════════════════════════════════════════════
//  KÄSE PRODUKTION MODULE
// ══════════════════════════════════════════════════════════════
// KÄSE MODULE - rewritten for HerdenPro
// All functions prefixed with kp_ to avoid collisions

window.kp_sorten = [];
window.kp_pxPerHour = 28;
window.kp_viewHours = 32;

// ── Colors & helpers ──
window.kp_COLORS = ['#4db84e','#3a8fd4','#d4882a','#9b4db8','#d45a3a','#3ab8a0','#b8a03a','#b83a6e'];
window.kp_hhmm = function(m){ const h=Math.floor(m/60)%24,mm=m%60; return h+':'+(mm<10?'0':'')+mm; };

// ── Build overlap set ──
window.kp_buildOverlapSet = function() {
  const s = new Set();
  kp_sorten.forEach((sorte, si) => {
    const tim = kp_getTimings(sorte);
    tim.forEach((t1, ai) => {
      tim.forEach((t2, bi) => {
        if(ai >= bi) return;
        if(t1.startMin < t2.endMin && t1.endMin > t2.startMin) {
          s.add(si+'-'+ai); s.add(si+'-'+bi);
        }
      });
    });
  });
  return {s};
};

// ── Get timings ──
window.kp_getTimings = function(sorte) {
  let cur = sorte.startMin || 0;
  return (sorte.schritte||[]).map(sc => {
    const start = cur;
    const end = cur + (sc.dauer||0);
    if(!sc.parallel) cur = end;
    return {startMin: start, endMin: end};
  });
};

// ── Firebase save/load ──
window.kp_save = async function() {
  try {
    if(!db) return;
    await firebase.database().ref('kaese_produktion').set({
      sorten: JSON.parse(JSON.stringify(kp_sorten)),
      pxPerHour: kp_pxPerHour,
      viewHours: kp_viewHours
    });
  } catch(e) { console.warn('Käse save:', e); }
};

window.kp_load = async function() {
  try {
    if(!db) return false;
    const snap = await firebase.database().ref('kaese_produktion').get();
    const obj = snap.val();
    if(!obj || !Array.isArray(obj.sorten)) return false;
    obj.sorten.forEach(s => { if(s.visible===undefined) s.visible=true; });
    kp_sorten = obj.sorten;
    kp_pxPerHour = obj.pxPerHour || 28;
    kp_viewHours = obj.viewHours || 32;
    return true;
  } catch(e) { return false; }
};

// ── Debounced save ──
window.kp_debounceSave = function() {
  clearTimeout(window._kpSaveTimer);
  window._kpSaveTimer = setTimeout(() => kp_save(), 1500);
};

// ── Default sorten ──
window.kp_defaultSorten = function() {
  return [
    { name:'Bergkäse', color:'#4db84e', visible:true, startMin:360,
      schritte:[
        {name:'Erwärmen',dauer:30,parallel:false},{name:'Lab zugeben',dauer:45,parallel:false},
        {name:'Schneiden',dauer:20,parallel:false},{name:'Rühren/Brennen',dauer:60,parallel:false},
        {name:'Abfüllen',dauer:20,parallel:false},{name:'Pressen',dauer:240,parallel:false},
        {name:'Salzbad',dauer:720,parallel:false},{name:'Reifen',dauer:2880,parallel:false}
      ]},
    { name:'Frischkäse', color:'#3a8fd4', visible:true, startMin:480,
      schritte:[
        {name:'Erwärmen',dauer:20,parallel:false},{name:'Kultur/Lab',dauer:30,parallel:false},
        {name:'Gerinnen',dauer:120,parallel:false},{name:'Abtropfen',dauer:240,parallel:false},
        {name:'Würzen',dauer:15,parallel:false}
      ]}
  ];
};

// ── Render the Gantt chart ──
window.kp_render = function() {
  const container = document.getElementById('kp-container');
  if(!container) return;
  
  const ph = kp_pxPerHour;
  const vh = kp_viewHours;
  const {s: olSet} = kp_buildOverlapSet();
  const visSorten = kp_sorten.filter(s => s.visible);
  
  let html_str = '';
  
  // Header ticks
  let ticks = '';
  const tick = ph >= 80 ? 1 : ph >= 30 ? 2 : 4;
  for(let h=0; h<=vh; h+=tick) {
    const pct = (h/vh)*100;
    const isMid = h > 0 && h % 24 === 0;
    ticks += `<div class="kp-tick${isMid?' kp-midnight':''}" style="left:${pct}%">
      <span>${kp_hhmm(h*60)}</span></div>`;
  }
  
  // Rows
  let rows = '';
  visSorten.forEach((sorte, vi) => {
    const si = kp_sorten.indexOf(sorte);
    const timings = kp_getTimings(sorte);
    
    let bars = '';
    timings.forEach((t, ai) => {
      const sc = sorte.schritte[ai];
      const leftPct = (t.startMin / (vh*60)) * 100;
      const widthPct = ((t.endMin - t.startMin) / (vh*60)) * 100;
      const isOl = olSet.has(si+'-'+ai);
      bars += `<div class="kp-bar-wrap" style="left:${leftPct}%;width:${Math.max(widthPct,0.3)}%">
        <div class="kp-bar${isOl?' kp-overlap':''}" style="background:${sorte.color};border-color:${sorte.color}"
          onclick="kp_showStep(${si},${ai})">
          <div class="kp-bar-label"><span>${sc.name}</span></div>
        </div>
      </div>`;
    });
    
    rows += `<div class="kp-row">
      <div class="kp-row-label">
        <div class="kp-dot" style="background:${sorte.color}"></div>
        <span class="kp-label-text">${sorte.name}</span>
        <div class="kp-row-btns">
          <button class="kp-lbl-btn" onclick="kp_editSorte(${si})">✎</button>
          <button class="kp-lbl-btn" onclick="kp_shiftStart(${si},-30)" title="-30min">◀</button>
          <button class="kp-lbl-btn" onclick="kp_shiftStart(${si},30)" title="+30min">▶</button>
          <button class="kp-lbl-btn kp-del-btn" onclick="kp_deleteSorte(${si})">✕</button>
        </div>
      </div>
      <div class="kp-timeline" ondragover="event.preventDefault()" 
        ondrop="kp_onDrop(event,${si})" 
        ondragstart="kp_onDragStart(event,${si})"
        draggable="false">
        ${bars}
      </div>
    </div>`;
  });
  
  if(visSorten.length === 0) {
    rows = '<div style="text-align:center;padding:2rem;color:var(--text3)">Keine Käsesorten. + Neue Sorte klicken.</div>';
  }
  
  // Overlap warning
  const olCount = olSet.size;
  const olWarn = olCount > 0 ? 
    `<div style="background:rgba(200,60,60,.15);border-left:3px solid var(--red);padding:.4rem .8rem;font-size:.78rem;color:var(--red);margin-bottom:.5rem">
      ⚠ ${Math.ceil(olCount/2)} Überschneidung(en) erkannt
    </div>` : '';
  
  container.innerHTML = `
    ${olWarn}
    <!-- Toolbar -->
    <div class="kp-toolbar">
      <label style="font-size:.75rem;color:var(--text3)">px/h
        <input type="number" id="kp-ph" value="${ph}" min="10" max="120" 
          onchange="kp_pxPerHour=+this.value;kp_render()" 
          style="width:52px;padding:3px 5px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.78rem;margin-left:3px">
      </label>
      <label style="font-size:.75rem;color:var(--text3)">Stunden
        <input type="number" id="kp-vh" value="${vh}" min="8" max="96"
          onchange="kp_viewHours=+this.value;kp_render()"
          style="width:52px;padding:3px 5px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.78rem;margin-left:3px">
      </label>
      <div style="flex:1"></div>
      <button class="btn-primary" onclick="kp_newSorte()" style="font-size:.78rem;padding:.3rem .7rem">+ Neue Sorte</button>
      <button class="btn-secondary" onclick="kp_exportPNG()" style="font-size:.78rem;padding:.3rem .7rem">↓ PNG</button>
      <button class="btn-secondary" onclick="kp_resetDefault()" style="font-size:.78rem;padding:.3rem .7rem">↺ Reset</button>
    </div>
    <!-- Vis chips -->
    <div style="display:flex;flex-wrap:wrap;gap:.3rem;padding:.4rem .6rem;border-bottom:1px solid var(--border)">
      ${kp_sorten.map((s,si)=>`
        <div class="kp-vis-chip${s.visible?'':' kp-hidden'}" onclick="kp_toggleVis(${si})"
          style="border-color:${s.color}20;background:${s.visible?s.color+'20':'transparent'}">
          <div style="width:8px;height:8px;border-radius:50%;background:${s.color};flex-shrink:0"></div>
          <span style="font-size:.72rem">${s.name}</span>
        </div>`).join('')}
    </div>
    <!-- Chart -->
    <div style="overflow-x:auto;padding:.5rem .5rem 3rem">
      <div style="min-width:500px">
        <!-- Time header -->
        <div style="margin-left:180px;height:22px;position:relative;border-bottom:1px solid var(--border);margin-bottom:2px">
          ${ticks}
        </div>
        <!-- Rows -->
        ${rows}
      </div>
    </div>
  `;
};

// ── Shift start time ──
window.kp_shiftStart = function(si, delta) {
  if(!kp_sorten[si]) return;
  kp_sorten[si].startMin = Math.max(0, (kp_sorten[si].startMin||0) + delta);
  kp_render(); kp_debounceSave();
};

// ── Toggle visibility ──
window.kp_toggleVis = function(si) {
  if(!kp_sorten[si]) return;
  kp_sorten[si].visible = !kp_sorten[si].visible;
  kp_render(); kp_debounceSave();
};

// ── Show step detail ──
window.kp_showStep = function(si, ai) {
  const sorte = kp_sorten[si];
  if(!sorte) return;
  const sc = sorte.schritte[ai];
  const tim = kp_getTimings(sorte);
  const t = tim[ai];
  showPopupHTML(
    '<div style="font-weight:bold;font-size:.95rem;color:var(--gold);margin-bottom:.5rem">' + sc.name + '</div>' +
    '<table style="width:100%;font-size:.82rem"><tbody>' +
    '<tr><td style="color:var(--text3);padding:.2rem 0">Sorte</td><td style="color:var(--text)">' + sorte.name + '</td></tr>' +
    '<tr><td style="color:var(--text3)">Start</td><td>' + kp_hhmm(t.startMin) + '</td></tr>' +
    '<tr><td style="color:var(--text3)">Ende</td><td>' + kp_hhmm(t.endMin) + '</td></tr>' +
    '<tr><td style="color:var(--text3)">Dauer</td><td>' + sc.dauer + ' min</td></tr>' +
    '</tbody></table>' +
    '<div style="display:flex;gap:.5rem;margin-top:.8rem">' +
    '<button class="btn-secondary" style="flex:1" onclick="closePopup()">Schließen</button>' +
    '<button class="btn-primary" onclick="closePopup();kp_editSchritt(' + si + ',' + ai + ')">✎ Bearbeiten</button>' +
    '</div>'
  );
};

// ── New Sorte ──
window.kp_newSorte = function() {
  const col = kp_COLORS[kp_sorten.length % kp_COLORS.length];
  showPopupHTML(
    '<div style="font-weight:bold;margin-bottom:.8rem">Neue Käsesorte</div>' +
    '<label class="inp-label">Name</label>' +
    '<input id="kp-ns-name" class="inp" placeholder="z.B. Bergkäse" style="margin-bottom:.4rem" />' +
    '<label class="inp-label">Startzeit (Minuten ab 00:00)</label>' +
    '<input id="kp-ns-start" class="inp" type="number" value="360" placeholder="360 = 06:00" style="margin-bottom:.4rem" />' +
    '<label class="inp-label">Farbe</label>' +
    '<input id="kp-ns-color" class="inp" type="color" value="' + col + '" style="margin-bottom:.8rem;height:38px" />' +
    '<div style="display:flex;gap:.5rem">' +
    '<button class="btn-secondary" style="flex:1" onclick="closePopup()">Abbrechen</button>' +
    '<button class="btn-primary" onclick="kp_addSorte()">Hinzufügen</button>' +
    '</div>'
  );
};

window.kp_addSorte = function() {
  const name = document.getElementById('kp-ns-name')?.value.trim();
  if(!name) { alert('Name erforderlich'); return; }
  const start = parseInt(document.getElementById('kp-ns-start')?.value)||0;
  const color = document.getElementById('kp-ns-color')?.value || kp_COLORS[0];
  kp_sorten.push({name, color, visible:true, startMin:start, schritte:[]});
  closePopup(); kp_render(); kp_debounceSave();
};

// ── Delete Sorte ──
window.kp_deleteSorte = function(si) {
  if(!confirm('Sorte "' + kp_sorten[si]?.name + '" löschen?')) return;
  kp_sorten.splice(si, 1);
  kp_render(); kp_debounceSave();
};

// ── Edit Sorte (name/color/start + manage schritte) ──
window.kp_editSorte = function(si) {
  const s = kp_sorten[si];
  if(!s) return;
  const schritteHTML = (s.schritte||[]).map((sc,ai) =>
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.25rem 0;border-bottom:1px solid var(--border);font-size:.8rem">' +
    '<span style="flex:1">' + sc.name + ' (' + sc.dauer + ' min)</span>' +
    '<button class="btn-xs" onclick="closePopup();kp_editSchritt(' + si + ',' + ai + ')">✎</button>' +
    '<button class="btn-xs-danger" onclick="kp_sorten[' + si + '].schritte.splice(' + ai + ',1);closePopup();kp_render();kp_editSorte(' + si + ')">✕</button>' +
    '</div>'
  ).join('');
  
  showPopupHTML(
    '<div style="font-weight:bold;margin-bottom:.6rem">✎ ' + s.name + '</div>' +
    '<label class="inp-label">Name</label>' +
    '<input id="kp-es-name" class="inp" value="' + s.name + '" style="margin-bottom:.4rem" />' +
    '<label class="inp-label">Startzeit (Min ab 00:00, 360=06:00)</label>' +
    '<input id="kp-es-start" class="inp" type="number" value="' + (s.startMin||0) + '" style="margin-bottom:.4rem" />' +
    '<label class="inp-label">Farbe</label>' +
    '<input id="kp-es-color" class="inp" type="color" value="' + s.color + '" style="margin-bottom:.8rem;height:38px" />' +
    '<div style="font-size:.78rem;font-weight:bold;color:var(--text3);margin-bottom:.3rem">SCHRITTE (' + s.schritte.length + ')</div>' +
    '<div style="max-height:160px;overflow-y:auto;margin-bottom:.5rem">' + (schritteHTML||'<div style="color:var(--text3);font-size:.78rem">Noch keine Schritte</div>') + '</div>' +
    '<button class="btn-secondary" style="width:100%;margin-bottom:.6rem" onclick="closePopup();kp_addSchritt(' + si + ')">+ Schritt hinzufügen</button>' +
    '<div style="display:flex;gap:.5rem">' +
    '<button class="btn-secondary" style="flex:1" onclick="closePopup();kp_render()">Schließen</button>' +
    '<button class="btn-primary" onclick="kp_saveSorteEdit(' + si + ')">💾 Speichern</button>' +
    '</div>'
  );
};

window.kp_saveSorteEdit = function(si) {
  const name = document.getElementById('kp-es-name')?.value.trim();
  const start = parseInt(document.getElementById('kp-es-start')?.value)||0;
  const color = document.getElementById('kp-es-color')?.value;
  if(!name) { alert('Name erforderlich'); return; }
  kp_sorten[si].name = name;
  kp_sorten[si].startMin = start;
  kp_sorten[si].color = color;
  closePopup(); kp_render(); kp_debounceSave();
};

// ── Add Schritt ──
window.kp_addSchritt = function(si) {
  showPopupHTML(
    '<div style="font-weight:bold;margin-bottom:.8rem">+ Schritt zu ' + kp_sorten[si]?.name + '</div>' +
    '<label class="inp-label">Name</label>' +
    '<input id="kp-sc-name" class="inp" placeholder="z.B. Pressen" style="margin-bottom:.4rem" />' +
    '<label class="inp-label">Dauer (Minuten)</label>' +
    '<input id="kp-sc-dauer" class="inp" type="number" value="60" style="margin-bottom:.8rem" />' +
    '<div style="display:flex;gap:.5rem">' +
    '<button class="btn-secondary" style="flex:1" onclick="closePopup();kp_editSorte(' + si + ')">Abbrechen</button>' +
    '<button class="btn-primary" onclick="kp_saveSchritt(' + si + ')">Hinzufügen</button>' +
    '</div>'
  );
};

window.kp_saveSchritt = function(si) {
  const name = document.getElementById('kp-sc-name')?.value.trim();
  const dauer = parseInt(document.getElementById('kp-sc-dauer')?.value)||60;
  if(!name) { alert('Name erforderlich'); return; }
  if(!kp_sorten[si].schritte) kp_sorten[si].schritte = [];
  kp_sorten[si].schritte.push({name, dauer, parallel:false});
  closePopup(); kp_render(); kp_debounceSave();
};

// ── Edit Schritt ──
window.kp_editSchritt = function(si, ai) {
  const sc = kp_sorten[si]?.schritte[ai];
  if(!sc) return;
  showPopupHTML(
    '<div style="font-weight:bold;margin-bottom:.8rem">✎ Schritt bearbeiten</div>' +
    '<label class="inp-label">Name</label>' +
    '<input id="kp-esc-name" class="inp" value="' + sc.name + '" style="margin-bottom:.4rem" />' +
    '<label class="inp-label">Dauer (Minuten)</label>' +
    '<input id="kp-esc-dauer" class="inp" type="number" value="' + sc.dauer + '" style="margin-bottom:.8rem" />' +
    '<div style="display:flex;gap:.5rem">' +
    '<button class="btn-secondary" style="flex:1" onclick="closePopup();kp_editSorte(' + si + ')">Abbrechen</button>' +
    '<button class="btn-primary" onclick="kp_saveSchrittEdit(' + si + ',' + ai + ')">💾 Speichern</button>' +
    '</div>'
  );
};

window.kp_saveSchrittEdit = function(si, ai) {
  const name = document.getElementById('kp-esc-name')?.value.trim();
  const dauer = parseInt(document.getElementById('kp-esc-dauer')?.value)||60;
  if(!name) return;
  kp_sorten[si].schritte[ai].name = name;
  kp_sorten[si].schritte[ai].dauer = dauer;
  closePopup(); kp_render(); kp_debounceSave();
};

// ── Reset to defaults ──
window.kp_resetDefault = function() {
  if(!confirm('Alle Daten zurücksetzen?')) return;
  kp_sorten = kp_defaultSorten();
  kp_render(); kp_debounceSave();
};

// ── PNG Export ──
window.kp_exportPNG = function() {
  const LABEL=180, ROW=60, HEADER=24, PAD=16;
  const ph = kp_pxPerHour, vh = kp_viewHours;
  const totalPx = ph * vh;
  const visSorten = kp_sorten.filter(s=>s.visible);
  const W = LABEL + totalPx + PAD*2;
  const H = HEADER + ROW*visSorten.length + PAD*2 + 30;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a1a04'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = '#4db84e'; ctx.font = 'bold 13px Arial';
  ctx.fillText('Käseproduktion – ' + new Date().toLocaleDateString('de-AT'), PAD, 18);
  const tick = ph>=80?1:ph>=30?2:4;
  let y = HEADER + PAD;
  ctx.font = '9px Arial';
  for(let h=0;h<=vh;h+=tick){
    const x = PAD+LABEL+(h/vh)*totalPx;
    ctx.fillStyle='#8aaa7a'; ctx.fillText(kp_hhmm(h*60),x+2,y-4);
    ctx.fillStyle='rgba(255,255,255,.06)'; ctx.fillRect(x,y-4,1,H);
  }
  const {s:olSet} = kp_buildOverlapSet();
  visSorten.forEach((sorte) => {
    const si = kp_sorten.indexOf(sorte);
    const timings = kp_getTimings(sorte);
    ctx.fillStyle = sorte.color;
    ctx.beginPath(); ctx.arc(PAD+7,y+ROW/2,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#e8f0e0'; ctx.font = 'bold 11px Arial';
    ctx.fillText(sorte.name, PAD+16, y+ROW/2+4);
    timings.forEach((t,ai) => {
      const sc = sorte.schritte[ai];
      const lx = PAD+LABEL+(t.startMin/(vh*60))*totalPx;
      const wx = Math.max(((t.endMin-t.startMin)/(vh*60))*totalPx, 4);
      ctx.fillStyle = sorte.color;
      ctx.beginPath(); ctx.roundRect(lx, y+12, wx, 28, 4); ctx.fill();
      if(olSet.has(si+'-'+ai)){ ctx.strokeStyle='#e05050';ctx.lineWidth=2;ctx.stroke();ctx.lineWidth=1; }
      ctx.fillStyle='rgba(255,255,255,.9)'; ctx.font='bold 9px Arial';
      ctx.save(); ctx.beginPath(); ctx.rect(lx+2,y+12,wx,28); ctx.clip();
      ctx.fillText(sc.name, lx+4, y+30); ctx.restore();
    });
    ctx.fillStyle='rgba(255,255,255,.08)'; ctx.fillRect(PAD,y+ROW,W-PAD*2,1);
    y += ROW;
  });
  const a = document.createElement('a');
  a.download = 'kaese_'+new Date().toISOString().slice(0,10)+'.png';
  a.href = canvas.toDataURL('image/png'); a.click();
};

// ── Init ──
window.kaeseInit = async function() {
  const loaded = await kp_load();
  if(!loaded) kp_sorten = kp_defaultSorten();
  kp_render();
  if(loaded) showSaveToast&&showSaveToast('Käse-Daten geladen');
};


// Load kaese data when navigating to kaese
window.setBehBehandler = function(typ, btn) {
  document.getElementById('b-behandler').value = typ;
  const btnP = document.getElementById('b-btn-personal');
  const btnT = document.getElementById('b-btn-tierarzt');
  const taBlock = document.getElementById('b-tazettel-block');
  const fotoBlock = document.getElementById('b-foto-block');
  if(btnP) { btnP.style.background = typ==='personal'?'var(--green)':'transparent'; btnP.style.color=typ==='personal'?'#fff':'var(--text3)'; btnP.style.border=typ==='personal'?'2px solid var(--green)':'1px solid var(--border)'; }
  if(btnT) { btnT.style.background = typ==='tierarzt'?'#3a8fd4':'transparent'; btnT.style.color=typ==='tierarzt'?'#fff':'var(--text3)'; btnT.style.border=typ==='tierarzt'?'2px solid #3a8fd4':'1px solid var(--border)'; }
  if(taBlock) taBlock.style.display = typ==='tierarzt' ? '' : 'none';
};

window.tazettelFotoPreview = function(input) {
  const file = input.files[0];
  if(!file) return;
  komprimiereBild(file, function(data) {
    const preview = document.getElementById('b-tazettel-preview');
    const img = document.getElementById('b-tazettel-img');
    const d = document.getElementById('b-tazettel-data');
    if(preview && img && d) { img.src = data; preview.style.display = ''; d.value = data; }
  });
};

window.filterBehandlung = function(typ, btn) {
  document.querySelectorAll('#beh-filter-alle,#beh-filter-personal,#beh-filter-tierarzt').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  document.querySelectorAll('.list-card[data-behandler]').forEach(card => {
    if(typ==='alle') card.style.display='';
    else card.style.display = card.dataset.behandler===typ ? '' : 'none';
  });
};

window.bsmFotoPreview = function(input) {
  const file = input.files[0];
  if(!file) return;
  komprimiereBild(file, function(data) {
    const preview = document.getElementById('bsm-foto-preview');
    const img = document.getElementById('bsm-foto-img');
    const d = document.getElementById('bsm-foto-data');
    if(img) img.src = data;
    if(preview) preview.style.display = 'block';
    if(d) d.value = data;
  });
};

window.setAlmStatus = async function(id, s) {
  if(!id) return;
  await update(ref(db, 'kuehe/' + id), {almStatus: s});
  render();
};
window.druckeBestandsbuch=function(){
  const alm=saisonInfo?.alm||'Alm';const jahr=saisonInfo?.jahr||new Date().getFullYear();
  const rows=Object.values(behandlungen).filter(b=>b.medikament).sort((a,b)=>a.datum-b.datum).map(b=>{
    const k=kuehe[b.kuhId];
    return '<tr>' +
      '<td>' + new Date(b.datum).toLocaleDateString('de-AT') + '</td>' +
      '<td>#' + (k?.nr||'?') + ' ' + (k?.name||'') + '</td>' +
      '<td>' + (k?.ohrmarke||'–') + '</td>' +
      '<td>' + (b.diagnose||'–') + '</td>' +
      '<td>' + (b.medikament||'–') + '</td>' +
      '<td>' + (b.dosis||'–') + '</td>' +
      '<td>' + (b.abgabeDatum?new Date(b.abgabeDatum).toLocaleDateString('de-AT'):'–') + '</td>' +
      '<td>' + (b.wzMilchTage||'–') + '</td>' +
      '<td>' + (b.wzMilchEnde?new Date(b.wzMilchEnde).toLocaleDateString('de-AT'):'–') + '</td>' +
      '<td>' + (b.wzFleischTage||'–') + '</td>' +
      '<td>' + (b.wzFleischEnde?new Date(b.wzFleischEnde).toLocaleDateString('de-AT'):'–') + '</td>' +
      '<td>' + (b.tierarzt||'–') + '</td>' +
      '</tr>';
  }).join('');
  const head = '<tr><th>Datum</th><th>Tier</th><th>Ohrmarke</th><th>Diagnose</th><th>Medikament</th><th>Dosis</th><th>Abgabe</th><th>WZ Milch (T)</th><th>WZ Ende Milch</th><th>WZ Fleisch (T)</th><th>WZ Ende Fleisch</th><th>Tierarzt</th></tr>';
  const css = [
    'body{font-family:Arial,sans-serif;font-size:9px;margin:0}',
    'h2{font-size:13px;margin:8mm 8mm 3px}',
    'p{font-size:8px;color:#555;margin:0 8mm 6mm}',
    '.wrap{padding:0 8mm 8mm}',
    'table{width:100%;border-collapse:collapse;font-size:7.5px}',
    'thead{display:table-header-group}',   /* ← Kopfzeile auf jeder Seite */
    'tfoot{display:table-footer-group}',
    'th{background:#1a3a0a;color:#fff;padding:4px 3px;text-align:left;border:1px solid #666;font-size:7px;white-space:nowrap}',
    'td{padding:3px 3px;border:1px solid #ccc;vertical-align:top;word-break:break-word}',
    'tr:nth-child(even) td{background:#f5f5f5}',
    'tr{page-break-inside:avoid}',          /* ← keine Zeile über Seitenbruch */
    '@media print{',
    '  @page{size:A4 landscape;margin:8mm}',
    '  body{margin:0}',
    '  h2,p{margin-left:0;margin-right:0}',
    '  thead{display:table-header-group}',  /* nochmals explizit für print */
    '  tr{page-break-inside:avoid}',
    '}'
  ].join('');
  const html_str = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bestandsbuch ' + alm + ' ' + jahr + '</title><style>' + css + '</style></head><body>' +
    '<h2>Bestandsbuch ' + alm + ' ' + jahr + '</h2>' +
    '<p>Gemäß § 12 TAKG &nbsp;·&nbsp; ' + (Object.values(behandlungen).filter(b=>b.medikament).length) + ' Einträge &nbsp;·&nbsp; Erstellt: ' + new Date().toLocaleDateString('de-AT') + ' &nbsp;·&nbsp; Engineering by LN Machinery</p>' +
    '<div class="wrap">' +
    '<table>' +
      '<thead>' + head + '</thead>' +
      '<tbody>' + rows + '</tbody>' +
      '<tfoot><tr><td colspan="12" style="font-size:7px;color:#888;border-top:2px solid #333;padding-top:4px">Bestandsbuch ' + alm + ' · Saison ' + jahr + ' · § 12 TAKG</td></tr></tfoot>' +
    '</table>' +
    '</div>' +
    '<scr'+'ipt>window.onload=function(){window.print();}</' + 'script></body></html>';
  const w=window.open('','_blank');
  w.document.write(html_str);
  w.document.close();
};

// ══════════════════════════════════════════════════════════════════════════════
//  EINSTELLUNGEN
// ══════════════════════════════════════════════════════════════════════════════

window.saveAbtrieb=async function(){
  const datum=document.getElementById('ab-datum')?.value;
  const abtriebtTs=datum?new Date(datum).getTime():Date.now();
  await update(ref(db,'saison'),{abtriebtDatum:abtriebtTs,abtriebtNotiz:document.getElementById('ab-notiz')?.value.trim(),aktiv:false});
  const u={};
  Object.keys(kuehe).filter(id=>kuehe[id].almStatus==='oben').forEach(id=>{u[`kuehe/${id}/almStatus`]='unten';});
  if(Object.keys(u).length)await update(ref(db),u);
  const aktJahr=saisonInfo?.jahr||new Date().getFullYear();
  const milchGesamt=Object.values(milchEintraege).reduce((s,m)=>s+(m.gesamt||0),0);
  const alpungTage=saisonInfo?.auftriebDatum?Math.floor((abtriebtTs-saisonInfo.auftriebDatum)/86400000)+1:0;
  const tagesMilch={};
  Object.values(milchEintraege).forEach(m=>{const tag=m.datum?new Date(m.datum).toISOString().slice(0,10):null;if(tag)tagesMilch[tag]=(tagesMilch[tag]||0)+(m.gesamt||0);});
  const tagWerte=Object.values(tagesMilch);
  await set(ref(db,'saisonArchiv/'+aktJahr),{
    jahr:aktJahr,milchGesamt:Math.round(milchGesamt),
    schnittMilch:tagWerte.length?Math.round(milchGesamt/tagWerte.length):0,
    alpungTage,kueheAnzahl:Object.keys(kuehe).length,
    behandlungenAnzahl:Object.keys(behandlungen).length,
    besamungenAnzahl:Object.keys(besamungen).length,
    auftriebDatum:saisonInfo?.auftriebDatum||null,
    abtriebtDatum:abtriebtTs,
    notiz:document.getElementById('ab-notiz')?.value.trim()||'',
    archiviertAm:Date.now()
  });
  closeForm('abtrieb-overlay');
  showSaveToast&&showSaveToast('Saison '+aktJahr+' beendet & archiviert');
};

// ══════════════════════════════════════════════════════════════════════════════
//  MILCH
// ══════════════════════════════════════════════════════════════════════════════

window.showAbtriebbForm=function(){document.getElementById('abtrieb-overlay').style.display='flex';};

window.startSaison=async function(){const alm=document.getElementById('s-alm')?.value.trim();const datum=document.getElementById('s-datum')?.value;await set(ref(db,'saison'),{aktiv:true,alm,auftriebDatum:datum?new Date(datum).getTime():Date.now(),jahr:new Date().getFullYear()});};

window.showBauerForm=function(){document.getElementById('bauer-overlay').style.display='flex';};

window.deleteBauer=async id=>{if(confirm('Bauer löschen?'))await remove(ref(db,'bauern/'+id));};

// ══════════════════════════════════════════════════════════════════════════════
//  HERDE
// ══════════════════════════════════════════════════════════════════════════════

window.showWeideForm=function(){document.getElementById('weide-overlay').style.display='flex';};

window.saveWeide=async function(){const name=document.getElementById('w-name')?.value.trim();if(!name)return;await push(ref(db,'weiden'),{name,ha:parseFloat(document.getElementById('w-ha')?.value)||null,notiz:document.getElementById('w-notiz')?.value.trim()});closeForm('weide-overlay');};

window.deleteWeide=async id=>{if(confirm('Weide löschen?'))await remove(ref(db,'weiden/'+id));};

window.showWeideTagForm=function(){const ov=document.getElementById('weidetag-overlay');if(!ov){navigate('weide');setTimeout(()=>showWeideTagForm(),150);return;}ov.style.display='flex';};

window.saveWeideTag=async function(){
  const datum=document.getElementById('wt-datum')?.value;const wv=document.getElementById('wt-weide')?.value;
  await push(ref(db,'weideTage'),{datum,weideId:wv!=='__text__'?wv:'',weideText:wv==='__text__'?(document.getElementById('wt-freitext')?.value.trim()||''):'',kuhIds:[...document.querySelectorAll('.kuh-cb:checked')].map(c=>c.value),notiz:document.getElementById('wt-notiz')?.value.trim(),createdAt:Date.now()});
  closeForm('weidetag-overlay');
};

window.deleteWeideTag=async id=>{if(confirm('Eintrag löschen?'))await remove(ref(db,'weideTage/'+id));};

// ══════════════════════════════════════════════════════════════════════════════
//  BESTANDSBUCH
// ══════════════════════════════════════════════════════════════════════════════

window.alleKueheWeide=an=>document.querySelectorAll('.kuh-cb').forEach(cb=>cb.checked=an);

window.exportMilchMolkerei=function(){
  const kuhIds=Object.keys(kuehe);
  const sortedKuehe=kuhIds.sort((a,b)=>(parseInt(kuehe[a]?.nr)||0)-(parseInt(kuehe[b]?.nr)||0));
  const kuhHeader=sortedKuehe.map(id=>'#'+kuehe[id]?.nr+' '+(kuehe[id]?.name||'')).join(';');
  let csv='Datum;Zeit;An Molkerei;'+kuhHeader+';Gesamt;Notiz\n';
  Object.values(milchEintraege).sort((a,b)=>a.datum-b.datum).forEach(e=>{
    const datum=new Date(e.datum).toLocaleDateString('de-AT');
    const zeit=e.zeit==='abend'?'Abends':'Morgens';
    const kuhWerte=sortedKuehe.map(id=>e.prokuh&&e.prokuh[id]?e.prokuh[id]:'').join(';');
    csv+=[datum,zeit,e.molkerei?'Ja':'Nein',kuhWerte,e.gesamt||'',e.notiz||''].join(';')+'\n';
  });
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
  a.download='Milch_ProKuh_'+isoDate(new Date())+'.csv';
  a.click();
};

// ══════════════════════════════════════════════════════════════════════════════
//  WEIDEGANG
// ══════════════════════════════════════════════════════════════════════════════


window.deleteFoto = async function(type, id) {
  if(!confirm('Foto löschen?')) return;
  if(type === 'behandlung') {
    await update(ref(db, 'behandlungen/' + id), {fotoData: null});
    showSaveToast && showSaveToast('Foto gelöscht');
  } else if(type === 'tazettel') {
    await update(ref(db, 'behandlungen/' + id), {tazettelData: null});
    showSaveToast && showSaveToast('Tierarztzettel gelöscht');
  } else if(type === 'besamung') {
    await update(ref(db, 'besamungen/' + id), {scheinFoto: null});
    showSaveToast && showSaveToast('Besamungsschein gelöscht');
  }
  render();
};

window.editFromManager = function(si,ai){ kp_editSchritt(si,ai); };
window.moveStep = function(si,ai,dir){ 
  const steps=kp_sorten[si]?.schritte; if(!steps) return;
  const nb=ai+dir; if(nb<0||nb>=steps.length) return;
  [steps[ai],steps[nb]]=[steps[nb],steps[ai]];
  kp_render(); kp_debounceSave();
};
window.removeStep = function(si,ai){
  kp_sorten[si]?.schritte?.splice(ai,1);
  kp_render(); kp_debounceSave();
};

// ── Single persistent nav drop handler ──
(function() {
  var PROTECTED = ['dashboard'];
  document.addEventListener('drop', function(e) {
    var target = e.target;
    // Check if dropped on Mehr button or its children
    var mehrBtn = target.closest ? target.closest('[data-view="mehr"]') : null;
    if(!mehrBtn) mehrBtn = (target.dataset && target.dataset.view==='mehr') ? target : null;
    if(!mehrBtn) return;
    
    e.preventDefault();
    var id = e.dataTransfer.getData('text/plain');
    if(!id || id.startsWith('mehr:')) return;
    if(!(_mainNav||[]).includes(id)) return;
    if(_mainNav.length <= 2) return;
    
    if(PROTECTED.includes(id)) {
      window.showSaveToast && showSaveToast(id.charAt(0).toUpperCase()+id.slice(1)+' ist fixiert');
      return;
    }
    _mainNav = _mainNav.filter(function(m){ return m!==id; });
    localStorage.setItem('mainNav', JSON.stringify(_mainNav));
    renderNav(); renderMehrGrid();
  }, true); // capture phase - fires before any element handler
})();

function updateUserDisplay() {
  const role = window._currentRole || 'hirte';
  const roleLabels = {admin:'Admin',hirte:'Hirte',molkerei:'Molkerei',milchmesser:'Milchmesser'};
  const dot = document.getElementById('status-dot');
  if(dot && dot.parentElement) {
    // Add role badge next to status dot
    let badge = document.getElementById('role-badge');
    if(!badge) {
      badge = document.createElement('span');
      badge.id = 'role-badge';
      badge.style.cssText = 'font-size:.62rem;padding:.1rem .4rem;border-radius:8px;font-weight:bold;margin-right:.3rem';
      dot.parentElement.insertBefore(badge, dot);
    }
    badge.textContent = roleLabels[role] || role;
    badge.className = 'role-' + role;
  }
}

window.doLogin = async function() {
  // Ensure Firebase is initialized
  if(!window.db || !firebase.apps.length) {
    try {
      if(!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
      db = firebase.database();
      db_instance = db;
    } catch(e) { console.warn('Firebase re-init:', e); }
  }
  const email = document.getElementById('login-email')?.value.trim();
  const pw = document.getElementById('login-pw')?.value;
  if(!email || !pw) { showLoginError('Bitte E-Mail und Passwort eingeben.'); return; }
  
  const btn = document.querySelector('#login-form .btn-primary');
  if(btn) { btn.textContent = '⏳ Anmelden…'; btn.disabled = true; }
  
  try {
    await firebase.auth().signInWithEmailAndPassword(email, pw);
    // onAuthStateChanged handles the rest
  } catch(e) {
    const msgs = {
      'auth/user-not-found': 'E-Mail nicht gefunden.',
      'auth/wrong-password': 'Falsches Passwort.',
      'auth/invalid-email': 'Ungültige E-Mail-Adresse.',
      'auth/too-many-requests': 'Zu viele Versuche. Bitte warte kurz.',
      'auth/invalid-credential': 'E-Mail oder Passwort falsch.',
    };
    showLoginError(msgs[e.code] || 'Anmeldung fehlgeschlagen: ' + e.message);
  } finally {
    if(btn) { btn.textContent = 'Anmelden'; btn.disabled = false; }
  }
};

window.doLogout = async function() {
  if(!confirm('Abmelden?')) return;
  await firebase.auth().signOut();
  window._currentUser = null;
  window._currentRole = null;
  window._appInitialized = false;
};

// Register for early fallback
window._doLoginMain = window.doLogin;

window.showPwReset = async function() {
  const email = document.getElementById('login-email')?.value.trim() || 
    prompt('E-Mail-Adresse für Passwort-Reset:');
  if(!email) return;
  try {
    await firebase.auth().sendPasswordResetEmail(email);
    alert('✓ Reset-E-Mail gesendet an: ' + email);
  } catch(e) {
    showLoginError('Fehler: ' + e.message);
  }
};

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if(el) { el.textContent = msg; el.style.display = ''; }
}

// ── Permission check ──
window.hasPermission = function(perm) {
  const role = window._currentRole || 'hirte';
  return (ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.hirte)[perm] === true;
};

// ── Filter modules by role ──
window._origAlleModule = null;
function applyRoleToModules() {
  if(!window.ALLE_MODULE || !window.ALLE_MODULE.length) return;
  if(!window._origAlleModule) window._origAlleModule = window.ALLE_MODULE.slice();
  const role = window._currentRole || 'hirte';
  const user = window._currentUser || {};
  if(user.erlaubteModule && user.erlaubteModule.length > 0) {
    const allowed = new Set(user.erlaubteModule);
    if(role === 'admin') allowed.add('benutzer');
    window.ALLE_MODULE = window._origAlleModule.filter(m => allowed.has(m.id) || m.id === '__drucken__');
    const nav = (window._mainNav||['dashboard','herde','saison','milch']).filter(id => allowed.has(id));
    if(nav.length < 2) {
      window._mainNav = ['dashboard', ...Array.from(allowed).filter(id=>id!=='dashboard').slice(0,3)];
      localStorage.setItem('mainNav', JSON.stringify(window._mainNav));
    }
  } else {
    const hidden = (ROLE_HIDDEN_MODULES && ROLE_HIDDEN_MODULES[role]) || [];
    window.ALLE_MODULE = window._origAlleModule.filter(m => !hidden.includes(m.id));
    if(role === 'milchmesser') {
      window._mainNav = ['dashboard','milch'];
      localStorage.setItem('mainNav', JSON.stringify(window._mainNav));
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  ADMIN: BENUTZERVERWALTUNG
// ══════════════════════════════════════════════════════════════
window.renderBenutzer = function() {
  if(!hasPermission('benutzer')) return '<div class="empty-state">Kein Zugriff</div>';

  // Modul-Liste dynamisch aus ALLE_MODULE – damit neue Module (Stallplan, Tränke, …)
  // automatisch in der Berechtigungs-Auswahl auftauchen.
  // Dashboard wird automatisch ergänzt (immer erlaubt), __drucken__ und mehr ausgefiltert.
  const _src = (window._origAlleModule && window._origAlleModule.length)
    ? window._origAlleModule
    : (window.ALLE_MODULE || []);
  const alleModule = [{id:'dashboard',label:'Dashboard'}].concat(
    _src
      .filter(m => m.id && m.id !== '__drucken__' && m.id !== 'mehr' && m.id !== 'dashboard')
      .map(m => ({ id: m.id, label: m.label }))
  );
  
  const modulCheckboxes = alleModule.map(m =>
    '<label style="display:flex;align-items:center;gap:.4rem;font-size:.82rem;cursor:pointer;padding:.25rem 0">' +
    '<input type="checkbox" class="nb-modul-cb" value="' + m.id + '" checked style="accent-color:var(--gold)" />' +
    m.label + '</label>'
  ).join('');
  
  return '<div class="page-header"><h2>👤 Benutzer</h2></div>' +
    '<div id="benutzer-liste"><div style="text-align:center;color:var(--text3)">⏳ Lade…</div></div>' +
    '<div class="section-title" style="margin-top:.8rem">Neuen Benutzer anlegen</div>' +
    '<div class="card-section">' +
    '<input id="nb-email" class="inp" type="email" placeholder="E-Mail *" style="margin-bottom:.4rem" />' +
    '<input id="nb-pw" class="inp" type="password" placeholder="Passwort (min. 6 Zeichen) *" style="margin-bottom:.4rem" />' +
    '<input id="nb-name" class="inp" placeholder="Name / Anzeigename" style="margin-bottom:.6rem" />' +
    '<div class="section-label" style="margin-bottom:.4rem">Rolle (Voreinstellung)</div>' +
    '<select id="nb-rolle" class="inp" style="margin-bottom:.8rem" onchange="applyRolePreset(this.value)">' +
    '<option value="hirte">🌿 Hirte</option>' +
    '<option value="milchmesser">🥛 Milchmesser</option>' +
    '<option value="molkerei">🧀 Molkerei</option>' +
    '<option value="admin">⚙ Admin</option>' +
    '</select>' +
    '<div class="section-label" style="margin-bottom:.4rem">Sichtbare Module</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.3rem;margin-bottom:.8rem" id="nb-module-grid">' +
    modulCheckboxes + '</div>' +
    '<button class="btn-primary" style="width:100%" onclick="createBenutzer()">+ Benutzer anlegen</button>' +
    '</div>';
};


window.applyRolePreset = function(rolle) {
  const rolePresets = {
    admin:       ['dashboard','herde','saison','milch','behandlung','besamung','zaehlung','weide','kraftfutter','journal','bauern_menu','gruppen','kontakte','alpung','statistik','kalender','kontrolle','wetter','backup','suche','chat','einstellungen'],
    hirte:       ['dashboard','herde','saison','milch','behandlung','besamung','zaehlung','weide','kraftfutter','journal','gruppen','kontakte','alpung','wetter','suche','chat'],
    milchmesser: ['dashboard','milch'],
    molkerei:    ['dashboard','milch','statistik'],
  };
  const preset = rolePresets[rolle] || rolePresets.hirte;
  document.querySelectorAll('.nb-modul-cb').forEach(cb => {
    cb.checked = preset.includes(cb.value);
  });
};


window.loadBenutzerListe = async function() {
  const el = document.getElementById('benutzer-liste');
  if(!el) return;
  try {
    const snap = await firebase.database().ref('benutzer').get();
    const data = snap.val() || {};
    const roleLabels = {admin:'Admin',hirte:'Hirte',molkerei:'Molkerei',milchmesser:'Milchmesser'};
    const roleColors = {admin:'var(--gold)',hirte:'var(--green)',molkerei:'#7acbff',milchmesser:'#c87ee8'};
    
    if(Object.keys(data).length === 0) {
      el.innerHTML = '<div class="empty-state">Noch keine Benutzer angelegt</div>';
      return;
    }
    
    el.innerHTML = Object.entries(data).map(([uid, u]) => `
      <div class="list-card">
        <div class="list-card-left">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:1.1rem">👤</div>
          <div>
            <div class="list-card-title">${u.name||u.email||'–'}</div>
            <div class="list-card-sub">${u.email||''}</div>
            ${u.erlaubteModule && u.erlaubteModule.length > 0 ? `<div style="font-size:.65rem;color:var(--text3)">${u.erlaubteModule.length} Module</div>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:.4rem">
          <span class="role-badge role-${u.rolle||'hirte'}">${roleLabels[u.rolle]||u.rolle}</span>
          ${uid !== firebase.auth().currentUser?.uid ? `
            <select onchange="changeRolle('${uid}',this.value)" style="font-size:.7rem;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:.15rem .3rem;cursor:pointer">
              <option value="hirte" ${(u.rolle||'hirte')==='hirte'?'selected':''}>Hirte</option>
              <option value="milchmesser" ${u.rolle==='milchmesser'?'selected':''}>Milchmesser</option>
              <option value="molkerei" ${u.rolle==='molkerei'?'selected':''}>Molkerei</option>
              <option value="admin" ${u.rolle==='admin'?'selected':''}>Admin</option>
            </select>
            <button class="btn-xs-danger" onclick="deleteBenutzer('${uid}','${u.email||''}')">✕</button>` : 
            '<span style="font-size:.7rem;color:var(--text3)">(du)</span>'}
        </div>
      </div>`).join('');
  } catch(e) {
    el.innerHTML = '<div class="empty-state">Fehler beim Laden</div>';
  }
};

window.createBenutzer = async function() {
  const email = document.getElementById('nb-email')?.value.trim();
  const pw = document.getElementById('nb-pw')?.value;
  const name = document.getElementById('nb-name')?.value.trim();
  const rolle = document.getElementById('nb-rolle')?.value;
  
  if(!email || !pw) { alert('E-Mail und Passwort sind Pflicht.'); return; }
  if(pw.length < 6) { alert('Passwort muss mindestens 6 Zeichen haben.'); return; }
  
  // Create user via Firebase Admin API is not available client-side
  // Use a workaround: create secondary auth instance
  try {
    // Save current user
    const currentUser = firebase.auth().currentUser;
    
    // Create new user (this signs out current user in default app!)
    // Better: use a secondary app instance
    let secondApp;
    try {
      secondApp = firebase.app('secondary');
    } catch(e) {
      secondApp = firebase.initializeApp(window.FIREBASE_CONFIG, 'secondary');
    }
    const secondAuth = firebase.auth(secondApp);
    
    const cred = await secondAuth.createUserWithEmailAndPassword(email, pw);
    const newUid = cred.user.uid;
    
    // Sign out from secondary app
    await secondAuth.signOut();
    
    // Collect selected modules
    const moduleCbs = document.querySelectorAll('.nb-modul-cb');
    const erlaubteModule = moduleCbs.length > 0 
      ? Array.from(moduleCbs).filter(cb=>cb.checked).map(cb=>cb.value)
      : null;
    
    // Save role in DB
    await firebase.database().ref('benutzer/' + newUid).set({
      email, name: name||email, rolle: rolle||'hirte',
      erlaubteModule: erlaubteModule || [],
      aktiv: true, createdAt: Date.now(),
      createdBy: currentUser?.uid||'admin'
    });
    
    // Clear form
    ['nb-email','nb-pw','nb-name'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    
    showSaveToast&&showSaveToast('Benutzer angelegt');
    loadBenutzerListe();
  } catch(e) {
    const msgs = {
      'auth/email-already-in-use': 'Diese E-Mail ist bereits registriert.',
      'auth/invalid-email': 'Ungültige E-Mail.',
      'auth/weak-password': 'Passwort zu schwach (min. 6 Zeichen).',
    };
    alert(msgs[e.code] || 'Fehler: ' + e.message);
  }
};

window.deleteBenutzer = async function(uid, email) {
  if(!confirm('Benutzer ' + email + ' löschen?')) return;
  await firebase.database().ref('benutzer/' + uid).remove();
  // Note: Firebase Auth user remains - must be deleted via console
  // Add note
  alert('✓ Benutzer aus der App entfernt.\nHinweis: Für vollständige Löschung auch in Firebase Console → Authentication löschen.');
  loadBenutzerListe();
};
  // initApp is now called by initAuth after login
  window.addEventListener('load', function() {
    setTimeout(function() { if(firebase.auth) initAuth(); else initApp(); }, 500);
  });

  // ALLE_MODULE wird in index.html (Inline-Script vor app-core.js) gesetzt –
  // dort ist die kanonische, vollständige Liste mit allen Modulen.
  // Hier KEINE zweite Zuweisung, sonst wird die Liste überschrieben.
  if(!window.ALLE_MODULE || !window.ALLE_MODULE.length) {
    console.warn('ALLE_MODULE nicht aus index.html geladen – Fallback aktiv');
    window.ALLE_MODULE = [
      {id:'herde',icon:'🐄',label:'Herde'},{id:'milch',icon:'🥛',label:'Milch'},
      {id:'saison',icon:'▲',label:'Saison'},{id:'__drucken__',icon:'🖨',label:'Drucken'},
    ];
  }

  // Standard-Hauptnav (anpassbar)
  var DEFAULT_MAIN_NAV = ['dashboard','herde','saison','milch'];
  var _mainNav = JSON.parse(localStorage.getItem('mainNav')||'null') || DEFAULT_MAIN_NAV.slice();
  var _mehrAnpassen = false;

  // ── Funktionen die von Nav-Buttons aufgerufen werden ──
  // Müssen VOR renderNav definiert sein
  window._longPressTimer = null;
  window.startNavLongPress = function(id, btn, e) {
    window._longPressTimer = setTimeout(function() {
      if(navigator.vibrate) navigator.vibrate([30,20,30]);
      var hint = document.getElementById('nav-drag-hint');
      if(!hint) {
        hint = document.createElement('div');
        hint.id = 'nav-drag-hint';
        hint.style.cssText = 'position:fixed;bottom:calc(var(--nav-h) + var(--safe-b) + 10px);left:50%;transform:translateX(-50%);background:rgba(212,168,75,.95);color:#0a0800;border-radius:20px;padding:.4rem 1.2rem;font-size:.78rem;font-weight:bold;z-index:150;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.4)';
        hint.textContent = '↔ Ziehen zum Verschieben';
        document.body.appendChild(hint);
      }
      hint.style.display = '';
      document.querySelectorAll('.nav-item[draggable]').forEach(function(b){b.style.outline='1px dashed var(--gold2)';b.style.borderRadius='8px';});
      setTimeout(function(){
        if(hint)hint.style.display='none';
        document.querySelectorAll('.nav-item').forEach(function(b){b.style.outline='';b.style.borderRadius='';});
      }, 2500);
    }, 600);
  };
  window.cancelNavLongPress = function() { clearTimeout(window._longPressTimer); };
  window.toggleMehrAnpassen = function() {
    window._mehrAnpassen = !window._mehrAnpassen;
    var el = document.getElementById('mehr-anpassen');
    if(el) el.style.display = window._mehrAnpassen ? '' : 'none';
    if(typeof window.renderMehrGrid==='function') window.renderMehrGrid();
  };
  window.toggleMainNav = function(id) {
    var nav = window._mainNav || _mainNav || [];
    if(nav.includes(id)) {
      if(nav.length<=2){if(window.showSaveToast)showSaveToast('Mindestens 2 Einträge');return;}
      if(id==='dashboard'){if(window.showSaveToast)showSaveToast('Start ist fixiert');return;}
      nav = nav.filter(function(m){return m!==id;});
    } else {
      if(nav.length>=4) nav=nav.slice(0,-1);
      nav.push(id);
    }
    window._mainNav = nav;
    localStorage.setItem('mainNav', JSON.stringify(nav));
    renderNav();
    if(typeof window.renderMehrGrid==='function') window.renderMehrGrid();
  };

  function renderNav() {
    try {
    var nav = document.getElementById('bottom-nav');
    if(!nav) return;
    var items = (window._mainNav||_mainNav||[]);
    // Only rebuild the 4 main nav items, keep Mehr button static
    var mehrBtn = nav.querySelector('[data-view="mehr"]');
    nav.innerHTML = items.map(function(id) {
      var navMap = {dashboard:{icon:'⌂',label:'Start'},herde:{icon:'🐄',label:'Herde'},saison:{icon:'⛰',label:'Saison'},milch:{icon:'🥛',label:'Milch'},mehr:{icon:'⋯',label:'Mehr'}};
      var mod = (window.ALLE_MODULE||[]).find(function(m){return m.id===id;});
      var info = navMap[id] || (mod ? {icon:mod.icon,label:mod.label} : {icon:'•',label:id});
      var isActive = currentView===id;
      var isEditSelected = window._mehrEditMode && window._mehrSelected===id;
      var isDraggable = id!=='dashboard' && id!=='mehr';
      var onclick = id==='mehr' ? "window.toggleMehrMenu&&window.toggleMehrMenu(event)" : "window.navigate&&window.navigate(\'"+id+"\')";
      var navStyle = isEditSelected ? 'outline:2px solid var(--gold);border-radius:8px;' : '';
      return '<button class="nav-item '+(isActive?'active':'')+'" data-view="'+id+'" data-navid="'+(isDraggable?id:'')+'" style="'+navStyle+'" '+
        (isDraggable?'draggable="true"':'')+
        ' onclick="'+onclick+'"'+
        (isDraggable?' onpointerdown="window.startNavLongPress&&window.startNavLongPress(\''+id+'\',this,event)" onpointerup="window.cancelNavLongPress&&window.cancelNavLongPress()" onpointerleave="window.cancelNavLongPress&&window.cancelNavLongPress()"':'')+'>'+
        '<span class="nav-icon">'+info.icon+'</span>'+info.label+
      '</button>';
    }).join('');
    // Re-append the static Mehr button
    if(mehrBtn) {
      nav.appendChild(mehrBtn);
    } else {
      var mb = document.createElement('button');
      mb.className = 'nav-item';
      mb.setAttribute('data-view','mehr');
      mb.id = 'nav-mehr';
      mb.innerHTML = '<span class="nav-icon">⋯</span>Mehr';
      mb.onclick = function() { window.toggleMehrMenu && window.toggleMehrMenu(); };
      nav.appendChild(mb);
    }
    setupNavDrag(nav);
    if(typeof updateChatBadge==='function') updateChatBadge();
    // Setup nav-mehr drag after nav is rendered
    setTimeout(setupNavMehrDrag, 50);
  } catch(e) { console.warn('renderNav:',e); }
  }

  function setupNavDrag(nav) {
    if(!nav) return;
    var dragSrc = null;
    nav.querySelectorAll('[draggable=true]').forEach(function(btn) {
      if(btn._dragRegistered) return;
      btn._dragRegistered = true;
      btn.addEventListener('dragstart', function(e) {
        dragSrc = this.dataset.navid;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragSrc||'');
        this.style.opacity = '.4';
        var hint=document.getElementById('nav-drag-hint');
        if(hint)hint.style.display='none';
      });
      btn.addEventListener('dragend', function() { this.style.opacity=''; dragSrc=null; });
      btn.addEventListener('dragover', function(e) { e.preventDefault(); });
      btn.addEventListener('drop', function(e) {
        e.preventDefault();
        var targetId = this.dataset.navid;
        if(dragSrc && targetId && dragSrc!==targetId) {
          var a=(_mainNav||[]).indexOf(dragSrc), b2=(_mainNav||[]).indexOf(targetId);
          if(a>-1&&b2>-1){_mainNav.splice(a,1);_mainNav.splice(b2,0,dragSrc);localStorage.setItem('mainNav',JSON.stringify(_mainNav));renderNav();}
        }
      });

      // ── Touch drag: nav-item → Mehr-Button ──
      if(!btn._touchNavRegistered) {
        btn._touchNavRegistered = true;
        var touchNavId = btn.dataset.navid;
        var touchNavGhost = null;
        var touchNavTimer = null;
        var touchNavActive = false;

        btn.addEventListener('touchstart', function(e) {
          var self = this;
          touchNavId = this.dataset.navid;
          touchNavTimer = setTimeout(function() {
            touchNavActive = true;
            if(navigator.vibrate) navigator.vibrate([30,20,30]);
            // Create ghost
            touchNavGhost = document.createElement('div');
            touchNavGhost.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;background:var(--card);border:2px solid var(--gold);border-radius:12px;padding:.5rem .8rem;font-size:.75rem;color:var(--gold);opacity:.85;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.5)';
            touchNavGhost.textContent = self.textContent;
            document.body.appendChild(touchNavGhost);
            self.style.opacity = '.4';
            // Show hint
            var hint = document.getElementById('nav-drag-hint');
            if(!hint) {
              hint = document.createElement('div');
              hint.id = 'nav-drag-hint';
              hint.style.cssText = 'position:fixed;bottom:calc(var(--nav-h) + var(--safe-b) + 10px);left:50%;transform:translateX(-50%);background:rgba(212,168,75,.95);color:#0a0800;border-radius:20px;padding:.4rem 1.2rem;font-size:.78rem;font-weight:bold;z-index:150;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.4)';
              document.body.appendChild(hint);
            }
            hint.textContent = '⋯ Auf "Mehr" ziehen zum Verschieben';
            hint.style.display = '';
            setTimeout(function(){ if(hint) hint.style.display='none'; }, 2500);
          }, 700);
        }, {passive:true});

        btn.addEventListener('touchmove', function(e) {
          clearTimeout(touchNavTimer);
          if(!touchNavActive || !touchNavGhost) return;
          e.preventDefault();
          var t = e.touches[0];
          touchNavGhost.style.left = (t.clientX - 40) + 'px';
          touchNavGhost.style.top  = (t.clientY - 30) + 'px';
          // Highlight Mehr button if hovering over it
          var mehrBtn = document.getElementById('nav-mehr');
          if(mehrBtn) {
            var r = mehrBtn.getBoundingClientRect();
            if(t.clientX>=r.left&&t.clientX<=r.right&&t.clientY>=r.top&&t.clientY<=r.bottom) {
              mehrBtn.style.outline = '2px solid var(--gold)';
            } else {
              mehrBtn.style.outline = '';
            }
          }
        }, {passive:false});

        btn.addEventListener('touchend', function(e) {
          clearTimeout(touchNavTimer);
          var self = this;
          if(!touchNavActive || !touchNavGhost) { touchNavActive=false; return; }
          var t = e.changedTouches[0];
          touchNavGhost.remove(); touchNavGhost = null;
          self.style.opacity = '';
          var mehrBtn = document.getElementById('nav-mehr');
          if(mehrBtn) mehrBtn.style.outline = '';
          touchNavActive = false;

          // Check if released over Mehr button
          var mBtn = document.getElementById('nav-mehr');
          if(mBtn) {
            var r = mBtn.getBoundingClientRect();
            if(t.clientX>=r.left&&t.clientX<=r.right&&t.clientY>=r.top&&t.clientY<=r.bottom) {
              var id = touchNavId;
              if(id && id!=='dashboard') {
                var nav = window._mainNav || [];
                if(nav.includes(id) && nav.length > 2) {
                  nav = nav.filter(function(m){ return m!==id; });
                  window._mainNav = nav;
                  localStorage.setItem('mainNav', JSON.stringify(nav));
                  if(navigator.vibrate) navigator.vibrate([30,10,30]);
                  setTimeout(function(){ renderNav(); renderMehrGrid(); }, 50);
                }
              }
            }
          }
        }, {passive:true});

        btn.addEventListener('touchcancel', function() {
          clearTimeout(touchNavTimer);
          if(touchNavGhost){ touchNavGhost.remove(); touchNavGhost=null; }
          this.style.opacity='';
          touchNavActive=false;
          var mehrBtn=document.getElementById('nav-mehr');
          if(mehrBtn) mehrBtn.style.outline='';
        }, {passive:true});
      }
    });
    // Drop auf Mehr → handled by document-level handler below
    var mehrBtn = nav.querySelector('[data-view="mehr"]');
    if(mehrBtn) {
      mehrBtn.addEventListener('dragover',function(e){e.preventDefault();});
    }
    // Nav als Drop-Zone für Mehr-Buttons
    nav.addEventListener('dragover',function(e){e.preventDefault();});
    nav.addEventListener('drop',function(e){
      e.preventDefault();
      var data=e.dataTransfer.getData('text/plain');
      if(data&&data.startsWith('mehr:')){
        var id=data.slice(5);
        if(id&&!(_mainNav||[]).includes(id)){
          if(_mainNav.length>=4)_mainNav=_mainNav.slice(0,3);
          _mainNav.push(id);
          localStorage.setItem('mainNav',JSON.stringify(_mainNav));
          renderNav();renderMehrGrid();closeMehr();
        }
      }
    });
  }


  window.renderMehrGrid = function renderMehrGrid() {
    var grid = document.getElementById('mehr-grid');
    if(!grid) return;
    var mainNavIds = window._mainNav || ['dashboard','herde','saison','milch'];

    // Fallback: wenn ALLE_MODULE noch nicht befüllt, direkt aus der Konstante
    var allMods = (window.ALLE_MODULE && window.ALLE_MODULE.length > 0)
      ? window.ALLE_MODULE
      : [
          {id:'zaehlung',icon:'✓',label:'Zählung'},{id:'weide',icon:'🌿',label:'Weide'},
          {id:'behandlung',icon:'⚕',label:'Behandlung'},{id:'besamung',icon:'🐮',label:'Besamung'},
          {id:'bestandsbuch',icon:'📋',label:'Bestandsbuch'},{id:'einstellungen',icon:'⚙',label:'Einstellungen'},
          {id:'journal',icon:'📓',label:'Journal'},{id:'alpung',icon:'📊',label:'Alpungstage'},
          {id:'kontakte',icon:'📞',label:'Kontakte'},{id:'gruppen',icon:'🏷',label:'Gruppen'},
          {id:'kontrolle',icon:'🔍',label:'Kontrolle'},{id:'kalender',icon:'📅',label:'Kalender'},
          {id:'statistik',icon:'📊',label:'Statistik'},{id:'backup',icon:'💾',label:'Backup'},
          {id:'suche',icon:'🔎',label:'Suche'},{id:'chat',icon:'💬',label:'Chat'},
          {id:'kraftfutter',icon:'🌾',label:'Kraftfutter'},{id:'wetter',icon:'⛅',label:'Wetter'},
          {id:'kaese',icon:'🧀',label:'Käse'},{id:'bauern_menu',icon:'👥',label:'Bauern'},
          {id:'wartung',icon:'🔧',label:'Wartung'},{id:'lager',icon:'📦',label:'Lager'},
          {id:'aufgaben',icon:'✅',label:'Aufgaben'},
        ];

    var imMenu = allMods.filter(function(m){ 
      return !mainNavIds.includes(m.id) && m.id !== '__drucken__'; 
    });

    // Apply saved order
    var savedOrder = JSON.parse(localStorage.getItem('mehrOrder')||'null');
    if(savedOrder) {
      var ordered = [];
      savedOrder.forEach(function(id){
        var m = imMenu.find(function(x){ return x.id===id; });
        if(m) ordered.push(m);
      });
      imMenu.forEach(function(m){
        if(!ordered.find(function(x){ return x.id===m.id; })) ordered.push(m);
      });
      imMenu = ordered;
    }

    grid.innerHTML = imMenu.map(function(m) {
      return '<button class="mehr-btn mehr-drag-item" data-mid="'+m.id+'"><span>'+m.icon+'</span>'+m.label+'</button>';
    }).join('');


    // Click handlers (no inline onclick needed)
    Array.from(grid.querySelectorAll('.mehr-drag-item')).forEach(function(btn){
      btn.addEventListener('click', function(){
        if(window._mehrDragging) return;
        closeMehr();
        window.m_navigate(this.dataset.mid);
      });
    });

    setupMehrDrag(grid, imMenu);

    // Update alle-module-grid
    var alleGrid = document.getElementById('alle-module-grid');
    if(alleGrid) {
      alleGrid.innerHTML = (window.ALLE_MODULE||[]).filter(function(m){
        return m.id!=='dashboard'&&m.id!=='mehr';
      }).map(function(m){
        var inM=(window._mainNav||[]).includes(m.id);
        var s=inM?'border-color:var(--gold);color:var(--gold)':'';
        return '<button class="mehr-btn" style="'+s+'" data-aid="'+m.id+'"><span>'+m.icon+'</span>'+m.label+(inM?' ◆':'')+'</button>';
      }).join('');
      // Add click handlers for alle-module
      Array.from(alleGrid.querySelectorAll('[data-aid]')).forEach(function(b){
        b.addEventListener('click',function(){ window.toggleMainNav&&window.toggleMainNav(this.dataset.aid); });
      });
    }
  }

  window.m_navigate = function(id) {
    if(id==='__drucken__') { druckeHerde(); return; }
    if(typeof navigate==='function') navigate(id);
  };

  function setupMehrDrag(grid, imMenu) {
    var items = Array.from(grid.querySelectorAll('.mehr-drag-item'));
    var dragSrcIdx = null;
    var longPressTimer = null;
    window._mehrDragging = false;

    // Clone element for visual drag
    var ghost = null;
    var offsetX = 0, offsetY = 0;

    function getIdOrder() {
      return Array.from(grid.querySelectorAll('.mehr-drag-item')).map(function(b){ return b.dataset.mid; });
    }

    function saveOrder() {
      localStorage.setItem('mehrOrder', JSON.stringify(getIdOrder()));
    }

    function getItemAtPoint(x, y, excludeEl) {
      if(excludeEl) excludeEl.style.display='none';
      var el = document.elementFromPoint(x, y);
      if(excludeEl) excludeEl.style.display='';
      return el && el.closest ? el.closest('.mehr-drag-item') : null;
    }

    function startDrag(btn, clientX, clientY) {
      window._mehrDragging = true;
      dragSrcIdx = Array.from(grid.querySelectorAll('.mehr-drag-item')).indexOf(btn);
      btn.style.opacity = '0.3';
      // Prevent text selection during drag
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
      document.body.style.MozUserSelect = 'none';

      // Create ghost
      ghost = btn.cloneNode(true);
      var rect = btn.getBoundingClientRect();
      offsetX = clientX - rect.left;
      offsetY = clientY - rect.top;
      ghost.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;opacity:0.9;'+
        'width:'+rect.width+'px;transform:scale(1.1);'+
        'background:var(--bg4);border:2px solid var(--gold);border-radius:var(--radius-sm);'+
        'box-shadow:0 8px 24px rgba(0,0,0,.5);transition:none;';
      ghost.style.left = (clientX - offsetX) + 'px';
      ghost.style.top  = (clientY - offsetY) + 'px';
      document.body.appendChild(ghost);
      if(navigator.vibrate) navigator.vibrate(50);
      // Clear any text selection
      if(window.getSelection) window.getSelection().removeAllRanges();
    }

    function moveDrag(clientX, clientY) {
      if(!ghost) return;
      ghost.style.left = (clientX - offsetX) + 'px';
      ghost.style.top  = (clientY - offsetY) + 'px';

      // Highlight target
      var target = getItemAtPoint(clientX, clientY, ghost);
      Array.from(grid.querySelectorAll('.mehr-drag-item')).forEach(function(b){
        b.style.outline = (target && b===target && b!==Array.from(grid.querySelectorAll('.mehr-drag-item'))[dragSrcIdx]) ? '2px solid var(--gold)' : '';
      });
    }

    function endDrag(clientX, clientY) {
      if(!ghost) return;
      var srcBtn = Array.from(grid.querySelectorAll('.mehr-drag-item'))[dragSrcIdx];
      var target = getItemAtPoint(clientX, clientY, ghost);

      ghost.remove(); ghost = null;
      Array.from(grid.querySelectorAll('.mehr-drag-item')).forEach(function(b){
        b.style.outline=''; b.style.opacity='';
      });

      // Check if dropped onto the bottom nav bar → move to mainNav
      var bottomNav = document.getElementById('bottom-nav');
      if(bottomNav && srcBtn) {
        var navRect = bottomNav.getBoundingClientRect();
        if(clientX >= navRect.left && clientX <= navRect.right &&
           clientY >= navRect.top && clientY <= navRect.bottom) {
          var dragId = srcBtn.dataset.mid;
          if(dragId && !(_mainNav||[]).includes(dragId)) {
            var nav = window._mainNav || _mainNav || [];
            if(nav.length >= 4) nav = nav.slice(0, 3);
            nav.push(dragId);
            window._mainNav = nav;
            localStorage.setItem('mainNav', JSON.stringify(nav));
            if(navigator.vibrate) navigator.vibrate([30,10,30]);
            renderNav();
            renderMehrGrid();
            closeMehr();
          }
          dragSrcIdx = null;
          document.body.style.userSelect = '';
          document.body.style.webkitUserSelect = '';
          document.body.style.MozUserSelect = '';
          setTimeout(function(){ window._mehrDragging = false; }, 100);
          return;
        }
      }

      if(target && srcBtn && target !== srcBtn) {
        // DOM swap
        var btns = Array.from(grid.querySelectorAll('.mehr-drag-item'));
        var tgtIdx = btns.indexOf(target);
        var src = btns[dragSrcIdx];
        if(dragSrcIdx < tgtIdx) {
          grid.insertBefore(src, target.nextSibling);
        } else {
          grid.insertBefore(src, target);
        }
        saveOrder();
        if(navigator.vibrate) navigator.vibrate([30,10,30]);
      }
      dragSrcIdx = null;
      // Re-enable text selection
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      document.body.style.MozUserSelect = '';
      setTimeout(function(){ window._mehrDragging = false; }, 100);
    }

    items.forEach(function(btn) {
      // ── MOUSE ──
      btn.addEventListener('mousedown', function(e) {
        if(e.button !== 0) return;
        var self = this;
        longPressTimer = setTimeout(function(){
          startDrag(self, e.clientX, e.clientY);
        }, 700);
      });

      // ── TOUCH ──
      btn.addEventListener('touchstart', function(e) {
        var touch = e.touches[0];
        var self = this;
        longPressTimer = setTimeout(function(){
          startDrag(self, touch.clientX, touch.clientY);
        }, 700);
      }, {passive:true});
    });

    // Global move/end for both mouse and touch
    function onMove(clientX, clientY) {
      if(!ghost) return;
      moveDrag(clientX, clientY);
    }
    function onEnd(clientX, clientY) {
      clearTimeout(longPressTimer);
      if(!ghost) { window._mehrDragging=false; return; }
      endDrag(clientX, clientY);
    }
    function onCancel() {
      clearTimeout(longPressTimer);
      if(ghost){ ghost.remove(); ghost=null; }
      Array.from(grid.querySelectorAll('.mehr-drag-item')).forEach(function(b){b.style.outline='';b.style.opacity='';});
      dragSrcIdx=null; window._mehrDragging=false;
      document.body.style.userSelect='';
      document.body.style.webkitUserSelect='';
    }

    // Remove old listeners by replacing with fresh ones
    var mm = function(e){ onMove(e.clientX, e.clientY); };
    var mu = function(e){ onEnd(e.clientX, e.clientY); };
    var tm = function(e){ if(e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY); };
    var tu = function(e){ if(e.changedTouches[0]) onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY); };
    var tc = function(){ onCancel(); };

    document.addEventListener('mousemove', mm);
    document.addEventListener('mouseup', mu);
    document.addEventListener('touchmove', tm, {passive:false});
    document.addEventListener('touchend', tu);
    document.addEventListener('touchcancel', tc);

    // Store cleanup function
    grid._cleanup = function() {
      document.removeEventListener('mousemove', mm);
      document.removeEventListener('mouseup', mu);
      document.removeEventListener('touchmove', tm);
      document.removeEventListener('touchend', tu);
      document.removeEventListener('touchcancel', tc);
    };

    // Prevent scroll during drag
    grid.addEventListener('touchmove', function(e){
      if(ghost) e.preventDefault();
    }, {passive:false});
  }

  window.toggleMehrEditMode = function() {
    window._mehrEditMode = !window._mehrEditMode;
    window._mehrSelected = null;
    var hint = document.getElementById('mehr-edit-hint');
    if(hint) hint.style.display = window._mehrEditMode ? '' : 'none';
    renderMehrGrid();
  };

  window.mehrItemTap = function(id) {
    if(!window._mehrEditMode) {
      // Not in edit mode - navigate normally
      if(id==='__drucken__') { closeMehr(); druckeHerde(); return; }
      closeMehr(); if(typeof navigate==='function') navigate(id);
      return;
    }
    if(!window._mehrSelected) {
      window._mehrSelected = id;
      renderMehrGrid();
      if(navigator.vibrate) navigator.vibrate(40);
    } else if(window._mehrSelected === id) {
      window._mehrSelected = null;
      renderMehrGrid();
    } else {
      // Swap the two selected items
      var allMods = window.ALLE_MODULE || [];
      var mainNavIds = window._mainNav || [];
      var imMenu = allMods.filter(function(m){ return !mainNavIds.includes(m.id); });
      var savedOrder = JSON.parse(localStorage.getItem('mehrOrder')||'null');
      var ids = savedOrder || imMenu.map(function(m){ return m.id; });
      // Ensure all imMenu ids are present
      imMenu.forEach(function(m){ if(!ids.includes(m.id)) ids.push(m.id); });
      var a = ids.indexOf(window._mehrSelected);
      var b = ids.indexOf(id);
      if(a>-1&&b>-1){ 
        var tmp=ids[a]; ids[a]=ids[b]; ids[b]=tmp;
        localStorage.setItem('mehrOrder',JSON.stringify(ids)); 
      }
      window._mehrSelected = null;
      renderMehrGrid();
      if(navigator.vibrate) navigator.vibrate([20,10,20]);
    }
  };

  window.toggleMehrEditMode = function() {
    window._mehrEditMode = !window._mehrEditMode;
    window._mehrSelected = null;
    var hint = document.getElementById('mehr-edit-hint');
    if(hint) hint.style.display = window._mehrEditMode ? '' : 'none';
    renderMehrGrid();
  };

  window.toggleMehrMenu = function(e) {
    if(e) e.stopPropagation();
    var m = document.getElementById('mehr-menu');
    if(!m) return;
    var isOpen = m.style.display === 'block';
    m.style.display = isOpen ? 'none' : 'block';
    if(!isOpen) {
      window._mehrAnpassen = false;
      var a = document.getElementById('mehr-anpassen');
      if(a) a.style.display = 'none';
      // Direkt Grid befüllen
      var grid = document.getElementById('mehr-grid');
      if(grid) {
        var mainNav = window._mainNav || ['dashboard','herde','saison','milch'];
        var allMods = (window.ALLE_MODULE && window.ALLE_MODULE.length > 4)
          ? window.ALLE_MODULE
          : [
              {id:'zaehlung',icon:'✓',label:'Zählung'},{id:'weide',icon:'🌿',label:'Weide'},
              {id:'behandlung',icon:'⚕',label:'Behandlung'},{id:'besamung',icon:'🐮',label:'Besamung'},
              {id:'bestandsbuch',icon:'📋',label:'Bestandsbuch'},{id:'einstellungen',icon:'⚙',label:'Einstellungen'},
              {id:'journal',icon:'📓',label:'Journal'},{id:'alpung',icon:'📊',label:'Alpungstage'},
              {id:'kontakte',icon:'📞',label:'Kontakte'},{id:'gruppen',icon:'🏷',label:'Gruppen'},
              {id:'kontrolle',icon:'🔍',label:'Kontrolle'},{id:'kalender',icon:'📅',label:'Kalender'},
              {id:'statistik',icon:'📊',label:'Statistik'},{id:'backup',icon:'💾',label:'Backup'},
              {id:'suche',icon:'🔎',label:'Suche'},{id:'chat',icon:'💬',label:'Chat'},
              {id:'kraftfutter',icon:'🌾',label:'Kraftfutter'},{id:'wetter',icon:'⛅',label:'Wetter'},
              {id:'kaese',icon:'🧀',label:'Käse'},{id:'bauern_menu',icon:'👥',label:'Bauern'},
              {id:'wartung',icon:'🔧',label:'Wartung'},{id:'lager',icon:'📦',label:'Lager'},
              {id:'aufgaben',icon:'✅',label:'Aufgaben'},
            ];
        var imMenu = allMods.filter(function(mod){ return !mainNav.includes(mod.id) && mod.id !== '__drucken__'; });
        grid.innerHTML = imMenu.map(function(mod){
          return '<button class="mehr-btn" onclick="window.navigate&&window.navigate(\''+mod.id+'\');document.getElementById(\'mehr-menu\').style.display=\'none\'"><span>'+mod.icon+'</span>'+mod.label+'</button>';
        }).join('');
      }
    }
  };
  window.closeMehr = function() {
    const m=document.getElementById('mehr-menu');
    if(m) m.style.display = 'none';
    window._mehrAnpassen=false;
    if(typeof renderNav==='function') renderNav();
  };
  document.addEventListener('click', e => {
    const menu = document.getElementById('mehr-menu');
    const btn = document.getElementById('nav-mehr');
    if (menu && !menu.contains(e.target) && !btn?.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  // iOS Install Hint
  const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
  const isStandalone = window.navigator.standalone;
  if (isIos && !isStandalone && !localStorage.getItem('install-dismissed')) {
    document.getElementById('install-banner').classList.remove('hidden');
  }

  // Android Install Prompt

// PWA-Install-Prompt

// PWA-Install-Prompt
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  var btn = document.createElement('button');
  btn.textContent = '📲 App installieren';
  btn.style.cssText='position:fixed;bottom:calc(var(--nav-h) + var(--safe-b) + 12px);right:1rem;z-index:99;background:#b88c30;color:#1a0f00;border:none;border-radius:10px;padding:.6rem 1rem;font-size:.85rem;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.4)';
  btn.onclick = function() { e.prompt(); btn.remove(); };
  document.body.appendChild(btn);
  setTimeout(function(){ btn.remove(); }, 15000);
});
