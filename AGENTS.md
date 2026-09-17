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
- **Two Jest projects, split by what a test needs.** `*.test.ts` runs in the
  `logic` project: node environment, react-native stubbed, pure functions from
  `src/lib` — fast, and where most tests belong. `*.test.tsx` runs in the
  `components` project: jest-expo + React Native Testing Library, for anything
  that has to RENDER. Reach for the second when the behaviour is about
  component state or framework wiring rather than a calculation — three shipped
  bugs (a scanner that latched after one scan, a pan gesture that never began,
  a filter chip whose dismissal outlived its screen) were all invisible to the
  logic project while its own tests stayed green.
  Note RTL v14's `render`, `rerender` and `fireEvent` are ASYNC; forgetting to
  await one yields "getByTestId is not a function".
- **A regression test must be shown to fail.** Reintroduce the bug, watch the
  new test go red, then restore the fix. A regression test that has never
  failed is a guess.
- **Run both gates before finishing, and report results honestly:**
  ```bash
  npx tsc --noEmit   # must pass with zero errors
  npx jest           # must pass; never skip to make it green
  ```
- **If something genuinely can't be unit-tested** — a real camera, a real
  multi-touch gesture — say so explicitly rather than skipping in silence, and
  prefer extracting the testable core into `src/lib/` (or a hook with a
  `*.test.tsx`) anyway. "Needs device testing" is now a much smaller category
  than it was: a hook reading route params, a component reacting to props, a
  reducer over navigation state are all reachable by the `components` project.
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
  `wouldCreateCycle` from `src/lib/places.ts` before reparenting, and
  `buildPlaceTree` / `flattenPlaceTree` from `src/lib/placeTree.ts` to render
  the hierarchy.
- **A thing can be BOTH an item and a place.** `places.item_id` points at the
  `items` row a place is the storage facet of (a labelled toolbox is a thing
  worth money AND a container). `convert_item_to_place` is therefore NOT
  destructive any more — it adds the facet and leaves the item, its value,
  links, category and codes intact — and it is idempotent. The ITEM is the
  single source of truth: a database trigger (`sync_place_from_item`) mirrors
  name / description / tags / photos / location onto the facet, so edit the
  item, never the linked place. Deleting the item cascades the facet away.
- **An item can be in several places at once.** `items.current_place_id` is the
  PRIMARY location and still drives history, search and the location card;
  extra locations are `item_placements` rows carrying their own `quantity`.
  `items.quantity` is the total (ten pencils = one row with quantity 10). All
  the arithmetic lives in `src/lib/quantity.ts` — don't re-derive it in a
  component. `usePlaceContents` returns the UNION of both sources.
- **Places carry a photo ARRAY** (`places.photo_urls`), with the legacy
  `photo_url` scalar mirrored from element 0. Read through `placePhotos` and
  write through `placePhotoColumns` (`src/lib/photos.ts`); never set one column
  without the other.
- **Creating a row uses a client-generated id** (`newUuid` in `src/lib/ids.ts`)
  plus `createSubmitGuard` (`src/lib/submit.ts`). Together they make a save
  idempotent: a double tap is dropped synchronously, and a network retry
  re-sends the same primary key instead of inserting a second row.
- **`external_codes` are garbage-collected by trigger.** The column is
  polymorphic so no FK ever cleaned it up; a deleted item left its label bound
  to a dead row and re-binding it raised 23505. Triggers on `items`/`places`
  now sweep them. Surface a genuine collision with `isDuplicateCodeError`
  (`src/lib/errors.ts`), never the raw constraint name.
- **There is no `items.category`.** It duplicated tags while being worse at the
  job — one unnormalised free-text value, no filter UI — and an AI-filled field
  with no normalisation produced `tool` AND `tools`, `cable` AND `cables`.
  Migration 0011 folded every category into `tags` and dropped the column. Use
  tags; don't reintroduce a second labelling axis.
- **The camera is a burst, the picker is a picker.** `launchCameraAsync`
  returns after ONE shot, so adding six photos of a box was six trips through
  the source prompt, the camera, the upload and the form. The library picker
  has always been multi-select; the camera is the side that needed fixing.
  `PhotoCaptureModal` keeps the native camera open and collects LOCAL
  uris (`src/lib/photoBurst.ts`); `usePhotoPicker.uploadLocal` uploads them on
  Done. Nothing is uploaded by a cancelled session, and uploads are settled
  individually (`partitionUploads`) so one failed file doesn't discard the
  rest. Mount the CameraView only while visible and key it per open — same
  black-preview lesson as `ScanCameraModal`.
