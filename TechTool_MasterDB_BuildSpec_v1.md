# TechTool / MasterDB — Web Conversion Build Specification

**Connect Hearing Canada — Industrial Division**  
Version 1.0 | April 2026 | Norm Robichaud

---

## 1. Project Overview

This document specifies the conversion of two Electron desktop applications — TechTool and MasterDB — into a browser-based web system. The conversion is driven by corporate IT security restrictions that prevent installation of Electron apps on company-managed laptops. The web architecture eliminates all installation requirements while preserving full offline capability for field technicians.

All existing business logic, classification rules, HPD calculations, and data structures are preserved. Only the delivery mechanism changes.

---

## 2. System Architecture

### 2.1 Core Principles

- No patient or worker data ever resides on the host server — ever
- Field techs work fully offline when needed
- No software installation required on any laptop or workstation
- OneDrive acts as the sole data transport layer between office and field
- Host server serves app code only — HTML, CSS, JavaScript

### 2.2 Architecture Overview

| Zone | Component | What Lives Here | Technology |
|---|---|---|---|
| Host Server | App Delivery | HTML / CSS / JavaScript only. Zero patient data. | Netlify or Cloudflare Pages (free tier) |
| OneDrive Folder | Data Transport | JSON packets in transit. Inbox, outbox, archive folders. | Microsoft OneDrive (existing) |
| Office Machine | MasterDB | Master SQLite database. All companies, employees, test history. | Browser + local SQLite via OPFS |
| Tech Laptop | TechTool | Assigned packets cached in IndexedDB. Completed tests queue for sync. | Chrome browser + IndexedDB |

### 2.3 Data Flow

- Office (MasterDB) creates a company packet and drops it to OneDrive `/inbox`
- Tech opens TechTool in Chrome, clicks Sync — packet downloads from OneDrive to IndexedDB
- Tech travels to site, works fully offline — all data in browser local storage
- Completed tests saved locally as entered, dropped to OneDrive `/outbox` when connectivity returns
- Office MasterDB picks up completed packets from `/outbox`, imports, moves to `/archive`

---

## 3. Host Server

### 3.1 Purpose

The host server has one job: deliver the app files when a browser requests them. It holds no database, no patient records, and no business logic that touches sensitive data.

### 3.2 Recommended Platform

| Platform | Cost | Deploy Method | Notes |
|---|---|---|---|
| Netlify | Free | Drag and drop or GitHub push | Simplest option, recommended starting point |
| Cloudflare Pages | Free | GitHub integration | Faster global delivery, also free |
| GitHub Pages | Free | GitHub push | Works but less flexible for routing |

Netlify is recommended for initial deployment. Setup time is under 30 minutes. A custom domain (e.g., techtool.connecthearing.ca) can be added at any time.

### 3.3 What Gets Deployed

- `index.html` — app shell
- `app.js` — all application logic (classification engine, HPD calc, UI)
- `style.css` — UI styles
- `sw.js` — service worker for offline caching
- `manifest.json` — PWA manifest (enables Add to Home Screen in Chrome)

Total estimated package size: under 2MB.

---

## 4. OneDrive Packet System

### 4.1 Folder Structure

A shared OneDrive folder is the only data transport mechanism. No server API is needed for data movement.

| Folder | Purpose | Written By | Read By |
|---|---|---|---|
| `/inbox` | Packets ready for techs to pick up | MasterDB (office) | TechTool (field) |
| `/outbox` | Completed tests ready for import | TechTool (field) | MasterDB (office) |
| `/archive` | Processed packets for record keeping | MasterDB (office) | Reference only |

### 4.2 Packet File Naming

`CompanyName_YYYY-MM-DD_TechInitials.json`

Example: `SunriseMillingLP_2026-04-15_NR.json`

### 4.3 Packet Contents

- Company details (name, address, province, contact)
- Employee list with demographics and baseline audiogram data
- Prior test history (last 3 tests per employee)
- Classification rules for the applicable province (AB, BC, or SK)
- Counsel templates for each classification category
- HPD inventory for the company
- Sticky notes from the office (travel to tech with the packet)
- Completed test results appended by TechTool before return

