/**
 * Edge Function clients. All LLM work happens server-side (keys in Supabase
 * secrets, never in the app bundle). Each function is `verify_jwt = true`, so
 * the caller must be signed in — the Supabase client injects the token.
 */
import { supabase } from './supabase';

/** enrich-item: barcode + photo → suggested name/category/description/product_link. */
export interface EnrichItemRequest {
  householdId: string;
  name?: string;
  description?: string;
  photoUrls?: string[];
  barcode?: string;
  barcodeType?: string;
}
export interface EnrichItemResponse {
  name?: string;
  category?: string;
  description?: string;
  product_link?: string;
}
export async function enrichItem(req: EnrichItemRequest): Promise<EnrichItemResponse> {
  const { data, error } = await supabase.functions.invoke<EnrichItemResponse>(
    'enrich-item',
    { body: req },
  );
  if (error) throw error;
  return data ?? {};
}

/** semantic-search: embed query → pgvector cosine match within a household. */
export interface SemanticSearchRequest {
  householdId: string;
  query: string;
  limit?: number;
}
export interface SemanticSearchResult {
  item_id: string;
  name: string;
  description: string | null;
  category: string | null;
  current_place_id: string | null;
  score: number;
}
export async function semanticSearch(
  req: SemanticSearchRequest,
): Promise<SemanticSearchResult[]> {
  const { data, error } = await supabase.functions.invoke<SemanticSearchResult[]>(
    'semantic-search',
    { body: { ...req, limit: req.limit ?? 20 } },
  );
  if (error) throw error;
  return data ?? [];
}

/** ask-llm: NL question over the active household's inventory → answer + source. */
export interface AskLlmRequest {
  householdId: string;
  question: string;
  language?: 'en' | 'vi';
}
export interface AskLlmResponse {
  answer: string;
  sources: { item_id: string; name: string; place_name: string | null }[];
}
export async function askLlm(req: AskLlmRequest): Promise<AskLlmResponse> {
  const { data, error } = await supabase.functions.invoke<AskLlmResponse>('ask-llm', {
    body: req,
  });
  if (error) throw error;
  return data ?? { answer: '', sources: [] };
}
