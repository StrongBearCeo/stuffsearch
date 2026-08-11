/** Storage upload helper for item / place photos. */
import * as FileSystem from 'expo-file-system';
import { supabase, STORAGE_BUCKET } from './supabase';
import { storagePath } from './constants';

/** Decode a base64 string into a Uint8Array (cross-platform, no Buffer needed). */
function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Upload a local photo URI to the stuffsearch bucket and return the public URL.
 * Throws on upload failure.
 */
export async function uploadPhoto(
  localUri: string,
  userId: string,
  householdId: string,
  entity: 'items' | 'places',
): Promise<string> {
  const ext = (localUri.split('.').pop() || 'jpg').toLowerCase();
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = storagePath(userId, householdId, entity, filename);

  // Read file as base64 (works cross-platform with expo-file-system).
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const body = base64ToBytes(base64);
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, body, { contentType, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
