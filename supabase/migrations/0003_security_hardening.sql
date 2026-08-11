-- ════════════════════════════════════════════════════════════════════════
-- StuffSearch — 0003_security_hardening.sql
-- Tighten the SECURITY DEFINER surface flagged by database advisors:
--   1. Revoke EXECUTE on trigger/helper fns from anon (and, for triggers,
--      from authenticated too — they're only invoked by the DB itself).
--   2. Pin search_path on the two trigger fns that were missing it.
-- Behavior is unchanged; this only narrows the publicly callable RPC surface.
-- ════════════════════════════════════════════════════════════════════════

-- handle_new_user is a trigger fn; only the DB fires it. Neither anon nor
-- authenticated should call it via /rest/v1/rpc.
revoke execute on function public.handle_new_user() from anon, authenticated;

-- Membership helpers are SECURITY DEFINER and safe (they self-scope by
-- auth.uid()), but anon has no business calling them. Keep authenticated.
revoke execute on function public.is_household_member(uuid) from anon;
revoke execute on function public.is_household_owner(uuid) from anon;

-- resolve_code takes an explicit user_id (used by Edge Functions / RPC).
-- Keep it executable by authenticated; revoke anon.
revoke execute on function public.resolve_code(text, uuid) from anon;

-- Re-create the two trigger functions with a pinned search_path (advisor:
-- function_search_path_mutable). Behavior identical.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.touch_current_place_since()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (new.current_place_id is distinct from old.current_place_id) then
    new.current_place_since := now();
  end if;
  return new;
end;
$$;
