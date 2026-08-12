-- ───────────────────────────────────────────────────────────────
-- convert_item_to_place(_item_id, _user_id)
--   SECURITY DEFINER. Atomically convert an item into a place:
--     1. create a place carrying over the item's name, description, first
--        photo, household, and location (item.current_place_id →
--        place.parent_place_id, so the new place nests where the item was),
--     2. re-point every external_codes row bound to the item at the new place
--        (preserving code_value / code_type / label / bound metadata),
--     3. delete the item (its item_history rows cascade via the existing FK).
--   Returns the new place's id.
--
--   Why an RPC (not client-side sequential writes): the transform is
--   destructive and multi-step; doing it in one transaction means a failure
--   at any step leaves the item untouched (no orphaned empty place).
--
--   The caller must be a member of the item's household — verified explicitly
--   here because SECURITY DEFINER bypasses RLS. anon is revoked EXECUTE
--   (defense-in-depth — only authenticated users should reach this). search_path
--   is pinned (advisor: function_search_path_mutable / security).
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
  _new_place_id    uuid;
begin
  -- Load the item (and implicitly assert it exists).
  select household_id, name, description,
         case when array_length(photo_urls, 1) > 0 then photo_urls[1] else null end,
         current_place_id
    into _household_id, _name, _description, _photo_url, _parent_place_id
    from public.items
    where id = _item_id;

  if not found then
    raise exception 'Item not found.' using errcode = 'P0002';
  end if;

  -- Authorization: caller must belong to the item's household.
  if not public.is_household_member(_household_id) then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  -- Step 1: create the place from the item's data.
  insert into public.places
    (household_id, name, description, photo_url, parent_place_id, created_by)
  values
    (_household_id, _name, _description, _photo_url, _parent_place_id, _user_id)
  returning id into _new_place_id;

  -- Step 2: rebind all external codes from the item to the new place.
  update public.external_codes
    set entity_type = 'place', entity_id = _new_place_id
    where entity_type = 'item' and entity_id = _item_id;

  -- Step 3: delete the item. item_history rows cascade (FK on delete cascade).
  delete from public.items where id = _item_id;

  return _new_place_id;
end;
$$;

-- Destructive function: only signed-in users may call it. anon is revoked as
-- defense-in-depth (the membership guard would reject anon anyway).
grant execute on function public.convert_item_to_place(uuid, uuid) to authenticated;
revoke execute on function public.convert_item_to_place(uuid, uuid) from anon;
