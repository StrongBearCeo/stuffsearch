/** PhotoInput — thumbnail row + an "Add photo" tile, used on the item/place
 *  edit forms. Presentational: the parent owns the URL list, the picker trigger
 *  (`onAdd`), and removal (`onRemove`). Shows an uploading overlay on the add
 *  tile while `uploading` is true. */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { ExpoImage } from './ExpoImage';
import { colors, radius, spacing } from '../theme';
import { useTranslation } from 'react-i18next';

export interface PhotoInputProps {
  /** Already-attached photo URLs (1+ for items, 0 or 1 for places). */
  photos: string[];
  /** Called when the "Add photo" tile is tapped. Parent runs the picker. */
  onAdd: () => void;
  /** Called with the index to remove. Omit to hide remove buttons (display-only). */
  onRemove?: (index: number) => void;
  /** True while a pick+upload is in flight; dims the add tile + shows a spinner. */
  uploading?: boolean;
}

const TILE = 80;

export function PhotoInput({ photos, onAdd, onRemove, uploading }: PhotoInputProps) {
  const { t } = useTranslation();
  const hasPhotos = photos.length > 0;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, alignItems: 'center' }}
    >
      {photos.map((uri, i) => (
        <View key={`${uri}-${i}`} style={{ position: 'relative' }}>
          <ExpoImage
            uri={uri}
            style={{
              width: TILE,
              height: TILE,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceAlt,
            }}
          />
          {onRemove ? (
            <TouchableOpacity
              onPress={() => onRemove(i)}
              accessibilityRole="button"
              accessibilityLabel={t('photos.remove')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: colors.danger,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}

      <TouchableOpacity
        onPress={onAdd}
        disabled={uploading}
        accessibilityRole="button"
        accessibilityLabel={t('photos.add')}
        style={{
          width: TILE,
          height: TILE,
          borderRadius: radius.md,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.border,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: uploading ? 0.6 : 1,
        }}
      >
        {uploading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Text style={{ fontSize: 26, color: colors.textMuted }}>+</Text>
            <Text style={{ fontSize: 10, color: colors.textMuted }}>
              {hasPhotos ? t('photos.add') : t('photos.add')}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}
