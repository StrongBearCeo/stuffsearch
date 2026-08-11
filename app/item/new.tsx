/** Create or edit an item. Supports a prefilled external code (from scan) and
 * optional LLM enrichment. When `id` param is present, edits that item. */
import React, { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, H1, Input, Muted, Card, Button, ErrorBanner } from '../../src/components/primitives';
import { useCreateItem, useUpdateItem, useItem } from '../../src/hooks/useItems';
import { useBindExternalCode } from '../../src/hooks/useExternalCode';
import { useHousehold } from '../../src/lib/household';
import { useAuth } from '../../src/lib/auth';
import { enrichItem } from '../../src/lib/llm';
import { scannerTypeToCodeType } from '../../src/lib/constants';
import { spacing } from '../../src/theme';
import { useTranslation } from 'react-i18next';
import type { ExternalCodeType } from '../../src/lib/supabase';

export default function NewItemScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    id?: string;
    code?: string;
    type?: string;
    name?: string;
    category?: string;
  }>();
  const editing = !!params.id;
  const { data: existing } = useItem(params.id);

  const { activeHouseholdId } = useHousehold();
  const { user } = useAuth();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const bind = useBindExternalCode();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [productLink, setProductLink] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from existing (edit) or scan params.
  useEffect(() => {
    if (editing && existing) {
      setName(existing.name);
      setDescription(existing.description ?? '');
      setCategory(existing.category ?? '');
      setProductLink(existing.product_link ?? '');
    } else {
      setName(params.name ?? '');
      setCategory(params.category ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, params.name]);

  async function onSave() {
    setError(null);
    try {
      const payload = {
        name: name.trim() || 'Untitled',
        description: description.trim() || null,
        category: category.trim() || null,
        product_link: productLink.trim() || null,
      };
      let itemId: string;
      if (editing && params.id) {
        const updated = await updateItem.mutateAsync({ id: params.id, patch: payload });
        itemId = updated.id;
      } else {
        const created = await createItem.mutateAsync(payload);
        itemId = created.id;
        // If a code came from the scan flow, bind it.
        if (params.code && activeHouseholdId && user) {
          const codeType = (params.type as ExternalCodeType) ?? 'other';
          await bind.mutateAsync({
            householdId: activeHouseholdId,
            codeValue: params.code,
            codeType: scannerTypeToCodeType(codeType === 'other' ? 'other' : codeType),
            entityType: 'item',
            entityId: itemId,
            boundBy: user.id,
          });
        }
      }
      router.replace(`/item/${itemId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onEnrich() {
    if (!activeHouseholdId) return;
    setEnriching(true);
    setError(null);
    try {
      const res = await enrichItem({
        householdId: activeHouseholdId,
        name,
        description,
        barcode: params.code,
        barcodeType: params.type,
      });
      if (res.name) setName(res.name);
      if (res.category) setCategory(res.category);
      if (res.description) setDescription(res.description);
      if (res.product_link) setProductLink(res.product_link);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnriching(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12 }}>
        <H1>{editing ? t('common.edit') : t('items.new')}</H1>
        {params.code ? (
          <Card>
            <Muted>{t('codes.value')}</Muted>
            <Text style={{ color: '#fff', fontFamily: 'monospace' }}>{params.code}</Text>
          </Card>
        ) : null}
        <Input placeholder={t('items.name')} value={name} onChangeText={setName} />
        <Input placeholder={t('items.category')} value={category} onChangeText={setCategory} />
        <Input
          placeholder={t('items.description')}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          style={{ minHeight: 80 }}
        />
        <Input placeholder={t('items.productLink')} value={productLink} onChangeText={setProductLink} autoCapitalize="none" />

        {!editing ? (
          <Button title="✨ Enrich" variant="ghost" onPress={onEnrich} loading={enriching} />
        ) : null}

        {error ? <ErrorBanner message={error} /> : null}
        <Button title={t('common.save')} onPress={onSave} loading={createItem.isPending || updateItem.isPending} />
      </ScrollView>
    </Screen>
  );
}
