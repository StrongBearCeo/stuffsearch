// ask-llm: NL question over the household's inventory → retrieves relevant
// items (vector if embeddings available, else full-text), then a chat model
// answers with the location.
//
// IMPORTANT: this function intentionally does NOT import @supabase/supabase-js
// (not even from esm.sh). Doing a remote require('https://esm.sh/...') inside
// the handler downloaded + transpiled the module on every cold start, which
// blew past the Edge Runtime CPU budget and produced HTTP 500 "EarlyDrop"
// responses in ~150ms. We talk to PostgREST directly via fetch with the
// service role key instead — far cheaper CPU-wise.
import { json, corsHeaders } from '../_shared/cors.ts';

interface AskRequest {
  householdId: string;
  question: string;
  language?: 'en' | 'vi';
}

/** Tiny PostgREST client built on fetch. Uses the service role key
 *  (SUPABASE_SERVICE_ROLE_KEY, auto-injected) so RLS is bypassed — the caller
 *  is already authenticated at the gateway (verify_jwt = true). */
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
    async select<T = unknown>(table: string, query: string): Promise<T[]> {
      const r = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, { headers });
      if (!r.ok) return [];
      return (await r.json()) as T[];
    },
    async insert(table: string, row: Record<string, unknown>): Promise<boolean> {
      const r = await fetch(`${baseUrl}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(row),
      });
      return r.ok;
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return json({ error: 'OPENAI_API_KEY not configured' }, 503);

  let body: AskRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const { householdId, question, language = 'en' } = body;
  if (!householdId || !question) return json({ error: 'householdId and question required' }, 400);

  const db = postgrest();
  const baseURL = (Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  const embModel = Deno.env.get('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-small';

  // 1. Try to embed the question; fall back to full-text if no embeddings endpoint.
  let vector: number[] | null = null;
  try {
    const embResp = await fetch(`${baseURL}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: embModel, input: question }),
    });
    if (embResp.ok) {
      vector = (await embResp.json()).data?.[0]?.embedding ?? null;
    } else {
      const errText = await embResp.text();
      console.error(`[ask-llm] embeddings ${embResp.status}: ${errText}`);
      if (embResp.status !== 400 && embResp.status !== 404) {
        await db.insert('edge_ai_errors', { fn: 'ask-llm:embed', status: embResp.status, body: errText });
        return json({ error: `embeddings ${embResp.status}`, detail: errText }, 502);
      }
    }
  } catch (e) {
    console.error(`[ask-llm] embeddings fetch threw: ${String(e)}`);
  }

  // 2. Retrieve matching items (vector RPC, else full-text RPC, else ILIKE).
  type Match = { item_id: string; name: string; current_place_id: string | null };
  let matches: Match[] = [];
  if (vector) {
    const { data, error } = await db.rpc<Match[]>('semantic_match', {
      _household_id: householdId,
      _embedding: JSON.stringify(vector),
      _limit: 15,
    });
    if (!error && data) matches = data;
  }
  // No embeddings (nothing populates items.embedding yet) → token-scored
  // relevance search in Postgres. See migration 0007 for fts_search.
  if (!matches.length) {
    const { data: fts } = await db.rpc<Match[]>('fts_search', {
      _household_id: householdId,
      _query: question,
      _limit: 15,
    });
    if (fts) matches = fts;
  }
  if (!matches.length) {
    // Last resort: OR the question's individual words rather than the whole
    // phrase. A single `ilike '%husky tile cutter%'` only matches a contiguous
    // run of characters, so an extra brand word made a present item invisible.
    const tokens = [
      ...new Set(
        question
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .filter((w) => w.length >= 2),
      ),
    ].slice(0, 8);
    const or = (tokens.length ? tokens : [question])
      .map((w) => `name.ilike.*${encodeURIComponent(w)}*,description.ilike.*${encodeURIComponent(w)}*`)
      .join(',');
    const like = await db.select<{ id: string; name: string; current_place_id: string | null }>(
      'items',
      `select=id,name,current_place_id&household_id=eq.${encodeURIComponent(householdId)}&or=(${or})&limit=15`,
    );
    matches = like.map((r) => ({ item_id: r.id, name: r.name, current_place_id: r.current_place_id }));
  }

  // Resolve place names for matched items.
  const placeIds = matches.map((m) => m.current_place_id).filter(Boolean) as string[];
  let places: Record<string, { name: string }> = {};
  if (placeIds.length) {
    const placeRows = await db.select<{ id: string; name: string }>(
      'places',
      `select=id,name&id=in.(${placeIds.join(',')})`,
    );
    places = Object.fromEntries(placeRows.map((p) => [p.id, p]));
  }

  const sources = matches.map((m) => ({
    item_id: m.item_id,
    name: m.name,
    place_name: m.current_place_id ? places[m.current_place_id]?.name ?? null : null,
  }));

  // 3. Build context + ask the chat model for a natural-language answer.
  const inventory = sources
    .map((s, i) => `${i + 1}. ${s.name}${s.place_name ? ` (in ${s.place_name})` : ' (location unknown)'}`)
    .join('\n');

  const langName = language === 'vi' ? 'Vietnamese' : 'English';
  // Near matches matter: the retrieval step is deliberately generous (it scores
  // per token), so the list often holds the right thing under a slightly
  // different name — "Tile cutter" for a question about a "Husky tile cutter".
  // Without this instruction the model answered "I couldn't find it" while the
  // item sat at the top of the very list it was given.
  const systemPrompt =
    `You are a household inventory assistant. Answer the user's question about where things are, ` +
    `based ONLY on the inventory list provided. Be specific and concise. ` +
    `The list is ranked by relevance and may not contain an exact name match. ` +
    `If an entry is clearly the same kind of thing the user is asking about — even if the ` +
    `brand, model or wording differs — treat it as the answer, give its location, and note ` +
    `briefly that the recorded name differs. ` +
    `Only say you couldn't find it when nothing in the list plausibly matches. ` +
    `Respond in ${langName}.`;

  const userPrompt = `Inventory:\n${inventory || '(empty)'}\n\nQuestion: ${question}`;

  const chatResp = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_CHAT_MODEL') ?? 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 300,
      temperature: 0.4,
    }),
  });
  if (!chatResp.ok) {
    const errText = await chatResp.text();
    console.error(`[ask-llm] OpenAI chat ${chatResp.status}: ${errText}`);
    await db.insert('edge_ai_errors', { fn: 'ask-llm:chat', status: chatResp.status, body: errText });
    return json({ error: `chat ${chatResp.status}`, detail: errText }, 502);
  }
  const chatData = await chatResp.json();
  const answer = chatData.choices?.[0]?.message?.content ?? '';

  return json({ answer, sources });
});
