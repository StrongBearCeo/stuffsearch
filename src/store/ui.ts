/**
 * UI store (Zustand): ephemeral / cross-screen state that isn't server data.
 * Holds the "active place" used by scan-to-assign, plus scan tab UI flags.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UiState {
  /** Place id that scanned items get assigned to (scan-to-assign). Null = off. */
  activePlaceId: string | null;
  activePlaceName: string | null;
  setActivePlace: (id: string | null, name?: string | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activePlaceId: null,
      activePlaceName: null,
      setActivePlace: (id, name = null) =>
        set({ activePlaceId: id, activePlaceName: name }),
    }),
    {
      name: 'stuffsearch.ui',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
