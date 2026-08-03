import {
  initMsal, graphRequest, isSignedIn, signIn, getAccount,
} from '../../shared/auth/msal-stub.js';

let _clientId, _tenantId, _lcName, _senderEmail, _cliffEmail, _supabaseUrl, _outreachRef;
try {
  const cfg  = await import('../config.js');
  _clientId    = cfg.MSAL_CLIENT_ID;
  _tenantId    = cfg.MSAL_TENANT_ID;
  _lcName      = cfg.LC_NAME      && !cfg.LC_NAME.startsWith('Your ')    ? cfg.LC_NAME      : null;
  _senderEmail = cfg.SENDER_EMAIL && !cfg.SENDER_EMAIL.startsWith('your-') ? cfg.SENDER_EMAIL : null;
  _cliffEmail  = cfg.CLIFF_EMAIL  && !cfg.CLIFF_EMAIL.startsWith('your-') ? cfg.CLIFF_EMAIL  : 'Cliff.Stephens@connecthearing.ca';
  _supabaseUrl = cfg.SUPABASE_URL ?? '';
  _outreachRef = cfg.OUTREACH_REF ?? 'NR';
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
    `My name is ${senderName} — I'm a WorkSafeBC certified Industrial Audiometric Technician (IAT) with Connect Hearing's Industrial Division. Connect Hearing is a recognized occupational hearing and fit test provider under WorkSafeBC, serving employers across BC and Alberta.`,
    '',
    `I'm reaching out to ${company.name} because companies in your sector frequently have workers exposed to elevated noise levels. Under WorkSafeBC OHS Regulation Part 7, employers are legally required to implement a hearing conservation program — including audiometric testing — when workers are regularly exposed to hazardous noise. That obligation falls on the employer, not the worker, and many businesses don't realize it applies to them until they receive a WorkSafeBC order.`,
    '',
    'Non-compliance can result in WorkSafeBC orders, financial penalties, and increased exposure to WCB hearing loss claims. A hearing conservation program protects your workers and demonstrates the due diligence that reduces that liability.',
    '',
    'Connect Hearing makes compliance straightforward. We come to your worksite, conduct the required testing, and provide the documentation you need — with no disruption to your operations.',
    '',
    'If this applies to your workplace, please reply to this email. Cliff Stephens, our Logistical Coordinator, will follow up to learn more about your situation and, if appropriate, arrange testing at a time that suits your team. There is no obligation from an initial conversation.',
    '',
    `You can also reach Cliff directly at ${_cliffEmail}.`,
    '',
    `${senderName}, IAT`,
    'Industrial Audiometric Technician',
    senderEmail,
    '',
    'Contact Us:',
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

/**
 * Create an LC report draft — list of phone-fork leads sent to Cliff.
 *
 * @param {object[]} leads - Array of company objects with email_fork === 'phone'
 * @param {object}   session - Supabase session
 * @returns {{ success, webLink?, fallback? }}
 */
export async function createLcReportDraft(leads, session) {
  const senderName  = _lcName ?? 'Norman Robichaud';
  const senderEmail = _senderEmail ?? session?.user?.email ?? '';
  const dateStr     = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const subject     = `Industrial Phone Leads — ${dateStr} | ref:${_outreachRef}`;

  const rows = leads.map(c => {
    const score = c.hazard_score ? `${c.hazard_score}/5` : '—';
    const naics = c.naics_reference?.descriptor
      ? `${c.naics_code} — ${c.naics_reference.descriptor.slice(0, 40)}`
      : (c.naics_code ?? '—');
    return `  • ${c.name} | ${c.province ?? '?'}${c.city ? ', ' + c.city : ''} | ${c.phone ?? 'no phone'} | ${naics} | Score: ${score}`;
  }).join('\n');

  const body = [
    `Hi Cliff,`,
    '',
    `Here are ${leads.length} industrial lead${leads.length !== 1 ? 's' : ''} identified through Lead Finder that don't have a discoverable public email address. These companies are in noise-hazard industries — good candidates for outreach by phone.`,
    '',
    rows,
    '',
    'These leads were pre-filtered for noise-hazard industries via Google Places and NAICS matching.',
    '',
    senderName,
    senderEmail,
    'Connect Hearing — Industrial Division',
  ].join('\n');

  const msalAvailable = tryInitMsal();

  if (msalAvailable) {
    try {
      if (!isSignedIn()) await signIn();

      const draft = await graphRequest('/messages', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          body: { contentType: 'Text', content: body },
          toRecipients: [{
            emailAddress: { address: _cliffEmail, name: 'Cliff Stephens' },
          }],
        }),
      });

      return { success: true, webLink: draft.webLink };
    } catch (err) {
      console.warn('Graph LC report failed, falling back to mailto:', err.message);
    }
  }

  const fallback = `mailto:${encodeURIComponent(_cliffEmail)}`
    + `?subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(body)}`;

  return { success: false, fallback };
}
