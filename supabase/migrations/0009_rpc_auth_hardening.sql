-- ════════════════════════════════════════════════════════════════════════
-- StuffSearch — 0009_rpc_auth_hardening.sql
--
-- Close the remaining SECURITY DEFINER advisor findings that are real.
--
-- 1. `resolve_code` trusted a caller-supplied `_user_id` as the identity it
--    checked membership against, and `anon` could execute it. That is an
--    authentication bypass by parameter: an unauthenticated caller supplies
--    both the code and the user it should be "allowed" as, and gets back the
--    household_id / entity_id the code points at.
--
--    The only caller (src/lib/scanner.ts) already passes the signed-in user's
--    own id, so switching the check to auth.uid() is behaviour-preserving for
--    the app. `_user_id` is kept in the signature so the existing client keeps
--    working, but it is now ignored.
--
-- 2. `semantic_match` takes a household_id on trust with no membership check
--    at all, and `anon` could execute it. It is called only by the ask-llm and
--    semantic-search Edge Functions, which authenticate with the service role
--    — the same shape as fts_search in 0008, and it gets the same treatment.
--    Currently inert (no item has an embedding yet); this closes it before the
--    embedding backfill makes it a full inventory read.
--
-- 3. The trigger functions are not meant to be reachable over PostgREST at
--    all. Postgres checks EXECUTE on a trigger function when the trigger is
--    created, not when it fires, so revoking here does not affect the
--    triggers.
--
-- Deliberately NOT touched: is_household_member / is_household_owner. They
-- resolve identity through auth.uid() (an anon caller simply gets false), and
-- revoking PUBLIC without an explicit grant would break every RLS policy that
-- calls them — see the note in 0008.
-- ════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. resolve_code: derive identity from the JWT, never from the argument.
-- ───────────────────────────────────────────────────────────────
create or replace function public.resolve_code(_code_value text, _user_id uuid)
returns table(household_id uuid, entity_type external_entity_type, entity_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- _user_id is accepted for backwards compatibility with the existing client
  -- and intentionally ignored; identity comes from the verified JWT.
  select ec.household_id, ec.entity_type, ec.entity_id
  from public.external_codes ec
  where ec.code_value = _code_value
    and auth.uid() is not null
    and exists (
      select 1 from public.household_members m
      where m.household_id = ec.household_id
        and m.user_id = auth.uid()
    );
$function$;

revoke execute on function public.resolve_code(text, uuid) from public;
revoke execute on function public.resolve_code(text, uuid) from anon;
grant  execute on function public.resolve_code(text, uuid) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────
-- 2. semantic_match: service-role only, like fts_search.
-- ───────────────────────────────────────────────────────────────
revoke execute on function public.semantic_match(uuid, public.vector, int) from public;
revoke execute on function public.semantic_match(uuid, public.vector, int) from anon, authenticated;
grant  execute on function public.semantic_match(uuid, public.vector, int) to service_role;

-- ───────────────────────────────────────────────────────────────
-- 3. Trigger functions: not callable over the REST API.
-- ───────────────────────────────────────────────────────────────
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;

revoke execute on function public.touch_updated_at() from public;
revoke execute on function public.touch_updated_at() from anon, authenticated;

revoke execute on function public.touch_current_place_since() from public;
revoke execute on function public.touch_current_place_since() from anon, authenticated;
