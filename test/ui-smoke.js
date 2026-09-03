// UI-Smoke-Test der App-Shell: puppeteer-core + installiertes Chrome (headless) gegen einen lokalen
// Static-Server mit Wegwerf-Mandant (wird am Ende über lager-admin wieder gelöscht).
// Aufruf: node test/ui-smoke.js   (Betreiber-Schlüssel aus Documents\Skills, wird nie ausgegeben)
// Screenshots landen in test/out/shots/.
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const puppeteer = require("./out/node_modules/puppeteer-core");

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "out", "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SB_URL = "https://xeuexovdipdiiuzjpzkj.supabase.co";
const SB_KEY = "sb_publishable_3dLuQ2PfEsjavJyl0fmkaA_DXB8ZS6f";
const FN = SB_URL + "/functions/v1";
const STORAGE_KEY = "sb-xeuexovdipdiiuzjpzkj-auth-token";
const KEYFILE = "C:/Users/karbi/Documents/Skills/Betreiberschluessel-Lagerverwaltung.txt";
const adminKey = (fs.readFileSync(KEYFILE, "utf8").match(/lv_[A-Za-z0-9]{32}/) || [])[0];
if (!adminKey) throw new Error("Betreiber-Schlüssel nicht gefunden");

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2", ".woff": "font/woff"
};
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/") p = "/index.html";
      const file = path.normalize(path.join(ROOT, p));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("404"); return; }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

