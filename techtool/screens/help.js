/**
 * screens/help.js
 *
 * Full in-app manual for TechTool.
 * Accessible via the Help nav item in the sidebar.
 */

export function renderHelp(container, state, navigate) {
  container.innerHTML = `
    <div class="screen">
      <header class="app-header">
        <button class="btn btn-ghost" id="btn-back-help">‹ Back</button>
        <h1 class="app-title">TechTool Help</h1>
      </header>

      <div class="help-layout">
        <nav class="help-nav" id="help-nav">
          <div class="help-nav-section">Overview</div>
          <button class="help-nav-item active" data-section="overview">What is TechTool?</button>
          <button class="help-nav-item" data-section="getting-started">Getting Started</button>

          <div class="help-nav-section">Screens</div>
          <button class="help-nav-item" data-section="dashboard">Dashboard</button>
          <button class="help-nav-item" data-section="schedule">Schedule</button>
          <button class="help-nav-item" data-section="company">Company Screen</button>
          <button class="help-nav-item" data-section="employee-list">Employee List</button>
          <button class="help-nav-item" data-section="test-entry">Test Entry</button>
          <button class="help-nav-item" data-section="classification">Classification</button>
          <button class="help-nav-item" data-section="counsel">Counsel</button>
          <button class="help-nav-item" data-section="submit">Finalize Test</button>
          <button class="help-nav-item" data-section="sync">Submit Packet</button>
          <button class="help-nav-item" data-section="settings">Settings</button>

          <div class="help-nav-section">Reference</div>
          <button class="help-nav-item" data-section="workflow">Full Visit Workflow</button>
          <button class="help-nav-item" data-section="classifications">Classifications</button>
          <button class="help-nav-item" data-section="troubleshooting">Troubleshooting</button>
        </nav>

        <div class="help-content" id="help-content"></div>
      </div>
    </div>
  `

  container.querySelector('#btn-back-help').addEventListener('click', () => {
    const prev = state.helpReturnScreen || 'dashboard'
    navigate(prev)
  })

  const contentEl = container.querySelector('#help-content')
  const navBtns   = container.querySelectorAll('.help-nav-item')

  function showSection(id) {
    navBtns.forEach(b => b.classList.toggle('active', b.dataset.section === id))
    contentEl.innerHTML = SECTIONS[id] || '<p>Section not found.</p>'
    contentEl.scrollTop = 0
  }

  navBtns.forEach(btn => btn.addEventListener('click', () => showSection(btn.dataset.section)))
  showSection('overview')
}

