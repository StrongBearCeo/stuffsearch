/** ScanOverlay — live camera scanner overlay frame + active-place banner. */
import React from 'react';
import { View, Text } from 'react-native';
import { colors, radius } from '../theme';
import { useUiStore } from '../store/ui';
import { useTranslation } from 'react-i18next';

export function ScanOverlay() {
  const { activePlaceId, activePlaceName } = useUiStore();
  const { t } = useTranslation();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* Corner brackets */}
      <View
        style={{
          position: 'absolute',
          alignSelf: 'center',
          top: '35%',
          width: 240,
          height: 240,
          borderWidth: 2,
          borderColor: colors.accent,
          borderRadius: radius.lg,
          opacity: 0.9,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 40,
          left: 16,
          right: 16,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 8 }}>
          {t('scan.hint')}
        </Text>
        <View
          style={{
            backgroundColor: activePlaceId ? colors.primary : colors.surface,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: radius.md,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
            {activePlaceId
              ? `${t('scan.activePlace')}: ${activePlaceName ?? '—'}`
              : t('scan.noActivePlace')}
          </Text>
        </View>
      </View>
    </View>
  );
}
