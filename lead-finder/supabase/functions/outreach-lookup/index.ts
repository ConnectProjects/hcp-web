import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Public endpoint — no auth required. Rate-limited by IP.
// Returns only { company_name, already_responded }; stamps first_opened_at on first call.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
};

const MAX_HITS_PER_MINUTE = 20;

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

  // Rate limit — 20 requests per IP per minute
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
    return json({ error: 'Invalid request' }, 400);
  }

  if (!token || !UUID_RE.test(token)) {
    return json({ error: 'Invalid request' }, 400);
  }

  // Look up outreach record — select only what the response page needs
  const { data: row, error: fetchErr } = await service
    .from('outreach')
    .select('id, first_opened_at, responded_at, companies(name)')
    .eq('token', token)
    .single();

  if (fetchErr || !row) {
    // Generic message: don't reveal whether the token ever existed
    return json({ error: 'Not found' }, 404);
  }

  // Stamp first_opened_at on the initial visit (non-blocking; best-effort)
  if (!row.first_opened_at) {
    service
      .from('outreach')
      .update({ first_opened_at: new Date().toISOString() })
      .eq('id', row.id)
      .then(() => {});
  }

  // Purge rate-limit rows older than 1 hour (best-effort; fire and forget)
  service
    .from('edge_rate_limit')
    .delete()
    .lt('window_start', new Date(Date.now() - 3_600_000).toISOString())
    .then(() => {});

  return json({
    company_name: (row.companies as { name: string } | null)?.name ?? '',
    already_responded: row.responded_at !== null,
  });
});