const SECTIONS = {

overview: `
  <h2>What is TechTool?</h2>
  <p>TechTool is the field component of the HCP-Web Hearing Conservation Platform. It runs in a browser on the technician's device — phone, tablet, or laptop — and works fully offline once loaded. No internet connection is required on-site.</p>
  <h3>What TechTool does</h3>
  <p>TechTool guides you through a complete industrial audiometric testing visit. It loads your assigned employee list from a packet, walks you through threshold entry and classification for each employee, and bundles the completed results into a packet that gets submitted back to the office via the sync folder.</p>
  <h3>What TechTool does not do</h3>
  <p>TechTool does not conduct the audiometric test itself — that is done using your calibrated audiometer. TechTool is where you record the thresholds from the audiometer and calculate the classification result. It also does not store permanent records — those live in MasterDB at the office.</p>
  <h3>The two-app workflow</h3>
  <div class="help-steps">
    <div class="help-step"><span class="help-step-num">1</span><div><strong>Office generates a packet</strong> in MasterDB and saves it to the sync folder (OneDrive).</div></div>
    <div class="help-step"><span class="help-step-num">2</span><div><strong>You sync TechTool</strong> on your device to download the packet before you leave for site, or on-site if you have a connection.</div></div>
    <div class="help-step"><span class="help-step-num">3</span><div><strong>You test each employee</strong> on-site, entering thresholds and reviewing classifications in TechTool.</div></div>
    <div class="help-step"><span class="help-step-num">4</span><div><strong>You submit the completed packet</strong> back to the sync folder when done. The office then imports the results into MasterDB.</div></div>
  </div>
  <div class="alert alert-info" style="margin-top:16px">
    TechTool stores packets locally on your device using IndexedDB. Data persists between sessions but is tied to this browser on this device. Always submit completed packets promptly.
  </div>
`,

'getting-started': `
  <h2>Getting Started</h2>
  <h3>First launch — setting up your profile</h3>
  <div class="help-steps">
    <div class="help-step"><span class="help-step-num">1</span><div>Enter your full name and initials. These are recorded on every test you conduct.</div></div>
    <div class="help-step"><span class="help-step-num">2</span><div>Enter your <strong>folder name</strong> — the subfolder name within the sync folder where your packets are stored. Ask your MasterDB administrator if unsure.</div></div>
    <div class="help-step"><span class="help-step-num">3</span><div>Enter your <strong>IAT number</strong> — your Industrial Audiometric Technician certification number. This appears on referral forms.</div></div>
    <div class="help-step"><span class="help-step-num">4</span><div>Tap <strong>Start</strong>. Your profile is saved and you will go directly to the Dashboard on future launches.</div></div>
  </div>
  <h3>Connecting the sync folder</h3>
  <div class="help-steps">
    <div class="help-step"><span class="help-step-num">1</span><div>From the Dashboard, tap <strong>↓ Sync</strong>.</div></div>
    <div class="help-step"><span class="help-step-num">2</span><div>If no sync folder is connected, a folder picker will appear. Navigate to and select your OneDrive sync folder root.</div></div>
    <div class="help-step"><span class="help-step-num">3</span><div>TechTool will look for packets in the <code>techs/[your folder name]</code> subfolder.</div></div>
  </div>
  <div class="alert alert-warn">
    Folder access must be re-granted each browser session on most devices. If packets don't sync, try tapping Sync again.
  </div>
  <h3>Before going to site</h3>
  <div class="help-steps">
    <div class="help-step"><span class="help-step-num">1</span><div>Open TechTool in Chrome or Edge while you have internet access.</div></div>
    <div class="help-step"><span class="help-step-num">2</span><div>Tap <strong>↓ Sync</strong> to download your assigned packets.</div></div>
    <div class="help-step"><span class="help-step-num">3</span><div>Confirm the correct company and employee count appears on the Dashboard.</div></div>
    <div class="help-step"><span class="help-step-num">4</span><div>You are now ready to work offline.</div></div>
  </div>
`,

dashboard: `
  <h2>Dashboard</h2>
  <p>The Dashboard is your home screen. It shows today's testing assignments, upcoming visits, and your sync status.</p>
  <h3>Today section</h3>
  <p>Shows all packets with a visit date matching today's date. Each card displays the company name, province, and how many employees have been tested vs. the total. When all employees are resolved the card turns green with a ✓ Done label. Tap any card to open that company and begin testing.</p>
  <h3>Upcoming section</h3>
  <p>Shows the next five packets scheduled for future dates. Tap any row to open that company ahead of time.</p>
  <h3>Sync button</h3>
  <p>Tap <strong>↓ Sync</strong> to check the sync folder for new packets. Packets already downloaded are skipped automatically. A banner shows the sync result and time of last sync.</p>
  <h3>Header buttons</h3>
  <table class="help-table">
    <thead><tr><th>Button</th><th>Action</th></tr></thead>
    <tbody>
      <tr><td>↓ Sync</td><td>Download new packets from the sync folder</td></tr>
      <tr><td>☰</td><td>Go to Schedule — full list of all packets</td></tr>
      <tr><td>⚙</td><td>Go to Settings</td></tr>
    </tbody>
  </table>
`,

schedule: `
  <h2>Schedule</h2>
  <p>The Schedule screen lists all packets on this device, organized by date.</p>
  <table class="help-table">
    <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
    <tbody>
      <tr><td>Synced</td><td>Packet downloaded, not yet started</td></tr>
      <tr><td>In Progress</td><td>Some employees have been tested</td></tr>
      <tr><td>Complete</td><td>All employees resolved (tested or skipped)</td></tr>
      <tr><td>Submitted</td><td>Packet has been submitted back to the office</td></tr>
    </tbody>
  </table>
  <p>Tap any packet row to open it. The Calendar view shows the same packets on a monthly calendar.</p>
`,

company: `
  <h2>Company Screen</h2>
  <p>The Company screen is the starting point for each visit. It shows the company details and any sticky notes left by the office.</p>
  <table class="help-table">
    <thead><tr><th>Item</th><th>Details</th></tr></thead>
    <tbody>
      <tr><td>Company name and province</td><td>Confirms you have the right packet</td></tr>
      <tr><td>Visit date</td><td>The scheduled date for this visit</td></tr>
      <tr><td>Technician</td><td>Your name as recorded in the packet</td></tr>
      <tr><td>Employee count</td><td>Total employees included in this packet</td></tr>
      <tr><td>Sticky notes</td><td>Site-specific instructions from the office — read these before starting</td></tr>
    </tbody>
  </table>
  <p>Tap <strong>Begin Testing →</strong> to go to the Employee List.</p>
`,

'employee-list': `
  <h2>Employee List</h2>
  <p>The Employee List shows every employee included in the current packet. This is your main working screen during a visit — you'll return here between each employee test.</p>
  <h3>Employee status indicators</h3>
  <table class="help-table">
    <thead><tr><th>Badge</th><th>Meaning</th></tr></thead>
    <tbody>
      <tr><td><span style="background:#f0fff4;color:#276749;border:1px solid #9ae6b4;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700">✓ Tested</span></td><td>Test entry complete for this visit</td></tr>
      <tr><td><span style="background:#f3f4f6;color:#374151;border:1px solid #d1d5db;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700">Pending</span></td><td>Not yet tested this visit</td></tr>
      <tr><td><span style="background:#f3f4f6;color:#374151;border:1px solid #d1d5db;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700">Skipped</span></td><td>Marked as not tested this visit with a reason</td></tr>
    </tbody>
  </table>
  <h3>Skipping an employee</h3>
  <table class="help-table">
    <thead><tr><th>Reason</th><th>When to use</th></tr></thead>
    <tbody>
      <tr><td>Not present today</td><td>Employee is employed but wasn't at the site during the visit</td></tr>
      <tr><td>Left company</td><td>Employee no longer works at this company</td></tr>
      <tr><td>Declined to test</td><td>Employee refused to participate</td></tr>
      <tr><td>Other</td><td>Any other reason</td></tr>
    </tbody>
  </table>
  <h3>Adding an employee on-site</h3>
  <p>Tap <strong>+ Add Employee</strong> at the bottom of the screen. Enter their first name, last name, and optionally a job title.</p>
  <div class="alert alert-info">Employees added on-site will be created as new records in MasterDB when the office imports the packet. Make sure the name is spelled correctly.</div>
  <h3>Submitting when complete</h3>
  <p>When all employees have been either tested or skipped, a green banner appears with a <strong>Submit Packet →</strong> button.</p>
`,

'test-entry': `
  <h2>Test Entry</h2>
  <p>The Test Entry screen is where you record the audiometric thresholds for each employee. The header shows whether this is a <strong>Baseline</strong> or <strong>Periodic</strong> test.</p>
  <table class="help-table">
    <thead><tr><th>Type</th><th>When it appears</th></tr></thead>
    <tbody>
      <tr><td>Baseline</td><td>Employee has no baseline on file — this will be their reference audiogram</td></tr>
      <tr><td>Periodic</td><td>Employee has an existing baseline — this test will be compared against it</td></tr>
    </tbody>
  </table>
  <h3>Entering thresholds</h3>
  <div class="help-steps">
    <div class="help-step"><span class="help-step-num">1</span><div>Tap the dropdown cell for each frequency and ear.</div></div>
    <div class="help-step"><span class="help-step-num">2</span><div>Select the threshold value in 5 dB steps from 0 to 100, or <strong>NR</strong> (No Response).</div></div>
    <div class="help-step"><span class="help-step-num">3</span><div>The audiogram updates live as you enter values — use it as a visual check.</div></div>
  </div>
  <h3>Save Draft</h3>
  <p>Tap <strong>Save Draft</strong> at any time to save your progress. If you navigate away and return, the draft will be automatically restored.</p>
  <h3>Classify</h3>
  <p>Tap <strong>Classify →</strong> when thresholds are entered. TechTool validates entries and applies provincial rules.</p>
  <div class="alert alert-warn">You must enter at least one threshold before classifying.</div>
`,

classification: `
  <h2>Classification</h2>
  <p>The Classification screen shows the result of applying the provincial rules to the thresholds you entered. This is calculated automatically — you cannot override it.</p>
  <h3>The result chip</h3>
  <table class="help-table">
    <thead><tr><th>Colour</th><th>Categories</th></tr></thead>
    <tbody>
      <tr><td style="color:#276749;font-weight:600">Green</td><td>Normal (N), Normal Change (NC)</td></tr>
      <tr><td style="color:#7b5e00;font-weight:600">Yellow</td><td>Early Warning (EW), Early Warning Change (EWC)</td></tr>
      <tr><td style="color:#9b2335;font-weight:600">Red</td><td>Abnormal (A), Abnormal Change (AC)</td></tr>
    </tbody>
  </table>
  <h3>Detail card fields</h3>
  <table class="help-table">
    <thead><tr><th>Field</th><th>Meaning</th></tr></thead>
    <tbody>
      <tr><td>Frequency</td><td>The frequency (Hz) where the threshold shift was detected</td></tr>
      <tr><td>Ear</td><td>Left or Right — which ear triggered the rule</td></tr>
      <tr><td>Shift / Threshold</td><td>The size of the shift in dB. "Threshold" when no baseline is on file.</td></tr>
      <tr><td>No baseline on file</td><td>Classification is based on absolute thresholds only</td></tr>
      <tr><td>Follow-up</td><td>Months within which a retest is required</td></tr>
      <tr><td>Referral required</td><td>Shown for Abnormal results — a medical referral must be arranged on-site</td></tr>
    </tbody>
  </table>
  <p>Tap <strong>Re-enter thresholds</strong> to go back if the result looks wrong. Tap <strong>Counsel →</strong> to proceed.</p>
`,

counsel: `
  <h2>Counsel</h2>
  <p>The Counsel screen is where you review and edit the counselling text that will be given to the employee. A template is pre-populated automatically based on the classification result.</p>
  <h3>Counsel text</h3>
  <p>The auto-generated text is editable. Modify it to add context specific to this employee's situation, or leave it as-is. It travels with the packet and appears in MasterDB on import.</p>
  <h3>Tech notes</h3>
  <p>Internal observations visible to the office in MasterDB but not part of the formal counsel. Use it for things like "employee complained of tinnitus" or "booth conditions were noisy".</p>
  <h3>Referral forms</h3>
  <p>When the result is Abnormal or STS, complete the referral to a physician or audiologist on-site during this session using the paper referral forms. You can also tap <strong>Print Referral Form</strong> to generate a printable form with the worker's details, audiogram, and counsel text pre-filled.</p>
  <h3>Proceeding</h3>
  <p>Tap <strong>Finalize & Review →</strong> to proceed and review the result before saving.</p>
`,

submit: `
  <h2>Finalize Test</h2>
  <p>A summary review before the test record is saved to the packet. Shows the employee's classification result and counselling text.</p>
  <h3>Review checklist</h3>
  <div class="help-steps">
    <div class="help-step"><span class="help-step-num">1</span><div>The <strong>classification result</strong> is correct for this employee.</div></div>
    <div class="help-step"><span class="help-step-num">2</span><div>The <strong>counsel text</strong> is appropriate and complete.</div></div>
    <div class="help-step"><span class="help-step-num">3</span><div>If the result is Abnormal or STS, the <strong>referral form has been completed</strong> on-site during counsel.</div></div>
  </div>
  <p>Tap <strong>Confirm &amp; Save</strong> to write the test record to the packet. TechTool returns to the Employee List automatically.</p>
  <div class="alert alert-warn">Once saved, to correct a test you would need to re-test the employee from the Employee List.</div>
`,

sync: `
  <h2>Submit Packet</h2>
  <p>The final step of a visit. Submits the completed packet to the sync folder so the office can import the results.</p>
  <div class="help-steps">
    <div class="help-step"><span class="help-step-num">1</span><div>TechTool connects to the sync folder. If not connected, a folder picker appears.</div></div>
    <div class="help-step"><span class="help-step-num">2</span><div>The packet JSON is written to the <code>inbox</code> subfolder.</div></div>
    <div class="help-step"><span class="help-step-num">3</span><div>A success confirmation is shown. The packet status changes to <strong>Submitted</strong>.</div></div>
  </div>
  <div class="alert alert-info">You need an internet/OneDrive connection to submit. The packet is safely stored on your device until you have connectivity.</div>
  <div class="alert alert-warn">Do not submit the same packet twice. Contact the office if you need to add results after submitting.</div>
`,

settings: `
  <h2>Settings</h2>
  <h3>Technician Profile</h3>
  <p>Your name, initials, folder name, and IAT number. Recorded on every test and printed on referral forms. The folder name must match what the office set up in MasterDB.</p>
  <h3>Sync Folder</h3>
  <p>Connect or reconnect your sync folder. Folder access is session-based — you may need to reconnect at the start of each working day.</p>
  <h3>Company Logo</h3>
  <p>The logo is set by the office in MasterDB and syncs to TechTool automatically when you sync packets. Use <strong>↓ Sync Logo from Office</strong> to pull it manually if needed.</p>
  <h3>Theme</h3>
  <p>Change the app's colour theme.</p>
  <h3>Reset TechTool</h3>
  <p>Removes all packets and settings from this device. <strong>Submit all packets before resetting.</strong></p>
`,

workflow: `
  <h2>Full Visit Workflow</h2>
  <h3>Before the visit</h3>
  <div class="help-steps">
    <div class="help-step"><span class="help-step-num">1</span><div>Open TechTool in Chrome or Edge while you have internet access.</div></div>
    <div class="help-step"><span class="help-step-num">2</span><div>Tap <strong>↓ Sync</strong> to download your packet.</div></div>
    <div class="help-step"><span class="help-step-num">3</span><div>Confirm the company name, visit date, and employee count.</div></div>
    <div class="help-step"><span class="help-step-num">4</span><div>Ensure your audiometer is calibrated and your test booth meets requirements.</div></div>
    <div class="help-step"><span class="help-step-num">5</span><div>Make sure you have paper referral forms available for any Abnormal or STS results.</div></div>
  </div>
  <h3>On-site — starting the visit</h3>
  <div class="help-steps">
    <div class="help-step"><span class="help-step-num">6</span><div>Tap the company card to open the Company screen.</div></div>
    <div class="help-step"><span class="help-step-num">7</span><div>Read any sticky notes from the office.</div></div>
    <div class="help-step"><span class="help-step-num">8</span><div>Tap <strong>Begin Testing →</strong> to open the Employee List.</div></div>
  </div>
  <h3>For each employee</h3>
  <div class="help-steps">
    <div class="help-step"><span class="help-step-num">9</span><div>Tap the employee's name to open the <strong>Pre-Test Questionnaire</strong>.</div></div>
    <div class="help-step"><span class="help-step-num">10</span><div>Answer mandatory questions regarding recent noise exposure and hearing protection use.</div></div>
    <div class="help-step"><span class="help-step-num">11</span><div>Conduct the audiometric test on the audiometer, then proceed to Test Entry.</div></div>
    <div class="help-step"><span class="help-step-num">12</span><div>Enter the thresholds, checking the live audiogram as you go.</div></div>
    <div class="help-step"><span class="help-step-num">13</span><div>Tap <strong>Save Draft</strong> if you need to pause.</div></div>
    <div class="help-step"><span class="help-step-num">14</span><div>Tap <strong>Classify →</strong> when all thresholds are entered.</div></div>
    <div class="help-step"><span class="help-step-num">15</span><div>Review the result. Tap <strong>Re-enter</strong> if anything looks wrong.</div></div>
    <div class="help-step"><span class="help-step-num">16</span><div>Tap <strong>Counsel →</strong> and review or edit the counsel text.</div></div>
    <div class="help-step"><span class="help-step-num">17</span><div>If the result is Abnormal or STS, complete the referral form on-site now. Tap <strong>Print Referral Form</strong> if needed.</div></div>
    <div class="help-step"><span class="help-step-num">18</span><div>Add any tech notes, then tap <strong>Finalize & Review →</strong>.</div></div>
    <div class="help-step"><span class="help-step-num">19</span><div>Review the Finalize Test summary and tap <strong>Confirm &amp; Save</strong>.</div></div>
    <div class="help-step"><span class="help-step-num">20</span><div>Repeat from step 9 for the next employee.</div></div>
  </div>
  <h3>End of visit</h3>
  <div class="help-steps">
    <div class="help-step"><span class="help-step-num">20</span><div>When all employees are resolved, tap <strong>Submit Packet →</strong>.</div></div>
    <div class="help-step"><span class="help-step-num">21</span><div>Tap <strong>Submit to Sync Folder</strong>. Connect the sync folder if prompted.</div></div>
    <div class="help-step"><span class="help-step-num">22</span><div>Wait for the success confirmation. The visit is complete.</div></div>
  </div>
`,

classifications: `
  <h2>Classifications Reference</h2>
  <p>Classifications are assigned automatically by TechTool based on the provincial rules embedded in the packet. The rules are set by the office in MasterDB and travel with every packet.</p>
  <p>When a result is Abnormal or STS, complete the referral to a physician or audiologist on-site during the counselling session using the paper referral forms. You can also print the referral form directly from TechTool.</p>

  <h3>Alberta (OHS Code Part 16)</h3>
  <p>Five rules across two outcomes. Rules 1–3 fire on any test — no baseline needed. Rules 4 and 5 require a baseline.</p>

  <table class="help-table">
    <thead><tr><th>Code</th><th>Label</th><th>What it means on-site</th></tr></thead>
    <tbody>
      <tr>
        <td><span style="background:#f0fff4;color:#276749;border:1px solid #9ae6b4;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">N</span></td>
        <td>Normal</td>
        <td>No significant finding. Standard counsel. No special action required.</td>
      </tr>
      <tr>
        <td><span style="background:#fffbeb;color:#7b5e00;border:1px solid #f6e05e;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">EW</span></td>
        <td>Standard Threshold Shift</td>
        <td>Average shift ≥ 10 dB at 2K+3K+4K vs baseline. Notify worker within 30 days. Forward to physician or audiologist. Complete referral on-site.</td>
      </tr>
      <tr>
        <td><span style="background:#fff5f5;color:#9b2335;border:1px solid #feb2b2;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">A</span></td>
        <td>Abnormal</td>
        <td>Significant finding. Medical referral required — complete on-site. Notify supervisor if possible.</td>
      </tr>
    </tbody>
  </table>

  <h4>Rule 1 — Abnormal: threshold &gt; 25 dB at 500–2000 Hz</h4>
  <p>No baseline needed. Example: right ear 1000 Hz = 30 dB.</p>
  <table class="help-table">
    <thead><tr><th>Ear</th><th>500</th><th>1k</th><th>2k</th><th>3k</th><th>4k</th><th>6k</th><th>8k</th></tr></thead>
    <tbody>
      <tr><td>Right</td><td>20</td><td><strong>30</strong></td><td>20</td><td>15</td><td>15</td><td>20</td><td>20</td></tr>
      <tr><td>Left</td><td>15</td><td>20</td><td>15</td><td>10</td><td>10</td><td>15</td><td>15</td></tr>
    </tbody>
  </table>

  <h4>Rule 2 — Abnormal: threshold &gt; 60 dB at 3000–6000 Hz</h4>
  <p>No baseline needed. Example: right ear 4000 Hz = 65 dB.</p>
  <table class="help-table">
    <thead><tr><th>Ear</th><th>500</th><th>1k</th><th>2k</th><th>3k</th><th>4k</th><th>6k</th><th>8k</th></tr></thead>
    <tbody>
      <tr><td>Right</td><td>15</td><td>20</td><td>25</td><td>25</td><td><strong>65</strong></td><td>55</td><td>50</td></tr>
      <tr><td>Left</td><td>15</td><td>15</td><td>20</td><td>20</td><td>30</td><td>35</td><td>30</td></tr>
    </tbody>
  </table>

  <h4>Rule 3 — Abnormal: asymmetry &gt; 30 dB averaged at 3K+4K+6K</h4>
  <p>No baseline needed. Catches significant one-sided hearing loss. Example: right avg = 23.3 dB, left avg = 61.7 dB, difference = 38.3 dB.</p>
  <table class="help-table">
    <thead><tr><th>Ear</th><th>500</th><th>1k</th><th>2k</th><th>3k</th><th>4k</th><th>6k</th><th>8k</th></tr></thead>
    <tbody>
      <tr><td>Right</td><td>15</td><td>15</td><td>20</td><td>20</td><td>25</td><td>25</td><td>30</td></tr>
      <tr><td>Left</td><td>15</td><td>20</td><td>25</td><td><strong>60</strong></td><td><strong>65</strong></td><td><strong>60</strong></td><td>55</td></tr>
    </tbody>
  </table>

  <h4>Rule 4 — Abnormal Shift: ≥ 15 dB at two consecutive frequencies 1K–6K vs baseline</h4>
  <p>Requires baseline. Both frequencies in a pair must shift ≥ 15 dB. Example: right 2K shifts +15, right 3K shifts +20.</p>
  <table class="help-table">
    <thead><tr><th></th><th>500</th><th>1k</th><th>2k</th><th>3k</th><th>4k</th><th>6k</th><th>8k</th></tr></thead>
    <tbody>
      <tr><td>Baseline R</td><td>10</td><td>10</td><td>15</td><td>15</td><td>20</td><td>20</td><td>25</td></tr>
      <tr><td>Current R</td><td>10</td><td>10</td><td><strong>30</strong></td><td><strong>35</strong></td><td>25</td><td>25</td><td>30</td></tr>
      <tr><td>Shift</td><td>0</td><td>0</td><td><strong>+15</strong></td><td><strong>+20</strong></td><td>+5</td><td>+5</td><td>+5</td></tr>
    </tbody>
  </table>

  <h4>Rule 5 — Standard Threshold Shift (STS): average shift ≥ 10 dB at 2K+3K+4K vs baseline</h4>
  <p>Requires baseline. Average of shifts at exactly 2K, 3K, and 4K must reach 10 dB. Example: +10 dB at each → average = 10.0 dB → EW. This example does not trigger Rule 4 because no single pair both reach 15 dB. When both rules fire, Rule 4 (Abnormal) takes precedence.</p>
  <table class="help-table">
    <thead><tr><th></th><th>500</th><th>1k</th><th>2k</th><th>3k</th><th>4k</th><th>6k</th><th>8k</th></tr></thead>
    <tbody>
      <tr><td>Baseline R</td><td>10</td><td>10</td><td>15</td><td>15</td><td>20</td><td>20</td><td>25</td></tr>
      <tr><td>Current R</td><td>10</td><td>10</td><td><strong>25</strong></td><td><strong>25</strong></td><td><strong>30</strong></td><td>25</td><td>30</td></tr>
      <tr><td>Shift</td><td>0</td><td>0</td><td><strong>+10</strong></td><td><strong>+10</strong></td><td><strong>+10</strong></td><td>+5</td><td>+5</td></tr>
    </tbody>
  </table>
  <p>Average = (10+10+10) ÷ 3 = <strong>10.0 dB</strong> → EW / STS flag set.</p>

  <h3>British Columbia (WorkSafeBC)</h3>
  <table class="help-table">
    <thead><tr><th>Code</th><th>Label</th><th>What it means on-site</th></tr></thead>
    <tbody>
      <tr>
        <td><span style="background:#f0fff4;color:#276749;border:1px solid #9ae6b4;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">N</span></td>
        <td>Normal</td>
        <td>No significant finding on baseline test.</td>
      </tr>
      <tr>
        <td><span style="background:#fffbeb;color:#7b5e00;border:1px solid #f6e05e;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">EW</span></td>
        <td>Early Warning</td>
        <td>Noise notch detected on baseline test. Retest in 12 months. Reinforce HPD use.</td>
      </tr>
      <tr>
        <td><span style="background:#fff5f5;color:#9b2335;border:1px solid #feb2b2;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">A</span></td>
        <td>Abnormal</td>
        <td>Threshold ≥ 30 dB on baseline test. Medical referral required — complete on-site.</td>
      </tr>
      <tr>
        <td><span style="background:#f0fff4;color:#276749;border:1px solid #9ae6b4;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">NC</span></td>
        <td>Normal Change</td>
        <td>Periodic test — no significant shift from baseline.</td>
      </tr>
      <tr>
        <td><span style="background:#fffbeb;color:#7b5e00;border:1px solid #f6e05e;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">EWC</span></td>
        <td>Early Warning Change</td>
        <td>Periodic test — shift ≥ 15 dB at 3K or 4K vs baseline. Retest in 12 months.</td>
      </tr>
      <tr>
        <td><span style="background:#fff5f5;color:#9b2335;border:1px solid #feb2b2;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">AC</span></td>
        <td>Abnormal Change</td>
        <td>Periodic test — shift ≥ 15 dB at two adjacent frequencies vs baseline. Medical referral required — complete on-site.</td>
      </tr>
    </tbody>
  </table>

  <h3>Saskatchewan (OHS Regulations 1996)</h3>
  <table class="help-table">
    <thead><tr><th>Code</th><th>Label</th><th>What it means on-site</th></tr></thead>
    <tbody>
      <tr>
        <td><span style="background:#f0fff4;color:#276749;border:1px solid #9ae6b4;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">N</span></td>
        <td>Normal</td>
        <td>No significant finding. No special action required.</td>
      </tr>
      <tr>
        <td><span style="background:#fffbeb;color:#7b5e00;border:1px solid #f6e05e;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">EW</span></td>
        <td>Early Warning</td>
        <td>Single frequency shift ≥ 15 dB at 2K–6K vs baseline. Retest within 24 months. Reinforce HPD use.</td>
      </tr>
      <tr>
        <td><span style="background:#fff5f5;color:#9b2335;border:1px solid #feb2b2;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">A</span></td>
        <td>Abnormal</td>
        <td>Absolute or shift threshold exceeded. Medical referral required — complete on-site. Notify supervisor if possible.</td>
      </tr>
    </tbody>
  </table>

  <h3>No baseline on file</h3>
  <p>If the employee has no baseline, TechTool classifies using absolute threshold rules only and shows a "No baseline on file" warning. The office will set a baseline when the packet is imported.</p>

  <h3>NR (No Response)</h3>
  <p>Enter NR when the employee cannot hear the tone at maximum audiometer output. In practice, enter 100 dB if using TechTool directly, or select 95+ in the WorkSafeBC portal.</p>
`,

troubleshooting: `
  <h2>Troubleshooting</h2>
  <h3>Sync finds no packets</h3>
  <table class="help-table">
    <thead><tr><th>Cause</th><th>Fix</th></tr></thead>
    <tbody>
      <tr><td>Wrong folder selected</td><td>Select the root of your OneDrive sync folder, not a subfolder. TechTool looks in <code>techs/[your folder name]</code> automatically.</td></tr>
      <tr><td>Folder name not set</td><td>Go to Settings and check your folder name matches what the office configured.</td></tr>
      <tr><td>Office hasn't generated the packet yet</td><td>Contact the office to confirm the packet has been generated.</td></tr>
      <tr><td>Packet already on device</td><td>Check the Schedule screen — it may already be there.</td></tr>
    </tbody>
  </table>
  <h3>Classify button shows a validation error</h3>
  <ul style="margin:8px 0 0 20px;font-size:13px;line-height:1.8">
    <li>At least one threshold must be entered.</li>
    <li>All values must be multiples of 5 (dropdowns enforce this).</li>
    <li>NR should only be used when the employee genuinely could not hear the tone.</li>
  </ul>
  <h3>Classification result looks wrong</h3>
  <p>Tap <strong>Re-enter thresholds</strong> and compare your paper record against TechTool. If still incorrect after confirming the data, note it in Tech Notes and flag it for the office.</p>
  <h3>Draft not restoring</h3>
  <ul style="margin:8px 0 0 20px;font-size:13px;line-height:1.8">
    <li>Navigate back to the Employee List and tap the employee again.</li>
    <li>Confirm you are using the same browser on the same device where the draft was saved.</li>
  </ul>
  <h3>Submit fails</h3>
  <table class="help-table">
    <thead><tr><th>Error</th><th>Fix</th></tr></thead>
    <tbody>
      <tr><td>No sync folder connected</td><td>Select your OneDrive folder. You need an active internet/OneDrive connection.</td></tr>
      <tr><td>Folder name not set</td><td>Go to Settings and add your folder name.</td></tr>
      <tr><td>Permission denied</td><td>Reload TechTool and try again — you will be prompted to re-grant access.</td></tr>
    </tbody>
  </table>
  <h3>Accidentally cleared data with unsubmitted packets</h3>
  <p>The packet data is permanently lost. Contact the office immediately — tests may need to be re-conducted. Always submit packets before clearing data and take a paper backup during testing visits.</p>
`

} // end SECTIONS

