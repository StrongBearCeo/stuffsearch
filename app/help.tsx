/** Help screen: static how-to sections covering scanning, organizing, asking,
 *  and printing. Always available from Settings. */
import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import { Screen, H1, H2, Body, Muted, Card, MaxWidth } from '../src/components/primitives';
import { colors, spacing } from '../src/theme';
import { useTranslation } from 'react-i18next';
import { useHeaderTitle } from '../src/lib/useHeaderTitle';

const SECTIONS = [
  { emoji: '📷', titleKey: 'help.scanTitle', bodyKey: 'help.scanBody' },
  { emoji: '🗄️', titleKey: 'help.organizeTitle', bodyKey: 'help.organizeBody' },
  { emoji: '❓', titleKey: 'help.askTitle', bodyKey: 'help.askBody' },
  { emoji: '🖨️', titleKey: 'help.printTitle', bodyKey: 'help.printBody' },
] as const;

export default function HelpScreen() {
  const { t } = useTranslation();
  useHeaderTitle(t('help.title'));
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ alignItems: 'center' }}>
        <MaxWidth style={{ padding: spacing.lg, gap: 12, paddingBottom: 40, width: '100%' }}>
          <H1>{t('help.title')}</H1>
          {SECTIONS.map((s) => (
            <Card key={s.titleKey} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 22 }}>{s.emoji}</Text>
                <H2>{t(s.titleKey)}</H2>
              </View>
              <Body style={{ lineHeight: 22 }}>{t(s.bodyKey)}</Body>
            </Card>
          ))}
          <Muted style={{ textAlign: 'center', marginTop: 8, fontSize: 11 }}>
            {t('app.name')} · {t('app.tagline')}
          </Muted>
        </MaxWidth>
      </ScrollView>
    </Screen>
  );
}
