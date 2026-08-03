import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Authenticated endpoint — caller must be a signed-in app user.
// Given a company ID and its website URL, fetches the site (and common
// contact sub-pages), extracts a usable contact email, and writes the
// result back to companies.contact_email / companies.email_fork.
//
// Returns: { email: string | null }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BLOCKED_PREFIXES = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'bounce', 'postmaster', 'mailer-daemon', 'unsubscribe',
  'privacy', 'legal', 'abuse', 'spam',
];

// Lower index = higher preference
const PREFERRED_PREFIXES = [
  'contact', 'info', 'office', 'reception', 'admin', 'general',
  'enquiry', 'inquiry', 'hello', 'main', 'hr', 'health', 'safety',
  'manager', 'support',
];

const EMAIL_RE   = /\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/g;
const MAILTO_RE  = /href=['"]mailto:([^'"?&\s,]+)/gi;
const FETCH_TIMEOUT_MS = 8_000;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function isUsable(email: string): boolean {
  const local = email.split('@')[0].toLowerCase();
  return !BLOCKED_PREFIXES.some(p =>
    local === p || local.startsWith(p + '-') || local.startsWith(p + '_'),
  );
}

function scoreEmail(email: string): number {
  const local = email.split('@')[0].toLowerCase();
  const idx = PREFERRED_PREFIXES.indexOf(local);
  return idx >= 0 ? PREFERRED_PREFIXES.length - idx : 0;
}

function extractEmails(html: string): string[] {
  const found = new Set<string>();

  // Prefer explicit mailto: links first
  let m: RegExpExecArray | null;
  const mailtoRe = new RegExp(MAILTO_RE.source, 'gi');
  while ((m = mailtoRe.exec(html)) !== null) {
    found.add(m[1].toLowerCase());
  }

  // Fall back to raw email pattern in visible text / attributes
  const emailRe = new RegExp(EMAIL_RE.source, 'g');
  while ((m = emailRe.exec(html)) !== null) {
    found.add(m[1].toLowerCase());
  }

  return [...found].filter(isUsable).sort((a, b) => scoreEmail(b) - scoreEmail(a));
}

async function fetchHtml(url: string, signal: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ConnectHearingBot/1.0)' },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html') && !ct.includes('text/plain')) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function findContactEmail(websiteUrl: string): Promise<string | null> {
  let origin: string;
  try {
    origin = new URL(websiteUrl).origin;
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const urlsToTry = [
      websiteUrl,
      `${origin}/contact`,
      `${origin}/contact-us`,
      `${origin}/about`,
    ];

    for (const url of urlsToTry) {
      const html = await fetchHtml(url, controller.signal);
      if (!html) continue;
      const emails = extractEmails(html);
      if (emails.length > 0) return emails[0];
    }

    return null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  let companyId: string, websiteUrl: string;
  try {
    const body = await req.json();
    companyId  = body.companyId;
    websiteUrl = body.websiteUrl;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!companyId || !websiteUrl) {
    return json({ error: 'companyId and websiteUrl are required' }, 400);
  }

  const email = await findContactEmail(websiteUrl);

  const { error: updateError } = await supabase
    .from('companies')
    .update({
      contact_email: email ?? null,
      email_fork:    email ? 'email' : 'phone',
    })
    .eq('id', companyId);

  if (updateError) {
    return json({ error: 'DB update failed: ' + updateError.message }, 500);
  }

  return json({ email });
});
