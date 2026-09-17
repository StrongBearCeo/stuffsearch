/** PhotoInput — thumbnail row + an "Add photo" tile, used on the item/place
 *  edit forms. Presentational: the parent owns the URL list, the picker trigger
 *  (`onAdd`), removal (`onRemove`) and reordering (`onMove`). Shows an
 *  uploading overlay on the add tile while `uploading` is true.
 *
 *  Reordering is done with ‹ / › nudge buttons rather than drag-and-drop: the
 *  row lives inside a horizontal ScrollView inside a vertical form, where a
 *  long-press drag fights both scroll directions. Two taps are unambiguous,
 *  and the FIRST photo is the cover everywhere in the app, so "move to front"
 *  is the operation that actually matters. */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { ExpoImage } from './ExpoImage';
import { colors, radius, spacing } from '../theme';
import { useTranslation } from 'react-i18next';

export interface PhotoInputProps {
  /** Already-attached photo URLs, in display order (element 0 is the cover). */
  photos: string[];
  /** Called when the "Add photo" tile is tapped. Parent runs the picker. */
  onAdd: () => void;
  /** Called with the index to remove. Omit to hide remove buttons (display-only). */
  onRemove?: (index: number) => void;
  /** Called with (from, to) to reorder. Omit to hide the reorder buttons. */
  onMove?: (from: number, to: number) => void;
  /** True while a pick+upload is in flight; dims the add tile + shows a spinner. */
  uploading?: boolean;
}

const TILE = 88;

export function PhotoInput({ photos, onAdd, onRemove, onMove, uploading }: PhotoInputProps) {
  const { t } = useTranslation();
  const canReorder = !!onMove && photos.length > 1;

  return (
    <View style={{ gap: 6 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.md, alignItems: 'flex-start', paddingVertical: 4 }}
      >
        {photos.map((uri, i) => (
          <View key={`${uri}-${i}`} style={{ gap: 4, alignItems: 'center' }}>
            <View style={{ position: 'relative' }}>
              <ExpoImage
                uri={uri}
                style={{
                  width: TILE,
                  height: TILE,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceAlt,
                }}
              />
              {/* The cover photo is the one every list and card shows. */}
              {i === 0 && photos.length > 1 ? (
                <View
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: 'rgba(15,23,42,0.75)',
                    borderBottomLeftRadius: radius.md,
                    borderBottomRightRadius: radius.md,
                    paddingVertical: 2,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 9, fontWeight: '700' }}>
                    {t('photos.cover')}
                  </Text>
                </View>
              ) : null}
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

            {canReorder ? (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <NudgeButton
                  label="‹"
                  accessibilityLabel={t('photos.moveEarlier')}
                  disabled={i === 0}
                  onPress={() => onMove!(i, i - 1)}
                />
                <NudgeButton
                  label="›"
                  accessibilityLabel={t('photos.moveLater')}
                  disabled={i === photos.length - 1}
                  onPress={() => onMove!(i, i + 1)}
                />
              </View>
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
          }}
        >
          {uploading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Text style={{ fontSize: 26, color: colors.textMuted }}>+</Text>
              <Text style={{ fontSize: 10, color: colors.textMuted }}>{t('photos.add')}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {canReorder ? (
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{t('photos.reorderHint')}</Text>
      ) : null}
    </View>
  );
}

function NudgeButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      style={{
        width: 30,
        height: 24,
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 18 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
