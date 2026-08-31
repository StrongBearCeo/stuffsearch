// semantic-search: embed the query with text-embedding-3-small, then pgvector
// cosine match within the household. Returns ranked items.
//
// Does NOT import @supabase/supabase-js — see ask-llm/index.ts for why (the
// esm.sh runtime require blows the Edge CPU budget → EarlyDrop 500s). We call
// PostgREST directly via fetch with the service role key.
import { json, corsHeaders } from '../_shared/cors.ts';

interface SearchRequest {
  householdId: string;
  query: string;
  limit?: number;
}

function postgrest() {
  const baseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const headers: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  return {
    async rpc<T = unknown>(fn: string, params: Record<string, unknown>): Promise<{ data: T | null; error: { message: string } | null }> {
      const r = await fetch(`${baseUrl}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify(params),
      });
      if (!r.ok) return { data: null, error: { message: `rpc ${fn} ${r.status}: ${await r.text()}` } };
      return { data: (await r.json()) as T, error: null };
    },
    async select<T = unknown>(table: string, query: string): Promise<{ data: T[] | null; error: { message: string } | null }> {
      const r = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, { headers });
      if (!r.ok) return { data: null, error: { message: `select ${table} ${r.status}: ${await r.text()}` } };
      return { data: (await r.json()) as T[], error: null };
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return json({ error: 'OPENAI_API_KEY not configured' }, 503);

  let body: SearchRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const { householdId, query, limit = 20 } = body;
  if (!householdId || !query) return json({ error: 'householdId and query required' }, 400);

  const db = postgrest();
  const baseURL = (Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  const embModel = Deno.env.get('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-small';

  /** Token-scored relevance search in Postgres. The universal fallback. */
  async function relevanceSearch() {
    return db.rpc('fts_search', {
      _household_id: householdId,
      _query: query,
      _limit: limit,
    });
  }

  // 1. Try to embed the query. A failure here is NOT fatal: not every
  //    OpenAI-compatible endpoint serves an embeddings model, and returning
  //    502 turned "no embeddings configured" into "search is broken". Fall
  //    through to the relevance search instead.
  let vector: number[] | null = null;
  try {
    const embResp = await fetch(`${baseURL}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: embModel, input: query }),
    });
    if (embResp.ok) {
      vector = (await embResp.json()).data?.[0]?.embedding ?? null;
    } else {
      console.error(`[semantic-search] embeddings ${embResp.status}: ${await embResp.text()}`);
    }
  } catch (e) {
    console.error(`[semantic-search] embeddings fetch threw: ${String(e)}`);
  }

  if (!vector) {
    const { data: fallback, error: fbErr } = await relevanceSearch();
    if (fbErr) return json({ error: 'search failed', detail: fbErr.message }, 500);
    return json(fallback ?? []);
  }

  // 2. pgvector cosine match within the household via RPC.
  const { data, error } = await db.rpc('semantic_match', {
    _household_id: householdId,
    _embedding: JSON.stringify(vector),
    _limit: limit,
  });
  if (error) {
    // The old fallback here listed items that HAVE an embedding, which is
    // nothing at all while the embedding column is unpopulated — the query
    // silently returned zero results.
    const { data: fallback, error: fbErr } = await relevanceSearch();
    if (fbErr) return json({ error: 'search failed', detail: fbErr.message }, 500);
    return json(fallback ?? []);
  }
  // An embedding-less household matches nothing by cosine; fall through to the
  // same relevance search rather than reporting "no results".
  if (Array.isArray(data) && data.length === 0) {
    const { data: fallback } = await relevanceSearch();
    if (Array.isArray(fallback) && fallback.length > 0) return json(fallback);
  }
  return json(data ?? []);
});
