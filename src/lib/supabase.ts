/**
 * Supabase client + typed helpers.
 *
 * Reads EXPO_PUBLIC_* env vars (bundled into the app). The service-role key is
 * NEVER referenced here — it lives only in Edge Function secrets.
 */
// RN 0.81 ships a complete WHATWG URL implementation; the
// react-native-url-polyfill/auto side-effect import is no longer needed.
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { splitIntoChunks, readFromChunks, chunkKeysFor } from './secureStorage';
import type { Database, Tables, Enums } from './database.types';

/** Minimal shape supabase-js requires of `auth.storage`. */
type SupabaseStorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill them in.',
  );
}

/**
 * Auth session storage. On native we use expo-secure-store (Keychain/Keystore);
 * on web SecureStore isn't available, so we fall back to AsyncStorage.
 *
 * Native note: a Supabase session JSON (access + refresh token + user) can
 * exceed Keychain's ~2 KB per-key limit, so we route through the chunked
 * adapter in ./secureStorage (split writes / manifest reads). Each individual
 * keychain entry stays well under 2 KB.
 */
const authStorage: SupabaseStorageAdapter = Platform.OS === 'web'
  ? {
      getItem: async (key: string) => {
        const AsyncStorage = await import('@react-native-async-storage/async-storage');
        return AsyncStorage.default.getItem(key);
      },
      setItem: async (key: string, value: string) => {
        const AsyncStorage = await import('@react-native-async-storage/async-storage');
        await AsyncStorage.default.setItem(key, value);
      },
      removeItem: async (key: string) => {
        const AsyncStorage = await import('@react-native-async-storage/async-storage');
        await AsyncStorage.default.removeItem(key);
      },
    }
  : {
      getItem: (key: string) => readFromChunks(key, (k) => SecureStore.getItemAsync(k)),
      setItem: async (key: string, value: string) => {
        const entries = splitIntoChunks(value, key);
        await Promise.all(
          entries.map(([k, v]) => SecureStore.setItemAsync(k, v)),
        );
      },
      removeItem: async (key: string) => {
        // Read the current value (if any) to learn how many chunks to delete;
        // a plain deleteItemAsync(key) would orphan chunk follow-ons otherwise.
        const current = await readFromChunks(key, (k) => SecureStore.getItemAsync(k));
        const keys = current === null ? [key] : chunkKeysFor(key, current.length);
        await Promise.all(keys.map((k) => SecureStore.deleteItemAsync(k)));
      },
    };

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    // PKCE flow: signInWithOtp/signUp store a `code_verifier` in SecureStore and
    // send a `code_challenge`; the email link redirects to our `confirm` route
    // with a `?code=…` query param (NOT a fragment, which RN Linking strips),
    // and `exchangeCodeForSession(url)` trades it for a session via /token.
    flowType: 'pkce',
    // Native: the `app/(auth)/confirm` route exchanges the PKCE code manually.
    // Web: let supabase-js auto-parse the redirect URL on load.
    detectSessionInUrl: Platform.OS === 'web',
  },
});

export type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
} from './database.types';

// Domain row types (aliased for readability across the app).
export type Profile = Tables<'profiles'>;
export type Household = Tables<'households'>;
export type HouseholdMember = Tables<'household_members'>;
export type Place = Tables<'places'>;
export type Item = Tables<'items'>;
export type ItemHistory = Tables<'item_history'>;
export type ExternalCode = Tables<'external_codes'>;

export type HouseholdRole = Enums<'household_role'>;
export type SupportedLanguage = Enums<'supported_language'>;
export type VoiceProvider = Enums<'voice_provider'>;
export type ExternalCodeType = Enums<'external_code_type'>;
export type ExternalEntityType = Enums<'external_entity_type'>;

export const STORAGE_BUCKET =
  process.env.EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'stuffsearch';
