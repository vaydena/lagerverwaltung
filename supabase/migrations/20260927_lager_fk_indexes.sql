-- Indizes für Fremdschlüssel (Supabase-Advisor „unindexed_foreign_keys“):
-- beschleunigen Artikel-/Lagerort-Abfragen sowie FK-Prüfungen beim Löschen.
create index if not exists item_codes_item_idx       on lager.item_codes (item_id);
create index if not exists movements_item_idx        on lager.movements (item_id);
create index if not exists movements_location_idx    on lager.movements (location_id);
create index if not exists movements_to_location_idx on lager.movements (to_location_id) where to_location_id is not null;
create index if not exists stock_item_idx            on lager.stock (item_id);
create index if not exists stock_location_idx        on lager.stock (location_id);
create index if not exists stock_lots_item_idx       on lager.stock_lots (item_id);
create index if not exists stock_lots_location_idx   on lager.stock_lots (location_id);
