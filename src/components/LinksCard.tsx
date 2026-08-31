/**
 * LinksCard — an item's product links.
 *
 * Links wrap onto as many lines as they need: a long Amazon URL used to be
 * truncated to one line, which made it impossible to tell two links apart.
 */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, Body, Muted } from './primitives';
import { colors, radius, spacing, tint } from '../theme';

export function LinksCard({
  links,
  onOpen,
  onRemove,
  title,
}: {
  links: string[];
  onOpen: (url: string) => void;
  /** Omit for a read-only card. */
  onRemove?: (url: string) => void;
  title?: string;
}) {
  const { t } = useTranslation();
  if (links.length === 0) return null;
  return (
    <Card style={{ gap: spacing.sm }}>
      <Body style={{ fontWeight: '600' }}>{title ?? t('items.productLinks')}</Body>
      {links.map((url) => (
        <View key={url} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
          <TouchableOpacity
            onPress={() => onOpen(url)}
            activeOpacity={0.6}
            accessibilityRole="link"
            accessibilityLabel={url}
            style={{ flex: 1 }}
          >
            {/* No numberOfLines: a long URL wraps instead of being cut off. */}
            <Text style={{ color: colors.primary, fontSize: 13, lineHeight: 18 }}>{url}</Text>
          </TouchableOpacity>
          {onRemove ? (
            <TouchableOpacity
              onPress={() => onRemove(url)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`${t('links.remove')} ${url}`}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: radius.sm,
                backgroundColor: tint(colors.danger),
              }}
            >
              <Text style={{ color: colors.danger, fontSize: 12 }}>{t('links.remove')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
      {links.length > 1 ? <Muted style={{ fontSize: 11 }}>{t('links.count', { count: links.length })}</Muted> : null}
    </Card>
  );
}
