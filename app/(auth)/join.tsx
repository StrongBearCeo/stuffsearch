/** Join household via invite token (paste or scan). */
import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { H1, Muted, Input, Button, Screen, ErrorBanner } from '../../src/components/primitives';
import { spacing } from '../../src/theme';
import { useHousehold } from '../../src/lib/household';
import { useTranslation } from 'react-i18next';

export default function JoinScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { joinByInviteToken } = useHousehold();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await joinByInviteToken(token.trim());
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: 16 }}>
        <H1>{t('household.join')}</H1>
        <Muted>{t('household.joinPrompt')}</Muted>
        <Input
          placeholder="invite token"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {error ? <ErrorBanner message={error} /> : null}
        <Button title={t('household.join')} onPress={submit} loading={busy} disabled={!token.trim()} />
      </ScrollView>
    </Screen>
  );
}
