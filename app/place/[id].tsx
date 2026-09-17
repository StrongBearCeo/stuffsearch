/** Place detail: contents + child places + info + codes + edit/delete.
 *  Scan-to-add: scanning an item moves it in here; scanning a place reparents
 *  it in here; an unknown code opens the new-item form with this place prefilled.
 *
 *  Anything that can't be applied (a cycle, a foreign household, a code that's
 *  already bound) is reported through `scanNotice`, which renders OVER the live
 *  camera and re-arms the scanner — previously those messages were queued
 *  behind the modal and only appeared after the user gave up and closed it. */
import React, { useState } from 'react';
import { View, ScrollView, Text, TouchableOpacity, Alert, Share } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { H2, Body, Muted, Card, Screen, MaxWidth, Button, ErrorBanner } from '../../src/components/primitives';
import { PhotoThumb } from '../../src/components/PhotoThumb';
import { ExpoImage } from '../../src/components/ExpoImage';
import { PhotoViewer } from '../../src/components/PhotoViewer';
import { ItemCard } from '../../src/components/ItemCard';
import { BoundCodesList } from '../../src/components/BoundCodesList';
import { TagList } from '../../src/components/Tags';
import { ScanCameraModal } from '../../src/components/ScanCameraModal';
import { usePlace, usePlaceContents, usePlaceChildren, usePlaces, useDeletePlace, useUpdatePlace, useGeneratePlaceCode, useRemovePlaceCode } from '../../src/hooks/usePlaces';
import { useMoveItem, useItem } from '../../src/hooks/useItems';
import { usePlacementsForPlace } from '../../src/hooks/useItemPlacements';
import { useRecentPlaces } from '../../src/hooks/useRecentPlaces';
import { useScan } from '../../src/hooks/useScan';
import { scannerTypeToCodeType } from '../../src/lib/constants';
import { classifyScanForBinding } from '../../src/lib/bindCode';
import { useExternalCodes, useBindExternalCode, useUnbindExternalCode } from '../../src/hooks/useExternalCode';
import { useHousehold } from '../../src/lib/household';
import { useAuth } from '../../src/lib/auth';
import { appQrPayload } from '../../src/lib/qrcode';
import { printAndShareCode } from '../../src/lib/print';
import { wouldCreateCycle, indexPlaces } from '../../src/lib/places';
import { summarizeValue, formatTotals } from '../../src/lib/value';
import { placePhotos } from '../../src/lib/photos';
import { quantityInPlace } from '../../src/lib/quantity';
import { orderByRecent } from '../../src/lib/recent';
import type { Item, Place } from '../../src/lib/supabase';
import { colors, spacing, radius, tint } from '../../src/theme';
import { useTranslation } from 'react-i18next';
import { useHeaderTitle } from '../../src/lib/useHeaderTitle';
import { hapticSuccess, hapticWarning } from '../../src/lib/haptics';

/** Which job the shared camera modal is doing. */
type ScanMode = 'add' | 'location' | 'code' | null;

