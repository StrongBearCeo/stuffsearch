# StuffSearch — Resume Handoff

> **For the next session:** read this file first, then `.zcode/plans/plan-sess_aeab8e91-a336-4817-89c9-9037d4b1c7bb.md` for the full spec. Continue implementation from "Next up" below with incremental git commits.

## Project location
`C:\Users\hv\projects\stuffsearch` (Windows path). Open this folder in ZCode.

## What this is
Cross-platform (iOS/iPadOS/Android) household inventory app. Scan app-generated QR codes *or* any external barcode to assign items to places; search by text/voice/semantic; ask an LLM "where did I put the...?". Multi-user households with owner/member roles; one user can join multiple households. Bilingual EN + VI from day one.

**Stack:** Expo SDK 51 + expo-router + TypeScript + NativeWind + React Query + Zustand. **Backend:** Supabase (Postgres + Auth + Storage + pgvector) + Edge Functions. **LLM:** OpenAI (key in Supabase secrets, never in app).

## Credentials (already configured — DO NOT commit)
- `.env` (gitignored) has: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (publishable), `EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET`, plus server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secret key `sb_secret_...`), `OPENAI_API_KEY`, `PRODUCT_LOOKUP_PROVIDER=off`.
- `.zcode/config.json` (gitignored) registers the **Supabase MCP server** with access token `sbp_...` and project `dkbhzfcznwxfumfcaifs`.
- ⚠️ **SECURITY:** the OpenAI key and Supabase secret key were pasted in plaintext chat during setup. **Rotate both before shipping.** Reminder also in README.

## Supabase MCP — use it for infra
The MCP server is registered and **now connects cleanly** (verified green in Settings → MCP). It needed two fixes (both already applied to `.zcode/config.json`, which is gitignored):
1. **Corrupted npx cache** — `_npx` had a broken `zod` (`zod/v4/core/index.js` missing). Cleared `C:\Users\hv\AppData\Local\npm-cache\_npx`; clean reinstall fixed it.
2. **Stale CLI flag** — `@supabase/mcp-server-supabase@latest` (v0.10.0) made `--read-only` a boolean; `--read-only=false` threw `ERR_PARSE_ARGS_INVALID_OPTION_VALUE`. **Removed the arg entirely** — the server defaults to read-write, which is what we need.

If it breaks again: run the server command directly in a terminal to read the real stderr (the status line only says "Connection closed"):
```
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0.0.0"}}}' \
| SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_ID=... npx -y @supabase/mcp-server-supabase@latest
```

Use its tools to:
1. Apply migrations in `supabase/migrations/` — `0001_init.sql` and `0002_external_codes.sql` are **written and committed but NOT YET applied** to the live DB.
2. Set Edge Function secrets: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRODUCT_LOOKUP_PROVIDER`.
3. Deploy the 4 Edge Functions once written: `enrich-item`, `product-lookup`, `semantic-search`, `ask-llm`.

## Progress so far

### ✅ Done
- **Scaffold:** `package.json`, `app.config.ts` (deep-link scheme `stuffsearch://`, iOS/Android perms, plugins, **EAS projectId `58fa9a60-853e-4061-805d-f9baf4edeee4` hardcoded — no global eas-cli install needed**), `tsconfig.json` (path aliases `@/*`, `@app/*`), `babel.config.js`, `metro.config.js`, `tailwind.config.js` + `global.css`, `expo-env.d.ts`, `.eslintrc.js`, `eas.json`, `.gitignore`, `.env`, `.env.example`.
- **Supabase CLI config:** `supabase/config.toml` (linked to `dkbhzfcznwxfumfcaifs`, all 4 functions declared with `verify_jwt=true`).
- **Migration `0001_init.sql`:** profiles, households, household_members (PK household+user, role enum), places (parent_place_id, qr_token), items (photo_urls[], embedding vector(1536), metadata jsonb, current_place_id/since, created_by, last_moved_by), item_history (audit), helper fns `is_household_member`/`is_household_owner`, `handle_new_user` trigger, `touch_updated_at`/`touch_current_place_since` triggers, household-scoped RLS on every table, pgvector ivfflat index, trigram indexes on names, storage bucket `stuffsearch` + policies. **Not yet applied to the live DB.**
- **Migration `0002_external_codes.sql`:** `external_codes` (any-symbology binding; `code_type` enum qr/code128/ean13/upc_a/datamatrix/pdf417/aztec/…; `entity_type` item|place), `UNIQUE(household_id, code_value)`, `code_value` index, household-scoped RLS, `SECURITY DEFINER resolve_code(code_value, user_id)` returning rows across ALL the user's households. **Written + committed, not yet applied.**
- **Git:** repo on `main`. Root commit `a24aaeb "chore: scaffold + migrations"` (17 files). `.env` + `.zcode/config.json` confirmed gitignored (secrets NOT committed).
- **Supabase MCP:** connected (green) after fixing corrupted npx cache + removing stale `--read-only=false` flag.

