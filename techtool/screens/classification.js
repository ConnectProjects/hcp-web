import { renderAudiogram } from '../components/audiogram.js'

const RESULT_CONFIG = {
  N:   { label: 'Normal',               cls: 'result--green'  },
  EW:  { label: 'Early Warning',        cls: 'result--yellow' },
  A:   { label: 'Abnormal',             cls: 'result--red'    },
  NC:  { label: 'No Change',            cls: 'result--green'  },
  EWC: { label: 'Early Warning Change', cls: 'result--yellow' },
  AC:  { label: 'Abnormal Change',      cls: 'result--red'    }
}

export function renderClassification(container, state, navigate) {
  const result   = state.classResult
  const emp      = state.currentEmployee
  const test     = state.testData ?? {}
  const baseline = emp?.baseline?.thresholds ?? null

  const cfg = RESULT_CONFIG[result?.category] ?? { label: result?.category ?? '?', cls: 'result--neutral', icon: '?' }
  const hasDetail = result?.triggered_rule_id != null

  container.innerHTML = `
    <div class="screen">
      <header class="app-header">
        <button class="btn btn-ghost" id="btn-back">‹ Re-enter</button>
        <h1 class="app-title">Classification</h1>
      </header>

      <main class="screen-body">
        <div class="result-chip ${cfg.cls}">
          <span class="result-dot">${result?.category ?? '?'}</span>
          <span class="result-label">${cfg.label}</span>
        </div>

        <div class="result-detail-card" style="padding:0; overflow:hidden">
          <table class="q-grid-table">
            <thead>
              <tr>
                <th style="padding-left:12px; width:45px"></th>
                <th>500</th><th>1K</th><th>2K</th><th>3K</th><th>4K</th><th>6K</th><th>8K</th>
              </tr>
            </thead>
            <tbody>
              <tr class="ear-right">
                <td class="q-ear-label">R</td>
                <td>${test.right_500 ?? '—'}</td>
                <td>${test.right_1k  ?? '—'}</td>
                <td>${test.right_2k  ?? '—'}</td>
                <td>${test.right_3k  ?? '—'}</td>
                <td>${test.right_4k  ?? '—'}</td>
                <td>${test.right_6k  ?? '—'}</td>
                <td>${test.right_8k  ?? '—'}</td>
              </tr>
              ${baseline ? `
                <tr class="ear-right baseline-row" style="opacity:0.6; font-size:13px">
                  <td class="q-ear-label" style="font-size:10px">Base R</td>
                  <td>${baseline.right_500 ?? '—'}</td>
                  <td>${baseline.right_1k  ?? '—'}</td>
                  <td>${baseline.right_2k  ?? '—'}</td>
                  <td>${baseline.right_3k  ?? '—'}</td>
                  <td>${baseline.right_4k  ?? '—'}</td>
                  <td>${baseline.right_6k  ?? '—'}</td>
                  <td>${baseline.right_8k  ?? '—'}</td>
                </tr>
              ` : ''}
              <tr class="ear-left" style="border-top: 1px solid var(--grey-200)">
                <td class="q-ear-label">L</td>
                <td>${test.left_500 ?? '—'}</td>
                <td>${test.left_1k  ?? '—'}</td>
                <td>${test.left_2k  ?? '—'}</td>
                <td>${test.left_3k  ?? '—'}</td>
                <td>${test.left_4k  ?? '—'}</td>
                <td>${test.left_6k  ?? '—'}</td>
                <td>${test.left_8k  ?? '—'}</td>
              </tr>
              ${baseline ? `
                <tr class="ear-left baseline-row" style="opacity:0.6; font-size:13px">
                  <td class="q-ear-label" style="font-size:10px">Base L</td>
                  <td>${baseline.left_500 ?? '—'}</td>
                  <td>${baseline.left_1k  ?? '—'}</td>
                  <td>${baseline.left_2k  ?? '—'}</td>
                  <td>${baseline.left_3k  ?? '—'}</td>
                  <td>${baseline.left_4k  ?? '—'}</td>
                  <td>${baseline.left_6k  ?? '—'}</td>
                  <td>${baseline.left_8k  ?? '—'}</td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>

        ${hasDetail ? `
          <div class="result-detail-card">
            <div class="detail-row">
              <span class="detail-key">Triggering rule</span>
              <span class="detail-val">Rule #${result.triggered_rule_id}</span>
            </div>
            ${result.triggering_freq_hz != null ? `
              <div class="detail-row">
                <span class="detail-key">Frequency</span>
                <span class="detail-val">${result.triggering_freq_hz} Hz</span>
              </div>` : ''}
            ${result.triggering_ear ? `
              <div class="detail-row">
                <span class="detail-key">Ear</span>
                <span class="detail-val">${cap(result.triggering_ear)}</span>
              </div>` : ''}
            ${result.shift_db != null ? `
              <div class="detail-row">
                <span class="detail-key">${result.no_baseline ? 'Threshold' : 'Shift'}</span>
                <span class="detail-val">${result.shift_db} dB</span>
              </div>` : ''}
            ${result.no_baseline ? `
              <div class="detail-row">
                <span class="detail-key">Baseline</span>
                <span class="detail-val detail-warn">No baseline on file</span>
              </div>` : ''}
            ${result.followup_months != null ? `
              <div class="detail-row">
                <span class="detail-key">Follow-up</span>
                <span class="detail-val detail-warn">Retest within ${result.followup_months} months</span>
              </div>` : ''}
            ${result.requires_referral ? `
              <div class="detail-row">
                <span class="detail-key">Referral</span>
                <span class="detail-val detail-warn">Medical referral required</span>
              </div>` : ''}
          </div>
        ` : `
          <div class="result-detail-card">
            <p class="detail-normal">No rule triggered — within normal limits.</p>
            ${result?.no_baseline ? '<p class="detail-warn">No baseline on file for this employee.</p>' : ''}
          </div>
        `}

        <div class="audiogram-inset">
          <div id="audiogram-here"></div>
        </div>
      </main>

      <footer class="action-bar">
        <button class="btn btn-ghost" id="btn-reenter">Re-enter thresholds</button>
        <button class="btn btn-primary" id="btn-counsel">Counsel →</button>
      </footer>
    </div>
  `

  container.querySelector('#audiogram-here').appendChild(
    renderAudiogram({ current: test, baseline })
  )

  container.querySelector('#btn-back').addEventListener('click',    () => navigate('test-entry'))
  container.querySelector('#btn-reenter').addEventListener('click', () => navigate('test-entry'))
  container.querySelector('#btn-counsel').addEventListener('click', () => navigate('counsel'))
}

function cap(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''
}
