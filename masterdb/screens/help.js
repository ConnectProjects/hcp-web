/**
 * screens/help.js
 *
 * Full Technical & Administrative Manual for MasterDB.
 * Revised for Schema 2.0, Multi-User OneDrive Sync, and Role-Based Access.
 */

export function renderHelp(container, state, navigate) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>MasterDB Help</h1>
          <p style="color:var(--grey-500);font-size:13px;margin-top:4px">Full Technical Manual — Connect Hearing Industrial Division</p>
        </div>
        <button class="btn btn-outline" id="btn-back-help">← Back</button>
      </div>

      <div class="help-layout">
        <nav class="help-nav" id="help-nav">
          <div class="help-nav-section">Overview</div>
          <button class="help-nav-item active" data-section="overview">What is MasterDB?</button>
          <button class="help-nav-item" data-section="getting-started">Getting Started</button>
          <button class="help-nav-item" data-section="multi-user">Multi-User Sync</button>

          <div class="help-nav-section">Screens</div>
          <button class="help-nav-item" data-section="dashboard">Dashboard</button>
          <button class="help-nav-item" data-section="companies">Companies & Locations</button>
          <button class="help-nav-item" data-section="employees">Employees</button>
          <button class="help-nav-item" data-section="team">Team (Users)</button>
          <button class="help-nav-item" data-section="packets">Packets</button>
          <button class="help-nav-item" data-section="incoming">Incoming Packets</button>
          <button class="help-nav-item" data-section="reports">Reports</button>
          <button class="help-nav-item" data-section="settings">Settings</button>

          <div class="help-nav-section">Maintenance</div>
          <button class="help-nav-item" data-section="legacy-import">Legacy Import</button>
          <button class="help-nav-item" data-section="data-tools">Data Management Tools</button>

          <div class="help-nav-section">Reference</div>
          <button class="help-nav-item" data-section="classifications">Classifications Reference</button>
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

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section))
  })

  showSection('overview')
}

