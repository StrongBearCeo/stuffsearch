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

/**
 * enrich-item: photos + barcode + text → suggested name / category /
 * description / product links / tags / value.
 *
 * The function is vision-capable: whatever is in `photoUrls` is sent to the
 * model as image content, so an item with photos and no text still gets
 * filled in. `existingLinks` are passed as INPUT — the model is told to keep
 * them and only add genuinely new ones, and every returned link is HTTP-checked
 * server-side so dead 404 URLs never reach the app.
 */
export interface EnrichItemRequest {
  householdId: string;
  name?: string;
  description?: string;
  category?: string;
  photoUrls?: string[];
  existingLinks?: string[];
  existingTags?: string[];
  barcode?: string;
  barcodeType?: string;
  language?: 'en' | 'vi';
  /**
   * A free-text follow-up from the user — "it's the 18V model, not 20V",
   * "describe the condition", "this is for storing camping gear". Passed to
   * the model verbatim as the highest-priority instruction, so a wrong guess
   * can be corrected without retyping every field by hand.
   */
  instruction?: string;
  /**
   * Restrict the answer to one field, for the per-field ✨ buttons. The model
   * still SEES everything (a good description needs the photos and the name);
   * it's the answer that narrows.
   */
  field?: 'name' | 'description' | 'category' | 'tags' | 'links' | 'value';
  /**
   * What is being enriched. Places take the same treatment as items — a photo
   * of a shelf can name it and suggest tags — but the model is told to
   * describe a STORAGE LOCATION rather than a product to buy.
   */
  entity?: 'item' | 'place';
}
export interface EnrichItemResponse {
  name?: string;
  category?: string;
  description?: string;
  /** Legacy single-link field; still read by applyEnrichment. */
  product_link?: string;
  product_links?: string[];
  tags?: string[];
  estimated_value?: number;
  value_currency?: string;
  /** Links the model proposed that failed their HTTP check (surfaced as a hint). */
  rejected_links?: string[];
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
