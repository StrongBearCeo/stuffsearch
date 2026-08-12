/** Create or edit a place. Supports a prefilled external code (from scan). */
import React, { useEffect, useState } from 'react';
import { Text, View, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FormScreen, H1, Input, Muted, Card, Button, ErrorBanner } from '../../src/components/primitives';
import { BarcodeImage } from '../../src/components/BarcodeImage';
import { PhotoInput } from '../../src/components/PhotoInput';
import { ScanCameraModal } from '../../src/components/ScanCameraModal';
import { useCreatePlace, useUpdatePlace, usePlace } from '../../src/hooks/usePlaces';
import { usePhotoPicker, type PhotoSource } from '../../src/hooks/usePhotoPicker';
import { useBindExternalCode } from '../../src/hooks/useExternalCode';
import { useHousehold } from '../../src/lib/household';
import { useAuth } from '../../src/lib/auth';
import { errorMessage } from '../../src/lib/errors';
import { scannerTypeToCodeType } from '../../src/lib/constants';
import { spacing } from '../../src/theme';
import { useTranslation } from 'react-i18next';
import { useHeaderTitle } from '../../src/lib/useHeaderTitle';
import { hapticSuccess } from '../../src/lib/haptics';
import type { ExternalCodeType } from '../../src/lib/supabase';

export default function NewPlaceScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string; code?: string; type?: string; name?: string }>();
  const editing = !!params.id;
  useHeaderTitle(editing ? t('common.edit') : t('places.new'));
  const { data: existing } = usePlace(params.id);

  const { activeHouseholdId } = useHousehold();
  const { user } = useAuth();
  const createPlace = useCreatePlace();
  const updatePlace = useUpdatePlace();
  const bind = useBindExternalCode();
  const { pickAndUpload, uploading: photoUploading, error: photoError, clearError } = usePhotoPicker('places', false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  // A code scanned from within this form (overrides any params.code from the
  // scan tab). Bound to the new place on save.
  const [scannedCode, setScannedCode] = useState<{ value: string; type: ExternalCodeType } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The effective code to bind: prefer an in-form scan, fall back to params.
  const codeValue = scannedCode?.value ?? params.code;
  const codeType: ExternalCodeType = scannedCode?.type ?? (params.type as ExternalCodeType) ?? 'other';

  /** Capture a code scanned from within the form. Stored raw; bound on save. */
  function onScanCode(payload: string, rawType?: string) {
    setScannedCode({ value: payload, type: scannerTypeToCodeType(rawType ?? 'other') });
    setScanOpen(false);
  }

  useEffect(() => {
    if (editing && existing) {
      setName(existing.name);
      setDescription(existing.description ?? '');
      setPhoto(existing.photo_url ?? null);
    } else {
      setName(params.name ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, params.name]);

  /** Ask where to pick from, then upload. Place form is single-photo. */
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
      // Single-photo: replace any existing photo.
      setPhoto(urls[0]);
    }
  }

  async function onSave() {
    if (!name.trim()) return;
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        photo_url: photo,
      };
      let placeId: string;
      if (editing && params.id) {
        const updated = await updatePlace.mutateAsync({ id: params.id, patch: payload });
        placeId = updated.id;
      } else {
        const created = await createPlace.mutateAsync(payload);
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
      setError(errorMessage(e));
    }
  }

  const nameEmpty = name.trim().length === 0;

  return (
    <FormScreen contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
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
        <Button title={t('items.scanCode')} variant="ghost" onPress={() => setScanOpen(true)} />
      ) : null}
      <View style={{ gap: 8 }}>
        <PhotoInput
          photos={photo ? [photo] : []}
          onAdd={onAddPhoto}
          onRemove={() => setPhoto(null)}
          uploading={photoUploading}
        />
        {photoError ? <ErrorBanner message={photoError} /> : null}
      </View>
      <View style={{ gap: spacing.md }}>
        <Field label={t('places.name')}>
          <Input placeholder={t('places.name')} value={name} onChangeText={setName} />
        </Field>
        <Field label={t('places.description')}>
          <Input
            placeholder={t('places.description')}
            value={description}
            onChangeText={setDescription}
            multiline
          />
        </Field>
      </View>
      {error ? <ErrorBanner message={error} /> : null}
      <View style={{ marginTop: spacing.sm }}>
        <Button
          title={t('common.save')}
          onPress={onSave}
          loading={createPlace.isPending || updatePlace.isPending}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Muted style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase' }}>{label}</Muted>
      {children}
    </View>
  );
}
