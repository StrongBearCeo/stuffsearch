/** Items tab: searchable list. */
import React, { useState } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Input, EmptyState, ErrorBanner, Button, H1 } from '../../src/components/primitives';
import { ItemCard } from '../../src/components/ItemCard';
import { useItems } from '../../src/hooks/useItems';
import { spacing } from '../../src/theme';
import { useTranslation } from 'react-i18next';

export default function ItemsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [q, setQ] = useState('');
  const { data, isLoading, error, refetch, isFetching } = useItems(q);
  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: 8 }}>
        <H1>{t('items.title')}</H1>
        <Input placeholder={t('items.searchPlaceholder')} value={q} onChangeText={setQ} />
        <Button title={t('items.new')} onPress={() => router.push('/item/new')} />
      </View>
      <FlatList
        data={data ?? []}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: spacing.lg, marginBottom: 8 }}>
            <ItemCard item={item} onPress={() => router.push(`/item/${item.id}`)} />
          </View>
        )}
        ListEmptyComponent={
          error ? (
            <ErrorBanner message={(error as Error).message} />
          ) : isLoading ? null : (
            <EmptyState title={t('items.empty')} />
          )
        }
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#94a3b8" />}
      />
    </Screen>
  );
}
