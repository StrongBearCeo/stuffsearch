/**
 * scanGate — the "should I act on this barcode frame?" decision.
 *
 * `CameraView.onBarcodeScanned` fires continuously (many times a second) while
 * a code sits in frame. The screens used to guard that with a one-shot
 * `scanned` boolean that was only ever cleared when the modal re-opened — so
 * if the caller kept the camera open to show a recoverable error ("a place
 * can't go inside itself"), the scanner stayed locked and every later scan was
 * silently dropped. That is exactly what "scan to add didn't do anything"
 * looked like.
 *
 * This gate replaces that boolean:
 *   - one accept per `cooldownMs`, so a single physical scan fires once;
 *   - the *same* payload is additionally suppressed for `duplicateMs`, so a
 *     code left in frame doesn't re-trigger;
 *   - `rearm()` re-opens the gate immediately after the caller has handled a
 *     scan without closing the camera;
 *   - `reset()` starts a completely fresh session (modal re-opened).
 *
 * Time is passed in rather than read from Date.now() so it can be tested
 * without fake timers.
 */

export interface ScanGateOptions {
  /** Minimum gap between two accepted scans of any payload. */
  cooldownMs?: number;
  /** Longer window during which a repeat of the same payload is ignored. */
  duplicateMs?: number;
}

export interface ScanGate {
  /** True if this frame should be acted on. */
  accept(payload: string, now: number): boolean;
  /** Re-open the gate after handling a scan with the camera still up. */
  rearm(): void;
  /** Forget everything (new camera session). */
  reset(): void;
}

export function createScanGate(options: ScanGateOptions = {}): ScanGate {
  const cooldownMs = options.cooldownMs ?? 1200;
  const duplicateMs = options.duplicateMs ?? 2500;

  let lockedUntil: number | null = null;
  let lastPayload: string | null = null;
  let lastAt = 0;

  return {
    accept(payload: string, now: number): boolean {
      if (!payload) return false;
      if (lockedUntil !== null && now < lockedUntil) return false;
      if (lastPayload === payload && now - lastAt < duplicateMs) return false;
      lastPayload = payload;
      lastAt = now;
      lockedUntil = now + cooldownMs;
      return true;
    },
    rearm() {
      // Keep the duplicate memory: after an error the user scans a *different*
      // code, and we don't want the one still in frame to fire again.
      lockedUntil = null;
    },
    reset() {
      lockedUntil = null;
      lastPayload = null;
      lastAt = 0;
    },
  };
}
