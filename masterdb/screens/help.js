/**
 * screens/help.js
 *
 * Full Technical Manual for MasterDB.
 * Features: Admin-editable sections, Side-nav layout, and OneDrive Sync.
 */

import { query, queryOne, run } from '../db/sqlite.js'
import { JsonDatabase } from '../../shared/fs/json-database.js'

export function renderHelp(container, state, navigate) {
  const isAdmin = state.user?.role === 'admin';

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

          <div class="help-nav-section">Maintenance</div>
          <button class="help-nav-item" data-section="legacy-import">Legacy Import</button>
          <button class="help-nav-item" data-section="data-tools">Data Tools</button>

          <div class="help-nav-section">Reference</div>
          <button class="help-nav-item" data-section="classifications">Classifications</button>
          <button class="help-nav-item" data-section="troubleshooting">Troubleshooting</button>
        </nav>

        <div class="help-content-wrap">
          ${isAdmin ? `<button class="btn btn-sm btn-primary" id="btn-edit-help">Edit Section</button>` : ''}
          <div class="help-content" id="help-content"></div>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div id="modal-edit-help" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-box modal-box--wide">
        <div class="modal-header"><h2>Edit Help Content (HTML)</h2></div>
        <div class="modal-body">
          <textarea id="help-editor" style="width:100%; height:450px; font-family:monospace; font-size:12px; padding:15px; border:1px solid #ccc; border-radius:8px;"></textarea>
          <p style="font-size:11px; color:#666; margin-top:10px;">Note: Changes will sync to all users via OneDrive.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="btn-edit-cancel">Cancel</button>
          <button class="btn btn-primary" id="btn-edit-save">Save & Sync</button>
        </div>
      </div>
    </div>
  `

  let currentSection = 'overview';
  const contentEl = container.querySelector('#help-content');
  const navBtns   = container.querySelectorAll('.help-nav-item');
  const editModal = container.querySelector('#modal-edit-help');
  const editor    = container.querySelector('#help-editor');

  function showSection(id) {
    currentSection = id;
    navBtns.forEach(b => b.classList.toggle('active', b.dataset.section === id));
    
    let content = '';
    try {
        const row = queryOne("SELECT content FROM help_content WHERE section_id = ?", [id]);
        content = row ? row.content : SECTIONS[id];
    } catch (e) {
        content = SECTIONS[id];
    }

    contentEl.innerHTML = content || '<p>Section not found.</p>';
    contentEl.scrollTop = 0;
  }

  // --- Handlers ---
  container.querySelector('#btn-back-help').onclick = () => navigate(state.helpReturnScreen || 'dashboard');

  navBtns.forEach(btn => {
    btn.onclick = () => showSection(btn.dataset.section);
  });

  if (isAdmin) {
    container.querySelector('#btn-edit-help').onclick = () => {
        editor.value = contentEl.innerHTML.trim();
        editModal.classList.remove('hidden');
    };
    container.querySelector('#btn-edit-cancel').onclick = () => editModal.classList.add('hidden');
    container.querySelector('#btn-edit-save').onclick = async () => {
        run("INSERT OR REPLACE INTO help_content (section_id, content) VALUES (?, ?)", [currentSection, editor.value]);
        if (state.syncFolder) {
            const allHelp = query("SELECT * FROM help_content");
            await JsonDatabase.pushTable(state.syncFolder, 'help_content', allHelp);
        }
        editModal.classList.add('hidden');
        showSection(currentSection);
    };
  }
  showSection('overview');
}

// ---------------------------------------------------------------------------
// DEFAULT CONTENT (The "Encyclopedia")
// ---------------------------------------------------------------------------
const SECTIONS = {
overview: `
  <h2>What is MasterDB?</h2>
  <p>MasterDB is the administrative hub of the HCP-Web platform. It operates on a <strong>Shared Database Model</strong>, where data is stored as secure JSON files on your organization's OneDrive.</p>
  <h3>The 4-Tier Hierarchy (Schema 2.0)</h3>
  <ul>
    <li><strong>Company:</strong> The parent organization (e.g. Kal Tire).</li>
    <li><strong>Location:</strong> Physical sites. Province and contact info live here.</li>
    <li><strong>Employee:</strong> Workers assigned to a specific site.</li>
    <li><strong>Tests:</strong> Audiograms and baselines.</li>
  </ul>
`,

'getting-started': `
  <h2>Getting Started</h2>
  <h3>1. Connect OneDrive</h3>
  <p>Browser security requires you to re-authorize folder access each session. If the <strong>Sync</strong> indicator is a hollow circle (○), click it to grant permission.</p>
  <h3>2. Secure Login</h3>
  <p>Select your name and enter your 4-digit PIN. Your PIN is secured via SHA-256 Hashing and cannot be recovered.</p>
`,

'multi-user': `
  <h2>Multi-User Synchronization</h2>
  <p>MasterDB monitors OneDrive for changes. If a <strong>Red Warning Bar</strong> appears, click <strong>Refresh Data Now</strong> to sync your view with the cloud.</p>
`,

dashboard: `
  <h2>Dashboard</h2>
  <p>The Dashboard provides a real-time overview of your program. Clicking any KPI tile navigates directly to that section.</p>
  <table class="help-table">
    <thead><tr><th>Tile</th><th>What it shows</th></tr></thead>
    <tbody>
      <tr><td>Companies</td><td>Total active companies in the cloud database</td></tr>
      <tr><td>Active Employees</td><td>Total workers currently marked 'active'</td></tr>
      <tr><td>Incoming Packets</td><td>Submitted files in the OneDrive inbox waiting for import</td></tr>
    </tbody>
  </table>
`,

companies: `
  <h2>Companies & Locations</h2>
  <p>In Schema 2.0, employees are tied to <strong>Locations</strong>, not just the company umbrella.</p>
  <h3>Managing Locations</h3>
  <p>Inside a company record, use the <strong>Locations</strong> tab to manage site-specific details. This allows one company to have sites in multiple provinces (e.g. an Edmonton site using AB rules and a Regina site using SK rules).</p>
`,

employees: `
  <h2>Employees</h2>
  <p>With over 6,000 records, the Employees screen uses <strong>Cascading Filters</strong> and <strong>Pagination</strong>.</p>
  <ul>
    <li><strong>Province Filter:</strong> Narrows the list of Companies.</li>
    <li><strong>Company Filter:</strong> Narrows the list of Locations.</li>
  </ul>
`,

team: `
  <h2>Team Management</h2>
  <p>The <strong>Team</strong> screen allows Administrators to manage user access and roles.</p>
  <table class="help-table">
    <thead><tr><th>Role</th><th>Permissions</th></tr></thead>
    <tbody>
      <tr><td><strong>Admin</strong></td><td>Full access to all data and system settings.</td></tr>
      <tr><td><strong>LC</strong></td><td>Access to Companies, Employees, and Packets. Blocked from Settings.</td></tr>
      <tr><td><strong>Aud-Tech</strong></td><td>Technicians can only log into the TechTool field app.</td></tr>
    </tbody>
  </table>
`,

packets: `
  <h2>Packets</h2>
  <p>A packet is a bundle of records sent to a technician for an on-site visit.</p>
  <div class="help-steps">
    <div class="help-step"><strong>Pending:</strong> Waiting for tech pickup.</div>
    <div class="help-step"><strong>Submitted:</strong> Completed by tech, waiting for office import.</div>
    <div class="help-step"><strong>Imported:</strong> Merged into the Master database.</div>
  </div>
`,

'legacy-import': `
  <h2>Legacy Import</h2>
  <p>Import historical data from old Excel workbooks using the <strong>Surgical CSV Macro</strong>.</p>
  <p>The importer handles common typos (like "JUY" for July) and "0" day birthdates automatically.</p>
`,

'data-tools': `
  <h2>Data Management Tools</h2>
  <h3>Bulk Move Employees</h3>
  <p>If employees were imported to the wrong site, use this tool to select them and move them (and history) to the correct site in one click.</p>
  <h3>Move Entire Locations</h3>
  <p>Use this to "re-parent" a location if a company is renamed or acquired.</p>
`,

classifications: `
  <h2>Classifications Reference</h2>
  <h3>Alberta (OHS Code Part 16)</h3>
  <p><strong>Rule 5 (STS):</strong> Average shift ≥ 10 dB at 2k, 3k, 4k Hz vs baseline.</p>
  <h4>Rule 1 — Abnormal: threshold > 25 dB at 500–2000 Hz</h4>
  <table class="help-table">
    <thead><tr><th>Ear</th><th>500</th><th>1k</th><th>2k</th></tr></thead>
    <tbody><tr><td>Right</td><td>20</td><td><strong>30</strong></td><td>20</td></tr></tbody>
  </table>
`,

troubleshooting: `
  <h2>Troubleshooting</h2>
  <p>If data is missing, ensure the Sync Dot is Solid Green (●). Use <strong>Clear Site Data</strong> in DevTools if the app hangs.</p>
`
};

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------
const HELP_STYLES = `
  .help-layout { display: grid; grid-template-columns: 220px 1fr; gap: 20px; align-items: start; margin-top: 20px; }
  .help-nav { background: #fff; border: 1px solid var(--grey-200); border-radius: 8px; padding: 8px 0; position: sticky; top: 16px; }
  .help-nav-section { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--grey-500); padding: 12px 14px 4px; }
  .help-nav-item { display: block; width: 100%; text-align: left; padding: 8px 14px; font-size: 13px; background: none; border: none; cursor: pointer; color: var(--grey-700); transition: background .1s; }
  .help-nav-item:hover { background: var(--grey-50); }
  .help-nav-item.active { background: var(--navy-light); color: var(--navy-mid); font-weight: 600; border-left: 4px solid var(--navy-mid); }
  .help-content-wrap { position: relative; min-height: 600px; }
  .help-content { background: #fff; border: 1px solid var(--grey-200); border-radius: 8px; padding: 30px 40px; overflow-y: auto; }
  .help-content h2 { font-size: 22px; font-weight: 700; color: var(--navy); margin-bottom: 15px; border-bottom: 2px solid var(--grey-200); padding-bottom: 10px; }
  .help-content p { font-size: 14px; line-height: 1.8; color: var(--grey-700); margin-bottom: 15px; }
  .help-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 16px 0; }
  .help-table th { background: var(--grey-50); text-align: left; padding: 8px; font-size: 11px; color: var(--grey-500); text-transform: uppercase; }
  .help-table td { padding: 10px 8px; border-bottom: 1px solid var(--grey-100); }
  #btn-edit-help { position: absolute; top: 15px; right: 15px; z-index: 5; background: #76B214; border:none; }
`;

if (!document.getElementById('help-styles')) {
  const style = document.createElement('style');
  style.id = 'help-styles';
  style.textContent = HELP_STYLES;
  document.head.appendChild(style);
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}