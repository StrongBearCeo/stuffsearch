/**
 * useKeyboardHeight — the on-screen keyboard's height in logical pixels, 0
 * when it's closed.
 *
 * Used by `FormScreen` to pad the scroll content so fields below the focused
 * one can be scrolled above the keyboard instead of sitting under it.
 * `keyboardWillShow` fires early enough on iOS to animate with the keyboard;
 * Android only emits the `Did` events.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      setHeight(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
