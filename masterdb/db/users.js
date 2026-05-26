import { query, queryOne, run, transaction } from './sqlite.js'
import { hashPin } from '../../shared/auth-utils.js'
import { writeJsonFile } from '@shared/fs/sync-folder.js'

export function getAllUsers() {
  return query("SELECT * FROM users ORDER BY name ASC");
}

/**
 * Creates a user, hashes their PIN, and updates the cloud JSON.
 */
export async function createUser(data, syncFolder) {
  const userId = self.crypto.randomUUID();
  const pinHash = await hashPin(data.pin, userId);

  run(`
    INSERT INTO users (user_id, name, initials, role, folder_name, pin_hash, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `, [userId, data.name, data.initials, data.role, data.folder_name, pinHash]);

  if (syncFolder) await pushUsersToCloud(syncFolder);
  return userId;
}

export async function deactivateUser(userId, syncFolder) {
  run("UPDATE users SET active = 0 WHERE user_id = ?", [userId]);
  if (syncFolder) await pushUsersToCloud(syncFolder);
}

/**
 * Resets a user's PIN
 */
export async function resetUserPin(userId, newPin, syncFolder) {
  const pinHash = await hashPin(newPin, userId);
  run("UPDATE users SET pin_hash = ? WHERE user_id = ?", [pinHash, userId]);
  if (syncFolder) await pushUsersToCloud(syncFolder);
}

async function pushUsersToCloud(syncFolder) {
  const allUsers = query("SELECT user_id, name, initials, role, folder_name, pin_hash, active FROM users");
  await writeJsonFile(syncFolder, '', 'users.json', allUsers);
}