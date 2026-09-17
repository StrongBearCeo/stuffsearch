/**
 * One-shot submit guard.
 *
 * A mutation's `isPending` flag only flips AFTER React has re-rendered, so two
 * taps landing in the same frame both see `isPending === false` and both fire —
 * which is how a single Save could create two items. This guard closes the
 * window synchronously: the first call takes the lock, every call until the
 * work settles is dropped, and the lock is released whether the work resolved
 * or threw (so a failed save can be retried).
 *
 * It's the in-process half of the fix; the durable half is `newUuid()` in
 * ./ids, which gives the insert a client-chosen primary key so even a network
 * retry can't produce a second row.
 */

export interface SubmitGuard {
  /**
   * Run `work` unless a run is already in flight. Returns the work's value, or
   * `undefined` when the call was dropped as a duplicate.
   */
  run<T>(work: () => Promise<T>): Promise<T | undefined>;
  /** True while a run is in flight. */
  readonly busy: boolean;
  /** Force the lock open (e.g. the form was reset). */
  release(): void;
}

export function createSubmitGuard(): SubmitGuard {
  let inFlight = false;
  return {
    get busy() {
      return inFlight;
    },
    async run<T>(work: () => Promise<T>): Promise<T | undefined> {
      if (inFlight) return undefined;
      inFlight = true;
      try {
        return await work();
      } finally {
        inFlight = false;
      }
    },
    release() {
      inFlight = false;
    },
  };
}
