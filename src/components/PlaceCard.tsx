/** PlaceCard — compact row for a place, used in lists. Pass `parentName` to
 *  show where the place lives (its parent place), like ItemCard's location. */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ExpoImage } from './ExpoImage';
import { Card, Body, Muted } from './primitives';
import { colors, tint } from '../theme';
import type { Place } from '../lib/supabase';
import { useTranslation } from 'react-i18next';

export function PlaceCard({
  place,
  count,
  parentName,
  onPress,
}: {
  place: Place;
  /** Resolved name of the place's parent (where it lives), if known. */
  parentName?: string | null;
  count?: number;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const located = !!place.parent_place_id;
  const locationLabel = parentName || (located ? t('places.located') : t('places.topLevel'));
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={place.name}
      accessibilityHint={count != null ? `${count}` : undefined}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ExpoImage
          uri={place.photo_url}
          style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: colors.surfaceAlt }}
        />
        {/* minWidth:0 — see ItemCard: without it the name column cannot
            shrink and a long parent-place badge wraps the title one character
            per line. */}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Body style={{ fontWeight: '600' }} numberOfLines={2}>{place.name}</Body>
          {/* Two lines, not one: a one-line clamp cut most descriptions mid-word. */}
          {place.description ? <Muted numberOfLines={2}>{place.description}</Muted> : null}
          {place.tags && place.tags.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
              {place.tags.slice(0, 3).map((tag) => (
                <View
                  key={tag}
                  style={{
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: 999,
                    backgroundColor: tint(colors.primary, '22'),
                  }}
                >
                  <Text style={{ color: colors.primary, fontSize: 10 }} numberOfLines={1}>
                    {tag}
                  </Text>
                </View>
              ))}
              {place.tags.length > 3 ? (
                <Text style={{ color: colors.textMuted, fontSize: 10 }}>+{place.tags.length - 3}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', flexShrink: 0, maxWidth: '38%', gap: 2 }}>
          {located ? (
            <View style={{ backgroundColor: tint(colors.success), paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
              <Text style={{ color: colors.success, fontSize: 11, fontWeight: '600' }} numberOfLines={2}>
                {locationLabel}
              </Text>
            </View>
          ) : (
            <Muted style={{ fontSize: 11 }}>{locationLabel}</Muted>
          )}
          {count != null ? (
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{count}</Text>
          ) : null}
        </View>
      </Card>
    </TouchableOpacity>
  );
}
