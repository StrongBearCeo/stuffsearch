/**
 * Unit tests for the double-submit guard.
 *
 * The bug this exists for: two Save taps landing in the same frame both saw
 * `mutation.isPending === false` and both inserted, producing a duplicate item.
 */
import { createSubmitGuard } from '../submit';

/** A promise plus the handles to settle it from the test. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createSubmitGuard', () => {
  it('runs the work and returns its value', async () => {
    const guard = createSubmitGuard();
    await expect(guard.run(async () => 'saved')).resolves.toBe('saved');
  });

  it('drops a second call made while the first is still in flight', async () => {
    const guard = createSubmitGuard();
    const gate = deferred<string>();
    const work = jest.fn(() => gate.promise);

    const first = guard.run(work);
    const second = await guard.run(work); // same frame, before the first settles

    expect(second).toBeUndefined();
    expect(work).toHaveBeenCalledTimes(1);

    gate.resolve('saved');
    await expect(first).resolves.toBe('saved');
  });

  it('reports busy only while work is in flight', async () => {
    const guard = createSubmitGuard();
    const gate = deferred<void>();
    expect(guard.busy).toBe(false);

    const run = guard.run(() => gate.promise);
    expect(guard.busy).toBe(true);

    gate.resolve();
    await run;
    expect(guard.busy).toBe(false);
  });

  it('allows a retry after the work resolves', async () => {
    const guard = createSubmitGuard();
    const work = jest.fn(async () => 'ok');
    await guard.run(work);
    await guard.run(work);
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('releases the lock when the work THROWS, so a failed save is retryable', async () => {
    const guard = createSubmitGuard();
    const boom = jest.fn(async () => {
      throw new Error('network');
    });

    await expect(guard.run(boom)).rejects.toThrow('network');
    expect(guard.busy).toBe(false);

    // The retry must actually run — a latched guard would strand the form.
    await expect(guard.run(boom)).rejects.toThrow('network');
    expect(boom).toHaveBeenCalledTimes(2);
  });

  it('release() re-opens a stuck lock', async () => {
    const guard = createSubmitGuard();
    const gate = deferred<void>();
    const run = guard.run(() => gate.promise);

    guard.release();
    expect(guard.busy).toBe(false);
    await expect(guard.run(async () => 'second')).resolves.toBe('second');

    gate.resolve();
    await run;
  });
});
