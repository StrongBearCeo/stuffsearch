/** Create or edit an item. Supports a prefilled external code (from scan) and
 * optional LLM enrichment. When `id` param is present, edits that item. */
import React, { useEffect, useState } from 'react';
import { Text, View, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FormScreen, H1, Input, Muted, Card, Button, ErrorBanner } from '../../src/components/primitives';
import { BarcodeImage } from '../../src/components/BarcodeImage';
import { PhotoInput } from '../../src/components/PhotoInput';
import { ScanCameraModal } from '../../src/components/ScanCameraModal';
import { useCreateItem, useUpdateItem, useItem } from '../../src/hooks/useItems';
import { usePhotoPicker, type PhotoSource } from '../../src/hooks/usePhotoPicker';
import { useBindExternalCode } from '../../src/hooks/useExternalCode';
import { useHousehold } from '../../src/lib/household';
import { useAuth } from '../../src/lib/auth';
import { errorMessage } from '../../src/lib/errors';
import { enrichItem } from '../../src/lib/llm';
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
  const { user } = useAuth();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const bind = useBindExternalCode();
  const { pickAndUpload, uploading: photoUploading, error: photoError, clearError } = usePhotoPicker('items', true);

  /** Capture a code scanned from within the form. We store the raw value (no
   *  resolution/bind here) and bind it on save, mirroring the params.code flow. */
  async function onScanCode(payload: string, rawType?: string) {
    setScannedCode({ value: payload, type: scannerTypeToCodeType(rawType ?? 'other') });
    setScanOpen(false);
  }

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [productLink, setProductLink] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  // A code scanned from within this form (overrides any params.code from the
  // scan tab). Bound to the new item on save.
  const [scannedCode, setScannedCode] = useState<{ value: string; type: ExternalCodeType } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The effective code to bind: prefer an in-form scan, fall back to params.
  const codeValue = scannedCode?.value ?? params.code;
  const codeType: ExternalCodeType = scannedCode?.type ?? (params.type as ExternalCodeType) ?? 'other';

  // Prefill from existing (edit) or scan params.
  useEffect(() => {
    if (editing && existing) {
      setName(existing.name);
      setDescription(existing.description ?? '');
      setCategory(existing.category ?? '');
      setProductLink(existing.product_link ?? '');
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

  async function onSave() {
    if (!name.trim()) return;
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        product_link: productLink.trim() || null,
        photo_urls: photos,
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

  async function onEnrich() {
    if (!activeHouseholdId) return;
    setEnriching(true);
    setError(null);
    try {
      const res = await enrichItem({
        householdId: activeHouseholdId,
        name,
        description,
        barcode: params.code,
        barcodeType: params.type,
      });
      if (res.name) setName(res.name);
      if (res.category) setCategory(res.category);
      if (res.description) setDescription(res.description);
      if (res.product_link) setProductLink(res.product_link);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setEnriching(false);
    }
  }

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
          <Button title={t('items.scanCode')} variant="ghost" onPress={() => setScanOpen(true)} />
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
            />
          </Field>
          <Field label={t('items.productLink')}>
            <Input placeholder={t('items.productLink')} value={productLink} onChangeText={setProductLink} autoCapitalize="none" />
          </Field>
        </View>

        {!editing ? (
          <Button title={t('items.enrich')} variant="ghost" onPress={onEnrich} loading={enriching} />
        ) : null}

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
