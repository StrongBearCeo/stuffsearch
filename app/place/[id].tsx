/** Place detail: contents + child places + info + edit/delete.
 *  Scan-to-add: scanning an item moves it in here; scanning a place reparents
 *  it in here; an unknown code opens the new-item form with this place prefilled. */
import React, { useState } from 'react';
import { View, ScrollView, Text, TouchableOpacity, Alert, Share } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { H2, Body, Muted, Card, Screen, MaxWidth, Button, ErrorBanner } from '../../src/components/primitives';
import { ExpoImage } from '../../src/components/ExpoImage';
import { ItemCard } from '../../src/components/ItemCard';
import { BoundCodesList } from '../../src/components/BoundCodesList';
import { ScanCameraModal } from '../../src/components/ScanCameraModal';
import { usePlace, usePlaceContents, usePlaceChildren, usePlaces, useDeletePlace, useUpdatePlace } from '../../src/hooks/usePlaces';
import { useMoveItem } from '../../src/hooks/useItems';
import { useScan } from '../../src/hooks/useScan';
import { scannerTypeToCodeType } from '../../src/lib/constants';
import { useExternalCodes, useUnbindExternalCode } from '../../src/hooks/useExternalCode';
import { useHousehold } from '../../src/lib/household';
import { appQrPayload } from '../../src/lib/qrcode';
import { printAndShareCode } from '../../src/lib/print';
import { wouldCreateCycle, indexPlaces } from '../../src/lib/places';
import type { Item, Place } from '../../src/lib/supabase';
import { colors, spacing, radius, tint } from '../../src/theme';
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
  const { data: children } = usePlaceChildren(id);
  const { data: allPlaces } = usePlaces();
  const { data: codes } = useExternalCodes(activeHouseholdId, 'place', id);
  const deletePlace = useDeletePlace();
  const updatePlace = useUpdatePlace();
  const moveItem = useMoveItem();
  const unbind = useUnbindExternalCode('place', id);
  const { resolve } = useScan();

  const [scanOpen, setScanOpen] = useState(false);
  const [locScanOpen, setLocScanOpen] = useState(false);
  const [movePicker, setMovePicker] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);

  if (isLoading) return <Screen><View style={{ padding: 16 }}><Muted>{t('common.loading')}</Muted></View></Screen>;
  if (error) return <Screen><View style={{ padding: 16 }}><ErrorBanner message={(error as Error).message} /></View></Screen>;
  if (!place) return <Screen><View style={{ padding: 16 }}><Muted>{t('errors.notFound')}</Muted></View></Screen>;

  // The place's own app-QR deep-link (for display + share + print). Computed once.
  const placeQrPayload = place.qr_token
    ? appQrPayload('place', place.qr_token, activeHouseholdId ?? undefined)
    : null;

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

  /** Move this place into a new parent (or to top level if null). Guards cycles. */
  function onMoveParent(parentId: string | null) {
    if (parentId !== null && wouldCreateCycle(place!.id, parentId, indexPlaces(allPlaces ?? []))) {
      hapticWarning();
      Alert.alert(t('errors.generic'), t('places.scanCycle'));
      return;
    }
    updatePlace.mutate({ id: place!.id, patch: { parent_place_id: parentId } });
    setMovePicker(false);
  }

  /** Scan a code to set this place's parent. Only a place in the active
   *  household is meaningful here. */
  async function onScanLocation(payload: string) {
    const o = await resolve(payload);
    if (!o) {
      setLocScanOpen(false);
      return;
    }
    if (o.type === 'matched') {
      const m = o.matches[0];
      if (m.entity_type !== 'place') {
        hapticWarning();
        setPrompt(t('places.scanNotAPlace'));
        return; // keep camera open so the user can retry
      }
      if (!o.inActiveHousehold) {
        hapticWarning();
        setPrompt(t('scanResolve.switchPrompt', { name: '', household: '' }));
        return;
      }
      if (wouldCreateCycle(place!.id, m.entity_id, indexPlaces(allPlaces ?? []))) {
        hapticWarning();
        setPrompt(m.entity_id === place!.id ? t('places.scanSelf') : t('places.scanCycle'));
        return;
      }
      updatePlace.mutate(
        { id: place!.id, patch: { parent_place_id: m.entity_id } },
        { onSuccess: () => { hapticSuccess(); setPrompt(t('places.scannedToPlace')); } },
      );
      setLocScanOpen(false);
    } else if (o.type === 'no-match') {
      hapticWarning();
      setPrompt(t('scan.unknownHint'));
      setLocScanOpen(false);
    }
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

  /** True if moving `candidateId` into this place would create a cycle. */
  function wouldCycle(candidateId: string): boolean {
    return wouldCreateCycle(candidateId, place!.id, indexPlaces(allPlaces ?? []));
  }

  /** Resolve a scanned code from inside a place. */
  async function onScanAdd(payload: string, rawType?: string) {
    const o = await resolve(payload);
    if (!o) {
      setScanOpen(false);
      return;
    }
    if (o.type === 'matched') {
      const m = o.matches[0];
      if (!o.inActiveHousehold) {
        hapticWarning();
        setPrompt(t('scanResolve.switchPrompt', { name: '', household: '' }));
        return;
      }
      if (m.entity_type === 'item') {
        moveItem.mutate(
          { itemId: m.entity_id, placeId: place!.id, noteKey: 'scanned_in' },
          {
            onSuccess: () => {
              hapticSuccess();
              setPrompt(t('places.scannedItemIn'));
            },
          },
        );
        setScanOpen(false);
      } else {
        // scanned a place → reparent it into this one
        if (wouldCycle(m.entity_id)) {
          hapticWarning();
          setPrompt(m.entity_id === place!.id ? t('places.scanSelf') : t('places.scanCycle'));
          return;
        }
        updatePlace.mutate(
          { id: m.entity_id, patch: { parent_place_id: place!.id } },
          {
            onSuccess: () => {
              hapticSuccess();
              setPrompt(t('places.scannedPlaceIn'));
            },
          },
        );
        setScanOpen(false);
      }
    } else if (o.type === 'no-match') {
      // Open the new-item form with the code + this place prefilled.
      setScanOpen(false);
      router.push({
        pathname: '/item/new',
        params: {
          code: payload,
          type: scannerTypeToCodeType(rawType ?? 'other'),
          placeId: place!.id,
        },
      } as never);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ alignItems: 'center' }}>
        <MaxWidth style={{ padding: spacing.lg, gap: 12, paddingBottom: 40 }}>
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

        {/* Location card: where this place lives (its parent place). */}
        {(() => {
          const parent = place.parent_place_id ? (allPlaces ?? []).find((p) => p.id === place.parent_place_id) : null;
          return (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 18 }}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Muted style={{ fontSize: 11, textTransform: 'uppercase' }}>{t('places.parent')}</Muted>
                  {parent ? (
                    <Body style={{ fontWeight: '700', fontSize: 17 }}>{parent.name}</Body>
                  ) : (
                    <Body style={{ fontStyle: 'italic', color: colors.textMuted }}>{t('places.none')}</Body>
                  )}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Button
                  title={movePicker ? t('common.cancel') : t('places.changeLocation')}
                  variant="ghost"
                  onPress={() => setMovePicker(!movePicker)}
                />
                <Button title={t('places.scanSetLocation')} variant="ghost" onPress={() => setLocScanOpen(true)} />
              </View>
              {movePicker ? (
                <View style={{ marginTop: 12, gap: 4 }}>
                  <Muted style={{ fontSize: 11, marginBottom: 4 }}>{t('places.moveTo')}</Muted>
                  <PlaceOption label={t('places.none')} onPress={() => onMoveParent(null)} selected={!place.parent_place_id} />
                  {(allPlaces ?? []).filter((p) => p.id !== place.id).map((p: Place) => (
                    <PlaceOption key={p.id} label={p.name} onPress={() => onMoveParent(p.id)} selected={p.id === place.parent_place_id} />
                  ))}
                </View>
              ) : null}
            </Card>
          );
        })()}

        <Button title={t('places.scanToAdd')} onPress={() => setScanOpen(true)} />

        {prompt ? (
          <Card>
            <Body style={{ fontWeight: '600' }}>{prompt}</Body>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Button title={t('common.done')} onPress={() => setPrompt(null)} />
            </View>
          </Card>
        ) : null}

        {children && children.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Body style={{ fontWeight: '700' }}>{t('places.contains')}</Body>
            {children.map((p: Place) => (
              <PlaceRow key={p.id} place={p} onPress={() => router.push(`/place/${p.id}` as never)} />
            ))}
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <Body style={{ fontWeight: '700' }}>{t('places.contents')}</Body>
          {contents && contents.length > 0 ? (
            contents.map((it: Item) => (
              <ItemCard
                key={it.id}
                item={it}
                placeName={place.name}
                onPress={() => router.push(`/item/${it.id}`)}
              />
            ))
          ) : (
            <Card><Muted>{t('common.empty')}</Muted></Card>
          )}
        </View>

        {placeQrPayload ? (
          <Card style={{ alignItems: 'center', gap: 8 }}>
            <Body style={{ fontWeight: '600', alignSelf: 'flex-start' }}>{t('places.qrCode')}</Body>
            <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: radius.md }}>
              <QRCode value={placeQrPayload} size={180} backgroundColor="#fff" color={colors.bg} />
            </View>
            <Muted style={{ textAlign: 'center' }}>{t('places.qrHint')}</Muted>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                title={t('places.shareQr')}
                variant="ghost"
                onPress={() => Share.share({ message: placeQrPayload }).catch(() => {})}
              />
              <Button
                title={t('print.print')}
                variant="ghost"
                onPress={async () => {
                  try {
                    const ok = await printAndShareCode({ name: place.name, payload: placeQrPayload, kind: 'place' });
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

        <Button title={t('common.delete')} variant="danger" onPress={onDelete} loading={deletePlace.isPending} />
        </MaxWidth>
      </ScrollView>

      <ScanCameraModal
        visible={scanOpen}
        hint={t('places.scanToAdd')}
        onClose={() => setScanOpen(false)}
        onScan={onScanAdd}
      />
      <ScanCameraModal
        visible={locScanOpen}
        hint={t('places.scanSetLocation')}
        onClose={() => setLocScanOpen(false)}
        onScan={onScanLocation}
      />
    </Screen>
  );
}

function PlaceRow({ place, onPress }: { place: Place; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={place.name}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            backgroundColor: tint(colors.primary, '22'),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 22 }}>📦</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: '600' }}>{place.name}</Body>
          {place.description ? <Muted>{place.description}</Muted> : null}
        </View>
      </Card>
    </TouchableOpacity>
  );
}

/** A tappable option row for the parent-place picker. Highlights the selected. */
function PlaceOption({ label, onPress, selected }: { label: string; onPress: () => void; selected?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: selected ? tint(colors.primary, '33') : colors.surfaceAlt, borderRadius: radius.sm }}
    >
      <Text style={{ color: selected ? colors.primary : colors.text }}>{label}</Text>
    </TouchableOpacity>
  );
}
