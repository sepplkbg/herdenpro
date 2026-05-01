// ── app.js – HerdenPro v2 · Alm-Edition ──────────────────────────────────────

import { initializeApp }                        from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, set, update,
         remove, push }                          from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ══════════════════════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════════════════════
let db;
let kuehe={}, behandlungen={}, besamungen={}, zaehlSession=null;
let milchEintraege={}, weideTage={}, weiden={}, bauern={};
let saisonInfo=null;
let currentView='dashboard', editId=null;
let _kalbungIds={};

// ══════════════════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════════════════
export function initApp() {
  try {
    const app = initializeApp(window.FIREBASE_CONFIG);
    db = getDatabase(app);
  } catch(e) { alert('Firebase-Fehler: '+e.message); return; }

  onValue(ref(db,'kuehe'),        s=>{ kuehe=s.val()||{};          render(); checkWartezeiten(); });
  onValue(ref(db,'behandlungen'), s=>{ behandlungen=s.val()||{};   render(); checkWartezeiten(); });
  onValue(ref(db,'besamungen'),   s=>{ besamungen=s.val()||{};     render(); });
  onValue(ref(db,'zaehlung'),     s=>{ zaehlSession=s.val();       render(); });
  onValue(ref(db,'milch'),        s=>{ milchEintraege=s.val()||{}; render(); });
  onValue(ref(db,'weideTage'),    s=>{ weideTage=s.val()||{};      render(); });
  onValue(ref(db,'weiden'),       s=>{ weiden=s.val()||{};         render(); });
  onValue(ref(db,'bauern'),       s=>{ bauern=s.val()||{};         render(); });
  onValue(ref(db,'saison'),       s=>{ saisonInfo=s.val();         render(); });

  registerSW();
  requestNotificationPermission();
  setInterval(checkWartezeiten, 3600000);
}

// ══════════════════════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════════════════════
window.navigate = function(view) {
  currentView=view; editId=null; _kalbungIds={};
  render();
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===view));
};

// ══════════════════════════════════════════════════════════════════════════════
//  RENDER ROUTER
// ══════════════════════════════════════════════════════════════════════════════
function render() {
  const main=document.getElementById('main-content');
  if(!main) return;
  const map = {
    dashboard:    renderDashboard,
    herde:        renderHerde,
    'kuh-detail': renderKuhDetail,
    zaehlung:     renderZaehlung,
    behandlung:   renderBehandlung,
    reproduktion: renderReproduktion,
    milch:        renderMilch,
    weide:        renderWeide,
    saison:       renderSaison,
    bestandsbuch: renderBestandsbuch,
    einstellungen:renderEinstellungen,
  };
  main.innerHTML = (map[currentView]||renderDashboard)();
  attachListeners();
}

// ══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function renderDashboard() {
  const heute=Date.now();
  const kuhListe=Object.values(kuehe);
  const bListe=Object.values(behandlungen);
  const bsListe=Object.values(besamungen);
  const aufgetrieben=kuhListe.filter(k=>k.almStatus==='oben').length;
  const wzAbgelaufen=bListe.filter(b=>b.wartezeitEnde&&b.wartezeitEnde<=heute&&!b.warteAbgeschlossen);
  const wzBald=bListe.filter(b=>b.wartezeitEnde&&b.wartezeitEnde>heute&&b.wartezeitEnde<heute+3*86400000);
  const folgeFaellig=bListe.filter(b=>b.folgeTermin&&b.folgeTermin<=heute+2*86400000&&!b.folgeErledigt);
  const geburtenBald=bsListe.filter(b=>b.erwartetGeburt&&b.erwartetGeburt>heute&&b.erwartetGeburt<heute+14*86400000&&b.status==='tragend');
  const trockenBald=bsListe.filter(b=>b.trockenstell&&b.trockenstell>heute&&b.trockenstell<heute+7*86400000);
  const heuteDatum=isoDate(new Date());
  const heidiWeide=Object.values(weideTage).find(w=>w.datum===heuteDatum);
  const milchWerte=Object.values(milchEintraege).sort((a,b)=>b.datum-a.datum);
  const letztesMilch=milchWerte[0];
  const alerts=[...wzAbgelaufen,...wzBald,...folgeFaellig,...geburtenBald,...trockenBald];

  return `
    <div class="page-header">
      <h2>Übersicht</h2>
      <span class="date-chip">${new Date().toLocaleDateString('de-AT',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}</span>
    </div>
    ${saisonInfo?.aktiv
      ? `<div class="saison-banner" onclick="navigate('saison')"><span>⛰ ${saisonInfo.alm||'Alm'} · Saison aktiv seit ${new Date(saisonInfo.auftriebDatum).toLocaleDateString('de-AT')}</span><span class="saison-count">${aufgetrieben}/${kuhListe.length} oben</span></div>`
      : `<div class="saison-banner saison-inaktiv" onclick="navigate('saison')">⛰ Keine aktive Saison – hier tippen</div>`}
    <div class="stats-grid">
      <div class="stat-card" onclick="navigate('herde')"><div class="stat-icon">🐄</div><div class="stat-num">${kuhListe.length}</div><div class="stat-label">Kühe</div></div>
      <div class="stat-card ${wzAbgelaufen.length?'stat-warn':''}" onclick="navigate('behandlung')"><div class="stat-icon">⚕</div><div class="stat-num">${bListe.filter(b=>b.aktiv).length}</div><div class="stat-label">Behandlung</div></div>
      <div class="stat-card" onclick="navigate('milch')"><div class="stat-icon">🥛</div><div class="stat-num">${letztesMilch?letztesMilch.gesamt+'L':'–'}</div><div class="stat-label">Letzte Milch</div></div>
      <div class="stat-card" onclick="navigate('weide')"><div class="stat-icon">🌿</div><div class="stat-num">${heidiWeide?(heidiWeide.kuhIds?.length||0):'–'}</div><div class="stat-label">Heute Weide</div></div>
    </div>
    ${alerts.length ? `
    <div class="section-title">⚠ Aktionen erforderlich</div>
    <div class="alert-list">
      ${wzAbgelaufen.map(b=>{const k=kuehe[b.kuhId];const id=Object.keys(behandlungen).find(x=>behandlungen[x]===b)||'';return`<div class="alert-item alert-red"><span class="alert-dot red"></span><div><b>Wartezeit abgelaufen</b><br><small>${k?k.name+' #'+k.nr:''} · ${b.medikament||''}</small></div><button class="btn-xs" onclick="wartezeitAbschliessen('${id}')">✓</button></div>`;}).join('')}
      ${wzBald.map(b=>{const k=kuehe[b.kuhId];const t=Math.ceil((b.wartezeitEnde-heute)/86400000);return`<div class="alert-item alert-orange"><span class="alert-dot orange"></span><div><b>Wartezeit endet in ${t} Tag${t===1?'':'en'}</b><br><small>${k?k.name+' #'+k.nr:''} · ${b.medikament||''}</small></div></div>`;}).join('')}
      ${folgeFaellig.map(b=>{const k=kuehe[b.kuhId];return`<div class="alert-item alert-orange" onclick="navigate('behandlung')"><span class="alert-dot orange"></span><div><b>Folgebehandlung fällig</b><br><small>${k?k.name+' #'+k.nr:''} · ${new Date(b.folgeTermin).toLocaleDateString('de-AT')}</small></div></div>`;}).join('')}
      ${geburtenBald.map(b=>{const k=kuehe[b.kuhId];return`<div class="alert-item alert-green" onclick="navigate('reproduktion')"><span class="alert-dot green"></span><div><b>Geburt erwartet</b><br><small>${k?k.name+' #'+k.nr:''} · ${new Date(b.erwartetGeburt).toLocaleDateString('de-AT')}</small></div></div>`;}).join('')}
      ${trockenBald.map(b=>{const k=kuehe[b.kuhId];return`<div class="alert-item alert-blue" onclick="navigate('reproduktion')"><span class="alert-dot blue"></span><div><b>Trockenstellung</b><br><small>${k?k.name+' #'+k.nr:''} · ${new Date(b.trockenstell).toLocaleDateString('de-AT')}</small></div></div>`;}).join('')}
    </div>` : `<div class="empty-state" style="padding:1rem">✓ Keine offenen Aktionen</div>`}
  `;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SAISON
