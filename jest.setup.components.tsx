/**
 * Setup for the `components` Jest project — the one that actually renders.
 *
 * Only the native modules a rendered component reaches for are stubbed here.
 * Keep this list minimal: every blanket mock is a bug this suite can no longer
 * see, and the whole point of the project is to observe the component/framework
 * wiring that the node-only `logic` project cannot.
 */
// RTL 12.4+ registers its Jest matchers (toHaveTextContent, …) automatically;
// the old `extend-expect` entrypoint was removed in v13.

// Env vars read by src/lib/supabase.ts at module load time.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET = 'stuffsearch';

jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => {
    const arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) arr[i] = (i * 7 + 1) % 256;
    return arr;
  },
  randomUUID: () => '00000000-0000-4000-8000-000000000000',
}));

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));

jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));

// Reanimated ships its own Jest mock. gesture-handler's `jestSetup` is a
// side-effecting setup file rather than a module factory, so it is imported by
// the tests that actually render gestures, not mocked globally here.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
