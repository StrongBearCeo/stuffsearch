/** Settings: language, voice provider, account, sign out. */
import React from 'react';
import { ScrollView, Text, TouchableOpacity, Alert } from 'react-native';
import { Screen, H1, H2, Muted, Card, Button } from '../src/components/primitives';
import { useAuth } from '../src/lib/auth';
import { setLanguage, LANGUAGES, type AppLanguage } from '../src/lib/i18n';
import { colors, spacing, radius } from '../src/theme';
import { useTranslation } from 'react-i18next';
import { supabase } from '../src/lib/supabase';
import { useHeaderTitle } from '../src/lib/useHeaderTitle';
import { hapticSuccess } from '../src/lib/haptics';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { profile, signOut } = useAuth();
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
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12, paddingBottom: 40 }}>
        <H1>{t('settings.title')}</H1>

        <Card style={{ gap: 8 }}>
          <H2>{t('settings.language')}</H2>
          {(Object.keys(LANGUAGES) as AppLanguage[]).map((l) => (
            <LangRow key={l} label={LANGUAGES[l]} active={currentLang === l} onPress={() => pickLanguage(l)} />
          ))}
        </Card>

        <Card>
          <H2>{t('settings.account')}</H2>
          <Muted>{profile?.display_name ?? profile?.id?.slice(0, 8)}</Muted>
          <Button title={t('auth.signOut')} variant="danger" onPress={onSignOut} style={{ marginTop: 8 }} />
        </Card>

        <Card>
          <H2>{t('settings.about')}</H2>
          <Muted>{t('app.tagline')}</Muted>
          <Muted style={{ marginTop: 8, fontSize: 11 }}>{t('settings.securityNote')}</Muted>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function LangRow({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: radius.md,
        backgroundColor: active ? colors.primary + '22' : 'transparent',
      }}
    >
      <Text style={{ color: active ? colors.primary : colors.text, fontWeight: '600' }}>{label}</Text>
      {active ? <Text style={{ color: colors.primary }}>✓</Text> : null}
    </TouchableOpacity>
  );
}
