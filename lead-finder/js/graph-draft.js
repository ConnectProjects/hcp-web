import {
  initMsal, graphRequest, isSignedIn, signIn, getAccount,
} from '../../shared/auth/msal-stub.js';

// MSAL_CLIENT_ID / MSAL_TENANT_ID may be absent in configs that haven't
// been updated yet — we check before initialising and fall straight to
// mailto: if they're missing.
let _clientId, _tenantId;
try {
  const cfg = await import('../config.js');
  _clientId = cfg.MSAL_CLIENT_ID;
  _tenantId  = cfg.MSAL_TENANT_ID;
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
  // fetch() resolves relative to the page URL, so ./email-template.html
  // correctly maps to lead-finder/email-template.html from any dashboard page.
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
 * Create a draft email in the LC's Outlook via Microsoft Graph.
 * Falls back to a mailto: link if Graph auth is unavailable.
 *
 * @param {object} params
 * @param {object} params.outreach  - { token, contact_email, contact_name }
 * @param {object} params.company   - { name }
 * @param {object} params.session   - Supabase session (for LC email)
 * @returns {{ success, draftId?, webLink?, fallback?, error? }}
 */
export async function createDraft({ outreach, company, session }) {
  // Build response and unsubscribe URLs from the current page location
  const here     = window.location.href;
  const dirUrl   = here.substring(0, here.lastIndexOf('/') + 1);
  const respondBase = dirUrl + 'respond/';
  const responseUrl    = `${respondBase}?t=${outreach.token}`;
  const unsubscribeUrl = `${respondBase}?t=${outreach.token}&action=unsubscribe`;

  const msalAvailable = tryInitMsal();
  const account = msalAvailable && isSignedIn() ? getAccount() : null;
  const lcName  = account?.name ?? session?.user?.email ?? 'Your Connect Hearing Representative';
  const lcEmail = session?.user?.email ?? '';

  const templateHtml = await loadTemplate().catch(() => null);
  const html = templateHtml ? merge(templateHtml, {
    CONTACT_NAME:    outreach.contact_name || 'there',
    COMPANY_NAME:    company.name,
    LC_NAME:         lcName,
    LC_EMAIL:        lcEmail,
    RESPONSE_URL:    responseUrl,
    UNSUBSCRIBE_URL: unsubscribeUrl,
    CURRENT_YEAR:    new Date().getFullYear().toString(),
  }) : null;

  const subject = `Workplace Hearing Conservation — ${company.name}`;

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
        }),
      });

      return { success: true, draftId: draft.id, webLink: draft.webLink };
    } catch (err) {
      // Graph failed — fall through to mailto:
      console.warn('Graph draft failed, falling back to mailto:', err.message);
    }
  }

  // ---- mailto: fallback -------------------------------------------
  const plainBody = [
    `Hi ${outreach.contact_name || 'there'},`,
    '',
    `I'm ${lcName} with Connect Hearing's Industrial Division. I'm reaching out because`,
    'BC and Alberta employers are required under WorkSafeBC regulations and Alberta OHS',
    'Part 16 to arrange regular hearing tests for workers exposed to elevated noise —',
    'and many businesses aren\'t aware the obligation falls on them.',
    '',
    'I\'d like to ask you four quick questions (about 90 seconds) to see whether this',
    'applies to your workplace. There\'s no obligation — we just want to help you',
    'understand where you stand.',
    '',
    'Please click the link below to complete the form:',
    '',
    responseUrl,
    '',
    'If you have questions, reply to this email or call me directly.',
    '',
    lcName,
    'Connect Hearing — Industrial Division',
    lcEmail,
    '',
    '---',
    'You received this email because you gave verbal consent during a recent phone call.',
    'To unsubscribe from future emails, click here:',
    unsubscribeUrl,
    'Connect Hearing | Industrial Division | 4420 28 St, Vernon, BC V1T 7P5',
  ].join('\n');

  const fallback = `mailto:${encodeURIComponent(outreach.contact_email)}`
    + `?subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(plainBody)}`;

  return { success: false, fallback };
}
