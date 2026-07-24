// respond/app.js — standalone public page, no app imports.

const FN_BASE  = document.body.dataset.fnBase;
const params   = new URLSearchParams(window.location.search);
const TOKEN    = params.get('t') ?? '';
const ACTION   = params.get('action') ?? '';
const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function show(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

async function post(endpoint, body) {
  const res = await fetch(`${FN_BASE}/${endpoint}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

// ---- Boot ---------------------------------------------------

if (!TOKEN || !UUID_RE.test(TOKEN)) {
  show('view-invalid');
} else if (ACTION === 'unsubscribe') {
  await bootUnsubscribe();
} else {
  await bootForm();
}

// ---- Unsubscribe flow ---------------------------------------

async function bootUnsubscribe() {
  // Look up company name so the confirmation screen is specific
  const { status, data } = await post('outreach-lookup', { token: TOKEN });

  const companyName = (status === 200 && data.company_name) ? data.company_name : '';
  document.getElementById('unsub-company').textContent =
    companyName || 'your organisation';

  show('view-unsub');

  document.getElementById('unsub-confirm-btn').addEventListener('click', async () => {
    const btn = document.getElementById('unsub-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'Unsubscribing…';

    const { status: s } = await post('outreach-unsubscribe', { token: TOKEN });

    if (s === 200 || s === 429) {
      // 429 = rate limited but still return success UX (user has the real link)
      // The Edge Function always returns 200 for valid/invalid tokens — any
      // non-5xx here means the request was processed.
      show('view-unsub-done');
    } else {
      const err = document.getElementById('unsub-error');
      err.textContent = 'Something went wrong. Please try again or contact us directly.';
      err.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Confirm unsubscribe';
    }
  });
}

// ---- Response form flow -------------------------------------

async function bootForm() {
  const { status, data } = await post('outreach-lookup', { token: TOKEN });

  if (status === 404) { show('view-invalid'); return; }
  if (status === 429) { show('view-invalid'); return; } // rate limited
  if (status !== 200) { show('view-invalid'); return; }

  if (data.already_responded) { show('view-done'); return; }

  document.getElementById('form-company-intro').textContent =
    `Sent on behalf of ${data.company_name || 'your company'} — takes about 90 seconds.`;

  show('view-form');
  wireForm(data.company_name);
}

function wireForm(companyName) {
  const form = document.getElementById('response-form');

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const errEl  = document.getElementById('form-error');
    const submitBtn = document.getElementById('submit-btn');
    errEl.classList.add('hidden');

    // Validate required fields
    const noiseVal = form.querySelector('input[name=noise_exposure]:checked')?.value;
    if (!noiseVal) {
      errEl.textContent = 'Please answer question 1 (noise exposure).';
      errEl.classList.remove('hidden');
      return;
    }

    const countVal = form.querySelector('input[name=employee_count]:checked')?.value;
    if (!countVal) {
      errEl.textContent = 'Please answer question 2 (number of workers).';
      errEl.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    const noiseMap = { yes: true, no: false, not_sure: null };

    const payload = {
      token:             TOKEN,
      noise_exposure:    noiseMap[noiseVal] ?? null,
      employee_count:    parseInt(countVal) || null,
      last_tested:       form.querySelector('[name=last_tested]')?.value || null,
      preferred_contact: (form.querySelector('[name=preferred_contact]')?.value ?? '').trim().slice(0, 200) || null,
      preferred_time:    (form.querySelector('[name=preferred_time]')?.value ?? '').trim().slice(0, 200) || null,
      notes:             (form.querySelector('[name=notes]')?.value ?? '').trim().slice(0, 1000) || null,
    };

    const { status, data } = await post('outreach-submit', payload);

    if (status === 200 && data.success) {
      document.getElementById('success-msg').textContent =
        `Your response for ${companyName || 'your company'} has been received.`;
      show('view-success');
      return;
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';

    if (status === 409) {
      show('view-done');
      return;
    }

    if (status === 429) {
      errEl.textContent = 'Too many requests — please wait a moment and try again.';
    } else {
      errEl.textContent = data?.error ?? 'Submission failed. Please try again.';
    }
    errEl.classList.remove('hidden');
  });
}