### 4.4 Microsoft Graph API

TechTool and MasterDB both access OneDrive directly from the browser using the Microsoft Graph API. No server intermediary is required. Techs authenticate once with their Microsoft 365 account — the same credentials they already use for OneDrive.

- Read packet from `/inbox` on sync
- Write completed packet to `/outbox` on submission
- Authentication: Microsoft MSAL.js library (browser-based OAuth)

---

## 5. TechTool — Field Application

### 5.1 Overview

TechTool is the field-facing application used by 6+ technicians on Windows laptops. It opens in Chrome, requires no installation, and works fully offline after an initial packet sync.

### 5.2 Offline Strategy

| Layer | Technology | What It Stores | Persistence |
|---|---|---|---|
| App Shell | Service Worker Cache | HTML, CSS, JS — the app itself | Until browser data cleared |
| Packet Data | IndexedDB | Companies, employees, baselines, rules | Until browser data cleared |
| In-Progress Tests | IndexedDB | Tests entered but not yet submitted | Until browser data cleared |
| Completed Tests | IndexedDB | Tests queued for sync to /outbox | Until successfully synced |

### 5.3 Pre-Trip Sync Workflow

Before leaving for a trip, the tech performs a single sync while connected:

1. Open TechTool in Chrome
2. Navigate to **My Schedule** — all upcoming companies are listed
3. Click **Sync All Packets** — app downloads all assigned packets from OneDrive `/inbox`
4. Progress indicator shows: *Downloading 14 companies... 11 of 14 complete*
5. On completion: *14 companies ready — Last synced April 10, 2026 at 8:42 AM*

Tech is now offline-capable for the entire trip. Browser can be closed and laptop restarted without losing cached data.

### 5.4 Screen Flow

| Screen | Purpose | Key Actions |
|---|---|---|
| Login | Microsoft 365 authentication | Sign in with work account (one-time per device) |
| My Schedule | Trip overview and sync hub | Sync All Packets, view upcoming companies, offline status indicators |
| Company Detail | Pre-test review | Employee list, sticky notes from office, prior visit summary |
| Employee List | Select worker for testing | Filter by name, show classification history |
| Test Entry | Audiogram data entry | Enter thresholds by frequency, live audiogram renders as typed |
| Audiogram View | Real-time audiogram | Current test overlaid on baseline, STS flagged automatically |
| Classification | Auto-calculated result | Category displayed (Normal / Early Warning / Abnormal for AB & SK), rule that triggered it shown |
| Counsel Screen | Tech edits counsel summary | Auto-generated from template, tech can edit before finalizing |
| HPD Assessment | Hearing protection adequacy | NRR input, CSA Z94.2-14 derating, LEX-8hr, adequacy result |
| Submit Test | Finalize and queue | Review summary, confirm, queued to /outbox for sync |
| Sync Status | Connection and queue state | Tests pending sync, last sync time, manual sync trigger |

### 5.5 Classification Engine

The classification engine is data-driven — rules are stored in the packet JSON, not hard-coded. This allows new provinces to be added by inserting rule data without code changes.

| Province | Regulation | Categories | Frequencies Tested | Frequencies Used for Classification |
|---|---|---|---|---|
| Alberta | OHS Part 16, Schedule 3 | Normal / Early Warning / Abnormal | 500–8K Hz | 500–6K Hz only (8K tested, not classified) |
| BC | WorkSafeBC OHS Reg 7.8 | Normal / Early Warning Change / Abnormal Change | 500–8K Hz | Per WorkSafeBC criteria |
| Saskatchewan | OHS Regulations 1996, s.113 | Normal / Early Warning / Abnormal | 500–8K Hz | 500–6K Hz only (8K tested, not classified) |
| Expanding | MB, ON (planned) | TBD per province | TBD | Rules inserted as data — no code changes required |

#### Saskatchewan Classification Criteria (OHS Regulations 1996, Appendix 1)

