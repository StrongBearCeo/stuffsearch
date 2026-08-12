/** Print screen: pick items/places (that have an app QR token) and print/share
 *  a PDF sheet of their QR labels.
 *
 *  Only entities WITH a qr_token are listed — you can't print a code for
 *  something that doesn't have one. (Items/places get a token on creation.) */
import React, { useMemo, useState } from 'react';
import { View, ScrollView, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Screen, H1, Muted, Body, Button, EmptyState, MaxWidth, ErrorBanner } from '../src/components/primitives';
import { useItems } from '../src/hooks/useItems';
import { usePlaces } from '../src/hooks/usePlaces';
import { buildPrintHtml, type PrintableCode, appQrPayload } from '../src/lib/qrcode';
import { useHousehold } from '../src/lib/household';
import { useResponsive } from '../src/hooks/useResponsive';
import type { Item, Place } from '../src/lib/supabase';
import { colors, spacing, radius, tint } from '../src/theme';
import { useTranslation } from 'react-i18next';
import { useHeaderTitle } from '../src/lib/useHeaderTitle';

export default function PrintScreen() {
  const { t } = useTranslation();
  const { activeHouseholdId } = useHousehold();
  const items = useItems();
  const places = usePlaces();
  const { isWide } = useResponsive();
  useHeaderTitle(t('print.title'));
  const loading = items.isLoading || places.isLoading;

  // Only entities that have a qr_token can be printed.
  const printableItems = useMemo(
    () => (items.data ?? []).filter((i: Item) => !!i.qr_token),
    [items.data],
  );
  const printablePlaces = useMemo(
    () => (places.data ?? []).filter((p: Place) => !!p.qr_token),
    [places.data],
  );

  // Selection is tracked by a composite key ("item:<id>" / "place:<id>").
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const allKeys = useMemo(
    () => [
      ...printableItems.map((i) => `item:${i.id}`),
      ...printablePlaces.map((p) => `place:${p.id}`),
    ],
    [printableItems, printablePlaces],
  );

  function selectAll() {
    setSelected(new Set(allKeys));
  }
  function clearAll() {
    setSelected(new Set());
  }

  function toPrintable(key: string): PrintableCode | null {
    const [kind, id] = key.split(':');
    if (kind === 'item') {
      const it = printableItems.find((i) => i.id === id);
      if (!it?.qr_token) return null;
      return { name: it.name, payload: appQrPayload('item', it.qr_token, activeHouseholdId ?? undefined), kind: 'item' };
    }
    if (kind === 'place') {
      const pl = printablePlaces.find((p) => p.id === id);
      if (!pl?.qr_token) return null;
      return { name: pl.name, payload: appQrPayload('place', pl.qr_token, activeHouseholdId ?? undefined), kind: 'place' };
    }
    return null;
  }

  async function onPrint() {
    setError(null);
    const codes = [...selected].map(toPrintable).filter((c): c is PrintableCode => !!c);
    if (codes.length === 0) return;
    setBusy(true);
    try {
      const html = await buildPrintHtml(codes);
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'StuffSearch codes' });
      } else {
        setError(t('print.shareUnavailable'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  const nothingToPrint = printableItems.length === 0 && printablePlaces.length === 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ alignItems: 'center' }}>
        <MaxWidth style={{ padding: spacing.lg, gap: 12, paddingBottom: spacing.xl }}>
          <H1>{t('print.title')}</H1>
          <Muted>{t('print.hint')}</Muted>

          {error ? <ErrorBanner message={error} /> : null}

          {loading ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : nothingToPrint ? (
            <EmptyState title={t('print.nothing')} />
          ) : (
            <>
              {/* Selection toolbar */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {t('print.selected', { count: selected.size })}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={selectAll} hitSlop={{ top: 8, bottom: 8 }}>
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('print.selectAll')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={clearAll} hitSlop={{ top: 8, bottom: 8 }}>
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('print.selectNone')}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {printableItems.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <Body style={{ fontWeight: '700' }}>{t('print.itemsSection')}</Body>
                  <View style={isWide ? { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } : { gap: 8 }}>
                    {printableItems.map((i) => (
                      <CheckRow
                        key={`item:${i.id}`}
                        label={i.name}
                        selected={selected.has(`item:${i.id}`)}
                        onPress={() => toggle(`item:${i.id}`)}
                        wide={isWide}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {printablePlaces.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <Body style={{ fontWeight: '700' }}>{t('print.placesSection')}</Body>
                  <View style={isWide ? { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } : { gap: 8 }}>
                    {printablePlaces.map((p) => (
                      <CheckRow
                        key={`place:${p.id}`}
                        label={p.name}
                        selected={selected.has(`place:${p.id}`)}
                        onPress={() => toggle(`place:${p.id}`)}
                        wide={isWide}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              <Button
                title={t('print.print')}
                onPress={onPrint}
                loading={busy}
                disabled={selected.size === 0 || busy}
              />
            </>
          )}
        </MaxWidth>
      </ScrollView>
    </Screen>
  );
}

function CheckRow({
  label,
  selected,
  onPress,
  wide,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  wide?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={selected ? { checked: true } : undefined}
      accessibilityLabel={label}
      style={{ flex: wide ? undefined : 1, width: wide ? '48%' : undefined }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: selected ? tint(colors.primary) : colors.surface,
          borderWidth: 1,
          borderColor: selected ? colors.primary : colors.border,
          borderRadius: radius.md,
          padding: 12,
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            borderWidth: 2,
            borderColor: selected ? colors.primary : colors.border,
            backgroundColor: selected ? colors.primary : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected ? <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✓</Text> : null}
        </View>
        <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}
