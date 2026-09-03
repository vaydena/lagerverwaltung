-- Vaydena Lager — Schema `lager` (Supabase-Projekt xeuexovdipdiiuzjpzkj)
-- Zugriff AUSSCHLIESSLICH über Edge Functions (lager-api / lager-public / lager-admin).
-- RLS ist auf allen Tabellen aktiv, ohne Policies (deny-all); das Schema ist nicht
-- über PostgREST exponiert.

create schema if not exists lager;

-- Mandanten (Firmen) --------------------------------------------------------
create table lager.tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  plan          text not null default 'trial' check (plan in ('trial','starter','team','business')),
  status        text not null default 'aktiv' check (status in ('aktiv','gesperrt')),
  trial_ends_at date not null default (current_date + 14),
  paid_until    date,
  contact_email text,
  billing       jsonb not null default '{}'::jsonb,   -- {recipient, street, zip, city, email}
  code_prefix   text not null default 'ART',
  next_item_no  integer not null default 1,
  next_loc_no   integer not null default 1,
  settings      jsonb not null default '{}'::jsonb,
  notiz         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Mitglieder (id = auth.users.id) -------------------------------------------
create table lager.members (
  id         uuid primary key,
  tenant_id  uuid not null references lager.tenants(id) on delete cascade,
  role       text not null default 'mitarbeiter' check (role in ('admin','mitarbeiter')),
  name       text,
  email      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index members_tenant_idx on lager.members (tenant_id);

-- Lagerorte -------------------------------------------------------------------
create table lager.locations (
  id         uuid primary key,
  tenant_id  uuid not null references lager.tenants(id) on delete cascade,
  code       text not null,
  name       text not null,
  note       text,
  active     boolean not null default true,
  deleted    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index locations_tenant_code_uq on lager.locations (tenant_id, lower(code)) where deleted = false;
create index locations_tenant_updated_idx on lager.locations (tenant_id, updated_at);

-- Artikel ---------------------------------------------------------------------
create table lager.items (
  id         uuid primary key,
  tenant_id  uuid not null references lager.tenants(id) on delete cascade,
  sku        text not null,
  name       text not null,
  barcode    text,                                  -- Haupt-Barcode (eigenes Etikett)
  unit       text not null default 'Stk',
  min_stock  numeric(14,3),
  category   text,
  note       text,
  active     boolean not null default true,
  deleted    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index items_tenant_sku_uq on lager.items (tenant_id, lower(sku)) where deleted = false;
create unique index items_tenant_barcode_uq on lager.items (tenant_id, lower(barcode)) where barcode is not null and deleted = false;
create index items_tenant_updated_idx on lager.items (tenant_id, updated_at);

-- Zusätzliche Codes je Artikel (EAN des Lieferanten usw.) ---------------------
create table lager.item_codes (
  id         uuid primary key,
  tenant_id  uuid not null references lager.tenants(id) on delete cascade,
  item_id    uuid not null references lager.items(id) on delete cascade,
  code       text not null,
  deleted    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index item_codes_tenant_code_uq on lager.item_codes (tenant_id, lower(code)) where deleted = false;
create index item_codes_tenant_updated_idx on lager.item_codes (tenant_id, updated_at);

-- Bewegungen (append-only, id vom Client → idempotent) ------------------------
create table lager.movements (
  id             uuid primary key,
  tenant_id      uuid not null references lager.tenants(id) on delete cascade,
  item_id        uuid not null references lager.items(id) on delete cascade,
  location_id    uuid references lager.locations(id) on delete set null,
  to_location_id uuid references lager.locations(id) on delete set null,
  type           text not null check (type in ('in','out','transfer','count')),
  qty            numeric(14,3) not null,            -- Menge (bei count: gezählter Bestand)
  delta          numeric(14,3) not null default 0,  -- Wirkung auf location_id (Server berechnet)
  note           text,
  member_id      uuid,
  device_id      text,
  created_at     timestamptz not null,              -- Buchungszeit (Client)
  received_at    timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index movements_tenant_updated_idx on lager.movements (tenant_id, updated_at);
create index movements_tenant_item_idx on lager.movements (tenant_id, item_id, created_at desc);

-- Bestand je Artikel und Lagerort (vom Server aus den Bewegungen gepflegt) -----
create table lager.stock (
  tenant_id   uuid not null references lager.tenants(id) on delete cascade,
  item_id     uuid not null references lager.items(id) on delete cascade,
  location_id uuid not null references lager.locations(id) on delete cascade,
  qty         numeric(14,3) not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, item_id, location_id)
);
create index stock_tenant_updated_idx on lager.stock (tenant_id, updated_at);

-- Rechnungen ------------------------------------------------------------------
create sequence lager.invoice_number_seq;
create table lager.invoices (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references lager.tenants(id) on delete cascade,
  number       text not null unique,
  access_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  plan         text not null,
  period       text not null default 'monat' check (period in ('monat','jahr')),
  amount_cents integer not null,
  status       text not null default 'open' check (status in ('open','paid','void')),
  reference    text,
  billing      jsonb,
  issued_at    date not null default current_date,
  due_date     date not null default (current_date + 14),
  paid_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index invoices_tenant_idx on lager.invoices (tenant_id);

-- Passwort-Reset- / Einladungs-Tokens (nur Hash gespeichert) -------------------
create table lager.auth_tokens (
  token_hash text primary key,
  user_id    uuid not null,
  email      text not null,
  purpose    text not null check (purpose in ('reset','invite')),
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- Kontaktanfragen -------------------------------------------------------------
create table lager.leads (
  id         uuid primary key default gen_random_uuid(),
  firma      text,
  name       text,
  email      text,
  nachricht  text,
  created_at timestamptz not null default now()
);

-- Betreiber-Schlüssel (nur SHA-256) -------------------------------------------
create table lager.admin_auth (
  id            integer primary key,
  secret_sha256 text not null
);

-- RLS: alles dicht (Zugriff nur über die Service-Verbindung der Edge Functions)
alter table lager.tenants     enable row level security;
alter table lager.members     enable row level security;
alter table lager.locations   enable row level security;
alter table lager.items       enable row level security;
alter table lager.item_codes  enable row level security;
alter table lager.movements   enable row level security;
alter table lager.stock       enable row level security;
alter table lager.invoices    enable row level security;
alter table lager.auth_tokens enable row level security;
alter table lager.leads       enable row level security;
alter table lager.admin_auth  enable row level security;
