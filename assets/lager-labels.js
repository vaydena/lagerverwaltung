/* Vaydena Lager — Etiketten: QR / Code 128 auf Avery-A4-Bögen oder als Einzeletikett
   (Etikettendrucker). Nutzt qrcode-generator.js und JsBarcode. window.LVLabels */
(function () {
  "use strict";
  var FORMATS = {
    "avery-3474":   { name: "Avery 3474 – 70 × 37 mm (24 je Blatt)",   w: 70,   h: 37,   cols: 3, rows: 8,  ml: 0, mt: 0.5,  gx: 0, gy: 0 },
    "avery-3422":   { name: "Avery 3422 – 70 × 35 mm (24 je Blatt)",   w: 70,   h: 35,   cols: 3, rows: 8,  ml: 0, mt: 8.5,  gx: 0, gy: 0 },
    "avery-3651":   { name: "Avery 3651 – 52,5 × 29,7 mm (40 je Blatt)", w: 52.5, h: 29.7, cols: 4, rows: 10, ml: 0, mt: 0,    gx: 0, gy: 0 },
    "avery-4780":   { name: "Avery 4780 – 48,5 × 25,4 mm (40 je Blatt)", w: 48.5, h: 25.4, cols: 4, rows: 10, ml: 8, mt: 21.5, gx: 0, gy: 0 },
    "avery-3659":   { name: "Avery 3659 – 97 × 42,3 mm (14 je Blatt)",  w: 97,   h: 42.3, cols: 2, rows: 7,  ml: 8, mt: 0.45, gx: 0, gy: 0 },
    "custom-a4":    { name: "Eigener A4-Etikettenbogen …", custom: true, w: 70, h: 37, cols: 3, rows: 8, ml: 0, mt: 0.5, gx: 0, gy: 0 },
    "single-62x29": { name: "Einzeletikett 62 × 29 mm (Etikettendrucker, z. B. Brother DK-11209)", single: true, w: 62, h: 29 },
    "single-50x30": { name: "Einzeletikett 50 × 30 mm (Etikettendrucker)", single: true, w: 50, h: 30 },
    "single-custom":{ name: "Einzeletikett, eigene Größe …", single: true, custom: true, w: 62, h: 29 }
  };
  var STYLE = '<style id="lblStyle">' +
    '.sheet{position:relative;width:210mm;height:297mm;overflow:hidden;background:#fff;page-break-after:always;break-after:page}' +
    '.sheet.single{width:auto;height:auto}' +
    '.lbl{position:absolute;overflow:hidden;box-sizing:border-box;padding:1.4mm;background:#fff;color:#000}' +
    '.sheet.single .lbl{position:relative;left:0;top:0}' +
    '.lbl-in{display:flex;gap:1.4mm;height:100%;align-items:center}' +
    '.lbl.qr .lbl-code{height:100%;aspect-ratio:1/1;flex:0 0 auto}' +
    '.lbl-code svg{width:100%;height:100%;display:block}' +
    '.lbl-txt{flex:1 1 auto;min-width:0;font-family:Arial,Helvetica,sans-serif;line-height:1.15}' +
    '.lbl-name{font-weight:700;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}' +
    '.lbl-sku{font-family:"Courier New",Courier,monospace;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.3mm}' +
    '.lbl-sub{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#333}' +
    '.lbl.c128 .lbl-in{flex-direction:column;align-items:stretch;gap:.6mm}' +
    '.lbl.c128 .lbl-code{flex:1 1 auto;min-height:0}' +
    '.lbl.c128 .lbl-code svg{preserveAspectRatio:none}' +
    '.lbl.c128 .lbl-txt{flex:0 0 auto;text-align:center}' +
    '.lbl.c128 .lbl-name{-webkit-line-clamp:1}' +
    '</style>';

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function mm(n) { return (Math.round(n * 100) / 100) + "mm"; }

  function qrSvg(text) {
    var q = qrcode(0, "M"); q.addData(String(text)); q.make();
    return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
  }
  function code128Svg(text) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try { JsBarcode(svg, String(text), { format: "CODE128", displayValue: false, margin: 0, height: 60, width: 2 }); }
    catch (e) { return qrSvg(text); }
    var w = parseFloat(svg.getAttribute("width")) || 100, h = parseFloat(svg.getAttribute("height")) || 60;
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.removeAttribute("width"); svg.removeAttribute("height"); svg.removeAttribute("style");
    svg.setAttribute("preserveAspectRatio", "none");
    return svg.outerHTML;
  }

  function resolveFormat(id, custom) {
    var f = Object.assign({}, FORMATS[id] || FORMATS["avery-3474"]);
    if (f.custom && custom) {
      ["w", "h", "cols", "rows", "ml", "mt", "gx", "gy"].forEach(function (k) { if (custom[k] != null && !isNaN(custom[k])) f[k] = Number(custom[k]); });
    }
    f.w = Math.max(15, f.w); f.h = Math.max(8, f.h);
    if (!f.single) { f.cols = Math.max(1, f.cols | 0); f.rows = Math.max(1, f.rows | 0); }
    return f;
  }

  // label: {code, name, sub}
  function labelHtml(l, f, type, style) {
    var fs = Math.max(2.2, Math.min(4.6, f.h * 0.105));
    // Code 128 kann nur ASCII – Umlaute usw. automatisch als QR drucken
    if (type === "code128" && !/^[\x20-\x7e]*$/.test(String(l.code))) type = "qr";
    var svg = type === "code128" ? code128Svg(l.code) : qrSvg(l.code);
    var txt = '<div class="lbl-txt">' +
      (l.name ? '<div class="lbl-name" style="font-size:' + mm(fs) + '">' + esc(l.name) + '</div>' : '') +
      '<div class="lbl-sku" style="font-size:' + mm(fs * 0.95) + '">' + esc(l.code) + '</div>' +
      (l.sub ? '<div class="lbl-sub" style="font-size:' + mm(fs * 0.78) + '">' + esc(l.sub) + '</div>' : '') + '</div>';
    return '<div class="lbl ' + (type === "code128" ? "c128" : "qr") + '" style="' + style + '"><div class="lbl-in"><div class="lbl-code">' + svg + '</div>' + txt + '</div></div>';
  }

  // opts: {labels:[{code,name,sub}], format, custom, type:'qr'|'code128', skip, copies}
  function build(opts) {
    var f = resolveFormat(opts.format, opts.custom), type = opts.type === "code128" ? "code128" : "qr";
    var copies = Math.max(1, Math.min(100, (opts.copies | 0) || 1));
    var labels = [];
    (opts.labels || []).forEach(function (l) { for (var i = 0; i < copies; i++) labels.push(l); });
    var html = "", sheets = 0;
    if (f.single) {
      labels.forEach(function (l) {
        html += '<div class="sheet single" style="width:' + mm(f.w) + ';height:' + mm(f.h) + '">' + labelHtml(l, f, type, "width:" + mm(f.w) + ";height:" + mm(f.h)) + "</div>";
      });
      sheets = labels.length;
    } else {
      var per = f.cols * f.rows, skip = Math.max(0, Math.min(per - 1, opts.skip | 0));
      var total = skip + labels.length; sheets = Math.ceil(total / per) || 0;
      for (var s = 0; s < sheets; s++) {
        html += '<div class="sheet">';
        for (var slot = 0; slot < per; slot++) {
          var idx = s * per + slot - skip; if (idx < 0 || idx >= labels.length) continue;
          var col = slot % f.cols, row = Math.floor(slot / f.cols);
          var style = "left:" + mm(f.ml + col * (f.w + f.gx)) + ";top:" + mm(f.mt + row * (f.h + f.gy)) + ";width:" + mm(f.w) + ";height:" + mm(f.h);
          html += labelHtml(labels[idx], f, type, style);
        }
        html += "</div>";
      }
    }
    return { html: html, sheets: sheets, count: labels.length, format: f, single: !!f.single };
  }

  function print(opts) {
    var b = build(opts);
    if (!b.count) return b;
    var area = document.getElementById("printArea");
    if (!area) { area = document.createElement("div"); area.id = "printArea"; document.body.appendChild(area); }
    area.innerHTML = STYLE + b.html;
    var pg = document.getElementById("lblPage");
    if (!pg) { pg = document.createElement("style"); pg.id = "lblPage"; document.head.appendChild(pg); }
    pg.textContent = "@page{size:" + (b.single ? (mm(b.format.w) + " " + mm(b.format.h)) : "A4 portrait") + ";margin:0}";
    setTimeout(function () { try { window.print(); } catch (e) {} }, 200);
    return b;
  }

  // Vorschau: erstes Blatt skaliert in einen Container rendern
  function preview(container, opts, maxWidthPx) {
    var b = build(opts);
    container.innerHTML = "";
    if (!b.count) { container.innerHTML = '<p class="muted">Keine Etiketten ausgewählt.</p>'; return b; }
    var pxPerMm = 96 / 25.4;
    var wmm = b.single ? b.format.w : 210, hmm = b.single ? b.format.h : 297;
    var k = Math.min(1, (maxWidthPx || 360) / (wmm * pxPerMm));
    var wrap = document.createElement("div");
    wrap.style.cssText = "position:relative;overflow:hidden;width:" + Math.round(wmm * pxPerMm * k) + "px;height:" + Math.round(hmm * pxPerMm * k) + "px;border:1px solid var(--line);box-shadow:var(--shadow-s);background:#fff";
    var inner = document.createElement("div");
    inner.style.cssText = "transform:scale(" + k + ");transform-origin:0 0;width:" + wmm + "mm;height:" + hmm + "mm";
    var tmp = document.createElement("div"); tmp.innerHTML = STYLE + b.html;
    var first = tmp.querySelector(".sheet"); tmp.querySelector("style").id = "";
    inner.appendChild(tmp.querySelector("style")); if (first) inner.appendChild(first);
    wrap.appendChild(inner); container.appendChild(wrap);
    return b;
  }

  window.LVLabels = { FORMATS: FORMATS, build: build, print: print, preview: preview, qrSvg: qrSvg, code128Svg: code128Svg, resolveFormat: resolveFormat };
})();
