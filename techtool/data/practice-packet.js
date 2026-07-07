/**
 * techtool/data/practice-packet.js
 *
 * Fictional practice packet for TechTool training mode.
 * Alberta province — pre-set threshold values produce four different
 * classification outcomes so trainees see the full range.
 *
 * Employee outcomes:
 *   1. SAMPLE, NORMAL   — all thresholds well within normal limits → N
 *   2. SAMPLE, SHIFT    — baseline on file, 2K/3K/4K shift ~10 dB avg → EW (STS)
 *   3. SAMPLE, ABNORMAL — threshold at 1K = 30 dB on first test → A (Rule 1)
 *   4. SAMPLE, NEWSTART — no baseline on file → Baseline test type
 */

export function createPracticePacket() {
  return {
    packet_id:      'PRACTICE-AB-TrainingCo-00000000-TR',
    filename:       'TrainingCo_2026-01-15_TR.json',
    schema_version: '1.0',
    status:         'synced',
    _is_practice:   true,   // flag used throughout TechTool to show practice banner
    created_at:     new Date().toISOString(),
    updated_at:     new Date().toISOString(),

    tech: {
      tech_id:       'TR',
      tech_initials: 'TR'
    },

    visit: {
      visit_date: '2026-01-15',
      province:   'AB'
    },

    company: {
      company_id:    'practice-co',
      name:          'Training Co. (Practice)',
      province:      'AB',
      address:       '123 Practice Lane, Calgary, AB',
      contact_name:  'Training Coordinator',
      contact_phone: '555-0100',
      contact_email: 'training@example.com',
      sticky_notes:  '📋 PRACTICE MODE — This is a training visit. No real data will be saved. Work through each employee in order to see different classification outcomes.'
    },

    rules: AB_RULES,
    counsel_templates: AB_COUNSEL,
    hpd_inventory: [
      { make_model: '3M E-A-R Classic', nrr: 29, type: 'Earplug' },
      { make_model: 'Honeywell Howard Leight Sync', nrr: 25, type: 'Earmuff' }
    ],

    employees: [
      // ── Employee 1: Normal result ──────────────────────────────────────
      {
        employee_id: 'practice-emp-1',
        first_name:  'Normal',
        last_name:   'SAMPLE',
        dob:         '1985-03-12',
        hire_date:   '2015-06-01',
        job_title:   'Machine Operator',
        status:      'active',
        _training_hint: 'This employee has a baseline on file and normal hearing. Their thresholds are well within limits — you should see a Normal (N) result.',
        baseline: {
          baseline_id: 'practice-bl-1',
          test_date:   '2024-01-10',
          thresholds: {
            left_500: 5,  left_1k: 5,  left_2k: 10, left_3k: 10,
            left_4k: 15,  left_6k: 15, left_8k: 20,
            right_500: 5, right_1k: 5, right_2k: 5,  right_3k: 10,
            right_4k: 10, right_6k: 15, right_8k: 20
          }
        },
        prior_tests: [],
        completed_tests: []
      },

      // ── Employee 2: STS / EW result ────────────────────────────────────
      {
        employee_id: 'practice-emp-2',
        first_name:  'Shift',
        last_name:   'SAMPLE',
        dob:         '1978-07-22',
        hire_date:   '2010-03-15',
        job_title:   'Forklift Operator',
        status:      'active',
        _training_hint: 'This employee has a baseline on file. Enter the suggested thresholds and watch for a Standard Threshold Shift (EW) result — the average shift at 2K+3K+4K will hit the 10 dB threshold.',
        baseline: {
          baseline_id: 'practice-bl-2',
          test_date:   '2024-01-10',
          thresholds: {
            left_500: 10, left_1k: 10, left_2k: 15, left_3k: 15,
            left_4k: 20,  left_6k: 20, left_8k: 25,
            right_500: 5, right_1k: 10, right_2k: 15, right_3k: 15,
            right_4k: 20, right_6k: 25, right_8k: 30
          }
        },
        prior_tests: [],
        completed_tests: []
      },

      // ── Employee 3: Abnormal result ────────────────────────────────────
      {
        employee_id: 'practice-emp-3',
        first_name:  'Abnormal',
        last_name:   'SAMPLE',
        dob:         '1965-11-05',
        hire_date:   '2005-09-20',
        job_title:   'Heavy Equipment Operator',
        status:      'active',
        _training_hint: 'This employee has a baseline on file. When you enter their thresholds, the right ear 1K value will exceed 25 dB — triggering an Abnormal (A) result under AB Rule 1. A referral will be required.',
        baseline: {
          baseline_id: 'practice-bl-3',
          test_date:   '2024-01-10',
          thresholds: {
            left_500: 10, left_1k: 15, left_2k: 20, left_3k: 25,
            left_4k: 30,  left_6k: 35, left_8k: 40,
            right_500: 10, right_1k: 20, right_2k: 25, right_3k: 30,
            right_4k: 35, right_6k: 40, right_8k: 45
          }
        },
        prior_tests: [],
        completed_tests: []
      },

      // ── Employee 4: No baseline — Baseline test ────────────────────────
      {
        employee_id: 'practice-emp-4',
        first_name:  'Newstart',
        last_name:   'SAMPLE',
        dob:         '1995-04-30',
        hire_date:   '2026-01-02',
        job_title:   'General Labourer',
        status:      'active',
        _training_hint: 'This employee has no baseline on file — it\'s their first hearing test. TechTool will mark this as a Baseline test. The thresholds you enter today will become their reference for all future periodic tests.',
        baseline: null,
        prior_tests: [],
        completed_tests: []
      }
    ],

    submitted_at: null,
    submitted_by: null
  }
}

