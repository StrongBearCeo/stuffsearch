/** BoundCodesList — shows external codes bound to an entity, each rendered as
 *  a visual barcode/QR image plus its raw value, with an unbind action. */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card, H2, Muted, EmptyState } from './primitives';
import { BarcodeImage } from './BarcodeImage';
import { colors, radius, tint } from '../theme';
import type { ExternalCode } from '../lib/supabase';
import { useTranslation } from 'react-i18next';

export function BoundCodesList({
  codes,
  onUnbind,
}: {
  codes: ExternalCode[];
  onUnbind?: (code: ExternalCode) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 8 }}>
      <H2>{t('codes.title')}</H2>
      {codes.length === 0 ? (
        <EmptyState title={t('common.empty')} />
      ) : (
        // Render rows directly rather than via <FlatList>: bound-code lists are
        // small, and a VirtualizedList nested in a same-orientation ScrollView
        // breaks windowing (RN logs "VirtualizedLists should never be nested
        // inside plain ScrollViews"). The enclosing detail screens scroll.
        codes.map((item) => (
          <Card key={item.id} style={{ gap: 10 }}>
            <BarcodeImage value={item.code_value} codeType={item.code_type} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontFamily: 'monospace' }}>{item.code_value}</Text>
                <Muted style={{ fontSize: 11 }}>
                  {item.code_type}
                  {item.label ? ` · ${item.label}` : ''}
                </Muted>
              </View>
              {onUnbind ? (
                <TouchableOpacity
                  onPress={() => onUnbind(item)}
                  hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('codes.unbind')}, ${item.code_value}`}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: radius.sm,
                    backgroundColor: tint(colors.danger),
                  }}
                >
                  <Text style={{ color: colors.danger, fontSize: 12 }}>{t('codes.unbind')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </Card>
        ))
      )}
    </View>
  );
}
