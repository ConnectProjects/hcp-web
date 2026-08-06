/**
 * spike-graph/spike.js — Phase 1a spike for the MasterDB v2 rebuild.
 *
 * Proves, from a browser MSAL token, every Graph operation the v2 architecture
 * rests on (DESIGN-masterdb-rebuild.md §2):
 *
 *   1. Resolve the SHARED folder (another user's drive) → driveId + itemId
 *   2. Download file content
 *   3. Upload with If-Match (correct eTag succeeds, stale eTag → 412)
 *   4. Create-if-absent (lock-file semantics: If-None-Match:* and
 *      conflictBehavior=fail — reports which of the two the tenant honors)
 *   5. Server-side copy (pre-import backup)
 *   6. Move between folders (packet archive)
 *   + Large-file upload session in 5 MiB chunks (masterdb.sqlite is ~20 MB;
 *     a plain PUT caps at ~4 MB, so the session API is load-bearing)
 *
 * All writes stay inside db/spike-test/ in the shared folder.
 */

const GRAPH = 'https://graph.microsoft.com/v1.0'
const SCOPES = ['User.Read', 'Files.ReadWrite.All']

const $ = s => document.querySelector(s)
const logEl = $('#log')

let msalApp = null
let account = null
// Addressing context filled in by locate(): everything after that uses
// /drives/{driveId}/items/{id} — never /me/drive — because the folder lives
// on Jan Brothen's drive, not the signed-in user's.
const ctx = { driveId: null, rootId: null, dbId: null, spikeId: null, foundVia: null }
const results = []   // { name, ok, detail }

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(cls, msg) {
  const line = document.createElement('div')
  line.className = cls
  const tag = { pass: 'PASS', fail: 'FAIL', info: 'INFO', warn: 'WARN' }[cls] ?? '    '
  line.textContent = `${new Date().toLocaleTimeString()}  [${tag}]  ${msg}`
  logEl.appendChild(line)
  logEl.scrollTop = logEl.scrollHeight
}

function record(name, ok, detail) {
  results.push({ name, ok, detail })
  log(ok ? 'pass' : 'fail', `${name} — ${detail}`)
}

function summarize() {
  const el = $('#summary')
  const passed = results.filter(r => r.ok).length
  el.hidden = false
  el.innerHTML = `<strong>${passed}/${results.length} checks passed</strong><br>` +
    results.map(r => `${r.ok ? '✅' : '❌'} ${r.name}: ${r.detail}`).join('<br>')
}

// ---------------------------------------------------------------------------
// Auth + fetch helpers
// ---------------------------------------------------------------------------

async function getToken() {
  try {
    const r = await msalApp.acquireTokenSilent({ scopes: SCOPES, account })
    return r.accessToken
  } catch (e) {
    const r = await msalApp.acquireTokenPopup({ scopes: SCOPES })
    return r.accessToken
  }
}

/** Authenticated Graph fetch. Returns the raw Response — callers judge status. */
async function gfetch(path, opts = {}) {
  const token = await getToken()
  return fetch(path.startsWith('https://') ? path : GRAPH + path, {
    ...opts,
    headers: { 'Authorization': `Bearer ${token}`, ...(opts.headers ?? {}) }
  })
}

