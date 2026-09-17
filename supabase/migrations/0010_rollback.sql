-- ════════════════════════════════════════════════════════════════════════
-- StuffSearch — 0010_rollback.sql
--
-- NOT part of the migration sequence. Kept beside 0010 so the schema change
-- it makes is reversible: run this by hand (psql / the SQL editor) to undo
-- 0010_places_as_items_placements_photos.sql.
--
-- WARNING — these two steps DO lose data written since 0010 was applied:
--   * dropping `item_placements` discards every extra-location row;
--   * dropping `items.quantity` discards every count above 1.
-- Everything else is either additive (safe to drop) or a redefinition that is
-- restored to its 0007 form below.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── triggers + their functions ───────────────────────────────────────────
drop trigger if exists items_sync_place_facet on public.items;
drop trigger if exists items_cleanup_codes    on public.items;
drop trigger if exists places_cleanup_codes   on public.places;

drop function if exists public.sync_place_from_item();
drop function if exists public.cleanup_codes_for_deleted_item();
drop function if exists public.cleanup_codes_for_deleted_place();
drop function if exists public.place_would_cycle(uuid, uuid);

-- ── new table (DESTRUCTIVE: extra placements are lost) ────────────────────
drop table if exists public.item_placements;

-- ── new columns ──────────────────────────────────────────────────────────
-- places.item_id: NULL for every ordinary place, so dropping it only loses
-- the item↔place links created by the new convert_item_to_place. The place
-- rows themselves survive as plain places.
drop index if exists public.places_item_id_uniq;
alter table public.places drop column if exists item_id;

-- places.photo_urls: photo_url was never stopped being written, so the first
-- photo of every place survives. Photos 2..n added after 0010 are lost.
alter table public.places drop column if exists photo_urls;

-- items.quantity (DESTRUCTIVE: counts above 1 are lost).
alter table public.items drop constraint if exists items_quantity_check;
alter table public.items drop column if exists quantity;

-- ── convert_item_to_place: back to the 0007 (destructive) definition ──────
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

commit;

-- Note: the single orphaned external_codes row 0010 swept is NOT restored
-- here on purpose — it pointed at a deleted item and only served to block
-- re-binding its label. The verbatim row (and an INSERT to bring it back) is
-- recorded in backups/backup-20260917-premigration/NOTES.md.
