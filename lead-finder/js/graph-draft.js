import {
  initMsal, graphRequest, isSignedIn, signIn, getAccount,
} from '../../shared/auth/msal-stub.js';

let _clientId, _tenantId, _lcName, _senderEmail, _cliffEmail, _supabaseUrl, _outreachRef, _lcReportKey;
try {
  const cfg  = await import('../config.js');
  _clientId    = cfg.MSAL_CLIENT_ID;
  _tenantId    = cfg.MSAL_TENANT_ID;
  _lcName      = cfg.LC_NAME        && !cfg.LC_NAME.startsWith('Your ')      ? cfg.LC_NAME      : null;
  _senderEmail = cfg.SENDER_EMAIL   && !cfg.SENDER_EMAIL.startsWith('your-') ? cfg.SENDER_EMAIL : null;
  _cliffEmail  = cfg.CLIFF_EMAIL    && !cfg.CLIFF_EMAIL.startsWith('your-')  ? cfg.CLIFF_EMAIL  : 'Cliff.Stephens@connecthearing.ca';
  _supabaseUrl = cfg.SUPABASE_URL   ?? '';
  _outreachRef = cfg.OUTREACH_REF   ?? 'NR';
  _lcReportKey = cfg.LC_REPORT_KEY  && !cfg.LC_REPORT_KEY.startsWith('your-') ? cfg.LC_REPORT_KEY : null;
} catch { /* config missing — mailto: fallback will be used */ }

let _msalReady = false;

function tryInitMsal() {
  if (_msalReady) return true;
  if (!_clientId || _clientId.startsWith('your-')) return false;
  try {
    initMsal({ clientId: _clientId, tenantId: _tenantId });
    _msalReady = true;
    return true;
  } catch { return false; }
}

async function loadTemplate() {
  const res = await fetch('./email-template.html');
  if (!res.ok) throw new Error('Email template not found');
  return res.text();
}

function merge(html, fields) {
  return Object.entries(fields).reduce(
    (t, [k, v]) => t.replaceAll(`{{${k}}}`, v ?? ''),
    html,
  );
}

/**
 * Create a draft email in Norman's Outlook via Microsoft Graph.
 * Reply-To is set to Cliff Stephens so all contact replies land with him.
 * Falls back to a mailto: link if Graph auth is unavailable.
 *
 * @param {object} params
 * @param {object} params.outreach  - { token, contact_email, contact_name }
 * @param {object} params.company   - { name }
 * @param {object} params.session   - Supabase session (for sender email)
 * @returns {{ success, draftId?, webLink?, fallback?, error? }}
 */