// ══════════════════════════════════════════════════════════════════════════════
function renderSaison() {
  const kuhListe=Object.entries(kuehe).sort((a,b)=>a[1].nr?.localeCompare(b[1].nr,undefined,{numeric:true}));
  const oben=kuhListe.filter(([,k])=>k.almStatus==='oben');
  const unten=kuhListe.filter(([,k])=>k.almStatus!=='oben');
  return `
    <div class="page-header"><h2>⛰ Saison & Auftrieb</h2></div>
    <div class="card-section">
      ${saisonInfo?.aktiv ? `
        <div class="info-row"><span>Saison aktiv seit</span><b>${new Date(saisonInfo.auftriebDatum).toLocaleDateString('de-AT')}</b></div>
        ${saisonInfo.alm?`<div class="info-row"><span>Alm</span><b>${saisonInfo.alm}</b></div>`:''}
        <div style="display:flex;gap:.5rem;margin-top:.8rem;flex-wrap:wrap">
          <button class="btn-primary" onclick="showAbtriebbForm()">Abtrieb erfassen</button>
          <button class="btn-secondary" onclick="if(confirm('Saison beenden?'))beendeSaison()">Saison beenden</button>
        </div>` : `
        <p style="color:var(--text3);font-size:.85rem;margin-bottom:.8rem">Keine aktive Saison:</p>
        <input id="s-alm" class="inp" placeholder="Almname" style="margin-bottom:.5rem" value="${saisonInfo?.alm||''}" />
        <input id="s-datum" class="inp" type="date" value="${isoDate(new Date())}" style="margin-bottom:.5rem" />
        <button class="btn-primary" onclick="startSaison()">Auftrieb starten</button>`}
    </div>
    ${saisonInfo?.aktiv ? `
    <div class="section-title">Auf der Alm (${oben.length})</div>
    <div class="card-list">
      ${oben.map(([id,k])=>`<div class="list-card list-card-sm"><span class="nr-badge">#${k.nr}</span><span class="list-card-title">${k.name||'–'}</span><span style="font-size:.72rem;color:var(--text3)">${k.bauer||''}</span><button class="btn-xs-danger" onclick="setAlmStatus('${id}','unten')">↓ ab</button></div>`).join('')||'<div class="empty-state">Noch keine aufgetrieben</div>'}
    </div>
    <div class="section-title">Noch unten (${unten.length})</div>
    <div class="card-list">
      ${unten.map(([id,k])=>`<div class="list-card list-card-sm"><span class="nr-badge">#${k.nr}</span><span class="list-card-title">${k.name||'–'}</span><span style="font-size:.72rem;color:var(--text3)">${k.bauer||''}</span><button class="btn-xs" onclick="setAlmStatus('${id}','oben')">↑ auf</button></div>`).join('')||'<div class="empty-state">Alle oben ✓</div>'}
    </div>
    <button class="btn-secondary" style="width:100%;margin-top:.6rem" onclick="alleAuftreiben()">Alle aufgetrieben markieren</button>` : ''}
    <div id="abtrieb-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>Abtrieb erfassen</h3><button class="close-btn" onclick="closeForm('abtrieb-overlay')">✕</button></div>
        <div class="form-body">
          <input id="ab-datum" class="inp" type="date" value="${isoDate(new Date())}" />
          <textarea id="ab-notiz" class="inp" rows="2" placeholder="Notizen"></textarea>
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('abtrieb-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveAbtrieb()">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
window.startSaison=async function(){const alm=document.getElementById('s-alm')?.value.trim();const datum=document.getElementById('s-datum')?.value;await set(ref(db,'saison'),{aktiv:true,alm,auftriebDatum:datum?new Date(datum).getTime():Date.now(),jahr:new Date().getFullYear()});};
window.beendeSaison=async function(){await update(ref(db,'saison'),{aktiv:false,abtriebtDatum:Date.now()});const u={};Object.keys(kuehe).forEach(id=>{u[`kuehe/${id}/almStatus`]='unten';});await update(ref(db),u);};
window.setAlmStatus=async(id,s)=>await update(ref(db,'kuehe/'+id),{almStatus:s});
window.alleAuftreiben=async function(){const u={};Object.keys(kuehe).forEach(id=>{u[`kuehe/${id}/almStatus`]='oben';});await update(ref(db),u);};
window.showAbtriebbForm=function(){document.getElementById('abtrieb-overlay').style.display='flex';};
window.saveAbtrieb=async function(){const datum=document.getElementById('ab-datum')?.value;await update(ref(db,'saison'),{abtriebtDatum:datum?new Date(datum).getTime():Date.now(),abtriebtNotiz:document.getElementById('ab-notiz')?.value.trim(),aktiv:false});const u={};Object.keys(kuehe).filter(id=>kuehe[id].almStatus==='oben').forEach(id=>{u[`kuehe/${id}/almStatus`]='unten';});if(Object.keys(u).length)await update(ref(db),u);closeForm('abtrieb-overlay');};

// ══════════════════════════════════════════════════════════════════════════════
//  MILCH
// ══════════════════════════════════════════════════════════════════════════════
function renderMilch() {
  const eintraege=Object.entries(milchEintraege).sort((a,b)=>b[1].datum-a[1].datum);
  const letzten14=eintraege.slice(0,14);
  const gesamtL14=letzten14.reduce((s,[,e])=>s+(e.gesamt||0),0);
  const proMonat={};
  eintraege.forEach(([,e])=>{if(!e.datum)return;const m=new Date(e.datum).toLocaleDateString('de-AT',{month:'short',year:'numeric'});proMonat[m]=(proMonat[m]||0)+(e.gesamt||0);});
  const kueheOben=Object.entries(kuehe).filter(([,k])=>k.almStatus==='oben').sort((a,b)=>a[1].nr?.localeCompare(b[1].nr,undefined,{numeric:true}));
  return `
    <div class="page-header"><h2>🥛 Milchleistung</h2><button class="btn-primary" onclick="showMilchForm()">+ Eintrag</button></div>
    <div class="stats-grid" style="grid-template-columns:1fr 1fr 1fr">
      <div class="stat-card"><div class="stat-icon" style="font-size:.9rem">Ø/Tag</div><div class="stat-num" style="font-size:1.4rem">${letzten14.length?Math.round(gesamtL14/letzten14.length):'–'}L</div><div class="stat-label">14 Tage</div></div>
      <div class="stat-card"><div class="stat-icon" style="font-size:.9rem">Gesamt</div><div class="stat-num" style="font-size:1.4rem">${Math.round(gesamtL14)}L</div><div class="stat-label">14 Tage</div></div>
      <div class="stat-card" onclick="exportMilchSennerei()"><div class="stat-icon">📤</div><div class="stat-num" style="font-size:.9rem">Export</div><div class="stat-label">→ Sennerei</div></div>
    </div>
    ${Object.keys(proMonat).length?`<div class="section-title">Monatsübersicht</div><div class="card-section" style="padding:.5rem .8rem">${Object.entries(proMonat).slice(0,6).map(([m,l])=>`<div class="info-row"><span>${m}</span><b>${Math.round(l)} L</b></div>`).join('')}</div>`:''}
    <div class="section-title">Einträge</div>
    <div class="card-list">
      ${eintraege.length ? eintraege.slice(0,30).map(([id,e])=>`
        <div class="list-card">
          <div class="list-card-left"><div>
            <div class="list-card-title">${new Date(e.datum).toLocaleDateString('de-AT',{weekday:'short',day:'numeric',month:'short'})}</div>
            <div class="list-card-sub">${e.art==='gesamt'?'Gesamtmenge':'Pro Kuh'}${e.sennerei?' · an Sennerei':''}</div>
          </div></div>
          <div class="list-card-right"><span style="font-size:1.1rem;color:var(--gold);font-weight:bold">${e.gesamt} L</span><button class="btn-xs-danger" onclick="deleteMilch('${id}')">✕</button></div>
        </div>`).join('') : `<div class="empty-state">Noch keine Einträge</div>`}
    </div>
    <div id="milch-form-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>Milch erfassen</h3><button class="close-btn" onclick="closeForm('milch-form-overlay')">✕</button></div>
        <div class="form-body">
          <input id="m-datum" class="inp" type="date" value="${isoDate(new Date())}" />
          <label class="inp-label">Erfassungsart</label>
          <select id="m-art" class="inp" onchange="toggleMilchArt(this.value)">
            <option value="gesamt">Gesamtmenge (Alm)</option>
            <option value="prokuh">Pro Kuh</option>
          </select>
          <div id="m-gesamt-block"><input id="m-gesamt" class="inp" placeholder="Liter gesamt" inputmode="decimal" /></div>
          <div id="m-prokuh-block" style="display:none">
            ${kueheOben.map(([id,k])=>`<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem"><span class="nr-badge" style="min-width:44px">#${k.nr}</span><span style="flex:1;font-size:.83rem;color:var(--text2)">${k.name||''}</span><input class="inp kuh-liter" data-id="${id}" placeholder="L" inputmode="decimal" style="width:70px;text-align:right" /></div>`).join('')}
          </div>
          <label class="checkbox-row"><input type="checkbox" id="m-sennerei" /> An Sennerei abgegeben</label>
          <textarea id="m-notiz" class="inp" rows="2" placeholder="Notizen"></textarea>
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('milch-form-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveMilch()">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
window.showMilchForm=function(){const ov=document.getElementById('milch-form-overlay');if(!ov){navigate('milch');setTimeout(()=>showMilchForm(),150);return;}ov.style.display='flex';};
window.toggleMilchArt=function(v){document.getElementById('m-gesamt-block').style.display=v==='gesamt'?'':'none';document.getElementById('m-prokuh-block').style.display=v==='prokuh'?'':'none';};
window.saveMilch=async function(){
  const datum=document.getElementById('m-datum')?.value;const art=document.getElementById('m-art')?.value;
  let gesamt=0,prokuh={};
  if(art==='gesamt'){gesamt=parseFloat(document.getElementById('m-gesamt')?.value)||0;}
  else{document.querySelectorAll('.kuh-liter').forEach(inp=>{const l=parseFloat(inp.value)||0;if(l>0){prokuh[inp.dataset.id]=l;gesamt+=l;}});}
  if(!gesamt){alert('Bitte Menge eingeben');return;}
  await push(ref(db,'milch'),{datum:new Date(datum).getTime(),art,gesamt:Math.round(gesamt*10)/10,prokuh,sennerei:document.getElementById('m-sennerei')?.checked,notiz:document.getElementById('m-notiz')?.value.trim(),createdAt:Date.now()});
  closeForm('milch-form-overlay');
};
window.deleteMilch=async id=>{if(confirm('Löschen?'))await remove(ref(db,'milch/'+id));};
window.exportMilchSennerei=function(){
  const csv='Datum;Liter;An Sennerei;Notiz\n'+Object.values(milchEintraege).sort((a,b)=>a.datum-b.datum).map(e=>[new Date(e.datum).toLocaleDateString('de-AT'),e.gesamt,e.sennerei?'Ja':'Nein',e.notiz||''].join(';')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=`Milch_${isoDate(new Date())}.csv`;a.click();
};

// ══════════════════════════════════════════════════════════════════════════════
//  WEIDEGANG
// ══════════════════════════════════════════════════════════════════════════════
function renderWeide() {
  const heuteDatum=isoDate(new Date());
  const weidenListe=Object.entries(weiden).sort((a,b)=>a[1].name?.localeCompare(b[1].name));
  const verlauf=Object.entries(weideTage).sort((a,b)=>b[1].datum?.localeCompare(a[1].datum)).slice(0,30);
  const heuteEintrag=Object.entries(weideTage).find(([,w])=>w.datum===heuteDatum);
  const kueheOben=Object.entries(kuehe).filter(([,k])=>k.almStatus==='oben').sort((a,b)=>a[1].nr?.localeCompare(b[1].nr,undefined,{numeric:true}));
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
window.showWeideTagForm=function(){const ov=document.getElementById('weidetag-overlay');if(!ov){navigate('weide');setTimeout(()=>showWeideTagForm(),150);return;}ov.style.display='flex';};
window.alleKueheWeide=an=>document.querySelectorAll('.kuh-cb').forEach(cb=>cb.checked=an);
window.saveWeideTag=async function(){
  const datum=document.getElementById('wt-datum')?.value;const wv=document.getElementById('wt-weide')?.value;
  await push(ref(db,'weideTage'),{datum,weideId:wv!=='__text__'?wv:'',weideText:wv==='__text__'?(document.getElementById('wt-freitext')?.value.trim()||''):'',kuhIds:[...document.querySelectorAll('.kuh-cb:checked')].map(c=>c.value),notiz:document.getElementById('wt-notiz')?.value.trim(),createdAt:Date.now()});
  closeForm('weidetag-overlay');
};
window.showWeideForm=function(){document.getElementById('weide-overlay').style.display='flex';};
window.saveWeide=async function(){const name=document.getElementById('w-name')?.value.trim();if(!name)return;await push(ref(db,'weiden'),{name,ha:parseFloat(document.getElementById('w-ha')?.value)||null,notiz:document.getElementById('w-notiz')?.value.trim()});closeForm('weide-overlay');};
window.deleteWeide=async id=>{if(confirm('Weide löschen?'))await remove(ref(db,'weiden/'+id));};
window.deleteWeideTag=async id=>{if(confirm('Eintrag löschen?'))await remove(ref(db,'weideTage/'+id));};

// ══════════════════════════════════════════════════════════════════════════════
//  BESTANDSBUCH
// ══════════════════════════════════════════════════════════════════════════════
function renderBestandsbuch() {
  const bListe=Object.entries(behandlungen).filter(([,b])=>b.medikament).sort((a,b)=>b[1].datum-a[1].datum);
  return `
    <div class="page-header"><h2>📋 Bestandsbuch</h2><button class="btn-primary" onclick="druckeBestandsbuch()">🖨 Drucken</button></div>
    <p style="font-size:.75rem;color:var(--text3);margin-bottom:.8rem">Gemäß § 12 TAKG – alle Behandlungen mit Medikamenten.</p>
    <div class="card-section" style="margin-bottom:.8rem">
      <div class="info-row"><span>Betrieb / Alm</span><b>${saisonInfo?.alm||'–'}</b></div>
      <div class="info-row"><span>Tiere</span><b>${Object.keys(kuehe).length}</b></div>
      <div class="info-row"><span>Saison</span><b>${saisonInfo?.jahr||new Date().getFullYear()}</b></div>
    </div>
    ${bListe.length?`
    <div style="overflow-x:auto">
    <table class="bb-table">
      <thead><tr><th>Datum</th><th>Tier</th><th>Diagnose</th><th>Medikament</th><th>Dosis</th><th>Wartezeit</th><th>Tierarzt</th></tr></thead>
      <tbody>${bListe.map(([,b])=>{const k=kuehe[b.kuhId];return`<tr><td>${new Date(b.datum).toLocaleDateString('de-AT')}</td><td>#${k?.nr||'?'} ${k?.name||''}</td><td>${b.diagnose||'–'}</td><td>${b.medikament}</td><td>${b.dosis||'–'}</td><td>${b.wartezeitEnde?new Date(b.wartezeitEnde).toLocaleDateString('de-AT'):'–'}</td><td>${b.tierarzt||'–'}</td></tr>`;}).join('')}</tbody>
    </table></div>` : `<div class="empty-state">Keine Behandlungen mit Medikamenten</div>`}
  `;
}
window.druckeBestandsbuch=function(){
  const alm=saisonInfo?.alm||'Alm';const jahr=saisonInfo?.jahr||new Date().getFullYear();
  const z=Object.values(behandlungen).filter(b=>b.medikament).sort((a,b)=>a.datum-b.datum).map(b=>{const k=kuehe[b.kuhId];return`<tr><td>${new Date(b.datum).toLocaleDateString('de-AT')}</td><td>#${k?.nr||'?'} ${k?.name||''}</td><td>${b.diagnose||'–'}</td><td>${b.medikament}</td><td>${b.dosis||'–'}</td><td>${b.wartezeitEnde?new Date(b.wartezeitEnde).toLocaleDateString('de-AT'):'–'}</td><td>${b.tierarzt||'–'}</td></tr>`;}).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/><title>Bestandsbuch ${alm} ${jahr}</title><style>body{font-family:Arial,sans-serif;font-size:11pt;margin:2cm}h1{font-size:14pt}p{font-size:9pt;color:#555;margin-bottom:12px}table{width:100%;border-collapse:collapse;font-size:9pt}th{background:#1a3a0a;color:#fff;padding:5px 8px;text-align:left}td{padding:4px 8px;border-bottom:1px solid #ddd}tr:nth-child(even){background:#f8f8f0}@media print{@page{margin:1.5cm}}</style></head><body><h1>Bestandsbuch – ${alm} · Saison ${jahr}</h1><p>Erstellt: ${new Date().toLocaleDateString('de-AT')} · § 12 TAKG</p><table><thead><tr><th>Datum</th><th>Tier</th><th>Diagnose</th><th>Medikament</th><th>Dosis</th><th>Wartezeit bis</th><th>Tierarzt</th></tr></thead><tbody>${z}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
};

// ══════════════════════════════════════════════════════════════════════════════
//  EINSTELLUNGEN
// ══════════════════════════════════════════════════════════════════════════════
function renderEinstellungen() {
  const bauernListe=Object.entries(bauern).sort((a,b)=>a[1].name?.localeCompare(b[1].name));
  return `
    <div class="page-header"><h2>⚙ Einstellungen</h2></div>
    <div class="section-title">Bauern / Betriebe <button class="btn-xs" style="margin-left:.5rem" onclick="showBauerForm()">+ Bauer</button></div>
    <div class="card-list">
      ${bauernListe.length?bauernListe.map(([id,b])=>`<div class="list-card list-card-sm"><div><div class="list-card-title">${b.name}</div><div class="list-card-sub">${b.betrieb||''} ${b.tel?'· '+b.tel:''}</div></div><button class="btn-xs-danger" onclick="deleteBauer('${id}')">✕</button></div>`).join(''):`<div class="empty-state">Keine Bauern erfasst</div>`}
    </div>
    <div class="section-title" style="margin-top:1rem">Sennerei-Export</div>
    <div class="card-section"><p style="font-size:.82rem;color:var(--text2);margin-bottom:.7rem">Milchdaten als CSV exportieren → direkt ins Sennerei-Verwaltungssystem importieren.</p><button class="btn-primary" onclick="exportMilchSennerei()">📤 Milch-CSV exportieren</button></div>
    <div id="bauer-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>Bauer erfassen</h3><button class="close-btn" onclick="closeForm('bauer-overlay')">✕</button></div>
        <div class="form-body">
          <input id="ba-name" class="inp" placeholder="Name *" />
          <input id="ba-betrieb" class="inp" placeholder="Betrieb / LFBIS-Nr." />
          <input id="ba-tel" class="inp" placeholder="Telefon" inputmode="tel" />
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('bauer-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveBauer()">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
window.showBauerForm=function(){document.getElementById('bauer-overlay').style.display='flex';};
window.saveBauer=async function(){const name=document.getElementById('ba-name')?.value.trim();if(!name)return;await push(ref(db,'bauern'),{name,betrieb:document.getElementById('ba-betrieb')?.value.trim(),tel:document.getElementById('ba-tel')?.value.trim()});closeForm('bauer-overlay');};
window.deleteBauer=async id=>{if(confirm('Bauer löschen?'))await remove(ref(db,'bauern/'+id));};

// ══════════════════════════════════════════════════════════════════════════════
//  HERDE
// ══════════════════════════════════════════════════════════════════════════════
function renderHerde() {
  const liste=Object.entries(kuehe).sort((a,b)=>a[1].nr?.localeCompare(b[1].nr,undefined,{numeric:true}));
  const bauernListe=Object.entries(bauern);
  return `
    <div class="page-header"><h2>🐄 Herde (${liste.length})</h2><div style="display:flex;gap:.5rem"><button class="btn-ghost" onclick="importCSVDialog()">📥</button><button class="btn-primary" onclick="showKuhForm()">+ Kuh</button></div></div>
    <div class="search-bar"><input id="kuh-search" class="search-inp" placeholder="Suche Nr, Name, Bauer…" oninput="filterKuehe(this.value)" /></div>
    ${bauernListe.length?`<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.6rem"><button class="filter-chip active" onclick="filterBauer('',this)">Alle</button>${bauernListe.map(([,b])=>`<button class="filter-chip" onclick="filterBauer('${b.name}',this)">${b.name}</button>`).join('')}</div>`:''}
    <div class="card-list" id="kuh-list">
      ${liste.length?liste.map(([id,k])=>`<div class="list-card" data-bauer="${k.bauer||''}" onclick="showKuhDetail('${id}')"><div class="list-card-left"><span class="nr-badge">#${k.nr}</span><div><div class="list-card-title">${k.name||'–'} ${k.almStatus==='oben'?'<span class="tag tag-green" style="font-size:.6rem">⛰</span>':''}</div><div class="list-card-sub">${k.bauer||''} ${k.rasse?'· '+k.rasse:''}</div></div></div><div class="list-card-right">${Object.values(behandlungen).some(b=>b.kuhId===id&&b.aktiv)?'<span class="tag tag-red">⚕</span>':''}${Object.values(besamungen).some(b=>b.kuhId===id&&b.status==='tragend')?'<span class="tag tag-blue">🐮</span>':''}<span class="chevron">›</span></div></div>`).join(''):`<div class="empty-state">Noch keine Kühe erfasst</div>`}
    </div>
    <div id="csv-import-overlay" class="form-overlay" style="display:none"><div class="form-sheet"><div class="form-header"><h3>Kühe importieren</h3><button class="close-btn" onclick="closeForm('csv-import-overlay')">✕</button></div><div class="form-body"><p class="hint">Excel-Tabelle einfügen. Spalten: Nr · Name · Bauer · Rasse (erste Zeile = Überschrift)</p><textarea id="import-text" class="inp" rows="7" placeholder="Nr&#9;Name&#9;Bauer&#9;Rasse&#10;1&#9;Elsa&#9;Mayr&#9;Fleckvieh"></textarea><div id="import-err" style="color:var(--red);font-size:.78rem"></div><div class="form-actions"><button class="btn-secondary" onclick="closeForm('csv-import-overlay')">Abbrechen</button><button class="btn-primary" onclick="doImport()">Importieren</button></div></div></div></div>
    <div id="kuh-form-overlay" class="form-overlay" style="display:none"><div class="form-sheet"><div class="form-header"><h3 id="kuh-form-title">Kuh erfassen</h3><button class="close-btn" onclick="closeForm('kuh-form-overlay')">✕</button></div><div class="form-body"><input id="f-nr" class="inp" placeholder="Ohrmarkennummer *" /><input id="f-name" class="inp" placeholder="Kuhname" /><select id="f-bauer" class="inp"><option value="">Bauer wählen</option>${bauernListe.map(([,b])=>`<option value="${b.name}">${b.name}</option>`).join('')}<option value="__neu__">+ Freitext</option></select><input id="f-bauer-text" class="inp" placeholder="Bauer (Freitext)" style="display:none" /><input id="f-rasse" class="inp" placeholder="Rasse" /><div class="form-actions"><button class="btn-secondary" onclick="closeForm('kuh-form-overlay')">Abbrechen</button><button class="btn-primary" onclick="saveKuh()">Speichern</button></div></div></div></div>
  `;
}

function renderKuhDetail() {
  const id=editId;const k=kuehe[id];if(!k)return'<div class="empty-state">Nicht gefunden</div>';
  const bList=Object.entries(behandlungen).filter(([,b])=>b.kuhId===id).sort((a,b)=>b[1].datum-a[1].datum);
  const bsList=Object.entries(besamungen).filter(([,b])=>b.kuhId===id).sort((a,b)=>b[1].datum-a[1].datum);
  const mList=Object.entries(milchEintraege).filter(([,m])=>m.prokuh?.[id]).sort((a,b)=>b[1].datum-a[1].datum).slice(0,10);
  return `
    <div class="page-header"><button class="back-btn" onclick="navigate('herde')">‹ Herde</button><div style="display:flex;gap:.5rem"><button class="btn-ghost" onclick="showKuhForm('${id}')">✎</button><button class="btn-xs-danger" onclick="deleteKuh('${id}')">Löschen</button></div></div>
    <div class="detail-hero"><div class="detail-nr">#${k.nr} ${k.almStatus==='oben'?'· ⛰ auf Alm':''}</div><div class="detail-name">${k.name||'–'}</div><div class="detail-meta">${[k.bauer,k.rasse].filter(Boolean).join(' · ')}</div></div>
    <div class="detail-tabs"><button class="tab-btn active" onclick="switchTab('tab-b','tab-r,tab-m',this)">Behandlung</button><button class="tab-btn" onclick="switchTab('tab-r','tab-b,tab-m',this)">Reproduktion</button><button class="tab-btn" onclick="switchTab('tab-m','tab-b,tab-r',this)">Milch</button></div>
    <div id="tab-b"><button class="btn-primary btn-block" onclick="showBehandlungForm('${id}')">+ Behandlung</button>${bList.map(([bid,b])=>behandlungCard(bid,b)).join('')||'<div class="empty-state">Keine Behandlungen</div>'}</div>
    <div id="tab-r" style="display:none"><button class="btn-primary btn-block" onclick="showBesamungForm('${id}')">+ Besamung</button>${bsList.map(([bsid,bs])=>besamungCard(bsid,bs)).join('')||'<div class="empty-state">Keine Besamungen</div>'}</div>
    <div id="tab-m" style="display:none">${mList.length?`<div class="card-list">${mList.map(([,m])=>`<div class="list-card list-card-sm"><span style="font-size:.8rem;color:var(--text3)">${new Date(m.datum).toLocaleDateString('de-AT')}</span><span style="color:var(--gold);font-weight:bold">${m.prokuh[id]} L</span></div>`).join('')}</div>`:`<div class="empty-state">Keine Einzelmilchdaten</div>`}</div>
    ${behandlungFormHTML(id)}${besamungFormHTML(id)}${kalbungFormHTML()}
  `;
}

function renderZaehlung() {
  const kuhListe=Object.entries(kuehe).sort((a,b)=>a[1].nr?.localeCompare(b[1].nr,undefined,{numeric:true}));
  const anwesend=zaehlSession?.anwesend||{};
  const total=kuhListe.length;const anwCount=Object.keys(anwesend).length;
  const fehlend=kuhListe.filter(([id])=>!anwesend[id]);const voll=total>0&&anwCount===total;
  return `
    <div class="page-header"><h2>✓ Herdenzählung</h2>${zaehlSession?`<button class="btn-ghost" onclick="resetZaehlung()">↺</button>`:''}</div>
    <div class="zaehlung-status ${voll?'z-voll':''}"><div class="z-counts"><span class="z-big">${anwCount}</span><span class="z-sep">/</span><span class="z-total">${total}</span></div>${voll?`<div class="z-voll-msg">✓ Herde vollzählig!</div>`:`<div class="z-fehlt-msg">${total-anwCount} fehlen</div>`}</div>
    ${!zaehlSession?`<button class="btn-primary btn-block" onclick="startZaehlung()">Zählung starten</button>`:`
    <div class="zaehlung-eingabe"><input id="z-input" class="inp z-inp" placeholder="Ohrmarken-Nr…" onkeydown="if(event.key==='Enter')zaehlKuh(this.value)" autocomplete="off" inputmode="numeric" autofocus /><button class="ok-btn" onclick="zaehlKuh(document.getElementById('z-input').value)">✓</button></div>
    ${fehlend.length&&fehlend.length<=40?`<div class="section-title">Fehlende – antippen</div><div class="kuh-chips">${fehlend.map(([id,k])=>`<button class="kuh-chip" onclick="zaehlKuhById('${id}')"><span class="chip-nr">#${k.nr}</span>${k.name?`<span class="chip-kuh">${k.name}</span>`:''}</button>`).join('')}</div>`:''}
    <div class="section-title">Anwesend (${anwCount})</div>
    <div class="card-list">${Object.entries(anwesend).map(([id])=>{const k=kuehe[id];return`<div class="list-card list-card-sm"><span class="nr-badge">#${k?.nr||id}</span><span class="list-card-title">${k?.name||''}</span><button class="remove-btn" onclick="entferneZaehlung('${id}')">✕</button></div>`;}).join('')}</div>`}
  `;
}

function renderBehandlung() {
  const aktive=Object.entries(behandlungen).filter(([,b])=>b.aktiv).sort((a,b)=>b[1].datum-a[1].datum);
  const archiv=Object.entries(behandlungen).filter(([,b])=>!b.aktiv).sort((a,b)=>b[1].datum-a[1].datum).slice(0,20);
  return `
    <div class="page-header"><h2>⚕ Behandlungen</h2><button class="btn-primary" onclick="showBehandlungForm(null)">+ Neu</button></div>
    ${aktive.length?`<div class="section-title">Aktiv (${aktive.length})</div>${aktive.map(([bid,b])=>behandlungCard(bid,b)).join('')}`:''}
    ${archiv.length?`<div class="section-title">Archiv</div>${archiv.map(([bid,b])=>behandlungCard(bid,b)).join('')}`:''}
    ${!aktive.length&&!archiv.length?'<div class="empty-state">Keine Behandlungen</div>':''}
    ${behandlungFormHTML(null)}
  `;
}

function renderReproduktion() {
  const traechtig=Object.entries(besamungen).filter(([,b])=>b.status==='tragend').sort((a,b)=>a[1].erwartetGeburt-b[1].erwartetGeburt);
  const andere=Object.entries(besamungen).filter(([,b])=>b.status!=='tragend').sort((a,b)=>b[1].datum-a[1].datum).slice(0,20);
  return `
    <div class="page-header"><h2>🐮 Reproduktion</h2><button class="btn-primary" onclick="showBesamungForm(null)">+ Besamung</button></div>
    ${traechtig.length?`<div class="section-title">Trächtig (${traechtig.length})</div>${traechtig.map(([id,bs])=>besamungCard(id,bs)).join('')}`:''}
    ${andere.length?`<div class="section-title">Archiv</div>${andere.map(([id,bs])=>besamungCard(id,bs)).join('')}`:''}
    ${!traechtig.length&&!andere.length?'<div class="empty-state">Keine Besamungen</div>':''}
    ${besamungFormHTML(null)}${kalbungFormHTML()}
  `;
}

// ── Card-Helfer ────────────────────────────────────────────────────────────────
function behandlungCard(bid,b){const k=kuehe[b.kuhId];const h=Date.now();const wz=b.wartezeitEnde&&b.wartezeitEnde<=h&&!b.warteAbgeschlossen;return`<div class="history-card ${b.aktiv?'history-active':''}"><div class="history-top"><span class="history-date">${new Date(b.datum).toLocaleDateString('de-AT')}</span>${b.aktiv?'<span class="tag tag-red">aktiv</span>':''}${wz?'<span class="tag tag-red">⚠ WZ!</span>':''}</div><div class="history-title">${b.diagnose||b.medikament||'Behandlung'} ${k?`<span style="color:var(--text3);font-size:.75rem">· #${k.nr} ${k.name||''}</span>`:''}</div>${b.medikament?`<div class="history-sub">${b.medikament}${b.dosis?' · '+b.dosis:''}${b.tierarzt?' · Dr.'+b.tierarzt:''}</div>`:''}${b.symptome?`<div class="history-note">${b.symptome}</div>`:''}${b.wartezeitEnde?`<div class="wartezeit-bar"><span>WZ bis ${new Date(b.wartezeitEnde).toLocaleDateString('de-AT')}</span>${b.wartezeitEnde<=h?'<span class="tag tag-green">✓</span>':'<span class="tag tag-orange">läuft</span>'}</div>`:''}${b.folgeTermin?`<div class="history-note">📅 ${new Date(b.folgeTermin).toLocaleDateString('de-AT')}</div>`:''}<div style="display:flex;gap:.4rem;margin-top:.4rem">${wz?`<button class="btn-xs" onclick="wartezeitAbschliessen('${bid}')">✓ WZ ok</button>`:''}<button class="btn-xs-danger" onclick="deleteBehandlung('${bid}')">löschen</button></div></div>`;}
function besamungCard(bsid,bs){const k=kuehe[bs.kuhId];return`<div class="history-card ${bs.status==='tragend'?'history-active':''}"><div class="history-top"><span class="history-date">${new Date(bs.datum).toLocaleDateString('de-AT')}</span><span class="tag ${bs.status==='tragend'?'tag-green':bs.status==='kalbung'?'tag-blue':'tag-gray'}">${statusLabel(bs.status)}</span></div><div class="history-title">${bs.stier||bs.samen||'Besamung'} ${k?`<span style="color:var(--text3);font-size:.75rem">· #${k.nr} ${k.name||''}</span>`:''}</div>${bs.erwartetGeburt?`<div class="history-sub">Geburt erw.: ${new Date(bs.erwartetGeburt).toLocaleDateString('de-AT')}</div>`:''}${bs.trockenstell?`<div class="history-sub">Trockenstell: ${new Date(bs.trockenstell).toLocaleDateString('de-AT')}</div>`:''}${bs.kalbDatum?`<div class="history-sub">Kalbung: ${new Date(bs.kalbDatum).toLocaleDateString('de-AT')} · ${bs.kalbGeschlecht||''} ${bs.kalbNr?'#'+bs.kalbNr:''}</div>`:''}<div style="display:flex;gap:.4rem;margin-top:.4rem">${bs.status==='tragend'?`<button class="btn-xs" onclick="showKalbungForm('${bsid}','${bs.kuhId}')">Kalbung</button>`:''}<button class="btn-xs-danger" onclick="deleteBesamung('${bsid}')">löschen</button></div></div>`;}

function behandlungFormHTML(vorId){const opts=Object.entries(kuehe).sort((a,b)=>a[1].nr?.localeCompare(b[1].nr,undefined,{numeric:true})).map(([id,k])=>`<option value="${id}" ${id===vorId?'selected':''}>#${k.nr} ${k.name||''}</option>`).join('');return`<div id="behandlung-form-overlay" class="form-overlay" style="display:none"><div class="form-sheet"><div class="form-header"><h3>Behandlung</h3><button class="close-btn" onclick="closeForm('behandlung-form-overlay')">✕</button></div><div class="form-body"><select id="b-kuh" class="inp"><option value="">Kuh *</option>${opts}</select><input id="b-datum" class="inp" type="date" value="${isoDate(new Date())}" /><input id="b-diagnose" class="inp" placeholder="Diagnose" /><input id="b-symptome" class="inp" placeholder="Symptome" /><input id="b-medikament" class="inp" placeholder="Medikament" /><input id="b-dosis" class="inp" placeholder="Dosis" /><input id="b-tierarzt" class="inp" placeholder="Tierarzt" /><label class="inp-label">Wartezeit endet am</label><input id="b-wartezeit" class="inp" type="date" /><label class="inp-label">Folgetermin</label><input id="b-folge" class="inp" type="date" /><textarea id="b-notiz" class="inp" rows="2" placeholder="Notizen"></textarea><label class="checkbox-row"><input type="checkbox" id="b-aktiv" checked /> aktiv</label><div class="form-actions"><button class="btn-secondary" onclick="closeForm('behandlung-form-overlay')">Abbrechen</button><button class="btn-primary" onclick="saveBehandlung()">Speichern</button></div></div></div></div>`;}
function besamungFormHTML(vorId){const opts=Object.entries(kuehe).sort((a,b)=>a[1].nr?.localeCompare(b[1].nr,undefined,{numeric:true})).map(([id,k])=>`<option value="${id}" ${id===vorId?'selected':''}>#${k.nr} ${k.name||''}</option>`).join('');return`<div id="besamung-form-overlay" class="form-overlay" style="display:none"><div class="form-sheet"><div class="form-header"><h3>Besamung</h3><button class="close-btn" onclick="closeForm('besamung-form-overlay')">✕</button></div><div class="form-body"><select id="bs-kuh" class="inp"><option value="">Kuh *</option>${opts}</select><input id="bs-datum" class="inp" type="date" value="${isoDate(new Date())}" /><input id="bs-stier" class="inp" placeholder="Stier / Samenspender" /><input id="bs-samen" class="inp" placeholder="Samen-Nr" /><select id="bs-status" class="inp"><option value="besamt">Besamt – offen</option><option value="tragend">Tragend</option><option value="leer">Leer</option></select><label class="inp-label">Erwarteter Geburtstermin</label><input id="bs-geburt" class="inp" type="date" /><label class="inp-label">Trockenstelltermin</label><input id="bs-trock" class="inp" type="date" /><textarea id="bs-notiz" class="inp" rows="2" placeholder="Notizen"></textarea><div class="form-actions"><button class="btn-secondary" onclick="closeForm('besamung-form-overlay')">Abbrechen</button><button class="btn-primary" onclick="saveBesamung()">Speichern</button></div></div></div></div>`;}
function kalbungFormHTML(){return`<div id="kalbung-form-overlay" class="form-overlay" style="display:none"><div class="form-sheet"><div class="form-header"><h3>Kalbung</h3><button class="close-btn" onclick="closeForm('kalbung-form-overlay')">✕</button></div><div class="form-body"><input id="kb-datum" class="inp" type="date" value="${isoDate(new Date())}" /><select id="kb-geschlecht" class="inp"><option value="">Geschlecht</option><option>Stierkalb</option><option>Kuhkalb</option></select><input id="kb-nr" class="inp" placeholder="Ohrmarke Kalb" /><input id="kb-name" class="inp" placeholder="Name" /><input id="kb-gewicht" class="inp" placeholder="Geburtsgewicht kg" inputmode="decimal" /><select id="kb-verlauf" class="inp"><option value="normal">Normal</option><option value="schwer">Schwergeburt</option><option value="totgeburt">Totgeburt</option></select><textarea id="kb-notiz" class="inp" rows="2" placeholder="Notizen"></textarea><div class="form-actions"><button class="btn-secondary" onclick="closeForm('kalbung-form-overlay')">Abbrechen</button><button class="btn-primary" onclick="saveKalbung()">Speichern</button></div></div></div></div>`;}

// ══════════════════════════════════════════════════════════════════════════════
//  ACTIONS
// ══════════════════════════════════════════════════════════════════════════════
window.showKuhForm=function(id=null){editId=id;const ov=document.getElementById('kuh-form-overlay');if(!ov){navigate('herde');setTimeout(()=>showKuhForm(id),150);return;}if(id&&kuehe[id]){const k=kuehe[id];document.getElementById('f-nr').value=k.nr||'';document.getElementById('f-name').value=k.name||'';document.getElementById('f-rasse').value=k.rasse||'';document.getElementById('kuh-form-title').textContent='Kuh bearbeiten';}ov.style.display='flex';document.getElementById('f-bauer').onchange=function(){document.getElementById('f-bauer-text').style.display=this.value==='__neu__'?'':'none';};};
window.saveKuh=async function(){const nr=document.getElementById('f-nr')?.value.trim();if(!nr){alert('Nr Pflicht');return;}const bs=document.getElementById('f-bauer')?.value;const bauer=bs==='__neu__'?(document.getElementById('f-bauer-text')?.value.trim()||''):bs;const data={nr,name:document.getElementById('f-name')?.value.trim(),bauer,rasse:document.getElementById('f-rasse')?.value.trim(),updatedAt:Date.now()};if(editId)await update(ref(db,'kuehe/'+editId),data);else{data.createdAt=Date.now();data.almStatus='unten';await push(ref(db,'kuehe'),data);}closeForm('kuh-form-overlay');};
window.deleteKuh=async function(id){if(confirm('Kuh löschen?'))await remove(ref(db,'kuehe/'+id));navigate('herde');};
window.showKuhDetail=function(id){editId=id;currentView='kuh-detail';render();};
window.filterKuehe=q=>document.querySelectorAll('#kuh-list .list-card').forEach(c=>c.style.display=c.textContent.toLowerCase().includes(q.toLowerCase())?'':'none');
window.filterBauer=function(b,btn){document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));btn.classList.add('active');document.querySelectorAll('#kuh-list .list-card').forEach(c=>c.style.display=b===''||c.dataset.bauer===b?'':'none');};
window.importCSVDialog=function(){const ov=document.getElementById('csv-import-overlay');if(!ov){navigate('herde');setTimeout(()=>importCSVDialog(),150);return;}ov.style.display='flex';};
window.doImport=async function(){const rows=parseTable(document.getElementById('import-text')?.value);if(!rows){document.getElementById('import-err').textContent='Format nicht erkannt.';return;}for(const r of rows)await push(ref(db,'kuehe'),{...r,almStatus:'unten',createdAt:Date.now()});closeForm('csv-import-overlay');};
window.startZaehlung=async()=>set(ref(db,'zaehlung'),{anwesend:{},startedAt:Date.now()});
window.resetZaehlung=async()=>{if(confirm('Reset?'))await remove(ref(db,'zaehlung'));};
window.zaehlKuh=async function(val){val=val.trim();const inp=document.getElementById('z-input');if(!val||!zaehlSession)return;const f=Object.entries(kuehe).find(([,k])=>k.nr===val);if(!f){inp.style.borderColor='var(--red)';setTimeout(()=>inp.style.borderColor='',700);inp.value='';return;}const[id]=f;if(zaehlSession.anwesend?.[id]&&!confirm('Bereits erfasst – trotzdem?')){inp.value='';return;}await update(ref(db,`zaehlung/anwesend/${id}`),{ts:Date.now()});inp.value='';inp.style.borderColor='var(--green)';setTimeout(()=>inp.style.borderColor='',600);inp.focus();};
window.zaehlKuhById=async function(id){if(zaehlSession?.anwesend?.[id]&&!confirm('Bereits erfasst?'))return;await update(ref(db,`zaehlung/anwesend/${id}`),{ts:Date.now()});};
window.entferneZaehlung=async id=>remove(ref(db,`zaehlung/anwesend/${id}`));
window.showBehandlungForm=function(kuhId){const ov=document.getElementById('behandlung-form-overlay');if(!ov){navigate('behandlung');setTimeout(()=>showBehandlungForm(kuhId),200);return;}if(kuhId)document.getElementById('b-kuh').value=kuhId;ov.style.display='flex';};
window.saveBehandlung=async function(){const kuhId=document.getElementById('b-kuh')?.value;if(!kuhId){alert('Kuh wählen');return;}const wz=document.getElementById('b-wartezeit')?.value;const fl=document.getElementById('b-folge')?.value;await push(ref(db,'behandlungen'),{kuhId,datum:new Date(document.getElementById('b-datum').value).getTime(),diagnose:document.getElementById('b-diagnose')?.value.trim(),symptome:document.getElementById('b-symptome')?.value.trim(),medikament:document.getElementById('b-medikament')?.value.trim(),dosis:document.getElementById('b-dosis')?.value.trim(),tierarzt:document.getElementById('b-tierarzt')?.value.trim(),wartezeitEnde:wz?new Date(wz).getTime():null,folgeTermin:fl?new Date(fl).getTime():null,notiz:document.getElementById('b-notiz')?.value.trim(),aktiv:document.getElementById('b-aktiv')?.checked??true,createdAt:Date.now()});closeForm('behandlung-form-overlay');};
window.deleteBehandlung=async id=>{if(confirm('Löschen?'))await remove(ref(db,'behandlungen/'+id));};
window.wartezeitAbschliessen=async id=>update(ref(db,'behandlungen/'+id),{warteAbgeschlossen:true,aktiv:false});
window.showBesamungForm=function(kuhId){const ov=document.getElementById('besamung-form-overlay');if(!ov){navigate('reproduktion');setTimeout(()=>showBesamungForm(kuhId),200);return;}if(kuhId)document.getElementById('bs-kuh').value=kuhId;ov.style.display='flex';};
window.saveBesamung=async function(){const kuhId=document.getElementById('bs-kuh')?.value;if(!kuhId){alert('Kuh wählen');return;}const g=document.getElementById('bs-geburt')?.value;const t=document.getElementById('bs-trock')?.value;await push(ref(db,'besamungen'),{kuhId,datum:new Date(document.getElementById('bs-datum').value).getTime(),stier:document.getElementById('bs-stier')?.value.trim(),samen:document.getElementById('bs-samen')?.value.trim(),status:document.getElementById('bs-status')?.value||'besamt',erwartetGeburt:g?new Date(g).getTime():null,trockenstell:t?new Date(t).getTime():null,notiz:document.getElementById('bs-notiz')?.value.trim(),createdAt:Date.now()});closeForm('besamung-form-overlay');};
window.deleteBesamung=async id=>{if(confirm('Löschen?'))await remove(ref(db,'besamungen/'+id));};
window.showKalbungForm=function(bsid,kuhId){_kalbungIds={bsid,kuhId};const ov=document.getElementById('kalbung-form-overlay');if(!ov){navigate('reproduktion');setTimeout(()=>showKalbungForm(bsid,kuhId),200);return;}ov.style.display='flex';};
window.saveKalbung=async function(){const{bsid,kuhId}=_kalbungIds;const d=document.getElementById('kb-datum')?.value;const gs=document.getElementById('kb-geschlecht')?.value;const nr=document.getElementById('kb-nr')?.value.trim();await update(ref(db,'besamungen/'+bsid),{status:'kalbung',kalbDatum:d?new Date(d).getTime():Date.now(),kalbGeschlecht:gs,kalbNr:nr,kalbName:document.getElementById('kb-name')?.value.trim(),kalbGewicht:document.getElementById('kb-gewicht')?.value.trim(),kalbVerlauf:document.getElementById('kb-verlauf')?.value});if(gs==='Kuhkalb'&&nr&&confirm('Kalb als neue Kuh anlegen?')){const m=kuehe[kuhId];await push(ref(db,'kuehe'),{nr,name:document.getElementById('kb-name')?.value.trim()||'',bauer:m?.bauer||'',rasse:m?.rasse||'',mutter:m?.nr||'',almStatus:'unten',createdAt:Date.now()});}closeForm('kalbung-form-overlay');};

// ══════════════════════════════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════════════════════════════
window.closeForm=function(id){const el=document.getElementById(id);if(el)el.style.display='none';};
window.switchTab=function(show,hide,btn){show.split(',').forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='';});hide.split(',').forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});btn.closest('.detail-tabs').querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');};
function attachListeners(){document.querySelectorAll('.form-overlay').forEach(el=>{el.onclick=e=>{if(e.target===el)closeForm(el.id);};});}
function statusLabel(s){return{besamt:'Besamt',tragend:'Trächtig',leer:'Leer',kalbung:'Gekälbert'}[s]||s;}
function isoDate(d){return d.toISOString().split('T')[0];}
function parseTable(text){if(!text)return null;const lines=text.trim().split(/\r?\n/).filter(l=>l.trim());if(lines.length<2)return null;const sep=lines[0].includes('\t')?'\t':lines[0].includes(';')?';':',';const hdr=lines[0].split(sep).map(h=>h.trim().toLowerCase());const iN=hdr.findIndex(h=>/nr|num|ohr|marke|id/.test(h));const iK=hdr.findIndex(h=>/kuh|tier|name/.test(h));const iB=hdr.findIndex(h=>/bauer|landwirt|besitz|owner/.test(h));const iR=hdr.findIndex(h=>/rasse|breed/.test(h));if(iN<0)return null;return lines.slice(1).map(l=>{const c=l.split(sep).map(x=>x.trim());return{nr:c[iN]||'',name:iK>=0?c[iK]||'':'',bauer:iB>=0?c[iB]||'':'',rasse:iR>=0?c[iR]||':''};}).filter(r=>r.nr);}
function registerSW(){if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});}
function requestNotificationPermission(){if('Notification' in window&&Notification.permission==='default')Notification.requestPermission();}
function checkWartezeiten(){const h=Date.now();const f=Object.entries(behandlungen).filter(([,b])=>b.wartezeitEnde&&b.wartezeitEnde<=h&&!b.warteAbgeschlossen).map(([id,b])=>({id,medikament:b.medikament||'Medikament',kuhNr:kuehe[b.kuhId]?.nr||b.kuhId,kuhName:kuehe[b.kuhId]?.name||''}));if(f.length&&'serviceWorker' in navigator)navigator.serviceWorker.ready.then(sw=>sw.active?.postMessage({type:'CHECK_WARTEZEITEN',faellig:f}));}
