-- v3: Einladungen / Kontolöschung / Rate-Limits
-- auth_created: Auth-Konto wurde von der Lagerverwaltung (Einladung) angelegt.
-- Nur solche Konten darf die Lagerverwaltung wieder löschen (auth.users ist mit anderen Vaydena-Produkten geteilt).
alter table lager.members add column if not exists auth_created boolean not null default false;

-- Zählereignisse für Rate-Limits (Registrierung je IP / E-Mail)
create table if not exists lager.rate_events (
  id         bigserial primary key,
  kind       text not null,
  key        text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_events_kind_key_idx on lager.rate_events (kind, key, created_at);
alter table lager.rate_events enable row level security;