export async function createDraft({ outreach, company, session }) {
  const unsubscribeUrl = _supabaseUrl
    ? `${_supabaseUrl}/functions/v1/outreach-unsubscribe?t=${outreach.token}`
    : '';

  const msalAvailable = tryInitMsal();
  const account  = msalAvailable && isSignedIn() ? getAccount() : null;
  const senderName  = account?.name ?? _lcName ?? 'Norman Robichaud';
  const senderEmail = _senderEmail ?? session?.user?.email ?? '';

  const templateHtml = await loadTemplate().catch(() => null);
  const html = templateHtml ? merge(templateHtml, {
    CONTACT_NAME:    outreach.contact_name || 'there',
    COMPANY_NAME:    company.name,
    SENDER_NAME:     senderName,
    SENDER_EMAIL:    senderEmail,
    CLIFF_EMAIL:     _cliffEmail,
    UNSUBSCRIBE_URL: unsubscribeUrl,
    CURRENT_YEAR:    new Date().getFullYear().toString(),
  }) : null;

  const subject = `Workplace Hearing Conservation — ${company.name} | ref:${_outreachRef}`;

  // ---- Graph path --------------------------------------------------
  if (msalAvailable) {
    try {
      if (!isSignedIn()) await signIn();

      const draft = await graphRequest('/messages', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: [{
            emailAddress: {
              address: outreach.contact_email,
              name:    outreach.contact_name || '',
            },
          }],
          replyTo: [{
            emailAddress: {
              address: _cliffEmail,
              name:    'Cliff Stephens',
            },
          }],
        }),
      });

      return { success: true, draftId: draft.id, webLink: draft.webLink };
    } catch (err) {
      console.warn('Graph draft failed, falling back to mailto:', err.message);
    }
  }

  // ---- mailto: fallback -------------------------------------------
  const plainBody = [
    `Hi ${outreach.contact_name || 'there'},`,
    '',
    `My name is Norm Robichaud with Connect Hearing's Industrial Division — a recognized occupational health services provider under WorkSafeBC, serving employers across BC and Alberta.`,
    '',
    `I'm reaching out to ${company.name} because companies in your sector frequently employ workers exposed to elevated noise levels and airborne hazards. Under WorkSafeBC OHS Regulation Part 7, employers are legally required to implement a hearing conservation program — including regular audiometric testing — when workers are regularly exposed to hazardous noise. That obligation falls on the employer, not the worker, and many businesses don't realize it applies until they receive a WorkSafeBC order.`,
    '',
    'Non-compliance can result in WorkSafeBC orders, financial penalties, and increased exposure to WCB hearing loss claims. A hearing conservation program protects your workers and demonstrates the due diligence that reduces that liability.',
    '',
    'We offer the following on-site occupational health services to help you meet your obligations:',
    '',
    '  • Audiometric (hearing) testing',
    '  • Respirator fit testing',
    '  • Workplace noise audits',
    '',
    'Our team comes to your worksite, conducts the required testing, and provides the documentation you need — with no disruption to your operations.',
    '',
    'To find out whether your workplace requires these services, or to arrange a site visit, reply to this email or call our office at 1-800-663-2884.',
    '',
    'Connect Hearing — Industrial Division',
    '4420 28 Street, Vernon, BC V1T 7P5 | 1-800-663-2884',
    'ConnectHearing.ca/Workplace-Industrial-Division/',
    '',
    '---',
    `You are receiving this email because ${company.name} operates in a sector where workplace hearing regulations may apply, and your contact information was publicly listed (CASL implied B2B consent).`,
    unsubscribeUrl ? `To unsubscribe: ${unsubscribeUrl}` : null,
  ].filter(line => line != null).join('\n');

  const fallback = `mailto:${encodeURIComponent(outreach.contact_email)}`
    + `?subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(plainBody)}`;

  return { success: false, fallback };
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function csvToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

