/** PlaceCard — compact row for a place, used in lists. */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ExpoImage } from './ExpoImage';
import { Card, Body, Muted } from './primitives';
import { colors } from '../theme';
import type { Place } from '../lib/supabase';

export function PlaceCard({
  place,
  count,
  onPress,
}: {
  place: Place;
  count?: number;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ExpoImage
          uri={place.photo_url}
          style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: colors.surfaceAlt }}
        />
        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: '600' }}>{place.name}</Body>
          {place.description ? <Muted numberOfLines={1}>{place.description}</Muted> : null}
        </View>
        {count != null ? (
          <View
            style={{
              backgroundColor: colors.primary + '22',
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 6,
            }}
          >
            <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>{count}</Text>
          </View>
        ) : null}
      </Card>
    </TouchableOpacity>
  );
}
