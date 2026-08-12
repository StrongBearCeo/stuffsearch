-- ════════════════════════════════════════════════════════════════════════
-- StuffSearch — 0005_household_owner_read.sql
-- Allow a household's owner to read the household row they own.
--
-- The create-household flow inserts into `households` then, in a separate
-- request, inserts the owner's `household_members` row. Until that second
-- insert lands, `is_household_member(id)` is false, so the SELECT policy
-- "households visible to members" hides the just-inserted row — and the
-- `.insert().select().single()` read-back returns nothing (".single()" then
-- throws). Letting the owner read by `owner_id` covers that brief window and
-- any orphaned-owner edge case. Owners are members in normal operation, so
-- this only broadens access to the owner for rows they already own.
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists "households visible to members" on public.households;
create policy "households visible to members"
  on public.households for select
  using (public.is_household_member(id) or owner_id = auth.uid());