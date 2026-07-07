/**
 * MSAL.js Authentication Stub — HCP-Web
 *
 * Wraps Microsoft Authentication Library (MSAL.js) for browser-based
 * Microsoft 365 / Azure AD sign-in and Microsoft Graph API token acquisition.
 *
 * Usage:
 *   1. Load MSAL.js from CDN in your HTML before this module:
 *      <script src="https://alcdn.msauth.net/browser/2.x.x/js/msal-browser.min.js"></script>
 *
 *   2. Provide your Azure AD app registration credentials in config.js:
 *      export const MSAL_CONFIG = {
 *        clientId: 'your-azure-app-client-id',
 *        tenantId: 'your-azure-tenant-id'  // or 'common' for multi-tenant
 *      }
 *
 *   3. In Azure AD, register a Single Page Application with:
 *      - Redirect URI: https://your-deployed-url.netlify.app
 *      - API permissions: Files.ReadWrite (Microsoft Graph, delegated)
 *
 * This stub provides a stable interface. Swap the internals when upgrading
 * MSAL.js versions without touching callers.
 *
 * Graph API OneDrive scopes required:
 *   - Files.ReadWrite — read/write packets in the shared OneDrive folder
 *   - User.Read       — identify the signed-in tech
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GRAPH_SCOPES = [
  'Files.ReadWrite',
  'User.Read'
]

// OneDrive folder paths used by TechTool and MasterDB
export const ONEDRIVE_PATHS = {
  inbox:   '/drive/root:/ConnectHearing/inbox',
  outbox:  '/drive/root:/ConnectHearing/outbox',
  archive: '/drive/root:/ConnectHearing/archive'
}

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0/me'

// ---------------------------------------------------------------------------
// MSAL instance (initialized lazily)
// ---------------------------------------------------------------------------

let _msalInstance = null

/**
 * Initialize the MSAL instance. Call once at app startup with your Azure config.
 *
 * @param {object} config
 * @param {string} config.clientId  - Azure AD app registration client ID
 * @param {string} config.tenantId  - Azure AD tenant ID, or 'common'
 */
export function initMsal(config) {
  if (typeof msal === 'undefined') {
    throw new Error('MSAL.js is not loaded. Add the CDN script tag before initializing.')
  }

  _msalInstance = new msal.PublicClientApplication({
    auth: {
      clientId:    config.clientId,
      authority:   `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: window.location.origin
    },
    cache: {
      cacheLocation:       'localStorage',
      storeAuthStateInCookie: false
    }
  })

  return _msalInstance
}

function getMsal() {
  if (!_msalInstance) throw new Error('MSAL not initialized. Call initMsal(config) first.')
  return _msalInstance
}

// ---------------------------------------------------------------------------
// Sign-in / sign-out
// ---------------------------------------------------------------------------

/**
 * Sign in the user via a popup window.
 * @returns {Promise<object>} MSAL AuthenticationResult
 */
export async function signIn() {
  const instance = getMsal()
  const result = await instance.loginPopup({ scopes: GRAPH_SCOPES })
  instance.setActiveAccount(result.account)
  return result
}

/**
 * Sign out the current user and clear the MSAL cache.
 */
export async function signOut() {
  const instance = getMsal()
  const account  = instance.getActiveAccount()
  if (account) {
    await instance.logoutPopup({ account })
  }
}

/**
 * Returns the currently signed-in account, or null.
 */
export function getAccount() {
  const instance = getMsal()
  return instance.getActiveAccount() ?? null
}

/**
 * Returns true if a user is currently signed in.
 */
export function isSignedIn() {
  return getAccount() !== null
}

// ---------------------------------------------------------------------------
// Token acquisition
// ---------------------------------------------------------------------------

/**
 * Acquire a Graph API access token silently, falling back to popup if needed.
 * @returns {Promise<string>} Bearer token string
 */
export async function getAccessToken() {
  const instance = getMsal()
  const account  = instance.getActiveAccount()
  if (!account) throw new Error('Not signed in. Call signIn() first.')

  try {
    const result = await instance.acquireTokenSilent({
      scopes:  GRAPH_SCOPES,
      account
    })
    return result.accessToken
  } catch (err) {
    // Silent acquisition failed (expired, consent needed) — fall back to popup
    if (err instanceof msal.InteractionRequiredAuthError) {
      const result = await instance.acquireTokenPopup({ scopes: GRAPH_SCOPES })
      return result.accessToken
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Graph API helpers
// ---------------------------------------------------------------------------

/**
 * Perform an authenticated Microsoft Graph API request.
 * @param {string} path    - Graph API path (e.g. '/me/drive/root:/inbox:/children')
 * @param {object} [opts]  - fetch options (method, body, headers merged with auth)
 * @returns {Promise<any>} Parsed JSON response
 */
export async function graphRequest(path, opts = {}) {
  const token = await getAccessToken()
  const url   = path.startsWith('https://') ? path : `${GRAPH_BASE}${path}`

  const response = await fetch(url, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      ...(opts.headers ?? {})
    }
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Graph API ${response.status}: ${body}`)
  }

  const text = await response.text()
  return text ? JSON.parse(text) : null
}

// ---------------------------------------------------------------------------
// OneDrive packet operations
// ---------------------------------------------------------------------------

/**
 * List all JSON packet files in a OneDrive folder.
 * @param {'inbox'|'outbox'|'archive'} folder
 * @returns {Promise<Array>} Array of Graph DriveItem objects
 */
export async function listPackets(folder) {
  const path = `${ONEDRIVE_PATHS[folder]}:/children`
  const data  = await graphRequest(path)
  return (data.value ?? []).filter(item => item.name.endsWith('.json'))
}

/**
 * Download a packet file from OneDrive and parse it.
 * @param {string} downloadUrl - DriveItem @microsoft.graph.downloadUrl
 * @returns {Promise<object>} Parsed packet JSON
 */
export async function downloadPacket(downloadUrl) {
  const token   = await getAccessToken()
  const response = await fetch(downloadUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!response.ok) throw new Error(`Download failed: ${response.status}`)
  return response.json()
}

/**
 * Upload a packet JSON object to a OneDrive folder.
 * @param {'inbox'|'outbox'} folder
 * @param {string} filename  - e.g. 'SunriseMilling_2026-04-15_NR.json'
 * @param {object} packet    - Packet object to serialize
 * @returns {Promise<object>} Graph DriveItem for the uploaded file
 */
export async function uploadPacket(folder, filename, packet) {
  const path  = `${ONEDRIVE_PATHS[folder]}:/${filename}:/content`
  const token = await getAccessToken()
  const url   = `${GRAPH_BASE}${path}`

  const response = await fetch(url, {
    method:  'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify(packet, null, 2)
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Upload failed ${response.status}: ${body}`)
  }

  return response.json()
}

/**
 * Move a file from one OneDrive folder to another (used to archive processed packets).
 * @param {string} itemId        - Graph DriveItem ID of the file
 * @param {'archive'} destFolder
 * @returns {Promise<object>} Updated DriveItem
 */
export async function moveToArchive(itemId, destFolder = 'archive') {
  // Get destination folder ID first
  const destInfo = await graphRequest(`${ONEDRIVE_PATHS[destFolder]}`)
  return graphRequest(`/me/drive/items/${itemId}`, {
    method: 'PATCH',
    body:   JSON.stringify({
      parentReference: { id: destInfo.id }
    })
  })
}
