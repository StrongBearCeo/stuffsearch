# StuffSearch

Cross-platform (iOS / iPadOS / Android phone + tablet) household inventory app. Scan app-generated QR codes **or any externally-printed barcode** to assign items to places; search by text, voice, or semantic similarity; ask an LLM *"where did I put the…?"*. Multi-user households with owner/member roles; one user can join multiple households. Bilingual English + Vietnamese from day one.

## Stack
- **App:** Expo SDK 54 (RN 0.81, React 19) + expo-router + TypeScript + NativeWind + React Query + Zustand
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
| `0005_household_owner_read.sql` | let a household's owner read the row they own (create-household read-back window) |
| `0006_convert_item_to_place.sql` | `convert_item_to_place()` atomic RPC |
| `0007_tags_value_links_search.sql` | `tags` on items + places, `estimated_value`/`value_currency`/`value_source`, `product_links[]`, and the `fts_search()` token-relevance RPC |
| `0008_function_grants.sql` | revoke EXECUTE from PUBLIC (not just `anon` — `anon` inherits PUBLIC's default grant) on `fts_search` and `convert_item_to_place`; enable RLS on the `edge_ai_errors` diagnostics table |

### Key design rules
- **Household-scoped everything.** All rows carry `household_id`; RLS enforces membership.
- **Codes are optional and plural.** A new item or place is created with **no code at all**. From its own screen you can *Generate app code* (a random deep-linkable `qr_token`) and/or *Scan to add a code* — as many external codes as you like, in any symbology. Nothing requires a code to exist.
- **Two identifier types:** app-generated `qr_token` (random, deep-linkable) AND/OR `external_codes` rows (any symbology, raw payload, `UNIQUE` per household).
- **`resolveScan(payload)`** routes deep-links and raw codes across all the user's households.
- **App-printed codes are always random tokens** (never custom content). External codes are read-only bindings.
- **Every create/edit/move records the actor** (`created_by`, `last_moved_by`, `moved_by`).

## Edge Functions

All deployed with `verify_jwt = true` (caller must be signed in):

| Function | Purpose |
|---|---|
| `enrich-item` | **photos** + barcode + text → name / category / description / product links / tags / estimated value (GPT-4o-mini vision). Photos are always sent, so an item with only a picture still gets filled in. Existing links are passed in as context and never replaced; every suggested link is HTTP-checked server-side, and dead ones come back in `rejected_links` instead of being shown as working |
| `product-lookup` | EAN/UPC → Open Food Facts or UPCitemdb (gated by `PRODUCT_LOOKUP_PROVIDER`) |
| `semantic-search` | embed query → pgvector cosine match within household |
| `ask-llm` | NL question → retrieve items → chat model answers with location |

## Households, invites, external codes, printing

- **Create / join:** First launch → create a household OR scan/paste an invite code. Owner generates an invite via the household screen (QR + deep-link `stuffsearch://invite/<token>`).
- **Roles:** Owner (invite, remove members, delete household/items) and Member (add/edit/move items & places, scan-to-assign).
- **Switching:** A user can belong to several households; the on-screen switcher swaps the active scope.
- **External codes:** Scan any barcode → bind it to an item or place. EAN/UPC codes trigger an optional product lookup. Codes are unique per household; on cross-household match you get a "switch & open?" prompt.
- **Printing:** The Print screen renders PDF sheets of app-generated QR codes for items/places that **have** one (AirPrint / share) — give something a code from its own screen first. External codes are never reprinted.
- **Preprinted labels:** `npm run labels` generates cut-apart sheets of blank `SS-XXXXXXXX` QR labels (`dist/labels/stuffsearch-labels-{a4,letter}.pdf`, ~154 A4 labels/page) you can print on a laser printer and stick on anything before it exists in the app. Stick → scan → the unknown-code sheet offers "create with this code" (or attach from an item/place detail screen). Printed values are tracked in `dist/labels/printed-values.json` so batches never repeat. Regenerate with `--pages N --module 0.6` etc.; verify sheets with `scripts/verify-label-pdfs.py`.

## Tags, value, links, photos

- **Tags** (`items.tags`, `places.tags` — `text[]` + GIN) are free-form lowercase labels: `return`, `fragile`, `winter`. Tap a chip on the Items or Places tab to filter (multiple chips = AND). Normalization lives in `src/lib/tags.ts`; the form offers tags already used in the household as one-tap suggestions.
- **Value.** Each item can carry an `estimated_value` + `value_currency`. ✨ *Identify from photo* asks the model for one; you can overwrite it, which flips `value_source` to `manual` and permanently protects it from later enrichment. The Items tab totals the visible items per currency (`src/lib/value.ts`), and a place shows the total value of its contents.
- **Links.** An item holds a *list* of product links (`product_links text[]`, with `product_link` mirrored as the first entry for older clients). Enrichment appends, never replaces (`src/lib/enrich.ts`). Long URLs wrap over multiple lines rather than being truncated.
- **Photos.** Tap any item or place photo to open the full-screen viewer — pinch, double-tap or drag to zoom, swipe between an item's photos.

## Search relevance

Search is **token-scored**, not substring-matched. The old query sent one
`name.ilike '%<whole query>%'` to Postgres, so "Husky tile cutter" found nothing
while "tile cutter" worked. Now:

- **In the app** (`src/lib/search.ts`): the household's items/places are already
  cached, so `rankBySearch` scores each one per query token — name hits weigh
  more than description hits, a plural/singular difference still matches, and
  results come back ranked, best first. Anything matching at least one token is
  shown.
- **On the server** (`fts_search()` in migration 0007): the same idea in SQL,
  used by `ask-llm` and as `semantic-search`'s fallback. It replaces a fallback
  that listed "items that have an embedding" — which is nothing at all, since
  `items.embedding` is never populated, and was why the assistant answered
  "couldn't find it" for items that plainly existed.
- **The Ask prompt** now tells the model the list is *ranked, not exact*, so a
  question about a "Husky tile cutter" is answered from the "Tile cutter" entry
  with a note that the recorded name differs, instead of "I couldn't find it".

> **Embeddings are effectively off.** `items.embedding` is never written by any
> code path, and the configured `OPENAI_BASE_URL` rejects
> `text-embedding-3-small` (`400 Invalid model name`). Both `ask-llm` and
> `semantic-search` now treat an embedding failure as non-fatal and fall
> through to `fts_search`, so search works regardless. To switch vector search
> on you'd need to set `OPENAI_EMBEDDING_MODEL` to a model your endpoint
> actually serves *and* add a backfill that populates `items.embedding`.

## Scanning
- The Scan tab uses `expo-camera`'s `CameraView` with barcode scanning enabled, and is a pure resolver: a matched code opens the item/place; an unknown code offers to create one.
- **Scan to set location:** from an item's detail screen, a scan button opens the camera; scanning a place's code sets that item's location (writes an `item_history` row via `useMoveItem`).
- **Scan to add:** from a place's detail screen, a scan button opens the camera; scanning an item moves it into this place, scanning a place reparents it in here (places nest via `parent_place_id`; cycles are guarded by `wouldCreateCycle`), and an unknown code opens the new-item form with the place prefilled.
- **Scan to add a code:** from either detail screen, attach another code to the thing you're looking at. `classifyScanForBinding` (`src/lib/bindCode.ts`) reports whether the code is free, already on this entity, already someone else's, or an app QR that needs no binding.
- **Errors stay on the camera.** Anything a scan can't do — a cycle, a foreign household, an already-bound code — is drawn over the live preview and the scanner **re-arms** so the next scan is accepted. The old one-shot `scanned` flag latched on the first scan and was only cleared by re-opening the modal, so a rejected scan looked exactly like the camera having stopped working. The gate is `createScanGate` in `src/lib/scanGate.ts`.
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
npm test         # jest — pure-logic unit tests (src/lib/__tests__, plugins/__tests__)
npm run labels   # regenerate preprinted label PDFs (needs python + reportlab)
```

## Deploying to a phone
Standalone builds that run without a Metro / Expo dev server, and without a paid
Apple or Google developer account: see **[DEPLOY.md](DEPLOY.md)**.

```powershell
cd android; .\gradlew.bat assembleRelease   # -> app/build/outputs/apk/release/
.\scripts\install-android.ps1                # install over USB or Wi-Fi
```

iOS needs a Mac — `./scripts/mac-ios-build.sh sim` for a never-expiring Simulator
build, or `device` for a real iPhone (Apple expires free-signed apps after 7 days).

## Testing
Unit tests are required for any logic added or changed. Pure logic lives in
`src/lib/` as importable functions (not inlined in components) and is covered by
`src/lib/__tests__/*.test.ts`. See `AGENTS.md` for the full convention.

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
  components/        # primitives, ItemCard, PlaceCard, ScanOverlay, ScanCameraModal, VoiceButton, MemberRow, InviteQR, HouseholdSwitcher, BoundCodesList, CreateFromCodeSheet
  theme/             # color tokens, spacing, breakpoints
  locales/           # en.json, vi.json
supabase/
  migrations/        # 0001–0004
  functions/         # enrich-item, product-lookup, semantic-search, ask-llm (+ _shared/cors.ts)
```

## Out of scope (first build)
Per-item privacy within a household; push notifications/reminders; web admin dashboard; spreadsheet import; reprinting external codes.
