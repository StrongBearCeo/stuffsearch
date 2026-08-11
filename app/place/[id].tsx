/** Place detail: contents + info + edit/delete. */
import React from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { H2, Body, Muted, Card, Screen, Button, ErrorBanner } from '../../src/components/primitives';
import { ExpoImage } from '../../src/components/ExpoImage';
import { ItemCard } from '../../src/components/ItemCard';
import { BoundCodesList } from '../../src/components/BoundCodesList';
import { usePlace, usePlaceContents, useDeletePlace } from '../../src/hooks/usePlaces';
import { useExternalCodes, useUnbindExternalCode } from '../../src/hooks/useExternalCode';
import { useHousehold } from '../../src/lib/household';
import type { Item } from '../../src/lib/supabase';
import { useUiStore } from '../../src/store/ui';
import { spacing, radius } from '../../src/theme';
import { useTranslation } from 'react-i18next';
import { useHeaderTitle } from '../../src/lib/useHeaderTitle';
import { hapticSuccess, hapticWarning } from '../../src/lib/haptics';

export default function PlaceDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  useHeaderTitle(t('places.title'));
  const { activeHouseholdId } = useHousehold();
  const { data: place, isLoading, error } = usePlace(id);
  const { data: contents } = usePlaceContents(id);
  const { data: codes } = useExternalCodes(activeHouseholdId, 'place', id);
  const deletePlace = useDeletePlace();
  const unbind = useUnbindExternalCode('place', id);
  const { setActivePlace } = useUiStore();

  if (isLoading) return <Screen><View style={{ padding: 16 }}><Muted>{t('common.loading')}</Muted></View></Screen>;
  if (error) return <Screen><View style={{ padding: 16 }}><ErrorBanner message={(error as Error).message} /></View></Screen>;
  if (!place) return <Screen><View style={{ padding: 16 }}><Muted>{t('errors.notFound')}</Muted></View></Screen>;

  function onDelete() {
    Alert.alert(t('common.delete'), place!.name, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          hapticWarning();
          await deletePlace.mutateAsync(place!.id);
          router.back();
        },
      },
    ]);
  }

  function onSetActive() {
    setActivePlace(place!.id, place!.name);
    hapticSuccess();
  }

  function onUnbind(codeValue: string, codeId: string) {
    Alert.alert(t('codes.unbind'), codeValue, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('codes.unbind'),
        style: 'destructive',
        onPress: () => {
          hapticWarning();
          unbind.mutate(codeId);
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12, paddingBottom: 40 }}>
        {place.photo_url ? (
          <ExpoImage uri={place.photo_url} style={{ width: '100%', height: 180, borderRadius: radius.mdLg }} />
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <H2>{place.name}</H2>
            {place.description ? <Muted>{place.description}</Muted> : null}
          </View>
          <Button title={t('common.edit')} variant="ghost" onPress={() => router.push({ pathname: '/place/new', params: { id: place.id } } as never)} />
        </View>

        <Button title={t('places.setActive')} onPress={onSetActive} />

        <View style={{ gap: 8 }}>
          <Body style={{ fontWeight: '700' }}>{t('places.contents')}</Body>
          {contents && contents.length > 0 ? (
            contents.map((it: Item) => (
              <ItemCard key={it.id} item={it} onPress={() => router.push(`/item/${it.id}`)} />
            ))
          ) : (
            <Card><Muted>{t('common.empty')}</Muted></Card>
          )}
        </View>

        {codes ? (
          <BoundCodesList codes={codes} onUnbind={(c) => onUnbind(c.code_value, c.id)} />
        ) : null}

        <Button title={t('common.delete')} variant="danger" onPress={onDelete} loading={deletePlace.isPending} />
      </ScrollView>
    </Screen>
  );
}
