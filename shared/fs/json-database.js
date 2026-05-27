/**
 * shared/fs/json-database.js
 * High-level orchestration for the Master JSON files on OneDrive.
 */
import { readJsonFile, writeJsonFile } from './sync-folder.js'

export const JsonDatabase = {
  // These match your specific file list
  tables: ['companies', 'locations', 'employees', 'tests', 'baselines', 'techs', 'schedules', 'users'],

  /**
   * Gets the 'Last Modified' timestamps for all JSON files on OneDrive.
   * This is used to detect if another user saved changes.
   */
  async getCloudTimestamps(syncFolder) {
    if (!syncFolder) return {};
    const stats = {};
    for (const table of this.tables) {
      try {
        const fileHandle = await syncFolder.getFileHandle(`${table}.json`);
        const file = await fileHandle.getFile();
        stats[table] = file.lastModified;
      } catch (e) {
        stats[table] = 0; // File doesn't exist yet
      }
    }
    return stats;
  },

  /**
   * Pushes current local SQLite data to OneDrive JSONs.
   */
  async pushMaster(syncFolder, queryFn) {
    if (!syncFolder) return;
    for (const table of this.tables) {
      const data = queryFn(`SELECT * FROM ${table}`);
      await writeJsonFile(syncFolder, '', `${table}.json`, data);
    }
    return await this.getCloudTimestamps(syncFolder);
  },

  /**
   * Pulls OneDrive JSONs and overwrites local SQLite data.
   */
  async pullMaster(syncFolder, runFn) {
    if (!syncFolder) return;
    for (const table of this.tables) {
      try {
        const data = await readJsonFile(syncFolder, '', `${table}.json`);
        if (Array.isArray(data)) {
          runFn(`DELETE FROM ${table}`);
          data.forEach(row => {
            const cols = Object.keys(row).join(',');
            const vals = Object.values(row);
            const qs = Object.keys(row).map(() => '?').join(',');
            runFn(`INSERT INTO ${table} (${cols}) VALUES (${qs})`, vals);
          });
        }
      } catch (e) {
        console.warn(`Table ${table}.json not found in sync folder.`);
      }
    }
    return await this.getCloudTimestamps(syncFolder);
  }
};