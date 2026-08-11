/** useScan: resolves a scanned payload via the resolveScan state machine. */
import { useState, useCallback } from 'react';
import { resolveScan, type ScanOutcome } from '../lib/scanner';
import { useAuth } from '../lib/auth';
import { useHousehold } from '../lib/household';

export function useScan() {
  const { user } = useAuth();
  const { activeHouseholdId } = useHousehold();
  const [resolving, setResolving] = useState(false);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolve = useCallback(
    async (payload: string) => {
      if (!user) {
        setError('Sign in first.');
        return;
      }
      setResolving(true);
      setError(null);
      setOutcome(null);
      try {
        const o = await resolveScan(payload, user.id, activeHouseholdId);
        setOutcome(o);
        return o;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Scan failed.');
        return null;
      } finally {
        setResolving(false);
      }
    },
    [user, activeHouseholdId],
  );

  const reset = useCallback(() => {
    setOutcome(null);
    setError(null);
  }, []);

  return { resolve, reset, resolving, outcome, error };
}
