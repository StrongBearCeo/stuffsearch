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
        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: '600' }}>{place.name}</Body>
          {place.description ? <Muted numberOfLines={1}>{place.description}</Muted> : null}
        </View>
        <View style={{ alignItems: 'flex-end', flexShrink: 1, gap: 2 }}>
          {located ? (
            <View style={{ backgroundColor: tint(colors.success), paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
              <Text style={{ color: colors.success, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>
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
