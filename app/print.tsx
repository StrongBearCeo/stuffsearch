/** Print screen: list items/places lacking app codes and print/share a sheet. */
import React, { useMemo } from 'react';
import { ScrollView } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Screen, H1, Muted, Card, Body, Button, EmptyState } from '../src/components/primitives';
import { useItems } from '../src/hooks/useItems';
import { usePlaces } from '../src/hooks/usePlaces';
import { buildPrintHtml, type PrintableCode } from '../src/lib/qrcode';
import { appQrPayload } from '../src/lib/qrcode';
import { useHousehold } from '../src/lib/household';
import type { Item, Place } from '../src/lib/supabase';
import { spacing } from '../src/theme';
import { useTranslation } from 'react-i18next';

export default function PrintScreen() {
  const { t } = useTranslation();
  const { activeHouseholdId } = useHousehold();
  const items = useItems();
  const places = usePlaces();

  const printable: PrintableCode[] = useMemo(() => {
    const hh = activeHouseholdId ?? '';
    const it = (items.data ?? [])
      .filter((i: Item) => !i.qr_token)
      .map((i: Item) => ({ name: i.name, payload: appQrPayload('item', i.qr_token ?? '', hh), kind: 'item' as const }));
    const pl = (places.data ?? [])
      .filter((p: Place) => !p.qr_token)
      .map((p: Place) => ({ name: p.name, payload: appQrPayload('place', p.qr_token ?? '', hh), kind: 'place' as const }));
    return [...it, ...pl];
  }, [items.data, places.data, activeHouseholdId]);

  async function onPrint() {
    const html = buildPrintHtml(printable);
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'StuffSearch codes' });
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12 }}>
        <H1>{t('print.title')}</H1>
        <Muted>{t('print.hint')}</Muted>
        {printable.length === 0 ? (
          <EmptyState title={t('print.nothing')} />
        ) : (
          <>
            <Body style={{ fontWeight: '700' }}>{t('print.itemsSection')}</Body>
            {(items.data ?? []).filter((i: Item) => !i.qr_token).map((i: Item) => (
              <Card key={i.id}><Body>{i.name}</Body></Card>
            ))}
            <Body style={{ fontWeight: '700' }}>{t('print.placesSection')}</Body>
            {(places.data ?? []).filter((p: Place) => !p.qr_token).map((p: Place) => (
              <Card key={p.id}><Body>{p.name}</Body></Card>
            ))}
            <Button title={t('print.print')} onPress={onPrint} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
