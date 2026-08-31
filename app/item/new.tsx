/** Create or edit an item. Supports a prefilled external code (from scan) and
 * optional LLM enrichment. When `id` param is present, edits that item. */
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, Alert, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FormScreen, H1, Input, Muted, Card, Button, ErrorBanner } from '../../src/components/primitives';
import { BarcodeImage } from '../../src/components/BarcodeImage';
import { PhotoInput } from '../../src/components/PhotoInput';
import { LinksCard } from '../../src/components/LinksCard';
import { TagInput } from '../../src/components/Tags';
import { ScanCameraModal } from '../../src/components/ScanCameraModal';
import { useCreateItem, useUpdateItem, useItem, useItems } from '../../src/hooks/useItems';
import { usePhotoPicker, type PhotoSource } from '../../src/hooks/usePhotoPicker';
import { useBindExternalCode } from '../../src/hooks/useExternalCode';
import { useHousehold } from '../../src/lib/household';
import { useAuth } from '../../src/lib/auth';
import { errorMessage } from '../../src/lib/errors';
import { enrichItem } from '../../src/lib/llm';
import { applyEnrichment } from '../../src/lib/enrich';
import { itemLinks, linkColumns, mergeLinks, normalizeLink } from '../../src/lib/links';
import { collectTags } from '../../src/lib/tags';
import { parseValueInput, DEFAULT_CURRENCY } from '../../src/lib/value';
import { scannerTypeToCodeType } from '../../src/lib/constants';
import { spacing } from '../../src/theme';
import { useTranslation } from 'react-i18next';
import { useHeaderTitle } from '../../src/lib/useHeaderTitle';
import { hapticSuccess } from '../../src/lib/haptics';
import type { ExternalCodeType } from '../../src/lib/supabase';

