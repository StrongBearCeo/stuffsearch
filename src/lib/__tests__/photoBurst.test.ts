/**
 * Unit tests for the burst-capture session helpers.
 *
 * The gap these exist for: adding photos from the camera went through
 * `ImagePicker.launchCameraAsync`, which returns after exactly ONE shot. The
 * library source has always been multi-select, so photographing six sides of a
 * box meant six round trips through the source prompt, the camera and the
 * upload — while picking six photos from the roll was a single gesture.
 *
 * A burst session is therefore a list of local shot URIs with a cap, an undo,
 * and a derived set of control states the modal renders from.
 */
import {
  MAX_BURST_SHOTS,
  addShot,
  undoLastShot,
  burstControls,
  partitionUploads,
} from '../photoBurst';

const A = 'file:///cache/shot-a.jpg';
const B = 'file:///cache/shot-b.jpg';
const C = 'file:///cache/shot-c.jpg';

describe('addShot', () => {
  it('ACCUMULATES shots — the whole point of the burst', () => {
    let shots: string[] = [];
    shots = addShot(shots, A);
    shots = addShot(shots, B);
    shots = addShot(shots, C);
    expect(shots).toEqual([A, B, C]);
  });

  it('keeps capture order, so the first shot stays the cover photo', () => {
    expect(addShot([A, B], C)).toEqual([A, B, C]);
  });

  it('ignores a blank or whitespace-only uri', () => {
    expect(addShot([A], '')).toEqual([A]);
    expect(addShot([A], '   ')).toEqual([A]);
  });

  it('tolerates null/undefined — takePictureAsync can resolve to nothing', () => {
    expect(addShot([A], null)).toEqual([A]);
    expect(addShot([A], undefined)).toEqual([A]);
  });

  it('trims the uri', () => {
    expect(addShot([], `  ${A}  `)).toEqual([A]);
  });

  it('ignores a duplicate uri', () => {
    expect(addShot([A, B], B)).toEqual([A, B]);
  });

  it('does not mutate the input list', () => {
    const shots = [A];
    addShot(shots, B);
    expect(shots).toEqual([A]);
  });

  it('refuses a shot past the cap', () => {
    const full = Array.from({ length: MAX_BURST_SHOTS }, (_, i) => `file:///s${i}.jpg`);
    expect(addShot(full, A)).toEqual(full);
  });

  it('honours an explicit lower cap', () => {
    expect(addShot([A, B], C, 2)).toEqual([A, B]);
    expect(addShot([A], C, 2)).toEqual([A, C]);
  });
});

describe('undoLastShot', () => {
  it('drops the most recent shot — the one the user just saw was blurry', () => {
    expect(undoLastShot([A, B, C])).toEqual([A, B]);
  });

  it('is a harmless no-op on an empty session', () => {
    expect(undoLastShot([])).toEqual([]);
  });

  it('does not mutate the input list', () => {
    const shots = [A, B];
    undoLastShot(shots);
    expect(shots).toEqual([A, B]);
  });
});

describe('burstControls', () => {
  it('starts with nothing to undo and nothing to confirm', () => {
    const c = burstControls({ shots: [] });
    expect(c).toMatchObject({ count: 0, canUndo: false, canConfirm: false, canCapture: true });
  });

  it('counts the shots and opens up undo + confirm after the first', () => {
    const c = burstControls({ shots: [A] });
    expect(c).toMatchObject({ count: 1, canUndo: true, canConfirm: true });
  });

  it('reports how many shots are left before the cap', () => {
    expect(burstControls({ shots: [A, B], limit: 5 }).remaining).toBe(3);
    expect(burstControls({ shots: [] }).remaining).toBe(MAX_BURST_SHOTS);
  });

  it('closes the shutter at the cap but still lets the user confirm or undo', () => {
    const c = burstControls({ shots: [A, B], limit: 2 });
    expect(c).toMatchObject({ full: true, remaining: 0, canCapture: false, canUndo: true, canConfirm: true });
  });

  it('closes the shutter while a shot is still being taken', () => {
    // Two taps landing in the same frame would otherwise both fire the shutter.
    expect(burstControls({ shots: [A], busy: true }).canCapture).toBe(false);
  });

  it('will not confirm mid-shot either — the last frame is not in the list yet', () => {
    expect(burstControls({ shots: [A], busy: true }).canConfirm).toBe(false);
    expect(burstControls({ shots: [A], busy: true }).canUndo).toBe(false);
  });

  it('never reports a negative remaining, however the cap moved', () => {
    expect(burstControls({ shots: [A, B, C], limit: 2 }).remaining).toBe(0);
  });
});

describe('partitionUploads', () => {
  const ok = (value: string): PromiseSettledResult<string> => ({ status: 'fulfilled', value });
  const bad = (): PromiseSettledResult<string> => ({ status: 'rejected', reason: new Error('boom') });

  it('keeps every url when all uploads succeed', () => {
    expect(partitionUploads([ok(A), ok(B)])).toEqual({ urls: [A, B], failed: 0 });
  });

  it('KEEPS the successful uploads when one fails — six shots must not be lost to one', () => {
    expect(partitionUploads([ok(A), bad(), ok(C)])).toEqual({ urls: [A, C], failed: 1 });
  });

  it('reports a total failure as no urls and a count', () => {
    expect(partitionUploads([bad(), bad()])).toEqual({ urls: [], failed: 2 });
  });

  it('drops a blank url rather than storing a hole', () => {
    expect(partitionUploads([ok(A), ok('  ')])).toEqual({ urls: [A], failed: 0 });
  });

  it('handles an empty settle list', () => {
    expect(partitionUploads([])).toEqual({ urls: [], failed: 0 });
  });
});
