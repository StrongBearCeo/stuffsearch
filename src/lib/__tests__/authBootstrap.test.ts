/**
 * Unit tests for authBootstrap.ts — the load-order invariant that prevents the
 * splash-spinner deadlock. Pure logic: no RN / supabase runtime.
 *
 * The bug these guard against: an earlier version awaited `loadProfile` (a
 * network call) before `setLoading(false)`, so a stalled profiles query kept
 * the app on the ActivityIndicator forever. The fix is structural — these tests
 * pin it.
 */
import { bootstrapSession, type BootstrapDeps, type BootstrapSession } from '../authBootstrap';

/** Concrete session shape used throughout the tests. */
type TestSession = BootstrapSession & { user: { id: string } };

/** Records every call to a setter, in order. */
function recorder() {
  const calls: string[] = [];
  return {
    calls,
    setSession: (s: unknown) => calls.push(`setSession:${s ? 'yes' : 'null'}`),
    setLoading: (b: boolean) => calls.push(`setLoading:${b}`),
    setInitError: (e: unknown) => calls.push(`setInitError:${e ? String((e as Error).message) : 'null'}`),
  };
}

/** A `loadProfile` that never settles — models a hung network query. */
function neverResolves(): Promise<void> {
  return new Promise<void>(() => {});
}

/** A `loadProfile` that rejects after a microtask. */
function rejectsSoon(msg = 'profile failed'): Promise<void> {
  return Promise.reject(new Error(msg));
}

function makeDeps(
  overrides: Partial<BootstrapDeps<TestSession>> & { rec: ReturnType<typeof recorder> },
): BootstrapDeps<TestSession> & { rec: ReturnType<typeof recorder> } {
  const { rec, ...rest } = overrides;
  return {
    getSession: rest.getSession ?? (() => Promise.resolve({ data: { session: null } })),
    loadProfile: rest.loadProfile ?? (() => Promise.resolve()),
    setSession: rec.setSession,
    setLoading: rec.setLoading,
    setInitError: rec.setInitError,
    isActive: rest.isActive ?? (() => true),
    rec,
  };
}

describe('bootstrapSession — loading gate invariant', () => {
  it('unblocks the gate (setLoading:false) when there is no session', async () => {
    const rec = recorder();
    const deps = makeDeps({ rec, getSession: () => Promise.resolve({ data: { session: null } }) });
    await bootstrapSession(deps);
    expect(deps.rec.calls).toEqual(['setSession:null', 'setLoading:false']);
  });

  it('unblocks the gate BEFORE loadProfile resolves (the deadlock fix)', async () => {
    // loadProfile never settles. If bootstrap awaited it, this test would hang
    // (jest's default timeout) and fail. The gate must unblock regardless.
    const rec = recorder();
    const deps = makeDeps({
      rec,
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
      loadProfile: neverResolves,
    });
    await bootstrapSession(deps);
    expect(deps.rec.calls).toContain('setLoading:false');
    expect(deps.rec.calls).toEqual(['setSession:yes', 'setLoading:false']);
  });

  it('does not block the gate when loadProfile rejects', async () => {
    const rec = recorder();
    const profileCalls: string[] = [];
    const deps = makeDeps({
      rec,
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
      loadProfile: (id: string) => {
        profileCalls.push(id);
        return rejectsSoon('boom');
      },
    });
    await bootstrapSession(deps);
    expect(deps.rec.calls).toContain('setLoading:false');
    expect(profileCalls).toEqual(['u1']); // still kicked off in the background
    // Swallow the unhandled rejection from the fire-and-forget .catch().
    await new Promise((r) => setTimeout(r, 0));
  });

  it('unblocks the gate and records initError when getSession rejects', async () => {
    const rec = recorder();
    const deps = makeDeps({
      rec,
      getSession: () => Promise.reject(new Error('securestore broken')),
    });
    await bootstrapSession(deps);
    expect(deps.rec.calls).toEqual(['setInitError:securestore broken', 'setLoading:false']);
  });

  it('touches no state and does not unblock if the effect is no longer active', async () => {
    const rec = recorder();
    const deps = makeDeps({
      rec,
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
      isActive: () => false, // unmounted after the await
    });
    await bootstrapSession(deps);
    expect(deps.rec.calls).toEqual([]);
  });

  it('does not call loadProfile when there is no session', async () => {
    const rec = recorder();
    let profileCalled = false;
    const deps = makeDeps({
      rec,
      getSession: () => Promise.resolve({ data: { session: null } }),
      loadProfile: () => {
        profileCalled = true;
        return Promise.resolve();
      },
    });
    await bootstrapSession(deps);
    expect(profileCalled).toBe(false);
  });
});