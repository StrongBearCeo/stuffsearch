-- ════════════════════════════════════════════════════════════════════════
-- StuffSearch — 0002_external_codes.sql
-- External barcode binding: an item or place may carry one or more externally-
-- printed codes (any symbology). Codes are unique per household and resolve
-- across ALL the user's households via a SECURITY DEFINER lookup function.
-- ════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- Enums
-- ───────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'external_code_type') then
    create type external_code_type as enum (
      'qr', 'code128', 'code39', 'code93', 'ean13', 'ean8',
      'upc_a', 'upc_e', 'codabar', 'itf', 'data_matrix',
      'pdf417', 'aztec', 'other'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'external_entity_type') then
    create type external_entity_type as enum ('item', 'place');
  end if;
end$$;

-- ───────────────────────────────────────────────────────────────
-- external_codes  — one row per bound external code value
--   UNIQUE(household_id, code_value): a given code binds at most one
--   item/place within a household. One entity may carry many codes.
-- ───────────────────────────────────────────────────────────────
create table if not exists public.external_codes (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  code_value    text not null,
  code_type     external_code_type not null default 'other',
  entity_type   external_entity_type not null,
  entity_id     uuid not null,
  label         text,  -- optional, e.g. "shelf label"
  bound_by      uuid references auth.users(id) on delete set null,
  bound_at      timestamptz not null default now()
);

-- A code value binds at most one entity within a household.
create unique index if not exists external_codes_household_value_uniq
  on public.external_codes(household_id, code_value);

-- Fast lookup by raw scanned value (resolve_code scans across households).
create index if not exists external_codes_value_idx
  on public.external_codes(code_value);

-- Typed entity targets (kept deferrable-ish; no FK since entity is polymorphic).
create index if not exists external_codes_entity_idx
  on public.external_codes(entity_type, entity_id);

alter table public.external_codes enable row level security;

-- Read: any member of the household the code belongs to.
drop policy if exists "external_codes household read" on public.external_codes;
create policy "external_codes household read"
  on public.external_codes for select
  using (public.is_household_member(household_id));

-- Insert: member of the household binds a code to an entity they may write.
drop policy if exists "external_codes household write" on public.external_codes;
create policy "external_codes household write"
  on public.external_codes for insert
  with check (public.is_household_member(household_id));

-- Update (e.g. relabel): member of the household.
drop policy if exists "external_codes household update" on public.external_codes;
create policy "external_codes household update"
  on public.external_codes for update
  using (public.is_household_member(household_id));

-- Delete (unbind): member of the household.
drop policy if exists "external_codes household delete" on public.external_codes;
create policy "external_codes household delete"
  on public.external_codes for delete
  using (public.is_household_member(household_id));

-- ───────────────────────────────────────────────────────────────
-- resolve_code(_code_value, _user_id)
--   SECURITY DEFINER. Given a raw scanned payload and a user id, scan all
--   households the user belongs to and return the binding, if any. Returns
--   one row per match (a code could in principle bind different entities in
--   different households — the app surfaces a "switch and open?" prompt).
--
--   Columns: household_id, entity_type, entity_id
-- ───────────────────────────────────────────────────────────────
create or replace function public.resolve_code(
  _code_value text,
  _user_id    uuid
)
returns table (
  household_id uuid,
  entity_type  external_entity_type,
  entity_id    uuid
)
language sql
security definer set search_path = public
stable
as $$
  select ec.household_id, ec.entity_type, ec.entity_id
  from public.external_codes ec
  where ec.code_value = _code_value
    and exists (
      select 1 from public.household_members m
      where m.household_id = ec.household_id
        and m.user_id = _user_id
    );
$$;

grant execute on function public.resolve_code(text, uuid) to authenticated;
