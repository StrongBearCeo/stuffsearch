// enrich-item: given barcode + photo + name hints, ask GPT-4o-mini (vision) for
// a suggested name / category / description / product_link. User confirms before save.
import { json, corsHeaders } from '../_shared/cors.ts';

interface EnrichRequest {
  householdId: string;
  name?: string;
  description?: string;
  photoUrls?: string[];
  barcode?: string;
  barcodeType?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return json({ error: 'OPENAI_API_KEY not configured' }, 503);
  }

  let body: EnrichRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { name, description, photoUrls, barcode, barcodeType } = body;
  if (!name && !photoUrls?.length && !barcode) {
    return json({ error: 'Nothing to enrich from' }, 400);
  }

  // Build a chat completion. If photos are present, use GPT-4o vision; else text.
  const hasPhotos = photoUrls && photoUrls.length > 0;
  const systemPrompt =
    'You are an inventory assistant. Given hints about an item (name, description, barcode, photos), ' +
    'return a concise JSON object with suggested fields: name, category, description, product_link. ' +
    'Respond ONLY with JSON, no prose. Keep names short. Category is one word. ' +
    'product_link is a best-guess shopping URL or empty.';

  const userText = [
    name ? `Current name: ${name}` : null,
    description ? `Description: ${description}` : null,
    barcode ? `Barcode (${barcodeType ?? 'unknown'}): ${barcode}` : null,
    'Suggest enriched fields.',
  ]
    .filter(Boolean)
    .join('\n');

  const content: unknown[] = [{ type: 'text', text: userText }];
  if (hasPhotos) {
    for (const url of photoUrls!.slice(0, 2)) {
      content.push({ type: 'image_url', image_url: { url } });
    }
  }

  try {
    const baseURL = (Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    const model = Deno.env.get('OPENAI_CHAT_MODEL') ?? 'gpt-4o-mini';
    const resp = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content },
        ],
        max_tokens: 300,
        temperature: 0.3,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[enrich-item] OpenAI chat ${resp.status}: ${errText}`);
      try {
        // Log via plain fetch (getServiceClient pulls supabase-js from esm.sh
        // at runtime → Edge CPU EarlyDrop). Service role key bypasses RLS.
        const baseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
        const sk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        await fetch(`${baseUrl}/rest/v1/edge_ai_errors`, {
          method: 'POST',
          headers: { apikey: sk, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ fn: 'enrich-item', status: resp.status, body: errText }),
        });
      } catch { /* never block the error response */ }
      return json({ error: `OpenAI error: ${resp.status}`, detail: errText }, 502);
    }
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(text);
    return json(parsed);
  } catch (e) {
    return json({ error: 'Enrichment failed', detail: String(e) }, 500);
  }
});
