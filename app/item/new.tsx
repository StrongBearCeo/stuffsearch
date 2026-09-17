/** Create or edit an item. Supports a prefilled external code (from scan) and
 * optional LLM enrichment — whole-form, or one field at a time. When `id` param
 * is present, edits that item. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, Alert, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  FormScreen, H1, Input, Muted, Card, Button, ErrorBanner, Field, AiButton,
} from '../../src/components/primitives';
import { BarcodeImage } from '../../src/components/BarcodeImage';
import { PhotoInput } from '../../src/components/PhotoInput';
import { LinksCard } from '../../src/components/LinksCard';
import { TagInput } from '../../src/components/Tags';
import { ScanCameraModal } from '../../src/components/ScanCameraModal';
import { PhotoCaptureModal } from '../../src/components/PhotoCaptureModal';
import { useCreateItem, useUpdateItem, useItem, useItems } from '../../src/hooks/useItems';
import { usePhotoPicker } from '../../src/hooks/usePhotoPicker';
import { usePhotoRotate } from '../../src/hooks/usePhotoRotate';
import { useBindExternalCode } from '../../src/hooks/useExternalCode';
import { useHousehold } from '../../src/lib/household';
import { useAuth } from '../../src/lib/auth';
import { errorMessage, isDuplicateCodeError, isUnstorableTextError } from '../../src/lib/errors';
import { enrichItem } from '../../src/lib/llm';
import { applyEnrichment, applyFieldEnrichment, type EnrichableField } from '../../src/lib/enrich';
import { itemLinks, linkColumns, mergeLinks, normalizeLink } from '../../src/lib/links';
import { collectTags } from '../../src/lib/tags';
import { addPhotos, movePhoto, removePhotoAt, replacePhotoAt } from '../../src/lib/photos';
import { parseQuantity, itemQuantity } from '../../src/lib/quantity';
import { parseValueInput, DEFAULT_CURRENCY } from '../../src/lib/value';
import { createSubmitGuard } from '../../src/lib/submit';
import { newUuid } from '../../src/lib/ids';
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
  const { pickFromLibrary, uploadLocal, uploading: photoUploading, error: photoError, clearError } = usePhotoPicker('items', true);
  const {
    rotate: rotatePhoto,
    rotatingIndex,
    error: rotateError,
    clearError: clearRotateError,
  } = usePhotoRotate('items');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [links, setLinks] = useState<string[]>([]);
  const [linkDraft, setLinkDraft] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [quantity, setQuantity] = useState('1');
  const [value, setValue] = useState('');
  const [valueCurrency, setValueCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [valueSource, setValueSource] = useState<'ai' | 'manual' | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  // A code scanned from within this form (overrides any params.code from the
  // scan tab). Bound to the new item on save.
  const [scannedCode, setScannedCode] = useState<{ value: string; type: ExternalCodeType } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  /** The burst camera. Kept out of the picker hook: several shots in one
   *  session is a camera UI, not a system picker call. */
  const [captureOpen, setCaptureOpen] = useState(false);
  const [enriching, setEnriching] = useState(false);
  /** Which single field the ✨ is currently working on, if any. */
  const [enrichingField, setEnrichingField] = useState<EnrichableField | null>(null);
  const [instruction, setInstruction] = useState('');
  const [enrichNote, setEnrichNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Duplicate-save protection, two layers:
   *   - `guard` drops a second tap landing in the same frame, before
   *     `createItem.isPending` has had a chance to re-render the button;
   *   - `draftId` is the row's primary key, chosen here and reused across
   *     retries, so even a request that silently succeeded and then timed out
   *     can't produce a second item.
   */
  const guard = useRef(createSubmitGuard()).current;
  const draftId = useRef<string>(newUuid()).current;

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
      setLinks(itemLinks(existing));
      setTags(existing.tags ?? []);
      setQuantity(String(itemQuantity(existing.quantity)));
      setValue(existing.estimated_value != null ? String(existing.estimated_value) : '');
      setValueCurrency(existing.value_currency ?? DEFAULT_CURRENCY);
      setValueSource((existing.value_source as 'ai' | 'manual' | null) ?? null);
      setPhotos(existing.photo_urls ?? []);
    } else {
      setName(params.name ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, params.name]);

  /** Ask the user where to pick from. Both sources take several photos at once:
   *  the library picker is multi-select, and the camera stays open across shots. */
  function onAddPhoto() {
    clearError();
    Alert.alert(t('photos.chooseSource'), undefined, [
      { text: t('photos.camera'), onPress: () => setCaptureOpen(true) },
      { text: t('photos.library'), onPress: () => runLibraryPicker() },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  async function runLibraryPicker() {
    const urls = await pickFromLibrary();
    if (urls.length > 0) setPhotos((prev) => addPhotos(prev, urls));
  }

  /** A finished burst: close the camera first so the form's own uploading
   *  spinner is what the user waits on, then upload every shot. */
  async function onCaptured(uris: string[]) {
    setCaptureOpen(false);
    const urls = await uploadLocal(uris);
    if (urls.length > 0) setPhotos((prev) => addPhotos(prev, urls));
  }

  /** Rotate one photo a quarter turn and swap in the new URL in place. */
  async function onRotatePhoto(index: number) {
    clearRotateError();
    const current = photos[index];
    if (!current) return;
    const rotated = await rotatePhoto(current, index);
    if (rotated) setPhotos((prev) => replacePhotoAt(prev, index, rotated));
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
    await guard.run(async () => {
      try {
        const parsedValue = parseValueInput(value);
        const payload = {
          name: name.trim(),
          description: description.trim() || null,
          ...linkColumns(mergeLinks(links, linkDraft ? [linkDraft] : [])),
          tags,
          quantity: parseQuantity(quantity) ?? 1,
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
            id: draftId,
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
        // Translate the two failures that are guaranteed to be gibberish to a
        // user: the raw 23505 names a constraint, and 22P05 talks about
        // Unicode escape sequences while the form simply refuses to save.
        setError(
          isDuplicateCodeError(e)
            ? t('codes.boundElsewhere')
            : isUnstorableTextError(e)
              ? t('errors.unstorableText')
              : errorMessage(e),
        );
      }
    });
  }

  /** Everything the model gets to look at, whichever button was pressed. */
  function enrichRequest() {
    return {
      householdId: activeHouseholdId!,
      name,
      description,
      photoUrls: photos,
      existingLinks: links,
      existingTags: tags,
      barcode: codeValue,
      barcodeType: codeType,
      language: profile?.default_language ?? 'en',
      instruction: instruction.trim() || undefined,
    };
  }

  /**
   * Ask the model to fill in what it can, across the whole form. Photos ARE
   * sent — enrichment is vision-based — along with the name, description,
   * tags and barcode, and the follow-up instruction if the user
   * typed one. Existing links and a hand-set value are passed in and preserved
   * by `applyEnrichment`.
   */
  async function onEnrich() {
    if (!activeHouseholdId) return;
    setEnriching(true);
    setError(null);
    setEnrichNote(null);
    try {
      const res = await enrichItem(enrichRequest());
      const patch = applyEnrichment(
        {
          name,
          description,
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

  /** The ✨ beside one field: rewrite just that field, leave the rest alone. */
  async function onEnrichField(field: EnrichableField) {
    if (!activeHouseholdId) return;
    setEnrichingField(field);
    setError(null);
    setEnrichNote(null);
    try {
      const res = await enrichItem({ ...enrichRequest(), field });
      const patch = applyFieldEnrichment(
        {
          name,
          description,
          links,
          tags,
          estimatedValue: parseValueInput(value),
          valueCurrency,
          valueSource,
        },
        res,
        field,
      );
      switch (field) {
        case 'name': setName(patch.name); break;
        case 'description': setDescription(patch.description); break;
        case 'tags': setTags(patch.tags); break;
        case 'links': setLinks(patch.links); break;
        case 'value':
          setValue(patch.estimatedValue != null ? String(patch.estimatedValue) : '');
          setValueCurrency(patch.valueCurrency);
          setValueSource(patch.valueSource);
          break;
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setEnrichingField(null);
    }
  }

  const canEnrich = photos.length > 0 || !!name.trim() || !!codeValue || !!instruction.trim();
  const busy = enriching || enrichingField !== null;

  /** The ✨ for one field, wired to the shared busy state. */
  const fieldAi = (field: EnrichableField) => (
    <AiButton
      onPress={() => onEnrichField(field)}
      loading={enrichingField === field}
      disabled={!canEnrich || busy}
      accessibilityLabel={t('items.aiField', { field: t(`items.${field === 'links' ? 'productLinks' : field}`) })}
    />
  );

  return (
    <FormScreen contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
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
            onRemove={(i) => setPhotos((prev) => removePhotoAt(prev, i))}
            onMove={(from, to) => setPhotos((prev) => movePhoto(prev, from, to))}
            onRotate={onRotatePhoto}
            rotatingIndex={rotatingIndex}
            uploading={photoUploading}
          />
          {photoError ? <ErrorBanner message={photoError} /> : null}
          {rotateError ? <ErrorBanner message={rotateError} /> : null}
        </View>

        {/* Enrichment sits right under the photos: with a picture attached it
            can fill in everything below on its own. The instruction box lets
            the user steer it — "it's the 18V model", "describe the wear" —
            instead of re-running it and hoping for a different guess. */}
        <Card style={{ gap: spacing.sm }}>
          <Input
            placeholder={t('items.enrichInstructionPlaceholder')}
            value={instruction}
            onChangeText={setInstruction}
            multiline
            clearable
            style={{ minHeight: 44 }}
            accessibilityLabel={t('items.enrichInstruction')}
          />
          <Button
            title={t('items.enrich')}
            onPress={onEnrich}
            loading={enriching}
            disabled={!canEnrich || busy}
          />
          <Muted style={{ fontSize: 11 }}>{t('items.enrichHint')}</Muted>
          {enrichNote ? <Muted style={{ fontSize: 12 }}>{enrichNote}</Muted> : null}
        </Card>

        <View style={{ gap: spacing.lg }}>
          <Field label={t('items.name')} action={fieldAi('name')}>
            <Input
              placeholder={t('items.name')}
              value={name}
              onChangeText={setName}
              // Names get long ("Unbranded short USB-A 3.0 blue to USB-C
              // cable"); a single line clipped them mid-word while editing.
              multiline
              clearable
              clearLabel={`${t('common.clear')} ${t('items.name')}`}
              style={{ minHeight: 48 }}
            />
          </Field>
          <Field label={t('items.description')} action={fieldAi('description')}>
            <Input
              placeholder={t('items.description')}
              value={description}
              onChangeText={setDescription}
              multiline
              clearable
              clearLabel={`${t('common.clear')} ${t('items.description')}`}
              style={{ minHeight: 120 }}
            />
          </Field>
          <Field label={t('items.quantity')} hint={t('items.quantityHint')}>
            <Input
              placeholder="1"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
            />
          </Field>
          <Field label={t('items.value')} action={fieldAi('value')}>
            <Input
              placeholder={t('items.valuePlaceholder')}
              value={value}
              onChangeText={(v) => {
                setValue(v);
                setValueSource('manual'); // typing makes it the user's number
              }}
              keyboardType="decimal-pad"
              clearable
            />
            {valueSource === 'ai' ? <Muted style={{ fontSize: 11 }}>{t('items.valueFromAi')}</Muted> : null}
          </Field>
          <Field label={t('items.tags')} action={fieldAi('tags')}>
            <TagInput tags={tags} onChange={setTags} suggestions={tagSuggestions} />
          </Field>
          <Field label={t('items.productLinks')} action={fieldAi('links')}>
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

        <PhotoCaptureModal
          visible={captureOpen}
          onDone={onCaptured}
          onClose={() => setCaptureOpen(false)}
        />
    </FormScreen>
  );
}
