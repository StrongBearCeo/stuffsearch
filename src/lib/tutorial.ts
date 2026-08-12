/** Tutorial "has seen" flag + a tiny module-level emitter so Settings can
 *  trigger a replay without prop-drilling through the whole tree.
 *
 *  The root layout reads the flag on mount and renders the TutorialOverlay;
 *  Settings calls replayTutorial() to show it again. */
import AsyncStorage from '@react-native-async-storage/async-storage';

const SEEN_KEY = 'stuffsearch.tutorial.seen';

/** Mark the tutorial as seen (so it doesn't auto-show on next launch). */
export async function markTutorialSeen(): Promise<void> {
  await AsyncStorage.setItem(SEEN_KEY, '1');
}

/** Has the user already seen the tutorial? */
export async function hasSeenTutorial(): Promise<boolean> {
  return (await AsyncStorage.getItem(SEEN_KEY)) === '1';
}

// --- Module-level replay emitter (no React context needed) ---
type Listener = () => void;
let listener: Listener | null = null;

/** Subscribe to replay requests. Returns an unsubscribe fn. */
export function onTutorialReplay(fn: Listener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

/** Request the tutorial overlay to show again (called from Settings). */
export function replayTutorial(): void {
  listener?.();
}