### 🔲 Next up (in order)
1. ~~Write `0002_external_codes.sql`~~ ✅ done.
2. ~~Commit scaffold + both migrations~~ ✅ done (`a24aaeb`).
3. **Apply migrations to live DB** via Supabase MCP — `list_tables` first to confirm DB is empty, then apply `0001` then `0002`. ⚠️ **Session must be restarted** so `mcp__supabase__*` tools register into the model; the server is green client-side but tools weren't in this session's tool list.
4. **Set Edge Function secrets** via MCP.
5. **Core lib** (`src/lib/`): `supabase.ts` (client from env, generated types stub), `auth.tsx` (AuthProvider/session), `household.tsx` (active household, switcher, roles), `scanner.ts` (`resolveScan(payload)` state machine + deep-link router), `qrcode.ts` (app-QR gen + print), `codes.ts` (external code binding + product-barcode lookup helpers), `speech.ts` (on-device STT via `@jamsch/expo-speech-recognition`), `llm.ts` (Edge Function calls), `i18n.ts` (i18next en+vi), `offline.ts` (React Query persist + conflict). Commit.
6. **Hooks** (`src/hooks/`): `useItems`, `usePlaces`, `useMembers`, `useScan`, `useVoice`, `useSemanticSearch`, `useActiveHousehold`, `useExternalCode`. Commit.
7. **Components** (`src/components/`): `ItemCard`, `PlaceCard`, `ScanOverlay`, `VoiceButton`, `MemberRow`, `InviteQR`, `HouseholdSwitcher`, `BoundCodesList`, `CreateFromCodeSheet`. Commit.
8. **App screens** (`app/`): `(auth)/welcome.tsx`, `(auth)/join.tsx`; `(tabs)/index.tsx`, `items.tsx`, `places.tsx`, `scan.tsx`; `item/[id].tsx`, `item/new.tsx`; `place/[id].tsx`, `place/new.tsx`; `search.tsx`, `ask.tsx`, `print.tsx`; `household/index.tsx`, `new.tsx`, `switch.tsx`; `settings.tsx`. Commit per logical group.
9. **Edge Functions** (`supabase/functions/`): `enrich-item` (barcode+photo→name/category/desc/product_link via vision), `product-lookup` (EAN/UPC→Open Food Facts/UPCitemdb), `semantic-search` (embed→pgvector cosine match within household), `ask-llm` (NL Q&A over inventory → location). Deploy via MCP. Commit.
10. **i18n + theme + store:** `src/locales/en.json`, `vi.json`; `src/theme/` (NativeWind config, phone+tablet breakpoints); `src/store/` (Zustand: UI state, "active place" for scan-to-assign). Commit.
11. **README.md** — setup, env, household, invite, external codes, print, scan, **rotation reminder**. Commit.
12. **Verify:** `npm install`, `npm run typecheck`, `npm run lint`. Fix issues. Final commit.

## Plan reference (milestones, from plan §"Implementation milestones")
Scaffold → Auth+households → Schema+migrations → Core CRUD → Code binding+product lookup → QR system → Scanner → Search → Voice → LLM → Polish (offline, tablet, settings, EN/VI pass).

## Key design rules (don't drift)
- **Household-scoped everything.** All rows carry `household_id`; RLS enforces membership. No per-user/per-item privacy within a household (explicitly out of scope).
- **Two identifier types:** app-generated `qr_token` (random, deep-linkable, in `stuffsearch://<type>/<token>?h=<short>`) AND/OR `external_codes` rows (any symbology, raw payload, `UNIQUE` per household). One entity may carry multiple external codes.
- **`resolveScan(payload)`** routes: deep-link → open/join; else raw code → query across all user's households → match-in-active=open/assign, match-elsewhere=switch prompt, no-match=offer create-with-code-bound. Scan-to-assign sets `current_place_id` to the app's active place + writes `item_history` with `moved_by`.
- **App-printed codes are always auto-generated random tokens** (never custom content). External codes are read-only bindings, never reprinted.
- **LLM keys live in Supabase secrets**, never in the app bundle or git.
- **Every create/edit/move records actor** (`created_by`, `last_moved_by`, `moved_by`).

## Out of scope (per plan)
Per-item privacy within household; push notifications/reminders; web admin dashboard; spreadsheet import; reprinting external codes.

---
*Created as a handoff. The full spec lives in `.zcode/plans/plan-sess_aeab8e91-a336-4817-89c9-9037d4b1c7bb.md`.*
