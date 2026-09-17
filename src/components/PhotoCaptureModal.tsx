/** PhotoCaptureModal — a full-screen camera that stays open across shots, so a
 * user can photograph all four sides of a box in one trip.
 *
 * `ImagePicker.launchCameraAsync` returns after a single shot: every extra
 * photo meant the source prompt, the camera, the upload and the form again.
 * The library source has always been multi-select, so the camera was the only
 * place where "add six photos" was six separate errands.
 *
 * Shots are collected as LOCAL file uris and handed to the caller only on Done
 * — a cancelled session uploads nothing and leaves no orphans in the bucket.
 * The caller uploads them (see `uploadLocal` in usePhotoPicker) and appends the
 * urls with `addPhotos`, which is what keeps capture order = display order,
 * with the first shot as the cover photo.
 *
 * The CameraView is mounted ONLY while `visible` and keyed per open, for the
 * same reason as ScanCameraModal: a native preview left attached across a
 * close/open comes back black.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExpoImage } from './ExpoImage';
import { addShot, undoLastShot, burstControls, MAX_BURST_SHOTS } from '../lib/photoBurst';
import { createSubmitGuard } from '../lib/submit';
import { hapticImpact } from '../lib/haptics';
import { colors, radius, spacing, tint } from '../theme';
import { useTranslation } from 'react-i18next';

export interface PhotoCaptureModalProps {
  visible: boolean;
  /** Called with every shot of the session, in capture order, on Done. */
  onDone: (uris: string[]) => void;
  /** Dismiss without keeping anything (X button / back gesture). */
  onClose: () => void;
  /** Cap for one session. Defaults to MAX_BURST_SHOTS. */
  limit?: number;
}

/** Matches the quality the single-shot picker used, so file sizes don't jump. */
const CAPTURE_QUALITY = 0.7;
const THUMB = 44;

