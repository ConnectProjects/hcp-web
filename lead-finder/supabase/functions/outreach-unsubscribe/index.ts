import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Public endpoint — no auth required. Rate-limited by IP.
// Resolves token → company and sets companies.unsubscribed_at (idempotent).
// Always returns { success: true } regardless of token validity to prevent enumeration.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
};

const MAX_HITS_PER_MINUTE = 10;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  const service = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Rate limit — 10 requests per IP per minute
  const window = new Date();
  window.setSeconds(0, 0);

  const { data: allowed, error: rlErr } = await service.rpc(
    'check_rate_limit',
    { p_ip: ip, p_window: window.toISOString(), p_max: MAX_HITS_PER_MINUTE },
  );
  if (rlErr || !allowed) return json({ error: 'Too many requests' }, 429);

  // Parse and validate token
  let token: string | undefined;
  try {
    const body = await req.json();
    token = body?.token;
  } catch {
    // Fall through — return success regardless (prevent enumeration via error codes)
  }

  // Return success immediately for invalid/missing tokens.
  // The legitimate recipient always has a valid token from the email.
  if (!token || !UUID_RE.test(token)) {
    return json({ success: true });
  }

  // Look up company via outreach token
  const { data: outreach } = await service
    .from('outreach')
    .select('company_id')
    .eq('token', token)
    .single();

  if (outreach?.company_id) {
    // Idempotent: only set if not already set (CASL: honour without overwriting timestamp)
    await service
      .from('companies')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('id', outreach.company_id)
      .is('unsubscribed_at', null);
  }

  // Purge old rate-limit rows (best-effort; fire and forget)
  service
    .from('edge_rate_limit')
    .delete()
    .lt('window_start', new Date(Date.now() - 3_600_000).toISOString())
    .then(() => {});

  // Always return success — don't reveal token validity
  return json({ success: true });
});