const HELP_STYLES = `
  .help-layout {
    display: grid;
    grid-template-columns: 195px 1fr;
    gap: 16px;
    padding: 16px;
    align-items: start;
    height: calc(100vh - 56px);
    overflow: hidden;
  }
  .help-nav {
    background: var(--surface, #fff);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px;
    padding: 8px 0;
    overflow-y: auto;
    height: 100%;
  }
  .help-nav-section { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted, #6b7280); padding: 12px 14px 4px; }
  .help-nav-item { display: block; width: 100%; text-align: left; padding: 7px 14px; font-size: 13px; background: none; border: none; cursor: pointer; color: var(--text-secondary, #374151); transition: background .1s, color .1s; }
  .help-nav-item:hover { background: var(--grey-100, #f3f4f6); }
  .help-nav-item.active { background: var(--blue-light, #eff6ff); color: var(--blue-mid, #2563eb); font-weight: 600; }
  .help-content { background: var(--surface, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 8px; padding: 24px 28px; overflow-y: auto; height: 100%; }
  .help-content h2 { font-size: 20px; font-weight: 700; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid var(--border, #e5e7eb); }
  .help-content h3 { font-size: 15px; font-weight: 600; margin: 20px 0 8px; }
  .help-content h4 { font-size: 13px; font-weight: 600; margin: 16px 0 6px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted, #6b7280); }
  .help-content p { font-size: 13px; line-height: 1.7; color: var(--text-secondary, #374151); margin-bottom: 10px; }
  .help-content ul { font-size: 13px; line-height: 1.8; color: var(--text-secondary, #374151); }
  .help-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 10px 0 16px; }
  .help-table thead th { background: var(--grey-50, #f9fafb); border-bottom: 2px solid var(--border, #e5e7eb); padding: 7px 10px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted, #6b7280); }
  .help-table tbody td { padding: 8px 10px; border-bottom: 1px solid var(--grey-100, #f3f4f6); vertical-align: top; line-height: 1.5; }
  .help-steps { display: flex; flex-direction: column; gap: 8px; margin: 10px 0 16px; }
  .help-step { display: flex; gap: 12px; align-items: flex-start; font-size: 13px; line-height: 1.6; color: var(--text-secondary, #374151); }
  .help-step-num { flex-shrink: 0; width: 22px; height: 22px; background: var(--blue-mid, #2563eb); color: #fff; border-radius: 50%; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
  .help-code { background: var(--grey-50, #f9fafb); border: 1px solid var(--border, #e5e7eb); border-radius: 6px; padding: 8px 12px; font-family: monospace; font-size: 13px; margin: 8px 0 10px; }
`

if (!document.getElementById('techtool-help-styles')) {
  const style = document.createElement('style')
  style.id = 'techtool-help-styles'
  style.textContent = HELP_STYLES
  document.head.appendChild(style)
}
