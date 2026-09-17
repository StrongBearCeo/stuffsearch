/**
 * Unit tests for the photo-list helpers.
 *
 * The bug these exist for: a place could only ever hold ONE photo — each new
 * pick replaced the last — because places had a scalar `photo_url` column and
 * the form wrote `setPhoto(urls[0])`.
 */
import {
  addPhotos,
  removePhotoAt,
  movePhoto,
  nextRotation,
  placePhotos,
  placePhotoColumns,
  replacePhotoAt,
  stackLayers,
} from '../photos';

const A = 'https://cdn.test/a.jpg';
const B = 'https://cdn.test/b.jpg';
const C = 'https://cdn.test/c.jpg';

describe('addPhotos', () => {
  it('APPENDS rather than replacing — a place keeps every photo', () => {
    expect(addPhotos([A], [B])).toEqual([A, B]);
  });

  it('adds several at once', () => {
    expect(addPhotos([], [A, B, C])).toEqual([A, B, C]);
  });

  it('ignores duplicates', () => {
    expect(addPhotos([A, B], [B, C])).toEqual([A, B, C]);
  });

  it('drops blanks and whitespace-only urls', () => {
    expect(addPhotos([], [A, '', '   '])).toEqual([A]);
  });

  it('trims incoming urls', () => {
    expect(addPhotos([], [`  ${A}  `])).toEqual([A]);
  });

  it('tolerates null/undefined incoming', () => {
    expect(addPhotos([A], null)).toEqual([A]);
    expect(addPhotos([A], undefined)).toEqual([A]);
  });

  it('does not mutate the input list', () => {
    const current = [A];
    addPhotos(current, [B]);
    expect(current).toEqual([A]);
  });
});

describe('removePhotoAt', () => {
  it('removes the photo at the index', () => {
    expect(removePhotoAt([A, B, C], 1)).toEqual([A, C]);
  });

  it('leaves the list alone for an out-of-range index', () => {
    expect(removePhotoAt([A, B], 5)).toEqual([A, B]);
    expect(removePhotoAt([A, B], -1)).toEqual([A, B]);
  });

  it('handles an empty list', () => {
    expect(removePhotoAt([], 0)).toEqual([]);
  });
});

describe('movePhoto', () => {
  it('moves a photo later in the list', () => {
    expect(movePhoto([A, B, C], 0, 2)).toEqual([B, C, A]);
  });

  it('moves a photo earlier — this is how the cover photo is chosen', () => {
    expect(movePhoto([A, B, C], 2, 0)).toEqual([C, A, B]);
  });

  it('swaps neighbours', () => {
    expect(movePhoto([A, B, C], 1, 0)).toEqual([B, A, C]);
    expect(movePhoto([A, B, C], 1, 2)).toEqual([A, C, B]);
  });

  it('is a no-op when source and target are the same', () => {
    expect(movePhoto([A, B, C], 1, 1)).toEqual([A, B, C]);
  });

  it('clamps the target, so "move left" on the first photo does nothing', () => {
    expect(movePhoto([A, B, C], 0, -1)).toEqual([A, B, C]);
    expect(movePhoto([A, B, C], 2, 99)).toEqual([A, B, C]);
  });

  it('ignores an out-of-range source', () => {
    expect(movePhoto([A, B], 7, 0)).toEqual([A, B]);
    expect(movePhoto([A, B], -1, 0)).toEqual([A, B]);
  });

  it('does not mutate the input list', () => {
    const list = [A, B, C];
    movePhoto(list, 0, 2);
    expect(list).toEqual([A, B, C]);
  });
});

