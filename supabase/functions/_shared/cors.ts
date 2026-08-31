// Shared CORS headers for StuffSearch Edge Functions.
//
// Deliberately dependency-free. An earlier `getServiceClient()` helper here
// did `require('https://esm.sh/@supabase/supabase-js@2')`, which downloaded and
// transpiled the module on every cold start and blew the Edge Runtime CPU
// budget (HTTP 500 "EarlyDrop" in ~150ms). Every function talks to PostgREST
// directly via fetch instead; do not reintroduce a remote import here.
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
