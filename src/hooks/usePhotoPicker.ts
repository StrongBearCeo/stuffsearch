/** usePhotoPicker — pick a photo from the library or camera, upload it to the
 *  Supabase storage bucket, and resolve to its public URL(s). Shared by the
 *  item (multiple) and place (single) edit forms.
 *
 *  Permission handling:
 *  - Library: requestMediaLibraryPermissionsAsync (needed on Android; harmless
 *    on iOS where the system shows its own limited-access sheet).
 *  - Camera: requestCameraPermissionsAsync, only when the camera source is used.
 *  On denial, an error message is surfaced via `error` and the pick resolves to
 *  null without throwing — the caller shows the message and keeps the form open.
 */
import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { uploadPhoto } from '../lib/storage';
import { useHousehold } from '../lib/household';
import { useAuth } from '../lib/auth';
import { useTranslation } from 'react-i18next';

export type PhotoSource = 'library' | 'camera';

export interface UsePhotoPickerResult {
  uploading: boolean;
  error: string | null;
  /** Pick from the chosen source, upload, and resolve to the new URL(s).
   *  Multiple mode returns string[] (may be empty if the user cancelled);
   *  single mode returns string | null. Resolves null/[] on denial or cancel. */
  pickAndUpload: (
    source: PhotoSource,
  ) => Promise<string[] | null>;
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

  const pickAndUpload = useCallback(
    async (source: PhotoSource): Promise<string[] | null> => {
      if (!user || !activeHouseholdId) {
        setError(t('errors.generic'));
        return null;
      }

      // Permission gate per source.
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError(t('photos.cameraDenied'));
          return multiple ? [] : null;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setError(t('photos.libraryDenied'));
          return multiple ? [] : null;
        }
      }

      setUploading(true);
      setError(null);
      try {
        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.7,
                allowsEditing: !multiple,
              })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.7,
                allowsMultipleSelection: multiple,
                allowsEditing: !multiple,
                selectionLimit: multiple ? 0 : 1, // 0 = unlimited in multi mode
              });

        if (result.canceled || !result.assets || result.assets.length === 0) {
          return multiple ? [] : null;
        }

        // Upload each chosen asset; collect the public URLs.
        const urls: string[] = [];
        for (const asset of result.assets) {
          const url = await uploadPhoto(asset.uri, user.id, activeHouseholdId, entity);
          urls.push(url);
        }
        return urls;
      } catch (e) {
        setError(e instanceof Error ? e.message : t('errors.generic'));
        return multiple ? [] : null;
      } finally {
        setUploading(false);
      }
    },
    [entity, multiple, user, activeHouseholdId, t],
  );

  const clearError = useCallback(() => setError(null), []);

  return { uploading, error, pickAndUpload, clearError };
}
