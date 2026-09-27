/* Vaydena Lager — Abgleich mit dem Server (lager-api): Push der Warteschlange,
   Pull (voll / inkrementell mit since), Nummernblöcke für Offline-Anlage. window.LVSync */
(function () {
  "use strict";
  var S = LVStore.S;
  var st = { syncing: false, offline: !navigator.onLine, authLost: false, subInactive: false, blocked: null, lastError: null, lastOk: null, phase: "" };
  var again = false, timer = null, intervalId = null;

  function emit() { LVStore.emit("sync", st); }
  function isAdmin() { return !!(S.member && S.member.role === "admin"); }

  // API-Aufruf mit einmaligem Token-Refresh bei 401
  function api(action, payload, timeoutMs) {
    return LV.apiCall(action, payload, timeoutMs || 60000).then(function (res) {
      if (res.status !== 401 || !LV.sb) return res;
      return LV.sb.auth.refreshSession().then(function (r) {
        if (r && r.data && r.data.session) return LV.apiCall(action, payload, timeoutMs || 60000);
        return res;
      }).catch(function () { return res; });
    });
  }

  function handleCommon(res) {
    // liefert true, wenn der Aufruf "weich" gescheitert ist und der Aufrufer abbrechen soll
    if (res.status === 0) { st.offline = (res.data.error === "offline") ? true : st.offline; st.lastError = res.data.error; return true; }
    if (res.status === 401) { st.authLost = true; st.lastError = "unauthorized"; return true; }
    if (res.status === 402) { st.subInactive = true; st.lastError = "subscription_inactive"; return true; }
    if (res.status === 403 && res.data && (res.data.error === "member_inactive" || res.data.error === "not_registered")) { st.blocked = res.data.error; st.lastError = res.data.error; return true; }
    if (res.status === 429) { st.lastError = "rate_limited"; return true; }
    if (res.status !== 200 || !res.data || res.data.ok === false) { st.lastError = (res.data && res.data.error) || ("http_" + res.status); return true; }
    return false;
  }

  // ---------- Push ----------
  function recLoc(r) { return { id: r.id, code: r.code, name: r.name, note: r.note || null, active: r.active !== false, deleted: !!r.deleted, created_at: r.created_at, updated_at: r.updated_at }; }
  function numOrNull(v) { return v == null || v === "" || !isFinite(Number(v)) ? null : Number(v); }
  function recItem(r) {
    return { id: r.id, sku: r.sku, name: r.name, barcode: r.barcode || null, unit: r.unit || null, min_stock: Number(r.min_stock) || 0, category: r.category || null, note: r.note || null,
      supplier: r.supplier || null, purchase_price: numOrNull(r.purchase_price), reorder_qty: numOrNull(r.reorder_qty),
      active: r.active !== false, deleted: !!r.deleted, created_at: r.created_at, updated_at: r.updated_at };
  }
  function recCode(r) { return { id: r.id, item_id: r.item_id, code: r.code, deleted: !!r.deleted, created_at: r.created_at, updated_at: r.updated_at }; }
  function recMov(m) { return { id: m.id, item_id: m.item_id, location_id: m.location_id, to_location_id: m.to_location_id || null, type: m.type, qty: Number(m.qty), note: m.note || null, lot: m.lot || null, best_before: m.best_before || null, reverses: m.reverses || null, created_at: m.created_at }; }

  function refBlocked(movId) {
    var m = S.pending.find(function (x) { return x.id === movId; });
    if (!m) return false;
    return S.outbox.some(function (o) { return o.error && (o.id === m.item_id || o.id === m.location_id || o.id === m.to_location_id); });
  }
  function applyMaster(kind, results, startedAt) {
    (results || []).forEach(function (r) {
      var e = S.outbox.find(function (o) { return o.kind === kind && o.id === r.id; });
      if (!e) return;
      if (r.ok) {
        if (!(e.ts > startedAt)) S.outbox = S.outbox.filter(function (o) { return o !== e; }); // sonst: seit dem Senden erneut geändert
      } else { e.error = r.error || "error"; e.error_at = LVStore.nowIso(); }
    });
  }

  function push() {
    var rounds = 0;
    function round() {
      var locs = [], items = [], codes = [];
      S.outbox.slice().forEach(function (o) {
        if (o.error) return;
        var rec;
        if (o.kind === "location") { rec = S.locations.get(o.id); if (rec && locs.length < 500) locs.push(recLoc(rec)); }
        else if (o.kind === "item") { rec = S.items.get(o.id); if (rec && items.length < 1000) items.push(recItem(rec)); }
        else if (o.kind === "item_code") { rec = S.codes.get(o.id); if (rec && codes.length < 1000) codes.push(recCode(rec)); }
        if (!rec) S.outbox = S.outbox.filter(function (x) { return x !== o; });
      });
      // Buchungen zurückhalten, deren Artikel/Lagerort noch nicht auf dem Server ist (Stammdaten-Konflikt offen):
      // sonst würden sie mit "nicht gefunden" verworfen, obwohl sie nach Klärung gültig sind.
      var blocked = new Set();
      S.outbox.forEach(function (o) { if (o.error && (o.kind === "item" || o.kind === "location")) blocked.add(o.id); });
      var movs = S.pending.filter(function (m) {
        return !blocked.has(m.item_id) && !blocked.has(m.location_id) && !(m.to_location_id && blocked.has(m.to_location_id));
      }).slice(0, 2000).map(recMov);
      if (!locs.length && !items.length && !codes.length && !movs.length) return Promise.resolve({ ok: true });
      var startedAt = LVStore.nowIso();
      st.phase = "push"; emit();
      return api("push", { device_id: S.meta.device_id, locations: locs, items: items, item_codes: codes, movements: movs }, 90000).then(function (res) {
        if (handleCommon(res)) return { ok: false };
        st.subInactive = false;
        var R = res.data.results || {};
        applyMaster("location", R.locations, startedAt);
        applyMaster("item", R.items, startedAt);
        applyMaster("item_code", R.item_codes, startedAt);
        var rejected = 0;
        (R.movements || []).forEach(function (r) {
          if (r.ok || r.dup) LVStore.confirmMovement(r.id, r.delta, res.data.server_time);
          else if (/not_found$/.test(r.error || "") && refBlocked(r.id)) { /* bleibt offen, bis der Stammdaten-Konflikt geklärt ist */ }
          else { LVStore.rejectMovement(r.id, r.error || "error"); rejected++; }
        });
        LVStore.invalidate();
        return LVStore.save(["outbox", "items", "locations", "codes", "pending", "movements", "failed"], true).then(function () {
          LVStore.emit("change", { kind: "push", rejected: rejected });
          var left = S.outbox.filter(function (o) { return !o.error; }).length + S.pending.length;
          var sent = locs.length + items.length + codes.length + movs.length;
          if (left > 0 && ++rounds < 10 && (left < sent || movs.length === 2000 || items.length === 1000)) return round();
          return { ok: true };
        });
      });
    }
    return round();
  }

  // ---------- Pull ----------
  function prefix() { return (S.tenant && S.tenant.code_prefix) || null; }
  function pull() {
    var payload = {};
    if (S.meta.since) payload.since = S.meta.since;
    var pre = prefix();
    var pool = S.meta.reserved.items.filter(function (c) { return !pre || c.indexOf(pre + "-") === 0; });
    if (pool.length < 10) payload.reserve_items = 20 - pool.length;
    if (isAdmin() && S.meta.reserved.locations.length < 3) payload.reserve_locations = 5 - S.meta.reserved.locations.length;
    st.phase = "pull"; emit();
    return api("pull", payload, 90000).then(function (res) {
      if (handleCommon(res)) return { ok: false };
      var d = res.data;
      S.tenant = d.tenant || S.tenant; S.member = d.member || S.member; S.members = d.members || S.members;
      if (d.full) {
        var keep = { item: new Map(), location: new Map(), item_code: new Map() };
        S.outbox.forEach(function (o) {
          var src = o.kind === "item" ? S.items : o.kind === "location" ? S.locations : S.codes;
          if (src.has(o.id)) keep[o.kind].set(o.id, src.get(o.id));
        });
        S.items = keep.item; S.locations = keep.location; S.codes = keep.item_code;
        S.stock = new Map(); S.movements = new Map();
      }
      (d.locations || []).forEach(function (r) { if (LVStore.hasPendingChange("location", r.id)) return; if (r.deleted) S.locations.delete(r.id); else S.locations.set(r.id, r); });
      (d.items || []).forEach(function (r) { if (LVStore.hasPendingChange("item", r.id)) return; if (r.deleted) S.items.delete(r.id); else S.items.set(r.id, r); });
      (d.item_codes || []).forEach(function (r) { if (LVStore.hasPendingChange("item_code", r.id)) return; if (r.deleted) S.codes.delete(r.id); else S.codes.set(r.id, r); });
      (d.stock || []).forEach(function (r) { S.stock.set(LVStore.skey(r.item_id, r.location_id), r); });
      (d.movements || []).forEach(function (r) {
        S.movements.set(r.id, r);
        var i = S.pending.findIndex(function (m) { return m.id === r.id; });
        if (i >= 0) S.pending.splice(i, 1);
      });
      // Journal auf 5000 Einträge begrenzen
      if (S.movements.size > 6000) {
        var arr = Array.from(S.movements.values()).sort(function (a, b) { return (b.created_at || "").localeCompare(a.created_at || ""); }).slice(0, 5000);
        S.movements = new Map(arr.map(function (m) { return [m.id, m]; }));
      }
      // Chargen und Bildverzeichnis kommen immer vollständig
      if (Array.isArray(d.stock_lots)) S.lots = d.stock_lots;
      if (Array.isArray(d.images)) {
        var imgs = {};
        d.images.forEach(function (x) { imgs[x.item_id] = x.updated_at; });
        Object.keys(S.images).forEach(function (id) { if (!imgs[id]) LVStore.setImageCache(id, null); });
        S.images = imgs;
      }
      // Bestandszeilen zu gelöschten Artikeln/Orten entfernen
      S.stock.forEach(function (r, k) { if (!S.items.has(r.item_id) || !S.locations.has(r.location_id)) S.stock.delete(k); });
      if (d.codes_reserved) {
        var pre2 = prefix();
        var cur = S.meta.reserved.items.filter(function (c) { return !pre2 || c.indexOf(pre2 + "-") === 0; });
        S.meta.reserved.items = cur.concat(d.codes_reserved.items || []);
        S.meta.reserved.locations = S.meta.reserved.locations.concat(d.codes_reserved.locations || []);
      }
      S.meta.since = d.server_time; S.meta.last_sync = LVStore.nowIso();
      st.blocked = (d.member && d.member.active === false) ? "member_inactive" : null;
      st.subInactive = !(d.tenant && d.tenant.sub && d.tenant.sub.active);
      st.authLost = false; st.lastError = null; st.lastOk = S.meta.last_sync;
      LVStore.invalidate();
      return LVStore.save(["tenant", "member", "members", "items", "codes", "locations", "stock", "movements", "pending", "meta", "lots", "images"], true).then(function () {
        LVStore.emit("change", { kind: "pull", full: !!d.full });
        return { ok: true, more: !!d.more };
      });
    });
  }
  // Große Rückstände seitenweise holen (Server liefert "more", solange weitere Bewegungen warten)
  function pullAll() {
    var pages = 0;
    function next() { return pull().then(function (r) { return (r && r.ok && r.more && ++pages < 40) ? next() : r; }); }
    return next();
  }

  // ---------- Steuerung ----------
  function sync(reason) {
    if (!navigator.onLine) { st.offline = true; emit(); return Promise.resolve({ offline: true }); }
    if (st.syncing) { again = true; return Promise.resolve({ busy: true }); }
    st.syncing = true; st.offline = false; st.phase = "start"; emit();
    var result = { ok: false };
    return push().then(function (r) {
      if (r.ok || st.subInactive) return pullAll();   // bei Abo-Sperre trotzdem Stammdaten/Status holen
      return r;
    }).then(function (r) { result = r || result; }).catch(function (e) { st.lastError = (e && e.message) || "error"; })
      .then(function () {
        st.syncing = false; st.phase = ""; emit();
        if (again) { again = false; return sync("again"); }
        return result;
      });
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(function () { sync("scheduled"); }, ms == null ? 1500 : ms); }
  function start() {
    window.addEventListener("online", function () { st.offline = false; emit(); schedule(300); });
    window.addEventListener("offline", function () { st.offline = true; emit(); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) schedule(400); });
    if (!intervalId) intervalId = setInterval(function () { if (!document.hidden && navigator.onLine && !st.syncing) sync("interval"); }, 60000);
  }
  function counts() {
    var conflicts = S.outbox.filter(function (o) { return o.error; });
    return { pending: S.pending.length + (S.outbox.length - conflicts.length), conflicts: conflicts.length, failed: S.failed.length };
  }

  window.LVSync = { st: st, sync: sync, schedule: schedule, start: start, api: api, counts: counts, handleCommon: handleCommon };
})();