async function gjson(path, opts = {}) {
  const res = await gfetch(path, opts)
  if (!res.ok) throw new Error(`${opts.method ?? 'GET'} ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

const item = id => `/drives/${ctx.driveId}/items/${id}`

// ---------------------------------------------------------------------------
// Step 1 — sign in
// ---------------------------------------------------------------------------

async function signIn() {
  const clientId = $('#clientId').value.trim()
  const tenantId = $('#tenantId').value.trim() || 'organizations'
  if (!clientId) { log('fail', 'Enter the Azure app Client ID first (see README.md).'); return }
  localStorage.setItem('spike_clientId', clientId)
  localStorage.setItem('spike_tenantId', tenantId)

  msalApp = new msal.PublicClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: window.location.origin
    },
    cache: { cacheLocation: 'localStorage' }
  })

  try {
    const result = await msalApp.loginPopup({ scopes: SCOPES })
    account = result.account
    msalApp.setActiveAccount(account)
    record('Sign-in + Files.ReadWrite.All consent', true, `signed in as ${account.username}`)
    $('#btn-locate').disabled = false
  } catch (e) {
    // Consent policy rejections are a spike FINDING, not a code bug — they mean
    // IT must grant the scope (or admin-consent the app) before v2 can exist.
    record('Sign-in + Files.ReadWrite.All consent', false, e.errorCode ?? e.message)
    log('warn', 'If this says consent/admin approval is required, that is a real spike finding: the Files.ReadWrite.All scope needs IT approval in this tenant.')
  }
}

// ---------------------------------------------------------------------------
// Step 2 — locate the shared folder (Verb 1: addressing)
// ---------------------------------------------------------------------------

async function locate() {
  const wanted = $('#folderName').value.trim().toLowerCase()
  localStorage.setItem('spike_folderName', $('#folderName').value.trim())
  try {
    // Path A: the folder was added as a OneDrive shortcut → it appears in the
    // user's OWN drive root as an item with a remoteItem facet.
    let found = null
    const own = await gjson(`/me/drive/root/children?$select=name,remoteItem,folder&$top=200`)
    found = (own.value ?? []).find(i => i.remoteItem && i.name.toLowerCase() === wanted)
    if (found) {
      ctx.foundVia = 'OneDrive shortcut (root/children remoteItem)'
      ctx.driveId = found.remoteItem.parentReference.driveId
      ctx.rootId = found.remoteItem.id
    } else {
      // Path B: classic share → /me/drive/sharedWithMe
      const shared = await gjson(`/me/drive/sharedWithMe`)
      found = (shared.value ?? []).find(i => (i.name ?? '').toLowerCase() === wanted)
      if (found) {
        ctx.foundVia = 'sharedWithMe'
        ctx.driveId = found.remoteItem.parentReference.driveId
        ctx.rootId = found.remoteItem.id
      }
    }
    if (!ctx.rootId) throw new Error(`No item named "${$('#folderName').value.trim()}" in root/children (shortcut) or sharedWithMe. Names seen: ` +
      (own.value ?? []).filter(i => i.remoteItem).map(i => i.name).join(' | '))

    // Prove we can enumerate the remote drive and find db/
    const kids = await gjson(`${item(ctx.rootId)}/children?$select=name,id,folder&$top=200`)
    const db = (kids.value ?? []).find(i => i.folder && i.name.toLowerCase() === 'db')
    if (!db) throw new Error(`Folder reachable but no "db" subfolder. Children: ${(kids.value ?? []).map(i => i.name).join(' | ')}`)
    ctx.dbId = db.id
    record('Verb 1: resolve shared folder + list remote drive', true,
      `via ${ctx.foundVia}; driveId=${ctx.driveId.slice(0, 12)}…; db/ found`)
    $('#btn-run').disabled = false
  } catch (e) {
    record('Verb 1: resolve shared folder + list remote drive', false, e.message)
  }
}

// ---------------------------------------------------------------------------
// Step 3 — verb tests inside db/spike-test/
// ---------------------------------------------------------------------------

async function ensureSpikeFolder() {
  const res = await gfetch(`${item(ctx.dbId)}/children`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'spike-test', folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
  })
  if (res.status === 201) { ctx.spikeId = (await res.json()).id; return }
  if (res.status === 409) {   // already exists from a previous run — reuse it
    const kids = await gjson(`${item(ctx.dbId)}/children?$select=name,id,folder`)
    ctx.spikeId = kids.value.find(i => i.name === 'spike-test')?.id
    if (ctx.spikeId) return
  }
  throw new Error(`create spike-test → ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

async function runVerbs() {
  $('#btn-run').disabled = true
  try { await ensureSpikeFolder(); log('info', `spike-test folder ready (${ctx.spikeId.slice(0, 12)}…)`) }
  catch (e) { record('Create spike-test folder', false, e.message); $('#btn-run').disabled = false; return }

  const putText = (name, text, headers = {}) =>
    gfetch(`${item(ctx.spikeId)}:/${name}:/content?@microsoft.graph.conflictBehavior=replace`, {
      method: 'PUT', headers: { 'Content-Type': 'text/plain', ...headers }, body: text
    })

  // --- Verb 2+3: upload, download, conditional upload -----------------------
  let eTag1 = null, eTag2 = null, fileId = null
  try {
    const res = await putText('hello.txt', 'spike v1')
    if (!res.ok) throw new Error(`initial PUT → ${res.status}`)
    const it = await res.json(); eTag1 = it.eTag; fileId = it.id
    record('Verb 3a: simple upload (PUT :/content)', true, `eTag ${eTag1?.slice(0, 18)}…`)
  } catch (e) { record('Verb 3a: simple upload', false, e.message) }

  try {
    // Download via the pre-authenticated downloadUrl (CORS-friendly, no auth
    // header) — the same mechanism v2 will use to fetch the 20 MB sqlite file.
    const meta = await gjson(`${item(fileId)}?$select=id,@microsoft.graph.downloadUrl`)
    const dl = await fetch(meta['@microsoft.graph.downloadUrl'])
    const text = await dl.text()
    record('Verb 2: download content', text === 'spike v1', `round-tripped "${text}"`)
  } catch (e) { record('Verb 2: download content', false, e.message) }

  try {
    const res = await gfetch(`${item(fileId)}/content`, {
      method: 'PUT', headers: { 'Content-Type': 'text/plain', 'If-Match': eTag1 }, body: 'spike v2'
    })
    if (!res.ok) throw new Error(`PUT If-Match(current) → ${res.status}`)
    eTag2 = (await res.json()).eTag
    record('Verb 3b: conditional upload, current eTag', eTag2 !== eTag1, `accepted; new eTag ${eTag2?.slice(0, 18)}…`)
  } catch (e) { record('Verb 3b: conditional upload, current eTag', false, e.message) }

  try {
    // THE critical check: a save with a stale eTag must be REJECTED (412).
    // This is the concurrent-write protection the old file-sync never had.
    const res = await gfetch(`${item(fileId)}/content`, {
      method: 'PUT', headers: { 'Content-Type': 'text/plain', 'If-Match': eTag1 }, body: 'spike v3 SHOULD NOT LAND'
    })
    record('Verb 3c: stale eTag rejected (412)', res.status === 412, `got ${res.status} (want 412)`)
  } catch (e) { record('Verb 3c: stale eTag rejected (412)', false, e.message) }

  // --- Verb 4: create-if-absent (write.lock semantics) ----------------------
  try {
    // Variant 1: If-None-Match: * on PUT
    const a1 = await gfetch(`${item(ctx.spikeId)}:/lock-inm.json:/content`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' }, body: '{"n":1}'
    })
    const a2 = await gfetch(`${item(ctx.spikeId)}:/lock-inm.json:/content`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' }, body: '{"n":2}'
    })
    const inmOk = a1.ok && (a2.status === 412 || a2.status === 409)
    // Variant 2: conflictBehavior=fail
    const b1 = await gfetch(`${item(ctx.spikeId)}:/lock-cb.json:/content?@microsoft.graph.conflictBehavior=fail`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"n":1}'
    })
    const b2 = await gfetch(`${item(ctx.spikeId)}:/lock-cb.json:/content?@microsoft.graph.conflictBehavior=fail`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"n":2}'
    })
    const cbOk = b1.ok && b2.status === 409
    record('Verb 4: create-if-absent (lock file)', inmOk || cbOk,
      `If-None-Match:* → ${a1.status}/${a2.status} (${inmOk ? 'works' : 'no'}); conflictBehavior=fail → ${b1.status}/${b2.status} (${cbOk ? 'works' : 'no'})`)
  } catch (e) { record('Verb 4: create-if-absent (lock file)', false, e.message) }

  // --- Verb 5: server-side copy (pre-import backup) -------------------------
  try {
    const res = await gfetch(`${item(fileId)}/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentReference: { driveId: ctx.driveId, id: ctx.spikeId }, name: 'hello-backup.txt' })
    })
    if (res.status !== 202) throw new Error(`copy → ${res.status} (want 202)`)
    // The 202 monitor URL doesn't allow CORS from browsers, so poll for the
    // target file instead — v2's backup step will do the same.
    let copied = null
    for (let i = 0; i < 15 && !copied; i++) {
      await new Promise(r => setTimeout(r, 1000))
      const kids = await gjson(`${item(ctx.spikeId)}/children?$select=name,id`)
      copied = kids.value.find(k => k.name === 'hello-backup.txt')
    }
    record('Verb 5: server-side copy (backup)', !!copied, copied ? `copy appeared after polling (202 + poll pattern works)` : 'copy never appeared within 15 s')
  } catch (e) { record('Verb 5: server-side copy (backup)', false, e.message) }

  // --- Verb 6: move (packet archive) ----------------------------------------
  try {
    const sub = await gjson(`${item(ctx.spikeId)}/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'archive', folder: {}, '@microsoft.graph.conflictBehavior': 'replace' })
    })
    const moved = await gjson(item(fileId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentReference: { id: sub.id }, name: 'hello-archived.txt' })
    })
    record('Verb 6: move + rename (archive)', moved.parentReference.id === sub.id, `now at archive/${moved.name}`)
  } catch (e) { record('Verb 6: move + rename (archive)', false, e.message) }

  // --- Upload session: the 20 MB masterdb.sqlite path -----------------------
  try {
    const SIZE = 9 * 1024 * 1024               // 9 MB — forces 2 chunks
    const CHUNK = 5 * 1024 * 1024              // 5 MiB = 16 × 320 KiB (Graph requires 320 KiB multiples)
    const blob = new Uint8Array(SIZE)
    crypto.getRandomValues(blob.subarray(0, 65536))   // marker bytes at the front
    const session = await gjson(`${item(ctx.spikeId)}:/big.bin:/createUploadSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } })
    })
    let result = null
    for (let start = 0; start < SIZE; start += CHUNK) {
      const end = Math.min(start + CHUNK, SIZE)
      // Upload URL is pre-authenticated — no Authorization header on chunks.
      const res = await fetch(session.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${start}-${end - 1}/${SIZE}` },
        body: blob.subarray(start, end)
      })
      if (res.status === 201 || res.status === 200) result = await res.json()
      else if (res.status !== 202) throw new Error(`chunk ${start} → ${res.status}: ${(await res.text()).slice(0, 200)}`)
    }
    record('Upload session: 9 MB in 5 MiB chunks', result?.size === SIZE, `final size ${result?.size} (want ${SIZE})`)
  } catch (e) { record('Upload session: 9 MB in 5 MiB chunks', false, e.message) }

  summarize()
  $('#btn-cleanup').disabled = false
  $('#btn-run').disabled = false
  log('info', 'Done. Use "Copy results" and paste them back into Claude Code.')
}

