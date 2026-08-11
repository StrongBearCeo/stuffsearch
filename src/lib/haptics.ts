/** Thin wrapper around expo-haptics so call sites stay one-liners.
 * Haptics are fire-and-forget; failures are swallowed (no-op on devices
 * without a taptic engine / when haptics are disabled). */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

async function safe(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch {
    /* ignore — haptics are best-effort */
  }
}

/** Light impact — selection changes, small toggles. */
export const hapticImpact = () =>
  Platform.OS !== 'web' && safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/** Success notification — saves, scan match, bind completes. */
export const hapticSuccess = () =>
  Platform.OS !== 'web' &&
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

/** Warning notification — deletes, unbinds, destructive confirms. */
export const hapticWarning = () =>
  Platform.OS !== 'web' &&
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
