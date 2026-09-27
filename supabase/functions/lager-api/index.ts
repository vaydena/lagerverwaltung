// lager-api — authentifizierte Aktionen (verify_jwt = true)
// Zugriff nur mit gültigem Nutzer-JWT (Supabase Auth). Firmen-Admin & Mitarbeiter.
// Kern: Offline-Sync (pull/push), Code-Reservierung, Team, Abo/Rechnungen, Export.
import postgres from "npm:postgres@3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Direktverbindung zur DB: wenige, kurzlebige Verbindungen je Isolate. Mit dem Standard (10 je Client)
// waren bei parallelen Testlaeufen am 2026-09-03 die Verbindungsslots erschoepft
// ("remaining connection slots are reserved for roles with the SUPERUSER attribute" -> 500).
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2, idle_timeout: 10, max_lifetime: 600, connect_timeout: 10 });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://lagerverwaltung.vaydena.de";
const PRODUCT = "Vaydena Lager";
const OPERATOR_MAIL = "kontakt@vaydena.de";

type Plan = { label: string; users: number; items: number; price: { monat: number; jahr: number } };
const PLANS: Record<string, Plan> = {
  trial:    { label: "Test",     users: 10, items: 10000,   price: { monat: 0,    jahr: 0 } },
  starter:  { label: "Starter",  users: 2,  items: 1000,    price: { monat: 1900, jahr: 19000 } },
  team:     { label: "Team",     users: 10, items: 10000,   price: { monat: 4900, jahr: 49000 } },
  business: { label: "Business", users: 30, items: 1000000, price: { monat: 9900, jahr: 99000 } },
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRACE_DAYS = 7;

// ---------- Helfer ----------
function claims(req: Request): { uid: string; email: string } | null {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const parts = m[1].split(".");
  if (parts.length < 2) return null;
  try {
    let s = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    s += "=".repeat((4 - (s.length % 4)) % 4);
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const p = JSON.parse(new TextDecoder().decode(bytes));
    if (!p || typeof p.sub !== "string" || p.role !== "authenticated") return null;
    return { uid: p.sub, email: typeof p.email === "string" ? p.email : "" };
  } catch { return null; }
}
function ymd(v: unknown): string {
  if (!v) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return s.slice(0, 10);
}
function dmy(v: unknown): string {
  const s = ymd(v); const p = s.split("-");
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : s;
}
function todayYmd(): string { return new Date().toISOString().slice(0, 10); }
function addDays(d: string, n: number): string {
  const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}
function subState(t: any) {
  const today = todayYmd();
  if (t.status !== "aktiv") return { active: false, reason: "gesperrt", days_left: 0, until: null };
  if (t.plan === "trial") {
    const end = ymd(t.trial_ends_at);
    const ok = !!end && end >= today;
    return { active: ok, reason: ok ? null : "trial_expired", days_left: ok ? daysBetween(today, end) : 0, until: end || null };
  }
  const pu = ymd(t.paid_until);
  if (!pu) return { active: false, reason: "unpaid", days_left: 0, until: null };
  const grace = addDays(pu, GRACE_DAYS);
  const ok = grace >= today;
  return { active: ok, reason: ok ? (pu >= today ? null : "grace") : "expired", days_left: Math.max(0, daysBetween(today, pu)), until: pu };
}
function tenantOut(t: any) {
  const p = PLANS[t.plan] || PLANS.trial;
  return {
    id: t.id, name: t.name, plan: t.plan, plan_label: p.label, status: t.status,
    trial_ends_at: ymd(t.trial_ends_at) || null, trial_ends_dmy: dmy(t.trial_ends_at),
    paid_until: ymd(t.paid_until) || null, paid_until_dmy: dmy(t.paid_until),
    billing: t.billing || {}, code_prefix: t.code_prefix, settings: t.settings || {},
    contact_email: t.contact_email || null,
    limits: { users: p.users, items: p.items }, sub: subState(t),
  };
}
function esc(s: unknown) { return String(s == null ? "" : s).replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch] as string)); }
function str(v: unknown, max: number): string { return String(v == null ? "" : v).trim().slice(0, max); }
function strOrNull(v: unknown, max: number): string | null { const s = str(v, max); return s ? s : null; }
function num(v: unknown): number | null { if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function isoOrNow(v: unknown): string {
  const t = Date.parse(String(v || ""));
  if (!Number.isFinite(t)) return new Date().toISOString();
  const now = Date.now();
  if (t > now + 86400000 || t < now - 366 * 86400000) return new Date().toISOString();
  return new Date(t).toISOString();
}
function pad(n: number, w: number) { return String(n).padStart(w, "0"); }

async function loadMe(uid: string) {
  const rows = await sql`
    select m.id, m.tenant_id, m.role, m.name, m.email, m.active,
           t.name as tenant_name, t.plan, t.status, t.trial_ends_at, t.paid_until, t.billing,
           t.code_prefix, t.settings, t.contact_email, t.next_item_no, t.next_loc_no
      from lager.members m join lager.tenants t on t.id = m.tenant_id
     where m.id = ${uid} limit 1`;
  if (!rows.length) return null;
  const r = rows[0];
  return { ...r, tenant: { id: r.tenant_id, name: r.tenant_name, plan: r.plan, status: r.status, trial_ends_at: r.trial_ends_at, paid_until: r.paid_until, billing: r.billing, code_prefix: r.code_prefix, settings: r.settings, contact_email: r.contact_email } };
}

async function gotrue(path: string, method: string, body?: unknown) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let data: any = null; try { data = txt ? JSON.parse(txt) : null; } catch { /* ignore */ }
  return { ok: r.ok, status: r.status, data };
}
// Auth-Konto darf nur gelöscht werden, wenn die Lagerverwaltung es selbst angelegt hat (Einladung),
// es nie benutzt wurde und kein anderes Vaydena-Produkt es kennt (auth.users ist geteilt).
async function authDeletable(uid: string): Promise<boolean> {
  const r = await sql`select m.auth_created, u.last_sign_in_at from lager.members m join auth.users u on u.id = m.id where m.id = ${uid} limit 1`;
  if (!r.length || r[0].auth_created !== true || r[0].last_sign_in_at) return false;
  for (const tbl of ["public.profiles", "schulung.members", "punkto.users"]) {
    const reg = await sql`select to_regclass(${tbl}) as r`;
    if (!reg[0].r) continue;
    const x = await sql.unsafe(`select 1 from ${tbl} where id = $1 limit 1`, [uid]);
    if (x.length) return false;
  }
  return true;
}
async function sha256hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes); crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Mail (best-effort, Hostinger-SMTP via denomailer) ----------
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: number | undefined;
  const to = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms) as unknown as number; });
  p.catch(() => {});
  return Promise.race([p, to]).finally(() => clearTimeout(t)) as Promise<T>;
}
async function sendMail(to: string, subject: string, text: string, html: string) {
  const user = Deno.env.get("MAIL_USER"); const pass = Deno.env.get("MAIL_PASSWORD");
  if (!user || !pass) return { ok: false, err: "mail_not_configured" };
  const host = Deno.env.get("MAIL_SMTP_HOST") || "smtp.hostinger.com";
  const port = Number(Deno.env.get("MAIL_SMTP_PORT") || "465");
  const from = Deno.env.get("MAIL_FROM") || user;
  let SMTPClient: any;
  try { ({ SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts")); }
  catch (e) { return { ok: false, err: "smtp_module:" + String((e as any)?.message || e) }; }
  const client = new SMTPClient({ connection: { hostname: host, port, tls: true, auth: { username: user, password: pass } } });
  try {
    await withTimeout(client.send({ from: `${PRODUCT} <${from}>`, to, subject, content: text, html }), 20000);
    return { ok: true };
  } catch (e) { return { ok: false, err: String((e as any)?.message || e) }; }
  finally { try { await withTimeout(client.close(), 5000); } catch (_e) { /* ignore */ } }
}
function mailShell(title: string, inner: string) {
  return `<div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#0f2830;max-width:560px"><h2 style="color:#0e6f6b;margin:0 0 12px">${esc(title)}</h2>${inner}<p style="font-size:12px;color:#5c7883;margin-top:26px">${esc(PRODUCT)} · ${esc(SITE)}</p></div>`;
}

// ---------- Rechnung anlegen (auch in lager-admin dupliziert) ----------
async function createInvoice(tenantId: string, plan: string, period: "monat" | "jahr") {
  const p = PLANS[plan];
  const amount = p.price[period];
  const t = await sql`select id, name, billing, contact_email from lager.tenants where id = ${tenantId} limit 1`;
  if (!t.length) throw new Error("tenant_not_found");
  const seq = await sql`select nextval('lager.invoice_number_seq') as v`;
  const number = "LV-" + new Date().getFullYear() + "-" + pad(Number(seq[0].v), 5);
  const perLabel = period === "jahr" ? "Jahr" : "Monat";
  let reference = `${number} Vaydena Lager ${p.label} ${perLabel}`.replace(/[^A-Za-z0-9 .,:/-]/g, "");
  if (reference.length > 140) reference = reference.slice(0, 140);
  const bill = (t[0].billing && typeof t[0].billing === "object") ? t[0].billing : {};
  const billing = { recipient: bill.recipient || t[0].name, street: bill.street || "", zip: bill.zip || "", city: bill.city || "", email: bill.email || t[0].contact_email || "" };
  const rows = await sql`insert into lager.invoices (tenant_id, number, plan, period, amount_cents, status, reference, billing)
    values (${tenantId}, ${number}, ${plan}, ${period}, ${amount}, 'open', ${reference}, ${billing}::jsonb)
    returning id, access_token, number, amount_cents, due_date`;
  const inv = rows[0];
  const link = `${SITE}/zahlung.html?r=${inv.access_token}`;
  let emailed = false;
  const to = billing.email;
  if (to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    const r = await sendMail(to, `Rechnung ${number} — ${PRODUCT}`,
      `Guten Tag,\n\nIhre Rechnung ${number} über ${(amount / 100).toFixed(2).replace(".", ",")} € (Tarif ${p.label}, pro ${perLabel}) liegt bereit.\nZahlseite mit Bankverbindung und GiroCode: ${link}\nFällig bis: ${dmy(inv.due_date)}\n\nNach Zahlungseingang schalten wir den Tarif frei.\n\nViele Grüße\n${PRODUCT}`,
      mailShell(`Rechnung ${number}`, `<p>Ihre Rechnung über <b>${(amount / 100).toFixed(2).replace(".", ",")} €</b> (Tarif ${esc(p.label)}, pro ${perLabel}) liegt bereit. Fällig bis ${esc(dmy(inv.due_date))}.</p><p style="margin:22px 0"><a href="${esc(link)}" style="background:#0e6f6b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;display:inline-block">Zahlseite öffnen (Überweisung / GiroCode)</a></p><p style="font-size:13px;color:#5c7883">Oder Link kopieren:<br><span style="word-break:break-all">${esc(link)}</span></p>`));
    emailed = !!r.ok;
  }
  return { id: inv.id, access_token: inv.access_token, number: inv.number, amount_cents: inv.amount_cents, due_dmy: dmy(inv.due_date), link, emailed };
}

// ---------- Push-Verarbeitung ----------
type Res = { id: string; ok: boolean; error?: string; dup?: boolean; delta?: number };

async function upsertLocation(tid: string, rec: any): Promise<Res> {
  const id = String(rec?.id || "").toLowerCase();
  if (!UUID_RE.test(id)) return { id, ok: false, error: "bad_id" };
  const code = str(rec.code, 40); const name = str(rec.name, 120);
  if (!code) return { id, ok: false, error: "code_required" };
  if (!name) return { id, ok: false, error: "name_required" };
  const upd = isoOrNow(rec.updated_at);
  try {
    await sql`insert into lager.locations (id, tenant_id, code, name, note, active, deleted, created_at, updated_at)
      values (${id}, ${tid}, ${code}, ${name}, ${strOrNull(rec.note, 500)}, ${rec.active !== false}, ${rec.deleted === true}, ${isoOrNow(rec.created_at)}, ${upd})
      on conflict (id) do update set code = excluded.code, name = excluded.name, note = excluded.note,
        active = excluded.active, deleted = excluded.deleted, updated_at = excluded.updated_at, synced_at = now()
      where lager.locations.tenant_id = excluded.tenant_id and lager.locations.updated_at <= excluded.updated_at`;
    return { id, ok: true };
  } catch (e) {
    if ((e as any)?.code === "23505") return { id, ok: false, error: "code_exists" };
    throw e;
  }
}
async function upsertItem(tid: string, rec: any, canCreate: () => boolean, onCreated: () => void): Promise<Res> {
  const id = String(rec?.id || "").toLowerCase();
  if (!UUID_RE.test(id)) return { id, ok: false, error: "bad_id" };
  const sku = str(rec.sku, 60); const name = str(rec.name, 200);
  if (!sku) return { id, ok: false, error: "sku_required" };
  if (!name) return { id, ok: false, error: "name_required" };
  const barcode = strOrNull(rec.barcode, 80);
  const unit = str(rec.unit, 20) || "Stk";
  const minStock = num(rec.min_stock);
  const upd = isoOrNow(rec.updated_at);
  const exists = await sql`select id from lager.items where id = ${id} and tenant_id = ${tid} limit 1`;
  if (!exists.length) {
    const foreign = await sql`select id from lager.items where id = ${id} limit 1`;
    if (foreign.length) return { id, ok: false, error: "bad_id" };
    if (rec.deleted === true) return { id, ok: true };
    if (!canCreate()) return { id, ok: false, error: "limit_items" };
  }
  try {
    await sql`insert into lager.items (id, tenant_id, sku, name, barcode, unit, min_stock, category, note, active, deleted, created_at, updated_at)
      values (${id}, ${tid}, ${sku}, ${name}, ${barcode}, ${unit}, ${minStock}, ${strOrNull(rec.category, 80)}, ${strOrNull(rec.note, 2000)}, ${rec.active !== false}, ${rec.deleted === true}, ${isoOrNow(rec.created_at)}, ${upd})
      on conflict (id) do update set sku = excluded.sku, name = excluded.name, barcode = excluded.barcode, unit = excluded.unit,
        min_stock = excluded.min_stock, category = excluded.category, note = excluded.note, active = excluded.active,
        deleted = excluded.deleted, updated_at = excluded.updated_at, synced_at = now()
      where lager.items.tenant_id = excluded.tenant_id and lager.items.updated_at <= excluded.updated_at`;
    if (!exists.length) onCreated();
    return { id, ok: true };
  } catch (e) {
    if ((e as any)?.code === "23505") {
      const msg = String((e as any)?.constraint_name || (e as any)?.message || "");
      return { id, ok: false, error: /barcode/.test(msg) ? "barcode_exists" : "sku_exists" };
    }
    throw e;
  }
}
async function upsertItemCode(tid: string, rec: any, itemOk: (id: string) => boolean): Promise<Res> {
  const id = String(rec?.id || "").toLowerCase();
  if (!UUID_RE.test(id)) return { id, ok: false, error: "bad_id" };
  const itemId = String(rec.item_id || "").toLowerCase();
  if (!itemOk(itemId)) return { id, ok: false, error: "item_not_found" };
  const code = str(rec.code, 80);
  if (!code) return { id, ok: false, error: "code_required" };
  try {
    await sql`insert into lager.item_codes (id, tenant_id, item_id, code, deleted, created_at, updated_at)
      values (${id}, ${tid}, ${itemId}, ${code}, ${rec.deleted === true}, ${isoOrNow(rec.created_at)}, ${isoOrNow(rec.updated_at)})
      on conflict (id) do update set code = excluded.code, deleted = excluded.deleted, updated_at = excluded.updated_at, synced_at = now()
      where lager.item_codes.tenant_id = excluded.tenant_id and lager.item_codes.item_id = excluded.item_id`;
    return { id, ok: true };
  } catch (e) {
    if ((e as any)?.code === "23505") return { id, ok: false, error: "code_exists" };
    throw e;
  }
}
async function bump(tx: any, tid: string, item: string, loc: string, d: number) {
  await tx`insert into lager.stock (tenant_id, item_id, location_id, qty) values (${tid}, ${item}, ${loc}, ${d})
    on conflict (tenant_id, item_id, location_id) do update set qty = lager.stock.qty + ${d}, updated_at = now()`;
}
async function applyMovement(tid: string, memberId: string, deviceId: string | null, m: any, itemOk: (id: string) => boolean, locOk: (id: string) => boolean): Promise<Res> {
  const id = String(m?.id || "").toLowerCase();
  if (!UUID_RE.test(id)) return { id, ok: false, error: "bad_id" };
  const type = String(m.type || "");
  if (!["in", "out", "transfer", "count"].includes(type)) return { id, ok: false, error: "bad_type" };
  const itemId = String(m.item_id || "").toLowerCase();
  if (!itemOk(itemId)) return { id, ok: false, error: "item_not_found" };
  const loc = String(m.location_id || "").toLowerCase();
  if (!locOk(loc)) return { id, ok: false, error: "location_not_found" };
  let toLoc: string | null = null;
  if (type === "transfer") {
    toLoc = String(m.to_location_id || "").toLowerCase();
    if (!locOk(toLoc)) return { id, ok: false, error: "to_location_not_found" };
    if (toLoc === loc) return { id, ok: false, error: "same_location" };
  }
  const qty = num(m.qty);
  if (qty === null || qty > 1e9 || qty < 0 || (type !== "count" && qty <= 0)) return { id, ok: false, error: "bad_qty" };
  const q = Math.round(qty * 1000) / 1000;
  const note = strOrNull(m.note, 500);
  const createdAt = isoOrNow(m.created_at);
  return await sql.begin(async (tx: any) => {
    const ins = await tx`insert into lager.movements (id, tenant_id, item_id, location_id, to_location_id, type, qty, delta, note, member_id, device_id, created_at)
      values (${id}, ${tid}, ${itemId}, ${loc}, ${toLoc}, ${type}, ${q}, 0, ${note}, ${memberId}, ${deviceId}, ${createdAt})
      on conflict (id) do nothing returning id`;
    if (!ins.length) return { id, ok: true, dup: true };
    let delta = 0;
    if (type === "in") { delta = q; await bump(tx, tid, itemId, loc, q); }
    else if (type === "out") { delta = -q; await bump(tx, tid, itemId, loc, -q); }
    else if (type === "transfer") { delta = -q; await bump(tx, tid, itemId, loc, -q); await bump(tx, tid, itemId, toLoc!, q); }
    else {
      const cur = await tx`select qty::float8 as qty from lager.stock where tenant_id = ${tid} and item_id = ${itemId} and location_id = ${loc} for update`;
      const c = cur.length ? Number(cur[0].qty) : 0;
      delta = Math.round((q - c) * 1000) / 1000;
      await tx`insert into lager.stock (tenant_id, item_id, location_id, qty) values (${tid}, ${itemId}, ${loc}, ${q})
        on conflict (tenant_id, item_id, location_id) do update set qty = ${q}, updated_at = now()`;
    }
    await tx`update lager.movements set delta = ${delta} where id = ${id}`;
    return { id, ok: true, delta };
  });
}

// ---------- Handler ----------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const c = claims(req);
  if (!c) return json({ error: "unauthorized" }, 401);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const action = String(body?.action ?? "").trim();

  try {
    const me = await loadMe(c.uid);
    if (!me) return json({ ok: true, registered: false, email: c.email, error: "not_registered" }, action === "me" ? 200 : 403);
    if (!me.active) return json({ error: "member_inactive" }, 403);
    const isAdmin = me.role === "admin";
    const tid = me.tenant_id as string;
    const t = me.tenant;
    const plan = PLANS[t.plan] || PLANS.trial;

    // -------- me --------
    if (action === "me") {
      return json({ ok: true, registered: true,
        member: { id: me.id, role: me.role, name: me.name, email: me.email, active: me.active },
        tenant: tenantOut(t) });
    }

    // -------- pull: Daten (initial oder inkrementell) --------
    if (action === "pull") {
      const since = body.since ? String(body.since) : null;
      if (since && !Number.isFinite(Date.parse(since))) return json({ error: "bad_since" }, 400);
      const nowRow = await sql`select now() as t`;
      const serverTime = (nowRow[0].t as Date).toISOString();
      const items = since
        ? await sql`select id, sku, name, barcode, unit, min_stock::float8 as min_stock, category, note, active, deleted, created_at, updated_at from lager.items where tenant_id = ${tid} and synced_at > ${since}::timestamptz`
        : await sql`select id, sku, name, barcode, unit, min_stock::float8 as min_stock, category, note, active, deleted, created_at, updated_at from lager.items where tenant_id = ${tid} and deleted = false`;
      const codes = since
        ? await sql`select id, item_id, code, deleted, created_at, updated_at from lager.item_codes where tenant_id = ${tid} and synced_at > ${since}::timestamptz`
        : await sql`select id, item_id, code, deleted, created_at, updated_at from lager.item_codes where tenant_id = ${tid} and deleted = false`;
      const locations = since
        ? await sql`select id, code, name, note, active, deleted, created_at, updated_at from lager.locations where tenant_id = ${tid} and synced_at > ${since}::timestamptz`
        : await sql`select id, code, name, note, active, deleted, created_at, updated_at from lager.locations where tenant_id = ${tid} and deleted = false`;
      const stock = since
        ? await sql`select item_id, location_id, qty::float8 as qty, updated_at from lager.stock where tenant_id = ${tid} and updated_at > ${since}::timestamptz`
        : await sql`select item_id, location_id, qty::float8 as qty, updated_at from lager.stock where tenant_id = ${tid}`;
      const movements = since
        ? await sql`select id, item_id, location_id, to_location_id, type, qty::float8 as qty, delta::float8 as delta, note, member_id, device_id, created_at, received_at from lager.movements where tenant_id = ${tid} and received_at > ${since}::timestamptz order by created_at desc limit 5000`
        : await sql`select id, item_id, location_id, to_location_id, type, qty::float8 as qty, delta::float8 as delta, note, member_id, device_id, created_at, received_at from lager.movements where tenant_id = ${tid} and received_at > now() - interval '90 days' order by created_at desc limit 5000`;
      const members = await sql`select id, name, email, role, active from lager.members where tenant_id = ${tid}`;
      // Code-Reservierung mit abholen (spart einen Roundtrip)
      let codes_reserved: any = null;
      const want = Math.max(0, Math.min(200, Number(body.reserve_items) | 0));
      const wantLoc = Math.max(0, Math.min(50, Number(body.reserve_locations) | 0));
      if (want || wantLoc) codes_reserved = await reserve(tid, want, wantLoc);
      return json({ ok: true, server_time: serverTime, full: !since,
        tenant: tenantOut(t), member: { id: me.id, role: me.role, name: me.name, email: me.email },
        items, item_codes: codes, locations, stock, movements, members, codes_reserved });
    }

    // -------- reserve_codes: Nummernblock für Offline-Anlage --------
    if (action === "reserve_codes") {
      const n = Math.max(0, Math.min(200, Number(body.items) | 0));
      const nl = Math.max(0, Math.min(50, Number(body.locations) | 0));
      return json({ ok: true, ...(await reserve(tid, n, nl)) });
    }

    // -------- push: Offline-Änderungen einspielen --------
    if (action === "push") {
      const sub = subState(t);
      if (!sub.active) return json({ error: "subscription_inactive", sub, tenant: tenantOut(t) }, 402);
      const deviceId = strOrNull(body.device_id, 64);
      const out: { locations: Res[]; items: Res[]; item_codes: Res[]; movements: Res[] } = { locations: [], items: [], item_codes: [], movements: [] };
      const locs = Array.isArray(body.locations) ? body.locations.slice(0, 500) : [];
      const items = Array.isArray(body.items) ? body.items.slice(0, 1000) : [];
      const icodes = Array.isArray(body.item_codes) ? body.item_codes.slice(0, 1000) : [];
      const movs = Array.isArray(body.movements) ? body.movements.slice(0, 2000) : [];
      for (const l of locs) {
        if (!isAdmin) { out.locations.push({ id: String(l?.id || ""), ok: false, error: "forbidden" }); continue; }
        out.locations.push(await upsertLocation(tid, l));
      }
      if (items.length) {
        const cnt = await sql`select count(*)::int as n from lager.items where tenant_id = ${tid} and deleted = false`;
        let n = cnt[0].n as number;
        for (const it of items) {
          if (!isAdmin && it?.deleted === true) { out.items.push({ id: String(it?.id || ""), ok: false, error: "forbidden" }); continue; }
          out.items.push(await upsertItem(tid, it, () => n < plan.items, () => { n++; }));
        }
      }
      // Gültige Artikel-/Lagerort-IDs des Mandanten für Referenzprüfungen
      const refItemIds = new Set<string>();
      const refLocIds = new Set<string>();
      for (const r of icodes) if (r?.item_id) refItemIds.add(String(r.item_id).toLowerCase());
      for (const m of movs) {
        if (m?.item_id) refItemIds.add(String(m.item_id).toLowerCase());
        if (m?.location_id) refLocIds.add(String(m.location_id).toLowerCase());
        if (m?.to_location_id) refLocIds.add(String(m.to_location_id).toLowerCase());
      }
      const okItems = new Set<string>();
      const okLocs = new Set<string>();
      const itemIds = [...refItemIds].filter((x) => UUID_RE.test(x));
      const locIds = [...refLocIds].filter((x) => UUID_RE.test(x));
      if (itemIds.length) for (const r of await sql`select id from lager.items where tenant_id = ${tid} and id = any(${itemIds}::uuid[])`) okItems.add(String(r.id));
      if (locIds.length) for (const r of await sql`select id from lager.locations where tenant_id = ${tid} and id = any(${locIds}::uuid[])`) okLocs.add(String(r.id));
      for (const r of icodes) out.item_codes.push(await upsertItemCode(tid, r, (id) => okItems.has(id)));
      for (const m of movs) out.movements.push(await applyMovement(tid, me.id, deviceId, m, (id) => okItems.has(id), (id) => okLocs.has(id)));
      const nowRow = await sql`select now() as t`;
      return json({ ok: true, results: out, server_time: (nowRow[0].t as Date).toISOString() });
    }

    // -------- Team --------
    if (action === "list_members") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const rows = await sql`select id, role, name, email, active, created_at from lager.members where tenant_id = ${tid} order by role, created_at`;
      return json({ ok: true, limit: plan.users, members: rows.map((m: any) => ({ ...m, created_dmy: dmy(m.created_at) })) });
    }
    if (action === "invite") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const name = str(body.name, 120);
      const email = str(body.email, 200).toLowerCase();
      const role = body.role === "admin" ? "admin" : "mitarbeiter";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "bad_email" }, 400);
      const cnt = await sql`select count(*)::int as n from lager.members where tenant_id = ${tid} and active = true`;
      if (cnt[0].n >= plan.users) return json({ error: "limit_users", limit: plan.users }, 400);
      const ex = await sql`select id from lager.members where tenant_id = ${tid} and lower(email) = ${email} limit 1`;
      if (ex.length) return json({ error: "already_member" }, 400);
      // Bestehendes Konto (auth.users ist mit anderen Vaydena-Produkten geteilt): KEIN Passwort-Link –
      // sonst könnte ein Firmen-Admin fremde Konten übernehmen. Die Person meldet sich mit ihrem Passwort an.
      const au = await sql`select id from auth.users where lower(email) = ${email} limit 1`;
      if (au.length) {
        const uid = String(au[0].id);
        const other = await sql`select tenant_id from lager.members where id = ${uid} limit 1`;
        if (other.length) return json({ error: "member_elsewhere" }, 400);
        await sql`insert into lager.members (id, tenant_id, role, name, email, active, auth_created) values (${uid}, ${tid}, ${role}, ${name || null}, ${email}, true, false)`;
        const appLink = `${SITE}/app.html`;
        const resetLink = `${SITE}/anmelden.html#passwort`;
        const r = await sendMail(email, `Sie wurden zu ${PRODUCT} hinzugefügt`,
          `Guten Tag${name ? " " + name : ""},\n\n${t.name} hat Sie zu ${PRODUCT} hinzugefügt.\nSie haben bereits ein Vaydena-Konto mit dieser E-Mail-Adresse. Bitte melden Sie sich mit Ihrem bisherigen Passwort an:\n${appLink}\n\nPasswort vergessen? ${resetLink}\n\nFalls Sie das nicht erwartet haben, können Sie diese E-Mail ignorieren – ohne Ihre Anmeldung erhält niemand Zugriff auf Ihr Konto.\n\nViele Grüße\n${PRODUCT}`,
          mailShell(`Willkommen bei ${PRODUCT}`, `<p>Guten Tag${name ? " " + esc(name) : ""},</p><p><b>${esc(t.name)}</b> hat Sie zur Lagerverwaltung hinzugefügt.</p><p>Sie haben bereits ein Vaydena-Konto mit dieser E-Mail-Adresse. Bitte melden Sie sich mit Ihrem bisherigen Passwort an.</p><p style="margin:22px 0"><a href="${esc(appLink)}" style="background:#0e6f6b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;display:inline-block">Zur App</a></p><p style="font-size:13px;color:#5c7883">Passwort vergessen? <a href="${esc(resetLink)}">Neues Passwort anfordern</a></p>`));
        return json({ ok: true, existing_account: true, emailed: !!r.ok });
      }
      const tmp = "Lv-" + randomToken(9) + "!x";
      const cr = await gotrue("admin/users", "POST", { email, password: tmp, email_confirm: true, user_metadata: { name, invited_by: t.name } });
      const uid: string | null = cr?.data?.id || null;
      if (!cr.ok || !uid) return json({ error: "auth_create_failed", detail: cr?.data?.msg || cr?.status }, 400);
      await sql`insert into lager.members (id, tenant_id, role, name, email, active, auth_created) values (${uid}, ${tid}, ${role}, ${name || null}, ${email}, true, true)`;
      const token = randomToken(32);
      await sql`insert into lager.auth_tokens (token_hash, user_id, email, purpose, expires_at) values (${await sha256hex(token)}, ${uid}, ${email}, 'invite', now() + interval '7 days')`;
      const link = `${SITE}/anmelden.html?invite=${token}`;
      const r = await sendMail(email, `Ihr Zugang zu ${PRODUCT}`,
        `Guten Tag${name ? " " + name : ""},\n\n${t.name} hat Sie zu ${PRODUCT} eingeladen.\nBitte legen Sie hier Ihr Passwort fest (Link 7 Tage gültig):\n${link}\n\nDanach starten Sie die App unter ${SITE}/app.html\n\nViele Grüße\n${PRODUCT}`,
        mailShell(`Willkommen bei ${PRODUCT}`, `<p>Guten Tag${name ? " " + esc(name) : ""},</p><p><b>${esc(t.name)}</b> hat Sie zur Lagerverwaltung eingeladen.</p><p style="margin:22px 0"><a href="${esc(link)}" style="background:#0e6f6b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;display:inline-block">Passwort festlegen &amp; anmelden</a></p><p style="font-size:13px;color:#5c7883">Link (7 Tage gültig):<br><span style="word-break:break-all">${esc(link)}</span></p>`));
      return json({ ok: true, invite_link: link, emailed: !!r.ok });
    }
    if (action === "set_member") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const mid = String(body.member_id || "").toLowerCase();
      if (!UUID_RE.test(mid)) return json({ error: "bad_member" }, 400);
      if (mid === me.id) return json({ error: "cannot_edit_self" }, 400);
      const row = await sql`select id from lager.members where id = ${mid} and tenant_id = ${tid} limit 1`;
      if (!row.length) return json({ error: "not_found" }, 404);
      const role = body.role === "admin" ? "admin" : (body.role === "mitarbeiter" ? "mitarbeiter" : null);
      const active = typeof body.active === "boolean" ? body.active : null;
      if (role !== null) await sql`update lager.members set role = ${role}, updated_at = now() where id = ${mid}`;
      if (active !== null) await sql`update lager.members set active = ${active}, updated_at = now() where id = ${mid}`;
      return json({ ok: true });
    }
    if (action === "remove_member") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const mid = String(body.member_id || "").toLowerCase();
      if (!UUID_RE.test(mid)) return json({ error: "bad_member" }, 400);
      if (mid === me.id) return json({ error: "cannot_remove_self" }, 400);
      const row = await sql`select id from lager.members where id = ${mid} and tenant_id = ${tid} limit 1`;
      if (!row.length) return json({ error: "not_found" }, 404);
      const deletable = await authDeletable(mid);
      await sql`delete from lager.members where id = ${mid} and tenant_id = ${tid}`;
      await sql`update lager.auth_tokens set used_at = now() where user_id = ${mid} and used_at is null`;
      if (deletable) { try { await gotrue(`admin/users/${mid}`, "DELETE"); } catch (_e) { /* ignore */ } }
      return json({ ok: true });
    }

    // -------- Firma / Einstellungen --------
    if (action === "update_company") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const name = body.name !== undefined ? str(body.name, 200) : null;
      if (name !== null && name.length < 2) return json({ error: "bad_name" }, 400);
      const prefix = body.code_prefix !== undefined ? str(body.code_prefix, 8).toUpperCase().replace(/[^A-Z0-9]/g, "") : null;
      if (prefix !== null && !prefix) return json({ error: "bad_prefix" }, 400);
      let billing: any = null;
      if (body.billing && typeof body.billing === "object") {
        const b = body.billing;
        billing = { recipient: str(b.recipient, 200), street: str(b.street, 200), zip: str(b.zip, 20), city: str(b.city, 120), email: str(b.email, 200).toLowerCase() };
        if (billing.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(billing.email)) return json({ error: "bad_email" }, 400);
      }
      let settings: any = null;
      if (body.settings && typeof body.settings === "object") {
        const s = body.settings;
        settings = { default_unit: str(s.default_unit, 20) || "Stk", label_format: str(s.label_format, 40), label_type: s.label_type === "code128" ? "code128" : "qr", negative_stock: s.negative_stock !== false };
      }
      if (name !== null) await sql`update lager.tenants set name = ${name}, updated_at = now() where id = ${tid}`;
      if (prefix !== null) await sql`update lager.tenants set code_prefix = ${prefix}, updated_at = now() where id = ${tid}`;
      if (billing !== null) await sql`update lager.tenants set billing = ${billing}::jsonb, updated_at = now() where id = ${tid}`;
      if (settings !== null) await sql`update lager.tenants set settings = ${settings}::jsonb, updated_at = now() where id = ${tid}`;
      const fresh = await loadMe(c.uid);
      return json({ ok: true, tenant: tenantOut(fresh!.tenant) });
    }

    // -------- Abo / Rechnungen --------
    if (action === "choose_plan") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const p = String(body.plan || "");
      const period = String(body.period || "monat") === "jahr" ? "jahr" : "monat";
      if (!["starter", "team", "business"].includes(p)) return json({ error: "bad_plan" }, 400);
      const open = await sql`select count(*)::int as n from lager.invoices where tenant_id = ${tid} and status = 'open'`;
      if (open[0].n >= 3) return json({ error: "too_many_open" }, 400);
      const inv = await createInvoice(tid, p, period);
      return json({ ok: true, invoice: inv });
    }
    if (action === "my_invoices") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const rows = await sql`select number, access_token, plan, period, amount_cents, status, issued_at, due_date, paid_at from lager.invoices where tenant_id = ${tid} order by created_at desc`;
      return json({ ok: true, invoices: rows.map((r: any) => ({
        number: r.number, access_token: r.access_token, plan: r.plan, plan_label: (PLANS[r.plan] || {}).label || r.plan, period: r.period,
        amount_cents: r.amount_cents, status: r.status, issued_dmy: dmy(r.issued_at), due_dmy: dmy(r.due_date), paid_dmy: dmy(r.paid_at) })) });
    }

    // -------- Export (alles als JSON) --------
    if (action === "export") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const items = await sql`select id, sku, name, barcode, unit, min_stock::float8 as min_stock, category, note, active, deleted, created_at, updated_at from lager.items where tenant_id = ${tid}`;
      const codes = await sql`select id, item_id, code, deleted from lager.item_codes where tenant_id = ${tid}`;
      const locations = await sql`select id, code, name, note, active, deleted, created_at from lager.locations where tenant_id = ${tid}`;
      const stock = await sql`select item_id, location_id, qty::float8 as qty, updated_at from lager.stock where tenant_id = ${tid}`;
      const movements = await sql`select id, item_id, location_id, to_location_id, type, qty::float8 as qty, delta::float8 as delta, note, member_id, device_id, created_at, received_at from lager.movements where tenant_id = ${tid} order by created_at`;
      return json({ ok: true, exported_at: new Date().toISOString(), tenant: { id: tid, name: t.name }, items, item_codes: codes, locations, stock, movements });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    try { console.error("lager-api", action, String((e as any)?.message || e)); } catch (_e) { /* */ }
    return json({ error: "server_error" }, 500);
  }
});

async function reserve(tid: string, nItems: number, nLocs: number) {
  const out: any = { items: [], locations: [] };
  if (nItems > 0) {
    const r = await sql`update lager.tenants set next_item_no = next_item_no + ${nItems}::int where id = ${tid} returning code_prefix, next_item_no`;
    const end = Number(r[0].next_item_no); const prefix = String(r[0].code_prefix || "ART");
    for (let n = end - nItems; n < end; n++) out.items.push(`${prefix}-${pad(n, 6)}`);
  }
  if (nLocs > 0) {
    const r = await sql`update lager.tenants set next_loc_no = next_loc_no + ${nLocs}::int where id = ${tid} returning next_loc_no`;
    const end = Number(r[0].next_loc_no);
    for (let n = end - nLocs; n < end; n++) out.locations.push(`L-${pad(n, 3)}`);
  }
  return out;
}
