-- v4: Funktionen – Lieferant/Einkaufspreis, Chargen/MHD, Storno, Artikelbilder, Protokoll, Mindestbestand-Mail

-- Artikel: Lieferant, Einkaufspreis (netto je Einheit), Bestellmenge für den Bestellvorschlag
alter table lager.items add column if not exists supplier       text;
alter table lager.items add column if not exists purchase_price numeric(14,4);
alter table lager.items add column if not exists reorder_qty    numeric(14,3);

-- Buchungen: Charge / MHD, Storno-Verweis (Gegenbuchung)
alter table lager.movements add column if not exists lot         text;
alter table lager.movements add column if not exists best_before date;
alter table lager.movements add column if not exists reverses    uuid;
-- Jede Buchung kann nur einmal storniert werden
create unique index if not exists movements_reverses_uq on lager.movements (reverses) where reverses is not null;

-- Chargenbestand je Artikel/Ort/Charge (gepflegt bei Zugang/Abgang/Umlagerung mit Charge oder MHD)
create table if not exists lager.stock_lots (
  tenant_id   uuid not null references lager.tenants(id) on delete cascade,
  item_id     uuid not null references lager.items(id) on delete cascade,
  location_id uuid not null references lager.locations(id) on delete cascade,
  lot         text not null default '',
  best_before date,
  qty         numeric(14,3) not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, item_id, location_id, lot)
);
create index if not exists stock_lots_bb_idx on lager.stock_lots (tenant_id, best_before) where qty > 0;
alter table lager.stock_lots enable row level security;

-- Artikelbild (ein Bild je Artikel, clientseitig verkleinert, als data-URL)
create table if not exists lager.item_images (
  item_id    uuid primary key references lager.items(id) on delete cascade,
  tenant_id  uuid not null references lager.tenants(id) on delete cascade,
  data       text not null,
  updated_at timestamptz not null default now()
);
create index if not exists item_images_tenant_idx on lager.item_images (tenant_id);
alter table lager.item_images enable row level security;

-- Protokoll (Team-, Firmen-, Tarif- und Löschaktionen)
create table if not exists lager.audit (
  id         bigserial primary key,
  tenant_id  uuid not null references lager.tenants(id) on delete cascade,
  member_id  uuid,
  actor      text,
  action     text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_tenant_idx on lager.audit (tenant_id, id desc);
alter table lager.audit enable row level security;

-- Mindestbestand-Mail: Tag des letzten Versands (höchstens eine Übersicht je Tag)
alter table lager.tenants add column if not exists low_stock_mailed_on date;
