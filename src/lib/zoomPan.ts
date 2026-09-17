/**
 * Pan bounds for the zoomed photo viewer.
 *
 * Kept here rather than inline in the component because it runs on the UI
 * thread inside a reanimated worklet, where a mistake is invisible and
 * untestable — and because "how far may this drag go?" is exactly the kind of
 * arithmetic that should have tests rather than be eyeballed on a phone.
 *
 * The contract: you may drag until the edge of the SCALED image meets the edge
 * of the viewport. An axis whose scaled size still fits inside the viewport
 * doesn't move at all — it stays centred, so a portrait photo can't be dragged
 * sideways into empty black space.
 *
 * Every function here carries the `'worklet'` directive. Reanimated does NOT
 * automatically workletize an imported function, so calling one of these from
 * a gesture handler without it throws "tried to synchronously call a
 * non-worklet function on the UI thread" — at runtime, on device, only. Under
 * Jest the directive is an inert string literal, so the tests are unaffected.
 */

export interface Offset {
  x: number;
  y: number;
}

/** Guard against NaN from a zero/unknown layout on the first frame. */
function safe(n: number): number {
  'worklet';
  return Number.isFinite(n) ? n : 0;
}

/**
 * How far the image may travel from centre on each axis, in pixels.
 * Zero means "this axis is fully visible — don't move it".
 */
export function panBounds(
  contentWidth: number,
  contentHeight: number,
  viewWidth: number,
  viewHeight: number,
  scale: number,
): Offset {
  'worklet';
  const scaledW = safe(contentWidth * scale);
  const scaledH = safe(contentHeight * scale);
  return {
    x: Math.max(0, (scaledW - safe(viewWidth)) / 2),
    y: Math.max(0, (scaledH - safe(viewHeight)) / 2),
  };
}

/** Clamp a proposed translation to the pannable area. */
export function clampPan(
  x: number,
  y: number,
  contentWidth: number,
  contentHeight: number,
  viewWidth: number,
  viewHeight: number,
  scale: number,
): Offset {
  'worklet';
  const bounds = panBounds(contentWidth, contentHeight, viewWidth, viewHeight, scale);
  return {
    x: Math.min(bounds.x, Math.max(-bounds.x, safe(x))),
    y: Math.min(bounds.y, Math.max(-bounds.y, safe(y))),
  };
}
