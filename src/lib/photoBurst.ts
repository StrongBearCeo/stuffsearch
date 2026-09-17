/**
 * Burst-capture session helpers — the state behind "take several photos at
 * once" without leaving the camera.
 *
 * `ImagePicker.launchCameraAsync` returns after a single shot, so adding six
 * photos of a box meant six trips through the source prompt, the camera and the
 * upload, while picking six from the library was one gesture. The capture modal
 * keeps the camera open and collects LOCAL shot uris here; they become storage
 * urls only when the user confirms, so a cancelled session uploads nothing.
 *
 * Kept separate from `photos.ts` on purpose: that module is about the saved
 * list of storage urls on a row, this one is about a session that may never be
 * saved at all.
 */

/**
 * How many shots one session may hold. A cap exists because every shot is a
 * full-resolution upload on the user's data plan when they confirm, and a
 * pocketed phone with the shutter under a thumb can otherwise run for a while.
 * Twelve is well past the "every side of a box plus its label" case that
 * motivated the burst.
 */
export const MAX_BURST_SHOTS = 12;

/**
 * Append a freshly taken shot. Blank/duplicate uris and anything past the cap
 * are ignored rather than throwing — the shutter handler has nothing useful to
 * do with an error, and `takePictureAsync` can resolve to undefined when the
 * native session is torn down mid-capture.
 */
export function addShot(
  shots: string[],
  uri: string | null | undefined,
  limit: number = MAX_BURST_SHOTS,
): string[] {
  const clean = (uri ?? '').trim();
  if (!clean || shots.includes(clean) || shots.length >= limit) return [...shots];
  return [...shots, clean];
}

/** Drop the most recent shot — the blurry one the user just saw in the strip. */
export function undoLastShot(shots: string[]): string[] {
  if (shots.length === 0) return [];
  return shots.slice(0, -1);
}

export interface BurstInput {
  shots: string[];
  /** True while a shot is being taken or the session is being uploaded. */
  busy?: boolean;
  limit?: number;
}

export interface BurstControls {
  count: number;
  /** Shots still allowed before the cap. Never negative. */
  remaining: number;
  full: boolean;
  canCapture: boolean;
  canUndo: boolean;
  canConfirm: boolean;
}

/**
 * Everything the capture modal needs to render its controls. Derived in one
 * place so the shutter, the undo and the done button can't disagree about
 * whether a capture is in flight.
 */
export function burstControls({ shots, busy = false, limit = MAX_BURST_SHOTS }: BurstInput): BurstControls {
  const count = shots.length;
  const remaining = Math.max(0, limit - count);
  const full = remaining === 0;
  return {
    count,
    remaining,
    full,
    canCapture: !busy && !full,
    canUndo: !busy && count > 0,
    canConfirm: !busy && count > 0,
  };
}

/**
 * Split settled uploads into the urls that made it and a count of those that
 * didn't. A burst uploads several files, and one failure must not discard the
 * other five: the caller attaches what arrived and reports the shortfall.
 */
export function partitionUploads(results: PromiseSettledResult<string>[]): {
  urls: string[];
  failed: number;
} {
  const urls: string[] = [];
  let failed = 0;
  for (const result of results) {
    if (result.status !== 'fulfilled') {
      failed++;
      continue;
    }
    const url = (result.value ?? '').trim();
    // A blank url is a successful upload of nothing — not worth a failure
    // notice, but never worth storing either.
    if (url) urls.push(url);
  }
  return { urls, failed };
}
