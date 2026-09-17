/**
 * useRecentPlaces — the places this household has most recently been used as a
 * location, so the "move to…" picker can offer them first instead of making
 * the user scroll an alphabetical list of everything they own.
 *
 * Stored per household in AsyncStorage: it's a local convenience, not shared
 * state, and losing it costs nothing. The ordering rules are pure and live in
 * src/lib/recent.ts.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pushRecent } from '../lib/recent';
import { useHousehold } from '../lib/household';

const storageKey = (householdId: string) => `stuffsearch.recentPlaces.${householdId}`;

export function useRecentPlaces() {
  const { activeHouseholdId } = useHousehold();
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    if (!activeHouseholdId) {
      setRecent([]);
      return;
    }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey(activeHouseholdId));
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        if (!active) return;
        setRecent(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
      } catch {
        // A corrupt or missing entry just means "no recents yet".
        if (active) setRecent([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeHouseholdId]);

  /** Record that a place was just used as a destination. */
  const remember = useCallback(
    (placeId: string | null | undefined) => {
      if (!placeId || !activeHouseholdId) return;
      setRecent((prev) => {
        const next = pushRecent(prev, placeId);
        AsyncStorage.setItem(storageKey(activeHouseholdId), JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [activeHouseholdId],
  );

  return { recent, remember };
}
