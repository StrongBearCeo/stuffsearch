/** Item detail: photos, info, value, tags, location, links, codes, history. */
import React, { useState } from 'react';
import { View, ScrollView, Text, TouchableOpacity, Alert, Linking, Share } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { H2, Body, Muted, Card, Screen, MaxWidth, Button, Input, ErrorBanner } from '../../src/components/primitives';
import { ExpoImage } from '../../src/components/ExpoImage';
import { PhotoViewer } from '../../src/components/PhotoViewer';
import { BoundCodesList } from '../../src/components/BoundCodesList';
import { LinksCard } from '../../src/components/LinksCard';
import { TagList } from '../../src/components/Tags';
import { ScanCameraModal } from '../../src/components/ScanCameraModal';
import { normalizeUrl } from '../../src/lib/url';
import { itemLinks } from '../../src/lib/links';
import { formatMoney, parseValueInput, DEFAULT_CURRENCY } from '../../src/lib/value';
import { classifyScanForBinding } from '../../src/lib/bindCode';
import { noteToTemplate } from '../../src/lib/historyNote';
import { appQrPayload } from '../../src/lib/qrcode';
import { printAndShareCode } from '../../src/lib/print';
import { CreatePlaceSheet } from '../../src/components/CreatePlaceSheet';
import { useItem, useItemHistory, useDeleteItem, useMoveItem, useUpdateItem, useGenerateItemCode } from '../../src/hooks/useItems';
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

/** Which job the shared camera modal is doing. */
type ScanMode = 'location' | 'code' | null;