**Abnormal Baseline Audiogram**
- Hearing threshold averages ≥ 25 dB HL at 500–6000 Hz in either ear (baseline test)

**Early Warning Audiogram** (periodic tests)
- Drop of ≥ 15 dB in either ear at 2000–6000 Hz vs. baseline or prior periodic test

**Abnormal Audiogram** (periodic tests)
- Drop of ≥ 15 dB at any two adjacent frequencies, OR
- Drop of ≥ 25 dB at any single frequency, from 500–6000 Hz vs. baseline or prior periodic test

Testing required at least every 24 months. Supervising health professional must be a physician, audiologist, or registered nurse certified in audiometric testing.

### 5.6 HPD Adequacy Calculation

- Standard: CSA Z94.2-14 derating method
- Tech enters rated NRR from HPD packaging
- Tech enters LEX-8hr (noise exposure level from company records or measurement)
- App calculates derated NRR, protected exposure level, and adequacy result
- Result: **Adequate / Marginal / Inadequate** with supporting numbers shown

---

## 6. MasterDB — Office Application

### 6.1 Overview

MasterDB is the office-facing application used by admin staff. It runs in Chrome on the office workstation. The master database (SQLite via Origin Private File System) resides entirely on the office machine — never on the host server.

### 6.2 Core Functions

- Manage companies — create, edit, contact details, province, HPD inventory, sticky notes
- Manage employees — demographics, baseline audiogram, employment status
- Generate tech packets — select company and tech, create JSON packet, drop to OneDrive `/inbox`
- Import completed packets — review results from `/outbox` before importing
- Test history — full audiogram history per employee, trend view
- Schedule management — trip planning, company visit dates, tech assignments
- Report generation — company reports, employee reports, STS reports
- Classification review — flag employees requiring follow-up

### 6.3 Screen Flow

| Screen | Purpose |
|---|---|
| Dashboard | Summary: pending packets, tests due, incoming completed packets, STS flags |
| Companies | Master company list — add, edit, view history, generate packets |
| Company Detail | All employees, test history, sticky notes, schedule, HPD inventory |
| Employees | Search across all companies, filter by classification, STS status |
| Generate Packet | Select company + tech + visit date, preview packet contents, drop to /inbox |
| Incoming Review | Review completed packets from /outbox before importing — see all results |
| Import Confirm | Confirm import, flag anomalies, move packet to /archive |
| Reports | Generate company or employee PDF reports |
| Schedule | Calendar view of upcoming visits, assign techs |
| Settings | Province rules, counsel templates, HPD derating defaults, user accounts |

### 6.4 Database

MasterDB uses SQLite stored in the browser's Origin Private File System (OPFS). Data never leaves the office workstation.

| Table | Key Fields |
|---|---|
| provinces | province_code, province_name, regulation_ref, active |
| classification_rules | province_code, category, threshold_type, threshold_value, frequency |
| counsel_templates | province_code, category, template_text |
| companies | company_id, name, province, address, contact, sticky_notes, active |
| employees | employee_id, company_id, name, dob, hire_date, job_title, status |
| baselines | baseline_id, employee_id, test_date, thresholds (500–8000 Hz both ears) |
| tests | test_id, employee_id, test_date, tech_id, thresholds, classification, STS_flag, counsel |
| hpd_assessments | assessment_id, test_id, hpd_make_model, nrr, derated_nrr, lex8hr, adequacy |
| packets | packet_id, company_id, tech_id, created_date, status, filename |
| schedules | schedule_id, company_id, tech_id, visit_date, notes |

---

## 7. User Roles and Access

| Role | Access | Typical User |
|---|---|---|
| Tech | TechTool only — own assigned packets | Field audiometric technicians |
| Admin | MasterDB full access — all companies, all techs | Office administrator |
| Manager | MasterDB read + reports — no edit access | Regional or division manager |

Authentication is handled via Microsoft 365 (MSAL.js). Role assignment is managed in MasterDB settings by the Admin. No separate user account system is required — existing Connect Hearing Microsoft 365 accounts are used.

---

