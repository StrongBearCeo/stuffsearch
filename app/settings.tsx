/** Settings: language, voice provider, account, sign out. */
import React from 'react';
import { View, ScrollView, Text, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, H1, H2, Body, Muted, Card, Button, MaxWidth } from '../src/components/primitives';
import { useAuth } from '../src/lib/auth';
import { setLanguage, LANGUAGES, type AppLanguage } from '../src/lib/i18n';
import { colors, spacing, radius, tint } from '../src/theme';
import { useTranslation } from 'react-i18next';
import { supabase } from '../src/lib/supabase';
import { useHeaderTitle } from '../src/lib/useHeaderTitle';
import { hapticSuccess } from '../src/lib/haptics';
import { replayTutorial } from '../src/lib/tutorial';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { profile, user, signOut } = useAuth();
  const router = useRouter();
  const currentLang = (i18n.language as AppLanguage) ?? 'en';
  useHeaderTitle(t('settings.title'));

  async function pickLanguage(lng: AppLanguage) {
    await setLanguage(lng);
    hapticSuccess();
    if (profile) {
      await supabase.from('profiles').update({ default_language: lng }).eq('id', profile.id);
    }
  }

  function onSignOut() {
    Alert.alert(t('auth.signOut'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('auth.signOut'), style: 'destructive', onPress: () => signOut() },
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ alignItems: 'center' }}>
        <MaxWidth style={{ padding: spacing.lg, gap: 12, paddingBottom: 40, width: '100%' }}>
        <H1>{t('settings.title')}</H1>

        <Card style={{ gap: 8 }}>
          <H2>{t('settings.language')}</H2>
          {(Object.keys(LANGUAGES) as AppLanguage[]).map((l) => (
            <LangRow key={l} label={LANGUAGES[l]} active={currentLang === l} onPress={() => pickLanguage(l)} />
          ))}
        </Card>

        <Card style={{ gap: 4 }}>
          <H2>{t('settings.account')}</H2>
          {profile?.display_name ? <Body style={{ fontWeight: '600' }}>{profile.display_name}</Body> : null}
          {user?.email ? <Muted>{user.email}</Muted> : null}
          <Button title={t('auth.signOut')} variant="danger" onPress={onSignOut} style={{ marginTop: 8 }} />
        </Card>

        <TouchableOpacity onPress={() => router.push('/print' as never)} accessibilityRole="button">
          <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Body style={{ fontWeight: '600' }}>{t('print.title')}</Body>
              <Muted>{t('print.hint')}</Muted>
            </View>
            <Text style={{ color: colors.primary, fontSize: 22 }}>🖨️</Text>
          </Card>
        </TouchableOpacity>

        <Card>
          <H2>{t('settings.about')}</H2>
          <Muted>{t('app.tagline')}</Muted>
          <Muted style={{ marginTop: 8, fontSize: 11 }}>{t('settings.securityNote')}</Muted>
        </Card>

        {/* Help + replay tutorial */}
        <TouchableOpacity onPress={() => router.push('/help' as never)} accessibilityRole="button">
          <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '600' }}>{t('help.title')}</Body>
            <Text style={{ color: colors.primary, fontSize: 22 }}>❓</Text>
          </Card>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { hapticSuccess(); replayTutorial(); }}
          accessibilityRole="button"
        >
          <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '600' }}>{t('tutorial.stepWelcome')}</Body>
            <Text style={{ color: colors.primary, fontSize: 22 }}>🔄</Text>
          </Card>
        </TouchableOpacity>
        </MaxWidth>
      </ScrollView>
    </Screen>
  );
}

function LangRow({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={active ? { selected: true } : undefined}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: radius.md,
        backgroundColor: active ? tint(colors.primary) : 'transparent',
      }}
    >
      <Text style={{ color: active ? colors.primary : colors.text, fontWeight: '600' }}>{label}</Text>
      {active ? <Text style={{ color: colors.primary }}>✓</Text> : null}
    </TouchableOpacity>
  );
}
