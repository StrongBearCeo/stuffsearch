/** Places tab: searchable list. */
import React, { useState } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Input, EmptyState, ErrorBanner, Button, H1, ListSkeleton } from '../../src/components/primitives';
import { PlaceCard } from '../../src/components/PlaceCard';
import { usePlaces } from '../../src/hooks/usePlaces';
import { useResponsive } from '../../src/hooks/useResponsive';
import { spacing, colors } from '../../src/theme';
import { useTranslation } from 'react-i18next';

export default function PlacesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { columns } = useResponsive();
  const [q, setQ] = useState('');
  const { data, isLoading, error, refetch, isFetching } = usePlaces(q);
  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: 8 }}>
        <H1>{t('places.title')}</H1>
        <Input placeholder={t('places.searchPlaceholder')} value={q} onChangeText={setQ} />
        <Button title={t('places.new')} onPress={() => router.push('/place/new')} />
      </View>
      <FlatList
        data={data ?? []}
        key={`cols-${columns}`}
        numColumns={columns}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <View style={{ flex: 1 / columns, padding: spacing.sm }}>
            <PlaceCard place={item} onPress={() => router.push(`/place/${item.id}`)} />
          </View>
        )}
        ListEmptyComponent={
          error ? (
            <ErrorBanner message={(error as Error).message} />
          ) : isLoading ? (
            <ListSkeleton />
          ) : (
            <EmptyState title={t('places.empty')} />
          )
        }
        contentContainerStyle={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.xl }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.textMuted} />}
      />
    </Screen>
  );
}
