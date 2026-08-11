/** ItemCard — compact row for an item, used in lists. */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ExpoImage } from './ExpoImage';
import { Card, Body, Muted } from './primitives';
import { colors } from '../theme';
import type { Item } from '../lib/supabase';
import { useTranslation } from 'react-i18next';

export function ItemCard({ item, onPress }: { item: Item; onPress?: () => void }) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ExpoImage
          uri={item.photo_urls?.[0]}
          style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: colors.surfaceAlt }}
        />
        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: '600' }}>{item.name}</Body>
          {item.category ? <Muted>{item.category}</Muted> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {item.current_place_id ? (
            <View style={{ backgroundColor: colors.success + '22', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
              <Text style={{ color: colors.success, fontSize: 11, fontWeight: '600' }}>
                {t('items.location').toUpperCase()}
              </Text>
            </View>
          ) : (
            <Muted style={{ fontSize: 11 }}>{t('items.notLocated')}</Muted>
          )}
        </View>
      </Card>
    </TouchableOpacity>
  );
}
