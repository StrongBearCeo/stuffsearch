-- ════════════════════════════════════════════════════════════════════════
-- StuffSearch — 0010_places_as_items_placements_photos.sql
--
-- Six related changes:
--   1. items.quantity        — "10 pencils" is ONE item with a count, not ten rows.
--   2. item_placements       — the same item can sit in SEVERAL places, each with
--                              its own count. `items.current_place_id` stays the
--                              primary location so every existing query keeps
--                              working; placements are the extra ones.
--   3. places.photo_urls     — places get a photo ARRAY like items (the single
--                              `photo_url` column is kept, mirroring element 0,
--                              so older clients and the print sheet still work).
--   4. places.item_id        — a place may BE an item ("the toolbox is both a
--                              valuable thing and a container"). Converting an
--                              item to a place no longer destroys the item: it
--                              gains a place facet, and the two stay in sync.
--   5. external_codes GC     — deleting an item/place left its bound codes behind,
--                              so re-binding the same label later hit
--                              external_codes_household_value_uniq (23505).
--                              Orphans are swept now and prevented by triggers.
--   6. convert_item_to_place — rewritten to be NON-destructive (see 4).
-- ════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. items.quantity
-- ───────────────────────────────────────────────────────────────
alter table public.items
  add column if not exists quantity integer not null default 1;

alter table public.items drop constraint if exists items_quantity_check;
alter table public.items add constraint items_quantity_check
  check (quantity >= 0);

-- ───────────────────────────────────────────────────────────────
-- 3. places.photo_urls (array) — backfilled from the scalar column
-- ───────────────────────────────────────────────────────────────
alter table public.places
  add column if not exists photo_urls text[] not null default '{}';

update public.places
   set photo_urls = array[photo_url]
 where photo_url is not null
   and btrim(photo_url) <> ''
   and cardinality(photo_urls) = 0;

-- ───────────────────────────────────────────────────────────────
-- 4. places.item_id — the place is the "storage facet" of an item
--
--    Nullable: an ordinary place (a room, a shelf) has no item behind it.
--    ON DELETE CASCADE: deleting the item removes its storage facet too;
--    deleting the place just drops the storage facet and leaves the item.
-- ───────────────────────────────────────────────────────────────
alter table public.places
  add column if not exists item_id uuid references public.items(id) on delete cascade;

-- One place per item (a partial unique index so the many NULLs don't collide).
create unique index if not exists places_item_id_uniq
  on public.places(item_id) where item_id is not null;

create index if not exists places_parent_idx on public.places(parent_place_id);

-- ───────────────────────────────────────────────────────────────
-- place_would_cycle(_place_id, _new_parent)
--   True if parenting `_place_id` under `_new_parent` would close a loop —
--   i.e. the new parent IS the place, or lives somewhere inside it. The app
--   has the same guard client-side (`wouldCreateCycle` in src/lib/places.ts);
--   this is the server-side backstop used by the item↔place sync trigger,
--   which the app can't intercept.
-- ───────────────────────────────────────────────────────────────
create or replace function public.place_would_cycle(
  _place_id   uuid,
  _new_parent uuid
)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  with recursive up as (
    select p.id, p.parent_place_id, 1 as depth
      from public.places p
     where p.id = _new_parent
    union all
    select p.id, p.parent_place_id, up.depth + 1
      from public.places p
      join up on p.id = up.parent_place_id
     where up.depth < 64
  )
  select _place_id is not null
     and _new_parent is not null
     and (_place_id = _new_parent or exists (select 1 from up where up.id = _place_id));
$$;

grant execute on function public.place_would_cycle(uuid, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- sync_place_from_item()
--   An item that also IS a place keeps ONE source of truth: the item row.
--   Editing the item's name / description / tags / photos / location updates
--   its place facet, so the two can never drift apart and the places list,
--   search and print sheet all keep showing the right thing.
--
--   The location sync is guarded: moving an item into (a descendant of) its
--   own storage facet would create a cycle, so in that case the facet's
--   parent is left alone rather than corrupting the tree.
-- ───────────────────────────────────────────────────────────────
create or replace function public.sync_place_from_item()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  _facet_id uuid;
begin
  select id into _facet_id from public.places where item_id = new.id;
  if _facet_id is null then
    return new;
  end if;

  update public.places
     set name        = new.name,
         description = new.description,
         tags        = coalesce(new.tags, '{}'),
         photo_urls  = coalesce(new.photo_urls, '{}'),
         photo_url   = case
                         when array_length(new.photo_urls, 1) > 0 then new.photo_urls[1]
                         else null
                       end,
         parent_place_id = case
           when new.current_place_id is null then null
           when public.place_would_cycle(_facet_id, new.current_place_id) then parent_place_id
           else new.current_place_id
         end
   where id = _facet_id;

  return new;
end;
$$;

drop trigger if exists items_sync_place_facet on public.items;
create trigger items_sync_place_facet
  after update of name, description, tags, photo_urls, current_place_id on public.items
  for each row execute function public.sync_place_from_item();

-- ───────────────────────────────────────────────────────────────
-- 2. item_placements — the same item stored in several places
--
--    `items.current_place_id` remains the PRIMARY location (it drives history,
--    the location card and every existing query). A placement row is an
--    ADDITIONAL location: "4 of these pencils are also in the desk drawer".
-- ───────────────────────────────────────────────────────────────
create table if not exists public.item_placements (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.items(id)  on delete cascade,
  place_id   uuid not null references public.places(id) on delete cascade,
  quantity   integer not null default 1,
  note       text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, place_id)
);

alter table public.item_placements drop constraint if exists item_placements_quantity_check;
alter table public.item_placements add constraint item_placements_quantity_check
  check (quantity >= 0);

create index if not exists item_placements_item_idx  on public.item_placements(item_id);
create index if not exists item_placements_place_idx on public.item_placements(place_id);

drop trigger if exists item_placements_touch_updated_at on public.item_placements;
create trigger item_placements_touch_updated_at
  before update on public.item_placements
  for each row execute function public.touch_updated_at();

alter table public.item_placements enable row level security;

-- Visibility follows the item's household, exactly like item_history.
drop policy if exists "item_placements household read" on public.item_placements;
create policy "item_placements household read"
  on public.item_placements for select
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id and public.is_household_member(i.household_id)
    )
  );

