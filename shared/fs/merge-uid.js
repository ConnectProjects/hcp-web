/**
 * shared/fs/merge-uid.js
 *
 * Pure, IO-free uid-keyed merge for the six synced entity tables. This is the
 * durable fix for INCIDENT-2026-07-29 (Yorkton): the old sync merged rows by
 * their per-instance AUTOINCREMENT integer primary key, so when two instances
 * minted the same integer id for DIFFERENT rows, the merge collided on that key
 * and one row silently overwrote the other (and children cross-linked).
 *
 * Here the merge identity is the globally-unique `uid` (added in schema 2.3).
 * Integer primary keys stay LOCAL to each instance; foreign keys travel on the
 * wire as the parent row's uid (`company_uid`, `location_uid`, …) and are
 * translated back to local integer ids on import via the parent table's map.
 * Because identity is content-stable (uid), two instances that each created a
 * row never collapse it — Selsek and Garding stay two people, and a test always
 * points at the uid it was entered against.
 *
 * No file/database IO lives here so it can be exercised directly in Node against
 * copies of real data (see local-tests/import-packet/merge.mjs).
 */

// Entity tables that carry a uid and merge by it, in dependency order (parents
// before children) so each child's parent map is already built when it merges.
export const UID_TABLES = ['companies', 'locations', 'employees', 'tests', 'baselines', 'hpd_assessments']

// Integer foreign-key columns per table: the local integer column, the uid
// column it travels as on the wire, and the parent table whose id↔uid map
// resolves it.
export const UID_FK_DEFS = {
  companies:       [],
  locations:       [{ idCol: 'company_id',  uidCol: 'company_uid',  parent: 'companies' }],
  employees:       [{ idCol: 'location_id', uidCol: 'location_uid', parent: 'locations' }],
  tests:           [{ idCol: 'employee_id', uidCol: 'employee_uid', parent: 'employees' },
                    { idCol: 'location_id', uidCol: 'location_uid', parent: 'locations' }],
  baselines:       [{ idCol: 'employee_id', uidCol: 'employee_uid', parent: 'employees' },
                    { idCol: 'location_id', uidCol: 'location_uid', parent: 'locations' }],
  hpd_assessments: [{ idCol: 'test_id',     uidCol: 'test_uid',     parent: 'tests' }],
}

const nullify = v => (v === undefined || (typeof v === 'number' && isNaN(v))) ? null : v

/**
 * Merge one entity table by uid. Pure: takes rows in, returns rows out.
 *
 * @param {object} o
 * @param {string} o.table       table name (for messages)
 * @param {string} o.pk          integer primary-key column, e.g. 'company_id'
 * @param {Array}  o.localRows   rows from local SQLite (integer pk + integer FKs + uid)
 * @param {Array}  o.cloudRows   rows from cloud JSON (uid + *_uid FK fields)
 * @param {Array}  o.fkDefs      UID_FK_DEFS[table]
 * @param {object} o.parentMaps  { [parentTable]: { uidToId: Map, idToUid: Map } }, built by earlier tables
 * @param {Set}    o.localCols   column names the local table actually has (stale
 *                               cloud columns are dropped, matching the old toRow)
 * @returns {{
 *   localRows: Array,     // to DELETE+reinsert locally: integer pk + resolved integer FKs + uid
 *   uidToId: Map, idToUid: Map,   // this table's maps, for its children and wire export
 *   quarantined: Array    // rows dropped because a parent uid could not be resolved (never guessed)
 * }}
 *
 * The cloud/wire form (integer FKs translated to parent uids) is produced
 * separately by toWireRows() so that syncMaster's push and pushMaster share one
 * wire schema — an instance must never publish a file that omits the *_uid FKs.
 */
