/**
 * db/packets.js
 * Packet and tech queries. Packets now reference a location as well as a company.
 */

import { query, queryOne, run } from './sqlite.js'

export function getAllPackets() {
  return query(`
    SELECT p.*,
      COALESCE(c.name, '')  AS company_name,
      COALESCE(l.name, '')  AS location_name,
      COALESCE(l.province, '') AS province
    FROM packets p
    LEFT JOIN companies c ON c.company_id = p.company_id
    LEFT JOIN locations l ON l.location_id = p.location_id
    ORDER BY p.created_at DESC
  `)
}

export function getPacketsByStatus(status) {
  return query(`
    SELECT p.*,
      COALESCE(c.name, '')  AS company_name,
      COALESCE(l.name, '')  AS location_name,
      COALESCE(l.province, '') AS province
    FROM packets p
    LEFT JOIN companies c ON c.company_id = p.company_id
    LEFT JOIN locations l ON l.location_id = p.location_id
    WHERE p.status = ?
    ORDER BY p.visit_date ASC
  `, [status])
}

export function createPacketRecord(packetId, companyId, locationId, techId, visitDate, filename) {
  run(`INSERT OR IGNORE INTO packets
    (packet_id, company_id, location_id, tech_id, visit_date, filename, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [packetId, companyId, locationId ?? null, techId ?? null, visitDate, filename]
  )
}

export function updatePacketStatus(packetId, status) {
  run(`UPDATE packets SET status = ?, updated_at = datetime('now') WHERE packet_id = ?`,
    [status, packetId])
}

export function getPacket(packetId) {
  return queryOne('SELECT * FROM packets WHERE packet_id = ?', [packetId])
}

// ---------------------------------------------------------------------------
// Techs
// ---------------------------------------------------------------------------

export function getTechs() {
  return query("SELECT * FROM techs WHERE active = 1 ORDER BY name ASC")
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
  // Soft-delete — preserves historical test records that reference this tech_id
  run(`UPDATE techs SET active = 0 WHERE tech_id = ?`, [techId])
}
