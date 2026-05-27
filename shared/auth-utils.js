/**
 * shared/auth-utils.js
 * Browser-native crypto for securing PINs without a backend.
 */

export async function hashPin(pin, userId) {
    // 1. Combine PIN and userId (The "Salt")
    const msgBuffer = new TextEncoder().encode(pin + userId);

    // 2. Hash the message using SHA-256
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);

    // 3. Convert buffer to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
}

// Add this to shared/auth-utils.js

export const ROLES = {
  ADMIN: 'admin',
  LC: 'lc',
  TECH: 'aud-tech'
};

export const PERMISSIONS = {
  [ROLES.ADMIN]: ['*'], // Full Access
  [ROLES.LC]: [
    'dashboard', 
    'companies', 
    'company-detail', 
    'location-detail', 
    'employees', 
    'employee-detail', 
    'packets', 
    'reports', 
    'help'
  ],
  [ROLES.TECH]: [] // No access to MasterDB screens
};