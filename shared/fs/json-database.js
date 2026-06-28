/**
 * shared/fs/json-database.js
 * High-level orchestration for the Master JSON files on OneDrive.
 * 
 * v2.0 — Row-level merge sync (syncMaster) replaces destructive pullMaster on boot.
 */
import { readJsonFile, writeJsonFile } from './sync-folder.js'

export const JsonDatabase = {

  // Synced table list
  tables: ['companies', 'locations', 'employees', 'tests', 'baselines', 'techs', 'schedules', 'users'],

  // Primary keys and merge strategy per table
  // merge: true  = row-level merge by PK + updated_at (two-way)
  // merge: false = cloud-wins overwrite (derived/mirror data)
  tableConfig: {
    companies: { pk: 'company_id',  merge: true },
    locations: { pk: 'location_id', merge: true },
    employees: { pk: 'employee_id', merge: true },
    tests:     { pk: 'test_id',     merge: true },
    baselines: { pk: 'baseline_id', merge: true },
    users:     { pk: 'user_id',     merge: true },
    techs:     { pk: 'tech_id',     merge: false },
    schedules: { pk: null,          merge: false }
  },

  /**
   * Gets the 'Last Modified' timestamps for all JSON files on OneDrive.
   * Used by the heartbeat to detect if another user saved changes.
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
        stats[table] = 0;
      }
    }
    return stats;
  },

  /**
   * Two-way merge sync (replaces pullMaster for boot).
   *
   * For each merge-enabled table:
   *   1. Read cloud JSON and local SQLite
   *   2. Index both by primary key
   *   3. Rows only in local  → keep (new local additions)
   *   4. Rows only in cloud  → keep (new from another user)
   *   5. Rows in both        → compare updated_at, keep newer
   *   6. Write merged result to BOTH local SQLite and cloud JSON
   *
   * For non-merge tables (techs, schedules):
   *   Cloud wins (simple overwrite, same as old pullMaster).
   *
   * IMPORTANT: Use soft-deletes (set active=0) instead of hard deletes,
   * otherwise deleted rows will reappear from the other side on next sync.
   */
  async syncMaster(syncFolder, queryFn, runFn) {
    if (!syncFolder) return {};

    for (const table of this.tables) {
      const config = this.tableConfig[table];

      // --- Read cloud data ---
      let cloudRows = [];
      try {
        const data = await readJsonFile(syncFolder, '', `${table}.json`);
        if (Array.isArray(data)) cloudRows = data;
      } catch (e) {
        // JSON file doesn't exist yet — that's fine
      }

      // Cloud JSON may carry columns from older schema versions that no
      // longer exist locally (e.g. a pruned table). Only insert columns
      // the local table actually has, so stale fields don't break inserts.
      const localCols = this.getLocalColumns(queryFn, table);
      if (!localCols) {
        console.warn(`Sync skip: ${table} table may not exist locally.`);
        continue;
      }
      const toRow = row => {
  const filtered = {};
  for (const key of Object.keys(row)) {
    if (localCols.has(key)) {
      const v = row[key];
      filtered[key] = (v === undefined || (typeof v === 'number' && isNaN(v))) ? null : v;
    }
  }
  return filtered;
};

      // --- Non-merge tables: simple cloud-wins overwrite ---
      if (!config || !config.merge) {
        try {
          runFn(`DELETE FROM ${table}`);
          cloudRows.forEach(row => {
            const filtered = toRow(row);
            const cols = Object.keys(filtered).join(',');
            const vals = Object.values(filtered);
            const qs = vals.map(() => '?').join(',');
            runFn(`INSERT INTO ${table} (${cols}) VALUES (${qs})`, vals);
          });
        } catch (e) {
          console.warn(`Sync error on ${table}:`, e.message);
        }
        continue;
      }

      // --- Merge-enabled tables ---
      try {
        const pk = config.pk;
        const localRows = queryFn(`SELECT * FROM ${table}`);

        // Index both sides by primary key
        const localMap = new Map(localRows.map(r => [String(r[pk]), r]));
        const cloudMap = new Map(cloudRows.map(r => [String(r[pk]), r]));
        const merged = new Map();

        // Start with all local rows
        for (const [key, row] of localMap) {
          merged.set(key, row);
        }

        // Merge in cloud rows
        for (const [key, cloudRow] of cloudMap) {
          const localRow = localMap.get(key);
          if (!localRow) {
            // Row only exists in cloud — new from another user
            merged.set(key, cloudRow);
          } else {
            // Row exists in both — keep the newer one
            const cloudTime = cloudRow.updated_at || cloudRow.created_at || '';
            const localTime = localRow.updated_at || localRow.created_at || '';
            if (cloudTime > localTime) {
              merged.set(key, cloudRow);
            }
            // else local is newer or equal — already in merged
          }
        }

        // Write merged result to local SQLite
        runFn(`DELETE FROM ${table}`);
        for (const row of merged.values()) {
          const filtered = toRow(row);
          const cols = Object.keys(filtered).join(',');
          const vals = Object.values(filtered);
          const qs = vals.map(() => '?').join(',');
          runFn(`INSERT INTO ${table} (${cols}) VALUES (${qs})`, vals);
        }

        // Write merged result back to cloud so both sides are in sync
        await writeJsonFile(syncFolder, '', `${table}.json`, [...merged.values()]);

      } catch (e) {
        console.warn(`Sync error on ${table}:`, e.message);
      }
    }

    return await this.getCloudTimestamps(syncFolder);
  },

  /**
   * Returns the set of column names the local table actually has,
   * or null if the table doesn't exist.
   */
  getLocalColumns(queryFn, table) {
    try {
      const cols = queryFn(`SELECT name FROM pragma_table_info('${table}')`);
      return cols.length > 0 ? new Set(cols.map(c => c.name)) : null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Pushes current local SQLite data to OneDrive JSONs.
   * Use after bulk operations or when you need a full push.
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
   * Pushes a single table to OneDrive.
   * Call after creating/updating/deleting rows in a specific table.
   */
  async pushTable(syncFolder, queryFn, tableName) {
    if (!syncFolder) return;
    const data = queryFn(`SELECT * FROM ${tableName}`);
    await writeJsonFile(syncFolder, '', `${tableName}.json`, data);
  },

  /**
   * Push branding assets (logo + favicon) to sync folder.
   */
  async pushBranding(syncFolder, queryOneFn) {
    if (!syncFolder) return;
    const logo    = queryOneFn("SELECT value FROM settings WHERE key = 'company_logo'")?.value ?? null;
    const favicon = queryOneFn("SELECT value FROM settings WHERE key = 'company_favicon'")?.value ?? null;
    await writeJsonFile(syncFolder, '', 'branding.json', { logo, favicon });
  },

  /**
   * Pull branding assets from sync folder.
   */
  async pullBranding(syncFolder) {
    if (!syncFolder) return null;
    try {
      return await readJsonFile(syncFolder, '', 'branding.json');
    } catch (e) { return null; }
  },

  /**
   * Pull company + location directory from sync folder for offline packet creation.
   * Returns [{company_id, name, province, locations:[{location_id, name, province}]}]
   * or null if the files aren't present yet.
   */
  async pullCompanyDirectory(syncFolder) {
    if (!syncFolder) return null;
    try {
      const [companies, locations] = await Promise.all([
        readJsonFile(syncFolder, '', 'companies.json').catch(() => []),
        readJsonFile(syncFolder, '', 'locations.json').catch(() => [])
      ]);
      const locsByCompany = {};
      for (const loc of locations) {
        if (!locsByCompany[loc.company_id]) locsByCompany[loc.company_id] = [];
        locsByCompany[loc.company_id].push({ location_id: loc.location_id, name: loc.name, province: loc.province });
      }
      return companies
        .filter(c => c.active !== 0)
        .map(c => ({ company_id: c.company_id, name: c.name, province: c.province, locations: locsByCompany[c.company_id] ?? [] }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch { return null; }
  }
};
