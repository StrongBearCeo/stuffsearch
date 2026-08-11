// ask-llm: NL question over the household's inventory → retrieves relevant
// items via semantic search, then a chat model answers with the location.
import { json, corsHeaders, getServiceClient } from '../_shared/cors.ts';

interface AskRequest {
  householdId: string;
  question: string;
  language?: 'en' | 'vi';
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

  const supabase = getServiceClient();

  // 1. Embed the question.
  const embResp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: question }),
  });
  if (!embResp.ok) return json({ error: `embeddings ${embResp.status}` }, 502);
  const vector = (await embResp.json()).data?.[0]?.embedding;
  if (!vector) return json({ error: 'embedding failed' }, 500);

  // 2. Retrieve matching items + their place names.
  const { data: matches, error } = await supabase.rpc('semantic_match', {
    _household_id: householdId,
    _embedding: JSON.stringify(vector),
    _limit: 15,
  });
  if (error) return json({ error: 'retrieval failed', detail: error.message }, 500);

  // Resolve place names for matched items.
  const placeIds = (matches ?? []).map((m: { current_place_id: string | null }) => m.current_place_id).filter(Boolean);
  let places: Record<string, { name: string }> = {};
  if (placeIds.length) {
    const { data: placeRows } = await supabase.from('places').select('id, name').in('id', placeIds);
    places = Object.fromEntries((placeRows ?? []).map((p: { id: string; name: string }) => [p.id, p]));
  }

  const sources = (matches ?? []).map((m: { item_id: string; name: string; current_place_id: string | null; category: string | null; description: string | null }) => ({
    item_id: m.item_id,
    name: m.name,
    place_name: m.current_place_id ? places[m.current_place_id]?.name ?? null : null,
  }));

  // 3. Build context + ask the chat model for a natural-language answer.
  const inventory = sources
    .map((s, i) => `${i + 1}. ${s.name}${s.place_name ? ` (in ${s.place_name})` : ' (location unknown)'}`)
    .join('\n');

  const langName = language === 'vi' ? 'Vietnamese' : 'English';
  const systemPrompt =
    `You are a household inventory assistant. Answer the user's question about where things are, ` +
    `based ONLY on the inventory list provided. Be specific and concise. ` +
    `If the item isn't listed, say you couldn't find it. ` +
    `Respond in ${langName}.`;

  const userPrompt = `Inventory:\n${inventory || '(empty)'}\n\nQuestion: ${question}`;

  const chatResp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 300,
      temperature: 0.4,
    }),
  });
  if (!chatResp.ok) return json({ error: `chat ${chatResp.status}` }, 502);
  const chatData = await chatResp.json();
  const answer = chatData.choices?.[0]?.message?.content ?? '';

  return json({ answer, sources });
});