export default function ItemDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  useHeaderTitle(t('items.title'));
  const { activeHouseholdId } = useHousehold();
  const { user } = useAuth();
  const { data: item, isLoading, error } = useItem(id);
  // `id` may be an app qr_token (a scanned deep-link routes to /item/<token>),
  // so every dependent query keys off the RESOLVED row id, not the route param.
  const itemId = item?.id;
  const { data: history } = useItemHistory(itemId);
  const { data: codes } = useExternalCodes(activeHouseholdId, 'item', itemId);
  const { data: places } = usePlaces();
  const deleteItem = useDeleteItem();
  const updateItem = useUpdateItem();
  const moveItem = useMoveItem();
  const generateCode = useGenerateItemCode();
  const convertToPlace = useConvertItemToPlace();
  const createPlace = useCreatePlace();
  const bind = useBindExternalCode();
  const unbind = useUnbindExternalCode('item', itemId ?? id);
  const { resolve, resolving } = useScan();

  const [movePicker, setMovePicker] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>(null);
  /** Shown INSIDE the camera so the user sees it without closing the scanner. */
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [pendingPlace, setPendingPlace] = useState<{ value: string; type: ExternalCodeType } | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [valueDraft, setValueDraft] = useState<string | null>(null);

  if (isLoading) {
    return <Screen><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Muted>{t('common.loading')}</Muted></View></Screen>;
  }
  if (error) return <Screen><View style={{ padding: 16 }}><ErrorBanner message={(error as Error).message} /></View></Screen>;
  if (!item) return <Screen><View style={{ padding: 16 }}><Muted>{t('errors.notFound')}</Muted></View></Screen>;

  const place = places?.find((p: Place) => p.id === item.current_place_id);
  // The item's own app-QR deep-link (for display + share). Optional: items are
  // created without a code now and only get one on request.
  const token = item.qr_token;
  const qrPayload = token ? appQrPayload('item', token, activeHouseholdId ?? undefined) : null;
  const links = itemLinks(item);
  const photos = item.photo_urls ?? [];

  /** Open a product link in the system browser. */
  function onOpenLink(raw: string) {
    const url = normalizeUrl(raw);
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

  /** Save a hand-entered value. Marks the value as the user's so a later
   *  enrichment won't silently overwrite it. */
  async function onSaveValue() {
    const parsed = parseValueInput(valueDraft ?? '');
    await updateItem.mutateAsync({
      id: item!.id,
      patch: {
        estimated_value: parsed,
        value_currency: parsed == null ? null : item!.value_currency ?? DEFAULT_CURRENCY,
        value_source: parsed == null ? null : 'manual',
        value_updated_at: parsed == null ? null : new Date().toISOString(),
      },
    });
    hapticSuccess();
    setValueDraft(null);
  }

  function openScanner(mode: Exclude<ScanMode, null>) {
    setScanNotice(null);
    setScanMode(mode);
  }

  /** Resolve a scanned code from the item screen. Only a place in the active
   * household is meaningful here — we set this item's location to it.
   * Recoverable problems set `scanNotice`, which shows over the live camera
   * AND re-arms the scanner so the next scan is accepted. */
  async function onScanLocation(payload: string, rawType?: string) {
    const o = await resolve(payload);
    if (!o) {
      setScanNotice(t('errors.generic'));
      return;
    }
    if (o.type === 'matched') {
      const m = o.matches[0];
      if (m.entity_type !== 'place') {
        hapticWarning();
        setScanNotice(t('items.scanNotAPlace'));
        return; // keep camera open so the user can retry
      }
      if (!o.inActiveHousehold) {
        hapticWarning();
        setScanNotice(t('scanResolve.otherHousehold'));
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
      setScanMode(null);
    } else if (o.type === 'no-match') {
      // Unknown code → offer to create a place for it inline.
      setPendingPlace({ value: o.codeValue, type: scannerTypeToCodeType(rawType ?? 'other') });
      setScanMode(null);
    } else {
      setScanNotice(t('items.scanNotAPlace'));
    }
  }

  /** Scan a code to ADD it to this item. An item may carry many codes. */
  async function onScanAddCode(payload: string, rawType?: string) {
    if (!activeHouseholdId || !user) return;
    const o = await resolve(payload);
    if (!o) {
      setScanNotice(t('errors.generic'));
      return;
    }
    const c = classifyScanForBinding(o, { entityType: 'item', entityId: item!.id });
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
        entityType: 'item',
        entityId: item!.id,
        boundBy: user.id,
      });
      hapticSuccess();
      setScanMode(null);
      setPrompt(t('codes.added'));
    } catch (e) {
      setScanNotice(e instanceof Error ? e.message : t('errors.generic'));
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
        {photos.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
          >
            {photos.map((uri, i) => (
              <TouchableOpacity
                key={`${uri}-${i}`}
                onPress={() => setViewerIndex(i)}
                accessibilityRole="imagebutton"
                accessibilityLabel={t('photos.viewFull')}
              >
                <ExpoImage uri={uri} style={{ width: 220, height: 220, borderRadius: radius.mdLg }} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}
        {photos.length > 0 ? <Muted style={{ fontSize: 11 }}>{t('photos.zoomHint')}</Muted> : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <H2>{item.name}</H2>
            {item.category ? <Muted>{item.category}</Muted> : null}
          </View>
          <Button title={t('common.edit')} variant="ghost" onPress={() => router.push({ pathname: '/item/new', params: { id: item.id } } as never)} />
        </View>
        {/* Full description — wraps over as many lines as it needs. */}
        {item.description ? <Body>{item.description}</Body> : null}
        <TagList tags={item.tags} />

        {/* Value card: an AI estimate the user can correct. */}
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Muted style={{ fontSize: 11, textTransform: 'uppercase' }}>{t('items.value')}</Muted>
              {item.estimated_value != null ? (
                <Body style={{ fontWeight: '700', fontSize: 17 }}>
                  {formatMoney(item.estimated_value, item.value_currency)}
                </Body>
              ) : (
                <Body style={{ fontStyle: 'italic', color: colors.textMuted }}>{t('items.noValue')}</Body>
              )}
              {item.estimated_value != null ? (
                <Muted style={{ fontSize: 11 }}>
                  {item.value_source === 'ai' ? t('items.valueFromAi') : t('items.valueFromYou')}
                </Muted>
              ) : null}
            </View>
            <Button
              title={valueDraft == null ? t('items.setValue') : t('common.cancel')}
              variant="ghost"
              onPress={() =>
                setValueDraft(valueDraft == null ? (item.estimated_value?.toString() ?? '') : null)
              }
            />
          </View>
          {valueDraft != null ? (
            <View style={{ gap: 8 }}>
              <Input
                value={valueDraft}
                onChangeText={setValueDraft}
                keyboardType="decimal-pad"
                placeholder={t('items.valuePlaceholder')}
                accessibilityLabel={t('items.value')}
              />
              <Button title={t('common.save')} onPress={onSaveValue} loading={updateItem.isPending} />
            </View>
          ) : null}
        </Card>

        <Card>
          {/* Location header: label + the current place name (or empty state).
              Tapping the place name opens that place. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 18 }}>📍</Text>
            <View style={{ flex: 1 }}>
              <Muted style={{ fontSize: 11, textTransform: 'uppercase' }}>{t('items.location')}</Muted>
              {place ? (
                <TouchableOpacity
                  onPress={() => router.push(`/place/${place.id}` as never)}
                  accessibilityRole="link"
                  accessibilityLabel={`${t('items.openPlace')}: ${place.name}`}
                >
                  <Body style={{ fontWeight: '700', fontSize: 17, color: colors.primary }}>
                    {place.name} ›
                  </Body>
                </TouchableOpacity>
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
            <Button title={t('items.scanSetLocation')} variant="ghost" onPress={() => openScanner('location')} />
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

        <LinksCard links={links} onOpen={onOpenLink} />

        {/* Codes: an item may have none, one, or many. */}
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button title={t('codes.addByScan')} variant="ghost" onPress={() => openScanner('code')} />
            </View>
            {!qrPayload ? (
              <View style={{ flex: 1 }}>
                <Button
                  title={t('codes.generate')}
                  variant="ghost"
                  loading={generateCode.isPending}
                  onPress={() => generateCode.mutate(item.id)}
                />
              </View>
            ) : null}
          </View>
          {!qrPayload && (codes?.length ?? 0) === 0 ? (
            <Muted style={{ fontSize: 12 }}>{t('codes.noneHint')}</Muted>
          ) : null}
        </View>

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
        visible={scanMode !== null}
        hint={scanMode === 'code' ? t('codes.addByScan') : t('items.scanSetLocation')}
        notice={scanNotice}
        onDismissNotice={() => setScanNotice(null)}
        busy={resolving || bind.isPending}
        onClose={() => {
          setScanMode(null);
          setScanNotice(null);
        }}
        onScan={scanMode === 'code' ? onScanAddCode : onScanLocation}
      />

      <PhotoViewer
        visible={viewerIndex !== null}
        photos={photos}
        initialIndex={viewerIndex ?? 0}
        closeLabel={t('common.back')}
        onClose={() => setViewerIndex(null)}
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
