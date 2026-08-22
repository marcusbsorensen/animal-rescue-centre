export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // x-arc-session carries our own session token. It rides in its own header
  // rather than Authorization so the anon-key JWT stays where the platform
  // expects it — overriding Authorization with a non-JWT trips verify_jwt.
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-arc-session',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