const SECTIONS = {

overview: `
  <h2>What is MasterDB?</h2>
  <p>MasterDB is the administrative hub of the Hearing Conservation Platform used by Connect Hearing's Industrial Division. It operates on a <strong>Shared Database Model</strong>, where data is stored as secure JSON files on your organization's OneDrive.</p>
  <h3>The 4-Tier Hierarchy (Schema 2.0)</h3>
  <p>To support complex employers and regulatory requirements, data is organized into four levels:</p>
  <ul>
    <li><strong>Company:</strong> The parent organization (e.g., Kal Tire). HQ details live here.</li>
    <li><strong>Location:</strong> Physical sites or branches. This level holds the Province (AB, BC, SK) and specific contact info.</li>
    <li><strong>Employee:</strong> Workers assigned to a specific location.</li>
    <li><strong>Tests:</strong> Individual audiometric records and historical baselines.</li>
  </ul>
  <h3>The Two-App Workflow</h3>
  <div class="help-steps">
    <div class="help-step"><span class="help-step-num">1</span><div><strong>Office creates a packet</strong> in MasterDB (Generate Packet) and saves it to the <code>techs/</code> folder on OneDrive.</div></div>
    <div class="help-step"><span class="help-step-num">2</span><div><strong>Technician opens the packet</strong> in TechTool on-site, conducts tests offline, and submits the completed results back to the <code>inbox/</code>.</div></div>
    <div class="help-step"><span class="help-step-num">3</span><div><strong>Office reviews and imports</strong> the completed packet in MasterDB, which writes all results to the cloud database for all users to see.</div></div>
  </div>
`,

'multi-user': `
  <h2>Multi-User Synchronization</h2>
  <p>MasterDB allows multiple office staff members to work simultaneously. Because the app runs in the browser, it uses a "Heartbeat" system to ensure data integrity.</p>
  <h3>The Heartbeat Sync Bar</h3>
  <p>Every 30 seconds, MasterDB checks if any files on OneDrive are newer than the data currently loaded in your browser. If another user saves a change, a <strong>Red Warning Bar</strong> will appear at the top of your screen.</p>
  <p>Click <strong>Refresh Data Now</strong> to merge the latest changes. <strong>Warning:</strong> Refreshing will reload the app; ensure you have saved any work on your current screen before clicking.</p>
  <h3>Concurrency Safety</h3>
  <p>To avoid "Last-Write-Wins" data loss, always click the Sync indicator (the green dot) or hit the Refresh button before starting a major data entry task or a large legacy import.</p>
`,

'getting-started': `
  <h2>Getting Started</h2>
  <h3>First launch & OneDrive Connection</h3>
  <p>On boot, MasterDB requires access to the shared folder. Look at the sidebar footer: if the <strong>Sync</strong> indicator is a hollow circle (○), click it to grant permission. Browser security requires this re-authorization once per session.</p>
  <h3>Secure Login</h3>
  <p>Select your name from the dropdown and enter your 4-digit PIN. MasterDB uses <strong>SHA-256 Hashing</strong>; your PIN is never stored as plain text. If you forget your PIN, an Administrator must reset it via the Team screen.</p>
  <h3>Recommended Setup Order</h3>
  <p>For new installations: Settings → connect sync folder → add team members → add companies → add employees → generate first packet.</p>
`,

dashboard: `
  <h2>Dashboard</h2>
  <p>The Dashboard gives you a quick overview of the current state of your program. Clicking the <strong>Companies</strong>, <strong>Active Employees</strong>, or <strong>Incoming Packets</strong> tiles navigates directly to those screens.</p>
  <table class="help-table">
    <thead><tr><th>Tile</th><th>What it shows</th></tr></thead>
    <tbody>
      <tr><td>Companies</td><td>Total active companies in the cloud database</td></tr>
      <tr><td>Active Employees</td><td>Employees with active status across all sites</td></tr>
      <tr><td>Incoming Packets</td><td>Files in the OneDrive inbox waiting for review</td></tr>
    </tbody>
  </table>
`,

companies: `
  <h2>Companies & Locations</h2>
  <p>The Companies screen lists all organizations. Because of <strong>Schema 2.0</strong>, employees belong to specific <strong>Locations</strong>.</p>
  <h3>Adding a Company</h3>
  <p>When you add a new company, the system automatically creates a default location called "Main Office" using the address and contact info you provided. You can add more sites later via the Company Detail screen.</p>
  <h3>Company Detail screen</h3>
  <p>Clicking any company opens its detail screen, which has four tabs:</p>
  <table class="help-table">
    <thead><tr><th>Tab</th><th>Contents</th></tr></thead>
    <tbody>
      <tr><td>Locations</td><td>Manage physical sites, their provinces, and HPD inventory.</td></tr>
      <tr><td>Employees</td><td>View and search workers assigned to this company's sites.</td></tr>
      <tr><td>Packets</td><td>View historical and pending field visit files.</td></tr>
      <tr><td>Notes</td><td>Internal sticky notes that travel to the tech in the field.</td></tr>
    </tbody>
  </table>
`,

employees: `
  <h2>Employees</h2>
  <p>The Employees screen manages your full dataset (6,000+ records) using high-performance <strong>Cascading Filters</strong>.</p>
  <h3>Cascading Filters</h3>
  <ul>
    <li><strong>Province:</strong> Narrows the list of Companies to only those with sites in that province.</li>
    <li><strong>Company:</strong> Narrows the list of Locations to only those sites.</li>
    <li><strong>Search:</strong> Live search by First or Last name.</li>
  </ul>
  <p>The list displays 100 workers at a time. Use the <strong>Next/Previous</strong> buttons at the bottom to navigate the full database.</p>
  <h3>Baselines</h3>
  <p>Each employee should have one active baseline per employer. The baseline is set automatically when a Baseline test is imported, or can be set manually via the Employee Detail screen.</p>
`,

team: `
  <h2>Team Management</h2>
  <p>The <strong>Team</strong> screen allows Administrators to manage user access and security roles.</p>
  <h3>User Roles & Permissions</h3>
  <table class="help-table">
    <thead><tr><th>Role</th><th>Access Level</th></tr></thead>
    <tbody>
      <tr><td><strong>Admin</strong></td><td>Full unrestricted access to both MasterDB and TechTool.</td></tr>
      <tr><td><strong>LC</strong></td><td>Logistical Coordinators. Access to Dashboard, Companies, Employees, Packets, and Reports. Blocked from Settings, Team, and Data Tools.</td></tr>
      <tr><td><strong>Aud-Tech</strong></td><td>Technicians. Full access to TechTool field app. Blocked from accessing MasterDB.</td></tr>
    </tbody>
  </table>
`,

'data-tools': `
  <h2>Data Management Tools</h2>
  <p>This screen contains surgical utilities for fixing structural errors in the database.</p>
  <h3>Bulk Move Employees</h3>
  <p>Use this if employees were imported to the wrong location. Select the source site, check the employees in the list, select the target site, and click <strong>Execute</strong>. This moves the worker and their full test history.</p>
  <h3>Move Entire Locations</h3>
  <p>Use this to "re-parent" a location. You can move an entire site record (and all its workers) to a different Company parent without losing any data links.</p>
`,

classifications: `
  <h2>Classifications Reference</h2>
  <p>Classifications are calculated based on the Province assigned to the <strong>Location</strong> where the test took place.</p>

  <h3>Alberta (OHS Code Part 16)</h3>
  <p>Alberta assessment produces: Normal (N), Abnormal (A), or Standard Threshold Shift (EW).</p>
  
  <h4>Rule 1 — Abnormal: threshold &gt; 25 dB at 500–2000 Hz</h4>
  <p>Fires if any threshold at 500, 1000, or 2000 Hz exceeds 25 dB. No baseline needed.</p>
  <table class="help-table">
    <thead><tr><th>Ear</th><th>500</th><th>1k</th><th>2k</th></tr></thead>
    <tbody><tr><td>Right</td><td>20</td><td><strong>30</strong></td><td>20</td></tr></tbody>
  </table>

  <h4>Rule 2 — Abnormal: threshold &gt; 60 dB at 3000–6000 Hz</h4>
  <p>Fires if any threshold at 3000, 4000, or 6000 Hz exceeds 60 dB. No baseline needed.</p>
  <table class="help-table">
    <thead><tr><th>Ear</th><th>3k</th><th>4k</th><th>6k</th></tr></thead>
    <tbody><tr><td>Right</td><td>25</td><td><strong>65</strong></td><td>55</td></tr></tbody>
  </table>

  <h4>Rule 3 — Abnormal: asymmetry &gt; 30 dB averaged at 3K+4K+6K</h4>
  <p>Fires if the average difference between ears at 3, 4, and 6 kHz is greater than 30 dB.</p>

  <h4>Rule 4 — Abnormal Shift: ≥ 15 dB at two consecutive frequencies 1K–6K vs baseline</h4>
  <p>Requires a baseline. Both frequencies in a consecutive pair must each shift ≥ 15 dB.</p>
  <table class="help-table">
    <thead><tr><th></th><th>1k</th><th>2k</th><th>3k</th></tr></thead>
    <tbody>
      <tr><td>Baseline R</td><td>10</td><td>15</td><td>15</td></tr>
      <tr><td>Current R</td><td>10</td><td><strong>30</strong></td><td><strong>35</strong></td></tr>
      <tr><td>Shift</td><td>0</td><td><strong>+15</strong></td><td><strong>+20</strong></td></tr>
    </tbody>
  </table>

  <h4>Rule 5 — Standard Threshold Shift (STS): average shift ≥ 10 dB at 2K+3K+4K vs baseline</h4>
  <p>Requires a baseline. The average of the three shifts at 2k, 3k, and 4k must reach 10 dB.</p>
  <p>Example: +10 dB at each frequency. Average = (10+10+10) / 3 = <strong>10.0 dB</strong> → EW.</p>

  <h3>British Columbia (WorkSafeBC)</h3>
  <table class="help-table">
    <thead><tr><th>Code</th><th>Label</th><th>Type</th></tr></thead>
    <tbody>
      <tr><td><span class="class-badge class-n">N</span></td><td>Normal</td><td>Baseline</td></tr>
      <tr><td><span class="class-badge class-ew">EW</span></td><td>Early Warning</td><td>Baseline</td></tr>
      <tr><td><span class="class-badge class-a">A</span></td><td>Abnormal</td><td>Baseline</td></tr>
      <tr><td><span class="class-badge class-nc">NC</span></td><td>Normal Change</td><td>Periodic</td></tr>
      <tr><td><span class="class-badge class-ewc">EWC</span></td><td>Early Warning Change</td><td>Periodic</td></tr>
      <tr><td><span class="class-badge class-ac">AC</span></td><td>Abnormal Change</td><td>Periodic</td></tr>
    </tbody>
  </table>

  <h3>Saskatchewan (OHS Regs 1996)</h3>
  <p>Saskatchewan assesses absolute thresholds for baselines (Average ≥ 25 dB at 500-6k) and shift rules for periodic tests (Shift ≥ 15 dB at two adjacent frequencies or ≥ 25 dB at any single frequency).</p>
`,

'legacy-import': `
  <h2>Legacy Import</h2>
  <p>Historical data from TechTool Excel workbooks must be converted using the <strong>Surgical CSV Macro</strong> before import.</p>
  <h3>Supported formats</h3>
  <table class="help-table">
    <thead><tr><th>Feature</th><th>Handling</th></tr></thead>
    <tbody>
      <tr><td>Fuzzy Dates</td><td>Handles typos like "JUY" or "SEPT" and "0" day birthdates.</td></tr>
      <li>Column Mapping</td><td>Automatically identifies "Birthdate MMDDYYYY" and "Test Date MMDDYYYY" headers.</td></tr>
      <li>Metadata</td><td>Extracts Company from Row 1 and Location from Tab Names.</td></tr>
    </tbody>
  </table>
`,

troubleshooting: `
  <h2>Troubleshooting</h2>
  <h3>"NOT NULL constraint failed: tests.test_date"</h3>
  <p>The importer found a row where the Test Date was unreadable or missing. Ensure the date follows a standard format (e.g., MMM DD YYYY) and re-run the export macro.</p>
  <h3>"0 records detected" during import</h3>
  <p>The importer requires "First Name", "Surname", and "Test Date" columns. If these are missing or misspelled in the CSV, the sheet will be skipped.</p>
  <h3>Sync folder disconnects</h3>
  <p>This is standard browser security. Re-click the Sync indicator at the start of each session if the dot is hollow (○).</p>
  <h3>Old code or data is showing</h3>
  <p>If you've made changes on GitHub but don't see them: Open DevTools (F12) → Application → Storage → <strong>Clear Site Data</strong>, then refresh.</p>
`

} // end SECTIONS

