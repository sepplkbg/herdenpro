// ══════════════════════════════════════════════════════════════════════════════
//  MILCH-EMAIL-VERSAND (via EmailJS)
//  Nach jedem Milchmessen wird die Tages-CSV automatisch an bis zu 3 Empfänger
//  geschickt. Debounce 30 s (kein Spam bei mehreren Speichervorgängen in Folge).
//  Offline → Job in localStorage queuen, beim Online-Werden nachliefern.
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '1.1';
  const SETTINGS_KEY = 'milch_email_settings_v1';
  const QUEUE_KEY = 'milch_email_queue_v1';
  const DEBOUNCE_MS = 30000;  // 30 Sekunden warten nach letztem Save
  let _debounceTimer = null;

  // ── Settings laden/speichern ──
  window.getMilchEmailSettings = function() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return {
        enabled: !!s.enabled,
        recipients: Array.isArray(s.recipients) ? s.recipients : ['', '', ''],
        serviceId: s.serviceId || '',
        templateId: s.templateId || '',
        publicKey: s.publicKey || ''
      };
    } catch(e) { return { enabled:false, recipients:['','',''], serviceId:'', templateId:'', publicKey:'' }; }
  };

  window.saveMilchEmailSettings = function(patch) {
    const cur = window.getMilchEmailSettings();
    const next = Object.assign({}, cur, patch);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    return next;
  };

  // ── Queue (offline-Support) ──
  function getQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch(e) { return []; }
  }
  function setQueue(q) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  }

  // ── Tages-CSV bauen ──
  // Baut eine kompakte CSV für den gegebenen Tag: alle Kühe die an dem Tag
  // gemolken wurden, morgens + abends getrennt, mit Notizen und Molkerei-Flag.
  function buildTagesCsv(datumTs) {
    const tagKey = new Date(datumTs).toISOString().slice(0,10);
    const datumStr = new Date(datumTs).toLocaleDateString('de-AT');
    const alle = Object.values(window.milchEintraege || {})
      .filter(e => e && e.datum && new Date(e.datum).toISOString().slice(0,10) === tagKey);

    // Aggregation per zeit (mehrere Melker → 1 Zeile)
    const grup = { morgen: null, abend: null };
    alle.forEach(e => {
      const z = e.zeit || 'morgen';
      if(!grup[z]) grup[z] = { gesamt: 0, prokuh: {}, molkerei: false, notizen: [], _prokuhTs: {} };
      const g = grup[z];
      g.molkerei = g.molkerei || !!e.molkerei;
      if(e.notiz) g.notizen.push(String(e.notiz));
      const _mW = window.milchWert || function(v){ return typeof v === 'number' ? v : (v && v.wert != null ? parseFloat(v.wert) || 0 : parseFloat(v) || 0); };
      if(e.prokuh) {
        Object.entries(e.prokuh).forEach(([kuhId, l]) => {
          const w = _mW(l);
          const ts = (typeof l === 'object' && l && l.ts) ? l.ts : 0;
          if(g.prokuh[kuhId] == null || ts > (g._prokuhTs[kuhId] || 0)) {
            g.prokuh[kuhId] = w;
            g._prokuhTs[kuhId] = ts;
          }
        });
      }
    });
    // Gesamt aus finalen prokuh-Werten
    ['morgen','abend'].forEach(z => {
      if(!grup[z]) return;
      let sum = 0;
      Object.values(grup[z].prokuh).forEach(v => sum += (parseFloat(v) || 0));
      grup[z].gesamt = Math.round(sum * 10) / 10;
    });

    // Kuh-Header (nach Nummer sortiert, nur die die heute gemolken wurden)
    const kuehe = window.kuehe || {};
    const beteiligteIds = new Set();
    ['morgen','abend'].forEach(z => {
      if(grup[z]) Object.keys(grup[z].prokuh).forEach(id => beteiligteIds.add(id));
    });
    const sortedIds = [...beteiligteIds].sort((a,b) => (parseInt(kuehe[a]?.nr)||0) - (parseInt(kuehe[b]?.nr)||0));

    // CSV-Sanitize
    const csvCell = (v) => {
      const s = String(v == null ? '' : v);
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
    };
    const csvNum = (v) => {
      if(v === '' || v == null) return '';
      const n = parseFloat(v);
      return isNaN(n) ? '' : String(n).replace('.', ',');
    };

    let csv = 'Datum;Zeit;An Molkerei;';
    csv += sortedIds.map(id => csvCell('#'+(kuehe[id]?.nr||'?')+' '+(kuehe[id]?.name||''))).join(';');
    csv += ';Gesamt;Notiz\n';

    let gesamtTag = 0;
    ['morgen','abend'].forEach(z => {
      const g = grup[z]; if(!g) return;
      const zeitStr = z === 'abend' ? 'Abends' : 'Morgens';
      const werte = sortedIds.map(id => {
        const v = g.prokuh[id];
        return v ? csvNum(Math.round(v*10)/10) : '';
      }).join(';');
      const notiz = csvCell(g.notizen.join(' · '));
      csv += [datumStr, zeitStr, g.molkerei?'Ja':'Nein', werte, csvNum(g.gesamt), notiz].join(';') + '\n';
      gesamtTag += g.gesamt;
    });

    // ── LANG-FORMAT (eine Zeile pro Kuh) für die Email-Anzeige ──
    // Viel lesbarer als das WIDE-Format vom CSV (das für Excel-Import bleibt).
    const gesMorgen = grup.morgen ? grup.morgen.gesamt : 0;
    const gesAbend  = grup.abend  ? grup.abend.gesamt  : 0;
    const molkereiMorgen = grup.morgen ? grup.morgen.molkerei : false;
    const molkereiAbend  = grup.abend  ? grup.abend.molkerei  : false;
    const notizenAlle = [];
    if(grup.morgen && grup.morgen.notizen.length) notizenAlle.push('Morgens: ' + grup.morgen.notizen.join(' · '));
    if(grup.abend && grup.abend.notizen.length)  notizenAlle.push('Abends: ' + grup.abend.notizen.join(' · '));

    const escapeHtml = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
    const fmt = (v) => (v == null || v === 0) ? '–' : String(Math.round(v*10)/10).replace('.',',');

    // HTML-Tabelle (eine Zeile pro Kuh, morgens + abends nebeneinander)
    let tableRows = '';
    sortedIds.forEach(id => {
      const k = kuehe[id];
      const nr = k?.nr || '?';
      const nam = escapeHtml(k?.name || '');
      const m = grup.morgen ? grup.morgen.prokuh[id] : null;
      const a = grup.abend  ? grup.abend.prokuh[id]  : null;
      const total = (parseFloat(m)||0) + (parseFloat(a)||0);
      tableRows += '<tr>' +
        '<td style="padding:4px 8px;border-bottom:1px solid #e5e5e5;color:#888;font-weight:600;text-align:right">#' + escapeHtml(nr) + '</td>' +
        '<td style="padding:4px 8px;border-bottom:1px solid #e5e5e5">' + nam + '</td>' +
        '<td style="padding:4px 8px;border-bottom:1px solid #e5e5e5;text-align:right;font-family:monospace">' + fmt(m) + '</td>' +
        '<td style="padding:4px 8px;border-bottom:1px solid #e5e5e5;text-align:right;font-family:monospace">' + fmt(a) + '</td>' +
        '<td style="padding:4px 8px;border-bottom:1px solid #e5e5e5;text-align:right;font-family:monospace;font-weight:700">' + fmt(total) + '</td>' +
      '</tr>';
    });

    const htmlTable = '' +
      '<div style="font-family:Georgia,serif;color:#2a2a2a;line-height:1.5;max-width:640px">' +
        '<h2 style="color:#8b6914;border-bottom:2px solid #d4a84b;padding-bottom:6px;margin-bottom:12px">🥛 Milchmessung ' + escapeHtml(datumStr) + '</h2>' +
        '<table style="border-collapse:collapse;margin-bottom:16px;font-size:14px">' +
          '<tr><td style="padding:2px 12px 2px 0;color:#666">Morgens gesamt</td><td style="padding:2px 0;font-weight:700">' + fmt(gesMorgen) + ' L' + (molkereiMorgen ? ' <span style="color:#8b6914;font-weight:400">· 🏭 Molkerei</span>' : '') + '</td></tr>' +
          '<tr><td style="padding:2px 12px 2px 0;color:#666">Abends gesamt</td><td style="padding:2px 0;font-weight:700">' + fmt(gesAbend) + ' L' + (molkereiAbend ? ' <span style="color:#8b6914;font-weight:400">· 🏭 Molkerei</span>' : '') + '</td></tr>' +
          '<tr style="border-top:1px solid #ccc"><td style="padding:6px 12px 2px 0;color:#000;font-weight:700">Tages-Total</td><td style="padding:6px 0;font-weight:700;font-size:16px;color:#8b6914">' + fmt(gesamtTag) + ' L</td></tr>' +
        '</table>' +
        '<table style="border-collapse:collapse;width:100%;font-size:13px;background:#fafafa;border:1px solid #e5e5e5">' +
          '<thead><tr style="background:#f0f0f0;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#666">' +
            '<th style="padding:6px 8px;text-align:right">Nr</th>' +
            '<th style="padding:6px 8px;text-align:left">Kuh</th>' +
            '<th style="padding:6px 8px;text-align:right">Morgens</th>' +
            '<th style="padding:6px 8px;text-align:right">Abends</th>' +
            '<th style="padding:6px 8px;text-align:right">Total</th>' +
          '</tr></thead>' +
          '<tbody>' + tableRows + '</tbody>' +
        '</table>' +
        (notizenAlle.length ? '<p style="margin-top:12px;padding:8px 12px;background:#fff9e5;border-left:3px solid #d4a84b;color:#555;font-size:13px"><strong>📝 Notizen:</strong><br>' + escapeHtml(notizenAlle.join('\n')).replace(/\n/g,'<br>') + '</p>' : '') +
        '<p style="margin-top:20px;color:#aaa;font-size:11px;font-style:italic">Automatisch verschickt von HerdenPro nach der Milchmessung.</p>' +
      '</div>';

    return {
      csv: csv,
      html: htmlTable,
      datumStr: datumStr,
      gesamtTag: Math.round(gesamtTag * 10) / 10,
      gesMorgen: Math.round(gesMorgen * 10) / 10,
      gesAbend: Math.round(gesAbend * 10) / 10,
      hatMorgen: !!grup.morgen,
      hatAbend: !!grup.abend
    };
  }

  // ── Email-Body bauen ──
  // Variablen für EmailJS Template:
  //   {{subject}}, {{alm_name}}, {{datum}}, {{gesamt_liter}}
  //   {{html_table}}   → schöne HTML-Tabelle (empfohlen als Body-Inhalt)
  //   {{csv_content}}  → rohe CSV für Excel-Import (optional als Anhang-Alternative)
  //   {{message}}      → HTML-Body inkl. Tabelle (fertig, einfach im Template `{{{message}}}` einfügen)
  function buildEmailBody(data) {
    const alm = (window.saisonInfo && window.saisonInfo.alm) || 'Alm';
    return {
      subject: '🥛 Milchmessung ' + data.datumStr + ' – ' + alm,
      alm_name: alm,
      datum: data.datumStr,
      gesamt_liter: data.gesamtTag + ' L',
      csv_content: data.csv,
      html_table: data.html,
      message: data.html   // Fertiger HTML-Body — Template kann einfach `{{{message}}}` nutzen
    };
  }

  // ── Debounced Trigger ──
  window.scheduleMilchEmail = function(datumTs) {
    const s = window.getMilchEmailSettings();
    if(!s.enabled) return;
    if(!s.serviceId || !s.templateId || !s.publicKey) return;
    if(!s.recipients.some(r => r && r.trim())) return;

    if(_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      queueEmail(datumTs);
      window.trySendMilchEmailQueue();
    }, DEBOUNCE_MS);
  };

  function queueEmail(datumTs) {
    const q = getQueue();
    const tagKey = new Date(datumTs).toISOString().slice(0,10);
    // Duplikate für gleichen Tag vermeiden: alten Job überschreiben (neue CSV = frischere Daten)
    const gefiltert = q.filter(j => j.tagKey !== tagKey);
    gefiltert.push({
      id: 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      tagKey: tagKey,
      datumTs: datumTs,
      createdAt: Date.now(),
      versucht: 0,
      lastError: null
    });
    setQueue(gefiltert);
  }

  // ── Queue abarbeiten ──
  let _sending = false;
  window.trySendMilchEmailQueue = async function() {
    if(_sending) return;
    if(!navigator.onLine) return;
    if(typeof emailjs === 'undefined') return;
    const s = window.getMilchEmailSettings();
    if(!s.enabled) return;

    const q = getQueue();
    if(q.length === 0) return;

    _sending = true;
    try {
      for(const job of q) {
        try {
          await sendJob(job, s);
          // Erfolg → aus Queue entfernen
          const cur = getQueue().filter(j => j.id !== job.id);
          setQueue(cur);
        } catch(err) {
          job.versucht = (job.versucht || 0) + 1;
          job.lastError = String(err && err.text || err && err.message || err).slice(0, 200);
          // Nach 5 Fehlversuchen aufgeben
          if(job.versucht >= 5) {
            const cur = getQueue().filter(j => j.id !== job.id);
            setQueue(cur);
            console.warn('[Email] Job aufgegeben nach 5 Versuchen:', job);
          } else {
            const cur = getQueue().map(j => j.id === job.id ? job : j);
            setQueue(cur);
          }
          break; // Bei Fehler abbrechen, später neu versuchen
        }
      }
    } finally {
      _sending = false;
    }
  };

  async function sendJob(job, s) {
    const data = buildTagesCsv(job.datumTs);
    const body = buildEmailBody(data);
    const empfaenger = s.recipients.filter(r => r && r.trim());
    // Für jeden Empfänger separaten Send
    for(const to of empfaenger) {
      const params = Object.assign({}, body, { to_email: to.trim() });
      await emailjs.send(s.serviceId, s.templateId, params, { publicKey: s.publicKey });
    }
  }

  // ── Test-Email ──
  window.sendTestMilchEmail = async function() {
    const s = window.getMilchEmailSettings();
    if(!s.serviceId || !s.templateId || !s.publicKey) {
      alert('Bitte zuerst EmailJS-Konfiguration (Service-ID, Template-ID, Public Key) eingeben.');
      return;
    }
    const empfaenger = s.recipients.filter(r => r && r.trim());
    if(empfaenger.length === 0) {
      alert('Bitte mindestens 1 Empfänger-Adresse eintragen.');
      return;
    }
    if(typeof emailjs === 'undefined') {
      alert('EmailJS-SDK nicht geladen. Bitte online sein und Seite neu laden.');
      return;
    }
    // Test-CSV mit heutigen Daten oder Dummy
    const heute = Date.now();
    const data = buildTagesCsv(heute);
    if(data.gesamtTag === 0) {
      // Dummy-Test
      const heuteStr = new Date().toLocaleDateString('de-AT');
      data.csv = 'Datum;Zeit;An Molkerei;#1 Testkuh;Gesamt;Notiz\n' +
                 heuteStr + ';Morgens;Ja;12,5;12,5;Test-Email von HerdenPro\n';
      data.gesamtTag = 12.5;
      data.datumStr = heuteStr;
      data.html = '<div style="font-family:Georgia,serif;color:#2a2a2a">' +
        '<h2 style="color:#8b6914;border-bottom:2px solid #d4a84b;padding-bottom:6px">🥛 TEST-Email HerdenPro</h2>' +
        '<p>Dies ist eine Test-Email um die EmailJS-Konfiguration zu prüfen.</p>' +
        '<p>Bei echten Milchmessungen erscheint hier eine schöne Tabelle mit allen Kühen und Werten.</p>' +
        '<p style="color:#aaa;font-size:11px;font-style:italic">Automatisch verschickt von HerdenPro.</p>' +
      '</div>';
    }
    const body = buildEmailBody(data);
    body.subject = '[TEST] ' + body.subject;

    const btn = document.getElementById('email-test-btn');
    if(btn) { btn.disabled = true; btn.textContent = '⏳ Sende…'; }
    try {
      for(const to of empfaenger) {
        const params = Object.assign({}, body, { to_email: to.trim() });
        await emailjs.send(s.serviceId, s.templateId, params, { publicKey: s.publicKey });
      }
      alert('✓ Test-Email(s) verschickt an: ' + empfaenger.join(', '));
    } catch(err) {
      alert('✗ Fehler beim Senden:\n' + (err && err.text || err && err.message || err));
    } finally {
      if(btn) { btn.disabled = false; btn.textContent = '📧 Test-Email jetzt schicken'; }
    }
  };

  // ── Auto-Retry bei Online-Werden + beim Laden ──
  window.addEventListener('online', () => {
    setTimeout(() => window.trySendMilchEmailQueue(), 2000);
  });
  // Beim ersten Load nach ein paar Sekunden versuchen
  setTimeout(() => window.trySendMilchEmailQueue(), 5000);

  // ── Debug: Queue-Status ──
  window.showMilchEmailStatus = function() {
    const q = getQueue();
    const s = window.getMilchEmailSettings();
    let msg = 'Email-Versand: ' + (s.enabled ? 'AN' : 'AUS') + '\n';
    msg += 'Empfänger: ' + s.recipients.filter(r => r && r.trim()).join(', ') + '\n';
    msg += 'EmailJS konfiguriert: ' + (!!(s.serviceId && s.templateId && s.publicKey) ? 'JA' : 'NEIN') + '\n';
    msg += 'Queue: ' + q.length + ' Jobs\n';
    if(q.length) {
      msg += '\n' + q.map(j => '  · ' + j.tagKey + ' (Versuche: ' + (j.versucht||0) + ')' + (j.lastError ? ' — ' + j.lastError : '')).join('\n');
    }
    alert(msg);
  };

  console.log('[Milch-Email] Modul geladen v' + VERSION);
  window.MILCH_EMAIL_VERSION = VERSION;
})();
