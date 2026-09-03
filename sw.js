/* Vaydena Lager – Service Worker
 * Hält die App-Shell (app.html + Skripte + Icons) offline verfügbar.
 * Supabase-/API-Aufrufe werden nie gecacht (fremder Origin -> gar nicht angefasst).
 * VERSION bei jedem Deploy erhöhen (siehe deploy-version.txt), dann tauscht der Browser den Cache aus.
 */
var VERSION = "lv-2026-09-02-1";
var CACHE = "vaydena-lager-" + VERSION;
var SHELL = [
  "app.html", "anmelden.html", "manifest.webmanifest",
  "assets/app.css", "assets/lager.css",
  "assets/auth.js", "assets/site.js", "assets/supabase.js",
  "assets/html5-qrcode.min.js", "assets/qrcode-generator.js", "assets/JsBarcode.all.min.js",
  "assets/lager-store.js", "assets/lager-sync.js", "assets/lager-scan.js", "assets/lager-labels.js", "assets/lager-app.js",
  "assets/icons/favicon-32.png", "assets/icons/apple-touch-icon.png", "assets/icons/icon-192.png", "assets/icons/icon-512.png", "assets/icons/icon-maskable-512.png"
];

function cacheKey(url) { return url.origin + url.pathname; }
function putCache(url, res) {
  if (!res || !res.ok || res.type !== "basic") return;
  var copy = res.clone();
  caches.open(CACHE).then(function (c) { c.put(cacheKey(url), copy); }).catch(function () {});
}

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Jede Datei einzeln, damit ein fehlendes Asset nicht die ganze Installation blockiert
      return Promise.all(SHELL.map(function (u) {
        return fetch(new Request(u, { cache: "reload" })).then(function (res) { if (res && res.ok) return c.put(new URL(u, self.location.href).href, res); }).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf("vaydena-lager-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// HTML: Netz zuerst (mit Zeitlimit), sonst Cache; app.html als Rückfall für die App-Shell
function networkFirst(req, url, fallback) {
  var key = cacheKey(url);
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () {
      caches.match(key).then(function (r) { if (r && !done) { done = true; resolve(r); } });
    }, 3500);
    fetch(req).then(function (res) {
      clearTimeout(timer);
      putCache(url, res);
      if (!done) { done = true; resolve(res); }
    }).catch(function () {
      clearTimeout(timer);
      if (done) return;
      caches.match(key).then(function (r) { return r || (fallback ? caches.match(new URL(fallback, self.location.href).href) : undefined); })
        .then(function (r) { done = true; resolve(r || Response.error()); });
    });
  });
}

// Assets: Cache zuerst, im Hintergrund aktualisieren
function cacheFirst(req, url) {
  var key = cacheKey(url);
  return caches.match(key).then(function (cached) {
    var net = fetch(req).then(function (res) { putCache(url, res); return res; }).catch(function () { return cached || Response.error(); });
    return cached || net;
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;           // Supabase, Fonts usw. nie anfassen
  if (url.pathname.indexOf("/sw.js") >= 0) return;
  var isHtml = req.mode === "navigate" || /\.html$/.test(url.pathname) || /\/$/.test(url.pathname);
  if (isHtml) {
    e.respondWith(networkFirst(req, url, /app\.html$/.test(url.pathname) ? "app.html" : null));
    return;
  }
  if (/\.(css|js|png|svg|webmanifest|woff2?|ico)$/.test(url.pathname)) {
    e.respondWith(cacheFirst(req, url));
  }
});

self.addEventListener("message", function (e) {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});
