/**
 * useRouteFilter — the "needs attention" filter the home screen hands to the
 * items list, held in the ROUTE PARAM and nowhere else.
 *
 * That last part is the whole point, and it is load-bearing. The first version
 * kept a local `dismissedFilter` boolean beside the param. The items list is a
 * TAB screen: it never unmounts, so the flag never reset, and after one
 * dismissal every later tap on a home tile pushed the param, found the flag
 * still true, and rendered an unfiltered list. Force-closing the app was the
 * only way out.
 *
 * Deriving the filter from the param alone makes that impossible — dismissing
 * writes the dismissal INTO the param, so the next navigation simply overwrites
 * it. See useRouteFilter.test.tsx for the regression.
 */
import { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { isItemFilter, type ItemFilter } from '../lib/itemFilter';

export interface RouteFilter {
  /** The filter to apply, or null when none is set. */
  activeFilter: ItemFilter | null;
  /** Dismiss it. Empties the param rather than shadowing it with local state. */
  clearFilter: () => void;
}

export function useRouteFilter(): RouteFilter {
  const params = useLocalSearchParams<{ filter?: string }>();
  const router = useRouter();

  const clearFilter = useCallback(() => {
    // '' rather than undefined: it reads as "no filter" through `isItemFilter`
    // and is a plain string, which is all a route param may hold.
    router.setParams({ filter: '' });
  }, [router]);

  return {
    activeFilter: isItemFilter(params.filter) ? params.filter : null,
    clearFilter,
  };
}
