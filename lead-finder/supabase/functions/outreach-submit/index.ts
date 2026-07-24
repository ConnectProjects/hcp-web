import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Public endpoint — no auth required. Rate-limited by IP.
// Validates token, inserts outreach_response, stamps responded_at.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
};

const MAX_HITS_PER_MINUTE = 10; // stricter than lookup — this is a write

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Values accepted for last_tested — must match the form options in respond/index.html
const VALID_LAST_TESTED = new Set([
  'never',
  'within_a_year',
  'one_to_three_years',
  'more_than_three_years',
  'not_sure',
]);

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function cap(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, maxLen);
  return trimmed || null;
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

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const {
    token,
    noise_exposure,
    employee_count,
    last_tested,
    preferred_contact,
    preferred_time,
    notes,
  } = body;

  if (!token || !UUID_RE.test(String(token))) {
    return json({ error: 'Invalid request' }, 400);
  }

  // Validate and sanitize free-text + enum fields
  const payload = {
    noise_exposure:
      typeof noise_exposure === 'boolean' ? noise_exposure : null,
    employee_count:
      typeof employee_count === 'number' &&
      Number.isInteger(employee_count) &&
      employee_count > 0 &&
      employee_count <= 100_000
        ? employee_count
        : null,
    last_tested:
      typeof last_tested === 'string' && VALID_LAST_TESTED.has(last_tested)
        ? last_tested
        : null,
    preferred_contact: cap(preferred_contact, 200),
    preferred_time: cap(preferred_time, 200),
    notes: cap(notes, 1000),
  };

  // Fetch outreach record — check existence and idempotency
  const { data: outreach, error: fetchErr } = await service
    .from('outreach')
    .select('id, responded_at')
    .eq('token', String(token))
    .single();

  if (fetchErr || !outreach) {
    // Generic: don't reveal whether token exists
    return json({ error: 'Not found' }, 404);
  }

  if (outreach.responded_at) {
    return json({ error: 'Already submitted' }, 409);
  }

  // Insert response row
  const { error: insertErr } = await service
    .from('outreach_response')
    .insert({ outreach_id: outreach.id, ...payload });

  if (insertErr) {
    console.error('outreach_response insert failed:', insertErr);
    return json({ error: 'Submission failed' }, 500);
  }

  // Stamp responded_at on the parent outreach row
  const { error: updateErr } = await service
    .from('outreach')
    .update({ responded_at: new Date().toISOString() })
    .eq('id', outreach.id);

  if (updateErr) {
    // Response was recorded but the timestamp didn't set.
    // Log it — the data isn't lost, just the timestamp.
    console.error('responded_at update failed:', updateErr);
  }

  // Purge old rate-limit rows (best-effort; fire and forget)
  service
    .from('edge_rate_limit')
    .delete()
    .lt('window_start', new Date(Date.now() - 3_600_000).toISOString())
    .then(() => {});

  return json({ success: true });
});
