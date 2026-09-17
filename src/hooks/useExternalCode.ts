/** useExternalCode: bind/unbind/list external codes for an entity. */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  bindExternalCode,
  unbindExternalCode,
  listCodesForEntity,
  lookupProduct,
  type ProductInfo,
} from '../lib/codes';
import type { ExternalCodeType, ExternalEntityType, ExternalCode } from '../lib/supabase';

const codesKey = (entityType: string, entityId: string) =>
  ['external_codes', entityType, entityId] as const;

export function useExternalCodes(
  householdId: string | null,
  entityType: ExternalEntityType,
  entityId: string | undefined,
) {
  return useQuery<ExternalCode[]>({
    queryKey: [...codesKey(entityType, entityId ?? ''), householdId],
    enabled: !!householdId && !!entityId,
    queryFn: async () => {
      if (!householdId || !entityId) return [];
      return listCodesForEntity(householdId, entityType, entityId);
    },
  });
}

export function useBindExternalCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      householdId: string;
      codeValue: string;
      codeType: ExternalCodeType;
      entityType: ExternalEntityType;
      entityId: string;
      boundBy: string;
    }) => bindExternalCode(params),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: codesKey(vars.entityType, vars.entityId) });
    },
  });
}

export function useUnbindExternalCode(entityType: ExternalEntityType, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unbindExternalCode(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: codesKey(entityType, entityId) }),
  });
}

/** Look up a product by EAN/UPC. Only meaningful for product barcodes. */
export function useProductLookup(codeValue: string, codeType: ExternalCodeType, enabled = true) {
  return useQuery<ProductInfo>({
    queryKey: ['product', codeValue],
    enabled: enabled && !!codeValue,
    queryFn: () => lookupProduct(codeValue, codeType),
    staleTime: Infinity, // products don't change; cache forever
    retry: false,
  });
}
