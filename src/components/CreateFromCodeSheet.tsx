/** CreateFromCodeSheet — shown when a scanned code has no match.
 * Offers to create an item or place with the code bound as its identifier,
 * and (for EAN/UPC) a product lookup to pre-fill name/image. */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { Button, Input, H2, Body, Muted } from './primitives';
import { colors, radius } from '../theme';
import { useTranslation } from 'react-i18next';
import { isProductBarcode } from '../lib/constants';
import { useProductLookup } from '../hooks/useExternalCode';
import type { ExternalCodeType } from '../lib/supabase';

export function CreateFromCodeSheet({
  visible,
  codeValue,
  codeType,
  onClose,
  onCreateItem,
  onCreatePlace,
}: {
  visible: boolean;
  codeValue: string;
  codeType: ExternalCodeType;
  onClose: () => void;
  onCreateItem: (prefill?: { name?: string; category?: string; product_link?: string }) => void;
  onCreatePlace: (prefill?: { name?: string }) => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState('');
  const lookedUp = isProductBarcode(codeType);
  const { data: product, isFetching } = useProductLookup(codeValue, codeType, visible && lookedUp);

  const prefill = product
    ? { name: product.name, category: product.category, product_link: product.product_link }
    : undefined;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(0,0,0,0.5)',
        }}
      >
        <View
          style={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            padding: 20,
            gap: 12,
          }}
        >
          <H2>{t('scanResolve.noMatch')}</H2>
          <Muted>{t('scanResolve.noMatchHint')}</Muted>
          <Input value={codeValue} editable={false} />
          <Input
            placeholder={t('codes.label') + ` (${t('common.optional')})`}
            value={label}
            onChangeText={setLabel}
          />
          {lookedUp && isFetching ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color={colors.primary} />
              <Muted>{t('scanResolve.lookingUp')}</Muted>
            </View>
          ) : null}
          {product?.name ? (
            <View style={{ backgroundColor: colors.surface, padding: 10, borderRadius: radius.md }}>
              <Body style={{ fontWeight: '600' }}>{product.name}</Body>
              {product.category ? <Muted>{product.category}</Muted> : null}
            </View>
          ) : null}

          <Button
            title={t('scanResolve.createItem')}
            onPress={() => onCreateItem(prefill)}
          />
          <Button
            title={t('scanResolve.createPlace')}
            variant="ghost"
            onPress={() => onCreatePlace({ name: prefill?.name })}
          />
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', padding: 8 }}>
            <Text style={{ color: colors.textMuted }}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
