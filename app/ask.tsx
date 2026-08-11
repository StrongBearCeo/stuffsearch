/** Ask the LLM: "where did I put the...?" over the active household's inventory. */
import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Screen, H1, Input, Body, Muted, Card, Button, ErrorBanner } from '../src/components/primitives';
import { VoiceButton } from '../src/components/VoiceButton';
import { useAsk } from '../src/hooks/useSemanticSearch';
import { useHousehold } from '../src/lib/household';
import { useAuth } from '../src/lib/auth';
import { spacing } from '../src/theme';
import { useTranslation } from 'react-i18next';
import { useHeaderTitle } from '../src/lib/useHeaderTitle';

export default function AskScreen() {
  const { t } = useTranslation();
  const { activeHouseholdId } = useHousehold();
  const { profile } = useAuth();
  const [question, setQuestion] = useState('');
  const [submitted, setSubmitted] = useState(false);
  useHeaderTitle(t('search.ask'));

  const { data, error, isFetching } = useAsk(
    activeHouseholdId,
    submitted ? question : '',
    submitted,
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12 }}>
        <H1>{t('search.ask')}</H1>
        <Input
          placeholder={t('search.askPlaceholder')}
          value={question}
          onChangeText={setQuestion}
          multiline
          style={{ minHeight: 56 }}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button
              title={t('search.ask')}
              loading={isFetching}
              disabled={!question.trim()}
              onPress={() => setSubmitted(true)}
            />
          </View>
          <VoiceButton language={profile?.default_language ?? 'en'} onResult={setQuestion} />
        </View>

        {error ? <ErrorBanner message={(error as Error).message} /> : null}

        {data?.answer ? (
          <Card>
            <Body style={{ fontSize: 16 }}>{data.answer}</Body>
          </Card>
        ) : null}

        {data?.sources && data.sources.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Body style={{ fontWeight: '700' }}>{t('search.results')}</Body>
            {data.sources.map((s: { item_id: string; name: string; place_name: string | null }) => (
              <Card key={s.item_id}>
                <Body style={{ fontWeight: '600' }}>{s.name}</Body>
                {s.place_name ? <Muted>{s.place_name}</Muted> : null}
              </Card>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
