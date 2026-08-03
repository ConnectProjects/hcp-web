import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface Company {
  name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  website: string | null;
}

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(leads: Company[]): string {
  const now = new Date().toLocaleDateString('en-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Vancouver',
  });

  const rows = leads.map((c) => {
    const location = [c.city, c.province].filter(Boolean).join(', ') || '—';
    const phone = c.phone
      ? `<a href="tel:${esc(c.phone)}" class="phone">${esc(c.phone)}</a>`
      : '<span class="empty">—</span>';
    const website = c.website
      ? `<a href="${esc(c.website)}" target="_blank" rel="noopener" class="web">${esc(c.website.replace(/^https?:\/\//, ''))}</a>`
      : '<span class="empty">—</span>';
    return `<tr>
      <td>${esc(c.name)}</td>
      <td>${esc(location)}</td>
      <td>${phone}</td>
      <td>${website}</td>
    </tr>`;
  }).join('');

  const count = leads.length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connect Hearing — Phone Leads</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, sans-serif; font-size: 14px; color: #1f2937; background: #f4f4f4; }
  .header { background: #76B214; color: #fff; padding: 20px 32px; }
  .header h1 { margin: 0; font-size: 20px; }
  .header p  { margin: 4px 0 0; font-size: 13px; opacity: .8; }
  .meta { padding: 14px 32px; background: #fff; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .badge { background: #76B214; color: #fff; border-radius: 20px; padding: 3px 13px; font-size: 13px; font-weight: 600; }
  .date  { color: #6b7280; font-size: 13px; }
  .hint  { color: #9ca3af; font-size: 12px; margin-left: auto; }
  .wrap  { padding: 24px 32px; }
  table  { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  th { background: #76B214; color: #fff; padding: 10px 14px; text-align: left; font-size: 13px; cursor: pointer; user-select: none; white-space: nowrap; }
  th:hover { background: #5a8a0f; }
  th .si { opacity: .5; margin-left: 5px; font-size: 10px; }
  th.asc  .si::after { content: '▲'; opacity: 1; }
  th.desc .si::after { content: '▼'; opacity: 1; }
  th .si::after { content: '⇅'; }
  td { padding: 9px 14px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #f9fafb; }
  tr:hover td { background: #f0fdf4; }
  a.phone { color: #1f2937; text-decoration: none; font-weight: 500; }
  a.phone:hover { color: #76B214; }
  a.web { color: #76B214; font-size: 12px; word-break: break-all; }
  .empty { color: #d1d5db; }
  .no-leads { text-align: center; padding: 48px 24px; color: #9ca3af; }
  @media (max-width: 640px) {
    .header { padding: 16px 16px; }
    .meta   { padding: 12px 16px; }
    .wrap   { padding: 12px; }
    .hint   { display: none; }
    th, td  { padding: 8px 10px; font-size: 13px; }
    a.web   { font-size: 11px; }
  }
  @media print {
    body { background: #fff; }
    .header { background: #76B214 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th { background: #76B214 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    a { color: inherit !important; text-decoration: none !important; }
    tr:hover td { background: inherit !important; }
    .hint { display: none; }
  }
</style>
</head>
<body>
<div class="header">
  <h1>Connect Hearing — Industrial Division</h1>
  <p>Phone Leads &mdash; for LC follow-up</p>
</div>
<div class="meta">
  <span class="badge">${count} lead${count !== 1 ? 's' : ''}</span>
  <span class="date">Generated ${now}</span>
  <span class="hint">Click a column header to sort &nbsp;&middot;&nbsp; Tap a phone number to call</span>
</div>
<div class="wrap">
${count === 0 ? '<div class="no-leads">No phone leads found.</div>' : `
  <table id="leads">
    <thead>
      <tr>
        <th data-col="0">Company <span class="si"></span></th>
        <th data-col="1">Location <span class="si"></span></th>
        <th data-col="2">Phone <span class="si"></span></th>
        <th data-col="3">Website <span class="si"></span></th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`}
</div>
<script>
  const ths = document.querySelectorAll('th[data-col]');
  let sc = -1, asc = true;
  ths.forEach(th => th.addEventListener('click', () => {
    const col = +th.dataset.col;
    if (sc === col) asc = !asc; else { sc = col; asc = true; }
    ths.forEach(t => t.classList.remove('asc','desc'));
    th.classList.add(asc ? 'asc' : 'desc');
    const tbody = document.querySelector('#leads tbody');
    const rows  = Array.from(tbody.rows);
    rows.sort((a, b) => {
      const av = a.cells[col].textContent.trim();
      const bv = b.cells[col].textContent.trim();
      return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    rows.forEach(r => tbody.appendChild(r));
  }));
</script>
</body>
</html>`;
}

const HTML_HEADERS = new Headers({ 'content-type': 'text/html; charset=utf-8' });

function html401(): Response {
  return new Response(
    `<!DOCTYPE html><html lang="en"><body style="font-family:Arial,sans-serif;padding:48px;text-align:center">
    <h2 style="color:#dc2626">Access Denied</h2>
    <p style="color:#6b7280">Invalid or missing access key.</p></body></html>`,
    { status: 401, headers: HTML_HEADERS },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  const expectedKey = Deno.env.get('LC_REPORT_KEY');
  if (!expectedKey) {
    return new Response(
      'Server misconfigured: LC_REPORT_KEY is not set as a Supabase secret.',
      { status: 500, headers: HTML_HEADERS },
    );
  }
  if (url.searchParams.get('key') !== expectedKey) {
    return html401();
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
    return new Response('Database error: ' + error.message, { status: 500, headers: HTML_HEADERS });
  }

  return new Response(buildHtml(leads ?? []), { status: 200, headers: HTML_HEADERS });
});
