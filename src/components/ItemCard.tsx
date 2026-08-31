/** ItemCard — compact row for an item, used in lists. Pass `placeName` to show
 *  the item's exact location; if omitted and the item has a current_place_id,
 *  the card falls back to the generic "Located" badge. */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ExpoImage } from './ExpoImage';
import { Card, Body, Muted } from './primitives';
import { formatMoney } from '../lib/value';
import { colors, colors as c, tint } from '../theme';
import type { Item } from '../lib/supabase';
import { useTranslation } from 'react-i18next';

/** How many tags fit on a card before we show a "+N" counter. */
const MAX_TAGS = 3;

export function ItemCard({
  item,
  placeName,
  onPress,
}: {
  item: Item;
  /** Resolved name of the item's current place, if known by the parent. */
  placeName?: string | null;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const located = !!item.current_place_id;
  // Prefer the exact place name; fall back to the generic badge if the parent
  // didn't resolve one (e.g. a list without places loaded).
  const locationLabel = placeName || (located ? t('items.located') : t('items.notLocated'));
  const tags = item.tags ?? [];
  const shownTags = tags.slice(0, MAX_TAGS);
  const value = item.estimated_value;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}${item.category ? `, ${item.category}` : ''}`}
      accessibilityHint={located ? t('items.located') : t('items.notLocated')}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ExpoImage
          uri={item.photo_urls?.[0]}
          style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: colors.surfaceAlt }}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Body style={{ fontWeight: '600' }}>{item.name}</Body>
          {item.category ? <Muted>{item.category}</Muted> : null}
          {shownTags.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
              {shownTags.map((tag) => (
                <View
                  key={tag}
                  style={{
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: 999,
                    backgroundColor: tint(c.primary, '22'),
                  }}
                >
                  <Text style={{ color: c.primary, fontSize: 10 }} numberOfLines={1}>
                    {tag}
                  </Text>
                </View>
              ))}
              {tags.length > MAX_TAGS ? (
                <Text style={{ color: colors.textMuted, fontSize: 10 }}>+{tags.length - MAX_TAGS}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', flexShrink: 1, gap: 2 }}>
          {located ? (
            <View style={{ backgroundColor: tint(colors.success), paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
              <Text
                style={{ color: colors.success, fontSize: 11, fontWeight: '600' }}
                numberOfLines={1}
              >
                {locationLabel}
              </Text>
            </View>
          ) : (
            <Muted style={{ fontSize: 11 }}>{t('items.notLocated')}</Muted>
          )}
          {value != null ? (
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
              {formatMoney(value, item.value_currency)}
            </Text>
          ) : null}
        </View>
      </Card>
    </TouchableOpacity>
  );
}
