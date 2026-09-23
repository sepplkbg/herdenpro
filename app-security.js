// ══════════════════════════════════════════════════════════════════════════════
//  HP-SECURITY (v1.0) — zentraler XSS-Schutz auf Firebase-SDK-Ebene
//  ------------------------------------------------------------------
//  Problem: Die App baut HTML aus Datenbank-Texten (Kuhname, Notiz, Chat …)
//  per innerHTML. Ein Kuhname wie  <img src=x onerror=...>  wurde als Code
//  ausgeführt (gefunden im E2E-Test: Herde-Liste + Globale Suche).
//
//  Lösung (greift für ALLE Module, egal ob Wrapper oder firebase.database()):
//   • Lesen:     DataSnapshot.val()        → Tag-Öffner "<x" werden zu "＜x"
//   • Schreiben: Reference.set/update/push → dasselbe, bevor es in die DB geht
//  "Zellzahl < 100.000" bleibt unverändert (nur "<" direkt vor Buchstabe/!/?//).
//
//  MUSS direkt nach den Firebase-SDK-Scripts und VOR app-core.js geladen werden.
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  'use strict';
  // Entschärft werden nur Zeichen, mit denen man aus HTML/Attributen/onclick ausbrechen kann:
  //   <x   → ＜x   (Tag-Öffner; "< 100" bleibt)
  //   "    → ”     (Attribut-Ausbruch  onclick="...")
  //   '    → ’     (JS-String-Ausbruch showQRCode('...'))
  //   &x;  → ＆x;  (Entities wie &#39; / &quot;, die im Attribut zu ' / " werden)
  var DANGER = /[<"'&]/;
  function clean(s) {
    if (!DANGER.test(s)) return s;
    return s
      .replace(/<(?=[a-zA-Z!\/?])/g, '＜')
      .replace(/"/g, '”')
      .replace(/'/g, '’')
      .replace(/&(?=#?[a-zA-Z0-9]+;)/g, '＆');
  }

  function sanitize(v, depth) {
    depth = depth | 0;
    if (typeof v === 'string') return clean(v);
    if (!v || typeof v !== 'object' || depth > 40) return v;
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length; i++) v[i] = sanitize(v[i], depth + 1);
      return v;
    }
    for (var k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
      var x = v[k];
      if (typeof x === 'string') v[k] = clean(x);
      else if (x && typeof x === 'object') v[k] = sanitize(x, depth + 1);
    }
    return v;
  }
  window.hpSanitize = sanitize;

  // HTML-Escape für neuen Code: hpEsc(text) in Template-Strings verwenden
  window.hpEsc = function(s) {
    return String(s == null ? '' : s).replace(/[<>&"']/g, function(c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  function install() {
    if (typeof firebase === 'undefined' || !firebase.database) return false;
    var Snap = firebase.database.DataSnapshot, Ref = firebase.database.Reference;
    if (!Snap || !Ref || Snap.prototype.__hpSecured) return !!(Snap && Snap.prototype.__hpSecured);

    var origVal = Snap.prototype.val;
    Snap.prototype.val = function() { return sanitize(origVal.apply(this, arguments)); };

    ['set', 'update', 'push', 'setWithPriority'].forEach(function(m) {
      var orig = Ref.prototype[m];
      if (typeof orig !== 'function') return;
      Ref.prototype[m] = function(value) {
        var args = Array.prototype.slice.call(arguments);
        if (args.length && args[0] !== undefined && typeof args[0] !== 'function') args[0] = sanitize(args[0]);
        return orig.apply(this, args);
      };
    });

    Snap.prototype.__hpSecured = true;
    console.log('[HP-Security] XSS-Schutz aktiv (val/set/update/push)');
    return true;
  }

  if (!install()) {
    // Fallback: SDK noch nicht geladen → kurz warten
    var tries = 0, t = setInterval(function() { if (install() || ++tries > 50) clearInterval(t); }, 100);
  }
})();
