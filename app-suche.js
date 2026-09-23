// ══════════════════════════════════════════════════════════════════════════════
//  GLOBALE SUCHE
//  - Search-Button oben rechts (überall sichtbar)
//  - Overlay mit Live-Suche über: Kühe, Bauern, Behandlungen, Weiden,
//    Sennerei-Produktion, Verkauf, Kraftfutter
//  - Klick auf Ergebnis → springt zum passenden Detail
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '1.0';
  window.SUCHE_VERSION = VERSION;

  window._sucheQuery = '';

  function _esc(s) { return String(s||'').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]); }
  function _hl(text, q) {
    if(!q) return _esc(text);
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return _esc(text).replace(re, '<mark style="background:rgba(212,168,75,.35);color:#fff;padding:1px 3px;border-radius:3px">$1</mark>');
  }
  function _match(txt, q) {
    if(!txt || !q) return false;
    return String(txt).toLowerCase().includes(q.toLowerCase());
  }
  function _dt(ts) {
    if(!ts) return '';
    return new Date(ts).toLocaleDateString('de-AT', {day:'2-digit', month:'2-digit', year:'2-digit'});
  }

  // ── Overlay öffnen ──
  window.hpSuche = function() {
    document.getElementById('sc-overlay')?.remove();
    _injectStyles();
    window._sucheQuery = '';
    const wrap = document.createElement('div');
    wrap.id = 'sc-overlay';
    wrap.innerHTML =
      '<div class="sc-head">' +
        '<div class="sc-input-wrap">' +
          '<span class="sc-icon">🔍</span>' +
          '<input type="text" id="sc-input" placeholder="Kuh, Bauer, Behandlung, Weide, Charge, …" autocomplete="off" oninput="_hpSucheType(this.value)"/>' +
          '<button class="sc-clear" onclick="_hpSucheClear()" style="display:none">✕</button>' +
        '</div>' +
        '<button class="sc-close" onclick="_hpSucheClose()">Schließen</button>' +
      '</div>' +
      '<div class="sc-body" id="sc-results">' +
        '<div class="sc-hint">Tippe was du suchen willst — die Ergebnisse erscheinen live.<br><br>' +
          '<div style="text-align:left;max-width:400px;margin:1rem auto;font-size:.85rem;color:var(--text3);line-height:1.7">' +
            '<div><b style="color:var(--gold)">Beispiele:</b></div>' +
            '<div>🐄 <span style="color:var(--text2)">„Rosa"</span> — findet die Kuh</div>' +
            '<div>👤 <span style="color:var(--text2)">„Kramer"</span> — findet den Bauer</div>' +
            '<div>⚕ <span style="color:var(--text2)">„Mastitis"</span> — findet Behandlungen</div>' +
            '<div>🌿 <span style="color:var(--text2)">„Nord"</span> — findet Weiden</div>' +
            '<div>🧀 <span style="color:var(--text2)">„1208"</span> — findet Chargen</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    setTimeout(() => { try { document.getElementById('sc-input').focus(); } catch(e){} }, 100);
  };

  window._hpSucheType = function(q) {
    window._sucheQuery = q.trim();
    const clr = document.querySelector('#sc-overlay .sc-clear');
    if(clr) clr.style.display = q ? 'block' : 'none';
    _renderResults();
  };
  window._hpSucheClear = function() {
    const inp = document.getElementById('sc-input');
    if(inp) { inp.value = ''; inp.focus(); }
    window._sucheQuery = '';
    _renderResults();
    const clr = document.querySelector('#sc-overlay .sc-clear');
    if(clr) clr.style.display = 'none';
  };
  window._hpSucheClose = function() {
    const ov = document.getElementById('sc-overlay');
    if(!ov) return;
    ov.style.opacity = '0';
    ov.style.transition = 'opacity .15s';
    setTimeout(() => ov.remove(), 180);
  };

  // ── Live-Suche über alle Datenquellen ──
  function _renderResults() {
    const q = window._sucheQuery;
    const target = document.getElementById('sc-results');
    if(!target) return;
    if(!q || q.length < 1) {
      target.innerHTML = _emptyStateHtml();
      return;
    }
    if(q.length < 2) {
      target.innerHTML = '<div class="sc-hint">Bitte mindestens 2 Zeichen eingeben.</div>';
      return;
    }

    const gruppen = [];

    // KÜHE
    const kuehe = window.kuehe || {};
    const kuehTreffer = Object.entries(kuehe).filter(([id, k]) =>
      _match(k.nr, q) || _match(k.name, q) || _match(k.rasse, q) || _match(k.bauer, q) || _match(k.gruppe, q) || _match(k.notiz, q)
    ).slice(0, 12);
    if(kuehTreffer.length) {
      gruppen.push({
        titel: '🐄 Kühe (' + kuehTreffer.length + ')',
        items: kuehTreffer.map(([id, k]) => ({
          icon: '🐄',
          title: '#' + (k.nr || '?') + ' ' + (k.name || '–'),
          sub: (k.rasse || '') + (k.bauer ? ' · ' + k.bauer : '') + (k.gruppe ? ' · Gruppe ' + k.gruppe : ''),
          onclick: `showKuhDetail('${id}')`
        }))
      });
    }

    // BAUERN
    const bauern = window.bauern || {};
    const bauerTreffer = Object.entries(bauern).filter(([id, b]) =>
      _match(b.name, q) || _match(b.betrieb, q) || _match(b.tel, q) || _match(b.email, q) || _match(b.adresse, q)
    ).slice(0, 12);
    if(bauerTreffer.length) {
      gruppen.push({
        titel: '👤 Bauern (' + bauerTreffer.length + ')',
        items: bauerTreffer.map(([id, b]) => ({
          icon: '👤',
          title: b.name || '–',
          sub: (b.betrieb ? 'LFBIS: ' + b.betrieb : '') + (b.tel ? ' · ' + b.tel : ''),
          onclick: `showBauerDetail('${id}')`
        }))
      });
    }

    // BEHANDLUNGEN
    const behandlungen = window.behandlungen || {};
    const behTreffer = Object.entries(behandlungen).filter(([id, b]) => {
      if(_match(b.medikament, q) || _match(b.diagnose, q) || _match(b.notiz, q) || _match(b.tierarzt, q) || _match(b.symptome, q)) return true;
      const kuh = kuehe[b.kuhId];
      return kuh && (_match(kuh.nr, q) || _match(kuh.name, q));
    }).sort((a,b) => (b[1].datum||0)-(a[1].datum||0)).slice(0, 15);
    if(behTreffer.length) {
      gruppen.push({
        titel: '⚕ Behandlungen (' + behTreffer.length + ')',
        items: behTreffer.map(([id, b]) => {
          const kuh = kuehe[b.kuhId] || {};
          return {
            icon: '⚕',
            title: (b.medikament || b.diagnose || 'Behandlung') + (b.aktiv ? ' <span style="color:var(--red);font-size:.7rem;font-weight:700">·AKTIV</span>' : ''),
            sub: '#' + (kuh.nr || '?') + ' ' + (kuh.name || '') + ' · ' + _dt(b.datum),
            onclick: b.kuhId ? `showKuhDetail('${b.kuhId}')` : `navigate('behandlungen')`
          };
        })
      });
    }

    // WEIDEN
    const weiden = window.weiden || {};
    const weiTreffer = Object.entries(weiden).filter(([id, w]) =>
      _match(w.name, q) || _match(w.notiz, q)
    ).slice(0, 10);
    if(weiTreffer.length) {
      gruppen.push({
        titel: '🌿 Weiden (' + weiTreffer.length + ')',
        items: weiTreffer.map(([id, w]) => ({
          icon: '🌿',
          title: w.name || '–',
          sub: w.notiz || 'Weide',
          onclick: `navigate('weide')`
        }))
      });
    }

    // SENNEREI-PRODUKTION (Chargen, Notiz, Datum)
    const prod = window.sennereiProduktion || {};
    const prodTreffer = Object.entries(prod).filter(([id, p]) =>
      _match(p.kaeseCharge, q) || _match(p.butterCharge, q) || _match(p.notiz, q) ||
      _match(p.datum, q) ||
      (p.spezialitaeten || []).some(s => _match(s.name, q) || _match(s.charge, q))
    ).sort((a,b) => (b[1].datumTs||0)-(a[1].datumTs||0)).slice(0, 10);
    if(prodTreffer.length) {
      gruppen.push({
        titel: '🧀 Sennerei-Produktion (' + prodTreffer.length + ')',
        items: prodTreffer.map(([id, p]) => {
          const teile = [];
          if(p.kaeseKg) teile.push('🧀 ' + p.kaeseKg + 'kg');
          if(p.butterKg) teile.push('🧈 ' + p.butterKg + 'kg');
          if(p.kaeseCharge) teile.push('K: ' + p.kaeseCharge);
          if(p.butterCharge) teile.push('B: ' + p.butterCharge);
          return {
            icon: '🧀',
            title: 'Produktion ' + _dt(p.datumTs || Date.parse(p.datum + 'T12:00')),
            sub: teile.join(' · ') || 'Kein Detail',
            onclick: `navigate('sennerei_produktion')`
          };
        })
      });
    }

    // SENNEREI-VERKAUF (Produkte, Notiz)
    const verk = window.sennereiVerkaeufe || {};
    const verkTreffer = Object.entries(verk).filter(([id, v]) =>
      (v.positionen || []).some(p => _match(p.name, q))
    ).sort((a,b) => (b[1].datumTs||0)-(a[1].datumTs||0)).slice(0, 10);
    if(verkTreffer.length) {
      gruppen.push({
        titel: '💰 Verkäufe (' + verkTreffer.length + ')',
        items: verkTreffer.map(([id, v]) => {
          const pos = (v.positionen||[]).map(p => p.name + (p.mengeKg?' '+p.mengeKg+'kg':'')).join(', ');
          return {
            icon: '💰',
            title: (v.summe ? v.summe.toFixed(2).replace('.',',') + ' €' : 'Verkauf'),
            sub: pos + ' · ' + _dt(v.datumTs),
            onclick: `navigate('sennerei_verkauf')`
          };
        })
      });
    }

    // KRAFTFUTTER
    const kf = window.kraftfutter || {};
    const kfTreffer = Object.entries(kf).filter(([id, f]) => {
      if(_match(f.notiz, q) || _match(f.futter, q)) return true;
      const kuh = kuehe[f.kuhId];
      return kuh && (_match(kuh.nr, q) || _match(kuh.name, q));
    }).sort((a,b) => (b[1].datum||0)-(a[1].datum||0)).slice(0, 10);
    if(kfTreffer.length) {
      gruppen.push({
        titel: '🌾 Kraftfutter (' + kfTreffer.length + ')',
        items: kfTreffer.map(([id, f]) => {
          const kuh = kuehe[f.kuhId] || {};
          return {
            icon: '🌾',
            title: (f.futter || 'Kraftfutter') + ' · ' + (f.menge || '') + ' ' + (f.einheit || 'kg'),
            sub: '#' + (kuh.nr || '?') + ' ' + (kuh.name || '') + ' · ' + _dt(f.datum),
            onclick: f.kuhId ? `showKuhDetail('${f.kuhId}')` : `navigate('kraftfutter')`
          };
        })
      });
    }

    // GRUPPEN
    const gr = window.gruppen || {};
    const grTreffer = Object.entries(gr).filter(([id, g]) => _match(g.name, q)).slice(0, 6);
    if(grTreffer.length) {
      gruppen.push({
        titel: '📦 Gruppen (' + grTreffer.length + ')',
        items: grTreffer.map(([id, g]) => ({
          icon: '📦',
          title: g.name || '–',
          sub: (Object.keys(g.mitglieder||{}).length) + ' Kühe',
          onclick: `navigate('gruppen')`
        }))
      });
    }

    // Zusammenbauen
    if(!gruppen.length) {
      target.innerHTML = '<div class="sc-hint" style="color:var(--text3)"><b>Keine Treffer</b> für „' + _esc(q) + '"<br><br>Tipp: kürzeres Wort oder anders schreiben.</div>';
      return;
    }
    let html = '';
    gruppen.forEach(g => {
      html += '<div class="sc-group">' +
        '<div class="sc-group-title">' + g.titel + '</div>' +
        g.items.map(item => `
          <div class="sc-item" onclick="_hpSucheOpen(&quot;${item.onclick.replace(/"/g,'&quot;')}&quot;)">
            <div class="sc-item-icon">${item.icon}</div>
            <div class="sc-item-body">
              <div class="sc-item-title">${_hl(item.title.replace(/<[^>]+>/g,''), q)}${item.title.match(/<span/) ? ' ' + item.title.match(/<span.+?<\/span>/)[0] : ''}</div>
              <div class="sc-item-sub">${_hl(item.sub, q)}</div>
            </div>
            <span class="sc-item-arrow">›</span>
          </div>`).join('') +
      '</div>';
    });
    target.innerHTML = html;
  }

  window._hpSucheOpen = function(callStr) {
    _hpSucheClose();
    setTimeout(() => {
      try { new Function(callStr)(); } catch(e) { console.warn('[Suche] Open fail:', e); }
    }, 200);
  };

  function _emptyStateHtml() {
    return '<div class="sc-hint">Tippe was du suchen willst — die Ergebnisse erscheinen live.<br><br>' +
      '<div style="text-align:left;max-width:400px;margin:1rem auto;font-size:.85rem;color:var(--text3);line-height:1.7">' +
        '<div><b style="color:var(--gold)">Beispiele:</b></div>' +
        '<div>🐄 <span style="color:var(--text2)">„Rosa"</span> — findet die Kuh</div>' +
        '<div>👤 <span style="color:var(--text2)">„Kramer"</span> — findet den Bauer</div>' +
        '<div>⚕ <span style="color:var(--text2)">„Mastitis"</span> — findet Behandlungen</div>' +
        '<div>🌿 <span style="color:var(--text2)">„Nord"</span> — findet Weiden</div>' +
        '<div>🧀 <span style="color:var(--text2)">„1208"</span> — findet Chargen</div>' +
      '</div>' +
    '</div>';
  }

  function _injectStyles() {
    if(document.getElementById('sc-styles')) return;
    const st = document.createElement('style');
    st.id = 'sc-styles';
    st.textContent = `
      #sc-overlay { position:fixed; inset:0; z-index:99600; background:var(--bg,#0c1a09); display:flex; flex-direction:column; animation:sc-in .15s ease; }
      @keyframes sc-in { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      #sc-overlay .sc-head { background:linear-gradient(180deg,#152912,#0c1a09); border-bottom:1px solid rgba(212,168,75,.3); padding:.8rem 1rem; display:flex; gap:.5rem; align-items:center; flex-shrink:0; }
      #sc-overlay .sc-input-wrap { flex:1; display:flex; align-items:center; gap:.4rem; background:rgba(255,255,255,.06); border:1.5px solid rgba(212,168,75,.35); border-radius:12px; padding:.4rem .7rem; transition:border-color .15s; }
      #sc-overlay .sc-input-wrap:focus-within { border-color:var(--gold,#d4a84b); background:rgba(212,168,75,.08); }
      #sc-overlay .sc-icon { font-size:1.15rem; }
      #sc-overlay .sc-input-wrap input { flex:1; background:transparent; border:none; color:var(--text,#eee); padding:.5rem 0; font-size:1rem; outline:none; font-family:inherit; min-width:0; }
      #sc-overlay .sc-clear { background:rgba(255,255,255,.1); color:#fff; border:none; width:26px; height:26px; border-radius:50%; cursor:pointer; font-size:.75rem; padding:0; flex-shrink:0; }
      #sc-overlay .sc-close { background:transparent; color:var(--text3,#888); border:none; padding:.55rem .8rem; font-size:.9rem; cursor:pointer; font-family:inherit; white-space:nowrap; }
      #sc-overlay .sc-close:hover { color:var(--gold,#d4a84b); }

      #sc-overlay .sc-body { flex:1; overflow-y:auto; padding:.8rem 1rem 2rem; }
      #sc-overlay .sc-hint { color:var(--text3,#888); text-align:center; padding:2rem 1rem; font-size:.95rem; line-height:1.5; }
      #sc-overlay .sc-hint b { color:var(--text,#eee); }

      #sc-overlay .sc-group { margin-bottom:1.2rem; }
      #sc-overlay .sc-group-title { font-size:.72rem; letter-spacing:.1em; text-transform:uppercase; color:var(--text3,#888); margin-bottom:.4rem; font-weight:700; padding-left:.2rem; }

      #sc-overlay .sc-item { display:flex; align-items:center; gap:.7rem; padding:.7rem .8rem; background:var(--bg3); border:1px solid var(--border); border-radius:10px; margin-bottom:.35rem; cursor:pointer; transition:all .12s; -webkit-tap-highlight-color:transparent; }
      #sc-overlay .sc-item:active { transform:scale(.98); border-color:var(--gold,#d4a84b); }
      #sc-overlay .sc-item:hover { border-color:var(--gold,#d4a84b); background:rgba(212,168,75,.06); }
      #sc-overlay .sc-item-icon { font-size:1.4rem; line-height:1; flex-shrink:0; }
      #sc-overlay .sc-item-body { flex:1; min-width:0; }
      #sc-overlay .sc-item-title { font-size:.95rem; font-weight:700; color:var(--text,#eee); line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      #sc-overlay .sc-item-sub { font-size:.78rem; color:var(--text3,#888); margin-top:.15rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      #sc-overlay .sc-item-arrow { color:var(--text3,#888); font-size:1.2rem; flex-shrink:0; }
    `;
    document.head.appendChild(st);
  }

  // ── HTML-Snippet für den Search-Button (globales Widget) ──
  window.hpSucheButtonHTML = function(size) {
    size = size || 40;
    return `<button onclick="hpSuche()" style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(212,168,75,.12);border:1.5px solid rgba(212,168,75,.35);color:var(--gold);cursor:pointer;font-size:1.15rem;display:inline-flex;align-items:center;justify-content:center;padding:0;font-family:inherit;-webkit-tap-highlight-color:transparent" title="Suche (Kuh, Bauer, Behandlung, ...)">🔍</button>`;
  };

  console.log('[Suche] Modul geladen v' + VERSION);
})();
