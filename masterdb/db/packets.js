/**
 * db/packets.js
 * Optimized for Schema 2.0 (Company -> Location -> Employee)
 */

import { query, queryOne, run } from './sqlite.js'

export function getAllPackets() {
  return query(`
    SELECT p.*,
      c.name AS company_name,
      l.name AS location_name,
      l.province AS province,
      -- Count total active employees at this location
      (SELECT COUNT(*) FROM employees WHERE location_id = p.location_id AND status = 'active') as total_employees,
      -- Count how many tests have been imported for this specific packet
      (SELECT COUNT(*) FROM tests WHERE packet_id = p.packet_id) as tested_count
    FROM packets p
    JOIN companies c ON c.company_id = p.company_id
    JOIN locations l ON l.location_id = p.location_id
    ORDER BY p.created_at DESC
  `)
}

export function getPacketsByStatus(status) {
  return query(`
    SELECT p.*,
      c.name AS company_name,
      l.name AS location_name,
      l.province AS province,
      -- Count total active employees at this location
      (SELECT COUNT(*) FROM employees WHERE location_id = p.location_id AND status = 'active') as total_employees,
      -- Count how many tests have been imported for this specific packet
      (SELECT COUNT(*) FROM tests WHERE packet_id = p.packet_id) as tested_count
    FROM packets p
    JOIN companies c ON c.company_id = p.company_id
    JOIN locations l ON l.location_id = p.location_id
    WHERE p.status = ?
    ORDER BY p.visit_date ASC
  `, [status])
}

export function createPacketRecord(packetId, companyId, locationId, techId, visitDate, filename) {
  run(`INSERT OR IGNORE INTO packets
    (packet_id, company_id, location_id, tech_id, visit_date, filename, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))`,
    [packetId, companyId, locationId, techId, visitDate, filename]
  )
}

export function updatePacketStatus(packetId, status) {
  run(`UPDATE packets SET status = ?, updated_at = datetime('now') WHERE packet_id = ?`,
    [status, packetId])
}

export function getPacket(packetId) {
  return queryOne(`
    SELECT p.*, c.name as company_name, l.name as location_name 
    FROM packets p
    JOIN companies c ON p.company_id = c.company_id
    JOIN locations l ON p.location_id = l.location_id
    WHERE p.packet_id = ?
  `, [packetId])
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
  run(`UPDATE techs SET active = 0 WHERE tech_id = ?`, [techId])
}