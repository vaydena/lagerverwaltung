/* Vaydena Lager — Scanner: Smartphone-Kamera (html5-qrcode) und
   USB-/Bluetooth-Handscanner im Tastaturmodus (Keyboard-Wedge). window.LVScan */
(function () {
  "use strict";
  var inst = null, running = false, lastText = "", lastAt = 0, torchOn = false;

  function formats() {
    var F = window.Html5QrcodeSupportedFormats; if (!F) return undefined;
    return [F.QR_CODE, F.CODE_128, F.EAN_13, F.EAN_8, F.CODE_39, F.UPC_A, F.UPC_E, F.DATA_MATRIX, F.ITF, F.CODE_93]
      .filter(function (x) { return x != null; });
  }
  function secure() { return location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1"; }
  function supported() { return !!(window.Html5Qrcode && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && secure()); }

  function beep() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      if (!beep.ctx) beep.ctx = new AC();
      var ctx = beep.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square"; o.frequency.value = 1320; g.gain.value = 0.05;
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.08);
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate(50); } catch (e) {}
  }

  function start(elId, onCode) {
    if (!supported()) return Promise.reject(new Error(secure() ? "unsupported" : "insecure"));
    return stop().then(function () {
      var me = inst = new Html5Qrcode(elId, { formatsToSupport: formats(), verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
      var cfg = {
        fps: 10,
        qrbox: function (w, h) { return { width: Math.round(Math.min(w * 0.86, 360)), height: Math.round(Math.min(h * 0.62, 220)) }; },
        aspectRatio: 1.3333, disableFlip: false
      };
      return inst.start({ facingMode: "environment" }, cfg, function (text) {
        var now = Date.now();
        // Gleicher Code zählt erst wieder, wenn er 2,5 s lang nicht mehr im Bild war
        // (sonst zählt die Inventur hoch, solange die Kamera auf dem Etikett bleibt)
        if (text === lastText && now - lastAt < 2500) { lastAt = now; return; }
        lastText = text; lastAt = now; beep(); onCode(String(text).trim());
      }, function () {}).then(function () {
        // Während des Starts (z. B. offener Berechtigungsdialog) wurde stop() gerufen:
        // Stream jetzt freigeben, sonst bleibt die Kamera an
        if (inst !== me) { return me.stop().catch(function () {}).then(function () { try { me.clear(); } catch (e) {} }); }
        running = true; torchOn = false;
      });
    });
  }
  function stop() {
    if (!inst) return Promise.resolve();
    var i = inst; inst = null; running = false; torchOn = false;
    var p = Promise.resolve();
    try { if (i.isScanning) p = i.stop().catch(function () {}); } catch (e) {}
    return p.then(function () { try { i.clear(); } catch (e) {} });
  }
  function torch(on) {
    if (!inst || !running) return Promise.resolve(false);
    try {
      var caps = inst.getRunningTrackCapabilities ? inst.getRunningTrackCapabilities() : null;
      if (!caps || !caps.torch) return Promise.resolve(false);
      return inst.applyVideoConstraints({ advanced: [{ torch: !!on }] }).then(function () { torchOn = !!on; return true; }).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }
  function hasTorch() {
    try { var c = inst && running && inst.getRunningTrackCapabilities ? inst.getRunningTrackCapabilities() : null; return !!(c && c.torch); } catch (e) { return false; }
  }

  // ---------- Handscanner im Tastaturmodus ----------
  // Scanner "tippen" den Code sehr schnell und schließen mit Enter/Tab ab. Wird nur ausgewertet,
  // wenn kein Eingabefeld den Fokus hat (Felder verarbeiten Enter selbst).
  var wedge = { buf: "", first: 0, last: 0, handler: null };
  function onKey(e) {
    if (!wedge.handler || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    var now = Date.now();
    if (e.key === "Enter" || e.key === "Tab") {
      var n = wedge.buf.length, code = wedge.buf; wedge.buf = "";
      if (n >= 3 && (now - wedge.first) / n < 60 && now - wedge.last < 200) { e.preventDefault(); beep(); wedge.handler(code); }
      return;
    }
    if (e.key && e.key.length === 1) {
      if (now - wedge.last > 120) { wedge.buf = ""; wedge.first = now; }
      wedge.buf += e.key; wedge.last = now;
    }
  }
  function attachWedge(handler) { wedge.handler = handler; if (!attachWedge.bound) { document.addEventListener("keydown", onKey, true); attachWedge.bound = true; } }
  function detachWedge() { wedge.handler = null; }

  window.LVScan = { supported: supported, secure: secure, start: start, stop: stop, torch: torch, hasTorch: hasTorch, beep: beep,
    isRunning: function () { return running; }, isTorchOn: function () { return torchOn; }, attachWedge: attachWedge, detachWedge: detachWedge };
})();
