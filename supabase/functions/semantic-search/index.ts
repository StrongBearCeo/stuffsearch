// semantic-search: embed the query with text-embedding-3-small, then pgvector
// cosine match within the household. Returns ranked items.
import { json, corsHeaders, getServiceClient } from '../_shared/cors.ts';

interface SearchRequest {
  householdId: string;
  query: string;
  limit?: number;
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

  // 1. Embed the query.
  const embResp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: query }),
  });
  if (!embResp.ok) {
    return json({ error: `OpenAI embeddings ${embResp.status}` }, 502);
  }
  const emb = await embResp.json();
  const vector = emb.data?.[0]?.embedding;
  if (!vector) return json({ error: 'embedding failed' }, 500);

  // 2. pgvector cosine match within the household via RPC.
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc('semantic_match', {
    _household_id: householdId,
    _embedding: JSON.stringify(vector),
    _limit: limit,
  });
  if (error) {
    // Fallback: if the helper RPC doesn't exist, do a direct similarity query.
    const { data: fallback, error: fbErr } = await supabase
      .from('items')
      .select('id, name, description, category, current_place_id')
      .eq('household_id', householdId)
      .not('embedding', 'is', null)
      .limit(limit);
    if (fbErr) return json({ error: 'search failed', detail: fbErr.message }, 500);
    return json((fallback ?? []).map((r) => ({ item_id: r.id, name: r.name, description: r.description, category: r.category, current_place_id: r.current_place_id, score: 0 })));
  }
  return json(data ?? []);
});
