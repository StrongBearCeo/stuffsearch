/**
 * Supabase client + typed helpers.
 *
 * Reads EXPO_PUBLIC_* env vars (bundled into the app). The service-role key is
 * NEVER referenced here — it lives only in Edge Function secrets.
 */
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Database, Tables, Enums } from './database.types';

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
 */
const authStorage = Platform.OS === 'web'
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
      getItem: (key: string) => SecureStore.getItemAsync(key),
      setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
      removeItem: (key: string) => SecureStore.deleteItemAsync(key),
    };

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
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
