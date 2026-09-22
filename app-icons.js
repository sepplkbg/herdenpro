// ══════════════════════════════════════════════════════════════════════════════
//  ICON-HELPER + AUTO-REPLACER (v2.0)
//  ------------------------------------------------------------------
//  1) Iconify-Wrapper mit zentralem Icon-Register
//  2) Emoji → Icon Runtime-Transformer (MutationObserver-basiert)
//
//  Usage (statischer Aufruf):
//    hpIcon('cow')                → '<iconify-icon icon="lucide:cow"></iconify-icon>'
//    hpIcon('cow', 'lg', 'red')   → mit Grösse + Farbe
//
//  Runtime-Auto-Replace ist per Default AN. Ausnahmen:
//    - <input>, <textarea>, <select>, [contenteditable]  (User-Eingaben)
//    - <code>, <pre>, <script>, <style>
//    - Elemente mit Klasse .hp-no-icon                    (opt-out)
//    - Elemente mit Klasse .hp-user-content               (Journal, Notizen, Kommentare)
//    - data-no-icon-replace="1" Attribut
//
//  Icon-Suche: https://icon-sets.iconify.design
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const VERSION = '2.0';

  // ── Zentrales Icon-Register ────────────────────────────────────────────
  const ICONS = {
    // Tiere & Herde
    'cow':          'lucide:cow',
    'cow-face':     'noto:cow-face',
    'bull':         'game-icons:bull',
    'calf':         'noto:calf',
    'sheep':        'noto:ewe',
    'milk':         'lucide:milk',
    'milk-off':     'lucide:milk-off',
    'cheese':       'lucide:cake-slice',
    'butter':       'mdi:butter',

    // Aktionen
    'add':          'lucide:plus',
    'add-circle':   'lucide:plus-circle',
    'edit':         'lucide:pencil',
    'delete':       'lucide:trash-2',
    'save':         'lucide:save',
    'close':        'lucide:x',
    'check':        'lucide:check',
    'check-circle': 'lucide:check-circle',
    'search':       'lucide:search',
    'filter':       'lucide:filter',
    'export':       'lucide:download',
    'import':       'lucide:upload',
    'copy':         'lucide:copy',
    'print':        'lucide:printer',
    'share':        'lucide:share-2',
    'refresh':      'lucide:refresh-cw',
    'sync':         'lucide:refresh-ccw',
    'settings':     'lucide:settings',
    'menu':         'lucide:menu',
    'back':         'lucide:arrow-left',
    'forward':      'lucide:arrow-right',
    'up':           'lucide:arrow-up',
    'down':         'lucide:arrow-down',
    'send':         'lucide:send',
    'attach':       'lucide:paperclip',
    'link':         'lucide:link',
    'external':     'lucide:external-link',

    // Status
    'warning':      'lucide:alert-triangle',
    'error':        'lucide:alert-circle',
    'info':         'lucide:info',
    'success':      'lucide:circle-check',
    'question':     'lucide:help-circle',
    'lock':         'lucide:lock',
    'unlock':       'lucide:unlock',
    'star':         'lucide:star',
    'flag':         'lucide:flag',
    'bell':         'lucide:bell',
    'alert':        'lucide:alarm-clock-check',
    'siren':        'game-icons:siren',
    'red-dot':      'lucide:circle',
    'green-dot':    'lucide:circle',
    'yellow-dot':   'lucide:circle',

    // Zeit & Kalender
    'calendar':     'lucide:calendar',
    'calendar-add': 'lucide:calendar-plus',
    'clock':        'lucide:clock',
    'time':         'lucide:clock',
    'sunrise':      'lucide:sunrise',
    'sunset':       'lucide:sunset',
    'hourglass':    'lucide:hourglass',

    // Wetter
    'weather':      'lucide:cloud-sun',
    'sun':          'lucide:sun',
    'moon':         'lucide:moon',
    'cloud':        'lucide:cloud',
    'cloud-sun':    'lucide:cloud-sun',
    'rain':         'lucide:cloud-rain',
    'rain-sun':     'lucide:cloud-sun-rain',
    'snow':         'lucide:snowflake',
    'fog':          'lucide:cloud-fog',
    'thunder':      'lucide:cloud-lightning',
    'wind':         'lucide:wind',
    'thermometer':  'lucide:thermometer',

    // Personen & Kontakte
    'user':         'lucide:user',
    'users':        'lucide:users',
    'farmer':       'game-icons:farmer',
    'contact':      'lucide:contact',
    'phone':        'lucide:phone',
    'email':        'lucide:mail',
    'sms':          'lucide:message-square',
    'chat':         'lucide:message-circle',
    'whatsapp':     'ic:baseline-whatsapp',
    'address':      'lucide:map-pin',

    // Ort & Weide
    'map':          'lucide:map',
    'pin':          'lucide:map-pin',
    'gps':          'lucide:navigation',
    'meadow':       'lucide:trees',
    'herb':         'lucide:sprout',
    'grain':        'lucide:wheat',
    'seedling':     'lucide:sprout',
    'mountain':     'lucide:mountain',
    'mountain-snow':'lucide:mountain-snow',
    'home':         'lucide:home',
    'barn':         'game-icons:barn',

    // Gesundheit & Behandlung
    'heart':        'lucide:heart',
    'medicine':     'lucide:pill',
    'syringe':      'lucide:syringe',
    'stethoscope':  'lucide:stethoscope',
    'hospital':     'lucide:hospital',
    'first-aid':    'mdi:medical-bag',
    'medical':      'mdi:medical-bag',
    'test-tube':    'lucide:test-tube',
    'flask':        'lucide:flask-conical',

    // Klauen
    'hoof':         'game-icons:cow-hoof',

    // Milch & Sennerei
    'droplet':      'lucide:droplet',
    'scale':        'lucide:scale',
    'cash':         'lucide:banknote',
    'money':        'lucide:euro',
    'invoice':      'lucide:file-text',
    'receipt':      'lucide:receipt',

    // Kraftfutter & Lager
    'feed':         'game-icons:corn',
    'package':      'lucide:package',
    'warehouse':    'lucide:warehouse',
    'truck':        'lucide:truck',
    'label':        'lucide:tag',

    // Datei & Dokumente
    'file':         'lucide:file',
    'file-text':    'lucide:file-text',
    'folder':       'lucide:folder',
    'notebook':     'lucide:notebook',
    'excel':        'vscode-icons:file-type-excel',
    'pdf':          'vscode-icons:file-type-pdf2',
    'image':        'lucide:image',
    'camera':       'lucide:camera',
    'qr':           'lucide:qr-code',
    'barcode':      'lucide:barcode',
    'clipboard':    'lucide:clipboard',
    'memo':         'lucide:file-pen',

    // Werkzeug & Wartung
    'tool':         'lucide:wrench',
    'gear':         'lucide:cog',
    'hammer':       'lucide:hammer',
    'machine':      'game-icons:tractor',

    // Charts & Statistik
    'chart':        'lucide:bar-chart-3',
    'chart-line':   'lucide:line-chart',
    'chart-pie':    'lucide:pie-chart',
    'trend-up':     'lucide:trending-up',
    'trend-down':   'lucide:trending-down',

    // Sonstiges
    'trash':        'lucide:trash-2',
    'list':         'lucide:list',
    'grid':         'lucide:grid-3x3',
    'eye':          'lucide:eye',
    'eye-off':      'lucide:eye-off',
    'sparkle':      'lucide:sparkles',
    'trophy':       'lucide:trophy',
    'gift':         'lucide:gift',
    'globe':        'lucide:globe',
    'wifi':         'lucide:wifi',
    'wifi-off':     'lucide:wifi-off',
    'battery':      'lucide:battery',
    'log-in':       'lucide:log-in',
    'log-out':      'lucide:log-out',
    'archive':      'lucide:archive',
    'restore':      'lucide:archive-restore'
  };

  // ── Emoji → Icon-Name Mapping (mit + ohne Variation-Selector U+FE0F) ────
  const EMOJI_MAP_RAW = {
    // Tiere
    '🐄': 'cow', '🐮': 'cow-face', '🐂': 'bull', '🐑': 'sheep',
    // Milch & Käse
    '🥛': 'milk', '🧀': 'cheese', '🧈': 'butter', '💧': 'droplet',
    // Aktionen
    '➕': 'add', '✏': 'edit', '✎': 'edit', '📝': 'memo',
    '🗑': 'trash', '💾': 'save', '❌': 'close', '✕': 'close', '✗': 'close',
    '✅': 'check', '☑': 'check-circle', '✓': 'check',
    '🔍': 'search', '🔎': 'search', '🔎️': 'search',
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

  // Normalisiere: Variation-Selector (U+FE0F) rausstrippen, damit sowohl "🏔" als auch "🏔️" matchen
  const EMOJI_MAP = {};
  Object.keys(EMOJI_MAP_RAW).forEach(k => {
    const stripped = k.replace(/️/g, '');
    EMOJI_MAP[stripped] = EMOJI_MAP_RAW[k];
  });

  // ── hpIcon(name, size, color) → HTML-String ─────────────────────────────
  window.hpIcon = function(name, size, color) {
    const icon = ICONS[name] || (name && name.indexOf(':') > -1 ? name : ICONS['question']);
    const sizeClass = size && size !== 'md' ? ' class="hp-icon-' + size + '"' : '';
    const style = color ? ' style="color:' + color + '"' : '';
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
  //  AUTO-REPLACER: Emojis in gerendertem DOM zur Laufzeit ersetzen
  // ═══════════════════════════════════════════════════════════════════════

  // Regex, der alle bekannten Emojis matcht (inkl. optionalem Variation-Selector)
  const emojiKeys = Object.keys(EMOJI_MAP).sort((a,b) => b.length - a.length);  // längste zuerst
  const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const EMOJI_REGEX = new RegExp('(' + emojiKeys.map(escapeRegex).join('|') + ')(\\uFE0F)?', 'g');

  // Tags/Selektoren wo NICHT ersetzt werden darf
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

  // Ersetzt Emojis in einem Text-Node durch <iconify-icon>-Elemente
  function replaceInTextNode(textNode) {
    const text = textNode.nodeValue;
    if(!text || text.length < 1) return;
    EMOJI_REGEX.lastIndex = 0;
    if(!EMOJI_REGEX.test(text)) return;
    if(shouldSkip(textNode)) return;

    // Text in Fragmente splitten und Emojis durch echte Elemente ersetzen
    const frag = document.createDocumentFragment();
    let lastIdx = 0;
    EMOJI_REGEX.lastIndex = 0;
    let m;
    while((m = EMOJI_REGEX.exec(text)) !== null) {
      const emoji = m[1];
      const iconName = EMOJI_MAP[emoji];
      if(!iconName) continue;
      // Text vor dem Emoji
      if(m.index > lastIdx) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
      }
      // Icon-Element
      const iconEl = document.createElement('iconify-icon');
      iconEl.setAttribute('icon', ICONS[iconName] || 'lucide:help-circle');
      iconEl.setAttribute('data-hp-auto', '1');
      frag.appendChild(iconEl);
      lastIdx = m.index + m[0].length;
    }
    // Rest
    if(lastIdx < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    }
    if(frag.childNodes.length > 0) {
      textNode.parentNode.replaceChild(frag, textNode);
    }
  }

  // Rekursiv alle Text-Nodes in einem Subtree ersetzen
  function scanSubtree(root) {
    if(!root) return;
    if(root.nodeType === 3) { replaceInTextNode(root); return; }
    if(root.nodeType !== 1) return;
    if(shouldSkip(root)) return;
    // TreeWalker sammelt alle Text-Nodes vor Modifikation → verhindert Endlosschleife
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        // Text-Nodes ohne Emojis überspringen (Performance)
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
    // requestIdleCallback (Fallback: setTimeout) — verhindert Layout-Thrashing
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

  // Auto-Start beim Laden
  function boot() {
    // Initial-Scan
    scheduleScan(document.body);
    // Observer für dynamisch generiertes DOM
    startObserver();
  }

  if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  console.log('[Icons] Iconify-Helper v' + VERSION + ' geladen — ' + Object.keys(ICONS).length + ' Icons, ' + Object.keys(EMOJI_MAP).length + ' Emojis gemappt (Auto-Replace aktiv)');
})();