export function mergeUidTable({ table, pk, localRows, cloudRows, fkDefs, parentMaps, localCols }) {
  const quarantined = []

  // Index local rows by uid; track the high-water integer id so cloud-only rows
  // get fresh local ids that can't collide with existing ones.
  const localByUid = new Map()
  const noUidLocal = []
  let maxId = 0
  for (const r of localRows) {
    const id = Number(r[pk])
    if (Number.isFinite(id) && id > maxId) maxId = id
    if (r.uid) localByUid.set(String(r.uid), r)
    else       noUidLocal.push(r)   // defensive: schema 2.3 stamps every row, so this should be empty
  }

  // Decide the winning row per uid: local first, then cloud with newer updated_at.
  const winners = new Map()   // uid -> row
  const source  = new Map()   // uid -> 'local' | 'cloud'
  for (const r of localRows) {
    if (!r.uid) continue
    winners.set(String(r.uid), r); source.set(String(r.uid), 'local')
  }
  for (const r of cloudRows) {
    const uid = r.uid ? String(r.uid) : null
    if (!uid) { quarantined.push({ table, reason: 'cloud row has no uid', row: r }); continue }
    const cur = winners.get(uid)
    if (!cur) { winners.set(uid, r); source.set(uid, 'cloud'); continue }
    const ct = r.updated_at || r.created_at || ''
    const lt = cur.updated_at || cur.created_at || ''
    if (ct > lt) { winners.set(uid, r); source.set(uid, 'cloud') }
  }

  // Assign local integer ids: keep the existing id for uids already local,
  // mint a fresh id for cloud-only uids.
  const uidToId = new Map(), idToUid = new Map()
  for (const uid of winners.keys()) {
    const localId = localByUid.has(uid) ? Number(localByUid.get(uid)[pk]) : ++maxId
    uidToId.set(uid, localId); idToUid.set(localId, uid)
  }

  const keepCol = c => !localCols || localCols.has(c)
  const outLocal = []

  for (const [uid, src] of winners) {
    const localId = uidToId.get(uid)

    // Build the local row: only real local columns, integer pk set, uid kept.
    const local = {}
    for (const [k, v] of Object.entries(src)) {
      if (keepCol(k) && !fkDefs.some(fk => fk.uidCol === k)) local[k] = nullify(v)
    }
    local[pk] = localId
    local.uid = uid

    // Resolve each foreign key by the parent's uid, not its integer id.
    // Quarantine (drop, never guess) applies ONLY to incoming cloud rows whose
    // parent uid can't be resolved. A LOCAL row is existing data and is always
    // preserved as-is, even if its FK is already orphaned in the source data —
    // dropping it would be silent data loss, the very thing we're fixing.
    const isLocal = source.get(uid) === 'local'
    let dangling = null
    for (const fk of fkDefs) {
      const pmap = parentMaps[fk.parent] || { uidToId: new Map(), idToUid: new Map() }
      // parent uid: cloud rows carry *_uid; local rows derive it from their
      // existing integer FK via the parent's idToUid (ids of existing rows are
      // preserved through the merge, so this is stable).
      let parentUid = src[fk.uidCol] != null ? String(src[fk.uidCol]) : null
      if (parentUid == null && isLocal && src[fk.idCol] != null) {
        parentUid = pmap.idToUid.get(Number(src[fk.idCol])) ?? null
      }

      if (parentUid != null) {
        // A parent reference was given — it must resolve, or the cloud row is
        // dangling. (A local row keeps its existing FK instead of being dropped.)
        const pid = pmap.uidToId.get(parentUid)
        if (pid != null)      { local[fk.idCol] = pid }
        else if (isLocal)     { local[fk.idCol] = nullify(src[fk.idCol]) }   // local orphan — keep, don't spread
        else                  { dangling = `${fk.uidCol}=${parentUid} not found in ${fk.parent}`; break }
      } else if (src[fk.idCol] == null) {       // no parent reference at all — legitimately null (e.g. location_id)
        local[fk.idCol] = null
      } else if (isLocal) {                      // local row, integer FK but parent orphaned — keep as-is
        local[fk.idCol] = nullify(src[fk.idCol])
      } else {                                   // cloud row, integer FK but no portable *_uid — can't trust it
        dangling = `${fk.idCol}=${src[fk.idCol]} present but no ${fk.uidCol} to resolve it`; break
      }
    }

    if (dangling) {
      quarantined.push({ table, uid, reason: dangling, row: src })
      uidToId.delete(uid); idToUid.delete(localId)
      continue
    }

    outLocal.push(local)
  }

  // Never drop a local row that predates the uid stamp — pass it through as-is.
  for (const r of noUidLocal) {
    const filtered = {}
    for (const [k, v] of Object.entries(r)) if (keepCol(k)) filtered[k] = nullify(v)
    outLocal.push(filtered)
  }

  return { localRows: outLocal, uidToId, idToUid, quarantined }
}

/**
 * Translate local rows (integer FKs) into the wire/cloud form by adding a
 * `*_uid` field for each foreign key, resolved via the parent table's id→uid
 * map. The integer FK columns are kept too (harmless to other new instances,
 * and useful for debugging), but importers merge by uid. This is the ONE place
 * the wire schema is produced — used by both syncMaster's push and pushMaster.
 *
 * @param {object} o
 * @param {string} o.table
 * @param {Array}  o.rows          local rows (as stored / as SELECT * returns)
 * @param {Array}  o.fkDefs        UID_FK_DEFS[table]
 * @param {object} o.parentIdToUid { [parentTable]: Map(localId -> uid) }
 * @returns {Array} wire rows
 */
export function toWireRows({ table, rows, fkDefs, parentIdToUid }) {
  return rows.map(row => {
    const wire = { ...row }
    for (const fk of fkDefs) {
      const idv = row[fk.idCol]
      wire[fk.uidCol] = idv == null ? null : (parentIdToUid[fk.parent]?.get(Number(idv)) ?? null)
    }
    return wire
  })
}

/**
 * Build { [table]: Map(localId -> uid) } for every uid table from full row
 * sets. Used by pushMaster, which exports all tables in one shot without a
 * merge, so it needs the id→uid maps that a merge would otherwise produce.
 *
 * @param {object} rowsByTable
 * @param {object} [pkByTable] actual integer pk column per table. The caller
 *   derives this from the live table (pragma) rather than trusting a static
 *   name, because the deployed hpd_assessments pk is `assessment_id` while a
 *   fresh install's is `hpd_id`. Falls back to DEFAULT_PK_BY_TABLE.
 */
export function buildIdToUidMaps(rowsByTable, pkByTable = DEFAULT_PK_BY_TABLE) {
  const maps = {}
  for (const t of UID_TABLES) {
    const pk = pkByTable[t] ?? DEFAULT_PK_BY_TABLE[t]
    const m = new Map()
    for (const r of rowsByTable[t] ?? []) if (r.uid != null) m.set(Number(r[pk]), String(r.uid))
    maps[t] = m
  }
  return maps
}

// Fallback integer primary key per uid table. NOTE: hpd_assessments is
// `assessment_id` on already-deployed databases and `hpd_id` on fresh installs
// (a schema fork) — callers should derive the real pk from the live table and
// pass it in; this map is only a last resort.
export const DEFAULT_PK_BY_TABLE = {
  companies: 'company_id', locations: 'location_id', employees: 'employee_id',
  tests: 'test_id', baselines: 'baseline_id', hpd_assessments: 'assessment_id',
}
