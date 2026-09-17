/** Create or edit a place. Supports a prefilled external code (from scan), AI
 *  enrichment from photos, and — on create — marking the place as an item too. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, Alert, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  FormScreen, H1, Input, Muted, Body, Card, Button, ErrorBanner, Field, AiButton,
} from '../../src/components/primitives';
import { BarcodeImage } from '../../src/components/BarcodeImage';
import { PhotoInput } from '../../src/components/PhotoInput';
import { TagInput } from '../../src/components/Tags';
import { ScanCameraModal } from '../../src/components/ScanCameraModal';
import { useCreatePlace, useUpdatePlace, usePlace, usePlaces } from '../../src/hooks/usePlaces';
import { useUpdateItem } from '../../src/hooks/useItems';
import { usePhotoPicker, type PhotoSource } from '../../src/hooks/usePhotoPicker';
import { useBindExternalCode } from '../../src/hooks/useExternalCode';
import { useHousehold } from '../../src/lib/household';
import { useAuth } from '../../src/lib/auth';
import { errorMessage, isDuplicateCodeError, isUnstorableTextError } from '../../src/lib/errors';
import { enrichItem } from '../../src/lib/llm';
import { applyFieldEnrichment, type EnrichableField } from '../../src/lib/enrich';
import { scannerTypeToCodeType } from '../../src/lib/constants';
import { collectTags } from '../../src/lib/tags';
import { addPhotos, movePhoto, removePhotoAt, placePhotos, placePhotoColumns } from '../../src/lib/photos';
import { createSubmitGuard } from '../../src/lib/submit';
import { colors, radius, spacing, tint } from '../../src/theme';
import { useTranslation } from 'react-i18next';
import { useHeaderTitle } from '../../src/lib/useHeaderTitle';
import { hapticSuccess } from '../../src/lib/haptics';
import type { ExternalCodeType } from '../../src/lib/supabase';

/** Only these make sense for a place: it isn't a product to buy or resell. */
type PlaceField = Extract<EnrichableField, 'name' | 'description' | 'tags'>;

