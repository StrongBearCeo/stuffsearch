/** ScanCameraModal — reusable full-screen camera modal that hands a single
 * scanned payload to the caller. Used by item/place detail screens for
 * contextual scan-to-set-location / scan-to-add / add-a-code flows. The caller
 * owns the resolution + mutation logic and closes the modal via `visible`.
 *
 * The CameraView is mounted ONLY while `visible` is true and keyed per open,
 * so each open starts a fresh native camera session. Keeping it mounted while
 * hidden (the default Modal behaviour) leaves the native preview attached and
 * is the main cause of the intermittent black-screen symptom: after the first
 * open/close the preview fails to resume. Tearing it down on close fixes that.
 *
 * Repeat scans: `onBarcodeScanned` fires many times a second while a code is
 * in frame, so accepting a scan is gated by `createScanGate` (see
 * src/lib/scanGate.ts). Crucially the gate RE-ARMS whenever the caller shows a
 * `notice` — the previous one-shot boolean stayed latched, so a screen that
 * kept the camera open to report a problem ("a place can't go inside itself")
 * silently ignored every subsequent scan. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createScanGate } from '../lib/scanGate';
import { colors, radius, spacing, tint } from '../theme';

export interface ScanCameraModalProps {
  visible: boolean;
  /** Called once per scan with the raw payload + symbology type. */
  onScan: (payload: string, rawType?: string) => void;
  /** Dismiss handler (X button / back gesture). */
  onClose: () => void;
  /** Optional instructional line shown above the viewfinder. */
  hint?: string;
  /**
   * A message to show WITHOUT closing the camera — typically why the last scan
   * couldn't be applied. Setting it re-arms the scanner for another try.
   */
  notice?: string | null;
  /** Colours the notice: 'error' (default) or 'info' for a success/progress note. */
  noticeTone?: 'error' | 'info';
  /** Clears the notice when tapped. Omit to make the notice non-interactive. */
  onDismissNotice?: () => void;
  /** Show a spinner while the caller resolves the last scan. */
  busy?: boolean;
}

const BARCODE_TYPES = [
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
] as const;

export function ScanCameraModal({
  visible,
  onScan,
  onClose,
  hint,
  notice,
  noticeTone = 'error',
  onDismissNotice,
  busy,
}: ScanCameraModalProps) {
  const insets = useSafeAreaInsets();
  const gate = useMemo(() => createScanGate(), []);
  const lastNotice = useRef<string | null | undefined>(null);

  // Bump the open counter so the CameraView gets a fresh key (and a fresh
  // native session) on each open, and start the gate from a clean slate.
  const [openCount, setOpenCount] = useState(0);
  useEffect(() => {
    if (visible) {
      gate.reset();
      setOpenCount((c) => c + 1);
    }
  }, [visible, gate]);

  // A new notice means the caller handled the last scan but stayed open —
  // re-open the gate so the user's next scan is actually acted on.
  useEffect(() => {
    if (notice && notice !== lastNotice.current) gate.rearm();
    lastNotice.current = notice;
  }, [notice, gate]);

  function handleBarcodes(e: { data: string; type?: string }) {
    if (busy) return;
    if (!gate.accept(e.data, Date.now())) return;
    onScan(e.data, e.type);
  }

  const noticeColor = noticeTone === 'error' ? colors.danger : colors.success;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        {/* Mount the camera only while visible + key per open so the native
            preview is torn down on close and re-created cleanly each time —
            this is what prevents the intermittent black-screen-after-first-use. */}
        {visible ? (
          <CameraView
            key={`scan-${openCount}`}
            style={StyleSheet.absoluteFill}
            active
            onBarcodeScanned={handleBarcodes}
            barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          />
        ) : null}

        {/* Viewfinder bracket */}
        <View style={styles.bracket} pointerEvents="none" />

        {/* In-camera notice. Rendered ABOVE the preview so the user sees why a
            scan was rejected while still holding the phone up to the label. */}
        {notice ? (
          <TouchableOpacity
            activeOpacity={onDismissNotice ? 0.7 : 1}
            onPress={onDismissNotice}
            disabled={!onDismissNotice}
            accessibilityRole={onDismissNotice ? 'button' : 'text'}
            accessibilityLiveRegion="polite"
            style={[
              styles.notice,
              { top: insets.top + 64, borderColor: noticeColor, backgroundColor: tint(noticeColor, '33') },
            ]}
          >
            <Text style={[styles.noticeText, { color: noticeColor }]}>{notice}</Text>
          </TouchableOpacity>
        ) : null}

        {busy ? (
          <View style={styles.busy} pointerEvents="none">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}

        {hint ? (
          <View style={[styles.hintWrap, { bottom: insets.bottom + 96 }]} pointerEvents="none">
            <Text style={styles.hint}>{hint}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={onClose}
          accessibilityLabel="Close scanner"
          style={[styles.closeBtn, { top: insets.top + 12 }]}
        >
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const FRAME = 240;
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  bracket: {
    position: 'absolute',
    alignSelf: 'center',
    top: '35%',
    width: FRAME,
    height: FRAME,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    opacity: 0.9,
  },
  notice: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  noticeText: {
    fontWeight: '600',
    textAlign: 'center',
  },
  busy: {
    position: 'absolute',
    alignSelf: 'center',
    top: '35%',
    width: FRAME,
    height: FRAME,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  hint: {
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  closeBtn: {
    position: 'absolute',
    right: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
});