const HELP_STYLES = `
  .help-layout { display: grid; grid-template-columns: 220px 1fr; gap: 20px; align-items: start; }
  .help-nav { background: #fff; border: 1px solid var(--grey-200); border-radius: var(--radius); padding: 8px 0; position: sticky; top: 16px; }
  .help-nav-section { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--grey-500); padding: 12px 14px 4px; }
  .help-nav-item { display: block; width: 100%; text-align: left; padding: 8px 14px; font-size: 13px; background: none; border: none; cursor: pointer; color: var(--grey-700); transition: background .1s; }
  .help-nav-item:hover { background: var(--grey-50); }
  .help-nav-item.active { background: var(--navy-light); color: var(--navy-mid); font-weight: 600; }
  .help-content { background: #fff; border: 1px solid var(--grey-200); border-radius: var(--radius); padding: 30px 40px; min-height: 600px; overflow-y: auto; }
  .help-content h2 { font-size: 22px; font-weight: 700; color: var(--navy); margin-bottom: 15px; border-bottom: 2px solid var(--grey-200); padding-bottom: 10px; }
  .help-content h3 { font-size: 16px; font-weight: 600; margin: 25px 0 10px; color: var(--grey-900); }
  .help-content h4 { font-size: 14px; font-weight: 600; margin: 20px 0 8px; color: var(--navy-mid); text-transform: uppercase; }
  .help-content p, .help-content ul { font-size: 13px; line-height: 1.8; color: var(--grey-700); margin-bottom: 12px; }
  .help-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 16px 0; border: 1px solid var(--grey-100); }
  .help-table th { background: var(--grey-50); text-align: left; padding: 10px; font-size: 11px; color: var(--grey-500); text-transform: uppercase; border-bottom: 2px solid var(--grey-200); }
  .help-table td { padding: 12px 10px; border-bottom: 1px solid var(--grey-100); vertical-align: top; }
  .help-steps { display: flex; flex-direction: column; gap: 10px; margin: 15px 0; }
  .help-step { display: flex; gap: 15px; align-items: flex-start; font-size: 13px; line-height: 1.6; color: var(--grey-700); }
  .help-step-num { flex-shrink: 0; width: 24px; height: 24px; background: var(--navy-mid); color: #fff; border-radius: 50%; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
`

if (!document.getElementById('help-styles')) {
  const style = document.createElement('style')
  style.id = 'help-styles'
  style.textContent = HELP_STYLES
  document.head.appendChild(style)
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}