/**
 * shared/referral-form.js
 *
 * Generates a printable HTML referral form for audiometric testing results.
 * Used by both TechTool (during counsel) and MasterDB (from employee test detail).
 *
 * Call generateReferralForm(data) to get an HTML string, then open it in a
 * print window with openReferralPrintWindow(data).
 */

const FREQS = [500, 1000, 2000, 3000, 4000, 6000, 8000]
const FREQ_KEYS = {
  left:  ['left_500', 'left_1k', 'left_2k', 'left_3k', 'left_4k', 'left_6k', 'left_8k'],
  right: ['right_500', 'right_1k', 'right_2k', 'right_3k', 'right_4k', 'right_6k', 'right_8k']
}
const FREQ_LABELS = ['500', '1K', '2K', '3K', '4K', '6K', '8K']

/**
 * Open a print window with the referral form.
 *
 * @param {object} data
 * @param {object} data.org          - { name, address, city, province, postal, phone, email, website, logoUrl }
 * @param {object} data.worker       - { first_name, last_name, dob }
 * @param {object} data.employer     - { name, province }
 * @param {string} data.test_date    - ISO date string YYYY-MM-DD
 * @param {string} data.test_type    - 'Baseline' | 'Periodic'
 * @param {object} data.classification - { category, category_label, triggering_freq_hz, triggering_ear, shift_db }
 * @param {object} data.thresholds   - { left_500, left_1k, … right_8k }
 * @param {object} data.baseline     - baseline thresholds object, or null
 * @param {string} data.counsel_text - rendered counsel text
 * @param {object} data.tech         - { name, iat_number }
 */
export function openReferralPrintWindow(data) {
  const html = generateReferralForm(data)
  const win  = window.open('', '_blank', 'width=850,height=1100')
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site and try again.')
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  // Short delay so images (logo) can load before print dialog
  setTimeout(() => win.print(), 600)
}

