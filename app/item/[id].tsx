/** Item detail: photo, info, location, history, bound codes, move/edit/delete. */
import React, { useState } from 'react';
import { View, ScrollView, Text, TouchableOpacity, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { H2, Body, Muted, Card, Screen, Button, ErrorBanner } from '../../src/components/primitives';
import { ExpoImage } from '../../src/components/ExpoImage';
import { BoundCodesList } from '../../src/components/BoundCodesList';
import { useItem, useItemHistory, useDeleteItem, useMoveItem } from '../../src/hooks/useItems';
import { usePlaces } from '../../src/hooks/usePlaces';
import { useExternalCodes, useUnbindExternalCode } from '../../src/hooks/useExternalCode';
import { useHousehold } from '../../src/lib/household';
import type { Place, ItemHistory } from '../../src/lib/supabase';
import { colors, spacing } from '../../src/theme';
import { useTranslation } from 'react-i18next';
import { useHeaderTitle } from '../../src/lib/useHeaderTitle';
import { hapticWarning } from '../../src/lib/haptics';

export default function ItemDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  useHeaderTitle(t('items.title'));
  const { activeHouseholdId } = useHousehold();
  const { data: item, isLoading, error } = useItem(id);
  const { data: history } = useItemHistory(id);
  const { data: codes } = useExternalCodes(activeHouseholdId, 'item', id);
  const { data: places } = usePlaces();
  const deleteItem = useDeleteItem();
  const moveItem = useMoveItem();
  const unbind = useUnbindExternalCode('item', id);

  const [movePicker, setMovePicker] = useState(false);

  if (isLoading) {
    return <Screen><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Muted>{t('common.loading')}</Muted></View></Screen>;
  }
  if (error) return <Screen><View style={{ padding: 16 }}><ErrorBanner message={(error as Error).message} /></View></Screen>;
  if (!item) return <Screen><View style={{ padding: 16 }}><Muted>{t('errors.notFound')}</Muted></View></Screen>;

  const place = places?.find((p: Place) => p.id === item.current_place_id);

  function onDelete() {
    Alert.alert(t('common.delete'), item!.name, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          hapticWarning();
          await deleteItem.mutateAsync(item!.id);
          router.back();
        },
      },
    ]);
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

  function onMove(placeId: string | null) {
    moveItem.mutate({ itemId: item!.id, placeId });
    setMovePicker(false);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12, paddingBottom: 40 }}>
        {item.photo_urls?.[0] ? (
          <ExpoImage uri={item.photo_urls[0]} style={{ width: '100%', height: 220, borderRadius: 12 }} />
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <H2>{item.name}</H2>
            {item.category ? <Muted>{item.category}</Muted> : null}
          </View>
          <Button title={t('common.edit')} variant="ghost" onPress={() => router.push({ pathname: '/item/new', params: { id: item.id } } as never)} />
        </View>
        {item.description ? <Body>{item.description}</Body> : null}

        <Card>
          <Body style={{ fontWeight: '600' }}>{t('items.location')}</Body>
          <Muted>{place ? place.name : t('items.notLocated')}</Muted>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Button title={t('items.location')} onPress={() => setMovePicker(!movePicker)} />
          </View>
          {movePicker ? (
            <View style={{ marginTop: 8, gap: 4 }}>
              <PlaceOption label={t('items.notLocated')} onPress={() => onMove(null)} />
              {places?.map((p: Place) => (
                <PlaceOption key={p.id} label={p.name} onPress={() => onMove(p.id)} selected={p.id === item.current_place_id} />
              ))}
            </View>
          ) : null}
        </Card>

        {item.product_link ? (
          <Card>
            <Body style={{ fontWeight: '600' }}>{t('items.productLink')}</Body>
            <Muted numberOfLines={1}>{item.product_link}</Muted>
          </Card>
        ) : null}

        {codes ? (
          <BoundCodesList codes={codes} onUnbind={(c) => onUnbind(c.code_value, c.id)} />
        ) : null}

        <View style={{ gap: 8 }}>
          <Body style={{ fontWeight: '700' }}>{t('items.history')}</Body>
          {history && history.length > 0 ? (
            history.map((h: ItemHistory) => (
              <Card key={h.id}>
                <Muted>{new Date(h.moved_at).toLocaleString()}</Muted>
                <Body>{h.note ?? t('items.location')}</Body>
              </Card>
            ))
          ) : (
            <Muted>{t('common.empty')}</Muted>
          )}
        </View>

        <Button title={t('common.delete')} variant="danger" onPress={onDelete} loading={deleteItem.isPending} />
      </ScrollView>
    </Screen>
  );
}

function PlaceOption({ label, onPress, selected }: { label: string; onPress: () => void; selected?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: selected ? colors.primary + '33' : colors.surfaceAlt, borderRadius: 6 }}>
      <Text style={{ color: selected ? colors.primary : colors.text }}>{label}</Text>
    </TouchableOpacity>
  );
}
