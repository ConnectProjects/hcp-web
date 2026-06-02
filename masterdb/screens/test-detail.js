import { getTestById } from '../db/tests.js'

export function renderTestDetail(container, state, navigate) {
  const testId = state.params?.id;
  const t = getTestById(testId);

  if (!t) {
    container.innerHTML = `<div class="page"><p>Test record not found.</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div class="breadcrumb">
          <button class="btn btn-link" id="btn-back-to-emp">${esc(t.last_name)}, ${esc(t.first_name)}</button>
          <span>›</span>
          <span>Test Details</span>
        </div>
        <button class="btn btn-outline btn-sm" onclick="window.print()">Print Report</button>
      </div>

      <div class="test-setting-box" style="background:#76B214; color:white; padding:20px; border-radius:8px; display:grid; grid-template-columns:repeat(3, 1fr); gap:15px; margin-bottom:20px;">
        <div><label style="font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.8;">Company</label><div style="font-weight:600;">${esc(t.company_name)}</div></div>
        <div><label style="font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.8;">Location</label><div style="font-weight:600;">${esc(t.location_name)} (${t.province})</div></div>
        <div><label style="font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.8;">Test Date</label><div style="font-weight:600;">${t.test_date}</div></div>
      </div>

      <div class="settings-sections" style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
        
        <section class="form-card" style="grid-column: span 2;">
            <h2>Audiogram</h2>
            <div style="display:flex; gap:40px; justify-content: space-around;">
                <div style="flex:1; text-align:center;">
                    <strong style="color:#0056b3">LEFT EAR</strong>
                    <div style="height:250px; border:1px solid #eee; margin-top:10px;">${renderStaticSVG('L', t)}</div>
                </div>
                <div style="flex:1; text-align:center;">
                    <strong style="color:#d9534f">RIGHT EAR</strong>
                    <div style="height:250px; border:1px solid #eee; margin-top:10px;">${renderStaticSVG('R', t)}</div>
                </div>
            </div>
        </section>

        <section class="form-card">
            <h2>Classification</h2>
            <div class="meta-row">
                <span class="class-badge class-${(t.classification || '').toLowerCase()}">${t.classification || 'N'}</span>
                <span style="font-weight:600; margin-left:10px;">${t.test_type}</span>
            </div>
            <p style="margin-top:15px; font-size:13px; color:#666;">${esc(t.counsel_text) || 'No counseling notes recorded.'}</p>
        </section>

        <section class="form-card">
            <h2>Equipment & Notes</h2>
            <div class="info-item"><label>HPD Used:</label> <span>${esc(t.hpd_make_model) || 'None'}</span></div>
            <div class="info-item"><label>Adequacy:</label> <span>${t.adequacy || 'N/A'}</span></div>
            <div style="margin-top:15px; border-top:1px solid #eee; padding-top:10px;">
                <label style="font-size:11px; font-weight:bold; color:#999;">TECHNICIAN NOTES</label>
                <p style="font-size:13px; font-style:italic;">${esc(t.tech_notes) || 'No notes.'}</p>
            </div>
        </section>

      </div>
    </div>
  `;

  container.querySelector('#btn-back-to-emp').onclick = () => navigate('employee-detail', { id: t.employee_id });
}

function renderStaticSVG(ear, t) {
    const freqs = [500, 1000, 2000, 3000, 4000, 6000, 8000];
    const points = [];
    let markers = '';

    freqs.forEach((f, i) => {
        const dbKey = f >= 1000 ? (f/1000) + 'k' : f;
        const val = t[(ear === 'L' ? 'left_' : 'right_') + dbKey];
        if (val !== null && val !== undefined) {
            const x = 40 + (i * 40);
            const y = 40 + ((parseInt(val) + 10) * 2);
            points.push(`${x},${y}`);
            if (ear === 'L') {
                markers += `<g stroke="#0056b3" stroke-width="2"><line x1="${x-4}" y1="${y-4}" x2="${x+4}" y2="${y+4}" /><line x1="${x+4}" y1="${y-4}" x2="${x-4}" y2="${y+4}" /></g>`;
            } else {
                markers += `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#d9534f" stroke-width="2" />`;
            }
        }
    });

    return `
    <svg viewBox="0 0 300 240" style="width:100%; height:100%;">
        <rect x="40" y="40" width="240" height="70" fill="#76B214" opacity="0.1" />
        <g stroke="#eee" stroke-width="1">
            ${freqs.map((f, i) => `<line x1="${40+(i*40)}" y1="20" x2="${40+(i*40)}" y2="220" />`).join('')}
            ${[-10, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map(db => `<line x1="40" y1="${40+((db+10)*2)}" x2="280" y2="${40+((db+10)*2)}" />`).join('')}
        </g>
        <polyline points="${points.join(' ')}" fill="none" stroke="${ear === 'L' ? '#0056b3' : '#d9534f'}" stroke-width="2" />
        ${markers}
    </svg>`;
}

function esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }