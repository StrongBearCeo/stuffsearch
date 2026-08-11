/** Welcome / sign-in screen. Magic link + password (per user choice). */
import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { H1, Muted, Input, Button, Screen } from '../../src/components/primitives';
import { ErrorBanner } from '../../src/components/primitives';
import { colors, spacing } from '../../src/theme';
import { useAuth } from '../../src/lib/auth';
import { useTranslation } from 'react-i18next';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signInWithPassword, signUpWithPassword, sendMagicLink } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup' | 'magic'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'magic') {
        await sendMagicLink(email.trim());
        setInfo(t('auth.magicLinkSent'));
      } else if (mode === 'signup') {
        await signUpWithPassword(email.trim(), password, name.trim() || undefined);
        setInfo(t('auth.magicLinkSent'));
      } else {
        await signInWithPassword(email.trim(), password);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: 16, justifyContent: 'center', flex: 1 }}>
          <View style={{ gap: 4, marginBottom: 16 }}>
            <H1>{t('auth.welcome')}</H1>
            <Muted>{t('auth.subtitle')}</Muted>
          </View>

          {mode === 'signup' ? (
            <Input placeholder={t('auth.displayName')} value={name} onChangeText={setName} />
          ) : null}
          <Input
            placeholder={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          {mode !== 'magic' ? (
            <Input
              placeholder={t('auth.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType={mode === 'signin' ? 'password' : 'newPassword'}
            />
          ) : null}

          {error ? <ErrorBanner message={error} /> : null}
          {info ? (
            <View style={{ backgroundColor: colors.success + '22', padding: 10, borderRadius: 8 }}>
              <Text style={{ color: colors.success }}>{info}</Text>
            </View>
          ) : null}

          <Button
            title={
              mode === 'magic'
                ? t('auth.sendMagicLink')
                : mode === 'signup'
                  ? t('auth.signUp')
                  : t('auth.signIn')
            }
            onPress={submit}
            loading={busy}
          />

          {/* Mode switcher */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 8 }}>
            <ModeLink active={mode === 'signin'} label={t('auth.haveAccount')} action={t('auth.signIn')} onPress={() => setMode('signin')} />
            <ModeLink active={mode === 'signup'} label={t('auth.noAccount')} action={t('auth.signUp')} onPress={() => setMode('signup')} />
          </View>
          <ModeLink
            center
            active={mode === 'magic'}
            label=""
            action={t('auth.sendMagicLink')}
            onPress={() => setMode('magic')}
          />

          <Button title={t('auth.useInvite')} variant="ghost" onPress={() => router.push('/(auth)/join')} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ModeLink({
  active,
  label,
  action,
  onPress,
  center,
}: {
  active: boolean;
  label: string;
  action: string;
  onPress: () => void;
  center?: boolean;
}) {
  return (
    <View style={{ flexDirection: center ? 'row' : 'column', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      <Text onPress={onPress} style={{ color: active ? colors.text : colors.primary, fontWeight: '700', fontSize: 14 }}>
        {action}
      </Text>
    </View>
  );
}
