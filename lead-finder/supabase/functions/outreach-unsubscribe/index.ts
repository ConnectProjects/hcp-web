import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Public endpoint — no auth required. Rate-limited by IP.
// GET  ?t=TOKEN  — unsubscribes and returns an HTML confirmation page (email link clicks)
// POST { token } — unsubscribes and returns JSON { success: true }
//
// Always returns 200-equivalent regardless of token validity to prevent enumeration.

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

function htmlPage(title: string, body: string): Response {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
    <style>
      body{font-family:Arial,sans-serif;max-width:520px;margin:80px auto;padding:0 20px;color:#374151;text-align:center}
      h1{color:#1f2937;font-size:22px;margin-bottom:12px}
      p{font-size:15px;color:#6b7280;line-height:1.6}
      .logo{color:#76B214;font-weight:700;font-size:18px;margin-bottom:32px}
    </style></head>
    <body><div class="logo">Connect Hearing — Industrial Division</div>${body}</body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const isGet  = req.method === 'GET';
  const isPost = req.method === 'POST';
  if (!isGet && !isPost) return json({ error: 'Method not allowed' }, 405);

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
  if (rlErr || !allowed) {
    return isGet
      ? htmlPage('Too many requests', '<h1>Too many requests</h1><p>Please try again in a moment.</p>')
      : json({ error: 'Too many requests' }, 429);
  }

  // Extract token — query param for GET, body for POST
  let token: string | undefined;
  if (isGet) {
    token = new URL(req.url).searchParams.get('t') ?? undefined;
  } else {
    try {
      const body = await req.json();
      token = body?.token;
    } catch { /* fall through */ }
  }

  const confirmPage = htmlPage(
    'Unsubscribed — Connect Hearing',
    `<h1>You have been unsubscribed.</h1>
     <p>Your email address has been removed from Connect Hearing Industrial Division's
     outreach list. You will not receive further emails from us.</p>
     <p style="font-size:13px;margin-top:32px;color:#9ca3af">
       If you unsubscribed by mistake, contact us at
       <a href="mailto:Cliff.Stephens@connecthearing.ca" style="color:#76B214">
         Cliff.Stephens@connecthearing.ca</a>.
     </p>`,
  );

  // Return success for invalid/missing tokens — prevent enumeration
  if (!token || !UUID_RE.test(token)) {
    return isGet ? confirmPage : json({ success: true });
  }

  // Look up company via outreach token
  const { data: outreach } = await service
    .from('outreach')
    .select('company_id')
    .eq('token', token)
    .single();

  if (outreach?.company_id) {
    await service
      .from('companies')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('id', outreach.company_id)
      .is('unsubscribed_at', null);
  }

  // Purge old rate-limit rows (fire and forget)
  service
    .from('edge_rate_limit')
    .delete()
    .lt('window_start', new Date(Date.now() - 3_600_000).toISOString())
    .then(() => {});

  return isGet ? confirmPage : json({ success: true });
});
