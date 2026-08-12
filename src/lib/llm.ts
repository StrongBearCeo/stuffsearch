/**
 * Edge Function clients. All LLM work happens server-side (keys in Supabase
 * secrets, never in the app bundle). Each function is `verify_jwt = true`, so
 * the caller must be signed in — the Supabase client injects the token.
 */
import { supabase } from './supabase';

/**
 * Invoke an Edge Function and surface a real error message on failure.
 *
 * supabase-js returns a `FunctionsHttpError` whose `.message` is the opaque
 * "Edge function returned a non-2xx status code" and whose `.context` is the
 * unread `Response`. Our functions return a JSON body like
 * `{ error: "OpenAI error: 401", detail: "..." }` on failure — read it so the
 * caller sees the actual cause (bad key, quota, etc.) instead of the generic
 * string.
 */
async function invokeFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, {
    body: body as Record<string, unknown>,
  });
  if (error) {
    let message = (error as Error).message;
    try {
      const resp = (error as { context?: Response }).context;
      if (resp) {
        const parsed = (await resp.json()) as { error?: string; detail?: string };
        if (parsed?.error) message = parsed.detail ? `${parsed.error}: ${parsed.detail}` : parsed.error;
      }
    } catch {
      /* body wasn't JSON or already consumed — keep the generic message */
    }
    throw new Error(message);
  }
  return data as T;
}

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
  return (await invokeFunction<EnrichItemResponse>('enrich-item', req)) ?? {};
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
  return (await invokeFunction<SemanticSearchResult[]>('semantic-search', {
    ...req,
    limit: req.limit ?? 20,
  })) ?? [];
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
  return (await invokeFunction<AskLlmResponse>('ask-llm', req)) ?? { answer: '', sources: [] };
}
