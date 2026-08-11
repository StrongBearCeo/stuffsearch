# StuffSearch — Resume Handoff

> **Status: BUILD COMPLETE.** The full app is implemented, typecheck/lint/tests pass, all screens render in the browser, DB migrations are live, and all 4 Edge Functions are deployed. Ready for testing.

## ⚠️ Power settings — revert before normal use
During the overnight build, sleep/hibernate/monitor timeouts on AC power were disabled via `powercfg`. To restore normal behavior:
```
cmd /c "powercfg /change standby-timeout-ac 10 & powercfg /change hibernate-timeout-ac 0 & powercfg /change monitor-timeout-ac 10"
```
(adjust the minute values to your preference; `0` = never)

## ⚠️ Security — rotate before shipping
The OpenAI key and Supabase secret key were pasted in plaintext during setup. **Rotate both before real users.** See README §Security.

## What was built (all done)

### Database (live, applied via Supabase MCP)
- `0001_init.sql` — profiles, households, household_members, places, items, item_history, helper fns, triggers, household-scoped RLS, pgvector + trigram indexes, storage bucket.
- `0002_external_codes.sql` — external_codes (any-symbology binding), `resolve_code()` cross-household RPC.
- `0003_security_hardening.sql` — revoke anon EXECUTE, pin search_path on triggers.
- `0004_semantic_match.sql` — `semantic_match()` pgvector cosine RPC for semantic search.

### App (Expo SDK 51 + expo-router + TS + NativeWind + React Query + Zustand)
- **Core lib** (`src/lib/`): supabase (typed, web+native storage), auth (magic-link + password), household (active scope, roles, invite), scanner (resolveScan state machine), qrcode, codes, speech, llm, i18n (en+vi), storage, offline.
- **Hooks** (`src/hooks/`): useItems, usePlaces, useMembers, useScan, useVoice, useSemanticSearch+useAsk, useExternalCode, useActiveHousehold.
- **Components** (`src/components/`): primitives, ItemCard, PlaceCard, ScanOverlay, VoiceButton, MemberRow, InviteQR, HouseholdSwitcher, BoundCodesList, CreateFromCodeSheet, ExpoImage.
- **Screens** (`app/`): _layout (providers+gate), index, (auth)/welcome+join, (tabs)/home+items+places+scan, item/[id]+new, place/[id]+new, search, ask, print, household/index+new+switch, settings.
- **Edge Functions** (deployed, ACTIVE, verify_jwt=true): enrich-item, product-lookup, semantic-search, ask-llm.
- **Tests**: 40 unit tests (scanner, constants, qrcode, resolveScan) — all passing.
- **README.md**: full setup, env, design rules, security notes.

### Verification (all green)
- `npm run typecheck` — exit 0, no errors.
- `npm run lint` — exit 0, no warnings.
- `npm test` — 40/40 tests pass.
- Browser smoke test (IAB): welcome, join, household/new, search, ask, print, settings all render with correct content.

### Edge Function secrets (set via Supabase Management API)
- `OPENAI_API_KEY` ✅ (live — functions will call OpenAI)
- `PRODUCT_LOOKUP_PROVIDER` = `off` ✅ (OFF by default; set to `upcitemdb` to enable product lookup)
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — auto-injected by Supabase (not settable via API).

## Decisions made overnight (per "decide + document" instruction)
1. **Auth**: magic-link + password (both wired; welcome screen toggles modes).
2. **LLM**: OpenAI live (key set as Supabase secret per user choice).
3. **parseDeepLink bug fix**: WHATWG URL treats custom-scheme first segment as host (e.g. `stuffsearch://item/<tok>` → host=`item`). Fixed to combine host+pathname.
4. **NativeWind v2 vs v3**: scaffold had v3 API calls (`nativewind/preset`, `nativewind/metro`, `jsxImportSource: 'nativewind'`). Fixed all to v2-compatible.
5. **Web rendering**: `output: 'single'` (client-side only) to avoid SSR crashes with SecureStore/AsyncStorage.
6. **React Query generic inference**: added explicit `<T>` on `useQuery` calls + site-level type annotations where inference didn't propagate.

## Known limitations / next steps for testing
- **Auth requires email**: Supabase email auth is enabled. For testing, either disable email confirmation in Supabase settings, or use the password sign-up flow (which also sends a confirmation email).
- **Camera/scan/voice**: native-only features; won't work in web browser. Test on iOS/Android via Expo Go or a dev build.
- **Placeholder icons**: `assets/*.png` are 1×1 dark placeholders. Replace with real app icon/splash before shipping.
- **ivfflat index**: created with `lists=100` and no data yet. Once items have embeddings, run `ANALYZE items` for optimal query planning.

## Git log
```
1e25300 fix: web compatibility + config fixes (smoke-tested in browser)
<prev>  test: unit tests for scanner, constants, qrcode (40 passing)
<prev>  feat(app,functions): all screens + 4 Edge Functions deployed
<prev>  feat(hooks,components): data hooks + UI building blocks
<prev>  feat(lib): core library + migrations applied to live DB
a24aaeb chore: scaffold + migrations
```

---
*Supabase project: `dkbhzfcznwxfumfcaifs` · EAS project: `58fa9a60-853e-4061-805d-f9baf4edeee4`*
