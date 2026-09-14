// ══════════════════════════════════════════════════════════════════════════════
//  XLSX-EXPORT für Milchdaten
//  Matrix-Format: Zeilen = Datum+Zeit, Spalten = Kühe (Nr).
//  Rote Zellen mit Kommentar bei Kühen, die in dieser Woche Wartezeit hatten.
//  Braucht ExcelJS (aus index.html geladen als window.ExcelJS).
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '1.0';
  window.MILCH_XLSX_VERSION = VERSION;

  window.exportMilchXLSX = async function() {
    if(typeof window.ExcelJS === 'undefined') {
      alert('ExcelJS-Library nicht geladen. Bitte App neu laden.');
      return;
    }

    const _mW = window.milchWert || function(v){ return typeof v === 'number' ? v : (v && v.wert != null ? parseFloat(v.wert) || 0 : parseFloat(v) || 0); };
    const kuehe = window.kuehe || {};
    const eintraege = Object.values(window.milchEintraege || {}).filter(e => e && e.datum && e.prokuh);
    if(!eintraege.length) { alert('Keine Milchdaten vorhanden.'); return; }
    const behandlungen = window.behandlungen || {};

    // Kühe sortiert nach Nr (auch abgetriebene mit einbeziehen wenn Milchdaten für sie existieren)
    const kuhIdsMitMilch = new Set();
    eintraege.forEach(e => Object.keys(e.prokuh || {}).forEach(kid => {
      if(_mW(e.prokuh[kid]) > 0) kuhIdsMitMilch.add(kid);
    }));
    const kuhListe = [...kuhIdsMitMilch]
      .map(kid => ({ id: kid, k: kuehe[kid] }))
      .filter(x => x.k)
      .sort((a,b) => (parseInt(a.k.nr)||0) - (parseInt(b.k.nr)||0));

    // Alle Termine (Datum+Zeit) sortiert
    const terminMap = new Map();
    eintraege.forEach(e => {
      const iso = new Date(e.datum).toISOString().slice(0,10);
      const zeit = e.zeit || 'morgen';
      const key = iso + '_' + zeit;
      if(!terminMap.has(key)) terminMap.set(key, { iso, zeit, ts: e.datum, molkerei: false, eintraege: [] });
      const t = terminMap.get(key);
      t.eintraege.push(e);
      if(e.molkerei) t.molkerei = true;
      if(e.datum > t.ts) t.ts = e.datum;
    });
    const termine = [...terminMap.values()].sort((a,b) => a.ts - b.ts || (a.zeit === 'morgen' ? -1 : 1));

    // WZ-Perioden pro Kuh (aus behandlungen)
    const wzPerKuh = {};
    Object.values(behandlungen).forEach(b => {
      if(!b || !b.kuhId || !b.wzMilchEnde) return;
      let wzStart = b.datum || null;
      if(!wzStart && b.wzMilchTage) wzStart = b.wzMilchEnde - b.wzMilchTage * 86400000;
      if(!wzStart || b.wzMilchEnde <= wzStart) return;
      if(!wzPerKuh[b.kuhId]) wzPerKuh[b.kuhId] = [];
      wzPerKuh[b.kuhId].push({
        von: wzStart, bis: b.wzMilchEnde,
        medikament: b.medikament || '',
        diagnose: b.diagnose || '',
        grund: (b.medikament || b.diagnose || 'Behandlung')
      });
    });
    // Milchsperren (Schritt 2)
    Object.values(window.milchSperren || {}).forEach(s => {
      if(!s || !s.kuhId || !s.vonTs || !s.bisTs || s.bisTs <= s.vonTs) return;
      if(!wzPerKuh[s.kuhId]) wzPerKuh[s.kuhId] = [];
      wzPerKuh[s.kuhId].push({ von: s.vonTs, bis: s.bisTs, grund: s.grund || 'Milchsperre' });
    });

    // Prüft: hatte Kuh in der Woche VOR (und bis inkl.) diesem Termin eine WZ?
    // Regel: 1x/Woche Messung, WZ zwischen letzter und aktueller Messung wird angezeigt.
    function _wzInWocheVorTermin(kuhId, terminTs) {
      const list = wzPerKuh[kuhId];
      if(!list || !list.length) return null;
      const wocheStart = terminTs - 7 * 86400000;
      // Finde WZ die zwischen wocheStart und terminTs mindestens teilweise aktiv war
      const treffer = list.filter(p => p.bis >= wocheStart && p.von <= terminTs + 86400000);
      if(!treffer.length) return null;
      return treffer;   // Array von WZ-Perioden
    }

    // ExcelJS-Workbook aufbauen
    const wb = new window.ExcelJS.Workbook();
    wb.creator = 'HerdenPro';
    wb.created = new Date();
    const ws = wb.addWorksheet('Messungen');

    // Header-Zeile
    const headerRow = ['Datum', 'Zeit', 'Kategorie'];
    kuhListe.forEach(({ k }) => headerRow.push('#' + (k.nr || '?') + ' ' + (k.name || '')));
    headerRow.push('Summe (L)');
    ws.addRow(headerRow);
    const headerRowRef = ws.getRow(1);
    headerRowRef.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRowRef.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2A6B4A' } };
    headerRowRef.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRowRef.height = 22;

    // Spaltenbreiten
    ws.getColumn(1).width = 12;
    ws.getColumn(2).width = 10;
    ws.getColumn(3).width = 12;
    for(let c = 4; c < 4 + kuhListe.length; c++) ws.getColumn(c).width = 10;
    ws.getColumn(4 + kuhListe.length).width = 12;

    // Freeze: erste Zeile + erste 3 Spalten
    ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];

    // Datenzeilen
    let terminCounter = 0;
    let sumMolkerei = 0, sumSennerei = 0, sumVerworfen = 0, sumGesamt = 0;

    termine.forEach(t => {
      terminCounter++;
      const rowData = [];
      const datumDE = new Date(t.iso + 'T12:00:00').toLocaleDateString('de-AT');
      rowData.push(datumDE);
      rowData.push(t.zeit === 'abend' ? 'Abends' : 'Morgens');
      rowData.push(t.molkerei ? 'Molkerei' : 'Sennerei');
      const kuhWerte = [];
      let zeilenSumme = 0;
      kuhListe.forEach(({ id }) => {
        let wert = 0;
        // Höchster Wert aus allen Einträgen an diesem Termin
        t.eintraege.forEach(e => { const v = _mW(e.prokuh[id]); if(v > wert) wert = v; });
        kuhWerte.push(wert > 0 ? wert : null);
        if(wert > 0) zeilenSumme += wert;
      });
      kuhWerte.forEach(v => rowData.push(v));
      rowData.push(Math.round(zeilenSumme * 10) / 10);
      const row = ws.addRow(rowData);

      // Datum/Zeit/Kat-Zellen: leichte Formatierung
      row.getCell(1).font = { bold: true };
      row.getCell(1).alignment = { horizontal: 'left' };
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(3).font = { color: { argb: t.molkerei ? 'FF1F5AA0' : 'FF9A7020' } };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(3 + kuhListe.length + 1).font = { bold: true };
      row.getCell(3 + kuhListe.length + 1).alignment = { horizontal: 'right' };
      row.getCell(3 + kuhListe.length + 1).numFmt = '0.0';

      // Zellstyles pro Kuh + Termin
      kuhListe.forEach(({ id, k }, idx) => {
        const cell = row.getCell(4 + idx);
        cell.alignment = { horizontal: 'center' };
        cell.numFmt = '0.0';
        const wzList = _wzInWocheVorTermin(id, t.ts);
        if(wzList && wzList.length) {
          // Rote Zelle mit Kommentar
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } };
          cell.font = { color: { argb: 'FFAA1F1F' }, bold: true };
          const details = wzList.map(p => {
            const von = new Date(p.von).toLocaleDateString('de-AT', {day:'2-digit', month:'2-digit'});
            const bis = new Date(p.bis).toLocaleDateString('de-AT', {day:'2-digit', month:'2-digit'});
            const tage = Math.max(1, Math.ceil((p.bis - p.von) / 86400000));
            return von + '–' + bis + ' (' + tage + ' Tage) — ' + p.grund;
          }).join('\n');
          cell.note = { texts: [{ text: 'Wartezeit diese Woche:\n' + details }], margins: { insetmode: 'auto' } };
          if(cell.value != null && cell.value !== 0) sumVerworfen += cell.value;
        } else if(cell.value != null && cell.value !== 0) {
          if(t.molkerei) sumMolkerei += cell.value;
          else sumSennerei += cell.value;
        }
      });
      sumGesamt += zeilenSumme;
    });

    // Summenzeile
    ws.addRow([]);
    const legendRow = ws.addRow(['Legende:', '', '', 'Rot = mindestens 1 Tag Wartezeit in der Woche vor dieser Messung. Kommentar in der Zelle zeigt Details.']);
    ws.mergeCells(legendRow.number, 4, legendRow.number, 3 + kuhListe.length + 1);
    legendRow.getCell(1).font = { bold: true, color: { argb: 'FF666666' } };
    legendRow.getCell(4).font = { italic: true, color: { argb: 'FF666666' } };
    legendRow.getCell(4).alignment = { wrapText: true };

    // Zusammenfassung
    ws.addRow([]);
    const summTitle = ws.addRow(['Zusammenfassung']);
    summTitle.getCell(1).font = { bold: true, size: 12 };
    ws.addRow(['Gesamt (rechnerisch, Termin-Summen)', '', '', Math.round(sumGesamt * 10) / 10 + ' L']);
    ws.addRow(['Davon Molkerei (nicht-WZ Termine)', '', '', Math.round(sumMolkerei * 10) / 10 + ' L']).getCell(4).font = { color: { argb: 'FF1F5AA0' } };
    ws.addRow(['Davon Sennerei (nicht-WZ Termine)', '', '', Math.round(sumSennerei * 10) / 10 + ' L']).getCell(4).font = { color: { argb: 'FF9A7020' } };
    ws.addRow(['Davon Verworfen (Zellen mit WZ)', '', '', Math.round(sumVerworfen * 10) / 10 + ' L']).getCell(4).font = { color: { argb: 'FFAA1F1F' }, bold: true };

    ws.addRow([]);
    const carryTitle = ws.addRow(['Carry-Forward-Berechnung (App-Statistik)']);
    carryTitle.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF666666' } };
    if(typeof window.computeCarryForwardGesamt === 'function') {
      const cf = window.computeCarryForwardGesamt();
      ws.addRow(['Gesamt', '', '', cf.gesamt + ' L']);
      ws.addRow(['Molkerei', '', '', cf.molkerei + ' L']);
      ws.addRow(['Sennerei', '', '', cf.sennerei + ' L']);
      ws.addRow(['Verworfen', '', '', (cf.verworfen || 0) + ' L']).getCell(4).font = { color: { argb: 'FFAA1F1F' }, bold: true };
    }

    // Download
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Milch_' + new Date().toISOString().slice(0,10) + '.xlsx';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
    if(window.showSaveToast) window.showSaveToast('✓ XLSX exportiert · ' + termine.length + ' Termine · ' + kuhListe.length + ' Kühe');
  };

  console.log('[Milch-XLSX] Modul geladen v' + VERSION);
})();
