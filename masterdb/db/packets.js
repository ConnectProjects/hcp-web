/**
 * db/packets.js
 * Optimized for Schema 2.0 and Packet Deletion.
 */

import { query, queryOne, run } from './sqlite.js'

export function getAllPackets() {
  return query(`
    SELECT p.*,
      COALESCE(c.name, '')  AS company_name,
      COALESCE(l.name, '')  AS location_name,
      COALESCE(l.province, '') AS province,
      COALESCE(u.name, '')        AS tech_name,
      COALESCE(u.folder_name, t.folder_name) AS tech_folder_name
    FROM packets p
    LEFT JOIN companies c ON c.company_id = p.company_id
    LEFT JOIN locations l ON l.location_id = p.location_id
    LEFT JOIN users u     ON u.user_id = p.tech_id
    LEFT JOIN techs t     ON t.tech_id = p.tech_id
    ORDER BY p.created_at DESC
  `)
}

export function getPacketsByStatus(status) {
  return query(`
    SELECT p.*,
      COALESCE(c.name, '')  AS company_name,
      COALESCE(l.name, '')  AS location_name,
      COALESCE(l.province, '') AS province,
      COALESCE(u.folder_name, t.folder_name) AS tech_folder_name
    FROM packets p
    LEFT JOIN companies c ON c.company_id = p.company_id
    LEFT JOIN locations l ON l.location_id = p.location_id
    LEFT JOIN users u     ON u.user_id = p.tech_id
    LEFT JOIN techs t     ON t.tech_id = p.tech_id
    WHERE p.status = ?
    ORDER BY p.visit_date ASC
  `, [status])
}

export function createPacketRecord(packetId, companyId, locationId, techId, visitDate, filename, createdBy) {
  run(`INSERT OR IGNORE INTO packets
    (packet_id, company_id, location_id, tech_id, visit_date, filename, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))`,
    [packetId, companyId, locationId ?? null, techId ?? null, visitDate, filename, createdBy ?? null]
  )
  // Stamp created_by even if INSERT was ignored (pre-existing record missing it)
  if (createdBy) {
    run(`UPDATE packets SET created_by = ? WHERE packet_id = ? AND created_by IS NULL`,
      [createdBy, packetId])
  }
}

export function getMyPackets(userId) {
  return query(`
    SELECT p.*,
      COALESCE(c.name, '')        AS company_name,
      COALESCE(l.name, '')        AS location_name,
      COALESCE(l.province, '')    AS province,
      COALESCE(u.name, '')        AS tech_name,
      COALESCE(u.folder_name, '') AS tech_folder_name
    FROM packets p
    LEFT JOIN companies c ON c.company_id = p.company_id
    LEFT JOIN locations l ON l.location_id = p.location_id
    LEFT JOIN users u     ON u.user_id = p.tech_id
    WHERE p.created_by = ?
    ORDER BY p.visit_date DESC
  `, [userId])
}

/**
 * NEW: This is the missing export that caused your error.
 * Removes the record from the local SQLite database.
 */
export function deletePacketRecord(packetId) {
  run("DELETE FROM packets WHERE packet_id = ?", [packetId]);
}

export function updatePacketStatus(packetId, status) {
  run(`UPDATE packets SET status = ?, updated_at = datetime('now') WHERE packet_id = ?`,
    [status, packetId])
}



// ---------------------------------------------------------------------------
// Techs
// ---------------------------------------------------------------------------

/**
 * Gets all users capable of performing tests (Admins and Technicians).
 * Points to the new 'users' table instead of the legacy 'techs' table.
 */
export function getTechs() {
  return query(`
    SELECT 
      user_id as tech_id, 
      name, 
      initials, 
      folder_name, 
      role
    FROM users 
    WHERE active = 1 
    AND (role = 'admin' OR role = 'aud-tech')
    ORDER BY name ASC
  `);
}

export function createTech(data) {
  run(`INSERT OR IGNORE INTO techs (tech_id, name, initials, email, role, folder_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
    [data.tech_id, data.name, data.initials,
     data.email       ?? null,
     data.role        ?? 'tech',
     data.folder_name ?? null]
  )
}

export function updateTech(techId, data) {
  run(`UPDATE techs SET name = ?, initials = ?, folder_name = ?, email = ? WHERE tech_id = ?`,
    [data.name, data.initials, data.folder_name ?? null, data.email ?? null, techId]
  )
}

export function deleteTech(techId) {
  run(`UPDATE techs SET active = 0 WHERE tech_id = ?`, [techId])
}