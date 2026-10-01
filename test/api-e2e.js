// End-to-End-Test der Edge Functions (lager-public / lager-api / lager-admin) mit Wegwerf-Mandant.
// Aufruf: node test/api-e2e.js   (liest den Betreiber-Schlüssel aus Documents\Skills, gibt ihn nie aus)
"use strict";
const fs = require("fs");
const crypto = require("crypto");

const SB_URL = "https://xeuexovdipdiiuzjpzkj.supabase.co";
const SB_KEY = "sb_publishable_3dLuQ2PfEsjavJyl0fmkaA_DXB8ZS6f";
const FN = SB_URL + "/functions/v1";
const KEYFILE = "C:/Users/karbi/Documents/Skills/Betreiberschluessel-Lagerverwaltung.txt";
const adminKey = (fs.readFileSync(KEYFILE, "utf8").match(/lv_[A-Za-z0-9]{32}/) || [])[0];
if (!adminKey) throw new Error("Betreiber-Schlüssel nicht gefunden");

const ts = Date.now();
const email = `lager-test-${ts}@vaydena.de`;
const email2 = `lager-test-${ts}-2@vaydena.de`;
const password = "Test-Passwort-" + ts;
const company = "Testfirma E2E " + ts;
let token = null;
let failures = 0;

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
function check(name, cond, extra) {
  if (cond) console.log("  ok   " + name);
  else { failures++; console.log("  FAIL " + name, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
}
const uuid = () => crypto.randomUUID();

(async () => {
  console.log("1) Registrierung");
  let r = await pub({ action: "register", company, name: "Test Admin", email, password });
  check("register ok", r.ok === true && r.status === 200, r);
  r = await pub({ action: "register", company: "Nochmal", name: "x", email, password });
  check("register duplicate -> already_registered", r.error === "already_registered", r);
  r = await pub({ action: "register", company: "Bot", name: "x", email: "bot@example.com", password, hp: "spam" });
  check("honeypot silently ok", r.ok === true, r);

  console.log("2) Login");
  const lj = await login(email, password); token = lj.access_token;
  check("login token", !!token, lj);

  console.log("3) me / pull");
  r = await api({ action: "me" });
  check("me: registered admin, trial aktiv", r.registered === true && r.member?.role === "admin" && r.tenant?.plan === "trial" && r.tenant?.sub?.active === true && r.tenant?.sub?.days_left === 14, r);
  const tenantId = r.tenant.id;
  r = await api({ action: "pull", reserve_items: 5, reserve_locations: 2 });
  check("pull full: 1 Lagerort L-001", r.ok && r.full === true && Array.isArray(r.items) && r.items.length === 0 && r.locations.length === 1 && r.locations[0].code === "L-001", { status: r.status, locs: r.locations });
  check("pull reserved codes", r.codes_reserved?.items?.length === 5 && r.codes_reserved.items[0] === "ART-000001" && r.codes_reserved.locations[0] === "L-002", r.codes_reserved);
  const since1 = r.server_time; const mainLoc = r.locations[0].id;

  console.log("4) push (Lagerort, Artikel, Codes, Bewegungen)");
  const loc2 = uuid(), itemA = uuid(), itemB = uuid(), codeA = uuid();
  const now = new Date().toISOString();
  const mv = [
    { id: uuid(), item_id: itemA, location_id: mainLoc, type: "in", qty: 10, created_at: now },
    { id: uuid(), item_id: itemA, location_id: mainLoc, type: "out", qty: 3, created_at: now },
    { id: uuid(), item_id: itemA, location_id: mainLoc, to_location_id: loc2, type: "transfer", qty: 2, created_at: now },
    { id: uuid(), item_id: itemB, location_id: loc2, type: "count", qty: 7.5, created_at: now },
  ];
  r = await api({ action: "push", device_id: "e2e",
    locations: [{ id: loc2, code: "L-002", name: "Regal 2", created_at: now, updated_at: now }],
    items: [
      { id: itemA, sku: "ART-000001", name: "Schrauben M6", barcode: "ART-000001", unit: "Stk", min_stock: 5, created_at: now, updated_at: now },
      { id: itemB, sku: "ART-000002", name: "Kabel 3m", barcode: "ART-000002", unit: "m", created_at: now, updated_at: now },
    ],
    item_codes: [{ id: codeA, item_id: itemA, code: "4006381333931", created_at: now, updated_at: now }],
    movements: mv });
  check("push ok", r.ok === true, r);
  check("push locations ok", r.results?.locations?.[0]?.ok === true, r.results?.locations);
  check("push items ok", Array.isArray(r.results?.items) && r.results.items.every((x) => x.ok), r.results?.items);
  check("push codes ok", r.results?.item_codes?.[0]?.ok === true, r.results?.item_codes);
  const m = r.results?.movements || [];
  check("push movements ok + deltas 10/-3/-2/7.5", m.length === 4 && m.every((x) => x.ok) && m[0].delta === 10 && m[1].delta === -3 && m[2].delta === -2 && m[3].delta === 7.5, m);
  r = await api({ action: "push", device_id: "e2e", movements: mv });
  check("push duplicate movements -> dup (idempotent)", r.results?.movements?.every((x) => x.ok && x.dup === true), r.results?.movements);
  r = await api({ action: "push", items: [{ id: uuid(), sku: "art-000001", name: "Dublette", created_at: now, updated_at: now }] });
  check("push duplicate sku -> sku_exists", r.results?.items?.[0]?.error === "sku_exists", r.results?.items);
  r = await api({ action: "push", items: [{ id: uuid(), sku: "ART-000009", name: "Dublette2", barcode: "ART-000001", created_at: now, updated_at: now }] });
  check("push duplicate barcode -> barcode_exists", r.results?.items?.[0]?.error === "barcode_exists", r.results?.items);
  r = await api({ action: "push", movements: [{ id: uuid(), item_id: uuid(), location_id: mainLoc, type: "in", qty: 1, created_at: now }] });
  check("push unknown item -> item_not_found", r.results?.movements?.[0]?.error === "item_not_found", r.results?.movements);
  r = await api({ action: "push", movements: [{ id: uuid(), item_id: itemA, location_id: mainLoc, type: "in", qty: -1, created_at: now }] });
  check("push bad qty -> bad_qty", r.results?.movements?.[0]?.error === "bad_qty", r.results?.movements);
  // Stammdaten-Update (last-write-wins)
  const later = new Date(Date.now() + 1000).toISOString();
  r = await api({ action: "push", items: [{ id: itemA, sku: "ART-000001", name: "Schrauben M6 x 30", barcode: "ART-000001", unit: "Stk", min_stock: 8, created_at: now, updated_at: later }] });
  check("push item update ok", r.results?.items?.[0]?.ok === true, r.results?.items);

  console.log("5) pull inkrementell + Bestand");
  r = await api({ action: "pull", since: since1 });
  const st = (it, lo) => (r.stock || []).find((s) => s.item_id === it && s.location_id === lo)?.qty;
  // Der Cursor überlappt um 2 Minuten (siehe pull in lager-api): der frisch angelegte L-001 darf erneut mitkommen.
  check("pull incremental: 2 Artikel, neuer Lagerort, 4 Bewegungen", r.ok && r.full === false && r.items?.length === 2 && r.locations?.some((l) => l.id === loc2) && r.locations.length <= 2 && r.movements?.length === 4, { items: r.items?.length, locs: r.locations?.length, mov: r.movements?.length });
  check("item update angekommen (name, min_stock)", r.items?.find((i) => i.id === itemA)?.name === "Schrauben M6 x 30" && r.items?.find((i) => i.id === itemA)?.min_stock === 8, r.items);
  check("stock A Hauptlager = 5", st(itemA, mainLoc) === 5, r.stock);
  check("stock A Regal 2 = 2", st(itemA, loc2) === 2, r.stock);
  check("stock B Regal 2 = 7.5", st(itemB, loc2) === 7.5, r.stock);
  check("item_codes enthalten EAN", r.item_codes?.some((c) => c.code === "4006381333931"), r.item_codes);

  console.log("6) Team + Einladung + Rollen");
  r = await api({ action: "invite", name: "Kollege", email: email2, role: "mitarbeiter" });
  check("invite ok + link", r.ok === true && /anmelden\.html\?invite=[0-9a-f]{64}$/.test(r.invite_link || ""), r);
  const inviteToken = (r.invite_link || "").split("invite=")[1];
  r = await pub({ action: "check_token", token: inviteToken });
  check("check_token invite", r.ok === true && r.purpose === "invite" && r.email === email2, r);
  r = await pub({ action: "set_password", token: inviteToken, password: "Kollege-Passwort-1" });
  check("set_password via invite", r.ok === true, r);
  r = await pub({ action: "set_password", token: inviteToken, password: "Kollege-Passwort-2" });
  check("token reuse blocked", r.error === "invalid_token", r);
  r = await api({ action: "list_members" });
  check("list_members = 2", r.ok && r.members?.length === 2, r);
  const adminToken = token;
  const lj2 = await login(email2, "Kollege-Passwort-1"); token = lj2.access_token;
  check("mitarbeiter login", !!token, lj2);
  r = await api({ action: "list_members" }); check("mitarbeiter list_members -> 403", r.status === 403, r);
  r = await api({ action: "push", locations: [{ id: uuid(), code: "L-009", name: "x", created_at: now, updated_at: now }] });
  check("mitarbeiter darf keine Lagerorte anlegen", r.results?.locations?.[0]?.error === "forbidden", r);
  r = await api({ action: "push", movements: [{ id: uuid(), item_id: itemA, location_id: mainLoc, type: "in", qty: 1, created_at: now }] });
  check("mitarbeiter darf buchen", r.results?.movements?.[0]?.ok === true, r);
  token = adminToken;

  console.log("7) Firma, Abo, Rechnung, GiroCode");
  r = await api({ action: "update_company", billing: { recipient: "Testfirma E2E GmbH", street: "Teststr. 1", zip: "12345", city: "Teststadt", email }, code_prefix: "tf" });
  check("update_company", r.ok && r.tenant?.code_prefix === "TF" && r.tenant?.billing?.city === "Teststadt", r);
  r = await api({ action: "reserve_codes", items: 2 });
  check("reserve_codes mit neuem Präfix", r.ok && r.items?.[0] === "TF-000006", r);
  r = await api({ action: "choose_plan", plan: "team", period: "jahr" });
  check("choose_plan -> Rechnung LV-JJJJ-NNNNN, 190 €", r.ok && /^LV-\d{4}-\d{5}$/.test(r.invoice?.number || "") && r.invoice.amount_cents === 19000, r);
  const inv = r.invoice;
  r = await pub({ action: "invoice", access_token: inv.access_token });
  check("public invoice + GiroCode", r.ok && r.invoice?.status === "open" && (r.invoice.giro?.path || "").length > 100 && r.invoice.bank?.iban_raw === "DE95700510030000785303" && r.invoice.amount_eur === "190,00" && r.invoice.billing?.city === "Teststadt", { status: r.status, giro: !!r.invoice?.giro, amount: r.invoice?.amount_eur });
  r = await pub({ action: "invoice", access_token: "0".repeat(36) });
  check("unknown invoice -> 404", r.status === 404, r);
  r = await api({ action: "my_invoices" }); check("my_invoices = 1", r.ok && r.invoices?.length === 1, r);

  console.log("8) Betreiber");
  r = await adm({ action: "ping" }); check("admin ping", r.ok === true, r);
  r = await call("lager-admin", { action: "ping" }, { "x-admin-key": "falscher-schluessel-xxxxxxxx" });
  check("admin wrong key -> 401", r.status === 401, r);
  r = await adm({ action: "list_tenants" });
  const trow = r.tenants?.find((t) => t.id === tenantId);
  check("admin list_tenants enthält Testfirma (2 Mitglieder, 2 Artikel, 1 offene Rechnung)", r.ok && trow && trow.members === 2 && trow.items === 2 && trow.open_invoices === 1, trow);
  r = await adm({ action: "mark_paid", invoice_id: inv.id });
  check("admin mark_paid", r.ok === true && /^\d{2}\.\d{2}\.\d{4}$/.test(r.paid_until_dmy || ""), r);
  r = await api({ action: "me" });
  check("tenant jetzt team + bezahlt + kein Nutzerlimit", r.tenant?.plan === "team" && r.tenant?.sub?.active === true && r.tenant?.limits?.users === 0 && r.tenant?.limits?.items === 25000 && r.tenant?.sub?.days_left > 300, r.tenant);
  r = await pub({ action: "invoice", access_token: inv.access_token });
  check("invoice paid, kein GiroCode mehr", r.invoice?.status === "paid" && r.invoice.giro === null, r.invoice?.status);
  r = await adm({ action: "set_status", tenant_id: tenantId, status: "gesperrt" }); check("admin set_status gesperrt", r.ok, r);
  r = await api({ action: "push", movements: [{ id: uuid(), item_id: itemA, location_id: mainLoc, type: "in", qty: 1, created_at: now }] });
  check("push gesperrt -> 402 subscription_inactive", r.status === 402 && r.error === "subscription_inactive", r);
  r = await api({ action: "pull" }); check("pull trotz Sperre erlaubt (Lesen)", r.ok === true, r.status);
  r = await adm({ action: "set_status", tenant_id: tenantId, status: "aktiv" }); check("admin set_status aktiv", r.ok, r);
  r = await api({ action: "export" });
  check("export: 2 Artikel, 5 Bewegungen", r.ok && r.items?.length === 2 && r.movements?.length === 5, { items: r.items?.length, mov: r.movements?.length });
  r = await adm({ action: "get_tenant", tenant_id: tenantId });
  check("admin get_tenant", r.ok && r.members?.length === 2 && r.invoices?.length === 1 && r.counts?.movements === 5 && r.counts?.locations === 2, r.counts);
  r = await adm({ action: "stats" }); check("admin stats", r.ok && r.stats?.tenants >= 1, r);

  console.log("9) Passwort-Reset");
  r = await pub({ action: "request_reset", email }); check("request_reset ok", r.ok === true, r);
  r = await pub({ action: "request_reset", email: "niemand@example.com" }); check("request_reset unknown -> ok (keine Info-Preisgabe)", r.ok === true, r);
  r = await pub({ action: "set_password", token: "00".repeat(32), password: "Egal-Passwort-1" }); check("invalid reset token", r.error === "invalid_token", r);

  console.log("10) Aufräumen");
  r = await adm({ action: "delete_tenant", tenant_id: tenantId, confirm: "falsch" }); check("delete confirm mismatch", r.error === "confirm_mismatch", r);
  r = await adm({ action: "delete_tenant", tenant_id: tenantId, confirm: company }); check("delete_tenant (2 Mitglieder, benutzte Auth-Konten bleiben)", r.ok && r.members === 2 && r.deleted_users === 0, r);
  r = await api({ action: "me" }); check("me nach Löschung -> not registered", r.registered === false, r);
  // auth.users ist mit anderen Vaydena-Produkten geteilt: ein bereits benutztes Konto bleibt bestehen (authDeletable),
  // hat aber keinen Lager-Zugang mehr.
  const lj3 = await login(email, password); token = lj3.access_token;
  check("Auth-Konto bleibt nach Löschung bestehen", !!token, lj3.error || lj3.error_code);
  r = await api({ action: "me" }); check("neuer Login nach Löschung -> not registered", r.registered === false, r);
  r = await api({ action: "pull" }); check("pull nach Löschung -> 403 not_registered", r.status === 403 && r.error === "not_registered" && !r.items, r.status);

  console.log(failures ? `\n${failures} FEHLER` : "\nALLE TESTS OK");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
