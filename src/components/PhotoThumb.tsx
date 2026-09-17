/**
 * PhotoThumb — the square thumbnail every list uses for an item or place.
 *
 * When there is more than one photo it draws as a STACK: one or two offset
 * pages peeking out behind the cover, plus a count badge. A list showing only
 * the first photo gave no hint that an item had five more, so the only way to
 * discover them was to open every row in turn.
 *
 * The number of pages comes from `stackLayers` (src/lib/photos) rather than
 * being computed inline, so the "cap it at two" rule is stated once and tested.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { ExpoImage } from './ExpoImage';
import { stackLayers } from '../lib/photos';
import { colors, radius } from '../theme';

export interface PhotoThumbProps {
  /** Every photo on the entity, cover first. */
  photos: string[];
  /** Edge length of the cover image. The stack extends slightly beyond it. */
  size?: number;
  /** Shown in place of a photo when there are none (e.g. 📦 for a place). */
  fallback?: React.ReactNode;
  /** Accessible summary; the count is appended when there's a stack. */
  accessibilityLabel?: string;
}

export function PhotoThumb({ photos, size = 48, fallback, accessibilityLabel }: PhotoThumbProps) {
  const count = photos.length;
  const layers = stackLayers(count);
  // Each page peeks out by this much; scaled so a 32px tree thumb isn't
  // swamped and a 48px card thumb still reads clearly.
  const step = Math.max(2, Math.round(size / 16));
  const outer = size + layers * step;

  return (
    <View
      style={{ width: outer, height: outer }}
      accessible
      accessibilityLabel={
        accessibilityLabel && count > 1 ? `${accessibilityLabel}, ${count} photos` : accessibilityLabel
      }
    >
      {/* Pages first so they paint BEHIND the cover. Furthest offset first. */}
      {Array.from({ length: layers }).map((_, i) => {
        const offset = (layers - i) * step;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: offset,
              top: offset,
              width: size,
              height: size,
              borderRadius: radius.sm,
              backgroundColor: colors.surfaceAlt,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          />
        );
      })}

      {count > 0 ? (
        <ExpoImage
          uri={photos[0]}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: size,
            height: size,
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceAlt,
          }}
        />
      ) : (
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: size,
            height: size,
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {fallback}
        </View>
      )}

      {count > 1 ? (
        <View
          testID="photo-count-badge"
          style={{
            position: 'absolute',
            left: -3,
            top: -3,
            minWidth: 16,
            height: 16,
            paddingHorizontal: 3,
            borderRadius: 8,
            backgroundColor: colors.bg,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.text, fontSize: 9, fontWeight: '700' }}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}
