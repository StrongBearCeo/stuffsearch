/**
 * Keyboard geometry helper.
 *
 * Forms pad their scroll content by the keyboard's height so the fields below
 * the focused one (description, product link, tags…) can still be scrolled
 * into view instead of sitting under the keyboard. The bottom safe-area inset
 * is already occupied by the keyboard when it's up, so it must not be counted
 * twice.
 */
export function keyboardSpacerHeight(keyboardHeight: number, safeAreaBottom = 0): number {
  return Math.max(0, keyboardHeight - safeAreaBottom);
}
