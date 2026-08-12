/** ScanCameraModal — reusable full-screen camera modal that hands a single
 * scanned payload to the caller. Used by item/place detail screens for
 * contextual scan-to-set-location / scan-to-add flows. The caller owns the
 * resolution + mutation logic and closes the modal via `visible`.
 *
 * The CameraView is mounted ONLY while `visible` is true and keyed per open,
 * so each open starts a fresh native camera session. Keeping it mounted while
 * hidden (the default Modal behaviour) leaves the native preview attached and
 * is the main cause of the intermittent black-screen symptom: after the first
 * open/close the preview fails to resume. Tearing it down on close fixes that. */
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { CameraView } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme';

export interface ScanCameraModalProps {
  visible: boolean;
  /** Called once per scan with the raw payload + symbology type. */
  onScan: (payload: string, rawType?: string) => void;
  /** Dismiss handler (X button / back gesture). */
  onClose: () => void;
  /** Optional instructional line shown above the viewfinder. */
  hint?: string;
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

export function ScanCameraModal({ visible, onScan, onClose, hint }: ScanCameraModalProps) {
  const insets = useSafeAreaInsets();
  const [scanned, setScanned] = useState(false);

  // Reset the one-shot lock each time the modal opens so repeated scans work
  // after the caller closes + reopens the modal. Bump the open counter so the
  // CameraView gets a fresh key (and a fresh native session) on each open.
  const [openCount, setOpenCount] = useState(0);
  useEffect(() => {
    if (visible) {
      setScanned(false);
      setOpenCount((c) => c + 1);
    }
  }, [visible]);

  function handleBarcodes(e: { data: string; type?: string }) {
    if (scanned || !e.data) return;
    setScanned(true);
    onScan(e.data, e.type);
  }

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
