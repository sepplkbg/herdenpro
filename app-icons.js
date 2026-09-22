// ══════════════════════════════════════════════════════════════════════════════
//  ICON-HELPER + AUTO-REPLACER (v3.0 — FARBIG)
//  ------------------------------------------------------------------
//  Nutzt Noto Color Emoji + Fluent Color für farbige Icons (nicht monochrom).
//  Emojis werden zur Laufzeit gegen bunte SVG-Icons ersetzt.
//
//  Usage:
//    hpIcon('cow')  → farbiges Kuh-Icon
//    <iconify-icon icon="noto:cow-face"></iconify-icon>
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '3.0-color';

  // ── Zentrales Icon-Register — FARBIG (noto:* + fluent-color:*) ──────────
  const ICONS = {
    // Tiere & Herde
    'cow':          'noto:cow-face',
    'cow-face':     'noto:cow-face',
    'bull':         'noto:ox',
    'calf':         'noto:cow',
    'sheep':        'noto:ewe',
    'goat':         'noto:goat',
    'pig':          'noto:pig-face',

    // Milch & Käse (bunt)
    'milk':         'noto:glass-of-milk',
    'milk-off':     'twemoji:no-entry',
    'cheese':       'noto:cheese-wedge',
    'butter':       'noto:butter',
    'droplet':      'noto:droplet',

    // Aktionen (bunt: check grün, x rot etc.)
    'add':          'noto:plus',
    'add-circle':   'fluent-color:add-circle-24',
    'edit':         'noto:pencil',
    'delete':       'noto:wastebasket',
    'save':         'noto:floppy-disk',
    'close':        'noto:cross-mark',
    'check':        'noto:check-mark-button',
    'check-circle': 'noto:check-mark-button',
    'search':       'noto:magnifying-glass-tilted-left',
    'filter':       'fluent-color:filter-24',
    'export':       'noto:down-arrow',
    'import':       'noto:up-arrow',
    'copy':         'fluent-color:copy-24',
    'print':        'noto:printer',
    'share':        'fluent-color:share-24',
    'refresh':      'fluent-color:arrow-clockwise-dashes-24',
    'sync':         'fluent-color:arrow-sync-24',
    'settings':     'noto:gear',
    'menu':         'fluent-color:list-24',
    'back':         'fluent-color:arrow-left-24',
    'forward':      'fluent-color:arrow-right-24',
    'up':           'noto:up-arrow',
    'down':         'noto:down-arrow',
    'send':         'noto:incoming-envelope',
    'attach':       'noto:paperclip',
    'link':         'noto:link',
    'external':     'fluent-color:open-24',

    // Status (mit Farb-Codierung: rot/gelb/grün)
    'warning':      'noto:warning',
    'error':        'fluent-color:error-circle-24',
    'info':         'fluent-color:info-24',
    'success':      'noto:check-mark-button',
    'question':     'noto:red-question-mark',
    'lock':         'noto:locked',
    'unlock':       'noto:unlocked',
    'star':         'noto:star',
    'flag':         'noto:triangular-flag',
    'bell':         'noto:bell',
    'alert':        'noto:alarm-clock',
    'siren':        'noto:police-car-light',
    'red-dot':      'twemoji:red-circle',
    'green-dot':    'twemoji:green-circle',
    'yellow-dot':   'twemoji:yellow-circle',

    // Zeit & Kalender
    'calendar':     'noto:calendar',
    'calendar-add': 'fluent-color:calendar-add-24',
    'clock':        'noto:mantelpiece-clock',
    'time':         'noto:mantelpiece-clock',
    'sunrise':      'noto:sunrise',
    'sunset':       'noto:sunset',
    'hourglass':    'noto:hourglass-not-done',

    // Wetter (klar farbig)
    'weather':      'noto:sun-behind-cloud',
    'sun':          'noto:sun',
    'moon':         'noto:crescent-moon',
    'cloud':        'noto:cloud',
    'cloud-sun':    'noto:sun-behind-cloud',
    'rain':         'noto:cloud-with-rain',
    'rain-sun':     'noto:sun-behind-rain-cloud',
    'snow':         'noto:snowflake',
    'fog':          'noto:fog',
    'thunder':      'noto:cloud-with-lightning',
    'wind':         'noto:wind-face',
    'thermometer':  'noto:thermometer',

    // Personen & Kontakte
    'user':         'noto:bust-in-silhouette',
    'users':        'noto:busts-in-silhouette',
    'farmer':       'noto:man-farmer',
    'contact':      'noto:card-index',
    'phone':        'noto:telephone-receiver',
    'email':        'noto:e-mail',
    'sms':          'noto:speech-balloon',
    'chat':         'noto:left-speech-bubble',
    'whatsapp':     'logos:whatsapp-icon',
    'address':      'noto:round-pushpin',

    // Ort & Weide
    'map':          'noto:world-map',
    'pin':          'noto:round-pushpin',
    'gps':          'fluent-color:location-24',
    'meadow':       'noto:evergreen-tree',
    'herb':         'noto:herb',
    'grain':        'noto:sheaf-of-rice',
    'seedling':     'noto:seedling',
    'mountain':     'noto:mountain',
    'mountain-snow':'noto:snow-capped-mountain',
    'home':         'noto:house',
    'barn':         'noto:house-with-garden',

    // Gesundheit & Behandlung
    'heart':        'noto:red-heart',
    'medicine':     'noto:pill',
    'syringe':      'noto:syringe',
    'stethoscope':  'noto:stethoscope',
    'hospital':     'noto:hospital',
    'first-aid':    'noto:medical-symbol',
    'medical':      'noto:medical-symbol',
    'test-tube':    'noto:test-tube',
    'flask':        'noto:alembic',
    'microscope':   'noto:microscope',
    'mobile':       'noto:mobile-phone-with-arrow',

    // Klauen
    'hoof':         'noto:paw-prints',

    // Milch & Sennerei
    'scale':        'noto:balance-scale',
    'cash':         'noto:money-bag',
    'money':        'noto:euro-banknote',
    'invoice':      'noto:receipt',
    'receipt':      'noto:receipt',

    // Kraftfutter & Lager
    'feed':         'noto:ear-of-corn',
    'package':      'noto:package',
    'warehouse':    'fluent-color:building-factory-24',
    'truck':        'noto:articulated-lorry',
    'label':        'noto:label',

    // Datei & Dokumente
    'file':         'noto:page-facing-up',
    'file-text':    'noto:page-with-curl',
    'folder':       'noto:file-folder',
    'notebook':     'noto:notebook-with-decorative-cover',
    'excel':        'vscode-icons:file-type-excel',
    'pdf':          'vscode-icons:file-type-pdf2',
    'image':        'noto:framed-picture',
    'camera':       'noto:camera',
    'qr':           'fluent-color:scan-object-24',
    'barcode':      'fluent-color:barcode-scanner-24',
    'clipboard':    'noto:clipboard',
    'memo':         'noto:memo',

    // Werkzeug & Wartung
    'tool':         'noto:wrench',
    'gear':         'noto:gear',
    'hammer':       'noto:hammer',
    'machine':      'noto:tractor',

    // Charts & Statistik
    'chart':        'noto:bar-chart',
    'chart-line':   'noto:chart-increasing',
    'chart-pie':    'fluent-color:data-pie-24',
    'trend-up':     'noto:chart-increasing',
    'trend-down':   'noto:chart-decreasing',

    // Sonstiges
    'trash':        'noto:wastebasket',
    'list':         'fluent-color:task-list-square-ltr-24',
    'grid':         'fluent-color:grid-24',
    'eye':          'noto:eye',
    'eye-off':      'fluent-color:eye-off-24',
    'sparkle':      'noto:sparkles',
    'trophy':       'noto:trophy',
    'gift':         'noto:wrapped-gift',
    'globe':        'noto:globe-showing-europe-africa',
    'wifi':         'noto:antenna-bars',
    'wifi-off':     'fluent-color:wifi-off-24',
    'battery':      'noto:battery',
    'log-in':       'fluent-color:arrow-enter-24',
    'log-out':      'fluent-color:arrow-exit-24',
    'archive':      'noto:card-file-box',
    'restore':      'fluent-color:folder-arrow-up-24'
  };

  // ── Emoji → Icon-Name Mapping ───────────────────────────────────────────
  const EMOJI_MAP_RAW = {
    // Tiere
    '🐄': 'cow', '🐮': 'cow-face', '🐂': 'bull', '🐑': 'sheep', '🐐': 'goat',
    // Milch & Käse
    '🥛': 'milk', '🧀': 'cheese', '🧈': 'butter', '💧': 'droplet',
    // Aktionen
    '➕': 'add', '✏': 'edit', '✎': 'edit', '📝': 'memo',
    '🗑': 'trash', '💾': 'save', '❌': 'close', '✕': 'close', '✗': 'close',
    '✅': 'check', '☑': 'check-circle', '✓': 'check',
    '🔍': 'search', '🔎': 'search',
    '📥': 'import', '📤': 'export', '📋': 'clipboard', '🖨': 'print', '🔄': 'refresh',
    '⚙': 'settings', '🔧': 'tool', '📎': 'attach', '🔗': 'link',
    // Status
    '⚠': 'warning', '❗': 'error', 'ℹ': 'info', '❓': 'question',
    '🔒': 'lock', '🔓': 'unlock', '⭐': 'star', '🚩': 'flag', '🔔': 'bell',
    '🚨': 'siren', '🔴': 'red-dot', '🟢': 'green-dot', '🟡': 'yellow-dot',
    '📌': 'pin', '🏷': 'label',
    // Zeit
    '📅': 'calendar', '🕐': 'clock', '⏰': 'clock', '⌛': 'hourglass', '⏳': 'hourglass',
    '🌅': 'sunrise', '🌇': 'sunset',
    // Wetter
    '☀': 'sun', '🌞': 'sun', '🌙': 'moon', '☁': 'cloud', '⛅': 'cloud-sun',
    '🌧': 'rain', '🌦': 'rain-sun', '❄': 'snow', '🌨': 'snow',
    '🌫': 'fog', '⛈': 'thunder', '💨': 'wind', '🌡': 'thermometer',
    // Personen
    '👤': 'user', '👥': 'users', '🧑‍🌾': 'farmer', '👨‍🌾': 'farmer',
    '📞': 'phone', '☎': 'phone', '📧': 'email', '✉': 'email',
    '💬': 'sms', '🗨': 'chat',
    // Ort & Weide
    '📍': 'pin', '🗺': 'map', '🌿': 'herb', '🌾': 'grain', '🌱': 'seedling',
    '⛰': 'mountain', '🏔': 'mountain-snow', '🏠': 'home', '🏡': 'home',
    // Gesundheit
    '❤': 'heart', '💊': 'medicine', '💉': 'syringe', '🩺': 'stethoscope',
    '🏥': 'hospital', '⚕': 'medical', '🧪': 'test-tube', '⚗': 'flask',
    '🔬': 'microscope', '📲': 'mobile',
    // Sennerei / Milch
    '⚖': 'scale', '💰': 'cash', '💶': 'money', '🧾': 'receipt',
    // Lager
    '📦': 'package', '🚚': 'truck', '🌽': 'feed',
    // Dokumente
    '📄': 'file-text', '📁': 'folder', '📓': 'notebook', '📔': 'notebook',
    '📷': 'camera', '📸': 'camera', '🖼': 'image',
    // Charts
    '📊': 'chart', '📈': 'trend-up', '📉': 'trend-down',
    // Sonstiges
    '👁': 'eye', '✨': 'sparkle', '🏆': 'trophy', '🎁': 'gift',
    '🌐': 'globe', '📡': 'wifi', '🔋': 'battery'
  };

  const EMOJI_MAP = {};
  Object.keys(EMOJI_MAP_RAW).forEach(k => {
    EMOJI_MAP[k.replace(/️/g, '')] = EMOJI_MAP_RAW[k];
  });

  // Wichtig: noto-Icons ignorieren currentColor (sie sind selbst-farbig).
  // Deshalb wird KEIN CSS-Filter oder Color aufgezwungen.
  window.hpIcon = function(name, size, color) {
    const icon = ICONS[name] || (name && name.indexOf(':') > -1 ? name : ICONS['question']);
    const sizeClass = size && size !== 'md' ? ' class="hp-icon-' + size + '"' : '';
    // color-Argument NUR bei monochromen Icons anwenden (nicht noto:* / fluent-color:*)
    const style = (color && !icon.startsWith('noto:') && !icon.startsWith('fluent-color:') && !icon.startsWith('twemoji:') && !icon.startsWith('logos:') && !icon.startsWith('vscode-icons:'))
      ? ' style="color:' + color + '"' : '';
    return '<iconify-icon icon="' + icon + '"' + sizeClass + style + '></iconify-icon>';
  };

  window.hpIconFromEmoji = function(emoji, size, color) {
    if(!emoji) return '';
    const key = EMOJI_MAP[emoji.replace(/️/g, '')];
    if(!key) return emoji;
    return window.hpIcon(key, size, color);
  };

  window.hpIconifyString = function(str) {
    if(!str || typeof str !== 'string') return str;
    let out = str;
    Object.keys(EMOJI_MAP).forEach(emoji => {
      if(out.indexOf(emoji) === -1) return;
      out = out.split(emoji).join(window.hpIcon(EMOJI_MAP[emoji]));
    });
    return out;
  };

  window.HP_ICONS = ICONS;
  window.HP_EMOJI_MAP = EMOJI_MAP;

  // ═══════════════════════════════════════════════════════════════════════
  //  AUTO-REPLACER
  // ═══════════════════════════════════════════════════════════════════════

  const emojiKeys = Object.keys(EMOJI_MAP).sort((a,b) => b.length - a.length);
  const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const EMOJI_REGEX = new RegExp('(' + emojiKeys.map(escapeRegex).join('|') + ')(\\uFE0F)?', 'g');

  const SKIP_TAGS = { 'INPUT':1, 'TEXTAREA':1, 'SELECT':1, 'OPTION':1, 'SCRIPT':1, 'STYLE':1, 'CODE':1, 'PRE':1, 'IFRAME':1, 'CANVAS':1, 'SVG':1 };
  function shouldSkip(node) {
    let el = node.nodeType === 1 ? node : node.parentElement;
    while(el) {
      if(SKIP_TAGS[el.tagName]) return true;
      if(el.classList && (el.classList.contains('hp-no-icon') || el.classList.contains('hp-user-content'))) return true;
      if(el.hasAttribute && el.hasAttribute('contenteditable')) return true;
      if(el.dataset && el.dataset.noIconReplace) return true;
      el = el.parentElement;
    }
    return false;
  }

  function replaceInTextNode(textNode) {
    const text = textNode.nodeValue;
    if(!text || text.length < 1) return;
    EMOJI_REGEX.lastIndex = 0;
    if(!EMOJI_REGEX.test(text)) return;
    if(shouldSkip(textNode)) return;

    const frag = document.createDocumentFragment();
    let lastIdx = 0;
    EMOJI_REGEX.lastIndex = 0;
    let m;
    while((m = EMOJI_REGEX.exec(text)) !== null) {
      const emoji = m[1];
      const iconName = EMOJI_MAP[emoji];
      if(!iconName) continue;
      if(m.index > lastIdx) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
      }
      const iconEl = document.createElement('iconify-icon');
      iconEl.setAttribute('icon', ICONS[iconName] || 'noto:red-question-mark');
      iconEl.setAttribute('data-hp-auto', '1');
      frag.appendChild(iconEl);
      lastIdx = m.index + m[0].length;
    }
    if(lastIdx < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    }
    if(frag.childNodes.length > 0) {
      textNode.parentNode.replaceChild(frag, textNode);
    }
  }

  function scanSubtree(root) {
    if(!root) return;
    if(root.nodeType === 3) { replaceInTextNode(root); return; }
    if(root.nodeType !== 1) return;
    if(shouldSkip(root)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        EMOJI_REGEX.lastIndex = 0;
        return EMOJI_REGEX.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    let n;
    while((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(replaceInTextNode);
  }

  let observer = null;
  let scanScheduled = false;
  const pendingRoots = new Set();

  function scheduleScan(root) {
    pendingRoots.add(root);
    if(scanScheduled) return;
    scanScheduled = true;
    const run = () => {
      scanScheduled = false;
      const roots = Array.from(pendingRoots);
      pendingRoots.clear();
      roots.forEach(scanSubtree);
    };
    if(window.requestIdleCallback) requestIdleCallback(run, { timeout: 200 });
    else setTimeout(run, 16);
  }

  function startObserver() {
    if(observer) return;
    observer = new MutationObserver(mutations => {
      for(const mut of mutations) {
        if(mut.type === 'childList') {
          mut.addedNodes.forEach(node => {
            if(node.nodeType === 1 || node.nodeType === 3) scheduleScan(node);
          });
        } else if(mut.type === 'characterData') {
          scheduleScan(mut.target);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  window.hpIconStopAutoReplace = function() {
    if(observer) { observer.disconnect(); observer = null; }
  };
  window.hpIconStartAutoReplace = function() {
    startObserver();
    scheduleScan(document.body);
  };
  window.hpIconScanNow = function(root) { scheduleScan(root || document.body); };

  function boot() {
    scheduleScan(document.body);
    startObserver();
  }

  if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  console.log('[Icons] v' + VERSION + ' — ' + Object.keys(ICONS).length + ' bunte Icons, ' + Object.keys(EMOJI_MAP).length + ' Emojis gemappt');
})();