describe('placePhotos', () => {
  it('reads the array when present', () => {
    expect(placePhotos({ photo_urls: [A, B], photo_url: A })).toEqual([A, B]);
  });

  it('falls back to the legacy scalar for rows written before the array', () => {
    expect(placePhotos({ photo_urls: [], photo_url: A })).toEqual([A]);
    expect(placePhotos({ photo_url: A })).toEqual([A]);
  });

  it('returns an empty list for a place with no photo at all', () => {
    expect(placePhotos({ photo_urls: [], photo_url: null })).toEqual([]);
    expect(placePhotos({})).toEqual([]);
    expect(placePhotos(null)).toEqual([]);
    expect(placePhotos(undefined)).toEqual([]);
  });

  it('never returns the scalar twice when it is also in the array', () => {
    expect(placePhotos({ photo_urls: [A, B], photo_url: A })).toEqual([A, B]);
  });

  it('ignores blank entries in the array', () => {
    expect(placePhotos({ photo_urls: ['', '  ', A], photo_url: null })).toEqual([A]);
  });
});

describe('placePhotoColumns', () => {
  it('mirrors element 0 into the legacy scalar column', () => {
    expect(placePhotoColumns([A, B])).toEqual({ photo_urls: [A, B], photo_url: A });
  });

  it('nulls the scalar when there are no photos', () => {
    expect(placePhotoColumns([])).toEqual({ photo_urls: [], photo_url: null });
  });

  it('follows a reorder, so the cover photo really changes', () => {
    expect(placePhotoColumns(movePhoto([A, B], 1, 0))).toEqual({
      photo_urls: [B, A],
      photo_url: B,
    });
  });

  it('de-duplicates and drops blanks before writing', () => {
    expect(placePhotoColumns([A, '', A, B])).toEqual({ photo_urls: [A, B], photo_url: A });
  });
});

describe('replacePhotoAt', () => {
  it('swaps one url in place, preserving order', () => {
    expect(replacePhotoAt([A, B, C], 1, 'https://cdn.test/b-rotated.jpg')).toEqual([
      A,
      'https://cdn.test/b-rotated.jpg',
      C,
    ]);
  });

  it('keeps the cover photo the cover when it is the one rotated', () => {
    const out = replacePhotoAt([A, B], 0, 'https://cdn.test/a-rotated.jpg');
    expect(out[0]).toBe('https://cdn.test/a-rotated.jpg');
  });

  it('ignores an out-of-range index', () => {
    expect(replacePhotoAt([A, B], 9, C)).toEqual([A, B]);
    expect(replacePhotoAt([A, B], -1, C)).toEqual([A, B]);
  });

  it('ignores a blank replacement rather than leaving a hole', () => {
    expect(replacePhotoAt([A, B], 0, '')).toEqual([A, B]);
    expect(replacePhotoAt([A, B], 0, '   ')).toEqual([A, B]);
  });

  it('does not mutate the input', () => {
    const list = [A, B];
    replacePhotoAt(list, 0, C);
    expect(list).toEqual([A, B]);
  });
});

describe('nextRotation', () => {
  it('steps a quarter turn clockwise', () => {
    expect(nextRotation(0)).toBe(90);
    expect(nextRotation(90)).toBe(180);
    expect(nextRotation(180)).toBe(270);
  });

  it('wraps back to zero after a full turn', () => {
    expect(nextRotation(270)).toBe(0);
  });

  it('normalises anything unexpected', () => {
    expect(nextRotation(360)).toBe(90);
    expect(nextRotation(-90)).toBe(0);
  });
});

describe('stackLayers', () => {
  it('draws nothing behind a single photo', () => {
    expect(stackLayers(1)).toBe(0);
    expect(stackLayers(0)).toBe(0);
  });

  it('draws one layer for a pair', () => {
    expect(stackLayers(2)).toBe(1);
  });

  it('caps at two layers — a deeper stack reads as clutter at 48px', () => {
    expect(stackLayers(3)).toBe(2);
    expect(stackLayers(9)).toBe(2);
  });

  it('never returns a negative count for nonsense input', () => {
    expect(stackLayers(-4)).toBe(0);
    expect(stackLayers(Number.NaN)).toBe(0);
  });
});