// ---------------------------------------------------------------------------
// Cleanup + copy
// ---------------------------------------------------------------------------

async function cleanup() {
  if (!ctx.spikeId) return
  const res = await gfetch(item(ctx.spikeId), { method: 'DELETE' })
  log(res.status === 204 ? 'pass' : 'fail', `Deleted db/spike-test → ${res.status}`)
  ctx.spikeId = null
  $('#btn-cleanup').disabled = true
}

function copyResults() {
  const text = [...logEl.children].map(l => l.textContent).join('\n')
  navigator.clipboard.writeText(text)
  log('info', 'Log copied to clipboard.')
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------

$('#clientId').value = localStorage.getItem('spike_clientId') ?? ''
$('#tenantId').value = localStorage.getItem('spike_tenantId') ?? ''
if (localStorage.getItem('spike_folderName')) $('#folderName').value = localStorage.getItem('spike_folderName')

$('#btn-signin').addEventListener('click', signIn)
$('#btn-locate').addEventListener('click', locate)
$('#btn-run').addEventListener('click', runVerbs)
$('#btn-cleanup').addEventListener('click', cleanup)
$('#btn-copy').addEventListener('click', copyResults)

log('info', 'Ready. Fill in the Client ID (README.md has the Azure registration steps), then Sign in.')
