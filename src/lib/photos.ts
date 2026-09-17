/**
 * Photo-list helpers shared by the item and place forms.
 *
 * Items have always had `photo_urls text[]`. Places used to have a single
 * `photo_url`, which is why adding a second photo to a place just replaced the
 * first. Places now carry `photo_urls` too, with `photo_url` kept as a mirror
 * of element 0 so the print sheet, the place card and older clients keep
 * working — `placePhotoColumns` is the one place that decides what to write.
 */

/** Append URLs, dropping blanks and anything already in the list. */
export function addPhotos(current: string[], incoming: string[] | null | undefined): string[] {
  const out = [...current];
  for (const raw of incoming ?? []) {
    const url = (raw ?? '').trim();
    if (!url || out.includes(url)) continue;
    out.push(url);
  }
  return out;
}

/** Drop the photo at `index`. Out-of-range indexes leave the list unchanged. */
export function removePhotoAt(photos: string[], index: number): string[] {
  if (index < 0 || index >= photos.length) return [...photos];
  return photos.filter((_, i) => i !== index);
}

/**
 * Move the photo at `from` to position `to`, shifting the rest along. Element 0
 * is the cover photo everywhere in the app, so this is how the user chooses it.
 * Out-of-range indexes are clamped, so a "move left" on the first photo is a
 * harmless no-op rather than an error.
 */
export function movePhoto(photos: string[], from: number, to: number): string[] {
  if (from < 0 || from >= photos.length) return [...photos];
  const target = Math.max(0, Math.min(photos.length - 1, to));
  if (target === from) return [...photos];
  const next = [...photos];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

/**
 * Swap one URL in place, keeping its position — used when a photo is rotated
 * and re-uploaded under a new name. Position matters: element 0 is the cover
 * photo, and rotating it must not demote it.
 *
 * A blank replacement is ignored rather than punching a hole in the list, so a
 * failed rotate leaves the original in place.
 */
export function replacePhotoAt(photos: string[], index: number, url: string): string[] {
  const clean = (url ?? '').trim();
  if (!clean || index < 0 || index >= photos.length) return [...photos];
  const next = [...photos];
  next[index] = clean;
  return next;
}

/** Quarter turns, clockwise, wrapping at a full revolution. */
export function nextRotation(current: number): 0 | 90 | 180 | 270 {
  const normalized = ((Math.round(current / 90) * 90) % 360 + 360) % 360;
  return ((normalized + 90) % 360) as 0 | 90 | 180 | 270;
}

/** The subset of a place row this module reads. */
export interface PhotoedPlace {
  photo_url?: string | null;
  photo_urls?: string[] | null;
}

/**
 * Every photo on a place. Reads the array, falling back to the legacy scalar
 * for rows written before the array existed (and never returns both copies of
 * the same URL).
 */
export function placePhotos(place: PhotoedPlace | null | undefined): string[] {
  if (!place) return [];
  const list = (place.photo_urls ?? []).filter((u) => !!u && u.trim().length > 0);
  if (list.length > 0) return list;
  const single = (place.photo_url ?? '').trim();
  return single ? [single] : [];
}

/** The two DB columns to write for a place's photo list. */
export function placePhotoColumns(photos: string[]): {
  photo_urls: string[];
  photo_url: string | null;
} {
  const clean = addPhotos([], photos);
  return { photo_urls: clean, photo_url: clean.length > 0 ? clean[0] : null };
}
