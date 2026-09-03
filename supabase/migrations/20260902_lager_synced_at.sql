-- v2: Server-Schreibzeit für inkrementellen Pull (Client-Uhren sind unzuverlässig).
-- updated_at bleibt die Client-Zeit (Last-write-wins), synced_at ist die Serverzeit des letzten Schreibens.
alter table lager.locations  add column if not exists synced_at timestamptz not null default now();
alter table lager.items      add column if not exists synced_at timestamptz not null default now();
alter table lager.item_codes add column if not exists synced_at timestamptz not null default now();
drop index if exists lager.locations_tenant_updated_idx;
drop index if exists lager.items_tenant_updated_idx;
drop index if exists lager.item_codes_tenant_updated_idx;
drop index if exists lager.movements_tenant_updated_idx;
create index if not exists locations_tenant_synced_idx  on lager.locations  (tenant_id, synced_at);
create index if not exists items_tenant_synced_idx      on lager.items      (tenant_id, synced_at);
create index if not exists item_codes_tenant_synced_idx on lager.item_codes (tenant_id, synced_at);
create index if not exists movements_tenant_received_idx on lager.movements (tenant_id, received_at);
