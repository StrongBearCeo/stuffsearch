/**
 * Unit tests for pan bounds in the full-screen photo viewer.
 *
 * You could zoom but not pan: the pan gesture was composed as
 * `Gesture.Exclusive(doubleTap, pan)`, so panning could not begin until the
 * double-tap recogniser gave up — by which time the drag was over. With pan
 * working, it also needs BOUNDS, or a zoomed photo can be flung off-screen
 * with no way back.
 *
 * The rule: you may drag until the edge of the scaled image reaches the edge
 * of the viewport, and no further. When an axis is smaller than the viewport
 * (a portrait photo on a landscape screen), it stays centred.
 */
import { panBounds, clampPan } from '../zoomPan';

/** A 1000x800 viewport showing a 1000x800 image (the contain-fitted case). */
const VIEW = { width: 1000, height: 800 };

describe('panBounds', () => {
  it('is zero on both axes at scale 1 — nothing to pan', () => {
    expect(panBounds(1000, 800, VIEW.width, VIEW.height, 1)).toEqual({ x: 0, y: 0 });
  });

  it('grows with the zoom factor', () => {
    // At 2x a 1000-wide image is 2000 wide in a 1000 viewport: 1000 of
    // overflow, half of which can move each way.
    expect(panBounds(1000, 800, VIEW.width, VIEW.height, 2)).toEqual({ x: 500, y: 400 });
  });

  it('is zero on an axis that still fits inside the viewport', () => {
    // A 400-wide image at 2x is 800 wide — still inside a 1000 viewport.
    expect(panBounds(400, 800, VIEW.width, VIEW.height, 2)).toEqual({ x: 0, y: 400 });
  });

  it('never returns a negative bound', () => {
    const b = panBounds(100, 100, VIEW.width, VIEW.height, 1.2);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
  });

  it('handles a zero-sized viewport without NaN', () => {
    const b = panBounds(1000, 800, 0, 0, 2);
    expect(Number.isFinite(b.x)).toBe(true);
    expect(Number.isFinite(b.y)).toBe(true);
  });
});

describe('clampPan', () => {
  const at2x = (x: number, y: number) =>
    clampPan(x, y, 1000, 800, VIEW.width, VIEW.height, 2);

  it('leaves a small drag untouched', () => {
    expect(at2x(100, 50)).toEqual({ x: 100, y: 50 });
  });

  it('stops at the edge rather than letting the photo fly away', () => {
    expect(at2x(9999, 9999)).toEqual({ x: 500, y: 400 });
    expect(at2x(-9999, -9999)).toEqual({ x: -500, y: -400 });
  });

  it('clamps each axis independently', () => {
    expect(at2x(9999, 10)).toEqual({ x: 500, y: 10 });
    expect(at2x(10, -9999)).toEqual({ x: 10, y: -400 });
  });

  it('pins to centre at scale 1, so a un-zoomed photo cannot be dragged off', () => {
    expect(clampPan(300, 300, 1000, 800, VIEW.width, VIEW.height, 1)).toEqual({ x: 0, y: 0 });
  });

  it('pins an axis that fits, while allowing the other to move', () => {
    // 400-wide image at 2x = 800 < 1000 viewport → x pinned; y free.
    expect(clampPan(300, 300, 400, 800, VIEW.width, VIEW.height, 2)).toEqual({ x: 0, y: 300 });
  });

  it('is idempotent — re-clamping an already-clamped value changes nothing', () => {
    const once = at2x(9999, -9999);
    expect(at2x(once.x, once.y)).toEqual(once);
  });

  it('survives a degenerate image size without NaN', () => {
    const out = clampPan(50, 50, 0, 0, VIEW.width, VIEW.height, 2);
    expect(Number.isFinite(out.x)).toBe(true);
    expect(Number.isFinite(out.y)).toBe(true);
  });
});