export default function NewPlaceScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string; code?: string; type?: string; name?: string }>();
  const editing = !!params.id;
  useHeaderTitle(editing ? t('common.edit') : t('places.new'));
  const { data: existing } = usePlace(params.id);

  const { activeHouseholdId } = useHousehold();
  const { user, profile } = useAuth();
  const createPlace = useCreatePlace();
  const updatePlace = useUpdatePlace();
  const updateItem = useUpdateItem();
  const bind = useBindExternalCode();
  const { data: allPlaces } = usePlaces();
  // Places take several photos now, exactly like items. The form used to run
  // the picker in single mode and overwrite `photo`, which is why a second
  // photo always replaced the first.
  const { pickAndUpload, uploading: photoUploading, error: photoError, clearError } = usePhotoPicker('places', true);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  /** On create: is this also a thing worth tracking, or just storage? */
  const [alsoItem, setAlsoItem] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [enrichingField, setEnrichingField] = useState<PlaceField | 'all' | null>(null);
  // A code scanned from within this form (overrides any params.code from the
  // scan tab). Bound to the new place on save.
  const [scannedCode, setScannedCode] = useState<{ value: string; type: ExternalCodeType } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // See item/new.tsx: drops a duplicate Save landing in the same frame.
  const guard = useRef(createSubmitGuard()).current;

  // Tags already used on other places, offered as one-tap suggestions.
  const tagSuggestions = useMemo(
    () => collectTags(allPlaces ?? []).map((tc) => tc.tag),
    [allPlaces],
  );

  // The effective code to bind: prefer an in-form scan, fall back to params.
  const codeValue = scannedCode?.value ?? params.code;
  const codeType: ExternalCodeType = scannedCode?.type ?? (params.type as ExternalCodeType) ?? 'other';

  /** True when this place is backed by an item — editing it edits the item. */
  const linkedItemId = existing?.item_id ?? null;

  /** Capture a code scanned from within the form. Stored raw; bound on save. */
  function onScanCode(payload: string, rawType?: string) {
    setScannedCode({ value: payload, type: scannerTypeToCodeType(rawType ?? 'other') });
    setScanOpen(false);
  }

  useEffect(() => {
    if (editing && existing) {
      setName(existing.name);
      setDescription(existing.description ?? '');
      setTags(existing.tags ?? []);
      setPhotos(placePhotos(existing));
    } else {
      setName(params.name ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, params.name]);

  /** Ask where to pick from, then upload. Places accept several photos. */
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
      setPhotos((prev) => addPhotos(prev, urls));
    }
  }

  async function onSave() {
    if (!name.trim()) return;
    setError(null);
    await guard.run(async () => {
      try {
        const payload = {
          name: name.trim(),
          description: description.trim() || null,
          tags,
          ...placePhotoColumns(photos),
        };
        let placeId: string;
        if (editing && params.id) {
          if (linkedItemId) {
            // This place IS an item. The item row is the single source of
            // truth; a database trigger mirrors name / description / tags /
            // photos back onto the place, so writing both here would race.
            await updateItem.mutateAsync({
              id: linkedItemId,
              patch: {
                name: payload.name,
                description: payload.description,
                tags,
                photo_urls: payload.photo_urls,
              },
            });
            placeId = params.id;
          } else {
            const updated = await updatePlace.mutateAsync({ id: params.id, patch: payload });
            placeId = updated.id;
          }
        } else {
          const created = await createPlace.mutateAsync({ ...payload, alsoItem });
          placeId = created.id;
          // If a code came from the scan flow or was scanned in-form, bind it.
          if (codeValue && activeHouseholdId && user) {
            await bind.mutateAsync({
              householdId: activeHouseholdId,
              codeValue,
              codeType: scannerTypeToCodeType(codeType === 'other' ? 'other' : codeType),
              entityType: 'place',
              entityId: placeId,
              boundBy: user.id,
            });
          }
        }
        hapticSuccess();
        router.replace(`/place/${placeId}`);
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

  /**
   * AI enrichment for a place. Same vision model as items, told it's looking
   * at a storage location rather than a product — so it names the shelf and
   * suggests tags instead of trying to price it.
   */
  async function onEnrich(field: PlaceField | 'all') {
    if (!activeHouseholdId) return;
    setEnrichingField(field);
    setError(null);
    try {
      const res = await enrichItem({
        householdId: activeHouseholdId,
        entity: 'place',
        name,
        description,
        photoUrls: photos,
        existingTags: tags,
        language: profile?.default_language ?? 'en',
        instruction: instruction.trim() || undefined,
        ...(field === 'all' ? {} : { field }),
      });
      const snapshot = {
        name,
        description,
        category: '',
        links: [],
        tags,
        estimatedValue: null,
        valueCurrency: null,
        valueSource: null,
      };
      const fields: PlaceField[] = field === 'all' ? ['name', 'description', 'tags'] : [field];
      for (const f of fields) {
        const patch = applyFieldEnrichment({ ...snapshot, name, description, tags }, res, f);
        if (f === 'name') setName(patch.name);
        if (f === 'description') setDescription(patch.description);
        if (f === 'tags') setTags(patch.tags);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setEnrichingField(null);
    }
  }

  const nameEmpty = name.trim().length === 0;
  const canEnrich = photos.length > 0 || !!name.trim() || !!instruction.trim();
  const busy = enrichingField !== null;

  const fieldAi = (field: PlaceField) => (
    <AiButton
      onPress={() => onEnrich(field)}
      loading={enrichingField === field}
      disabled={!canEnrich || busy}
      accessibilityLabel={t('items.aiField', { field: t(`places.${field}`) })}
    />
  );

  return (
    <FormScreen contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      <H1>{editing ? t('common.edit') : t('places.new')}</H1>
      {codeValue ? (
        <Card style={{ gap: 8 }}>
          <BarcodeImage value={codeValue} codeType={codeType} />
          <Muted>{scannedCode ? t('items.scannedCode') : t('codes.value')}</Muted>
          <Text style={{ color: '#fff', fontFamily: 'monospace' }}>{codeValue}</Text>
          {scannedCode ? (
            <Button title={t('common.cancel')} variant="ghost" onPress={() => setScannedCode(null)} />
          ) : null}
        </Card>
      ) : !editing ? (
        <>
          <Button title={t('items.scanCode')} variant="ghost" onPress={() => setScanOpen(true)} />
          <Muted style={{ fontSize: 12 }}>{t('codes.optionalHint')}</Muted>
        </>
      ) : null}

      {/* What KIND of place is this? A shelf is pure storage; a labelled
          toolbox is a thing worth money that also holds things. Only offered
          on create — an existing place is converted from its own screen. */}
      {!editing ? (
        <Field label={t('places.kind')}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <KindOption
              label={t('places.kindStorage')}
              hint={t('places.kindStorageHint')}
              selected={!alsoItem}
              onPress={() => setAlsoItem(false)}
            />
            <KindOption
              label={t('places.kindItem')}
              hint={t('places.kindItemHint')}
              selected={alsoItem}
              onPress={() => setAlsoItem(true)}
            />
          </View>
        </Field>
      ) : null}

      {linkedItemId ? (
        <Card style={{ gap: 4 }}>
          <Body style={{ fontWeight: '600' }}>{t('places.isAlsoItem')}</Body>
          <Muted style={{ fontSize: 12 }}>{t('places.isAlsoItemEditHint')}</Muted>
        </Card>
      ) : null}

      <View style={{ gap: 8 }}>
        <PhotoInput
          photos={photos}
          onAdd={onAddPhoto}
          onRemove={(i) => setPhotos((prev) => removePhotoAt(prev, i))}
          onMove={(from, to) => setPhotos((prev) => movePhoto(prev, from, to))}
          uploading={photoUploading}
        />
        {photoError ? <ErrorBanner message={photoError} /> : null}
      </View>

      <Card style={{ gap: spacing.sm }}>
        <Input
          placeholder={t('places.enrichInstructionPlaceholder')}
          value={instruction}
          onChangeText={setInstruction}
          multiline
          clearable
          style={{ minHeight: 44 }}
          accessibilityLabel={t('items.enrichInstruction')}
        />
        <Button
          title={t('places.enrich')}
          onPress={() => onEnrich('all')}
          loading={enrichingField === 'all'}
          disabled={!canEnrich || busy}
        />
        <Muted style={{ fontSize: 11 }}>{t('places.enrichHint')}</Muted>
      </Card>

      <View style={{ gap: spacing.lg }}>
        <Field label={t('places.name')} action={fieldAi('name')}>
          <Input
            placeholder={t('places.name')}
            value={name}
            onChangeText={setName}
            clearable
            clearLabel={`${t('common.clear')} ${t('places.name')}`}
          />
        </Field>
        <Field label={t('places.description')} action={fieldAi('description')}>
          <Input
            placeholder={t('places.description')}
            value={description}
            onChangeText={setDescription}
            multiline
            clearable
            clearLabel={`${t('common.clear')} ${t('places.description')}`}
            style={{ minHeight: 120 }}
          />
        </Field>
        <Field label={t('places.tags')} action={fieldAi('tags')}>
          <TagInput tags={tags} onChange={setTags} suggestions={tagSuggestions} />
        </Field>
      </View>

      {error ? <ErrorBanner message={error} /> : null}
      <View style={{ marginTop: spacing.sm }}>
        <Button
          title={t('common.save')}
          onPress={onSave}
          loading={createPlace.isPending || updatePlace.isPending || updateItem.isPending}
          disabled={nameEmpty}
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

/** One of the two "what kind of place is this?" cards. */
function KindOption({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}. ${hint}`}
      style={{
        flex: 1,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? tint(colors.primary, '22') : colors.surface,
        gap: 2,
      }}
    >
      <Text style={{ color: selected ? colors.primary : colors.text, fontWeight: '600', fontSize: 14 }}>
        {label}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{hint}</Text>
    </TouchableOpacity>
  );
}
