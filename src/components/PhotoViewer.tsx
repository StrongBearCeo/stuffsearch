/**
 * PhotoViewer — full-screen photo viewer with pinch-to-zoom, pan and
 * double-tap-to-zoom, plus horizontal paging when an entity has several
 * photos.
 *
 * Zoom is implemented with gesture-handler + reanimated rather than
 * ScrollView's `maximumZoomScale`, which is iOS-only. While a photo is zoomed
 * in, the pager's own horizontal scrolling is disabled so a pan drags the
 * image instead of flicking to the next one.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  // The RNGH ScrollView, not RN's: a native ScrollView claims the touch before
  // a pinch is recognised, so pinching over the pager did nothing.
  ScrollView,
} from 'react-native-gesture-handler';
import type { ScrollView as ScrollViewType } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clampPan } from '../lib/zoomPan';
import { colors, spacing } from '../theme';

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;
/** The image is laid out at this fraction of the viewport height (contain-fit),
 *  so the pan bounds must be computed against that box, not the whole screen. */
const PHOTO_HEIGHT_RATIO = 0.8;

export interface PhotoViewerProps {
  visible: boolean;
  photos: string[];
  /** Which photo to open on. */
  initialIndex?: number;
  onClose: () => void;
  /** Accessible label for the close button. */
  closeLabel?: string;
}

export function PhotoViewer({
  visible,
  photos,
  initialIndex = 0,
  onClose,
  closeLabel = 'Close',
}: PhotoViewerProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);
  // Paging is disabled while any photo is zoomed in, so a pan moves the image.
  const [zoomed, setZoomed] = useState(false);
  const pagerRef = useRef<ScrollViewType>(null);

  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
      setZoomed(false);
    }
  }, [visible, initialIndex]);

  /**
   * Jump to the tapped photo. `contentOffset` alone is an iOS-only prop, so on
   * Android opening the third photo landed on the first and the rest were only
   * reachable by swiping back. Scrolling explicitly once the pager has laid out
   * works on both platforms.
   */
  const scrollToInitial = useCallback(() => {
    if (initialIndex <= 0) return;
    pagerRef.current?.scrollTo({ x: initialIndex * width, y: 0, animated: false });
  }, [initialIndex, width]);

  if (photos.length === 0) return null;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} transparent={false}>
      {/* A React Native Modal renders in its OWN native view hierarchy, which
          the app-level GestureHandlerRootView does not reach into — so every
          gesture-handler gesture inside it was silently dead and neither pinch
          nor double-tap zoom worked. The modal needs its own root. */}
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.root}>
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed && photos.length > 1}
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: initialIndex * width, y: 0 }}
          onLayout={scrollToInitial}
          onMomentumScrollEnd={(e) =>
            setIndex(Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1)))
          }
        >
          {photos.map((uri, i) => (
            <ZoomablePhoto
              key={`${uri}-${i}`}
              uri={uri}
              width={width}
              height={height}
              onZoomChange={setZoomed}
            />
          ))}
        </ScrollView>

        <TouchableOpacity
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          style={[styles.closeBtn, { top: insets.top + 12 }]}
        >
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>

        {photos.length > 1 ? (
          <View style={[styles.counter, { bottom: insets.bottom + 24 }]} pointerEvents="none">
            <Text style={styles.counterText}>
              {index + 1} / {photos.length}
            </Text>
          </View>
        ) : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ZoomablePhoto({
  uri,
  width,
  height,
  onZoomChange,
}: {
  uri: string;
  width: number;
  height: number;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  /** Mirrors the zoom on the JS thread, so `pan.enabled()` can follow it. */
  const [isZoomed, setIsZoomed] = useState(false);

  /** Keep the local flag and the parent's pager in step. */
  const reportZoom = useCallback(
    (zoomed: boolean) => {
      setIsZoomed(zoomed);
      onZoomChange(zoomed);
    },
    [onZoomChange],
  );

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE * 0.5, savedScale.value * e.scale));
    })
    .onEnd(() => {
      if (scale.value < MIN_SCALE) {
        scale.value = withTiming(MIN_SCALE);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      }
      savedScale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value));
      // Pinching back out shrinks the pannable area; without re-clamping, the
      // photo stays parked off to one side of an otherwise empty screen.
      const settled = clampPan(
        translateX.value,
        translateY.value,
        width,
        height * PHOTO_HEIGHT_RATIO,
        width,
        height,
        savedScale.value,
      );
      translateX.value = withTiming(settled.x);
      translateY.value = withTiming(settled.y);
      savedX.value = settled.x;
      savedY.value = settled.y;
      runOnJS(reportZoom)(savedScale.value > MIN_SCALE);
    });

  /** Content box the image actually occupies (see the Image style below). */
  const contentWidth = width;
  const contentHeight = height * PHOTO_HEIGHT_RATIO;

  const pan = Gesture.Pan()
    // One finger only: a two-finger drag belongs to the pinch.
    .maxPointers(1)
    // ONLY while zoomed. An always-on pan still CLAIMS the touch even when its
    // handler does nothing, which starved the pager: swiping sideways between
    // photos stopped working. Disabled at scale 1, the horizontal drag reaches
    // the ScrollView and paging works again.
    .enabled(isZoomed)
    .onUpdate((e) => {
      if (savedScale.value <= MIN_SCALE) return;
      // Clamp so a zoomed photo can't be flung into empty black space with no
      // way back. `clampPan` is a worklet-safe pure function (src/lib/zoomPan).
      const next = clampPan(
        savedX.value + e.translationX,
        savedY.value + e.translationY,
        contentWidth,
        contentHeight,
        width,
        height,
        savedScale.value,
      );
      translateX.value = next.x;
      translateY.value = next.y;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomingIn = savedScale.value <= MIN_SCALE;
      const next = zoomingIn ? DOUBLE_TAP_SCALE : MIN_SCALE;
      scale.value = withTiming(next);
      savedScale.value = next;
      if (!zoomingIn) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      }
      runOnJS(reportZoom)(zoomingIn);
    });

  /**
   * Composition matters here, and the previous arrangement is why you could
   * zoom but not pan.
   *
   * It was `Simultaneous(pinch, Exclusive(doubleTap, pan))`. `Exclusive` means
   * pan may not begin until doubleTap has FAILED — and a tap recogniser only
   * fails after its multi-tap window expires. So a drag did nothing for the
   * first few hundred milliseconds, by which point the finger was already
   * moving and the gesture never took hold.
   *
   * All three can simply run together: a Tap cancels itself as soon as the
   * finger travels past its slop, so a drag can never be mistaken for a tap,
   * and pan starts on the very first movement.
   *
   * `pan.enabled(isZoomed)` above is the other half of the bargain: running
   * simultaneously means pan would otherwise claim every horizontal drag and
   * the pager could never page between photos.
   */
  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[{ width, height }, styles.page]}>
        <Animated.View style={animatedStyle}>
          <Image
            source={{ uri }}
            style={{ width, height: height * PHOTO_HEIGHT_RATIO }}
            contentFit="contain"
            transition={120}
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  page: { alignItems: 'center', justifyContent: 'center' },
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
  closeText: { color: colors.text, fontSize: 18, fontWeight: '700' },
  counter: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  counterText: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