export default function NewItemScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    id?: string;
    code?: string;
    type?: string;
    name?: string;
    category?: string;
    placeId?: string;
  }>();
  const editing = !!params.id;
  useHeaderTitle(editing ? t('common.edit') : t('items.new'));
  const { data: existing } = useItem(params.id);

  const { activeHouseholdId } = useHousehold();
  const { user, profile } = useAuth();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const bind = useBindExternalCode();
  const { data: allItems } = useItems();
  const { pickAndUpload, uploading: photoUploading, error: photoError, clearError } = usePhotoPicker('items', true);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [links, setLinks] = useState<string[]>([]);
  const [linkDraft, setLinkDraft] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [value, setValue] = useState('');
  const [valueCurrency, setValueCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [valueSource, setValueSource] = useState<'ai' | 'manual' | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  // A code scanned from within this form (overrides any params.code from the
  // scan tab). Bound to the new item on save.
  const [scannedCode, setScannedCode] = useState<{ value: string; type: ExternalCodeType } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichNote, setEnrichNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Capture a code scanned from within the form. We store the raw value (no
   *  resolution/bind here) and bind it on save, mirroring the params.code flow. */
  function onScanCode(payload: string, rawType?: string) {
    setScannedCode({ value: payload, type: scannerTypeToCodeType(rawType ?? 'other') });
    setScanOpen(false);
  }

  // The effective code to bind: prefer an in-form scan, fall back to params.
  const codeValue = scannedCode?.value ?? params.code;
  const codeType: ExternalCodeType = scannedCode?.type ?? (params.type as ExternalCodeType) ?? 'other';

  // Tags already in use across the household, offered as one-tap suggestions.
  const tagSuggestions = useMemo(
    () => collectTags(allItems ?? []).map((t2) => t2.tag),
    [allItems],
  );

  // Prefill from existing (edit) or scan params.
  useEffect(() => {
    if (editing && existing) {
      setName(existing.name);
      setDescription(existing.description ?? '');
      setCategory(existing.category ?? '');
      setLinks(itemLinks(existing));
      setTags(existing.tags ?? []);
      setValue(existing.estimated_value != null ? String(existing.estimated_value) : '');
      setValueCurrency(existing.value_currency ?? DEFAULT_CURRENCY);
      setValueSource((existing.value_source as 'ai' | 'manual' | null) ?? null);
      setPhotos(existing.photo_urls ?? []);
    } else {
      setName(params.name ?? '');
      setCategory(params.category ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, params.name]);

  /** Ask the user where to pick from, then upload. Item form supports multiple. */
  function onAddPhoto() {
    clearError();
    Alert.alert(t('photos.chooseSource'), undefined, [
      { text: t('photos.camera'), onPress: () => runPicker('camera') },
      { text: t('photos.library'), onPress: () => runPicker('library') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  async function runPicker(source: PhotoSource) {
    const urls = await pickAndUpload(source);
    if (urls && urls.length > 0) {
      setPhotos((prev) => [...prev, ...urls]);
    }
  }

  /** Open a link from the editor so the user can check it before saving. */
  function onOpenLink(raw: string) {
    const url = normalizeLink(raw);
    if (!url) return;
    Linking.openURL(url).catch(() => {
      Alert.alert(t('items.productLink'), t('errors.generic'));
    });
  }

  function onAddLink() {
    const link = normalizeLink(linkDraft);
    if (!link) return;
    setLinks((prev) => mergeLinks(prev, [link]));
    setLinkDraft('');
  }

  async function onSave() {
    if (!name.trim()) return;
    setError(null);
    try {
      const parsedValue = parseValueInput(value);
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        ...linkColumns(mergeLinks(links, linkDraft ? [linkDraft] : [])),
        tags,
        photo_urls: photos,
        estimated_value: parsedValue,
        value_currency: parsedValue == null ? null : valueCurrency,
        value_source: parsedValue == null ? null : valueSource ?? 'manual',
        value_updated_at: parsedValue == null ? null : new Date().toISOString(),
      };
      let itemId: string;
      if (editing && params.id) {
        const updated = await updateItem.mutateAsync({ id: params.id, patch: payload });
        itemId = updated.id;
      } else {
        // If invoked from a place's "scan to add", create the item already
        // located inside that place (useCreateItem writes a "created here"
        // history row when current_place_id is set).
        const created = await createItem.mutateAsync({
          ...payload,
          ...(params.placeId ? { current_place_id: params.placeId } : {}),
        });
        itemId = created.id;
        // If a code came from the scan flow or was scanned in-form, bind it.
        if (codeValue && activeHouseholdId && user) {
          await bind.mutateAsync({
            householdId: activeHouseholdId,
            codeValue,
            codeType: scannerTypeToCodeType(codeType === 'other' ? 'other' : codeType),
            entityType: 'item',
            entityId: itemId,
            boundBy: user.id,
          });
        }
      }
      hapticSuccess();
      router.replace(`/item/${itemId}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  /**
   * Ask the model to fill in what it can. Photos ARE sent — enrichment is
   * vision-based, so an item with only a picture still gets a name, category,
   * description and value. Existing links and the hand-set value are passed in
   * and preserved by `applyEnrichment`.
   */
  async function onEnrich() {
    if (!activeHouseholdId) return;
    setEnriching(true);
    setError(null);
    setEnrichNote(null);
    try {
      const res = await enrichItem({
        householdId: activeHouseholdId,
        name,
        description,
        category,
        photoUrls: photos,
        existingLinks: links,
        barcode: codeValue,
        barcodeType: codeType,
        language: profile?.default_language ?? 'en',
      });
      const patch = applyEnrichment(
        {
          name,
          description,
          category,
          links,
          tags,
          estimatedValue: parseValueInput(value),
          valueCurrency,
          valueSource,
        },
        res,
      );
      setName(patch.name);
      setDescription(patch.description);
      setCategory(patch.category);
      setLinks(patch.links);
      setTags(patch.tags);
      setValue(patch.estimatedValue != null ? String(patch.estimatedValue) : '');
      setValueCurrency(patch.valueCurrency);
      setValueSource(patch.valueSource);
      if (res.rejected_links && res.rejected_links.length > 0) {
        setEnrichNote(t('items.enrichDroppedLinks', { count: res.rejected_links.length }));
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setEnriching(false);
    }
  }

  const canEnrich = photos.length > 0 || !!name.trim() || !!codeValue;

  return (
    <FormScreen contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <H1>{editing ? t('common.edit') : t('items.new')}</H1>

        {codeValue ? (
          <Card style={{ gap: 8 }}>
            <BarcodeImage value={codeValue} codeType={codeType} />
            <Muted>{scannedCode ? t('items.scannedCode') : t('codes.value')}</Muted>
            <Text style={{ color: '#fff', fontFamily: 'monospace' }}>{codeValue}</Text>
            {scannedCode ? (
              <Button
                title={t('common.cancel')}
                variant="ghost"
                onPress={() => setScannedCode(null)}
              />
            ) : null}
          </Card>
        ) : !editing ? (
          <>
            <Button title={t('items.scanCode')} variant="ghost" onPress={() => setScanOpen(true)} />
            <Muted style={{ fontSize: 12 }}>{t('codes.optionalHint')}</Muted>
          </>
        ) : null}

        <View style={{ gap: 8 }}>
          <PhotoInput
            photos={photos}
            onAdd={onAddPhoto}
            onRemove={(i) => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
            uploading={photoUploading}
          />
          {photoError ? <ErrorBanner message={photoError} /> : null}
        </View>

        {/* Enrichment sits right under the photos: with a picture attached it
            can fill in everything below on its own. */}
        <Button
          title={photos.length > 0 ? t('items.enrichFromPhoto') : t('items.enrich')}
          variant="ghost"
          onPress={onEnrich}
          loading={enriching}
          disabled={!canEnrich}
        />
        {enrichNote ? <Muted style={{ fontSize: 12 }}>{enrichNote}</Muted> : null}

        <View style={{ gap: spacing.md }}>
          <Field label={t('items.name')}>
            <Input placeholder={t('items.name')} value={name} onChangeText={setName} />
          </Field>
          <Field label={t('items.category')}>
            <Input placeholder={t('items.category')} value={category} onChangeText={setCategory} />
          </Field>
          <Field label={t('items.description')}>
            <Input
              placeholder={t('items.description')}
              value={description}
              onChangeText={setDescription}
              multiline
              style={{ minHeight: 110 }}
            />
          </Field>
          <Field label={t('items.value')}>
            <Input
              placeholder={t('items.valuePlaceholder')}
              value={value}
              onChangeText={(v) => {
                setValue(v);
                setValueSource('manual'); // typing makes it the user's number
              }}
              keyboardType="decimal-pad"
            />
            {valueSource === 'ai' ? <Muted style={{ fontSize: 11 }}>{t('items.valueFromAi')}</Muted> : null}
          </Field>
          <Field label={t('items.tags')}>
            <TagInput tags={tags} onChange={setTags} suggestions={tagSuggestions} />
          </Field>
          <Field label={t('items.productLinks')}>
            <View style={{ gap: 8 }}>
              <LinksCard
                links={links}
                title={t('links.count', { count: links.length })}
                onOpen={onOpenLink}
                onRemove={(url) => setLinks((prev) => prev.filter((l) => l !== url))}
              />
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Input
                    placeholder={t('items.productLink')}
                    value={linkDraft}
                    onChangeText={setLinkDraft}
                    onSubmitEditing={onAddLink}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                </View>
                <Button title={t('links.add')} variant="ghost" onPress={onAddLink} disabled={!linkDraft.trim()} />
              </View>
            </View>
          </Field>
        </View>

        {error ? <ErrorBanner message={error} /> : null}

        <View style={{ marginTop: spacing.sm }}>
          <Button
            title={t('common.save')}
            onPress={onSave}
            loading={createItem.isPending || updateItem.isPending}
            disabled={name.trim().length === 0}
          />
        </View>

        <ScanCameraModal
          visible={scanOpen}
          hint={t('items.scanCode')}
          onClose={() => setScanOpen(false)}
          onScan={onScanCode}
        />
    </FormScreen>
  );
}

/** A labelled form field — the label sits above the input so it's always clear
 *  what to type, even when the input has a value (placeholders disappear). */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Muted style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase' }}>{label}</Muted>
      {children}
    </View>
  );
}
