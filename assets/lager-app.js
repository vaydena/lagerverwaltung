/* Vaydena Lager — App-Logik (app.html): Router, Ansichten, Scannen & Buchen,
   Artikel, Bestand, Journal, Lagerorte, Etiketten, Inventur, Team, Firma, Konto.
   Baut auf LVStore / LVSync / LVScan / LVLabels und window.LV (auth.js) auf. */
(function () {
  "use strict";
  var S = LVStore.S, esc = LV.esc;
  function byId(id) { return document.getElementById(id); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var App = {
    booted: false, view: null, viewName: "", route: { name: "scan", arg: "" }, modal: null, dirtyView: false,
    installPrompt: null, userId: null, userEmail: "",
    cam: { on: false, resume: false },
    scan: { item: null, loc: null, to: null, type: "in", qty: 1, note: "", unknown: null, locInfo: null, queued: null },
    f: { artikel: { q: "", filter: "all", limit: 200 }, bestand: { q: "", loc: "", low: false, zero: false }, journal: { q: "", type: "", loc: "", days: 30, limit: 200 } },
    labels: null, inv: { loc: "", counts: {}, extra: [], zero: false },
    firma: { period: "monat", invoices: null, result: null }, team: { list: null, limit: null, invite: null }
  };
  var VIEWS = {}, ACTIONS = {}, FORMS = {}, INPUTS = {};

  // ---------- Icons ----------
  var ICONS = {
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    building: '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    "in": '<circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/>',
    out: '<circle cx="12" cy="12" r="10"/><polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/>',
    transfer: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    count: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    more: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    warn: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    offline: '<line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    chev: '<polyline points="9 18 15 12 9 6"/>',
    ext: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'
  };
  function ic(name) { return '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.info) + '</svg>'; }

  // ---------- Fehlertexte / Formatierung ----------
  var ERR = Object.assign({}, LV.ERRORS, {
    bad_qty: "Ungültige Menge.", item_not_found: "Artikel auf dem Server nicht gefunden (evtl. gelöscht).",
    location_not_found: "Lagerort auf dem Server nicht gefunden.", to_location_not_found: "Ziel-Lagerort nicht gefunden.",
    same_location: "Von- und Nach-Lagerort sind identisch.", bad_type: "Unbekannte Buchungsart.",
    sku_exists: "Die Artikelnummer ist bereits vergeben.", barcode_exists: "Der Barcode ist bereits einem anderen Artikel zugeordnet.",
    code_exists: "Der Code ist bereits vergeben.", code_required: "Code fehlt.", name_required: "Name fehlt.", sku_required: "Artikelnummer fehlt.",
    bad_id: "Ungültige ID.", bad_plan: "Ungültiger Tarif.", cannot_edit_self: "Die eigene Rolle kann nicht geändert werden.",
    cannot_remove_self: "Der eigene Zugang kann nicht entfernt werden.", bad_member: "Ungültiges Teammitglied.", bad_name: "Der Firmenname ist zu kurz.",
    server_error: "Serverfehler. Bitte später erneut versuchen.", error: "Unbekannter Fehler."
  });
  function errMsg(code) { return ERR[code] || (code ? "Fehler: " + code : ERR.error); }
  function apiErr(res) {
    var code = res && res.data && res.data.error;
    if (code && ERR[code]) return ERR[code];
    return LV.errText(res, "Fehler. Bitte erneut versuchen.");
  }
  var nf = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 });
  function fmtQty(n) { return nf.format(LVStore.round3(n)); }
  // Für Eingabefelder und CSV: ohne Tausenderpunkt, sonst liest parseQty "1.000" als 1
  var nfIn = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3, useGrouping: false });
  function fmtIn(n) { return nfIn.format(LVStore.round3(n)); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmtDate(iso) { if (!iso) return ""; var d = new Date(iso); if (isNaN(d)) return ""; return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function fmtDay(iso) { if (!iso) return ""; var d = new Date(iso); if (isNaN(d)) return ""; return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear(); }
  function relTime(iso) {
    if (!iso) return ""; var t = new Date(iso).getTime(); if (isNaN(t)) return "";
    var s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return "gerade eben"; if (s < 3600) return "vor " + Math.round(s / 60) + " Min.";
    if (s < 86400) return "vor " + Math.round(s / 3600) + " Std."; if (s < 172800) return "gestern";
    return fmtDay(iso);
  }
  function parseQty(v) {
    var t = String(v == null ? "" : v).trim().replace(/\s/g, "");
    if (!t) return null;
    if (t.indexOf(",") >= 0) t = t.replace(/\./g, "").replace(",", ".");
    else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, "");
    if (!/^-?\d*(\.\d+)?$/.test(t) || t === "-" || t === ".") return null;
    var n = Number(t); return isNaN(n) ? null : LVStore.round3(n);
  }
  function settings() { return (S.tenant && S.tenant.settings) || {}; }
  function unitOf(it) { return (it && it.unit) || settings().default_unit || "Stk"; }
  function isAdmin() { return !!(S.member && S.member.role === "admin"); }
  function negAllowed() { return settings().negative_stock !== false; }
  function itemLimit() { return (S.tenant && S.tenant.limits && S.tenant.limits.items) || 1000000; }
  var TYPES = { "in": "Eingang", out: "Ausgang", transfer: "Umlagerung", count: "Zählung" };
  function typeLabel(t) { return TYPES[t] || t; }
  function locShort(id) { var l = S.locations.get(id); return l ? l.code : "?"; }
  function locName(id) { var l = S.locations.get(id); return l ? (l.code + " · " + l.name) : "unbekannter Lagerort"; }
  function isLow(it, total) { return !!(it && it.active !== false && Number(it.min_stock) > 0 && total < Number(it.min_stock)); }
  function categories() {
    var set = {}; LVStore.activeItems().forEach(function (i) { if (i.category) set[i.category] = true; });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, "de"); });
  }
  function defaultLoc() {
    var last = S.meta.last_used_location, l = last && S.locations.get(last);
    if (l && !l.deleted && l.active !== false) return l.id;
    var act = LVStore.activeLocations().filter(function (x) { return x.active !== false; });
    return act.length ? act[0].id : "";
  }
  function locOptions(cur, exclude, blank) {
    var h = blank ? '<option value="">' + esc(blank) + '</option>' : "";
    LVStore.activeLocations().forEach(function (l) {
      if (l.id === exclude) return;
      if (l.active === false && l.id !== cur) return;
      h += '<option value="' + esc(l.id) + '"' + (l.id === cur ? " selected" : "") + '>' + esc(l.code + " · " + l.name) + '</option>';
    });
    return h;
  }
  // Ein Durchlauf über den effektiven Bestand: Gesamt je Artikel, Positionen je Artikel
  function stockIndex() {
    var eff = LVStore.effectiveStock(), totals = new Map(), byItem = new Map(), positions = 0;
    eff.forEach(function (q, k) {
      var p = k.split("|"), item = p[0], loc = p[1];
      if (!S.locations.has(loc)) return;
      totals.set(item, (totals.get(item) || 0) + q);
      if (q !== 0) { positions++; if (!byItem.has(item)) byItem.set(item, []); byItem.get(item).push({ loc: loc, qty: LVStore.round3(q) }); }
    });
    byItem.forEach(function (arr) { arr.sort(function (a, b) { return locShort(a.loc).localeCompare(locShort(b.loc)); }); });
    return { totals: totals, byItem: byItem, positions: positions };
  }
  function allMovements() {
    var arr = S.pending.slice();
    S.movements.forEach(function (m) { arr.push(m); });
    arr.sort(function (a, b) { return (b.created_at || "").localeCompare(a.created_at || ""); });
    return arr;
  }
  function movementsOfItem(id, limit) {
    return allMovements().filter(function (m) { return m.item_id === id; }).slice(0, limit || 50);
  }
  function formVals(f) {
    var o = {};
    $$("input,select,textarea", f).forEach(function (el) {
      if (!el.name) return;
      if (el.type === "checkbox") o[el.name] = el.checked; else o[el.name] = el.value.trim();
    });
    return o;
  }
  function nameOfMember(id) { return LVStore.memberName(id) || "–"; }

  // ---------- Toast / Modal / Dialoge ----------
  function toast(msg, kind, ms) {
    var box = byId("toasts"); if (!box) return;
    var t = document.createElement("div"); t.className = "toast" + (kind ? " " + kind : ""); t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320); }, ms || 2600);
  }
  function modal(o) {
    var host = byId("modal"); if (!host) return;
    closeModal(true);
    App.modal = o;
    host.innerHTML = '<div class="modal-bg" data-act="modal-bg"><div class="modal' + (o.wide ? " wide" : "") + '" role="dialog" aria-modal="true">' +
      '<div class="mhead"><h2>' + esc(o.title || "") + '</h2>' + (o.noClose ? "" : '<button class="iconbtn" type="button" data-act="modal-close" aria-label="Schließen">' + ic("x") + '</button>') + '</div>' +
      (o.body || "") + (o.foot ? '<div class="foot">' + o.foot + '</div>' : "") + '</div></div>';
    host.hidden = false; document.body.classList.add("noscroll");
    if (o.onMount) { try { o.onMount(host); } catch (e) { console.error(e); } }
    var first = $("input:not([type=hidden]):not([type=checkbox]),select,textarea", host);
    if (first && window.matchMedia && matchMedia("(pointer:fine)").matches) { try { first.focus(); } catch (e) {} }
  }
  function closeModal(silent) {
    var host = byId("modal"), o = App.modal;
    App.modal = null;
    if (host) { host.innerHTML = ""; host.hidden = true; }
    document.body.classList.remove("noscroll");
    if (o && o.onClose && !silent) { try { o.onClose(); } catch (e) { console.error(e); } }
    if (App.dirtyView && !App.modal) { App.dirtyView = false; renderView(); }
  }
  function confirmDlg(msg, o) {
    o = o || {};
    return new Promise(function (resolve) {
      var done = false;
      function fin(v) { if (done) return; done = true; resolve(v); }
      modal({
        title: o.title || "Bitte bestätigen",
        body: o.html ? o.html : '<p>' + esc(msg) + '</p>',
        foot: '<button class="btn ghost" type="button" data-act="modal-close">Abbrechen</button><button class="btn ' + (o.danger ? "danger" : "primary") + '" type="button" data-act="confirm-ok">' + esc(o.ok || "OK") + '</button>',
        onClose: function () { fin(false); }
      });
      App.modal._confirm = function () { fin(true); closeModal(true); };
    });
  }
  ACTIONS["confirm-ok"] = function () { if (App.modal && App.modal._confirm) App.modal._confirm(); };
  ACTIONS["modal-close"] = function () { closeModal(); };
  ACTIONS["welcome-new-item"] = function () { closeModal(); nav("artikel/neu"); };
  ACTIONS["modal-bg"] = function (el, e) { if (e && e.target === el) closeModal(); };

  function pickItem(title, onPick) {
    function list(q) {
      var arr = LVStore.findItems(q, 40);
      if (!arr.length) return '<div class="empty">Kein Artikel gefunden.</div>';
      return arr.map(function (i) {
        return '<button class="row" type="button" data-act="pick-item" data-id="' + esc(i.id) + '"><div class="ic">' + ic("box") + '</div><div class="txt"><div class="t">' + esc(i.name) + '</div><div class="s">' + esc(i.sku) + (i.category ? " · " + esc(i.category) : "") + '</div></div>' + ic("chev") + '</button>';
      }).join("");
    }
    modal({
      title: title || "Artikel wählen",
      body: '<div class="tools"><input class="search" type="search" placeholder="Name, Artikelnummer, Barcode …" data-input="pick-q" autocomplete="off"></div><div class="list" id="pickList">' + list("") + '</div>',
      onMount: function () { App.modal._pick = onPick; App.modal._list = list; }
    });
  }
  INPUTS["pick-q"] = function (el) { var l = byId("pickList"); if (l && App.modal && App.modal._list) l.innerHTML = App.modal._list(el.value); };
  ACTIONS["pick-item"] = function (el) {
    var it = S.items.get(el.getAttribute("data-id")), fn = App.modal && App.modal._pick;
    closeModal(true); if (it && fn) fn(it);
  };
  ACTIONS["copy-text"] = function (el) {
    var t = el.getAttribute("data-text") || "";
    var p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject();
    p.then(function () { toast("Kopiert.", "ok"); }).catch(function () { window.prompt("Zum Kopieren markieren:", t); });
  };

  // ---------- CSV / Download ----------
  function csvCell(v) {
    if (v == null) v = "";
    if (typeof v === "number") v = String(v).replace(".", ",");
    v = String(v);
    if (/^[=+\-@\t\r]/.test(v) && !/^-?\d+(,\d+)?$/.test(v)) v = "'" + v; // Excel-Formeln entschärfen, Zahlen nicht
    return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function csvText(rows) { return "\ufeff" + rows.map(function (r) { return r.map(csvCell).join(";"); }).join("\r\n") + "\r\n"; }
  function download(name, text, mime) {
    var blob = new Blob([text], { type: (mime || "text/csv") + ";charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 1500);
  }
  function parseCsv(text) {
    text = String(text || "").replace(/^\ufeff/, "");
    var first = text.split(/\r?\n/, 1)[0] || "";
    var delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";
    if ((first.match(/\t/g) || []).length > (first.match(new RegExp(delim === ";" ? ";" : ",", "g")) || []).length) delim = "\t";
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.map(function (r) { return r.map(function (x) { return x.trim(); }); }).filter(function (r) { return r.some(function (x) { return x !== ""; }); });
  }
  function fileDate() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  // ---------- Bewegungszeile ----------
  function movRow(m, o) {
    o = o || {};
    var it = S.items.get(m.item_id), name = it ? it.name : "gelöschter Artikel", unit = unitOf(it);
    var sub = esc(typeLabel(m.type)) + " · " + esc(locShort(m.location_id)) + (m.type === "transfer" ? " → " + esc(locShort(m.to_location_id)) : "");
    if (o.showItem !== false && it) sub = esc(it.sku) + " · " + sub;
    if (m.note) sub += " · " + esc(m.note);
    if (o.who !== false && m.member_id) sub += " · " + esc(nameOfMember(m.member_id));
    sub += " · " + esc(relTime(m.created_at)) + (m.pending ? " · <b>wartet</b>" : "");
    var q, cls;
    if (m.type === "count") { q = "= " + fmtQty(m.qty) + (m.delta != null ? " (" + (m.delta >= 0 ? "+" : "") + fmtQty(m.delta) + ")" : ""); cls = ""; }
    else if (m.type === "in") { q = "+" + fmtQty(m.qty); cls = " plus"; }
    else if (m.type === "out") { q = "−" + fmtQty(m.qty); cls = " minus"; }
    else { q = fmtQty(m.qty); cls = ""; }
    var inner = '<div class="ic ' + esc(m.type) + '">' + ic(m.type) + '</div><div class="txt"><div class="t">' + esc(name) + '</div><div class="s">' + sub + '</div></div><div class="q' + cls + '">' + esc(q) + '<small>' + esc(unit) + '</small></div>';
    if (o.href) return '<a class="row' + (m.pending ? " pending" : "") + '" href="' + esc(o.href) + '">' + inner + '</a>';
    return '<div class="row' + (m.pending ? " pending" : "") + '">' + inner + '</div>';
  }

  // ---------- Kamera ----------
  function camPref() { try { return localStorage.getItem("lv_cam") === "1"; } catch (e) { return false; } }
  function setCamPref(v) { try { localStorage.setItem("lv_cam", v ? "1" : "0"); } catch (e) {} }
  function renderScanbox(boxId, readerId, on) {
    var box = byId(boxId); if (!box) return;
    if (on) {
      box.innerHTML = '<div class="reader" id="' + readerId + '"></div><div class="scanctl"><button type="button" class="hide" data-act="cam-torch">Licht</button><button type="button" data-act="cam-off">Kamera aus</button></div>';
    } else if (!LVScan.supported()) {
      var why = LVScan.secure() ? "Dieser Browser unterstützt keinen Kamerazugriff. Handscanner (Tastaturmodus) und die Eingabe unten funktionieren trotzdem." : "Kamera nur über HTTPS möglich.";
      box.innerHTML = '<div class="scanoff">' + ic("camera") + '<p>' + esc(why) + '</p></div>';
    } else {
      box.innerHTML = '<div class="scanoff">' + ic("camera") + '<p>Barcode oder QR-Code mit der Kamera scannen – oder Handscanner nutzen bzw. Code unten eingeben.</p><button class="btn gold" type="button" data-act="cam-on">Kamera starten</button></div>';
    }
  }
  function camErr(e) {
    var m = (e && (e.message || e.name || String(e))) || "";
    if (/insecure/.test(m)) return "Kamera nur über HTTPS möglich.";
    if (/unsupported/.test(m)) return "Kamera wird von diesem Browser nicht unterstützt.";
    if (/NotAllowed|Permission|denied/i.test(m)) return "Kamerazugriff wurde abgelehnt. Bitte in den Browser-Einstellungen erlauben.";
    if (/NotFound|no camera|Requested device not found/i.test(m)) return "Keine Kamera gefunden.";
    return "Kamera konnte nicht gestartet werden.";
  }
  function startCam(boxId, readerId, handler) {
    renderScanbox(boxId, readerId, true);
    return LVScan.start(readerId, handler).then(function () {
      App.cam.on = true; setCamPref(true);
      var tb = $('#' + boxId + ' [data-act="cam-torch"]'); if (tb) tb.classList.toggle("hide", !LVScan.hasTorch());
    }).catch(function (e) {
      App.cam.on = false; setCamPref(false); toast(camErr(e), "err", 4000); renderScanbox(boxId, readerId, false);
    });
  }
  function stopCam(boxId, readerId) {
    App.cam.on = false; setCamPref(false);
    return LVScan.stop().then(function () { renderScanbox(boxId, readerId, false); });
  }
  ACTIONS["cam-on"] = function () { var c = App.view && App.view.cam; if (c) startCam(c.box, c.reader, c.handler); };
  ACTIONS["cam-off"] = function () { var c = App.view && App.view.cam; if (c) stopCam(c.box, c.reader); };
  ACTIONS["cam-torch"] = function (el) { LVScan.torch(!LVScan.isTorchOn()).then(function (ok) { el.textContent = LVScan.isTorchOn() ? "Licht aus" : "Licht"; if (!ok) toast("Kein Licht verfügbar.", "warn"); }); };

  // Overlay: Code in ein Formularfeld scannen
  var overlay = { open: false, resume: false };
  function openOverlay(title, onCode) {
    if (!LVScan.supported()) { toast(LVScan.secure() ? "Kamera nicht verfügbar." : "Kamera nur über HTTPS möglich.", "warn"); return; }
    var host = byId("overlay"); if (!host) { host = document.createElement("div"); host.id = "overlay"; document.body.appendChild(host); }
    overlay.resume = LVScan.isRunning(); overlay.open = true;
    host.innerHTML = '<div class="scanoverlay"><div class="top"><span>' + esc(title || "Scannen") + '</span><div class="spacer"></div><button class="btn ghost on-navy sm" type="button" data-act="overlay-close">Schließen</button></div><div class="reader" id="ovReader"></div></div>';
    LVScan.start("ovReader", function (code) { closeOverlay(); try { onCode(code); } catch (e) { console.error(e); } })
      .catch(function (e) { toast(camErr(e), "err", 4000); closeOverlay(); });
  }
  function closeOverlay() {
    if (!overlay.open) return;
    overlay.open = false;
    var host = byId("overlay");
    LVScan.stop().then(function () {
      if (host) host.innerHTML = "";
      if (overlay.resume && App.view && App.view.cam && camPref()) { var c = App.view.cam; startCam(c.box, c.reader, c.handler); }
      overlay.resume = false;
    });
  }
  ACTIONS["overlay-close"] = function () { closeOverlay(); };

  // ---------- Navigation / Router ----------
  var NAV = [
    { id: "scan", label: "Scannen", icon: "scan" }, { id: "artikel", label: "Artikel", icon: "box" },
    { id: "bestand", label: "Bestand", icon: "layers" }, { id: "journal", label: "Journal", icon: "list" },
    { id: "lagerorte", label: "Lagerorte", icon: "pin" }, { id: "etiketten", label: "Etiketten", icon: "tag" },
    { id: "inventur", label: "Inventur", icon: "clipboard" }, { id: "team", label: "Team", icon: "users", admin: true },
    { id: "firma", label: "Firma & Abo", icon: "building" }, { id: "konto", label: "Konto", icon: "user" }
  ];
  function navItems() { return NAV.filter(function (n) { return !n.admin || isAdmin(); }); }
  function renderNav() {
    var items = navItems(), side = byId("sidenav"), bottom = byId("bottomnav"), more = byId("moresheet");
    function link(n) { return '<a href="#' + n.id + '" data-nav="' + n.id + '">' + ic(n.icon) + '<span>' + esc(n.label) + '</span></a>'; }
    if (side) side.innerHTML = items.map(link).join("") + '<div class="sep"></div><div class="who"><b>' + esc(S.tenant ? S.tenant.name : "") + '</b>' + esc(S.member ? (S.member.name || S.member.email) : "") + ' · ' + (isAdmin() ? "Admin" : "Mitarbeiter") + '</div>';
    if (bottom) bottom.innerHTML = items.slice(0, 4).map(link).join("") + '<a href="#" data-act="more" data-nav="__more">' + ic("more") + '<span>Mehr</span></a>';
    if (more) more.innerHTML = items.slice(4).map(link).join("");
    markNav();
  }
  function markNav() {
    var name = App.route.name, top = navItems().slice(0, 4).some(function (n) { return n.id === name; });
    $$("[data-nav]").forEach(function (a) { var id = a.getAttribute("data-nav"); a.classList.toggle("on", id === name || (id === "__more" && !top)); });
  }
  function closeMore() { var m = byId("moresheet"); if (m) m.classList.remove("open"); }
  ACTIONS["more"] = function () { var m = byId("moresheet"); if (m) m.classList.toggle("open"); };
  function parseHash() {
    var h = (location.hash || "").replace(/^#\/?/, ""), i = h.indexOf("/");
    var name = i >= 0 ? h.slice(0, i) : h, arg = i >= 0 ? h.slice(i + 1) : "";
    try { arg = decodeURIComponent(arg); } catch (e) {}
    return { name: name || "scan", arg: arg };
  }
  function nav(hash) { if (("#" + hash) === location.hash) route(); else location.hash = hash; }
  function route() {
    var r = parseHash(), def = NAV.filter(function (n) { return n.id === r.name; })[0];
    if (!VIEWS[r.name] || (def && def.admin && !isAdmin())) { location.replace("#scan"); return; }
    if (App.view && App.viewName !== r.name && App.view.unmount) { try { App.view.unmount(); } catch (e) { console.error(e); } }
    closeModal(true); closeMore(); closeOverlay();
    App.viewName = r.name; App.view = VIEWS[r.name]; App.route = r; App.dirtyView = false;
    renderView(); window.scrollTo(0, 0);
  }
  function renderView() {
    var el = byId("view"), v = App.view; if (!el || !v) return;
    App.dirtyView = false;
    el.innerHTML = v.render(App.route.arg);
    if (v.mount) { try { v.mount(el, App.route.arg); } catch (e) { console.error(e); } }
    var t = (typeof v.title === "function" ? v.title(App.route.arg) : v.title) || "Lager";
    var tt = byId("title"); if (tt) tt.textContent = t;
    document.title = t + " – Vaydena Lager";
    markNav();
  }
  function softRender() {
    var a = document.activeElement, view = byId("view");
    if (a && view && view.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { App.dirtyView = true; return; }
    if (App.modal) { App.dirtyView = true; return; }
    renderView();
  }
  function refresh(evt) { var v = App.view; if (!v) return; if (v.update) { try { v.update(evt); } catch (e) { console.error(e); } } else softRender(); }

  // ---------- Ereignisse ----------
  function bindEvents() {
    document.addEventListener("click", function (e) {
      var el = e.target.closest("[data-act]"); if (!el) return;
      var act = el.getAttribute("data-act"), fn = ACTIONS[act];
      if (!fn) return;
      if (el.tagName === "A" || el.tagName === "BUTTON") e.preventDefault();
      try { fn(el, e); } catch (err) { console.error(err); toast("Fehler: " + (err && err.message), "err"); }
    });
    document.addEventListener("submit", function (e) {
      var f = e.target.closest("form[data-form]"); if (!f) return;
      e.preventDefault();
      var fn = FORMS[f.getAttribute("data-form")]; if (!fn) return;
      try { fn(f, e); } catch (err) { console.error(err); toast("Fehler: " + (err && err.message), "err"); }
    });
    document.addEventListener("input", function (e) {
      var el = e.target.closest("[data-input]"); if (!el) return;
      var fn = INPUTS[el.getAttribute("data-input")]; if (fn) { try { fn(el, e); } catch (err) { console.error(err); } }
    });
    document.addEventListener("change", function (e) {
      var el = e.target.closest("[data-change]"); if (!el) return;
      var fn = INPUTS[el.getAttribute("data-change")]; if (fn) { try { fn(el, e); } catch (err) { console.error(err); } }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { if (overlay.open) closeOverlay(); else if (App.modal && !App.modal.noClose) closeModal(); else closeMore(); return; }
      if (e.key === "Enter" && e.target && e.target.tagName === "INPUT") {
        if (e.target.hasAttribute("data-noenter")) { e.preventDefault(); return; }
        var act = e.target.getAttribute("data-enter");
        if (act && ACTIONS[act]) { e.preventDefault(); ACTIONS[act](e.target, e); }
      }
    });
    document.addEventListener("focusout", function () {
      setTimeout(function () {
        if (!App.dirtyView || App.modal) return;
        var a = document.activeElement, view = byId("view");
        if (a && view && view.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
        App.dirtyView = false; renderView();
      }, 60);
    }, true);
    window.addEventListener("hashchange", route);
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); App.installPrompt = e; if (App.viewName === "konto") softRender(); });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { if (LVScan.isRunning() && !overlay.open) { App.cam.resume = true; LVScan.stop(); } }
      else if (App.cam.resume) { App.cam.resume = false; var c = App.view && App.view.cam; if (c && camPref()) startCam(c.box, c.reader, c.handler); }
    });
    LVScan.attachWedge(function (code) {
      if (App.modal || overlay.open) return;
      if (App.view && App.view.onWedge) App.view.onWedge(code);
      else { App.scan.queued = code; nav("scan"); }
    });
  }

  // ---------- Hinweisleisten / Sync-Anzeige ----------
  function subText(t) {
    var sub = t && t.sub; if (!sub) return "";
    if (sub.active && sub.reason === "grace") return "Zahlung überfällig – Karenzzeit bis " + fmtDay(sub.until) + ".";
    if (sub.active) return (t.plan === "trial" ? "Testphase" : (t.plan_label || t.plan)) + (sub.days_left != null ? " – noch " + sub.days_left + " Tag" + (sub.days_left === 1 ? "" : "e") : "") + (sub.until ? " (bis " + fmtDay(sub.until) + ")" : "") + ".";
    var why = { gesperrt: "Das Konto ist gesperrt.", trial_expired: "Die Testphase ist abgelaufen.", unpaid: "Die Rechnung ist noch offen.", expired: "Das Abo ist abgelaufen." };
    return why[sub.reason] || "Das Abo ist nicht aktiv.";
  }
  function renderBanners() {
    var host = byId("banners"); if (!host || !S.tenant) return;
    var st = LVSync.st, c = LVSync.counts(), h = "";
    function b(kind, icon, text, href, link) { h += '<div class="banner ' + kind + '">' + ic(icon) + '<span>' + text + '</span>' + (href ? '<a href="' + esc(href) + '">' + esc(link) + '</a>' : "") + '</div>'; }
    if (st.blocked === "member_inactive") b("err", "warn", "Dein Zugang wurde deaktiviert. Bitte an den Administrator wenden.");
    else if (st.blocked === "not_registered") b("err", "warn", "Dieses Konto gehört zu keinem Betrieb.", "registrieren.html", "Registrieren");
    if (st.authLost) b("err", "warn", "Die Anmeldung ist abgelaufen. Änderungen bleiben auf dem Gerät gespeichert.", "anmelden.html?next=app.html", "Neu anmelden");
    if (st.offline) b("off", "offline", "Offline – Buchungen werden auf dem Gerät gespeichert" + (c.pending ? " (" + c.pending + " wartend)" : "") + ".");
    var t = S.tenant, sub = t.sub || {};
    if (!sub.active) {
      var msg = subText(t) + " Buchungen bleiben auf dem Gerät gespeichert und werden nach Freischaltung übertragen.";
      if (isAdmin()) b("err", "warn", msg, "#firma", sub.reason === "gesperrt" ? "Kontakt" : "Tarif wählen"); else b("err", "warn", msg + " Bitte den Administrator informieren.");
    } else if (sub.reason === "grace") b("warn", "warn", subText(t), isAdmin() ? "#firma" : null, "Rechnungen");
    else if (t.plan === "trial" && sub.days_left != null && sub.days_left <= 7) b("info", "info", "Testphase endet in " + sub.days_left + " Tag" + (sub.days_left === 1 ? "" : "en") + ".", isAdmin() ? "#firma" : null, "Tarif wählen");
    if (c.conflicts) b("warn", "warn", c.conflicts + " Änderung" + (c.conflicts === 1 ? "" : "en") + " wurde" + (c.conflicts === 1 ? "" : "n") + " vom Server abgelehnt.", "#konto", "Prüfen");
    if (c.failed) b("warn", "warn", c.failed + " Buchung" + (c.failed === 1 ? "" : "en") + " abgelehnt.", "#journal", "Anzeigen");
    if (!S.persistent) b("warn", "warn", "Dieser Browser speichert keine Daten dauerhaft (privater Modus?). Offline-Buchungen gehen beim Schließen verloren.");
    host.innerHTML = h;
  }
  function renderSyncdot() {
    var el = byId("syncdot"); if (!el) return;
    var st = LVSync.st, c = LVSync.counts(), cls = "", txt = "Aktuell";
    if (st.syncing) { cls = "busy"; txt = "Abgleich …"; }
    else if (st.offline) { cls = ""; txt = "Offline" + (c.pending ? " · " + c.pending : ""); }
    else if (st.authLost) { cls = "err"; txt = "Anmeldung nötig"; }
    else if (st.blocked) { cls = "err"; txt = "Gesperrt"; }
    else if (st.subInactive) { cls = "err"; txt = "Abo inaktiv"; }
    else if (c.conflicts || c.failed) { cls = "err"; txt = (c.conflicts + c.failed) + " Fehler"; }
    else if (st.lastError) { cls = "err"; txt = "Fehler"; }
    else if (c.pending) { cls = "pend"; txt = c.pending + " wartend"; }
    else { cls = "ok"; }
    el.className = "syncdot " + cls; var s = $("span", el); if (s) s.textContent = txt;
    el.title = st.lastError ? errMsg(st.lastError) : (S.meta.last_sync ? "Letzter Abgleich: " + fmtDate(S.meta.last_sync) : "");
  }
  ACTIONS["go-konto"] = function () { nav("konto"); };
  ACTIONS["sync-now"] = function () {
    if (!navigator.onLine) { toast("Offline – Abgleich sobald wieder eine Verbindung besteht.", "warn"); return; }
    LVSync.sync("manual").then(function (r) { if (r && r.ok) toast("Abgleich abgeschlossen.", "ok"); else if (r && r.busy) toast("Abgleich läuft bereits."); else toast(errMsg(LVSync.st.lastError), "err", 4000); });
  };

  // ---------- Start ----------
  function splash(kind, extra) {
    var el = byId("view"); if (!el) return;
    var h = '<div class="splash"><div class="box">';
    if (kind === "loading") h += '<div class="spinner"></div><p class="muted">Daten werden geladen …</p>';
    else if (kind === "offline") h += ic("offline") + '<h2>Offline</h2><p class="muted">Für den ersten Start wird einmalig eine Internetverbindung benötigt.</p><button class="btn primary" type="button" data-act="retry-first">Erneut versuchen</button>';
    else if (kind === "not_registered") h += ic("warn") + '<h2>Kein Betrieb zugeordnet</h2><p class="muted">Dieses Konto gehört zu keinem registrierten Betrieb. Bitte registrieren oder eine Einladung des Administrators nutzen.</p><div class="btnrow" style="justify-content:center"><a class="btn primary" href="registrieren.html">Registrieren</a><button class="btn ghost" type="button" data-act="logout">Abmelden</button></div>';
    else if (kind === "member_inactive") h += ic("warn") + '<h2>Zugang deaktiviert</h2><p class="muted">Dein Zugang wurde deaktiviert. Bitte an den Administrator wenden.</p><button class="btn ghost" type="button" data-act="logout">Abmelden</button>';
    else h += ic("warn") + '<h2>Laden fehlgeschlagen</h2><p class="muted">' + esc(extra || "Bitte erneut versuchen.") + '</p><div class="btnrow" style="justify-content:center"><button class="btn primary" type="button" data-act="retry-first">Erneut versuchen</button><button class="btn ghost" type="button" data-act="logout">Abmelden</button></div>';
    el.innerHTML = h + '</div></div>';
  }
  function afterFirstSync() {
    var st = LVSync.st;
    if (S.tenant && S.member) { firstRender(); return; }
    if (st.blocked === "not_registered") return splash("not_registered");
    if (st.blocked === "member_inactive") return splash("member_inactive");
    if (st.authLost) { LV.signOut().then(function () { location.replace("anmelden.html?next=app.html"); }); return; }
    if (st.offline || !navigator.onLine) return splash("offline");
    splash("error", errMsg(st.lastError));
  }
  ACTIONS["retry-first"] = function () { splash("loading"); LVSync.sync("retry").then(afterFirstSync); };
  ACTIONS["logout"] = function () { LV.signOut().then(function () { location.replace("anmelden.html"); }); };
  function firstRender() {
    if (App.booted) return;
    App.booted = true;
    loadLabelPrefs(); renderNav(); route(); renderBanners(); renderSyncdot();
    if (LV.qs("welcome") === "1") {
      try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
      if (isAdmin()) welcome();
    }
  }
  function welcome() {
    modal({
      title: "Willkommen bei Vaydena Lager",
      body: '<p>In vier Schritten ist das Lager einsatzbereit:</p><div class="obsteps">' +
        '<div class="obstep"><div class="n">1</div><div><b>Lagerorte anlegen</b><span>Der Lagerort „L-001 · Hauptlager“ ist schon da. Weitere unter <em>Lagerorte</em>.</span></div></div>' +
        '<div class="obstep"><div class="n">2</div><div><b>Artikel anlegen oder importieren</b><span>Einzeln oder per CSV-Import (z. B. aus Excel) unter <em>Artikel</em>.</span></div></div>' +
        '<div class="obstep"><div class="n">3</div><div><b>Etiketten drucken</b><span>QR-Codes oder Barcodes für Artikel und Lagerorte unter <em>Etiketten</em>.</span></div></div>' +
        '<div class="obstep"><div class="n">4</div><div><b>Scannen &amp; buchen</b><span>Eingang, Ausgang, Umlagerung und Zählung – auch offline.</span></div></div></div>',
      foot: '<a class="btn ghost" href="#artikel/neu" data-act="welcome-new-item">Ersten Artikel anlegen</a><button class="btn primary" type="button" data-act="modal-close">Los geht’s</button>'
    });
  }
  function bindGlobal() {
    LVStore.on("change", function (evt) {
      if (!App.booted) { if (evt && evt.kind === "pull" && S.tenant && S.member) firstRender(); return; }
      if (evt && evt.kind === "push" && evt.rejected) toast(evt.rejected + " Buchung" + (evt.rejected === 1 ? "" : "en") + " vom Server abgelehnt – siehe Journal.", "err", 4500);
      if (evt && evt.kind === "pull") renderNav();
      renderBanners(); renderSyncdot(); refresh(evt);
    });
    LVStore.on("sync", function () { renderSyncdot(); if (App.booted) renderBanners(); if (App.booted && App.viewName === "konto" && !LVSync.st.syncing) softRender(); });
  }
  function boot() {
    var sess = LV.storedSession();
    if (!sess || !sess.user) { LV.requireSession("app.html" + location.search + location.hash); return; }
    App.userId = sess.user.id; App.userEmail = sess.user.email || "";
    bindEvents(); bindGlobal();
    LVStore.init(App.userId).then(function () {
      LVSync.start();
      if (S.tenant && S.member) { firstRender(); LVSync.sync("boot"); return; }
      if (!navigator.onLine) { splash("offline"); return; }
      splash("loading");
      LVSync.sync("first").then(afterFirstSync);
    }).catch(function (e) { console.error(e); splash("error", (e && e.message) || ""); });
  }

  // =====================================================================
  // Scannen & Buchen
  // =====================================================================
  function scanReset() { var sc = App.scan; sc.item = null; sc.unknown = null; sc.locInfo = null; sc.qty = 1; sc.note = ""; sc.to = null; }
  function scanSelect(it) {
    var sc = App.scan;
    sc.item = it; sc.unknown = null; sc.locInfo = null; sc.qty = 1; sc.note = ""; sc.to = null;
    if (!sc.loc || !S.locations.get(sc.loc)) sc.loc = defaultLoc();
  }
  function onScanCode(text, src) {
    var sc = App.scan, r = LVStore.resolveCode(text);
    if (!r) {
      var hits = LVStore.findItems(text, 1);
      if (src === "input" && hits.length) r = { kind: "item", rec: hits[0] };
      else { sc.unknown = String(text).trim(); sc.item = null; sc.locInfo = null; renderScanResult(); return; }
    }
    if (r.kind === "location") {
      var loc = r.rec;
      if (sc.item) {
        if (sc.type === "transfer" && sc.loc && sc.loc !== loc.id) { sc.to = loc.id; toast("Ziel: " + loc.code + " · " + loc.name); }
        else { sc.loc = loc.id; if (sc.to === loc.id) sc.to = null; toast("Lagerort: " + loc.code + " · " + loc.name); }
      } else { sc.loc = loc.id; sc.locInfo = loc; sc.unknown = null; }
      renderScanResult(); return;
    }
    if (sc.item && sc.item.id === r.rec.id && src === "wedge") { sc.qty = LVStore.round3((parseQty(sc.qty) || 0) + 1); }
    else scanSelect(r.rec);
    renderScanResult();
    if (src !== "input") { var q = byId("scanQty"); if (q && window.matchMedia && matchMedia("(pointer:fine)").matches) { q.focus(); q.select(); } }
  }
  function scanStockLine(it) {
    var st = LVStore.stockOf(it.id), h = '<div class="stockline"><span class="tot">Gesamt ' + esc(fmtQty(st.total)) + ' ' + esc(unitOf(it)) + '</span>';
    st.byLoc.forEach(function (b) { h += '<span class="chip">' + esc(b.location.code) + ' <b>' + esc(fmtQty(b.qty)) + '</b></span>'; });
    if (isLow(it, st.total)) h += '<span class="chip warn">unter Min. ' + esc(fmtQty(it.min_stock)) + '</span>';
    if (it.active === false) h += '<span class="chip err">inaktiv</span>';
    return h + '</div>';
  }
  function renderScanResult() {
    var box = byId("scanResult"); if (!box) return;
    var sc = App.scan, h = "";
    if (sc.unknown) {
      h = '<div class="card warn"><h2>Unbekannter Code</h2><p>„<span class="mono">' + esc(sc.unknown) + '</span>“ ist keinem Artikel oder Lagerort zugeordnet.</p><div class="btnrow">' +
        '<button class="btn primary" type="button" data-act="scan-new-item">Neuen Artikel anlegen</button>' +
        '<button class="btn ghost" type="button" data-act="scan-assign">Vorhandenem Artikel zuordnen</button>' +
        '<button class="btn ghost" type="button" data-act="scan-clear">Verwerfen</button></div></div>';
    } else if (sc.locInfo) {
      var loc = sc.locInfo, rows = LVStore.stockAtLocation(loc.id);
      h = '<div class="card rescard"><div class="head"><div><div class="name">' + esc(loc.code + " · " + loc.name) + '</div><div class="code">Lagerort' + (loc.note ? " · " + esc(loc.note) : "") + '</div></div><button class="iconbtn" type="button" data-act="scan-clear" aria-label="Schließen">' + ic("x") + '</button></div>' +
        '<p class="note" style="margin:10px 0">Als Buchungs-Lagerort übernommen. Jetzt einen Artikel scannen.</p>';
      if (rows.length) { h += '<div class="chips">'; rows.slice(0, 12).forEach(function (r) { h += '<span class="chip">' + esc(r.item.name) + ' <b>' + esc(fmtQty(r.qty)) + '</b></span>'; }); if (rows.length > 12) h += '<span class="chip">+' + (rows.length - 12) + ' weitere</span>'; h += '</div>'; }
      else h += '<p class="note">Kein Bestand an diesem Lagerort.</p>';
      h += '<div class="btnrow"><button class="btn ghost sm" type="button" data-act="scan-loc-stock">Bestand anzeigen</button><button class="btn ghost sm" type="button" data-act="scan-loc-inv">Inventur hier</button></div></div>';
    } else if (sc.item) {
      var it = sc.item, unit = unitOf(it), q = parseQty(sc.qty), hint = "";
      var cur = sc.loc ? LVStore.qtyAt(it.id, sc.loc) : 0;
      if (q != null) {
        if (sc.type === "in") hint = "Bestand danach: " + fmtQty(cur + q) + " " + esc(unit);
        else if (sc.type === "count") hint = "Aktuell " + fmtQty(cur) + " " + esc(unit) + " · Differenz " + (q - cur >= 0 ? "+" : "") + fmtQty(q - cur);
        else hint = "Verfügbar: " + fmtQty(cur) + " " + esc(unit) + (q > cur ? " · <b style=\"color:#a32020\">Bestand wird negativ</b>" : "");
      }
      h = '<div class="card rescard"><div class="head"><div><div class="name">' + esc(it.name) + '</div><div class="code">' + esc(it.sku) + (it.barcode ? " · " + esc(it.barcode) : "") + (it.category ? " · " + esc(it.category) : "") + '</div></div>' +
        '<a class="iconbtn" href="#artikel/' + esc(it.id) + '" aria-label="Artikel öffnen">' + ic("info") + '</a><button class="iconbtn" type="button" data-act="scan-clear" aria-label="Schließen">' + ic("x") + '</button></div>' +
        scanStockLine(it) +
        '<div class="seg">' + ["in", "out", "transfer", "count"].map(function (t) { return '<button type="button" data-act="scan-type" data-v="' + t + '"' + (sc.type === t ? ' class="on"' : "") + '>' + typeLabel(t) + '</button>'; }).join("") + '</div>' +
        '<div class="' + (sc.type === "transfer" ? "f2" : "") + '"><div class="field"><label>' + (sc.type === "transfer" ? "Von" : "Lagerort") + '</label><select data-change="scan-loc">' + locOptions(sc.loc, null, "– Lagerort wählen –") + '</select></div>' +
        (sc.type === "transfer" ? '<div class="field"><label>Nach</label><select data-change="scan-to">' + locOptions(sc.to, sc.loc, "– Ziel wählen –") + '</select></div>' : "") + '</div>' +
        '<div class="field"><label>' + (sc.type === "count" ? "Gezählte Menge" : "Menge") + '</label><div class="stepper"><button type="button" data-act="scan-minus" aria-label="weniger">−</button><input id="scanQty" type="text" inputmode="decimal" value="' + esc(typeof sc.qty === "number" ? fmtIn(sc.qty) : String(sc.qty == null ? "" : sc.qty)) + '" data-input="scan-qty" data-enter="book" autocomplete="off"><button type="button" data-act="scan-plus" aria-label="mehr">+</button><span class="unit">' + esc(unit) + '</span></div>' +
        (hint ? '<div class="hint">' + hint + '</div>' : "") + '</div>' +
        '<div class="field"><label>Notiz (optional)</label><input id="scanNote" type="text" maxlength="200" value="' + esc(sc.note) + '" data-input="scan-note" data-enter="book" placeholder="z. B. Lieferschein 4711"></div>' +
        '<div class="btnrow"><button class="btn primary lg" type="button" data-act="book">' + esc(typeLabel(sc.type)) + ' buchen</button><button class="btn ghost" type="button" data-act="scan-clear">Abbrechen</button></div></div>';
    } else {
      var n = LVStore.itemCount();
      h = '<div class="card"><p class="note" style="margin:0">' + (n ? "Artikel scannen oder oben suchen. Lagerort-Codes setzen den Buchungsort." : "Noch keine Artikel vorhanden. Unter <a href=\"#artikel\">Artikel</a> anlegen oder per CSV importieren.") + '</p></div>';
    }
    box.innerHTML = h;
  }
  function renderScanRecent() {
    var box = byId("scanRecent"); if (!box) return;
    var arr = allMovements().slice(0, 6);
    box.innerHTML = arr.length ? arr.map(function (m) { return movRow(m, { who: false, href: "#artikel/" + m.item_id }); }).join("") : '<div class="empty">Noch keine Buchungen.</div>';
  }
  VIEWS.scan = {
    title: "Scannen & Buchen",
    cam: { box: "scanbox", reader: "scanReader", handler: function (code) { onScanCode(code, "cam"); } },
    render: function () {
      return '<div class="ph"><h1>Scannen &amp; Buchen</h1><div class="spacer"></div><a class="btn ghost sm" href="#journal">Journal</a></div>' +
        '<div class="scanbox" id="scanbox"></div>' +
        '<form class="coderow" data-form="scan-code" autocomplete="off"><input id="codeIn" type="search" placeholder="Code, Artikelnummer oder Name eingeben …" data-input="scan-search" autocomplete="off" enterkeyhint="go"><button class="btn primary" type="submit">OK</button></form>' +
        '<div class="quick hide" id="quick"></div><div id="scanResult"></div>' +
        '<h3 class="sh">Zuletzt gebucht</h3><div class="list" id="scanRecent"></div>';
    },
    mount: function () {
      renderScanbox("scanbox", "scanReader", false); renderScanResult(); renderScanRecent();
      if (App.scan.queued) { var c = App.scan.queued; App.scan.queued = null; onScanCode(c, "wedge"); }
      if (camPref() && LVScan.supported()) startCam("scanbox", "scanReader", this.cam.handler);
      var inp = byId("codeIn");
      if (inp && !App.scan.item && window.matchMedia && matchMedia("(pointer:fine)").matches) inp.focus();
    },
    unmount: function () { LVScan.stop(); App.cam.on = false; },
    update: function () { var a = document.activeElement, r = byId("scanResult"); if (!(r && a && r.contains(a))) renderScanResult(); renderScanRecent(); },
    onWedge: function (code) { onScanCode(code, "wedge"); }
  };
  INPUTS["scan-search"] = function (el) {
    var q = el.value.trim(), box = byId("quick"); if (!box) return;
    if (q.length < 2) { box.classList.add("hide"); box.innerHTML = ""; return; }
    var hits = LVStore.findItems(q, 6);
    if (!hits.length) { box.classList.add("hide"); box.innerHTML = ""; return; }
    box.innerHTML = hits.map(function (i) { return '<button type="button" data-act="quick-pick" data-id="' + esc(i.id) + '">' + esc(i.name) + '<small>' + esc(i.sku) + (i.barcode ? " · " + esc(i.barcode) : "") + '</small></button>'; }).join("");
    box.classList.remove("hide");
  };
  function quickClear() { var b = byId("quick"); if (b) { b.classList.add("hide"); b.innerHTML = ""; } var i = byId("codeIn"); if (i) i.value = ""; }
  ACTIONS["quick-pick"] = function (el) { var it = S.items.get(el.getAttribute("data-id")); quickClear(); if (it) { scanSelect(it); renderScanResult(); } };
  FORMS["scan-code"] = function () { var i = byId("codeIn"), v = i ? i.value.trim() : ""; if (!v) return; quickClear(); onScanCode(v, "input"); };
  ACTIONS["scan-clear"] = function () { scanReset(); renderScanResult(); var i = byId("codeIn"); if (i && window.matchMedia && matchMedia("(pointer:fine)").matches) i.focus(); };
  ACTIONS["scan-type"] = function (el) { App.scan.type = el.getAttribute("data-v"); if (App.scan.type !== "transfer") App.scan.to = null; renderScanResult(); };
  INPUTS["scan-loc"] = function (el) { App.scan.loc = el.value; if (App.scan.to === el.value) App.scan.to = null; if (App.scan.item) renderScanResult(); };
  INPUTS["scan-to"] = function (el) { App.scan.to = el.value; };
  INPUTS["scan-qty"] = function (el) { App.scan.qty = el.value; var q = parseQty(el.value); var hint = $("#scanResult .stepper + .hint"); if (hint && q == null) hint.textContent = "Bitte eine Zahl eingeben."; };
  INPUTS["scan-note"] = function (el) { App.scan.note = el.value; };
  function stepQty(d) {
    var q = parseQty(App.scan.qty); if (q == null) q = 0;
    q = LVStore.round3(q + d); if (q < 0) q = 0;
    App.scan.qty = q; var i = byId("scanQty"); if (i) i.value = fmtIn(q); renderScanResult();
  }
  ACTIONS["scan-minus"] = function () { stepQty(-1); };
  ACTIONS["scan-plus"] = function () { stepQty(1); };
  ACTIONS["scan-new-item"] = function () { var code = App.scan.unknown; itemEditor(null, { barcode: code, onSaved: function (rec) { scanSelect(rec); renderScanResult(); } }); };
  ACTIONS["scan-assign"] = function () {
    var code = App.scan.unknown; if (!code) return;
    pickItem("Code „" + code + "“ zuordnen", function (it) {
      LVStore.upsertCode({ id: LVStore.uuid(), item_id: it.id, code: code }).then(function () { toast("Code zugeordnet.", "ok"); LVSync.schedule(800); scanSelect(it); renderScanResult(); });
    });
  };
  ACTIONS["scan-loc-stock"] = function () { if (App.scan.locInfo) { App.f.bestand.loc = App.scan.locInfo.id; scanReset(); nav("bestand"); } };
  ACTIONS["scan-loc-inv"] = function () {
    var loc = App.scan.locInfo; if (!loc) return;
    function go() { App.inv.loc = loc.id; App.inv.counts = {}; App.inv.extra = []; scanReset(); nav("inventur"); }
    if (App.inv.loc && App.inv.loc !== loc.id && Object.keys(App.inv.counts || {}).length) confirmDlg("Bisherige Zählwerte verwerfen und die Inventur für " + loc.code + " · " + loc.name + " starten?", { ok: "Wechseln" }).then(function (ok) { if (ok) go(); });
    else go();
  };
  ACTIONS["book"] = function () {
    var sc = App.scan, it = sc.item; if (!it) return;
    if (sc.busy) return;
    var raw = byId("scanQty") ? byId("scanQty").value : sc.qty, q = parseQty(raw), rawT = String(raw).trim();
    // Handscanner tippt in das fokussierte Mengenfeld: ein bekannter Code geht vor, auch eine rein numerische EAN (ab 6 Ziffern)
    if (rawT && (q == null || /^\d{6,}$/.test(rawT)) && LVStore.resolveCode(rawT)) { onScanCode(rawT, "wedge"); return; }
    if (q == null) { toast("Bitte eine gültige Menge eingeben.", "err"); return; }
    if (!sc.loc || !S.locations.get(sc.loc)) { toast("Bitte einen Lagerort wählen.", "err"); return; }
    if (sc.type === "transfer" && (!sc.to || !S.locations.get(sc.to))) { toast("Bitte einen Ziel-Lagerort wählen.", "err"); return; }
    if (sc.type === "transfer" && sc.to === sc.loc) { toast("Von und Nach dürfen nicht gleich sein.", "err"); return; }
    if (q < 0 || q > 1e9 || (sc.type !== "count" && q <= 0)) { toast(sc.type === "count" ? "Gezählte Menge darf nicht negativ sein." : "Die Menge muss größer als 0 sein.", "err"); return; }
    var cur = LVStore.qtyAt(it.id, sc.loc), goesNeg = (sc.type === "out" || sc.type === "transfer") && q > cur;
    if (goesNeg && !negAllowed()) { toast("Nicht genug Bestand (" + fmtQty(cur) + " " + unitOf(it) + "). Negativer Bestand ist deaktiviert.", "err", 4000); return; }
    var m = { id: LVStore.uuid(), item_id: it.id, location_id: sc.loc, to_location_id: sc.type === "transfer" ? sc.to : null, type: sc.type, qty: q,
      note: (byId("scanNote") ? byId("scanNote").value : sc.note).trim() || null, member_id: S.member ? S.member.id : null, device_id: S.meta.device_id, created_at: LVStore.nowIso() };
    S.meta.last_used_location = sc.loc; LVStore.save("meta");
    sc.busy = true;
    LVStore.addPending(m).then(function () {
      sc.busy = false;
      toast(typeLabel(m.type) + " gebucht: " + fmtQty(q) + " " + unitOf(it) + " · " + it.name + (goesNeg ? " (Bestand negativ)" : ""), goesNeg ? "warn" : "ok");
      sc.qty = 1; sc.note = ""; renderScanResult(); renderScanRecent(); LVSync.schedule(600);
      var i = byId("codeIn"); if (i && window.matchMedia && matchMedia("(pointer:fine)").matches) i.focus();
    }, function (e) { sc.busy = false; toast("Buchung konnte nicht gespeichert werden: " + (e && e.message || e), "err", 5000); });
  };

  // =====================================================================
  // Artikel
  // =====================================================================
  function artFilterOptions(cur) {
    var h = '<option value="all">Alle Artikel</option><option value="low"' + (cur === "low" ? " selected" : "") + '>Unter Mindestbestand</option><option value="inactive"' + (cur === "inactive" ? " selected" : "") + '>Inaktive</option>';
    var cats = categories(); if (cats.length) { h += '<optgroup label="Kategorie">' + cats.map(function (c) { return '<option value="cat:' + esc(c) + '"' + (cur === "cat:" + c ? " selected" : "") + '>' + esc(c) + '</option>'; }).join("") + '</optgroup>'; }
    return h;
  }
  function renderArtList() {
    var box = byId("artList"), cnt = byId("artCnt"); if (!box) return;
    var f = App.f.artikel, idx = stockIndex(), arr = LVStore.findItems(f.q);
    if (f.filter === "low") arr = arr.filter(function (i) { return isLow(i, idx.totals.get(i.id) || 0); });
    else if (f.filter === "inactive") arr = arr.filter(function (i) { return i.active === false; });
    else if (f.filter.indexOf("cat:") === 0) { var c = f.filter.slice(4); arr = arr.filter(function (i) { return i.category === c; }); }
    else arr = arr.filter(function (i) { return i.active !== false; });
    if (cnt) cnt.textContent = arr.length + " Artikel";
    if (!arr.length) { box.innerHTML = '<div class="empty">' + (LVStore.itemCount() ? "Keine Treffer." : "Noch keine Artikel. Lege den ersten Artikel an oder importiere eine CSV-Datei.") + '</div>'; return; }
    var h = arr.slice(0, f.limit).map(function (i) {
      var tot = LVStore.round3(idx.totals.get(i.id) || 0), pos = (idx.byItem.get(i.id) || []).length, low = isLow(i, tot);
      return '<a class="row" href="#artikel/' + esc(i.id) + '"><div class="ic' + (i.active === false ? " grey" : "") + '">' + ic("box") + '</div><div class="txt"><div class="t">' + esc(i.name) + (i.active === false ? ' <span class="pill grey">inaktiv</span>' : "") + '</div><div class="s">' + esc(i.sku) + (i.category ? " · " + esc(i.category) : "") + ' · ' + pos + ' Lagerort' + (pos === 1 ? "" : "e") + '</div></div><div class="q' + (tot < 0 ? " neg" : low ? " low" : "") + '">' + esc(fmtQty(tot)) + '<small>' + esc(unitOf(i)) + '</small></div>' + ic("chev") + '</a>';
    }).join("");
    if (arr.length > f.limit) h += '<button class="more" type="button" data-act="art-more">Weitere anzeigen (' + (arr.length - f.limit) + ')</button>';
    box.innerHTML = h;
  }
  function renderArtDetail(id) {
    var it = S.items.get(id); if (!it || it.deleted) return '<div class="ph"><a class="iconbtn" href="#artikel">' + ic("back") + '</a><h1>Artikel nicht gefunden</h1></div>';
    var st = LVStore.stockOf(it.id), unit = unitOf(it), codes = LVStore.codesOfItem(it.id), low = isLow(it, st.total);
    var h = '<div class="ph"><a class="iconbtn" href="#artikel" aria-label="Zurück">' + ic("back") + '</a><h1>' + esc(it.name) + '</h1>' + (it.active === false ? '<span class="pill grey">inaktiv</span>' : "") + (low ? '<span class="pill gold">unter Mindestbestand</span>' : "") + (LVStore.hasPendingChange("item", it.id) ? '<span class="pill teal">noch nicht übertragen</span>' : "") + '</div>';
    h += '<div class="grid g2"><div class="card"><h2>Stammdaten</h2><dl class="kv"><dt>Artikelnummer</dt><dd class="mono">' + esc(it.sku) + '</dd>' +
      '<dt>Barcode/EAN</dt><dd class="mono">' + (it.barcode ? esc(it.barcode) : "–") + '</dd><dt>Einheit</dt><dd>' + esc(unit) + '</dd><dt>Mindestbestand</dt><dd>' + (Number(it.min_stock) > 0 ? esc(fmtQty(it.min_stock)) + " " + esc(unit) : "–") + '</dd>' +
      '<dt>Kategorie</dt><dd>' + (it.category ? esc(it.category) : "–") + '</dd><dt>Notiz</dt><dd>' + (it.note ? esc(it.note) : "–") + '</dd><dt>Weitere Codes</dt><dd><div class="chips">' +
      codes.map(function (c) { return '<span class="chip mono">' + esc(c.code) + (isAdmin() ? ' <button class="iconbtn" style="width:22px;height:22px;border-radius:6px" type="button" data-act="code-del" data-id="' + esc(c.id) + '" aria-label="Code entfernen">' + ic("x") + '</button>' : "") + '</span>'; }).join("") +
      '<button class="btn xs ghost" type="button" data-act="code-add" data-id="' + esc(it.id) + '">' + ic("plus") + ' Code hinzufügen</button></div></dd></dl>' +
      '<div class="btnrow"><button class="btn primary" type="button" data-act="item-book" data-id="' + esc(it.id) + '">' + ic("scan") + ' Buchen</button><button class="btn ghost" type="button" data-act="item-edit" data-id="' + esc(it.id) + '">' + ic("edit") + ' Bearbeiten</button><button class="btn ghost" type="button" data-act="item-label" data-id="' + esc(it.id) + '">' + ic("tag") + ' Etikett</button>' +
      (isAdmin() ? '<button class="btn danger" type="button" data-act="item-del" data-id="' + esc(it.id) + '">' + ic("trash") + ' Löschen</button>' : "") + '</div></div>';
    h += '<div class="card"><h2>Bestand</h2><p class="' + (st.total < 0 ? "errtxt" : "") + '" style="font-size:1.6rem;font-weight:800;margin:0 0 8px">' + esc(fmtQty(st.total)) + ' <small class="muted" style="font-size:.9rem">' + esc(unit) + '</small></p>';
    if (low) h += '<p class="note" style="color:var(--gold-d)">Mindestbestand ' + esc(fmtQty(it.min_stock)) + ' ' + esc(unit) + ' unterschritten.</p>';
    h += st.byLoc.length ? '<div class="tblwrap"><table class="tbl"><thead><tr><th>Lagerort</th><th class="num">Menge</th></tr></thead><tbody>' + st.byLoc.map(function (b) { return '<tr><td>' + esc(b.location.code + " · " + b.location.name) + '</td><td class="num' + (b.qty < 0 ? " errtxt" : "") + '">' + esc(fmtQty(b.qty)) + '</td></tr>'; }).join("") + '</tbody></table></div>' : '<p class="note">Kein Bestand.</p>';
    h += '</div></div>';
    var movs = movementsOfItem(it.id, 50);
    h += '<h3 class="sh">Letzte Bewegungen</h3><div class="list">' + (movs.length ? movs.map(function (m) { return movRow(m, { showItem: false }); }).join("") : '<div class="empty">Noch keine Bewegungen.</div>') + '</div>';
    return h;
  }
  VIEWS.artikel = {
    title: function (arg) { if (!arg) return "Artikel"; var it = S.items.get(arg); return it ? it.name : "Artikel"; },
    render: function (arg) {
      if (arg === "neu") return '<div class="ph"><h1>Artikel</h1></div>';
      if (arg) return renderArtDetail(arg);
      var f = App.f.artikel, n = LVStore.itemCount(), lim = itemLimit();
      return '<div class="ph"><h1>Artikel</h1><span class="pill teal">' + n + ' / ' + (lim >= 1000000 ? "∞" : lim) + '</span><div class="spacer"></div>' +
        (isAdmin() ? '<button class="btn ghost sm" type="button" data-act="csv-import">' + ic("upload") + ' CSV-Import</button>' : "") +
        '<button class="btn primary sm" type="button" data-act="item-new">' + ic("plus") + ' Neuer Artikel</button></div>' +
        '<div class="tools"><input class="search" type="search" placeholder="Suchen: Name, Nummer, Barcode, Kategorie" value="' + esc(f.q) + '" data-input="art-q" autocomplete="off"><select data-change="art-filter">' + artFilterOptions(f.filter) + '</select><span class="cnt" id="artCnt"></span></div>' +
        '<div class="list" id="artList"></div>';
    },
    mount: function (el, arg) {
      if (arg === "neu") { itemEditor(null, { onClose: function () { if (App.route.arg === "neu") nav("artikel"); } }); return; }
      if (!arg) renderArtList();
    },
    update: function (evt) { if (App.route.arg && App.route.arg !== "neu") softRender(); else if (!App.route.arg) { renderArtList(); } }
  };
  INPUTS["art-q"] = function (el) { App.f.artikel.q = el.value; App.f.artikel.limit = 200; renderArtList(); };
  INPUTS["art-filter"] = function (el) { App.f.artikel.filter = el.value; App.f.artikel.limit = 200; renderArtList(); };
  ACTIONS["art-more"] = function () { App.f.artikel.limit += 200; renderArtList(); };
  ACTIONS["item-new"] = function () { itemEditor(null, {}); };
  ACTIONS["item-edit"] = function (el) { var it = S.items.get(el.getAttribute("data-id")); if (it) itemEditor(it, {}); };
  ACTIONS["item-book"] = function (el) { var it = S.items.get(el.getAttribute("data-id")); if (it) { scanSelect(it); nav("scan"); } };
  ACTIONS["item-label"] = function (el) { var id = el.getAttribute("data-id"); loadLabelPrefs(); App.labels.tab = "items"; App.labels.q = ""; App.labels.sel.items = {}; App.labels.sel.items[id] = true; nav("etiketten"); };
  ACTIONS["item-del"] = function (el) {
    var it = S.items.get(el.getAttribute("data-id")); if (!it) return;
    var st = LVStore.stockOf(it.id);
    confirmDlg("Artikel „" + it.name + "“ wirklich löschen?" + (st.total !== 0 ? " Der Artikel hat noch Bestand (" + fmtQty(st.total) + " " + unitOf(it) + "). Das Journal bleibt erhalten." : ""), { ok: "Löschen", danger: true })
      .then(function (ok) { if (!ok) return; LVStore.deleteItem(it.id).then(function () { toast("Artikel gelöscht.", "ok"); LVSync.schedule(800); nav("artikel"); }); });
  };
  ACTIONS["code-add"] = function (el) {
    var it = S.items.get(el.getAttribute("data-id")); if (!it) return;
    modal({
      title: "Code hinzufügen", body: '<p class="note">Weiterer Barcode/Code, der diesen Artikel identifiziert (z. B. Lieferanten-EAN).</p><form data-form="code-add" id="codeForm"><input type="hidden" name="item_id" value="' + esc(it.id) + '"><div class="field withbtn"><div><label>Code</label><input name="code" maxlength="80" required autocomplete="off" data-noenter></div>' + (LVScan.supported() ? '<button class="btn ghost" type="button" data-act="code-scan">' + ic("camera") + '</button>' : "") + '</div></form>',
      foot: '<button class="btn ghost" type="button" data-act="modal-close">Abbrechen</button><button class="btn primary" type="submit" form="codeForm">Speichern</button>'
    });
  };
  ACTIONS["code-scan"] = function () { openOverlay("Code scannen", function (code) { var i = $('#codeForm [name="code"]'); if (i) i.value = code; }); };
  FORMS["code-add"] = function (f) {
    var v = formVals(f), code = v.code.trim(); if (!code) return;
    var used = LVStore.codeInUse(code, v.item_id);
    if (used) { toast("Der Code ist bereits vergeben: " + (used.kind === "item" ? used.rec.name : "Lagerort " + used.rec.code), "err", 4000); return; }
    if (LVStore.codeInUse(code, null) && LVStore.codeInUse(code, null).rec.id === v.item_id) { toast("Der Code ist diesem Artikel bereits zugeordnet."); closeModal(true); return; }
    LVStore.upsertCode({ id: LVStore.uuid(), item_id: v.item_id, code: code }).then(function () { toast("Code hinzugefügt.", "ok"); LVSync.schedule(800); closeModal(true); renderView(); });
  };
  ACTIONS["code-del"] = function (el) { var id = el.getAttribute("data-id"); LVStore.deleteCode(id).then(function () { toast("Code entfernt."); LVSync.schedule(800); renderView(); }); };

  // Artikel-Editor (Modal)
  function itemEditor(item, o) {
    o = o || {};
    var isNew = !item, it = item || { name: "", sku: LVStore.peekItemCode() || "", unit: "", barcode: o.barcode || "", min_stock: 0, category: "", note: "", active: true };
    if (isNew && LVStore.itemCount() >= itemLimit()) { toast("Artikel-Limit des Tarifs erreicht (" + itemLimit() + "). Bitte Tarif wechseln.", "err", 4500); return; }
    var cats = categories();
    modal({
      title: isNew ? "Neuer Artikel" : "Artikel bearbeiten",
      body: '<form data-form="item" id="itemForm" novalidate><div class="msg" id="itemMsg"></div>' +
        '<div class="field"><label>Name *</label><input name="name" maxlength="120" required value="' + esc(it.name) + '" autocomplete="off"></div>' +
        '<div class="f2"><div class="field"><label>Artikelnummer *</label><input name="sku" maxlength="40" required value="' + esc(it.sku) + '" autocomplete="off" data-noenter class="mono">' + (isNew ? '<div class="hint">Vorschlag aus dem Nummernblock – kann geändert werden.</div>' : "") + '</div>' +
        '<div class="field"><label>Einheit</label><input name="unit" maxlength="12" list="unitList" value="' + esc(it.unit || "") + '" placeholder="' + esc(settings().default_unit || "Stk") + '" autocomplete="off"><datalist id="unitList">' + ["Stk", "m", "kg", "l", "Pack", "Karton", "Paar", "Rolle"].map(function (u) { return '<option value="' + u + '">'; }).join("") + '</datalist></div></div>' +
        '<div class="field withbtn"><div><label>Barcode / EAN</label><input name="barcode" maxlength="80" value="' + esc(it.barcode || "") + '" autocomplete="off" data-noenter class="mono" inputmode="numeric"></div>' + (LVScan.supported() ? '<button class="btn ghost" type="button" data-act="item-scan-barcode" aria-label="Barcode scannen">' + ic("camera") + '</button>' : "") + '</div>' +
        '<div class="f2"><div class="field"><label>Mindestbestand</label><input name="min_stock" type="text" inputmode="decimal" value="' + esc(Number(it.min_stock) > 0 ? fmtIn(it.min_stock) : "") + '" placeholder="0" autocomplete="off"><div class="hint">Warnung, wenn der Gesamtbestand darunter fällt.</div></div>' +
        '<div class="field"><label>Kategorie</label><input name="category" maxlength="60" list="catList" value="' + esc(it.category || "") + '" autocomplete="off"><datalist id="catList">' + cats.map(function (c) { return '<option value="' + esc(c) + '">'; }).join("") + '</datalist></div></div>' +
        '<div class="field"><label>Notiz</label><textarea name="note" rows="2" maxlength="500">' + esc(it.note || "") + '</textarea></div>' +
        (isNew ? "" : '<label class="check"><input type="checkbox" name="active"' + (it.active !== false ? " checked" : "") + '> Artikel aktiv (inaktive Artikel werden in Listen ausgeblendet)</label>') + '</form>',
      foot: '<button class="btn ghost" type="button" data-act="modal-close">Abbrechen</button><button class="btn primary" type="submit" form="itemForm">Speichern</button>',
      onMount: function () { App.modal._ctx = { item: item, isNew: isNew, onSaved: o.onSaved }; },
      onClose: o.onClose
    });
  }
  ACTIONS["item-scan-barcode"] = function () { openOverlay("Barcode scannen", function (code) { var i = $('#itemForm [name="barcode"]'); if (i) i.value = code; }); };
  FORMS.item = function (f) {
    var ctx = (App.modal && App.modal._ctx) || {}, v = formVals(f), msg = byId("itemMsg");
    function fail(t) { if (msg) { msg.className = "msg err"; msg.textContent = t; } }
    if (v.name.length < 1) return fail("Bitte einen Namen eingeben.");
    if (!v.sku) return fail("Bitte eine Artikelnummer eingeben.");
    var rec = ctx.item ? Object.assign({}, ctx.item) : { id: LVStore.uuid() };
    var clash = LVStore.codeInUse(v.sku, rec.id);
    if (clash) return fail("Die Artikelnummer ist bereits vergeben: " + (clash.kind === "item" ? clash.rec.name : "Lagerort " + clash.rec.code));
    if (v.barcode) { clash = LVStore.codeInUse(v.barcode, rec.id); if (clash) return fail("Der Barcode ist bereits vergeben: " + (clash.kind === "item" ? clash.rec.name : "Lagerort " + clash.rec.code)); }
    var min = v.min_stock ? parseQty(v.min_stock) : 0;
    if (min == null || min < 0) return fail("Ungültiger Mindestbestand.");
    if (ctx.isNew && LVStore.itemCount() >= itemLimit()) return fail("Artikel-Limit des Tarifs erreicht.");
    rec.name = v.name; rec.sku = v.sku; rec.unit = v.unit || null; rec.barcode = v.barcode || null; rec.min_stock = min; rec.category = v.category || null; rec.note = v.note || null;
    if (!ctx.isNew) rec.active = !!v.active;
    if (ctx.isNew && v.sku === LVStore.peekItemCode()) LVStore.takeItemCode();
    LVStore.upsertItem(rec).then(function (saved) {
      toast(ctx.isNew ? "Artikel angelegt." : "Gespeichert.", "ok"); LVSync.schedule(800);
      var cb = ctx.onSaved; closeModal(true);
      if (cb) cb(saved); else if (ctx.isNew) nav("artikel/" + saved.id); else renderView();
    });
  };

  // =====================================================================
  // Bestand
  // =====================================================================
  function bestData() {
    var f = App.f.bestand, idx = stockIndex(), rows = [], items = LVStore.findItems(f.q);
    if (f.loc) {
      var eff = LVStore.effectiveStock();
      items.forEach(function (i) {
        var q = LVStore.round3(eff.get(LVStore.skey(i.id, f.loc)) || 0), tot = LVStore.round3(idx.totals.get(i.id) || 0);
        if (q === 0 && (!f.zero || i.active === false)) return;
        if (f.low && !isLow(i, tot)) return;
        rows.push({ it: i, qty: q, total: tot, byLoc: [{ loc: f.loc, qty: q }] });
      });
    } else {
      items.forEach(function (i) {
        var tot = LVStore.round3(idx.totals.get(i.id) || 0), by = idx.byItem.get(i.id) || [];
        if (!by.length && (!f.zero || i.active === false)) return;
        if (f.low && !isLow(i, tot)) return;
        rows.push({ it: i, qty: tot, total: tot, byLoc: by });
      });
    }
    return { rows: rows, idx: idx };
  }
  function renderBestKpis(idx) {
    var box = byId("bestKpis"); if (!box) return;
    var items = LVStore.activeItems().filter(function (i) { return i.active !== false; }), low = 0, neg = 0;
    items.forEach(function (i) { var t = idx.totals.get(i.id) || 0; if (isLow(i, t)) low++; if (t < 0) neg++; });
    var locs = LVStore.activeLocations().filter(function (l) { return l.active !== false; }).length;
    box.innerHTML = '<div class="kpi"><b>' + items.length + '</b><span>Artikel</span></div>' +
      '<div class="kpi"><b>' + locs + '</b><span>Lagerorte</span></div>' +
      '<div class="kpi"><b>' + idx.positions + '</b><span>Positionen</span></div>' +
      '<div class="kpi' + (low ? " warn" : "") + '"><b>' + low + '</b><span>Unter Minimum</span></div>' +
      (neg ? '<div class="kpi err"><b>' + neg + '</b><span>Negativ</span></div>' : "") +
      (S.pending.length ? '<div class="kpi"><b>' + S.pending.length + '</b><span>Wartend</span></div>' : "");
  }
  function bestNameCell(it) {
    return '<td><a href="#artikel/' + esc(it.id) + '"><b>' + esc(it.name) + '</b></a><br><span class="note mono">' + esc(it.sku) + (it.category ? " · " + esc(it.category) : "") + (it.active === false ? " · inaktiv" : "") + '</span></td>';
  }
  function renderBestTable() {
    var box = byId("bestTable"), cnt = byId("bestCnt"); if (!box) return;
    var f = App.f.bestand, d = bestData(), rows = d.rows;
    renderBestKpis(d.idx);
    if (cnt) cnt.textContent = rows.length + " Artikel";
    if (!rows.length) { box.innerHTML = '<div class="list"><div class="empty">' + (f.q || f.low || f.loc ? "Keine Artikel für diese Auswahl." : "Noch kein Bestand. Artikel anlegen und über „Scannen &amp; Buchen“ einen Eingang buchen.") + '</div></div>'; return; }
    var h, shown = rows.slice(0, f.limit);
    if (f.loc) {
      h = '<div class="tblwrap"><table class="tbl"><thead><tr><th>Artikel</th><th class="num">Menge</th><th class="num">Gesamt</th><th class="num">Min.</th></tr></thead><tbody>' +
        shown.map(function (r) {
          var it = r.it;
          return '<tr' + (it.active === false ? ' class="inactive"' : "") + '>' + bestNameCell(it) +
            '<td class="num' + (r.qty < 0 ? " errtxt" : "") + '"><b>' + esc(fmtQty(r.qty)) + '</b> <small class="muted">' + esc(unitOf(it)) + '</small></td>' +
            '<td class="num' + (r.total < 0 ? " errtxt" : isLow(it, r.total) ? " lowtxt" : " muted") + '">' + esc(fmtQty(r.total)) + '</td>' +
            '<td class="num muted">' + (Number(it.min_stock) > 0 ? esc(fmtQty(it.min_stock)) : "–") + '</td></tr>';
        }).join("") + '</tbody></table></div>';
    } else {
      h = '<div class="tblwrap"><table class="tbl"><thead><tr><th>Artikel</th><th>Lagerorte</th><th class="num">Gesamt</th><th class="num">Min.</th></tr></thead><tbody>' +
        shown.map(function (r) {
          var it = r.it, chips = r.byLoc.map(function (p) { return '<span class="chip' + (p.qty < 0 ? " err" : "") + '">' + esc(locShort(p.loc)) + ' <b>' + esc(fmtQty(p.qty)) + '</b></span>'; }).join("");
          return '<tr' + (it.active === false ? ' class="inactive"' : "") + '>' + bestNameCell(it) +
            '<td><div class="chips">' + (chips || '<span class="muted">–</span>') + '</div></td>' +
            '<td class="num' + (r.total < 0 ? " errtxt" : isLow(it, r.total) ? " lowtxt" : "") + '"><b>' + esc(fmtQty(r.total)) + '</b> <small class="muted">' + esc(unitOf(it)) + '</small></td>' +
            '<td class="num muted">' + (Number(it.min_stock) > 0 ? esc(fmtQty(it.min_stock)) : "–") + '</td></tr>';
        }).join("") + '</tbody></table></div>';
    }
    if (rows.length > f.limit) h += '<button class="btn ghost block" type="button" data-act="best-more">Weitere anzeigen (' + (rows.length - f.limit) + ')</button>';
    box.innerHTML = h;
  }
  VIEWS.bestand = {
    title: "Bestand",
    render: function () {
      var f = App.f.bestand; if (f.loc && !S.locations.get(f.loc)) f.loc = ""; if (!f.limit) f.limit = 300;
      return '<div class="ph"><h1>Bestand</h1><div class="spacer"></div>' +
        '<button class="btn ghost sm" type="button" data-act="best-csv">' + ic("download") + ' CSV</button>' +
        '<button class="btn ghost sm" type="button" data-act="best-inv-csv">Zählliste</button>' +
        (isAdmin() ? '<button class="btn ghost sm" type="button" data-act="best-json">Export (JSON)</button>' : "") + '</div>' +
        '<div class="kpis" id="bestKpis"></div>' +
        '<div class="tools"><input class="search" type="search" placeholder="Artikel, Nummer, Barcode, Kategorie …" value="' + esc(f.q) + '" data-input="best-q" autocomplete="off">' +
        '<select data-change="best-loc" aria-label="Lagerort">' + locOptions(f.loc, null, "Alle Lagerorte") + '</select><span class="cnt" id="bestCnt"></span></div>' +
        '<div class="tools"><label class="check"><input type="checkbox" data-change="best-low"' + (f.low ? " checked" : "") + '> Nur unter Mindestbestand</label>' +
        '<label class="check"><input type="checkbox" data-change="best-zero"' + (f.zero ? " checked" : "") + '> Auch Artikel ohne Bestand</label></div>' +
        '<div class="card" id="bestTable"></div>';
    },
    mount: function () { renderBestTable(); },
    update: function () { renderBestTable(); }
  };
  INPUTS["best-q"] = function (el) { App.f.bestand.q = el.value; App.f.bestand.limit = 300; renderBestTable(); };
  INPUTS["best-loc"] = function (el) { App.f.bestand.loc = el.value; App.f.bestand.limit = 300; renderBestTable(); };
  INPUTS["best-low"] = function (el) { App.f.bestand.low = el.checked; App.f.bestand.limit = 300; renderBestTable(); };
  INPUTS["best-zero"] = function (el) { App.f.bestand.zero = el.checked; App.f.bestand.limit = 300; renderBestTable(); };
  ACTIONS["best-more"] = function () { App.f.bestand.limit += 300; renderBestTable(); };
  ACTIONS["best-csv"] = function () {
    var d = bestData(), rows = [["Artikelnummer", "Artikel", "Kategorie", "Einheit", "Lagerort", "Lagerort-Name", "Menge", "Gesamt", "Mindestbestand"]];
    d.rows.forEach(function (r) {
      var it = r.it, min = Number(it.min_stock) || 0;
      if (!r.byLoc.length) { rows.push([it.sku, it.name, it.category || "", unitOf(it), "", "", 0, r.total, min]); return; }
      r.byLoc.forEach(function (p) { var l = S.locations.get(p.loc); rows.push([it.sku, it.name, it.category || "", unitOf(it), l ? l.code : "", l ? l.name : "", p.qty, r.total, min]); });
    });
    if (rows.length === 1) { toast("Keine Daten für den Export.", "warn"); return; }
    download("bestand-" + fileDate() + ".csv", csvText(rows)); toast("CSV wird heruntergeladen.");
  };
  ACTIONS["best-inv-csv"] = function () {
    var f = App.f.bestand, rows = [["Lagerort", "Lagerort-Name", "Artikelnummer", "Artikel", "Einheit", "Soll", "Gezählt", "Bemerkung"]];
    var locs = LVStore.activeLocations().filter(function (l) { return l.active !== false && (!f.loc || l.id === f.loc); });
    locs.forEach(function (l) {
      LVStore.stockAtLocation(l.id).forEach(function (p) { rows.push([l.code, l.name, p.item.sku, p.item.name, unitOf(p.item), p.qty, "", ""]); });
    });
    if (rows.length === 1) { toast("Kein Bestand für eine Zählliste vorhanden.", "warn"); return; }
    download("zaehlliste-" + fileDate() + ".csv", csvText(rows)); toast("Zählliste wird heruntergeladen.");
  };
  ACTIONS["best-json"] = function (el) {
    if (!navigator.onLine) { toast("Für den Export wird eine Internetverbindung benötigt.", "warn"); return; }
    el.disabled = true;
    LVSync.api("export", {}, 120000).then(function (res) {
      el.disabled = false;
      if (res.status !== 200 || !res.data || !res.data.ok) { toast(apiErr(res), "err", 4500); return; }
      download("lager-export-" + fileDate() + ".json", JSON.stringify(res.data, null, 1), "application/json");
      toast("Export wird heruntergeladen.", "ok");
    });
  };

  // =====================================================================
  // Journal
  // =====================================================================
  function jFiltered() {
    var f = App.f.journal, q = (f.q || "").trim().toLowerCase(), since = f.days ? Date.now() - f.days * 864e5 : 0;
    return allMovements().filter(function (m) {
      if (f.type && m.type !== f.type) return false;
      if (f.loc && m.location_id !== f.loc && m.to_location_id !== f.loc) return false;
      if (since && new Date(m.created_at).getTime() < since) return false;
      if (q) {
        var it = S.items.get(m.item_id);
        var hay = ((it ? it.name + " " + it.sku + " " + (it.barcode || "") : "") + " " + (m.note || "") + " " + nameOfMember(m.member_id)).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  function failedRow(m) {
    var it = S.items.get(m.item_id);
    return '<div class="row"><div class="ic ' + esc(m.type) + '">' + ic(m.type === "in" ? "in" : m.type === "out" ? "out" : m.type === "transfer" ? "transfer" : "count") + '</div>' +
      '<div class="txt"><div class="t">' + esc(it ? it.name : "gelöschter Artikel") + ' · ' + esc(typeLabel(m.type)) + ' ' + esc(fmtQty(m.qty)) + ' ' + esc(unitOf(it)) + '</div>' +
      '<div class="s">' + esc(locName(m.location_id)) + (m.type === "transfer" ? " → " + esc(locName(m.to_location_id)) : "") + ' · ' + esc(fmtDate(m.created_at)) + '</div>' +
      '<div class="errtxt">' + esc(errMsg(m.error)) + '</div></div>' +
      '<button class="btn ghost xs" type="button" data-act="failed-retry" data-id="' + esc(m.id) + '">Erneut</button></div>';
  }
  function renderJFailed() {
    var box = byId("jFailed"); if (!box) return;
    if (!S.failed.length) { box.innerHTML = ""; return; }
    box.innerHTML = '<div class="card"><h2>Abgelehnte Buchungen (' + S.failed.length + ')</h2>' +
      '<p class="note">Diese Buchungen hat der Server abgelehnt – sie sind nicht im Bestand enthalten. Ursache prüfen und erneut buchen oder verwerfen.</p>' +
      '<div class="list">' + S.failed.map(failedRow).join("") + '</div>' +
      '<div class="btnrow"><button class="btn ghost sm" type="button" data-act="failed-clear">Alle verwerfen</button></div></div>';
  }
  function renderJList() {
    var box = byId("jList"), cnt = byId("jCnt"); if (!box) return;
    var f = App.f.journal, arr = jFiltered();
    if (cnt) cnt.textContent = arr.length + " Buchung" + (arr.length === 1 ? "" : "en");
    if (!arr.length) { box.innerHTML = '<div class="empty">Keine Buchungen für diese Auswahl.</div>'; return; }
    var h = arr.slice(0, f.limit).map(function (m) { return movRow(m, { showItem: true, who: true, href: "#artikel/" + m.item_id }); }).join("");
    if (arr.length > f.limit) h += '<button class="more" type="button" data-act="j-more">Weitere anzeigen (' + (arr.length - f.limit) + ')</button>';
    box.innerHTML = h;
  }
  VIEWS.journal = {
    title: "Journal",
    render: function () {
      var f = App.f.journal; if (f.loc && !S.locations.get(f.loc)) f.loc = ""; if (!f.limit) f.limit = 200;
      return '<div class="ph"><h1>Journal</h1><div class="spacer"></div><button class="btn ghost sm" type="button" data-act="j-csv">' + ic("download") + ' CSV</button></div>' +
        '<div id="jFailed"></div>' +
        '<div class="tools"><input class="search" type="search" placeholder="Artikel, Nummer, Notiz, Person …" value="' + esc(f.q) + '" data-input="j-q" autocomplete="off">' +
        '<select data-change="j-type" aria-label="Buchungsart"><option value="">Alle Buchungsarten</option>' + Object.keys(TYPES).map(function (t) { return '<option value="' + t + '"' + (f.type === t ? " selected" : "") + '>' + esc(TYPES[t]) + '</option>'; }).join("") + '</select>' +
        '<select data-change="j-loc" aria-label="Lagerort">' + locOptions(f.loc, null, "Alle Lagerorte") + '</select>' +
        '<select data-change="j-days" aria-label="Zeitraum">' + [[7, "7 Tage"], [30, "30 Tage"], [90, "90 Tage"], [0, "Gesamter Zeitraum"]].map(function (o) { return '<option value="' + o[0] + '"' + (f.days === o[0] ? " selected" : "") + '>' + o[1] + '</option>'; }).join("") + '</select>' +
        '<span class="cnt" id="jCnt"></span></div>' +
        '<div class="list" id="jList"></div>';
    },
    mount: function () { renderJFailed(); renderJList(); },
    update: function () { renderJFailed(); renderJList(); }
  };
  INPUTS["j-q"] = function (el) { App.f.journal.q = el.value; App.f.journal.limit = 200; renderJList(); };
  INPUTS["j-type"] = function (el) { App.f.journal.type = el.value; App.f.journal.limit = 200; renderJList(); };
  INPUTS["j-loc"] = function (el) { App.f.journal.loc = el.value; App.f.journal.limit = 200; renderJList(); };
  INPUTS["j-days"] = function (el) { App.f.journal.days = Number(el.value) || 0; App.f.journal.limit = 200; renderJList(); };
  ACTIONS["j-more"] = function () { App.f.journal.limit += 200; renderJList(); };
  ACTIONS["j-csv"] = function () {
    var rows = [["Datum", "Art", "Artikelnummer", "Artikel", "Menge", "Einheit", "Lagerort", "Nach", "Differenz", "Notiz", "Gebucht von", "Status"]];
    jFiltered().forEach(function (m) {
      var it = S.items.get(m.item_id);
      rows.push([fmtDate(m.created_at), typeLabel(m.type), it ? it.sku : "", it ? it.name : "gelöscht", m.qty, unitOf(it), locShort(m.location_id),
        m.type === "transfer" ? locShort(m.to_location_id) : "", m.delta != null ? m.delta : "", m.note || "", nameOfMember(m.member_id), m.pending ? "wartet" : "übertragen"]);
    });
    if (rows.length === 1) { toast("Keine Buchungen für den Export.", "warn"); return; }
    download("journal-" + fileDate() + ".csv", csvText(rows)); toast("CSV wird heruntergeladen.");
  };
  ACTIONS["failed-retry"] = function (el) {
    var id = el.getAttribute("data-id"), idx = -1;
    S.failed.forEach(function (m, i) { if (m.id === id) idx = i; });
    if (idx < 0) return;
    var m = S.failed[idx], it = S.items.get(m.item_id);
    if (!it || it.deleted) { toast("Der Artikel existiert nicht mehr.", "err"); return; }
    if (!S.locations.get(m.location_id) || (m.type === "transfer" && !S.locations.get(m.to_location_id))) { toast("Der Lagerort existiert nicht mehr.", "err"); return; }
    S.failed.splice(idx, 1);
    var n = Object.assign({}, m, { id: LVStore.uuid(), device_id: S.meta.device_id }); delete n.error; delete n.failed_at; delete n.pending;
    LVStore.save("failed");
    LVStore.addPending(n).then(function () { toast("Buchung erneut eingereiht.", "ok"); LVSync.schedule(500); });
  };
  ACTIONS["failed-clear"] = function () {
    confirmDlg("Alle abgelehnten Buchungen endgültig verwerfen?", { ok: "Verwerfen", danger: true }).then(function (ok) {
      if (!ok) return;
      LVStore.clearFailed().then(function () { LVStore.emit("change", { kind: "movement" }); toast("Verworfen."); });
    });
  };

  // =====================================================================
  // Lagerorte
  // =====================================================================
  function renderLocList() {
    var box = byId("locList"); if (!box) return;
    var idx = stockIndex(), perLoc = new Map();
    idx.byItem.forEach(function (arr) { arr.forEach(function (p) { perLoc.set(p.loc, (perLoc.get(p.loc) || 0) + 1); }); });
    var locs = LVStore.activeLocations();
    if (!locs.length) { box.innerHTML = '<div class="empty">Noch keine Lagerorte.</div>'; return; }
    box.innerHTML = locs.map(function (l) {
      var n = perLoc.get(l.id) || 0;
      return '<button class="row" type="button" data-act="loc-open" data-id="' + esc(l.id) + '"><div class="ic' + (l.active === false ? " grey" : "") + '">' + ic("pin") + '</div>' +
        '<div class="txt"><div class="t">' + esc(l.code) + ' · ' + esc(l.name) + (l.active === false ? ' <span class="pill grey">inaktiv</span>' : "") + (LVStore.hasPendingChange("location", l.id) ? ' <span class="pill teal">noch nicht übertragen</span>' : "") + '</div>' +
        '<div class="s">' + (l.note ? esc(l.note) + " · " : "") + n + ' Position' + (n === 1 ? "" : "en") + '</div></div>' + ic("chev") + '</button>';
    }).join("");
  }
  VIEWS.lagerorte = {
    title: "Lagerorte",
    render: function () {
      var n = LVStore.activeLocations().length;
      return '<div class="ph"><h1>Lagerorte</h1><span class="pill teal">' + n + '</span><div class="spacer"></div>' +
        (isAdmin() ? '<button class="btn ghost sm" type="button" data-act="loc-labels">' + ic("tag") + ' Etiketten</button><button class="btn primary sm" type="button" data-act="loc-new">' + ic("plus") + ' Neuer Lagerort</button>' : "") + '</div>' +
        (isAdmin() ? '<p class="help">Lagerorte sind Regale, Räume, Fahrzeuge oder Hallen. Jeder Ort hat einen Code, der als Etikett gescannt werden kann.</p>' : '<p class="help">Lagerorte verwaltet der Administrator. Antippen zeigt den Bestand am Ort.</p>') +
        '<div class="list" id="locList"></div>';
    },
    mount: function () { renderLocList(); },
    update: function () { renderLocList(); }
  };
  function locEditor(loc) {
    var isNew = !loc, res = (S.meta.reserved && S.meta.reserved.locations) || [];
    var l = loc || { code: res[0] || "", name: "", note: "", active: true };
    modal({
      title: isNew ? "Neuer Lagerort" : "Lagerort bearbeiten",
      body: '<form data-form="location" id="locForm" novalidate><div class="msg" id="locMsg"></div>' +
        '<div class="f2"><div class="field"><label>Code *</label><input name="code" class="mono" maxlength="20" required value="' + esc(l.code) + '" autocomplete="off" placeholder="z. B. REGAL-A1">' + (isNew ? '<div class="hint">Vorschlag aus dem Nummernblock – kann frei geändert werden.</div>' : '<div class="hint">Vorsicht: bereits gedruckte Etiketten tragen den alten Code.</div>') + '</div>' +
        '<div class="field"><label>Name *</label><input name="name" maxlength="80" required value="' + esc(l.name) + '" autocomplete="off" placeholder="z. B. Regal A1, Halle 2"></div></div>' +
        '<div class="field"><label>Notiz</label><input name="note" maxlength="200" value="' + esc(l.note || "") + '" autocomplete="off" placeholder="optional"></div>' +
        (isNew ? "" : '<label class="check"><input type="checkbox" name="active"' + (l.active !== false ? " checked" : "") + '> Lagerort aktiv (inaktive Orte werden bei Buchungen nicht mehr angeboten)</label>') + '</form>',
      foot: '<button class="btn ghost" type="button" data-act="modal-close">Abbrechen</button>' +
        (isNew ? "" : '<button class="btn ghost" type="button" data-act="loc-stock" data-id="' + esc(l.id) + '">Bestand</button><button class="btn danger" type="button" data-act="loc-del" data-id="' + esc(l.id) + '">Löschen</button>') +
        '<button class="btn primary" type="submit" form="locForm">Speichern</button>',
      onMount: function () { App.modal._ctx = { loc: loc, isNew: isNew }; }
    });
  }
  ACTIONS["loc-new"] = function () { if (!isAdmin()) return; locEditor(null); };
  ACTIONS["loc-open"] = function (el) {
    var loc = S.locations.get(el.getAttribute("data-id")); if (!loc) return;
    if (isAdmin()) locEditor(loc); else { App.f.bestand.loc = loc.id; nav("bestand"); }
  };
  ACTIONS["loc-stock"] = function (el) { closeModal(true); App.f.bestand.loc = el.getAttribute("data-id"); nav("bestand"); };
  ACTIONS["loc-labels"] = function () {
    loadLabelPrefs(); App.labels.tab = "locations"; App.labels.q = ""; App.labels.sel.locations = {};
    LVStore.activeLocations().forEach(function (l) { if (l.active !== false) App.labels.sel.locations[l.id] = true; });
    nav("etiketten");
  };
  FORMS.location = function (f) {
    var ctx = (App.modal && App.modal._ctx) || {}, v = formVals(f), msg = byId("locMsg");
    function fail(t) { if (msg) { msg.className = "msg err"; msg.textContent = t; } }
    var code = (v.code || "").toUpperCase().replace(/\s+/g, "");
    if (!code) return fail("Bitte einen Code eingeben.");
    if (!v.name) return fail("Bitte einen Namen eingeben.");
    var rec = ctx.loc ? Object.assign({}, ctx.loc) : { id: LVStore.uuid(), active: true };
    var clash = LVStore.resolveCode(code);
    if (clash && !(clash.kind === "location" && clash.rec.id === rec.id)) return fail("Der Code ist bereits vergeben: " + (clash.kind === "item" ? "Artikel „" + clash.rec.name + "“" : clash.rec.code + " · " + clash.rec.name));
    rec.code = code; rec.name = v.name; rec.note = v.note || null;
    if (!ctx.isNew) rec.active = !!v.active;
    var res = (S.meta.reserved && S.meta.reserved.locations) || [];
    if (ctx.isNew && res.length && code === res[0]) LVStore.takeLocationCode();
    LVStore.upsertLocation(rec).then(function () {
      toast(ctx.isNew ? "Lagerort angelegt." : "Gespeichert.", "ok"); LVSync.schedule(800); closeModal(true); renderView();
    });
  };
  ACTIONS["loc-del"] = function (el) {
    var loc = S.locations.get(el.getAttribute("data-id")); if (!loc) return;
    var stock = LVStore.stockAtLocation(loc.id);
    if (stock.length) { toast("Der Lagerort hat noch Bestand (" + stock.length + " Position" + (stock.length === 1 ? "" : "en") + "). Bitte erst umlagern oder auf 0 zählen.", "err", 5000); return; }
    if (S.pending.some(function (m) { return m.location_id === loc.id || m.to_location_id === loc.id; })) { toast("Es warten noch Buchungen für diesen Lagerort auf die Übertragung.", "err", 4500); return; }
    var others = LVStore.activeLocations().filter(function (l) { return l.active !== false && l.id !== loc.id; });
    if (!others.length) { toast("Der letzte aktive Lagerort kann nicht gelöscht werden.", "err"); return; }
    confirmDlg("Lagerort „" + loc.code + " · " + loc.name + "“ wirklich löschen? Das Journal bleibt erhalten.", { ok: "Löschen", danger: true }).then(function (ok) {
      if (!ok) return;
      LVStore.upsertLocation(Object.assign({}, loc, { deleted: true })).then(function () {
        if (App.f.bestand.loc === loc.id) App.f.bestand.loc = ""; if (App.f.journal.loc === loc.id) App.f.journal.loc = "";
        if (App.inv.loc === loc.id) { App.inv.loc = ""; App.inv.counts = {}; App.inv.extra = []; }
        if (App.scan.loc === loc.id) App.scan.loc = null; if (App.scan.to === loc.id) App.scan.to = null;
        toast("Lagerort gelöscht.", "ok"); LVSync.schedule(800); renderView();
      });
    });
  };

  // =====================================================================
  // Etiketten
  // =====================================================================
  function loadLabelPrefs() {
    if (App.labels) return;
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem("lv_label_prefs") || "{}") || {}; } catch (e) { saved = {}; }
    App.labels = Object.assign({ tab: "items", q: "", format: "avery-3474", type: settings().label_type === "code128" ? "code128" : "qr", skip: 0, copies: 1, custom: {} }, saved, { sel: { items: {}, locations: {} } });
    if (!LVLabels.FORMATS[App.labels.format]) App.labels.format = "avery-3474";
    if (!App.labels.custom || typeof App.labels.custom !== "object") App.labels.custom = {};
  }
  function saveLabelPrefs() {
    var L = App.labels; if (!L) return;
    try { localStorage.setItem("lv_label_prefs", JSON.stringify({ format: L.format, type: L.type, skip: L.skip, copies: L.copies, custom: L.custom })); } catch (e) {}
  }
  function labelSub(it) {
    var tpl = settings().label_format || "{firma}", t = S.tenant || {};
    return tpl.replace(/\{(\w+)\}/g, function (_, k) {
      switch (k.toLowerCase()) {
        case "firma": return t.name || "";
        case "kategorie": return it.category || "";
        case "einheit": return unitOf(it);
        case "sku": case "nummer": case "artikelnummer": return it.sku || "";
        case "name": return it.name || "";
        case "ean": case "barcode": return it.barcode || "";
        default: return "";
      }
    }).replace(/\s*·\s*(·\s*)+/g, " · ").replace(/^\s*·\s*|\s*·\s*$/g, "").trim();
  }
  function byNameDe(a, b) { return String(a.name || "").localeCompare(String(b.name || ""), "de"); }
  function labelList() {
    var L = App.labels, out = [];
    if (L.tab === "items") {
      LVStore.activeItems().filter(function (i) { return L.sel.items[i.id]; }).sort(byNameDe).forEach(function (i) { out.push({ code: i.sku, name: i.name, sub: labelSub(i) }); });
    } else {
      LVStore.activeLocations().filter(function (l) { return L.sel.locations[l.id]; }).forEach(function (l) { out.push({ code: l.code, name: l.name, sub: (S.tenant && S.tenant.name) || "" }); });
    }
    return out;
  }
  function lblCandidates() {
    var L = App.labels, sel = L.sel[L.tab], q = (L.q || "").trim().toLowerCase();
    if (L.tab === "items") return LVStore.findItems(L.q).filter(function (i) { return i.active !== false || sel[i.id]; });
    return LVStore.activeLocations().filter(function (l) { return (l.active !== false || sel[l.id]) && (!q || (l.code + " " + l.name + " " + (l.note || "")).toLowerCase().indexOf(q) >= 0); });
  }
  function lblOpts() {
    var L = App.labels;
    return { labels: labelList(), format: L.format, custom: L.custom, type: L.type, skip: L.skip | 0, copies: (L.copies | 0) || 1 };
  }
  function lblSelCount() { var sel = App.labels.sel[App.labels.tab]; return Object.keys(sel).filter(function (k) { return sel[k]; }).length; }
  function renderLblList() {
    var L = App.labels, box = byId("lblList"), cnt = byId("lblCnt"); if (!box) return;
    var arr = lblCandidates(), sel = L.sel[L.tab], isItem = L.tab === "items", h = "";
    if (!arr.length) h = '<div class="empty">' + (isItem ? "Keine Artikel gefunden." : "Keine Lagerorte gefunden.") + '</div>';
    arr.slice(0, 500).forEach(function (r) {
      h += '<label><input type="checkbox" data-change="lbl-sel" data-id="' + esc(r.id) + '"' + (sel[r.id] ? " checked" : "") + '><span>' + esc(isItem ? r.name : r.code + " · " + r.name) + '</span><span class="s">' + esc(isItem ? r.sku + (r.category ? " · " + r.category : "") : (r.note || "")) + '</span></label>';
    });
    if (arr.length > 500) h += '<div class="empty">Nur die ersten 500 Einträge werden angezeigt – bitte die Suche eingrenzen.</div>';
    box.innerHTML = h;
    if (cnt) cnt.textContent = lblSelCount() + " ausgewählt";
  }
  var lblTimer = null;
  function renderLblPreview() {
    clearTimeout(lblTimer);
    lblTimer = setTimeout(function () {
      var el = byId("lblPreview"), info = byId("lblInfo"); if (!el) return;
      var b;
      try { b = LVLabels.preview(el, lblOpts(), Math.min(420, Math.max(200, el.clientWidth - 24))); }
      catch (e) { console.error(e); el.innerHTML = '<p class="muted">Vorschau nicht möglich.</p>'; if (info) info.textContent = ""; return; }
      if (info) info.textContent = b.count ? (b.count + " Etikett" + (b.count === 1 ? "" : "en") + (b.single ? " (je ein Einzeletikett)" : " auf " + b.sheets + " Blatt A4 – Vorschau zeigt Blatt 1")) : "Keine Etiketten ausgewählt.";
    }, 150);
  }
  function lblCustomFields() {
    var L = App.labels, base = LVLabels.FORMATS[L.format] || {}; if (!base.custom) return "";
    var f = LVLabels.resolveFormat(L.format, L.custom);
    function fld(k, label) { return '<div class="field"><label>' + label + '</label><input type="number" step="0.1" min="0" value="' + esc(f[k]) + '" data-input="lbl-custom" data-k="' + k + '"></div>'; }
    var h = '<div class="f2">' + fld("w", "Breite (mm)") + fld("h", "Höhe (mm)") + '</div>';
    if (!base.single) h += '<div class="f3">' + fld("cols", "Spalten") + fld("rows", "Zeilen") + fld("ml", "Rand links (mm)") + '</div><div class="f3">' + fld("mt", "Rand oben (mm)") + fld("gx", "Abstand waagerecht (mm)") + fld("gy", "Abstand senkrecht (mm)") + '</div>';
    return h;
  }
  VIEWS.etiketten = {
    title: "Etiketten",
    render: function () {
      loadLabelPrefs();
      var L = App.labels, F = LVLabels.FORMATS, base = F[L.format] || F["avery-3474"], fmt = LVLabels.resolveFormat(L.format, L.custom), per = base.single ? 0 : fmt.cols * fmt.rows;
      return '<div class="ph"><h1>Etiketten drucken</h1></div>' +
        '<p class="help">Artikel oder Lagerorte auswählen, Format wählen, drucken. Die Codes enthalten die Artikelnummer bzw. den Lagerort-Code und werden beim Scannen direkt erkannt.</p>' +
        '<div class="grid g2">' +
        '<div class="card"><div class="seg"><button type="button" data-act="lbl-tab" data-v="items"' + (L.tab === "items" ? ' class="on"' : "") + '>Artikel</button><button type="button" data-act="lbl-tab" data-v="locations"' + (L.tab === "locations" ? ' class="on"' : "") + '>Lagerorte</button></div>' +
        '<div class="tools"><input class="search" type="search" placeholder="Suchen …" value="' + esc(L.q) + '" data-input="lbl-q" autocomplete="off"><button class="btn ghost xs" type="button" data-act="lbl-all">Alle</button><button class="btn ghost xs" type="button" data-act="lbl-none">Keine</button></div>' +
        '<div class="sellist" id="lblList"></div><p class="note" id="lblCnt"></p></div>' +
        '<div class="card"><h2>Druckformat</h2>' +
        '<div class="field"><label>Etikettenformat</label><select data-change="lbl-format">' + Object.keys(F).map(function (k) { return '<option value="' + k + '"' + (k === L.format ? " selected" : "") + '>' + esc(F[k].name) + '</option>'; }).join("") + '</select></div>' +
        '<div id="lblCustom">' + lblCustomFields() + '</div>' +
        '<div class="field"><label>Codeart</label><div class="seg"><button type="button" data-act="lbl-type" data-v="qr"' + (L.type !== "code128" ? ' class="on"' : "") + '>QR-Code</button><button type="button" data-act="lbl-type" data-v="code128"' + (L.type === "code128" ? ' class="on"' : "") + '>Barcode (Code 128)</button></div><div class="hint">QR-Codes werden von Handykameras am sichersten gelesen. Code 128 für klassische Handscanner.</div></div>' +
        '<div class="f2">' + (per ? '<div class="field"><label>Felder überspringen</label><input type="number" min="0" max="' + (per - 1) + '" value="' + (L.skip | 0) + '" data-input="lbl-skip"><div class="hint">Bereits benutzte Felder auf dem ersten Bogen.</div></div>' : "") +
        '<div class="field"><label>Exemplare je Etikett</label><input type="number" min="1" max="100" value="' + ((L.copies | 0) || 1) + '" data-input="lbl-copies"></div></div>' +
        '<p class="note" id="lblInfo"></p><div class="preview" id="lblPreview"></div>' +
        '<div class="btnrow"><button class="btn primary" type="button" data-act="lbl-print">' + ic("print") + ' Drucken</button></div>' +
        '<p class="note">Im Druckdialog „Tatsächliche Größe“ bzw. 100 % wählen und die Ränder auf „Keine“ stellen. Etikettendrucker: als Papierformat das Einzeletikett wählen.</p></div></div>';
    },
    mount: function () { renderLblList(); renderLblPreview(); },
    update: function () { renderLblList(); renderLblPreview(); }
  };
  ACTIONS["lbl-tab"] = function (el) { loadLabelPrefs(); App.labels.tab = el.getAttribute("data-v") === "locations" ? "locations" : "items"; App.labels.q = ""; renderView(); };
  ACTIONS["lbl-type"] = function (el) { App.labels.type = el.getAttribute("data-v") === "code128" ? "code128" : "qr"; saveLabelPrefs(); $$('[data-act="lbl-type"]').forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === App.labels.type); }); renderLblPreview(); };
  ACTIONS["lbl-all"] = function () { var sel = App.labels.sel[App.labels.tab]; lblCandidates().forEach(function (r) { sel[r.id] = true; }); renderLblList(); renderLblPreview(); };
  ACTIONS["lbl-none"] = function () { App.labels.sel[App.labels.tab] = {}; renderLblList(); renderLblPreview(); };
  ACTIONS["lbl-print"] = function () {
    var b = LVLabels.print(lblOpts());
    if (!b.count) toast("Bitte zuerst Artikel oder Lagerorte auswählen.", "warn");
  };
  INPUTS["lbl-q"] = function (el) { App.labels.q = el.value; renderLblList(); };
  INPUTS["lbl-sel"] = function (el) {
    var sel = App.labels.sel[App.labels.tab], id = el.getAttribute("data-id");
    if (el.checked) sel[id] = true; else delete sel[id];
    var cnt = byId("lblCnt"); if (cnt) cnt.textContent = lblSelCount() + " ausgewählt";
    renderLblPreview();
  };
  INPUTS["lbl-format"] = function (el) { App.labels.format = LVLabels.FORMATS[el.value] ? el.value : "avery-3474"; App.labels.skip = 0; saveLabelPrefs(); renderView(); };
  INPUTS["lbl-custom"] = function (el) {
    var k = el.getAttribute("data-k"), v = parseFloat(String(el.value).replace(",", "."));
    if (!isNaN(v)) App.labels.custom[k] = v; else delete App.labels.custom[k];
    saveLabelPrefs(); renderLblPreview();
  };
  INPUTS["lbl-skip"] = function (el) { var n = parseInt(el.value, 10); App.labels.skip = isNaN(n) || n < 0 ? 0 : n; saveLabelPrefs(); renderLblPreview(); };
  INPUTS["lbl-copies"] = function (el) { var n = parseInt(el.value, 10); App.labels.copies = isNaN(n) || n < 1 ? 1 : Math.min(100, n); saveLabelPrefs(); renderLblPreview(); };

  // =====================================================================
  // Inventur
  // =====================================================================
  function invExpected() { return App.inv.loc ? LVStore.stockAtLocation(App.inv.loc) : []; }
  function invRows() {
    var inv = App.inv, exp = invExpected(), seen = {}, rows = [];
    exp.forEach(function (r) { seen[r.item.id] = true; });
    inv.extra.forEach(function (id) { if (seen[id]) return; var it = S.items.get(id); if (it && !it.deleted) { seen[id] = true; rows.push({ it: it, exp: 0 }); } });
    exp.forEach(function (r) { rows.push({ it: r.item, exp: r.qty }); });
    return rows;
  }
  function invCountOf(id) { var raw = App.inv.counts[id]; return raw == null || raw === "" ? null : parseQty(raw); }
  function invRowHtml(r) {
    var raw = App.inv.counts[r.it.id], c = invCountOf(r.it.id), diff = c == null ? null : LVStore.round3(c - r.exp), cls = c == null ? "" : diff !== 0 ? "diff" : "done";
    return '<tr data-item="' + esc(r.it.id) + '" class="' + cls + '"><td><b>' + esc(r.it.name) + '</b><br><span class="note mono">' + esc(r.it.sku) + '</span></td>' +
      '<td class="num">' + esc(fmtQty(r.exp)) + ' <small class="muted">' + esc(unitOf(r.it)) + '</small></td>' +
      '<td class="num"><input class="cnt" type="text" inputmode="decimal" value="' + esc(raw == null ? "" : raw) + '" data-input="inv-cnt" data-id="' + esc(r.it.id) + '" placeholder="–" autocomplete="off" data-enter="inv-next" aria-label="Gezählte Menge"></td>' +
      '<td class="num' + (diff == null ? " muted" : diff < 0 ? " errtxt" : diff > 0 ? "" : " muted") + '">' + (diff == null ? "–" : (diff > 0 ? "+" : "") + esc(fmtQty(diff))) + '</td></tr>';
  }
  function invPlan() {
    var inv = App.inv, out = [];
    invRows().forEach(function (r) {
      var c = invCountOf(r.it.id);
      if (c == null) { if (inv.zero && r.exp !== 0) c = 0; else return; }
      if (c < 0) return;
      if (LVStore.round3(c - r.exp) === 0) return;
      out.push({ it: r.it, qty: c, exp: r.exp });
    });
    return out;
  }
  function renderInvSum() {
    var sum = byId("invSum"), btn = byId("invBookBtn"); if (!sum) return;
    var rows = invRows(), counted = 0;
    rows.forEach(function (r) { if (invCountOf(r.it.id) != null) counted++; });
    var plan = invPlan();
    sum.textContent = counted + " von " + rows.length + " gezählt · " + plan.length + " Abweichung" + (plan.length === 1 ? "" : "en");
    if (btn) { btn.textContent = plan.length ? "Zählung buchen (" + plan.length + ")" : "Zählung buchen"; btn.disabled = !plan.length; }
  }
  function renderInvTable() {
    var tb = $("#invTable tbody"); if (!tb) return;
    var rows = invRows();
    tb.innerHTML = rows.length ? rows.map(invRowHtml).join("") : '<tr><td colspan="4" class="muted center">Kein Bestand an diesem Lagerort. Artikel scannen oder suchen, um sie aufzunehmen.</td></tr>';
    renderInvSum();
  }
  function renderInvBody() {
    var box = byId("invBody"), inv = App.inv; if (!box) return;
    if (!inv.loc) { box.innerHTML = '<div class="card"><p class="note" style="margin:0">Bitte oben einen Lagerort wählen – oder das Lagerort-Etikett scannen.</p></div>'; return; }
    box.innerHTML = '<div class="card"><div class="tblwrap"><table class="tbl" id="invTable"><thead><tr><th>Artikel</th><th class="num">Soll</th><th class="num">Gezählt</th><th class="num">Differenz</th></tr></thead><tbody></tbody></table></div>' +
      '<label class="check"><input type="checkbox" data-change="inv-zero"' + (inv.zero ? " checked" : "") + '> Nicht gezählte Positionen auf 0 setzen</label>' +
      '<div class="btnrow"><button class="btn primary" type="button" data-act="inv-book" id="invBookBtn">Zählung buchen</button><span class="note" id="invSum"></span></div></div>';
    renderInvTable();
  }
  function updateInvRow(id) {
    var tr = $('#invTable tr[data-item="' + id + '"]'); if (!tr) return;
    var exp = 0; invRows().some(function (r) { if (r.it.id === id) { exp = r.exp; return true; } return false; });
    var c = invCountOf(id), diff = c == null ? null : LVStore.round3(c - exp);
    tr.className = c == null ? "" : diff !== 0 ? "diff" : "done";
    var cell = tr.lastElementChild;
    if (cell) { cell.className = "num" + (diff == null ? " muted" : diff < 0 ? " errtxt" : diff > 0 ? "" : " muted"); cell.textContent = diff == null ? "–" : (diff > 0 ? "+" : "") + fmtQty(diff); }
  }
  function invSetLoc(id) {
    var inv = App.inv; inv.loc = id || ""; inv.counts = {}; inv.extra = [];
    var s = byId("invLoc"); if (s && s.value !== inv.loc) s.value = inv.loc;
    renderInvBody();
  }
  function invAdd(it, inc) {
    var inv = App.inv;
    if (!inv.loc) { toast("Bitte zuerst einen Lagerort wählen.", "warn"); return; }
    var expected = invExpected().some(function (r) { return r.item.id === it.id; });
    if (!expected && inv.extra.indexOf(it.id) < 0) inv.extra.unshift(it.id);
    if (inc) { var c = invCountOf(it.id); inv.counts[it.id] = String(LVStore.round3((c || 0) + inc)).replace(".", ","); }
    renderInvTable();
    var row = $('#invTable tr[data-item="' + it.id + '"]');
    if (row) { try { row.scrollIntoView({ block: "nearest" }); } catch (e) {} if (!inc) { var i = $("input", row); if (i) i.focus(); } }
    if (inc) toast(it.name + ": " + fmtQty(invCountOf(it.id)) + " " + unitOf(it), "ok", 1800);
  }
  function invScan(code) {
    var r = LVStore.resolveCode(code);
    if (!r) { toast("Unbekannter Code: " + code, "warn"); return; }
    if (r.kind === "location") {
      if (App.inv.loc === r.rec.id) { toast("Lagerort ist bereits gewählt."); return; }
      if (Object.keys(App.inv.counts).length) {
        confirmDlg("Bisherige Zählwerte verwerfen und zu " + r.rec.code + " · " + r.rec.name + " wechseln?", { ok: "Wechseln" }).then(function (ok) { if (ok) { invSetLoc(r.rec.id); toast("Lagerort: " + r.rec.code + " · " + r.rec.name); } });
      } else { invSetLoc(r.rec.id); toast("Lagerort: " + r.rec.code + " · " + r.rec.name); }
      return;
    }
    invAdd(r.rec, 1);
  }
  function invQuickClear() { var b = byId("invQuick"); if (b) { b.classList.add("hide"); b.innerHTML = ""; } var i = byId("invCode"); if (i) i.value = ""; }
  VIEWS.inventur = {
    title: "Inventur",
    cam: { box: "invScanbox", reader: "invReader", handler: function (code) { invScan(code); } },
    render: function () {
      var inv = App.inv; if (inv.loc && !S.locations.get(inv.loc)) { inv.loc = ""; inv.counts = {}; inv.extra = []; }
      return '<div class="ph"><h1>Inventur</h1><div class="spacer"></div><button class="btn ghost sm" type="button" data-act="inv-reset">Zurücksetzen</button></div>' +
        '<p class="help">Lagerort wählen, dann Artikel scannen (jeder Scan zählt +1) oder Mengen eintragen. Gebucht werden nur Abweichungen vom Soll-Bestand.</p>' +
        '<div class="field"><label>Lagerort</label><select id="invLoc" data-change="inv-loc">' + locOptions(inv.loc, null, "– Lagerort wählen –") + '</select></div>' +
        '<div class="scanbox" id="invScanbox"></div>' +
        '<form class="coderow" data-form="inv-code" autocomplete="off"><input id="invCode" type="search" placeholder="Artikel suchen oder Code eingeben …" data-input="inv-q" autocomplete="off" enterkeyhint="go"><button class="btn primary" type="submit">OK</button></form>' +
        '<div class="quick hide" id="invQuick"></div>' +
        '<div id="invBody"></div>';
    },
    mount: function () {
      renderScanbox("invScanbox", "invReader", false); renderInvBody();
      if (camPref() && LVScan.supported()) startCam("invScanbox", "invReader", VIEWS.inventur.cam.handler);
    },
    unmount: function () { LVScan.stop(); App.cam.on = false; },
    update: function () {
      if (App.inv.loc && !S.locations.get(App.inv.loc)) { App.inv.loc = ""; App.inv.counts = {}; App.inv.extra = []; var s = byId("invLoc"); if (s) s.value = ""; renderInvBody(); return; }
      var a = document.activeElement, t = byId("invBody");
      if (t && a && t.contains(a)) return;
      renderInvTable();
    },
    onWedge: function (code) { invScan(code); }
  };
  INPUTS["inv-loc"] = function (el) {
    var v = el.value, inv = App.inv;
    if (!Object.keys(inv.counts).length) { invSetLoc(v); return; }
    confirmDlg("Die bisherigen Zählwerte verwerfen und den Lagerort wechseln?", { ok: "Wechseln" }).then(function (ok) { if (ok) invSetLoc(v); else el.value = inv.loc; });
  };
  INPUTS["inv-q"] = function (el) {
    var q = el.value.trim(), box = byId("invQuick"); if (!box) return;
    if (q.length < 2) { box.classList.add("hide"); box.innerHTML = ""; return; }
    var hits = LVStore.findItems(q, 6);
    if (!hits.length) { box.classList.add("hide"); box.innerHTML = ""; return; }
    box.innerHTML = hits.map(function (i) { return '<button type="button" data-act="inv-pick" data-id="' + esc(i.id) + '">' + esc(i.name) + '<small>' + esc(i.sku) + (i.barcode ? " · " + esc(i.barcode) : "") + '</small></button>'; }).join("");
    box.classList.remove("hide");
  };
  ACTIONS["inv-pick"] = function (el) { var it = S.items.get(el.getAttribute("data-id")); invQuickClear(); if (it) invAdd(it, 0); };
  FORMS["inv-code"] = function () {
    var i = byId("invCode"), v = i ? i.value.trim() : ""; if (!v) return;
    invQuickClear();
    var r = LVStore.resolveCode(v);
    if (r) { invScan(v); return; }
    var hits = LVStore.findItems(v, 2);
    if (hits.length === 1) invAdd(hits[0], 0); else if (hits.length) toast("Mehrere Treffer – bitte genauer eingeben.", "warn"); else toast("Nichts gefunden: " + v, "warn");
  };
  INPUTS["inv-cnt"] = function (el) { App.inv.counts[el.getAttribute("data-id")] = el.value; updateInvRow(el.getAttribute("data-id")); renderInvSum(); };
  INPUTS["inv-zero"] = function (el) { App.inv.zero = el.checked; renderInvSum(); };
  ACTIONS["inv-next"] = function (el) {
    var cur = el || document.activeElement, inputs = $$("#invTable input.cnt"), i = inputs.indexOf(cur);
    if (i >= 0 && i < inputs.length - 1) { inputs[i + 1].focus(); try { inputs[i + 1].select(); } catch (e) {} } else if (cur && cur.blur) cur.blur();
  };
  ACTIONS["inv-reset"] = function () {
    var inv = App.inv;
    if (!Object.keys(inv.counts).length && !inv.extra.length) { toast("Nichts zurückzusetzen."); return; }
    confirmDlg("Alle eingetragenen Zählwerte verwerfen?", { ok: "Verwerfen", danger: true }).then(function (ok) { if (ok) { inv.counts = {}; inv.extra = []; renderInvTable(); toast("Zurückgesetzt."); } });
  };
  ACTIONS["inv-book"] = function () {
    var inv = App.inv, loc = S.locations.get(inv.loc); if (!loc) return;
    var plan = invPlan();
    if (!plan.length) { toast("Keine Abweichungen – nichts zu buchen.", "ok"); return; }
    var neg = plan.filter(function (p) { return p.qty < 0; }); if (neg.length) { toast("Negative Zählwerte sind nicht möglich.", "err"); return; }
    confirmDlg(plan.length + " Zählung" + (plan.length === 1 ? "" : "en") + " für " + loc.code + " · " + loc.name + " buchen? Der Bestand wird auf die gezählten Mengen gesetzt.", { ok: "Buchen" }).then(function (ok) {
      if (!ok) return;
      var base = Date.now();
      plan.forEach(function (p, i) {
        S.pending.push({ id: LVStore.uuid(), item_id: p.it.id, location_id: loc.id, to_location_id: null, type: "count", qty: p.qty, note: "Inventur", member_id: S.member ? S.member.id : null, device_id: S.meta.device_id, created_at: new Date(base + i).toISOString(), pending: true });
      });
      LVStore.invalidate();
      LVStore.save("pending", true).then(function () {
        inv.counts = {}; inv.extra = [];
        LVStore.emit("change", { kind: "movement" });
        toast(plan.length + " Zählung" + (plan.length === 1 ? "" : "en") + " gebucht – wird übertragen.", "ok"); LVSync.schedule(600); renderInvBody();
      });
    });
  };

  // =====================================================================
  // Team (nur Administratoren)
  // =====================================================================
  var APP_VERSION = "1.0 (2026-09-02)";
  var ROLES = { admin: "Administrator", mitarbeiter: "Mitarbeiter" };
  function roleLabel(r) { return ROLES[r] || r || "–"; }
  function onlineOr(msg) { if (navigator.onLine) return true; toast(msg || "Dafür ist eine Internetverbindung nötig.", "warn"); return false; }
  function okRes(res) { return !!(res && res.status === 200 && res.data && res.data.ok); }
  function teamMembers() { return App.team.list || S.members || []; }

  function renderTeamList() {
    var box = byId("teamList"), cnt = byId("teamCnt"); if (!box) return;
    var list = teamMembers().slice().sort(function (a, b) {
      var aa = a.active === false ? 1 : 0, bb = b.active === false ? 1 : 0;
      return aa - bb || String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""), "de");
    });
    var me = S.member && S.member.id;
    var limit = App.team.limit || (S.tenant && S.tenant.limits && S.tenant.limits.users) || 0;
    var active = list.filter(function (m) { return m.active !== false; }).length;
    if (cnt) cnt.textContent = active + (limit ? " von " + limit : "") + " aktive" + (active === 1 ? "r" : "") + " Nutzer";
    if (!list.length) { box.innerHTML = '<div class="empty">Noch keine Mitglieder geladen.</div>'; return; }
    box.innerHTML = list.map(function (m) {
      var self = m.id === me, off = m.active === false;
      return '<div class="row' + (off ? " pending" : "") + '">' +
        '<div class="ic ' + (m.role === "admin" ? "in" : "grey") + '">' + ic("user") + '</div>' +
        '<div class="txt"><div class="t">' + esc(m.name || m.email || "") + (self ? ' <span class="pill teal">Du</span>' : "") + (off ? ' <span class="pill grey">Deaktiviert</span>' : "") + '</div>' +
        '<div class="s">' + esc(m.email || "") + ' · ' + esc(roleLabel(m.role)) + (m.created_dmy ? ' · seit ' + esc(m.created_dmy) : "") + '</div></div>' +
        (self ? "" : '<div class="acts">' +
          '<button class="btn ghost xs" type="button" data-act="member-role" data-id="' + esc(m.id) + '" data-role="' + (m.role === "admin" ? "mitarbeiter" : "admin") + '">' + (m.role === "admin" ? "Zum Mitarbeiter" : "Zum Admin") + '</button>' +
          '<button class="btn ghost xs" type="button" data-act="member-toggle" data-id="' + esc(m.id) + '" data-active="' + (off ? "1" : "0") + '">' + (off ? "Aktivieren" : "Deaktivieren") + '</button>' +
          '<button class="btn ghost xs danger" type="button" data-act="member-remove" data-id="' + esc(m.id) + '" aria-label="Entfernen" title="Aus dem Team entfernen">' + ic("trash") + '</button></div>') +
        '</div>';
    }).join("");
  }
  function loadTeam(force) {
    if (!navigator.onLine) { renderTeamList(); return Promise.resolve(false); }
    if (App.team.list && !force) { renderTeamList(); return Promise.resolve(true); }
    var box = byId("teamList"); if (box && !App.team.list) box.innerHTML = '<div class="empty">Lade Mitglieder …</div>';
    return LVSync.api("list_members", {}, 20000).then(function (res) {
      if (okRes(res)) { App.team.list = res.data.members || []; App.team.limit = res.data.limit || null; }
      else if (res.status !== 0) toast(apiErr(res), "err", 4000);
      renderTeamList();
      return okRes(res);
    });
  }
  VIEWS.team = {
    title: "Team",
    render: function () {
      var lim = (S.tenant && S.tenant.limits) || {};
      return '<div class="ph"><h1>Team</h1><div class="spacer"></div>' +
        '<button class="btn ghost sm" type="button" data-act="team-refresh" title="Neu laden">' + ic("refresh") + '</button>' +
        '<button class="btn primary sm" type="button" data-act="member-invite">' + ic("plus") + ' Einladen</button></div>' +
        '<p class="help">Mitarbeiter scannen und buchen. Administratoren verwalten außerdem Lagerorte, Löschungen, Team, Firma und Abo. Der Tarif erlaubt ' + (lim.users || "–") + ' aktive Nutzer.</p>' +
        '<div class="card"><div class="tools"><span class="cnt" id="teamCnt"></span></div><div class="list" id="teamList"></div></div>' +
        (navigator.onLine ? "" : '<p class="note">Offline – angezeigt wird der letzte bekannte Stand. Einladungen und Änderungen sind nur online möglich.</p>');
    },
    mount: function () { loadTeam(false); },
    update: function () { renderTeamList(); }
  };
  ACTIONS["team-refresh"] = function () { loadTeam(true).then(function (ok) { if (ok) toast("Team aktualisiert.", "ok", 1500); }); };

  ACTIONS["member-invite"] = function () {
    if (!onlineOr("Einladen ist nur online möglich.")) return;
    modal({
      title: "Mitglied einladen",
      body: '<form data-form="invite" id="inviteForm" novalidate>' +
        '<div class="field"><label>Name</label><input name="name" type="text" required maxlength="80" autocomplete="off"></div>' +
        '<div class="field"><label>E-Mail-Adresse</label><input name="email" type="email" required maxlength="120" autocomplete="off" inputmode="email"></div>' +
        '<div class="field"><label>Rolle</label><select name="role"><option value="mitarbeiter">Mitarbeiter – scannen und buchen</option><option value="admin">Administrator – alles verwalten</option></select></div>' +
        '<div class="msg hide" id="inviteMsg"></div>' +
        '<div class="btnrow"><button class="btn ghost" type="button" data-act="modal-close">Abbrechen</button><button class="btn primary" type="submit" id="inviteBtn">Einladung erstellen</button></div></form>'
    });
  };
  FORMS.invite = function (f) {
    var v = formVals(f), msg = byId("inviteMsg"), btn = byId("inviteBtn");
    function err(t) { if (msg) { msg.className = "msg err"; msg.textContent = t; } }
    if (!v.name || v.name.length < 2) return err("Bitte einen Namen eingeben.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return err("Bitte eine gültige E-Mail-Adresse eingeben.");
    if (!onlineOr("Einladen ist nur online möglich.")) return;
    if (btn) { btn.disabled = true; btn.textContent = "Wird erstellt …"; }
    LVSync.api("invite", { name: v.name, email: v.email.toLowerCase(), role: v.role === "admin" ? "admin" : "mitarbeiter" }, 45000).then(function (res) {
      if (btn) { btn.disabled = false; btn.textContent = "Einladung erstellen"; }
      if (!okRes(res)) return err(apiErr(res));
      var link = res.data.invite_link || "";
      App.team.list = null; loadTeam(true); LVSync.schedule(800);
      modal({
        title: "Einladung erstellt",
        body: '<p><b>' + esc(v.name) + '</b> ist als ' + esc(roleLabel(v.role === "admin" ? "admin" : "mitarbeiter")) + ' angelegt.' +
          (res.data.emailed ? ' Eine E-Mail mit dem Zugangslink wurde an <b>' + esc(v.email) + '</b> gesendet.' : ' Der E-Mail-Versand war nicht möglich – bitte den Link selbst weitergeben.') + '</p>' +
          '<div class="linkbox"><span class="mono">' + esc(link) + '</span><button class="btn ghost sm" type="button" data-act="copy-text" data-text="' + esc(link) + '">' + ic("copy") + ' Kopieren</button></div>' +
          '<p class="note">Mit dem Link legt die Person ihr Passwort fest. Er ist 7 Tage gültig.</p>',
        foot: '<button class="btn primary" type="button" data-act="modal-close">Fertig</button>'
      });
    });
  };
  function setMember(payload, okText) {
    if (!onlineOr("Änderungen am Team sind nur online möglich.")) return Promise.resolve(false);
    return LVSync.api("set_member", payload, 20000).then(function (res) {
      if (!okRes(res)) { toast(apiErr(res), "err", 4000); return false; }
      if (okText) toast(okText, "ok");
      LVSync.schedule(800);
      return loadTeam(true);
    });
  }
  ACTIONS["member-role"] = function (el) {
    var id = el.getAttribute("data-id"), role = el.getAttribute("data-role") === "admin" ? "admin" : "mitarbeiter";
    var m = teamMembers().find(function (x) { return x.id === id; }); if (!m) return;
    confirmDlg((m.name || m.email) + (role === "admin" ? " zum Administrator machen? Administratoren können alles verwalten – auch Team, Firma und Abo." : " zum Mitarbeiter machen? Die Person kann dann nur noch scannen, buchen und Artikel pflegen."), { ok: "Rolle ändern" })
      .then(function (yes) { if (yes) setMember({ member_id: id, role: role }, "Rolle geändert."); });
  };
  ACTIONS["member-toggle"] = function (el) {
    var id = el.getAttribute("data-id"), activate = el.getAttribute("data-active") === "1";
    setMember({ member_id: id, active: activate }, activate ? "Zugang aktiviert." : "Zugang deaktiviert.");
  };
  ACTIONS["member-remove"] = function (el) {
    var id = el.getAttribute("data-id"), m = teamMembers().find(function (x) { return x.id === id; }); if (!m) return;
    confirmDlg((m.name || m.email) + " aus dem Team entfernen? Die Buchungen der Person bleiben im Journal erhalten.", { ok: "Entfernen", danger: true }).then(function (yes) {
      if (!yes || !onlineOr("Änderungen am Team sind nur online möglich.")) return;
      LVSync.api("remove_member", { member_id: id }, 20000).then(function (res) {
        if (!okRes(res)) { toast(apiErr(res), "err", 4000); return; }
        toast("Mitglied entfernt.", "ok"); loadTeam(true); LVSync.schedule(800);
      });
    });
  };

  // =====================================================================
  // Firma & Abo
  // =====================================================================
  var PLANS = {
    starter: { label: "Starter", monat: 1900, jahr: 19000, feats: ["2 Nutzer", "1.000 Artikel", "Beliebig viele Lagerorte", "Etiketten, Offline-Modus, Export", "E-Mail-Support"] },
    team: { label: "Team", monat: 4900, jahr: 49000, hot: true, feats: ["10 Nutzer", "10.000 Artikel", "Rollen: Admin & Mitarbeiter", "Journal je Nutzer und Gerät", "Bevorzugter Support"] },
    business: { label: "Business", monat: 9900, jahr: 99000, feats: ["30 Nutzer", "Artikel ohne praktische Grenze", "Alles aus Team", "Einrichtungshilfe", "Telefon-Support"] }
  };
  function invoiceLink(inv) { return "zahlung.html?r=" + encodeURIComponent(inv.access_token || ""); }

  function saveCompany(payload, okText, btn) {
    if (!onlineOr("Firmendaten und Einstellungen lassen sich nur online ändern.")) return Promise.resolve(false);
    if (btn) btn.disabled = true;
    return LVSync.api("update_company", payload, 20000).then(function (res) {
      if (btn) btn.disabled = false;
      if (!okRes(res)) { toast(apiErr(res), "err", 4500); return false; }
      if (res.data.tenant) { S.tenant = res.data.tenant; LVStore.save("tenant", true); }
      renderBanners(); renderNav(); toast(okText || "Gespeichert.", "ok");
      return true;
    });
  }
  FORMS.company = function (f) {
    var v = formVals(f), btn = $("button[type=submit]", f);
    if (!v.name || v.name.length < 2) { toast("Bitte einen Firmennamen eingeben.", "warn"); return; }
    var prefix = String(v.code_prefix || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!prefix || prefix.length > 8) { toast("Das Präfix besteht aus 1–8 Buchstaben oder Ziffern.", "warn"); return; }
    saveCompany({ name: v.name, code_prefix: prefix }, "Firmendaten gespeichert.", btn).then(function (ok) { if (ok) renderView(); });
  };
  FORMS.billing = function (f) {
    var v = formVals(f), btn = $("button[type=submit]", f);
    if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) { toast("Bitte eine gültige E-Mail-Adresse für Rechnungen eingeben.", "warn"); return; }
    saveCompany({ billing: { recipient: v.recipient, street: v.street, zip: v.zip, city: v.city, email: v.email } }, "Rechnungsadresse gespeichert.", btn);
  };
  FORMS.settings = function (f) {
    var v = formVals(f), btn = $("button[type=submit]", f);
    var payload = { default_unit: (v.default_unit || "Stk").slice(0, 12), label_format: String(v.label_format || "").slice(0, 40), label_type: v.label_type === "code128" ? "code128" : "qr", negative_stock: !!v.negative_stock };
    saveCompany({ settings: payload }, "Einstellungen gespeichert.", btn).then(function (ok) { if (ok && App.labels) { App.labels.type = payload.label_type; saveLabelPrefs(); } });
  };

  function renderPlans() {
    var box = byId("plans"); if (!box) return;
    var t = S.tenant || {}, per = App.firma.period === "jahr" ? "jahr" : "monat";
    box.innerHTML = Object.keys(PLANS).map(function (k) {
      var p = PLANS[k], cur = t.plan === k;
      return '<div class="plan' + (cur ? " cur" : "") + '"><div class="pn">' + esc(p.label) + (cur ? ' <span class="pill teal">Aktuell</span>' : (p.hot ? ' <span class="pill gold">Beliebt</span>' : "")) + '</div>' +
        '<b>' + esc(LV.euro(p[per])) + '</b><small>' + (per === "jahr" ? "pro Jahr – 2 Monate gratis" : "pro Monat") + '</small>' +
        '<ul>' + p.feats.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("") + '</ul>' +
        '<button class="btn ' + (cur || p.hot ? "primary" : "ghost") + ' block" type="button" data-act="choose-plan" data-plan="' + k + '">' + (cur ? "Verlängern" : "Auswählen") + '</button></div>';
    }).join("");
    $$('[data-act="plan-period"]').forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === per); });
  }
  ACTIONS["plan-period"] = function (el) { App.firma.period = el.getAttribute("data-v") === "jahr" ? "jahr" : "monat"; renderPlans(); };
  ACTIONS["choose-plan"] = function (el) {
    var plan = el.getAttribute("data-plan"), p = PLANS[plan]; if (!p) return;
    if (!onlineOr("Die Tarifwahl ist nur online möglich.")) return;
    var per = App.firma.period === "jahr" ? "jahr" : "monat", price = p[per];
    var open = (App.firma.invoices || []).filter(function (i) { return i.status === "open"; }).length;
    var html = '<p>Tarif <b>' + esc(p.label) + '</b> für ' + (per === "jahr" ? "12 Monate" : "1 Monat") + ' zum Preis von <b>' + esc(LV.euro(price)) + '</b> bestellen?</p>' +
      '<p class="note">Du erhältst eine Rechnung mit Bankverbindung und GiroCode. Nach Zahlungseingang wird der Tarif freigeschaltet (in der Regel innerhalb von 1–2 Werktagen). Keine automatische Verlängerung, keine Kündigungsfrist. Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen.</p>' +
      (open ? '<div class="msg info">Es gibt bereits ' + open + ' offene Rechnung' + (open === 1 ? "" : "en") + '. Nur bestellen, wenn wirklich eine weitere Rechnung gewünscht ist.</div>' : "");
    confirmDlg("", { title: "Tarif bestellen", html: html, ok: "Zahlungspflichtig bestellen" }).then(function (yes) {
      if (!yes) return;
      LVSync.api("choose_plan", { plan: plan, period: per }, 45000).then(function (res) {
        if (!okRes(res)) { toast(apiErr(res), "err", 5000); return; }
        App.firma.result = res.data.invoice; App.firma.invoices = null;
        renderView();
        var box = byId("planResult"); if (box && box.scrollIntoView) box.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  };
  function planResultHtml() {
    var r = App.firma.result; if (!r) return "";
    var link = invoiceLink(r);
    return '<div class="card navy" id="planResult"><h2>Rechnung ' + esc(r.number || "") + ' erstellt</h2>' +
      '<p>Betrag <b>' + esc(LV.euro(r.amount_cents)) + '</b>' + (r.due_dmy ? ', zahlbar bis ' + esc(r.due_dmy) : "") + '.' + (r.emailed ? " Die Rechnung wurde zusätzlich per E-Mail an die Rechnungsadresse gesendet." : "") + '</p>' +
      '<div class="btnrow"><a class="btn gold" href="' + esc(link) + '" target="_blank" rel="noopener">' + ic("ext") + ' Zahlseite öffnen – Überweisung / GiroCode</a>' +
      '<button class="btn ghost on-navy" type="button" data-act="copy-text" data-text="' + esc(location.href.replace(/app\.html.*$/, "") + link) + '">' + ic("copy") + ' Link kopieren</button></div></div>';
  }
  function loadInvoices(force) {
    var box = byId("invoiceList"); if (!box) return;
    if (!navigator.onLine) { box.innerHTML = '<div class="empty">Offline – Rechnungen sind nur online abrufbar.</div>'; return; }
    if (App.firma.invoices && !force) { renderInvoices(); return; }
    box.innerHTML = '<div class="empty">Lade Rechnungen …</div>';
    LVSync.api("my_invoices", {}, 20000).then(function (res) {
      if (!okRes(res)) { box.innerHTML = '<div class="empty">' + esc(apiErr(res)) + '</div>'; return; }
      App.firma.invoices = res.data.invoices || [];
      renderInvoices();
    });
  }
  function renderInvoices() {
    var box = byId("invoiceList"); if (!box) return;
    var list = App.firma.invoices || [];
    if (!list.length) { box.innerHTML = '<div class="empty">Noch keine Rechnungen.</div>'; return; }
    var ST = { open: ["gold", "Offen"], paid: ["ok", "Bezahlt"], void: ["grey", "Storniert"] };
    box.innerHTML = '<div class="tblwrap"><table class="tbl"><thead><tr><th>Nummer</th><th>Tarif</th><th class="num">Betrag</th><th>Status</th><th>Datum</th><th class="act"></th></tr></thead><tbody>' +
      list.map(function (i) {
        var s = ST[i.status] || ["grey", i.status];
        return '<tr><td class="mono">' + esc(i.number) + '</td><td>' + esc(i.plan_label || i.plan) + '<div class="s muted">' + (i.period === "jahr" ? "12 Monate" : "1 Monat") + '</div></td>' +
          '<td class="num">' + esc(LV.euro(i.amount_cents)) + '</td>' +
          '<td><span class="pill ' + s[0] + '">' + esc(s[1]) + '</span>' + (i.status === "open" && i.due_dmy ? '<div class="s muted">fällig ' + esc(i.due_dmy) + '</div>' : (i.status === "paid" && i.paid_dmy ? '<div class="s muted">am ' + esc(i.paid_dmy) + '</div>' : "")) + '</td>' +
          '<td>' + esc(i.issued_dmy || "") + '</td>' +
          '<td class="act"><a class="btn ghost xs" href="' + esc(invoiceLink(i)) + '" target="_blank" rel="noopener">' + (i.status === "open" ? "Zahlseite" : "Ansehen") + '</a></td></tr>';
      }).join("") + '</tbody></table></div>';
  }
  VIEWS.firma = {
    title: "Firma & Abo",
    render: function () {
      var t = S.tenant || {}, sub = t.sub || {}, lim = t.limits || {}, st = settings(), bill = t.billing || {};
      var h = '<div class="ph"><h1>Firma &amp; Abo</h1></div>';
      if (!isAdmin()) {
        return h + '<div class="card"><h2>' + esc(t.name || "") + '</h2><dl class="kv"><dt>Tarif</dt><dd>' + esc(t.plan_label || t.plan || "–") + '</dd><dt>Status</dt><dd>' + esc(subText(t)) + '</dd>' +
          '<dt>Nutzer</dt><dd>bis ' + esc(String(lim.users || "–")) + '</dd><dt>Artikel</dt><dd>bis ' + esc(nf.format(lim.items || 0)) + '</dd></dl>' +
          '<p class="note">Tarif, Rechnungen und Firmendaten verwaltet der Administrator.</p></div>';
      }
      var statusCls = !sub.active ? " err" : (sub.reason === "grace" || (t.plan === "trial" && sub.days_left != null && sub.days_left <= 7) ? " warn" : "");
      var activeUsers = (S.members || []).filter(function (m) { return m.active !== false; }).length;
      h += '<div class="card' + statusCls + '"><h2>Abo</h2><dl class="kv"><dt>Tarif</dt><dd><b>' + esc(t.plan_label || t.plan || "–") + '</b></dd><dt>Status</dt><dd>' + esc(subText(t)) + '</dd>' +
        '<dt>Nutzer</dt><dd>' + activeUsers + ' von ' + esc(String(lim.users || "–")) + '</dd><dt>Artikel</dt><dd>' + esc(nf.format(LVStore.itemCount())) + ' von ' + esc(nf.format(lim.items || 0)) + '</dd>' +
        (t.plan === "trial" ? '<dt>Testphase bis</dt><dd>' + esc(t.trial_ends_dmy || "–") + '</dd>' : '<dt>Bezahlt bis</dt><dd>' + esc(t.paid_until_dmy || "–") + '</dd>') + '</dl></div>';
      h += planResultHtml();
      h += '<div class="card"><h2>Tarif wählen</h2><p class="help">Alle Tarife: beliebig viele Lagerorte, Etiketten, Offline-Modus, CSV-Import und -Export. Preise ohne Umsatzsteuer (§ 19 UStG), keine automatische Verlängerung.</p>' +
        '<div class="seg"><button type="button" data-act="plan-period" data-v="monat">Monatlich</button><button type="button" data-act="plan-period" data-v="jahr">Jährlich – 2 Monate gratis</button></div>' +
        '<div class="plans" id="plans"></div>' +
        '<p class="note">Nach der Bestellung erhältst du eine Rechnung mit Bankverbindung und GiroCode. Freischaltung nach Zahlungseingang, in der Regel innerhalb von 1–2 Werktagen.</p></div>';
      h += '<div class="card"><h2>Rechnungen</h2><div id="invoiceList"></div></div>';
      h += '<div class="card"><h2>Firma</h2><form data-form="company" novalidate>' +
        '<div class="f2"><div class="field"><label>Firmenname</label><input name="name" type="text" required maxlength="120" value="' + esc(t.name || "") + '"></div>' +
        '<div class="field"><label>Präfix für Artikelnummern</label><input name="code_prefix" class="mono" type="text" maxlength="8" value="' + esc(t.code_prefix || "ART") + '" autocapitalize="characters" spellcheck="false"><div class="hint">Neue Artikel erhalten automatisch Nummern wie ' + esc((t.code_prefix || "ART") + "-000123") + '. Vorhandene Nummern bleiben.</div></div></div>' +
        '<div class="field"><label>Kontakt-E-Mail</label><input type="email" value="' + esc(t.contact_email || "") + '" disabled><div class="hint">Die Kontaktadresse ist die E-Mail des Gründungskontos.</div></div>' +
        '<div class="btnrow"><button class="btn primary" type="submit">Speichern</button></div></form></div>';
      h += '<div class="card"><h2>Rechnungsadresse</h2><form data-form="billing" novalidate>' +
        '<div class="field"><label>Empfänger / Firma</label><input name="recipient" type="text" maxlength="120" value="' + esc(bill.recipient || t.name || "") + '"></div>' +
        '<div class="field"><label>Straße und Hausnummer</label><input name="street" type="text" maxlength="120" value="' + esc(bill.street || "") + '"></div>' +
        '<div class="f2"><div class="field"><label>PLZ</label><input name="zip" type="text" maxlength="10" inputmode="numeric" value="' + esc(bill.zip || "") + '"></div><div class="field"><label>Ort</label><input name="city" type="text" maxlength="80" value="' + esc(bill.city || "") + '"></div></div>' +
        '<div class="field"><label>E-Mail für Rechnungen</label><input name="email" type="email" maxlength="120" value="' + esc(bill.email || "") + '"><div class="hint">Rechnungen und Zahlungslinks gehen an diese Adresse.</div></div>' +
        '<div class="btnrow"><button class="btn primary" type="submit">Speichern</button></div></form></div>';
      h += '<div class="card"><h2>Einstellungen</h2><form data-form="settings" novalidate>' +
        '<div class="f2"><div class="field"><label>Standard-Einheit</label><input name="default_unit" type="text" maxlength="12" value="' + esc(st.default_unit || "Stk") + '" placeholder="Stk"></div>' +
        '<div class="field"><label>Codeart auf Etiketten</label><select name="label_type"><option value="qr"' + (st.label_type !== "code128" ? " selected" : "") + '>QR-Code</option><option value="code128"' + (st.label_type === "code128" ? " selected" : "") + '>Barcode (Code 128)</option></select></div></div>' +
        '<div class="field"><label>Zusatzzeile auf Etiketten</label><input name="label_format" type="text" maxlength="40" value="' + esc(st.label_format || "") + '" placeholder="{firma}"><div class="hint">Platzhalter: {firma} {kategorie} {einheit} {sku} {name} {ean}</div></div>' +
        '<label class="check"><input type="checkbox" name="negative_stock"' + (st.negative_stock !== false ? " checked" : "") + '> Negativen Bestand zulassen (Ausgang auch buchen, wenn der Bestand nicht reicht)</label>' +
        '<div class="btnrow"><button class="btn primary" type="submit">Speichern</button></div></form></div>';
      h += '<div class="card"><h2>Daten</h2><p class="help">Alle Daten gehören dem Betrieb und lassen sich jederzeit exportieren.</p>' +
        '<div class="btnrow"><button class="btn ghost sm" type="button" data-act="items-csv">' + ic("download") + ' Artikelliste (CSV)</button><button class="btn ghost sm" type="button" data-act="export-json">' + ic("download") + ' Komplettexport (JSON)</button></div></div>';
      return h;
    },
    mount: function () { if (!isAdmin()) return; renderPlans(); loadInvoices(false); },
    update: function (evt) { if (evt && evt.kind === "pull") softRender(); }
  };
  ACTIONS["export-json"] = function (el) {
    if (!onlineOr("Der Export ist nur online möglich.")) return;
    el.disabled = true;
    LVSync.api("export", {}, 120000).then(function (res) {
      el.disabled = false;
      if (!okRes(res)) { toast(apiErr(res), "err", 4000); return; }
      download("vaydena-lager-export-" + fileDate() + ".json", JSON.stringify(res.data, null, 1), "application/json");
      toast("Export erstellt.", "ok");
    });
  };
  ACTIONS["items-csv"] = function () {
    var idx = stockIndex(), rows = [["Artikelnummer", "Bezeichnung", "EAN", "Einheit", "Mindestbestand", "Kategorie", "Notiz", "Bestand"]];
    LVStore.activeItems().sort(function (a, b) { return String(a.sku).localeCompare(String(b.sku), "de"); }).forEach(function (it) {
      rows.push([it.sku, it.name, it.barcode || "", unitOf(it), LVStore.round3(it.min_stock || 0), it.category || "", it.note || "", LVStore.round3(idx.totals.get(it.id) || 0)]);
    });
    download("vaydena-lager-artikel-" + fileDate() + ".csv", csvText(rows), "text/csv");
  };

  // =====================================================================
  // Konto (Nutzer, Abgleich, Gerät)
  // =====================================================================
  function conflictRow(e) {
    var rec = e.kind === "item" ? S.items.get(e.id) : e.kind === "location" ? S.locations.get(e.id) : S.codes.get(e.id);
    var label = e.kind === "item" ? "Artikel" : e.kind === "location" ? "Lagerort" : "Zusatzcode";
    var name = rec ? (e.kind === "item_code" ? rec.code : ((rec.sku || rec.code || "") + " · " + (rec.name || ""))) : "(nicht mehr vorhanden)";
    var href = rec && e.kind === "item" ? "#artikel/" + encodeURIComponent(e.id) : (rec && e.kind === "location" ? "#lagerorte" : null);
    return '<div class="row"><div class="ic grey">' + ic("warn") + '</div><div class="txt"><div class="t">' + esc(label) + ': ' + esc(name) + '</div>' +
      '<div class="s errtxt">' + esc(errMsg(e.error)) + (e.error_at ? ' · ' + esc(relTime(e.error_at)) : "") + '</div></div>' +
      '<div class="acts">' + (href ? '<a class="btn ghost xs" href="' + href + '">Bearbeiten</a>' : "") +
      '<button class="btn ghost xs" type="button" data-act="conflict-retry" data-kind="' + esc(e.kind) + '" data-id="' + esc(e.id) + '">Erneut senden</button>' +
      '<button class="btn ghost xs danger" type="button" data-act="conflict-drop" data-kind="' + esc(e.kind) + '" data-id="' + esc(e.id) + '">Verwerfen</button></div></div>';
  }
  VIEWS.konto = {
    title: "Konto",
    render: function () {
      var t = S.tenant || {}, m = S.member || {}, st = LVSync.st, c = LVSync.counts();
      var conflicts = S.outbox.filter(function (o) { return o.error; });
      var h = '<div class="ph"><h1>Konto</h1></div>';
      h += '<div class="card"><h2>' + esc(m.name || App.userEmail || "Konto") + '</h2><dl class="kv"><dt>E-Mail</dt><dd>' + esc(m.email || App.userEmail || "–") + '</dd><dt>Rolle</dt><dd>' + esc(roleLabel(m.role)) + '</dd><dt>Betrieb</dt><dd>' + esc(t.name || "–") + '</dd></dl>' +
        '<div class="btnrow"><button class="btn ghost sm" type="button" data-act="pw-change">' + ic("edit") + ' Passwort ändern</button><button class="btn ghost sm" type="button" data-act="logout-soft">Abmelden</button></div></div>';
      var statusTxt = st.syncing ? "Abgleich läuft …" : st.offline ? "Offline" : st.authLost ? "Anmeldung abgelaufen" : st.blocked ? errMsg(st.blocked) : st.subInactive ? "Abo nicht aktiv – Lesen möglich, Übertragen gesperrt" : st.lastError ? errMsg(st.lastError) : "Verbunden";
      var syncCls = st.authLost || st.blocked || conflicts.length || c.failed ? " err" : (st.offline || st.subInactive || c.pending ? " warn" : "");
      h += '<div class="card' + syncCls + '"><h2>Abgleich</h2><dl class="kv">' +
        '<dt>Status</dt><dd>' + esc(statusTxt) + '</dd>' +
        '<dt>Letzter Abgleich</dt><dd>' + (S.meta.last_sync ? esc(fmtDate(S.meta.last_sync)) + ' (' + esc(relTime(S.meta.last_sync)) + ')' : "noch nie") + '</dd>' +
        '<dt>Wartend</dt><dd>' + c.pending + ' Änderung' + (c.pending === 1 ? "" : "en") + '</dd>' +
        (c.failed ? '<dt>Abgelehnt</dt><dd>' + c.failed + ' Buchung' + (c.failed === 1 ? "" : "en") + ' – <a href="#journal">im Journal prüfen</a></dd>' : "") + '</dl>' +
        '<div class="btnrow"><button class="btn primary sm" type="button" data-act="sync-now"' + (st.syncing ? " disabled" : "") + '>' + ic("refresh") + ' Jetzt abgleichen</button><button class="btn ghost sm" type="button" data-act="full-reload">Alle Daten neu laden</button></div>' +
        (conflicts.length ? '<h3>Vom Server abgelehnte Änderungen</h3><p class="help">Diese Stammdaten-Änderungen wurden abgelehnt (z. B. doppelte Nummer). Bearbeiten und erneut senden – oder verwerfen, dann gilt wieder der Stand vom Server.</p><div class="list">' + conflicts.map(conflictRow).join("") + '</div>' : "") + '</div>';
      var installed = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
      var ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
      h += '<div class="card"><h2>App &amp; Gerät</h2>' +
        (installed ? '<p class="note">Die App ist auf diesem Gerät installiert.</p>' :
          App.installPrompt ? '<p>Als App installieren: eigenes Symbol auf dem Startbildschirm, Vollbild, schneller Start – auch offline.</p><div class="btnrow"><button class="btn primary sm" type="button" data-act="install-app">' + ic("download") + ' App installieren</button></div>' :
          ios ? '<p class="note">Auf iPhone und iPad: in Safari das Teilen-Symbol antippen und „Zum Home-Bildschirm“ wählen. Danach startet Vaydena Lager wie eine installierte App – auch offline.</p>' :
          '<p class="note">Zum Installieren im Browser-Menü „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen.</p>') +
        '<dl class="kv"><dt>Kamera-Scan</dt><dd>' + (LVScan.supported() ? "verfügbar" : (LVScan.secure() ? "auf diesem Gerät nicht verfügbar" : "nur über HTTPS verfügbar")) + '</dd>' +
        '<dt>Dauerhafter Speicher</dt><dd>' + (S.persistent ? "ja" : "nein – Offline-Daten können beim Schließen verloren gehen") + '</dd>' +
        '<dt>Gerät</dt><dd class="mono">' + esc(String(S.meta.device_id || "").slice(0, 8)) + '</dd>' +
        '<dt>Version</dt><dd>' + esc(APP_VERSION) + '</dd></dl>' +
        '<label class="check"><input type="checkbox" data-change="cam-pref"' + (camPref() ? " checked" : "") + '> Kamera beim Öffnen von Scannen und Inventur automatisch starten</label></div>';
      h += '<div class="card"><h2>Daten auf diesem Gerät</h2><p class="help">Artikel, Bestände und Buchungen liegen für den Offline-Betrieb auf diesem Gerät. Beim Löschen werden sie entfernt – noch nicht übertragene Buchungen gehen dabei verloren. Auf dem Server bleibt alles erhalten.</p>' +
        '<div class="btnrow"><button class="btn danger sm" type="button" data-act="logout-wipe">' + ic("trash") + ' Abmelden und lokale Daten löschen</button></div></div>';
      h += '<p class="note center"><a href="datenschutz.html" target="_blank" rel="noopener">Datenschutz</a> · <a href="agb.html" target="_blank" rel="noopener">AGB</a> · <a href="impressum.html" target="_blank" rel="noopener">Impressum</a></p>';
      return h;
    }
  };
  ACTIONS["full-reload"] = function () {
    if (!onlineOr("Neu laden ist nur online möglich.")) return;
    S.meta.since = null;
    LVStore.save("meta", true).then(function () { toast("Vollständiger Abgleich gestartet …"); return LVSync.sync("full"); })
      .then(function (r) { if (r && r.ok) toast("Alle Daten neu geladen.", "ok"); else if (r && !r.busy) toast(errMsg(LVSync.st.lastError), "err", 4000); });
  };
  ACTIONS["conflict-retry"] = function (el) {
    var kind = el.getAttribute("data-kind"), id = el.getAttribute("data-id");
    LVStore.queue(kind, id);
    LVStore.save("outbox", true).then(function () {
      renderBanners(); renderSyncdot(); renderView();
      if (navigator.onLine) LVSync.sync("retry"); else toast("Wird beim nächsten Abgleich erneut gesendet.");
    });
  };
  ACTIONS["conflict-drop"] = function (el) {
    var kind = el.getAttribute("data-kind"), id = el.getAttribute("data-id");
    confirmDlg("Die lokale Änderung verwerfen? Danach gilt wieder der Stand vom Server (wird beim nächsten Abgleich geladen).", { ok: "Verwerfen", danger: true }).then(function (yes) {
      if (!yes) return;
      LVStore.dropOutbox({ kind: kind, id: id }, true).then(function () { S.meta.since = null; return LVStore.save("meta", true); })
        .then(function () { renderBanners(); renderSyncdot(); renderView(); if (navigator.onLine) LVSync.sync("restore"); });
    });
  };
  ACTIONS["install-app"] = function () {
    var p = App.installPrompt; if (!p) { toast("Installation über das Browser-Menü möglich."); return; }
    try { p.prompt(); } catch (e) { toast("Installation über das Browser-Menü möglich."); return; }
    (p.userChoice || Promise.resolve({})).then(function (r) { App.installPrompt = null; if (r && r.outcome === "accepted") toast("App wird installiert.", "ok"); softRender(); }).catch(function () { App.installPrompt = null; });
  };
  INPUTS["cam-pref"] = function (el) { setCamPref(el.checked); toast(el.checked ? "Die Kamera startet künftig automatisch." : "Die Kamera startet nur noch auf Tipp."); };
  ACTIONS["pw-change"] = function () {
    if (!onlineOr("Das Passwort lässt sich nur online ändern.")) return;
    if (!LV.sb) { location.href = "anmelden.html#passwort"; return; }
    modal({
      title: "Passwort ändern",
      body: '<form data-form="password" novalidate>' +
        '<div class="field"><label>Neues Passwort</label><input name="pw1" type="password" minlength="8" required autocomplete="new-password"><div class="hint">Mindestens 8 Zeichen.</div></div>' +
        '<div class="field"><label>Neues Passwort wiederholen</label><input name="pw2" type="password" required autocomplete="new-password"></div>' +
        '<div class="msg hide" id="pwMsg"></div>' +
        '<div class="btnrow"><button class="btn ghost" type="button" data-act="modal-close">Abbrechen</button><button class="btn primary" type="submit">Passwort speichern</button></div></form>'
    });
  };
  FORMS.password = function (f) {
    var pw1 = f.pw1 ? f.pw1.value : "", pw2 = f.pw2 ? f.pw2.value : "", msg = byId("pwMsg"), btn = $("button[type=submit]", f);
    function err(t) { if (msg) { msg.className = "msg err"; msg.textContent = t; } }
    if (pw1.length < 8) return err("Das Passwort muss mindestens 8 Zeichen haben.");
    if (pw1 !== pw2) return err("Die Passwörter stimmen nicht überein.");
    if (!LV.sb || !LV.sb.auth) return err("Passwortänderung ist in diesem Browser nicht verfügbar.");
    if (btn) btn.disabled = true;
    LV.sb.auth.updateUser({ password: pw1 }).then(function (r) {
      if (btn) btn.disabled = false;
      if (r && r.error) return err(/same password|different from the old/i.test(String(r.error.message || "")) ? "Das neue Passwort darf nicht dem bisherigen entsprechen." : "Das Passwort konnte nicht geändert werden. Bitte neu anmelden und erneut versuchen.");
      closeModal(true); toast("Passwort geändert.", "ok");
    }).catch(function () { if (btn) btn.disabled = false; err("Das Passwort konnte nicht geändert werden."); });
  };
  ACTIONS["logout-soft"] = function () {
    var c = LVSync.counts(), n = c.pending + c.conflicts;
    var p = n ? confirmDlg(n + " Änderung" + (n === 1 ? "" : "en") + " wurde" + (n === 1 ? "" : "n") + " noch nicht übertragen. Sie bleiben auf diesem Gerät gespeichert und werden nach der nächsten Anmeldung mit demselben Konto übertragen. Trotzdem abmelden?", { ok: "Abmelden" }) : Promise.resolve(true);
    p.then(function (yes) { if (!yes) return; LV.signOut().then(function () { location.href = "anmelden.html"; }).catch(function () { location.href = "anmelden.html"; }); });
  };
  ACTIONS["logout-wipe"] = function () {
    var c = LVSync.counts(), n = c.pending + c.conflicts;
    confirmDlg("Alle lokal gespeicherten Daten dieses Betriebs werden von diesem Gerät entfernt" + (n ? " – einschließlich " + n + " noch nicht übertragener Änderung" + (n === 1 ? "" : "en") + ", die damit verloren " + (n === 1 ? "geht" : "gehen") : "") + ". Auf dem Server bleibt alles erhalten.", { ok: "Löschen und abmelden", danger: true, title: "Lokale Daten löschen" }).then(function (yes) {
      if (!yes) return;
      LVStore.clearAll().then(function () { return LV.signOut(); }).then(function () { location.href = "anmelden.html"; }).catch(function () { location.href = "anmelden.html"; });
    });
  };

  // =====================================================================
  // CSV-Import (Artikel, nur Administratoren)
  // =====================================================================
  var CSV_FIELDS = [
    { k: "sku", label: "Artikelnummer", alias: ["artikelnummer", "artikelnr", "artnr", "artikelno", "sku", "nummer", "nr", "itemno", "itemnumber", "artikelcode", "artikelid"] },
    { k: "name", label: "Bezeichnung", alias: ["bezeichnung", "name", "artikel", "artikelname", "artikelbezeichnung", "beschreibung", "description", "titel", "text", "produkt"] },
    { k: "barcode", label: "EAN / Barcode", alias: ["ean", "gtin", "barcode", "strichcode", "upc", "eancode", "eannummer", "code"] },
    { k: "unit", label: "Einheit", alias: ["einheit", "unit", "me", "mengeneinheit", "einh"] },
    { k: "min_stock", label: "Mindestbestand", alias: ["mindestbestand", "minbestand", "mindest", "minimum", "min", "meldebestand", "minstock", "sollbestand"] },
    { k: "category", label: "Kategorie", alias: ["kategorie", "gruppe", "warengruppe", "category", "rubrik", "artikelgruppe"] },
    { k: "note", label: "Notiz", alias: ["notiz", "bemerkung", "note", "notes", "kommentar", "hinweis", "info"] },
    { k: "qty", label: "Bestand (optional)", alias: ["bestand", "anfangsbestand", "menge", "stock", "qty", "quantity", "istbestand", "ist", "lagerbestand", "anzahl"] }
  ];
  function normHead(h) { return String(h || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]/g, ""); }
  function autoMap(header) {
    var map = {}, used = {}, norm = header.map(normHead);
    var passes = [
      { exact: true, order: CSV_FIELDS },
      { exact: false, order: CSV_FIELDS.filter(function (f) { return f.k !== "name"; }).concat(CSV_FIELDS.filter(function (f) { return f.k === "name"; })) }
    ];
    passes.forEach(function (p) {
      p.order.forEach(function (f) {
        if (map[f.k] != null) return;
        for (var i = 0; i < norm.length; i++) {
          if (used[i] || !norm[i]) continue;
          var hit = f.alias.some(function (a) { return p.exact ? norm[i] === a : norm[i].indexOf(a) === 0; });
          if (hit) { map[f.k] = i; used[i] = true; break; }
        }
      });
    });
    return map;
  }
  function readCsvFile(file, cb) {
    var r = new FileReader();
    r.onload = function () {
      var t = String(r.result || "");
      if (t.indexOf("�") >= 0) {
        var r2 = new FileReader();
        r2.onload = function () { cb(String(r2.result || "")); };
        r2.onerror = function () { cb(t); };
        r2.readAsText(file, "windows-1252"); return;
      }
      cb(t);
    };
    r.onerror = function () { toast("Die Datei konnte nicht gelesen werden.", "err"); };
    r.readAsText(file, "utf-8");
  }
  function csvPlan() {
    var c = App.csv, map = c.map, plan = { items: [], newCount: 0, updCount: 0, skip: 0, skipNoName: 0, skipExisting: 0, dupInFile: 0, codeNeeded: 0, barcodeClash: 0, qtyRows: 0 };
    if (!c || map.name == null) return plan;
    var bySku = new Map();
    S.items.forEach(function (it) { if (!it.deleted && it.sku) bySku.set(String(it.sku).toLowerCase(), it); });
    var seenSku = {}, seenBar = {};
    c.rows.forEach(function (r, idx) {
      function col(k) { return map[k] == null ? "" : String(r[map[k]] == null ? "" : r[map[k]]).trim(); }
      var name = col("name"), sku = col("sku");
      if (!name) { plan.skip++; plan.skipNoName++; return; }
      var key = sku.toLowerCase();
      if (sku && seenSku[key]) { plan.skip++; plan.dupInFile++; return; }
      if (sku) seenSku[key] = true;
      var ex = sku ? bySku.get(key) : null;
      if (ex && !c.update) { plan.skip++; plan.skipExisting++; return; }
      var rec = { line: idx + 2, existing: ex || null, sku: sku.slice(0, 40), name: name.slice(0, 120), barcode: col("barcode").slice(0, 64) || null, unit: col("unit").slice(0, 12) || null, min_stock: parseQty(col("min_stock")) || 0, category: col("category").slice(0, 60) || null, note: col("note").slice(0, 500) || null, qty: map.qty == null ? null : parseQty(col("qty")) };
      if (rec.barcode) {
        var bk = rec.barcode.toLowerCase();
        if (seenBar[bk] || LVStore.codeInUse(rec.barcode, ex ? ex.id : null)) { rec.barcode = null; plan.barcodeClash++; }
        else seenBar[bk] = true;
      }
      if (rec.qty != null) plan.qtyRows++;
      if (ex) plan.updCount++; else { plan.newCount++; if (!sku) plan.codeNeeded++; }
      plan.items.push(rec);
    });
    return plan;
  }
  function renderCsvBody() {
    var box = byId("csvBody"), c = App.csv; if (!box || !c) return;
    if (!c.header.length) { box.innerHTML = ""; return; }
    var plan = csvPlan();
    var h = '<h3>Spalten zuordnen</h3><p class="note">Datei „' + esc(c.file) + '“ – ' + c.rows.length + ' Datenzeile' + (c.rows.length === 1 ? "" : "n") + ', ' + c.header.length + ' Spalten. Die Zuordnung wurde automatisch vorgeschlagen und kann angepasst werden.</p><div class="f3">' +
      CSV_FIELDS.map(function (f) {
        return '<div class="field"><label>' + esc(f.label) + (f.k === "name" ? " *" : "") + '</label><select data-change="csv-map" data-k="' + f.k + '"><option value="">– nicht importieren –</option>' +
          c.header.map(function (hd, i) { return '<option value="' + i + '"' + (c.map[f.k] === i ? " selected" : "") + '>' + esc(hd || ("Spalte " + (i + 1))) + '</option>'; }).join("") + '</select></div>';
      }).join("") + '</div>';
    h += '<label class="check"><input type="checkbox" data-change="csv-update"' + (c.update ? " checked" : "") + '> Vorhandene Artikel mit gleicher Artikelnummer aktualisieren</label>';
    if (c.map.qty != null) h += '<div class="field"><label>Bestand als Zählung buchen an Lagerort</label><select data-change="csv-loc">' + locOptions(c.stockLoc, null, "– Bestand nicht buchen –") + '</select><div class="hint">Die Spalte „Bestand“ wird als Zählung (Ist-Bestand) an diesem Lagerort gebucht.</div></div>';
    var mapped = CSV_FIELDS.filter(function (f) { return c.map[f.k] != null; });
    if (mapped.length) {
      h += '<h3>Vorschau (erste 5 Zeilen)</h3><div class="tblwrap"><table class="tbl"><thead><tr>' + mapped.map(function (f) { return '<th>' + esc(f.label) + '</th>'; }).join("") + '</tr></thead><tbody>' +
        c.rows.slice(0, 5).map(function (r) { return '<tr>' + mapped.map(function (f) { var v = r[c.map[f.k]]; return '<td>' + esc(String(v == null ? "" : v)) + '</td>'; }).join("") + '</tr>'; }).join("") + '</tbody></table></div>';
    }
    var notes = [];
    if (plan.skipNoName) notes.push(plan.skipNoName + " Zeile" + (plan.skipNoName === 1 ? "" : "n") + " ohne Bezeichnung");
    if (plan.dupInFile) notes.push(plan.dupInFile + " doppelte Artikelnummer" + (plan.dupInFile === 1 ? "" : "n") + " in der Datei");
    if (plan.skipExisting) notes.push(plan.skipExisting + " bereits vorhanden (Aktualisieren ist aus)");
    if (plan.barcodeClash) notes.push(plan.barcodeClash + " EAN/Barcode" + (plan.barcodeClash === 1 ? "" : "s") + " bereits vergeben – wird weggelassen");
    var room = itemLimit() - LVStore.itemCount(), over = plan.newCount > room, blocked = c.map.name == null || over || !plan.items.length;
    h += '<div class="msg ' + (blocked ? "err" : "info") + '">' + (c.map.name == null ? "Bitte die Spalte mit der Bezeichnung zuordnen." :
      !plan.items.length ? "Keine importierbaren Zeilen." + (notes.length ? " " + esc(notes.join(" · ")) : "") :
      '<b>' + plan.newCount + ' neu</b>, <b>' + plan.updCount + ' aktualisieren</b>, ' + plan.skip + ' überspringen' +
      (plan.codeNeeded ? ' · ' + plan.codeNeeded + ' neue Artikelnummer' + (plan.codeNeeded === 1 ? "" : "n") + ' ' + (plan.codeNeeded === 1 ? "wird" : "werden") + ' vergeben' : "") +
      (plan.qtyRows && c.stockLoc ? ' · ' + plan.qtyRows + ' Bestandsbuchung' + (plan.qtyRows === 1 ? "" : "en") : "") +
      (notes.length ? '<br>' + esc(notes.join(" · ")) : "") +
      (over ? '<br>Der Tarif erlaubt ' + esc(nf.format(itemLimit())) + ' Artikel – es passen nur noch ' + esc(nf.format(Math.max(0, room))) + ' neue hinein.' : "")) + '</div>';
    h += '<div class="btnrow"><button class="btn ghost" type="button" data-act="modal-close">Abbrechen</button><button class="btn primary" type="button" id="csvRunBtn" data-act="csv-run"' + (blocked ? " disabled" : "") + '>' + ic("upload") + ' Importieren</button></div>';
    box.innerHTML = h;
  }
  function takeCodeLocal() {
    var p = S.meta.reserved.items, prefix = (S.tenant && S.tenant.code_prefix) || "ART";
    while (p.length && p[0].indexOf(prefix + "-") !== 0) p.shift();
    return p.shift() || null;
  }
  function ensureItemCodes(n) {
    var prefix = (S.tenant && S.tenant.code_prefix) || "ART";
    function have() { return S.meta.reserved.items.filter(function (c) { return c.indexOf(prefix + "-") === 0; }).length; }
    if (have() >= n) return Promise.resolve(true);
    if (!navigator.onLine) { toast("Für " + n + " Artikel ohne Artikelnummer werden neue Nummern benötigt – dafür ist einmal eine Internetverbindung nötig.", "err", 6000); return Promise.resolve(false); }
    var tries = 0;
    function step() {
      var missing = n - have();
      if (missing <= 0) return Promise.resolve(true);
      if (++tries > 12) { toast("Es konnten nicht genug Artikelnummern reserviert werden.", "err", 4000); return Promise.resolve(false); }
      return LVSync.api("reserve_codes", { items: Math.min(200, missing + 10) }, 30000).then(function (res) {
        if (!okRes(res)) { toast(apiErr(res), "err", 4000); return false; }
        (res.data.items || []).forEach(function (c) { if (S.meta.reserved.items.indexOf(c) < 0) S.meta.reserved.items.push(c); });
        if (!(res.data.items || []).length) { toast("Der Server hat keine neuen Artikelnummern geliefert.", "err", 4000); return false; }
        return step();
      });
    }
    return step();
  }
  function csvRun() {
    var c = App.csv; if (!c) return;
    var plan = csvPlan(), btn = byId("csvRunBtn");
    if (!plan.items.length) { toast("Nichts zu importieren.", "warn"); return; }
    var limit = itemLimit(), room = limit - LVStore.itemCount();
    if (plan.newCount > room) { toast("Der Tarif erlaubt " + nf.format(limit) + " Artikel – es passen nur noch " + nf.format(Math.max(0, room)) + " neue hinein.", "err", 5000); return; }
    var loc = c.stockLoc ? S.locations.get(c.stockLoc) : null;
    if (loc && (loc.deleted || loc.active === false)) loc = null;
    if (btn) { btn.disabled = true; btn.textContent = "Importiere …"; }
    ensureItemCodes(plan.codeNeeded).then(function (ok) {
      if (!ok) { if (btn) { btn.disabled = false; btn.textContent = "Importieren"; } return; }
      var base = Date.now(), n = 0, movs = 0, mapMin = c.map.min_stock != null;
      plan.items.forEach(function (p, i) {
        var ts = new Date(base + i * 2).toISOString(), rec;
        if (p.existing) {
          rec = p.existing;
          rec.name = p.name;
          if (p.barcode) rec.barcode = p.barcode;
          if (p.unit) rec.unit = p.unit;
          if (mapMin) rec.min_stock = p.min_stock;
          if (p.category) rec.category = p.category;
          if (p.note) rec.note = p.note;
          rec.deleted = false; rec.updated_at = ts;
        } else {
          var sku = p.sku || takeCodeLocal();
          if (!sku) return;
          rec = { id: LVStore.uuid(), sku: sku, name: p.name, barcode: p.barcode, unit: p.unit, min_stock: p.min_stock, category: p.category, note: p.note, active: true, deleted: false, created_at: ts, updated_at: ts };
        }
        S.items.set(rec.id, rec); LVStore.queue("item", rec.id); n++;
        if (p.qty != null && loc) {
          S.pending.push({ id: LVStore.uuid(), item_id: rec.id, location_id: loc.id, to_location_id: null, type: "count", qty: p.qty, note: "CSV-Import", member_id: S.member ? S.member.id : null, device_id: S.meta.device_id, created_at: new Date(base + i * 2 + 1).toISOString(), pending: true });
          movs++;
        }
      });
      LVStore.invalidate();
      LVStore.save(["items", "outbox", "meta", "pending"], true).then(function () {
        App.csv = null;
        closeModal(true);
        LVStore.emit("change", { kind: "item" });
        if (movs) LVStore.emit("change", { kind: "movement" });
        toast(n + " Artikel importiert (" + plan.newCount + " neu, " + plan.updCount + " aktualisiert)" + (movs ? ", " + movs + " Bestände gebucht" : "") + " – wird übertragen.", "ok", 5000);
        LVSync.schedule(500);
        if (App.viewName === "artikel" && !App.route.arg) renderView(); else nav("artikel");
      });
    });
  }
  ACTIONS["csv-import"] = function () {
    if (!isAdmin()) return;
    App.csv = { rows: [], header: [], map: {}, file: "", update: true, stockLoc: defaultLoc() || "" };
    modal({
      title: "Artikel aus CSV importieren", wide: true,
      body: '<p class="help">Aus Excel: „Datei → Speichern unter → CSV (Trennzeichen-getrennt)“. Die erste Zeile enthält die Spaltenüberschriften, z. B. <b>Artikelnummer; Bezeichnung; EAN; Einheit; Mindestbestand; Kategorie; Notiz; Bestand</b>. Zeilen ohne Artikelnummer erhalten automatisch eine neue Nummer.</p>' +
        '<div class="btnrow top"><button class="btn ghost sm" type="button" data-act="csv-template">' + ic("download") + ' Vorlage herunterladen</button></div>' +
        '<div class="field"><label>CSV-Datei</label><input type="file" id="csvFile" accept=".csv,.txt,text/csv,text/plain" data-change="csv-file"></div>' +
        '<div id="csvBody"></div>',
      onClose: function () { App.csv = null; }
    });
  };
  ACTIONS["csv-template"] = function () {
    download("vaydena-lager-import-vorlage.csv", csvText([
      ["Artikelnummer", "Bezeichnung", "EAN", "Einheit", "Mindestbestand", "Kategorie", "Notiz", "Bestand"],
      ["", "Schrauben M8x40 verzinkt", "4006381333931", "Stk", "100", "Befestigung", "Karton à 200", "250"],
      ["ART-000010", "Kabelbinder 200 mm schwarz", "", "Pack", "5", "Elektro", "", "12"]
    ]), "text/csv");
  };
  INPUTS["csv-file"] = function (el) {
    var file = el.files && el.files[0]; if (!file || !App.csv) return;
    if (file.size > 5 * 1024 * 1024) { toast("Die Datei ist zu groß (maximal 5 MB).", "err"); return; }
    readCsvFile(file, function (text) {
      var c = App.csv; if (!c) return;
      var rows = parseCsv(text);
      if (rows.length < 2) { var b = byId("csvBody"); if (b) b.innerHTML = '<div class="msg err">Die Datei enthält keine Datenzeilen (nur eine Überschrift oder leer).</div>'; return; }
      c.file = file.name; c.header = rows[0].map(function (h) { return String(h == null ? "" : h).trim(); }); c.rows = rows.slice(1); c.map = autoMap(c.header);
      renderCsvBody();
    });
  };
  INPUTS["csv-map"] = function (el) { if (!App.csv) return; var k = el.getAttribute("data-k"), v = el.value; if (v === "") delete App.csv.map[k]; else App.csv.map[k] = parseInt(v, 10); renderCsvBody(); };
  INPUTS["csv-update"] = function (el) { if (!App.csv) return; App.csv.update = !!el.checked; renderCsvBody(); };
  INPUTS["csv-loc"] = function (el) { if (!App.csv) return; App.csv.stockLoc = el.value; renderCsvBody(); };
  ACTIONS["csv-run"] = function () { csvRun(); };

  // =====================================================================
  // Start
  // =====================================================================
  window.LVApp = { toast: toast, nav: nav, App: App, version: APP_VERSION };
  boot();
})();
