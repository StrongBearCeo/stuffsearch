# AGENTS.md — conventions for AI agents (and humans) working in this repo

These are the standing rules for any code-changing work in StuffSearch.
Read before editing; follow unless the task explicitly says otherwise.

## Testing

**Unit tests are required, not optional.** Any logic you add or change must be
covered by tests before the work is considered done.

- **Pure logic lives in `src/lib/`** as plain, importable functions — not
  inlined inside React components. If it has branches, conditions, mappings, or
  a state machine, it belongs in a `src/lib/*.ts` module so it can be tested in
  isolation. Components call these helpers; they don't contain the logic.
- **Add a `src/lib/__tests__/*.test.ts`** for every new logic module. Follow the
  style of the existing tests (`constants.test.ts`, `qrcode.test.ts`,
  `resolveScan.test.ts`, `places.test.ts`): node environment, supabase/RN
  stubbed, exercise every branch including error + edge cases.
- **Run both gates before finishing, and report results honestly:**
  ```bash
  npx tsc --noEmit   # must pass with zero errors
  npx jest           # must pass; never skip to make it green
  ```
- **If something can't be unit-tested** under the current node-only Jest config
  (UI wiring, hooks that call React Query / expo-router / RN primitives), say so
  explicitly — don't silently skip it. Call it out as "needs device/manual
  testing" and prefer extracting the testable core into `src/lib/` anyway.
- **Locale files are tested.** `src/lib/__tests__/locales.test.ts` asserts en and
  vi define identical key sets, that no value is empty, and that the `{{count}}`
  strings pluralize under `compatibilityJSON: 'v3'`. Adding a key to one file
  only will fail the suite.
- **SQL is not covered by Jest.** RPCs in `supabase/migrations/` (e.g.
  `fts_search`) need to be exercised against a real database — say so rather
  than implying they're tested.

## Code style

- TypeScript everywhere; no `any` without a comment explaining why.
- Match the surrounding code's naming, density, and idioms.
- i18n is mandatory for any user-facing string: add the key to **both**
  `src/locales/en.json` and `src/locales/vi.json`. Remove keys that are no longer
  referenced.
- Keep screens thin: data via hooks (`src/hooks/`), logic via `src/lib/`,
  presentation via `src/components/`.

## Architecture notes

- Household-scoped: all rows carry `household_id`; RLS enforces membership.
- Every create/edit/move records the actor (`created_by`, `last_moved_by`,
  `moved_by`) and writes an `item_history` row where applicable (use
  `useMoveItem`, not a bare `update`, for moving items between places).
- Places are nestable via `parent_place_id` — never create a cycle. Use
  `wouldCreateCycle` from `src/lib/places.ts` before reparenting.
- **Codes are optional.** `useCreateItem` / `useCreatePlace` do NOT mint a
  `qr_token`; a thing may have zero, one, or many codes (`qr_token` plus any
  number of `external_codes` rows). Never assume `qr_token` is set — guard every
  read, and use `useGenerateItemCode` / `useGeneratePlaceCode` to mint one.
- **Search is ranked, not filtered by SQL.** `useItems(q)` / `usePlaces(q)` fetch
  the whole household and rank locally through `rankBySearch` in `src/lib/search.ts`
  (the query key is the household, NOT the search string). Do not reintroduce a
  server-side `ilike '%q%'`: it only matches a contiguous substring, which is what
  made "Husky tile cutter" miss "Tile cutter".
- **Enrichment adds, never clobbers.** Route every AI suggestion through
  `applyEnrichment` (`src/lib/enrich.ts`): user-typed product links are kept and
  new ones appended, and a `value_source = 'manual'` value is never overwritten.
- **A scan that fails must stay on the camera.** Report it via `ScanCameraModal`'s
  `notice` prop, which draws over the live preview and re-arms `createScanGate`.
  Never surface a scan error only in a card behind the modal — the user can't see
  it, and the scanner stays latched.
- **React Query cache: a mutation must invalidate every view it affects.**
  Moving an item changes both its old and new place's contents, so
  `useMoveItem` invalidates `['items']`, `['items', itemId]`, and the whole
  `['place_contents']` family (the old place id isn't known at the call site).
  Reparenting a place (`useUpdatePlace`) likewise invalidates
  `['place_children']` and `['place_contents']`. When adding a new place-scoped
  query, audit every item/place mutation's `onSuccess` for the keys it must
  refresh.