// ---------------------------------------------------------------------------
// Suggested thresholds for each practice employee
// Shown as hints during test entry to guide the trainee
// ---------------------------------------------------------------------------

export const PRACTICE_SUGGESTED_THRESHOLDS = {
  'practice-emp-1': {
    label: 'Normal result',
    right: { 500: 5,  1000: 5,  2000: 10, 3000: 10, 4000: 15, 6000: 15, 8000: 20 },
    left:  { 500: 5,  1000: 5,  2000: 10, 3000: 10, 4000: 15, 6000: 20, 8000: 20 }
  },
  'practice-emp-2': {
    label: 'STS / Early Warning result',
    right: { 500: 5,  1000: 10, 2000: 25, 3000: 25, 4000: 30, 6000: 30, 8000: 35 },
    left:  { 500: 10, 1000: 10, 2000: 25, 3000: 25, 4000: 30, 6000: 30, 8000: 35 }
  },
  'practice-emp-3': {
    label: 'Abnormal result',
    right: { 500: 15, 1000: 30, 2000: 30, 3000: 40, 4000: 45, 6000: 50, 8000: 55 },
    left:  { 500: 10, 1000: 20, 2000: 25, 3000: 35, 4000: 40, 6000: 45, 8000: 50 }
  },
  'practice-emp-4': {
    label: 'Baseline test (first test)',
    right: { 500: 5,  1000: 5,  2000: 10, 3000: 15, 4000: 15, 6000: 20, 8000: 25 },
    left:  { 500: 5,  1000: 5,  2000: 10, 3000: 10, 4000: 15, 6000: 20, 8000: 20 }
  }
}

// ---------------------------------------------------------------------------
// Overlay hints — shown once per screen during practice mode
// ---------------------------------------------------------------------------

export const PRACTICE_HINTS = {
  company: {
    title: 'Company Screen',
    body: 'This is where each visit starts. Read any sticky notes from the office — they contain site-specific instructions. When you\'re ready, tap Begin Testing to open the employee list.'
  },
  'employee-list': {
    title: 'Employee List',
    body: 'This is your main working screen during a visit. Each employee shows their status — Pending, Tested, or Skipped. Work through each employee in order. Tap an employee\'s name to begin their test.'
  },
  'test-entry': {
    title: 'Test Entry',
    body: 'Enter the thresholds from your audiometer here. Right ear is shown in red, left ear in blue. The audiogram updates live as you type. Suggested thresholds for this practice employee are shown below — use them to see the expected classification result.'
  },
  classification: {
    title: 'Classification',
    body: 'TechTool has applied the provincial rules and calculated this employee\'s classification automatically. Review the result and the detail card. If something looks wrong, tap Re-enter thresholds to go back. When satisfied, tap Counsel.'
  },
  counsel: {
    title: 'Counsel',
    body: 'Review and edit the counsel text that will be provided to the worker. The template is pre-filled based on the classification. For Abnormal or STS results, a referral block will appear — complete the referral on-site and check the confirmation box.'
  },
  hpd: {
    title: 'HPD Assessment',
    body: 'Enter the worker\'s hearing protector details and their noise exposure level. TechTool applies the CSA Z94.2 derating method to calculate whether the HPD provides adequate protection. You can skip this screen if noise exposure data isn\'t available.'
  },
  submit: {
    title: 'Finalize Test',
    body: 'Review the summary before saving. Check the classification, counsel text, and HPD result (if recorded). When everything looks correct, tap Confirm & Save. TechTool will return to the employee list for the next worker.'
  },
  sync: {
    title: 'Submit Packet',
    body: 'In a real visit, this is where you submit the completed packet back to the office via the sync folder. In practice mode, nothing is submitted — but this is where you\'d tap Submit to Sync Folder after all employees are resolved.'
  }
}

