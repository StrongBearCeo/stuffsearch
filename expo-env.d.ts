/// <reference types="expo-router/types" />

interface ProcessEnv {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET?: string;
}

declare const process: {
  env: ProcessEnv;
};