let token = null;
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log("  ok   " + name);
  else { failures++; console.log("  FAIL " + name, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ""); }
}
async function call(fn, body, headers = {}) {
  const r = await fetch(`${FN}/${fn}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SB_KEY, ...headers }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch { /* */ }
  return { status: r.status, ...(j || {}) };
}
const api = (body) => call("lager-api", body, { Authorization: "Bearer " + token });
const pub = (body) => call("lager-public", body);
const adm = (body) => call("lager-admin", body, { "x-admin-key": adminKey });
async function login(mail, pw) {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SB_KEY }, body: JSON.stringify({ email: mail, password: pw }) });
  return r.json();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function go(page, hash, title) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForFunction((t) => (document.getElementById("title") || {}).textContent === t, { timeout: 15000 }, title);
  await sleep(150);
}
async function viewText(page) { return page.evaluate(() => document.getElementById("view").textContent); }
async function shot(page, name) { await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: false }); }
// SVGs, die ihren Container fuellen (Icon ohne feste Groesse) - Etikettenvorschau ausgenommen.
async function bigSvgs(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll("svg")).filter((s) => !s.closest("#lblPreview")).map((s) => {
    const r = s.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), cls: s.getAttribute("class") || "", parent: String((s.parentElement && s.parentElement.className) || "").slice(0, 40) };
  }).filter((x) => x.w > 96 || x.h > 96));
}
async function stockOf(itemName) {
  const r = await api({ action: "export" });
  const it = (r.items || []).find((i) => i.name === itemName);
  if (!it) return { found: false, r };
  const qty = (r.stock || []).filter((s) => s.item_id === it.id).reduce((a, s) => a + Number(s.qty || 0), 0);
  const moves = (r.movements || []).filter((m) => m.item_id === it.id).length;
  return { found: true, qty, moves, item: it };
}

(async () => {
  const ts = Date.now();
  const email = `lager-ui-${ts}@vaydena.de`;
  const password = "Ui-Test-Passwort-" + ts;
  const company = "Testfirma UI " + ts;
  const srv = await serve();
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  console.log("Static-Server: " + BASE);

  console.log("1) Wegwerf-Mandant");
  let r = await pub({ action: "register", company, name: "UI Tester", email, password });
  check("register", r.ok === true, r);
  const sess = await login(email, password);
  check("login", !!sess.access_token, sess);
  token = sess.access_token;
  r = await api({ action: "me" });
  check("me (Admin, Mandant aktiv)", r.ok && r.tenant && r.member && r.member.role === "admin", r);
  const tenantId = r.tenant && r.tenant.id;

  let browser = null;
  const errors = [];
  try {
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-gpu", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });

    console.log("2) Ohne Anmeldung -> Umleitung");
    const anon = await browser.newPage();
    await anon.goto(BASE + "/app.html", { waitUntil: "load" });
    await anon.waitForFunction(() => /anmelden\.html/.test(location.href), { timeout: 15000 }).catch(() => {});
    check("app.html ohne Session leitet zu anmelden.html", /anmelden\.html/.test(anon.url()), anon.url());
    await anon.close();

    console.log("3) App-Start mit Session");
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
    await page.evaluateOnNewDocument((k, s) => { localStorage.setItem(k, JSON.stringify(s)); localStorage.setItem("lv_cam", "0"); }, STORAGE_KEY, sess);
    await page.goto(BASE + "/app.html#scan", { waitUntil: "load" });
    await page.waitForFunction(() => window.LVApp && LVApp.App && LVApp.App.booted, { timeout: 40000 });
    check("App gebootet", true);
    check("Titel Scannen & Buchen", (await page.$eval("#title", (e) => e.textContent)) === "Scannen & Buchen");
    const navCount = await page.$$eval("#sidenav a[href^='#']", (a) => a.length);
    check("Sidenav zeigt 10 Bereiche (Admin)", navCount === 10, navCount);
    await page.waitForFunction(() => document.getElementById("syncdot").classList.contains("ok"), { timeout: 30000 }).catch(() => {});
    check("Syncdot ok nach erstem Abgleich", await page.$eval("#syncdot", (e) => e.className), await page.$eval("#syncdot", (e) => e.className + " / " + e.textContent));
    const sw = await page.evaluate(() => navigator.serviceWorker.getRegistration().then((x) => !!x).catch(() => false));
    check("Service Worker registriert", sw === true, sw);
    await shot(page, "01-scan-leer");

    console.log("4) Artikel anlegen");
    await go(page, "#artikel", "Artikel");
    await page.click("[data-act='item-new']");
    await page.waitForSelector("#itemForm", { timeout: 10000 });
    const skuPre = await page.$eval("#itemForm [name='sku']", (e) => e.value);
    check("Artikelnummer vorbelegt (ART-…)", /^[A-Z0-9-]+\d+$/.test(skuPre), skuPre);
    await page.type("#itemForm [name='name']", "Schraube M8");
    await page.type("#itemForm [name='barcode']", "4006381333931");
    await page.$eval("#itemForm [name='min_stock']", (e) => { e.value = "10"; e.dispatchEvent(new Event("input", { bubbles: true })); });
    await shot(page, "02-artikel-form");
    await page.$eval("#itemForm", (f) => f.requestSubmit());
    await page.waitForFunction(() => !document.getElementById("itemForm"), { timeout: 10000 });
    await page.waitForFunction(() => /Schraube M8/.test(document.getElementById("view").textContent), { timeout: 10000 });
    check("Artikel erscheint in der Liste", true);
    await page.waitForFunction(() => window.LVSync && LVSync.counts().pending === 0 && !LVSync.st.syncing, { timeout: 30000 });
    let s = await stockOf("Schraube M8");
    check("Artikel auf dem Server (export)", s.found && s.item.barcode === "4006381333931", s.found ? s.item : s.r);
    await shot(page, "03-artikel-liste");

    console.log("5) Scannen & Buchen (online)");
    await go(page, "#scan", "Scannen & Buchen");
    await page.type("#codeIn", "4006381333931");
    await page.$eval("form[data-form='scan-code']", (f) => f.requestSubmit());
    await page.waitForFunction(() => /Schraube M8/.test((document.getElementById("scanResult") || {}).textContent || ""), { timeout: 10000 });
    check("Code erkannt -> Artikelkarte", true);
    await page.click("[data-act='scan-type'][data-v='in']");
    await page.$eval("#scanQty", (e) => { e.value = "5"; e.dispatchEvent(new Event("input", { bubbles: true })); });
    await shot(page, "04-scan-buchen");
    await page.click("[data-act='book']");
    await page.waitForFunction(() => LVStore.S.pending.length === 0 && LVStore.S.movements.size >= 1 && !LVSync.st.syncing, { timeout: 30000 });
    s = await stockOf("Schraube M8");
    check("Eingang 5 auf dem Server (Bestand 5, 1 Bewegung)", s.qty === 5 && s.moves === 1, s);

    console.log("6) Offline buchen, danach Abgleich");
    await page.setOfflineMode(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await page.type("#codeIn", "4006381333931");
    await page.$eval("form[data-form='scan-code']", (f) => f.requestSubmit());
    await page.waitForFunction(() => /Schraube M8/.test((document.getElementById("scanResult") || {}).textContent || ""), { timeout: 10000 });
    await page.click("[data-act='scan-type'][data-v='out']");
    await page.$eval("#scanQty", (e) => { e.value = "2"; e.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.click("[data-act='book']");
    await sleep(2500);
    const off = await page.evaluate(() => ({ pending: LVSync.counts().pending, dot: document.getElementById("syncdot").textContent, local: (function () { var m = LVStore.effectiveStock(), t = 0; m.forEach(function (q) { t += q; }); return t; })() }));
    check("Offline: 1 Buchung wartet, lokaler Bestand 3", off.pending === 1 && off.local === 3, off);
    check("Syncdot meldet Offline/wartend", /Offline|wartend/.test(off.dot), off.dot);
    await shot(page, "05-scan-offline");
    s = await stockOf("Schraube M8");
    check("Server noch bei 5 (nichts gesendet)", s.qty === 5 && s.moves === 1, s);
    await page.setOfflineMode(false);
    await page.evaluate(() => { window.dispatchEvent(new Event("online")); return LVSync.sync("smoke"); });
    await page.waitForFunction(() => LVStore.S.pending.length === 0 && LVStore.S.movements.size >= 2 && !LVSync.st.syncing, { timeout: 30000 });
    s = await stockOf("Schraube M8");
    check("Nach Abgleich: Server-Bestand 3, 2 Bewegungen", s.qty === 3 && s.moves === 2, s);
    await page.waitForFunction(() => document.getElementById("syncdot").classList.contains("ok"), { timeout: 15000 }).catch(() => {});
    check("Syncdot wieder ok", await page.$eval("#syncdot", (e) => e.classList.contains("ok")), await page.$eval("#syncdot", (e) => e.className + " / " + e.textContent));

    console.log("7) Weitere Ansichten");
    await go(page, "#bestand", "Bestand");
    let t = await viewText(page);
    check("Bestand zeigt Artikel mit 3", /Schraube M8/.test(t) && /3\s*Stk/.test(t), t.slice(0, 300));
    await shot(page, "06-bestand");
    const bigM = await bigSvgs(page);
    check("Keine übergroßen Icons (mobil, Bestand)", bigM.length === 0, bigM.slice(0, 5));
    await go(page, "#journal", "Journal");
    t = await viewText(page);
    check("Journal zeigt Eingang und Ausgang", /Eingang/.test(t) && /Ausgang/.test(t), t.slice(0, 200));
    await go(page, "#lagerorte", "Lagerorte");
    await shot(page, "07-lagerorte");
    await go(page, "#etiketten", "Etiketten");
    await page.click("[data-act='lbl-all']");
    await page.waitForFunction(() => document.querySelectorAll("#lblPreview svg").length >= 1, { timeout: 10000 });
    check("Etiketten-Vorschau rendert SVG", true);
    await shot(page, "08-etiketten");
    await go(page, "#inventur", "Inventur");
    await shot(page, "09-inventur");
    await go(page, "#team", "Team");
    await page.waitForFunction(() => /UI Tester/.test(document.getElementById("view").textContent), { timeout: 15000 });
    check("Team listet den Admin", true);
    await shot(page, "10-team");
    await go(page, "#firma", "Firma & Abo");
    t = await viewText(page);
    check("Firma zeigt Tarife + Testphase", /Starter/.test(t) && /Business/.test(t) && /Test/.test(t), t.slice(0, 300));
    await shot(page, "11-firma");
    await go(page, "#konto", "Konto");
    t = await viewText(page);
    check("Konto zeigt Version", /1\.0 \(2026-09-02\)/.test(t), t.slice(0, 300));
    await shot(page, "12-konto");

    console.log("8) Desktop");
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await go(page, "#artikel", "Artikel");
    await sleep(300);
    await shot(page, "13-desktop-artikel");
    let big = await bigSvgs(page);
    check("Keine übergroßen Icons (Desktop, Artikel)", big.length === 0, big.slice(0, 5));
    await go(page, "#scan", "Scannen & Buchen");
    await shot(page, "14-desktop-scan");
    big = await bigSvgs(page);
    check("Keine übergroßen Icons (Desktop, Scannen)", big.length === 0, big.slice(0, 5));
    const land = await browser.newPage();
    await land.setViewport({ width: 1280, height: 800 });
    await land.goto(BASE + "/index.html", { waitUntil: "load" });
    await land.screenshot({ path: path.join(SHOTS, "15-landing.png"), fullPage: true });
    await land.close();

    const fatal = errors.filter((e) => /pageerror|Uncaught/.test(e));
    check("Keine JS-Fehler in der Seite", fatal.length === 0, fatal);
    if (errors.length) console.log("  Hinweis-Konsole:", errors.slice(0, 8));
  } catch (e) {
    failures++;
    console.log("  FAIL Ausnahme:", e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e);
    if (errors.length) console.log("  Konsole:", errors.slice(0, 8));
  } finally {
    if (browser) await browser.close().catch(() => {});
    srv.close();
    console.log("9) Aufräumen");
    if (tenantId) {
      r = await adm({ action: "delete_tenant", tenant_id: tenantId, confirm: company });
      check("delete_tenant", r.ok === true, r);
    }
  }
  console.log(failures ? `\n${failures} FEHLER` : "\nUI-SMOKE OK");
  process.exit(failures ? 1 : 0);
})();
