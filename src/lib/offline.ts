/**
 * React Query setup with AsyncStorage persistence for offline cache.
 * Provides the QueryClient + a persister. Rehydrated on app start.
 */
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Be forgiving on flaky home wifi / mobile: retry, stay fresh longer.
      retry: 2,
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24, // 24h cache
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'online',
      retry: 1,
    },
  },
});

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: (key) => AsyncStorage.removeItem(key),
  },
  key: 'stuffsearch.react-query',
});