- **Photo rotation re-encodes the image** (`usePhotoRotate`), it is not a
  display-time transform. An orientation column would have to be threaded
  through every list, card, print sheet and AI upload, and anything that missed
  it would show the photo the wrong way up.
- **A bottom sheet inside a `Modal` must lift itself above the keyboard.**
  Android ignores `adjustResize` inside a Modal window and `KeyboardAvoidingView`
  is a no-op there, so the keyboard covers the very field it just focused. Pad
  with `keyboardSpacerHeight(useKeyboardHeight(), insets.bottom)` — see the scan
  tab's manual entry and `CreatePlaceSheet`.
- **Gesture composition: `Exclusive` delays, `Simultaneous` doesn't.** Pan was
  composed as `Exclusive(doubleTap, pan)`, so a drag could not start until the
  tap recogniser timed out — which read as "zoom works, pan doesn't". A Tap
  cancels itself once the finger moves, so the three can simply run together.
  Arithmetic that runs inside a worklet (e.g. `clampPan`) needs an explicit
  `'worklet'` directive: reanimated does NOT workletize imported functions.
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
  The per-field ✨ buttons go through `applyFieldEnrichment`, which touches
  exactly one field. Its ONE deliberate exception: asking for `value`
  explicitly DOES overwrite a manual value — that request is the user asking
  for a fresh estimate, and it's what makes re-valuing an existing item
  possible at all.
- **`enrich-item` is not photo-only.** It is sent the name, description,
  category, tags and barcode as well as the photos, plus an optional free-text
  `instruction` from the user that outranks its own reading of the images.
  `field` narrows the ANSWER to one key; `entity: 'place'` switches it to
  describing a storage location (no product links, no resale value).
- **A scanned payload is sanitised at the camera boundary**, by
  `sanitizeScanPayload` (`src/lib/scanPayload.ts`), before anything else sees
  it. A barcode carries arbitrary bytes: a misread or a binary Data Matrix
  returns control characters, and a NUL survives into the JSON body
  supabase-js sends, where Postgres rejects the whole request with
  `unsupported Unicode escape sequence (22P05)` — failing the entire save, not
  just the code. Sanitising is idempotent and deterministic (so a re-scan of
  the same label still matches) and is applied again in `resolveScan` and
  `bindExternalCode` as defence in depth. Never pass a raw `e.data` onwards.
- **A scan that fails must stay on the camera.** Report it via `ScanCameraModal`'s
  `notice` prop, which draws over the live preview and re-arms `createScanGate`.
  Never surface a scan error only in a card behind the modal — the user can't see
  it, and the scanner stays latched.
- **React Query cache: a mutation must invalidate every view it affects.**
  Moving an item changes both its old and new place's contents, so
  `useMoveItem` invalidates `['items']`, `['items', itemId]`, and the whole
  `['place_contents']` family (the old place id isn't known at the call site).
  Reparenting a place (`useUpdatePlace`) likewise invalidates
  `['place_children']` and `['place_contents']`. Placement mutations also
  invalidate `['place_placements']`, and anything that can create or change a
  facet invalidates `['place_for_item', itemId]`. When adding a new
  place-scoped query, audit every item/place mutation's `onSuccess` for the
  keys it must refresh.
- **Lists use `isRefetching`, not `isFetching`, for pull-to-refresh.** Every
  background refetch flips `isFetching`, which re-mounts the RefreshControl
  mid-scroll and makes the list jump; memoize `renderItem`, `keyExtractor` and
  any lookup Map for the same reason.
- **Gestures inside a React Native `Modal` need their own
  `GestureHandlerRootView`.** The app-level one does not reach into the modal's
  separate native view hierarchy — that is why pinch/double-tap zoom in
  `PhotoViewer` silently did nothing.
- **Forward every prop you destructure off a component's props.** `Input`
  pulled `multiline` out for styling and never passed it on, so every
  "multiline" field in the app was really single-line: the description box
  looked tall but never wrapped.
