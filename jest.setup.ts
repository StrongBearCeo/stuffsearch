/** Jest setup: stub native modules so pure-logic tests run without a RN runtime. */

// Env vars read by src/lib/supabase.ts at module load time.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET = 'stuffsearch';

// `expo-crypto` (used by qrcode.ts) — stub getRandomBytes deterministically.
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => {
    const arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) arr[i] = (i * 7 + 1) % 256;
    return arr;
  },
  randomUUID: () => '00000000-0000-4000-8000-000000000000',
}));

// `expo-localization` (used by i18n.ts) — stub to en-US.
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}));

// `expo-secure-store` — no-op async storage for tests.
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));

// `react-native-url-polyfill/auto` — side-effect import; stub to no-op so the
// supabase client module can load under node without the polyfill.
jest.mock('react-native-url-polyfill/auto', () => ({}), { virtual: true });

// `@supabase/supabase-js` — stub createClient so importing supabase.ts works.
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    rpc: async () => ({ data: [], error: null }),
    functions: { invoke: async () => ({ data: null, error: null }) },
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  }),
}));
