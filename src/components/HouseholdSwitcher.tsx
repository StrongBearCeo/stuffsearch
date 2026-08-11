/** HouseholdSwitcher — avatar-style menu to swap the active household. */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Muted } from './primitives';
import { colors, radius } from '../theme';
import { useHousehold } from '../lib/household';
import { useTranslation } from 'react-i18next';

export function HouseholdSwitcher() {
  const { memberships, activeHousehold, setActiveHousehold } = useHousehold();
  const router = useRouter();
  const { t } = useTranslation();
  if (!activeHousehold) return null;
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* Tapping the household name opens the members + invite screen. */}
        <TouchableOpacity
          onPress={() => router.push('/household')}
          style={{ paddingVertical: 4 }}
          accessibilityRole="button"
          accessibilityLabel={t('household.title')}
        >
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>
            {activeHousehold.name}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/household/switch')}
          style={{ paddingHorizontal: 8, paddingVertical: 4 }}
          accessibilityRole="button"
          accessibilityLabel={t('household.switch')}
        >
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
            {t('household.switch')} →
          </Text>
        </TouchableOpacity>
      </View>
      {memberships.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
          {memberships.map((m) => {
            const active = m.households.id === activeHousehold.id;
            return (
              <TouchableOpacity
                key={m.households.id}
                onPress={() => setActiveHousehold(m.households.id)}
                style={{
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  borderRadius: radius.sm,
                  backgroundColor: active ? colors.primary + '33' : colors.surfaceAlt,
                  marginRight: 6,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text style={{ color: active ? colors.primary : colors.textMuted, fontSize: 12 }}>
                  {m.households.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <Muted>{t('household.count', { count: memberships.length })}</Muted>
      )}
    </Card>
  );
}
