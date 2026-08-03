import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'content-type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(req.url);

  const expectedKey = Deno.env.get('LC_REPORT_KEY');
  if (!expectedKey) {
    return json({ error: 'Server misconfigured: LC_REPORT_KEY not set.' }, 500);
  }
  if (url.searchParams.get('key') !== expectedKey) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: leads, error } = await supabase
    .from('companies')
    .select('name, address, city, province, phone, website')
    .eq('email_fork', 'phone')
    .order('name');

  if (error) {
    return json({ error: error.message }, 500);
  }

  return json(leads ?? []);
});
