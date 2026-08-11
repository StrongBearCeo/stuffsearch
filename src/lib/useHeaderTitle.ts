/** Set the current screen's header title from a translation key.
 * Used in conjunction with the root Stack's `headerTheme` default, so every
 * detail/edit/modal screen gets a translated title + a platform back button. */
import { useNavigation } from 'expo-router';
import { useEffect } from 'react';

export function useHeaderTitle(title: string) {
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);
}
