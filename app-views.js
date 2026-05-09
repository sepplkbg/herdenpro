// HerdenPro – modulare Zerlegung – TEIL 2: Views & Module (Dashboard, Kuh-Detail, Actions, Utils, Kalender, Behandlung, Weide, Stallplan, Backup, Chat, Kraftfutter, Medikament Autocomplete). Reihenfolge in index.html: app-core.js → app-views.js → app-features.js
// Klassische Scripts (kein type=module): teilen sich denselben globalen Lexical Environment.

// ══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
// Käse module stub - assigned to window for global access
window.renderKaese = function() {
  return `<div class="page-header"><h2>🧀 Käseproduktion</h2></div>
    <div id="kp-container" style="padding:0"></div>`;
};

function renderDashboard() {
  const heute = Date.now();
  const morgen = heute + 86400000;
  const kuhListe = Object.values(kuehe);
  const kueheOben = kuhListe.filter(k => k.almStatus === 'oben');
  
  // Alerts: Wartezeiten
  const wzAlerts = [];
  Object.entries(behandlungen).forEach(([id,b]) => {
    const k = kuehe[b.kuhId];
    if(!b.aktiv) return;
    const bZeit = b.behandlungZeit || 'morgen'; // morgen oder abend

    if(b.wzMilchEnde) {
      const endeDate = new Date(b.wzMilchEnde);
      const endeTag = new Date(b.wzMilchEnde); endeTag.setHours(0,0,0,0);
      const heuteTag = new Date(heute); heuteTag.setHours(0,0,0,0);
      const diff = Math.round((endeTag.getTime() - heuteTag.getTime()) / 86400000);
      // Read slot from stored timestamp (03:00=morgens, 16:00=abends), fallback to behandlungZeit
      const slot = endeDate.getHours() < 12 ? 'morgens' : 'abends';
      let color, text;
      if(diff < 0) { color='red'; text='WZ Milch vorbei'; }
      else if(diff === 0) { color='red'; text='WZ Milch endet heute '+slot; }
      else if(diff === 1) { color='orange'; text='WZ Milch endet morgen '+slot; }
      else { color='yellow'; text='WZ Milch noch '+diff+' Tage (endet '+slot+')'; }
      wzAlerts.push({type:'wz', kuh:k, text, id, color});
    }
    if(b.wzFleischEnde) {
      const endeDate = new Date(b.wzFleischEnde);
      const endeTag = new Date(b.wzFleischEnde); endeTag.setHours(0,0,0,0);
      const heuteTag = new Date(heute); heuteTag.setHours(0,0,0,0);
      const diff = Math.round((endeTag.getTime() - heuteTag.getTime()) / 86400000);
      const slot = endeDate.getHours() < 12 ? 'morgens' : 'abends';
      let color, text;
      if(diff < 0) { color='red'; text='WZ Fleisch vorbei'; }
      else if(diff === 0) { color='red'; text='WZ Fleisch endet heute '+slot; }
      else if(diff === 1) { color='orange'; text='WZ Fleisch endet morgen '+slot; }
      else { color='yellow'; text='WZ Fleisch noch '+diff+' Tage (endet '+slot+')'; }
      wzAlerts.push({type:'wz', kuh:k, text, id, color});
    }
    if(b.folgeTermin && b.folgeTermin >= heute && b.folgeTermin <= morgen + 86400000) {
      wzAlerts.push({type:'termin', kuh:k, text:'Folgetermin heute/morgen', id, color:'orange'});
    }
  });

  // Trächtige mit baldiger Geburt
  const gebAlerts = [];
  // Brunst-Kontrolle: Tag 19-23 nach Besamung (Status unbekannt oder tragend noch nicht bestätigt)
  const brunstAlerts = [];
  Object.entries(besamungen).forEach(([id,bs]) => {
    const k = kuehe[bs.kuhId];
    if(bs.status==='tragend' && bs.erwartetGeburt) {
      const diff = Math.floor((bs.erwartetGeburt - heute) / 86400000);
      if(diff <= 14) gebAlerts.push({kuh:k, diff, id});
    }
    // Brunst-Fenster: nur wenn Status nicht bereits bestätigt tragend
    if(bs.status !== 'tragend' && bs.datum) {
      const tagSeit = Math.floor((heute - bs.datum) / 86400000);
      if(tagSeit >= 19 && tagSeit <= 23) {
        brunstAlerts.push({kuh:k, tag:tagSeit, id});
      }
    }
  });

  // Letzte Milch heute
  const heuteMilch = Object.values(milchEintraege).filter(m => {
    const d = new Date(m.datum);
    const h = new Date(heute);
    return d.getDate()===h.getDate() && d.getMonth()===h.getMonth() && d.getFullYear()===h.getFullYear();
  });
  const heuteMilchL = heuteMilch.reduce((s,m)=>s+(m.gesamt||0),0);
  const heuteMorgens = heuteMilch.filter(m=>m.zeit==='morgen').length > 0;
  const heuteAbends = heuteMilch.filter(m=>m.zeit==='abend').length > 0;

  // Tränke: heute noch nicht kontrolliert (nur wenn Verlauf vorhanden)
  const traenkeHeute = Object.values(traenkeLog).some(t=>t.datum===new Date(heute).toISOString().slice(0,10));
  const traenkeVerlaufLen = Object.keys(traenkeLog).length;

  // Wetter state
  const wetter = window._wetterData;

  // ── Heute-Übersicht (Phase A6) ──────────────────────────────────
  const aktiveBeh = Object.values(behandlungen).filter(b=>b.aktiv);
  const behHeuteFaellig = aktiveBeh.filter(b => {
    if(!b.folgeTermin) return false;
    const t = new Date(b.folgeTermin); t.setHours(0,0,0,0);
    const h = new Date(heute); h.setHours(0,0,0,0);
    return t.getTime() <= h.getTime();
  }).length;
  const milchSchnittHeute = heuteMilch.length
    ? Math.round((heuteMilchL / kueheOben.length || 0)*10)/10
    : 0;

  // ── Nächste Termine (Phase A6) ──────────────────────────────────
  const naechsteTermine = [];
  // Behandlungs-Folgetermine
  Object.entries(behandlungen).forEach(([bid, b]) => {
    if(!b.aktiv || !b.folgeTermin || b.folgeTermin < heute) return;
    const k = kuehe[b.kuhId];
    naechsteTermine.push({
      ts: b.folgeTermin,
      titel: 'Folgetermin' + (k ? ' #'+k.nr+' '+(k.name||'') : ''),
      icon: '⚕',
      farbe: 'var(--orange)',
      ziel: 'behandlung'
    });
  });
  // Kalender-Termine
  Object.entries(kalenderTermine||{}).forEach(([kid, t]) => {
    if(!t.datum || t.datum < heute) return;
    naechsteTermine.push({
      ts: t.datum,
      titel: t.titel || 'Termin',
      icon: t.icon || '📅',
      farbe: 'var(--gold)',
      ziel: 'kalender'
    });
  });
  naechsteTermine.sort((a,b)=>a.ts-b.ts);
  const top3Termine = naechsteTermine.slice(0,3);

  // ── Mini Saison-Kurve: Milchleistung letzte 7 Tage ─────────────
  function tagesMilch(ts) {
    const tagStart = new Date(ts); tagStart.setHours(0,0,0,0);
    const tagEnde = tagStart.getTime() + 86400000;
    return Object.values(milchEintraege)
      .filter(m => m.datum >= tagStart.getTime() && m.datum < tagEnde)
      .reduce((s,m)=>s+(m.gesamt||0),0);
  }
  const last7 = [];
  for(let i=6;i>=0;i--){
    const ts = heute - i*86400000;
    last7.push({ ts, l: tagesMilch(ts) });
  }
  const last7Max = Math.max(...last7.map(d=>d.l), 1);
  const last7Trend = last7[6].l - last7[0].l;

  return `
    <!-- Saison Banner -->
    ${saisonInfo?.aktiv ? `
    <div style="background:linear-gradient(135deg,rgba(77,184,78,.15),rgba(77,184,78,.05));border:1px solid rgba(77,184,78,.3);border-radius:var(--radius-sm);padding:.6rem 1rem;margin-bottom:.8rem;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:.7rem;color:var(--green);letter-spacing:.05em">▲ SAISON AKTIV</div>
        <div style="font-size:.85rem;color:var(--text)">${saisonInfo.alm||'Alm'} · Tag ${Math.floor((heute-(saisonInfo.auftriebDatum||heute))/86400000)+1}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:1.1rem;color:var(--gold);font-weight:bold">${kueheOben.length}/${kuhListe.length}</div>
        <div style="font-size:.68rem;color:var(--text3)">oben</div>
      </div>
    </div>` : ''}

    <!-- Wetter Card -->
    <div id="dashboard-wetter" style="margin-bottom:.8rem">
      ${wetter ? `
      <div style="background:linear-gradient(135deg,rgba(30,80,140,.25),rgba(30,80,140,.1));border:1px solid rgba(80,140,200,.3);border-radius:var(--radius-sm);padding:.6rem 1rem;display:flex;align-items:center;gap:.8rem;cursor:pointer" onclick="navigate('wetter')">
        <div style="font-size:2rem">${wetter.icon}</div>
        <div style="flex:1">
          <div style="font-size:1.1rem;color:#7acbff;font-weight:bold">${wetter.temp}°C <span style="font-size:.75rem;color:var(--text3)">${wetter.desc}</span></div>
          <div style="font-size:.7rem;color:var(--text3)">${wetter.ort} · Gefühlt ${wetter.feels}°C · Wind ${wetter.wind} km/h</div>
        </div>
        <div style="text-align:right;font-size:.7rem;color:var(--text3)">${wetter.updated}</div>
      </div>` : `
      <div style="background:rgba(30,80,140,.1);border:1px solid rgba(80,140,200,.2);border-radius:var(--radius-sm);padding:.5rem 1rem;display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="ladeWetter()">
        <span style="font-size:.8rem;color:var(--text3)">⛅ Wetter laden…</span>
        <button class="btn-xs" onclick="event.stopPropagation();ladeWetter()">Aktualisieren</button>
      </div>`}
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid" style="margin-bottom:.8rem">
      <div class="stat-card" onclick="navigate('herde')" style="cursor:pointer">
        <div class="stat-icon">🐄</div>
        <div class="stat-num">${kuhListe.length}</div>
        <div class="stat-label">Kühe</div>
      </div>
      <div class="stat-card ${wzAlerts.length?'stat-warn':''}" onclick="navigate('behandlung')" style="cursor:pointer">
        <div class="stat-icon">⚕</div>
        <div class="stat-num">${Object.values(behandlungen).filter(b=>b.aktiv).length}</div>
        <div class="stat-label">Behandlung</div>
      </div>
      <div class="stat-card" onclick="navigate('milch')" style="cursor:pointer">
        <div class="stat-icon">🥛</div>
        <div class="stat-num">${heuteMilchL>0?Math.round(heuteMilchL)+'L':'–'}</div>
        <div class="stat-label">Heute</div>
      </div>
      <div class="stat-card" onclick="navigate('zaehlung')" style="cursor:pointer">
        <div class="stat-icon">✓</div>
        <div class="stat-num">${kueheOben.length}</div>
        <div class="stat-label">Heute Weide</div>
      </div>
    </div>

    <!-- Heute-Übersicht (Phase A6) -->
    <div style="background:linear-gradient(135deg,rgba(212,168,75,.07),rgba(212,168,75,.02));border:1px solid rgba(212,168,75,.18);border-radius:var(--radius-sm);padding:.7rem .9rem;margin-bottom:.8rem;display:flex;gap:.8rem;align-items:center;flex-wrap:wrap">
      <div style="font-size:.68rem;color:var(--gold);letter-spacing:.06em;font-weight:600;flex:0 0 auto">▸ HEUTE</div>
      <div style="flex:1;min-width:0;display:flex;gap:.9rem;flex-wrap:wrap;font-size:.78rem;color:var(--text2)">
        <span><b style="color:${behHeuteFaellig?'var(--orange)':'var(--text)'}">${behHeuteFaellig}</b> Behandl. fällig</span>
        <span><b style="color:var(--text)">${kueheOben.length}/${kuhListe.length}</b> oben</span>
        ${heuteMilch.length ? `<span><b style="color:var(--gold)">${milchSchnittHeute}L</b> Ø/Kuh</span>` : `<span style="color:var(--text3)">Keine Milch heute</span>`}
        <span style="color:var(--text3)">${heuteMorgens?'☀':'·'} ${heuteAbends?'🌙':'·'}</span>
      </div>
    </div>

    <!-- Brunst-Kontrolle Tag 19-23 -->
    ${brunstAlerts.length ? `
    <div style="margin-bottom:.8rem">
      <div class="section-title">🔁 Brunst-Kontrolle</div>
      ${brunstAlerts.map(a=>`
      <div style="background:rgba(160,80,200,.1);border:1px solid rgba(160,80,200,.35);border-radius:var(--radius-sm);padding:.5rem .8rem;margin-bottom:.3rem;display:flex;align-items:center;gap:.6rem;cursor:pointer" onclick="navigate('besamung')">
        <span style="font-size:1rem">🐄</span>
        <div style="flex:1">
          <div style="font-size:.82rem;color:var(--text)">#${a.kuh?.nr||'?'} ${a.kuh?.name||'–'}</div>
          <div style="font-size:.72rem;color:#c080e8">Tag ${a.tag} nach Besamung · Brunst beobachten</div>
        </div>
      </div>`).join('')}
    </div>` : ''}

    <!-- Wartezeit Alerts -->
    ${wzAlerts.length ? `
    <div style="margin-bottom:.8rem">
      <div class="section-title">⚠ Wartezeiten</div>
      ${wzAlerts.slice(0,6).map(a=>{
        const rgb = a.color==='red'?'200,60,60':a.color==='orange'?'200,120,0':'160,140,0';
        const col = a.color==='red'?'var(--red)':a.color==='orange'?'var(--orange)':'#b8a800';
        return `<div style="background:rgba(${rgb},.1);border:1px solid rgba(${rgb},.3);border-radius:var(--radius-sm);padding:.5rem .8rem;margin-bottom:.3rem;display:flex;align-items:center;gap:.6rem;cursor:pointer" onclick="navigate('behandlung')">
          <span style="font-size:.85rem;color:${col}">⚕</span>
          <div style="flex:1">
            <div style="font-size:.82rem;color:var(--text)">#${a.kuh?.nr||'?'} ${a.kuh?.name||'–'}</div>
            <div style="font-size:.72rem;color:${col}">${a.text}</div>
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}

    <!-- Geburten bald -->
    ${gebAlerts.length ? `
    <div style="margin-bottom:.8rem">
      <div class="section-title">🐮 Baldige Geburten</div>
      ${gebAlerts.map(a=>`
      <div style="background:rgba(77,184,78,.08);border:1px solid rgba(77,184,78,.2);border-radius:var(--radius-sm);padding:.5rem .8rem;margin-bottom:.3rem">
        <span style="font-size:.85rem">#${a.kuh?.nr||'?'} ${a.kuh?.name||'–'}</span>
        <span style="font-size:.75rem;color:var(--text3)"> · ${a.diff<=0?'überfällig!':a.diff===1?'morgen':'in '+a.diff+' Tagen'}</span>
      </div>`).join('')}
    </div>` : ''}

    ${wzAlerts.length===0 && gebAlerts.length===0 && brunstAlerts.length===0 ? '<div style="text-align:center;color:var(--text3);font-size:.8rem;padding:.5rem">✓ Keine offenen Aktionen</div>' : ''}

    <!-- Tränke nicht kontrolliert -->
    ${!traenkeHeute && traenkeVerlaufLen > 0 ? `
    <div style="background:rgba(74,138,184,.08);border:1px solid rgba(74,138,184,.25);border-radius:var(--radius-sm);padding:.5rem .8rem;margin-top:.4rem;cursor:pointer" onclick="navigate('traenke')">
      <div style="font-size:.78rem;color:#6ab4e0">💧 Tränke heute noch nicht kontrolliert</div>
    </div>` : ''}

    <!-- Milch-Warnungen (aus letzter Erfassung) -->
    ${(()=>{
      try {
        const mw = JSON.parse(localStorage.getItem('milchWarnungen')||'null');
        if(!mw || !mw.warnungen || !mw.warnungen.length) return '';
        const heute2 = new Date(); heute2.setHours(0,0,0,0);
        const warnTag = new Date(mw.datum); warnTag.setHours(0,0,0,0);
        if(warnTag.getTime() < heute2.getTime()) return ''; // nur heute
        return `<div style="margin-top:.4rem">
          <div class="section-title" style="color:#4ab8e8">🥛 Auffällige Milchwerte (letzte Erfassung)</div>
          ${mw.warnungen.map(w=>`
          <div style="background:rgba(${w.typ==='wenig'?'200,120,0':'74,184,232'},.08);border:1px solid rgba(${w.typ==='wenig'?'200,120,0':'74,184,232'},.25);border-radius:var(--radius-sm);padding:.4rem .7rem;margin-bottom:.25rem;cursor:pointer" onclick="navigate('milch')">
            <span style="font-size:.78rem;color:${w.typ==='wenig'?'var(--orange)':'#4ab8e8'}">
              ${w.typ==='wenig'?'⚠ Zu wenig':'⬆ Ungewöhnlich viel'} – #${w.kuhNr} ${w.kuhName}: ${w.liter}L (Ø ${Math.round(w.schnitt*10)/10}L)
            </span>
          </div>`).join('')}
        </div>`;
      } catch(e){ return ''; }
    })()}

    <!-- Nächste Termine (Phase A6) -->
    ${top3Termine.length ? `
    <div style="margin-top:1rem">
      <div class="section-title">📅 Nächste Termine</div>
      ${top3Termine.map(t => {
        const d = new Date(t.ts);
        const heuteTag = new Date(heute); heuteTag.setHours(0,0,0,0);
        const tTag = new Date(t.ts); tTag.setHours(0,0,0,0);
        const tageHin = Math.round((tTag.getTime()-heuteTag.getTime())/86400000);
        const wann = tageHin===0 ? 'Heute' : tageHin===1 ? 'Morgen' : tageHin<7 ? 'in '+tageHin+' Tagen' : d.toLocaleDateString('de-AT',{weekday:'short',day:'numeric',month:'short'});
        return `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.55rem .8rem;margin-bottom:.35rem;display:flex;align-items:center;gap:.7rem;cursor:pointer" onclick="navigate('${t.ziel}')">
          <span style="font-size:1.1rem">${t.icon}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:.83rem;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.titel}</div>
            <div style="font-size:.7rem;color:${t.farbe}">${wann}</div>
          </div>
          <span class="chevron" style="color:var(--text3)">›</span>
        </div>`;
      }).join('')}
    </div>` : ''}

    <!-- Mini Saison-Kurve: Milchleistung letzte 7 Tage (Phase A6) -->
    ${last7.some(d=>d.l>0) ? `
    <div style="background:linear-gradient(135deg,rgba(74,184,232,.06),rgba(74,184,232,.01));border:1px solid rgba(74,184,232,.18);border-radius:var(--radius-sm);padding:.7rem .9rem;margin-top:1rem;cursor:pointer" onclick="navigate('milch')">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.5rem">
        <div style="font-size:.7rem;color:#7acbff;letter-spacing:.06em;font-weight:600">📈 MILCH 7 TAGE</div>
        <div style="font-size:.74rem;color:${last7Trend>=0?'var(--green)':'var(--orange)'}">
          ${last7Trend>=0?'↗':'↘'} ${last7Trend>=0?'+':''}${Math.round(last7Trend)}L
        </div>
      </div>
      <div style="display:flex;align-items:flex-end;gap:4px;height:42px">
        ${last7.map((d,i) => {
          const pct = last7Max ? Math.max(4, Math.round(d.l/last7Max*100)) : 4;
          const istHeute = i===6;
          const datum = new Date(d.ts);
          const tag = ['So','Mo','Di','Mi','Do','Fr','Sa'][datum.getDay()];
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
            <div style="width:100%;background:linear-gradient(180deg,${istHeute?'#7acbff':'#4a88b8'},rgba(74,184,232,.2));height:${pct}%;border-radius:3px 3px 0 0;${istHeute?'box-shadow:0 0 8px rgba(122,203,255,.5)':''}" title="${d.l}L"></div>
            <div style="font-size:.6rem;color:${istHeute?'var(--gold)':'var(--text3)'};font-weight:${istHeute?'700':'400'}">${tag}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}
  `;
}
function renderHerde() {
  const sortBy = window._herdeSortBy || 'nr';
  const bauernListe = Object.entries(bauern);

  // Sortierlogik
  const sortFn = {
    nr:     (a,b) => (parseInt(a[1].nr)||0)-(parseInt(b[1].nr)||0),
    name:   (a,b) => (a[1].name||'').localeCompare(b[1].name||'', 'de'),
    bauer:  (a,b) => (a[1].bauer||'').localeCompare(b[1].bauer||'', 'de') || (parseInt(a[1].nr)||0)-(parseInt(b[1].nr)||0),
    gruppe: (a,b) => (a[1].gruppe||'').localeCompare(b[1].gruppe||'', 'de') || (parseInt(a[1].nr)||0)-(parseInt(b[1].nr)||0),
    status: (a,b) => {
      const ord = {oben:0, vorzeitig:1, unten:2};
      const sa = ord[a[1].almStatus]??2, sb = ord[b[1].almStatus]??2;
      return sa-sb || (parseInt(a[1].nr)||0)-(parseInt(b[1].nr)||0);
    },
  };
  const liste = Object.entries(kuehe).sort(sortFn[sortBy]||sortFn.nr);

  const sortLabels = {nr:'# Nr', name:'A-Z', bauer:'Bauer', gruppe:'Gruppe', status:'Status'};

  return `
    <div class="page-header"><h2>🐄 Herde (${liste.length})</h2><div style="display:flex;gap:.5rem"><button class="btn-ghost" onclick="druckeHerde()" title="Drucken">🖨</button><button class="btn-ghost" onclick="importCSVDialog()">📥</button><button class="btn-primary" onclick="showKuhForm()">+ Kuh</button></div></div>
    <div class="search-bar"><input id="kuh-search" class="search-inp" placeholder="Suche Nr, Name, Bauer…" oninput="filterKuehe(this.value)" /></div>

    <!-- Sortier-Chips -->
    <div style="display:flex;gap:.3rem;flex-wrap:wrap;margin-bottom:.4rem;align-items:center">
      <span style="font-size:.68rem;color:var(--text3);white-space:nowrap">Sortierung:</span>
      ${Object.entries(sortLabels).map(([key,label])=>`
        <button class="filter-chip ${sortBy===key?'active':''}" onclick="window._herdeSortBy='${key}';render()" style="font-size:.72rem">${label}</button>
      `).join('')}
    </div>

    <!-- Filter-Chips -->
    ${(bauernListe.length||Object.keys(gruppen).length)?`
    <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.6rem">
      <button class="filter-chip active" onclick="filterHerde('',this)">Alle</button>
      ${bauernListe.map(([,b])=>`<button class="filter-chip" onclick="filterHerde('bauer:${b.name}',this)">${b.name}</button>`).join('')}
      ${Object.values(gruppen).sort((a,b)=>a.name?.localeCompare(b.name)).map(g=>`<button class="filter-chip" onclick="filterHerde('gruppe:${g.name}',this)">🏷 ${g.name}</button>`).join('')}
      ${Object.values(kuehe).some(k=>k.bio)?`<button class="filter-chip" onclick="filterHerde('bio',this)" style="border-color:rgba(77,184,78,.4)">🌿 Bio</button>`:''}
    </div>`:''}

    <!-- Gruppe/Status Trenner wenn entsprechend sortiert -->
    <div class="card-list" id="kuh-list">
      ${liste.length ? (() => {
        let lastGroup = null;
        return liste.map(([id,k]) => {
          let groupHeader = '';
          const groupKey = sortBy==='bauer'?(k.bauer||'Ohne Bauer'):sortBy==='gruppe'?(k.gruppe||'Ohne Gruppe'):sortBy==='status'?({oben:'⛰ Auf der Alm',vorzeitig:'⚠ Vorzeitig abgetrieben',unten:'🏠 Unten'}[k.almStatus]||'🏠 Unten'):null;
          if(groupKey && groupKey !== lastGroup) {
            lastGroup = groupKey;
            groupHeader = `<div style="font-size:.7rem;font-weight:700;color:var(--text3);letter-spacing:.06em;padding:.5rem 0 .2rem;border-top:1px solid var(--border);margin-top:.2rem">${groupKey}</div>`;
          }
          return groupHeader + `<div class="list-card" data-bauer="${k.bauer||''}" data-gruppe="${k.gruppe||''}" data-bio="${k.bio?'1':'0'}" onclick="showKuhDetail('${id}')">
            <div class="list-card-left">
              <span class="nr-badge">#${k.nr}</span>
              <div>
                <div class="list-card-title">${k.name||'–'} ${k.almStatus==='oben'?'<span class="tag tag-green" style="font-size:.6rem">⛰</span>':''}</div>
                <div class="list-card-sub">${k.bauer||''} ${k.rasse?'· '+k.rasse:''} ${k.gruppe?'· '+k.gruppe:''} ${k.ohrmarke?'· '+k.ohrmarke:''}</div>
                ${k.laktation?`<div style="font-size:.65rem;color:var(--text3)">${{melkend:'🥛',trocken:'💧',tragend:'🐄',jung:'🌱',trockengestellt:'⏸'}[k.laktation]||''} ${k.laktation}</div>`:''}
              </div>
            </div>
            <div class="list-card-right">
              ${Object.values(behandlungen).some(b=>b.kuhId===id&&b.aktiv)?'<span class="tag tag-red">⚕</span>':''}
              ${Object.values(besamungen).some(b=>b.kuhId===id&&b.status==='tragend')?'<span class="tag tag-blue">🐮</span>':''}
              <span class="chevron">›</span>
            </div>
          </div>`;
        }).join('');
      })() : `<div class="empty-state">Noch keine Kühe erfasst</div>`}
    </div>
    <div id="csv-import-overlay" class="form-overlay" style="display:none"><div class="form-sheet"><div class="form-header"><h3>Kühe importieren</h3><button class="close-btn" onclick="closeForm('csv-import-overlay')">✕</button></div><div class="form-body"><p class="hint">Excel-Tabelle einfügen. Spalten: Nr · Name · Bauer · Rasse (erste Zeile = Überschrift)</p><textarea id="import-text" class="inp" rows="7" placeholder="Nr&#9;Name&#9;Bauer&#9;Rasse&#10;1&#9;Elsa&#9;Mayr&#9;Fleckvieh"></textarea><div id="import-err" style="color:var(--red);font-size:.78rem"></div><div class="form-actions"><button class="btn-secondary" onclick="closeForm('csv-import-overlay')">Abbrechen</button><button class="btn-primary" onclick="doImport()">Importieren</button></div></div></div></div>
    <div id="kuh-form-overlay" class="form-overlay" style="display:none"><div class="form-sheet"><div class="form-header"><h3 id="kuh-form-title">Kuh erfassen</h3><button class="close-btn" onclick="closeForm('kuh-form-overlay')">✕</button></div><div class="form-body"><label class="inp-label">Kuhnummer * (interne Nr., z.B. 1–90)</label>
          <input id="f-nr" class="inp" placeholder="z.B. 1" inputmode="numeric" />
          <label class="inp-label">Ohrmarkennummer (z.B. AT59 4700 432)</label>
          <input id="f-ohrmarke" class="inp" placeholder="AT59 4700 432" /><input id="f-name" class="inp" placeholder="Kuhname" /><select id="f-bauer" class="inp"><option value="">Bauer wählen</option>${bauernListe.map(([,b])=>`<option value="${b.name}">${b.name}</option>`).join('')}<option value="__neu__">+ Freitext</option></select><input id="f-bauer-text" class="inp" placeholder="Bauer (Freitext)" style="display:none" /><input id="f-rasse" class="inp" placeholder="Rasse" />
          <select id="f-gruppe" class="inp">
            <option value="">Gruppe (optional)</option>
            ${Object.entries(gruppen).sort((a,b)=>a[1].name?.localeCompare(b[1].name)).map(([id,g])=>`<option value="${g.name}">${g.name}</option>`).join('')}
          </select>
          <div class="form-actions"><button class="btn-secondary" onclick="closeForm('kuh-form-overlay')">Abbrechen</button><button class="btn-primary" onclick="saveKuh()">Speichern</button></div></div></div></div>
  `;
}

function renderKuhDetail() {
  const id=editId; const k=kuehe[id];
  if(!k) return '<div class="empty-state">Nicht gefunden</div>';

  const bList   = Object.entries(behandlungen).filter(([,b])=>b.kuhId===id).sort((a,b)=>b[1].datum-a[1].datum);
  const bsList  = Object.entries(besamungen).filter(([,b])=>b.kuhId===id).sort((a,b)=>b[1].datum-a[1].datum);
  const mListAll= Object.entries(milchEintraege).filter(([,m])=>m.prokuh?.[id]).sort((a,b)=>a[1].datum-b[1].datum);
  const mList   = [...mListAll].reverse().slice(0,30);
  const aktBeh  = bList.filter(([,b])=>b.aktiv);
  const archBeh = bList.filter(([,b])=>!b.aktiv);
  const aktiveBs= bsList.find(([,bs])=>bs.status==='tragend'||bs.status==='besamt');
  const heute   = Date.now();

  // Milch-Daten für Chart (alle, chronologisch)
  const chartDaten = mListAll.map(([,m])=>({ l: parseFloat(m.prokuh[id])||0, d: m.datum, z: m.zeit }));
  const chartMax = Math.max(...chartDaten.map(d=>d.l), 1);
  const mGesamt = chartDaten.reduce((s,d)=>s+d.l, 0);
  const mSchnitt = chartDaten.length ? Math.round(mGesamt/chartDaten.length*10)/10 : 0;
  const mZuletzt = chartDaten.length ? chartDaten[chartDaten.length-1].l : null;
  const mTrend = chartDaten.length>=3
    ? chartDaten[chartDaten.length-1].l - chartDaten[chartDaten.length-3].l
    : 0;

  // WZ
  const wzAlerts = aktBeh.filter(([,b])=>b.wzMilchEnde).map(([,b])=>{
    const endeTag=new Date(b.wzMilchEnde);endeTag.setHours(0,0,0,0);
    const heuteTag=new Date(heute);heuteTag.setHours(0,0,0,0);
    return Math.round((endeTag.getTime()-heuteTag.getTime())/86400000);
  }).filter(d=>d>=0);
  const wzMin = wzAlerts.length ? Math.min(...wzAlerts) : null;
  const alpTage = Object.values(weideTage).filter(w=>(w.kuhIds||[]).includes(id)).length;
  const statusColor = k.almStatus==='oben'?'#4db84e':k.almStatus==='vorzeitig'?'#d4844b':'#4e6840';
  const statusText  = k.almStatus==='oben'?'⛰ Auf der Alm':k.almStatus==='vorzeitig'?'⚠ Vorzeitig':'🏠 Unten';

  // Canvas chart data encoded as JSON for JS
  const chartJson = JSON.stringify(chartDaten.slice(-30));

  // ⚠ WICHTIG: Chart-Daten und Draw-Trigger MÜSSEN vor dem return stehen,
  // sonst sind sie unreachable code und der Chart bleibt leer.
  window._kdChartData = chartDaten.slice(-30);
  setTimeout(function(){ window.kdDrawWithRetry && window.kdDrawWithRetry(0); }, 50);

  return `

  <!-- Header -->
  <div class="page-header kd-s1" style="padding-bottom:.4rem">
    <button class="back-btn" onclick="navigate('herde')">‹ Herde</button>
    <div style="display:flex;gap:.35rem">
      <button class="btn-ghost" onclick="showKuhForm('${id}')">✎</button>
      <button class="btn-xs" onclick="showQRCode('${id}','${k.nr}','${(k.name||'').replace(/'/g,'')}')">QR</button>
      <button class="btn-xs-danger" onclick="deleteKuh('${id}')">Löschen</button>
    </div>
  </div>

  <!-- Hero -->
  <div class="kd-hero kd-s2">
    <div style="display:flex;gap:.85rem;align-items:flex-start">
      <div style="position:relative;flex-shrink:0" class="kd-sl">
        ${fotos[id]
          ? `<img src="${fotos[id].data}" class="kd-foto-ring" onclick="showFotoVollbild('${fotos[id].data}','#${k.nr} ${(k.name||'').replace(/'/g,"\\'")}');" style="cursor:zoom-in" />`
          : `<div class="kd-foto-placeholder">🐄</div>`}
        <label style="position:absolute;bottom:-3px;right:-3px;cursor:pointer;background:var(--gold);border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.7rem;box-shadow:0 2px 8px rgba(0,0,0,.4)">
          📷<input type="file" accept="image/*" style="display:none" onchange="uploadFoto('${id}',this)" />
        </label>
      </div>

      <div style="flex:1;min-width:0" class="kd-sr">
        <div class="kd-name">${k.name||'–'}</div>
        <div style="font-size:.8rem;color:var(--text2);margin-top:3px">
          #${k.nr}${k.ohrmarke?` <span style="color:var(--text3);font-size:.72rem">· ${k.ohrmarke}</span>`:''}
        </div>
        <div style="font-size:.74rem;color:var(--text3);margin-top:2px">${[k.bauer,k.rasse,k.gruppe].filter(Boolean).join(' · ')||'–'}</div>

        <div style="display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.45rem;align-items:center">
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:.72rem;padding:3px 9px;border-radius:12px;background:rgba(0,0,0,.25);color:${statusColor};border:1px solid ${statusColor}44">
            <span class="kd-status-dot"></span>${statusText}
          </span>
          ${'melkend trocken tragend jung trockengestellt'.split(' ').includes(k.laktation)?`<span class="tag tag-blue" style="font-size:.68rem">${{melkend:'🥛 Melkend',trocken:'💧 Trocken',tragend:'🐄 Tragend',jung:'🌱 Jungtier',trockengestellt:'⏸ Trockengestellt'}[k.laktation]}</span>`:''}
          ${k.bio
            ? '<span class="tag tag-green" style="font-size:.68rem">🌿 Bio</span>'
            : '<span style="font-size:.68rem;padding:3px 9px;border-radius:12px;background:rgba(100,100,100,.15);color:var(--text3);border:1px solid rgba(100,100,100,.25)">⚙ Konventionell</span>'}
        </div>

        ${wzMin!==null?`<div style="font-size:.72rem;color:var(--orange);margin-top:.35rem;display:flex;align-items:center;gap:4px"><span style="animation:kd-dot 1.2s ease-in-out infinite;display:inline-block;width:7px;height:7px;background:var(--orange);border-radius:50%"></span>⚕ WZ Milch noch ${wzMin} Tage</div>`:''}
        ${k.notiz?`<div style="font-size:.72rem;color:var(--text3);margin-top:.3rem;font-style:italic">${k.notiz}</div>`:''}
      </div>
    </div>

    <!-- Schnellaktionen -->
    <div style="display:flex;gap:.35rem;margin-top:.75rem;flex-wrap:wrap">
      <button class="btn-xs" onclick="showBehandlungForm('${id}')">+ Behandlung</button>
      <button class="btn-xs" onclick="showBesamungForm('${id}')">+ Besamung</button>
      ${(k.almStatus==='oben'||!k.almStatus)?`<button class="btn-xs-danger" onclick="showVorzeitigAbtrieb('${id}')">↓ Abtreiben</button>`:''}
      ${fotos[id]?`<button class="btn-xs-danger" onclick="deleteFoto('${id}')">📷✕</button>`:''}
    </div>
  </div>

  <!-- Stats -->
  <div class="kd-s3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.4rem;margin-bottom:.75rem">
    <div class="kd-stat-card">
      <div class="kd-stat-num d1" style="font-size:1.35rem;font-weight:800;color:var(--gold)">${alpTage}</div>
      <div style="font-size:.6rem;color:var(--text3);margin-top:2px">Weidetage</div>
    </div>
    <div class="kd-stat-card" onclick="document.querySelector('.kd-tab-btn:nth-child(1)')?.click()">
      <div class="kd-stat-num d2" style="font-size:1.35rem;font-weight:800;color:${aktBeh.length?'var(--red)':'var(--text3)'}">${aktBeh.length}</div>
      <div style="font-size:.6rem;color:var(--text3);margin-top:2px">Aktiv Beh.</div>
      ${aktBeh.length?`<div style="width:6px;height:6px;background:var(--red);border-radius:50%;margin:.2rem auto 0;box-shadow:0 0 6px var(--red);animation:kd-dot 1.5s ease-in-out infinite"></div>`:``}
    </div>
    <div class="kd-stat-card" onclick="document.querySelector('.kd-tab-btn:nth-child(2)')?.click()">
      <div class="kd-stat-num d3" style="font-size:1.35rem;font-weight:800;color:${aktiveBs?'var(--green)':'var(--text3)'}">${bsList.length}</div>
      <div style="font-size:.6rem;color:var(--text3);margin-top:2px">Besamungen</div>
    </div>
  </div>

  <!-- Aktive Besamung Banner -->
  ${aktiveBs ? `
  <div class="kd-s4" style="background:linear-gradient(135deg,rgba(77,184,78,.1),rgba(77,184,78,.05));border:1px solid rgba(77,184,78,.35);border-radius:12px;padding:.65rem .85rem;margin-bottom:.75rem;position:relative;overflow:hidden">
    <div style="position:absolute;right:-10px;top:-10px;font-size:2.5rem;opacity:.08;transform:rotate(-15deg)">🐮</div>
    <div style="font-size:.7rem;color:var(--green);font-weight:800;letter-spacing:.06em;margin-bottom:.25rem">${aktiveBs[1].status==='tragend'?'🐮 TRÄCHTIG':'🐮 BESAMT'}</div>
    ${aktiveBs[1].erwartetGeburt?`
    <div style="font-size:.85rem;color:var(--text2)">Geburt erw.: <b style="color:var(--text)">${new Date(aktiveBs[1].erwartetGeburt).toLocaleDateString('de-AT',{day:'numeric',month:'long',year:'numeric'})}</b></div>
    <div style="margin-top:.35rem">
      <div style="font-size:.68rem;color:var(--text3);margin-bottom:3px">noch ${Math.max(0,Math.ceil((aktiveBs[1].erwartetGeburt-heute)/86400000))} Tage</div>
      <div style="height:4px;background:var(--bg);border-radius:2px;overflow:hidden">
        <div style="height:100%;border-radius:2px;background:linear-gradient(90deg,var(--green),#4db84e);animation:kd-bar .9s ease both;width:${Math.min(100,Math.max(2,Math.round((1-(aktiveBs[1].erwartetGeburt-heute)/(280*86400000))*100)))}%"></div>
      </div>
    </div>`:''}
    ${aktiveBs[1].stier?`<div style="font-size:.72rem;color:var(--text3);margin-top:.25rem">🐂 ${aktiveBs[1].stier}</div>`:''}
  </div>` : ''}

  <!-- Tabs -->
  <div class="kd-s5" style="display:flex;border-bottom:1px solid var(--border);margin-bottom:.6rem">
    <button class="kd-tab-btn active" onclick="kdSwitchTab('kd-tab-b',this)">⚕ Behandlung${aktBeh.length?` <span style="background:var(--red);color:#fff;border-radius:50%;width:15px;height:15px;display:inline-flex;align-items:center;justify-content:center;font-size:.58rem;margin-left:2px;vertical-align:middle">${aktBeh.length}</span>`:''}</button>
    <button class="kd-tab-btn" onclick="kdSwitchTab('kd-tab-r',this)">🐮 Besamung${bsList.length?` (${bsList.length})`:''}</button>
    <button class="kd-tab-btn" onclick="kdSwitchTab('kd-tab-m',this)">🥛 Milch${chartDaten.length?` (${chartDaten.length})`:''}</button>
    <button class="kd-tab-btn" onclick="kdSwitchTab('kd-tab-k',this)">🐾 Klauen</button>
  </div>

  <!-- Tab Behandlung -->
  <div id="kd-tab-b" class="kd-s6">
    <button class="btn-primary btn-block" style="margin-bottom:.5rem" onclick="showBehandlungForm('${id}')">+ Behandlung erfassen</button>
    ${aktBeh.length?`
      <div style="font-size:.7rem;font-weight:700;color:var(--red);letter-spacing:.06em;margin-bottom:.3rem;display:flex;align-items:center;gap:.4rem">
        <span style="width:7px;height:7px;background:var(--red);border-radius:50%;box-shadow:0 0 7px var(--red);animation:kd-dot 1.5s infinite"></span>
        AKTIV (${aktBeh.length})
      </div>
      ${aktBeh.map(([bid,b])=>`<div class="kd-beh-aktiv">${behandlungCard(bid,b)}</div>`).join('')}`:''}
    ${archBeh.length?`
      <div style="font-size:.68rem;font-weight:600;color:var(--text3);letter-spacing:.05em;margin:.5rem 0 .25rem">📁 ARCHIV (${archBeh.length})</div>
      ${archBeh.slice(0,8).map(([bid,b])=>`<div class="kd-beh-archiv">${behandlungCard(bid,b)}</div>`).join('')}`:''}
    ${!bList.length?'<div class="empty-state">Keine Behandlungen</div>':''}
  </div>

  <!-- Tab Besamung -->
  <div id="kd-tab-r" style="display:none">
    <div style="display:flex;gap:.35rem;margin-bottom:.7rem">
      <button class="btn-primary" style="flex:1" onclick="showBesamungForm('${id}')">+ Besamung</button>
      ${bsList.length?`<button class="btn-secondary" onclick="showBesamungForm('${id}',true)">↻ 2. Versuch</button>`:''}
    </div>

    ${bsList.length ? `
    <!-- Zusammenfassung -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.35rem;margin-bottom:.8rem">
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.5rem;text-align:center">
        <div style="font-size:1.2rem;font-weight:800;color:var(--gold)">${bsList.length}</div>
        <div style="font-size:.6rem;color:var(--text3)">Versuche</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.5rem;text-align:center">
        <div style="font-size:1.2rem;font-weight:800;color:${aktiveBs?'var(--green)':'var(--text3)'}">
          ${aktiveBs ? (aktiveBs[1].status==='tragend'?'✓':'⏳') : '✗'}
        </div>
        <div style="font-size:.6rem;color:var(--text3)">${aktiveBs?(aktiveBs[1].status==='tragend'?'Trächtig':'Besamt'):'Kein Erfolg'}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.5rem;text-align:center">
        <div style="font-size:1.2rem;font-weight:800;color:var(--text3)">
          ${bsList.filter(([,bs])=>bs.status==='tragend').length}/${bsList.length}
        </div>
        <div style="font-size:.6rem;color:var(--text3)">Erfolgsrate</div>
      </div>
    </div>

    <!-- Zeitstrahl -->
    <div style="font-size:.7rem;font-weight:700;color:var(--text3);letter-spacing:.06em;margin-bottom:.5rem">VERLAUF</div>
    <div style="position:relative;padding-left:20px">
      <!-- Vertikale Linie -->
      <div style="position:absolute;left:7px;top:8px;bottom:8px;width:2px;background:linear-gradient(to bottom,var(--gold),var(--border));border-radius:1px"></div>

      ${bsList.map(([bsid,bs],idx)=>{
        const isLast = idx===bsList.length-1;
        const statusColor = {tragend:'var(--green)',leer:'var(--red)',besamt:'var(--gold)',unbekannt:'var(--text3)'}[bs.status]||'var(--text3)';
        const statusIcon  = {tragend:'✓',leer:'✗',besamt:'⏳',unbekannt:'?'}[bs.status]||'?';
        const statusLabel = {tragend:'Trächtig',leer:'Leer',besamt:'Besamt',unbekannt:'Unbekannt'}[bs.status]||bs.status||'?';
        const diffZuVorherin = idx>0 ? Math.floor((bs.datum-(bsList[idx-1][1].datum))/86400000) : null;

        return `
        <div style="position:relative;margin-bottom:${isLast?'0':'.8rem'}">
          <!-- Punkt auf der Linie -->
          <div style="position:absolute;left:-14px;top:10px;width:14px;height:14px;border-radius:50%;background:${statusColor};border:2px solid var(--bg);box-shadow:0 0 6px ${statusColor}44;z-index:1"></div>

          <!-- Karte -->
          <div style="background:var(--bg3);border:1px solid ${statusColor}44;border-left:3px solid ${statusColor};border-radius:0 10px 10px 0;padding:.55rem .7rem">
            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.3rem">
              <div>
                <span style="font-size:.68rem;font-weight:700;color:var(--text3);letter-spacing:.04em">VERSUCH ${idx+1}</span>
                ${diffZuVorherin!==null?`<span style="font-size:.62rem;color:var(--text3);margin-left:.4rem">(+${diffZuVorherin} Tage)</span>`:''}
              </div>
              <span style="font-size:.7rem;font-weight:700;padding:2px 7px;border-radius:10px;background:${statusColor}18;color:${statusColor}">${statusIcon} ${statusLabel}</span>
            </div>

            <!-- Datum -->
            <div style="font-size:.82rem;font-weight:600;color:var(--text);margin-bottom:.25rem">
              📅 ${new Date(bs.datum).toLocaleDateString('de-AT',{weekday:'short',day:'numeric',month:'long',year:'numeric'})}
            </div>

            <!-- Details -->
            <div style="display:flex;flex-wrap:wrap;gap:.3rem .8rem">
              ${bs.stier?`<div style="font-size:.72rem;color:var(--text2)">🐂 ${bs.stier}</div>`:''}
              ${bs.samen?`<div style="font-size:.72rem;color:var(--text2)">🧬 ${bs.samen}</div>`:''}
              ${bs.besamungstechniker?`<div style="font-size:.72rem;color:var(--text2)">👤 ${bs.besamungstechniker}</div>`:''}
            </div>

            ${bs.status==='tragend'&&bs.erwartetGeburt?`
            <div style="margin-top:.35rem;background:rgba(77,184,78,.08);border-radius:6px;padding:.3rem .5rem">
              <div style="font-size:.72rem;color:var(--green)">🐄 Geburt erwartet: ${new Date(bs.erwartetGeburt).toLocaleDateString('de-AT',{day:'numeric',month:'long',year:'numeric'})}</div>
              ${bs.trockenstell?`<div style="font-size:.68rem;color:var(--blue)">💧 Trockenstellung: ${new Date(bs.trockenstell).toLocaleDateString('de-AT',{day:'numeric',month:'short'})}</div>`:''}
            </div>`:''}

            ${bs.notiz?`<div style="font-size:.72rem;color:var(--text3);font-style:italic;margin-top:.25rem">${bs.notiz}</div>`:''}

            <!-- Aktionen -->
            <div style="display:flex;gap:.3rem;margin-top:.4rem;flex-wrap:wrap">
              <button class="btn-xs" data-bsid="${bsid}" data-kuhid="${id}" onclick="showBesamungForm(this.dataset.kuhid,this.dataset.bsid)">✎</button>
              ${bs.scheinFoto?`<button class="btn-xs" onclick="showFotoPopup('${bs.scheinFoto}','Besamungsschein')">📋 Schein</button>`:''}
              <button class="btn-xs-danger" onclick="deleteBesamung('${bsid}')">✕</button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>` : '<div class="empty-state">Noch keine Besamungen erfasst</div>'}
  </div>

  <!-- Tab Klauen -->
  <div id="kd-tab-k" style="display:none">
    <div style="display:flex;gap:.35rem;margin-bottom:.7rem">
      <button class="btn-primary" style="flex:1" onclick="showKlauenForm('${id}')">+ Klauenpflege erfassen</button>
    </div>
    ${(()=>{
      const klauenListe = Object.entries(klauenpflege||{})
        .filter(([,e])=>e.kuhId===id)
        .sort((a,b)=>b[1].datum-a[1].datum);
      if(!klauenListe.length) return '<div class="empty-state">Noch keine Klauenpflege-Einträge</div>';
      const heute = Date.now();
      return klauenListe.map(([kid,e])=>{
        const naechsterFaellig = e.naechsterTermin && new Date(e.naechsterTermin+'T12:00').getTime();
        const istFaellig = naechsterFaellig && naechsterFaellig <= heute;
        const bald = naechsterFaellig && !istFaellig && (naechsterFaellig-heute) < 14*86400000;
        return `<div class="list-card" style="flex-direction:column;gap:.4rem;align-items:stretch;padding:.65rem .8rem;border-left:3px solid ${istFaellig?'var(--red)':bald?'var(--orange)':'var(--gold)'}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-size:.85rem;font-weight:700;color:var(--gold)">${new Date(e.datum).toLocaleDateString('de-AT',{day:'numeric',month:'long',year:'numeric'})}</div>
              ${e.klauenpfleger?`<div style="font-size:.7rem;color:var(--text3)">👤 ${e.klauenpfleger}</div>`:''}
            </div>
            <div style="display:flex;gap:.3rem">
              <button class="btn-xs-danger" onclick="deleteKlauen('${kid}')">✕</button>
            </div>
          </div>
          ${e.befund?`<div style="font-size:.8rem;color:var(--text2)"><b>Befund:</b> ${e.befund}</div>`:''}
          ${e.behandlung?`<div style="font-size:.8rem;color:var(--text2)"><b>Behandlung:</b> ${e.behandlung}</div>`:''}
          ${e.naechsterTermin?`<div style="font-size:.72rem;color:${istFaellig?'var(--red)':bald?'var(--orange)':'var(--text3)'}">
            📅 Nächster Termin: ${new Date(e.naechsterTermin+'T12:00').toLocaleDateString('de-AT',{day:'numeric',month:'long',year:'numeric'})}
            ${istFaellig?' ⚠ Fällig!':bald?' ⚠ Bald fällig':''}
          </div>`:''}
          ${e.fotoData?`<div style="margin-top:.3rem;position:relative;display:inline-block">
            <img src="${e.fotoData}" style="max-height:100px;max-width:100%;border-radius:8px;object-fit:cover;cursor:zoom-in;border:1px solid var(--border)" onclick="showFotoVollbild('${e.fotoData}','Klaue')" />
            <span style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.5);color:#fff;font-size:.6rem;border-radius:4px;padding:1px 4px">🔍</span>
          </div>`:''}
          ${e.notiz?`<div style="font-size:.72rem;color:var(--text3);font-style:italic">${e.notiz}</div>`:''}
        </div>`;
      }).join('');
    })()}

    <!-- Klauenpflege-Formular -->
    <div id="klauen-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet" style="max-height:92vh;overflow-y:auto">
        <div class="form-header"><h3>🐾 Klauenpflege</h3><button class="close-btn" onclick="closeForm('klauen-overlay')">✕</button></div>
        <div class="form-body">
          <input type="hidden" id="kl-kuh-id" value="${id}" />
          <label class="inp-label">Datum</label>
          <input id="kl-datum" class="inp" type="date" value="${isoDate(new Date())}" />
          <input id="kl-klauenpfleger" class="inp" placeholder="Klauenpfleger / Durchgeführt von" />
          <label class="inp-label">Befund (frei beschreibbar)</label>
          <textarea id="kl-befund" class="inp" rows="3" placeholder="z.B. Mortellaro Stadium M2 rechts hinten, leichte Ballenfäule links vorne…"></textarea>
          <label class="inp-label">Behandlung / Maßnahmen</label>
          <textarea id="kl-behandlung" class="inp" rows="3" placeholder="z.B. Klauenschnitt, Salicylpflaster, Klauenblock links…"></textarea>
          <label class="inp-label">Nächster Termin</label>
          <input id="kl-naechster" class="inp" type="date" />
          <label class="inp-label">Foto (optional)</label>
          <div id="kl-foto-preview" style="display:none;margin-bottom:.4rem">
            <img id="kl-foto-img" style="max-height:120px;border-radius:8px;object-fit:cover;border:1px solid var(--border)" />
          </div>
          <label style="cursor:pointer;display:block;margin-bottom:.4rem">
            <div style="background:var(--bg3);border:1px dashed var(--border);border-radius:8px;padding:.5rem;text-align:center;font-size:.78rem;color:var(--text3)">📷 Foto aufnehmen oder wählen</div>
            <input type="file" accept="image/*" capture="environment" style="display:none" onchange="klauenFotoGewaehlt(this)" />
          </label>
          <input type="hidden" id="kl-foto-data" />
          <textarea id="kl-notiz" class="inp" rows="2" placeholder="Notiz (optional)"></textarea>
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('klauen-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveKlauen()">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Tab Milch -->
  <div id="kd-tab-m" style="display:none">
    ${chartDaten.length>=2 ? `
    <!-- Milch Stats -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.4rem;margin-bottom:.7rem">
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.5rem;text-align:center">
        <div style="font-size:1.1rem;font-weight:800;color:var(--gold);animation:kd-num .5s .1s both">${mZuletzt}L</div>
        <div style="font-size:.6rem;color:var(--text3)">Zuletzt</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.5rem;text-align:center">
        <div style="font-size:1.1rem;font-weight:800;color:#4ab8e8;animation:kd-num .5s .18s both">${mSchnitt}L</div>
        <div style="font-size:.6rem;color:var(--text3)">Ø Leistung</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.5rem;text-align:center">
        <div style="font-size:1.1rem;font-weight:800;color:${mTrend>=0?'var(--green)':'var(--red)'};animation:kd-num .5s .26s both">${mTrend>=0?'+':''}${Math.round(mTrend*10)/10}L</div>
        <div style="font-size:.6rem;color:var(--text3)">Trend</div>
      </div>
    </div>

    <!-- Canvas Chart -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:.7rem .7rem .4rem;margin-bottom:.7rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem">
        <div style="font-size:.68rem;color:var(--text3);font-weight:600;letter-spacing:.05em">📈 MILCHLEISTUNGSVERLAUF</div>
        <button onclick="window._kdPrognose=!window._kdPrognose;kdDrawWithRetry(0)"
          style="font-size:.6rem;background:${window._kdPrognose?'rgba(212,168,75,.2)':'var(--bg2)'};border:1px solid ${window._kdPrognose?'var(--gold)':'var(--border)'};color:${window._kdPrognose?'var(--gold)':'var(--text3)'};border-radius:8px;padding:2px 6px;cursor:pointer">
          ${window._kdPrognose?'✓':'+'} Prognose
        </button>
      </div>
      <canvas id="kd-chart-canvas" height="130"></canvas>
      ${window._kdPrognose?`<div id="kd-prognose-info" style="margin-top:.4rem;padding:.4rem .6rem;background:rgba(212,168,75,.06);border:1px solid rgba(212,168,75,.2);border-radius:8px;font-size:.7rem;color:var(--text3)">Wird berechnet…</div>`:''}

      <div class="kd-chart-label">
        <span>${chartDaten.length?new Date(chartDaten[0].d).toLocaleDateString('de-AT',{day:'numeric',month:'short'}):''}</span>
        <span style="color:var(--gold)">max ${chartMax}L</span>
        <span>${chartDaten.length?new Date(chartDaten[chartDaten.length-1].d).toLocaleDateString('de-AT',{day:'numeric',month:'short'}):''}</span>
      </div>
    </div>

    <!-- Einträge Liste -->
    <div style="font-size:.68rem;color:var(--text3);font-weight:600;letter-spacing:.05em;margin-bottom:.3rem">ALLE EINTRÄGE (${chartDaten.length})</div>
    <div style="max-height:240px;overflow-y:auto">
      ${[...chartDaten].reverse().slice(0,30).map((d,i)=>{
        const pct = Math.round(d.l/chartMax*100);
        return `<div class="kd-milch-row" style="animation:kd-in .25s ${i*.03}s both">
          <div style="min-width:70px">
            <div style="font-size:.78rem;color:var(--text2);font-weight:500">${new Date(d.d).toLocaleDateString('de-AT',{day:'numeric',month:'short'})}</div>
            <div style="font-size:.62rem;color:var(--text3)">${d.z==='morgen'?'🌅':'🌇'} ${d.z==='morgen'?'Morgens':'Abends'}</div>
          </div>
          <div class="kd-milch-bar-wrap">
            <div class="kd-milch-bar" style="width:${pct}%;animation-delay:${i*.04}s"></div>
          </div>
          <div style="min-width:38px;text-align:right;font-size:.85rem;font-weight:700;color:var(--gold)">${d.l}L</div>
        </div>`;
      }).join('')}
    </div>` : '<div class="empty-state">Keine Einzelmilchdaten vorhanden</div>'}
  </div>

  ${behandlungFormHTML(id)}${besamungFormHTML(id)}${kalbungFormHTML()}
  `;
}

// ══════════════════════════════════════════════════════════
//  KUH-DETAIL: Globale Funktionen (innerHTML scripts laufen nicht)
// ══════════════════════════════════════════════════════════

// Tab switch
window.kdSwitchTab = function(tabId, btn) {
  ['kd-tab-b','kd-tab-r','kd-tab-m','kd-tab-k'].forEach(function(id){
    var el=document.getElementById(id);
    if(el) el.style.display=id===tabId?'':'none';
  });
  document.querySelectorAll('.kd-tab-btn').forEach(function(b){b.classList.remove('active');});
  if(btn) btn.classList.add('active');
  if(tabId==='kd-tab-m') window.kdDrawWithRetry(0);
};

// Chart data store
window._kdChartData = null;

// Retry-Zeichnung: versucht bis zu 20x alle 60ms
window.kdDrawWithRetry = function(attempt) {
  attempt = attempt || 0;
  var canvas = document.getElementById('kd-chart-canvas');
  if(!canvas) { if(attempt < 20) setTimeout(function(){ window.kdDrawWithRetry(attempt+1); }, 60); return; }
  var data = window._kdChartData;
  if(!data || data.length < 2) return;
  if(canvas.offsetWidth < 10) { if(attempt < 20) setTimeout(function(){ window.kdDrawWithRetry(attempt+1); }, 60); return; }
  window.drawKdChart();
};

// Canvas Milch Chart (pro Kuh)
window.drawKdChart = function() {
  var canvas = document.getElementById('kd-chart-canvas');
  if(!canvas) return;
  var data = window._kdChartData;
  if(!data || data.length < 2) {
    if(canvas.width > 0) canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
    return;
  }
  var W = canvas.offsetWidth;
  if(W < 10) return;

  // ── Prognose berechnen ──
  var zeigPrognose = window._kdPrognose;
  var progPts = [];
  if(zeigPrognose && data.length >= 4) {
    var n=data.length, sumX=0,sumY=0,sumXY=0,sumX2=0;
    data.forEach(function(d,i){sumX+=i;sumY+=d.l;sumXY+=i*d.l;sumX2+=i*i;});
    var slope=(n*sumXY-sumX*sumY)/(n*sumX2-sumX*sumX);
    var intercept=(sumY-slope*sumX)/n;
    for(var j=1;j<=30;j++){
      progPts.push({l:Math.max(0,Math.round((intercept+slope*(n-1+j))*10)/10), istPrognose:true});
    }
    var trend=slope>0.05?'📈 Steigend':slope<-0.05?'📉 Sinkend':'➡ Stabil';
    setTimeout(function(){
      var el=document.getElementById('kd-prognose-info');
      if(el) el.innerHTML=
        'In 14 Tagen: <b style="color:var(--gold)">~'+progPts[13].l+'L</b> · '+
        'In 30 Tagen: <b style="color:var(--gold)">~'+progPts[29].l+'L</b> · Trend: <b>'+trend+'</b>';
    },50);
  }

  var allData = zeigPrognose ? data.concat(progPts) : data;
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio||1;
  var H = 130;
  canvas.width = W*dpr; canvas.height = H*dpr;
  ctx.scale(dpr,dpr);
  var pad = {t:12,r:8,b:8,l:30};
  var gW = W-pad.l-pad.r, gH = H-pad.t-pad.b;
  var maxV = Math.max.apply(null, allData.map(function(d){return d.l;}));
  maxV = Math.max(maxV, 1);
  var minV = Math.min.apply(null, data.map(function(d){return d.l;}));
  minV = Math.min(minV, 0);
  var range = maxV-minV||1;
  var totalN = allData.length;

  var pts = data.map(function(d,i){return {
    x: pad.l + i*(gW/(totalN-1)),
    y: pad.t + gH - ((d.l-minV)/range)*gH,
    l: d.l, z: d.z, istPrognose: false
  };});
  var pPts = progPts.map(function(d,j){return {
    x: pad.l + (data.length+j)*(gW/(totalN-1)),
    y: pad.t + gH - ((d.l-minV)/range)*gH,
    l: d.l, istPrognose: true
  };});

  // Grid
  [0.25,0.5,0.75,1].forEach(function(f){
    var y=pad.t+gH*(1-f);
    ctx.strokeStyle='rgba(255,255,255,.05)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+gW,y); ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.28)'; ctx.font='9px sans-serif'; ctx.textAlign='right';
    ctx.fillText(Math.round(minV+range*f)+'L', pad.l-3, y+3);
  });
  // Area
  var grad=ctx.createLinearGradient(0,pad.t,0,pad.t+gH);
  grad.addColorStop(0,'rgba(74,184,232,.3)'); grad.addColorStop(1,'rgba(74,184,232,.02)');
  ctx.beginPath(); ctx.moveTo(pts[0].x,pad.t+gH);
  pts.forEach(function(p){ctx.lineTo(p.x,p.y);});
  ctx.lineTo(pts[pts.length-1].x,pad.t+gH);
  ctx.closePath(); ctx.fillStyle=grad; ctx.fill();
  // Ist-Linie
  ctx.beginPath();
  pts.forEach(function(p,i){if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});
  ctx.strokeStyle='#4ab8e8'; ctx.lineWidth=2.5;
  ctx.lineJoin='round'; ctx.lineCap='round'; ctx.stroke();
  // Prognose-Linie
  if(zeigPrognose && pPts.length) {
    var lastP=pts[pts.length-1];
    ctx.beginPath(); ctx.moveTo(lastP.x,lastP.y);
    pPts.forEach(function(p){ctx.lineTo(p.x,p.y);});
    ctx.strokeStyle='rgba(212,168,75,.8)'; ctx.lineWidth=2;
    ctx.setLineDash([5,4]); ctx.stroke(); ctx.setLineDash([]);
    // Trennlinie
    ctx.strokeStyle='rgba(212,168,75,.3)'; ctx.lineWidth=1;
    ctx.setLineDash([2,3]);
    ctx.beginPath(); ctx.moveTo(lastP.x,pad.t); ctx.lineTo(lastP.x,pad.t+gH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='rgba(212,168,75,.7)'; ctx.font='bold 8px sans-serif'; ctx.textAlign='center';
    ctx.fillText('Prognose', lastP.x+gW*0.12, pad.t+8);
    // Endpunkt
    var ep=pPts[pPts.length-1];
    ctx.beginPath(); ctx.arc(ep.x,ep.y,3,0,Math.PI*2);
    ctx.fillStyle='#d4a84b'; ctx.fill();
  }
  // Dots
  pts.forEach(function(p){
    ctx.beginPath(); ctx.arc(p.x,p.y, p.z==='morgen'?3.5:2.5, 0, Math.PI*2);
    ctx.fillStyle=p.z==='morgen'?'#d4a84b':'#4ab8e8'; ctx.fill();
    if(p.z==='morgen'){ctx.strokeStyle='rgba(212,168,75,.4)';ctx.lineWidth=1;ctx.stroke();}
  });
  // Letzter Punkt
  var lp=pts[pts.length-1];
  ctx.beginPath(); ctx.arc(lp.x,lp.y,6,0,Math.PI*2);
  ctx.fillStyle='rgba(74,184,232,.2)'; ctx.fill();
  ctx.beginPath(); ctx.arc(lp.x,lp.y,3,0,Math.PI*2);
  ctx.fillStyle='#4ab8e8'; ctx.fill();
  // Touch-Tooltip
  var allPts=pts.concat(pPts);
  if(!canvas._kdTouch) {
    canvas._kdTouch = true;
    canvas.addEventListener('touchstart', function(e){
      e.preventDefault();
      var rect=canvas.getBoundingClientRect();
      var tx=(e.touches[0].clientX-rect.left)*(W/rect.width);
      var closest=allPts[0], minD=Infinity;
      allPts.forEach(function(p){var d=Math.abs(p.x-tx);if(d<minD){minD=d;closest=p;}});
      ctx.clearRect(0,0,W,H); window.drawKdChart();
      var tw=54,th=22,tx2=Math.min(W-tw-4,Math.max(4,closest.x-tw/2));
      ctx.fillStyle='rgba(212,168,75,.95)';
      ctx.beginPath();
      if(ctx.roundRect) ctx.roundRect(tx2,closest.y-th-8,tw,th,5);
      else ctx.rect(tx2,closest.y-th-8,tw,th);
      ctx.fill();
      ctx.fillStyle='#0a0800'; ctx.font='bold 11px sans-serif'; ctx.textAlign='center';
      ctx.fillText(closest.l+'L', tx2+tw/2, closest.y-th/2-4);
    }, {passive:false});
  }
};

// After render: receive chart data and draw
window._kdAfterRender = function(chartData) {
  window._kdChartData = typeof chartData === 'string' ? JSON.parse(chartData) : chartData;
  // Draw immediately with double RAF to ensure layout is done
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      window.drawKdChart();
    });
  });
};

// Foto Vollbild mit Pinch-Zoom
window.showFotoVollbild = function(src, name) {
  if(!src) return;
  var existing = document.getElementById('foto-vollbild-ov');
  if(existing) existing.remove();

  var ov = document.createElement('div');
  ov.id = 'foto-vollbild-ov';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.96);display:flex;flex-direction:column;align-items:center;justify-content:center;touch-action:none';

  var img = document.createElement('img');
  img.src = src;
  img.style.cssText = 'max-width:100%;max-height:82vh;border-radius:10px;object-fit:contain;user-select:none;touch-action:none;transform-origin:center center;transition:transform .05s linear';

  var topBar = document.createElement('div');
  topBar.style.cssText = 'position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:.6rem 1rem;background:rgba(0,0,0,.5)';
  topBar.innerHTML =
    '<span style="font-size:.8rem;color:rgba(255,255,255,.6)">' + (name||'Foto') + '</span>' +
    '<div style="display:flex;gap:.5rem">' +
      '<button onclick="downloadFoto()" style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;padding:.3rem .7rem;border-radius:8px;font-size:.75rem;cursor:pointer">⬇ Speichern</button>' +
      '<button onclick="document.getElementById(\'foto-vollbild-ov\').remove()" style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;padding:.3rem .7rem;border-radius:8px;font-size:.75rem;cursor:pointer">✕</button>' +
    '</div>';

  ov.appendChild(topBar);
  ov.appendChild(img);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
  document.body.appendChild(ov);

  // Download helper
  window.downloadFoto = function() {
    var a = document.createElement('a');
    a.href = src;
    a.download = (name||'foto') + '.jpg';
    a.click();
  };

  // ── Pinch-Zoom ──
  var scale = 1, lastScale = 1;
  var translateX = 0, translateY = 0;
  var startX = 0, startY = 0;
  var isPinching = false;
  var lastDist = 0;

  function applyTransform() {
    scale = Math.max(1, Math.min(5, scale));
    if(scale === 1) { translateX = 0; translateY = 0; }
    img.style.transform = 'scale(' + scale + ') translate(' + translateX/scale + 'px,' + translateY/scale + 'px)';
  }

  function getDist(t) {
    var dx = t[0].clientX - t[1].clientX;
    var dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx*dx + dy*dy);
  }

  img.addEventListener('touchstart', function(e) {
    if(e.touches.length === 2) {
      isPinching = true;
      lastDist = getDist(e.touches);
      lastScale = scale;
      e.preventDefault();
    } else if(e.touches.length === 1 && scale > 1) {
      startX = e.touches[0].clientX - translateX;
      startY = e.touches[0].clientY - translateY;
      e.preventDefault();
    }
  }, {passive:false});

  img.addEventListener('touchmove', function(e) {
    if(e.touches.length === 2 && isPinching) {
      var dist = getDist(e.touches);
      scale = lastScale * (dist / lastDist);
      applyTransform();
      e.preventDefault();
    } else if(e.touches.length === 1 && scale > 1) {
      translateX = e.touches[0].clientX - startX;
      translateY = e.touches[0].clientY - startY;
      applyTransform();
      e.preventDefault();
    }
  }, {passive:false});

  img.addEventListener('touchend', function(e) {
    if(e.touches.length < 2) isPinching = false;
    applyTransform(); // clamp
  }, {passive:true});

  // Double-tap to reset
  var lastTap = 0;
  img.addEventListener('touchend', function(e) {
    var now = Date.now();
    if(now - lastTap < 300) {
      scale = 1; translateX = 0; translateY = 0;
      img.style.transition = 'transform .2s ease';
      applyTransform();
      setTimeout(function(){ img.style.transition = 'transform .05s linear'; }, 220);
    }
    lastTap = now;
  }, {passive:true});
};

// Alias – wird von behandlungCard aufgerufen
window.showFotoPopup = window.showFotoVollbild;

window.showQRCode = function(kuhId, nr, name) {
  const url = encodeURIComponent(location.origin + location.pathname + '?kuh=' + kuhId);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${url}`;
  const alm = saisonInfo?.alm || 'Alm';
  showPopupHTML(`
    <div style="text-align:center;padding:.5rem">
      <div style="font-size:1rem;font-weight:bold;color:var(--gold);margin-bottom:.5rem">#${nr} ${name}</div>
      <div style="font-size:.75rem;color:var(--text3);margin-bottom:.8rem">${alm}</div>
      <img src="${qrUrl}" style="width:180px;height:180px;border-radius:10px;border:3px solid var(--gold2)" onerror="this.parentElement.innerHTML='<div style=color:var(--red)>QR-Code benötigt Internet</div>'" />
      <div style="font-size:.68rem;color:var(--text3);margin-top:.6rem">Scannen öffnet direkt das Kuh-Profil</div>
      <button class="btn-secondary" style="width:100%;margin-top:.8rem" onclick="window.print()">🖨 Drucken</button>
      <button class="btn-secondary" style="width:100%;margin-top:.4rem" onclick="closePopup()">Schließen</button>
    </div>
  `);
};

function renderZaehlung() {
  const _zaehG=window._zaehGruppe||'';
  const kuhListe=Object.entries(kuehe)
    .filter(([,k])=>!_zaehG||k.gruppe===_zaehG)
    .sort((a,b)=>{const nA=parseInt(a[1].nr)||0,nB=parseInt(b[1].nr)||0;return nA-nB;});
  const anwesend=zaehlSession?.anwesend||{};
  const total=kuhListe.length;const anwCount=kuhListe.filter(([id])=>anwesend[id]).length;
  const voll=total>0&&anwCount===total;
  const zaehTab=window._zaehTab||'alle';
  return `
    <div class="page-header">
      <h2>✓ Herdenzählung</h2>
      <div style="display:flex;gap:.4rem;align-items:center">
        ${zaehlSession?`<button class="btn-ghost" onclick="resetZaehlung()" title="Reset">↺</button>`:''}
        <button class="btn-ghost" onclick="showChatPopup()" title="Hirten-Chat" style="font-size:1.3rem;padding:.1rem .4rem;position:relative">
          💬<span id="chat-badge-zaehlung" style="display:none;position:absolute;top:-2px;right:-2px;background:var(--red);color:#fff;border-radius:50%;width:14px;height:14px;font-size:.6rem;line-height:14px;text-align:center;font-family:sans-serif">1</span>
        </button>
      </div>
    </div>
    <!-- Gruppen Filter -->
    ${Object.keys(gruppen).length?`
    <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.7rem">
      <button class="filter-chip ${!window._zaehGruppe?'active':''}" onclick="setZaehGruppe('')">Alle</button>
      ${Object.values(gruppen).sort((a,b)=>a.name.localeCompare(b.name)).map(g=>`
        <button class="filter-chip ${window._zaehGruppe===g.name?'active':''}" onclick="setZaehGruppe('${g.name}')">
          <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${g.farbe||'#5ba85c'};margin-right:4px;vertical-align:middle"></span>${g.name}
        </button>`).join('')}
    </div>`:''}
    <div class="zaehlung-status ${voll?'z-voll':''}">
      <div class="z-counts"><span class="z-big">${anwCount}</span><span class="z-sep">/</span><span class="z-total">${total}</span></div>
      ${voll?`<div class="z-voll-msg">✓ Herde vollzählig!</div>`:`<div class="z-fehlt-msg">${total-anwCount} fehlen</div>`}
    </div>
    ${!zaehlSession?`<button class="btn-primary btn-block" onclick="startZaehlung()">Zählung starten</button>`:`
    <div class="zaehlung-eingabe">
      <input id="z-input" class="inp z-inp" placeholder="Nummer eingeben…" onkeydown="if(event.key==='Enter')zaehlKuh(this.value)" autocomplete="off" inputmode="numeric" autofocus />
      <button class="ok-btn" onclick="zaehlKuh(document.getElementById('z-input').value)">✓</button>
    </div>
    <!-- Tabs: Alle / Fehlend / Anwesend -->
    <div style="display:flex;gap:.4rem;margin-bottom:.7rem">
      <button class="filter-chip ${zaehTab==='alle'?'active':''}" onclick="setZaehTab('alle')">Alle (${total})</button>
      <button class="filter-chip ${zaehTab==='fehlend'?'active':''}" style="${zaehTab!=='alle'&&zaehTab!=='fehlend'?'':''}color:${total-anwCount>0?'var(--red)':'inherit'}" onclick="setZaehTab('fehlend')">Fehlen (${total-anwCount})</button>
      <button class="filter-chip ${zaehTab==='anwesend'?'active':''}" onclick="setZaehTab('anwesend')">✓ (${anwCount})</button>
    </div>

    <!-- Suchleiste -->
    <div class="search-bar" style="margin-bottom:.6rem">
      <input id="zaeh-search" class="search-inp" placeholder="Suche Nr, Name, Bauer…" oninput="filterZaehlung(this.value)" />
    </div>
    <!-- Vollständige Liste -->
    <div class="card-list" id="zaeh-list">
      ${kuhListe.map(([id,k])=>{
        const da=!!anwesend[id];
        if(zaehTab==='fehlend'&&da) return '';
        if(zaehTab==='anwesend'&&!da) return '';
        return `<div class="list-card list-card-sm zaeh-item" data-search="${(k.nr+' '+(k.name||'')+' '+(k.bauer||'')).toLowerCase()}" style="border-left:3px solid ${da?'var(--green)':'var(--border)'}">
          <span class="nr-badge">#${k.nr}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:.88rem;color:${da?'var(--text)':'var(--text2)'}">${k.name||'–'}</div>
            <div style="font-size:.7rem;color:var(--text3)">${k.bauer||''} ${k.gruppe?'· '+k.gruppe:''}</div>
          </div>
          ${da
            ? `<span style="color:var(--green);font-size:1rem">✓</span><button class="remove-btn" onclick="entferneZaehlung('${id}')">✕</button>`
            : `<button class="btn-xs" onclick="zaehlKuhById('${id}')">+ erfassen</button>`}
        </div>`;
      }).join('')}
    </div>`}
  `;
}
window.setZaehTab=function(t){window._zaehTab=t;render();};
window.setZaehGruppe=function(g){window._zaehGruppe=g;window._zaehTab='alle';render();};
window.filterZaehlung=function(q){
  document.querySelectorAll('.zaeh-item').forEach(c=>{
    c.style.display=c.dataset.search?.includes(q.toLowerCase())?'':'none';
  });
};

function renderBehandlung() {
  const aktive=Object.entries(behandlungen).filter(([,b])=>b.aktiv).sort((a,b)=>b[1].datum-a[1].datum);
  const archiv=Object.entries(behandlungen).filter(([,b])=>!b.aktiv).sort((a,b)=>b[1].datum-a[1].datum).slice(0,30);
  return `
    <div class="page-header"><h2>⚕ Behandlungen</h2><button class="btn-primary" onclick="showBehandlungForm(null)">+ Neu</button></div>
    
    <!-- Filter Tabs -->
    <div style="display:flex;gap:.4rem;margin-bottom:.8rem">
      <button class="filter-chip active" id="beh-filter-alle" onclick="filterBehandlung('alle',this)">Alle (${aktive.length+archiv.length})</button>
      <button class="filter-chip" id="beh-filter-personal" onclick="filterBehandlung('personal',this)">🌿 Personal</button>
      <button class="filter-chip" id="beh-filter-tierarzt" onclick="filterBehandlung('tierarzt',this)">🩺 Tierarzt</button>
    </div>

    ${aktive.length ? `
    <div style="background:rgba(200,60,60,.06);border:2px solid rgba(200,60,60,.25);border-radius:var(--radius);padding:.6rem;margin-bottom:.8rem">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem">
        <span style="width:10px;height:10px;border-radius:50%;background:var(--red);display:inline-block;box-shadow:0 0 6px var(--red)"></span>
        <span style="font-size:.78rem;font-weight:bold;color:var(--red);letter-spacing:.05em">AKTIVE BEHANDLUNGEN (${aktive.length})</span>
      </div>
      ${aktive.map(([bid,b])=>behandlungCard(bid,b)).join('')}
    </div>` : `
    <div style="background:rgba(77,184,78,.06);border:1px solid rgba(77,184,78,.2);border-radius:var(--radius-sm);padding:.5rem .8rem;margin-bottom:.8rem;font-size:.8rem;color:var(--green)">
      ✓ Keine aktiven Behandlungen
    </div>`}

    ${archiv.length ? `
    <div>
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem">
        <span style="font-size:.72rem;font-weight:bold;color:var(--text3);letter-spacing:.05em">📁 ARCHIV (${archiv.length})</span>
      </div>
      <div style="opacity:.8">
        ${archiv.map(([bid,b])=>behandlungCard(bid,b)).join('')}
      </div>
    </div>` : ''}

    ${!aktive.length&&!archiv.length?'<div class="empty-state">Keine Behandlungen</div>':''}
    ${behandlungFormHTML(null)}
  `;
}

function renderBesamungModule() {
  const traechtig=Object.entries(besamungen).filter(([,b])=>b.status==='tragend').sort((a,b)=>a[1].erwartetGeburt-b[1].erwartetGeburt);
  const andere=Object.entries(besamungen).filter(([,b])=>b.status!=='tragend').sort((a,b)=>b[1].datum-a[1].datum).slice(0,20);
  return `
    <div class="page-header"><h2>🐮 Besamung & Kalbung</h2><button class="btn-primary" onclick="showBesamungForm(null)">+ Besamung</button></div>
    ${traechtig.length?`<div class="section-title">Trächtig (${traechtig.length})</div>${traechtig.map(([id,bs])=>besamungCard(id,bs)).join('')}`:''}
    ${andere.length?`<div class="section-title">Archiv</div>${andere.map(([id,bs])=>besamungCard(id,bs)).join('')}`:''}
    ${!traechtig.length&&!andere.length?'<div class="empty-state">Keine Besamungen</div>':''}
    ${besamungFormHTML(null)}${kalbungFormHTML()}
  `;
}

// ── Card-Helfer ────────────────────────────────────────────────────────────────
function behandlungCard(bid,b){
  const k=kuehe[b.kuhId];const h=Date.now();
  const wzMilchAb=b.wzMilchEnde&&b.wzMilchEnde<=h&&!b.warteAbgeschlossen;
  const wzFleischAb=b.wzFleischEnde&&b.wzFleischEnde<=h&&!b.warteAbgeschlossen;
  const wzAb=wzMilchAb||wzFleischAb;
  // Safe JSON for onclick
  const safeData=JSON.stringify(b).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
  const _behColor = b.behandler==='tierarzt' ? '#3a8fd4' : 'var(--green)';
  const _behIcon = b.behandler==='tierarzt' ? '🩺' : '🌿';
  return`<div class="history-card ${b.aktiv?'history-active':''}" data-behandler="${b.behandler||'personal'}">
  <div class="history-top">
    <span class="history-date">${new Date(b.datum).toLocaleDateString('de-AT')}</span>
    ${b.aktiv?'<span class="tag tag-red">aktiv</span>':''}
    ${wzAb?'<span class="tag tag-red">⚠ WZ!</span>':''}
  </div>
  <div class="history-title">${b.diagnose||b.medikament||'Behandlung'} ${k?`<span style="color:var(--text3);font-size:.75rem">· #${k.nr} ${k.name||''}</span>`:''}</div>
  ${b.medikament?`<div class="history-sub">${b.medikament}${b.dosis?' · '+b.dosis:''}${b.tierarzt?' · Dr.'+b.tierarzt:''}</div>`:''}
  ${b.symptome?`<div class="history-note">${b.symptome}</div>`:''}
  <div style="display:flex;align-items:center;gap:.3rem;margin-top:.3rem;font-size:.72rem;color:${b.behandler==='tierarzt'?'#3a8fd4':'var(--green)'}">
    ${_behIcon} ${b.behandler==='tierarzt'?'Tierarzt':'Almpersonal'}
  </div>
  ${b.fotoData?`<div style="margin-top:.4rem;position:relative;display:inline-block"><img src="${b.fotoData}" style="max-height:120px;max-width:100%;border-radius:8px;object-fit:cover;border:1px solid var(--border);cursor:zoom-in;display:block" onclick="showFotoPopup(behandlungen['${bid}']?.fotoData||'')" title="Antippen zum Vergrößern" /><button onclick="deleteFoto('behandlung','${bid}')" title="Foto löschen" style="position:absolute;top:-6px;right:-6px;background:var(--red);border:none;border-radius:50%;width:20px;height:20px;color:#fff;font-size:.7rem;cursor:pointer;line-height:20px;text-align:center;font-weight:bold">✕</button><span style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.5);color:#fff;font-size:.6rem;border-radius:4px;padding:1px 4px">🔍</span></div>`:''}
  ${b.tazettelData?`<div style="margin-top:.3rem"><div style="font-size:.7rem;color:#3a8fd4;margin-bottom:.2rem">📋 Tierarztzettel</div><div style="position:relative;display:inline-block"><img src="${b.tazettelData}" style="max-width:100%;max-height:120px;border-radius:6px;object-fit:cover;cursor:zoom-in;border:1px solid #3a8fd4" onclick="showFotoPopup(behandlungen['${bid}']?.tazettelData||'')" title="Antippen zum Vergrößern" /><span style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.5);color:#fff;font-size:.6rem;border-radius:4px;padding:1px 4px">🔍</span></div></div>`:''}
  ${b.abgabeDatum?`<div class="history-sub">💊 Abgabe: ${new Date(b.abgabeDatum).toLocaleDateString('de-AT')}</div>`:''}
  ${b.wzMilchEnde?`<div class="wartezeit-bar"><span>🥛 WZ Milch bis ${new Date(b.wzMilchEnde).toLocaleDateString('de-AT')}</span>${wzMilchAb?'<span class="tag tag-red">abgelaufen</span>':'<span class="tag tag-orange">läuft</span>'}</div>`:''}
  ${b.wzFleischEnde?`<div class="wartezeit-bar"><span>🥩 WZ Fleisch bis ${new Date(b.wzFleischEnde).toLocaleDateString('de-AT')}</span>${wzFleischAb?'<span class="tag tag-red">abgelaufen</span>':'<span class="tag tag-orange">läuft</span>'}</div>`:''}
  ${(!b.wzMilchEnde&&!b.wzFleischEnde&&b.wartezeitEnde)?`<div class="wartezeit-bar"><span>WZ bis ${new Date(b.wartezeitEnde).toLocaleDateString('de-AT')}</span>${b.wartezeitEnde<=h?'<span class="tag tag-green">✓</span>':'<span class="tag tag-orange">läuft</span>'}</div>`:''}
  ${b.folgeTermin?`<div class="history-note">📅 Folgetermin: ${new Date(b.folgeTermin).toLocaleDateString('de-AT')}</div>`:''}
  <div style="display:flex;gap:.4rem;margin-top:.5rem;flex-wrap:wrap">
    <button class="btn-xs" onclick="window.editBehandlung('${bid}')">✎ Bearbeiten</button>
    ${wzAb?`<button class="btn-xs" onclick="wartezeitAbschliessen('${bid}')">✓ WZ ok</button>`:''}
    <button class="btn-xs-danger" onclick="deleteBehandlung('${bid}')">löschen</button>
  </div>
</div>`;}
function besamungCard(bsid,bs){
  const k=kuehe[bs.kuhId];
  return`<div class="history-card ${bs.status==='tragend'?'history-active':''}">
  <div class="history-top">
    <span class="history-date">${new Date(bs.datum).toLocaleDateString('de-AT')}</span>
    <span class="tag ${bs.status==='tragend'?'tag-green':bs.status==='kalbung'?'tag-blue':'tag-gray'}">${statusLabel(bs.status)}</span>
    ${bs.erinnerung3w?'<span class="tag tag-orange">🔔</span>':''}
  </div>
  <div class="history-title">${bs.stier||bs.samen||'Besamung'} ${k?`<span style="color:var(--text3);font-size:.75rem">· #${k.nr} ${k.name||''}</span>`:''}</div>
  ${bs.besamungstechniker?`<div class="history-sub">👤 ${bs.besamungstechniker}</div>`:''}
  ${bs.erwartetGeburt?`<div class="history-sub">🐄 Geburt erw.: <b>${new Date(bs.erwartetGeburt).toLocaleDateString('de-AT')}</b></div>`:''}
  ${bs.trockenstell?`<div class="history-sub">💧 Trockenstell: ${new Date(bs.trockenstell).toLocaleDateString('de-AT')}</div>`:''}
  ${bs.kalbDatum?`<div class="history-sub">✓ Kalbung: ${new Date(bs.kalbDatum).toLocaleDateString('de-AT')} · ${bs.kalbGeschlecht||''} ${bs.kalbNr?'#'+bs.kalbNr:''}</div>`:''}
  ${bs.notiz?`<div class="history-note">${bs.notiz}</div>`:''}
  ${bs.scheinFoto?`<div style="margin-top:.3rem"><div style="font-size:.7rem;color:var(--text3);margin-bottom:.2rem">📋 Besamungsschein</div><div style="position:relative;display:inline-block"><img src="${bs.scheinFoto}" style="max-width:100%;max-height:120px;border-radius:6px;object-fit:cover;cursor:zoom-in;border:1px solid var(--border)" onclick="showFotoPopup(besamungen['${bsid}']?.scheinFoto||'')" title="Antippen zum Vergrößern" /><span style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.5);color:#fff;font-size:.6rem;border-radius:4px;padding:1px 4px">🔍</span></div></div>`:''}
  <div style="display:flex;gap:.4rem;margin-top:.5rem;flex-wrap:wrap">
    <button class="btn-xs" onclick="window.editBesamung('${bsid}')">✎ Bearbeiten</button>
    ${bs.status==='tragend'?`<button class="btn-xs" onclick="showKalbungForm('${bsid}','${bs.kuhId}')">🐄 Kalbung</button>`:''}
    <button class="btn-xs-danger" onclick="deleteBesamung('${bsid}')">löschen</button>
  </div>
</div>`;}

function behandlungFormHTML(vorId, editId, editData) {
  const d = editData || {};
  const opts = Object.entries(kuehe).sort((a,b)=>parseInt(a[1].nr)-parseInt(b[1].nr))
    .map(([id,k])=>`<option value="${id}" ${(d.kuhId?d.kuhId===id:id===vorId)?'selected':''}>#${k.nr} ${k.name||''}</option>`).join('');
  const bDatum = d.datum ? isoDate(new Date(d.datum)) : isoDate(new Date());
  const bZeit = d.behandlungZeit || 'morgen';
  return `<div id="behandlung-form-overlay" class="form-overlay" style="display:none">
    <div class="form-sheet">
      <div class="form-header">
        <h3>${editId?'Behandlung bearbeiten':'Behandlung erfassen'}</h3>
        <button class="close-btn" onclick="closeForm('behandlung-form-overlay')">✕</button>
      </div>
      <div class="form-body">
        <input type="hidden" id="b-edit-id" value="${editId||''}" />
        <label class="inp-label">Kuh * (nach oben scrollen zum Auswählen)</label>
        <select id="b-kuh" class="inp" size="1" onfocus="this.scrollIntoView({behavior:'smooth',block:'start'})">${opts.replace('<option value="">','<option value="" selected>')}</select>
        <label class="inp-label">Behandelt am</label>
        <div style="display:grid;grid-template-columns:1fr auto;gap:.5rem;align-items:center">
          <input id="b-datum" class="inp" type="date" value="${bDatum}" oninput="berechneWartezeiten()" />
          <select id="b-behandlung-zeit" class="inp" style="width:auto" onchange="berechneWartezeiten()">
            <option value="morgen" ${bZeit==='morgen'?'selected':''}>🌅 Morgens</option>
            <option value="abend" ${bZeit==='abend'?'selected':''}>🌇 Abends</option>
          </select>
        </div>
        <input id="b-diagnose" class="inp" placeholder="Diagnose" value="${d.diagnose||''}" />
        <input id="b-symptome" class="inp" placeholder="Symptome" value="${d.symptome||''}" />

        <!-- Körpertemperatur -->
        <label class="inp-label">🌡 Körpertemperatur</label>
        <div style="display:flex;gap:.4rem;align-items:center;margin-bottom:.4rem;flex-wrap:wrap">
          <div style="position:relative;flex-shrink:0">
            <input id="b-temperatur" class="inp" type="number" step="0.1" min="35" max="42" inputmode="decimal"
              placeholder="z.B. 38.5" value="${d.temperatur||''}"
              style="width:120px;padding-right:28px"
              oninput="checkFieber(this.value)" />
            <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:.75rem;color:var(--text3);pointer-events:none">°C</span>
          </div>
          <input id="b-temp-uhrzeit" class="inp" type="time" value="${d.tempUhrzeit||''}" style="width:110px" />
          <div id="b-fieber-indikator" style="font-size:.78rem;font-weight:700;display:none"></div>
        </div>
        <!-- Fieberkurve (wenn Verlauf vorhanden) -->
        ${d.temperaturVerlauf && Object.keys(d.temperaturVerlauf).length >= 2 ? `
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.6rem;margin-bottom:.5rem">
          <div style="font-size:.68rem;color:var(--text3);font-weight:700;margin-bottom:.4rem">🌡 FIEBERKURVE</div>
          <canvas id="b-fieber-canvas" height="80" style="width:100%;display:block"></canvas>
          <div style="display:flex;justify-content:space-between;font-size:.6rem;color:var(--text3);margin-top:.2rem">
            <span>${Object.entries(d.temperaturVerlauf).sort((a,b)=>a[1].ts-b[1].ts)[0][1].temp}°C</span>
            <span style="color:${Math.max(...Object.values(d.temperaturVerlauf).map(v=>v.temp))>39.5?'var(--red)':'var(--green)'}">max ${Math.max(...Object.values(d.temperaturVerlauf).map(v=>v.temp))}°C</span>
            <span>${Object.entries(d.temperaturVerlauf).sort((a,b)=>b[1].ts-a[1].ts)[0][1].temp}°C</span>
          </div>
        </div>` : ''}
        <!-- Verlauf-Einträge -->
        ${d.temperaturVerlauf && Object.keys(d.temperaturVerlauf).length ? `
        <div style="margin-bottom:.4rem">
          <div style="font-size:.65rem;color:var(--text3);margin-bottom:.3rem">TEMPERATURVERLAUF</div>
          ${Object.entries(d.temperaturVerlauf).sort((a,b)=>b[1].ts-a[1].ts).slice(0,5).map(([vid,v])=>`
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:.72rem;padding:.2rem 0;border-bottom:1px solid var(--border2)">
              <span style="color:var(--text3)">${new Date(v.ts).toLocaleDateString('de-AT',{day:'numeric',month:'short'})} ${v.zeit||''}</span>
              <span style="font-weight:700;color:${v.temp>39.5?'var(--red)':v.temp>38.5?'var(--orange)':'var(--green)'}">${v.temp}°C${v.temp>39.5?' 🌡':''}${v.notiz?' · '+v.notiz:''}</span>
            </div>`).join('')}
        </div>` : ''}
        <div style="display:flex;gap:.4rem;margin-bottom:.4rem">
          <button id="b-btn-personal" onclick="setBehBehandler('personal',this)"
            style="flex:1;padding:.45rem;border-radius:var(--radius-sm);border:2px solid var(--green);background:var(--green);color:#fff;font-weight:bold;font-family:inherit;font-size:.82rem;cursor:pointer">
            🌿 Almpersonal
          </button>
          <button id="b-btn-tierarzt" onclick="setBehBehandler('tierarzt',this)"
            style="flex:1;padding:.45rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:transparent;color:var(--text3);font-family:inherit;font-size:.82rem;cursor:pointer">
            🩺 Tierarzt
          </button>
        </div>
        <input type="hidden" id="b-behandler" value="${d.behandler||'personal'}" />
        <!-- Medikament Autocomplete -->
        <div style="position:relative">
          <label class="inp-label">Medikament</label>
          <!-- Häufig verwendete Chips -->
          <div id="med-chips" style="display:flex;flex-wrap:wrap;gap:.3rem;margin-bottom:.4rem">
            ${(()=>{
              const counts = {};
              Object.values(behandlungen).forEach(b=>{ if(b.medikament) counts[b.medikament]=(counts[b.medikament]||0)+1; });
              const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([m])=>m);
              return top.map(m=>`<button type="button" class="filter-chip" style="font-size:.72rem" onclick="selectMedikament(this.dataset.med)" data-med="${m.replace(/"/g,'&quot;')}">${m}</button>`).join('');
            })()}
          </div>
          <!-- Input mit Dropdown -->
          <div style="position:relative">
            <input id="b-medikament" class="inp" placeholder="Medikament eingeben…"
              value="${d.medikament||''}"
              autocomplete="off"
              oninput="onMedInput(this)"
              onfocus="onMedInput(this)"
              onblur="setTimeout(()=>hideMedDropdown(),200)" />
            ${d.medikament ? `<button type="button" onclick="document.getElementById('b-medikament').value='';hideMedDropdown()" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text3);font-size:1rem;cursor:pointer;padding:0">✕</button>` : ''}
            <div id="med-dropdown" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 3px);background:var(--bg3);border:1px solid var(--gold2);border-radius:var(--radius-sm);z-index:200;max-height:200px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.5)"></div>
          </div>
        </div>
        <input id="b-dosis" class="inp" placeholder="Dosis / Menge" value="${d.dosis||''}" />
        <input id="b-tierarzt" class="inp" placeholder="Tierarzt" value="${d.tierarzt||''}" />
        <label class="inp-label">Abgabedatum Medikament</label>
        <input id="b-abgabe" class="inp" type="date" value="${d.abgabeDatum?isoDate(new Date(d.abgabeDatum)):''}" />
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">
          <div>
            <label class="inp-label">Wartezeit Milch (Tage)</label>
            <input id="b-wz-milch-tage" class="inp" inputmode="numeric" placeholder="z.B. 4" value="${d.wzMilchTage||''}" oninput="berechneWartezeiten()" />
          </div>
          <div>
            <label class="inp-label">Wartezeit Fleisch (Tage)</label>
            <input id="b-wz-fleisch-tage" class="inp" inputmode="numeric" placeholder="z.B. 28" value="${d.wzFleischTage||''}" oninput="berechneWartezeiten()" />
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">
          <div>
            <label class="inp-label">WZ Milch endet am <span id="b-wz-milch-hint" style="color:var(--text3);font-size:.65rem">${d.wzMilchTage?(d.behandlungZeit==='abend'?'(abends)':'(morgens)'):'(auto)'}</span></label>
            <input id="b-wz-milch" class="inp" type="date" value="${d.wzMilchEnde?isoDate(new Date(d.wzMilchEnde)):''}" />
            <input type="hidden" id="b-wz-milch-ts" value="${d.wzMilchEnde||''}" />
          </div>
          <div>
            <label class="inp-label">WZ Fleisch endet am <span id="b-wz-fleisch-hint" style="color:var(--text3);font-size:.65rem">${d.wzFleischTage?(d.behandlungZeit==='abend'?'(abends)':'(morgens)'):'(auto)'}</span></label>
            <input id="b-wz-fleisch" class="inp" type="date" value="${d.wzFleischEnde?isoDate(new Date(d.wzFleischEnde)):''}" />
            <input type="hidden" id="b-wz-fleisch-ts" value="${d.wzFleischEnde||''}" />
          </div>
        </div>
        <label class="inp-label">Folgetermin</label>
        <input id="b-folge" class="inp" type="date" value="${d.folgeTermin?isoDate(new Date(d.folgeTermin)):''}" />
        <textarea id="b-notiz" class="inp" rows="2" placeholder="Notizen">${d.notiz||''}</textarea>
        <!-- Foto Almpersonal -->
        <div id="b-foto-block">
          <label class="inp-label">Foto (optional)</label>
          <div style="display:flex;gap:.5rem;align-items:center">
            <label style="cursor:pointer;flex:1">
              <span class="btn-secondary" style="display:block;text-align:center;padding:.4rem;border-radius:var(--radius-sm);font-size:.82rem">📷 Foto aufnehmen</span>
              <input type="file" accept="image/*" capture="environment" style="display:none" onchange="behandlungFotoPreview(this)" />
            </label>
            <div id="b-foto-preview" style="width:48px;height:48px;border-radius:8px;overflow:hidden;display:none">
              <img id="b-foto-img" style="width:100%;height:100%;object-fit:cover" />
            </div>
          </div>
        </div>
        <!-- Foto Tierarztzettel (nur bei Tierarzt) -->
        <div id="b-tazettel-block" style="display:none">
          <label class="inp-label">📋 Foto Tierarztzettel</label>
          <div style="display:flex;gap:.5rem;align-items:center">
            <label style="cursor:pointer;flex:1">
              <span class="btn-secondary" style="display:block;text-align:center;padding:.4rem;border-radius:var(--radius-sm);font-size:.82rem;border-color:#3a8fd4;color:#3a8fd4">📷 Tierarztzettel fotografieren</span>
              <input type="file" accept="image/*" capture="environment" style="display:none" onchange="tazettelFotoPreview(this)" />
            </label>
            <div id="b-tazettel-preview" style="width:48px;height:48px;border-radius:8px;overflow:hidden;display:none">
              <img id="b-tazettel-img" style="width:100%;height:100%;object-fit:cover" />
            </div>
          </div>
        </div>
        <input type="hidden" id="b-foto-data" />
        <input type="hidden" id="b-tazettel-data" />
        <label class="checkbox-row"><input type="checkbox" id="b-aktiv" ${d.aktiv!==false?'checked':''} /> Behandlung aktiv</label>
        <div class="form-actions">
          <button class="btn-secondary" onclick="closeForm('behandlung-form-overlay')">Abbrechen</button>
          <button class="btn-primary" onclick="saveBehandlung()">Speichern</button>
        </div>
      </div>
    </div>
  </div>`;
}
function besamungFormHTML(vorId, editBsId=null, editData=null) {
  const opts=Object.entries(kuehe).sort((a,b)=>a[1].nr?.localeCompare(b[1].nr,undefined,{numeric:true})).map(([id,k])=>`<option value="${id}" ${(editData?editData.kuhId===id:id===vorId)?'selected':''}>#${k.nr} ${k.name||''}</option>`).join('');
  const d = editData || {};
  const bsDatum = d.datum ? isoDate(new Date(d.datum)) : isoDate(new Date());
  return `<div id="besamung-form-overlay" class="form-overlay" style="display:none">
    <div class="form-sheet">
      <div class="form-header">
        <h3>${editBsId?'Besamung bearbeiten':'Besamung erfassen'}</h3>
        <button class="close-btn" onclick="closeForm('besamung-form-overlay')">✕</button>
      </div>
      <div class="form-body">
        <input type="hidden" id="bs-edit-id" value="${editBsId||''}" />
        <label class="inp-label">Kuh *</label>
        <select id="bs-kuh" class="inp" onfocus="this.scrollIntoView({behavior:'smooth',block:'start'})">${opts}</select>
        <input id="bs-datum" class="inp" type="date" value="${bsDatum}" onchange="berechneTermine()" />
        <input id="bs-besamungstechniker" class="inp" placeholder="Besamungstechniker / Tierarzt" value="${d.besamungstechniker||''}" />
        <input id="bs-stier" class="inp" placeholder="Stier / Samenspender" value="${d.stier||''}" />
        <input id="bs-samen" class="inp" placeholder="Samen-Nr / Charge" value="${d.samen||''}" />
        <select id="bs-status" class="inp">
          <option value="besamt" ${(d.status||'besamt')==='besamt'?'selected':''}>Besamt – offen</option>
          <option value="tragend" ${d.status==='tragend'?'selected':''}>Tragend bestätigt</option>
          <option value="leer" ${d.status==='leer'?'selected':''}>Leer</option>
        </select>
        <label class="inp-label">Erwarteter Geburtstermin <span style="color:var(--text3);font-size:.7rem">(auto: +9 Mon 10 Tage)</span></label>
        <input id="bs-geburt" class="inp" type="date" value="${d.erwartetGeburt?isoDate(new Date(d.erwartetGeburt)):''}" />
        <label class="inp-label">Trockenstelltermin <span style="color:var(--text3);font-size:.7rem">(auto: Geburt −8 Wochen)</span></label>
        <input id="bs-trock" class="inp" type="date" value="${d.trockenstell?isoDate(new Date(d.trockenstell)):''}" />
        <label class="checkbox-row" style="margin-top:.4rem">
          <input type="checkbox" id="bs-erinnerung" ${d.erinnerung3w?'checked':''} />
          Erinnerung 3 Wochen nach Besamung (Trächtigkeitsprüfung)
        </label>
        <textarea id="bs-notiz" class="inp" rows="2" placeholder="Notizen">${d.notiz||''}</textarea>
        <!-- Besamungsschein Foto -->
        <label class="inp-label">📋 Foto Besamungsschein (optional)</label>
        <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.4rem">
          <label style="cursor:pointer;flex:1">
            <span class="btn-secondary" style="display:block;text-align:center;padding:.4rem;border-radius:var(--radius-sm);font-size:.82rem">📷 Besamungsschein fotografieren</span>
            <input type="file" accept="image/*" capture="environment" style="display:none" onchange="bsmFotoPreview(this)" />
          </label>
          <div id="bsm-foto-preview" style="width:48px;height:48px;border-radius:8px;overflow:hidden;display:${d.scheinFoto?'block':'none'}">
            <img id="bsm-foto-img" src="${d.scheinFoto||''}" style="width:100%;height:100%;object-fit:cover" />
          </div>
        </div>
        <input type="hidden" id="bsm-foto-data" value="${d.scheinFoto||''}" />
        <div class="form-actions">
          <button class="btn-secondary" onclick="closeForm('besamung-form-overlay')">Abbrechen</button>
          <button class="btn-primary" onclick="saveBesamung()">Speichern</button>
        </div>
      </div>
    </div>
  </div>`;
}
function kalbungFormHTML(){return`<div id="kalbung-form-overlay" class="form-overlay" style="display:none"><div class="form-sheet"><div class="form-header"><h3>Kalbung</h3><button class="close-btn" onclick="closeForm('kalbung-form-overlay')">✕</button></div><div class="form-body"><input id="kb-datum" class="inp" type="date" value="${isoDate(new Date())}" /><select id="kb-geschlecht" class="inp"><option value="">Geschlecht</option><option>Stierkalb</option><option>Kuhkalb</option></select><input id="kb-nr" class="inp" placeholder="Ohrmarke Kalb" /><input id="kb-name" class="inp" placeholder="Name" /><input id="kb-gewicht" class="inp" placeholder="Geburtsgewicht kg" inputmode="decimal" /><select id="kb-verlauf" class="inp"><option value="normal">Normal</option><option value="schwer">Schwergeburt</option><option value="totgeburt">Totgeburt</option></select><textarea id="kb-notiz" class="inp" rows="2" placeholder="Notizen"></textarea><div class="form-actions"><button class="btn-secondary" onclick="closeForm('kalbung-form-overlay')">Abbrechen</button><button class="btn-primary" onclick="saveKalbung()">Speichern</button></div></div></div></div>`;}

// ══════════════════════════════════════════════════════════════════════════════
//  ACTIONS
// ══════════════════════════════════════════════════════════════════════════════
window.showKuhForm=function(id=null){
  editId=id;
  const ov=document.getElementById('kuh-form-overlay');
  if(!ov){navigate('herde');setTimeout(()=>showKuhForm(id),150);return;}
  if(id&&kuehe[id]){
    const k=kuehe[id];
    document.getElementById('f-nr').value=k.nr||'';
    document.getElementById('f-name').value=k.name||'';
    document.getElementById('f-rasse').value=k.rasse||'';
    document.getElementById('kuh-form-title').textContent='Kuh bearbeiten';
    // Set bauer
    const bauerSel=document.getElementById('f-bauer');
    const bauOpt=[...bauerSel.options].find(o=>o.value===k.bauer);
    if(bauOpt)bauerSel.value=k.bauer;
    else if(k.bauer){bauerSel.value='__neu__';document.getElementById('f-bauer-text').style.display='';document.getElementById('f-bauer-text').value=k.bauer;}
    // Set gruppe
    const grpSel=document.getElementById('f-gruppe');
    if(grpSel)[...grpSel.options].forEach(o=>{if(o.value===k.gruppe)o.selected=true;});
    // Set laktation
    const lakSel=document.getElementById('f-laktation');
    if(lakSel&&k.laktation)lakSel.value=k.laktation;
    // Set notiz
    const notizEl=document.getElementById('f-notiz');
    if(notizEl)notizEl.value=k.notiz||'';
    const ohrmarkeEl=document.getElementById('f-ohrmarke');
    if(ohrmarkeEl)ohrmarkeEl.value=k.ohrmarke||'';
  } else {
    document.getElementById('f-nr').value='';
    document.getElementById('f-name').value='';
    document.getElementById('f-rasse').value='';
    document.getElementById('kuh-form-title').textContent='Kuh erfassen';
  }
  ov.style.display='flex';
  document.getElementById('f-bauer').onchange=function(){document.getElementById('f-bauer-text').style.display=this.value==='__neu__'?'':'none';};
};
window.saveKuh=async function(){const nr=document.getElementById('f-nr')?.value.trim();if(!nr){alert('Nr Pflicht');return;}const bs=document.getElementById('f-bauer')?.value;const bauer=bs==='__neu__'?(document.getElementById('f-bauer-text')?.value.trim()||''):bs;const data={
    nr,
    ohrmarke:   document.getElementById('f-ohrmarke')?.value.trim()||'',
    name:       document.getElementById('f-name')?.value.trim(),
    bauer,
    rasse:      document.getElementById('f-rasse')?.value.trim(),
    gruppe:     document.getElementById('f-gruppe')?.value||'',
    laktation:  document.getElementById('f-laktation')?.value||'',
    notiz:      document.getElementById('f-notiz')?.value.trim()||'',
    updatedAt:  Date.now()
  };if(editId)await update(ref(db,'kuehe/'+editId),data);else{data.createdAt=Date.now();data.almStatus='unten';await push(ref(db,'kuehe'),data);}closeForm('kuh-form-overlay');};
window.deleteKuh=async function(id){if(confirm('Kuh löschen?'))await remove(ref(db,'kuehe/'+id));navigate('herde');};
window.showKuhDetail=function(id){editId=id;currentView='kuh-detail';render();};
window.filterKuehe=q=>document.querySelectorAll('#kuh-list .list-card').forEach(c=>c.style.display=c.textContent.toLowerCase().includes(q.toLowerCase())?'':'none');
window.filterBauer=function(b,btn){document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));btn.classList.add('active');document.querySelectorAll('#kuh-list .list-card').forEach(c=>c.style.display=b===''||c.dataset.bauer===b?'':'none');};
window.filterHerde=function(f,btn){
  document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#kuh-list .list-card').forEach(c=>{
    if(f==='') c.style.display='';
    else if(f.startsWith('bauer:')) c.style.display=c.dataset.bauer===f.slice(6)?'':'none';
    else if(f.startsWith('gruppe:')) c.style.display=c.dataset.gruppe===f.slice(7)?'':'none';
    else if(f==='bio') c.style.display=c.dataset.bio==='1'?'':'none';
  });
};
window.importCSVDialog=function(){const ov=document.getElementById('csv-import-overlay');if(!ov){navigate('herde');setTimeout(()=>importCSVDialog(),150);return;}ov.style.display='flex';};
window.doImport=async function(){const rows=parseTable(document.getElementById('import-text')?.value);if(!rows){document.getElementById('import-err').textContent='Format nicht erkannt.';return;}for(const r of rows)await push(ref(db,'kuehe'),{...r,almStatus:'unten',createdAt:Date.now()});closeForm('csv-import-overlay');};
window.startZaehlung=async function(){
  const heute=isoDate(new Date());
  await set(ref(db,'zaehlung'),{anwesend:{},startedAt:Date.now(),datum:heute});
};
window.resetZaehlung=async function(){
  if(!confirm('Zählung abschließen und speichern?')) return;
  if(zaehlSession) {
    const datum = zaehlSession.datum || isoDate(new Date());
    const anwCount = Object.keys(zaehlSession.anwesend||{}).length;
    const total = Object.keys(kuehe).length;
    await set(ref(db,'zaehlVerlauf/'+datum), {
      datum, anwCount, total,
      vollzaehlig: anwCount===total,
      ts: Date.now()
    });
  }
  await remove(ref(db,'zaehlung'));
};
window.zaehlKuh=async function(val){val=val.trim();const inp=document.getElementById('z-input');if(!val||!zaehlSession)return;const f=Object.entries(kuehe).find(([,k])=>k.nr===val);if(!f){inp.style.borderColor='var(--red)';setTimeout(()=>inp.style.borderColor='',700);inp.value='';return;}const[id]=f;if(zaehlSession.anwesend?.[id]&&!confirm('Bereits erfasst – trotzdem?')){inp.value='';return;}await update(ref(db,`zaehlung/anwesend/${id}`),{ts:Date.now()});inp.value='';inp.style.borderColor='var(--green)';setTimeout(()=>inp.style.borderColor='',600);inp.focus();};
window.zaehlKuhById=async function(id){if(zaehlSession?.anwesend?.[id]&&!confirm('Bereits erfasst?'))return;await update(ref(db,`zaehlung/anwesend/${id}`),{ts:Date.now()});};
window.entferneZaehlung=async id=>remove(ref(db,`zaehlung/anwesend/${id}`));
window.deleteZaehlVerlauf=async function(datum){if(confirm('Eintrag löschen?'))await remove(ref(db,'zaehlVerlauf/'+datum));};
window.showBehandlungForm=function(kuhId, editBId, editData) {
  const existing = document.getElementById('behandlung-form-overlay');
  const container = document.createElement('div');
  container.innerHTML = behandlungFormHTML(kuhId, editBId, editData);
  const newOv = container.firstChild;
  if(existing) existing.replaceWith(newOv);
  else document.body.appendChild(newOv);
  newOv.onclick = e => { if(e.target===newOv) closeForm('behandlung-form-overlay'); };
  newOv.style.display = 'flex';
  // Scroll form to top so kuh-select is visible
  setTimeout(function(){
    var sheet = newOv.querySelector('.form-sheet');
    if(sheet) sheet.scrollTop = 0;
  }, 50);
};
window.saveBehandlung=async function(){
  const kuhId=document.getElementById('b-kuh')?.value;
  if(!kuhId){alert('Kuh wählen');return;}
  const abgabe=document.getElementById('b-abgabe')?.value;
  const fl=document.getElementById('b-folge')?.value;
  const wzMilch=document.getElementById('b-wz-milch')?.value;
  const wzFleisch=document.getElementById('b-wz-fleisch')?.value;
  let editId=document.getElementById('b-edit-id')?.value;
  const data={
    kuhId,
    datum:new Date(document.getElementById('b-datum').value).getTime(),
    behandlungZeit:document.getElementById('b-behandlung-zeit')?.value||'morgen',
    diagnose:document.getElementById('b-diagnose')?.value.trim()||'',
    symptome:document.getElementById('b-symptome')?.value.trim()||'',
    temperatur:parseFloat(document.getElementById('b-temperatur')?.value)||null,
    tempUhrzeit:document.getElementById('b-temp-uhrzeit')?.value||'',
    medikament:document.getElementById('b-medikament')?.value.trim()||'',
    dosis:document.getElementById('b-dosis')?.value.trim()||'',
    tierarzt:document.getElementById('b-tierarzt')?.value.trim()||'',
    abgabeDatum:abgabe?new Date(abgabe).getTime():null,
    wzMilchTage:parseFloat(document.getElementById('b-wz-milch-tage')?.value)||0,
    wzFleischTage:parseFloat(document.getElementById('b-wz-fleisch-tage')?.value)||0,
    wzMilchEnde:  (()=>{ const ts=document.getElementById('b-wz-milch-ts')?.value; if(ts&&ts!=='') return parseInt(ts); return wzMilch?new Date(wzMilch+'T03:00:00').getTime():null; })(),
    wzFleischEnde:(()=>{ const ts=document.getElementById('b-wz-fleisch-ts')?.value; if(ts&&ts!=='') return parseInt(ts); return wzFleisch?new Date(wzFleisch+'T03:00:00').getTime():null; })(),
    wartezeitEnde:(()=>{ const tm=document.getElementById('b-wz-milch-ts')?.value; const tf=document.getElementById('b-wz-fleisch-ts')?.value; if(tm&&tm!=='') return parseInt(tm); if(tf&&tf!=='') return parseInt(tf); return wzMilch?new Date(wzMilch+'T03:00:00').getTime():(wzFleisch?new Date(wzFleisch+'T03:00:00').getTime():null); })(),
    folgeTermin:fl?new Date(fl).getTime():null,
    notiz:document.getElementById('b-notiz')?.value.trim()||'',
    aktiv:document.getElementById('b-aktiv')?.checked!==false,
    behandler:document.getElementById('b-behandler')?.value||'personal',
    fotoData:document.getElementById('b-foto-data')?.value||null,
    tazettelData:document.getElementById('b-tazettel-data')?.value||null,
  };
  if(editId){await update(ref(db,'behandlungen/'+editId),{...data,updatedAt:Date.now()});}
  else{const nr=await push(ref(db,'behandlungen'),{...data,createdAt:Date.now()});editId=nr.key;}
  // Temperaturverlauf anhängen wenn Temperatur eingegeben
  const tempVal = parseFloat(document.getElementById('b-temperatur')?.value);
  if(tempVal && editId) {
    const tempEntry = {
      temp: tempVal,
      zeit: document.getElementById('b-temp-uhrzeit')?.value||'',
      ts:   Date.now(),
      datum: isoDate(new Date())
    };
    await push(ref(db,'behandlungen/'+editId+'/temperaturVerlauf'), tempEntry);
    // Fieber-Alert
    if(tempVal > 39.5 && typeof swNotify==='function') {
      const k = kuehe[data.kuhId];
      swNotify('🌡 Fieber: '+(k?'#'+k.nr+' '+k.name:'Kuh'), {
        body: tempVal+'°C – Fieber erkannt (>39.5°C)',
        tag: 'fieber-'+data.kuhId
      });
    }
  }
  window.showSaveToast&&showSaveToast('Behandlung gespeichert');
  closeForm('behandlung-form-overlay');
  // Temperatur-Indikator zurücksetzen
  const fi=document.getElementById('b-fieber-indikator');
  if(fi) fi.style.display='none';
};

// ── Fehlende Stub-Funktionen (waren in onclick referenziert, aber nicht definiert) ──
window.deleteMilch = async function(id) {
  if(!id) return;
  if(!confirm('Milcheintrag löschen?')) return;
  try { await remove(ref(db,'milch/'+id)); } catch(e) { console.error(e); alert('Fehler beim Löschen'); }
};
window.druckeHerde = function() {
  try { window.print(); } catch(e) { console.error(e); }
};
window.clearCache = function() {
  try {
    if('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(regs){
        regs.forEach(function(r){ r.unregister(); });
      });
    }
    if(window.caches) {
      caches.keys().then(function(keys){ keys.forEach(function(k){ caches.delete(k); }); });
    }
    setTimeout(function(){ window.location.reload(true); }, 200);
  } catch(e) { console.error(e); window.location.reload(true); }
};
window.kp_onDragStart = function(ev, fromIdx) {
  if(!ev || !ev.dataTransfer) return;
  ev.dataTransfer.setData('text/plain', String(fromIdx));
  ev.dataTransfer.effectAllowed = 'move';
};
window.kp_onDrop = function(ev, toIdx) {
  if(!ev) return;
  ev.preventDefault && ev.preventDefault();
  var from = ev.dataTransfer ? parseInt(ev.dataTransfer.getData('text/plain'),10) : NaN;
  if(isNaN(from) || from === toIdx) return;
  // Hook für tatsächliche Reorder-Logik – nutzt vorhandenen kp-State falls vorhanden
  if(typeof window.kp_reorder === 'function') {
    try { window.kp_reorder(from, toIdx); } catch(e){ console.error(e); }
  } else {
    console.warn('kp_reorder noch nicht implementiert – from:',from,'to:',toIdx);
  }
};
window.deleteBehandlung=async id=>{if(confirm('Löschen?'))await remove(ref(db,'behandlungen/'+id));};
window.wartezeitAbschliessen=async id=>update(ref(db,'behandlungen/'+id),{warteAbgeschlossen:true,aktiv:false});
window.showBesamungForm=function(kuhId, editBsId, editData){
  // editBsId=true means "2. Versuch" (new entry, same cow, keep techniker)
  const zweitversuch = editBsId === true;
  if(zweitversuch) editBsId = null;

  // If editBsId provided but no editData, load from besamungen
  if(editBsId && !editData && besamungen[editBsId]) {
    editData = besamungen[editBsId];
  }

  const ovId='besamung-form-overlay';
  let ov=document.getElementById(ovId);
  if(!ov){navigate('besamung');setTimeout(()=>showBesamungForm(kuhId,zweitversuch?true:editBsId,editData),200);return;}
  
  // Set title
  const h3 = ov.querySelector('h3');
  if(h3) h3.textContent = zweitversuch ? '↻ 2. Versuch Besamung' : (editBsId ? 'Besamung bearbeiten' : 'Besamung erfassen');

  // Clear form
  ['bs-stier','bs-samen','bs-notiz'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['bs-datum','bs-geburt','bs-trock'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('bs-datum').value=isoDate(new Date());
  document.getElementById('bs-status').value='besamt';

  // Store edit ID
  let eid=document.getElementById('bs-edit-id');
  if(!eid){eid=document.createElement('input');eid.type='hidden';eid.id='bs-edit-id';ov.querySelector('.form-body').appendChild(eid);}
  eid.value=editBsId||'';

  // Fill if editing
  if(editData){
    const d=typeof editData==='string'?JSON.parse(editData):editData;
    if(d.kuhId)document.getElementById('bs-kuh').value=d.kuhId;
    if(d.datum)document.getElementById('bs-datum').value=isoDate(new Date(d.datum));
    if(d.stier)document.getElementById('bs-stier').value=d.stier;
    if(d.samen)document.getElementById('bs-samen').value=d.samen;
    if(d.status)document.getElementById('bs-status').value=d.status;
    if(d.erwartetGeburt)document.getElementById('bs-geburt').value=isoDate(new Date(d.erwartetGeburt));
    if(d.trockenstell)document.getElementById('bs-trock').value=isoDate(new Date(d.trockenstell));
    if(d.notiz)document.getElementById('bs-notiz').value=d.notiz;
    if(d.besamungstechniker)document.getElementById('bs-besamungstechniker').value=d.besamungstechniker;
    if(d.erinnerung3w)document.getElementById('bs-erinnerung').checked=true;
  } else if(kuhId) {
    document.getElementById('bs-kuh').value=kuhId;
    // 2. Versuch: Techniker aus letzter Besamung übernehmen
    if(zweitversuch) {
      const letztebs = Object.values(besamungen).filter(b=>b.kuhId===kuhId).sort((a,b)=>b.datum-a.datum)[0];
      if(letztebs) {
        if(letztebs.besamungstechniker) document.getElementById('bs-besamungstechniker').value=letztebs.besamungstechniker;
        if(letztebs.stier) document.getElementById('bs-stier').value=letztebs.stier;
        // Vorherige als "leer" markieren
        const prevId = Object.entries(besamungen).find(([,b])=>b.kuhId===kuhId&&(b.status==='besamt'||b.status==='tragend'))?.[0];
        if(prevId) setTimeout(async()=>{ await update(ref(db,'besamungen/'+prevId),{status:'leer'}); }, 100);
      }
    }
  }
  ov.style.display='flex';
  setTimeout(function(){var s=ov.querySelector('.form-sheet');if(s)s.scrollTop=0;},50);
  berechneTermine();
};
window.berechneTermine=function(){
  const d=document.getElementById('bs-datum')?.value;
  if(!d)return;
  const basis=new Date(d);
  // Geburtstermin: +9 Monate +10 Tage
  const geburt=new Date(basis);
  geburt.setMonth(geburt.getMonth()+9);
  geburt.setDate(geburt.getDate()+10);
  const geburtFeld=document.getElementById('bs-geburt');
  if(geburtFeld&&!geburtFeld.value)geburtFeld.value=isoDate(geburt);
  // Trockenstell: Geburt -8 Wochen
  const gv=document.getElementById('bs-geburt')?.value;
  if(gv){
    const trock=new Date(gv);
    trock.setDate(trock.getDate()-56);
    const trockFeld=document.getElementById('bs-trock');
    if(trockFeld&&!trockFeld.value)trockFeld.value=isoDate(trock);
  }
};
window.saveBesamung=async function(){
  const kuhId=document.getElementById('bs-kuh')?.value;
  if(!kuhId){alert('Kuh wählen');return;}
  const g=document.getElementById('bs-geburt')?.value;
  const t=document.getElementById('bs-trock')?.value;
  const editId=document.getElementById('bs-edit-id')?.value;
  const datum=document.getElementById('bs-datum').value;
  // Erinnerungsdatum: Besamung +21 Tage
  const erinnerung3w=document.getElementById('bs-erinnerung')?.checked;
  const erinnerungDatum=erinnerung3w?(()=>{const d=new Date(datum);d.setDate(d.getDate()+21);return d.getTime();})():null;
  const data={
    kuhId,
    datum:new Date(datum).getTime(),
    besamungstechniker:document.getElementById('bs-besamungstechniker')?.value.trim(),
    stier:document.getElementById('bs-stier')?.value.trim(),
    samen:document.getElementById('bs-samen')?.value.trim(),
    status:document.getElementById('bs-status')?.value||'besamt',
    erwartetGeburt:g?new Date(g).getTime():null,
    trockenstell:t?new Date(t).getTime():null,
    erinnerung3w,
    erinnerungDatum,
    notiz:document.getElementById('bs-notiz')?.value.trim(),
    scheinFoto:document.getElementById('bsm-foto-data')?.value||null,
  };
  if(editId){await update(ref(db,'besamungen/'+editId),{...data,updatedAt:Date.now()});}
  else{await push(ref(db,'besamungen'),{...data,createdAt:Date.now()});}
  window.showSaveToast&&showSaveToast('Besamung gespeichert');
  closeForm('besamung-form-overlay');
};
window.deleteBesamung=async id=>{if(confirm('Löschen?'))await remove(ref(db,'besamungen/'+id));};
window.showKalbungForm=function(bsid,kuhId){_kalbungIds={bsid,kuhId};const ov=document.getElementById('kalbung-form-overlay');if(!ov){navigate('besamung');setTimeout(()=>showKalbungForm(bsid,kuhId),200);return;}ov.style.display='flex';};
window.saveKalbung=async function(){const{bsid,kuhId}=_kalbungIds;const d=document.getElementById('kb-datum')?.value;const gs=document.getElementById('kb-geschlecht')?.value;const nr=document.getElementById('kb-nr')?.value.trim();await update(ref(db,'besamungen/'+bsid),{status:'kalbung',kalbDatum:d?new Date(d).getTime():Date.now(),kalbGeschlecht:gs,kalbNr:nr,kalbName:document.getElementById('kb-name')?.value.trim(),kalbGewicht:document.getElementById('kb-gewicht')?.value.trim(),kalbVerlauf:document.getElementById('kb-verlauf')?.value});if(gs==='Kuhkalb'&&nr&&confirm('Kalb als neue Kuh anlegen?')){const m=kuehe[kuhId];await push(ref(db,'kuehe'),{nr,name:document.getElementById('kb-name')?.value.trim()||'',bauer:m?.bauer||'',rasse:m?.rasse||'',mutter:m?.nr||'',almStatus:'unten',createdAt:Date.now()});}closeForm('kalbung-form-overlay');};

// ══════════════════════════════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════════════════════════════
window.closeForm=function(id){const el=document.getElementById(id);if(el)el.style.display='none';};
window.switchTab=function(show,hide,btn){show.split(',').forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='';});hide.split(',').forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});btn.closest('.detail-tabs').querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');};
function attachListeners(){document.querySelectorAll('.form-overlay').forEach(el=>{el.onclick=e=>{if(e.target===el)closeForm(el.id);};});}
function statusLabel(s){return{besamt:'Besamt',tragend:'Trächtig',leer:'Leer',kalbung:'Gekälbert'}[s]||s;}
function isoDate(d){return d.toISOString().split('T')[0];}
function parseTable(text){if(!text)return null;const lines=text.trim().split(/\r?\n/).filter(l=>l.trim());if(lines.length<2)return null;const sep=lines[0].includes('\t')?'\t':lines[0].includes(';')?';':',';const hdr=lines[0].split(sep).map(h=>h.trim().toLowerCase());const iN=hdr.findIndex(h=>/nr|num|ohr|marke|id/.test(h));const iK=hdr.findIndex(h=>/kuh|tier|name/.test(h));const iB=hdr.findIndex(h=>/bauer|landwirt|besitz|owner/.test(h));const iR=hdr.findIndex(h=>/rasse|breed/.test(h));const iG=hdr.findIndex(h=>/gruppe|group|abt/.test(h));const iO=hdr.findIndex(h=>/ohr|ear|mark/.test(h));if(iN<0)return null;return lines.slice(1).map(l=>{const c=l.split(sep).map(x=>x.trim());return{nr:c[iN]||'',name:iK>=0?c[iK]||'':'',bauer:iB>=0?c[iB]||'':'',rasse:iR>=0?(c[iR]||''):'',gruppe:iG>=0?(c[iG]||''):'',ohrmarke:iO>=0?(c[iO]||''):''};}).filter(r=>r.nr);}
function registerSW(){if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});}
function requestNotificationPermission(){if('Notification' in window&&Notification.permission==='default')Notification.requestPermission();}
function checkWartezeiten(){
  const h=Date.now();
  const f=Object.entries(behandlungen).filter(([,b])=>b.wartezeitEnde&&b.wartezeitEnde<=h&&!b.warteAbgeschlossen).map(([id,b])=>({id,medikament:b.medikament||'Medikament',kuhNr:kuehe[b.kuhId]?.nr||b.kuhId,kuhName:kuehe[b.kuhId]?.name||''}));
  // Besamungs-Erinnerungen (3 Wochen)
  const bErinnerung=Object.entries(besamungen).filter(([,b])=>b.erinnerungDatum&&b.erinnerungDatum<=h&&!b.erinnerungErledigt).map(([id,b])=>{const k=kuehe[b.kuhId];return{id,medikament:'Trächtigkeitsprüfung fällig',kuhNr:k?.nr||'',kuhName:k?.name||''};});
  const alle=[...f,...bErinnerung];
  if(alle.length&&'serviceWorker' in navigator)navigator.serviceWorker.ready.then(sw=>sw.active?.postMessage({type:'CHECK_WARTEZEITEN',faellig:alle}));
  // Browser Notification - SW bevorzugen (Android-kompatibel)
  if(bErinnerung.length && Notification.permission==='granted') {
    if('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(sw => {
        bErinnerung.forEach(e => {
          sw.showNotification('🐄 Trächtigkeitsprüfung', {
            body: `${e.kuhName} #${e.kuhNr} – 3 Wochen seit Besamung`,
            icon: '/icon-192.png'
          });
        });
      });
    } else {
      bErinnerung.forEach(e=>{
        try{ swNotify('🐄 Trächtigkeitsprüfung',{body:`${e.kuhName} #${e.kuhNr}`}); }catch(_){}
      });
    }
  }
}


// ══════════════════════════════════════════════════════════════════════════════
//  TAGESJOURNAL
// ══════════════════════════════════════════════════════════════════════════════
let journal = {};
onValue !== undefined && (() => {})(); // placeholder - listeners added in initApp

function renderJournal() {
  const kategorien = ['Allgemein','Tierarzt','Wetter','Vorfall','Kontrolle','Wartung'];
  const katFilter = window._journalKat || '';
  const alleEintraege = Object.entries(journal).sort((a,b)=>b[1].datum?.localeCompare(a[1].datum));
  const eintraege = (katFilter ? alleEintraege.filter(([,j])=>j.kategorie===katFilter) : alleEintraege).slice(0,60);
  const heute = isoDate(new Date());
  const heuteEintrag = Object.entries(journal).find(([,j])=>j.datum===heute);
  const wetter = ['☀️ Sonnig','⛅ Bewölkt','🌧 Regen','⛈ Gewitter','🌫 Nebel','❄️ Schnee','💨 Wind'];
  const katColors = {Tierarzt:'#3a8fd4',Vorfall:'var(--red)',Kontrolle:'var(--gold)',Wetter:'#6abfdb',Wartung:'var(--orange)',Allgemein:'var(--text3)'};
  return `
    <div class="page-header"><h2>📓 Tagesjournal</h2><button class="btn-primary" onclick="showJournalForm()">+ Eintrag</button></div>
    
    <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.6rem">
      <button class="filter-chip ${!katFilter?'active':''}" onclick="window._journalKat='';render()">Alle</button>
      ${kategorien.map(k=>`<button class="filter-chip ${katFilter===k?'active':''}" onclick="window._journalKat='${k}';render()" style="${katFilter===k?'':''}"><span style="color:${katColors[k]||'var(--text3)'};margin-right:2px">●</span>${k}</button>`).join('')}
    </div>

    ${heuteEintrag && !katFilter ? `
    <div class="card-section" style="border-color:var(--gold2);margin-bottom:.8rem">
      <div class="info-row"><span>Heute</span><b>${heuteEintrag[1].wetter||''}</b></div>
      ${heuteEintrag[1].kategorie?`<div class="info-row"><span>Kategorie</span><span style="color:${katColors[heuteEintrag[1].kategorie]||'var(--text3)'}">${heuteEintrag[1].kategorie}</span></div>`:''}
      ${heuteEintrag[1].anwesend?`<div class="info-row"><span>Anwesend</span><span>${heuteEintrag[1].anwesend}</span></div>`:''}
      ${heuteEintrag[1].notiz?`<div style="font-size:.83rem;color:var(--text2);margin-top:.4rem;font-style:italic">${heuteEintrag[1].notiz}</div>`:''}
      <button class="btn-xs-danger" style="margin-top:.5rem" onclick="deleteJournal('${heuteEintrag[0]}')">löschen</button>
    </div>` : ''}
    <div class="section-title">Verlauf ${katFilter?`· ${katFilter}`:''}</div>
    <div class="card-list">
      ${eintraege.length ? eintraege.map(([id,j])=>`
        <div class="list-card">
          <div class="list-card-left">
            <div>
              <div class="list-card-title">${new Date(j.datum+'T12:00').toLocaleDateString('de-AT',{weekday:'short',day:'numeric',month:'short'})} ${j.wetter||''} ${j.kategorie?`<span style="font-size:.68rem;color:${katColors[j.kategorie]||'var(--text3)'};border:1px solid currentColor;border-radius:6px;padding:1px 4px;margin-left:2px">${j.kategorie}</span>`:''}</div>
              ${j.anwesend?`<div class="list-card-sub">👤 ${j.anwesend}</div>`:''}
              ${j.notiz?`<div class="list-card-sub" style="font-style:italic">${j.notiz.substring(0,60)}${j.notiz.length>60?'…':''}</div>`:''}
              ${j.vorkommnisse?`<div class="list-card-sub" style="color:var(--orange)">⚠ ${j.vorkommnisse.substring(0,60)}</div>`:''}
            </div>
          </div>
          <button class="btn-xs-danger" onclick="deleteJournal('${id}')">✕</button>
        </div>`).join('') : `<div class="empty-state">Keine Einträge</div>`}
    </div>
    <div id="journal-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>Tageseintrag</h3><button class="close-btn" onclick="closeForm('journal-overlay')">✕</button></div>
        <div class="form-body">
          <input id="j-datum" class="inp" type="date" value="${heute}" />
          <label class="inp-label">Kategorie</label>
          <div style="display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:.5rem">
            ${kategorien.map(k=>`<button class="filter-chip" onclick="selectJournalKat('${k}',this)" style="font-size:.75rem">${k}</button>`).join('')}
          </div>
          <input type="hidden" id="j-kategorie" value="Allgemein" />
          <label class="inp-label">Wetter</label>
          <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.4rem">
            ${wetter.map(w=>`<button class="filter-chip" onclick="selectWetter('${w}',this)">${w}</button>`).join('')}
          </div>
          <input id="j-wetter" class="inp" placeholder="Wetter (oder oben wählen)" />
          <input id="j-anwesend" class="inp" placeholder="Wer war anwesend auf der Alm?" />
          <textarea id="j-notiz" class="inp" rows="3" placeholder="Tagesnotizen (allgemein)"></textarea>
          <textarea id="j-vorkommnisse" class="inp" rows="2" placeholder="Besondere Vorkommnisse"></textarea>
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('journal-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveJournal()">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
window.showJournalForm = function() {
  const ov = document.getElementById('journal-overlay');
  if(!ov){navigate('journal');setTimeout(()=>showJournalForm(),150);return;}
  ov.style.display='flex';
};
window.selectJournalKat = function(k, btn) {
  document.getElementById('j-kategorie').value = k;
  document.querySelectorAll('#journal-overlay .filter-chip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
};
window.selectWetter = function(w, btn) {
  document.getElementById('j-wetter').value = w;
  document.querySelectorAll('#journal-overlay .filter-chip').forEach(b=>{
    if([...document.querySelectorAll('#journal-overlay .filter-chip')].slice(0,6).includes(b)) return;
    b.classList.remove('active');
  });
  btn.classList.add('active');
};
window.saveJournal = async function() {
  const datum = document.getElementById('j-datum')?.value;
  await push(ref(db,'journal'), {
    datum,
    kategorie:     document.getElementById('j-kategorie')?.value || 'Allgemein',
    wetter:        document.getElementById('j-wetter')?.value.trim(),
    anwesend:      document.getElementById('j-anwesend')?.value.trim(),
    notiz:         document.getElementById('j-notiz')?.value.trim(),
    vorkommnisse:  document.getElementById('j-vorkommnisse')?.value.trim(),
    createdAt:     Date.now()
  });
  closeForm('journal-overlay');
};
window.deleteJournal = async function(id) {
  if(confirm('Eintrag löschen?')) await remove(ref(db,'journal/'+id));
};

// ══════════════════════════════════════════════════════════════════════════════
//  ALPUNGSTAGE / AMA-AUSWERTUNG
// ══════════════════════════════════════════════════════════════════════════════
function renderAlpung() {
  const heute = Date.now();
  const kuhListe = Object.entries(kuehe).sort((a,b)=>a[1].nr?.localeCompare(b[1].nr,undefined,{numeric:true}));
  
  // Alpungstage berechnen: von Auftrieb bis Abtrieb (oder heute falls noch oben)
  const auftriebTs = saisonInfo?.auftriebDatum || null;
  const abtriebtTs = saisonInfo?.abtriebtDatum || null;
  const saisonEnde = abtriebtTs || (saisonInfo?.aktiv ? heute : null);
  
  const rows = kuhListe.map(([id,k]) => {
    let tage = 0;
    if(auftriebTs && saisonEnde && k.almStatus !== undefined) {
      if(k.almStatus === 'oben' || abtriebtTs) {
        tage = Math.max(0, Math.floor((saisonEnde - auftriebTs) / 86400000));
      }
    }
    return {id, k, tage};
  });
  
  const gesamtTage = rows.reduce((s,r)=>s+r.tage,0);

  return `
    <div class="page-header"><h2>📊 Alpungstage / AMA</h2><button class="btn-primary" onclick="exportAlpung()">📤 Export</button></div>
    <div class="card-section" style="margin-bottom:.8rem">
      <div class="info-row"><span>Alm</span><b>${saisonInfo?.alm||'–'}</b></div>
      <div class="info-row"><span>Saison</span><b>${saisonInfo?.jahr||new Date().getFullYear()}</b></div>
      <div class="info-row"><span>Auftrieb</span><b>${auftriebTs?new Date(auftriebTs).toLocaleDateString('de-AT'):'–'}</b></div>
      <div class="info-row"><span>Abtrieb</span><b>${abtriebtTs?new Date(abtriebtTs).toLocaleDateString('de-AT'):saisonInfo?.aktiv?'noch oben':'–'}</b></div>
      <div class="info-row"><span>Gesamt Tiertage</span><b style="color:var(--gold)">${gesamtTage}</b></div>
    </div>
    <div class="section-title">Aufstellung pro Tier</div>
    <div style="overflow-x:auto">
      <table class="bb-table">
        <thead><tr><th>Nr</th><th>Name</th><th>Bauer</th><th>Alpungstage</th></tr></thead>
        <tbody>
          ${rows.map(({k,tage})=>`
            <tr>
              <td>#${k.nr}</td>
              <td>${k.name||'–'}</td>
              <td>${k.bauer||'–'}</td>
              <td><b style="color:var(--gold)">${tage}</b></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p style="font-size:.72rem;color:var(--text3);margin-top:.8rem">
      Alpungstage = Auftriebsdatum bis Abtriebsdatum. Für AMA/ÖPUL-Antrag: Export als CSV verwenden.
    </p>
  `;
}
window.exportAlpung = function() {
  const heute = Date.now();
  const auftriebTs = saisonInfo?.auftriebDatum || null;
  const abtriebtTs = saisonInfo?.abtriebtDatum || null;
  const saisonEnde = abtriebtTs || (saisonInfo?.aktiv ? heute : null);
  const rows = Object.values(kuehe).sort((a,b)=>a.nr?.localeCompare(b.nr,undefined,{numeric:true})).map(k => {
    let tage = 0;
    if(auftriebTs && saisonEnde) tage = Math.max(0, Math.floor((saisonEnde - auftriebTs) / 86400000));
    return [k.nr, k.ohrmarke||'', k.name||'', k.bauer||'', tage, saisonInfo?.alm||'', saisonInfo?.jahr||''];
  });
  const csv = 'Kuhnummer;Ohrmarke;Name;Bauer;Alpungstage;Alm;Jahr\n' + rows.map(r=>r.join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}));
  a.download = `Alpungstage_${saisonInfo?.jahr||new Date().getFullYear()}.csv`;
  a.click();
};

// ══════════════════════════════════════════════════════════════════════════════
//  KONTAKTE
// ══════════════════════════════════════════════════════════════════════════════
let kontakte = {};

function renderKontakte() {
  const liste = Object.entries(kontakte).sort((a,b)=>a[1].name?.localeCompare(b[1].name));
  const kategorien = ['Tierarzt','Besamung','Behörde','Molkerei','Sonstige'];
  const aktTab = window._kontakteTab || 'kontakte';

  // Vordefinierte Notfallnummern (Österreich)
  const NOTFALL_VORDEFINIERT = [
    { name:'Notruf',           tel:'112', icon:'🚨', farbe:'#d44b4b', desc:'Europäischer Notruf' },
    { name:'Rettung',          tel:'144', icon:'🚑', farbe:'#d44b4b', desc:'Österreich Rettungsdienst' },
    { name:'Polizei',          tel:'133', icon:'👮', farbe:'#4ab8e8', desc:'Österreich Polizei' },
    { name:'Feuerwehr',        tel:'122', icon:'🚒', farbe:'#d4844b', desc:'Österreich Feuerwehr' },
    { name:'Bergrettung',      tel:'140', icon:'🏔', farbe:'#d4a84b', desc:'Österreichische Bergrettung' },
    { name:'Ärztenotdienst',   tel:'141', icon:'🩺', farbe:'#4db84e', desc:'Österreich Notarzt' },
    { name:'Giftnotruf',       tel:'01 406 43 43', icon:'☠️', farbe:'#a04bc8', desc:'Wien – Vergiftungsnotfall' },
    { name:'AGES Tierseuchenhotline', tel:'0800 500 180', icon:'🐄', farbe:'#d4a84b', desc:'Kostenlos · Tierseuchen-Verdacht' },
  ];

  // Eigene Notfallkontakte = Kontakte mit notfall:true
  const eigenNotfall = liste.filter(([,k])=>k.notfall);

  return `
    <div class="page-header">
      <h2>📞 Kontakte</h2>
      ${aktTab==='kontakte' ? `<button class="btn-primary" onclick="showKontaktForm()">+ Kontakt</button>` : `<button class="btn-primary" onclick="showNotfallKontaktForm()">+ Notfall</button>`}
    </div>

    <!-- Tabs -->
    <div style="display:flex;gap:.4rem;margin-bottom:.8rem">
      <button class="filter-chip ${aktTab==='kontakte'?'active':''}" onclick="window._kontakteTab='kontakte';render()">📞 Kontakte</button>
      <button class="filter-chip ${aktTab==='notfall'?'active':''}" onclick="window._kontakteTab='notfall';render()" style="${eigenNotfall.length?'':''}">
        🚨 Notfall${eigenNotfall.length?` (${eigenNotfall.length})`:''}
      </button>
    </div>

    ${aktTab === 'kontakte' ? `
    <!-- KONTAKTE TAB -->
    ${kategorien.map(kat => {
      const gefiltert = liste.filter(([,k])=>k.kategorie===kat && !k.notfall);
      if(!gefiltert.length) return '';
      return `
        <div class="section-title">${kat}</div>
        <div class="card-list">
          ${gefiltert.map(([id,k])=>`
            <div class="list-card">
              <div class="list-card-left">
                <div>
                  <div class="list-card-title">${k.name}</div>
                  ${k.firma?`<div class="list-card-sub">${k.firma}</div>`:''}
                  ${k.notiz?`<div class="list-card-sub">${k.notiz}</div>`:''}
                </div>
              </div>
              <div class="list-card-right" style="gap:.4rem">
                ${k.tel?`<a href="tel:${k.tel}" class="btn-xs" style="text-decoration:none;background:var(--green);border-color:var(--green);color:#0a0800">📞</a>`:''}
                <button class="btn-xs" onclick="toggleNotfallKontakt('${id}',${k.notfall?'false':'true'})" title="Als Notfallkontakt markieren" style="font-size:.7rem">🚨</button>
                <button class="btn-xs-danger" onclick="deleteKontakt('${id}')">✕</button>
              </div>
            </div>`).join('')}
        </div>`;
    }).join('')}
    ${!liste.filter(([,k])=>!k.notfall).length ? `<div class="empty-state">Noch keine Kontakte erfasst</div>` : ''}
    ` : `

    <!-- NOTFALL TAB -->
    <div style="background:rgba(212,60,60,.08);border:1px solid rgba(212,60,60,.25);border-radius:var(--radius-sm);padding:.5rem .9rem;margin-bottom:.7rem;font-size:.75rem;color:#d44b4b">
      🚨 Alle Nummern mit einem Tap anrufen. Im Notfall zuerst 112 oder 144.
    </div>

    <!-- Vordefinierte Notrufnummern -->
    <div class="section-title" style="color:var(--red)">ÖSTERREICH – NOTRUFNUMMERN</div>
    <div style="display:flex;flex-direction:column;gap:.4rem;margin-bottom:.8rem">
      ${NOTFALL_VORDEFINIERT.map(n=>`
        <a href="tel:${n.tel.replace(/\s/g,'')}" style="text-decoration:none">
          <div style="display:flex;align-items:center;gap:.8rem;background:var(--bg3);border:1.5px solid ${n.farbe}44;border-radius:var(--radius-sm);padding:.6rem .9rem;transition:all .1s;active:opacity:.7">
            <div style="font-size:1.6rem;flex-shrink:0;width:36px;text-align:center">${n.icon}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:.88rem;font-weight:700;color:var(--text)">${n.name}</div>
              <div style="font-size:.7rem;color:var(--text3)">${n.desc}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0">
              <div style="font-size:1rem;font-weight:800;color:${n.farbe};letter-spacing:.03em">${n.tel}</div>
              <div style="background:${n.farbe};color:#fff;border-radius:8px;padding:2px 8px;font-size:.68rem;font-weight:700">📞 Anrufen</div>
            </div>
          </div>
        </a>`).join('')}
    </div>

    <!-- Eigene Notfallkontakte -->
    <div class="section-title" style="color:var(--gold)">EIGENE NOTFALLKONTAKTE</div>
    ${eigenNotfall.length ? `
    <div style="display:flex;flex-direction:column;gap:.4rem;margin-bottom:.8rem">
      ${eigenNotfall.map(([id,k])=>`
        <div style="display:flex;align-items:center;gap:.8rem;background:var(--bg3);border:1.5px solid rgba(212,168,75,.3);border-radius:var(--radius-sm);padding:.6rem .9rem">
          <div style="font-size:1.4rem;flex-shrink:0">👤</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:.88rem;font-weight:700;color:var(--text)">${k.name}</div>
            ${k.firma?`<div style="font-size:.7rem;color:var(--text3)">${k.firma}</div>`:''}
            ${k.notiz?`<div style="font-size:.7rem;color:var(--text3)">${k.notiz}</div>`:''}
          </div>
          <div style="display:flex;gap:.4rem;flex-shrink:0;align-items:center">
            ${k.tel?`<a href="tel:${k.tel.replace(/\s/g,'')}" style="text-decoration:none">
              <div style="background:var(--green);color:#0a0800;border-radius:8px;padding:4px 10px;font-size:.78rem;font-weight:700">📞 ${k.tel}</div>
            </a>`:'<span style="font-size:.7rem;color:var(--text3)">Keine Nummer</span>'}
            <button class="btn-xs-danger" onclick="toggleNotfallKontakt('${id}',false)" title="Aus Notfall entfernen">✕</button>
          </div>
        </div>`).join('')}
    </div>` : `
    <div style="text-align:center;color:var(--text3);font-size:.82rem;padding:1rem">
      Noch keine eigenen Notfallkontakte.<br>
      <span style="font-size:.75rem">Im Kontakte-Tab auf 🚨 tippen um Kontakt als Notfall zu markieren.</span>
    </div>`}

    <button class="btn-secondary btn-block" style="margin-top:.5rem" onclick="showNotfallKontaktForm()">+ Eigenen Notfallkontakt hinzufügen</button>
    `}

    <!-- Kontakt-Formular -->
    <div id="kontakt-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>Kontakt erfassen</h3><button class="close-btn" onclick="closeForm('kontakt-overlay')">✕</button></div>
        <div class="form-body">
          <select id="k-kategorie" class="inp">
            ${kategorien.map(k=>`<option value="${k}">${k}</option>`).join('')}
          </select>
          <input id="k-name"   class="inp" placeholder="Name *" />
          <input id="k-firma"  class="inp" placeholder="Praxis / Firma / Behörde" />
          <input id="k-tel"    class="inp" placeholder="Telefonnummer" inputmode="tel" type="tel" />
          <textarea id="k-notiz" class="inp" rows="2" placeholder="Notizen (z.B. Notfalldienst, Sprechzeiten)"></textarea>
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('kontakt-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveKontakt()">Speichern</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Notfall-Kontakt Formular -->
    <div id="notfall-kontakt-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>🚨 Notfallkontakt hinzufügen</h3><button class="close-btn" onclick="closeForm('notfall-kontakt-overlay')">✕</button></div>
        <div class="form-body">
          <input id="nk-name"  class="inp" placeholder="Name * (z.B. Tierarzt Dr. Mayr)" />
          <input id="nk-firma" class="inp" placeholder="Praxis / Firma" />
          <input id="nk-tel"   class="inp" placeholder="Telefonnummer *" inputmode="tel" type="tel" />
          <textarea id="nk-notiz" class="inp" rows="2" placeholder="Notiz (z.B. Notfalldienst Sa/So)"></textarea>
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('notfall-kontakt-overlay')">Abbrechen</button>
            <button class="btn-primary" style="background:var(--red);border-color:var(--red)" onclick="saveNotfallKontakt()">🚨 Speichern</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.showKontaktForm = function() {
  const ov = document.getElementById('kontakt-overlay');
  if(!ov){navigate('kontakte');setTimeout(()=>showKontaktForm(),150);return;}
  ov.style.display='flex';
};

window.showNotfallKontaktForm = function() {
  const ov = document.getElementById('notfall-kontakt-overlay');
  if(!ov){navigate('kontakte');setTimeout(()=>{window._kontakteTab='notfall';render();setTimeout(showNotfallKontaktForm,150);},150);return;}
  ov.style.display='flex';
};

window.saveKontakt = async function() {
  const name = document.getElementById('k-name')?.value.trim();
  if(!name){alert('Name Pflicht');return;}
  await push(ref(db,'kontakte'), {
    kategorie: document.getElementById('k-kategorie')?.value,
    name,
    firma:  document.getElementById('k-firma')?.value.trim(),
    tel:    document.getElementById('k-tel')?.value.trim(),
    notiz:  document.getElementById('k-notiz')?.value.trim(),
    notfall: false,
    createdAt: Date.now()
  });
  closeForm('kontakt-overlay');
};

window.saveNotfallKontakt = async function() {
  const name = document.getElementById('nk-name')?.value.trim();
  const tel  = document.getElementById('nk-tel')?.value.trim();
  if(!name){alert('Name Pflicht');return;}
  await push(ref(db,'kontakte'), {
    kategorie: 'Sonstige',
    name, tel,
    firma: document.getElementById('nk-firma')?.value.trim(),
    notiz: document.getElementById('nk-notiz')?.value.trim(),
    notfall: true,
    createdAt: Date.now()
  });
  closeForm('notfall-kontakt-overlay');
  showSaveToast && showSaveToast('Notfallkontakt gespeichert');
};

window.toggleNotfallKontakt = async function(id, aktiv) {
  await update(ref(db,'kontakte/'+id), {notfall: aktiv});
  showSaveToast && showSaveToast(aktiv ? '🚨 Als Notfallkontakt markiert' : 'Aus Notfall entfernt');
};

window.deleteKontakt = async function(id) {
  if(confirm('Kontakt löschen?')) await remove(ref(db,'kontakte/'+id));
};


// ══════════════════════════════════════════════════════════════════════════════
//  GRUPPEN-VERWALTUNG
// ══════════════════════════════════════════════════════════════════════════════
function renderGruppen() {
  const gruppenListe = Object.entries(gruppen).sort((a,b)=>a[1].name?.localeCompare(b[1].name));
  const aktiveGruppe = window._gruppeEdit||null;
  const gruppeKuehe = aktiveGruppe ? Object.entries(kuehe).filter(([,k])=>k.gruppe===aktiveGruppe) : [];
  const ohneGruppe = Object.entries(kuehe).filter(([,k])=>!k.gruppe||k.gruppe==='').sort((a,b)=>parseInt(a[1].nr)-parseInt(b[1].nr));

  return `
    <div class="page-header"><h2>🏷 Gruppen</h2><button class="btn-primary" onclick="showGruppeForm()">+ Gruppe</button></div>
    <p style="font-size:.8rem;color:var(--text3);margin-bottom:.8rem">
      Tipp: Gruppe antippen → Kühe zuweisen. Oder beim Kuh bearbeiten (✎) direkt Gruppe wählen.
    </p>
    <div class="card-list" style="margin-bottom:.8rem">
      ${gruppenListe.length ? gruppenListe.map(([id,g])=>{
        const anzahl = Object.values(kuehe).filter(k=>k.gruppe===g.name).length;
        const isActive = aktiveGruppe===g.name;
        return `<div class="list-card ${isActive?'':''}" style="border-left:3px solid ${g.farbe||'#5ba85c'}${isActive?';border-color:'+g.farbe:''}" onclick="toggleGruppeEdit('${g.name}')">
          <div class="list-card-left">
            <div style="width:12px;height:12px;border-radius:50%;background:${g.farbe||'#5ba85c'};flex-shrink:0"></div>
            <div>
              <div class="list-card-title">${g.name} ${isActive?'<span style="color:var(--gold)">▼</span>':''}</div>
              <div class="list-card-sub">${anzahl} Kühe${g.beschreibung?' · '+g.beschreibung:''}</div>
            </div>
          </div>
          <div class="list-card-right" onclick="event.stopPropagation()">
            <button class="btn-xs" onclick="navigate('kontrolle');setTimeout(()=>filterKontrolleGruppe('${g.name}'),200)">Zählen</button>
            <button class="btn-xs-danger" onclick="deleteGruppe('${id}','${g.name}')">✕</button>
          </div>
        </div>
        ${isActive ? `
        <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:.8rem;margin-top:-.3rem;margin-bottom:.4rem">
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:.5rem;letter-spacing:1px">KÜHE IN DIESER GRUPPE</div>
          ${gruppeKuehe.length?gruppeKuehe.map(([kid,k])=>`
            <div class="list-card list-card-sm" style="margin-bottom:.3rem">
              <span class="nr-badge">#${k.nr}</span>
              <span class="list-card-title">${k.name||'–'}</span>
              <button class="btn-xs-danger" onclick="setKuhGruppe('${kid}','')">entfernen</button>
            </div>`).join(''):`<div style="font-size:.8rem;color:var(--text3);padding:.3rem 0">Noch keine Kühe zugewiesen</div>`}
          
          ${ohneGruppe.length?`
          <div style="font-size:.72rem;color:var(--text3);margin:.6rem 0 .4rem;letter-spacing:1px">HINZUFÜGEN (ohne Gruppe)</div>
          <div style="display:flex;flex-wrap:wrap;gap:.3rem">
            ${ohneGruppe.map(([kid,k])=>`
              <button class="kuh-chip" onclick="setKuhGruppe('${kid}','${g.name}')">
                <span class="chip-nr">#${k.nr}</span>
                ${k.name?`<span class="chip-kuh">${k.name}</span>`:''}
              </button>`).join('')}
          </div>`:'<div style="font-size:.75rem;color:var(--text3);margin-top:.4rem">Alle Kühe haben bereits eine Gruppe</div>'}
        </div>` : ''}`;
      }).join('') : `<div class="empty-state">Noch keine Gruppen – jetzt anlegen</div>`}
    </div>
    <div id="gruppe-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>Gruppe anlegen</h3><button class="close-btn" onclick="closeForm('gruppe-overlay')">✕</button></div>
        <div class="form-body">
          <input id="g-name" class="inp" placeholder="Gruppenname *" />
          <input id="g-beschreibung" class="inp" placeholder="Beschreibung (z.B. Hochweide, Bauer Mayr)" />
          <label class="inp-label">Farbe</label>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.4rem">
            ${['#5ba85c','#e8a045','#4a90c4','#c84040','#9b59b6','#1abc9c','#e67e22','#34495e'].map(f=>`
              <button onclick="selectFarbe('${f}',this)" class="farb-btn" style="width:28px;height:28px;border-radius:50%;background:${f};border:2px solid transparent;cursor:pointer"></button>`).join('')}
          </div>
          <input id="g-farbe" type="hidden" value="#5ba85c" />
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('gruppe-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveGruppe()">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
window.showGruppeForm = function() {
  const ov = document.getElementById('gruppe-overlay');
  if(!ov){navigate('gruppen');setTimeout(()=>showGruppeForm(),150);return;}
  ov.style.display='flex';
};
window.selectFarbe = function(f, btn) {
  document.getElementById('g-farbe').value = f;
  document.querySelectorAll('.farb-btn').forEach(b=>b.style.border='2px solid transparent');
  btn.style.border='2px solid #fff';
};
window.toggleGruppeEdit = function(name) {
  window._gruppeEdit = window._gruppeEdit===name ? null : name;
  render();
};
window.setKuhGruppe = async function(kuhId, gruppe) {
  await update(ref(db,'kuehe/'+kuhId), {gruppe, updatedAt:Date.now()});
};
window.saveGruppe = async function() {
  const name = document.getElementById('g-name')?.value.trim();
  if(!name){alert('Gruppenname eingeben');return;}
  const farbe = document.getElementById('g-farbe')?.value || '#5ba85c';
  const beschreibung = document.getElementById('g-beschreibung')?.value.trim() || '';
  try {
    await push(ref(db,'gruppen'), {name, beschreibung, farbe, createdAt: Date.now()});
    closeForm('gruppe-overlay');
  } catch(e) {
    alert('Fehler beim Speichern: ' + e.message);
  }
};
window.deleteGruppe = async function(id, name) {
  if(!confirm(`Gruppe "${name}" löschen?`)) return;
  await remove(ref(db,'gruppen/'+id));
};

// ══════════════════════════════════════════════════════════════════════════════
//  TÄGLICHE KONTROLLE
// ══════════════════════════════════════════════════════════════════════════════
function renderKontrolle() {
  const heute = isoDate(new Date());
  // Heutige Kontrolle aus zaehlung
  const anwesend = zaehlSession?.anwesend || {};
  const gruppenListe = Object.entries(gruppen).sort((a,b)=>a[1].name?.localeCompare(b[1].name));
  
  // Aktive Gruppe filtern
  const aktiveGruppe = window._kontrolleGruppe || '';
  const kuhListe = Object.entries(kuehe)
    .filter(([,k]) => k.almStatus === 'oben' && (!aktiveGruppe || k.gruppe === aktiveGruppe))
    .sort((a,b) => {
      const nA = parseInt(a[1].nr)||0, nB = parseInt(b[1].nr)||0;
      return nA - nB;
    });
  
  const anwCount = kuhListe.filter(([id]) => anwesend[id]).length;
  const total = kuhListe.length;
  const voll = total > 0 && anwCount === total;
  const fehlend = kuhListe.filter(([id]) => !anwesend[id]);

  return `
    <div class="page-header">
      <h2>🔍 Tägliche Kontrolle</h2>
      ${zaehlSession?`<button class="btn-ghost" onclick="resetZaehlung()">↺ Reset</button>`:''}
    </div>

    <!-- Gruppen-Filter -->
    ${gruppenListe.length ? `
    <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.8rem">
      <button class="filter-chip ${!aktiveGruppe?'active':''}" onclick="filterKontrolleGruppe('')">Alle</button>
      ${gruppenListe.map(([,g])=>`
        <button class="filter-chip ${aktiveGruppe===g.name?'active':''}" onclick="filterKontrolleGruppe('${g.name}')">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${g.farbe||'#5ba85c'};margin-right:4px"></span>${g.name}
        </button>`).join('')}
    </div>` : ''}

    <!-- Status -->
    <div class="zaehlung-status ${voll?'z-voll':''}">
      <div class="z-counts">
        <span class="z-big">${anwCount}</span>
        <span class="z-sep">/</span>
        <span class="z-total">${total}</span>
      </div>
      <div style="font-size:.75rem;color:var(--text3);margin-top:2px">${aktiveGruppe?`Gruppe: ${aktiveGruppe}`:'Alle Tiere auf der Alm'}</div>
      ${voll ? `<div class="z-voll-msg">✓ Alle da!</div>` : `<div class="z-fehlt-msg">${total-anwCount} fehlen</div>`}
    </div>

    ${!zaehlSession ? `
      <button class="btn-primary btn-block" onclick="startZaehlung()">Kontrolle starten</button>
    ` : `
    <!-- Eingabe -->
    <div class="zaehlung-eingabe">
      <input id="z-input" class="inp z-inp" placeholder="Nummer eingeben…"
        onkeydown="if(event.key==='Enter')zaehlKuh(this.value)"
        autocomplete="off" inputmode="numeric" autofocus />
      <button class="ok-btn" onclick="zaehlKuh(document.getElementById('z-input').value)">✓</button>
    </div>

    <!-- Fehlende Tiere antippen -->
    ${fehlend.length && fehlend.length <= 50 ? `
    <div class="section-title">Noch nicht kontrolliert – antippen</div>
    <div class="kuh-chips">
      ${fehlend.map(([id,k])=>`
        <button class="kuh-chip" onclick="zaehlKuhById('${id}')">
          <span class="chip-nr">#${k.nr}</span>
          ${k.name?`<span class="chip-kuh">${k.name}</span>`:''}
          ${k.gruppe?`<span style="font-size:.65rem;color:var(--text3);margin-left:2px">${k.gruppe}</span>`:''}
        </button>`).join('')}
    </div>` : fehlend.length > 50 ? `
    <div style="font-size:.8rem;color:var(--text3);margin:.5rem 0">${fehlend.length} Tiere noch nicht kontrolliert</div>` : ''}

    <!-- Bereits kontrolliert -->
    <div class="section-title">Kontrolliert (${anwCount})</div>
    <div class="card-list">
      ${kuhListe.filter(([id])=>anwesend[id]).map(([id,k])=>`
        <div class="list-card list-card-sm">
          <span class="nr-badge">#${k.nr}</span>
          <span class="list-card-title">${k.name||''}</span>
          ${k.gruppe?`<span class="tag tag-gray" style="font-size:.65rem">${k.gruppe}</span>`:''}
          <button class="remove-btn" onclick="entferneZaehlung('${id}')">✕</button>
        </div>`).join('')}
    </div>
    <button class="btn-secondary btn-block" style="margin-top:.8rem" onclick="resetZaehlung()">✓ Zählung abschließen & speichern</button>
    `}

    <!-- Verlauf -->
    ${Object.keys(zaehlVerlauf).length?`
    <div class="section-title" style="margin-top:1rem">Verlauf</div>
    <div class="card-list">
      ${Object.entries(zaehlVerlauf).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,14).map(([datum,z])=>`
        <div class="list-card list-card-sm">
          <div>
            <div class="list-card-title">${new Date(datum+'T12:00').toLocaleDateString('de-AT',{weekday:'short',day:'numeric',month:'short'})}</div>
          </div>
          <span class="${z.vollzaehlig?'tag tag-green':'tag tag-red'}">${z.anwCount}/${z.total} ${z.vollzaehlig?'✓ vollzählig':'fehlen'}</span>
          <button class="btn-xs-danger" onclick="deleteZaehlVerlauf('${datum}')">✕</button>
        </div>`).join('')}
    </div>`:''}
  `;
}

window.filterKontrolleGruppe = function(g) {
  window._kontrolleGruppe = g;
  if(currentView !== 'kontrolle') navigate('kontrolle');
  else render();
};


// ══════════════════════════════════════════════════════════════
//  FOTO-VERWALTUNG
// ══════════════════════════════════════════════════════════════

// Globale Bild-Komprimierung: max 800px, JPEG 0.75 → ~100-150KB
function komprimiereBild(file, callback) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const MAX = 800;
      let w = img.width, h = img.height;
      if(w > MAX || h > MAX) {
        if(w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

window.uploadFoto = function(kuhId, input) {
  const file = input.files[0];
  if(!file) return;
  komprimiereBild(file, async function(data) {
    await set(ref(db,'fotos/'+kuhId), { data, updatedAt: Date.now() });
  });
};
window.deleteFoto = async function(kuhId) {
  if(confirm('Foto löschen?')) await remove(ref(db,'fotos/'+kuhId));
};

// ══════════════════════════════════════════════════════════════
//  KALENDER
// ══════════════════════════════════════════════════════════════
function renderKalender() {
  const heute = Date.now();
  const in60 = heute + 60*86400000;

  // ── Kategorie-Definitionen (Farbe + Label) ──
  const KATEGORIEN = {
    wartezeit:   { farbe:'#d4844b', label:'Wartezeit',        icon:'⚕' },
    folge:       { farbe:'#d44b4b', label:'Folgebehandlung',   icon:'🩺' },
    geburt:      { farbe:'#4db84e', label:'Geburt',            icon:'🐄' },
    trocken:     { farbe:'#4ab8e8', label:'Trockenstellung',   icon:'💧' },
    erinnerung:  { farbe:'#d4a84b', label:'Trächtigkeitsprüfung', icon:'🔔' },
    weide:       { farbe:'#4db84e', label:'Weide',             icon:'🌿' },
    tierarzt:    { farbe:'#4ab8e8', label:'Tierarzt',          icon:'🩺' },
    kontrolle:   { farbe:'#d4844b', label:'AMA/Kontrolle',     icon:'📋' },
    wartung:     { farbe:'#a04bc8', label:'Wartung',           icon:'🔧' },
    sonstiges:   { farbe:'#d4a84b', label:'Sonstiges',         icon:'📌' },
  };

  const katFilter = window._kalKatFilter || '';
  const termine = [];

  // Automatische Termine
  Object.entries(behandlungen).forEach(([id,b]) => {
    const k=kuehe[b.kuhId];
    if(b.wartezeitEnde && !b.warteAbgeschlossen)
      termine.push({ ts:b.wartezeitEnde, typ:'wartezeit', label:'Wartezeit: '+(b.medikament||''), kuh:'#'+(k?.nr||'')+' '+(k?.name||''), id, dbPath:'behandlungen/'+id });
    if(b.folgeTermin && !b.folgeErledigt)
      termine.push({ ts:b.folgeTermin, typ:'folge', label:'Folgebehandlung: '+(b.diagnose||''), kuh:'#'+(k?.nr||'')+' '+(k?.name||''), id, dbPath:'behandlungen/'+id });
  });
  Object.entries(besamungen).forEach(([id,b]) => {
    const k=kuehe[b.kuhId];
    if(b.erwartetGeburt && b.status==='tragend')
      termine.push({ ts:b.erwartetGeburt, typ:'geburt', label:'Geburt erwartet', kuh:'#'+(k?.nr||'')+' '+(k?.name||''), id, dbPath:'besamungen/'+id });
    if(b.trockenstell && b.status==='tragend')
      termine.push({ ts:b.trockenstell, typ:'trocken', label:'Trockenstellung', kuh:'#'+(k?.nr||'')+' '+(k?.name||''), id, dbPath:'besamungen/'+id });
    if(b.erinnerungDatum && !b.erinnerungErledigt)
      termine.push({ ts:b.erinnerungDatum, typ:'erinnerung', label:'Trächtigkeitsprüfung', kuh:'#'+(k?.nr||'')+' '+(k?.name||''), id, dbPath:'besamungen/'+id });
  });
  const heuteDatum=isoDate(new Date());
  Object.values(weideTage).forEach(w => {
    if(w.datum===heuteDatum)
      termine.push({ ts:Date.now(), typ:'weide', label:'Weide: '+(weiden[w.weideId]?.name||w.weideText||''), kuh:(w.kuhIds?.length||0)+' Tiere' });
  });

  // Manuelle Termine mit Kategorie
  Object.entries(kalenderTermine).forEach(([id,t]) => {
    if(!t.erledigt) {
      const lsKey = 'kalErinnerung_manuell_'+id;
      const lsData = JSON.parse(localStorage.getItem(lsKey)||'null');
      const erin = t.erinnerungTage||(lsData?lsData.tage:0)||0;
      const typ = t.kategorie||'sonstiges';
      termine.push({ ts:t.datum, typ, label:t.titel, kuh:t.notiz||'', id, manuell:true, dbPath:'kalenderTermine/'+id, erinnerung:erin });
    }
  });

  // Filter anwenden
  const gefiltertTermine = katFilter ? termine.filter(t=>t.typ===katFilter) : termine;
  gefiltertTermine.sort((a,b)=>a.ts-b.ts);
  const vergangen = gefiltertTermine.filter(t=>t.ts<heute);
  const bald      = gefiltertTermine.filter(t=>t.ts>=heute && t.ts<=in60);
  const spaeter   = gefiltertTermine.filter(t=>t.ts>in60);

  // Welche Kategorien kommen vor?
  const vorhandeneKats = [...new Set(termine.map(t=>t.typ))];

  const renderTermin = function(t) {
    const kat = KATEGORIEN[t.typ] || KATEGORIEN.sonstiges;
    const lsKey = 'kalErinnerung_'+(t.typ)+'_'+(t.id||(t.dbPath||'').replace(/\//g,'_'));
    const lsData = JSON.parse(localStorage.getItem(lsKey)||'null');
    const aktErin = t.erinnerung||(lsData?lsData.tage:0)||0;
    const opts = [{tage:0,label:'Keine'},{tage:1,label:'1 Tag'},{tage:3,label:'3 Tage'},{tage:7,label:'7 Tage'}];
    const diffD = t.ts<heute ? -Math.floor((heute-t.ts)/86400000) : Math.ceil((t.ts-heute)/86400000);
    const diffColor = t.ts<heute?'var(--red)':diffD<=3?'var(--orange)':'var(--text3)';

    return '<div class="list-card" style="flex-direction:column;align-items:stretch;gap:.3rem;padding-left:.6rem;border-left:none;position:relative;overflow:hidden">'+
      // Farbiger linker Rand
      '<div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:'+kat.farbe+';border-radius:2px 0 0 2px"></div>'+
      '<div style="display:flex;align-items:center;gap:.5rem">'+
        // Farbiger Punkt + Kategorie-Label
        '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;min-width:44px">'+
          '<span style="font-size:1rem">'+kat.icon+'</span>'+
          '<span style="font-size:.55rem;font-weight:700;color:'+kat.farbe+';text-transform:uppercase;letter-spacing:.04em;text-align:center;line-height:1.1;max-width:44px">'+kat.label+'</span>'+
        '</div>'+
        '<div style="flex:1;min-width:0">'+
          '<div class="list-card-title">'+t.label+'</div>'+
          (t.kuh?'<div class="list-card-sub">'+t.kuh+'</div>':'')+
          '<div style="font-size:.7rem;color:var(--text3)">'+new Date(t.ts).toLocaleDateString('de-AT',{weekday:'short',day:'numeric',month:'short',year:'numeric'})+'</div>'+
        '</div>'+
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:.2rem;flex-shrink:0">'+
          '<span style="font-size:.72rem;font-weight:700;color:'+diffColor+'">'+
            (t.ts<heute?'vor '+Math.abs(diffD)+'d':'in '+diffD+'d')+
          '</span>'+
          (t.manuell?'<button class="btn-xs-danger" onclick="deleteKalenderTermin(\''+t.id+'\')">✕</button>':'')+
        '</div>'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:.4rem;padding-top:.25rem;border-top:1px solid var(--border)">'+
        '<span style="font-size:.65rem;color:var(--text3);white-space:nowrap">🔔</span>'+
        '<div style="display:flex;gap:.2rem;flex-wrap:wrap">'+
          opts.map(function(o){
            const active=aktErin===o.tage?'active':'';
            return '<button class="filter-chip '+active+'" style="font-size:.63rem;padding:.12rem .45rem" data-id="'+(t.id||'')+'" data-dp="'+(t.dbPath||'')+'" data-tage="'+o.tage+'" data-typ="'+(t.typ||'')+'" onclick="setKalenderErinnerungBtn(this)">'+o.label+'</button>';
          }).join('')+
        '</div>'+
      '</div>'+
    '</div>';
  };

  // Kategorie-Filter Chips
  const filterChips =
    '<div style="display:flex;gap:.3rem;flex-wrap:wrap;margin-bottom:.7rem">'+
      '<button class="filter-chip '+(katFilter===''?'active':'')+'" onclick="window._kalKatFilter=\'\';render()">Alle ('+termine.length+')</button>'+
      vorhandeneKats.map(function(k){
        const kat=KATEGORIEN[k]||KATEGORIEN.sonstiges;
        const count=termine.filter(function(t){return t.typ===k;}).length;
        return '<button class="filter-chip '+(katFilter===k?'active':'')+'" onclick="window._kalKatFilter=\''+k+'\';render()" style="'+(katFilter===k?'':'border-color:'+kat.farbe+'44')+'">'+
          '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:'+kat.farbe+';margin-right:3px;vertical-align:middle"></span>'+
          kat.label+' ('+count+')'+
        '</button>';
      }).join('')+
    '</div>';


  return '<div class="page-header"><h2>📅 Kalender</h2><button class="btn-primary" onclick="showKalenderForm()">+ Termin</button></div>'+
    '<div style="background:rgba(212,168,75,.07);border:1px solid rgba(212,168,75,.2);border-radius:var(--radius-sm);padding:.5rem .8rem;margin-bottom:.7rem;font-size:.75rem;color:var(--text2)">🔔 Erinnerungen werden als Push-Notification geliefert – Benachrichtigungen müssen erlaubt sein.</div>'+
    (vergangen.length?'<div class="section-title" style="color:var(--red)">Überfällig ('+vergangen.length+')</div><div class="card-list">'+vergangen.slice(0,10).map(renderTermin).join('')+'</div>':'')+
    '<div class="section-title">Nächste 60 Tage ('+bald.length+')</div>'+
    (bald.length?'<div class="card-list">'+bald.map(renderTermin).join('')+'</div>':'<div class="empty-state">Keine Termine</div>')+
    (spaeter.length?'<div class="section-title">Später</div><div class="card-list">'+spaeter.slice(0,10).map(renderTermin).join('')+'</div>':'')+
    '<div id="kalender-overlay" class="form-overlay" style="display:none">'+
      '<div class="form-sheet">'+
        '<div class="form-header"><h3>Termin erfassen</h3><button class="close-btn" onclick="closeForm(\'kalender-overlay\')">✕</button></div>'+
        '<div class="form-body">'+
          '<input id="kt-titel" class="inp" placeholder="Titel * (z.B. Tierarztbesuch, AMA-Kontrolle)" />'+
          '<label class="inp-label">Datum</label>'+
          '<input id="kt-datum" class="inp" type="date" value="'+isoDate(new Date())+'" />'+
          '<label class="inp-label">🔔 Erinnerung</label>'+
          '<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.5rem">'+
            '<button type="button" class="filter-chip active" onclick="selectKtErinnerung(0,this)">Keine</button>'+
            '<button type="button" class="filter-chip" onclick="selectKtErinnerung(1,this)">1 Tag vorher</button>'+
            '<button type="button" class="filter-chip" onclick="selectKtErinnerung(3,this)">3 Tage vorher</button>'+
            '<button type="button" class="filter-chip" onclick="selectKtErinnerung(7,this)">1 Woche vorher</button>'+
          '</div>'+
          '<input type="hidden" id="kt-erinnerung" value="0" />'+
          '<textarea id="kt-notiz" class="inp" rows="2" placeholder="Notiz (optional)"></textarea>'+
          '<div class="form-actions">'+
            '<button class="btn-secondary" onclick="closeForm(\'kalender-overlay\')">Abbrechen</button>'+
            '<button class="btn-primary" onclick="saveKalenderTermin()">Speichern</button>'+
          '</div>'+
        '</div>'+
      '</div>'+
    '</div>';
}

window.selectKtKategorie = function(kat, btn) {
  document.getElementById('kt-kategorie').value = kat;
  document.querySelectorAll('#kt-kat-chips .filter-chip').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');
};

window.selectKtErinnerung = function(tage, btn) {
  document.getElementById('kt-erinnerung').value = tage;
  document.querySelectorAll('#kalender-overlay .filter-chip').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');
};
window.showKalenderForm = function() {
  const ov = document.getElementById('kalender-overlay');
  if(!ov){navigate('kalender');setTimeout(function(){showKalenderForm();},150);return;}
  ov.style.display='flex';
};
window.saveKalenderTermin = async function() {
  const titel = document.getElementById('kt-titel')?.value.trim();
  const datum = document.getElementById('kt-datum')?.value;
  if(!titel||!datum){alert('Titel und Datum Pflicht');return;}
  const erinnerungTage = parseInt(document.getElementById('kt-erinnerung')?.value)||0;
  const kategorie = document.getElementById('kt-kategorie')?.value||'sonstiges';
  const id = await push(ref(db,'kalenderTermine'),{
    titel, datum: new Date(datum+'T12:00').getTime(),
    notiz: document.getElementById('kt-notiz')?.value.trim()||'',
    erledigt: false, erinnerungTage, kategorie, createdAt: Date.now()
  });
  if(erinnerungTage>0 && id?.key) {
    localStorage.setItem('kalErinnerung_manuell_'+id.key, JSON.stringify({tage:erinnerungTage,dbPath:'kalenderTermine/'+id.key,id:id.key,typ:'manuell'}));
  }
  closeForm('kalender-overlay');
  showSaveToast&&showSaveToast('Termin gespeichert'+(erinnerungTage?' · Erinnerung '+erinnerungTage+'d vorher':''));
};
window.deleteKalenderTermin = async function(id) {
  if(confirm('Termin löschen?')) { await remove(ref(db,'kalenderTermine/'+id)); localStorage.removeItem('kalErinnerung_manuell_'+id); }
};
window.setKalenderErinnerungBtn = function(btn) {
  const id = btn.dataset.id||'';
  const dp = btn.dataset.dp||'';
  const tage = parseInt(btn.dataset.tage)||0;
  const typ = btn.dataset.typ||'';
  setKalenderErinnerung(id, dp, tage, btn, typ);
};

window.setKalenderErinnerung = function(id, dbPath, tage, btn, typ) {
  const row = btn.closest('.list-card');
  if(row) row.querySelectorAll('.filter-chip').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');
  const key = 'kalErinnerung_'+typ+'_'+(id||(dbPath||'').replace(/\//g,'_'));
  if(dbPath && dbPath.startsWith('kalenderTermine/') && id) update(ref(db,dbPath),{erinnerungTage:tage});
  if(tage>0) { localStorage.setItem(key, JSON.stringify({tage,dbPath,id,typ})); showSaveToast&&showSaveToast('Erinnerung: '+tage+' Tag'+(tage>1?'e':'+')+' vorher'); }
  else { localStorage.removeItem(key); showSaveToast&&showSaveToast('Erinnerung deaktiviert'); }
};
window.checkKalenderErinnerungen = function() {
  if(!('Notification' in window)||Notification.permission!=='granted') return;
  const heute = Date.now();
  const heuteTag = new Date(heute); heuteTag.setHours(0,0,0,0);
  for(let i=0;i<localStorage.length;i++) {
    const key=localStorage.key(i);
    if(!key||!key.startsWith('kalErinnerung_')) continue;
    try {
      const data=JSON.parse(localStorage.getItem(key)||'null');
      if(!data) continue;
      let terminTs=null, label='';
      if(data.dbPath) {
        if(data.dbPath.startsWith('kalenderTermine/')) { const t=kalenderTermine[data.id]; if(t&&!t.erledigt){terminTs=t.datum;label=t.titel;} }
        else if(data.dbPath.startsWith('behandlungen/')) { const b=behandlungen[data.id]; if(b){terminTs=b.folgeTermin||b.wartezeitEnde;label='Behandlung: '+(b.diagnose||b.medikament||'');} }
        else if(data.dbPath.startsWith('besamungen/')) { const b=besamungen[data.id]; if(b){if(data.typ==='geburt'){terminTs=b.erwartetGeburt;label='Geburt: '+(kuehe[b.kuhId]?.name||'');}else if(data.typ==='trocken'){terminTs=b.trockenstell;label='Trockenstellung: '+(kuehe[b.kuhId]?.name||'');}}}
      }
      if(!terminTs||!label) continue;
      const terminTag=new Date(terminTs); terminTag.setHours(0,0,0,0);
      const diffTage=Math.round((terminTag.getTime()-heuteTag.getTime())/86400000);
      if(diffTage===data.tage) {
        const notifKey='kalNotifSent_'+key+'_'+isoDate(new Date());
        if(localStorage.getItem(notifKey)) continue;
        swNotify('📅 Termin in '+data.tage+' Tag'+(data.tage>1?'en':''),{body:label,icon:'./icon-192.png',tag:key});
        localStorage.setItem(notifKey,'1');
      }
    } catch(e){}
  }
};

// ══════════════════════════════════════════════════════════════
//  WEIDEGANG STATISTIK
// ══════════════════════════════════════════════════════════════
function renderStatistik() {
  // Trigger animations after render
  setTimeout(() => {
    document.querySelectorAll('.stat-bar-fill').forEach(bar => {
      bar.style.transition = 'width 1.2s cubic-bezier(.16,1,.3,1)';
      bar.style.width = bar.dataset.target;
    });
    document.querySelectorAll('.stat-count-up').forEach(el => {
      const target = parseInt(el.dataset.target)||0;
      let current = 0;
      const step = Math.ceil(target/40);
      const timer = setInterval(()=>{
        current = Math.min(current+step, target);
        el.textContent = Math.round(current);
        if(current>=target) clearInterval(timer);
      }, 30);
    });
  }, 100);

  const wTageListe = Object.values(weideTage).sort((a,b)=>a.datum?.localeCompare(b.datum));
  const weidenListe = Object.entries(weiden);
  
  // Tage pro Weide
  const proWeide = {};
  weidenListe.forEach(([id,w])=>{ proWeide[id]={name:w.name, farbe:w.farbe||'#5ba85c', tage:0, tiere:0}; });
  wTageListe.forEach(w=>{
    if(!proWeide[w.weideId]) proWeide[w.weideId]={name:w.weideText||'Unbekannt',farbe:'#888',tage:0,tiere:0};
    proWeide[w.weideId].tage++;
    proWeide[w.weideId].tiere += (w.kuhIds?.length||0);
  });
  
  // Tage pro Kuh (Weide)
  const proKuh = {};
  wTageListe.forEach(w=>{
    (w.kuhIds||[]).forEach(id=>{
      if(!proKuh[id]) proKuh[id]=0;
      proKuh[id]++;
    });
  });
  
  // Milchstatistik
  const milchListe = Object.values(milchEintraege).sort((a,b)=>a.datum-b.datum);
  const milchGesamt = milchListe.reduce((s,m)=>s+(m.gesamt||0),0);
  const milchMorgen = milchListe.filter(m=>m.zeit==='morgen').reduce((s,m)=>s+(m.gesamt||0),0);
  const milchAbend = milchListe.filter(m=>m.zeit==='abend').reduce((s,m)=>s+(m.gesamt||0),0);
  const milchMolkerei = milchListe.filter(m=>m.molkerei).reduce((s,m)=>s+(m.gesamt||0),0);
  
  const maxTage = Math.max(...Object.values(proWeide).map(w=>w.tage), 1);

  // ── Milchkurve: Tagessummen der letzten 30 Einträge ──
  const tagesMilch = {};
  milchListe.forEach(m => {
    const tag = m.datum ? new Date(m.datum).toISOString().slice(0,10) : null;
    if(tag) tagesMilch[tag] = (tagesMilch[tag]||0) + (m.gesamt||0);
  });
  const kurvenDaten = Object.entries(tagesMilch).sort((a,b)=>a[0].localeCompare(b[0])).slice(-30);
  const maxL = Math.max(...kurvenDaten.map(([,v])=>v), 1);
  const kW = 320, kH = 80;
  let kurveSvg = '';
  if(kurvenDaten.length >= 2) {
    const pts = kurvenDaten.map(([,v],i) => {
      const x = Math.round(i * (kW-20) / (kurvenDaten.length-1)) + 10;
      const y = Math.round(kH - 10 - (v/maxL) * (kH-20));
      return `${x},${y}`;
    }).join(' ');
    const areaBase = kurvenDaten.map(([,v],i) => {
      const x = Math.round(i * (kW-20) / (kurvenDaten.length-1)) + 10;
      const y = Math.round(kH - 10 - (v/maxL) * (kH-20));
      return `${x},${y}`;
    });
    const area = `${areaBase[0].split(',')[0]},${kH-5} ` + areaBase.join(' ') + ` ${areaBase[areaBase.length-1].split(',')[0]},${kH-5}`;
    kurveSvg = `<svg viewBox="0 0 ${kW} ${kH}" style="width:100%;height:${kH}px" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4ab8e8" stop-opacity=".35"/><stop offset="100%" stop-color="#4ab8e8" stop-opacity="0"/></linearGradient></defs>
      <polygon points="${area}" fill="url(#mg)"/>
      <polyline points="${pts}" fill="none" stroke="#4ab8e8" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <text x="10" y="${kH-2}" font-size="9" fill="#666">${kurvenDaten[0][0].slice(5)}</text>
      <text x="${kW-10}" y="${kH-2}" font-size="9" fill="#666" text-anchor="end">${kurvenDaten[kurvenDaten.length-1][0].slice(5)}</text>
      <text x="${kW-4}" y="14" font-size="9" fill="#4ab8e8" text-anchor="end">${Math.round(maxL)}L</text>
    </svg>`;
  }

  // ── Milch pro Kuh (aus prokuh-Daten) ──
  const kuhMilch = {};
  milchListe.forEach(m => {
    if(m.prokuh) Object.entries(m.prokuh).forEach(([kId, liter]) => {
      kuhMilch[kId] = (kuhMilch[kId]||0) + (parseFloat(liter)||0);
    });
  });
  const kuhMilchSorted = Object.entries(kuhMilch).sort((a,b)=>b[1]-a[1]);
  const maxKuhL = kuhMilchSorted.length ? kuhMilchSorted[0][1] : 1;
  
  const aktivTab = window._statistikTab || 'milch';

  return `
    <div class="page-header"><h2>📊 Statistik</h2></div>

    <!-- Tab-Switcher -->
    <div style="display:flex;border-bottom:1px solid var(--border);margin-bottom:.8rem">
      <button class="kd-tab-btn ${aktivTab==='milch'?'active':''}" onclick="window._statistikTab='milch';render()" style="flex:1;padding:.55rem .3rem;background:transparent;border:none;color:${aktivTab==='milch'?'var(--gold)':'var(--text3)'};font-size:.8rem;font-weight:600;border-bottom:2px solid ${aktivTab==='milch'?'var(--gold)':'transparent'};cursor:pointer">🥛 Milch</button>
      <button class="kd-tab-btn ${aktivTab==='weide'?'active':''}" onclick="window._statistikTab='weide';render()" style="flex:1;padding:.55rem .3rem;background:transparent;border:none;color:${aktivTab==='weide'?'var(--gold)':'var(--text3)'};font-size:.8rem;font-weight:600;border-bottom:2px solid ${aktivTab==='weide'?'var(--gold)':'transparent'};cursor:pointer">🌿 Weide</button>
      <button class="kd-tab-btn ${aktivTab==='behandlung'?'active':''}" onclick="window._statistikTab='behandlung';render()" style="flex:1;padding:.55rem .3rem;background:transparent;border:none;color:${aktivTab==='behandlung'?'var(--gold)':'var(--text3)'};font-size:.8rem;font-weight:600;border-bottom:2px solid ${aktivTab==='behandlung'?'var(--gold)':'transparent'};cursor:pointer">⚕ Behandlung</button>
    </div>

    ${aktivTab === 'milch' ? `
    <div class="section-title">Milch Saison</div>
    <div class="stats-grid" style="grid-template-columns:1fr 1fr">
      <div class="stat-card"><div class="stat-icon">🥛</div><div class="stat-num"><span class="stat-count-up" data-target="${Math.round(milchGesamt)}">0</span>L</div><div class="stat-label">Gesamt</div></div>
      <div class="stat-card"><div class="stat-icon">🏭</div><div class="stat-num">${Math.round(milchMolkerei)}L</div><div class="stat-label">an Molkerei</div></div>
      <div class="stat-card"><div class="stat-icon">🌅</div><div class="stat-num">${Math.round(milchMorgen)}L</div><div class="stat-label">Morgens</div></div>
      <div class="stat-card"><div class="stat-icon">🌇</div><div class="stat-num">${Math.round(milchAbend)}L</div><div class="stat-label">Abends</div></div>
    </div>

    ${kurvenDaten.length >= 2 ? `
    <div class="section-title">Milchkurve (letzte ${kurvenDaten.length} Tage)</div>
    <div class="card-section" style="padding:.6rem .8rem">${kurveSvg}</div>` : ''}

    ${kuhMilchSorted.length ? `
    <div class="section-title">Milch pro Kuh</div>
    <div class="card-section">
      ${kuhMilchSorted.slice(0,15).map(([kId, liter]) => {
        const k = kuehe[kId];
        const pct = Math.round(liter/maxKuhL*100);
        return `<div style="margin-bottom:.5rem">
          <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:3px">
            <span style="color:var(--text2)">#${k?.nr||kId} ${k?.name||''}</span>
            <span style="color:var(--gold)">${Math.round(liter)}L</span>
          </div>
          <div style="background:var(--bg);border-radius:4px;height:8px;overflow:hidden">
            <div class="stat-bar-fill" data-target="${pct}%" style="background:linear-gradient(90deg,#4ab8e8,#2a88b8);height:100%;width:0%;border-radius:4px"></div>
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}
    ` : ''}

    ${aktivTab === 'weide' ? `
    <div class="section-title">Weidegang nach Weide</div>
    ${Object.values(proWeide).length ? `
    <div class="card-section">
      ${Object.values(proWeide).sort((a,b)=>b.tage-a.tage).map(w=>`
        <div style="margin-bottom:.6rem">
          <div style="display:flex;justify-content:space-between;font-size:.83rem;margin-bottom:3px">
            <span style="color:var(--text2)">${w.name}</span>
            <span style="color:var(--gold)">${w.tage} Tage · Ø ${w.tage?Math.round(w.tiere/w.tage):0} Tiere</span>
          </div>
          <div style="background:var(--bg);border-radius:4px;height:10px;overflow:hidden;box-shadow:inset 0 1px 3px rgba(0,0,0,.3)">
            <div class="stat-bar-fill" data-target="${Math.round(w.tage/Math.max(...Object.values(proWeide).map(x=>x.tage),1)*100)}%" style="background:linear-gradient(90deg,var(--green),var(--green2));height:100%;width:0%;border-radius:4px"></div>
          </div>
        </div>`).join('')}
    </div>` : `<div class="empty-state">Noch keine Weidedaten</div>`}
    <div class="section-title">Top Kühe (Weidetage)</div>
    <div class="card-list">
      ${Object.entries(proKuh).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([id,tage])=>{
        const k=kuehe[id];
        return `<div class="list-card list-card-sm">
          <span class="nr-badge">#${k?.nr||id}</span>
          <span class="list-card-title">${k?.name||''}</span>
          <span style="color:var(--gold);font-weight:bold">${tage} Tage</span>
        </div>`;
      }).join('')||'<div class="empty-state">Noch keine Daten</div>'}
    </div>
    ` : ''}

    ${aktivTab === 'behandlung' ? renderBehandlungsStatistik() : ''}
  `;
}

// ══════════════════════════════════════════════════════════════
//  BEHANDLUNGS-STATISTIK
// ══════════════════════════════════════════════════════════════
function renderBehandlungsStatistik() {
  const filter = window._behStatFilter || 'saison';
  const heute = Date.now();

  // Zeitraum-Filter
  const auftrieb = saisonInfo?.auftriebDatum || 0;
  const bList = Object.entries(behandlungen).filter(([,b]) => {
    if(!b.datum) return false;
    if(filter === 'saison') return auftrieb ? b.datum >= auftrieb : true;
    if(filter === '30d') return b.datum >= heute - 30*86400000;
    if(filter === '90d') return b.datum >= heute - 90*86400000;
    return true; // 'alle'
  });

  if(!bList.length) return `
    <div style="display:flex;gap:.3rem;margin-bottom:.7rem;flex-wrap:wrap">
      ${['saison','30d','90d','alle'].map(f=>`<button class="filter-chip ${filter===f?'active':''}" onclick="window._behStatFilter='${f}';render()">${{saison:'Saison',['30d']:'30 Tage',['90d']:'90 Tage',alle:'Alle'}[f]}</button>`).join('')}
    </div>
    <div class="empty-state">Keine Behandlungen im gewählten Zeitraum</div>`;

  // ── Kennzahlen ──
  const gesamt = bList.length;
  const aktiv  = bList.filter(([,b])=>b.aktiv).length;
  const mitWZ  = bList.filter(([,b])=>b.wzMilchEnde||b.wzFleischEnde).length;
  const tierarzt = bList.filter(([,b])=>b.behandler==='tierarzt').length;

  // ── Pro Kuh ──
  const proKuh = {};
  bList.forEach(([,b])=>{
    if(!proKuh[b.kuhId]) proKuh[b.kuhId] = 0;
    proKuh[b.kuhId]++;
  });
  const proKuhSorted = Object.entries(proKuh).sort((a,b)=>b[1]-a[1]);
  const maxKuhBeh = proKuhSorted.length ? proKuhSorted[0][1] : 1;

  // ── Medikamente ──
  const medCount = {};
  bList.forEach(([,b])=>{ if(b.medikament) medCount[b.medikament]=(medCount[b.medikament]||0)+1; });
  const medSorted = Object.entries(medCount).sort((a,b)=>b[1]-a[1]);
  const maxMed = medSorted.length ? medSorted[0][1] : 1;

  // ── Zeitverlauf: Behandlungen pro Woche als SVG ──
  const wochenMap = {};
  bList.forEach(([,b])=>{
    const d = new Date(b.datum);
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() - d.getDay()); // Wochenanfang (So)
    const key = d.toISOString().slice(0,10);
    wochenMap[key] = (wochenMap[key]||0)+1;
  });
  const wochenDaten = Object.entries(wochenMap).sort((a,b)=>a[0].localeCompare(b[0]));
  const maxW = Math.max(...wochenDaten.map(([,v])=>v), 1);
  const svgW = 320, svgH = 70;
  let verlaufSvg = '';
  if(wochenDaten.length >= 2) {
    const pts = wochenDaten.map(([,v],i)=>{
      const x = Math.round(i*(svgW-16)/(wochenDaten.length-1))+8;
      const y = Math.round(svgH-8-(v/maxW)*(svgH-18))+4;
      return x+','+y;
    }).join(' ');
    const first = pts.split(' ')[0];
    const last  = pts.split(' ').pop();
    const area = first.split(',')[0]+','+(svgH-4)+' '+pts+' '+last.split(',')[0]+','+(svgH-4);
    verlaufSvg = `<svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%;height:${svgH}px" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="bg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#d44b4b" stop-opacity=".3"/><stop offset="100%" stop-color="#d44b4b" stop-opacity=".02"/></linearGradient></defs>
      <polygon points="${area}" fill="url(#bg2)"/>
      <polyline points="${pts}" fill="none" stroke="#d44b4b" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <text x="8" y="${svgH-1}" font-size="8" fill="#666">${new Date(wochenDaten[0][0]+'T12:00').toLocaleDateString('de-AT',{day:'numeric',month:'short'})}</text>
      <text x="${svgW-8}" y="${svgH-1}" font-size="8" fill="#666" text-anchor="end">${new Date(wochenDaten[wochenDaten.length-1][0]+'T12:00').toLocaleDateString('de-AT',{day:'numeric',month:'short'})}</text>
      <text x="${svgW-4}" y="12" font-size="8" fill="#d44b4b" text-anchor="end">max ${maxW}</text>
    </svg>`;
  }

  // ── Diagnosen ──
  const diagCount = {};
  bList.forEach(([,b])=>{ if(b.diagnose) diagCount[b.diagnose]=(diagCount[b.diagnose]||0)+1; });
  const diagSorted = Object.entries(diagCount).sort((a,b)=>b[1]-a[1]).slice(0,5);

  return `
    <!-- Filter -->
    <div style="display:flex;gap:.3rem;margin-bottom:.7rem;flex-wrap:wrap">
      ${['saison','30d','90d','alle'].map(f=>`<button class="filter-chip ${filter===f?'active':''}" onclick="window._behStatFilter='${f}';render()">${{saison:'Saison',['30d']:'30 Tage',['90d']:'90 Tage',alle:'Alle'}[f]}</button>`).join('')}
    </div>

    <!-- Kennzahlen -->
    <div class="stats-grid" style="grid-template-columns:1fr 1fr;margin-bottom:.8rem">
      <div class="stat-card"><div class="stat-icon">⚕</div><div class="stat-num">${gesamt}</div><div class="stat-label">Gesamt</div></div>
      <div class="stat-card"><div class="stat-icon" style="color:var(--red)">🔴</div><div class="stat-num" style="color:${aktiv?'var(--red)':'var(--text3)'}">${aktiv}</div><div class="stat-label">Aktiv</div></div>
      <div class="stat-card"><div class="stat-icon">🩺</div><div class="stat-num">${tierarzt}</div><div class="stat-label">Tierarzt</div></div>
      <div class="stat-card"><div class="stat-icon">⏱</div><div class="stat-num">${mitWZ}</div><div class="stat-label">Mit Wartezeit</div></div>
    </div>

    <!-- Zeitverlauf -->
    ${verlaufSvg ? `
    <div class="section-title">Behandlungen im Zeitverlauf</div>
    <div class="card-section" style="padding:.6rem .8rem;margin-bottom:.8rem">
      <div style="font-size:.65rem;color:var(--text3);margin-bottom:.3rem">Behandlungen pro Woche</div>
      ${verlaufSvg}
    </div>` : ''}

    <!-- Pro Kuh -->
    ${proKuhSorted.length ? `
    <div class="section-title">Behandlungen pro Kuh</div>
    <div class="card-section" style="margin-bottom:.8rem">
      ${proKuhSorted.slice(0,12).map(([kId,count])=>{
        const k=kuehe[kId];
        const pct=Math.round(count/maxKuhBeh*100);
        return `<div style="margin-bottom:.45rem">
          <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:3px">
            <span style="color:var(--text2)">#${k?.nr||kId} ${k?.name||''}</span>
            <span style="color:${count>=3?'var(--red)':count>=2?'var(--orange)':'var(--gold)'};font-weight:bold">${count}×</span>
          </div>
          <div style="background:var(--bg);border-radius:4px;height:7px;overflow:hidden">
            <div class="stat-bar-fill" data-target="${pct}%" style="background:linear-gradient(90deg,${count>=3?'var(--red)':count>=2?'var(--orange)':'var(--gold)'},${count>=3?'#a03030':count>=2?'#a06010':'#a07830'});height:100%;width:0%;border-radius:4px"></div>
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}

    <!-- Häufigste Medikamente -->
    ${medSorted.length ? `
    <div class="section-title">Häufigste Medikamente</div>
    <div class="card-section" style="margin-bottom:.8rem">
      ${medSorted.slice(0,8).map(([med,count])=>{
        const pct=Math.round(count/maxMed*100);
        return `<div style="margin-bottom:.45rem">
          <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:3px">
            <span style="color:var(--text2)">${med}</span>
            <span style="color:var(--blue);font-weight:bold">${count}×</span>
          </div>
          <div style="background:var(--bg);border-radius:4px;height:7px;overflow:hidden">
            <div class="stat-bar-fill" data-target="${pct}%" style="background:linear-gradient(90deg,var(--blue),#2a6898);height:100%;width:0%;border-radius:4px"></div>
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}

    <!-- Häufigste Diagnosen -->
    ${diagSorted.length ? `
    <div class="section-title">Häufigste Diagnosen</div>
    <div class="card-section">
      ${diagSorted.map(([d,c])=>`
        <div class="info-row">
          <span style="color:var(--text2)">${d}</span>
          <span style="color:var(--gold);font-weight:bold">${c}×</span>
        </div>`).join('')}
    </div>` : ''}
  `;
}

// ══════════════════════════════════════════════════════════════
//  MASCHINENWARTUNG
// ══════════════════════════════════════════════════════════════
function renderWartung() {
  const maschinen = window._wartungData?.maschinen || {};
  const aktMaschine = window._aktivMaschine || Object.keys(maschinen)[0] || null;
  const m = aktMaschine ? maschinen[aktMaschine] : null;
  const heute = Date.now();
  const isoHeute = isoDate(new Date());

  // Ampelstatus berechnen
  function wartungsStatus(maschine) {
    const letzteWartung = maschine.letzteWartung || 0;
    const intervalDays  = maschine.intervalTage  || 0;
    const naechstesDatum= maschine.naechstesDatum|| null;
    let faelligIn = Infinity;
    if(intervalDays && letzteWartung) {
      faelligIn = Math.floor((letzteWartung + intervalDays*86400000 - heute) / 86400000);
    }
    if(naechstesDatum) {
      const datumTs = new Date(naechstesDatum+'T12:00').getTime();
      const datumIn = Math.floor((datumTs - heute) / 86400000);
      faelligIn = Math.min(faelligIn, datumIn);
    }
    if(faelligIn === Infinity) return {farbe:'var(--text3)', label:'Kein Intervall', tage: null};
    if(faelligIn < 0) return {farbe:'var(--red)', label:'Überfällig!', tage: faelligIn};
    if(faelligIn <= 7) return {farbe:'var(--orange)', label:'Bald fällig', tage: faelligIn};
    return {farbe:'var(--green)', label:'OK', tage: faelligIn};
  }

  const maschinenListe = Object.entries(maschinen).sort((a,b)=>a[1].name?.localeCompare(b[1].name));

  return `
    <div class="page-header">
      <h2>🔧 Maschinenwartung</h2>
      <button class="btn-primary" onclick="showWartungMaschineForm()">+ Maschine</button>
    </div>

    ${maschinenListe.length === 0 ? `
    <div class="empty-state" style="margin-top:2rem">
      <div style="font-size:3rem;margin-bottom:.5rem">🔧</div>
      <div>Noch keine Maschinen erfasst</div>
      <button class="btn-primary" style="margin-top:.8rem" onclick="showWartungMaschineForm()">+ Erste Maschine anlegen</button>
    </div>` : `

    <!-- Maschinen-Tabs -->
    <div style="display:flex;gap:.3rem;flex-wrap:wrap;margin-bottom:.7rem;overflow-x:auto">
      ${maschinenListe.map(([mid,masch])=>{
        const st = wartungsStatus(masch);
        return `<button class="filter-chip ${aktMaschine===mid?'active':''}"
          onclick="window._aktivMaschine='${mid}';render()"
          style="font-size:.75rem;white-space:nowrap">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${st.farbe};margin-right:4px;vertical-align:middle"></span>
          ${masch.name}
        </button>`;
      }).join('')}
    </div>

    ${m ? `
    <!-- Maschinen-Detail -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:.8rem;margin-bottom:.7rem">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem">
        <div>
          <div style="font-size:1.1rem;font-weight:700;color:var(--gold)">${m.name}</div>
          ${m.typ?`<div style="font-size:.75rem;color:var(--text3)">${m.typ}</div>`:''}
          ${m.serienNr?`<div style="font-size:.72rem;color:var(--text3)">SN: ${m.serienNr}</div>`:''}
        </div>
        <div style="display:flex;gap:.3rem">
          <button class="btn-xs" onclick="showWartungMaschineForm('${aktMaschine}')">✎</button>
          <button class="btn-xs-danger" onclick="deleteMaschine('${aktMaschine}')">🗑</button>
        </div>
      </div>

      <!-- Status -->
      ${(()=>{
        const st = wartungsStatus(m);
        return `<div style="background:${st.farbe}18;border:1px solid ${st.farbe}44;border-radius:8px;padding:.5rem .8rem;margin-bottom:.5rem">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <span style="font-weight:700;color:${st.farbe}">${st.tage===null?'–':st.tage<0?'Seit '+Math.abs(st.tage)+' Tagen überfällig':'In '+st.tage+' Tagen fällig'}</span>
              <div style="font-size:.7rem;color:${st.farbe}">${st.label}</div>
            </div>
            <button class="btn-primary" style="background:${st.farbe};border-color:${st.farbe};color:#fff;font-size:.78rem"
              onclick="showWartungServiceForm('${aktMaschine}')">🔧 Service durchführen</button>
          </div>
        </div>`;
      })()}

      <!-- Infos -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;font-size:.75rem">
        ${m.letzteWartung?`<div class="info-row" style="grid-column:1/-1"><span>Letzte Wartung</span><b>${new Date(m.letzteWartung).toLocaleDateString('de-AT',{day:'numeric',month:'long',year:'numeric'})}</b></div>`:''}
        ${m.intervalTage?`<div class="info-row"><span>Intervall</span><b>alle ${m.intervalTage} Tage</b></div>`:''}
        ${m.naechstesDatum?`<div class="info-row"><span>Nächstes Datum</span><b>${new Date(m.naechstesDatum+'T12:00').toLocaleDateString('de-AT',{day:'numeric',month:'short',year:'numeric'})}</b></div>`:''}
        ${m.betriebsStunden?`<div class="info-row"><span>Betriebsstunden</span><b>${m.betriebsStunden} h</b></div>`:''}
        ${m.kmStand?`<div class="info-row"><span>KM-Stand</span><b>${m.kmStand} km</b></div>`:''}
      </div>
    </div>

    <!-- Checkliste -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem">
      <div class="section-label">📋 CHECKLISTE</div>
      <button class="btn-xs" onclick="showChecklistePunktForm('${aktMaschine}')">+ Punkt</button>
    </div>
    ${m.checkliste && Object.keys(m.checkliste).length ? `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;margin-bottom:.7rem">
      ${Object.entries(m.checkliste).map(([pid,p])=>`
        <div style="display:flex;align-items:center;gap:.7rem;padding:.5rem .8rem;border-bottom:1px solid var(--border2)">
          <span style="font-size:.85rem;flex-shrink:0">${{check:'✅',messen:'📏',befuellen:'🪣',reinigen:'🧹',pruefen:'🔍',sonstige:'📌'}[p.typ]||'📌'}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:.82rem;font-weight:600">${p.bezeichnung}</div>
            ${p.einheit?`<div style="font-size:.68rem;color:var(--text3)">${p.einheit}</div>`:''}
          </div>
          <button class="btn-xs-danger" onclick="deleteChecklistePunkt('${aktMaschine}','${pid}')">✕</button>
        </div>`).join('')}
    </div>` : `
    <div style="font-size:.78rem;color:var(--text3);margin-bottom:.7rem;padding:.5rem .8rem;background:var(--bg3);border-radius:var(--radius-sm)">
      Noch keine Checklistenpunkte. + Punkt antippen um anzufangen.
    </div>`}

    <!-- Wartungshistorie -->
    <div class="section-label" style="margin-bottom:.4rem">🗓 WARTUNGSHISTORIE</div>
    ${m.historie && Object.keys(m.historie).length ? `
    <div class="card-list">
      ${Object.entries(m.historie).sort((a,b)=>b[1].datum-a[1].datum).slice(0,10).map(([hid,h])=>`
        <div class="list-card" style="flex-direction:column;gap:.3rem;align-items:stretch;padding:.6rem .8rem">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:.85rem;font-weight:700;color:var(--gold)">
              ${new Date(h.datum).toLocaleDateString('de-AT',{day:'numeric',month:'long',year:'numeric'})}
            </div>
            <div style="display:flex;gap:.3rem;align-items:center">
              ${h.kosten?`<span style="font-size:.72rem;color:var(--text3)">${h.kosten}€</span>`:''}
              <button class="btn-xs" onclick="druckeWartungsprotokoll('${aktMaschine}','${hid}')">🖨</button>
              <button class="btn-xs-danger" onclick="deleteHistorie('${aktMaschine}','${hid}')">✕</button>
            </div>
          </div>
          ${h.techniker?`<div style="font-size:.72rem;color:var(--text3)">👤 ${h.techniker}</div>`:''}
          ${h.notiz?`<div style="font-size:.75rem;color:var(--text2)">${h.notiz}</div>`:''}
          ${h.checklisteErgebnis && Object.keys(h.checklisteErgebnis).length ? `
          <div style="display:flex;flex-wrap:wrap;gap:.2rem;margin-top:.2rem">
            ${Object.entries(h.checklisteErgebnis).map(([pid,ergebnis])=>{
              const pkt = m.checkliste?.[pid];
              return `<span style="font-size:.65rem;background:rgba(77,184,78,.1);border:1px solid rgba(77,184,78,.25);border-radius:6px;padding:1px 6px;color:var(--green)">
                ✓ ${pkt?.bezeichnung||pid}${ergebnis&&ergebnis!=='true'?' ('+ergebnis+')':''}
              </span>`;
            }).join('')}
          </div>` : ''}
        </div>`).join('')}
    </div>` : `<div class="empty-state" style="padding:.8rem">Noch keine Wartungen durchgeführt</div>`}
    ` : ''}
    `}

    <!-- Maschinen-Formular -->
    <div id="wartung-maschine-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3 id="wm-form-titel">Maschine anlegen</h3><button class="close-btn" onclick="closeForm('wartung-maschine-overlay')">✕</button></div>
        <div class="form-body">
          <input type="hidden" id="wm-edit-id" />
          <input id="wm-name" class="inp" placeholder="Name * (z.B. Melkanlage, Traktor)" />
          <input id="wm-typ" class="inp" placeholder="Typ (z.B. DeLaval, John Deere 6110M)" />
          <input id="wm-serien-nr" class="inp" placeholder="Seriennummer / Kennzeichen" />
          <label class="inp-label">Wartungsintervall (Tage)</label>
          <input id="wm-interval" class="inp" type="number" inputmode="numeric" placeholder="z.B. 365" style="width:120px" />
          <label class="inp-label">Nächstes fixes Datum (optional)</label>
          <input id="wm-datum" class="inp" type="date" />
          <label class="inp-label">Aktuelle Betriebsstunden</label>
          <input id="wm-stunden" class="inp" type="number" inputmode="decimal" placeholder="z.B. 1250" style="width:150px" />
          <label class="inp-label">KM-Stand</label>
          <input id="wm-km" class="inp" type="number" inputmode="decimal" placeholder="z.B. 45000" style="width:150px" />
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('wartung-maschine-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveMaschine()">Speichern</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Checkliste-Punkt Formular -->
    <div id="wartung-punkt-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>📋 Checklistenpunkt</h3><button class="close-btn" onclick="closeForm('wartung-punkt-overlay')">✕</button></div>
        <div class="form-body">
          <input type="hidden" id="wp-maschine-id" />
          <input id="wp-bezeichnung" class="inp" placeholder="Bezeichnung * (z.B. Ölstand prüfen)" />
          <label class="inp-label">Typ</label>
          <select id="wp-typ" class="inp">
            <option value="check">✅ Abhaken (Ja/Nein)</option>
            <option value="messen">📏 Messwert eintragen</option>
            <option value="befuellen">🪣 Befüllen / Wechseln</option>
            <option value="reinigen">🧹 Reinigen</option>
            <option value="pruefen">🔍 Prüfen / Kontrolle</option>
            <option value="sonstige">📌 Sonstiges</option>
          </select>
          <input id="wp-einheit" class="inp" placeholder="Einheit (optional, z.B. Liter, bar, °C)" />
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('wartung-punkt-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveChecklistePunkt()">Speichern</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Service-Formular (Checkliste ausfüllen) -->
    <div id="wartung-service-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet" style="max-height:92vh;overflow-y:auto">
        <div class="form-header"><h3>🔧 Service durchführen</h3><button class="close-btn" onclick="closeForm('wartung-service-overlay')">✕</button></div>
        <div class="form-body">
          <input type="hidden" id="ws-maschine-id" />
          <label class="inp-label">Datum</label>
          <input id="ws-datum" class="inp" type="date" value="${isoHeute}" />
          <input id="ws-techniker" class="inp" placeholder="Techniker / Durchgeführt von" />
          <label class="inp-label">Kosten (€)</label>
          <input id="ws-kosten" class="inp" type="number" inputmode="decimal" placeholder="z.B. 250" style="width:130px" />
          <label class="inp-label">Betriebsstunden aktuell</label>
          <input id="ws-stunden" class="inp" type="number" inputmode="decimal" placeholder="z.B. 1300" style="width:150px" />
          <div id="ws-checkliste-container" style="margin:.6rem 0"></div>
          <textarea id="ws-notiz" class="inp" rows="3" placeholder="Notizen / Befunde / Ersatzteile"></textarea>
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('wartung-service-overlay')">Abbrechen</button>
            <button class="btn-primary" style="background:var(--green);border-color:var(--green)" onclick="saveService()">✓ Service abschließen</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Maschinen verwalten ──
window.showWartungMaschineForm = function(mid) {
  const ov = document.getElementById('wartung-maschine-overlay');
  if(!ov){navigate('wartung');setTimeout(()=>showWartungMaschineForm(mid),150);return;}
  const m = mid ? (window._wartungData?.maschinen?.[mid]||{}) : {};
  document.getElementById('wm-edit-id').value = mid||'';
  document.getElementById('wm-form-titel').textContent = mid ? 'Maschine bearbeiten' : 'Maschine anlegen';
  document.getElementById('wm-name').value = m.name||'';
  document.getElementById('wm-typ').value = m.typ||'';
  document.getElementById('wm-serien-nr').value = m.serienNr||'';
  document.getElementById('wm-interval').value = m.intervalTage||'';
  document.getElementById('wm-datum').value = m.naechstesDatum||'';
  document.getElementById('wm-stunden').value = m.betriebsStunden||'';
  document.getElementById('wm-km').value = m.kmStand||'';
  ov.style.display='flex';
};

window.saveMaschine = async function() {
  const name = document.getElementById('wm-name')?.value.trim();
  if(!name){alert('Name Pflicht');return;}
  const mid = document.getElementById('wm-edit-id')?.value;
  const data = {
    name, typ: document.getElementById('wm-typ')?.value.trim()||'',
    serienNr: document.getElementById('wm-serien-nr')?.value.trim()||'',
    intervalTage: parseInt(document.getElementById('wm-interval')?.value)||0,
    naechstesDatum: document.getElementById('wm-datum')?.value||'',
    betriebsStunden: parseFloat(document.getElementById('wm-stunden')?.value)||0,
    kmStand: parseFloat(document.getElementById('wm-km')?.value)||0,
    createdAt: Date.now()
  };
  if(mid) {
    await update(ref(db,'wartung/maschinen/'+mid), data);
  } else {
    const nr = await push(ref(db,'wartung/maschinen'), data);
    window._aktivMaschine = nr.key;
  }
  closeForm('wartung-maschine-overlay');
  showSaveToast&&showSaveToast('Maschine gespeichert');
};

window.deleteMaschine = async function(mid) {
  if(!confirm('Maschine löschen? Alle Daten gehen verloren.')) return;
  await remove(ref(db,'wartung/maschinen/'+mid));
  window._aktivMaschine = null;
};

// ── Checkliste ──
window.showChecklistePunktForm = function(mid) {
  const ov = document.getElementById('wartung-punkt-overlay');
  if(!ov){navigate('wartung');setTimeout(()=>showChecklistePunktForm(mid),150);return;}
  document.getElementById('wp-maschine-id').value = mid;
  document.getElementById('wp-bezeichnung').value = '';
  document.getElementById('wp-einheit').value = '';
  ov.style.display='flex';
};

window.saveChecklistePunkt = async function() {
  const bez = document.getElementById('wp-bezeichnung')?.value.trim();
  if(!bez){alert('Bezeichnung Pflicht');return;}
  const mid = document.getElementById('wp-maschine-id')?.value;
  await push(ref(db,'wartung/maschinen/'+mid+'/checkliste'), {
    bezeichnung: bez,
    typ: document.getElementById('wp-typ')?.value||'check',
    einheit: document.getElementById('wp-einheit')?.value.trim()||''
  });
  closeForm('wartung-punkt-overlay');
};

window.deleteChecklistePunkt = async function(mid, pid) {
  if(confirm('Punkt löschen?')) await remove(ref(db,'wartung/maschinen/'+mid+'/checkliste/'+pid));
};

// ── Service ──
window.showWartungServiceForm = function(mid) {
  const ov = document.getElementById('wartung-service-overlay');
  if(!ov){navigate('wartung');setTimeout(()=>showWartungServiceForm(mid),150);return;}
  const m = window._wartungData?.maschinen?.[mid]||{};
  document.getElementById('ws-maschine-id').value = mid;
  document.getElementById('ws-datum').value = isoDate(new Date());
  document.getElementById('ws-techniker').value = '';
  document.getElementById('ws-kosten').value = '';
  document.getElementById('ws-stunden').value = m.betriebsStunden||'';
  document.getElementById('ws-notiz').value = '';

  // Checkliste dynamisch aufbauen
  const container = document.getElementById('ws-checkliste-container');
  if(container) {
    const punkte = Object.entries(m.checkliste||{});
    if(punkte.length) {
      const typIcon = {check:'✅',messen:'📏',befuellen:'🪣',reinigen:'🧹',pruefen:'🔍',sonstige:'📌'};
      container.innerHTML =
        '<div style="font-size:.7rem;font-weight:700;color:var(--text3);letter-spacing:.06em;margin-bottom:.5rem">📋 CHECKLISTE</div>'+
        punkte.map(([pid,p])=>`
          <div style="display:flex;align-items:center;gap:.7rem;padding:.5rem 0;border-bottom:1px solid var(--border2)">
            <span style="font-size:1rem;flex-shrink:0">${typIcon[p.typ]||'📌'}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:.82rem;font-weight:600">${p.bezeichnung}</div>
              ${p.einheit?`<div style="font-size:.68rem;color:var(--text3)">${p.einheit}</div>`:''}
            </div>
            <div style="flex-shrink:0">
              ${p.typ==='check'
                ? `<label style="display:flex;align-items:center;gap:.4rem;cursor:pointer">
                    <input type="checkbox" id="wsc-${pid}" style="width:20px;height:20px;accent-color:var(--green)" />
                    <span style="font-size:.72rem;color:var(--text3)">OK</span>
                  </label>`
                : `<input type="text" id="wsc-${pid}" placeholder="${p.einheit||'Wert'}"
                    style="width:90px;padding:.3rem .5rem;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:.8rem;text-align:center" />`
              }
            </div>
          </div>`).join('');
    } else {
      container.innerHTML = '<div style="font-size:.75rem;color:var(--text3);padding:.4rem 0">Keine Checkliste definiert</div>';
    }
  }
  ov.style.display='flex';
};

window.saveService = async function() {
  const mid = document.getElementById('ws-maschine-id')?.value;
  const datum = document.getElementById('ws-datum')?.value;
  if(!datum){alert('Datum Pflicht');return;}
  const m = window._wartungData?.maschinen?.[mid]||{};

  // Checkliste-Ergebnisse sammeln
  const checklisteErgebnis = {};
  Object.entries(m.checkliste||{}).forEach(([pid,p])=>{
    const el = document.getElementById('wsc-'+pid);
    if(!el) return;
    if(p.typ==='check') checklisteErgebnis[pid] = el.checked ? 'true' : 'false';
    else checklisteErgebnis[pid] = el.value.trim();
  });

  const datumTs = new Date(datum+'T12:00').getTime();
  const stunden = parseFloat(document.getElementById('ws-stunden')?.value)||0;

  // Historie-Eintrag speichern
  await push(ref(db,'wartung/maschinen/'+mid+'/historie'), {
    datum: datumTs,
    techniker: document.getElementById('ws-techniker')?.value.trim()||'',
    kosten: parseFloat(document.getElementById('ws-kosten')?.value)||0,
    notiz: document.getElementById('ws-notiz')?.value.trim()||'',
    checklisteErgebnis, createdAt: Date.now()
  });

  // Maschine aktualisieren
  const updates = {letzteWartung: datumTs};
  if(stunden) updates.betriebsStunden = stunden;
  // Nächstes Datum berechnen wenn Intervall gesetzt
  if(m.intervalTage) {
    const next = new Date(datumTs + m.intervalTage*86400000);
    updates.naechstesDatum = isoDate(next);
  }
  await update(ref(db,'wartung/maschinen/'+mid), updates);

  // Push-Notification planen
  if(m.intervalTage && isPushEnabled && isPushEnabled('wartung')) {
    localStorage.setItem('wartung_next_'+mid, isoDate(new Date(datumTs + m.intervalTage*86400000)));
  }

  closeForm('wartung-service-overlay');
  showSaveToast&&showSaveToast('Service gespeichert · '+m.name);
};

window.deleteHistorie = async function(mid, hid) {
  if(confirm('Wartungseintrag löschen?')) await remove(ref(db,'wartung/maschinen/'+mid+'/historie/'+hid));
};

// ── Wartungsprotokoll drucken ──
window.druckeWartungsprotokoll = function(mid, hid) {
  const m = window._wartungData?.maschinen?.[mid];
  const h = m?.historie?.[hid];
  if(!m||!h) return;

  const css = 'body{font-family:Arial,sans-serif;font-size:10pt;margin:1.5cm}h1{font-size:16pt;color:#1a3a0a;border-bottom:2px solid #d4a84b;padding-bottom:6px}h2{font-size:12pt;color:#2a5a0a;margin-top:1.2rem}table{width:100%;border-collapse:collapse;margin:.5rem 0}th{background:#1a3a0a;color:#fff;padding:6px 8px;text-align:left}td{padding:5px 8px;border:1px solid #ccc}tr:nth-child(even)td{background:#f5f5f5}.ok{color:green;font-weight:bold}.nok{color:red}.footer{margin-top:2rem;border-top:1px solid #ccc;padding-top:.5rem;font-size:8pt;color:#888}';
  const datum = new Date(h.datum).toLocaleDateString('de-AT',{day:'numeric',month:'long',year:'numeric'});
  const checkRows = Object.entries(h.checklisteErgebnis||{}).map(([pid,val])=>{
    const pkt = m.checkliste?.[pid];
    const ok = val==='true'||val;
    return `<tr><td>${pkt?.bezeichnung||pid}</td><td class="${ok?'ok':'nok'}">${val==='true'?'✓ OK':val==='false'?'✗':val}</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Wartungsprotokoll</title><style>${css}</style></head><body>
    <h1>🔧 Wartungsprotokoll</h1>
    <table><tr><th colspan="2">Maschine</th></tr>
      <tr><td>Name</td><td>${m.name}</td></tr>
      ${m.typ?`<tr><td>Typ</td><td>${m.typ}</td></tr>`:''}
      ${m.serienNr?`<tr><td>Seriennummer</td><td>${m.serienNr}</td></tr>`:''}
    </table>
    <table><tr><th colspan="2">Service</th></tr>
      <tr><td>Datum</td><td>${datum}</td></tr>
      ${h.techniker?`<tr><td>Techniker</td><td>${h.techniker}</td></tr>`:''}
      ${h.kosten?`<tr><td>Kosten</td><td>${h.kosten} €</td></tr>`:''}
    </table>
    ${checkRows?`<h2>Checkliste</h2><table><tr><th>Punkt</th><th>Ergebnis</th></tr>${checkRows}</table>`:''}
    ${h.notiz?`<h2>Notizen</h2><p>${h.notiz}</p>`:''}
    <div class="footer">HerdenPro · Engineering by LN Machinery · Erstellt: ${new Date().toLocaleDateString('de-AT')}</div>
    ${'<scr'+'ipt>window.onload=function(){window.print();}</'+'script>'}
  </body></html>`;

  const w = window.open('','_blank');
  if(!w){alert('Popup blockiert');return;}
  w.document.write(html); w.document.close();
};

// ── Push für Wartung prüfen ──
window.checkWartungErinnerungen = function() {
  if(!isPushEnabled||!isPushEnabled('wartung')) return;
  const maschinen = window._wartungData?.maschinen||{};
  Object.entries(maschinen).forEach(([mid,m])=>{
    const next = m.naechstesDatum;
    if(!next) return;
    const diffD = Math.floor((new Date(next+'T12:00').getTime()-Date.now())/86400000);
    if(diffD<=7 && diffD>=0) {
      const key='wartungNotif_'+mid+'_'+next;
      if(!localStorage.getItem(key)){
        swNotify('🔧 Wartung fällig: '+m.name, {body:'In '+diffD+' Tagen · '+new Date(next+'T12:00').toLocaleDateString('de-AT'),tag:'wartung-'+mid});
        localStorage.setItem(key,'1');
      }
    }
  });
};

// ══════════════════════════════════════════════════════════════
//  AUFGABEN / TO-DO
// ══════════════════════════════════════════════════════════════
function renderAufgaben() {
  const aufgaben = window._aufgabenData || {};
  const filter = window._aufgabenFilter || 'offen'; // 'offen' | 'erledigt' | 'meine'
  const aktUser = window._currentUser?.email || '';
  const heute = isoDate(new Date());

  // Bauern + Mitarbeiter als Zuweis-Optionen
  const bauernListe = Object.values(bauern).map(b=>b.name).filter(Boolean);

  // Alle Aufgaben als Array
  const alle = Object.entries(aufgaben).map(([id,a])=>({...a,id}));

  // Filter
  const gefiltert = alle.filter(a => {
    if(filter==='erledigt') return a.erledigt;
    if(filter==='meine') return !a.erledigt && (a.zugewiesen===aktUser||!a.zugewiesen);
    return !a.erledigt;
  }).sort((a,b)=>{
    // Zuerst überfällige, dann nach Fälligkeit
    const adatum = a.faellig||'9999';
    const bdatum = b.faellig||'9999';
    return adatum.localeCompare(bdatum);
  });

  const ueberfaellig = gefiltert.filter(a=>a.faellig&&a.faellig<heute).length;

  return `
    <div class="page-header">
      <h2>✅ Aufgaben</h2>
      <button class="btn-primary" onclick="showAufgabeForm()">+ Aufgabe</button>
    </div>

    <!-- Filter-Chips -->
    <div style="display:flex;gap:.35rem;margin-bottom:.7rem;flex-wrap:wrap">
      <button class="filter-chip ${filter==='offen'?'active':''}" onclick="window._aufgabenFilter='offen';render()">
        Offen (${alle.filter(a=>!a.erledigt).length})${ueberfaellig?` <span style="color:var(--red)">⚠${ueberfaellig}</span>`:''}
      </button>
      <button class="filter-chip ${filter==='meine'?'active':''}" onclick="window._aufgabenFilter='meine';render()">
        Meine (${alle.filter(a=>!a.erledigt&&(!a.zugewiesen||a.zugewiesen===aktUser)).length})
      </button>
      <button class="filter-chip ${filter==='erledigt'?'active':''}" onclick="window._aufgabenFilter='erledigt';render()">
        Erledigt (${alle.filter(a=>a.erledigt).length})
      </button>
    </div>

    <!-- Aufgaben-Liste -->
    ${gefiltert.length ? `
    <div style="display:flex;flex-direction:column;gap:.35rem">
      ${gefiltert.map(a=>{
        const istUeberfaellig = a.faellig && a.faellig < heute && !a.erledigt;
        const faelligHeute = a.faellig === heute && !a.erledigt;
        const datumFarbe = istUeberfaellig?'var(--red)':faelligHeute?'var(--orange)':'var(--text3)';
        return `
        <div style="display:flex;align-items:flex-start;gap:.7rem;background:var(--bg3);border:1px solid ${istUeberfaellig?'rgba(212,60,60,.3)':faelligHeute?'rgba(212,132,75,.3)':'var(--border)'};border-radius:12px;padding:.6rem .8rem;transition:all .15s;${a.erledigt?'opacity:.5':''}"
          onpointerdown="this._hold=setTimeout(()=>showAufgabeForm('${a.id}'),600)" onpointerup="clearTimeout(this._hold)" onpointerleave="clearTimeout(this._hold)">
          <!-- Checkbox -->
          <div onclick="toggleAufgabe('${a.id}',${!a.erledigt})"
            style="width:24px;height:24px;border-radius:6px;border:2px solid ${a.erledigt?'var(--green)':'var(--border)'};background:${a.erledigt?'var(--green)':'transparent'};display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;margin-top:1px;transition:all .2s">
            ${a.erledigt?'<span style="color:#fff;font-size:.85rem">✓</span>':''}
          </div>
          <!-- Inhalt -->
          <div style="flex:1;min-width:0">
            <div style="font-size:.88rem;font-weight:${a.erledigt?'400':'600'};color:${a.erledigt?'var(--text3)':'var(--text)'};${a.erledigt?'text-decoration:line-through':''}">${a.titel}</div>
            ${a.notiz?`<div style="font-size:.72rem;color:var(--text3);margin-top:2px">${a.notiz}</div>`:''}
            <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.3rem">
              ${a.faellig?`<span style="font-size:.68rem;color:${datumFarbe}">${istUeberfaellig?'⚠ Überfällig: ':faelligHeute?'⏰ Heute: ':'📅 '}${new Date(a.faellig+'T12:00').toLocaleDateString('de-AT',{day:'numeric',month:'short'})}</span>`:''}
              ${a.zugewiesen?`<span style="font-size:.68rem;color:var(--text3)">👤 ${a.zugewiesen}</span>`:''}
              ${a.erledigt&&a.erledigtAm?`<span style="font-size:.65rem;color:var(--text3)">✓ ${new Date(a.erledigtAm).toLocaleDateString('de-AT')}</span>`:''}
            </div>
          </div>
          <!-- Aktionen -->
          <div style="display:flex;gap:.25rem;flex-shrink:0">
            <button class="btn-xs-danger" onclick="deleteAufgabe('${a.id}')">✕</button>
          </div>
        </div>`;
      }).join('')}
    </div>` : `
    <div class="empty-state" style="margin-top:1.5rem">
      ${filter==='erledigt'?'Noch nichts erledigt.':filter==='meine'?'Keine Aufgaben für dich.':'Keine offenen Aufgaben. 🎉'}
    </div>`}

    <!-- Formular -->
    <div id="aufgabe-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3 id="af-titel">Aufgabe hinzufügen</h3><button class="close-btn" onclick="closeForm('aufgabe-overlay')">✕</button></div>
        <div class="form-body">
          <input type="hidden" id="af-edit-id" />
          <input id="af-name" class="inp" placeholder="Aufgabe * (z.B. Melkmaschine reinigen)" />
          <textarea id="af-notiz" class="inp" rows="2" placeholder="Notiz / Details (optional)"></textarea>
          <label class="inp-label">Fällig am</label>
          <input id="af-faellig" class="inp" type="date" style="width:180px" />
          <label class="inp-label">Zuweisen an</label>
          <select id="af-zuweisen" class="inp">
            <option value="">— Alle / Niemand bestimmt —</option>
            ${bauernListe.map(b=>`<option value="${b}">${b}</option>`).join('')}
            <option value="${aktUser}">${aktUser ? 'Mich ('+aktUser+')' : 'Mich'}</option>
          </select>
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('aufgabe-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveAufgabe()">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.showAufgabeForm = function(id) {
  const ov = document.getElementById('aufgabe-overlay');
  if(!ov){navigate('aufgaben');setTimeout(()=>showAufgabeForm(id),150);return;}
  const a = id ? (window._aufgabenData?.[id]||{}) : {};
  document.getElementById('af-edit-id').value = id||'';
  document.getElementById('af-titel').textContent = id ? 'Aufgabe bearbeiten' : 'Aufgabe hinzufügen';
  document.getElementById('af-name').value = a.titel||'';
  document.getElementById('af-notiz').value = a.notiz||'';
  document.getElementById('af-faellig').value = a.faellig||'';
  document.getElementById('af-zuweisen').value = a.zugewiesen||'';
  ov.style.display='flex';
};

window.saveAufgabe = async function() {
  const titel = document.getElementById('af-name')?.value.trim();
  if(!titel){alert('Titel Pflicht');return;}
  const id = document.getElementById('af-edit-id')?.value;
  const data = {
    titel,
    notiz:      document.getElementById('af-notiz')?.value.trim()||'',
    faellig:    document.getElementById('af-faellig')?.value||'',
    zugewiesen: document.getElementById('af-zuweisen')?.value||'',
    erledigt:   false,
    createdAt:  Date.now()
  };
  if(id) await update(ref(db,'aufgaben/'+id), data);
  else   await push(ref(db,'aufgaben'), data);
  closeForm('aufgabe-overlay');
  showSaveToast&&showSaveToast('Aufgabe gespeichert');
};

window.toggleAufgabe = async function(id, erledigt) {
  await update(ref(db,'aufgaben/'+id), {
    erledigt, erledigtAm: erledigt ? Date.now() : null
  });
  if(erledigt && navigator.vibrate) navigator.vibrate([30,20,60]);
};

window.deleteAufgabe = async function(id) {
  if(confirm('Aufgabe löschen?')) await remove(ref(db,'aufgaben/'+id));
};

// Dashboard-Integration: offene Aufgaben zählen
window.aufgabenOffen = function() {
  return Object.values(window._aufgabenData||{}).filter(a=>!a.erledigt).length;
};
window.aufgabenUeberfaellig = function() {
  const heute=isoDate(new Date());
  return Object.values(window._aufgabenData||{}).filter(a=>!a.erledigt&&a.faellig&&a.faellig<heute).length;
};
function renderLager() {
  const artikel = window._lagerData?.artikel || {};
  const katFilter = window._lagerKat || '';
  const KATEGORIEN = ['Medikamente','Kraftfutter','Verbrauchsmaterial','Reinigungsmittel','Ersatzteile'];
  const KAT_ICONS  = {Medikamente:'💊',Kraftfutter:'🌾',Verbrauchsmaterial:'🧤',Reinigungsmittel:'🧴',Ersatzteile:'🔩'};
  const liste = Object.entries(artikel)
    .filter(([,a])=> !katFilter || a.kategorie===katFilter)
    .sort((a,b)=>(a[1].name||'').localeCompare(b[1].name||''));
  const alarme = Object.entries(artikel).filter(([,a])=>a.mindestBestand>0&&(a.bestand||0)<=a.mindestBestand);
  return `
    <div class="page-header"><h2>📦 Lager</h2>
      <div style="display:flex;gap:.3rem">
        <button class="btn-secondary" style="font-size:.78rem;padding:.35rem .6rem" onclick="showLagerFotoImport()">📷 Foto</button>
        <button class="btn-primary" onclick="showLagerArtikelForm()">+ Artikel</button>
      </div>
    </div>
    ${alarme.length?`<div style="background:rgba(212,60,60,.1);border:1px solid rgba(212,60,60,.3);border-radius:var(--radius-sm);padding:.5rem .8rem;margin-bottom:.6rem">
      <div style="font-size:.78rem;font-weight:700;color:var(--red);margin-bottom:.3rem">⚠ ${alarme.length} Artikel unter Mindestbestand</div>
      ${alarme.map(([,a])=>`<div style="font-size:.72rem;color:var(--text2)">• ${a.name}: noch ${a.bestand||0} ${a.einheit||''} (Min: ${a.mindestBestand})</div>`).join('')}
    </div>`:''}
    <div style="display:flex;gap:.3rem;flex-wrap:wrap;margin-bottom:.7rem">
      <button class="filter-chip ${!katFilter?'active':''}" onclick="window._lagerKat='';render()">Alle (${Object.keys(artikel).length})</button>
      ${KATEGORIEN.map(k=>{const cnt=Object.values(artikel).filter(a=>a.kategorie===k).length;return cnt?`<button class="filter-chip ${katFilter===k?'active':''}" onclick="window._lagerKat='${k}';render()">${KAT_ICONS[k]} ${k} (${cnt})</button>`:''}).join('')}
    </div>
    ${liste.length?`<div class="card-list">${liste.map(([id,a])=>{
      const pct=a.mindestBestand>0?Math.min(100,Math.round((a.bestand||0)/a.mindestBestand*100)):null;
      const alarm=a.mindestBestand>0&&(a.bestand||0)<=a.mindestBestand;
      const bf=alarm?'var(--red)':(pct!==null&&pct<150?'var(--orange)':'var(--green)');
      return `<div class="list-card" style="flex-direction:column;gap:.3rem;align-items:stretch;padding:.6rem .8rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap">
              <span>${KAT_ICONS[a.kategorie]||'📦'}</span>
              <span style="font-size:.88rem;font-weight:700">${a.name}</span>
              ${alarm?'<span style="font-size:.6rem;background:rgba(212,60,60,.2);color:var(--red);padding:1px 5px;border-radius:6px">⚠ Niedrig</span>':''}
            </div>
            ${a.beschreibung?`<div style="font-size:.7rem;color:var(--text3)">${a.beschreibung}</div>`:''}
          </div>
          <div style="display:flex;gap:.25rem;flex-shrink:0;align-items:center;flex-wrap:wrap;justify-content:flex-end">
            <button class="btn-xs" onclick="showLagerVerbrauchForm('${id}')">− Verbrauch</button>
            <button class="btn-xs" onclick="showLagerZugangForm('${id}')">+ Zugang</button>
            <button class="btn-xs" onclick="showLagerArtikelForm('${id}')">✎</button>
            <button class="btn-xs-danger" onclick="deleteLagerArtikel('${id}')">✕</button>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:.6rem">
          <div style="flex:1">
            <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:2px">
              <span style="color:var(--text3)">Bestand</span>
              <span style="color:${bf};font-weight:700">${a.bestand||0} ${a.einheit||''}</span>
            </div>
            ${pct!==null?`<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:${Math.min(100,pct)}%;background:${bf};border-radius:3px"></div></div><div style="font-size:.62rem;color:var(--text3);margin-top:1px">Min: ${a.mindestBestand} ${a.einheit||''}</div>`:''}
          </div>
          ${a.preis?`<div style="text-align:right;flex-shrink:0"><div style="font-size:.65rem;color:var(--text3)">Preis/Einheit</div><div style="font-size:.78rem;color:var(--gold)">${a.preis}€</div></div>`:''}
        </div>
        ${a.ablaufdatum?`<div style="font-size:.68rem;color:${new Date(a.ablaufdatum)<new Date()?'var(--red)':'var(--text3)'}">MHD: ${new Date(a.ablaufdatum).toLocaleDateString('de-AT')}</div>`:''}
      </div>`;}).join('')}</div>` : `<div class="empty-state">${katFilter?'Keine Artikel in dieser Kategorie':'Noch keine Artikel im Lager'}.<br><small>Artikel manuell hinzufügen oder Lieferschein-Foto importieren.</small></div>`}

    <!-- Foto-Import -->
    <div id="lager-foto-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet" style="max-height:92vh;overflow-y:auto">
        <div class="form-header"><h3>📷 Lieferschein / Rechnung</h3><button class="close-btn" onclick="closeForm('lager-foto-overlay')">✕</button></div>
        <div class="form-body">
          <p style="font-size:.8rem;color:var(--text2);margin-bottom:.7rem">Foto hochladen – KI erkennt Artikel, Mengen und Preise automatisch.</p>
          <div id="lager-foto-preview" style="display:none;margin-bottom:.7rem"><img id="lager-foto-img" style="max-width:100%;border-radius:8px;max-height:200px;object-fit:contain" /></div>
          <label style="cursor:pointer;display:block">
            <div style="background:var(--bg3);border:2px dashed var(--border);border-radius:12px;padding:1.5rem;text-align:center">
              <div style="font-size:2rem;margin-bottom:.4rem">📷</div>
              <div style="font-size:.82rem;color:var(--text2)">Foto aufnehmen oder Galerie öffnen</div>
            </div>
            <input type="file" accept="image/*" capture="environment" style="display:none" onchange="lagerFotoGewaehlt(this)" />
          </label>
          <div id="lager-ki-status" style="display:none;margin-top:.7rem"></div>
          <div id="lager-ki-vorschau" style="display:none;margin-top:.7rem"></div>
        </div>
      </div>
    </div>

    <!-- Artikel-Formular -->
    <div id="lager-artikel-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet" style="max-height:92vh;overflow-y:auto">
        <div class="form-header"><h3 id="la-titel">Artikel hinzufügen</h3><button class="close-btn" onclick="closeForm('lager-artikel-overlay')">✕</button></div>
        <div class="form-body">
          <input type="hidden" id="la-edit-id" />
          <select id="la-kategorie" class="inp">${KATEGORIEN.map(k=>`<option value="${k}">${KAT_ICONS[k]} ${k}</option>`).join('')}</select>
          <input id="la-name" class="inp" placeholder="Artikelname *" />
          <input id="la-beschreibung" class="inp" placeholder="Beschreibung / Hersteller" />
          <label class="inp-label">Einheit</label>
          <select id="la-einheit" class="inp" style="width:140px">${['Stück','kg','g','Liter','ml','Packung','Box','Karton','Flasche','Tube','Paar'].map(e=>`<option>${e}</option>`).join('')}</select>
          <label class="inp-label">Aktueller Bestand</label>
          <input id="la-bestand" class="inp" type="number" step="0.1" inputmode="decimal" placeholder="0" style="width:130px" />
          <label class="inp-label">Mindestbestand (Alarm)</label>
          <input id="la-mindest" class="inp" type="number" step="0.1" inputmode="decimal" placeholder="0" style="width:130px" />
          <label class="inp-label">Preis pro Einheit (€)</label>
          <input id="la-preis" class="inp" type="number" step="0.01" inputmode="decimal" placeholder="0.00" style="width:130px" />
          <label class="inp-label">Ablaufdatum (optional)</label>
          <input id="la-ablauf" class="inp" type="date" />
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('lager-artikel-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveLagerArtikel()">Speichern</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Verbrauch -->
    <div id="lager-verbrauch-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>− Verbrauch buchen</h3><button class="close-btn" onclick="closeForm('lager-verbrauch-overlay')">✕</button></div>
        <div class="form-body">
          <input type="hidden" id="lv-artikel-id" />
          <div id="lv-artikel-info" style="margin-bottom:.6rem;font-size:.85rem;color:var(--text2)"></div>
          <label class="inp-label">Menge verbraucht</label>
          <input id="lv-menge" class="inp" type="number" step="0.1" inputmode="decimal" style="width:130px" />
          <input id="lv-notiz" class="inp" placeholder="Notiz" />
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('lager-verbrauch-overlay')">Abbrechen</button>
            <button class="btn-primary" style="background:var(--red);border-color:var(--red)" onclick="saveLagerVerbrauch()">Buchen</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Zugang -->
    <div id="lager-zugang-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>+ Zugang buchen</h3><button class="close-btn" onclick="closeForm('lager-zugang-overlay')">✕</button></div>
        <div class="form-body">
          <input type="hidden" id="lz-artikel-id" />
          <div id="lz-artikel-info" style="margin-bottom:.6rem;font-size:.85rem;color:var(--text2)"></div>
          <label class="inp-label">Menge zugegangen</label>
          <input id="lz-menge" class="inp" type="number" step="0.1" inputmode="decimal" style="width:130px" />
          <label class="inp-label">Preis gesamt (€)</label>
          <input id="lz-preis" class="inp" type="number" step="0.01" inputmode="decimal" style="width:130px" />
          <input id="lz-notiz" class="inp" placeholder="Lieferant / Notiz" />
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('lager-zugang-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveLagerZugang()">Buchen</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
window.showLagerArtikelForm=function(id){const ov=document.getElementById('lager-artikel-overlay');if(!ov){navigate('lager');setTimeout(()=>showLagerArtikelForm(id),150);return;}const a=id?(window._lagerData?.artikel?.[id]||{}):{};document.getElementById('la-edit-id').value=id||'';document.getElementById('la-titel').textContent=id?'Artikel bearbeiten':'Artikel hinzufügen';document.getElementById('la-kategorie').value=a.kategorie||'Verbrauchsmaterial';document.getElementById('la-name').value=a.name||'';document.getElementById('la-beschreibung').value=a.beschreibung||'';document.getElementById('la-einheit').value=a.einheit||'Stück';document.getElementById('la-bestand').value=a.bestand||'';document.getElementById('la-mindest').value=a.mindestBestand||'';document.getElementById('la-preis').value=a.preis||'';document.getElementById('la-ablauf').value=a.ablaufdatum||'';ov.style.display='flex';};
window.saveLagerArtikel=async function(){const name=document.getElementById('la-name')?.value.trim();if(!name){alert('Name Pflicht');return;}const id=document.getElementById('la-edit-id')?.value;const data={kategorie:document.getElementById('la-kategorie')?.value,name,beschreibung:document.getElementById('la-beschreibung')?.value.trim()||'',einheit:document.getElementById('la-einheit')?.value,bestand:parseFloat(document.getElementById('la-bestand')?.value)||0,mindestBestand:parseFloat(document.getElementById('la-mindest')?.value)||0,preis:parseFloat(document.getElementById('la-preis')?.value)||0,ablaufdatum:document.getElementById('la-ablauf')?.value||'',updatedAt:Date.now()};if(id)await update(ref(db,'lager/artikel/'+id),data);else await push(ref(db,'lager/artikel'),data);closeForm('lager-artikel-overlay');showSaveToast&&showSaveToast('Artikel gespeichert');};
window.deleteLagerArtikel=async function(id){if(confirm('Artikel löschen?'))await remove(ref(db,'lager/artikel/'+id));};
window.showLagerVerbrauchForm=function(id){const ov=document.getElementById('lager-verbrauch-overlay');if(!ov){navigate('lager');setTimeout(()=>showLagerVerbrauchForm(id),150);return;}const a=window._lagerData?.artikel?.[id]||{};document.getElementById('lv-artikel-id').value=id;document.getElementById('lv-artikel-info').textContent=a.name+' · Bestand: '+(a.bestand||0)+' '+(a.einheit||'');document.getElementById('lv-menge').value='';document.getElementById('lv-notiz').value='';ov.style.display='flex';};
window.saveLagerVerbrauch=async function(){const id=document.getElementById('lv-artikel-id')?.value;const menge=parseFloat(document.getElementById('lv-menge')?.value);if(!menge||menge<=0){alert('Menge eingeben');return;}const a=window._lagerData?.artikel?.[id]||{};const neuerBestand=Math.max(0,(a.bestand||0)-menge);await update(ref(db,'lager/artikel/'+id),{bestand:neuerBestand,updatedAt:Date.now()});await push(ref(db,'lager/bewegungen'),{artikelId:id,typ:'verbrauch',menge,datum:Date.now(),notiz:document.getElementById('lv-notiz')?.value.trim()||''});closeForm('lager-verbrauch-overlay');if(a.mindestBestand>0&&neuerBestand<=a.mindestBestand&&typeof swNotify==='function')swNotify('📦 Lager: '+a.name+' niedrig',{body:'Bestand: '+neuerBestand+' '+(a.einheit||''),tag:'lager-'+id});showSaveToast&&showSaveToast('Verbrauch gebucht');};
window.showLagerZugangForm=function(id){const ov=document.getElementById('lager-zugang-overlay');if(!ov){navigate('lager');setTimeout(()=>showLagerZugangForm(id),150);return;}const a=window._lagerData?.artikel?.[id]||{};document.getElementById('lz-artikel-id').value=id;document.getElementById('lz-artikel-info').textContent=a.name+' · Bestand: '+(a.bestand||0)+' '+(a.einheit||'');document.getElementById('lz-menge').value='';document.getElementById('lz-preis').value='';document.getElementById('lz-notiz').value='';ov.style.display='flex';};
window.saveLagerZugang=async function(){const id=document.getElementById('lz-artikel-id')?.value;const menge=parseFloat(document.getElementById('lz-menge')?.value);if(!menge||menge<=0){alert('Menge eingeben');return;}const a=window._lagerData?.artikel?.[id]||{};const neuerBestand=(a.bestand||0)+menge;await update(ref(db,'lager/artikel/'+id),{bestand:neuerBestand,updatedAt:Date.now()});await push(ref(db,'lager/bewegungen'),{artikelId:id,typ:'zugang',menge,datum:Date.now(),preis:parseFloat(document.getElementById('lz-preis')?.value)||0,notiz:document.getElementById('lz-notiz')?.value.trim()||''});closeForm('lager-zugang-overlay');showSaveToast&&showSaveToast('Zugang gebucht');};
window.showLagerFotoImport=function(){const ov=document.getElementById('lager-foto-overlay');if(!ov){navigate('lager');setTimeout(showLagerFotoImport,150);return;}document.getElementById('lager-ki-status').style.display='none';document.getElementById('lager-ki-vorschau').style.display='none';document.getElementById('lager-foto-preview').style.display='none';ov.style.display='flex';};
window.lagerFotoGewaehlt=async function(input){const file=input.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=async function(e){const dataUrl=e.target.result;document.getElementById('lager-foto-img').src=dataUrl;document.getElementById('lager-foto-preview').style.display='block';const status=document.getElementById('lager-ki-status');status.style.display='block';status.innerHTML='<div style="display:flex;align-items:center;gap:.6rem;padding:.6rem;background:var(--bg3);border-radius:8px"><div style="width:20px;height:20px;border:2px solid var(--border);border-top-color:var(--gold);border-radius:50%;animation:spin .8s linear infinite"></div><span style="font-size:.8rem;color:var(--text2)">KI analysiert Lieferschein…</span></div>';try{const base64=dataUrl.split(',')[1];const mediaType=file.type||'image/jpeg';const resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:mediaType,data:base64}},{type:'text',text:'Analysiere diesen Lieferschein oder diese Rechnung. Extrahiere alle Artikel mit Name, Menge, Einheit, Einzelpreis. Antworte NUR mit JSON-Array:\n[{"name":"...","menge":0,"einheit":"Stück","preis":0,"kategorie":"Medikamente|Kraftfutter|Verbrauchsmaterial|Reinigungsmittel|Ersatzteile"}]\nKategorie schätzen nach Artikelname. Wenn kein Preis: preis=0.'}]}]})});const data=await resp.json();let text=data.content?.[0]?.text||'[]';text=text.replace(/```json|```/g,'').trim();const artikel=JSON.parse(text);lagerZeigeKiVorschau(artikel);}catch(err){status.innerHTML='<div style="color:var(--red);font-size:.8rem;padding:.5rem">❌ KI-Analyse fehlgeschlagen: '+err.message+'</div>';}};reader.readAsDataURL(file);};
window.lagerZeigeKiVorschau=function(artikel){const status=document.getElementById('lager-ki-status');const vorschau=document.getElementById('lager-ki-vorschau');if(!artikel||!artikel.length){status.innerHTML='<div style="color:var(--orange);font-size:.8rem;padding:.5rem">⚠ Keine Artikel erkannt.</div>';return;}status.innerHTML='<div style="color:var(--green);font-size:.8rem;padding:.4rem">✓ '+artikel.length+' Artikel erkannt</div>';vorschau.style.display='block';const KATEGORIEN=['Medikamente','Kraftfutter','Verbrauchsmaterial','Reinigungsmittel','Ersatzteile'];vorschau.innerHTML='<div style="font-size:.75rem;font-weight:700;color:var(--text3);margin-bottom:.5rem">VORSCHAU:</div>'+artikel.map((a,i)=>'<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.55rem .8rem;margin-bottom:.4rem"><div style="display:flex;justify-content:space-between;align-items:center"><div style="flex:1"><div style="font-size:.85rem;font-weight:700" contenteditable="true" id="ki-name-'+i+'">'+a.name+'</div><div style="font-size:.72rem;color:var(--text3);margin-top:2px"><span contenteditable="true" id="ki-menge-'+i+'">'+a.menge+'</span> <span contenteditable="true" id="ki-einheit-'+i+'">'+(a.einheit||'Stück')+'</span>'+(a.preis?' · €<span contenteditable="true" id="ki-preis-'+i+'">'+a.preis+'</span>/Stk':'')+'</div><select id="ki-kat-'+i+'" style="background:var(--bg2);border:1px solid var(--border);border-radius:4px;font-size:.68rem;color:var(--text3);padding:1px 3px;margin-top:3px">'+KATEGORIEN.map(k=>'<option value="'+k+'"'+(a.kategorie===k?' selected':'')+'>'+k+'</option>').join('')+'</select></div><input type="checkbox" id="ki-check-'+i+'" checked style="width:20px;height:20px;accent-color:var(--green);flex-shrink:0;margin-left:.5rem" /></div></div>').join('')+'<div style="display:flex;gap:.4rem;margin-top:.6rem"><button class="btn-secondary" style="flex:1" onclick="closeForm(\'lager-foto-overlay\')">Abbrechen</button><button class="btn-primary" style="flex:2" onclick="lagerKiUebernehmen('+artikel.length+')">✓ Übernehmen</button></div>';};
window.lagerKiUebernehmen=async function(count){let n=0;for(let i=0;i<count;i++){const check=document.getElementById('ki-check-'+i);if(!check?.checked)continue;const name=(document.getElementById('ki-name-'+i)?.textContent||'').trim();if(!name)continue;const menge=parseFloat(document.getElementById('ki-menge-'+i)?.textContent)||0;const einheit=(document.getElementById('ki-einheit-'+i)?.textContent||'Stück').trim();const preis=parseFloat(document.getElementById('ki-preis-'+i)?.textContent)||0;const kat=document.getElementById('ki-kat-'+i)?.value||'Verbrauchsmaterial';const vorhanden=Object.entries(window._lagerData?.artikel||{}).find(([,a])=>a.name.toLowerCase()===name.toLowerCase());if(vorhanden){const[vid,va]=vorhanden;await update(ref(db,'lager/artikel/'+vid),{bestand:(va.bestand||0)+menge,updatedAt:Date.now()});}else{await push(ref(db,'lager/artikel'),{kategorie:kat,name,einheit,bestand:menge,mindestBestand:0,preis,updatedAt:Date.now()});}n++;}closeForm('lager-foto-overlay');showSaveToast&&showSaveToast(n+' Artikel übernommen');};
function renderQRScanner() {
  return `
    <div class="page-header"><h2>📷 QR-Scanner</h2></div>
    <p style="font-size:.82rem;color:var(--text2);margin-bottom:1rem;line-height:1.6">
      Scanne den QR-Code einer Kuh um direkt zu ihrem Profil zu gelangen.<br>
      <span style="font-size:.72rem;color:var(--text3)">QR-Codes können im Kuh-Profil unter dem „QR"-Button erstellt werden.</span>
    </p>

    <!-- Scanner Box -->
    <div id="qr-scanner-box" style="position:relative;background:var(--bg3);border:2px solid var(--border);border-radius:16px;overflow:hidden;margin-bottom:.8rem;aspect-ratio:1;max-width:400px;margin-left:auto;margin-right:auto">
      <!-- Idle State -->
      <div id="qr-idle" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:.8rem;padding:2rem">
        <div style="font-size:4rem;opacity:.4">📷</div>
        <div style="font-size:.9rem;color:var(--text2);text-align:center">Kamera starten um QR-Code zu scannen</div>
        <button class="btn-primary" onclick="qrStart()" style="margin-top:.5rem">▶ Kamera starten</button>
      </div>
      <!-- Video -->
      <video id="qr-video" style="display:none;width:100%;height:100%;object-fit:cover" playsinline autoplay muted></video>
      <!-- Scan-Overlay -->
      <div id="qr-overlay" style="display:none;position:absolute;inset:0;pointer-events:none">
        <!-- Eckmarkierungen -->
        <div style="position:absolute;top:15%;left:15%;width:20%;height:20%;border-top:3px solid var(--gold);border-left:3px solid var(--gold);border-radius:4px 0 0 0"></div>
        <div style="position:absolute;top:15%;right:15%;width:20%;height:20%;border-top:3px solid var(--gold);border-right:3px solid var(--gold);border-radius:0 4px 0 0"></div>
        <div style="position:absolute;bottom:15%;left:15%;width:20%;height:20%;border-bottom:3px solid var(--gold);border-left:3px solid var(--gold);border-radius:0 0 0 4px"></div>
        <div style="position:absolute;bottom:15%;right:15%;width:20%;height:20%;border-bottom:3px solid var(--gold);border-right:3px solid var(--gold);border-radius:0 0 4px 0"></div>
        <!-- Scan-Linie Animation -->
        <div id="qr-scanline" style="position:absolute;left:15%;right:15%;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);animation:qrScan 2s linear infinite;top:15%"></div>
      </div>
      <!-- Canvas für jsQR -->
      <canvas id="qr-canvas" style="display:none"></canvas>
    </div>

    <!-- Stop Button -->
    <div id="qr-controls" style="display:none;text-align:center;margin-bottom:.8rem">
      <button class="btn-secondary" onclick="qrStop()">⏹ Kamera stoppen</button>
    </div>

    <!-- Ergebnis -->
    <div id="qr-result" style="display:none;background:rgba(77,184,78,.08);border:1px solid rgba(77,184,78,.3);border-radius:var(--radius);padding:.8rem 1rem;margin-bottom:.8rem">
      <div id="qr-result-content"></div>
    </div>

    <!-- Fehler -->
    <div id="qr-error" style="display:none;background:rgba(200,60,60,.08);border:1px solid rgba(200,60,60,.3);border-radius:var(--radius-sm);padding:.6rem .9rem;font-size:.8rem;color:var(--red)"></div>

    <!-- Info -->
    <div class="card-section" style="margin-top:.8rem">
      <div class="section-label" style="margin-bottom:.4rem">SO FUNKTIONIERT ES</div>
      <div class="feature-item">QR-Code in Kuh-Profil → „QR" Button → QR-Code anzeigen</div>
      <div class="feature-item">QR-Code ausdrucken und am Stallgitter befestigen</div>
      <div class="feature-item">Hier QR-Scanner öffnen → Kuh scannen → Profil öffnet sich direkt</div>
    </div>

  `;
}

// ── QR Scanner Logik ──
window._qrStream = null;
window._qrAnimFrame = null;

window.qrStart = async function() {
  const video = document.getElementById('qr-video');
  const idle  = document.getElementById('qr-idle');
  const overlay = document.getElementById('qr-overlay');
  const controls = document.getElementById('qr-controls');
  const errEl = document.getElementById('qr-error');
  if(!video) return;

  errEl.style.display = 'none';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: {ideal:1280}, height: {ideal:720} }
    });
    window._qrStream = stream;
    video.srcObject = stream;
    video.style.display = 'block';
    if(idle) idle.style.display = 'none';
    if(overlay) overlay.style.display = 'block';
    if(controls) controls.style.display = 'block';
    video.onloadedmetadata = function() {
      video.play();
      qrScanLoop();
    };
  } catch(e) {
    errEl.textContent = e.name === 'NotAllowedError'
      ? '⛔ Kamera-Zugriff verweigert. Bitte in den Browser-Einstellungen erlauben.'
      : '❌ Kamera nicht verfügbar: ' + e.message;
    errEl.style.display = 'block';
  }
};

window.qrStop = function() {
  if(window._qrStream) {
    window._qrStream.getTracks().forEach(function(t){t.stop();});
    window._qrStream = null;
  }
  if(window._qrAnimFrame) {
    cancelAnimationFrame(window._qrAnimFrame);
    window._qrAnimFrame = null;
  }
  const video = document.getElementById('qr-video');
  const idle  = document.getElementById('qr-idle');
  const overlay = document.getElementById('qr-overlay');
  const controls = document.getElementById('qr-controls');
  if(video) { video.style.display='none'; video.srcObject=null; }
  if(idle) idle.style.display='flex';
  if(overlay) overlay.style.display='none';
  if(controls) controls.style.display='none';
};

window.qrScanLoop = function() {
  const video  = document.getElementById('qr-video');
  const canvas = document.getElementById('qr-canvas');
  if(!video || !canvas || !window._qrStream) return;

  if(video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // jsQR auswerten
    if(typeof jsQR !== 'undefined') {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {inversionAttempts:'dontInvert'});
      if(code) {
        qrGefunden(code.data);
        return; // Stop loop after found
      }
    }
  }
  window._qrAnimFrame = requestAnimationFrame(qrScanLoop);
};

window.qrGefunden = function(data) {
  // Kamera stoppen
  qrStop();

  // Vibration
  if(navigator.vibrate) navigator.vibrate([50,30,50]);

  const resultEl = document.getElementById('qr-result');
  const contentEl = document.getElementById('qr-result-content');
  if(!resultEl || !contentEl) return;

  // URL parsen: erwartet ?kuh=KUHID
  let kuhId = null;
  try {
    const url = new URL(data);
    kuhId = url.searchParams.get('kuh');
  } catch(e) {
    // Kein URL – direkt als kuhId interpretieren
    if(data && kuehe[data]) kuhId = data;
  }

  if(kuhId && kuehe[kuhId]) {
    const k = kuehe[kuhId];
    const foto = fotos[kuhId];
    contentEl.innerHTML =
      '<div style="display:flex;align-items:center;gap:.8rem;margin-bottom:.6rem">'+
        (foto?`<img src="${foto.data}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid var(--green)"/>`:'<div style="font-size:2rem">🐄</div>')+
        '<div>'+
          '<div style="font-size:1rem;font-weight:700;color:var(--green)">✓ Kuh gefunden</div>'+
          '<div style="font-size:.9rem;font-weight:600">#'+k.nr+' '+( k.name||'–')+'</div>'+
          '<div style="font-size:.75rem;color:var(--text3)">'+(k.bauer||'')+(k.rasse?' · '+k.rasse:'')+'</div>'+
        '</div>'+
      '</div>'+
      '<div style="display:flex;gap:.5rem">'+
        '<button class="btn-primary" style="flex:1" onclick="showKuhDetail(\''+kuhId+'\')">→ Profil öffnen</button>'+
        '<button class="btn-secondary" onclick="qrNochmal()">🔄 Nochmal</button>'+
      '</div>';
    resultEl.style.display = 'block';
  } else {
    // QR-Code gefunden aber keine Kuh
    contentEl.innerHTML =
      '<div style="color:var(--orange);font-weight:600;margin-bottom:.4rem">⚠ QR-Code erkannt – keine Kuh gefunden</div>'+
      '<div style="font-size:.75rem;color:var(--text3);margin-bottom:.6rem;word-break:break-all">Inhalt: '+data+'</div>'+
      '<button class="btn-secondary" onclick="qrNochmal()">🔄 Nochmal versuchen</button>';
    resultEl.style.background = 'rgba(200,120,0,.08)';
    resultEl.style.borderColor = 'rgba(200,120,0,.3)';
    resultEl.style.display = 'block';
  }
};

window.qrNochmal = function() {
  const resultEl = document.getElementById('qr-result');
  if(resultEl) {
    resultEl.style.display='none';
    resultEl.style.background='rgba(77,184,78,.08)';
    resultEl.style.borderColor='rgba(77,184,78,.3)';
  }
  qrStart();
};

// Kamera stoppen wenn Navigation weg von QR-Scanner
const _origNavQR = window.navigate;
window.navigate = function(view) {
  if(view !== 'qrscanner' && window._qrStream) qrStop();
  _origNavQR(view);
};
// ══════════════════════════════════════════════════════════════
//  STALLPLAN – Tabellen-Renderer (Hauptansicht, ersetzt Canvas)
// ══════════════════════════════════════════════════════════════
function renderStallplan() {
  const ställe = window._spStaelle || {};
  const aktivId = window._spAktivId || null;
  const stallListe = Object.entries(ställe);

  // Auto-select erstes Stall wenn keiner aktiv
  if(!aktivId && stallListe.length > 0) {
    window._spAktivId = stallListe[0][0];
    setTimeout(render, 10);
  }

  const stall = window._spAktivId ? ställe[window._spAktivId] : null;

  // Auto-Migration Legacy → Tabelle (Boxen aus elemente in tableConfig+plaetze überführen)
  if(stall && !stall.tableConfig && stall.elemente && stall.elemente.length > 0) {
    spAutoMigrate(window._spAktivId, stall);
  }

  // Filter-Chip Daten
  const aktivFilter = window._spFilter || 'alle';
  const bauernSet = {};
  if(stall && stall.plaetze) {
    Object.values(stall.plaetze).forEach(kuhId => {
      const k = kuhId && kuehe[kuhId];
      if(k && k.bauer) bauernSet[k.bauer] = true;
    });
  }
  const bauernListe = Object.keys(bauernSet).sort();
  const gruppenListe = Object.entries(gruppen || {});

  function chipBtn(id, label, icon){
    const aktiv = aktivFilter === id;
    return '<button class="filter-chip '+(aktiv?'active':'')+'" onclick="spSetFilter(\''+id.replace(/\'/g,"\\\\'")+'\')">'+(icon?icon+' ':'')+label+'</button>';
  }

  // Reihen-HTML rendern
  let reihenHTML = '';
  if(stall && stall.tableConfig && Array.isArray(stall.tableConfig.reihen)) {
    reihenHTML = stall.tableConfig.reihen.map((reihe, rIdx) =>
      spRenderReihe(reihe, rIdx, stall)
    ).join('');
  } else if(stall) {
    reihenHTML = '<div class="empty-state" style="margin:1rem 0"><div style="font-size:2rem;margin-bottom:.5rem">📐</div><div>Noch kein Layout gesetzt</div><button class="btn-primary" style="margin-top:.6rem" onclick="spOpenWizard(\''+window._spAktivId+'\')">📋 Layout anlegen</button></div>';
  }

  return `<div class="page-header">
    <h2>🏚 Stallplan</h2>
    <button class="btn-primary" onclick="spOpenWizard()">+ Stall</button>
  </div>

  ${stallListe.length > 1 ? `
  <div style="display:flex;gap:.3rem;flex-wrap:wrap;margin-bottom:.7rem;padding:.2rem 0">
    ${stallListe.map(([sid, s]) => `
      <button class="filter-chip ${window._spAktivId===sid?'active':''}"
        onclick="window._spAktivId='${sid}';render()">${s.name||'Stall'}</button>
    `).join('')}
  </div>` : ''}

  ${stall ? `
  <!-- Filter-Chips -->
  <div style="display:flex;gap:.3rem;overflow-x:auto;margin-bottom:.7rem;padding:.2rem 0">
    ${chipBtn('alle', 'Alle', '🐄')}
    ${chipBtn('wz', 'Mit WZ', '⚕')}
    ${chipBtn('trocken', 'Trockensteher', '🌾')}
    ${bauernListe.map(b => chipBtn('bauer:'+b, b, '👤')).join('')}
    ${gruppenListe.map(([gid, g]) => chipBtn('gruppe:'+gid, g.name||'Gruppe', '🏷')).join('')}
  </div>

  <!-- Reihen-Tabelle -->
  <div class="sp-stall-tabelle">${reihenHTML}</div>

  <!-- Aktionen -->
  <div style="display:flex;gap:.5rem;margin-top:1.2rem;flex-wrap:wrap">
    <button class="btn-xs" onclick="spOpenWizard('${window._spAktivId}')">✎ Layout bearbeiten</button>
    <button class="btn-xs" onclick="spStallUmbenennen('${window._spAktivId}')">📝 Umbenennen</button>
    <button class="btn-xs-danger" onclick="spStallLoeschen('${window._spAktivId}')">🗑 Stall löschen</button>
  </div>
  ` : `
  <div class="empty-state" style="margin-top:2rem;text-align:center">
    <div style="font-size:3rem;margin-bottom:.8rem">🏚</div>
    <div style="font-size:1.1rem;margin-bottom:1rem">Noch kein Stall angelegt</div>
    <button class="btn-primary" onclick="spOpenWizard()">+ Stall anlegen</button>
  </div>`}

  <!-- Wizard-Overlay -->
  <div id="sp-wizard-overlay" class="form-overlay" style="display:none">
    <div class="form-sheet">
      <div class="form-header"><h3>🏚 Stall einrichten</h3><button class="close-btn" onclick="closeForm('sp-wizard-overlay')">✕</button></div>
      <div class="form-body">
        <input type="hidden" id="sp-wiz-id" />
        <label class="inp-label">Stallname *</label>
        <input id="sp-wiz-name" class="inp" placeholder="z. B. Nasereinalm" />

        <label class="inp-label" style="margin-top:.6rem">Reihen</label>
        <div id="sp-wiz-reihen" style="display:flex;flex-direction:column;gap:.5rem"></div>
        <button class="btn-xs" onclick="spWizAddReihe()">+ Reihe hinzufügen</button>

        <details style="margin-top:1rem;padding:.5rem .8rem;background:var(--bg3);border-radius:8px">
          <summary style="cursor:pointer;color:var(--gold);font-weight:600">📋 Per Text-Beschreibung anlegen</summary>
          <div style="font-size:.85rem;color:var(--text3);margin:.5rem 0">
            Vorlage:<br>
            <code style="display:block;background:var(--bg);padding:.5rem;border-radius:6px;margin-top:.3rem;white-space:pre-wrap;font-size:.8rem">Bergseite: 28 Plätze, Säule alle 4
Talseite: 4 Plätze, Säule, 4 Plätze, Säule, 3 Plätze, Tür "Eingangstür", 16 Plätze, Säule alle 4</code>
          </div>
          <textarea id="sp-wiz-text" class="inp" rows="5" placeholder="Stall-Beschreibung eingeben…"></textarea>
          <button class="btn-xs" style="margin-top:.4rem" onclick="spWizParseText()">📋 Aus Text füllen</button>
          <div id="sp-wiz-text-err" style="color:var(--red);font-size:.85rem;margin-top:.3rem"></div>
        </details>

        <div class="form-actions" style="margin-top:1rem">
          <button class="btn-secondary" onclick="closeForm('sp-wizard-overlay')">Abbrechen</button>
          <button class="btn-primary" onclick="spSaveWizard()">Speichern</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Kuh-Zuweisung-Overlay -->
  <div id="sp-kuh-overlay" class="form-overlay" style="display:none">
    <div class="form-sheet">
      <div class="form-header"><h3>🐄 Kuh dem Platz zuweisen</h3><button class="close-btn" onclick="closeForm('sp-kuh-overlay')">✕</button></div>
      <div class="form-body">
        <input type="hidden" id="sp-kuh-platzid" />
        <div id="sp-kuh-platzlbl" style="font-size:1rem;color:var(--text2);margin-bottom:.5rem"></div>
        <select id="sp-kuh-select" class="inp">
          <option value="">— Leer lassen —</option>
          ${Object.entries(kuehe).sort((a,b)=>(parseInt(a[1].nr)||0)-(parseInt(b[1].nr)||0))
            .map(([id,k])=>`<option value="${id}">#${k.nr} ${k.name||'–'} ${k.bauer?'('+k.bauer+')':''}</option>`).join('')}
        </select>
        <div class="form-actions">
          <button class="btn-secondary" onclick="closeForm('sp-kuh-overlay')">Abbrechen</button>
          <button class="btn-primary" onclick="spSavePlatzZuweisung()">Zuweisen</button>
        </div>
      </div>
    </div>
  </div>

  `;
}


// ══════════════════════════════════════════════════════════════
//  STALLPLAN – Tabellen-Helfer (Wizard, Render-Reihe, Migration)
// ══════════════════════════════════════════════════════════════

// Sektoren-Liste aus einer Reihe in Render-Items expandieren
window.spExpandReihe = function(reihe) {
  var items = []; var platzNr = 0;
  (reihe.sektoren||[]).forEach(function(sek){
    if(sek.typ === 'plaetze') {
      var n = sek.anzahl || 0;
      for(var i = 0; i < n; i++) {
        platzNr++;
        items.push({typ:'platz', nr:platzNr});
        if(sek.saeuleAlle && (i+1) % sek.saeuleAlle === 0 && i < n-1) {
          items.push({typ:'saeule'});
        }
      }
    } else if(sek.typ === 'saeule') {
      items.push({typ:'saeule'});
    } else if(sek.typ === 'tuer') {
      items.push({typ:'tuer', label: sek.label || 'Tür'});
    } else if(sek.typ === 'fenster') {
      items.push({typ:'fenster', label: sek.label || 'Fenster'});
    }
  });
  return items;
};

// Eine Reihe rendern (HTML-String)
window.spRenderReihe = function(reihe, rIdx, stall) {
  var items = window.spExpandReihe(reihe);
  var plaetze = stall.plaetze || {};
  var platzNamen = stall.platzNamen || {};
  var rname = reihe.name || ('Reihe '+(rIdx+1));
  var prefix = (rname[0] || 'R').toUpperCase();
  var aktivFilter = window._spFilter || 'alle';

  var html = '<div class="sp-reihe">';
  html += '<div class="sp-reihe-name">'+rname+'</div>';
  html += '<div class="sp-platz-liste">';
  items.forEach(function(it){
    if(it.typ === 'saeule') {
      html += '<div class="sp-saeule"><span>▬</span> Säule <span>▬</span></div>';
    } else if(it.typ === 'tuer') {
      html += '<div class="sp-tuer">🚪 '+(it.label||'Tür')+'</div>';
    } else if(it.typ === 'fenster') {
      html += '<div class="sp-fenster">🪟 '+(it.label||'Fenster')+'</div>';
    } else if(it.typ === 'platz') {
      var platzId = rIdx + '-' + it.nr;
      var kuhId = plaetze[platzId];
      var customName = platzNamen[platzId];
      var label = customName || (prefix + '-' + it.nr);
      var k = kuhId && kuehe[kuhId];

      // WZ-Status
      var wzStatus = 'none', wzResttage = null;
      if(k) {
        var heute = Date.now();
        var aktBeh = Object.values(behandlungen).filter(function(b){return b.kuhId===kuhId&&b.aktiv;});
        var enden = [];
        aktBeh.forEach(function(b){
          if(b.wzMilchEnde && b.wzMilchEnde>heute) enden.push(b.wzMilchEnde);
          if(b.wzFleischEnde && b.wzFleischEnde>heute) enden.push(b.wzFleischEnde);
        });
        if(enden.length){
          var minEnde = Math.min.apply(null,enden);
          var endeTag = new Date(minEnde); endeTag.setHours(0,0,0,0);
          var heuteTag = new Date(heute); heuteTag.setHours(0,0,0,0);
          wzResttage = Math.max(0, Math.round((endeTag-heuteTag)/86400000));
          wzStatus = wzResttage<=1 ? 'kritisch' : 'aktiv';
        }
      }

      // Filter prüfen
      var filterPasst = true;
      if(typeof window.spBoxFilterPasst === 'function') {
        filterPasst = window.spBoxFilterPasst({typ:'box',kuhId:kuhId}, k);
      }

      var classes = 'sp-platz';
      if(!k) classes += ' sp-platz-leer';
      if(wzStatus === 'kritisch') classes += ' sp-platz-wz-krit';
      else if(wzStatus === 'aktiv') classes += ' sp-platz-wz-aktiv';
      else if(k) classes += ' sp-platz-belegt';
      if(!filterPasst) classes += ' sp-platz-faded';

      html += '<button class="'+classes+'" data-platzid="'+platzId+'"'+(kuhId?' data-kuhid="'+kuhId+'"':'')+' onclick="spPlatzClicked(\''+platzId+'\')">';
      html += '<span class="sp-platz-nr">'+label+'</span>';
      if(k) {
        html += '<span class="sp-platz-kuh"><b>#'+k.nr+'</b> '+(k.name||'–')+'</span>';
        html += '<span class="sp-platz-bauer">'+(k.bauer?'👤 '+k.bauer:'')+'</span>';
        if(wzStatus !== 'none') {
          var sym = wzStatus==='kritisch' ? '⚕' : '⏱';
          html += '<span class="sp-platz-wz">'+sym+' '+wzResttage+'T</span>';
        }
      } else {
        html += '<span class="sp-platz-leer-text">+ leer</span>';
      }
      html += '</button>';
    }
  });
  html += '</div></div>';
  return html;
};

// Tap auf Platz: bei belegtem Platz → Schnellansicht; bei leerem → Zuweisung
window.spPlatzClicked = function(platzId) {
  var stall = window._spStaelle[window._spAktivId];
  if(!stall) return;
  var kuhId = (stall.plaetze||{})[platzId];
  if(kuhId && kuehe[kuhId] && typeof window.spShowQuickView === 'function') {
    window.spShowQuickView(kuhId);
  } else {
    // Zuweisung öffnen
    var ov = document.getElementById('sp-kuh-overlay');
    if(!ov) return;
    document.getElementById('sp-kuh-platzid').value = platzId;
    var lbl = document.getElementById('sp-kuh-platzlbl');
    if(lbl) {
      var rIdx = parseInt(platzId.split('-')[0]);
      var pNr = platzId.split('-')[1];
      var rname = stall.tableConfig.reihen[rIdx]?.name || ('Reihe '+(rIdx+1));
      lbl.textContent = rname+' · Platz '+pNr;
    }
    var sel = document.getElementById('sp-kuh-select');
    if(sel) sel.value = '';
    ov.style.display = 'flex';
  }
};

// Zuweisung speichern
window.spSavePlatzZuweisung = async function() {
  var platzId = document.getElementById('sp-kuh-platzid').value;
  var kuhId = document.getElementById('sp-kuh-select').value;
  if(!platzId) return;
  var path = 'stallplanV2/'+window._spAktivId+'/plaetze/'+platzId;
  if(kuhId) await update(ref(db,'stallplanV2/'+window._spAktivId+'/plaetze'), {[platzId]: kuhId});
  else await remove(ref(db, path));
  closeForm('sp-kuh-overlay');
  if(window.haptic) window.haptic('save');
};

// ── Wizard ─────────────────────────────────────────────────────
window._spWizReihen = []; // editierbare Reihen während Wizard

window.spOpenWizard = function(stallId) {
  var ov = document.getElementById('sp-wizard-overlay');
  if(!ov){navigate('stallplan');setTimeout(function(){spOpenWizard(stallId);},200);return;}
  var stall = stallId && window._spStaelle ? window._spStaelle[stallId] : null;
  document.getElementById('sp-wiz-id').value = stallId || '';
  document.getElementById('sp-wiz-name').value = stall ? (stall.name||'') : '';
  document.getElementById('sp-wiz-text').value = '';
  document.getElementById('sp-wiz-text-err').textContent = '';
  // Reihen aus Stall oder Default
  if(stall && stall.tableConfig && stall.tableConfig.reihen) {
    window._spWizReihen = JSON.parse(JSON.stringify(stall.tableConfig.reihen));
  } else {
    window._spWizReihen = [
      { name: 'Bergseite', sektoren: [{typ:'plaetze', anzahl:10, saeuleAlle:0}] },
      { name: 'Talseite',  sektoren: [{typ:'plaetze', anzahl:10, saeuleAlle:0}] }
    ];
  }
  spWizRender();
  ov.style.display = 'flex';
};

window.spWizAddReihe = function() {
  window._spWizReihen.push({name:'Reihe '+(window._spWizReihen.length+1), sektoren:[{typ:'plaetze',anzahl:10,saeuleAlle:0}]});
  spWizRender();
};
window.spWizDelReihe = function(idx) {
  window._spWizReihen.splice(idx,1);
  spWizRender();
};
window.spWizSetReihe = function(idx, field, val) {
  if(field === 'name') window._spWizReihen[idx].name = val;
  else if(field === 'anzahl') window._spWizReihen[idx].sektoren[0].anzahl = parseInt(val)||0;
  else if(field === 'saeule') window._spWizReihen[idx].sektoren[0].saeuleAlle = parseInt(val)||0;
};
window.spWizRender = function() {
  var box = document.getElementById('sp-wiz-reihen');
  if(!box) return;
  box.innerHTML = window._spWizReihen.map(function(r, idx){
    var ersterSektor = (r.sektoren && r.sektoren[0]) || {typ:'plaetze',anzahl:0,saeuleAlle:0};
    var hatKomplexeSektoren = r.sektoren && r.sektoren.length > 1;
    return '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.7rem">'+
      '<div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem">'+
        '<input class="inp" placeholder="Reihen-Name" value="'+(r.name||'').replace(/"/g,'&quot;')+'" oninput="spWizSetReihe('+idx+',\'name\',this.value)" style="flex:1" />'+
        '<button class="btn-xs-danger" onclick="spWizDelReihe('+idx+')">🗑</button>'+
      '</div>'+
      (hatKomplexeSektoren
        ? '<div style="font-size:.85rem;color:var(--text3);padding:.4rem;background:var(--bg);border-radius:6px">📋 Komplexes Layout — über Text-Eingabe änderbar</div>'
        : '<div style="display:flex;gap:.5rem">'+
            '<div style="flex:1"><label class="inp-label">Anzahl Plätze</label><input class="inp" type="number" min="1" value="'+(ersterSektor.anzahl||0)+'" oninput="spWizSetReihe('+idx+',\'anzahl\',this.value)" /></div>'+
            '<div style="flex:1"><label class="inp-label">Säule alle (0=keine)</label><input class="inp" type="number" min="0" value="'+(ersterSektor.saeuleAlle||0)+'" oninput="spWizSetReihe('+idx+',\'saeule\',this.value)" /></div>'+
          '</div>'
      )+
    '</div>';
  }).join('');
};

window.spSaveWizard = async function() {
  var stallId = document.getElementById('sp-wiz-id').value;
  var name = document.getElementById('sp-wiz-name').value.trim();
  if(!name){alert('Stallname Pflicht');return;}
  if(!window._spWizReihen.length){alert('Mindestens eine Reihe');return;}

  var tableConfig = { reihen: window._spWizReihen };
  if(stallId) {
    await update(ref(db,'stallplanV2/'+stallId), {name:name, tableConfig:tableConfig});
  } else {
    var nr = await push(ref(db,'stallplanV2'), {name:name, tableConfig:tableConfig, plaetze:{}});
    window._spAktivId = nr.key;
  }
  closeForm('sp-wizard-overlay');
  if(window.haptic) window.haptic('save');
  showSaveToast && showSaveToast('Stall gespeichert');
};

// Text-Parser: parsed strikte Syntax und füllt _spWizReihen
window.spWizParseText = function() {
  var text = document.getElementById('sp-wiz-text').value;
  var errEl = document.getElementById('sp-wiz-text-err');
  errEl.textContent = '';
  if(!text.trim()){errEl.textContent='Kein Text eingegeben';return;}
  try {
    var lines = text.split(/\n+/).map(function(s){return s.trim();}).filter(Boolean);
    var reihen = [];
    lines.forEach(function(line){
      // Format: "ReihenName: <sektoren>"
      var m = line.match(/^([^:]+):\s*(.+)$/);
      if(!m) return; // Zeile ignorieren
      var rname = m[1].trim();
      var rest = m[2].trim();
      // Spezial-Zeilen "Gang", "Tür" außerhalb von Reihen ignorieren wir vorerst
      if(/^(gang|tür|tuer|fenster)/i.test(rname)) return;

      var sektoren = [];
      // Sektoren komma-getrennt
      var teile = rest.split(/,\s*/);
      teile.forEach(function(t){
        // "28 Plätze" oder "28 Plätze, Säule alle 4" – die "alle 4" Variante steht aber separat
        var mPlaetze = t.match(/^(\d+)\s*(?:plätze|plaetze|stellplätze|stellplaetze|plätzen|stellplatz|stellplätzen)/i);
        if(mPlaetze) {
          var anzahl = parseInt(mPlaetze[1]);
          // "Säule alle N" prüfen ob gleicher Token
          var mSAlle = t.match(/säule\s+alle\s+(\d+)|saeule\s+alle\s+(\d+)/i);
          var saeuleAlle = mSAlle ? parseInt(mSAlle[1]||mSAlle[2]) : 0;
          sektoren.push({typ:'plaetze', anzahl:anzahl, saeuleAlle:saeuleAlle});
          return;
        }
        if(/^(säule|saeule)$/i.test(t)) { sektoren.push({typ:'saeule'}); return; }
        var mTuer = t.match(/^(tür|tuer|eingangstür|eingangstuer)\b\s*"?([^"]*)"?/i);
        if(mTuer) { sektoren.push({typ:'tuer', label:(mTuer[2]||'Tür').trim()}); return; }
        var mFen = t.match(/^fenster\b\s*"?([^"]*)"?/i);
        if(mFen) { sektoren.push({typ:'fenster', label:(mFen[1]||'Fenster').trim()}); return; }
      });
      if(sektoren.length) reihen.push({name:rname, sektoren:sektoren});
    });
    if(!reihen.length) {errEl.textContent='Keine gültigen Reihen erkannt'; return;}
    window._spWizReihen = reihen;
    spWizRender();
    errEl.style.color = 'var(--green)';
    errEl.textContent = '✓ '+reihen.length+' Reihen erkannt';
    setTimeout(function(){errEl.textContent='';errEl.style.color='var(--red)';}, 3000);
  } catch(e) {
    errEl.textContent = 'Fehler beim Parsen: '+e.message;
  }
};

// Auto-Migration: wenn Stall nur Legacy-elemente hat, daraus tableConfig+plaetze ableiten
window.spAutoMigrate = function(stallId, stall) {
  if(stall.tableConfig) return;
  var boxen = (stall.elemente||[]).filter(function(e){return e.typ==='box';});
  if(!boxen.length) return;
  // Sortierung: nach y, dann x → grobe Reihen-Annäherung
  boxen.sort(function(a,b){return (a.y-b.y)||(a.x-b.x);});
  // Default: alle in eine Reihe stecken
  var tableConfig = {
    reihen: [{
      name: 'Reihe 1',
      sektoren: [{typ:'plaetze', anzahl:boxen.length, saeuleAlle:0}]
    }]
  };
  var plaetze = {};
  boxen.forEach(function(b, i){
    if(b.kuhId) plaetze['0-'+(i+1)] = b.kuhId;
  });
  // Lokal direkt setzen damit der Render sofort klappt
  stall.tableConfig = tableConfig;
  stall.plaetze = plaetze;
  // In Firebase persistieren
  update(ref(db,'stallplanV2/'+stallId), {tableConfig:tableConfig, plaetze:plaetze}).catch(function(e){console.warn('Migrate fail:',e);});
};

// ══════════════════════════════════════════════════════════════
//  STALLPLAN – Canvas Engine (LEGACY, nicht mehr aufgerufen)
// ══════════════════════════════════════════════════════════════

// State
window._spStaelle     = {};  // {id: {name, polygon:[[x,y],...], elemente:[{typ,x,y,w,h,kuhId}]}}
window._spAktivId     = null;
window._spModus       = 'ansicht';
window._spWerkzeug    = 'gang_h';
window._spZoom        = 1;
window._spPanX        = 0;
window._spPanY        = 0;
window._spDrawPts     = [];   // Punkte beim Polygon-Zeichnen
window._spDragEl      = null; // Drag-State
window._spDragOffset  = {x:0,y:0};
window._spPinchDist   = 0;
window._spLastTap     = 0;

// Firebase sync – wird in initApp() registriert sobald db verfügbar ist
window._spRegisterStallplanListener = function() {
  if(!db || typeof onValue !== 'function') return;
  onValue(ref(db,'stallplanV2'), function(snap) {
    var data = snap.val() || {};
    window._spStaelle = data;
    if(!window._spAktivId && Object.keys(data).length)
      window._spAktivId = Object.keys(data)[0];
    if(typeof spInitCanvas === 'function') spInitCanvas();
  });
};

function spGetCanvas() { return document.getElementById('sp-canvas'); }
function spGetCtx()    { var c=spGetCanvas(); return c?c.getContext('2d'):null; }

function spGetStall() {
  return window._spAktivId && window._spStaelle[window._spAktivId]
    ? window._spStaelle[window._spAktivId] : null;
}

// ── Canvas initialisieren ──
window.spInitCanvas = function() {
  var wrap = document.getElementById('sp-canvas-wrap');
  var canvas = spGetCanvas();
  if(!wrap||!canvas) return;
  var dpr = window.devicePixelRatio||1;
  var W = wrap.offsetWidth, H = wrap.offsetHeight||Math.round(W*0.75);
  canvas.width  = W*dpr; canvas.height = H*dpr;
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  var ctx = spGetCtx(); ctx.scale(dpr,dpr);
  spDraw(W,H);
  spBindEvents(canvas,W,H);
};

// ── Zeichnen ──
window.spDraw = function(W,H) {
  var canvas=spGetCanvas(); if(!canvas)return;
  var ctx=spGetCtx(); if(!ctx)return;
  var dpr=window.devicePixelRatio||1;
  W=W||canvas.width/dpr; H=H||canvas.height/dpr;
  ctx.clearRect(0,0,W,H);

  // Hintergrund
  ctx.fillStyle='#141414'; ctx.fillRect(0,0,W,H);

  // Raster-Hilfsgitter (dezent)
  ctx.strokeStyle='rgba(255,255,255,.04)'; ctx.lineWidth=1;
  for(var gx=0;gx<W;gx+=20){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke();}
  for(var gy=0;gy<H;gy+=20){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke();}

  ctx.save();
  ctx.translate(window._spPanX, window._spPanY);
  ctx.scale(window._spZoom, window._spZoom);

  var stall = spGetStall();
  if(!stall) { ctx.restore(); return; }

  // ── Grundriss ──
  var poly = stall.polygon || [];
  if(poly.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for(var i=1;i<poly.length;i++) ctx.lineTo(poly[i][0],poly[i][1]);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.fill();
    ctx.strokeStyle = '#d4a84b';
    ctx.lineWidth = 3/window._spZoom;
    ctx.stroke();
  }

  // Polygon wird gerade gezeichnet
  var pts = window._spDrawPts;
  if(window._spModus==='zeichnen' && pts.length > 0) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0],pts[0][1]);
    for(var j=1;j<pts.length;j++) ctx.lineTo(pts[j][0],pts[j][1]);
    ctx.strokeStyle='rgba(212,168,75,.7)'; ctx.lineWidth=2/window._spZoom;
    ctx.setLineDash([6,4]); ctx.stroke(); ctx.setLineDash([]);
    // Punkte
    pts.forEach(function(p,pi) {
      ctx.beginPath(); ctx.arc(p[0],p[1],5/window._spZoom,0,Math.PI*2);
      ctx.fillStyle = pi===0?'#d4a84b':'rgba(212,168,75,.6)'; ctx.fill();
    });
    // Schließ-Hinweis
    if(pts.length>=3){
      ctx.beginPath();ctx.arc(pts[0][0],pts[0][1],10/window._spZoom,0,Math.PI*2);
      ctx.strokeStyle='rgba(212,168,75,.4)';ctx.lineWidth=1.5/window._spZoom;ctx.stroke();
    }
  }

  // ── Elemente ──
  var elemente = stall.elemente || [];
  elemente.forEach(function(el,ei) {
    spDrawElement(ctx, el, ei);
  });

  ctx.restore();
};

window.spDrawElement = function(ctx, el, ei) {
  var z = window._spZoom;
  var lw = 2/z;
  switch(el.typ) {
    case 'gang_h':
      ctx.fillStyle='rgba(80,80,80,.7)';
      ctx.strokeStyle='#666'; ctx.lineWidth=lw;
      ctx.fillRect(el.x,el.y,el.w||80,el.h||16);
      ctx.strokeRect(el.x,el.y,el.w||80,el.h||16);
      ctx.fillStyle='rgba(255,255,255,.5)'; ctx.font='bold '+(10/z)+'px sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('GANG',(el.x+(el.w||80)/2),(el.y+(el.h||16)/2));
      break;
    case 'gang_v':
      ctx.fillStyle='rgba(80,80,80,.7)';
      ctx.strokeStyle='#666'; ctx.lineWidth=lw;
      ctx.fillRect(el.x,el.y,el.w||16,el.h||80);
      ctx.strokeRect(el.x,el.y,el.w||16,el.h||80);
      break;
    case 'tuer':
      ctx.fillStyle='rgba(60,35,5,.9)';
      ctx.strokeStyle='#8B6914'; ctx.lineWidth=2/z;
      ctx.fillRect(el.x,el.y,el.w||20,el.h||36);
      ctx.strokeRect(el.x,el.y,el.w||20,el.h||36);
      // Türbogen
      var tw=el.w||20, th=el.h||36;
      ctx.beginPath();
      ctx.arc(el.x+tw/2,el.y+th*0.6,tw/2,Math.PI,0,false);
      ctx.strokeStyle='#d4a84b'; ctx.lineWidth=1.5/z; ctx.stroke();
      ctx.fillStyle='#d4a84b'; ctx.font='bold '+(9/z)+'px sans-serif';
      ctx.textAlign='center'; ctx.fillText('🚪',el.x+tw/2,el.y+th*0.2);
      break;
    case 'fenster':
      ctx.fillStyle='rgba(74,184,232,.15)';
      ctx.strokeStyle='#4ab8e8'; ctx.lineWidth=2/z;
      ctx.fillRect(el.x,el.y,el.w||40,el.h||12);
      ctx.strokeRect(el.x,el.y,el.w||40,el.h||12);
      var fw=el.w||40, fh=el.h||12;
      ctx.strokeStyle='rgba(74,184,232,.5)'; ctx.lineWidth=1/z;
      ctx.beginPath();ctx.moveTo(el.x+fw/2,el.y);ctx.lineTo(el.x+fw/2,el.y+fh);ctx.stroke();
      ctx.beginPath();ctx.moveTo(el.x,el.y+fh/2);ctx.lineTo(el.x+fw,el.y+fh/2);ctx.stroke();
      break;
    case 'pfeiler':
      ctx.fillStyle='rgba(40,40,40,.9)';
      ctx.strokeStyle='#555'; ctx.lineWidth=2/z;
      ctx.fillRect(el.x,el.y,el.w||20,el.h||20);
      ctx.strokeRect(el.x,el.y,el.w||20,el.h||20);
      ctx.fillStyle='rgba(255,255,255,.3)'; ctx.font=(9/z)+'px sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('■',el.x+(el.w||20)/2,el.y+(el.h||20)/2);
      break;
    case 'box':
      var bw=el.w||50, bh=el.h||40;
      var k = el.kuhId ? kuehe[el.kuhId] : null;
      // Filter-Opacity (Phase 7) – wenn Filter aktiv und Box nicht passt, abblenden
      var filterPasst = (typeof window.spBoxFilterPasst==='function')
        ? window.spBoxFilterPasst(el, k)
        : true;
      var globalAlpha = filterPasst ? 1 : 0.3;
      ctx.save(); ctx.globalAlpha = globalAlpha;

      // ── WZ-Status ermitteln ─────────────────────────────────────
      var wzStatus = 'none';      // 'none' | 'aktiv' | 'kritisch'
      var wzResttage = null;
      if(k) {
        var heute=Date.now();
        var aktBeh=Object.values(behandlungen).filter(function(b){return b.kuhId===el.kuhId&&b.aktiv;});
        var alleEnden = [];
        aktBeh.forEach(function(b){
          if(b.wzMilchEnde && b.wzMilchEnde>heute) alleEnden.push(b.wzMilchEnde);
          if(b.wzFleischEnde && b.wzFleischEnde>heute) alleEnden.push(b.wzFleischEnde);
        });
        if(alleEnden.length){
          var minEnde = Math.min.apply(null, alleEnden);
          var endeTag = new Date(minEnde); endeTag.setHours(0,0,0,0);
          var heuteTag = new Date(heute);  heuteTag.setHours(0,0,0,0);
          wzResttage = Math.max(0, Math.round((endeTag.getTime()-heuteTag.getTime())/86400000));
          wzStatus = (wzResttage<=1) ? 'kritisch' : 'aktiv';
        }
      }
      // Ampelfarbe
      var boxFarbe='rgba(212,168,75,.15)';
      var borderFarbe='rgba(212,168,75,.5)';
      if(k) {
        if(wzStatus==='kritisch'){boxFarbe='rgba(212,60,60,.2)';borderFarbe='#d44b4b';}
        else if(wzStatus==='aktiv'){boxFarbe='rgba(212,132,75,.2)';borderFarbe='#d4844b';}
        else{boxFarbe='rgba(77,184,78,.12)';borderFarbe='#4db84e';}
      }

      // ── Pulse-Ring bei kritischer WZ ──────────────────────────
      if(wzStatus==='kritisch' && filterPasst) {
        var phase = (Math.sin(Date.now()/450) + 1) / 2; // 0..1
        var ringGrow = 1 + phase*3;            // 1..4 px
        var ringAlpha = 0.55 - phase*0.35;     // 0.55..0.20
        ctx.strokeStyle = 'rgba(212,60,60,'+ringAlpha+')';
        ctx.lineWidth = 2/z;
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(el.x-ringGrow/z, el.y-ringGrow/z, bw+2*ringGrow/z, bh+2*ringGrow/z, 5/z);
        else ctx.rect(el.x-ringGrow/z, el.y-ringGrow/z, bw+2*ringGrow/z, bh+2*ringGrow/z);
        ctx.stroke();
        // Animation-Loop anstoßen
        if(typeof window.spRequestAnimation==='function') window.spRequestAnimation();
      }

      // ── Box-Hintergrund ──────────────────────────────────────
      ctx.fillStyle=boxFarbe; ctx.strokeStyle=borderFarbe; ctx.lineWidth=1.5/z;
      ctx.beginPath();
      if(ctx.roundRect)ctx.roundRect(el.x,el.y,bw,bh,4/z);else ctx.rect(el.x,el.y,bw,bh);
      ctx.fill(); ctx.stroke();

      // Box-Nummer (oben links)
      var boxNr = (stall.elemente||[]).filter(function(e){return e.typ==='box';}).indexOf(el)+1;
      ctx.fillStyle='rgba(255,255,255,.3)'; ctx.font=(8/z)+'px sans-serif';
      ctx.textAlign='left'; ctx.textBaseline='top';
      ctx.fillText(boxNr, el.x+3/z, el.y+2/z);

      // ── WZ-Symbol + Resttage (oben rechts) ────────────────────
      if(wzStatus !== 'none') {
        var sym = (wzStatus==='kritisch') ? '⚕' : '⏱';
        var symColor = (wzStatus==='kritisch') ? '#d44b4b' : '#d4844b';
        ctx.fillStyle = symColor;
        ctx.font = 'bold '+(9/z)+'px sans-serif';
        ctx.textAlign='right'; ctx.textBaseline='top';
        ctx.fillText(sym, el.x+bw-3/z, el.y+1/z);
        if(wzResttage !== null) {
          ctx.fillStyle = 'rgba(255,255,255,.85)';
          ctx.font = 'bold '+(7/z)+'px sans-serif';
          ctx.fillText(wzResttage+'T', el.x+bw-3/z, el.y+10/z);
        }
      }

      if(k) {
        // Foto oder Emoji (Mitte)
        var foto=fotos[el.kuhId];
        ctx.fillStyle='rgba(255,255,255,.9)'; ctx.font='bold '+(10/z)+'px sans-serif';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(foto?'📷':'🐄',el.x+bw/2,el.y+bh*0.35);
        // Kuh-Name
        ctx.font='bold '+(9/z)+'px sans-serif';
        ctx.fillStyle='rgba(255,255,255,.85)';
        var nm=(k.name||'#'+k.nr);
        if(nm.length>8)nm=nm.slice(0,7)+'…';
        ctx.fillText(nm,el.x+bw/2,el.y+bh*0.65);
        // Bauer-Name (klein, gedimmt)
        if(k.bauer) {
          var bauerNm = String(k.bauer);
          if(bauerNm.length>9) bauerNm = bauerNm.slice(0,8)+'…';
          ctx.font=(7/z)+'px sans-serif';
          ctx.fillStyle='rgba(212,168,75,.75)';
          ctx.fillText(bauerNm, el.x+bw/2, el.y+bh*0.86);
        }
      } else {
        ctx.fillStyle='rgba(255,255,255,.2)'; ctx.font=(14/z)+'px sans-serif';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('+',el.x+bw/2,el.y+bh/2);
      }
      ctx.restore();
      break;
  }
  // Resize-Handle im Element-Modus
  if(window._spModus==='elemente') {
    var ew=el.w||50, eh=el.h||40;
    ctx.fillStyle='rgba(212,168,75,.6)';
    ctx.beginPath();ctx.arc(el.x+ew,el.y+eh,5/z,0,Math.PI*2);ctx.fill();
  }
};

// ── Pulse-Animation-Loop ───────────────────────────────────────
// Wird angefragt sobald eine Box mit kritischer WZ gezeichnet wird.
// Stoppt automatisch wenn Stallplan-View verlassen wird oder keine
// kritische WZ mehr vorliegt (dann ruft niemand mehr spRequestAnimation auf).
window._spAnimReq = null;
window._spAnimLastDraw = 0;
window.spRequestAnimation = function() {
  if(window._spAnimReq) return; // läuft bereits
  // Throttle: max alle 50ms neu zeichnen, sonst saugt es Akku
  window._spAnimReq = requestAnimationFrame(function tick() {
    window._spAnimReq = null;
    if(currentView !== 'stallplan') return;
    var canvas = spGetCanvas();
    if(!canvas) return;
    var now = Date.now();
    if(now - window._spAnimLastDraw < 50) {
      // re-arm without redraw
      window._spAnimReq = requestAnimationFrame(tick);
      return;
    }
    window._spAnimLastDraw = now;
    spDraw();
  });
};

// ── Filter-Logik (Phase 7) ─────────────────────────────────────
// State: 'alle' | 'wz' | 'trocken' | 'bauer:<name>' | 'gruppe:<id>'
window._spFilter = 'alle';
window.spSetFilter = function(filterId) {
  window._spFilter = filterId || 'alle';
  spDraw();
};
// Prüft ob eine Box durch den aktuellen Filter passt.
// Leere Boxen passen immer (damit man Plätze sieht).
window.spBoxFilterPasst = function(el, k) {
  if(!el || el.typ !== 'box') return true;
  var f = window._spFilter || 'alle';
  if(f === 'alle') return true;
  if(!k) return true; // leere Box immer zeigen
  if(f === 'wz') {
    var heute = Date.now();
    return Object.values(behandlungen).some(function(b){
      return b.kuhId === el.kuhId && b.aktiv &&
             ((b.wzMilchEnde && b.wzMilchEnde > heute) ||
              (b.wzFleischEnde && b.wzFleischEnde > heute));
    });
  }
  if(f === 'trocken') {
    return k.trocken === true || k.trockenstellen === true || k.status === 'trocken';
  }
  if(f.indexOf('bauer:') === 0) {
    return String(k.bauer||'') === f.slice(6);
  }
  if(f.indexOf('gruppe:') === 0) {
    var gid = f.slice(7);
    var g = gruppen[gid];
    if(!g || !g.kuhIds) return false;
    return g.kuhIds.indexOf(el.kuhId) >= 0;
  }
  return true;
};

// ── Schnellansicht-Popup (Phase 1b) ─────────────────────────────
window.spShowQuickView = function(kuhId) {
  var k = kuehe[kuhId];
  if(!k) { closePopup&&closePopup(); return; }

  var heute = Date.now();

  // Aktive Behandlungen + Wartezeiten
  var aktBeh = Object.values(behandlungen).filter(function(b){
    return b.kuhId===kuhId && b.aktiv;
  });
  var wzMilchEnden = aktBeh.map(function(b){return b.wzMilchEnde;}).filter(function(t){return t&&t>heute;});
  var wzFleischEnden = aktBeh.map(function(b){return b.wzFleischEnde;}).filter(function(t){return t&&t>heute;});
  var wzInfo = '';
  function tageBis(ts){
    var e=new Date(ts); e.setHours(0,0,0,0);
    var h=new Date(heute); h.setHours(0,0,0,0);
    return Math.max(0, Math.round((e.getTime()-h.getTime())/86400000));
  }
  if(wzMilchEnden.length || wzFleischEnden.length) {
    var parts=[];
    if(wzMilchEnden.length) parts.push('🥛 '+tageBis(Math.min.apply(null,wzMilchEnden))+' Tage Milch');
    if(wzFleischEnden.length) parts.push('🥩 '+tageBis(Math.min.apply(null,wzFleischEnden))+' Tage Fleisch');
    var krit = (wzMilchEnden.concat(wzFleischEnden)).some(function(t){return tageBis(t)<=1;});
    wzInfo = '<div style="margin:.5rem 0;padding:.45rem .6rem;background:'+(krit?'rgba(212,60,60,.15)':'rgba(212,132,75,.12)')+';border:1px solid '+(krit?'#d44b4b':'#d4844b')+';border-radius:8px;font-size:.78rem;color:'+(krit?'#ff8080':'#ffb280')+'"><b>'+(krit?'⚕ Wartezeit kritisch':'⏱ Wartezeit aktiv')+'</b><br>'+parts.join(' · ')+'</div>';
  }

  // Letzte Behandlung
  var alleBeh = Object.values(behandlungen).filter(function(b){return b.kuhId===kuhId;}).sort(function(a,b){return (b.datum||0)-(a.datum||0);});
  var letzteBeh = alleBeh[0];
  var behInfo = letzteBeh
    ? '<div style="font-size:.75rem;color:var(--text2);margin:.3rem 0">⚕ Letzte Behandlung: <b>'+new Date(letzteBeh.datum).toLocaleDateString('de-AT',{day:'numeric',month:'short',year:'2-digit'})+'</b>'+(letzteBeh.diagnose?' – '+letzteBeh.diagnose:'')+'</div>'
    : '<div style="font-size:.75rem;color:var(--text3);margin:.3rem 0">⚕ Keine Behandlungen</div>';

  // Letzte Milch
  var alleMilch = Object.entries(milchEintraege).filter(function(e){return e[1].prokuh && e[1].prokuh[kuhId];}).sort(function(a,b){return (b[1].datum||0)-(a[1].datum||0);});
  var letzteMilch = alleMilch[0];
  var milchInfo = letzteMilch
    ? '<div style="font-size:.75rem;color:var(--text2);margin:.3rem 0">🥛 Letzte Milch: <b>'+new Date(letzteMilch[1].datum).toLocaleDateString('de-AT',{day:'numeric',month:'short'})+'</b> – '+(parseFloat(letzteMilch[1].prokuh[kuhId])||0)+'L '+(letzteMilch[1].zeit==='morgen'?'morgens':'abends')+'</div>'
    : '<div style="font-size:.75rem;color:var(--text3);margin:.3rem 0">🥛 Keine Milcheinträge</div>';

  // Foto/Emoji
  var foto = fotos[kuhId];
  var fotoHTML = foto
    ? '<img src="'+foto+'" style="width:60px;height:60px;border-radius:30px;object-fit:cover;border:2px solid var(--gold)">'
    : '<div style="width:60px;height:60px;border-radius:30px;background:var(--bg3);border:2px solid var(--gold);display:flex;align-items:center;justify-content:center;font-size:2rem">🐄</div>';

  // Bauer
  var bauerHTML = k.bauer
    ? '<div style="font-size:.7rem;color:var(--gold)">👤 '+k.bauer+'</div>'
    : '';

  showPopupHTML(
    '<div style="display:flex;gap:.7rem;align-items:center;margin-bottom:.4rem">'+
      fotoHTML +
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:1.1rem;font-weight:700;color:var(--gold)">#'+k.nr+' '+(k.name||'–')+'</div>'+
        bauerHTML +
        (k.gebDatum?'<div style="font-size:.7rem;color:var(--text3)">🎂 '+new Date(k.gebDatum).toLocaleDateString('de-AT')+'</div>':'')+
      '</div>'+
    '</div>'+
    wzInfo +
    behInfo +
    milchInfo +
    '<div style="display:flex;gap:.4rem;margin-top:.7rem;flex-wrap:wrap">'+
      '<button class="btn-primary" style="flex:1;min-width:120px" onclick="closePopup();showKuhDetail(\''+kuhId+'\')">Vollprofil →</button>'+
      '<button class="btn-secondary" style="flex:1;min-width:120px" onclick="closePopup();showBehandlungForm(\''+kuhId+'\')">⚕ Behandlung +</button>'+
      '<button class="btn-secondary" style="flex:0 0 auto" onclick="closePopup()">Schließen</button>'+
    '</div>'
  );
};

// ── Event-Binding ──
window._spEventsAttached = false;
window.spBindEvents = function(canvas,W,H) {
  // Remove old listeners
  var nc=canvas.cloneNode(true);
  canvas.parentNode.replaceChild(nc,canvas);
  canvas=nc;

  var z=function(){return window._spZoom;};
  var px=function(){return window._spPanX;};
  var py=function(){return window._spPanY;};

  function toWorld(cx,cy){
    return [(cx-px())/z(),(cy-py())/z()];
  }
  function hitTest(wx,wy) {
    var stall=spGetStall(); if(!stall)return -1;
    var elems=stall.elemente||[];
    for(var i=elems.length-1;i>=0;i--){
      var el=elems[i];
      var ew=el.w||(el.typ==='gang_h'?80:el.typ==='gang_v'?16:el.typ==='tuer'?20:el.typ==='fenster'?40:el.typ==='pfeiler'?20:50);
      var eh=el.h||(el.typ==='gang_h'?16:el.typ==='gang_v'?80:el.typ==='tuer'?36:el.typ==='fenster'?12:el.typ==='pfeiler'?20:40);
      if(wx>=el.x&&wx<=el.x+ew&&wy>=el.y&&wy<=el.y+eh)return i;
    }
    return -1;
  }
  function hitResize(wx,wy) {
    var stall=spGetStall(); if(!stall)return -1;
    var elems=stall.elemente||[];
    for(var i=elems.length-1;i>=0;i--){
      var el=elems[i];
      var ew=el.w||50, eh=el.h||40;
      if(Math.abs(wx-(el.x+ew))<10/z()&&Math.abs(wy-(el.y+eh))<10/z())return i;
    }
    return -1;
  }

  var lastTap=0, isDragging=false, isResizing=false, dragIdx=-1, resizeIdx=-1;
  var dragStartWorld={x:0,y:0}, elStartPos={x:0,y:0};
  var panStart={x:0,y:0}, panOrigin={x:0,y:0};
  var isPanning=false;
  var pinchStart=0;

  function getXY(e,canvas){
    var rect=canvas.getBoundingClientRect();
    var touch=e.touches?e.touches[0]:e;
    return {x:touch.clientX-rect.left,y:touch.clientY-rect.top};
  }

  // POINTER DOWN
  canvas.addEventListener('pointerdown',function(e){
    e.preventDefault();
    var pos=getXY(e,canvas);
    var w=toWorld(pos.x,pos.y);
    var now=Date.now();
    var modus=window._spModus;

    if(modus==='zeichnen'){
      // Doppeltipp = schließen
      if(now-lastTap<300 && window._spDrawPts.length>=3){
        spSchliessePoly();
        lastTap=0; return;
      }
      lastTap=now;
      window._spDrawPts.push(w);
      spDraw(W,H); return;
    }

    if(modus==='elemente'){
      var ri=hitResize(w[0],w[1]);
      if(ri>=0){isResizing=true;resizeIdx=ri;dragStartWorld={x:w[0],y:w[1]};return;}
      var hi=hitTest(w[0],w[1]);
      if(hi>=0){
        if(window._spWerkzeug==='delete'){
          var stall=spGetStall();
          stall.elemente.splice(hi,1);
          spDraw(W,H); return;
        }
        isDragging=true; dragIdx=hi;
        var el=spGetStall().elemente[hi];
        elStartPos={x:el.x,y:el.y};
        dragStartWorld={x:w[0],y:w[1]}; return;
      }
      // Neues Element platzieren
      spPlatziere(w[0],w[1]); return;
    }

    if(modus==='kuehe'){
      var hi2=hitTest(w[0],w[1]);
      if(hi2>=0){
        var el2=spGetStall().elemente[hi2];
        if(el2.typ==='box'){
          // Doppeltipp = Profil öffnen
          if(now-lastTap<300&&el2.kuhId){showKuhDetail(el2.kuhId);lastTap=0;return;}
          lastTap=now;
          spZeigeKuhOverlay(hi2,el2.kuhId); return;
        }
      }
      return;
    }

    // Ansicht: erst hit-test auf Box → Schnellansicht; sonst panning
    if(modus==='ansicht'){
      var hiV = hitTest(w[0],w[1]);
      if(hiV>=0) {
        var elV = spGetStall().elemente[hiV];
        if(elV && elV.typ==='box' && elV.kuhId) {
          // Tap auf belegte Kuh-Box → Schnellansicht öffnen
          if(typeof window.spShowQuickView === 'function') window.spShowQuickView(elV.kuhId);
          return;
        }
      }
    }
    isPanning=true;
    panStart={x:pos.x,y:pos.y};
    panOrigin={x:window._spPanX,y:window._spPanY};
  },{passive:false});

  // POINTER MOVE
  canvas.addEventListener('pointermove',function(e){
    e.preventDefault();
    var pos=getXY(e,canvas);
    var w=toWorld(pos.x,pos.y);
    if(isDragging&&dragIdx>=0){
      var stall=spGetStall();
      stall.elemente[dragIdx].x=elStartPos.x+(w[0]-dragStartWorld.x);
      stall.elemente[dragIdx].y=elStartPos.y+(w[1]-dragStartWorld.y);
      spDraw(W,H); return;
    }
    if(isResizing&&resizeIdx>=0){
      var stall2=spGetStall();
      var el=stall2.elemente[resizeIdx];
      el.w=Math.max(10,w[0]-el.x);
      el.h=Math.max(8,w[1]-el.y);
      spDraw(W,H); return;
    }
    if(isPanning){
      window._spPanX=panOrigin.x+(pos.x-panStart.x);
      window._spPanY=panOrigin.y+(pos.y-panStart.y);
      spDraw(W,H);
    }
  },{passive:false});

  // POINTER UP
  canvas.addEventListener('pointerup',function(e){
    if(isDragging||isResizing) spDraw(W,H);
    isDragging=false; isResizing=false; dragIdx=-1; resizeIdx=-1; isPanning=false;
  },{passive:true});

  // PINCH ZOOM (touch)
  canvas.addEventListener('touchstart',function(e){
    if(e.touches.length===2){
      var dx=e.touches[0].clientX-e.touches[1].clientX;
      var dy=e.touches[0].clientY-e.touches[1].clientY;
      pinchStart=Math.sqrt(dx*dx+dy*dy);
    }
  },{passive:true});
  canvas.addEventListener('touchmove',function(e){
    if(e.touches.length===2){
      var dx=e.touches[0].clientX-e.touches[1].clientX;
      var dy=e.touches[0].clientY-e.touches[1].clientY;
      var dist=Math.sqrt(dx*dx+dy*dy);
      if(pinchStart>0){
        window._spZoom=Math.max(0.3,Math.min(5,window._spZoom*(dist/pinchStart)));
        pinchStart=dist;
        spDraw(W,H);
      }
    }
  },{passive:true});
};

// ── Polygon schließen ──
window.spSchliessePoly = function() {
  var stall=spGetStall(); if(!stall) return;
  stall.polygon = window._spDrawPts.slice();
  window._spDrawPts = [];
  window._spModus = 'elemente';
  render();
};

window.spUndoPunkt = function() {
  window._spDrawPts.pop();
  spDraw();
};
window.spResetPolygon = function() {
  window._spDrawPts=[];
  var stall=spGetStall();
  if(stall) stall.polygon=[];
  spDraw();
};

// ── Element platzieren ──
window.spPlatziere = function(wx,wy) {
  var stall=spGetStall(); if(!stall) return;
  var typ=window._spWerkzeug||'box';
  if(typ==='delete') return;
  if(!stall.elemente) stall.elemente=[];
  var defaults={
    gang_h:{w:80,h:16}, gang_v:{w:16,h:80},
    tuer:{w:20,h:36}, fenster:{w:40,h:12},
    pfeiler:{w:20,h:20}, box:{w:50,h:40}
  };
  var d=defaults[typ]||{w:40,h:40};
  stall.elemente.push({typ:typ,x:wx-d.w/2,y:wy-d.h/2,w:d.w,h:d.h,kuhId:null});
  spDraw();
};

// ── Kuh zuweisen ──
window.spZeigeKuhOverlay = function(elemIdx, kuhId) {
  var ov=document.getElementById('sp-kuh-overlay'); if(!ov)return;
  document.getElementById('sp-kuh-elem-id').value=elemIdx;
  document.getElementById('sp-kuh-select').value=kuhId||'';
  // Preview
  var prev=document.getElementById('sp-kuh-preview');
  if(prev&&kuhId&&kuehe[kuhId]){
    var k=kuehe[kuhId];
    prev.innerHTML='<div style="font-size:.8rem;color:var(--gold)">#'+k.nr+' '+k.name+'</div>';
  } else if(prev) prev.innerHTML='';
  ov.style.display='flex';
};

window.spKuhZuweisen = function() {
  var idx=parseInt(document.getElementById('sp-kuh-elem-id')?.value);
  var kuhId=document.getElementById('sp-kuh-select')?.value||null;
  var stall=spGetStall();
  if(stall&&stall.elemente&&stall.elemente[idx]) {
    stall.elemente[idx].kuhId=kuhId||null;
  }
  closeForm('sp-kuh-overlay');
  spDraw();
};

// ── Zoom/Pan ──
window.spZoom = function(factor) {
  window._spZoom=Math.max(0.3,Math.min(5,window._spZoom*factor));
  spDraw();
};
window.spResetView = function() {
  window._spZoom=1; window._spPanX=0; window._spPanY=0; spDraw();
};

// ── Stall verwalten ──
window.spNeuerStall = function() {
  var ov=document.getElementById('sp-stall-overlay');
  if(!ov){navigate('stallplan');setTimeout(spNeuerStall,200);return;}
  document.getElementById('sp-stall-name').value='';
  ov.style.display='flex';
};

window.spSaveNeuerStall = async function() {
  var name=document.getElementById('sp-stall-name')?.value.trim();
  if(!name){alert('Name Pflicht');return;}
  var nr=await push(ref(db,'stallplanV2'),{name,polygon:[],elemente:[]});
  window._spAktivId=nr.key;
  window._spModus='zeichnen';
  window._spDrawPts=[];
  closeForm('sp-stall-overlay');
  render();
};

window.spStallLoeschen = async function(sid) {
  if(!confirm('Stall und alle Daten löschen?'))return;
  await remove(ref(db,'stallplanV2/'+sid));
  window._spAktivId=null;
};

window.spStallUmbenennen = function(sid) {
  var name=prompt('Neuer Name:',window._spStaelle[sid]?.name||'');
  if(name&&name.trim()) update(ref(db,'stallplanV2/'+sid),{name:name.trim()});
};

// ── Speichern ──
window.spSpeichern = async function() {
  var stall=spGetStall(); if(!stall)return;
  await update(ref(db,'stallplanV2/'+window._spAktivId),{
    polygon:stall.polygon||[],
    elemente:stall.elemente||[]
  });
  showSaveToast&&showSaveToast('Stallplan gespeichert');
};

// Auto-Redraw wenn Stallplan sichtbar
window.addEventListener('resize',function(){
  if(currentView==='stallplan') spInitCanvas();
});



function renderSaisonvergleich() {
  const heute = Date.now();
  const aktJahr = saisonInfo?.jahr || new Date().getFullYear();
  const aktTab = window._svTab || 'uebersicht';

  // ── Aktuelle Saison berechnen ──
  const milchListe = Object.values(milchEintraege);
  const milchGesamt = milchListe.reduce((s,m)=>s+(m.gesamt||0),0);
  const kuhListe = Object.values(kuehe);
  const alpungTage = saisonInfo?.auftriebDatum
    ? Math.floor((heute - saisonInfo.auftriebDatum)/86400000)+1 : 0;
  const tagesMilch = {};
  milchListe.forEach(m=>{const t=m.datum?new Date(m.datum).toISOString().slice(0,10):null;if(t)tagesMilch[t]=(tagesMilch[t]||0)+(m.gesamt||0);});
  const tagWerte = Object.values(tagesMilch);
  const schnittMilch = tagWerte.length ? Math.round(milchGesamt/tagWerte.length) : 0;
  const bsGesamt = Object.values(besamungen).length;
  const bsErfolg = Object.values(besamungen).filter(b=>b.status==='tragend').length;
  const bsRate = bsGesamt ? Math.round(bsErfolg/bsGesamt*100) : 0;

  // Weidenutzung aktuelle Saison
  const weideNutzung = {};
  Object.values(weideTage).forEach(w=>{
    const name = weiden[w.weideId]?.name || w.weideText || w.weideId || '?';
    weideNutzung[name] = (weideNutzung[name]||0)+1;
  });

  // ── Archiv ──
  const archivListe = Object.entries(saisonArchiv).sort((a,b)=>b[0].localeCompare(a[0]));

  // Aktuelle Saison als Vergleichsobjekt
  const aktSaison = {
    jahr: aktJahr, milchGesamt: Math.round(milchGesamt), schnittMilch,
    alpungTage, kueheAnzahl: kuhListe.length,
    behandlungenAnzahl: Object.values(behandlungen).length,
    besamungenAnzahl: bsGesamt, besamungErfolg: bsErfolg, besamungRate: bsRate,
    weideNutzung, istAktuell: true
  };

  // Ausgewählte Saisons für Vergleich (State)
  const ausgewaehlt = window._svAusgewaehlt || [String(aktJahr)];

  // Alle verfügbaren Saisons (aktuell + Archiv)
  const alleSaisons = [{key: String(aktJahr), data: aktSaison}]
    .concat(archivListe.map(([k,d])=>({key:k, data:{...d, istAktuell:false}})));

  // Vergleichs-Saisons filtern
  const vergleichsSaisons = alleSaisons.filter(s=>ausgewaehlt.includes(s.key));

  // Balken-Breite berechnen
  function balken(wert, max, farbe) {
    const pct = max > 0 ? Math.min(100, Math.round(wert/max*100)) : 0;
    return `<div style="height:8px;background:var(--border);border-radius:4px;margin-top:3px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${farbe};border-radius:4px;transition:width .4s ease"></div>
    </div>`;
  }

  // Saison-Farben
  const FARBEN = ['#d4a84b','#4ab8e8','#4db84e','#d44b4b','#a04bc8'];

  return `
    <div class="page-header">
      <h2>📈 Herdenvergleich</h2>
      <button class="btn-xs" onclick="saisonArchivieren()">💾 Archivieren</button>
    </div>

    <!-- Tab-Chips -->
    <div style="display:flex;gap:.35rem;margin-bottom:.7rem;flex-wrap:wrap">
      <button class="filter-chip ${aktTab==='uebersicht'?'active':''}" onclick="window._svTab='uebersicht';render()">📊 Übersicht</button>
      <button class="filter-chip ${aktTab==='vergleich'?'active':''}" onclick="window._svTab='vergleich';render()">⚖ Vergleich</button>
      <button class="filter-chip ${aktTab==='weiden'?'active':''}" onclick="window._svTab='weiden';render()">🌿 Weiden</button>
    </div>

    ${aktTab === 'uebersicht' ? `
    <!-- ── ÜBERSICHT: Aktuelle Saison ── -->
    <div class="section-label" style="margin-bottom:.4rem">AKTUELLE SAISON ${aktJahr}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin-bottom:.8rem">
      ${[
        {icon:'🥛',wert:Math.round(milchGesamt)+'L',label:'Milch gesamt'},
        {icon:'⌀',wert:schnittMilch+'L',label:'Ø pro Melktag'},
        {icon:'🐄',wert:kuhListe.length,label:'Kühe'},
        {icon:'📅',wert:alpungTage,label:'Alpungstage'},
        {icon:'⚕',wert:Object.values(behandlungen).length,label:'Behandlungen'},
        {icon:'🐮',wert:bsGesamt+' ('+bsRate+'%)',label:'Besamungen / Erfolg'},
      ].map(k=>`<div class="stat-card"><div class="stat-icon">${k.icon}</div><div class="stat-num" style="font-size:1.3rem">${k.wert}</div><div class="stat-label">${k.label}</div></div>`).join('')}
    </div>

    <!-- Archivierte Saisons -->
    ${archivListe.length ? `
    <div class="section-label" style="margin-bottom:.4rem">ARCHIVIERTE SAISONS</div>
    <div class="card-list">
      ${archivListe.map(([key,s])=>`
        <div class="list-card" style="flex-direction:column;gap:.4rem">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <b style="color:var(--gold)">Saison ${s.jahr||key}</b>
            <div style="display:flex;gap:.3rem">
              <button class="btn-xs-danger" onclick="deleteSaisonArchiv('${key}')">✕</button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.3rem">
            <div style="text-align:center;background:var(--bg);border-radius:8px;padding:.4rem">
              <div style="font-size:.65rem;color:var(--text3)">Milch</div>
              <div style="font-size:.88rem;color:var(--gold);font-weight:700">${Math.round(s.milchGesamt||0)}L</div>
            </div>
            <div style="text-align:center;background:var(--bg);border-radius:8px;padding:.4rem">
              <div style="font-size:.65rem;color:var(--text3)">Tage</div>
              <div style="font-size:.88rem;font-weight:700">${s.alpungTage||'–'}</div>
            </div>
            <div style="text-align:center;background:var(--bg);border-radius:8px;padding:.4rem">
              <div style="font-size:.65rem;color:var(--text3)">Kühe</div>
              <div style="font-size:.88rem;font-weight:700">${s.kueheAnzahl||'–'}</div>
            </div>
          </div>
          ${s.notiz?`<div style="font-size:.72rem;color:var(--text3);font-style:italic">${s.notiz}</div>`:''}
        </div>`).join('')}
    </div>` : `<div class="empty-state">Noch keine archivierten Saisons.<br><small>Am Saisonende „Archivieren" antippen.</small></div>`}
    ` : aktTab === 'vergleich' ? `

    <!-- ── VERGLEICH: Saisons wählen ── -->
    <div class="section-label" style="margin-bottom:.4rem">SAISONS WÄHLEN (max. 4)</div>
    <div style="display:flex;gap:.3rem;flex-wrap:wrap;margin-bottom:.8rem">
      ${alleSaisons.map((s,idx)=>{
        const aktiv = ausgewaehlt.includes(s.key);
        const farbe = aktiv ? FARBEN[ausgewaehlt.indexOf(s.key)%FARBEN.length] : 'var(--border)';
        return `<button class="filter-chip ${aktiv?'active':''}"
          style="${aktiv?'border-color:'+farbe+';background:'+farbe+'22;color:'+farbe:''}"
          onclick="svToggleSaison('${s.key}')">
          ${s.data.istAktuell?'★ ':''}${s.key}
        </button>`;
      }).join('')}
    </div>

    ${vergleichsSaisons.length < 2 ? `
    <div style="text-align:center;color:var(--text3);font-size:.82rem;padding:1rem">Mindestens 2 Saisons auswählen für den Vergleich.</div>
    ` : `

    <!-- Kennzahlen-Vergleich -->
    ${[
      {key:'milchGesamt',   label:'🥛 Milch gesamt (L)', einheit:'L'},
      {key:'schnittMilch',  label:'⌀ Ø pro Melktag (L)', einheit:'L'},
      {key:'alpungTage',    label:'📅 Alpungstage', einheit:'T'},
      {key:'kueheAnzahl',   label:'🐄 Anzahl Kühe', einheit:''},
      {key:'behandlungenAnzahl', label:'⚕ Behandlungen', einheit:''},
      {key:'besamungenAnzahl',   label:'🐮 Besamungen', einheit:''},
      {key:'besamungRate',  label:'✓ Besamungserfolg', einheit:'%'},
    ].map(kenn=>{
      const werte = vergleichsSaisons.map(s=>s.data[kenn.key]||0);
      const maxW = Math.max(...werte, 1);
      return `
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:.7rem;margin-bottom:.5rem">
        <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:.5rem">${kenn.label}</div>
        ${vergleichsSaisons.map((s,idx)=>{
          const wert = s.data[kenn.key]||0;
          const farbe = FARBEN[ausgewaehlt.indexOf(s.key)%FARBEN.length];
          const istBeste = wert === maxW;
          return `<div style="margin-bottom:.4rem">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:.72rem;color:${farbe};font-weight:600">${s.data.istAktuell?'★ ':''}${s.key}</span>
              <span style="font-size:.82rem;font-weight:700;color:${istBeste?farbe:'var(--text2)'}">${wert}${kenn.einheit}${istBeste?' ✓':''}</span>
            </div>
            ${balken(wert, maxW, farbe)}
          </div>`;
        }).join('')}
      </div>`;
    }).join('')}
    `}
    ` : `

    <!-- ── WEIDEN: Nutzungsfrequenz ── -->
    <div class="section-label" style="margin-bottom:.4rem">AKTUELLE SAISON – WEIDENNUTZUNG</div>
    ${Object.keys(weideNutzung).length ? `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:.7rem;margin-bottom:.7rem">
      ${Object.entries(weideNutzung).sort((a,b)=>b[1]-a[1]).map(([name,tage])=>{
        const max = Math.max(...Object.values(weideNutzung));
        const pct = Math.round(tage/max*100);
        return `<div style="margin-bottom:.5rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
            <span style="font-size:.78rem;font-weight:600">🌿 ${name}</span>
            <span style="font-size:.78rem;color:var(--gold);font-weight:700">${tage} Tage</span>
          </div>
          <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--green),#2a9a0a);border-radius:4px"></div>
          </div>
        </div>`;
      }).join('')}
    </div>` : '<div class="empty-state">Noch keine Weidetage erfasst.</div>'}

    <!-- Archiv-Vergleich Weiden -->
    ${archivListe.filter(([,s])=>s.weideNutzung&&Object.keys(s.weideNutzung).length).map(([key,s])=>`
    <div class="section-label" style="margin-bottom:.3rem;margin-top:.6rem">SAISON ${s.jahr||key}</div>
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:.7rem;margin-bottom:.5rem">
      ${Object.entries(s.weideNutzung).sort((a,b)=>b[1]-a[1]).map(([name,tage])=>{
        const max=Math.max(...Object.values(s.weideNutzung));
        return `<div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:.3rem">
          <span>🌿 ${name}</span><span style="color:var(--gold)">${tage} Tage</span>
        </div>`;
      }).join('')}
    </div>`).join('')}
    `}

    <!-- Archivieren-Overlay -->
    <div id="saisonarchiv-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>Saison archivieren</h3><button class="close-btn" onclick="closeForm('saisonarchiv-overlay')">✕</button></div>
        <div class="form-body">
          <p style="font-size:.83rem;color:var(--text2);margin-bottom:.8rem">Saison ${aktJahr} mit ${Math.round(milchGesamt)}L Milch und ${kuhListe.length} Kühen archivieren?</p>
          <textarea id="sa-notiz" class="inp" rows="2" placeholder="Notiz (z.B. Trockenheit, besonders gute Ernte…)"></textarea>
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('saisonarchiv-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveSaisonArchiv()">Archivieren</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.svToggleSaison = function(key) {
  var sel = window._svAusgewaehlt || [String(saisonInfo?.jahr||new Date().getFullYear())];
  var idx = sel.indexOf(key);
  if(idx >= 0) { if(sel.length > 1) sel.splice(idx,1); }
  else if(sel.length < 4) sel.push(key);
  window._svAusgewaehlt = sel;
  render();
};

window.saisonArchivieren = function() {
  var ov = document.getElementById('saisonarchiv-overlay');
  if(!ov){navigate('saisonvergleich');setTimeout(saisonArchivieren,150);return;}
  ov.style.display='flex';
};
window.saveSaisonArchiv = async function() {
  const heute = Date.now();
  const aktJahr = saisonInfo?.jahr || new Date().getFullYear();
  const milchGesamt = Object.values(milchEintraege).reduce((s,m)=>s+(m.gesamt||0),0);
  const alpungTage = saisonInfo?.auftriebDatum ? Math.floor((heute - saisonInfo.auftriebDatum) / 86400000)+1 : 0;
  const tagesMilch = {};
  Object.values(milchEintraege).forEach(m => {
    const tag = m.datum ? new Date(m.datum).toISOString().slice(0,10) : null;
    if(tag) tagesMilch[tag] = (tagesMilch[tag]||0) + (m.gesamt||0);
  });
  const tagWerte = Object.values(tagesMilch);
  const schnittMilch = tagWerte.length ? Math.round(milchGesamt/tagWerte.length) : 0;
  const bsGesamt = Object.values(besamungen).length;
  const bsErfolg = Object.values(besamungen).filter(b=>b.status==='tragend').length;
  const weideNutzung = {};
  Object.values(weideTage).forEach(w=>{
    const name = weiden[w.weideId]?.name || w.weideText || w.weideId || '?';
    weideNutzung[name] = (weideNutzung[name]||0)+1;
  });
  await set(ref(db,'saisonArchiv/'+aktJahr), {
    jahr: aktJahr,
    milchGesamt: Math.round(milchGesamt),
    schnittMilch,
    alpungTage,
    kueheAnzahl: Object.keys(kuehe).length,
    behandlungenAnzahl: Object.keys(behandlungen).length,
    besamungenAnzahl: bsGesamt,
    besamungErfolg: bsErfolg,
    besamungRate: bsGesamt ? Math.round(bsErfolg/bsGesamt*100) : 0,
    weideNutzung,
    auftriebDatum: saisonInfo?.auftriebDatum || null,
    notiz: document.getElementById('sa-notiz')?.value.trim() || '',
    archiviertAm: heute
  });
  closeForm('saisonarchiv-overlay');
  showSaveToast && showSaveToast('Saison '+aktJahr+' archiviert');
};
window.deleteSaisonArchiv = async function(key) {
  if(confirm('Saisondaten löschen?')) await remove(ref(db,'saisonArchiv/'+key));
};

// ══════════════════════════════════════════════════════════════
//  TRÄNKE / WASSERVERSORGUNG
// ══════════════════════════════════════════════════════════════
function renderTraenke() {
  const heute = isoDate(new Date());
  const letzteKontrolle = Object.values(traenkeLog).filter(t=>t.datum===heute)[0];
  const verlauf = Object.entries(traenkeLog).sort((a,b)=>b[1].datum?.localeCompare(a[1].datum)).slice(0,30);

  return `
    <div class="page-header"><h2>💧 Tränke & Wasser</h2><button class="btn-primary" onclick="showTraenkeForm()">+ Kontrolle</button></div>

    ${letzteKontrolle ? `
    <div class="card-section" style="border-color:var(--green);margin-bottom:.8rem">
      <div class="info-row"><span>Heute</span><span class="tag tag-green">✓ kontrolliert</span></div>
      ${letzteKontrolle.status?`<div class="info-row"><span>Status</span><b>${letzteKontrolle.status}</b></div>`:''}
      ${letzteKontrolle.notiz?`<div style="font-size:.82rem;color:var(--text2);margin-top:.3rem;font-style:italic">${letzteKontrolle.notiz}</div>`:''}
    </div>` : `
    <div style="background:rgba(200,100,0,.08);border:1px solid rgba(200,100,0,.3);border-radius:var(--radius-sm);padding:.6rem 1rem;margin-bottom:.8rem">
      <div style="font-size:.82rem;color:var(--orange)">⚠ Heute noch nicht kontrolliert</div>
    </div>`}

    <div class="section-title">Verlauf</div>
    <div class="card-list">
      ${verlauf.length ? verlauf.map(([id,t])=>`
        <div class="list-card list-card-sm">
          <div>
            <div class="list-card-title">${new Date(t.datum+'T12:00').toLocaleDateString('de-AT',{weekday:'short',day:'numeric',month:'short'})}</div>
            ${t.notiz?`<div class="list-card-sub" style="font-style:italic">${t.notiz}</div>`:''}
          </div>
          <div style="display:flex;align-items:center;gap:.4rem">
            <span class="tag ${t.status==='OK'?'tag-green':t.status==='Problem'?'tag-red':'tag-orange'}">${t.status||'OK'}</span>
            <button class="btn-xs-danger" onclick="deleteTraenke('${id}')">✕</button>
          </div>
        </div>`).join('') : `<div class="empty-state">Noch keine Einträge</div>`}
    </div>

    <div id="traenke-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>Tränke-Kontrolle</h3><button class="close-btn" onclick="closeForm('traenke-overlay')">✕</button></div>
        <div class="form-body">
          <input id="tr-datum" class="inp" type="date" value="${heute}" />
          <label class="inp-label">Status</label>
          <div style="display:flex;gap:.5rem;margin-bottom:.5rem">
            <button class="filter-chip active" id="tr-ok" onclick="selectTraenkeStatus('OK',this)">✓ OK</button>
            <button class="filter-chip" id="tr-mangel" onclick="selectTraenkeStatus('Mangel',this)">⚠ Mangel</button>
            <button class="filter-chip" id="tr-problem" onclick="selectTraenkeStatus('Problem',this)">🔴 Problem</button>
          </div>
          <input type="hidden" id="tr-status" value="OK" />
          <textarea id="tr-notiz" class="inp" rows="2" placeholder="Notiz (z.B. Brunnen niedrig, Tränke gereinigt, Leckage)"></textarea>
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('traenke-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveTraenke()">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
window.showTraenkeForm = function() {
  const ov = document.getElementById('traenke-overlay');
  if(!ov){navigate('traenke');setTimeout(()=>showTraenkeForm(),150);return;}
  ov.style.display='flex';
};
window.selectTraenkeStatus = function(s, btn) {
  document.getElementById('tr-status').value = s;
  document.querySelectorAll('#traenke-overlay .filter-chip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
};
window.saveTraenke = async function() {
  const datum = document.getElementById('tr-datum')?.value;
  await push(ref(db,'traenkeLog'),{
    datum,
    status: document.getElementById('tr-status')?.value||'OK',
    notiz:  document.getElementById('tr-notiz')?.value.trim()||'',
    createdAt: Date.now()
  });
  closeForm('traenke-overlay');
};
window.deleteTraenke = async function(id) {
  if(confirm('Eintrag löschen?')) await remove(ref(db,'traenkeLog/'+id));
};

// ══════════════════════════════════════════════════════════════
//  BACKUP & EXPORT
// ══════════════════════════════════════════════════════════════
function renderBackup() {
  const letzteBackupTs = parseInt(localStorage.getItem('letzteBackup')||'0');
  const letzteBackupDatum = localStorage.getItem('letzteBackupDatum')||'–';
  const tageOhne = letzteBackupTs ? Math.floor((Date.now()-letzteBackupTs)/86400000) : null;
  const istAdmin = window._currentRole === 'admin';

  return `
    <div class="page-header"><h2>💾 Backup & Export</h2></div>

    ${istAdmin ? `
    <!-- Auto-Backup Status (nur Admin) -->
    <div class="card-section" style="margin-bottom:.8rem;border-color:${tageOhne===null||tageOhne>=7?'var(--orange)':'var(--green)'}">
      <div class="section-label" style="margin-bottom:.4rem">🔔 AUTO-BACKUP STATUS</div>
      <div class="info-row">
        <span>Letztes Backup</span>
        <b style="color:${tageOhne===null||tageOhne>=7?'var(--orange)':'var(--green)'}">
          ${tageOhne===null?'Noch nie':tageOhne===0?'Heute':tageOhne+' Tage her ('+letzteBackupDatum+')'}
        </b>
      </div>
      <div class="info-row"><span>Empfehlung</span><b>Wöchentlich</b></div>
      <div class="info-row"><span>Erinnerung</span><b>Banner + Push-Notification nach 7 Tagen</b></div>
      ${tageOhne===null||tageOhne>=7?`
      <div style="background:rgba(212,132,75,.1);border:1px solid rgba(212,132,75,.3);border-radius:var(--radius-sm);padding:.5rem .8rem;margin-top:.5rem;font-size:.78rem;color:var(--orange)">
        ⚠ ${tageOhne===null?'Noch kein Backup erstellt':'Letztes Backup vor '+tageOhne+' Tagen'} – jetzt sichern empfohlen
      </div>`:''}
      <button class="btn-primary btn-block" style="margin-top:.6rem" onclick="exportJSON()">💾 Jetzt sichern</button>
    </div>` : ''}

    <!-- SYNC with Excel -->
    <div class="section-title" style="color:var(--gold)">🔄 Sennerei Excel Sync</div>
    <div class="card-section" style="margin-bottom:.8rem;border-color:var(--gold2)">
      <p style="font-size:.82rem;color:var(--text2);margin-bottom:.8rem;line-height:1.6">
        Synchronisiere Daten zwischen HerdenPro und dem Sennerei-Excel über OneDrive.
        <br><b style="color:var(--gold)">App → Excel:</b> Export → in OneDrive speichern → Excel öffnet automatisch
        <br><b style="color:var(--gold)">Excel → App:</b> In Excel „Sync zur App" klicken → hier importieren
      </p>
      <div style="display:flex;flex-direction:column;gap:.5rem">
        <button class="btn-primary btn-block" onclick="exportSyncJSON()" style="font-size:.9rem">
          📤 Sync Export (App → Excel)
        </button>
        <label style="cursor:pointer;display:block">
          <span class="btn-secondary" style="display:block;text-align:center;padding:.5rem;border-radius:var(--radius-sm);cursor:pointer">
            📥 Sync Import (Excel → App)
          </span>
          <input type="file" accept=".json" style="display:none" onchange="importSyncJSON(this)" />
        </label>
      </div>
    </div>

    <div class="section-title" style="color:var(--green)">📋 Rohdaten Import</div>
    <div class="card-section" style="margin-bottom:.8rem;border-color:var(--green)">
      <p style="font-size:.82rem;color:var(--text2);margin-bottom:.8rem;line-height:1.6">
        Importiere die ausgefüllte <b>HerdenPro_Rohdaten.xlsx</b> direkt in die App.<br>
        Bauern, Kühe, Milch, Behandlungen und Kraftfutter werden automatisch übernommen.
      </p>
      <div style="display:flex;flex-direction:column;gap:.5rem">
        <label style="cursor:pointer;display:block">
          <span class="btn-primary" style="display:block;text-align:center;padding:.6rem;border-radius:var(--radius-sm);cursor:pointer;background:linear-gradient(135deg,var(--green),var(--green2))">
            📊 Rohdaten Excel importieren
          </span>
          <input type="file" accept=".xlsx,.xls,.xlsm" style="display:none" onchange="importRohdatenExcel(this)" />
        </label>
      </div>
      <div id="rohdaten-status" style="margin-top:.5rem;font-size:.78rem;color:var(--text3)"></div>
    </div>

    <div class="section-title">Vollständiges Backup</div>
    <div class="card-section" style="margin-bottom:.8rem">
      <p style="font-size:.82rem;color:var(--text2);margin-bottom:.8rem">Alle Daten als JSON-Datei exportieren.</p>
      <button class="btn-primary btn-block" onclick="exportJSON()">📥 Alle Daten als JSON exportieren</button>
    </div>
    
    <div class="section-title">CSV Exporte</div>
    <div class="card-section">
      <div style="display:flex;flex-direction:column;gap:.5rem">
        <button class="btn-secondary" onclick="exportKueheCSV()">🐄 Kühe exportieren</button>
        <button class="btn-secondary" onclick="exportBehandlungenCSV()">⚕ Behandlungen exportieren</button>
        <button class="btn-secondary" onclick="exportMilchCSV()">🥛 Milchdaten exportieren</button>
        <button class="btn-secondary" onclick="exportAlpung()">📊 Alpungstage exportieren</button>
        <button class="btn-primary" onclick="exportMolkereiExcel()">🧀 Molkerei Excel exportieren</button>
      </div>
    </div>
    
    <div class="section-title" style="margin-top:1rem">PDF Saisonbericht</div>
    <div class="card-section">
      <button class="btn-primary" onclick="showJahresberichtDialog()">📊 Jahresbericht PDF erstellen</button>
    </div>
  `;
}
window.exportJSON = function() {
  const data = { kuehe, behandlungen, besamungen, milchEintraege, weideTage, weiden, bauern, gruppen, saison: saisonInfo, journal, kontakte, exportDatum: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`HerdenPro_Backup_${isoDate(new Date())}.json`; a.click();
  // Backup-Zeitstempel speichern
  localStorage.setItem('letzteBackup', Date.now().toString());
  localStorage.setItem('letzteBackupDatum', isoDate(new Date()));
  // Banner ausblenden falls vorhanden
  const banner = document.getElementById('backup-reminder-banner');
  if(banner) banner.style.display = 'none';
};

// ── Auto-Backup System ──
window.checkBackupErinnerung = function() {
  // Nur für Admins
  if(window._currentRole !== 'admin') return;

  const letztes = parseInt(localStorage.getItem('letzteBackup')||'0');
  const jetzt = Date.now();
  const tageOhneBackup = Math.floor((jetzt - letztes) / 86400000);
  const WARNSCHWELLE = 7; // Tage

  if(letztes === 0 || tageOhneBackup >= WARNSCHWELLE) {
    // 1. Banner anzeigen
    zeigBackupBanner(letztes === 0 ? null : tageOhneBackup);
    // 2. Push-Notification (nur einmal pro Tag)
    if('Notification' in window && Notification.permission === 'granted') {
      const notifKey = 'backupNotifSent_' + isoDate(new Date());
      if(!localStorage.getItem(notifKey)) {
        swNotify('💾 Backup fällig', {
          body: letztes === 0
            ? 'Noch kein Backup erstellt – jetzt sichern!'
            : 'Letztes Backup vor ' + tageOhneBackup + ' Tagen. Jetzt sichern!',
          icon: './icon-192.png',
          tag: 'backup-reminder'
        });
        localStorage.setItem(notifKey, '1');
      }
    }
  }
};

window.zeigBackupBanner = function(tageOhneBackup) {
  let banner = document.getElementById('backup-reminder-banner');
  if(!banner) {
    banner = document.createElement('div');
    banner.id = 'backup-reminder-banner';
    // Nach dem Topbar einfügen
    const topbar = document.getElementById('topbar');
    if(topbar && topbar.nextSibling) {
      topbar.parentNode.insertBefore(banner, topbar.nextSibling);
    } else {
      document.body.appendChild(banner);
    }
  }
  banner.style.cssText = 'background:linear-gradient(135deg,rgba(212,168,75,.15),rgba(212,168,75,.08));border-bottom:1px solid rgba(212,168,75,.3);padding:.5rem 1rem;display:flex;align-items:center;gap:.7rem;z-index:90;flex-shrink:0';
  banner.innerHTML =
    '<span style="font-size:1rem">💾</span>' +
    '<div style="flex:1;min-width:0">' +
      '<div style="font-size:.78rem;font-weight:600;color:var(--gold)">' +
        (tageOhneBackup ? 'Backup fällig – vor ' + tageOhneBackup + ' Tagen zuletzt gesichert' : 'Noch kein Backup erstellt') +
      '</div>' +
      '<div style="font-size:.68rem;color:var(--text3)">Empfehlung: wöchentlich sichern</div>' +
    '</div>' +
    '<button onclick="exportJSON()" style="background:var(--gold);color:#0a0800;border:none;border-radius:8px;padding:.35rem .7rem;font-size:.75rem;font-weight:700;cursor:pointer;flex-shrink:0;white-space:nowrap">💾 Jetzt</button>' +
    '<button onclick="document.getElementById(\'backup-reminder-banner\').style.display=\'none\'" style="background:none;border:none;color:var(--text3);font-size:1rem;cursor:pointer;padding:.2rem;flex-shrink:0">✕</button>';
};

window.exportKueheCSV = function() {
  const rows = Object.values(kuehe).sort((a,b)=>parseInt(a.nr)-parseInt(b.nr)).map(k=>[k.nr,k.name||'',k.bauer||'',k.rasse||'',k.gruppe||'',k.almStatus==='oben'?'Ja':'Nein']);
  const csv = 'Kuhnr;Ohrmarke;Name;Bauer;Rasse;Gruppe;Auf Alm\n' + rows.map(r=>r.join(';')).join('\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}));
  a.download=`Kuehe_${isoDate(new Date())}.csv`; a.click();
};

window.exportBehandlungenCSV = function() {
  const rows = Object.values(behandlungen).sort((a,b)=>a.datum-b.datum).map(b=>{
    const k=kuehe[b.kuhId];
    return [new Date(b.datum).toLocaleDateString('de-AT'),`#${k?.nr||''} ${k?.name||''}`,b.diagnose||'',b.medikament||'',b.dosis||'',b.tierarzt||'',b.wartezeitEnde?new Date(b.wartezeitEnde).toLocaleDateString('de-AT'):''];
  });
  const csv = 'Datum;Tier;Diagnose;Medikament;Dosis;Abgabedatum;Tierarzt;Wartezeit bis\n' + rows.map(r=>r.join(';')).join('\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}));
  a.download=`Behandlungen_${isoDate(new Date())}.csv`; a.click();
};

window.exportMilchCSV = function() {
  const rows = Object.values(milchEintraege).sort((a,b)=>a.datum-b.datum).map(e=>[new Date(e.datum).toLocaleDateString('de-AT'),e.zeit==='abend'?'Abends':'Morgens',e.art==='gesamt'?'Gesamt':'Pro Kuh',e.gesamt,e.molkerei?'Ja':'Nein',e.notiz||'']);
  const csv = 'Datum;Zeit;Art;Liter;An Molkerei;Notiz\n' + rows.map(r=>r.join(';')).join('\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}));
  a.download=`Milch_${isoDate(new Date())}.csv`; a.click();
};

window.showJahresberichtDialog = function() {
  // Saison-Auswahl: aktuelle + archivierte
  const archivJahre = Object.keys(saisonArchiv||{}).sort((a,b)=>b-a);
  const aktJahr = saisonInfo?.jahr || new Date().getFullYear();

  var existing = document.getElementById('jahresbericht-ov');
  if(existing) existing.remove();
  var ov = document.createElement('div');
  ov.id = 'jahresbericht-ov';
  ov.className = 'form-overlay';
  ov.style.display = 'flex';
  ov.innerHTML =
    '<div class="form-sheet">' +
      '<div class="form-header"><h3>📊 Jahresbericht PDF</h3><button class="close-btn" onclick="document.getElementById(\'jahresbericht-ov\').remove()">✕</button></div>' +
      '<div class="form-body">' +
        '<label class="inp-label">Saison wählen</label>' +
        '<select id="jb-saison" class="inp">' +
          '<option value="aktuell">Aktuelle Saison ' + aktJahr + (saisonInfo?.aktiv?' (aktiv)':' (beendet)') + '</option>' +
          archivJahre.map(function(j){return '<option value="archiv_'+j+'">Saison '+j+' (Archiv)</option>';}).join('') +
        '</select>' +
        '<p style="font-size:.78rem;color:var(--text2);margin:.5rem 0">Enthält: Kennzahlen · Milchleistung · Alpungstage · Behandlungen · Besamungen</p>' +
        '<div class="form-actions">' +
          '<button class="btn-secondary" onclick="document.getElementById(\'jahresbericht-ov\').remove()">Abbrechen</button>' +
          '<button class="btn-primary" onclick="exportJahresbericht(document.getElementById(\'jb-saison\').value)">📄 PDF erstellen</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);
};

window.exportSaisonPDF = function() { window.showJahresberichtDialog(); };

window.exportJahresbericht = function(saisonKey) {
  document.getElementById('jahresbericht-ov')?.remove();

  // Daten zusammenstellen
  var alm, jahr, auftriebTs, abtriebtTs, isAktiv;
  if(saisonKey === 'aktuell') {
    alm = saisonInfo?.alm || 'Alm';
    jahr = saisonInfo?.jahr || new Date().getFullYear();
    auftriebTs = saisonInfo?.auftriebDatum || null;
    abtriebtTs = saisonInfo?.abtriebtDatum || null;
    isAktiv = !!saisonInfo?.aktiv;
  } else {
    var archivKey = saisonKey.replace('archiv_','');
    var arch = saisonArchiv[archivKey] || {};
    alm = saisonInfo?.alm || 'Alm';
    jahr = arch.jahr || archivKey;
    auftriebTs = arch.auftriebDatum || null;
    abtriebtTs = arch.abtriebtDatum || null;
    isAktiv = false;
  }

  var heute = Date.now();
  var saisonEnde = abtriebtTs || (isAktiv ? heute : null);
  var alpungTageGesamt = auftriebTs && saisonEnde ? Math.max(0, Math.floor((saisonEnde - auftriebTs) / 86400000)) : 0;

  // Kühe
  var kuhListe = Object.values(kuehe).sort(function(a,b){return (parseInt(a.nr)||0)-(parseInt(b.nr)||0);});

  // Milch
  var milchListe = Object.values(milchEintraege);
  var milchGesamt = milchListe.reduce(function(s,m){return s+(m.gesamt||0);},0);
  var milchMolkerei = milchListe.filter(function(m){return m.molkerei;}).reduce(function(s,m){return s+(m.gesamt||0);},0);
  var tagesMilch = {};
  milchListe.forEach(function(m){
    if(!m.datum) return;
    var tag = new Date(m.datum).toISOString().slice(0,10);
    tagesMilch[tag]=(tagesMilch[tag]||0)+(m.gesamt||0);
  });
  var melktage = Object.keys(tagesMilch).length;
  var schnittMilch = melktage ? Math.round(milchGesamt/melktage*10)/10 : 0;

  // Milch pro Kuh
  var kuhMilch = {};
  milchListe.forEach(function(m){
    if(m.prokuh) Object.entries(m.prokuh).forEach(function(e){kuhMilch[e[0]]=(kuhMilch[e[0]]||0)+(parseFloat(e[1])||0);});
  });

  // Behandlungen
  var bListe = Object.values(behandlungen).sort(function(a,b){return a.datum-b.datum;});
  var medCount = {};
  bListe.forEach(function(b){if(b.medikament)medCount[b.medikament]=(medCount[b.medikament]||0)+1;});
  var medTop = Object.entries(medCount).sort(function(a,b){return b[1]-a[1];}).slice(0,8);

  // Besamungen
  var bsListe = Object.values(besamungen).sort(function(a,b){return a.datum-b.datum;});
  var bsErfolg = bsListe.filter(function(bs){return bs.status==='tragend';}).length;

  // CSS
  var css = [
    '@import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;600&display=swap");',
    '*{box-sizing:border-box;margin:0;padding:0}',
    'body{font-family:"DM Sans",Arial,sans-serif;font-size:9.5pt;color:#1a1a1a;background:#fff}',
    '.cover{background:linear-gradient(135deg,#0d2210 0%,#1a3a12 100%);color:#fff;padding:2.5cm 2cm;min-height:6cm;position:relative}',
    '.cover-badge{display:inline-block;background:rgba(212,168,75,.2);border:1px solid rgba(212,168,75,.5);border-radius:20px;padding:3px 14px;font-size:8pt;color:#d4a84b;margin-bottom:12px;letter-spacing:.1em}',
    '.cover h1{font-family:"Playfair Display",serif;font-size:26pt;color:#d4a84b;line-height:1.1;margin-bottom:6px}',
    '.cover h2{font-size:14pt;color:rgba(255,255,255,.7);font-weight:400}',
    '.cover-meta{margin-top:16px;font-size:8.5pt;color:rgba(255,255,255,.55)}',
    '.cover-line{height:2px;background:linear-gradient(90deg,#d4a84b,transparent);margin:16px 0}',
    '.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}',
    '.kpi{background:#f8fdf5;border:1px solid #cfe8c0;border-radius:8px;padding:10px;text-align:center}',
    '.kpi-num{font-size:18pt;font-weight:700;color:#1a3a0a}',
    '.kpi-label{font-size:7.5pt;color:#4a6a40;margin-top:2px}',
    'h2.section{font-size:12pt;color:#1a3a0a;border-bottom:2px solid #d4a84b;padding-bottom:4px;margin:20px 0 10px;font-family:"Playfair Display",serif}',
    'table{width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:12px}',
    'thead{display:table-header-group}',
    'th{background:#1a3a0a;color:#fff;padding:5px 6px;text-align:left;font-weight:600}',
    'td{padding:4px 6px;border-bottom:1px solid #e8f0e0;vertical-align:top}',
    'tr:nth-child(even) td{background:#f8fdf5}',
    'tr{page-break-inside:avoid}',
    '.bar-wrap{background:#e8f0e0;border-radius:4px;height:8px;overflow:hidden;margin-top:2px}',
    '.bar{background:linear-gradient(90deg,#2a6a0a,#4db84e);height:100%;border-radius:4px}',
    '.gold{color:#8a6010}',
    '.footer{position:fixed;bottom:0;left:0;right:0;font-size:7pt;color:#888;border-top:1px solid #ccc;padding:4px 16px;background:#fff;display:flex;justify-content:space-between}',
    '.page-break{page-break-before:always}',
    '@media print{@page{size:A4;margin:1.5cm}body{background:#fff}.footer{position:fixed}}'
  ].join('\n');

  var fmt = function(n){return Math.round(n*10)/10;};
  var fmtDate = function(ts){return ts?new Date(ts).toLocaleDateString('de-AT'):'–';};

  // Milch pro Kuh Tabelle
  var kuhMilchRows = kuhListe.map(function(k){
    var id = Object.entries(kuehe).find(function(e){return e[1]===k;})?.[0];
    var liter = id ? (kuhMilch[id]||0) : 0;
    var maxL = Math.max.apply(null, Object.values(kuhMilch).concat([1]));
    var pct = Math.round(liter/maxL*100);
    return '<tr><td>#'+k.nr+'</td><td>'+( k.name||'–')+'</td><td>'+(k.bauer||'–')+'</td>'+
      '<td style="width:120pt"><div>'+fmt(liter)+'L</div><div class="bar-wrap"><div class="bar" style="width:'+pct+'%"></div></div></td>'+
      '<td>'+alpungTageGesamt+'</td></tr>';
  }).join('');

  // Behandlungen Tabelle
  var behRows = bListe.map(function(b){
    var k = kuehe[b.kuhId];
    return '<tr><td>'+fmtDate(b.datum)+'</td><td>#'+(k?.nr||'?')+' '+(k?.name||'')+'</td>'+
      '<td>'+(b.diagnose||'–')+'</td><td>'+(b.medikament||'–')+'</td><td>'+(b.dosis||'–')+'</td>'+
      '<td>'+(b.wzMilchTage?b.wzMilchTage+'T':'–')+'</td><td>'+(b.tierarzt||'–')+'</td></tr>';
  }).join('');

  // Besamungen Tabelle
  var bsRows = bsListe.map(function(bs){
    var k = kuehe[bs.kuhId];
    return '<tr><td>'+fmtDate(bs.datum)+'</td><td>#'+(k?.nr||'?')+' '+(k?.name||'')+'</td>'+
      '<td>'+(bs.stier||'–')+'</td><td>'+(bs.besamungstechniker||'–')+'</td>'+
      '<td style="color:'+(bs.status==='tragend'?'#1a6a0a':bs.status==='leer'?'#8a1a1a':'#555')+';font-weight:600">'+
      ({tragend:'✓ Trächtig',leer:'✗ Leer',besamt:'⏳ Besamt',unbekannt:'?'}[bs.status]||bs.status||'–')+
      '</td><td>'+(bs.erwartetGeburt?fmtDate(bs.erwartetGeburt):'–')+'</td></tr>';
  }).join('');

  var html = '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Jahresbericht '+alm+' '+jahr+'</title><style>'+css+'</style></head><body>'+
  // Cover
  '<div class="cover">'+
    '<div class="cover-badge">JAHRESBERICHT</div>'+
    '<h1>'+alm+'</h1>'+
    '<h2>Alpwirtschaft · Saison '+jahr+'</h2>'+
    '<div class="cover-line"></div>'+
    '<div class="cover-meta">'+
      'Auftrieb: '+fmtDate(auftriebTs)+'&nbsp;&nbsp;·&nbsp;&nbsp;'+
      'Abtrieb: '+(abtriebtTs?fmtDate(abtriebtTs):(isAktiv?'Saison läuft noch':'–'))+'&nbsp;&nbsp;·&nbsp;&nbsp;'+
      'Alpungstage: '+alpungTageGesamt+'&nbsp;&nbsp;·&nbsp;&nbsp;'+
      'Kühe: '+kuhListe.length+
    '</div>'+
    '<div class="cover-meta" style="margin-top:8px">Erstellt: '+new Date().toLocaleDateString('de-AT')+' · HerdenPro · Engineering by LN Machinery</div>'+
  '</div>'+

  // KPI Grid
  '<div style="padding:16px 16px 0">'+
  '<h2 class="section">📊 Kennzahlen Saison '+jahr+'</h2>'+
  '<div class="kpi-grid">'+
    '<div class="kpi"><div class="kpi-num">'+Math.round(milchGesamt)+'L</div><div class="kpi-label">Milch gesamt</div></div>'+
    '<div class="kpi"><div class="kpi-num">'+schnittMilch+'L</div><div class="kpi-label">Ø pro Melktag</div></div>'+
    '<div class="kpi"><div class="kpi-num">'+bListe.length+'</div><div class="kpi-label">Behandlungen</div></div>'+
    '<div class="kpi"><div class="kpi-num">'+bsListe.length+'</div><div class="kpi-label">Besamungen</div></div>'+
    '<div class="kpi"><div class="kpi-num">'+melktage+'</div><div class="kpi-label">Melktage</div></div>'+
    '<div class="kpi"><div class="kpi-num">'+Math.round(milchMolkerei)+'L</div><div class="kpi-label">An Molkerei</div></div>'+
    '<div class="kpi"><div class="kpi-num">'+bsErfolg+'</div><div class="kpi-label">Trächtig</div></div>'+
    '<div class="kpi"><div class="kpi-num">'+kuhListe.length+'</div><div class="kpi-label">Kühe</div></div>'+
  '</div>'+

  // Häufigste Medikamente
  (medTop.length?
    '<h2 class="section" style="margin-top:16px">💊 Häufigste Medikamente</h2>'+
    '<table><thead><tr><th>Medikament</th><th>Anzahl</th><th style="width:120pt">Häufigkeit</th></tr></thead><tbody>'+
    medTop.map(function(e){return '<tr><td>'+e[0]+'</td><td>'+e[1]+'×</td><td><div class="bar-wrap"><div class="bar" style="width:'+Math.round(e[1]/medTop[0][1]*100)+'%"></div></div></td></tr>';}).join('')+
    '</tbody></table>'
  :'')+
  '</div>'+

  // Milch pro Kuh
  '<div class="page-break" style="padding:16px">'+
  '<h2 class="section">🥛 Milchleistung pro Kuh</h2>'+
  '<table><thead><tr><th>Nr</th><th>Name</th><th>Bauer</th><th>Milch gesamt</th><th>Alpungstage</th></tr></thead>'+
  '<tbody>'+kuhMilchRows+'</tbody></table>'+

  // Besamungen
  (bsListe.length?
    '<h2 class="section" style="margin-top:20px">🐮 Besamungen</h2>'+
    '<table><thead><tr><th>Datum</th><th>Kuh</th><th>Stier</th><th>Techniker</th><th>Ergebnis</th><th>Geburt erw.</th></tr></thead>'+
    '<tbody>'+bsRows+'</tbody></table>'
  :'')+
  '</div>'+

  // Behandlungen
  (bListe.length?
    '<div class="page-break" style="padding:16px">'+
    '<h2 class="section">⚕ Behandlungen</h2>'+
    '<table><thead><tr><th>Datum</th><th>Kuh</th><th>Diagnose</th><th>Medikament</th><th>Dosis</th><th>WZ Milch</th><th>Tierarzt</th></tr></thead>'+
    '<tbody>'+behRows+'</tbody></table>'+
    '</div>'
  :'')+

  '<div class="footer">'+
    '<span>HerdenPro · '+alm+' · Saison '+jahr+' · Engineering by LN Machinery</span>'+
    '<span>Erstellt: '+new Date().toLocaleDateString('de-AT')+'</span>'+
  '</div>'+
  '<scr'+'ipt>window.onload=function(){window.print();}</'+'script>'+
  '</body></html>';

  var w = window.open('','_blank');
  if(!w) { alert('Popup blockiert – bitte Popups für diese Seite erlauben'); return; }
  w.document.write(html);
  w.document.close();
};

// ── Service Worker Notification Helper ──
// Auf Android/Chrome müssen Notifications via SW gesendet werden
window.swNotify = async function(title, options) {
  options = options || {};
  options.icon = options.icon || './icon-192.png';
  options.badge = options.badge || './icon-192.png';
  // Haptic-Ping bei wichtigen Notifications (Wartezeit / Brunst / Termin)
  if(typeof window.haptic === 'function') window.haptic('alarm');
  // Versuche Service Worker
  if('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if(reg && reg.showNotification) {
        await reg.showNotification(title, options);
        return true;
      }
    } catch(e) { console.warn('SW notify fail:', e); }
  }
  // Fallback direkt
  try { swNotify(title, options); return true; } catch(e) { return false; }
};

window.testBenachrichtigung = async function() {
  if(!('Notification' in window)) {
    alert('Benachrichtigungen werden nicht unterstützt.\nTipp: App als PWA installieren und Chrome verwenden.');
    return;
  }
  if(Notification.permission !== 'granted') {
    alert('Benachrichtigungen sind nicht erlaubt. Bitte zuerst erlauben.');
    return;
  }
  const ok = await swNotify('🐄 HerdenPro Test', {
    body: 'Benachrichtigungen funktionieren! ✓',
    tag: 'herdenpro-test',
    vibrate: [100,50,100]
  });
  if(!ok) alert('Test fehlgeschlagen. Bitte App über Homescreen öffnen (PWA-Modus).');
};

window.benachrichtigungErlauben = async function() {
  if(!('Notification' in window)) { 
    alert('Dein Browser unterstützt keine Benachrichtigungen.\nTipp: App als PWA installieren (Homescreen hinzufügen) und Chrome verwenden.');
    return; 
  }
  const perm = await Notification.requestPermission();
  if(perm === 'granted') {
    render();
    // Sofort Test senden
    setTimeout(() => testBenachrichtigung(), 500);
  } else if(perm === 'denied') {
    alert('Blockiert. So freischalten:\nAndroid Chrome: Einstellungen → Website-Einstellungen → Benachrichtigungen → stately-cat-fcf296.netlify.app → Erlauben\niPhone Safari: Einstellungen → Safari → Websites → Benachrichtigungen');
  }
};

// ══════════════════════════════════════════════════════════════
//  KUH POPUP
// ══════════════════════════════════════════════════════════════
window.showKuhPopup = function(id) {
  const k = kuehe[id];
  if(!k) return;
  const bListe = Object.values(behandlungen).filter(b=>b.kuhId===id).sort((a,b)=>b.datum-a.datum).slice(0,3);
  const bsList = Object.values(besamungen).filter(b=>b.kuhId===id).sort((a,b)=>b.datum-a.datum).slice(0,2);
  const foto = fotos[id];
  const laktLabels = {melkend:'🥛 Melkend',trocken:'💧 Trocken',tragend:'🐄 Tragend',jung:'🌱 Jungtier',trockengestellt:'⏸ Trockengestellt'};

  showPopupHTML(`
    <div style="text-align:center;padding:.5rem 0 .8rem">
      ${foto?`<img src="${foto.data}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid var(--gold2);margin-bottom:.5rem" />`
            :`<div style="font-size:3rem;margin-bottom:.3rem">🐄</div>`}
      <div style="font-size:.75rem;color:var(--text3)">#${k.nr}</div>
      <div style="font-size:1.4rem;color:var(--gold);font-weight:bold">${k.name||'–'}</div>
      <div style="font-size:.82rem;color:var(--text3)">${[k.bauer,k.rasse,k.gruppe].filter(Boolean).join(' · ')}</div>
      ${k.laktation?`<span class="tag tag-blue" style="margin-top:.3rem;display:inline-block">${laktLabels[k.laktation]||k.laktation}</span>`:''}
      ${k.notiz?`<div style="font-size:.78rem;color:var(--text3);margin-top:.4rem;font-style:italic">${k.notiz}</div>`:''}
      ${k.almStatus==='oben'?'<span class="tag tag-green" style="display:inline-block;margin-top:.3rem">⛰ auf Alm</span>':''}
    </div>
    ${bListe.length?`
    <div class="section-title">Letzte Behandlungen</div>
    ${bListe.map(b=>`<div class="history-card" style="margin-bottom:.4rem">
      <div style="font-size:.72rem;color:var(--text3)">${new Date(b.datum).toLocaleDateString('de-AT')}</div>
      <div style="font-size:.85rem">${b.diagnose||b.medikament||'Behandlung'}</div>
      ${b.medikament?`<div style="font-size:.72rem;color:var(--text3)">${b.medikament}${b.dosis?' · '+b.dosis:''}</div>`:''}
    </div>`).join('')}`:''}
    ${bsList.length?`
    <div class="section-title">Besamungen</div>
    ${bsList.map(b=>`<div class="history-card" style="margin-bottom:.4rem">
      <div style="font-size:.72rem;color:var(--text3)">${new Date(b.datum).toLocaleDateString('de-AT')} · <span class="tag ${b.status==='tragend'?'tag-green':'tag-gray'}">${{besamt:'Besamt',tragend:'Trächtig',leer:'Leer',kalbung:'Gekälbert'}[b.status]||b.status}</span></div>
      <div style="font-size:.85rem">${b.stier||b.samen||'–'}</div>
      ${b.erwartetGeburt?`<div style="font-size:.72rem;color:var(--text3)">Geburt erw.: ${new Date(b.erwartetGeburt).toLocaleDateString('de-AT')}</div>`:''}
    </div>`).join('')}`:''}
    <div style="display:flex;gap:.5rem;margin-top:.8rem">
      <button class="btn-primary" style="flex:1" onclick="closePopup();showKuhDetail('${id}')">Vollansicht öffnen</button>
      <button class="btn-secondary" onclick="closePopup();showKuhForm('${id}')">✎ Bearbeiten</button>
    </div>
  `);
};

// ══════════════════════════════════════════════════════════════
//  BAUER POPUP
// ══════════════════════════════════════════════════════════════
window.showBauerPopup = function(id) {
  const b = bauern[id];
  if(!b) return;
  const kueheList = Object.entries(kuehe).filter(([,k])=>k.bauer===b.name).sort((a,b2)=>parseInt(a[1].nr)-parseInt(b2[1].nr));

  showPopupHTML(`
    <div style="text-align:center;padding:.5rem 0 .8rem">
      <div style="font-size:3rem;margin-bottom:.3rem">👤</div>
      <div style="font-size:1.3rem;color:var(--gold);font-weight:bold">${b.name}</div>
      ${b.betrieb?`<div style="font-size:.82rem;color:var(--text3)">LFBIS: ${b.betrieb}</div>`:''}
      ${b.tel?`<a href="tel:${b.tel}" class="btn-xs" style="display:inline-block;margin-top:.4rem;text-decoration:none">📞 ${b.tel}</a>`:''}
    </div>
    <div class="section-title">Kühe (${kueheList.length})</div>
    <div class="card-list">
      ${kueheList.map(([kid,k])=>`
        <div class="list-card list-card-sm" onclick="closePopup();showKuhPopup('${kid}')">
          <span class="nr-badge">#${k.nr}</span>
          <span class="list-card-title">${k.name||'–'}</span>
          <span style="font-size:.72rem;color:var(--text3)">${k.rasse||''}</span>
          <span class="chevron">›</span>
        </div>`).join('')||'<div class="empty-state">Keine Kühe</div>'}
    </div>
    <button class="btn-secondary btn-block" style="margin-top:.8rem" onclick="closePopup()">Schließen</button>
  `);
};

window.showPopupHTML = function(content) {
  let overlay = document.getElementById('popup-overlay');
  if(!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'popup-overlay';
    overlay.className = 'popup-overlay';
    overlay.onclick = e => { if(e.target===overlay) closePopup(); };
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="popup-box">${content}</div>`;
  overlay.style.display = 'flex';
};

window.closePopup = function() {
  const o = document.getElementById('popup-overlay');
  if(o) o.style.display = 'none';
};


// ══════════════════════════════════════════════════════════════
//  SENNEREI EXCEL EXPORT
// ══════════════════════════════════════════════════════════════
window.exportMolkereiExcel = function() {
  // Wir brauchen SheetJS (XLSX library)
  if(typeof XLSX === 'undefined') {
    alert('Bibliothek wird geladen, bitte nochmal tippen...');
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=()=>exportMolkereiExcel();
    document.head.appendChild(s);
    return;
  }

  const wb = XLSX.utils.book_new();
  
  // ── Milchdaten nach Wochen aufteilen ──
  // Saison-Start ermitteln
  const saisonStart = saisonInfo?.auftriebDatum ? new Date(saisonInfo.auftriebDatum) : new Date(new Date().getFullYear(),4,1); // Mai
  
  // Alle Milcheinträge nach Woche gruppieren (W1-W14)
  const wochenMilch = {}; // { kuhId: { W1: liter, W2: liter, ... } }
  
  Object.values(milchEintraege).forEach(m => {
    if(!m.datum) return;
    const datum = new Date(m.datum);
    const tageSeit = Math.floor((datum - saisonStart) / 86400000);
    const woche = Math.min(14, Math.max(1, Math.floor(tageSeit/7) + 1));
    const wKey = 'W'+woche;
    
    if(m.art === 'prokuh' && m.prokuh) {
      Object.entries(m.prokuh).forEach(([kuhId, liter]) => {
        if(!wochenMilch[kuhId]) wochenMilch[kuhId] = {};
        wochenMilch[kuhId][wKey] = (wochenMilch[kuhId][wKey]||0) + liter;
      });
    } else if(m.art === 'gesamt') {
      // Gesamtmenge gleichmäßig auf alle aufgetriebenen Kühe verteilen
      const obenKuehe = Object.keys(kuehe).filter(id=>kuehe[id].almStatus==='oben');
      if(obenKuehe.length) {
        const proKuh = (m.gesamt||0) / obenKuehe.length;
        obenKuehe.forEach(kuhId => {
          if(!wochenMilch[kuhId]) wochenMilch[kuhId] = {};
          wochenMilch[kuhId][wKey] = (wochenMilch[kuhId][wKey]||0) + proKuh;
        });
      }
    }
  });

  // ── Daten nach Bauer gruppieren ──
  const bauernMap = {}; // { bauerName: [{kuhId, k}] }
  Object.entries(kuehe).sort((a,b)=>parseInt(a[1].nr)-parseInt(b[1].nr)).forEach(([id,k])=>{
    const b = k.bauer||'Unbekannt';
    if(!bauernMap[b]) bauernMap[b]=[];
    bauernMap[b].push({id,k});
  });

  const WOCHEN = ['W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12','W13','W14'];
  
  // ── Sheet aufbauen ──
  const rows = [];
  
  // Titel
  rows.push(['Stallbuch - Milcherfassung | Import aus HerdenPro','','','','','','','','','','','','','','','','','']);
  rows.push([`Saison ${saisonInfo?.jahr||new Date().getFullYear()} | Alm: ${saisonInfo?.alm||'–'} | Export: ${new Date().toLocaleDateString('de-AT')}`,'','','','','','','','','','','','','','','','','']);
  rows.push(['','Kuh-Nr.','Name','Summen',...WOCHEN]);

  // Gesamt-Summenzeile (wird am Ende berechnet)
  const gesamtRow = ['Gesamt','','','0',...WOCHEN.map(()=>0)];
  rows.push(gesamtRow);

  let gesamtSummen = new Array(14).fill(0);

  Object.entries(bauernMap).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([bauerName, kueheList]) => {
    // Bauer-Zeile
    const bauerBio = kueheList.some(({id})=>kuehe[id]?.bio) ? '  [Bio]' : '';
    rows.push([bauerName+bauerBio,'','','','','','','','','','','','','','','','','']);
    
    // Kühe
    kueheList.forEach(({id,k})=>{
      const wData = wochenMilch[id]||{};
      const werte = WOCHEN.map(w=>Math.round((wData[w]||0)*10)/10);
      const summe = werte.reduce((s,v)=>s+v,0);
      werte.forEach((v,i)=>gesamtSummen[i]+=v);
      rows.push(['',k.nr,k.name||'',Math.round(summe*10)/10,...werte]);
    });
  });

  // Gesamt aktualisieren
  const gesamtIdx = 3;
  rows[gesamtIdx][3] = Math.round(gesamtSummen.reduce((s,v)=>s+v,0)*10)/10;
  gesamtSummen.forEach((v,i)=>rows[gesamtIdx][4+i]=Math.round(v*10)/10);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  
  // Spaltenbreiten
  ws['!cols'] = [
    {wch:24},{wch:10},{wch:14},{wch:10},
    ...WOCHEN.map(()=>({wch:7}))
  ];

  // Merge Titel
  ws['!merges'] = [
    {s:{r:0,c:0},e:{r:0,c:17}},
    {s:{r:1,c:0},e:{r:1,c:17}},
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Stall');
  
  // ── Anleitung Sheet ──
  const wsAnl = XLSX.utils.aoa_to_sheet([
    ['HerdenPro → Molkerei Import'],
    [''],
    ['So importieren:'],
    ['1. Diese Datei öffnen'],
    ['2. Sheet "Stall" kopieren ins Molkerei-System (Stall-Sheet ersetzen)'],
    ['3. Wochensummen werden automatisch übernommen'],
    [''],
    ['Hinweis: Milchmengen in Liter. Molkerei-System rechnet ebenfalls in Liter.'],
    ['Umrechnung L→kg falls nötig: 1L ≈ 1,033 kg'],
  ]);
  XLSX.utils.book_append_sheet(wb, wsAnl, 'Anleitung');

  // Download
  const jahr = saisonInfo?.jahr||new Date().getFullYear();
  const alm = (saisonInfo?.alm||'Alm').replace(/[^a-zA-Z0-9]/g,'_');
  XLSX.writeFile(wb, `Molkerei_Import_${alm}_${jahr}.xlsx`);
};

// ══════════════════════════════════════════════════════════════
//  CHAT
// ══════════════════════════════════════════════════════════════
function renderChatPage() {
  const nachrichten = Object.entries(chatNachrichten)
    .sort((a,b)=>a[1].ts-b[1].ts).slice(-50);
  
  return `
    <div class="page-header">
      <h2>💬 Hirten-Chat</h2>
      <span style="font-size:.72rem;color:var(--text3)">Live · alle Geräte</span>
    </div>

    ${!_chatName ? `
    <div class="card-section">
      <p style="font-size:.85rem;color:var(--text2);margin-bottom:.7rem">Wie heißt du? (wird bei deinen Nachrichten angezeigt)</p>
      <input id="chat-name-inp" class="inp" placeholder="Dein Name (z.B. Lorenz)" />
      <button class="btn-primary" style="width:100%;margin-top:.5rem" onclick="setChatName()">Bestätigen</button>
    </div>` : `

    <!-- Nachrichten -->
    <div id="chat-messages" style="display:flex;flex-direction:column;gap:.4rem;margin-bottom:1rem;max-height:55vh;overflow-y:auto;padding:.2rem 0">
      ${nachrichten.length ? nachrichten.map(([id,m])=>`
        <div style="display:flex;flex-direction:column;align-items:${m.name===_chatName?'flex-end':'flex-start'}">
          <div style="font-size:.65rem;color:var(--text3);margin-bottom:2px;padding:0 .3rem">${m.name===_chatName?'Du':m.name} · ${new Date(m.ts).toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'})}</div>
          <div style="max-width:80%;background:${m.name===_chatName?'rgba(212,168,75,.2)':'var(--bg3)'};border:1px solid ${m.name===_chatName?'var(--gold2)':'var(--border2)'};border-radius:12px;padding:.5rem .8rem">
            ${m.foto?`<img src="${m.foto}" style="max-width:200px;max-height:150px;border-radius:8px;display:block;margin-bottom:${m.text?'.3rem':'0'}" />`:''}
            ${m.text?`<div style="font-size:.88rem;color:var(--text);word-break:break-word">${m.text}</div>`:''}
            ${m.kuhNr?`<div style="margin-top:.2rem"><span class="nr-badge">#${m.kuhNr}</span></div>`:''}
          </div>
        </div>`).join('') : `<div class="empty-state">Noch keine Nachrichten</div>`}
    </div>

    <!-- Eingabe -->
    <div style="position:sticky;bottom:0;background:var(--bg);padding:.5rem 0;border-top:1px solid var(--border)">
      <div style="display:flex;gap:.4rem;margin-bottom:.4rem">
        <input id="chat-inp" class="inp" placeholder="Nachricht…" style="flex:1"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatMsg();}" dir="ltr" />
        <button class="ok-btn" onclick="sendChatMsg()" style="padding:0 .8rem">➤</button>
      </div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap">
        <!-- Schnell-Kuh Buttons -->
        <div style="font-size:.7rem;color:var(--text3);width:100%;margin-bottom:2px">Kuh schnell melden:</div>
        <input id="chat-kuh-inp" class="inp" placeholder="#Nr" inputmode="numeric"
          style="width:70px;font-size:.85rem;text-align:center" dir="ltr" />
        <button class="btn-xs" onclick="sendKuhMsg()">🐄 Kuh melden</button>
        <label style="cursor:pointer">
          <span class="btn-xs">📷 Foto</span>
          <input type="file" accept="image/*" style="display:none" onchange="sendFotoMsg(this)" />
        </label>
        <button class="btn-xs-danger" onclick="if(confirm('Alle Nachrichten löschen?'))clearChat()">🗑</button>
        <button class="btn-xs" style="margin-left:auto" onclick="_chatName='';localStorage.removeItem('chatName');render()">✎ Name</button>
      </div>
    </div>
    `}
  `;
}

function renderChat() {
  // Update badge
  updateChatBadge();
  if(currentView==='chat') {
    render();
    setTimeout(()=>{
      const el=document.getElementById('chat-messages');
      if(el) el.scrollTop=el.scrollHeight;
    },50);
  } else {
    // Popup aktualisieren falls offen
    const popup = document.getElementById('chat-popup');
    if(popup && popup.style.display!=='none') renderChatPopupContent();
  }
}

var _lastSeenChat = parseInt(localStorage.getItem('lastSeenChat')||'0');
var _chatUnread = 0;

function updateChatBadge() {
  const nachrichten = Object.values(chatNachrichten);
  _chatUnread = nachrichten.filter(m=>m.ts>_lastSeenChat && m.name!==_chatName).length;
  // Nav badge – existing Chat nav item or Mehr button
  const navBtns = document.querySelectorAll('.nav-item');
  let chatInNav = false;
  navBtns.forEach(btn=>{
    const existing = btn.querySelector('.chat-badge');
    if(existing) existing.remove();
    if(btn.textContent.includes('Chat') && _chatUnread>0) {
      chatInNav = true;
      const badge = document.createElement('span');
      badge.className='chat-badge';
      badge.style.cssText='position:absolute;top:4px;right:calc(50% - 18px);background:var(--red);color:#fff;border-radius:50%;width:16px;height:16px;font-size:.62rem;line-height:16px;text-align:center;font-family:sans-serif;z-index:2';
      badge.textContent = _chatUnread > 9 ? '9+' : _chatUnread;
      btn.style.position='relative';
      btn.appendChild(badge);
    }
  });
  // If Chat is in Mehr-Menü → show badge on Mehr nav button instead
  const mehrNavBtn = document.getElementById('nav-mehr');
  if(mehrNavBtn) {
    let mb = mehrNavBtn.querySelector('.chat-badge-mehr');
    if(!chatInNav && _chatUnread > 0) {
      if(!mb) {
        mb = document.createElement('span');
        mb.className = 'chat-badge-mehr';
        mb.style.cssText = 'position:absolute;top:4px;right:calc(50% - 18px);background:var(--red);color:#fff;border-radius:50%;width:16px;height:16px;font-size:.62rem;line-height:16px;text-align:center;font-family:sans-serif;z-index:2';
        mehrNavBtn.style.position = 'relative';
        mehrNavBtn.appendChild(mb);
      }
      mb.textContent = _chatUnread > 9 ? '9+' : _chatUnread;
      mb.style.display = '';
    } else if(mb) {
      mb.style.display = 'none';
    }
  }
  // Zählung badge
  const zBadge = document.getElementById('chat-badge-zaehlung');
  if(zBadge) zBadge.style.display = _chatUnread>0?'':'none';
  // Mehr-btn grid badge
  document.querySelectorAll('.mehr-btn').forEach(btn=>{
    if(btn.textContent.includes('Chat')) {
      let b = btn.querySelector('.chat-badge');
      if(!b && _chatUnread>0) {
        b=document.createElement('span');
        b.className='chat-badge';
        b.style.cssText='position:absolute;top:4px;right:4px;background:var(--red);color:#fff;border-radius:50%;width:14px;height:14px;font-size:.58rem;line-height:14px;text-align:center;font-family:sans-serif';
        btn.style.position='relative';
        btn.appendChild(b);
      }
      if(b) b.textContent=_chatUnread>0?(_chatUnread>9?'9+':_chatUnread):'';
      if(b) b.style.display=_chatUnread>0?'':'none';
    }
  });
}

function markChatRead() {
  _lastSeenChat = Date.now();
  localStorage.setItem('lastSeenChat', _lastSeenChat);
  _chatUnread = 0;
  updateChatBadge();
}

// Push notification für neue Chat-Nachricht
let _prevChatCount = 0;
function checkNewChatMsg() {
  const msgs = Object.values(chatNachrichten);
  const newMsgs = msgs.filter(m=>m.ts>_lastSeenChat&&m.name!==_chatName);
  if(newMsgs.length > _chatUnread && Notification.permission==='granted' && currentView!=='chat') {
    const last = newMsgs[newMsgs.length-1];
    if('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(sw=>sw.showNotification('💬 '+last.name,{body:last.text||'📷 Foto',tag:'chat-'+last.ts}));
    }
  }
}

// ── Chat Popup (für Zählung) ──
window.showChatPopup = function() {
  markChatRead();
  let popup = document.getElementById('chat-popup');
  if(!popup) {
    popup = document.createElement('div');
    popup.id = 'chat-popup';
    popup.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:300;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(6px)';
    popup.onclick = e => { if(e.target===popup) closeChatPopup(); };
    document.body.appendChild(popup);
  }
  popup.style.display='flex';
  renderChatPopupContent();
};

function renderChatPopupContent() {
  const popup = document.getElementById('chat-popup');
  if(!popup || popup.style.display==='none') return;
  const nachrichten = Object.entries(chatNachrichten).sort((a,b)=>a[1].ts-b[1].ts).slice(-30);
  popup.innerHTML = `
    <div style="background:linear-gradient(180deg,var(--bg2),var(--bg));border:1px solid var(--border2);border-radius:24px 24px 0 0;width:100%;max-width:540px;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 -8px 30px rgba(0,0,0,.5)">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:1rem 1.2rem .6rem;border-bottom:1px solid var(--border)">
        <span style="color:var(--gold);font-size:1rem;font-weight:bold">💬 Hirten-Chat</span>
        <button onclick="closeChatPopup()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text3);border-radius:6px;padding:3px 10px;cursor:pointer;font-size:.9rem">✕</button>
      </div>
      <div id="chat-popup-msgs" style="flex:1;overflow-y:auto;padding:.7rem 1rem;display:flex;flex-direction:column;gap:.35rem">
        ${nachrichten.length ? nachrichten.map(([id,m])=>`
          <div style="display:flex;flex-direction:column;align-items:${m.name===_chatName?'flex-end':'flex-start'}">
            <div style="font-size:.62rem;color:var(--text3);margin-bottom:2px;padding:0 .3rem">${m.name===_chatName?'Du':m.name} · ${new Date(m.ts).toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'})}</div>
            <div style="max-width:80%;background:${m.name===_chatName?'rgba(212,168,75,.2)':'var(--bg3)'};border:1px solid ${m.name===_chatName?'var(--gold2)':'var(--border2)'};border-radius:12px;padding:.45rem .75rem">
              ${m.foto?`<img src="${m.foto}" style="max-width:180px;max-height:130px;border-radius:8px;display:block" />`:''}
              ${m.text?`<div style="font-size:.85rem;color:var(--text)">${m.text}</div>`:''}
              ${m.kuhNr?`<span class="nr-badge">#${m.kuhNr}</span>`:''}
            </div>
          </div>`).join('') : '<div class="empty-state" style="padding:1rem">Noch keine Nachrichten</div>'}
      </div>
      <div style="padding:.6rem 1rem;border-top:1px solid var(--border);display:flex;gap:.4rem">
        <input id="chat-popup-inp" class="inp" placeholder="Nachricht…" style="flex:1;font-size:.88rem" dir="ltr"
          onkeydown="if(event.key==='Enter')sendChatPopupMsg()" />
        <button class="ok-btn" onclick="sendChatPopupMsg()" style="padding:0 .8rem;font-size:1.1rem">➤</button>
      </div>
    </div>`;
  setTimeout(()=>{
    const el=document.getElementById('chat-popup-msgs');
    if(el) el.scrollTop=el.scrollHeight;
    document.getElementById('chat-popup-inp')?.focus();
  },50);
}

window.closeChatPopup = function() {
  const p=document.getElementById('chat-popup');
  if(p) p.style.display='none';
};

window.sendChatPopupMsg = async function() {
  if(!_chatName) { showChatPopup(); return; }
  const inp=document.getElementById('chat-popup-inp');
  const text=inp?.value.trim();
  if(!text) return;
  await push(ref(db,'chat'),{name:_chatName,text,ts:Date.now()});
  inp.value='';
};

window.setChatName = function() {
  const name=document.getElementById('chat-name-inp')?.value.trim();
  if(!name){alert('Bitte Namen eingeben');return;}
  _chatName=name;
  localStorage.setItem('chatName',name);
  render();
};

window.sendChatMsg = async function() {
  const text=document.getElementById('chat-inp')?.value.trim();
  if(!text||!_chatName) return;
  await push(ref(db,'chat'),{name:_chatName,text,ts:Date.now()});
  document.getElementById('chat-inp').value='';
};

window.sendKuhMsg = async function() {
  const nr=document.getElementById('chat-kuh-inp')?.value.trim();
  if(!nr||!_chatName) return;
  const k=Object.values(kuehe).find(k=>k.nr===nr);
  const text=k?`Kuh ${k.name||''} #${nr} gefunden ✓`:`#${nr} gefunden ✓`;
  await push(ref(db,'chat'),{name:_chatName,text,kuhNr:nr,ts:Date.now()});
  document.getElementById('chat-kuh-inp').value='';
};

window.sendFotoMsg = async function(input) {
  if(!input.files[0]||!_chatName) return;
  const file=input.files[0];
  if(file.size>800000){alert('Foto zu groß – bitte unter 800KB');return;}
  const reader=new FileReader();
  reader.onload=async function(e){
    await push(ref(db,'chat'),{name:_chatName,foto:e.target.result,ts:Date.now()});
  };
  reader.readAsDataURL(file);
};

window.clearChat = async function() {
  await remove(ref(db,'chat'));
};


// Ripple effect on buttons
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.btn-primary,.btn-secondary,.list-card,.stat-card');
  if(!btn || btn.classList.contains('no-ripple')) return;
  const rect = btn.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const ripple = document.createElement('span');
  ripple.style.cssText = `position:absolute;border-radius:50%;background:rgba(255,255,255,.15);transform:scale(0);animation:ripple .4s ease;left:${x-15}px;top:${y-15}px;width:30px;height:30px;pointer-events:none;z-index:0`;
  btn.style.position = btn.style.position || 'relative';
  btn.style.overflow = 'hidden';
  btn.appendChild(ripple);
  setTimeout(()=>ripple.remove(), 420);
});

// ══════════════════════════════════════════════════════════════
//  BAUERNMENÜ
// ══════════════════════════════════════════════════════════════
function renderBauernMenu() {
  const liste = Object.entries(bauern).sort((a,b)=>a[1].name?.localeCompare(b[1].name));
  return `
    <div class="page-header"><h2>👥 Bauern</h2><button class="btn-primary" onclick="showBauerForm()">+ Bauer</button></div>
    <div class="card-list">
      ${liste.length ? liste.map(([id,b])=>{
        const kueheList = Object.values(kuehe).filter(k=>k.bauer===b.name);
        return `<div class="list-card" onclick="showBauerDetailPage('${id}')">
          <div class="list-card-left">
            <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--gold2),var(--bg3));display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">👤</div>
            <div>
              <div class="list-card-title">${b.name}</div>
              <div class="list-card-sub">${kueheList.length} Kühe ${b.betrieb?'· LFBIS: '+b.betrieb:''} ${b.tel?'· 📞 '+b.tel:''}</div>
            </div>
          </div>
          <span class="chevron">›</span>
        </div>`;
      }).join('') : `<div class="empty-state">Noch keine Bauern – jetzt hinzufügen</div>`}
    </div>
    <div id="bauer-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>Bauer erfassen</h3><button class="close-btn" onclick="closeForm('bauer-overlay')">✕</button></div>
        <div class="form-body">
          <input id="ba-name" class="inp" placeholder="Name *" />
          <input id="ba-betrieb" class="inp" placeholder="LFBIS-Nummer" />
          <input id="ba-tel" class="inp" placeholder="Telefon" inputmode="tel" />
          <input id="ba-email" class="inp" placeholder="E-Mail" inputmode="email" />
          <input id="ba-adresse" class="inp" placeholder="Adresse" />
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('bauer-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveBauer()">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.showBauerDetailPage = function(id) {
  window._bauerDetailId = id;
  currentView = 'bauer_detail';
  render();
};

function renderBauerDetail() {
  const id = window._bauerDetailId;
  const b = bauern[id];
  if(!b) return '<div class="empty-state">Nicht gefunden</div>';
  const kueheList = Object.entries(kuehe).filter(([,k])=>k.bauer===b.name).sort((a,b2)=>parseInt(a[1].nr)-parseInt(b2[1].nr));
  const bListe = Object.entries(behandlungen).filter(([,beh])=>kueheList.some(([kid])=>kid===beh.kuhId)).sort((a,b2)=>b2[1].datum-a[1].datum).slice(0,5);
  const bsListe = Object.entries(besamungen).filter(([,bs])=>kueheList.some(([kid])=>kid===bs.kuhId)&&bs.status==='tragend');
  const milchGesamt = Object.values(milchEintraege).reduce((s,m)=>s+(m.gesamt||0),0);
  const aktivBehandlungen = Object.values(behandlungen).filter(beh=>kueheList.some(([kid])=>kid===beh.kuhId)&&beh.aktiv).length;
  
  return `
    <div class="page-header">
      <button class="back-btn" onclick="navigate('bauern_menu')">‹ Bauern</button>
      <div style="display:flex;gap:.5rem">
        <button class="btn-ghost" onclick="editBauer('${id}')">✎</button>
        <button class="btn-xs-danger" onclick="deleteBauer('${id}')">Löschen</button>
      </div>
    </div>
    
    <!-- Hero -->
    <div style="text-align:center;padding:1rem 0 1.2rem">
      <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--gold2),var(--bg3));display:flex;align-items:center;justify-content:center;font-size:2rem;margin:0 auto .5rem;border:2px solid var(--gold2)">👤</div>
      <div style="font-size:1.5rem;color:var(--gold);font-weight:bold">${b.name}</div>
      ${b.betrieb?`<div style="font-size:.8rem;color:var(--text3)">LFBIS: ${b.betrieb}</div>`:''}
      ${b.adresse?`<div style="font-size:.8rem;color:var(--text3)">${b.adresse}</div>`:''}
      <div style="display:flex;justify-content:center;gap:.5rem;margin-top:.5rem;flex-wrap:wrap">
        ${b.tel?`<a href="tel:${b.tel}" class="btn-xs" style="text-decoration:none">📞 ${b.tel}</a>`:''}
        ${b.email?`<a href="mailto:${b.email}" class="btn-xs" style="text-decoration:none">✉ ${b.email}</a>`:''}
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:1rem">
      <div class="stat-card"><div class="stat-icon">🐄</div><div class="stat-num">${kueheList.length}</div><div class="stat-label">Kühe</div></div>
      <div class="stat-card ${aktivBehandlungen?'stat-warn':''}"><div class="stat-icon">⚕</div><div class="stat-num">${aktivBehandlungen}</div><div class="stat-label">Behandlung</div></div>
      <div class="stat-card"><div class="stat-icon">🐮</div><div class="stat-num">${bsListe.length}</div><div class="stat-label">Trächtig</div></div>
    </div>

    <!-- Kühe -->
    <div class="section-title">Kühe (${kueheList.length})</div>
    <div class="card-list" style="margin-bottom:.8rem">
      ${kueheList.map(([kid,k])=>`
        <div class="list-card list-card-sm" onclick="showKuhDetail('${kid}')">
          <span class="nr-badge">#${k.nr}</span>
          <span class="list-card-title">${k.name||'–'}</span>
          <span style="font-size:.72rem;color:var(--text3)">${k.rasse||''} ${k.laktation?'· '+k.laktation:''}</span>
          ${Object.values(behandlungen).some(beh=>beh.kuhId===kid&&beh.aktiv)?'<span class="tag tag-red">⚕</span>':''}
          <span class="chevron">›</span>
        </div>`).join('')||'<div class="empty-state">Keine Kühe</div>'}
    </div>

    <!-- Aktive Behandlungen -->
    ${bListe.length?`
    <div class="section-title">Letzte Behandlungen</div>
    ${bListe.map(([bid,beh])=>{const k=kuehe[beh.kuhId];return`<div class="history-card">
      <div class="history-top"><span class="history-date">${new Date(beh.datum).toLocaleDateString('de-AT')}</span>${beh.aktiv?'<span class="tag tag-red">aktiv</span>':''}</div>
      <div class="history-title">${beh.diagnose||beh.medikament||'–'} <span style="font-size:.75rem;color:var(--text3)">· #${k?.nr||''} ${k?.name||''}</span></div>
      ${beh.medikament?`<div class="history-sub">${beh.medikament}${beh.dosis?' · '+beh.dosis:''}</div>`:''}
    </div>`;}).join('')}`:''}

    <!-- Trächtige Kühe -->
    ${bsListe.length?`
    <div class="section-title">Trächtige Kühe</div>
    ${bsListe.map(([,bs])=>{const k=kuehe[bs.kuhId];return`<div class="history-card">
      <div class="history-title">#${k?.nr||''} ${k?.name||''} <span class="tag tag-green">Trächtig</span></div>
      ${bs.erwartetGeburt?`<div class="history-sub">Geburt erw.: ${new Date(bs.erwartetGeburt).toLocaleDateString('de-AT')}</div>`:''}
    </div>`;}).join('')}`:''}

    <!-- Bauer-Bearbeiten Overlay (wird direkt hier eingebettet) -->
    <div id="bauer-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>Bauer bearbeiten</h3><button class="close-btn" onclick="closeForm('bauer-overlay')">✕</button></div>
        <div class="form-body">
          <input id="ba-name" class="inp" placeholder="Name *" value="${b.name||''}" />
          <input id="ba-betrieb" class="inp" placeholder="LFBIS-Nr / Betrieb" value="${b.betrieb||''}" />
          <input id="ba-tel" class="inp" type="tel" placeholder="Telefon" value="${b.tel||''}" />
          <input id="ba-email" class="inp" type="email" placeholder="E-Mail" value="${b.email||''}" />
          <input id="ba-adresse" class="inp" placeholder="Adresse / Ort" value="${b.adresse||''}" />
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('bauer-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveBauer()">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.editBauer = function(id) {
  const b = bauern[id];
  if(!b) return;
  window._editBauerId = id;
  // Overlay öffnen (Werte bereits im Template vorausgefüllt)
  const ov = document.getElementById('bauer-overlay');
  if(ov) {
    ov.style.display = 'flex';
  } else {
    // Fallback: zur Bauernliste navigieren und dort öffnen
    navigate('bauern_menu');
    setTimeout(()=>{ window._editBauerId=id; showBauerForm(); }, 200);
  }
};

// Override saveBauer to support edit
const _origSaveBauer = window.saveBauer;
window.saveBauer = async function() {
  const name=document.getElementById('ba-name')?.value.trim();
  if(!name){alert('Name Pflicht');return;}
  const data={name,betrieb:document.getElementById('ba-betrieb')?.value.trim()||'',tel:document.getElementById('ba-tel')?.value.trim()||'',email:document.getElementById('ba-email')?.value.trim()||'',adresse:document.getElementById('ba-adresse')?.value?.trim()||''};
  if(window._editBauerId){
    await update(ref(db,'bauern/'+window._editBauerId),data);
    window._editBauerId=null;
  } else {
    await push(ref(db,'bauern'),data);
  }
  window.showSaveToast&&showSaveToast('Bauer gespeichert');
  closeForm('bauer-overlay');
};

// ══════════════════════════════════════════════════════════════
//  KRAFTFUTTER
// ══════════════════════════════════════════════════════════════
function renderKraftfutter() {
  const heute = Date.now();
  const kueheList = Object.entries(kuehe).sort((a,b)=>parseInt(a[1].nr)-parseInt(b[1].nr));
  const gruppenListe = [...new Set(kueheList.map(([,k])=>k.gruppe).filter(Boolean))].sort();

  // KF-Einstellungen aus Firebase / localStorage
  const kfEinstell = window._kfEinstell || {};
  const standardKg  = parseFloat(kfEinstell.standardKg  || localStorage.getItem('kf_standardKg')  || 0);
  const vorratKg    = parseFloat(kfEinstell.vorratKg    || localStorage.getItem('kf_vorratKg')    || 0);
  const aktivGruppen = JSON.parse(localStorage.getItem('kf_aktivGruppen') || '[]');

  // Extra-KF pro Kuh
  const kfProKuh = {};
  Object.entries(kraftfutter).forEach(([id,kf]) => {
    if(!kfProKuh[kf.kuhId]) kfProKuh[kf.kuhId] = [];
    kfProKuh[kf.kuhId].push({...kf, id});
  });

  // Kühe die KF bekommen (Gruppe aktiv ODER alle wenn keine Gruppe gewählt)
  const kueheKfBasis = kueheList.filter(([,k]) =>
    aktivGruppen.length === 0 ? true : aktivGruppen.includes(k.gruppe||'')
  );
  const anzahlKueheBasis = kueheKfBasis.length;

  // Tagesverbrauch berechnen
  const basisVerbrauch = anzahlKueheBasis * standardKg;
  const extraVerbrauch = kueheList.reduce((sum,[id]) => {
    const ext = (kfProKuh[id]||[]).slice().sort((a,b)=>b.datum-a.datum)[0];
    return sum + (ext ? parseFloat(ext.menge)||0 : 0);
  }, 0);
  const gesamtVerbrauchTag = basisVerbrauch + extraVerbrauch;
  const tageReicht = (vorratKg > 0 && gesamtVerbrauchTag > 0)
    ? Math.floor(vorratKg / gesamtVerbrauchTag) : null;
  const reichBisDatum = tageReicht !== null
    ? new Date(heute + tageReicht * 86400000).toLocaleDateString('de-AT', {day:'numeric',month:'long'})
    : null;

  // Ampelfarbe Vorrat
  const vorratFarbe = tageReicht === null ? 'var(--text3)'
    : tageReicht < 3 ? 'var(--red)'
    : tageReicht < 7 ? 'var(--orange)'
    : 'var(--green)';

  // Milch-Ø letzte 14 Tage pro Kuh
  const tagesMilch = {};
  Object.values(milchEintraege).forEach(e => {
    if(e.prokuh) Object.entries(e.prokuh).forEach(([kid,l]) => {
      if(!tagesMilch[kid]) tagesMilch[kid] = [];
      tagesMilch[kid].push(parseFloat(l)||0);
    });
  });
  const milchSchnitt = {};
  Object.entries(tagesMilch).forEach(([kid,werte]) => {
    milchSchnitt[kid] = werte.length ? werte.reduce((a,b)=>a+b,0)/werte.length : 0;
  });

  return `
    <div class="page-header"><h2>🌾 Kraftfutter</h2>
      <button class="btn-primary" onclick="showKraftfutterForm()">+ Extra-KF</button>
    </div>

    <!-- ── VORRAT ── -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:.8rem;margin-bottom:.7rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <div style="font-size:.7rem;font-weight:700;color:var(--text3);letter-spacing:.06em">📦 VORRAT & VERBRAUCH</div>
        <button class="btn-xs" onclick="showKfVorratForm()">✎ Bearbeiten</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:.5rem">
        <div style="background:var(--bg2);border-radius:10px;padding:.6rem;text-align:center">
          <div style="font-size:1.4rem;font-weight:800;color:${vorratFarbe}">${vorratKg>0?vorratKg+'kg':'–'}</div>
          <div style="font-size:.62rem;color:var(--text3)">Aktueller Vorrat</div>
        </div>
        <div style="background:var(--bg2);border-radius:10px;padding:.6rem;text-align:center">
          <div style="font-size:1.4rem;font-weight:800;color:var(--gold)">${gesamtVerbrauchTag>0?Math.round(gesamtVerbrauchTag*10)/10+'kg/T':'–'}</div>
          <div style="font-size:.62rem;color:var(--text3)">Tagesverbrauch</div>
        </div>
      </div>
      ${tageReicht !== null ? `
      <div style="background:${tageReicht<3?'rgba(212,60,60,.1)':tageReicht<7?'rgba(212,132,75,.1)':'rgba(77,184,78,.08)'};border:1px solid ${vorratFarbe}44;border-radius:8px;padding:.5rem .8rem;font-size:.8rem">
        <b style="color:${vorratFarbe}">${tageReicht<3?'⚠ ':tageReicht<7?'⚠ ':'✓ '}Reicht noch ${tageReicht} Tage</b>
        ${reichBisDatum?`<span style="color:var(--text3);font-size:.72rem"> · bis ca. ${reichBisDatum}</span>`:''}
        ${tageReicht<7?`<div style="font-size:.7rem;color:${vorratFarbe};margin-top:2px">Jetzt Kraftfutter bestellen!</div>`:''}
      </div>` : `<div style="font-size:.75rem;color:var(--text3)">Vorrat und Standardmenge eintragen um Reichweite zu berechnen.</div>`}
    </div>

    <!-- ── LIEFERUNGEN ── -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem">
      <div class="section-label">📥 LIEFERUNGEN</div>
      <button class="btn-xs" onclick="showKfLieferungForm()">+ Lieferung</button>
    </div>
    ${window._kfLieferungen && Object.keys(window._kfLieferungen).length ? `
    <div class="card-list" style="margin-bottom:.7rem">
      ${Object.entries(window._kfLieferungen||{}).sort((a,b)=>b[1].datum-a[1].datum).slice(0,5).map(([lid,l])=>`
        <div class="list-card" style="padding:.45rem .7rem">
          <div class="list-card-left"><div>
            <div class="list-card-title" style="font-size:.82rem">${new Date(l.datum).toLocaleDateString('de-AT')} · ${l.kg} kg</div>
            ${l.notiz?`<div class="list-card-sub">${l.notiz}</div>`:''}
          </div></div>
          <button class="btn-xs-danger" onclick="deleteKfLieferung('${lid}')">✕</button>
        </div>`).join('')}
    </div>` : `<div style="font-size:.75rem;color:var(--text3);margin-bottom:.7rem">Noch keine Lieferungen eingetragen.</div>`}

    <!-- ── STANDARDMENGE & GRUPPEN ── -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:.7rem;margin-bottom:.7rem">
      <div style="font-size:.7rem;font-weight:700;color:var(--text3);letter-spacing:.06em;margin-bottom:.5rem">⚙ STANDARD-VERTEILUNG</div>
      <div class="info-row"><span>Standardmenge</span><b style="color:var(--gold)">${standardKg>0?standardKg+' kg/Kuh/Tag':'Nicht gesetzt'}</b></div>
      <div class="info-row"><span>Kühe gesamt</span><b>${kueheList.length}</b></div>
      <div class="info-row"><span>Kühe mit KF</span><b style="color:var(--green)">${anzahlKueheBasis}</b></div>
      ${gruppenListe.length ? `
      <div class="inp-label" style="margin-top:.4rem">Aktive Gruppen (leer = alle)</div>
      <div style="display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.3rem">
        ${gruppenListe.map(g=>`
          <button class="filter-chip ${aktivGruppen.includes(g)?'active':''}" data-gruppe="${g}"
            onclick="kfToggleGruppe(this)">${g}</button>`).join('')}
      </div>` : ''}
    </div>

    <!-- ── EMPFEHLUNGEN (Milchleistung-basiert) ── -->
    ${Object.keys(milchSchnitt).length ? `
    <div style="font-size:.7rem;font-weight:700;color:var(--text3);letter-spacing:.06em;margin-bottom:.4rem">💡 KF-EMPFEHLUNG (0.3kg pro L über 10L)</div>
    <div class="card-list" style="margin-bottom:.7rem">
      ${kueheList.filter(([id])=>milchSchnitt[id]>0).map(([id,k])=>{
        const schnitt = Math.round(milchSchnitt[id]*10)/10;
        const empfohlen = Math.max(0, Math.round(((schnitt-10)*0.3)*10)/10);
        const aktuell = standardKg + ((kfProKuh[id]||[]).slice().sort((a,b)=>b.datum-a.datum)[0]?.menge||0);
        const diff = Math.round((empfohlen - aktuell)*10)/10;
        const diffColor = diff > 0.5 ? 'var(--orange)' : diff < -0.5 ? 'var(--blue)' : 'var(--green)';
        return `<div class="list-card" style="padding:.4rem .7rem">
          <div class="list-card-left">
            <span class="nr-badge" style="font-size:.6rem">#${k.nr}</span>
            <div>
              <div style="font-size:.8rem;font-weight:600">${k.name||'–'}</div>
              <div style="font-size:.68rem;color:var(--text3)">Ø ${schnitt}L/Tag · aktuell ${aktuell}kg KF</div>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:.85rem;font-weight:700;color:${empfohlen>0?'var(--gold)':'var(--text3)'}">${empfohlen>0?empfohlen+'kg':'< 10L'}</div>
            ${diff!==0?`<div style="font-size:.62rem;color:${diffColor}">${diff>0?'+':''}${diff}kg</div>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}

    <!-- ── EXTRA-KF PRO KUH ── -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem">
      <div class="section-label">⭐ EXTRA-KF PRO KUH</div>
    </div>
    <div class="card-list" style="margin-bottom:.7rem">
      ${kueheList.filter(([id])=>kfProKuh[id]?.length).map(([id,k])=>{
        const eintraege = (kfProKuh[id]||[]).sort((a,b)=>b.datum-a.datum);
        const aktiv = eintraege[0];
        const bisDatum = saisonInfo?.abtriebtDatum || heute;
        const tage = Math.max(0, Math.floor((bisDatum - aktiv.datum) / 86400000));
        return `<div class="list-card">
          <div class="list-card-left">
            <span class="nr-badge">#${k.nr}</span>
            <div>
              <div class="list-card-title">${k.name||'–'}</div>
              <div class="list-card-sub">seit ${new Date(aktiv.datum).toLocaleDateString('de-AT')} · +${aktiv.menge} kg/Tag extra</div>
              ${aktiv.notiz?`<div class="list-card-sub">${aktiv.notiz}</div>`:''}
            </div>
          </div>
          <div class="list-card-right">
            <div style="text-align:right">
              <div style="color:var(--gold);font-weight:bold">${tage}d</div>
              <div style="font-size:.65rem;color:var(--text3)">${Math.round(tage*aktiv.menge*10)/10}kg</div>
            </div>
            <button class="btn-xs-danger" onclick="deleteKraftfutter('${aktiv.id}','${id}')">✕</button>
          </div>
        </div>`;
      }).join('')||`<div class="empty-state" style="padding:.6rem">Kein Extra-Kraftfutter</div>`}
    </div>

    <!-- Kühe ohne Extra-KF -->
    ${kueheList.filter(([id])=>!kfProKuh[id]?.length).length ? `
    <div style="font-size:.7rem;color:var(--text3);margin-bottom:.3rem">Kuh mit Extra-KF hinzufügen:</div>
    <div style="display:flex;flex-wrap:wrap;gap:.3rem;margin-bottom:.8rem">
      ${kueheList.filter(([id])=>!kfProKuh[id]?.length).map(([id,k])=>`
        <button class="kuh-chip" onclick="showKraftfutterForm('${id}')">
          <span class="chip-nr">#${k.nr}</span>${k.name?`<span class="chip-kuh">${k.name}</span>`:''}
        </button>`).join('')}
    </div>` : ''}

    <!-- ── FORMULARE ── -->
    <!-- Vorrat/Standard Form -->
    <div id="kf-vorrat-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>⚙ KF Einstellungen</h3><button class="close-btn" onclick="closeForm('kf-vorrat-overlay')">✕</button></div>
        <div class="form-body">
          <label class="inp-label">📦 Aktueller Vorrat (kg)</label>
          <input id="kf-vorrat-kg" class="inp" type="number" step="0.5" inputmode="decimal" placeholder="z.B. 500" value="${vorratKg||''}" />
          <label class="inp-label">Standardmenge pro Kuh pro Tag (kg)</label>
          <input id="kf-standard-kg" class="inp" type="number" step="0.1" inputmode="decimal" placeholder="z.B. 2.0" value="${standardKg||''}" />
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('kf-vorrat-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveKfEinstell()">Speichern</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Lieferung Form -->
    <div id="kf-lieferung-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>📥 Lieferung erfassen</h3><button class="close-btn" onclick="closeForm('kf-lieferung-overlay')">✕</button></div>
        <div class="form-body">
          <label class="inp-label">Menge (kg) *</label>
          <input id="kfl-kg" class="inp" type="number" step="10" inputmode="decimal" placeholder="z.B. 1000" />
          <label class="inp-label">Datum</label>
          <input id="kfl-datum" class="inp" type="date" value="${isoDate(new Date())}" />
          <input id="kfl-notiz" class="inp" placeholder="Notiz (z.B. Lieferant, Sorte)" />
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('kf-lieferung-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveKfLieferung()">Speichern</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Extra-KF Form -->
    <div id="kf-overlay" class="form-overlay" style="display:none">
      <div class="form-sheet">
        <div class="form-header"><h3>⭐ Extra-Kraftfutter</h3><button class="close-btn" onclick="closeForm('kf-overlay')">✕</button></div>
        <div class="form-body">
          <select id="kf-kuh" class="inp">
            <option value="">Kuh wählen *</option>
            ${kueheList.map(([id,k])=>`<option value="${id}">#${k.nr} ${k.name||''}</option>`).join('')}
          </select>
          <label class="inp-label">Extramenge pro Tag (kg)</label>
          <input id="kf-menge" class="inp" type="number" step="0.1" inputmode="decimal" placeholder="z.B. 1.5" />
          <label class="inp-label">Ab wann</label>
          <input id="kf-datum" class="inp" type="date" value="${isoDate(new Date())}" />
          <textarea id="kf-notiz" class="inp" rows="2" placeholder="Grund / Futtermittel"></textarea>
          <div class="form-actions">
            <button class="btn-secondary" onclick="closeForm('kf-overlay')">Abbrechen</button>
            <button class="btn-primary" onclick="saveKraftfutter()">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.showKlauenForm = function(kuhId) {
  const ov = document.getElementById('klauen-overlay');
  if(!ov){return;}
  document.getElementById('kl-kuh-id').value = kuhId;
  document.getElementById('kl-datum').value = isoDate(new Date());
  document.getElementById('kl-klauenpfleger').value = '';
  document.getElementById('kl-befund').value = '';
  document.getElementById('kl-behandlung').value = '';
  document.getElementById('kl-naechster').value = '';
  document.getElementById('kl-notiz').value = '';
  document.getElementById('kl-foto-data').value = '';
  document.getElementById('kl-foto-preview').style.display = 'none';
  ov.style.display = 'flex';
};

window.klauenFotoGewaehlt = function(input) {
  const file = input.files?.[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    // Bild komprimieren
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const max = 800;
      const scale = Math.min(1, max/Math.max(img.width,img.height));
      canvas.width = img.width*scale; canvas.height = img.height*scale;
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      const data = canvas.toDataURL('image/jpeg',0.75);
      document.getElementById('kl-foto-data').value = data;
      document.getElementById('kl-foto-img').src = data;
      document.getElementById('kl-foto-preview').style.display = 'block';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

window.saveKlauen = async function() {
  const kuhId = document.getElementById('kl-kuh-id')?.value;
  const datum = document.getElementById('kl-datum')?.value;
  if(!datum){alert('Datum Pflicht');return;}
  const data = {
    kuhId,
    datum: new Date(datum+'T12:00').getTime(),
    klauenpfleger: document.getElementById('kl-klauenpfleger')?.value.trim()||'',
    befund:    document.getElementById('kl-befund')?.value.trim()||'',
    behandlung:document.getElementById('kl-behandlung')?.value.trim()||'',
    naechsterTermin: document.getElementById('kl-naechster')?.value||'',
    notiz:     document.getElementById('kl-notiz')?.value.trim()||'',
    fotoData:  document.getElementById('kl-foto-data')?.value||null,
    createdAt: Date.now()
  };
  await push(ref(db,'klauenpflege'), data);
  // Nächsten Termin in Kalender eintragen
  if(data.naechsterTermin) {
    const k = kuehe[kuhId];
    await push(ref(db,'kalenderTermine'),{
      titel: 'Klauenpflege: '+(k?'#'+k.nr+' '+(k.name||''):''),
      datum: new Date(data.naechsterTermin+'T12:00').getTime(),
      kategorie:'kontrolle', erledigt:false, createdAt:Date.now()
    });
  }
  closeForm('klauen-overlay');
  showSaveToast&&showSaveToast('Klauenpflege gespeichert');
};

window.deleteKlauen = async function(id) {
  if(confirm('Eintrag löschen?')) await remove(ref(db,'klauenpflege/'+id));
};

window.showKraftfutterForm = function(kuhId) {
  const ov = document.getElementById('kf-overlay');
  if(!ov){navigate('kraftfutter');setTimeout(()=>showKraftfutterForm(kuhId),150);return;}
  if(kuhId) document.getElementById('kf-kuh').value=kuhId;
  ov.style.display='flex';
};

window.showKfVorratForm = function() {
  const ov = document.getElementById('kf-vorrat-overlay');
  if(!ov){navigate('kraftfutter');setTimeout(showKfVorratForm,150);return;}
  ov.style.display='flex';
};

window.showKfLieferungForm = function() {
  const ov = document.getElementById('kf-lieferung-overlay');
  if(!ov){navigate('kraftfutter');setTimeout(showKfLieferungForm,150);return;}
  ov.style.display='flex';
};

window.saveKfEinstell = function() {
  const vorrat  = parseFloat(document.getElementById('kf-vorrat-kg')?.value)||0;
  const standard= parseFloat(document.getElementById('kf-standard-kg')?.value)||0;
  localStorage.setItem('kf_vorratKg',  vorrat);
  localStorage.setItem('kf_standardKg', standard);
  closeForm('kf-vorrat-overlay');
  showSaveToast&&showSaveToast('Einstellungen gespeichert');
  render();
};

window.saveKfLieferung = async function() {
  const kg = parseFloat(document.getElementById('kfl-kg')?.value);
  if(!kg||kg<=0){alert('Menge eingeben');return;}
  const datum = document.getElementById('kfl-datum')?.value;
  await push(ref(db,'kfLieferungen'), {
    kg, datum: new Date(datum+'T12:00').getTime(),
    notiz: document.getElementById('kfl-notiz')?.value.trim()||'',
    createdAt: Date.now()
  });
  // Vorrat erhöhen
  const altVorrat = parseFloat(localStorage.getItem('kf_vorratKg')||'0');
  localStorage.setItem('kf_vorratKg', altVorrat+kg);
  closeForm('kf-lieferung-overlay');
  showSaveToast&&showSaveToast(kg+'kg Kraftfutter geliefert · Vorrat jetzt '+(altVorrat+kg)+'kg');
};

window.deleteKfLieferung = async function(id) {
  if(confirm('Lieferung löschen?')) await remove(ref(db,'kfLieferungen/'+id));
};

window.kfToggleGruppe = function(btn) {
  const gruppe = btn.dataset.gruppe;
  let aktiv = JSON.parse(localStorage.getItem('kf_aktivGruppen')||'[]');
  if(aktiv.includes(gruppe)) aktiv = aktiv.filter(g=>g!==gruppe);
  else aktiv.push(gruppe);
  localStorage.setItem('kf_aktivGruppen', JSON.stringify(aktiv));
  render();
};

window.saveKraftfutter = async function() {
  const kuhId = document.getElementById('kf-kuh')?.value;
  const menge = parseFloat(document.getElementById('kf-menge')?.value);
  const datum = document.getElementById('kf-datum')?.value;
  if(!kuhId){alert('Kuh wählen');return;}
  if(!menge||menge<=0){alert('Menge eingeben');return;}
  await push(ref(db,'kraftfutter'),{kuhId,datum:new Date(datum+'T12:00').getTime(),menge,notiz:document.getElementById('kf-notiz')?.value.trim()||'',createdAt:Date.now()});
  closeForm('kf-overlay');
};

window.deleteKraftfutter = async function(id, kuhId) {
  if(!id) {
    const entry = Object.entries(kraftfutter).find(([,kf])=>kf.kuhId===kuhId);
    if(entry) id = entry[0];
  }
  if(id && confirm('Eintrag löschen?')) await remove(ref(db,'kraftfutter/'+id));
};

// ══════════════════════════════════════════════════════════════
//  HIRTEN-ANIMATION bei Zählung
// ══════════════════════════════════════════════════════════════
let _zaehlungAnimShown = false;
window._showZaehlungAnim = function() {
  if(_zaehlungAnimShown) return;
  _zaehlungAnimShown = true;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:500;display:flex;flex-direction:column;align-items:center;justify-content:center;animation:fadeIn .3s ease';
  overlay.innerHTML = `
    
    <div style="font-size:.9rem;color:var(--text3);margin-bottom:1rem;animation:fadeInAnim .5s ease">Zählung wird gestartet…</div>
    <div class="hirte-scene">
      <div class="kuh">🐄</div>
      <div class="hirte">🧑‍🌾</div>
      <div class="grass"></div>
    </div>
    <div style="font-size:1.8rem;margin-top:1rem">✓</div>
  `;
  document.body.appendChild(overlay);
  setTimeout(()=>{
    overlay.style.animation='fadeOutAnim .4s ease forwards';
    setTimeout(()=>{overlay.remove();_zaehlungAnimShown=false;},400);
  }, 2000);
};

// Hook into navigate for zaehlung
const _origNavigate = window.navigate;
window.navigate = function(view) {
  if(view==='zaehlung' && currentView!=='zaehlung') {
    window._showZaehlungAnim();
    setTimeout(()=>_origNavigate(view), 300);
    return;
  }
  _origNavigate(view);
};


window.saveMilchWarnSchwelle = function() {
  const val = parseInt(document.getElementById('einst-milch-warn')?.value)||50;
  const clamped = Math.min(90, Math.max(10, val));
  localStorage.setItem('milchWarnProzent', clamped);
  showSaveToast && showSaveToast('Schwellenwert gespeichert: ±'+clamped+'%');
};

// ── Milch-Warnsystem: Durchschnitt berechnen ──
window.getMilchDurchschnitt = function(kuhId) {
  const eintraege = Object.values(milchEintraege)
    .filter(m => m.prokuh && m.prokuh[kuhId])
    .map(m => parseFloat(m.prokuh[kuhId])||0)
    .filter(v => v > 0)
    .slice(-10); // letzte 10 Einträge
  if(eintraege.length < 2) return null; // nicht genug Daten
  return eintraege.reduce((s,v)=>s+v,0) / eintraege.length;
};

// ── Live-Warnung im Milchformular ──
window.checkMilchWert = function(input, kuhId) {
  const wert = parseFloat((input.value||'').replace(',','.'));
  const warnEl = document.getElementById('milch-warn-'+kuhId);
  if(!warnEl) return;

  if(!wert || wert <= 0) { warnEl.textContent=''; warnEl.style.display='none'; input.style.borderColor=''; return; }

  const kuh = kuehe[kuhId];
  // Trockengestellte ignorieren
  if(kuh?.laktation === 'trocken' || kuh?.laktation === 'trockengestellt') {
    warnEl.textContent=''; warnEl.style.display='none'; input.style.borderColor=''; return;
  }

  const schnitt = window.getMilchDurchschnitt(kuhId);
  if(schnitt === null) { warnEl.textContent=''; warnEl.style.display='none'; return; }

  const prozent = parseInt(localStorage.getItem('milchWarnProzent'))||50;
  const unterGrenze = schnitt * (1 - prozent/100);
  const oberGrenze  = schnitt * (1 + prozent/100);

  if(wert < unterGrenze) {
    warnEl.textContent = '⚠ Ungewöhnlich wenig (Ø '+Math.round(schnitt*10)/10+' L)';
    warnEl.style.color = 'var(--orange)';
    warnEl.style.display = '';
    input.style.borderColor = 'var(--orange)';
  } else if(wert > oberGrenze) {
    warnEl.textContent = '⚠ Ungewöhnlich viel (Ø '+Math.round(schnitt*10)/10+' L)';
    warnEl.style.color = '#4ab8e8';
    warnEl.style.display = '';
    input.style.borderColor = '#4ab8e8';
  } else {
    warnEl.textContent = '';
    warnEl.style.display = 'none';
    input.style.borderColor = '';
  }
};
window.saveAlmName = async function() {
  const name = document.getElementById('einst-almname')?.value.trim();
  if(!name){alert('Almname eingeben');return;}
  await update(ref(db,'saison'), {alm: name});
  showSaveToast&&showSaveToast('Almname gespeichert');
};
window.saveAlmEinstellungen = async function() {
  const alm = document.getElementById('einst-almname')?.value.trim();
  const jahr = parseInt(document.getElementById('einst-almjahr')?.value)||new Date().getFullYear();
  const updates = {};
  if(alm) updates.alm = alm;
  updates.jahr = jahr;
  await update(ref(db,'saison'), updates);
  alert('✓ Gespeichert');
};

window.berechneWartezeiten = function() {
  const datum = document.getElementById('b-datum')?.value;
  if(!datum) return;
  const zeit = document.getElementById('b-behandlung-zeit')?.value || 'morgen';

  function calcEnde(tage, basisDatum, basisZeit) {
    if(!tage || tage <= 0) return null;
    const ganz = Math.floor(tage);
    const halb = (tage % 1) >= 0.4;
    const end = new Date(basisDatum + 'T00:00:00');
    end.setDate(end.getDate() + ganz);
    let stunde;
    if(basisZeit === 'morgen') {
      stunde = halb ? 16 : 3;
    } else {
      if(halb) { end.setDate(end.getDate() + 1); stunde = 3; }
      else { stunde = 16; }
    }
    end.setHours(stunde, 0, 0, 0);
    return end;
  }

  const milchTage = parseFloat(document.getElementById('b-wz-milch-tage')?.value)||0;
  const fleischTage = parseFloat(document.getElementById('b-wz-fleisch-tage')?.value)||0;

  if(milchTage > 0) {
    const end = calcEnde(milchTage, datum, zeit);
    if(end) {
      const el = document.getElementById('b-wz-milch'); if(el) el.value = isoDate(end);
      // Store full timestamp in hidden field
      const ts = document.getElementById('b-wz-milch-ts');
      if(ts) ts.value = end.getTime();
      const hint = document.getElementById('b-wz-milch-hint');
      const slotLabel = end.getHours() < 12 ? 'morgens' : 'abends';
      if(hint) hint.textContent = '(endet ' + slotLabel + ' am ' + end.toLocaleDateString('de-AT',{weekday:'short',day:'numeric',month:'short'}) + ')';
    }
  }
  if(fleischTage > 0) {
    const end = calcEnde(fleischTage, datum, zeit);
    if(end) {
      const el = document.getElementById('b-wz-fleisch'); if(el) el.value = isoDate(end);
      const ts = document.getElementById('b-wz-fleisch-ts');
      if(ts) ts.value = end.getTime();
      const hint = document.getElementById('b-wz-fleisch-hint');
      const slotLabel = end.getHours() < 12 ? 'morgens' : 'abends';
      if(hint) hint.textContent = '(endet ' + slotLabel + ' am ' + end.toLocaleDateString('de-AT',{weekday:'short',day:'numeric',month:'short'}) + ')';
    }
  }
};

// ══════════════════════════════════════════════════════════════
//  MEDIKAMENT AUTOCOMPLETE
// ══════════════════════════════════════════════════════════════
window.checkFieber = function(val) {
  const temp = parseFloat(val);
  const el = document.getElementById('b-fieber-indikator');
  if(!el) return;
  if(!temp || isNaN(temp)) { el.style.display='none'; return; }
  el.style.display='block';
  if(temp > 39.5) {
    el.style.color='var(--red)';
    el.textContent='🌡 Fieber! (>39.5°C)';
  } else if(temp > 38.5) {
    el.style.color='var(--orange)';
    el.textContent='⚠ Erhöht (38.5–39.5°C)';
  } else if(temp >= 37.5) {
    el.style.color='var(--green)';
    el.textContent='✓ Normal (37.5–38.5°C)';
  } else {
    el.style.color='var(--blue)';
    el.textContent='❄ Unterkühlt (<37.5°C)';
  }
};

// Fieberkurven-Canvas zeichnen
window.drawFieberChart = function() {
  const canvas = document.getElementById('b-fieber-canvas');
  if(!canvas) return;
  const editId = document.getElementById('b-behandlung-id')?.value;
  if(!editId) return;
  const beh = behandlungen[editId];
  const verlauf = beh?.temperaturVerlauf;
  if(!verlauf || Object.keys(verlauf).length < 2) return;

  const punkte = Object.values(verlauf)
    .sort((a,b)=>a.ts-b.ts)
    .map(v=>({t:v.temp, ts:v.ts, zeit:v.zeit||''}));

  const dpr = window.devicePixelRatio||1;
  const W = canvas.offsetWidth, H = 80;
  canvas.width = W*dpr; canvas.height = H*dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr,dpr);

  const pad = {t:8,r:8,b:8,l:30};
  const gW=W-pad.l-pad.r, gH=H-pad.t-pad.b;
  const temps = punkte.map(p=>p.t);
  const minT = Math.min(37,Math.min(...temps)-0.2);
  const maxT = Math.max(41,Math.max(...temps)+0.2);
  const range = maxT-minT;

  function px(t) { return pad.l + (punkte.indexOf(t)/(punkte.length-1))*gW; }
  function py(temp) { return pad.t + gH - ((temp-minT)/range)*gH; }

  // Fieber-Grenzlinien
  [[39.5,'var(--red)'],[38.5,'var(--orange)']].forEach(([t,c])=>{
    const y = py(t);
    ctx.strokeStyle=c; ctx.lineWidth=1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+gW,y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle=c; ctx.font='8px sans-serif'; ctx.textAlign='right';
    ctx.fillText(t+'°',pad.l-2,y+3);
  });

  // Gradient-Area
  const grad=ctx.createLinearGradient(0,pad.t,0,pad.t+gH);
  grad.addColorStop(0,'rgba(212,60,60,.3)'); grad.addColorStop(1,'rgba(212,60,60,.02)');
  ctx.beginPath();
  ctx.moveTo(pad.l,pad.t+gH);
  punkte.forEach((p,i)=>ctx.lineTo(pad.l+i*(gW/(punkte.length-1)),py(p.t)));
  ctx.lineTo(pad.l+gW,pad.t+gH);
  ctx.closePath(); ctx.fillStyle=grad; ctx.fill();

  // Linie
  ctx.beginPath();
  punkte.forEach((p,i)=>{
    const x=pad.l+i*(gW/(punkte.length-1)), y=py(p.t);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.strokeStyle=Math.max(...temps)>39.5?'#d44b4b':'#d4844b';
  ctx.lineWidth=2; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.stroke();

  // Punkte
  punkte.forEach((p,i)=>{
    const x=pad.l+i*(gW/(punkte.length-1)), y=py(p.t);
    ctx.beginPath(); ctx.arc(x,y,3.5,0,Math.PI*2);
    ctx.fillStyle=p.t>39.5?'#d44b4b':p.t>38.5?'#d4844b':'#4db84e'; ctx.fill();
  });
};

window.selectMedikament = function(nameOrEl) {
  const name = (typeof nameOrEl === 'string') ? nameOrEl : nameOrEl?.dataset?.med || '';
  if(!name) return;
  const inp = document.getElementById('b-medikament');
  if(inp) {
    inp.value = name;
    inp.style.borderColor = 'var(--green)';
    setTimeout(()=>{ inp.style.borderColor=''; }, 800);
  }
  hideMedDropdown();
  // Auto-fill WZ and Dosis from last use of this medication
  const letzteBeh = Object.values(behandlungen)
    .filter(b=>b.medikament===name)
    .sort((a,b)=>b.datum-a.datum)[0];
  if(letzteBeh) {
    const dosis = document.getElementById('b-dosis');
    const wzM   = document.getElementById('b-wz-milch-tage');
    const wzF   = document.getElementById('b-wz-fleisch-tage');
    if(dosis && !dosis.value && letzteBeh.dosis) {
      dosis.value = letzteBeh.dosis;
      dosis.style.borderColor = 'var(--gold)';
      setTimeout(()=>{ dosis.style.borderColor=''; }, 1200);
    }
    if(wzM && !wzM.value && letzteBeh.wzMilchTage) {
      wzM.value = letzteBeh.wzMilchTage;
    }
    if(wzF && !wzF.value && letzteBeh.wzFleischTage) {
      wzF.value = letzteBeh.wzFleischTage;
    }
    if(letzteBeh.wzMilchTage || letzteBeh.wzFleischTage) berechneWartezeiten();
  }
};

window.hideMedDropdown = function() {
  const dd = document.getElementById('med-dropdown');
  if(dd) dd.style.display = 'none';
};

window.onMedInput = function(inp) {
  const q = (inp.value||'').toLowerCase().trim();
  const dd = document.getElementById('med-dropdown');
  if(!dd) return;

  // Alle Medikamente aus Firebase, nach Häufigkeit sortiert
  const counts = {};
  Object.values(behandlungen).forEach(b=>{
    if(b.medikament) counts[b.medikament] = (counts[b.medikament]||0)+1;
  });
  const alle = Object.entries(counts)
    .sort((a,b)=>b[1]-a[1])
    .map(([m,c])=>({m,c}));

  // Filtern
  const gefiltert = q
    ? alle.filter(({m})=>m.toLowerCase().includes(q)).slice(0,8)
    : alle.slice(0,8);

  if(!gefiltert.length) { dd.style.display='none'; return; }

  dd.innerHTML = gefiltert.map(({m,c})=>`
    <div onclick="selectMedikament(this.dataset.med)" data-med="${m.replace(/"/g,'&quot;').replace(/'/g,'&#39;')}"
      style="padding:.55rem .8rem;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);transition:background .1s"
      onpointerenter="this.style.background='rgba(212,168,75,.1)'"
      <span style="font-size:.85rem;color:var(--text)">${m.replace(new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi'),'<b style="color:var(--gold)">$1</b>')}</span>
      <span style="font-size:.68rem;color:var(--text3)">${c}×</span>
    </div>`).join('');
  dd.style.display = 'block';
};

