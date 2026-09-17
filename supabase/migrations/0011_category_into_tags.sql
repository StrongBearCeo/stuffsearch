-- ════════════════════════════════════════════════════════════════════════
-- StuffSearch — 0011_category_into_tags.sql
--
-- Retire `items.category` by folding it into `items.tags`.
--
-- WHY. Category and tags were two mechanisms for the same job, and category
-- was the worse one at every point:
--
--   * it holds ONE value, tags hold many;
--   * it is free text with no normalisation, so the model that fills it
--     produced `tool` (17 rows) AND `tools` (17 rows), `cable` (11) AND
--     `cables` (6), `document` (10) AND `documents` (1), plus
--     abrasive/abrasives and microphone/microphones — 40 "distinct"
--     categories across 129 items, several of them the same word twice;
--   * tags are lowercased and de-duplicated on the way in (src/lib/tags.ts);
--   * tags have a filter bar, a search box, chips on every card and a
--     "browse by tag" section on the home screen. Category had no filter UI
--     at all — it was displayed and never used.
--
-- Rather than build a second, parallel filtering system for a field that
-- duplicates tags, the values move across and the column goes.
--
-- The singular/plural fold below is deliberately narrow: it only merges a
-- category X into X when BOTH `X` and `X || 's'` exist in the same household.
-- No stemming — a general de-pluraliser turns "supplies" into "suppl" and
-- "gloves" into "glove", which is worse than leaving them alone.
-- ════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. Fold exact singular/plural pairs, per household.
-- ───────────────────────────────────────────────────────────────
with normalized as (
  select id, household_id, lower(btrim(category)) as cat
    from public.items
   where btrim(coalesce(category, '')) <> ''
),
present as (
  select distinct household_id, cat from normalized
),
plural_pairs as (
  -- `cat` is a plural whose singular also exists in the same household.
  select p.household_id, p.cat as plural, s.cat as singular
    from present p
    join present s
      on s.household_id = p.household_id
     and p.cat = s.cat || 's'
)
update public.items i
   set category = pp.singular
  from normalized n
  join plural_pairs pp
    on pp.household_id = n.household_id and pp.plural = n.cat
 where i.id = n.id;

-- ───────────────────────────────────────────────────────────────
-- 2. Append the category to tags, unless it is already there.
--    Tag rules mirror src/lib/tags.ts: trimmed, lowercased, inner whitespace
--    collapsed, leading '#' stripped, capped at 32 characters.
-- ───────────────────────────────────────────────────────────────
update public.items
   set tags = coalesce(tags, '{}') || array[cat]
  from (
    select id,
           left(
             regexp_replace(
               btrim(regexp_replace(lower(btrim(category)), '^#+', '')),
               '\s+', ' ', 'g'
             ),
             32
           ) as cat
      from public.items
     where btrim(coalesce(category, '')) <> ''
  ) src
 where public.items.id = src.id
   and src.cat <> ''
   and not (src.cat = any(coalesce(public.items.tags, '{}')));

-- ───────────────────────────────────────────────────────────────
-- 3. Recreate the two search RPCs without the column.
--    Both must be DROPped first: changing a function's OUT columns is a
--    return-type change, which CREATE OR REPLACE refuses.
--
--    Nothing reads the `category` they returned — ask-llm types its rows as
--    { item_id, name, current_place_id } and semantic-search passes them
--    straight to the client, which renders name + place only. The scoring
--    text now reads tags in category's place, which is where the same words
--    now live.
-- ───────────────────────────────────────────────────────────────
drop function if exists public.fts_search(uuid, text, int);

create function public.fts_search(
  _household_id uuid,
  _query        text,
  _limit        int default 15
)
returns table (
  item_id          uuid,
  name             text,
  description      text,
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
      i.current_place_id,
      (
        select count(*)
          from tokens tk
         where lower(
                 coalesce(i.name, '') || ' ' ||
                 coalesce(i.description, '') || ' ' ||
                 coalesce(array_to_string(i.tags, ' '), '')
               ) like '%' || tk.tok || '%'
      )::real as hits,
      similarity(lower(coalesce(i.name, '')), lower(coalesce(_query, ''))) as sim
      from public.items i
     where i.household_id = _household_id
  )
  select id, name, description, current_place_id, (hits + sim)::real
    from scored
   where hits > 0 or sim > 0.2
   order by hits desc, sim desc, name asc
   limit greatest(_limit, 1);
$$;

grant execute on function public.fts_search(uuid, text, int) to authenticated, service_role;
revoke execute on function public.fts_search(uuid, text, int) from anon, public;

drop function if exists public.semantic_match(uuid, vector, int);
drop function if exists public.semantic_match(uuid, text, int);

create function public.semantic_match(
  _household_id uuid,
  _embedding    vector(1536),
  _limit        int default 20
)
returns table (
  item_id          uuid,
  name             text,
  description      text,
  current_place_id uuid,
  score            double precision
)
language sql
security definer set search_path = public
stable
as $$
  select i.id, i.name, i.description, i.current_place_id,
         (1 - (i.embedding <=> _embedding))::double precision as score
    from public.items i
   where i.household_id = _household_id
     and i.embedding is not null
   order by i.embedding <=> _embedding
   limit greatest(_limit, 1);
$$;

grant execute on function public.semantic_match(uuid, vector, int) to authenticated, service_role;
revoke execute on function public.semantic_match(uuid, vector, int) from anon, public;

-- ───────────────────────────────────────────────────────────────
-- 4. Drop the column.
--    Safe only after step 2; the rollback re-adds it but CANNOT recover the
--    original values, because a tag is now indistinguishable from any other
--    tag. The pre-migration values are in the backup taken alongside this
--    change (backups/backup-20260917-123838/data.json).
-- ───────────────────────────────────────────────────────────────
alter table public.items drop column if exists category;

-- No index, view or constraint referenced `category` — only the two search
-- functions recreated above — so the drop has nothing else to take with it.
