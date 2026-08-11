/** Global search: text + voice + semantic results. */
import React, { useState } from 'react';
import { View, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, H1, Input, Body, Muted, Card, ErrorBanner } from '../src/components/primitives';
import { ItemCard } from '../src/components/ItemCard';
import { VoiceButton } from '../src/components/VoiceButton';
import { useItems } from '../src/hooks/useItems';
import { useSemanticSearch } from '../src/hooks/useSemanticSearch';
import { useHousehold } from '../src/lib/household';
import { useAuth } from '../src/lib/auth';
import type { Item } from '../src/lib/supabase';
import type { SemanticSearchResult } from '../src/lib/llm';
import { spacing } from '../src/theme';
import { useTranslation } from 'react-i18next';
import { useHeaderTitle } from '../src/lib/useHeaderTitle';

/** A single search result row — either a full Item (text search) or a semantic hit. */
type SearchRow = Item | SemanticSearchResult;
const isSemantic = (r: SearchRow): r is SemanticSearchResult => 'item_id' in r;

export default function SearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { activeHouseholdId } = useHousehold();
  const { profile } = useAuth();
  const [q, setQ] = useState('');
  useHeaderTitle(t('search.title'));

  // Text search is local + fast; semantic search is LLM-backed.
  const text = useItems(q);
  const semantic = useSemanticSearch(activeHouseholdId, q, q.trim().length > 1);

  const showSemantic = q.trim().length > 1 && !text.isLoading && (text.data?.length ?? 0) === 0;

  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: 8 }}>
        <H1>{t('search.title')}</H1>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Input placeholder={t('search.placeholder')} value={q} onChangeText={setQ} />
          </View>
          <VoiceButton language={profile?.default_language ?? 'en'} onResult={setQ} />
        </View>
      </View>
      <FlatList<SearchRow>
        data={showSemantic ? semantic.data ?? [] : text.data ?? []}
        keyExtractor={(i) => (isSemantic(i) ? i.item_id : i.id)}
        renderItem={({ item }) => {
          // semantic results have item_id + score; text results are Item rows.
          if (isSemantic(item)) {
            return (
              <View style={{ paddingHorizontal: spacing.lg, marginBottom: 8 }}>
                <Card>
                  <Body style={{ fontWeight: '600' }}>{item.name}</Body>
                  <Muted>
                    {t('search.semantic')} · {Math.round(item.score * 100)}%
                  </Muted>
                </Card>
              </View>
            );
          }
          return (
            <View style={{ paddingHorizontal: spacing.lg, marginBottom: 8 }}>
              <ItemCard item={item} onPress={() => router.push(`/item/${item.id}`)} />
            </View>
          );
        }}
        ListEmptyComponent={
          q.trim().length > 1 ? (
            semantic.error ? (
              <View style={{ padding: spacing.lg }}>
                <ErrorBanner message={(semantic.error as Error).message} />
                <Body style={{ marginTop: 8 }}>{t('search.noResults')}</Body>
              </View>
            ) : (
              <View style={{ padding: spacing.lg }}>
                <Muted>{t('search.noResults')}</Muted>
              </View>
            )
          ) : null
        }
        contentContainerStyle={{ paddingBottom: spacing.xl }}
      />
    </Screen>
  );
}
