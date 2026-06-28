/**
 * shared/auth-utils.js
 * 
 * Central Security & Permission Engine
 * Features: SHA-256 Salted Hashing and Role-Based Access Control (RBAC)
 */

// 1. Define available user roles
export const ROLES = {
  SUPER_ADMIN: 'super-admin', // Full unrestricted access — all screens
  ADMIN:       'admin',       // All screens except Settings, Data Tools, Logs
  BILLING:     'billing',     // Same visibility as Admin
  LC:          'lc',          // Dashboard, Companies, Packets only
  TECH:        'aud-tech'     // TechTool only — blocked from MasterDB entirely
};

// 2. Sidebar screens each role may see in MasterDB.
// Super-Admin is handled separately as wildcard '*' in app.js.
// Aud-Tech has no screens — they are blocked at the navigate guard level.
const ADMIN_SCREENS = ['dashboard', 'companies', 'employees', 'packets', 'reports', 'users', 'help'];
const LC_SCREENS    = ['dashboard', 'companies', 'packets'];

export const PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: ['*'],
  [ROLES.ADMIN]:       ADMIN_SCREENS,
  [ROLES.BILLING]:     ADMIN_SCREENS,
  [ROLES.LC]:          LC_SCREENS,
  [ROLES.TECH]:        []
};

/**
 * Secures a 4-digit PIN using SHA-256.
 * Uses the userId as a "Salt" to ensure that even if two users have 
 * the same PIN, their stored hashes will be completely different.
 * 
 * @param {string} pin - The plain-text 4-digit PIN
 * @param {string} userId - The unique UUID of the user
 * @returns {Promise<string>} - The 64-character secure hex hash
 */
export async function hashPin(pin, userId) {
    if (!pin || !userId) {
        throw new Error("PIN and UserID are required for hashing.");
    }

    // Combine PIN and userId (Salting)
    const msgBuffer = new TextEncoder().encode(pin + userId);

    // Hash the message using browser-native SHA-256
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);

    // Convert the binary buffer to a readable Hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
}

/**
 * Helper to verify if a specific role has access to a specific screen.
 * Used primarily by the Navigation Guard.
 */
export function canUserAccess(role, screen) {
    if (role === ROLES.SUPER_ADMIN) return true;
    const allowedScreens = PERMISSIONS[role] || [];
    if (allowedScreens.includes('*')) return true;
    return allowedScreens.includes(screen);
}
