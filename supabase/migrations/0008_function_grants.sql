-- ════════════════════════════════════════════════════════════════════════
-- StuffSearch — 0008_function_grants.sql
--
-- Close two database-advisor findings.
--
-- 1. `revoke ... from anon` does NOT actually remove access.
--    Postgres grants EXECUTE on every new function to the PUBLIC pseudo-role,
--    and `anon` inherits that. 0003 and 0006 both revoked from `anon` and the
--    advisor kept flagging the functions — correctly. The fix is to revoke
--    from PUBLIC and then grant explicitly to the roles that need it.
--
--    Scoped narrowly to the two functions defined/redefined in 0007, because
--    revoking PUBLIC on the RLS helpers (is_household_member /
--    is_household_owner) without an explicit grant would break every policy
--    that calls them. Those are left alone deliberately.
--
-- 2. `edge_ai_errors` is a diagnostics table reachable through PostgREST with
--    RLS off, so anon could read and write it. Enable RLS and add no policies:
--    the Edge Functions write with the service role key, which bypasses RLS,
--    so their logging is unaffected while everyone else is locked out.
-- ════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- fts_search: called ONLY by the ask-llm / semantic-search Edge Functions,
-- which authenticate with the service role. It takes a household_id and does
-- no membership check of its own, so nothing else should be able to call it.
-- ───────────────────────────────────────────────────────────────
revoke execute on function public.fts_search(uuid, text, int) from public;
revoke execute on function public.fts_search(uuid, text, int) from anon, authenticated;
grant  execute on function public.fts_search(uuid, text, int) to service_role;

-- ───────────────────────────────────────────────────────────────
-- convert_item_to_place: destructive, and called from the app by a signed-in
-- user. It already verifies membership internally (an anon caller fails that
-- check), but it should not be reachable unauthenticated at all.
-- ───────────────────────────────────────────────────────────────
revoke execute on function public.convert_item_to_place(uuid, uuid) from public;
revoke execute on function public.convert_item_to_place(uuid, uuid) from anon;
grant  execute on function public.convert_item_to_place(uuid, uuid) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────
-- edge_ai_errors: service-role-only diagnostics.
-- ───────────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'edge_ai_errors'
  ) then
    execute 'alter table public.edge_ai_errors enable row level security';
    -- No policies: service_role bypasses RLS, everyone else gets nothing.
    execute 'revoke all on table public.edge_ai_errors from anon, authenticated';
  end if;
end$$;
