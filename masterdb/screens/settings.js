import { query, run, queryOne } from '../db/sqlite.js'
import { exportDB }             from '../db/sqlite.js'
import { pickSyncFolder, getSyncFolder } from '@shared/fs/sync-folder.js'
import { isDemoLoaded, clearDemoData }   from '../db/demo.js'
import { applyTheme, saveThemeColor, loadThemeColor, DEFAULT_COLOR } from '../theme.js'

export function renderSettings(container, state, navigate) {
  const provinces = query('SELECT * FROM provinces ORDER BY province_code')

  // Load org profile from settings table
  const orgName    = queryOne(`SELECT value FROM settings WHERE key = 'org_name'`)?.value    ?? ''
  const orgAddress = queryOne(`SELECT value FROM settings WHERE key = 'org_address'`)?.value ?? ''
  const orgCity    = queryOne(`SELECT value FROM settings WHERE key = 'org_city'`)?.value    ?? ''
  const orgProvince= queryOne(`SELECT value FROM settings WHERE key = 'org_province'`)?.value ?? ''
  const orgPostal  = queryOne(`SELECT value FROM settings WHERE key = 'org_postal'`)?.value  ?? ''
  const orgPhone   = queryOne(`SELECT value FROM settings WHERE key = 'org_phone'`)?.value   ?? ''
  const orgEmail   = queryOne(`SELECT value FROM settings WHERE key = 'org_email'`)?.value   ?? ''
  const orgWebsite = queryOne(`SELECT value FROM settings WHERE key = 'org_website'`)?.value ?? ''

  // Load custom favicon if exists
  const faviconUrl = queryOne(`SELECT value FROM settings WHERE key = 'company_favicon'`)?.value ?? 'favicon.ico';

  container.innerHTML = `
    <div class="page">
      <div class="page-header"><h1>Settings</h1></div>

      <div class="settings-sections">

        <!-- 1. Organization Profile -->
        <section class="settings-section">
          <h2>Organization Profile</h2>
          <p class="section-desc">Standardizes info for reports and referral forms.</p>
          <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;margin-top:8px">
            <div class="form-group" style="grid-column:1/-1">
              <label>Organization Name</label>
              <input id="org-name" type="text" value="${esc(orgName)}" />
            </div>
            <div class="form-group">
              <label>Phone</label>
              <input id="org-phone" type="tel" value="${esc(orgPhone)}" />
            </div>
            <div class="form-group">
              <label>Email</label>
              <input id="org-email" type="email" value="${esc(orgEmail)}" />
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="btn-save-org" style="margin-top:12px">Save Profile</button>
          <div id="org-msg" class="alert hidden" style="margin-top:8px"></div>
        </section>

        <!-- 2. Company Logo -->
        <section class="settings-section">
          <h2>Company Logo</h2>
          <p class="section-desc">Displayed in the sidebar and on printed reports.</p>
          ${state.logoUrl ? `
            <img src="${state.logoUrl}" style="max-height: 60px; margin-bottom: 10px; display:block;" />
            <button class="btn btn-ghost btn-sm" id="btn-remove-logo" style="color:var(--red)">Remove Logo</button>
          ` : ''}
          <label class="btn btn-outline btn-sm">
            ${state.logoUrl ? 'Change Logo' : 'Upload Logo'}
            <input type="file" accept="image/*" id="logo-input" style="display:none" />
          </label>
        </section>

        <!-- 3. NEW: Browser Icon (Favicon) -->
        <section class="settings-section">
          <h2>Browser Tab Icon (Favicon)</h2>
          <p class="section-desc">The small icon that appears on the browser tab. Recommended: Square PNG or ICO, 64x64px.</p>
          <div style="display:flex; align-items:center; gap:20px; margin-top:10px;">
            <div style="width:40px; height:40px; border:1px solid #ddd; display:flex; align-items:center; justify-content:center; background:white; border-radius:4px;">
                <img id="favicon-preview" src="${faviconUrl}" style="width:32px; height:32px; object-fit:contain;" />
            </div>
            <label class="btn btn-outline btn-sm">
              Upload New Icon
              <input type="file" accept="image/x-icon,image/png" id="favicon-input" style="display:none" />
            </label>
            <button class="btn btn-ghost btn-sm" id="btn-reset-favicon">Reset to Default</button>
          </div>
        </section>

        <!-- 4. Theme Color -->
        <section class="settings-section">
          <h2>Theme Color</h2>
          <div style="display:flex;align-items:center;gap:12px;margin-top:4px">
            <input type="color" id="theme-color-input" value="${loadThemeColor()}" style="width:48px;height:36px;cursor:pointer;" />
            <button class="btn btn-ghost btn-sm" id="btn-reset-color">Reset to Green</button>
          </div>
        </section>

        <!-- 5. OneDrive Sync -->
        <section class="settings-section">
          <h2>OneDrive Sync Folder</h2>
          <div class="folder-status-row">
            <span class="${state.syncFolder ? 'status-online' : 'status-offline'}">
              ${state.syncFolder ? '● Connected' : '○ Disconnected'}
            </span>
          </div>
          <button class="btn btn-primary btn-sm" id="btn-pick-folder" style="margin-top:10px">
            ${state.syncFolder ? 'Change Folder' : 'Connect Folder'}
          </button>
        </section>

        <!-- 6. Maintenance -->
        <section class="settings-section">
          <h2>Maintenance</h2>
          <button class="btn btn-outline btn-sm" id="btn-export-db">Export Backup (.sqlite)</button>
          ${isDemoLoaded() ? `<button class="btn btn-outline btn-sm" id="btn-clear-demo" style="color:var(--red); margin-left:10px">Clear Demo Data</button>` : ''}
        </section>

      </div>
    </div>
  `

  // --- Handlers ---

  container.querySelector('#btn-save-org').onclick = () => {
    const fields = {
      org_name: container.querySelector('#org-name').value.trim(),
      org_phone: container.querySelector('#org-phone').value.trim(),
      org_email: container.querySelector('#org-email').value.trim()
    }
    for (const [key, value] of Object.entries(fields)) {
      run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value])
    }
    state.orgProfile = fields; alert("Profile saved.");
  };

  // Logo Handler
  container.querySelector('#logo-input').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const dataUrl = await resizeImage(file, 400, 160);
    run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('company_logo', ?)`, [dataUrl]);
    state.logoUrl = dataUrl; navigate('settings');
  };

  // FAVICON HANDLER
  container.querySelector('#favicon-input').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    // Resize to 64x64 for a clean icon
    const dataUrl = await resizeImage(file, 64, 64);
    run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('company_favicon', ?)`, [dataUrl]);
    
    // Apply immediately to the current tab
    applyFavicon(dataUrl);
    navigate('settings');
  };

  container.querySelector('#btn-reset-favicon').onclick = () => {
      run(`DELETE FROM settings WHERE key = 'company_favicon'`);
      applyFavicon('favicon.ico');
      navigate('settings');
  };

  container.querySelector('#theme-color-input').onchange = (e) => {
    saveThemeColor(e.target.value);
    applyTheme(e.target.value);
  };

  container.querySelector('#btn-reset-color').onclick = () => {
    applyTheme(DEFAULT_COLOR); saveThemeColor(DEFAULT_COLOR); navigate('settings');
  };

  container.querySelector('#btn-pick-folder').onclick = async () => {
    state.syncFolder = await pickSyncFolder(); navigate('settings');
  };

  container.querySelector('#btn-export-db').onclick = () => exportDB();
}

// --- UTILS ---

function applyFavicon(url) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    link.href = url;
}

function resizeImage(file, maxW, maxH) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }