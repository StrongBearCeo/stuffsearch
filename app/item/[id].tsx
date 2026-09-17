/** Item detail: photos, info, value, quantity, tags, location(s), links, codes,
 *  storage facet, history. */
import React, { useMemo, useState } from 'react';
import { View, ScrollView, Text, TouchableOpacity, Alert, Linking, Share } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { H2, Body, Muted, Card, Screen, MaxWidth, Button, Input, ErrorBanner, AiButton } from '../../src/components/primitives';
import { ExpoImage } from '../../src/components/ExpoImage';
import { PhotoViewer } from '../../src/components/PhotoViewer';
import { BoundCodesList } from '../../src/components/BoundCodesList';
import { LinksCard } from '../../src/components/LinksCard';
import { TagList } from '../../src/components/Tags';
import { ScanCameraModal } from '../../src/components/ScanCameraModal';
import { normalizeUrl } from '../../src/lib/url';
import { itemLinks } from '../../src/lib/links';
import { formatMoney, parseValueInput, DEFAULT_CURRENCY } from '../../src/lib/value';
import { itemQuantity, placedQuantity, remainingQuantity, isOverAssigned, parseQuantity } from '../../src/lib/quantity';
import { orderByRecent } from '../../src/lib/recent';
import { scanTargetPlaceId } from '../../src/lib/facets';
import { classifyScanForBinding } from '../../src/lib/bindCode';
import { noteToTemplate } from '../../src/lib/historyNote';
import { appQrPayload } from '../../src/lib/qrcode';
import { printAndShareCode } from '../../src/lib/print';
import { enrichItem } from '../../src/lib/llm';
import { applyFieldEnrichment } from '../../src/lib/enrich';
import { CreatePlaceSheet } from '../../src/components/CreatePlaceSheet';
import { useItem, useItemHistory, useDeleteItem, useMoveItem, useUpdateItem, useGenerateItemCode, useRemoveItemCode } from '../../src/hooks/useItems';
import { useConvertItemToPlace } from '../../src/hooks/useConvertItemToPlace';
import { useCreatePlace, usePlaceForItem, usePlaceContents } from '../../src/hooks/usePlaces';
import { useItemPlacements, useAddPlacement, useRemovePlacement } from '../../src/hooks/useItemPlacements';
import { useRecentPlaces } from '../../src/hooks/useRecentPlaces';
import { useScan } from '../../src/hooks/useScan';
import { usePlaces } from '../../src/hooks/usePlaces';
import { useExternalCodes, useBindExternalCode, useUnbindExternalCode } from '../../src/hooks/useExternalCode';
import { supabase } from '../../src/lib/supabase';
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
  const { user, profile } = useAuth();
  const { data: item, isLoading, error } = useItem(id);
  // `id` may be an app qr_token (a scanned deep-link routes to /item/<token>),
  // so every dependent query keys off the RESOLVED row id, not the route param.
  const itemId = item?.id;
  const { data: history } = useItemHistory(itemId);
  const { data: codes } = useExternalCodes(activeHouseholdId, 'item', itemId);
  const { data: places } = usePlaces();
  const { data: placements } = useItemPlacements(itemId);
  // If this item is ALSO a place, it has a place facet holding its contents.
  const { data: facet } = usePlaceForItem(itemId);
  const { data: facetContents } = usePlaceContents(facet?.id);
  const { recent, remember } = useRecentPlaces();
  const deleteItem = useDeleteItem();
  const updateItem = useUpdateItem();
  const moveItem = useMoveItem();
  const generateCode = useGenerateItemCode();
  const removeCode = useRemoveItemCode();
  const convertToPlace = useConvertItemToPlace();
  const createPlace = useCreatePlace();
  const addPlacement = useAddPlacement();
  const removePlacement = useRemovePlacement();
  const bind = useBindExternalCode();
  const unbind = useUnbindExternalCode('item', itemId ?? id);
  const { resolve, resolving } = useScan();

  const [movePicker, setMovePicker] = useState(false);
  const [alsoPicker, setAlsoPicker] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>(null);
  /** Shown INSIDE the camera so the user sees it without closing the scanner. */
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [pendingPlace, setPendingPlace] = useState<{ value: string; type: ExternalCodeType } | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [valueDraft, setValueDraft] = useState<string | null>(null);
  const [quantityDraft, setQuantityDraft] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);

  // Recently-used places first, so the picker doesn't start with an
  // alphabetical wall of every place in the household.
  const pickerPlaces = useMemo(
    () => orderByRecent(places ?? [], recent, (p: Place) => p.id),
    [places, recent],
  );

  if (isLoading) {
    return <Screen><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Muted>{t('common.loading')}</Muted></View></Screen>;
  }
  if (error) return <Screen><View style={{ padding: spacing.lg }}><ErrorBanner message={(error as Error).message} /></View></Screen>;
  if (!item) return <Screen><View style={{ padding: spacing.lg }}><Muted>{t('errors.notFound')}</Muted></View></Screen>;

  const place = places?.find((p: Place) => p.id === item.current_place_id);
  // The item's own app-QR deep-link (for display + share). Optional: items are
  // created without a code now and only get one on request.
  const token = item.qr_token;
  const qrPayload = token ? appQrPayload('item', token, activeHouseholdId ?? undefined) : null;
  const links = itemLinks(item);
  const photos = item.photo_urls ?? [];
  const total = itemQuantity(item.quantity);
  const inPrimary = remainingQuantity(item.quantity, placements ?? []);
  const overAssigned = isOverAssigned(item.quantity, placements ?? []);
  const placeById = new Map((places ?? []).map((p) => [p.id, p]));

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

  /**
   * Give this item the storage abilities of a place.
   *
   * This used to DESTROY the item: a new place was created from a few of its
   * fields and the item row was deleted, silently throwing away its category,
   * value, product links and extra photos. Now the item keeps everything and
   * simply gains a place facet, and the two stay in sync.
   */
  function onConvertToPlace() {
    Alert.alert(t('items.convertTitle'), t('items.convertMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('items.convertToPlace'),
        onPress: async () => {
          try {
            await convertToPlace.mutateAsync(item!.id);
            hapticSuccess();
            setPrompt(t('items.convertSuccess'));
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

  /** Drop the app-generated QR. Printed labels for it stop resolving, so ask. */
  function onRemoveCode() {
    Alert.alert(t('codes.removeTitle'), t('codes.removeMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('codes.remove'),
        style: 'destructive',
        onPress: () => {
          hapticWarning();
          removeCode.mutate(item!.id);
        },
      },
    ]);
  }

  function onMove(placeId: string | null) {
    moveItem.mutate({ itemId: item!.id, placeId });
    remember(placeId);
    setMovePicker(false);
  }

  /** Add an EXTRA place this item is also stored in (see item_placements). */
  function onAddPlacement(placeId: string) {
    addPlacement.mutate(
      { itemId: item!.id, placeId, quantity: 1 },
      { onSuccess: () => hapticSuccess() },
    );
    remember(placeId);
    setAlsoPicker(false);
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

  async function onSaveQuantity() {
    const parsed = parseQuantity(quantityDraft ?? '');
    if (parsed == null) {
      setQuantityDraft(null);
      return;
    }
    await updateItem.mutateAsync({ id: item!.id, patch: { quantity: parsed } });
    hapticSuccess();
    setQuantityDraft(null);
  }

  /**
   * Re-estimate the value of an item that already exists.
   *
   * Value used to be reachable only through whole-form enrichment while
   * CREATING an item — after that there was no way to ask again, however much
   * the photos or description had improved. This asks for the value field
   * alone and writes it straight back.
   */
  async function onEstimateValue() {
    if (!activeHouseholdId || !item) return;
    setEstimating(true);
    try {
      const res = await enrichItem({
        householdId: activeHouseholdId,
        field: 'value',
        name: item.name,
        description: item.description ?? undefined,
        category: item.category ?? undefined,
        photoUrls: item.photo_urls ?? [],
        existingTags: item.tags ?? [],
        language: profile?.default_language ?? 'en',
      });
      const patch = applyFieldEnrichment(
        {
          name: item.name,
          description: item.description ?? '',
          category: item.category ?? '',
          links,
          tags: item.tags ?? [],
          estimatedValue: item.estimated_value,
          valueCurrency: item.value_currency,
          valueSource: (item.value_source as 'ai' | 'manual' | null) ?? null,
        },
        res,
        'value',
      );
      if (patch.estimatedValue == null) {
        setPrompt(t('items.valueNoEstimate'));
        return;
      }
      await updateItem.mutateAsync({
        id: item.id,
        patch: {
          estimated_value: patch.estimatedValue,
          value_currency: patch.valueCurrency,
          value_source: 'ai',
          value_updated_at: new Date().toISOString(),
        },
      });
      hapticSuccess();
    } catch (e) {
      Alert.alert(t('errors.generic'), e instanceof Error ? e.message : undefined);
    } finally {
      setEstimating(false);
    }
  }

  function openScanner(mode: Exclude<ScanMode, null>) {
    setScanNotice(null);
    setScanMode(mode);
  }

  /** Resolve a scanned code from the item screen. Only somewhere that can HOLD
   * things is meaningful here — a place, or an item that is also a place.
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
      if (!o.inActiveHousehold) {
        hapticWarning();
        setScanNotice(t('scanResolve.otherHousehold'));
        return;
      }
      // An item that is ALSO a place is a perfectly good location, so look up
      // its facet before rejecting the scan.
      let facetId: string | null = null;
      if (m.entity_type === 'item') {
        const { data } = await supabase
          .from('places')
          .select('id')
          .eq('item_id', m.entity_id)
          .maybeSingle();
        facetId = (data?.id as string | undefined) ?? null;
      }
      const targetPlaceId = scanTargetPlaceId(m, facetId);
      if (!targetPlaceId) {
        hapticWarning();
        setScanNotice(t('items.scanNotAPlace'));
        return; // keep camera open so the user can retry
      }
      if (targetPlaceId === facet?.id) {
        hapticWarning();
        setScanNotice(t('items.scanSelf'));
        return;
      }
      moveItem.mutate(
        { itemId: item!.id, placeId: targetPlaceId, noteKey: 'scanned_to' },
        {
          onSuccess: () => {
            hapticSuccess();
            remember(targetPlaceId);
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
    remember(created.id);
    setPendingPlace(null);
    setPrompt(t('items.scannedToPlace'));
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ alignItems: 'center' }}>
        <MaxWidth style={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
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
                <ExpoImage uri={uri} style={{ width: 220, height: 220, borderRadius: radius.mdLg }} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}
        {photos.length > 0 ? <Muted style={{ fontSize: 11 }}>{t('photos.zoomHint')}</Muted> : null}

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <H2>{item.name}</H2>
            {item.category ? <Muted>{item.category}</Muted> : null}
          </View>
          <Button title={t('common.edit')} variant="ghost" onPress={() => router.push({ pathname: '/item/new', params: { id: item.id } } as never)} />
        </View>
        {/* Full description — wraps over as many lines as it needs. */}
        {item.description ? <Body>{item.description}</Body> : null}
        <TagList tags={item.tags} />

        {/* Quantity: one row for ten pencils, not ten rows. */}
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Muted style={{ fontSize: 11, textTransform: 'uppercase' }}>{t('items.quantity')}</Muted>
              <Body style={{ fontWeight: '700', fontSize: 17 }}>{total}</Body>
            </View>
            <Button
              title={quantityDraft == null ? t('common.edit') : t('common.cancel')}
              variant="ghost"
              onPress={() => setQuantityDraft(quantityDraft == null ? String(total) : null)}
            />
          </View>
          {quantityDraft != null ? (
            <View style={{ gap: spacing.sm }}>
              <Input
                value={quantityDraft}
                onChangeText={setQuantityDraft}
                keyboardType="number-pad"
                accessibilityLabel={t('items.quantity')}
              />
              <Button title={t('common.save')} onPress={onSaveQuantity} loading={updateItem.isPending} />
            </View>
          ) : null}
        </Card>

        {/* Value card: an AI estimate the user can correct — or re-ask for. */}
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Muted style={{ fontSize: 11, textTransform: 'uppercase' }}>{t('items.value')}</Muted>
              {item.estimated_value != null ? (
                <Body style={{ fontWeight: '700', fontSize: 17 }}>
                  {formatMoney(item.estimated_value, item.value_currency)}
                  {total > 1 ? (
                    <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '400' }}>
                      {'  '}
                      {t('items.valueTotal', {
                        total: formatMoney(item.estimated_value * total, item.value_currency),
                      })}
                    </Text>
                  ) : null}
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
            {/* Re-estimate, at any time — not just while creating the item. */}
            <AiButton
              onPress={onEstimateValue}
              loading={estimating}
              accessibilityLabel={t('items.valueEstimate')}
            />
            <Button
              title={valueDraft == null ? t('items.setValue') : t('common.cancel')}
              variant="ghost"
              onPress={() =>
                setValueDraft(valueDraft == null ? (item.estimated_value?.toString() ?? '') : null)
              }
            />
          </View>
          {valueDraft != null ? (
            <View style={{ gap: spacing.sm }}>
              <Input
                value={valueDraft}
                onChangeText={setValueDraft}
                keyboardType="decimal-pad"
                placeholder={t('items.valuePlaceholder')}
                accessibilityLabel={t('items.value')}
                clearable
              />
              <Button title={t('common.save')} onPress={onSaveValue} loading={updateItem.isPending} />
            </View>
          ) : null}
        </Card>

        <Card style={{ gap: spacing.md }}>
          {/* Location header: label + the current place name (or empty state).
              Tapping the place name opens that place. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={{ fontSize: 18 }}>📍</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
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
              {total > 1 && (placements?.length ?? 0) > 0 ? (
                <Muted style={{ fontSize: 11 }}>{t('items.hereCount', { count: inPrimary })}</Muted>
              ) : null}
            </View>
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Button
              title={movePicker ? t('common.cancel') : t('items.changeLocation')}
              variant="ghost"
              onPress={() => setMovePicker(!movePicker)}
            />
            <Button title={t('items.scanSetLocation')} variant="ghost" onPress={() => openScanner('location')} />
          </View>

          {/* Inline place picker */}
          {movePicker ? (
            <View style={{ gap: 4 }}>
              <Muted style={{ fontSize: 11, marginBottom: 4 }}>{t('items.moveTo')}</Muted>
              <PlaceOption label={t('items.notLocated')} onPress={() => onMove(null)} selected={!item.current_place_id} />
              {pickerPlaces.map((p: Place) => (
                <PlaceOption
                  key={p.id}
                  label={p.name}
                  badge={recent.includes(p.id) ? t('items.recent') : undefined}
                  onPress={() => onMove(p.id)}
                  selected={p.id === item.current_place_id}
                />
              ))}
            </View>
          ) : null}
        </Card>

        {/* Extra locations: the same item stored in more than one place. */}
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Muted style={{ fontSize: 11, textTransform: 'uppercase' }}>{t('items.alsoStoredIn')}</Muted>
              {(placements?.length ?? 0) === 0 ? (
                <Muted style={{ fontSize: 12 }}>{t('items.alsoStoredInHint')}</Muted>
              ) : null}
            </View>
            <Button
              title={alsoPicker ? t('common.cancel') : t('items.addLocation')}
              variant="ghost"
              onPress={() => setAlsoPicker(!alsoPicker)}
            />
          </View>

          {(placements ?? []).map((p) => {
            const target = placeById.get(p.place_id);
            return (
              <View
                key={p.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
              >
                <TouchableOpacity
                  style={{ flex: 1, minWidth: 0 }}
                  onPress={() => router.push(`/place/${p.place_id}` as never)}
                  accessibilityRole="link"
                  accessibilityLabel={target?.name ?? p.place_id}
                >
                  <Body style={{ color: colors.primary }} numberOfLines={2}>
                    {target?.name ?? t('items.location')} ›
                  </Body>
                </TouchableOpacity>
                <Muted>{t('items.hereCount', { count: p.quantity })}</Muted>
                <TouchableOpacity
                  onPress={() => removePlacement.mutate({ id: p.id, itemId: item.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('common.delete')} ${target?.name ?? ''}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: radius.sm,
                    backgroundColor: tint(colors.danger),
                  }}
                >
                  <Text style={{ color: colors.danger, fontSize: 12 }}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {overAssigned ? (
            <Muted style={{ fontSize: 11, color: colors.warning }}>
              {t('items.overAssigned', { placed: placedQuantity(placements ?? []), total })}
            </Muted>
          ) : null}

          {alsoPicker ? (
            <View style={{ gap: 4 }}>
              {pickerPlaces
                .filter((p: Place) => p.id !== item.current_place_id)
                .filter((p: Place) => !(placements ?? []).some((pl) => pl.place_id === p.id))
                .map((p: Place) => (
                  <PlaceOption key={p.id} label={p.name} onPress={() => onAddPlacement(p.id)} />
                ))}
            </View>
          ) : null}
        </Card>

        {prompt ? (
          <Card>
            <Body style={{ fontWeight: '600' }}>{prompt}</Body>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <Button title={t('common.done')} onPress={() => setPrompt(null)} />
            </View>
          </Card>
        ) : null}

        {/* Storage facet: this item is also a place other things live in. */}
        {facet ? (
          <Card style={{ gap: spacing.sm }}>
            <Muted style={{ fontSize: 11, textTransform: 'uppercase' }}>{t('items.storage')}</Muted>
            <Body>{t('items.storageHolds', { count: facetContents?.length ?? 0 })}</Body>
            <Button
              title={t('items.openStorage')}
              onPress={() => router.push(`/place/${facet.id}` as never)}
            />
          </Card>
        ) : null}

        <LinksCard links={links} onOpen={onOpenLink} />

        {/* Codes: an item may have none, one, or many. */}
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
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
          <Card style={{ alignItems: 'center', gap: spacing.sm }}>
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
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
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

        <View style={{ gap: spacing.sm }}>
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

        {!facet ? (
          <Button title={t('items.convertToPlace')} variant="ghost" onPress={onConvertToPlace} loading={convertToPlace.isPending} />
        ) : null}
        <Button title={t('common.delete')} variant="danger" onPress={onDelete} loading={deleteItem.isPending} />
        </MaxWidth>
      </ScrollView>

      <ScanCameraModal
        visible={scanMode !== null}
        hint={scanMode === 'code' ? t('codes.addByScan') : t('items.scanSetLocation')}
        notice={scanNotice}
        onDismissNotice={() => setScanNotice(null)}
        busy={resolving || bind.isPending}
        onUnreadable={() => setScanNotice(t('scan.unreadable'))}
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

function PlaceOption({
  label,
  badge,
  onPress,
  selected,
}: {
  label: string;
  badge?: string;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: selected ? tint(colors.primary, '33') : colors.surfaceAlt,
        borderRadius: radius.sm,
      }}
    >
      <Text style={{ color: selected ? colors.primary : colors.text, flex: 1 }} numberOfLines={2}>
        {label}
      </Text>
      {badge ? (
        <Text style={{ color: colors.textMuted, fontSize: 10, textTransform: 'uppercase' }}>
          {badge}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}
