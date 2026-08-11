/** Create a new household. */
import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Screen, H1, Muted, Input, Button, ErrorBanner } from '../../src/components/primitives';
import { useHousehold } from '../../src/lib/household';
import { errorMessage } from '../../src/lib/errors';
import { spacing } from '../../src/theme';
import { useTranslation } from 'react-i18next';
import { useHeaderTitle } from '../../src/lib/useHeaderTitle';
import { hapticSuccess } from '../../src/lib/haptics';

export default function NewHouseholdScreen() {
  const { t } = useTranslation();
  const { createHousehold } = useHousehold();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useHeaderTitle(t('household.create'));

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await createHousehold(name.trim());
      hapticSuccess();
      router.replace('/(tabs)');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12 }}>
        <H1>{t('household.create')}</H1>
        <Muted>{t('household.createPrompt')}</Muted>
        <Input placeholder={t('household.name')} value={name} onChangeText={setName} />
        {error ? <ErrorBanner message={error} /> : null}
        <Button title={t('common.create')} onPress={submit} loading={busy} disabled={!name.trim()} />
      </ScrollView>
    </Screen>
  );
}
