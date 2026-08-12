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

  // 1. Embed the query.
  const embResp = await fetch(`${baseURL}/embeddings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: embModel, input: query }),
  });
  if (!embResp.ok) {
    const errText = await embResp.text();
    console.error(`[semantic-search] OpenAI embeddings ${embResp.status}: ${errText}`);
    return json({ error: `OpenAI embeddings ${embResp.status}`, detail: errText }, 502);
  }
  const emb = await embResp.json();
  const vector = emb.data?.[0]?.embedding;
  if (!vector) return json({ error: 'embedding failed' }, 500);

  // 2. pgvector cosine match within the household via RPC.
  const { data, error } = await db.rpc('semantic_match', {
    _household_id: householdId,
    _embedding: JSON.stringify(vector),
    _limit: limit,
  });
  if (error) {
    // Fallback: if the helper RPC doesn't exist, return items with embeddings.
    const { data: fallback, error: fbErr } = await db.select(
      'items',
      `select=id,name,description,category,current_place_id&household_id=eq.${encodeURIComponent(householdId)}&embedding=not.is.null&limit=${limit}`,
    );
    if (fbErr) return json({ error: 'search failed', detail: fbErr.message }, 500);
    return json((fallback ?? []).map((r: { id: string; name: string; description: string | null; category: string | null; current_place_id: string | null }) => ({ item_id: r.id, name: r.name, description: r.description, category: r.category, current_place_id: r.current_place_id, score: 0 })));
  }
  return json(data ?? []);
});