// ---------------------------------------------------------------------------
// Minimal AB rules and counsel templates for the practice packet
// ---------------------------------------------------------------------------

const AB_RULES = [
  { rule_id: 1, province_code: 'AB', category_code: 'A', category_label: 'Abnormal Audiogram',     rule_type: 'absolute_threshold', threshold_db: 25, freq_range_low: 500,  freq_range_high: 2000, comparison_basis: 'always',   followup_months: null, requires_referral: true,  priority: 100 },
  { rule_id: 2, province_code: 'AB', category_code: 'A', category_label: 'Abnormal Audiogram',     rule_type: 'absolute_threshold', threshold_db: 60, freq_range_low: 3000, freq_range_high: 6000, comparison_basis: 'always',   followup_months: null, requires_referral: true,  priority: 90  },
  { rule_id: 3, province_code: 'AB', category_code: 'A', category_label: 'Abnormal Audiogram',     rule_type: 'asymmetry',          threshold_db: 30, freq_range_low: 3000, freq_range_high: 6000, comparison_basis: 'always',   followup_months: null, requires_referral: true,  priority: 80  },
  { rule_id: 4, province_code: 'AB', category_code: 'A', category_label: 'Abnormal Shift',         rule_type: 'adjacent_freq',      threshold_db: 15, freq_range_low: 1000, freq_range_high: 6000, comparison_basis: 'baseline', followup_months: null, requires_referral: true,  priority: 70  },
  { rule_id: 5, province_code: 'AB', category_code: 'EW', category_label: 'Standard Threshold Shift', rule_type: 'STS',             threshold_db: 10, freq_range_low: 2000, freq_range_high: 4000, comparison_basis: 'baseline', followup_months: null, requires_referral: false, priority: 60  }
]

const AB_COUNSEL = [
  { template_id: 1, province_code: 'AB', category_code: 'N',  category_label: 'Normal',                   summary_text: 'Your hearing test results today are within normal limits. No significant change in your hearing has been detected. Continue to wear your hearing protection consistently in all noisy work areas.',                                                                                                                                                                      tech_notes: 'Normal result — no action required. Remind worker to continue wearing HPD.' },
  { template_id: 2, province_code: 'AB', category_code: 'A',  category_label: 'Abnormal',                 summary_text: 'Your hearing test today shows a significant finding at [freq] Hz in your [ear] ear. This result meets the criteria for an Abnormal finding under Alberta OHS Part 16. You are advised to see a physician or audiologist for further evaluation. Please ensure you are wearing appropriate, properly fitted hearing protection at all times in noisy work areas.', tech_notes: 'Abnormal — medical review by physician or audiologist is mandatory under AB OHS Part 16. Written notification to worker required within 30 days.' },
  { template_id: 3, province_code: 'AB', category_code: 'EW', category_label: 'Standard Threshold Shift', summary_text: 'Your hearing test today shows a Standard Threshold Shift (STS) of [shift] dB averaged at 2000, 3000, and 4000 Hz in your [ear] ear compared to your baseline. Under Alberta OHS Code Part 16, this result must be recorded and the findings must be forwarded to a physician or audiologist for review within 30 days. Please ensure you are wearing your hearing protection correctly and consistently in all noisy work areas.', tech_notes: 'STS detected — average shift of [shift] dB at 2K+3K+4K Hz ([ear] ear) vs baseline. Advise worker of results within 30 days. Forward to physician or audiologist.' }
]
