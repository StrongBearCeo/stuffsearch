// product-lookup: EAN/UPC → product DB (Open Food Facts / UPCitemdb).
// Provider controlled by PRODUCT_LOOKUP_PROVIDER secret: 'off' | 'off' | 'upcitemdb'.
import { json, corsHeaders } from '../_shared/cors.ts';

interface LookupRequest {
  code: string;
  type?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const provider = Deno.env.get('PRODUCT_LOOKUP_PROVIDER') ?? 'off';
  if (provider === 'off' || !provider) {
    return json({ error: 'product lookup disabled (PRODUCT_LOOKUP_PROVIDER=off)' }, 501);
  }

  let body: LookupRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const { code } = body;
  if (!code) return json({ error: 'code required' }, 400);

  try {
    if (provider === 'upcitemdb') {
      return await lookupUpcitemdb(code);
    }
    // Default: Open Food Facts (free, no key).
    return await lookupOff(code);
  } catch (e) {
    return json({ error: 'lookup failed', detail: String(e) }, 502);
  }
});

async function lookupOff(code: string): Promise<Response> {
  const resp = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
  if (!resp.ok) return json({ error: `OFF ${resp.status}` }, 502);
  const d = await resp.json();
  if (d.status !== 1 || !d.product) return json({}); // not found → empty
  const p = d.product;
  return json({
    name: p.product_name || p.generic_name || undefined,
    category: p.categories_tags?.[0]?.replace(/^[^:]*:/, '') || p.categories || undefined,
    description: p.generic_name || undefined,
    image_url: p.image_front_url || p.image_url || undefined,
    product_link: `https://world.openfoodfacts.org/product/${code}`,
  });
}

async function lookupUpcitemdb(code: string): Promise<Response> {
  const key = Deno.env.get('UPCITEMDB_API_KEY');
  const headers: Record<string, string> = key ? { Authorization: `Bearer ${key}` } : {};
  const resp = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?barcode=${code}`, { headers });
  if (!resp.ok) return json({ error: `UPCitemdb ${resp.status}` }, 502);
  const d = await resp.json();
  const item = d.items?.[0];
  if (!item) return json({});
  return json({
    name: item.title || undefined,
    category: item.category || undefined,
    description: item.description || undefined,
    image_url: item.images?.[0] || undefined,
    product_link: item.offer?.[0]?.link || undefined,
  });
}