export default function PlaceDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  useHeaderTitle(t('places.title'));
  const { activeHouseholdId } = useHousehold();
  const { user } = useAuth();
  const { data: place, isLoading, error } = usePlace(id);
  // `id` may be an app qr_token (a scanned deep-link routes to /place/<token>),
  // so every dependent query keys off the RESOLVED row id, not the route param.
  const placeId = place?.id;
  const { data: contents } = usePlaceContents(placeId);
  const { data: children } = usePlaceChildren(placeId);
  const { data: allPlaces } = usePlaces();
  const { data: codes } = useExternalCodes(activeHouseholdId, 'place', placeId);
  const { data: placements } = usePlacementsForPlace(placeId);
  // A place can BE an item (a labelled toolbox): show the thing behind it.
  const { data: backingItem } = useItem(place?.item_id ?? undefined);
  const { recent } = useRecentPlaces();
  const deletePlace = useDeletePlace();
  const updatePlace = useUpdatePlace();
  const generateCode = useGeneratePlaceCode();
  const removeCode = useRemovePlaceCode();
  const moveItem = useMoveItem();
  const bind = useBindExternalCode();
  const unbind = useUnbindExternalCode('place', placeId ?? id);
  const { resolve, resolving } = useScan();

  const [scanMode, setScanMode] = useState<ScanMode>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [movePicker, setMovePicker] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (isLoading) return <Screen><View style={{ padding: 16 }}><Muted>{t('common.loading')}</Muted></View></Screen>;
  if (error) return <Screen><View style={{ padding: 16 }}><ErrorBanner message={(error as Error).message} /></View></Screen>;
  if (!place) return <Screen><View style={{ padding: 16 }}><Muted>{t('errors.notFound')}</Muted></View></Screen>;

  // The place's own app-QR deep-link. Optional — places are created without a
  // code and only get one on request.
  const placeQrPayload = place.qr_token
    ? appQrPayload('place', place.qr_token, activeHouseholdId ?? undefined)
    : null;
  const contentSummary = summarizeValue(contents ?? []);
  const contentTotals = formatTotals(contentSummary.totals);
  // Reads the array, falling back to the legacy scalar for old rows.
  const photos = placePhotos(place);

  function openScanner(mode: Exclude<ScanMode, null>) {
    setScanNotice(null);
    setScanMode(mode);
  }

  function closeScanner() {
    setScanMode(null);
    setScanNotice(null);
  }

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
      setScanNotice(t('errors.generic'));
      return;
    }
    if (o.type === 'matched') {
      const m = o.matches[0];
      if (m.entity_type !== 'place') {
        hapticWarning();
        setScanNotice(t('places.scanNotAPlace'));
        return; // keep camera open so the user can retry
      }
      if (!o.inActiveHousehold) {
        hapticWarning();
        setScanNotice(t('scanResolve.otherHousehold'));
        return;
      }
      if (wouldCreateCycle(place!.id, m.entity_id, indexPlaces(allPlaces ?? []))) {
        hapticWarning();
        setScanNotice(m.entity_id === place!.id ? t('places.scanSelf') : t('places.scanCycle'));
        return;
      }
      updatePlace.mutate(
        { id: place!.id, patch: { parent_place_id: m.entity_id } },
        { onSuccess: () => { hapticSuccess(); setPrompt(t('places.scannedToPlace')); } },
      );
      setScanMode(null);
    } else if (o.type === 'no-match') {
      hapticWarning();
      setScanNotice(t('scan.unknownHint'));
    } else {
      setScanNotice(t('places.scanNotAPlace'));
    }
  }

  /** Drop the app-generated QR. Printed labels stop resolving, so confirm. */
  function onRemoveCode() {
    Alert.alert(t('codes.removeTitle'), t('codes.removeMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('codes.remove'),
        style: 'destructive',
        onPress: () => {
          hapticWarning();
          removeCode.mutate(place!.id);
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

  /** True if moving `candidateId` into this place would create a cycle. */
  function wouldCycle(candidateId: string): boolean {
    return wouldCreateCycle(candidateId, place!.id, indexPlaces(allPlaces ?? []));
  }

  /** Resolve a scanned code from inside a place. */
  async function onScanAdd(payload: string, rawType?: string) {
    const o = await resolve(payload);
    if (!o) {
      setScanNotice(t('errors.generic'));
      return;
    }
    if (o.type === 'deep-link') {
      // An app QR for an item/place resolves through the scan tab; here we only
      // act on codes that map to a household entity.
      setScanNotice(t('scan.unknownHint'));
      return;
    }
    if (o.type === 'matched') {
      const m = o.matches[0];
      if (!o.inActiveHousehold) {
        hapticWarning();
        setScanNotice(t('scanResolve.otherHousehold'));
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
            onError: (e) => setScanNotice(e instanceof Error ? e.message : t('errors.generic')),
          },
        );
        setScanMode(null);
      } else {
        // scanned a place → reparent it into this one
        if (wouldCycle(m.entity_id)) {
          hapticWarning();
          setScanNotice(m.entity_id === place!.id ? t('places.scanSelf') : t('places.scanCycle'));
          return;
        }
        updatePlace.mutate(
          { id: m.entity_id, patch: { parent_place_id: place!.id } },
          {
            onSuccess: () => {
              hapticSuccess();
              setPrompt(t('places.scannedPlaceIn'));
            },
            onError: (e) => setScanNotice(e instanceof Error ? e.message : t('errors.generic')),
          },
        );
        setScanMode(null);
      }
    } else if (o.type === 'no-match') {
      // Open the new-item form with the code + this place prefilled.
      setScanMode(null);
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

  /** Scan a code to ADD it to this place. A place may carry many codes. */
  async function onScanAddCode(payload: string, rawType?: string) {
    if (!activeHouseholdId || !user) return;
    const o = await resolve(payload);
    if (!o) {
      setScanNotice(t('errors.generic'));
      return;
    }
    const c = classifyScanForBinding(o, { entityType: 'place', entityId: place!.id });
    if (c.kind === 'already-here') {
      hapticWarning();
      setScanNotice(t('codes.alreadyBound'));
      return;
    }
    if (c.kind === 'bound-elsewhere') {
      hapticWarning();
      setScanNotice(t('codes.boundElsewhere'));
      return;
    }
    if (c.kind === 'app-code') {
      hapticWarning();
      setScanNotice(t('codes.appCode'));
      return;
    }
    try {
      await bind.mutateAsync({
        householdId: activeHouseholdId,
        codeValue: c.codeValue,
        codeType: scannerTypeToCodeType(rawType ?? 'other'),
        entityType: 'place',
        entityId: place!.id,
        boundBy: user.id,
      });
      hapticSuccess();
      setScanMode(null);
      setPrompt(t('codes.added'));
    } catch (e) {
      setScanNotice(e instanceof Error ? e.message : t('errors.generic'));
    }
  }

  const scanHandlers: Record<Exclude<ScanMode, null>, (p: string, r?: string) => void> = {
    add: onScanAdd,
    location: onScanLocation,
    code: onScanAddCode,
  };
  const scanHints: Record<Exclude<ScanMode, null>, string> = {
    add: t('places.scanToAdd'),
    location: t('places.scanSetLocation'),
    code: t('codes.addByScan'),
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ alignItems: 'center' }}>
        <MaxWidth style={{ padding: spacing.lg, gap: 12, paddingBottom: 40 }}>
        {/* Places carry several photos now, like items. */}
        {photos.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingBottom: 4 }}
          >
            {photos.map((uri, i) => (
              <TouchableOpacity
                key={`${uri}-${i}`}
                onPress={() => setViewerIndex(i)}
                accessibilityRole="imagebutton"
                accessibilityLabel={t('photos.viewFull')}
              >
                <ExpoImage
                  uri={uri}
                  style={{
                    width: photos.length === 1 ? 320 : 220,
                    height: 180,
                    borderRadius: radius.mdLg,
                  }}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}
        {photos.length > 0 ? <Muted style={{ fontSize: 11 }}>{t('photos.zoomHint')}</Muted> : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <H2>{place.name}</H2>
          </View>
          <Button title={t('common.edit')} variant="ghost" onPress={() => router.push({ pathname: '/place/new', params: { id: place.id } } as never)} />
        </View>

        {/* This place IS an item — link straight to the thing itself. */}
        {backingItem ? (
          <Card style={{ gap: spacing.sm }}>
            <Muted style={{ fontSize: 11, textTransform: 'uppercase' }}>{t('places.isAlsoItem')}</Muted>
            <Muted style={{ fontSize: 12 }}>{t('places.isAlsoItemHint')}</Muted>
            <Button
              title={t('places.openItem')}
              onPress={() => router.push(`/item/${backingItem.id}` as never)}
            />
          </Card>
        ) : null}
        {/* Description on its own row so a long one wraps instead of being
            squeezed (and clipped) next to the Edit button. */}
        {place.description ? <Body>{place.description}</Body> : null}
        <TagList tags={place.tags} />

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
                    <TouchableOpacity
                      onPress={() => router.push(`/place/${parent.id}` as never)}
                      accessibilityRole="link"
                      accessibilityLabel={`${t('items.openPlace')}: ${parent.name}`}
                    >
                      <Body style={{ fontWeight: '700', fontSize: 17, color: colors.primary }}>
                        {parent.name} ›
                      </Body>
                    </TouchableOpacity>
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
                <Button title={t('places.scanSetLocation')} variant="ghost" onPress={() => openScanner('location')} />
              </View>
              {movePicker ? (
                <View style={{ marginTop: 12, gap: 4 }}>
                  <Muted style={{ fontSize: 11, marginBottom: 4 }}>{t('places.moveTo')}</Muted>
                  <PlaceOption label={t('places.none')} onPress={() => onMoveParent(null)} selected={!place.parent_place_id} />
                  {orderByRecent(
                    (allPlaces ?? []).filter((p) => p.id !== place.id),
                    recent,
                    (p: Place) => p.id,
                  ).map((p: Place) => (
                    <PlaceOption key={p.id} label={p.name} onPress={() => onMoveParent(p.id)} selected={p.id === place.parent_place_id} />
                  ))}
                </View>
              ) : null}
            </Card>
          );
        })()}

        <Button title={t('places.scanToAdd')} onPress={() => openScanner('add')} />

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
            <Body style={{ fontWeight: '700' }}>
              {t('places.contains')} · {t('places.count', { count: children.length })}
            </Body>
            {children.map((p: Place) => (
              <PlaceRow key={p.id} place={p} onPress={() => router.push(`/place/${p.id}` as never)} />
            ))}
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <Body style={{ fontWeight: '700' }}>
            {t('places.contents')} · {t('items.count', { count: contents?.length ?? 0 })}
            {contentTotals ? ` · ${contentTotals}` : ''}
          </Body>
          {contents && contents.length > 0 ? (
            contents.map((it: Item) => {
              // An item can be in several places at once; show how many of it
              // are HERE rather than its household-wide total.
              const here = quantityInPlace(it, placements ?? [], place.id);
              return (
                <ItemCard
                  key={it.id}
                  item={here == null ? it : { ...it, quantity: here }}
                  placeName={place.name}
                  onPress={() => router.push(`/item/${it.id}`)}
                />
              );
            })
          ) : (
            <Card><Muted>{t('common.empty')}</Muted></Card>
          )}
        </View>

        {/* Codes: a place may have none, one, or many. */}
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button title={t('codes.addByScan')} variant="ghost" onPress={() => openScanner('code')} />
            </View>
            {!placeQrPayload ? (
              <View style={{ flex: 1 }}>
                <Button
                  title={t('codes.generate')}
                  variant="ghost"
                  loading={generateCode.isPending}
                  onPress={() => generateCode.mutate(place.id)}
                />
              </View>
            ) : null}
          </View>
          {!placeQrPayload && (codes?.length ?? 0) === 0 ? (
            <Muted style={{ fontSize: 12 }}>{t('codes.noneHint')}</Muted>
          ) : null}
        </View>

        {placeQrPayload ? (
          <Card style={{ alignItems: 'center', gap: 8 }}>
            <Body style={{ fontWeight: '600', alignSelf: 'flex-start' }}>{t('places.qrCode')}</Body>
            <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: radius.md }}>
              <QRCode value={placeQrPayload} size={180} backgroundColor="#fff" color={colors.bg} />
            </View>
            <Muted style={{ textAlign: 'center' }}>{t('places.qrHint')}</Muted>
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
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
              {/* A generated code used to be permanent. */}
              <Button
                title={t('codes.remove')}
                variant="ghost"
                loading={removeCode.isPending}
                onPress={onRemoveCode}
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
        visible={scanMode !== null}
        hint={scanMode ? scanHints[scanMode] : undefined}
        notice={scanNotice}
        onDismissNotice={() => setScanNotice(null)}
        busy={resolving || bind.isPending}
        onUnreadable={() => setScanNotice(t('scan.unreadable'))}
        onClose={closeScanner}
        onScan={(payload, rawType) => {
          if (scanMode) scanHandlers[scanMode](payload, rawType);
        }}
      />

      <PhotoViewer
        visible={viewerIndex !== null}
        photos={photos}
        initialIndex={viewerIndex ?? 0}
        closeLabel={t('common.back')}
        onClose={() => setViewerIndex(null)}
      />
    </Screen>
  );
}

/** A nested place. Shows its own photo — a row of identical 📦 icons tells you
 *  nothing, and the photo is how you recognise which shelf is which. Places
 *  without one keep the icon rather than showing an empty grey square. */
function PlaceRow({ place, onPress }: { place: Place; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={place.name}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <PhotoThumb
          photos={placePhotos(place)}
          accessibilityLabel={place.name}
          fallback={<Text style={{ fontSize: 22 }}>📦</Text>}
        />
        {/* minWidth:0 so a long name shrinks instead of being floored at its
            content width — see ItemCard. */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body style={{ fontWeight: '600' }} numberOfLines={2}>
            {place.name}
          </Body>
          {place.description ? <Muted numberOfLines={2}>{place.description}</Muted> : null}
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
