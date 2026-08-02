/**
 * shared/fs/json-database.js
 * High-level orchestration for the Master JSON files on OneDrive.
 * 
 * v2.0 — Row-level merge sync (syncMaster) replaces destructive pullMaster on boot.
 */
import { readJsonFile, writeJsonFile, listJsonFiles, deleteJsonFile, DB_SUBDIR } from './sync-folder.js'
import { mergeUidTable, toWireRows, buildIdToUidMaps, UID_TABLES, UID_FK_DEFS } from './merge-uid.js'
import { adoptUids } from './adopt-uid.js'

// Map(a->b) → Map(b->a). Used to derive uid→id from an id→uid map.
const invert = m => { const r = new Map(); for (const [k, v] of m) r.set(v, k); return r; }

export const JsonDatabase = {

  // Synced table list
  tables: ['companies', 'locations', 'employees', 'tests', 'baselines', 'techs', 'schedules', 'users', 'packets', 'hpd_assessments'],

  // Primary keys and merge strategy per table
  // merge: true  = row-level merge by PK + updated_at (two-way)
  // merge: false = cloud-wins overwrite (derived/mirror data)
  tableConfig: {
    companies:       { pk: 'company_id',  merge: true },
    locations:       { pk: 'location_id', merge: true },
    employees:       { pk: 'employee_id', merge: true },
    tests:           { pk: 'test_id',     merge: true },
    baselines:       { pk: 'baseline_id', merge: true },
    users:           { pk: 'user_id',     merge: true },
    techs:           { pk: 'tech_id',     merge: false },
    schedules:       { pk: null,          merge: false },
    packets:         { pk: 'packet_id',   merge: true  },
    // pk here is only a fallback — the uid merge derives the real pk from the
    // live table via getLocalPk (deployed: assessment_id, fresh install: hpd_id).
    hpd_assessments: { pk: 'assessment_id', merge: true },
  },

  /**
   * Gets the 'Last Modified' timestamps for all JSON files on OneDrive.
   * Used by the heartbeat to detect if another user saved changes.
   */
  async getCloudTimestamps(syncFolder) {
    if (!syncFolder) return {};
    const stats = {};
    let dir;
    try { dir = await syncFolder.getDirectoryHandle(DB_SUBDIR, { create: true }); }
    catch (e) { return stats; }
    for (const table of this.tables) {
      try {
        const fileHandle = await dir.getFileHandle(`${table}.json`);
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
  async syncMaster(syncFolder, queryFn, runFn, { push = true } = {}) {
    if (!syncFolder) return {};

    // Per-table id↔uid maps for the uid-keyed merge, accumulated as we go so a
    // child table (e.g. tests) can translate its foreign keys against a parent
    // table (employees/locations) already merged this pass. The `tables` list
    // orders parents before children for every uid table.
    const parentMaps = {};

    for (const table of this.tables) {
      const config = this.tableConfig[table];

      // --- Read cloud data (capture mtime for the optimistic write check) ---
      let cloudRows = [];
      const readMtime = await this.getFileMtime(syncFolder, `${table}.json`);
      try {
        const data = await readJsonFile(syncFolder, DB_SUBDIR,`${table}.json`);
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

      // --- uid-keyed merge (the six entity tables) ---
      // Identity is the globally-unique `uid`, not the per-instance integer PK,
      // so two instances that each created a row can never collide on an
      // AUTOINCREMENT id and overwrite each other (INCIDENT-2026-07-29). Foreign
      // keys travel as parent uids and are translated back to local integer ids.
      if (UID_TABLES.includes(table)) {
        try {
          const pk = this.getLocalPk(queryFn, table);

          // Merge cloud into local, rewrite local, and (if pushing) publish.
          // Factored so the optimistic-mtime path can re-run it after a
          // concurrent write without duplicating the logic.
          const applyMerge = (cloudInput) => {
            const localRows = queryFn(`SELECT * FROM ${table}`);
            const res = mergeUidTable({
              table, pk, localRows, cloudRows: cloudInput,
              fkDefs: UID_FK_DEFS[table], parentMaps, localCols,
            });
            parentMaps[table] = { uidToId: res.uidToId, idToUid: res.idToUid };
            if (res.quarantined.length) {
              console.warn(`Sync: ${res.quarantined.length} ${table} row(s) quarantined (unresolved parent uid):`,
                res.quarantined.slice(0, 5).map(q => q.reason));
            }
            runFn(`DELETE FROM ${table}`);
            for (const row of res.localRows) {
              const cols = Object.keys(row).join(',');
              const vals = Object.values(row);
              runFn(`INSERT INTO ${table} (${cols}) VALUES (${vals.map(() => '?').join(',')})`, vals);
            }
            return res.localRows;
          };

          // Cross-instance uid ADOPTION — runs BEFORE the merge. schema 2.3
          // gives each instance its own random uids, so an already-diverged
          // second instance must first rewrite its uids to canonical's for the
          // shared ancestor rows, or the uid-keyed merge would duplicate that
          // whole history. Identity = (pk, created_at) + corroborating business
          // fields; an id-collision of DISTINCT rows (Selsek/Garding) has a
          // different created_at/content and is left untouched to flow up as a
          // new row. Idempotent once uids line up. See adopt-uid.js.
          try {
            const localForAdopt = queryFn(`SELECT * FROM ${table}`);
            const { adoptions, skippedCollision } = adoptUids({ table, pk, localRows: localForAdopt, cloudRows });
            for (const a of adoptions) runFn(`UPDATE ${table} SET uid = ? WHERE ${pk} = ?`, [a.toUid, a.id]);
            if (adoptions.length || skippedCollision) {
              console.log(`Adopt ${table}: ${adoptions.length} uid(s) adopted from canonical` +
                (skippedCollision ? `, ${skippedCollision} id-collision(s) kept distinct` : ''));
            }
          } catch (e) { console.warn(`Adopt error on ${table}:`, e.message); }

          let merged = applyMerge(cloudRows);

          // Publish the merged result in wire form (integer FKs → parent uids)
          // only when this computer has local changes to contribute.
          if (push) {
            // Optimistic concurrency: if another instance wrote this file after
            // we read it, fold their rows in before we overwrite, so we don't
            // clobber a concurrent write. Best-effort (the FSA has no atomic
            // compare-and-swap), bounded to a couple of retries; the uid merge
            // is the real safety net (a clobber is only re-published churn, not
            // loss, because the other instance still holds its rows locally).
            for (let attempt = 0; attempt < 2; attempt++) {
              const nowMtime = await this.getFileMtime(syncFolder, `${table}.json`);
              if (nowMtime === readMtime || nowMtime == null) break;
              try {
                const data = await readJsonFile(syncFolder, DB_SUBDIR,`${table}.json`);
                merged = applyMerge(Array.isArray(data) ? data : []);
              } catch (e) { break; }
            }
            const parentIdToUid = {};
            for (const fk of UID_FK_DEFS[table]) parentIdToUid[fk.parent] = parentMaps[fk.parent]?.idToUid ?? new Map();
            await writeJsonFile(syncFolder, DB_SUBDIR,`${table}.json`, toWireRows({ table, rows: merged, fkDefs: UID_FK_DEFS[table], parentIdToUid }));
          }
        } catch (e) {
          console.warn(`Sync error on ${table}:`, e.message);
        }
        continue;
      }

      // --- Non-uid merge tables (users, packets): legacy integer-PK merge ---
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

        // Write merged result back to cloud only if this computer has local changes
        if (push) await writeJsonFile(syncFolder, DB_SUBDIR,`${table}.json`, [...merged.values()]);

      } catch (e) {
        console.warn(`Sync error on ${table}:`, e.message);
      }
    }

    return await this.getCloudTimestamps(syncFolder);
  },

  /**
   * The lastModified time of a file in the sync root, or null if absent.
   * Used by syncMaster's optimistic write check.
   */
  async getFileMtime(syncFolder, filename) {
    try {
      const dir = await syncFolder.getDirectoryHandle(DB_SUBDIR, { create: true });
      const fh = await dir.getFileHandle(filename);
      const file = await fh.getFile();
      return file.lastModified;
    } catch (e) { return null; }
  },

  /**
   * Reconcile OneDrive conflict copies (`<table>-<SUFFIX>.json`, e.g.
   * `tests-CA21WW6R6Q673.json`) back into the canonical `<table>.json`.
   *
   * OneDrive makes a conflict copy when two machines write the same file before
   * syncing; the copy is split-brain data the normal sync never reads, so it
   * accumulates and silently strands rows. Because the merge is uid-keyed and
   * non-destructive, we can fold each copy's rows into local + canonical without
   * loss and then remove the copy.
   *
   * SAFETY: a conflict copy is deleted ONLY if every one of its rows was
   * absorbed (0 quarantined). A pre-uid copy (rows without uid) or one whose
   * parent uids don't resolve is left in place and surfaced, never dropped — so
   * this can't lose data even on an old-format copy.
   *
   * Run before syncMaster. Returns a summary for logging.
   */
  async reconcileConflictCopies(syncFolder, queryFn, runFn) {
    if (!syncFolder) return { reconciled: 0, left: 0 };

    let files;
    try { files = await listJsonFiles(syncFolder, DB_SUBDIR); }
    catch (e) { return { reconciled: 0, left: 0 }; }

    // Group conflict copies (`<table>-<suffix>.json`) by base uid table.
    const copiesByTable = {};
    for (const { name } of files) {
      const m = name.match(/^(.+?)-.+\.json$/);
      if (m && UID_TABLES.includes(m[1])) (copiesByTable[m[1]] ??= []).push(name);
    }
    if (Object.keys(copiesByTable).length === 0) return { reconciled: 0, left: 0 };

    // Parent id→uid maps start from the current LOCAL rows (stable existing ids)
    // and are replaced per table as copies are absorbed, so children resolve
    // against the same view.
    const localRowsByTable = {};
    const pkByTable = {};
    for (const t of UID_TABLES) { localRowsByTable[t] = queryFn(`SELECT * FROM ${t}`); pkByTable[t] = this.getLocalPk(queryFn, t); }
    const idToUidMaps = buildIdToUidMaps(localRowsByTable, pkByTable);
    const parentMaps = {};
    for (const t of UID_TABLES) parentMaps[t] = { uidToId: invert(idToUidMaps[t]), idToUid: idToUidMaps[t] };

    let reconciled = 0, left = 0;
    // Dependency order so a child's parent map already reflects absorbed rows.
    for (const table of UID_TABLES) {
      const copies = copiesByTable[table];
      if (!copies || !copies.length) continue;

      const pk = pkByTable[table];
      const localCols = this.getLocalColumns(queryFn, table);
      const localRows = queryFn(`SELECT * FROM ${table}`);

      // Gather every conflict copy's rows as extra cloud input.
      let cloudRows = [];
      const perFile = {};
      for (const fname of copies) {
        try {
          const data = await readJsonFile(syncFolder, DB_SUBDIR,fname);
          perFile[fname] = Array.isArray(data) ? data : [];
          cloudRows = cloudRows.concat(perFile[fname]);
        } catch (e) { perFile[fname] = null; }
      }

      const { localRows: merged, uidToId, idToUid, quarantined } = mergeUidTable({
        table, pk, localRows, cloudRows, fkDefs: UID_FK_DEFS[table], parentMaps, localCols,
      });

      // A copy is safe to delete only if NONE of its rows were quarantined.
      const quarantinedUids = new Set(quarantined.map(q => String(q.uid)));
      const safeToDelete = [];
      for (const fname of copies) {
        const rows = perFile[fname];
        if (!rows) { left++; continue; }                       // unreadable — leave it
        const anyStranded = rows.some(r => !r.uid || quarantinedUids.has(String(r.uid)));
        if (anyStranded) { left++; console.warn(`Conflict copy ${fname}: has rows that couldn't be absorbed (pre-uid or unresolved parent) — left for manual review.`); }
        else safeToDelete.push(fname);
      }

      // Only mutate local + canonical when there's something safe to absorb.
      if (safeToDelete.length) {
        runFn(`DELETE FROM ${table}`);
        for (const row of merged) {
          const cols = Object.keys(row).join(',');
          const vals = Object.values(row);
          runFn(`INSERT INTO ${table} (${cols}) VALUES (${vals.map(() => '?').join(',')})`, vals);
        }
        parentMaps[table] = { uidToId, idToUid };

        const parentIdToUid = {};
        for (const fk of UID_FK_DEFS[table]) parentIdToUid[fk.parent] = parentMaps[fk.parent]?.idToUid ?? new Map();
        await writeJsonFile(syncFolder, DB_SUBDIR,`${table}.json`, toWireRows({ table, rows: merged, fkDefs: UID_FK_DEFS[table], parentIdToUid }));

        for (const fname of safeToDelete) { await deleteJsonFile(syncFolder, DB_SUBDIR,fname); reconciled++; }
      }
    }

    if (reconciled || left) console.log(`Conflict-copy reconcile: ${reconciled} file(s) folded in, ${left} left for review.`);
    return { reconciled, left };
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
   * The table's actual integer primary-key column, read from the live schema
   * rather than a hardcoded name. Needed because hpd_assessments' pk differs
   * across installs (assessment_id vs hpd_id). Falls back to the config pk.
   */
  getLocalPk(queryFn, table) {
    try {
      const cols = queryFn(`SELECT name FROM pragma_table_info('${table}') WHERE pk > 0 ORDER BY pk`);
      if (cols.length === 1) return cols[0].name;
    } catch (e) { /* fall through */ }
    return this.tableConfig[table]?.pk ?? null;
  },

  /**
   * Pushes current local SQLite data to OneDrive JSONs.
   * Use after bulk operations or when you need a full push.
   */
  async pushMaster(syncFolder, queryFn) {
    if (!syncFolder) return;

    // Build id→uid maps for the uid tables so foreign keys can be published as
    // parent uids. A file written WITHOUT the *_uid fields would make every
    // child row un-adoptable (quarantined) on another instance's next sync, so
    // pushMaster and syncMaster must emit the exact same wire schema.
    const uidRows = {}, pkByTable = {};
    for (const t of UID_TABLES) { uidRows[t] = queryFn(`SELECT * FROM ${t}`); pkByTable[t] = this.getLocalPk(queryFn, t); }
    const idToUid = buildIdToUidMaps(uidRows, pkByTable);

    for (const table of this.tables) {
      if (UID_TABLES.includes(table)) {
        const parentIdToUid = {};
        for (const fk of UID_FK_DEFS[table]) parentIdToUid[fk.parent] = idToUid[fk.parent];
        const wire = toWireRows({ table, rows: uidRows[table], fkDefs: UID_FK_DEFS[table], parentIdToUid });
        await writeJsonFile(syncFolder, DB_SUBDIR,`${table}.json`, wire);
      } else {
        const data = queryFn(`SELECT * FROM ${table}`);
        await writeJsonFile(syncFolder, DB_SUBDIR,`${table}.json`, data);
      }
    }
    return await this.getCloudTimestamps(syncFolder);
  },

  /**
   * Pushes a single table to OneDrive.
   * Call after creating/updating/deleting rows in a specific table.
   */
  async pushTable(syncFolder, queryFn, tableName) {
    if (!syncFolder) return;
    // A uid table must be published in wire form (FKs as parent uids), same as
    // pushMaster/syncMaster — otherwise its children become un-adoptable. For a
    // single uid table we still need its PARENT id→uid maps, so read those too.
    if (UID_TABLES.includes(tableName)) {
      const uidRows = {}, pkByTable = {};
      for (const t of UID_TABLES) { uidRows[t] = queryFn(`SELECT * FROM ${t}`); pkByTable[t] = this.getLocalPk(queryFn, t); }
      const idToUid = buildIdToUidMaps(uidRows, pkByTable);
      const parentIdToUid = {};
      for (const fk of UID_FK_DEFS[tableName]) parentIdToUid[fk.parent] = idToUid[fk.parent];
      const wire = toWireRows({ table: tableName, rows: uidRows[tableName], fkDefs: UID_FK_DEFS[tableName], parentIdToUid });
      await writeJsonFile(syncFolder, DB_SUBDIR,`${tableName}.json`, wire);
      return;
    }
    const data = queryFn(`SELECT * FROM ${tableName}`);
    await writeJsonFile(syncFolder, DB_SUBDIR,`${tableName}.json`, data);
  },

  /**
   * Push branding assets (logo + favicon) to sync folder.
   */
  async pushBranding(syncFolder, queryOneFn) {
    if (!syncFolder) return;
    const logo    = queryOneFn("SELECT value FROM settings WHERE key = 'company_logo'")?.value ?? null;
    const favicon = queryOneFn("SELECT value FROM settings WHERE key = 'company_favicon'")?.value ?? null;
    // Don't overwrite existing cloud branding with nulls — merge so an instance
    // without local branding settings doesn't wipe what another instance pushed.
    if (!logo && !favicon) return;
    let existing = {};
    try { existing = await readJsonFile(syncFolder, DB_SUBDIR,'branding.json') ?? {} } catch {}
    await writeJsonFile(syncFolder, DB_SUBDIR,'branding.json', {
      logo:    logo    ?? existing.logo    ?? null,
      favicon: favicon ?? existing.favicon ?? null,
    });
  },

  /**
   * Pull branding assets from sync folder.
   */
  async pullBranding(syncFolder) {
    if (!syncFolder) return null;
    try {
      return await readJsonFile(syncFolder, DB_SUBDIR,'branding.json');
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
        readJsonFile(syncFolder, DB_SUBDIR,'companies.json').catch(() => []),
        readJsonFile(syncFolder, DB_SUBDIR,'locations.json').catch(() => [])
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
