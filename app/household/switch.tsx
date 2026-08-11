/** Switch active household. */
import React from 'react';
import { View, ScrollView, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Screen, H1, Card } from '../../src/components/primitives';
import { useHousehold } from '../../src/lib/household';
import { colors, spacing, radius } from '../../src/theme';
import { useTranslation } from 'react-i18next';

export default function SwitchHouseholdScreen() {
  const { t } = useTranslation();
  const { memberships, activeHousehold, setActiveHousehold } = useHousehold();
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 8 }}>
        <H1>{t('household.switch')}</H1>
        {memberships.map((m) => {
          const active = m.households.id === activeHousehold?.id;
          return (
            <TouchableOpacity
              key={m.households.id}
              onPress={async () => {
                await setActiveHousehold(m.households.id);
                router.back();
              }}
            >
              <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>{m.households.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {m.role === 'owner' ? t('household.owner') : t('household.member')}
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: active ? colors.primary + '33' : colors.surfaceAlt,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{ color: active ? colors.primary : colors.textMuted, fontSize: 12 }}>
                    {active ? '✓' : ''}
                  </Text>
                </View>
              </Card>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