export function PhotoCaptureModal({ visible, onDone, onClose, limit = MAX_BURST_SHOTS }: PhotoCaptureModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView | null>(null);

  const [shots, setShots] = useState<string[]>([]);
  const [capturing, setCapturing] = useState(false);
  /** Same-frame double-tap guard — the same one Save uses, see `capture`. */
  const shutterGuard = useRef(createSubmitGuard()).current;
  const [notice, setNotice] = useState<string | null>(null);
  // A fresh key per open gives each session a fresh native camera session.
  const [openCount, setOpenCount] = useState(0);

  // Each open starts a new session: an old burst must never be handed to the
  // next form the user opens.
  useEffect(() => {
    if (!visible) return;
    setShots([]);
    setCapturing(false);
    shutterGuard.release();
    setNotice(null);
    setOpenCount((c) => c + 1);
  }, [visible, shutterGuard]);

  // Ask once per open, the way the old ImagePicker flow did — the user tapped
  // "Camera", the prompt is the expected next thing. Nothing to ask when the
  // OS has already said no for good; that's what the grant card is for.
  const granted = permission?.granted === true;
  useEffect(() => {
    if (!visible || !permission || granted || permission.canAskAgain === false) return;
    requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, permission?.granted, permission?.canAskAgain]);

  const controls = useMemo(
    () => burstControls({ shots, busy: capturing, limit }),
    [shots, capturing, limit],
  );

  async function capture() {
    // `capturing` only dims the shutter after a re-render, so two taps landing
    // in the same frame would both fire: the second would append its shot to a
    // `shots` snapshot without the first in it, and one picture would be taken
    // and silently lost. `createSubmitGuard` closes that window synchronously —
    // the same guard, for the same reason, as a double-tapped Save.
    if (controls.full) return;
    await shutterGuard.run(async () => {
      setCapturing(true);
      setNotice(null);
      try {
        const photo = await camera.current?.takePictureAsync({ quality: CAPTURE_QUALITY });
        const uri = photo?.uri;
        if (!uri) {
          // takePictureAsync resolves to nothing if the session was torn down
          // mid-shot; say so rather than swallowing the tap.
          setNotice(t('photos.captureFailed'));
          return;
        }
        setShots((prev) => addShot(prev, uri, limit));
        hapticImpact();
      } catch {
        setNotice(t('photos.captureFailed'));
      } finally {
        setCapturing(false);
      }
    });
  }

  function confirm() {
    if (!controls.canConfirm) return;
    onDone(shots);
  }

  function undo() {
    if (!controls.canUndo) return;
    setShots((prev) => undoLastShot(prev));
    setNotice(null);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        {visible && granted ? (
          <CameraView
            key={`capture-${openCount}`}
            ref={camera}
            style={StyleSheet.absoluteFill}
            active
            facing="back"
          />
        ) : null}

        {/* Permission gate. `permission` is null until the first answer comes
            back — showing the denied card then would flash a false refusal. */}
        {permission && !granted ? (
          <View style={styles.gate}>
            <Text style={styles.gateText}>{t('photos.cameraDenied')}</Text>
            <TouchableOpacity
              testID="photo-capture-grant"
              onPress={requestPermission}
              accessibilityRole="button"
              style={styles.gateButton}
            >
              <Text style={styles.gateButtonText}>{t('photos.grantCamera')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Shot counter. Shown from zero so it reads as a camera that keeps
            going, rather than one that closes after the next tap. */}
        <View
          style={[styles.counter, { top: insets.top + 12 }]}
          accessibilityLabel={t('photos.burstCount', { count: controls.count })}
        >
          <Text testID="photo-capture-count" style={styles.counterCount}>
            {controls.count}
          </Text>
          <Text style={styles.counterLimit}>/{limit}</Text>
        </View>

        <TouchableOpacity
          testID="photo-capture-cancel"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          style={[styles.closeBtn, { top: insets.top + 12 }]}
        >
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>

        {notice ? (
          <View style={[styles.notice, { top: insets.top + 64 }]} accessibilityLiveRegion="polite">
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}>
          {shots.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.strip}
            >
              {shots.map((uri, i) => (
                <ExpoImage key={`${uri}-${i}`} uri={uri} style={styles.thumb} />
              ))}
            </ScrollView>
          ) : null}

          <Text style={styles.hint}>
            {controls.full ? t('photos.burstFull') : t('photos.burstHint')}
          </Text>

          <View style={styles.controls}>
            <TouchableOpacity
              testID={controls.canUndo ? 'photo-capture-undo' : undefined}
              onPress={undo}
              disabled={!controls.canUndo}
              accessibilityRole="button"
              accessibilityLabel={t('photos.undoShot')}
              accessibilityState={{ disabled: !controls.canUndo }}
              style={[styles.sideBtn, { opacity: controls.canUndo ? 1 : 0.35 }]}
            >
              <Text style={styles.sideBtnText}>↺</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="photo-capture-shutter"
              onPress={capture}
              disabled={!controls.canCapture}
              accessibilityRole="button"
              accessibilityLabel={t('photos.takePhoto')}
              accessibilityState={{ disabled: !controls.canCapture }}
              style={[styles.shutter, { opacity: controls.canCapture ? 1 : 0.4 }]}
            >
              {capturing ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <View style={styles.shutterInner} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              testID="photo-capture-done"
              onPress={confirm}
              disabled={!controls.canConfirm}
              accessibilityRole="button"
              accessibilityLabel={t('common.done')}
              accessibilityState={{ disabled: !controls.canConfirm }}
              style={[styles.doneBtn, { opacity: controls.canConfirm ? 1 : 0.35 }]}
            >
              <Text style={styles.doneText}>{t('common.done')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  gate: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  gateText: {
    color: colors.text,
    textAlign: 'center',
    fontWeight: '600',
  },
  gateButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  gateButtonText: {
    color: colors.text,
    fontWeight: '700',
  },
  counter: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.lg,
    backgroundColor: tint(colors.bg, '66'),
  },
  counterCount: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  counterLimit: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
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
  notice: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: tint(colors.danger, '33'),
  },
  noticeText: {
    color: colors.danger,
    fontWeight: '600',
    textAlign: 'center',
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.md,
    gap: spacing.md,
    backgroundColor: tint(colors.bg, '66'),
  },
  strip: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  hint: {
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    fontSize: 12,
    fontWeight: '600',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  sideBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBtnText: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: colors.text,
    backgroundColor: tint(colors.text, '44'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.text,
  },
  doneBtn: {
    minWidth: 56,
    paddingHorizontal: spacing.md,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: colors.text,
    fontWeight: '700',
  },
});