export function generateReferralForm(data) {
  const { org, worker, employer, test_date, test_type, classification, thresholds, baseline, counsel_text, tech } = data

  const cat      = classification?.category ?? 'N'
  const catLabel = classification?.category_label ?? cat
  const catColor = { A: '#9b2335', AC: '#9b2335', EW: '#7b5e00', EWC: '#7b5e00' }[cat] ?? '#276749'
  const catBg    = { A: '#fff5f5', AC: '#fff5f5', EW: '#fffbeb', EWC: '#fffbeb' }[cat] ?? '#f0fff4'

  const audiogramSVG = buildAudiogramSVG(thresholds, baseline, classification)
  const thresholdBoxes = buildThresholdBoxes(thresholds, classification)

  const workerName = `${(worker?.last_name ?? '').toUpperCase()}, ${worker?.first_name ?? ''}`
  const dob        = worker?.dob ? formatDate(worker.dob) : '—'
  const testDate   = test_date   ? formatDate(test_date)  : '—'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Audiometric Referral — ${workerName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    color: #1a1a1a;
    background: #fff;
    padding: 18mm 16mm;
    max-width: 210mm;
    margin: 0 auto;
  }

  /* Header */
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 10px;
    margin-bottom: 14px;
  }
  .header-logo img {
    max-height: 52px;
    max-width: 200px;
    object-fit: contain;
  }
  .header-logo-text {
    font-size: 16pt;
    font-weight: 700;
    color: #1a1a1a;
  }
  .header-org {
    text-align: right;
    font-size: 9pt;
    line-height: 1.6;
    color: #333;
  }
  .header-org strong { font-size: 10pt; color: #1a1a1a; }

  /* Title */
  .form-title {
    font-size: 14pt;
    font-weight: 700;
    text-align: center;
    letter-spacing: .04em;
    text-transform: uppercase;
    margin-bottom: 14px;
    color: #1a1a1a;
  }

  /* Info grid */
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 20px;
    margin-bottom: 14px;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 10px 12px;
    background: #fafafa;
  }
  .info-row { display: flex; gap: 6px; align-items: baseline; }
  .info-label { font-size: 8pt; font-weight: 700; text-transform: uppercase; color: #666; white-space: nowrap; }
  .info-value { font-size: 10pt; color: #1a1a1a; }

  /* Classification chip */
  .classification-block {
    display: flex;
    align-items: center;
    gap: 12px;
    background: ${catBg};
    border: 1.5px solid ${catColor};
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 14px;
  }
  .class-chip {
    font-size: 14pt;
    font-weight: 700;
    color: ${catColor};
    border: 2px solid ${catColor};
    border-radius: 6px;
    padding: 3px 12px;
    white-space: nowrap;
  }
  .class-detail { font-size: 10pt; color: #333; line-height: 1.5; }
  .class-detail strong { color: ${catColor}; }

  /* Audiogram section */
  .audiogram-section {
    margin-bottom: 14px;
  }
  .section-title {
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: #666;
    margin-bottom: 6px;
    padding-bottom: 3px;
    border-bottom: 1px solid #ddd;
  }
  .threshold-boxes {
    display: flex;
    gap: 0;
    margin-bottom: 6px;
  }
  .threshold-ear-block { flex: 1; }
  .threshold-ear-label {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    color: #666;
    margin-bottom: 3px;
    padding-left: 2px;
  }
  .threshold-freq-row {
    display: flex;
    gap: 3px;
    margin-bottom: 3px;
  }
  .threshold-cell {
    flex: 1;
    text-align: center;
  }
  .threshold-cell .freq-label {
    font-size: 7pt;
    color: #999;
    display: block;
    margin-bottom: 1px;
  }
  .threshold-cell .freq-val {
    font-size: 9pt;
    font-weight: 700;
    border: 1px solid #ccc;
    border-radius: 3px;
    padding: 2px 0;
    display: block;
    background: #fff;
    min-width: 28px;
  }
  .threshold-cell .freq-val.highlighted {
    background: ${catBg};
    border-color: ${catColor};
    color: ${catColor};
  }
  .audiogram-svg-wrap {
    margin-top: 6px;
  }

  /* Counsel */
  .counsel-block {
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 10px 12px;
    margin-bottom: 14px;
    background: #fafafa;
    font-size: 10pt;
    line-height: 1.7;
    white-space: pre-wrap;
  }

  /* Signature / tech block */
  .tech-block {
    display: flex;
    gap: 24px;
    margin-bottom: 14px;
  }
  .tech-field { flex: 1; }
  .tech-field label {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    color: #666;
    display: block;
    margin-bottom: 4px;
  }
  .tech-field .tech-value {
    font-size: 10pt;
    border-bottom: 1px solid #999;
    padding-bottom: 4px;
    min-height: 22px;
  }

  /* Footer note */
  .form-footer {
    font-size: 8pt;
    color: #888;
    text-align: center;
    border-top: 1px solid #ddd;
    padding-top: 8px;
    margin-top: 8px;
  }

  @media print {
    body { padding: 10mm 12mm; }
    @page { size: letter portrait; margin: 10mm; }
  }
</style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="header-logo">
      ${org?.logoUrl
        ? `<img src="${org.logoUrl}" alt="${esc(org?.name ?? '')}" />`
        : `<span class="header-logo-text">${esc(org?.name ?? 'Hearing Provider')}</span>`}
    </div>
    <div class="header-org">
      <strong>${esc(org?.name ?? '')}</strong><br>
      ${org?.address ? esc(org.address) + '<br>' : ''}
      ${(org?.city || org?.province || org?.postal) ? `${esc(org?.city ?? '')}${org?.province ? ', ' + esc(org.province) : ''} ${esc(org?.postal ?? '')}<br>` : ''}
      ${org?.phone   ? esc(org.phone) + '<br>'   : ''}
      ${org?.email   ? esc(org.email) + '<br>'   : ''}
      ${org?.website ? esc(org.website)           : ''}
    </div>
  </div>

  <div class="form-title">Audiometric Test Referral</div>

  <!-- Worker / visit info -->
  <div class="info-grid">
    <div class="info-row"><span class="info-label">Worker Name</span><span class="info-value"><strong>${esc(workerName)}</strong></span></div>
    <div class="info-row"><span class="info-label">Date of Birth</span><span class="info-value">${esc(dob)}</span></div>
    <div class="info-row"><span class="info-label">Employer</span><span class="info-value">${esc(employer?.name ?? '—')}</span></div>
    <div class="info-row"><span class="info-label">Province</span><span class="info-value">${esc(employer?.province ?? '—')}</span></div>
    <div class="info-row"><span class="info-label">Test Date</span><span class="info-value">${esc(testDate)}</span></div>
    <div class="info-row"><span class="info-label">Test Type</span><span class="info-value">${esc(test_type ?? '—')}</span></div>
  </div>

  <!-- Classification -->
  <div class="classification-block">
    <div class="class-chip">${esc(cat)}</div>
    <div class="class-detail">
      <strong>${esc(catLabel)}</strong>
      ${classification?.triggering_freq_hz ? `<br>Frequency: ${esc(String(classification.triggering_freq_hz))} Hz · Ear: ${esc(classification.triggering_ear ?? '—')}` : ''}
      ${classification?.shift_db != null ? ` · Shift: ${classification.shift_db} dB` : ''}
    </div>
  </div>

  <!-- Audiogram -->
  <div class="audiogram-section">
    <div class="section-title">Audiogram Thresholds (dB HL)</div>
    ${thresholdBoxes}
    <div class="audiogram-svg-wrap">${audiogramSVG}</div>
  </div>

  <!-- Counsel text -->
  <div class="section-title">Referral Reason / Counsel Provided</div>
  <div class="counsel-block">${esc(counsel_text ?? '')}</div>

  <!-- Tech block -->
  <div class="tech-block">
    <div class="tech-field">
      <label>Audiometric Technician</label>
      <div class="tech-value">${esc(tech?.name ?? '')}</div>
    </div>
    <div class="tech-field">
      <label>IAT Number</label>
      <div class="tech-value">${esc(tech?.iat_number ?? '')}</div>
    </div>
    <div class="tech-field">
      <label>Date Issued</label>
      <div class="tech-value">${esc(formatDate(new Date().toISOString().slice(0, 10)))}</div>
    </div>
  </div>

  <div class="form-footer">
    This referral was generated by Connect Hearing · ${esc(org?.name ?? '')} · ${new Date().toLocaleDateString('en-CA')}
  </div>

</body>
</html>`
}

// ---------------------------------------------------------------------------
// Audiogram SVG builder
// ---------------------------------------------------------------------------

function buildAudiogramSVG(thresholds, baseline, classification = null) {
  const W = 520, H = 200
  const PAD_L = 40, PAD_R = 16, PAD_T = 16, PAD_B = 24
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  const DB_MIN = -10, DB_MAX = 110
  const dbRange = DB_MAX - DB_MIN

  const xPos  = (i) => PAD_L + (i / (FREQS.length - 1)) * plotW
  const yPos  = (db) => PAD_T + ((db - DB_MIN) / dbRange) * plotH

  // Grid lines at 0, 20, 40, 60, 80, 100 dB
  const gridLines = [0, 20, 40, 60, 80, 100].map(db => {
    const y = yPos(db)
    return `<line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="#ddd" stroke-width="1" />`
  }).join('')

  // Frequency vertical lines
  const freqLines = FREQS.map((_, i) => {
    const x = xPos(i)
    return `<line x1="${x}" y1="${PAD_T}" x2="${x}" y2="${H - PAD_B}" stroke="#eee" stroke-width="1" />`
  }).join('')

  // dB labels
  const dbLabels = [0, 20, 40, 60, 80, 100].map(db => {
    const y = yPos(db)
    return `<text x="${PAD_L - 5}" y="${y + 4}" text-anchor="end" font-size="9" fill="#999">${db}</text>`
  }).join('')

  const line25 = `<line x1="${PAD_L}" y1="${yPos(25)}" x2="${W - PAD_R}" y2="${yPos(25)}" stroke="#888" stroke-width="1" stroke-dasharray="3,3" opacity="0.6" />`
  const label25 = `<text x="${W - PAD_R + 3}" y="${yPos(25) + 3}" font-size="8" fill="#888">25</text>`

  // Freq labels
  const freqLabels = FREQS.map((f, i) => {
    const x = xPos(i)
    const label = f >= 1000 ? (f / 1000) + 'K' : String(f)
    return `<text x="${x}" y="${H - PAD_B + 14}" text-anchor="middle" font-size="9" fill="#666">${label}</text>`
  }).join('')

  // Plot a line for an ear
  function plotEar(ear, color, symbol) {
    const keys = FREQ_KEYS[ear]
    const points = keys.map((key, i) => {
      const val = thresholds?.[key]
      const db  = val === 'NR' ? 105 : (val != null && val !== '' && !isNaN(Number(val)) ? Number(val) : null)
      if (db === null) return null
      return { x: xPos(i), y: yPos(Math.min(db, DB_MAX)), db, freq: FREQS[i] }
    })

    const validPoints = points.filter(p => p !== null)
    if (validPoints.length === 0) return ''

    const pathD = validPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
    const path  = `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" />`
    
    const dots  = validPoints.map(p => {
      let dotHtml = ''
      const isTrigger = classification && 
                        classification.triggering_ear?.toLowerCase() === ear && 
                        (classification.triggering_freq_hz === p.freq || classification.triggering_freq_hz === String(p.freq))

      if (symbol === 'O') {
        dotHtml = `<circle cx="${p.x}" cy="${p.y}" r="4" fill="white" stroke="${color}" stroke-width="1.5" />`
      } else {
        dotHtml = `<text x="${p.x}" y="${p.y + 4}" text-anchor="middle" font-size="10" fill="${color}" font-weight="700">X</text>`
      }

      if (isTrigger) {
        dotHtml += `<circle cx="${p.x}" cy="${p.y}" r="8" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="2,2" />`
      }
      return dotHtml
    }).join('')

    return path + dots
  }

  // Baseline (dashed, lighter)
  function plotBaseline(ear, color) {
    if (!baseline) return ''
    const keys = FREQ_KEYS[ear]
    const points = keys.map((key, i) => {
      const val = baseline[key]
      const db  = val === 'NR' ? 105 : (val != null && val !== '' && !isNaN(Number(val)) ? Number(val) : null)
      if (db === null) return null
      return { x: xPos(i), y: yPos(Math.min(db, DB_MAX)) }
    }).filter(p => p !== null)

    if (points.length === 0) return ''
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
    return `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="4,3" opacity="0.5" />`
  }

  // Legend
  const legend = `
    <text x="${PAD_L}" y="12" font-size="9" fill="#c0392b">— Right (O)</text>
    <text x="${PAD_L + 90}" y="12" font-size="9" fill="#2563eb">— Left (X)</text>
    ${baseline ? `<text x="${PAD_L + 170}" y="12" font-size="9" fill="#999">- - Baseline</text>` : ''}
  `

  return `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="border:1px solid #ddd;border-radius:4px;background:#fff">
    ${legend}
    ${freqLines}
    ${gridLines}
    ${line25}
    ${dbLabels}
    ${label25}
    ${freqLabels}
    ${plotBaseline('right', '#c0392b')}
    ${plotBaseline('left',  '#2563eb')}
    ${plotEar('right', '#c0392b', 'O')}
    ${plotEar('left',  '#2563eb', 'X')}
    <text x="${PAD_L - 5}" y="${PAD_T - 4}" text-anchor="end" font-size="8" fill="#aaa">dB HL</text>
  </svg>`
}

// ---------------------------------------------------------------------------
// Threshold boxes (numeric values above audiogram)
// ---------------------------------------------------------------------------

function buildThresholdBoxes(thresholds, classification = null) {
  const triggeringFreq = classification?.triggering_freq_hz ? String(classification.triggering_freq_hz) : null
  const triggeringEar  = classification?.triggering_ear ? String(classification.triggering_ear).toLowerCase() : null

  return `
    <div class="threshold-boxes">
      ${['right', 'left'].map(ear => `
        <div class="threshold-ear-block">
          <div class="threshold-ear-label">${ear === 'right' ? 'Right Ear (O)' : 'Left Ear (X)'}</div>
          <div class="threshold-freq-row">
            ${FREQ_KEYS[ear].map((key, i) => {
              const val = thresholds?.[key]
              const display = val != null ? String(val) : '—'
              const freqNum = FREQS[i]
              const isTrigger = triggeringEar === ear && (triggeringFreq === String(freqNum))

              return `<div class="threshold-cell">
                <span class="freq-label">${FREQ_LABELS[i]}</span>
                <span class="freq-val ${isTrigger ? 'highlighted' : ''}">${esc(display)}</span>
              </div>`
            }).join('')}
          </div>
        </div>
      `).join('<div style="width:20px"></div>')}
    </div>
  `
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d} ${months[Number(m) - 1]} ${y}`
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
