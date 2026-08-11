// Shared CORS headers for StuffSearch Edge Functions.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Read the Supabase service client lazily (auto-injected env). */
export function getServiceClient() {
  // We import inside the function so each function is self-contained.
  // Supabase auto-injects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
  const { createClient } = require('https://esm.sh/@supabase/supabase-js@2');
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}
