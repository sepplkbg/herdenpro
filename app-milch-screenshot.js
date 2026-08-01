// ══════════════════════════════════════════════════════════════════════════════
//  MILCH-SCREENSHOT: extra Sicherheit nach jedem Save
//  Screenshot der aktuellen Milch-Erfassung wird:
//    (C) auf Handy gedownloadet als PNG
//    (D) zu Firebase Storage hochgeladen als Backup
//  Läuft NACH dem eigentlichen Save (fire-and-forget). Failure darf NIE den
//  Haupt-Save blockieren. Nur zusätzliche Sicherheit.
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '1.0';

  // Prüft ob Screenshot-Feature nutzbar ist
  function _screenshotAvailable() {
    return typeof html2canvas === 'function';
  }

  // ── Hauptfunktion: nach Save aufrufen ──
  // Erzeugt Screenshot der aktuellen milch-erfassen-Seite, lädt hoch + download.
  // Async, fire-and-forget. Failt still (nur console).
  window.milchMakeAndSaveScreenshot = async function(datum, zeit, gesamtL) {
    if(!_screenshotAvailable()) {
      console.warn('[Milch-Screenshot] html2canvas nicht geladen — überspringe');
      return;
    }
    try {
      // Screenshot-Ziel: das ganze milch-erfassen View
      // Vorrangig: main-content wenn wir noch auf der milch_erfassen-View sind.
      // Fallback: form-body im milch-form-overlay.
      let target = document.getElementById('main-content');
      if(!target || window.currentView !== 'milch_erfassen') {
        target = document.querySelector('#milch-form-overlay .form-body');
      }
      if(!target) {
        console.warn('[Milch-Screenshot] Kein Target gefunden');
        return;
      }
      console.log('[Milch-Screenshot] Erzeuge Screenshot für', datum, zeit, '...');

      // Temporär die Höhe expandieren damit html2canvas den kompletten Inhalt sieht.
      // (Sonst nur der sichtbare scroll-Bereich)
      const origHeight = target.style.height;
      const origMaxHeight = target.style.maxHeight;
      const origOverflow = target.style.overflow;
      target.style.height = 'auto';
      target.style.maxHeight = 'none';
      target.style.overflow = 'visible';

      const canvas = await html2canvas(target, {
        backgroundColor: '#0a1a04',
        scale: 1.5,   // Retina-ish quality, aber nicht zu groß für Upload
        logging: false,
        useCORS: true,
        windowWidth: target.scrollWidth || 800,
        windowHeight: target.scrollHeight || 1200
      });

      // Höhe wiederherstellen
      target.style.height = origHeight;
      target.style.maxHeight = origMaxHeight;
      target.style.overflow = origOverflow;

      // Als Blob
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.9));
      if(!blob) {
        console.warn('[Milch-Screenshot] toBlob returned null');
        return;
      }
      console.log('[Milch-Screenshot] Screenshot erzeugt, Größe:', Math.round(blob.size/1024), 'KB');

      // Filename: 2026-07-31_abend.png
      const iso = (typeof datum === 'string') ? datum.slice(0,10) : new Date(datum).toISOString().slice(0,10);
      const filename = 'milch_' + iso + '_' + (zeit || 'morgen') + '.png';

      // (C) Download auf Handy
      try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        console.log('[Milch-Screenshot] Download getriggert:', filename);
      } catch(e) {
        console.warn('[Milch-Screenshot] Download fail:', e);
      }

      // (D) Upload zu Firebase Storage
      try {
        if(typeof firebase === 'undefined' || !firebase.storage) {
          console.warn('[Milch-Screenshot] Firebase Storage nicht verfügbar');
          return;
        }
        const user = firebase.auth && firebase.auth().currentUser;
        const uid = user ? user.uid : 'anonymous';
        const path = 'milch_screenshots/' + uid + '/' + filename;
        const ref = firebase.storage().ref(path);
        // Upload mit Timeout 30s
        const uploadPromise = ref.put(blob, { contentType: 'image/png' });
        const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error('Upload Timeout')), 30000));
        await Promise.race([uploadPromise, timeoutPromise]);
        console.log('[Milch-Screenshot] Upload OK →', path);
        if(window.showSaveToast) window.showSaveToast('📸 Backup-Foto gespeichert');
      } catch(e) {
        console.warn('[Milch-Screenshot] Firebase Storage Upload fail:', e.message || e);
        // Nicht dem User zeigen — Download ist eh gelaufen
      }
    } catch(err) {
      console.error('[Milch-Screenshot] FEHLER:', err);
      // Nichts weiter tun — Screenshot ist optional
    }
  };

  console.log('[Milch-Screenshot] Modul geladen v' + VERSION);
})();