drop policy if exists "item_placements household write" on public.item_placements;
create policy "item_placements household write"
  on public.item_placements for insert
  with check (
    exists (
      select 1 from public.items i
      where i.id = item_id and public.is_household_member(i.household_id)
    )
  );

drop policy if exists "item_placements household update" on public.item_placements;
create policy "item_placements household update"
  on public.item_placements for update
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id and public.is_household_member(i.household_id)
    )
  );

drop policy if exists "item_placements household delete" on public.item_placements;
create policy "item_placements household delete"
  on public.item_placements for delete
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id and public.is_household_member(i.household_id)
    )
  );

-- ───────────────────────────────────────────────────────────────
-- 5. external_codes garbage collection
--
--    external_codes.entity_id is polymorphic, so no FK ever cleaned it up:
--    deleting an item left its bound label pointing at a dead row, and the
--    next attempt to bind that same label raised
--      duplicate key value violates unique constraint
--      "external_codes_household_value_uniq"  (23505)
--    Sweep the existing orphans, then prevent new ones with delete triggers.
-- ───────────────────────────────────────────────────────────────
delete from public.external_codes ec
 where (ec.entity_type = 'item'
        and not exists (select 1 from public.items i where i.id = ec.entity_id))
    or (ec.entity_type = 'place'
        and not exists (select 1 from public.places p where p.id = ec.entity_id));

create or replace function public.cleanup_codes_for_deleted_item()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.external_codes
   where entity_type = 'item' and entity_id = old.id;
  return old;
end;
$$;

drop trigger if exists items_cleanup_codes on public.items;
create trigger items_cleanup_codes
  after delete on public.items
  for each row execute function public.cleanup_codes_for_deleted_item();

create or replace function public.cleanup_codes_for_deleted_place()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.external_codes
   where entity_type = 'place' and entity_id = old.id;
  return old;
end;
$$;

drop trigger if exists places_cleanup_codes on public.places;
create trigger places_cleanup_codes
  after delete on public.places
  for each row execute function public.cleanup_codes_for_deleted_place();

-- ───────────────────────────────────────────────────────────────
-- 6. convert_item_to_place — now NON-destructive
--
--    Before: the item's name/description/photo/tags/codes were copied onto a
--    new place and THE ITEM WAS DELETED, silently discarding its category,
--    value, product links and extra photos.
--
--    Now: the item gains a place FACET (places.item_id = the item). Nothing is
--    discarded — the thing stays an item (with its value, links, category and
--    history) and additionally gains the storage abilities of a place. Codes
--    stay bound to the item; scanning one opens the item, whose screen links
--    straight through to its contents.
--
--    Idempotent: calling it twice returns the same facet.
-- ───────────────────────────────────────────────────────────────
create or replace function public.convert_item_to_place(
  _item_id uuid,
  _user_id uuid
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  _household_id uuid;
  _name         text;
  _description  text;
  _photo_urls   text[];
  _parent_id    uuid;
  _tags         text[];
  _facet_id     uuid;
begin
  select household_id, name, description, coalesce(photo_urls, '{}'),
         current_place_id, coalesce(tags, '{}')
    into _household_id, _name, _description, _photo_urls, _parent_id, _tags
    from public.items
    where id = _item_id;

  if not found then
    raise exception 'Item not found.' using errcode = 'P0002';
  end if;

  if not public.is_household_member(_household_id) then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  -- Already converted → hand back the existing facet.
  select id into _facet_id from public.places where item_id = _item_id;
  if _facet_id is not null then
    return _facet_id;
  end if;

  insert into public.places
    (household_id, name, description, photo_url, photo_urls,
     parent_place_id, tags, item_id, created_by)
  values
    (_household_id, _name, _description,
     case when array_length(_photo_urls, 1) > 0 then _photo_urls[1] else null end,
     _photo_urls, _parent_id, _tags, _item_id, _user_id)
  returning id into _facet_id;

  return _facet_id;
end;
$$;

grant execute on function public.convert_item_to_place(uuid, uuid) to authenticated;
revoke execute on function public.convert_item_to_place(uuid, uuid) from anon;

-- ───────────────────────────────────────────────────────────────
-- fts_search: quantity is worth surfacing alongside the match, and an item
-- that also IS a place should still be findable as an item. Only the returned
-- columns change; the scoring is untouched (see 0007 for the rationale).
-- ───────────────────────────────────────────────────────────────
-- (left as-is: the client re-reads the full row by id, so no signature churn)
