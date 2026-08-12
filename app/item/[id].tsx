/** Item detail: photo, info, location, history, bound codes, move/edit/delete. */
import React, { useState } from 'react';
import { View, ScrollView, Text, TouchableOpacity, Alert, Linking, Share } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { H2, Body, Muted, Card, Screen, MaxWidth, Button, ErrorBanner } from '../../src/components/primitives';
import { ExpoImage } from '../../src/components/ExpoImage';
import { BoundCodesList } from '../../src/components/BoundCodesList';
import { ScanCameraModal } from '../../src/components/ScanCameraModal';
import { normalizeUrl } from '../../src/lib/url';
import { noteToTemplate } from '../../src/lib/historyNote';
import { appQrPayload } from '../../src/lib/qrcode';
import { printAndShareCode } from '../../src/lib/print';
import { CreatePlaceSheet } from '../../src/components/CreatePlaceSheet';
import { useItem, useItemHistory, useDeleteItem, useMoveItem } from '../../src/hooks/useItems';
import { useConvertItemToPlace } from '../../src/hooks/useConvertItemToPlace';
import { useCreatePlace } from '../../src/hooks/usePlaces';
import { useScan } from '../../src/hooks/useScan';
import { usePlaces } from '../../src/hooks/usePlaces';
import { useExternalCodes, useBindExternalCode, useUnbindExternalCode } from '../../src/hooks/useExternalCode';
import { useHousehold } from '../../src/lib/household';
import { useAuth } from '../../src/lib/auth';
import { scannerTypeToCodeType } from '../../src/lib/constants';
import type { Place, ItemHistory, ExternalCodeType } from '../../src/lib/supabase';
import { colors, spacing, radius, tint } from '../../src/theme';
import { useTranslation } from 'react-i18next';
import { useHeaderTitle } from '../../src/lib/useHeaderTitle';
import { hapticSuccess, hapticWarning } from '../../src/lib/haptics';

