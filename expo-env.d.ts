/// <reference types="expo-router/types" />

// Env typings for EXPO_PUBLIC_* variables exposed to the client bundle.
// Secrets (OpenAI key, Supabase service role) live ONLY in Supabase Edge
// Function secrets and are never referenced here.

interface ProcessEnv {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET?: string;
}

declare const process: { env: ProcessEnv };
