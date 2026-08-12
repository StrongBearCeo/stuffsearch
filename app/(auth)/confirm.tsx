/**
 * Email-confirmation / magic-link landing UI.
 *
 * The actual PKCE code exchange happens at the root (AuthProvider), which
 * captures the incoming deep link via Linking.getInitialURL / the `url` event
 * — independent of expo-router path matching. See the header in
 * `src/lib/auth.tsx` for why (Supabase canonicalizes `stuffsearch:///confirm`
 * to the host form `stuffsearch://confirm`, which expo-router won't route to
 * this screen reliably).
 *
 * This screen just reflects that state: a spinner while the exchange is in
 * flight, or the error (+ a Back-to-sign-in link) if it failed. On success
 * the root navigates to "/".
 */
import React, { useEffect } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/lib/auth';
import { colors } from '../../src/theme';

export default function ConfirmScreen() {
  const { session, linkError } = useAuth();
  const { t } = useTranslation();

  // Safety net: once a session exists the root has already navigated, but if
  // this screen is somehow still mounted, send the user home.
  useEffect(() => {
    if (session) router.replace('/');
  }, [session]);

  if (linkError) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg,
          padding: 24,
        }}>
        <Text style={{ color: colors.text, textAlign: 'center', marginBottom: 16 }}>
          {linkError}
        </Text>
        <TouchableOpacity onPress={() => router.replace('/(auth)/welcome')}>
          <Text style={{ color: colors.primary }}>{t('auth.backToSignIn')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bg,
      }}>
      <ActivityIndicator color={colors.primary} />
      <Text style={{ color: colors.text, marginTop: 12 }}>{t('auth.confirming')}</Text>
    </View>
  );
}