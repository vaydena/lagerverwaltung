/* Vaydena Lager — lokaler Datenspeicher (IndexedDB) + abgeleiteter Bestand.
   Offline-first: alle Stammdaten, der Server-Bestand, das Journal und die
   Warteschlange (Outbox) liegen auf dem Gerät. window.LVStore */
(function () {
  "use strict";
  var DB_NAME = "vaydena-lager", DB_VER = 1, KV = "kv";
  var db = null, memOnly = false, mem = {};

  // ---------- IndexedDB Key-Value ----------
  function open() {
    return new Promise(function (resolve) {
      if (!("indexedDB" in window)) { memOnly = true; return resolve(null); }
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { memOnly = true; return resolve(null); }
      req.onupgradeneeded = function () { var d = req.result; if (!d.objectStoreNames.contains(KV)) d.createObjectStore(KV); };
      req.onsuccess = function () { db = req.result; db.onversionchange = function () { try { db.close(); } catch (e) {} }; resolve(db); };
      req.onerror = function () { memOnly = true; resolve(null); };
      req.onblocked = function () { memOnly = true; resolve(null); };
    });
  }
  function kvGet(key) {
    if (memOnly || !db) return Promise.resolve(mem[key]);
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(KV, "readonly"), r = tx.objectStore(KV).get(key);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { resolve(undefined); };
      } catch (e) { resolve(undefined); }
    });
  }
  function kvSet(key, val) {
    if (memOnly || !db) { mem[key] = val; return Promise.resolve(); }
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(KV, "readwrite");
        tx.objectStore(KV).put(val, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
        tx.onabort = function () { resolve(); };
      } catch (e) { resolve(); }
    });
  }
  function kvClear() {
    mem = {};
    if (memOnly || !db) return Promise.resolve();
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(KV, "readwrite");
        tx.objectStore(KV).clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      } catch (e) { resolve(); }
    });
  }

  // ---------- Zustand ----------
  var S = {
    ready: false, persistent: true,
    tenant: null, member: null, members: [],
    items: new Map(), codes: new Map(), locations: new Map(),
    stock: new Map(),       // "item|loc" -> {item_id, location_id, qty, updated_at}
    movements: new Map(),   // id -> bestätigte Bewegung
    pending: [],            // wartende Bewegungen (in Reihenfolge)
    outbox: [],             // {kind:'item'|'location'|'item_code', id, ts, error?}
    failed: [],             // abgelehnte Buchungen (zur Anzeige)
    meta: { user_id: null, since: null, device_id: null, reserved: { items: [], locations: [] }, last_sync: null, last_used_location: null }
  };
  var effCache = null;
  var listeners = {};
  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
  function emit(ev, data) { (listeners[ev] || []).forEach(function (f) { try { f(data); } catch (e) { console.error(e); } }); }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach(function (_, i) { b[i] = Math.random() * 256 | 0; });
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }
  function nowIso() { return new Date().toISOString(); }
  function skey(itemId, locId) { return itemId + "|" + locId; }

  // ---------- Persistenz (gebündelt) ----------
  var dirty = {}, saveTimer = null, saving = null;
  function toArr(m) { return Array.from(m.values()); }
  function snapshot(key) {
    switch (key) {
      case "items": return toArr(S.items);
      case "codes": return toArr(S.codes);
      case "locations": return toArr(S.locations);
      case "stock": return toArr(S.stock);
      case "movements": return toArr(S.movements);
      case "pending": return S.pending.slice();
      case "outbox": return S.outbox.slice();
      case "failed": return S.failed.slice();
      case "members": return S.members.slice();
      case "tenant": return S.tenant;
      case "member": return S.member;
      case "meta": return S.meta;
    }
    return null;
  }
  function flush() {
    var keys = Object.keys(dirty); dirty = {};
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    var p = Promise.all(keys.map(function (k) { return kvSet(k, snapshot(k)); }));
    saving = p; return p;
  }
  function save(keys, immediate) {
    (Array.isArray(keys) ? keys : [keys]).forEach(function (k) { dirty[k] = true; });
    if (immediate) return flush();
    if (!saveTimer) saveTimer = setTimeout(flush, 400);
    return Promise.resolve();
  }

  // ---------- Laden / Initialisieren ----------
  function fromArr(arr, keyFn) { var m = new Map(); (arr || []).forEach(function (r) { m.set(keyFn(r), r); }); return m; }
  function init(userId) {
    return open().then(function () {
      S.persistent = !memOnly;
      return kvGet("meta");
    }).then(function (meta) {
      if (meta && meta.user_id && userId && meta.user_id !== userId) {
        // anderer Nutzer auf diesem Gerät -> lokale Daten gehören ihm nicht
        return kvClear().then(function () { return null; });
      }
      return meta || null;
    }).then(function (meta) {
      if (meta) S.meta = Object.assign(S.meta, meta);
      if (!S.meta.reserved) S.meta.reserved = { items: [], locations: [] };
      S.meta.user_id = userId || S.meta.user_id;
      if (!S.meta.device_id) S.meta.device_id = "dev-" + uuid().slice(0, 8);
      return Promise.all([kvGet("tenant"), kvGet("member"), kvGet("members"), kvGet("items"), kvGet("codes"), kvGet("locations"), kvGet("stock"), kvGet("movements"), kvGet("pending"), kvGet("outbox"), kvGet("failed")]);
    }).then(function (r) {
      S.tenant = r[0] || null; S.member = r[1] || null; S.members = r[2] || [];
      S.items = fromArr(r[3], function (x) { return x.id; });
      S.codes = fromArr(r[4], function (x) { return x.id; });
      S.locations = fromArr(r[5], function (x) { return x.id; });
      S.stock = fromArr(r[6], function (x) { return skey(x.item_id, x.location_id); });
      S.movements = fromArr(r[7], function (x) { return x.id; });
      S.pending = r[8] || []; S.outbox = r[9] || []; S.failed = r[10] || [];
      S.ready = true; effCache = null;
      return save("meta", true);
    });
  }
  function clearAll() {
    var dev = S.meta.device_id;
    S.tenant = null; S.member = null; S.members = [];
    S.items = new Map(); S.codes = new Map(); S.locations = new Map(); S.stock = new Map(); S.movements = new Map();
    S.pending = []; S.outbox = []; S.failed = [];
    S.meta = { user_id: S.meta.user_id, since: null, device_id: dev, reserved: { items: [], locations: [] }, last_sync: null, last_used_location: null };
    dirty = {}; effCache = null;
    return kvClear().then(function () { return save("meta", true); });
  }

  // ---------- Stammdaten (lokale Änderungen -> Outbox) ----------
  function queue(kind, id) {
    var e = S.outbox.find(function (o) { return o.kind === kind && o.id === id; });
    if (e) { e.ts = nowIso(); delete e.error; delete e.error_at; }
    else S.outbox.push({ kind: kind, id: id, ts: nowIso() });
  }
  function hasPendingChange(kind, id) { return S.outbox.some(function (o) { return o.kind === kind && o.id === id; }); }

  function upsertItem(rec) {
    rec.updated_at = nowIso(); if (!rec.created_at) rec.created_at = rec.updated_at;
    if (rec.active == null) rec.active = true; rec.deleted = !!rec.deleted;
    S.items.set(rec.id, rec); queue("item", rec.id); effCache = null;
    return save(["items", "outbox"], true).then(function () { emit("change", { kind: "item", id: rec.id }); return rec; });
  }
  function deleteItem(id) {
    var rec = S.items.get(id); if (!rec) return Promise.resolve();
    rec.deleted = true; rec.updated_at = nowIso(); queue("item", id); effCache = null;
    return save(["items", "outbox"], true).then(function () { emit("change", { kind: "item", id: id }); });
  }
  function upsertLocation(rec) {
    rec.updated_at = nowIso(); if (!rec.created_at) rec.created_at = rec.updated_at;
    if (rec.active == null) rec.active = true; rec.deleted = !!rec.deleted;
    S.locations.set(rec.id, rec); queue("location", rec.id); effCache = null;
    return save(["locations", "outbox"], true).then(function () { emit("change", { kind: "location", id: rec.id }); return rec; });
  }
  function upsertCode(rec) {
    rec.updated_at = nowIso(); if (!rec.created_at) rec.created_at = rec.updated_at; rec.deleted = !!rec.deleted;
    S.codes.set(rec.id, rec); queue("item_code", rec.id);
    return save(["codes", "outbox"], true).then(function () { emit("change", { kind: "item_code", id: rec.id }); return rec; });
  }
  function deleteCode(id) {
    var rec = S.codes.get(id); if (!rec) return Promise.resolve();
    rec.deleted = true; rec.updated_at = nowIso(); queue("item_code", id);
    return save(["codes", "outbox"], true).then(function () { emit("change", { kind: "item_code", id: id }); });
  }
  function dropOutbox(entry, discardRecord) {
    S.outbox = S.outbox.filter(function (o) { return !(o.kind === entry.kind && o.id === entry.id); });
    if (discardRecord) {
      if (entry.kind === "item") S.items.delete(entry.id);
      if (entry.kind === "location") S.locations.delete(entry.id);
      if (entry.kind === "item_code") S.codes.delete(entry.id);
      effCache = null;
    }
    return save(["outbox", "items", "locations", "codes"], true).then(function () { emit("change", { kind: "outbox" }); });
  }

  // ---------- Bewegungen ----------
  function addPending(m) {
    m.pending = true; S.pending.push(m); effCache = null;
    return save("pending", true).then(function () { emit("change", { kind: "movement", id: m.id }); return m; });
  }
  function confirmMovement(id, delta, receivedAt) {
    var idx = S.pending.findIndex(function (m) { return m.id === id; });
    if (idx < 0) return;
    var m = S.pending.splice(idx, 1)[0]; delete m.pending;
    if (delta != null) m.delta = delta;
    m.received_at = receivedAt || nowIso();
    S.movements.set(m.id, m); effCache = null;
    dirty.pending = true; dirty.movements = true;
  }
  function rejectMovement(id, error) {
    var idx = S.pending.findIndex(function (m) { return m.id === id; });
    if (idx < 0) return;
    var m = S.pending.splice(idx, 1)[0]; m.error = error; m.failed_at = nowIso(); delete m.pending;
    S.failed.unshift(m); if (S.failed.length > 50) S.failed.length = 50;
    effCache = null; dirty.pending = true; dirty.failed = true;
  }
  function clearFailed() { S.failed = []; return save("failed", true); }

  // ---------- Abgeleiteter Bestand ----------
  function effectiveStock() {
    if (effCache) return effCache;
    var eff = new Map();
    S.stock.forEach(function (s, k) { eff.set(k, Number(s.qty) || 0); });
    S.pending.forEach(function (m) {
      var q = Number(m.qty) || 0, k = skey(m.item_id, m.location_id);
      if (m.type === "in") eff.set(k, (eff.get(k) || 0) + q);
      else if (m.type === "out") eff.set(k, (eff.get(k) || 0) - q);
      else if (m.type === "transfer") { eff.set(k, (eff.get(k) || 0) - q); var k2 = skey(m.item_id, m.to_location_id); eff.set(k2, (eff.get(k2) || 0) + q); }
      else if (m.type === "count") eff.set(k, q);
    });
    effCache = eff; return eff;
  }
  function stockOf(itemId) {
    var eff = effectiveStock(), total = 0, byLoc = [];
    eff.forEach(function (q, k) {
      if (k.indexOf(itemId + "|") !== 0) return;
      var locId = k.slice(itemId.length + 1), loc = S.locations.get(locId);
      if (!loc) return;
      total += q; if (q !== 0) byLoc.push({ location: loc, qty: q });
    });
    byLoc.sort(function (a, b) { return a.location.code.localeCompare(b.location.code); });
    return { total: round3(total), byLoc: byLoc };
  }
  function qtyAt(itemId, locId) { return round3(effectiveStock().get(skey(itemId, locId)) || 0); }
  function stockAtLocation(locId) {
    var eff = effectiveStock(), out = [];
    eff.forEach(function (q, k) {
      var p = k.split("|"); if (p[1] !== locId || q === 0) return;
      var it = S.items.get(p[0]); if (!it || it.deleted) return;
      out.push({ item: it, qty: round3(q) });
    });
    out.sort(function (a, b) { return a.item.name.localeCompare(b.item.name, "de"); });
    return out;
  }
  function round3(n) { return Math.round((Number(n) || 0) * 1000) / 1000; }
  function activeItems() { return toArr(S.items).filter(function (i) { return !i.deleted; }); }
  function activeLocations() { return toArr(S.locations).filter(function (l) { return !l.deleted; }).sort(function (a, b) { return a.code.localeCompare(b.code); }); }
  function lowStockItems() {
    return activeItems().filter(function (i) { return i.active && Number(i.min_stock) > 0 && stockOf(i.id).total < Number(i.min_stock); });
  }
  function codesOfItem(itemId) { return toArr(S.codes).filter(function (c) { return c.item_id === itemId && !c.deleted; }); }

  // ---------- Suche / Code-Auflösung ----------
  function norm(s) { return String(s == null ? "" : s).trim().toLowerCase(); }
  function resolveCode(text) {
    var t = norm(text); if (!t) return null;
    var it = null, hit = null;
    S.items.forEach(function (i) {
      if (it || i.deleted) return;
      if (norm(i.sku) === t) { it = i; hit = "sku"; }
      else if (i.barcode && norm(i.barcode) === t) { it = i; hit = "barcode"; }
    });
    if (!it) S.codes.forEach(function (c) { if (it || c.deleted) return; if (norm(c.code) === t) { var i = S.items.get(c.item_id); if (i && !i.deleted) { it = i; hit = "code"; } } });
    if (it) return { kind: "item", rec: it, by: hit };
    var loc = null;
    S.locations.forEach(function (l) { if (!loc && !l.deleted && norm(l.code) === t) loc = l; });
    if (loc) return { kind: "location", rec: loc, by: "code" };
    return null;
  }
  function codeInUse(text, exceptItemId) {
    var r = resolveCode(text);
    if (!r) return null;
    if (r.kind === "item" && r.rec.id === exceptItemId) return null;
    return r;
  }
  function findItems(query, limit) {
    var q = norm(query), out = [];
    var all = activeItems();
    if (!q) out = all.slice();
    else {
      var codeIdx = new Map();
      S.codes.forEach(function (c) { if (c.deleted) return; if (norm(c.code).indexOf(q) >= 0) codeIdx.set(c.item_id, true); });
      out = all.filter(function (i) {
        return norm(i.name).indexOf(q) >= 0 || norm(i.sku).indexOf(q) >= 0 || (i.barcode && norm(i.barcode).indexOf(q) >= 0) || (i.category && norm(i.category).indexOf(q) >= 0) || codeIdx.has(i.id);
      });
    }
    out.sort(function (a, b) { return a.name.localeCompare(b.name, "de"); });
    return limit ? out.slice(0, limit) : out;
  }
  function memberName(id) {
    var m = S.members.find(function (x) { return x.id === id; });
    if (m) return m.name || m.email;
    if (S.member && S.member.id === id) return S.member.name || S.member.email;
    return "";
  }
  function itemCount() { return activeItems().length; }

  // ---------- Nummernblöcke ----------
  function takeItemCode() {
    var p = S.meta.reserved.items, prefix = (S.tenant && S.tenant.code_prefix) || "ART";
    while (p.length && p[0].indexOf(prefix + "-") !== 0) p.shift();
    var c = p.shift() || null; save("meta", true); return c;
  }
  function peekItemCode() {
    var p = S.meta.reserved.items, prefix = (S.tenant && S.tenant.code_prefix) || "ART";
    for (var i = 0; i < p.length; i++) if (p[i].indexOf(prefix + "-") === 0) return p[i];
    return null;
  }
  function takeLocationCode() { var c = S.meta.reserved.locations.shift() || null; save("meta", true); return c; }

  window.LVStore = {
    S: S, init: init, save: save, flush: flush, clearAll: clearAll, uuid: uuid, nowIso: nowIso, skey: skey, round3: round3,
    on: on, emit: emit,
    upsertItem: upsertItem, deleteItem: deleteItem, upsertLocation: upsertLocation, upsertCode: upsertCode, deleteCode: deleteCode,
    dropOutbox: dropOutbox, hasPendingChange: hasPendingChange, queue: queue,
    addPending: addPending, confirmMovement: confirmMovement, rejectMovement: rejectMovement, clearFailed: clearFailed,
    effectiveStock: effectiveStock, stockOf: stockOf, qtyAt: qtyAt, stockAtLocation: stockAtLocation, invalidate: function () { effCache = null; },
    activeItems: activeItems, activeLocations: activeLocations, lowStockItems: lowStockItems, codesOfItem: codesOfItem,
    resolveCode: resolveCode, codeInUse: codeInUse, findItems: findItems, memberName: memberName, itemCount: itemCount,
    takeItemCode: takeItemCode, peekItemCode: peekItemCode, takeLocationCode: takeLocationCode
  };
})();
