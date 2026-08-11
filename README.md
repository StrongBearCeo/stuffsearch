# StuffSearch

Cross-platform (iOS / iPadOS / Android phone + tablet) household inventory app. Scan app-generated QR codes **or any externally-printed barcode** to assign items to places; search by text, voice, or semantic similarity; ask an LLM *"where did I put the…?"*. Multi-user households with owner/member roles; one user can join multiple households. Bilingual English + Vietnamese from day one.

## Stack
- **App:** Expo SDK 51 + expo-router + TypeScript + NativeWind + React Query + Zustand
- **Backend:** Supabase (Postgres + Auth + Storage + pgvector) + Edge Functions (Deno)
- **LLM:** OpenAI (gpt-4o-mini + text-embedding-3-small). Key lives in Supabase secrets, never in the app.

## Quick start

```bash
# 1. Install deps (legacy-peer-deps is pinned via .npmrc for SDK 51 + React 18.2)
npm install

# 2. Configure env
cp .env.example .env
#   fill in EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET

# 3. Run
npm start          # expo start
#   press i (iOS), a (Android), or w (web)
```

### Environment variables (`.env` — gitignored, never committed)

| Variable | Scope | Purpose |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | client | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | client | Supabase publishable/anon key |
| `EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET` | client | Storage bucket name (`stuffsearch`) |
| `OPENAI_API_KEY` | server (Supabase secret) | LLM + embeddings |
| `PRODUCT_LOOKUP_PROVIDER` | server (Supabase secret) | `off` \| `upcitemdb` |

**Server-only secrets** (`OPENAI_API_KEY`, `PRODUCT_LOOKUP_PROVIDER`) are set via the Supabase Management API or CLI — never in the app bundle. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into every Edge Function by Supabase.

## Database

Migrations live in `supabase/migrations/` and are applied to the live project via the Supabase MCP:

| File | What |
|---|---|
| `0001_init.sql` | profiles, households, household_members, places, items, item_history, pgvector + trigram indexes, household-scoped RLS, storage bucket |
| `0002_external_codes.sql` | external_codes table (any-symbology binding), `resolve_code()` cross-household lookup RPC |
| `0003_security_hardening.sql` | revoke anon EXECUTE on SECURITY DEFINER helpers, pin `search_path` on triggers |
| `0004_semantic_match.sql` | `semantic_match()` pgvector cosine similarity RPC for the search Edge Function |

### Key design rules
- **Household-scoped everything.** All rows carry `household_id`; RLS enforces membership.
- **Two identifier types:** app-generated `qr_token` (random, deep-linkable) AND/OR `external_codes` rows (any symbology, raw payload, `UNIQUE` per household).
- **`resolveScan(payload)`** routes deep-links and raw codes across all the user's households.
- **App-printed codes are always random tokens** (never custom content). External codes are read-only bindings.
- **Every create/edit/move records the actor** (`created_by`, `last_moved_by`, `moved_by`).

## Edge Functions

All deployed with `verify_jwt = true` (caller must be signed in):

| Function | Purpose |
|---|---|
| `enrich-item` | barcode + photo → suggested name/category/description/product_link (GPT-4o-mini vision) |
| `product-lookup` | EAN/UPC → Open Food Facts or UPCitemdb (gated by `PRODUCT_LOOKUP_PROVIDER`) |
| `semantic-search` | embed query → pgvector cosine match within household |
| `ask-llm` | NL question → retrieve items → chat model answers with location |

## Households, invites, external codes, printing

- **Create / join:** First launch → create a household OR scan/paste an invite code. Owner generates an invite via the household screen (QR + deep-link `stuffsearch://invite/<token>`).
- **Roles:** Owner (invite, remove members, delete household/items) and Member (add/edit/move items & places, scan-to-assign).
- **Switching:** A user can belong to several households; the on-screen switcher swaps the active scope.
- **External codes:** Scan any barcode → bind it to an item or place. EAN/UPC codes trigger an optional product lookup. Codes are unique per household; on cross-household match you get a "switch & open?" prompt.
- **Printing:** The Print screen renders PDF sheets of app-generated QR codes for items/places that don't yet have one (AirPrint / share). External codes are never reprinted.

## Scanning
- The Scan tab uses `expo-camera`'s `CameraView` with barcode scanning enabled.
- **Scan-to-assign:** set an "active place" (from a place detail screen), then scanning an item's code moves it there and writes an `item_history` row.
- Manual code entry is available without a camera.

## Voice
On-device STT via `@jamsch/expo-speech-recognition` (iOS SFSpeechRecognizer + Android SpeechRecognizer), with solid `en-US` / `vi-VN` support. Pluggable to cloud (Whisper) later.

## i18n
English + Vietnamese (`src/locales/en.json`, `vi.json`) via `i18next` + `react-i18next`. Device locale auto-detected; user can override in Settings. LLM system prompts are localized too.

## Scripts
```bash
npm start        # expo start
npm run typecheck   # tsc --noEmit
npm run lint     # eslint .
```

## ⚠️ Security — rotate before shipping
The OpenAI API key and Supabase secret key were pasted in plaintext during initial setup. **Rotate both before this app sees real users:**
1. OpenAI: dashboard → API keys → revoke + create new → `supabase secrets set OPENAI_API_KEY=...`
2. Supabase: Project Settings → API → rotate service role key → update `.env` + redeploy functions.

## Project structure
```
app/                 # expo-router screens (auth, tabs, item, place, search, ask, print, household, settings)
src/
  lib/               # supabase client, auth, household, scanner, qrcode, codes, speech, llm, i18n, storage, offline
  hooks/             # useItems, usePlaces, useMembers, useScan, useVoice, useSemanticSearch, useExternalCode, useActiveHousehold
  components/        # primitives, ItemCard, PlaceCard, ScanOverlay, VoiceButton, MemberRow, InviteQR, HouseholdSwitcher, BoundCodesList, CreateFromCodeSheet
  store/             # Zustand UI store (active place)
  theme/             # color tokens, spacing, breakpoints
  locales/           # en.json, vi.json
supabase/
  migrations/        # 0001–0004
  functions/         # enrich-item, product-lookup, semantic-search, ask-llm (+ _shared/cors.ts)
```

## Out of scope (first build)
Per-item privacy within a household; push notifications/reminders; web admin dashboard; spreadsheet import; reprinting external codes.