## 8. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| UI Framework | Vanilla JS or React | Classification/HPD logic already in JS — minimal framework overhead needed |
| Offline Storage | IndexedDB (TechTool) | Browser-native, no install, survives browser close and restart |
| Office Database | SQLite via OPFS (MasterDB) | Existing schema preserved, data stays on office machine |
| OneDrive Access | Microsoft Graph API + MSAL.js | Browser-native OneDrive read/write, uses existing M365 credentials |
| Offline App Cache | Service Worker | Caches app shell so TechTool loads without internet |
| Audiogram Rendering | Canvas API or SVG | Existing audiogram logic migrates cleanly |
| PDF Reports | jsPDF or print CSS | Client-side PDF generation, no server needed |
| Host / Delivery | Netlify or Cloudflare Pages | Static file host, free tier sufficient, zero backend |

---

## 9. Migration Plan from Electron

### 9.1 What Migrates Directly

- Classification engine (JavaScript) — unchanged
- Alberta OHS Part 16 rules — unchanged
- BC WorkSafeBC rules — unchanged
- Saskatchewan OHS Regulations 1996 rules — new, added for June 2026
- HPD adequacy calculation (CSA Z94.2-14) — unchanged
- SQLite schema — migrates to OPFS-based SQLite in MasterDB
- Packet JSON structure — unchanged
- Counsel templates — unchanged
- All screen layouts and UI logic — ported from Electron renderer to browser

### 9.2 What Changes

- Electron shell removed — app runs in Chrome instead
- Direct SQLite file access → OPFS-based SQLite (MasterDB) or IndexedDB (TechTool)
- OneDrive file system watcher → Microsoft Graph API polling or webhook
- Local file paths → browser storage APIs

### 9.3 Build Phases

| Phase | Scope | Deliverable |
|---|---|---|
| 1 — Foundation | Shared classification engine, packet schema, province rules as JSON (AB, BC, SK), Microsoft Graph OneDrive integration, MSAL.js auth | Core library tested and working in browser |
| 2 — TechTool MVP | All TechTool screens: schedule, company detail, employee list, test entry, audiogram, classification, counsel, HPD, submit | Techs can complete a full test offline and sync |
| 3 — MasterDB MVP | All MasterDB screens: companies, employees, packet generation, incoming review, import, basic reports | Office can generate packets and import results |
| 4 — Reports | PDF company reports, employee history reports, STS summary reports | Reporting parity with current Electron build |
| 5 — Polish | Schedule management, settings screen, manager read-only role, edge case handling | Production-ready system |

---

## 10. Security and Compliance

- No patient or worker data transits or resides on the host server — ever
- All sensitive data stays on office-controlled hardware (MasterDB machine) or tech-controlled hardware (laptop IndexedDB)
- OneDrive transport layer is within Connect Hearing's existing Microsoft 365 tenant
- Authentication via Microsoft 365 — no new credential system required
- HTTPS enforced by Netlify/Cloudflare — all app delivery encrypted in transit
- IndexedDB and OPFS data is sandboxed per browser origin — not accessible to other websites
- Suitable for WorkSafeBC, Alberta OHS, and Saskatchewan OHS worker health record requirements

---

## 11. Open Items

| Item | Question | Impact |
|---|---|---|
| OneDrive Folder | Shared folder setup — who owns the OneDrive and how are tech permissions managed? | Affects Microsoft Graph API scope and auth flow |
| OPFS Support | Confirm Chrome version on office workstation supports OPFS (Chrome 86+) | May affect MasterDB database approach |
| Packet Conflict | What happens if two techs are assigned the same company simultaneously? | Packet naming and merge strategy needed |
| Report Format | Are current PDF report layouts documented anywhere from the Electron build? | Phase 4 scope depends on this |
| Province Expansion | Saskatchewan added as active province for June 2026. Which provinces are next after AB, BC, and SK, and on what timeline? | Rule data needs to be sourced per province |

---

*© 2026 Norm Robichaud — Connect Hearing Canada Industrial Division. Confidential and proprietary.*
