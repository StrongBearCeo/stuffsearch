/** Scan tab: live camera + resolution state machine. */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Modal, KeyboardAvoidingView, Platform, useWindowDimensions, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter, useFocusEffect } from 'expo-router';
import { Screen, Button, Input, Card, Body, Muted, H2 } from '../../src/components/primitives';
import { ScanOverlay } from '../../src/components/ScanOverlay';
import { CreateFromCodeSheet } from '../../src/components/CreateFromCodeSheet';
import { useScan } from '../../src/hooks/useScan';
import { createScanGate } from '../../src/lib/scanGate';
import { sanitizeScanPayload, isUsableScanPayload } from '../../src/lib/scanPayload';
import { scannerTypeToCodeType } from '../../src/lib/constants';
import { useHousehold } from '../../src/lib/household';
import { colors } from '../../src/theme';
import { useTranslation } from 'react-i18next';
import { hapticSuccess } from '../../src/lib/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CONTENT_MAX_WIDTH } from '../../src/hooks/useResponsive';
import { useKeyboardHeight } from '../../src/hooks/useKeyboardHeight';
import { keyboardSpacerHeight } from '../../src/lib/keyboard';
import type { ExternalCodeType } from '../../src/lib/supabase';

export default function ScanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { resolve, reset } = useScan();
  const { activeHousehold } = useHousehold();
  const insets = useSafeAreaInsets();
  const { width: winWidth } = useWindowDimensions();
  const sheetWidth = Math.min(winWidth - 32, CONTENT_MAX_WIDTH);
  // The manual-entry sheet sits at the bottom of a Modal. Android's
  // adjustResize does not apply inside a Modal window and KeyboardAvoidingView
  // is a no-op there, so the keyboard covered the very field it had just
  // focused. Lift the sheet by the keyboard's measured height instead.
  const keyboardHeight = useKeyboardHeight();

  const [permission, requestPermission] = useCameraPermissions();
  /**
   * Repeat-scan gating.
   *
   * This used to be a one-shot `scanned` boolean cleared only when `outcome`
   * went falsy — so any path that left an outcome standing (a cross-household
   * match waiting on the prompt, a create sheet that was dismissed by the back
   * gesture) latched the scanner shut and every later scan was silently
   * dropped. That is exactly "I scan once, then scanning stops working".
   *
   * `createScanGate` is the same gate the in-screen camera modal uses: one
   * accept per cooldown, the same payload suppressed a little longer, and an
   * explicit re-arm when we're done with a scan but staying on the camera.
   */
  const gate = useMemo(() => createScanGate(), []);
  const [manual, setManual] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [create, setCreate] = useState<{ value: string; type: ExternalCodeType } | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);

  // Only mount the CameraView while this tab is on screen. Tab switches away
  // tear the native camera down; returning re-mounts it fresh. Leaving it
  // mounted across blur/focus causes the intermittent black-preview symptom.
  const [focused, setFocused] = useState(false);
  // useFocusEffect re-subscribes whenever the callback identity changes, so an
  // inline arrow re-ran the effect on EVERY render, tearing the camera down and
  // rebuilding it repeatedly. useCallback pins it to mount/focus.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      // A fresh camera session deserves a fresh gate: returning to the tab
      // should always accept the next scan, including a repeat of the last one.
      gate.reset();
      return () => setFocused(false);
    }, [gate]),
  );

  async function handle(payload: string, rawType?: string) {
    if (!payload) return;
    // Manual entry bypasses the frame gate (there is no repeating frame).
    const o = await resolve(payload);
    if (!o) {
      gate.rearm();
      return;
    }
    hapticSuccess();
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
      if (!o.inActiveHousehold && activeHousehold) {
        setPrompt(t('scanResolve.switchPrompt', { name: '', household: activeHousehold.name }));
      } else {
        // open the entity (item or place)
        router.push(`/${match.entity_type}/${match.entity_id}` as never);
        reset();
      }
    }
  }

  function closeSheet() {
    setCreate(null);
    reset();
    // Back on the live camera — accept the next scan immediately.
    gate.rearm();
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
        {focused ? (
          <CameraView
            style={{ flex: 1 }}
            active
            onBarcodeScanned={(e) => {
              // onBarcodeScanned fires many times a second while a code sits
              // in frame; the gate turns that into one accepted scan.
              if (!gate.accept(e.data, Date.now())) return;
              // Clean once, at the boundary — a payload with control bytes in
              // it would otherwise reach the insert and fail the save.
              const payload = sanitizeScanPayload(e.data);
              if (!isUsableScanPayload(payload)) {
                setPrompt(t('scan.unreadable'));
                return;
              }
              handle(payload, e.type);
            }}
            barcodeScannerSettings={{
            // SDK 54 replaced barcodeScannerEnabled with an explicit allow-list.
            // Cover QR + the common retail/industrial symbologies.
            barcodeTypes: [
              'qr',
              'ean13',
              'ean8',
              'upc_a',
              'upc_e',
              'code128',
              'code39',
              'code93',
              'codabar',
              'itf14',
              'pdf417',
              'aztec',
              'datamatrix',
            ],
          }}
          />
        ) : null}
        <ScanOverlay />
        {prompt ? (
          <View style={{ position: 'absolute', top: insets.top + 12, left: 0, right: 0, alignItems: 'center' }}>
            <View style={{ width: sheetWidth }}>
              <Card>
                <Body style={{ fontWeight: '600' }}>{prompt}</Body>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Button title={t('common.done')} onPress={() => { setPrompt(null); reset(); gate.rearm(); }} />
                </View>
              </Card>
            </View>
          </View>
        ) : null}
        <View style={{ position: 'absolute', bottom: insets.bottom + 16, left: 0, right: 0, alignItems: 'center' }}>
          <View style={{ width: sheetWidth }}>
            <Button title={t('scan.manualEntry')} variant="ghost" onPress={() => setManualOpen(true)} />
          </View>
        </View>
      </View>

      <Modal visible={manualOpen} transparent animationType="slide" onRequestClose={() => setManualOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          {/* Backdrop: absolute so it overlays without stealing layout space from the sheet. */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setManualOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
          />
          <View
            style={{
              backgroundColor: colors.bg,
              padding: 20,
              paddingBottom: 20 + keyboardSpacerHeight(keyboardHeight, insets.bottom),
              gap: 12,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              width: sheetWidth,
              alignSelf: 'center',
            }}
          >
            <H2>{t('scan.enterCode')}</H2>
            <Input
              value={manual}
              onChangeText={setManual}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              placeholder={t('scan.enterCode')}
            />
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
        </KeyboardAvoidingView>
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
            router.push({ pathname: '/item/new', params: { code: create.value, type: create.type, name: prefill?.name ?? '' } } as never);
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
