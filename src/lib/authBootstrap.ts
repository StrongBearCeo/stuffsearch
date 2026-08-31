/**
 * Auth bootstrap sequencing — pure, injectable, no RN / supabase imports.
 *
 * Extracted from AuthProvider so the load-order invariant can be unit-tested
 * in the plain-node Jest environment (the rest of auth.tsx pulls in
 * expo-secure-store / expo-linking / supabase-js, which have no node runtime).
 *
 * Contract (the bug this exists to prevent regressing):
 *  - `setLoading(false)` fires as soon as `getSession` resolves OR rejects —
 *    never delayed by the profile network fetch.
 *  - `loadProfile` runs in the background (fire-and-forget); its rejection must
 *    not rethrow into the caller or block the gate.
 *  - A `getSession` rejection sets `initError` but still unblocks the gate.
 *  - If `isActive` is false after the await (effect unmounted), no state is
 *    touched and `setLoading` is not called.
 */
export interface BootstrapSession {
  user?: { id: string } | null;
}

export interface BootstrapDeps<S extends BootstrapSession> {
  getSession: () => Promise<{ data: { session: S | null } }>;
  loadProfile: (userId: string) => Promise<void>;
  setSession: (session: S | null) => void;
  setLoading: (loading: boolean) => void;
  setInitError: (err: Error | null) => void;
  isActive: () => boolean;
}

export async function bootstrapSession<S extends BootstrapSession>(
  deps: BootstrapDeps<S>,
): Promise<void> {
  const { getSession, loadProfile, setSession, setLoading, setInitError, isActive } = deps;
  try {
    const { data } = await getSession();
    if (!isActive()) return;
    setSession(data.session);
    // Fire-and-forget: the gate does not depend on the profile. Awaiting this
    // here is what hung the splash spinner when the profiles query stalled.
    if (data.session?.user) loadProfile(data.session.user.id).catch(() => {});
  } catch (e) {
    if (!isActive()) return;
    setInitError(e as Error);
  } finally {
    if (isActive()) setLoading(false);
  }
}