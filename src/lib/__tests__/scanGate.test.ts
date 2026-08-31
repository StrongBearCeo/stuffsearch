import { createScanGate } from '../scanGate';

describe('createScanGate', () => {
  it('accepts the first scan', () => {
    const gate = createScanGate();
    expect(gate.accept('abc', 0)).toBe(true);
  });

  it('locks out every scan until the cooldown elapses', () => {
    const gate = createScanGate({ cooldownMs: 1000 });
    expect(gate.accept('abc', 0)).toBe(true);
    expect(gate.accept('xyz', 500)).toBe(false);
    expect(gate.accept('xyz', 1000)).toBe(true);
  });

  it('suppresses the SAME payload for longer than the cooldown', () => {
    // expo-camera fires onBarcodeScanned continuously while a code is in frame.
    const gate = createScanGate({ cooldownMs: 500, duplicateMs: 3000 });
    expect(gate.accept('abc', 0)).toBe(true);
    expect(gate.accept('abc', 600)).toBe(false);
    expect(gate.accept('abc', 2999)).toBe(false);
    expect(gate.accept('abc', 3000)).toBe(true);
  });

  it('rearm() re-opens the gate immediately for a different code', () => {
    // The caller keeps the camera open after a recoverable error ("a place
    // can't go inside itself") and re-arms so the next scan is accepted.
    const gate = createScanGate({ cooldownMs: 10_000 });
    expect(gate.accept('abc', 0)).toBe(true);
    gate.rearm();
    expect(gate.accept('xyz', 1)).toBe(true);
  });

  it('rearm() still suppresses an immediate repeat of the same code', () => {
    const gate = createScanGate({ cooldownMs: 1000, duplicateMs: 3000 });
    expect(gate.accept('abc', 0)).toBe(true);
    gate.rearm();
    expect(gate.accept('abc', 1)).toBe(false);
  });

  it('reset() clears both the lock and the duplicate memory', () => {
    // Called when the modal re-opens: a fresh session should accept anything.
    const gate = createScanGate({ cooldownMs: 1000, duplicateMs: 3000 });
    expect(gate.accept('abc', 0)).toBe(true);
    gate.reset();
    expect(gate.accept('abc', 1)).toBe(true);
  });

  it('ignores an empty payload', () => {
    const gate = createScanGate();
    expect(gate.accept('', 0)).toBe(false);
    expect(gate.accept('abc', 0)).toBe(true);
  });
});
