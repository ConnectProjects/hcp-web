/**
 * screens/help.js
 *
 * Full Technical Manual for MasterDB.
 * Features: Admin-editable sections synced via OneDrive.
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
          <p style="color:var(--grey-500);font-size:13px;margin-top:4px">User Manual & Regulatory Reference</p>
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

        <div class="help-content-wrap" style="position:relative;">
          ${isAdmin ? `<button class="btn btn-sm btn-primary" id="btn-edit-help" style="position:absolute; top:10px; right:10px; z-index:10; background:var(--navy-mid);">Edit Section</button>` : ''}
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
          <textarea id="help-editor" style="width:100%; height:400px; font-family:monospace; font-size:12px; padding:10px; border:1px solid #ccc;"></textarea>
          <p style="font-size:11px; color:#666; margin-top:10px;">Note: Use standard HTML tags. Changes will sync to all users on OneDrive.</p>
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

  // Load content from DB with Fallback to hardcoded SECTIONS
  function showSection(id) {
    currentSection = id;
    navBtns.forEach(b => b.classList.toggle('active', b.dataset.section === id));
    
    // Check if we have a custom version in the database
    let content = '';
    try {
        const row = queryOne("SELECT content FROM help_content WHERE section_id = ?", [id]);
        content = row ? row.content : SECTIONS[id];
    } catch (e) {
        content = SECTIONS[id]; // Table doesn't exist yet
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
        editor.value = contentEl.innerHTML;
        editModal.classList.remove('hidden');
    };

    container.querySelector('#btn-edit-cancel').onclick = () => editModal.classList.add('hidden');

    container.querySelector('#btn-edit-save').onclick = async () => {
        const newContent = editor.value;
        
        // 1. Save to local SQLite
        run("INSERT OR REPLACE INTO help_content (section_id, content) VALUES (?, ?)", [currentSection, newContent]);
        
        // 2. Push to OneDrive so others see it
        if (state.syncFolder) {
            const allHelp = query("SELECT * FROM help_content");
            await JsonDatabase.pushTable(state.syncFolder, 'help_content', allHelp);
        }

        editModal.classList.add('hidden');
        showSection(currentSection);
        alert("Help section updated and synced.");
    };
  }

  showSection('overview');
}

const SECTIONS = {
overview: `
  <h2>What is MasterDB?</h2>
  <p>MasterDB is the administrative hub of the Hearing Conservation Platform. It operates on a <strong>Shared Database Model</strong>, where data is stored as secure JSON files on OneDrive.</p>
  <h3>The 4-Tier Hierarchy (Schema 2.0)</h3>
  <ul>
    <li><strong>Company:</strong> The parent entity (e.g. Kal Tire).</li>
    <li><strong>Location:</strong> Physical sites. Province and contact info live here.</li>
    <li><strong>Employee:</strong> Workers assigned to a specific site.</li>
    <li><strong>Tests:</strong> Audiograms and baselines.</li>
  </ul>
`,
'getting-started': `
  <h2>Getting Started</h2>
  <h3>1. Connect OneDrive</h3>
  <p>If the <strong>Sync</strong> indicator is a hollow circle (○), click it to grant browser permission for this session.</p>
  <h3>2. Secure Login</h3>
  <p>Enter your 4-digit PIN. Your PIN is secured via SHA-256 Hashing.</p>
`,
'multi-user': `
  <h2>Multi-User Sync</h2>
  <p>MasterDB monitors OneDrive for changes. If a <strong>Red Warning Bar</strong> appears, click <strong>Refresh Data Now</strong> to sync your view.</p>
`,
classifications: `
  <h2>Classifications Reference</h2>
  <h3>Alberta (OHS Code Part 16)</h3>
  <p>Rule 5 (STS): Average shift ≥ 10 dB at 2k, 3k, 4k Hz vs baseline.</p>
  <h3>British Columbia (WorkSafeBC)</h3>
  <p>Baseline: N, EW, A. Periodic: NC, EWC, AC.</p>
`,
troubleshooting: `
  <h2>Troubleshooting</h2>
  <p>If data is missing, ensure the Sync Dot is Solid Green (●). Use <strong>Clear Site Data</strong> in DevTools if the app hangs.</p>
`
// ... You can add your full technical tables back here ...
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}