function buildCsv(leads) {
  const headers = ['Company', 'Address', 'City', 'Province', 'Phone', 'Website', 'NAICS Code', 'Industry', 'Hazard Score'];
  const rows = leads.map(c => [
    c.name,
    c.address                      ?? '',
    c.city                         ?? '',
    c.province                     ?? '',
    c.phone                        ?? '',
    c.website                      ?? '',
    c.naics_code                   ?? '',
    c.naics_reference?.descriptor  ?? '',
    c.hazard_score                 ?? '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  return [headers.map(h => `"${h}"`).join(','), ...rows].join('\r\n');
}

function buildReportHtml(leads, count, reportUrl) {
  const tableRows = leads.map((c, i) => {
    const bg       = i % 2 === 0 ? '#ffffff' : '#f9fafb';
    const location = [c.city, c.province].filter(Boolean).join(', ') || '—';
    const phone    = c.phone
      ? `<a href="tel:${escHtml(c.phone)}" style="color:#1f2937;text-decoration:none">${escHtml(c.phone)}</a>`
      : '—';
    const website  = c.website
      ? `<a href="${escHtml(c.website)}" style="color:#76B214">${escHtml(c.website.replace(/^https?:\/\//, ''))}</a>`
      : '—';
    return `<tr style="background:${bg}">
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb"><strong>${escHtml(c.name)}</strong></td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${escHtml(location)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${phone}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px">${website}</td>
    </tr>`;
  }).join('');

  const reportLinkBlock = reportUrl
    ? `<p style="margin:20px 0">
        <a href="${escHtml(reportUrl)}"
           style="display:inline-block;background:#76B214;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600">
          View Interactive Lead List &rarr;
        </a>
        <span style="display:block;margin-top:6px;font-size:11px;color:#9ca3af">
          Sortable table &middot; tap-to-call on mobile &middot; print-friendly
        </span>
      </p>`
    : '';

  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:700px">
    <p>Hi Cliff,</p>
    <p>Here are <strong>${count} lead${count !== 1 ? 's' : ''}</strong> from Lead Finder for phone outreach. These companies have no discoverable public email — all are in noise-hazard industries. A complete data file is attached.</p>
    ${reportLinkBlock}
    <table style="border-collapse:collapse;width:100%;margin:20px 0;font-size:13px">
      <thead>
        <tr style="background:#76B214;color:#ffffff">
          <th style="padding:9px 12px;text-align:left;font-weight:600">Company</th>
          <th style="padding:9px 12px;text-align:left;font-weight:600">Location</th>
          <th style="padding:9px 12px;text-align:left;font-weight:600">Phone</th>
          <th style="padding:9px 12px;text-align:left;font-weight:600">Website</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    <p style="color:#9ca3af;font-size:11px;margin-top:24px">
      Generated by Lead Finder &nbsp;&middot;&nbsp; Connect Hearing Industrial Division
    </p>
  </div>`;
}

/**
 * Create an LC report draft — formatted HTML email to Cliff with a CSV attachment.
 * Falls back to plain-text mailto: + returns a CSV blob for manual download.
 *
 * @param {object[]} leads   - Phone-fork companies
 * @param {object}   session - Supabase session
 * @returns {{ success, webLink?, fallback?, csvBlob?, csvFilename? }}
 */
export async function createLcReportDraft(leads, session) {
  const now         = new Date();
  const dateStr     = now.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const fileDateStr = now.toISOString().slice(0, 10);
  const subject     = `Industrial Phone Leads — ${dateStr} | ref:${_outreachRef}`;
  const filename    = `Connect_Hearing_Leads_${fileDateStr}.csv`;

  const reportUrl = (_supabaseUrl && _lcReportKey)
    ? `${_supabaseUrl}/functions/v1/lc-report?key=${encodeURIComponent(_lcReportKey)}`
    : null;

  const csv      = buildCsv(leads);
  const htmlBody = buildReportHtml(leads, leads.length, reportUrl);

  const msalAvailable = tryInitMsal();

  if (msalAvailable) {
    try {
      if (!isSignedIn()) await signIn();

      const draft = await graphRequest('/messages', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          body: { contentType: 'HTML', content: htmlBody },
          toRecipients: [{
            emailAddress: { address: _cliffEmail, name: 'Cliff Stephens' },
          }],
          attachments: [{
            '@odata.type': '#microsoft.graph.fileAttachment',
            name:          filename,
            contentType:   'text/csv',
            contentBytes:  csvToBase64(csv),
          }],
        }),
      });

      return { success: true, webLink: draft.webLink };
    } catch (err) {
      console.warn('Graph LC report failed, falling back to mailto:', err.message);
    }
  }

  // ---- mailto: fallback (no attachment possible) --------------
  const plainRows = leads.map(c => {
    const location = [c.city, c.province].filter(Boolean).join(', ') || '—';
    return `  • ${c.name} | ${location} | ${c.phone ?? 'no phone'}${c.website ? ' | ' + c.website : ''}`;
  }).join('\n');

  const plainBody = [
    'Hi Cliff,',
    '',
    `Here are ${leads.length} lead${leads.length !== 1 ? 's' : ''} from Lead Finder for phone outreach. These companies have no discoverable public email — all are in noise-hazard industries.`,
    '',
    reportUrl ? `Interactive lead list (sortable, tap-to-call): ${reportUrl}` : null,
    reportUrl ? '' : null,
    plainRows,
    '',
    'Generated by Lead Finder · Connect Hearing Industrial Division',
  ].filter(line => line != null).join('\n');

  const fallback = `mailto:${encodeURIComponent(_cliffEmail)}`
    + `?subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(plainBody)}`;

  return {
    success:     false,
    fallback,
    csvBlob:     new Blob([csv], { type: 'text/csv' }),
    csvFilename: filename,
  };
}
