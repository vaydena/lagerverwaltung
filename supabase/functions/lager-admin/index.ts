// lager-admin — Betreiber-Backend (verify_jwt = false, Header x-admin-key)
// Schlüssel liegt nur als SHA-256 in lager.admin_auth (id = 1).
import postgres from "npm:postgres@3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Direktverbindung: wenige, kurzlebige Verbindungen je Isolate (Slot-Erschoepfung am 2026-09-03, siehe lager-api).
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2, idle_timeout: 10, max_lifetime: 600, connect_timeout: 10 });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://lagerverwaltung.vaydena.de";
const PRODUCT = "Vaydena Lager";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRACE_DAYS = 7;

type Plan = { label: string; users: number; items: number; price: { monat: number; jahr: number } };
const PLANS: Record<string, Plan> = {
  trial:    { label: "Test",     users: 10, items: 10000,   price: { monat: 0,    jahr: 0 } },
  starter:  { label: "Starter",  users: 2,  items: 1000,    price: { monat: 1900, jahr: 19000 } },
  team:     { label: "Team",     users: 10, items: 10000,   price: { monat: 4900, jahr: 49000 } },
  business: { label: "Business", users: 30, items: 1000000, price: { monat: 9900, jahr: 99000 } },
};

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
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function ymd(v: unknown): string { if (!v) return ""; const s = v instanceof Date ? v.toISOString() : String(v); return s.slice(0, 10); }
function dmy(v: unknown): string { const s = ymd(v); const p = s.split("-"); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : s; }
// Protokoll-Eintrag beim Mandanten (Aktionen des Betreibers)
async function audit(tid: string, action: string, detail: Record<string, unknown> = {}) {
  try { await sql`insert into lager.audit (tenant_id, actor, action, detail) values (${tid}, 'Betreiber', ${action}, ${sql.json(detail as any)})`; }
  catch (_e) { /* best-effort */ }
}
function todayYmd(): string { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()); }
function addDays(d: string, n: number): string { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function daysBetween(a: string, b: string): number { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }
function subState(t: any) {
  const today = todayYmd();
  if (t.status !== "aktiv") return { active: false, reason: "gesperrt", days_left: 0, until: null };
  if (t.plan === "trial") {
    const end = ymd(t.trial_ends_at); const ok = !!end && end >= today;
    return { active: ok, reason: ok ? null : "trial_expired", days_left: ok ? daysBetween(today, end) : 0, until: end || null };
  }
  const pu = ymd(t.paid_until);
  if (!pu) return { active: false, reason: "unpaid", days_left: 0, until: null };
  const grace = addDays(pu, GRACE_DAYS); const ok = grace >= today;
  return { active: ok, reason: ok ? (pu >= today ? null : "grace") : "expired", days_left: Math.max(0, daysBetween(today, pu)), until: pu };
}
function str(v: unknown, max: number): string { return String(v == null ? "" : v).trim().slice(0, max); }
function pad(n: number, w: number) { return String(n).padStart(w, "0"); }
function esc(s: unknown) { return String(s == null ? "" : s).replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch] as string)); }
function tenantRow(t: any) {
  const p = PLANS[t.plan] || PLANS.trial;
  return { id: t.id, name: t.name, plan: t.plan, plan_label: p.label, status: t.status,
    trial_ends_dmy: dmy(t.trial_ends_at), paid_until_dmy: dmy(t.paid_until), contact_email: t.contact_email,
    billing: t.billing || {}, code_prefix: t.code_prefix, notiz: t.notiz, created_dmy: dmy(t.created_at),
    sub: subState(t), members: Number(t.members ?? 0), items: Number(t.items ?? 0), open_invoices: Number(t.open_invoices ?? 0) };
}

async function gotrue(path: string, method: string, body?: unknown) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text(); let data: any = null; try { data = txt ? JSON.parse(txt) : null; } catch { /* */ }
  return { ok: r.ok, status: r.status, data };
}