export default function ItemDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  useHeaderTitle(t('items.title'));
  const { activeHouseholdId } = useHousehold();
  const { user } = useAuth();
  const { data: item, isLoading, error } = useItem(id);
  const { data: history } = useItemHistory(id);
  const { data: codes } = useExternalCodes(activeHouseholdId, 'item', id);
  const { data: places } = usePlaces();
  const deleteItem = useDeleteItem();
  const moveItem = useMoveItem();
  const convertToPlace = useConvertItemToPlace();
  const createPlace = useCreatePlace();
  const bind = useBindExternalCode();
  const unbind = useUnbindExternalCode('item', id);
  const { resolve } = useScan();

  const [movePicker, setMovePicker] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [pendingPlace, setPendingPlace] = useState<{ value: string; type: ExternalCodeType } | null>(null);

  if (isLoading) {
    return <Screen><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Muted>{t('common.loading')}</Muted></View></Screen>;
  }
  if (error) return <Screen><View style={{ padding: 16 }}><ErrorBanner message={(error as Error).message} /></View></Screen>;
  if (!item) return <Screen><View style={{ padding: 16 }}><Muted>{t('errors.notFound')}</Muted></View></Screen>;

  const place = places?.find((p: Place) => p.id === item.current_place_id);
  // The item's own app-QR deep-link (for display + share). Computed once.
  const token = item.qr_token;
  const qrPayload = token ? appQrPayload('item', token, activeHouseholdId ?? undefined) : null;

  /** Open the product link in the system browser. Falls back to an alert if
   *  no app can handle the URL. */
  function onOpenProductLink() {
    const url = normalizeUrl(item!.product_link);
    if (!url) return;
    Linking.openURL(url).catch(() => {
      Alert.alert(t('items.productLink'), t('errors.generic'));
    });
  }

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

  /** Convert this item into a place via the atomic RPC. On success the item is
   *  gone and a place exists in its place — navigate there (replace, so Back
   *  doesn't return to the now-deleted item screen). */
  function onConvertToPlace() {
    Alert.alert(t('items.convertTitle'), t('items.convertMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('items.convertToPlace'),
        onPress: async () => {
          try {
            const placeId = await convertToPlace.mutateAsync(item!.id);
            hapticSuccess();
            router.replace(`/place/${placeId}` as never);
          } catch (e) {
            Alert.alert(t('errors.generic'), e instanceof Error ? e.message : undefined);
          }
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

  /** Resolve a scanned code from the item screen. Only a place in the active
   * household is meaningful here — we set this item's location to it. */
  async function onScanLocation(payload: string, rawType?: string) {
    const o = await resolve(payload);
    if (!o) {
      setScanOpen(false);
      return;
    }
    if (o.type === 'matched') {
      const m = o.matches[0];
      if (m.entity_type !== 'place') {
        hapticWarning();
        setPrompt(t('items.scanNotAPlace'));
        return; // keep camera open so the user can retry
      }
      if (!o.inActiveHousehold) {
        hapticWarning();
        setPrompt(t('scanResolve.switchPrompt', { name: '', household: '' }));
        return;
      }
      moveItem.mutate(
        { itemId: item!.id, placeId: m.entity_id, noteKey: 'scanned_to' },
        {
          onSuccess: () => {
            hapticSuccess();
            setPrompt(t('items.scannedToPlace'));
          },
        },
      );
      setScanOpen(false);
    } else if (o.type === 'no-match') {
      // Unknown code → offer to create a place for it inline.
      setPendingPlace({ value: o.codeValue, type: scannerTypeToCodeType(rawType ?? 'other') });
      setScanOpen(false);
    }
  }

  /** Create a place from the pending scanned code, bind the code to it, then
   *  move this item into the new place. Runs from the CreatePlaceSheet. */
  async function onCreatePendingPlace(values: { name: string; description: string }) {
    if (!activeHouseholdId || !user || !pendingPlace || !item) return;
    const created = await createPlace.mutateAsync({
      name: values.name,
      description: values.description || null,
    });
    await bind.mutateAsync({
      householdId: activeHouseholdId,
      codeValue: pendingPlace.value,
      codeType: scannerTypeToCodeType(pendingPlace.type),
      entityType: 'place',
      entityId: created.id,
      boundBy: user.id,
    });
    await new Promise<void>((resolveMove, rejectMove) => {
      moveItem.mutate(
        { itemId: item.id, placeId: created.id, noteKey: 'scanned_new' },
        {
          onSuccess: () => resolveMove(),
          onError: (e) => rejectMove(e),
        },
      );
    });
    hapticSuccess();
    setPendingPlace(null);
    setPrompt(t('items.scannedToPlace'));
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ alignItems: 'center' }}>
        <MaxWidth style={{ padding: spacing.lg, gap: 12, paddingBottom: 40 }}>
        {item.photo_urls && item.photo_urls.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
          >
            {item.photo_urls.map((uri, i) => (
              <ExpoImage
                key={`${uri}-${i}`}
                uri={uri}
                style={{ width: 220, height: 220, borderRadius: radius.mdLg }}
              />
            ))}
          </ScrollView>
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
          {/* Location header: label + the current place name (or empty state). */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 18 }}>📍</Text>
            <View style={{ flex: 1 }}>
              <Muted style={{ fontSize: 11, textTransform: 'uppercase' }}>{t('items.location')}</Muted>
              {place ? (
                <Body style={{ fontWeight: '700', fontSize: 17 }}>{place.name}</Body>
              ) : (
                <Body style={{ fontStyle: 'italic', color: colors.textMuted }}>{t('items.notLocated')}</Body>
              )}
            </View>
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Button
              title={movePicker ? t('common.cancel') : t('items.changeLocation')}
              variant="ghost"
              onPress={() => setMovePicker(!movePicker)}
            />
            <Button title={t('items.scanSetLocation')} variant="ghost" onPress={() => setScanOpen(true)} />
          </View>

          {/* Inline place picker */}
          {movePicker ? (
            <View style={{ marginTop: 12, gap: 4 }}>
              <Muted style={{ fontSize: 11, marginBottom: 4 }}>{t('items.moveTo')}</Muted>
              <PlaceOption label={t('items.notLocated')} onPress={() => onMove(null)} selected={!item.current_place_id} />
              {places?.map((p: Place) => (
                <PlaceOption key={p.id} label={p.name} onPress={() => onMove(p.id)} selected={p.id === item.current_place_id} />
              ))}
            </View>
          ) : null}
        </Card>

        {prompt ? (
          <Card>
            <Body style={{ fontWeight: '600' }}>{prompt}</Body>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Button title={t('common.done')} onPress={() => setPrompt(null)} />
            </View>
          </Card>
        ) : null}

        {item.product_link ? (
          <TouchableOpacity onPress={onOpenProductLink} activeOpacity={0.6} accessibilityRole="link" accessibilityLabel={t('items.productLink')}>
            <Card>
              <Body style={{ fontWeight: '600' }}>{t('items.productLink')}</Body>
              <Text style={{ color: colors.primary, fontSize: 13 }} numberOfLines={1}>
                {item.product_link}
              </Text>
            </Card>
          </TouchableOpacity>
        ) : null}

        {qrPayload ? (
          <Card style={{ alignItems: 'center', gap: 8 }}>
            <Body style={{ fontWeight: '600', alignSelf: 'flex-start' }}>{t('items.qrCode')}</Body>
            <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: radius.md }}>
              <QRCode
                value={qrPayload}
                size={180}
                backgroundColor="#fff"
                color={colors.bg}
              />
            </View>
            <Muted style={{ textAlign: 'center' }}>{t('items.qrHint')}</Muted>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                title={t('items.shareQr')}
                variant="ghost"
                onPress={() => {
                  Share.share({ message: qrPayload }).catch(() => {});
                }}
              />
              <Button
                title={t('print.print')}
                variant="ghost"
                onPress={async () => {
                  try {
                    const ok = await printAndShareCode({ name: item.name, payload: qrPayload, kind: 'item' });
                    if (!ok) Alert.alert(t('print.print'), t('print.shareUnavailable'));
                  } catch (e) {
                    Alert.alert(t('errors.generic'), e instanceof Error ? e.message : undefined);
                  }
                }}
              />
            </View>
          </Card>
        ) : null}

        {codes ? (
          <BoundCodesList codes={codes} onUnbind={(c) => onUnbind(c.code_value, c.id)} />
        ) : null}

        <View style={{ gap: 8 }}>
          <Body style={{ fontWeight: '700' }}>{t('items.history')}</Body>
          {history && history.length > 0 ? (
            history.map((h: ItemHistory) => {
              const tpl = noteToTemplate(h.note);
              const label = tpl ? t(tpl.templateKey, tpl.params) : (h.note ?? t('items.location'));
              return (
                <Card key={h.id}>
                  <Muted>{new Date(h.moved_at).toLocaleString()}</Muted>
                  <Body>{label}</Body>
                </Card>
              );
            })
          ) : (
            <Muted>{t('common.empty')}</Muted>
          )}
        </View>

        <Button title={t('items.convertToPlace')} variant="ghost" onPress={onConvertToPlace} loading={convertToPlace.isPending} />
        <Button title={t('common.delete')} variant="danger" onPress={onDelete} loading={deleteItem.isPending} />
        </MaxWidth>
      </ScrollView>

      <ScanCameraModal
        visible={scanOpen}
        hint={t('items.scanSetLocation')}
        onClose={() => setScanOpen(false)}
        onScan={onScanLocation}
      />

      <CreatePlaceSheet
        visible={!!pendingPlace}
        codeValue={pendingPlace?.value ?? ''}
        onCreate={onCreatePendingPlace}
        onClose={() => setPendingPlace(null)}
      />
    </Screen>
  );
}

function PlaceOption({ label, onPress, selected }: { label: string; onPress: () => void; selected?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: selected ? tint(colors.primary, '33') : colors.surfaceAlt, borderRadius: radius.sm }}>
      <Text style={{ color: selected ? colors.primary : colors.text }}>{label}</Text>
    </TouchableOpacity>
  );
}
