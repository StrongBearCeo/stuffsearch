// enrich-item: given photos + barcode + text hints, ask a vision chat model for
// a suggested name / category / description / product links / tags / value.
// The user confirms everything before saving.
//
// Three things this function guarantees to the client:
//   1. PHOTOS ARE USED. Every photo URL is sent as an `image_url` content part,
//      so an item with a picture and no text still gets filled in.
//   2. EXISTING LINKS ARE INPUT, NOT OUTPUT. They're shown to the model as
//      "already known" and echoed back untouched; the client appends anything
//      new rather than replacing (see src/lib/enrich.ts).
//   3. LINKS ARE CHECKED. Every suggested URL is fetched before it's returned;
//      404s and other dead links are dropped into `rejected_links` instead of
//      being handed to the user as a working product page.
import { json, corsHeaders } from '../_shared/cors.ts';

interface EnrichRequest {
  householdId: string;
  name?: string;
  description?: string;
  category?: string;
  photoUrls?: string[];
  existingLinks?: string[];
  barcode?: string;
  barcodeType?: string;
  language?: 'en' | 'vi';
}

/** Images sent to the model. More than this is cost without much gain. */
const MAX_PHOTOS = 4;
/** Candidate links we're willing to HTTP-check per request. */
const MAX_LINK_CHECKS = 6;
const LINK_TIMEOUT_MS = 6000;

/** Log a failure to the diagnostics table without ever blocking the response. */
async function logError(fn: string, status: number, body: string): Promise<void> {
  try {
    const baseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
    const sk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    await fetch(`${baseUrl}/rest/v1/edge_ai_errors`, {
      method: 'POST',
      headers: {
        apikey: sk,
        Authorization: `Bearer ${sk}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ fn, status, body }),
    });
  } catch {
    /* diagnostics are best-effort */
  }
}

/**
 * Is this URL actually reachable? A HEAD first (cheap), falling back to a
 * ranged GET because plenty of retail sites answer 405/403 to HEAD.
 * Anything that isn't a 2xx — or that times out — is treated as dead.
 */
async function linkIsAlive(url: string): Promise<boolean> {
  const attempt = async (method: 'HEAD' | 'GET'): Promise<number | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LINK_TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          // Bare fetches get blocked by a lot of storefronts.
          'User-Agent': 'Mozilla/5.0 (compatible; StuffSearchBot/1.0)',
          Accept: 'text/html,application/xhtml+xml,*/*',
          ...(method === 'GET' ? { Range: 'bytes=0-2048' } : {}),
        },
      });
      // Drain a GET body so the connection can be reused/closed cleanly.
      if (method === 'GET') await r.body?.cancel();
      return r.status;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const head = await attempt('HEAD');
  if (head !== null && head >= 200 && head < 300) return true;
  // 405/403/404-from-HEAD are all worth a second look via GET.
  const get = await attempt('GET');
  return get !== null && ((get >= 200 && get < 300) || get === 206);
}

/** Normalize + de-duplicate a list of candidate URLs. */
function cleanLinks(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    if (!/^https?:\/\//i.test(withScheme)) continue;
    if (!out.includes(withScheme)) out.push(withScheme);
  }
  return out;
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

  const { name, description, category, photoUrls, existingLinks, barcode, barcodeType, language } = body;
  const photos = (photoUrls ?? []).filter((u) => typeof u === 'string' && u.length > 0);
  const known = cleanLinks(existingLinks);
  if (!name && photos.length === 0 && !barcode) {
    return json({ error: 'Nothing to enrich from' }, 400);
  }

  const langName = language === 'vi' ? 'Vietnamese' : 'English';
  const systemPrompt = [
    'You are an inventory assistant. You are given hints about a single household item:',
    'photos, a barcode, and whatever the user has typed so far.',
    'Identify the item — READ THE PHOTOS CAREFULLY: brand names, model numbers, labels,',
    'size markings and visible condition are all evidence. If photos are provided, base your',
    'answer primarily on them.',
    '',
    'Respond ONLY with a JSON object, no prose, with these keys:',
    '  name           short product name (brand + model when visible)',
    '  category       one lowercase word',
    '  description    one or two sentences: what it is, key specs, visible condition',
    '  product_links  array of 0-3 URLs to pages where this product can be bought or read about.',
    '                 ONLY include URLs you are confident actually exist. A wrong URL is worse',
    '                 than none — prefer a retailer search URL or the manufacturer homepage over',
    '                 a guessed deep product path. Do NOT repeat links the user already has.',
    '  tags           array of 0-4 short lowercase labels useful for filtering',
    '  estimated_value  approximate current second-hand value as a NUMBER, no currency symbol',
    '  value_currency   ISO code for that number, e.g. USD',
    '',
    `Write name/description in ${langName}.`,
  ].join('\n');

  const userText = [
    name ? `Current name: ${name}` : null,
    description ? `Current description: ${description}` : null,
    category ? `Current category: ${category}` : null,
    barcode ? `Barcode (${barcodeType ?? 'unknown'}): ${barcode}` : null,
    known.length
      ? `Links the user already saved (do NOT repeat these, do NOT contradict them — they describe the same product):\n${known.map((l) => `  - ${l}`).join('\n')}`
      : null,
    photos.length ? `${photos.length} photo(s) attached.` : 'No photos attached.',
    'Suggest enriched fields.',
  ]
    .filter(Boolean)
    .join('\n');

  const content: unknown[] = [{ type: 'text', text: userText }];
  for (const url of photos.slice(0, MAX_PHOTOS)) {
    content.push({ type: 'image_url', image_url: { url } });
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
        max_tokens: 600,
        temperature: 0.3,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[enrich-item] OpenAI chat ${resp.status}: ${errText}`);
      await logError('enrich-item', resp.status, errText);
      return json({ error: `OpenAI error: ${resp.status}`, detail: errText }, 502);
    }
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(text) as Record<string, unknown>;

    // Collect candidate links (both shapes the model might use), drop anything
    // the user already has, then verify what's left.
    const candidates = cleanLinks([
      ...(Array.isArray(parsed.product_links) ? parsed.product_links : []),
      ...(typeof parsed.product_link === 'string' ? [parsed.product_link] : []),
    ]).filter((u) => !known.includes(u));

    const checked = await Promise.all(
      candidates.slice(0, MAX_LINK_CHECKS).map(async (url) => ({ url, alive: await linkIsAlive(url) })),
    );
    const product_links = checked.filter((c) => c.alive).map((c) => c.url);
    const rejected_links = checked.filter((c) => !c.alive).map((c) => c.url);

    const rawValue = parsed.estimated_value;
    const estimated_value =
      typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue >= 0
        ? Math.round(rawValue * 100) / 100
        : undefined;

    return json({
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      category: typeof parsed.category === 'string' ? parsed.category : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      product_links,
      rejected_links,
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.filter((x): x is string => typeof x === 'string').slice(0, 6)
        : undefined,
      estimated_value,
      value_currency:
        typeof parsed.value_currency === 'string' ? parsed.value_currency : undefined,
    });
  } catch (e) {
    return json({ error: 'Enrichment failed', detail: String(e) }, 500);
  }
});
