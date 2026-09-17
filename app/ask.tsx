/** Ask the LLM: "where did I put the...?" over the active household's inventory. */
import React, { useState } from 'react';
import { View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { FormScreen, H1, Input, Body, Muted, Card, Button } from '../src/components/primitives';
import { VoiceButton } from '../src/components/VoiceButton';
import { useAsk } from '../src/hooks/useSemanticSearch';
import { useHousehold } from '../src/lib/household';
import { useAuth } from '../src/lib/auth';
import { colors, spacing } from '../src/theme';
import { useTranslation } from 'react-i18next';
import { useHeaderTitle } from '../src/lib/useHeaderTitle';

const EXAMPLES = ['askExample1', 'askExample2'] as const;

export default function AskScreen() {
  const { t } = useTranslation();
  const router = useRouter();
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

  // Strip the quotes from an example key to prefill the input (without asking yet).
  function fillExample(ex: string) {
    setQuestion(ex.replace(/^[“"]|[”"]$/g, ''));
    setSubmitted(false);
  }

  function onClear() {
    setQuestion('');
    setSubmitted(false);
  }

  const hasAnswer = !!data?.answer;

  return (
    <FormScreen contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <H1>{t('search.ask')}</H1>

      {/* Input row + actions */}
      <Input
        placeholder={t('search.askPlaceholder')}
        value={question}
        onChangeText={(v) => {
          setQuestion(v);
          // Editing the question invalidates the previous answer.
          if (submitted) setSubmitted(false);
        }}
        multiline
        clearable
        clearLabel={t('search.clearSearch')}
        style={{ minHeight: 72 }}
      />
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Button
            title={t('search.ask')}
            loading={isFetching}
            disabled={!question.trim() || isFetching}
            onPress={() => setSubmitted(true)}
          />
        </View>
        <VoiceButton language={profile?.default_language ?? 'en'} onResult={setQuestion} />
        {hasAnswer || question.trim() ? (
          <Button title={t('search.askClear')} variant="ghost" onPress={onClear} />
        ) : null}
      </View>

      {/* Empty state: intro + tappable example prompts. */}
      {!submitted && !hasAnswer ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <Muted>{t('search.askIntro')}</Muted>
          {EXAMPLES.map((ex) => (
            <TouchableOpacity
              key={ex}
              onPress={() => fillExample(t(`search.${ex}`))}
              accessibilityRole="button"
              accessibilityLabel={t(`search.${ex}`)}
            >
              <Card>
                <Body style={{ color: colors.primary }}>{t(`search.${ex}`)}</Body>
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* Loading state. */}
      {isFetching ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={colors.primary} />
          <Muted>{t('search.askThinking')}</Muted>
        </Card>
      ) : null}

      {/* Error state — friendlier than the raw edge-function message. */}
      {error && !isFetching ? (
        <Card style={{ backgroundColor: colors.surface }}>
          <Body style={{ color: colors.danger }}>{t('search.askError')}</Body>
        </Card>
      ) : null}

      {/* Answer. */}
      {hasAnswer && !isFetching ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <Body style={{ fontWeight: '700' }}>{t('search.askAnswer')}</Body>
          <Card>
            <Body style={{ fontSize: 16 }}>{data!.answer}</Body>
          </Card>
        </View>
      ) : null}

      {/* Sources — tappable to open the item. */}
      {data?.sources && data.sources.length > 0 && !isFetching ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <Body style={{ fontWeight: '700' }}>{t('search.results')}</Body>
          {data.sources.map((s: { item_id: string; name: string; place_name: string | null }) => (
            <TouchableOpacity
              key={s.item_id}
              onPress={() => router.push(`/item/${s.item_id}` as never)}
              accessibilityRole="button"
              accessibilityLabel={s.name}
            >
              <Card style={{ gap: 2 }}>
                <Body style={{ fontWeight: '600' }}>{s.name}</Body>
                {s.place_name ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Muted>📍</Muted>
                    <Muted>{s.place_name}</Muted>
                  </View>
                ) : (
                  <Muted>{t('items.notLocated')}</Muted>
                )}
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </FormScreen>
  );
}
