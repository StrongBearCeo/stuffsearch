/** Scan tab: live camera + resolution state machine. */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Screen, Button, Input, Card, Body, Muted, H2, ErrorBanner } from '../../src/components/primitives';
import { ScanOverlay } from '../../src/components/ScanOverlay';
import { CreateFromCodeSheet } from '../../src/components/CreateFromCodeSheet';
import { useScan } from '../../src/hooks/useScan';
import { useMoveItem } from '../../src/hooks/useItems';
import { useCreateItem } from '../../src/hooks/useItems';
import { useCreatePlace } from '../../src/hooks/usePlaces';
import { useBindExternalCode } from '../../src/hooks/useExternalCode';
import { scannerTypeToCodeType } from '../../src/lib/constants';
import { useUiStore } from '../../src/store/ui';
import { useHousehold } from '../../src/lib/household';
import { useAuth } from '../../src/lib/auth';
import { colors, spacing } from '../../src/theme';
import { useTranslation } from 'react-i18next';
import type { ExternalCodeType } from '../../src/lib/supabase';

export default function ScanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { resolve, reset, resolving, outcome, error } = useScan();
  const { activeHouseholdId, activeHousehold } = useHousehold();
  const { user } = useAuth();
  const { activePlaceId, activePlaceName } = useUiStore();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [manual, setManual] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [create, setCreate] = useState<{ value: string; type: ExternalCodeType } | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);

  // Reset scanned lock when outcome clears.
  useEffect(() => {
    if (!outcome) setScanned(false);
  }, [outcome]);

  async function handle(payload: string, rawType?: string) {
    if (scanned || !payload) return;
    setScanned(true);
    const o = await resolve(payload);
    if (!o) {
      setScanned(false);
      return;
    }
    const codeType = rawType ? scannerTypeToCodeType(rawType) : 'other';
    if (o.type === 'deep-link') {
      // Route the deep-link via expo-router.
      const path =
        o.target.kind === 'invite'
          ? '/(auth)/join'
          : `/${o.target.kind}/${o.target.token}`;
      router.push(path as never);
      reset();
    } else if (o.type === 'no-match') {
      setCreate({ value: o.codeValue, type: codeType });
    } else if (o.type === 'matched') {
      const match = o.matches[0];
      if (o.inActiveHousehold && match.entity_type === 'item' && activePlaceId) {
        // scan-to-assign
        setPrompt(t('scanResolve.assigned', { place: activePlaceName ?? '' }));
      } else if (!o.inActiveHousehold && activeHousehold) {
        setPrompt(t('scanResolve.switchPrompt', { name: '', household: activeHousehold.name }));
      } else {
        // open the entity
        router.push(`/${match.entity_type}/${match.entity_id}` as never);
        reset();
      }
    }
  }

  function closeSheet() {
    setCreate(null);
    reset();
  }

  if (!permission) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Muted>{t('common.loading')}</Muted>
        </View>
      </Screen>
    );
  }
  if (!permission.granted) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
          <H2>{t('scan.permissionTitle')}</H2>
          <Muted style={{ textAlign: 'center' }}>{t('scan.permissionMessage')}</Muted>
          <Button title={t('scan.permissionAction')} onPress={requestPermission} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, position: 'relative' }}>
        <CameraView
          style={{ flex: 1 }}
          onBarcodeScanned={(e) => handle(e.data, e.type)}
          {...({ barcodeScannerEnabled: true } as object)}
        />
        <ScanOverlay />
        {prompt ? (
          <View style={{ position: 'absolute', top: 60, left: 16, right: 16 }}>
            <Card>
              <Body style={{ fontWeight: '600' }}>{prompt}</Body>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <Button title={t('common.done')} onPress={() => { setPrompt(null); reset(); }} />
              </View>
            </Card>
          </View>
        ) : null}
        <View style={{ position: 'absolute', bottom: 16, left: 16, right: 16, gap: 8 }}>
          <Button title={t('scan.manualEntry')} variant="ghost" onPress={() => setManualOpen(true)} />
        </View>
      </View>

      <Modal visible={manualOpen} transparent animationType="slide" onRequestClose={() => setManualOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: colors.bg, padding: 20, gap: 12, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <H2>{t('scan.enterCode')}</H2>
            <Input value={manual} onChangeText={setManual} autoCapitalize="none" />
            <Button
              title={t('common.confirm')}
              onPress={async () => {
                setManualOpen(false);
                await handle(manual.trim());
                setManual('');
              }}
              disabled={!manual.trim()}
            />
            <Button title={t('common.cancel')} variant="ghost" onPress={() => setManualOpen(false)} />
          </View>
        </View>
      </Modal>

      {create ? (
        <CreateFromCodeSheet
          visible={!!create}
          codeValue={create.value}
          codeType={create.type}
          onClose={closeSheet}
          onCreateItem={(prefill) => {
            // Navigate to the new-item screen with the code prefilled.
            setCreate(null);
            router.push({ pathname: '/item/new', params: { code: create.value, type: create.type, name: prefill?.name ?? '', category: prefill?.category ?? '' } } as never);
            reset();
          }}
          onCreatePlace={(prefill) => {
            setCreate(null);
            router.push({ pathname: '/place/new', params: { code: create.value, type: create.type, name: prefill?.name ?? '' } } as never);
            reset();
          }}
        />
      ) : null}
    </Screen>
  );
}
