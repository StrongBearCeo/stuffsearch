-- ════════════════════════════════════════════════════════════════════════
-- StuffSearch — 0007_tags_value_links_search.sql
--
-- Four related additions:
--   1. tags        — free-form labels on items AND places, for quick filtering
--                    ("return", "fragile", "winter"). text[] + GIN index.
--   2. value       — an AI-estimated (or user-corrected) monetary value per
--                    item, so the household can see its total asset value.
--   3. product_links — an item can carry SEVERAL product links. The legacy
--                    single `product_link` column is kept (and backfilled
--                    into the array) so older clients keep working; the app
--                    reads the array and mirrors element 0 back into it.
--   4. fts_search  — the token-aware relevance RPC that ask-llm already calls
--                    but which was never created. Matching is per-token, so
--                    "Husky tile cutter" still finds "Tile cutter".
-- ════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1 + 2 + 3: items columns
-- ───────────────────────────────────────────────────────────────
alter table public.items
  add column if not exists tags             text[] not null default '{}',
  add column if not exists product_links    text[] not null default '{}',
  add column if not exists estimated_value  numeric(14,2),
  add column if not exists value_currency   text,
  add column if not exists value_source     text,
  add column if not exists value_updated_at timestamptz;

-- Who set the value: 'ai' (enrichment) or 'manual' (the user typed it). Drives
-- the "estimated" vs "your value" label and stops enrichment from silently
-- overwriting a number the user corrected by hand.
alter table public.items drop constraint if exists items_value_source_check;
alter table public.items add constraint items_value_source_check
  check (value_source is null or value_source in ('ai', 'manual'));

alter table public.items drop constraint if exists items_estimated_value_check;
alter table public.items add constraint items_estimated_value_check
  check (estimated_value is null or estimated_value >= 0);

-- Backfill the array from the legacy scalar so no existing link is lost.
update public.items
   set product_links = array[product_link]
 where product_link is not null
   and btrim(product_link) <> ''
   and cardinality(product_links) = 0;

-- ───────────────────────────────────────────────────────────────
-- 1: places tags
-- ───────────────────────────────────────────────────────────────
alter table public.places
  add column if not exists tags text[] not null default '{}';

create index if not exists items_tags_idx  on public.items  using gin (tags);
create index if not exists places_tags_idx on public.places using gin (tags);

-- Trigram indexes on description too — fts_search and the app's fuzzy search
-- both look past the name.
create index if not exists items_description_trgm_idx
  on public.items using gin (description gin_trgm_ops);
create index if not exists places_description_trgm_idx
  on public.places using gin (description gin_trgm_ops);

-- ───────────────────────────────────────────────────────────────
-- 4: fts_search — token-aware relevance search over a household's items
--
--   ask-llm calls this as its non-vector fallback. It was missing, so every
--   fallback fell through to a whole-phrase ILIKE, which is why a query like
--   "Husky tile cutter" returned nothing while "tile cutter" worked.
--
--   Scoring: one point per distinct query token found anywhere in the item's
--   searchable text, plus the trigram similarity of the whole query to the
--   name as a tie-breaker. An item matches if it hits at least one token or
--   is a close whole-string match (handles typos / a single-word query).
-- ───────────────────────────────────────────────────────────────
create or replace function public.fts_search(
  _household_id uuid,
  _query        text,
  _limit        int default 15
)
returns table (
  item_id          uuid,
  name             text,
  description      text,
  category         text,
  current_place_id uuid,
  score            real
)
language sql
security definer set search_path = public
stable
as $$
  with tokens as (
    select distinct lower(tok) as tok
      from unnest(regexp_split_to_array(coalesce(_query, ''), '[^[:alnum:]]+')) as tok
     where length(tok) >= 2
  ),
  scored as (
    select
      i.id,
      i.name,
      i.description,
      i.category,
      i.current_place_id,
      (
        select count(*)
          from tokens tk
         where lower(
                 coalesce(i.name, '') || ' ' ||
                 coalesce(i.description, '') || ' ' ||
                 coalesce(i.category, '') || ' ' ||
                 coalesce(array_to_string(i.tags, ' '), '')
               ) like '%' || tk.tok || '%'
      )::real as hits,
      similarity(lower(coalesce(i.name, '')), lower(coalesce(_query, ''))) as sim
      from public.items i
     where i.household_id = _household_id
  )
  select id, name, description, category, current_place_id, (hits + sim)::real
    from scored
   where hits > 0 or sim > 0.2
   order by hits desc, sim desc, name asc
   limit greatest(_limit, 1);
$$;

grant execute on function public.fts_search(uuid, text, int) to authenticated, service_role;
revoke execute on function public.fts_search(uuid, text, int) from anon;

-- ───────────────────────────────────────────────────────────────
-- convert_item_to_place: carry the item's tags across too.
--
-- Same contract as 0006 (see that file for the rationale); the only change is
-- that `tags` now travels with name / description / photo / location, since a
-- "return" or "fragile" label is just as meaningful on the resulting place.
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
  _household_id    uuid;
  _name            text;
  _description     text;
  _photo_url       text;
  _parent_place_id uuid;
  _tags            text[];
  _new_place_id    uuid;
begin
  select household_id, name, description,
         case when array_length(photo_urls, 1) > 0 then photo_urls[1] else null end,
         current_place_id, tags
    into _household_id, _name, _description, _photo_url, _parent_place_id, _tags
    from public.items
    where id = _item_id;

  if not found then
    raise exception 'Item not found.' using errcode = 'P0002';
  end if;

  if not public.is_household_member(_household_id) then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  insert into public.places
    (household_id, name, description, photo_url, parent_place_id, tags, created_by)
  values
    (_household_id, _name, _description, _photo_url, _parent_place_id,
     coalesce(_tags, '{}'), _user_id)
  returning id into _new_place_id;

  update public.external_codes
    set entity_type = 'place', entity_id = _new_place_id
    where entity_type = 'item' and entity_id = _item_id;

  delete from public.items where id = _item_id;

  return _new_place_id;
end;
$$;

grant execute on function public.convert_item_to_place(uuid, uuid) to authenticated;
revoke execute on function public.convert_item_to_place(uuid, uuid) from anon;
