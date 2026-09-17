/** usePhotoPicker — get photos into the Supabase storage bucket and resolve to
 *  their public URL(s). Shared by the item and place edit forms.
 *
 *  Two ways in, because they need different things:
 *  - `pickFromLibrary` runs the system picker (multi-select when `multiple`).
 *  - `uploadLocal` takes local uris that already exist — the burst of shots
 *    `PhotoCaptureModal` collected. The camera lives there, not here:
 *    `ImagePicker.launchCameraAsync` closes after ONE shot, which is what made
 *    "add six photos" six separate errands.
 *
 *  Permission handling: the library picker requests media-library access
 *  (needed on Android; harmless on iOS where the system shows its own
 *  limited-access sheet). On denial the message is surfaced via `error` and the
 *  pick resolves empty without throwing — the caller shows it and keeps the
 *  form open. Camera permission belongs to the capture modal.
 *
 *  Uploads run in parallel and are settled individually: one failed file out of
 *  six must not discard the other five (see `partitionUploads`).
 */
import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { uploadPhoto } from '../lib/storage';
import { partitionUploads } from '../lib/photoBurst';
import { useHousehold } from '../lib/household';
import { useAuth } from '../lib/auth';
import { useTranslation } from 'react-i18next';

export interface UsePhotoPickerResult {
  uploading: boolean;
  error: string | null;
  /** Run the system library picker, upload, and resolve to the new URLs.
   *  Empty on cancel or denial. */
  pickFromLibrary: () => Promise<string[]>;
  /** Upload local uris (camera shots) and resolve to the URLs that landed. */
  uploadLocal: (uris: string[]) => Promise<string[]>;
  clearError: () => void;
}

export function usePhotoPicker(
  entity: 'items' | 'places',
  multiple: boolean,
): UsePhotoPickerResult {
  const { t } = useTranslation();
  const { activeHouseholdId } = useHousehold();
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Upload every uri, keeping whatever succeeded and reporting the shortfall. */
  const uploadAll = useCallback(
    async (uris: string[], userId: string, householdId: string): Promise<string[]> => {
      const settled = await Promise.allSettled(
        uris.map((uri) => uploadPhoto(uri, userId, householdId, entity)),
      );
      const { urls, failed } = partitionUploads(settled);
      if (failed > 0) setError(t('photos.uploadFailed', { count: failed }));
      return urls;
    },
    [entity, t],
  );

  const uploadLocal = useCallback(
    async (uris: string[]): Promise<string[]> => {
      if (uris.length === 0) return [];
      if (!user || !activeHouseholdId) {
        setError(t('errors.generic'));
        return [];
      }
      setUploading(true);
      setError(null);
      try {
        return await uploadAll(uris, user.id, activeHouseholdId);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('errors.generic'));
        return [];
      } finally {
        setUploading(false);
      }
    },
    [user, activeHouseholdId, uploadAll, t],
  );

  const pickFromLibrary = useCallback(async (): Promise<string[]> => {
    if (!user || !activeHouseholdId) {
      setError(t('errors.generic'));
      return [];
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(t('photos.libraryDenied'));
      return [];
    }

    setUploading(true);
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsMultipleSelection: multiple,
        allowsEditing: !multiple,
        selectionLimit: multiple ? 0 : 1, // 0 = unlimited in multi mode
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return [];

      return await uploadAll(
        result.assets.map((asset) => asset.uri),
        user.id,
        activeHouseholdId,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'));
      return [];
    } finally {
      setUploading(false);
    }
  }, [multiple, user, activeHouseholdId, uploadAll, t]);

  const clearError = useCallback(() => setError(null), []);

  return { uploading, error, pickFromLibrary, uploadLocal, clearError };
}