// ---------- Mail (best-effort) ----------
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
  try { await withTimeout(client.send({ from: `${PRODUCT} <${from}>`, to, subject, content: text, html }), 20000); return { ok: true }; }
  catch (e) { return { ok: false, err: String((e as any)?.message || e) }; }
  finally { try { await withTimeout(client.close(), 5000); } catch (_e) { /* */ } }
}
function mailShell(title: string, inner: string) {
  return `<div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#0f2830;max-width:560px"><h2 style="color:#0e6f6b;margin:0 0 12px">${esc(title)}</h2>${inner}<p style="font-size:12px;color:#5c7883;margin-top:26px">${esc(PRODUCT)} · ${esc(SITE)}</p></div>`;
}

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
      `Guten Tag,\n\nIhre Rechnung ${number} über ${(amount / 100).toFixed(2).replace(".", ",")} € (Tarif ${p.label}, pro ${perLabel}) liegt bereit.\nZahlseite mit Bankverbindung und GiroCode: ${link}\nFällig bis: ${dmy(inv.due_date)}\n\nViele Grüße\n${PRODUCT}`,
      mailShell(`Rechnung ${number}`, `<p>Ihre Rechnung über <b>${(amount / 100).toFixed(2).replace(".", ",")} €</b> (Tarif ${esc(p.label)}, pro ${perLabel}) liegt bereit. Fällig bis ${esc(dmy(inv.due_date))}.</p><p style="margin:22px 0"><a href="${esc(link)}" style="background:#0e6f6b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;display:inline-block">Zahlseite öffnen (Überweisung / GiroCode)</a></p><p style="font-size:13px;color:#5c7883">${esc(link)}</p>`));
    emailed = !!r.ok;
  }
  return { id: inv.id, access_token: inv.access_token, number: inv.number, amount_cents: inv.amount_cents, due_dmy: dmy(inv.due_date), link, emailed };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const key = req.headers.get("x-admin-key") || "";
  if (!key || key.length < 16) return json({ error: "unauthorized" }, 401);
  const stored = await sql`select secret_sha256 from lager.admin_auth where id = 1 limit 1`;
  if (!stored.length || !safeEqual(await sha256hex(key), String(stored[0].secret_sha256))) return json({ error: "unauthorized" }, 401);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "bad_json" }, 400);
  const action = String(body?.action ?? "").trim();

  try {
    if (action === "ping") return json({ ok: true });

    if (action === "stats") {
      const s = await sql`select
        (select count(*)::int from lager.tenants) as tenants,
        (select count(*)::int from lager.tenants where plan <> 'trial') as paying,
        (select count(*)::int from lager.members) as members,
        (select count(*)::int from lager.items where deleted = false) as items,
        (select count(*)::int from lager.movements) as movements,
        (select count(*)::int from lager.invoices where status = 'open') as open_invoices,
        (select coalesce(sum(amount_cents),0)::int from lager.invoices where status = 'paid') as paid_cents,
        (select count(*)::int from lager.leads) as leads`;
      return json({ ok: true, stats: s[0] });
    }

    if (action === "list_tenants") {
      const rows = await sql`select t.*,
          (select count(*) from lager.members m where m.tenant_id = t.id) as members,
          (select count(*) from lager.items i where i.tenant_id = t.id and i.deleted = false) as items,
          (select count(*) from lager.invoices v where v.tenant_id = t.id and v.status = 'open') as open_invoices
        from lager.tenants t order by t.created_at desc`;
      return json({ ok: true, tenants: rows.map(tenantRow) });
    }

    if (action === "get_tenant") {
      const id = String(body.tenant_id || "").toLowerCase();
      if (!UUID_RE.test(id)) return json({ error: "bad_id" }, 400);
      const t = await sql`select t.*,
          (select count(*) from lager.members m where m.tenant_id = t.id) as members,
          (select count(*) from lager.items i where i.tenant_id = t.id and i.deleted = false) as items,
          (select count(*) from lager.invoices v where v.tenant_id = t.id and v.status = 'open') as open_invoices
        from lager.tenants t where t.id = ${id} limit 1`;
      if (!t.length) return json({ error: "not_found" }, 404);
      const members = await sql`select id, role, name, email, active, created_at from lager.members where tenant_id = ${id} order by role, created_at`;
      const invoices = await sql`select id, number, access_token, plan, period, amount_cents, status, issued_at, due_date, paid_at from lager.invoices where tenant_id = ${id} order by created_at desc`;
      const counts = await sql`select
        (select count(*)::int from lager.locations where tenant_id = ${id} and deleted = false) as locations,
        (select count(*)::int from lager.movements where tenant_id = ${id}) as movements,
        (select max(received_at) from lager.movements where tenant_id = ${id}) as last_movement`;
      return json({ ok: true, tenant: tenantRow(t[0]), counts: { ...counts[0], last_movement_dmy: dmy(counts[0].last_movement) },
        members: members.map((m: any) => ({ ...m, created_dmy: dmy(m.created_at) })),
        invoices: invoices.map((r: any) => ({ id: r.id, number: r.number, access_token: r.access_token, plan: r.plan, plan_label: (PLANS[r.plan] || {}).label || r.plan, period: r.period, amount_cents: r.amount_cents, status: r.status, issued_dmy: dmy(r.issued_at), due_dmy: dmy(r.due_date), paid_dmy: dmy(r.paid_at), link: `${SITE}/zahlung.html?r=${r.access_token}` })) });
    }

    if (action === "set_plan") {
      const id = String(body.tenant_id || "").toLowerCase();
      if (!UUID_RE.test(id)) return json({ error: "bad_id" }, 400);
      const plan = String(body.plan || "");
      if (!PLANS[plan]) return json({ error: "bad_plan" }, 400);
      const months = Math.max(0, Math.min(60, Number(body.months) | 0));
      const trialDays = Math.max(0, Math.min(365, Number(body.trial_days) | 0));
      const today = todayYmd();
      await sql`update lager.tenants set plan = ${plan}, updated_at = now() where id = ${id}`;
      if (months > 0) await sql`update lager.tenants set paid_until = (greatest(coalesce(paid_until, ${today}::date), ${today}::date) + (${months}::int * interval '1 month'))::date where id = ${id}`;
      if (plan === "trial" && trialDays > 0) await sql`update lager.tenants set trial_ends_at = ${today}::date + ${trialDays}::int where id = ${id}`;
      await audit(id, "plan_set", { plan, months, trial_days: trialDays });
      return json({ ok: true });
    }

    if (action === "set_status") {
      const id = String(body.tenant_id || "").toLowerCase();
      if (!UUID_RE.test(id)) return json({ error: "bad_id" }, 400);
      const status = body.status === "gesperrt" ? "gesperrt" : "aktiv";
      await sql`update lager.tenants set status = ${status}, updated_at = now() where id = ${id}`;
      await audit(id, "status_set", { status });
      return json({ ok: true });
    }

    if (action === "set_note") {
      const id = String(body.tenant_id || "").toLowerCase();
      if (!UUID_RE.test(id)) return json({ error: "bad_id" }, 400);
      await sql`update lager.tenants set notiz = ${str(body.notiz, 2000) || null}, updated_at = now() where id = ${id}`;
      return json({ ok: true });
    }

    if (action === "list_invoices") {
      const status = ["open", "paid", "void"].includes(String(body.status)) ? String(body.status) : null;
      const rows = status
        ? await sql`select v.*, t.name as tenant_name from lager.invoices v join lager.tenants t on t.id = v.tenant_id where v.status = ${status} order by v.created_at desc limit 500`
        : await sql`select v.*, t.name as tenant_name from lager.invoices v join lager.tenants t on t.id = v.tenant_id order by v.created_at desc limit 500`;
      return json({ ok: true, invoices: rows.map((r: any) => ({ id: r.id, tenant_id: r.tenant_id, tenant_name: r.tenant_name, number: r.number, plan: r.plan, plan_label: (PLANS[r.plan] || {}).label || r.plan, period: r.period, amount_cents: r.amount_cents, status: r.status, reference: r.reference, issued_dmy: dmy(r.issued_at), due_dmy: dmy(r.due_date), paid_dmy: dmy(r.paid_at), link: `${SITE}/zahlung.html?r=${r.access_token}` })) });
    }

    if (action === "mark_paid") {
      const id = String(body.invoice_id || "").toLowerCase();
      if (!UUID_RE.test(id)) return json({ error: "bad_id" }, 400);
      const inv = await sql`select id, tenant_id, plan, period, status from lager.invoices where id = ${id} limit 1`;
      if (!inv.length) return json({ error: "not_found" }, 404);
      if (inv[0].status === "paid") return json({ error: "already_paid" }, 400);
      const months = inv[0].period === "jahr" ? 12 : 1;
      const today = todayYmd();
      const done = await sql.begin(async (tx: any) => {
        // atomar: ein Doppelklick verlängert nicht doppelt
        const claim = await tx`update lager.invoices set status = 'paid', paid_at = now() where id = ${id} and status <> 'paid' returning id`;
        if (!claim.length) return false;
        const cur = await tx`select plan, paid_until from lager.tenants where id = ${inv[0].tenant_id} for update`;
        // Tarifwechsel: Restlaufzeit des alten Tarifs wertgleich in Tage des neuen umrechnen
        let base = today;
        const pu = ymd(cur[0].paid_until);
        if (pu && pu > today) {
          const oldP = PLANS[cur[0].plan], newP = PLANS[inv[0].plan];
          const rest = daysBetween(today, pu);
          const credit = (oldP && newP && cur[0].plan !== inv[0].plan && oldP.price.monat > 0 && newP.price.monat > 0)
            ? Math.floor(rest * oldP.price.monat / newP.price.monat) : rest;
          base = addDays(today, credit);
        }
        await tx`update lager.tenants set plan = ${inv[0].plan}, status = 'aktiv',
          paid_until = (${base}::date + (${months}::int * interval '1 month'))::date,
          updated_at = now() where id = ${inv[0].tenant_id}`;
        return true;
      });
      if (!done) return json({ error: "already_paid" }, 400);
      await audit(inv[0].tenant_id, "invoice_paid", { plan: inv[0].plan, period: inv[0].period });
      const t = await sql`select paid_until, contact_email, billing, name from lager.tenants where id = ${inv[0].tenant_id}`;
      const to = (t[0].billing && t[0].billing.email) || t[0].contact_email;
      if (to) {
        await sendMail(to, `Zahlung eingegangen — ${PRODUCT}`,
          `Guten Tag,\n\nvielen Dank, Ihre Zahlung ist eingegangen. Der Tarif ${PLANS[inv[0].plan].label} ist bis ${dmy(t[0].paid_until)} freigeschaltet.\n\n${SITE}/app.html\n\nViele Grüße\n${PRODUCT}`,
          mailShell("Zahlung eingegangen", `<p>Vielen Dank, Ihre Zahlung ist eingegangen. Der Tarif <b>${esc(PLANS[inv[0].plan].label)}</b> ist bis <b>${esc(dmy(t[0].paid_until))}</b> freigeschaltet.</p><p><a href="${SITE}/app.html">Zur App</a></p>`));
      }
      return json({ ok: true, paid_until_dmy: dmy(t[0].paid_until) });
    }

    if (action === "set_invoice_status") {
      const id = String(body.invoice_id || "").toLowerCase();
      if (!UUID_RE.test(id)) return json({ error: "bad_id" }, 400);
      const status = body.status === "void" ? "void" : "open";
      await sql`update lager.invoices set status = ${status}, paid_at = null where id = ${id}`;
      return json({ ok: true });
    }

    if (action === "create_invoice") {
      const id = String(body.tenant_id || "").toLowerCase();
      if (!UUID_RE.test(id)) return json({ error: "bad_id" }, 400);
      const plan = String(body.plan || "");
      if (!["starter", "team", "business"].includes(plan)) return json({ error: "bad_plan" }, 400);
      const period = String(body.period || "monat") === "jahr" ? "jahr" : "monat";
      return json({ ok: true, invoice: await createInvoice(id, plan, period) });
    }

    if (action === "list_leads") {
      const rows = await sql`select id, firma, name, email, nachricht, created_at from lager.leads order by created_at desc limit 500`;
      return json({ ok: true, leads: rows.map((l: any) => ({ ...l, created_dmy: dmy(l.created_at) })) });
    }

    if (action === "delete_tenant") {
      const id = String(body.tenant_id || "").toLowerCase();
      if (!UUID_RE.test(id)) return json({ error: "bad_id" }, 400);
      const t = await sql`select name from lager.tenants where id = ${id} limit 1`;
      if (!t.length) return json({ error: "not_found" }, 404);
      if (str(body.confirm, 200) !== t[0].name) return json({ error: "confirm_mismatch" }, 400);
      const members = await sql`select id from lager.members where tenant_id = ${id}`;
      const deletable: string[] = [];
      for (const m of members) if (await authDeletable(String(m.id))) deletable.push(String(m.id));
      await sql`delete from lager.tenants where id = ${id}`;
      const ids = members.map((m: any) => String(m.id));
      if (ids.length) await sql`update lager.auth_tokens set used_at = now() where user_id = any(${ids}::uuid[]) and used_at is null`;
      let deletedUsers = 0;
      for (const uid of deletable) {
        const r = await gotrue(`admin/users/${uid}`, "DELETE");
        if (r.ok) deletedUsers++;
      }
      return json({ ok: true, deleted_users: deletedUsers, members: members.length });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    try { console.error("lager-admin", action, String((e as any)?.message || e)); } catch (_e) { /* */ }
    return json({ error: "server_error" }, 500);
  }
});
