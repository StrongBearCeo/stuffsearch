/**
 * usePhotoRotate — turn an already-uploaded photo a quarter turn.
 *
 * Photos come off a phone camera in whatever orientation the sensor decided,
 * and a sideways picture of a shelf is genuinely hard to read. Rotation is
 * applied to the IMAGE, not stored as a display-time transform: an orientation
 * column would have to be threaded through every list, card, print sheet and
 * AI upload, and anything that missed it would show the photo the wrong way up.
 *
 * The rotated copy is uploaded under a new name and the caller swaps the URL
 * (`replacePhotoAt`). The original object is deliberately left in the bucket:
 * deleting it before the row is saved would break the photo if the save then
 * failed, and storage is far cheaper than a broken image.
 */
import { useCallback, useState } from 'react';
// The contextual API (SDK 52+); `manipulateAsync` is deprecated in v14.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { uploadPhoto } from '../lib/storage';
import { useHousehold } from '../lib/household';
import { useAuth } from '../lib/auth';
import { useTranslation } from 'react-i18next';

export interface UsePhotoRotateResult {
  /** True while a rotate+upload is in flight. */
  rotating: boolean;
  /** Index currently being rotated, so only that tile shows a spinner. */
  rotatingIndex: number | null;
  error: string | null;
  /** Rotate 90° clockwise and resolve to the NEW url, or null on failure. */
  rotate: (url: string, index: number) => Promise<string | null>;
  clearError: () => void;
}

export function usePhotoRotate(entity: 'items' | 'places'): UsePhotoRotateResult {
  const { t } = useTranslation();
  const { activeHouseholdId } = useHousehold();
  const { user } = useAuth();
  const [rotatingIndex, setRotatingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rotate = useCallback(
    async (url: string, index: number): Promise<string | null> => {
      if (!user || !activeHouseholdId || !url) {
        setError(t('errors.generic'));
        return null;
      }
      setRotatingIndex(index);
      setError(null);
      let localCopy: string | null = null;
      try {
        // ImageManipulator needs a local file; the stored photo is a public URL.
        const target = `${FileSystem.cacheDirectory}rotate-${Date.now()}.jpg`;
        const dl = await FileSystem.downloadAsync(url, target);
        if (dl.status !== 200) throw new Error(t('photos.rotateFailed'));
        localCopy = dl.uri;

        const rendered = await ImageManipulator.manipulate(localCopy).rotate(90).renderAsync();
        const result = await rendered.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });

        return await uploadPhoto(result.uri, user.id, activeHouseholdId, entity);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('photos.rotateFailed'));
        return null;
      } finally {
        // Best-effort cache cleanup; a leftover temp file is harmless.
        if (localCopy) {
          FileSystem.deleteAsync(localCopy, { idempotent: true }).catch(() => {});
        }
        setRotatingIndex(null);
      }
    },
    [entity, user, activeHouseholdId, t],
  );

  const clearError = useCallback(() => setError(null), []);

  return { rotating: rotatingIndex !== null, rotatingIndex, error, rotate, clearError };
}
