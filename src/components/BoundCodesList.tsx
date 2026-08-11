/** BoundCodesList — shows external codes bound to an entity, with unbind. */
import React from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { Card, H2, Muted, EmptyState } from './primitives';
import { colors, radius } from '../theme';
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
        <FlatList
          data={codes}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: radius.sm,
                    backgroundColor: colors.danger + '22',
                  }}
                >
                  <Text style={{ color: colors.danger, fontSize: 12 }}>{t('codes.unbind')}</Text>
                </TouchableOpacity>
              ) : null}
            </Card>
          )}
        />
      )}
    </View>
  );
}
