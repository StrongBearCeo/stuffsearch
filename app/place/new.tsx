/** Create or edit a place. Supports a prefilled external code (from scan). */
import React, { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, H1, Input, Muted, Card, Button, ErrorBanner } from '../../src/components/primitives';
import { useCreatePlace, useUpdatePlace, usePlace } from '../../src/hooks/usePlaces';
import { useBindExternalCode } from '../../src/hooks/useExternalCode';
import { useHousehold } from '../../src/lib/household';
import { useAuth } from '../../src/lib/auth';
import { errorMessage } from '../../src/lib/errors';
import { scannerTypeToCodeType } from '../../src/lib/constants';
import { spacing } from '../../src/theme';
import { useTranslation } from 'react-i18next';
import { useHeaderTitle } from '../../src/lib/useHeaderTitle';
import { hapticSuccess } from '../../src/lib/haptics';
import type { ExternalCodeType } from '../../src/lib/supabase';

export default function NewPlaceScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string; code?: string; type?: string; name?: string }>();
  const editing = !!params.id;
  useHeaderTitle(editing ? t('common.edit') : t('places.new'));
  const { data: existing } = usePlace(params.id);

  const { activeHouseholdId } = useHousehold();
  const { user } = useAuth();
  const createPlace = useCreatePlace();
  const updatePlace = useUpdatePlace();
  const bind = useBindExternalCode();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing && existing) {
      setName(existing.name);
      setDescription(existing.description ?? '');
    } else {
      setName(params.name ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, params.name]);

  async function onSave() {
    if (!name.trim()) return;
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
      };
      let placeId: string;
      if (editing && params.id) {
        const updated = await updatePlace.mutateAsync({ id: params.id, patch: payload });
        placeId = updated.id;
      } else {
        const created = await createPlace.mutateAsync(payload);
        placeId = created.id;
        if (params.code && activeHouseholdId && user) {
          const codeType = (params.type as ExternalCodeType) ?? 'other';
          await bind.mutateAsync({
            householdId: activeHouseholdId,
            codeValue: params.code,
            codeType: scannerTypeToCodeType(codeType === 'other' ? 'other' : codeType),
            entityType: 'place',
            entityId: placeId,
            boundBy: user.id,
          });
        }
      }
      hapticSuccess();
      router.replace(`/place/${placeId}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const nameEmpty = name.trim().length === 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12 }}>
        <H1>{editing ? t('common.edit') : t('places.new')}</H1>
        {params.code ? (
          <Card>
            <Muted>{t('codes.value')}</Muted>
            <Text style={{ color: '#fff', fontFamily: 'monospace' }}>{params.code}</Text>
          </Card>
        ) : null}
        <Input placeholder={t('places.name')} value={name} onChangeText={setName} />
        <Input
          placeholder={t('places.description')}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          style={{ minHeight: 80 }}
        />
        {error ? <ErrorBanner message={error} /> : null}
        <Button
          title={t('common.save')}
          onPress={onSave}
          loading={createPlace.isPending || updatePlace.isPending}
          disabled={nameEmpty}
        />
      </ScrollView>
    </Screen>
  );
}
