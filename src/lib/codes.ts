/**
 * External code binding helpers + product-barcode lookup.
 * Calls the `product-lookup` Edge Function for EAN/UPC codes; otherwise just
 * binds the raw value as an identifier.
 */
import { supabase, type ExternalCode, type ExternalCodeType, type ExternalEntityType } from './supabase';
import { isProductBarcode } from './constants';
import { sanitizeScanPayload, isUsableScanPayload } from './scanPayload';

export interface ProductInfo {
  name?: string;
  category?: string;
  description?: string;
  image_url?: string;
  product_link?: string;
}

/** Bind a raw scanned code to an item or place within a household. */
export async function bindExternalCode(params: {
  householdId: string;
  codeValue: string;
  codeType: ExternalCodeType;
  entityType: ExternalEntityType;
  entityId: string;
  label?: string;
  boundBy: string;
}): Promise<ExternalCode> {
  // Last line of defence before the insert. A raw payload containing a NUL is
  // JSON-encoded by supabase-js and rejected by Postgres while it parses the
  // body (22P05), which fails the surrounding save entirely.
  const codeValue = sanitizeScanPayload(params.codeValue);
  if (!isUsableScanPayload(codeValue)) {
    throw new Error('That code could not be read.');
  }
  const { data, error } = await supabase
    .from('external_codes')
    .insert({
      household_id: params.householdId,
      code_value: codeValue,
      code_type: params.codeType,
      entity_type: params.entityType,
      entity_id: params.entityId,
      label: params.label,
      bound_by: params.boundBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Unbind (delete) a code from an entity. */
export async function unbindExternalCode(id: string): Promise<void> {
  const { error } = await supabase.from('external_codes').delete().eq('id', id);
  if (error) throw error;
}

/** List all codes bound to an entity. */
export async function listCodesForEntity(
  householdId: string,
  entityType: ExternalEntityType,
  entityId: string,
): Promise<ExternalCode[]> {
  const { data, error } = await supabase
    .from('external_codes')
    .select('*')
    .eq('household_id', householdId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);
  if (error) throw error;
  return data ?? [];
}

/**
 * Look up a product by EAN/UPC via the `product-lookup` Edge Function.
 * No-op (returns {}) for non-product code types.
 */
export async function lookupProduct(
  codeValue: string,
  codeType: ExternalCodeType,
): Promise<ProductInfo> {
  if (!isProductBarcode(codeType)) return {};
  const { data, error } = await supabase.functions.invoke<ProductInfo>(
    'product-lookup',
    { body: { code: codeValue, type: codeType } },
  );
  if (error) throw error;
  return data ?? {};
}
