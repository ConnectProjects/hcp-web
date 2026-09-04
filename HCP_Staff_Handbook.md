# HCP-Web Staff Handbook

**Connect Hearing — Industrial Division**  
Internal reference. Not for distribution outside Connect Hearing.

---

## Contents

1. [Platform Overview](#1-platform-overview) — start here, especially if you're in management
2. [Logistical Coordinator](#2-logistical-coordinator)
3. [Administrator](#3-administrator)
4. [Audiometric Technician](#4-audiometric-technician)
5. [Management Reference](#5-management-reference)

---

## 1. Platform Overview

### What HCP-Web Is

HCP-Web is Connect Hearing's internal platform for running industrial audiometric programs. It handles everything from booking a site visit to producing a provincially compliant test report.

It runs entirely in the browser — no software to install. All health records stay inside Connect Hearing's Microsoft 365 environment (OneDrive). Nothing is stored on any external server.

### The Three Tools

| Tool | Who Uses It | What It Does |
|---|---|---|
| **MasterDB** | LCs, Admins | Manage companies, workers, schedules; generate packets; import results; run reports |
| **TechTool** | Aud-Techs | Pick up packets, run hearing tests, submit results |
| **Lead Finder** | LCs | Discover industrial leads, track submissions to RBS |

MasterDB and TechTool are accessed at the same URL — the app shows each person the screens for their role.

**URL:** https://connectprojects.github.io/hcp-web/

### The Packet Lifecycle

A "packet" is a file that carries everything a technician needs for one site visit — the company details, employee roster, and province rules. Results travel back the same way.

```
LC creates packet          Tech receives it         Admin closes the loop
──────────────────         ─────────────────        ──────────────────────
MasterDB                   TechTool                 MasterDB
Location detail        →   Inbox                →   Import
Generate & Write           Open packet              Select tech → file
  to Outbox                Run tests                Preview → Commit
                           Submit                   → Archive
```

This is the central workflow everything else supports.

### How Data Is Stored

The database is a single file — `masterdb.sqlite` — in a shared OneDrive folder. Everyone who needs MasterDB access has that folder synced to their machine. The browser reads and writes the file directly.

There is no cloud database, no login credentials to manage beyond OneDrive, and no data leaving the Microsoft 365 environment.

### The Four Roles

| Role | Primary tool | Core responsibility |
|---|---|---|
| **Logistical Coordinator (LC)** | MasterDB, Lead Finder | Book visits, generate packets, discover leads |
| **Administrator** | MasterDB | Import results, maintain the database, produce reports |
| **Audiometric Technician** | TechTool | Conduct hearing tests, submit completed packets |
| **Management** | MasterDB (read-only) | Review reports and dashboard |

One person can hold more than one role.

---

## 2. Logistical Coordinator

### Your Role

You are the bridge between a company booking a hearing test and the technician arriving on site. You set up the company in MasterDB, schedule the visit, and generate the packet the tech will use. You also use Lead Finder to discover new companies and track outreach.

### Processes

- [Schedule a Hearing Test Visit](#schedule-a-hearing-test-visit)
- [Add a New Company or Location](#add-a-new-company-or-location)
- [Find and Track New Leads](#find-and-track-new-leads)

---

### Schedule a Hearing Test Visit

This is the most common task. You have a confirmed booking — a company, a date, and an assigned tech — and you need to get the packet into that tech's hands.

**Before you start:** The company, location, and technician must already exist in MasterDB. If not, see [Add a New Company or Location](#add-a-new-company-or-location) first.

**Steps:**

1. Open MasterDB and go to **Companies** in the sidebar.
2. Find the company and click into it.
3. Under the company's locations, click the relevant **location**.
4. On the location detail page, scroll to the **Generate Packet** section.
5. Fill in:
   - **Tech** — select the technician from the dropdown
   - **Visit Date** — the scheduled date of the site visit
   - **Notes for Tech** — optional; anything the tech should know before arrival
6. Click **Generate & Write to Outbox**.

The packet appears in the Schedule calendar and in the tech's TechTool inbox. The status shows as **Pending** until the tech picks it up.

**What if the roster looks wrong?**  
Worker records come from previous test history. If someone is missing or a worker has left, the Admin can update the worker list before the packet is generated. Let Admin know ahead of time.

---

### Add a New Company or Location

**Steps:**

1. Go to **Companies** → **Add Company** (top right).
2. Fill in the company name and any other details. Save.
3. On the new company's detail page, click **Add Location**.
4. Fill in the location name and **province** — this is critical, as it determines which classification rules apply to the tests.
5. Save the location.

The company and location are now available for packet generation.

**Note on provinces:** Each location has its own province. A company with sites in Alberta and BC will have two locations with different provinces. Tests are classified under the rules for the location's province, not the company's headquarters.

---

### Find and Track New Leads

Lead Finder is a separate tool for discovering companies that likely have noise-exposed workers.

**URL:** https://connectprojects.github.io/hcp-web/lead-finder/

**Typical workflow:**

1. Enter a search term (e.g., "sawmill", "mine", "foundry") and a city or region.
2. Lead Finder searches Google Places and returns matching businesses.
3. Review the results. Flag companies worth pursuing.
4. Leads are tracked in the Supabase database — you can see status (new, contacted, booked, declined) across sessions.
5. Qualified leads that become bookings are handed off for scheduling in MasterDB.

**Who sees the outreach?** Email outreach goes to Cliff Stephens as the primary contact. Replies come back to Cliff for booking coordination.

---

## 3. Administrator

### Your Role

You are the keeper of the database. After a site visit, the tech's completed packet comes back through OneDrive and you import it into MasterDB. You also maintain company and worker records, run compliance and billing reports, and periodically reconcile the archive to make sure nothing is missing.

### Processes

- [Import Results from the Field](#import-results-from-the-field)
- [Run a Report](#run-a-report)
- [Reconcile the Archive](#reconcile-the-archive)
- [Manage Workers](#manage-workers)
- [Manage Users and Technicians](#manage-users-and-technicians)

---

### Import Results from the Field

When a tech submits a completed packet, it moves into their inbox folder on OneDrive. You import it into MasterDB.

**Option 1 — Auto-import (try this first):**

1. Go to **Import** in the sidebar.
2. Click **Auto-import all →**.
3. The app scans every tech's inbox and commits any packet that imports cleanly — no unknown workers, no location conflicts, no duplicates.
4. A summary shows how many packets were imported and how many need manual review.

**Option 2 — Manual review (for packets that need decisions):**

1. Go to **Import** in the sidebar.
2. Select the **technician** whose inbox you want to check.
3. A list of waiting packets appears. Select the packet you want to import.
4. Review the **preview**:
   - New workers are highlighted — these are employees who appear in the packet but are not yet in MasterDB. Confirm them or skip.
   - Any flagged decisions (e.g., unknown location, worker name mismatch) appear here. Resolve each one before proceeding.
5. Click **Commit Import**.
6. The packet moves to the tech's archive folder and the tests are recorded in MasterDB.

**If a packet doesn't appear:** Make sure the tech submitted it (not just saved). The packet must be in their inbox folder, not outbox. Check with the tech if expected packets are missing.

**Importing a walk-in:** Walk-in packets (created by the tech in the field for workers not on the original roster) come through the same flow. They may flag more decisions than a regular packet because the worker may not be in the database yet.

---

### Run a Report

Reports produce a date-range summary of tests — useful for billing, compliance documentation, and company follow-ups.

**Steps:**

1. Go to **Reports** in the sidebar.
2. Set the **date range** (From / To). Defaults to the current calendar year.
3. Optionally filter by **Company** and then by specific **Locations**.
4. The report table updates automatically — grouped by company → location → visit date.
5. Each row shows the worker count and a breakdown by audiometric category (Normal, Standard Threshold Shift, etc.).
6. Click **Download CSV** to export for billing or external records.

**Note on categories:** Category labels follow the province rules for each test's location. A test in Alberta is classified under Alberta OHS Part 16; a test in BC under WorkSafeBC. The report shows the label as it applies to that province.

---

### Reconcile the Archive

Reconcile is a data-integrity check: for every archived packet, it counts how many tests with actual threshold data are inside the packet file, then checks whether that same number of test records exist in the database. Run it periodically, or any time you suspect tests were lost during an import.

**Steps:**

1. Go to **Reconcile** in the sidebar.
2. Click **Run Check →**.
3. The app reads every packet in every tech's archive folder and compares test counts against the database (matched by packet ID).
4. Results appear per packet:
   - **✓ Match** — test count in the archive file equals the database record count; all good
   - **Missing N** — the archive file has more tests than the database; tests may not have been imported
   - **+N extra** — the database has more records than the archive file; possibly a double-import
5. Expand any mismatched packet row to see which workers are affected. Contact Norm if you find missing tests — recovery requires manual inspection.

**Note:** Only tests with threshold data count. Workers who were skipped or attended without a completed audiogram are not expected to have database records and are excluded from the comparison.

---

### Manage Workers

Worker records are created automatically when a packet is first imported. Ongoing maintenance:

- **Update a worker's details:** Go to **Workers** → search by name → open the worker → edit.
- **Mark a worker as inactive:** Open the worker record and toggle their status. Inactive workers are excluded from future packet rosters.
- **Merge duplicates:** If the same person appears under two names (e.g., "Smith, Bob" and "Robert Smith"), contact Norm — manual merges require care to avoid losing test history.
- **View test history:** The worker detail page lists every test on record, with audiogram and category.

---

### Manage Users and Technicians

**Users** control who can log into MasterDB and what role they see.

1. Go to **Users** in the sidebar.
2. Add or edit users with their name, role (Admin, LC, Aud-Tech, Management), and initials.

**Technicians** are a separate record — they appear in packet generation dropdowns and have a designated OneDrive folder. A user who is also a tech needs both a user record and a tech record.

1. Go to **Settings** in the sidebar, then scroll to the **Technicians** section.
2. Each tech record needs a **folder name** — this must exactly match the folder name inside `techs/` on the shared OneDrive (e.g., `Norman`, `Cal`). The outbox and inbox folders live under this path.
3. Each tech also needs a **IAT Number** for compliance records, and **initials** that appear on packet filenames.

**Tip:** Running **Seed Staff Users** in Settings → Seed Data will populate the current Connect Hearing roster in one click, and is safe to run more than once.

---

## 4. Audiometric Technician

### Your Role

You travel to industrial sites and conduct hearing tests. Before a trip, your packets are waiting in TechTool. After testing, you submit — the results go back to Admin automatically. For walk-in workers not on the roster, you create a new visit on the spot.

TechTool works offline once you've loaded your packets. You do not need internet at the test site.

### Processes

- [Pick Up Your Packets](#pick-up-your-packets)
- [Run a Hearing Test](#run-a-hearing-test)
- [Handle a Walk-In](#handle-a-walk-in)
- [Submit Completed Results](#submit-completed-results)

---

### Pick Up Your Packets

Before leaving for a site visit, make sure you have a copy of the packet on your device. This requires an internet connection — do it while you still have one.

**Steps:**

1. Open TechTool (https://connectprojects.github.io/hcp-web/).
2. Go to **Inbox** in the sidebar.
3. You will see cards for all packets assigned to you. Each card shows the company, location, visit date, and a progress badge:
   - **N workers** (gray) — not started yet
   - **N of N tested** (blue) — in progress
   - **Complete — ready to submit** (green) — all workers done
4. Tap a card to open the packet. TechTool loads the worker roster and company details.
5. Repeat for any other packets you need for the trip.

Once opened, the packet is cached locally. You can work fully offline from this point.

---

### Run a Hearing Test

**Steps:**

1. From **Inbox**, open the packet for the site you're at.
2. Click **Test →** next to a worker's name to begin their test.
3. Confirm or correct the **Worker Info** at the top (name, DOB, job title).
4. Complete the **Pre-Test Questions** — recent noise exposure, HPD use, employer information.
5. Enter thresholds for each frequency in both ears. The audiogram updates live as you type.
6. Set the **Type** (Periodic / Baseline / Exit) and confirm the **Date**.
7. Complete the **Post-Test Questions** — medical history, tinnitus, firearms use.
8. Add any **Tech Notes** if needed.
9. Click **Save test**. The worker's row updates to show they've been tested.
10. Move to the next worker.

**Classification:** Audiometric categories (Normal, STS, Referral) are calculated when Admin imports the packet in MasterDB — they are not shown in TechTool during testing.

**Dual-booth:** TechTool supports two simultaneous booths — Left Booth and Right Booth tabs at the top. Assign one worker to each and switch between them as needed.

**Baseline tests:** For a worker's first test, set Type to **Baseline**. The app defaults to Periodic — you need to change this manually. Workers with no baseline on file show "None" in the Baseline column as a reminder.

---

### Handle a Walk-In

A walk-in is a worker who shows up for testing but is not on the original roster for the day.

**Steps:**

New Visit is a 3-step wizard.

**Step 1 — Company:**
Search for the company by name. Select it if found. If it's a brand-new company, fill in the details below the search box.

**Step 2 — Location:**
If the company has existing locations, pick from the list or choose **+ Add new location**. Set the province — this determines which classification rules apply.

**Step 3 — Workers:**
Search for each worker by name. If found in the database, select them. If not, fill in the name fields to create a new worker record. Add all workers you'll be testing.

Click **Create Visit →** when ready. TechTool writes the packet to your outbox and returns you to the **Schedule** screen, where the new visit appears as a calendar chip. Tap it to open and begin testing.

**Each walk-in is its own separate packet** — it is not merged with any other packet from the same day. It submits and imports the same way as a scheduled packet.

---

### Submit Completed Results

When all workers for a visit are tested, submit the packet. This sends the results back to Admin for import.

**Steps:**

1. From **Inbox**, open the completed packet.
2. Review the worker list. Workers can be in one of three states:
   - **Tested** (green) — audiogram saved
   - **Skipped** (gray) — marked absent or deferred, with a reason
   - Untested — still needs action
3. The **Submit Packet →** button becomes active when every worker is either Tested or Skipped. If a worker won't be tested (absent, refused, etc.), use the **Skip worker** button on their test screen and enter a reason.
4. Click **Submit Packet →**.
5. The packet moves from your outbox to your inbox folder on OneDrive. Admin will see it on the Import screen.

**If you're still offline when you finish:** TechTool saves results locally. Submit as soon as you have a connection — the file will sync to OneDrive automatically.

---

## 5. Management Reference

### What You Need to Know

You do not need to operate MasterDB day-to-day. This section is a quick-reference for interpreting the data and understanding what your team is doing.

### The Schedule View

The Schedule screen in MasterDB shows a month calendar of all scheduled site visits, colour-coded by technician. A chip on the calendar means a packet has been generated for that date. You can click any chip to see the company, location, tech, and packet status.

**Statuses on the MasterDB Schedule:**
| Status | Meaning |
|---|---|
| Pending | Packet generated, not yet picked up by the tech |
| Imported | Admin has imported and closed the visit |
| Cancelled | Visit was cancelled |

**Statuses on the TechTool Schedule (what the tech sees):**
| Status | Meaning |
|---|---|
| Scheduled | Packet exists in DB but no file in the tech's OneDrive yet |
| Ready to test | File is in the outbox, no tests started |
| In progress | Some workers tested, not all done |
| Complete | All workers tested or skipped — ready to submit |
| Submitted | Tech has submitted, waiting for Admin to import |

### The Reports Screen

Reports → set a date range → optionally filter by company → download CSV.

The summary table shows, for each visit:

- Company and location
- Visit date and technician
- Number of workers tested
- Category breakdown (Normal / STS / Referral / etc.)

This is the primary view for billing reconciliation and compliance documentation.

### Audiometric Categories

Results are classified by province. Across all supported provinces, the main categories are:

| Category | Plain meaning |
|---|---|
| Normal | Hearing within expected limits for age and noise exposure |
| STS (Standard Threshold Shift) | Meaningful change from baseline — flag for follow-up |
| Referral | Significant loss — worker requires referral to an audiologist |

Province-specific labels may differ slightly (Alberta uses different threshold criteria than BC), but these three buckets cover the main outcomes.

### Key Things to Watch

- **Submitted backlog:** Packets in "Submitted" status (visible on TechTool Schedule) haven't been imported yet. Ask Admin if visits from more than a day or two ago are still showing Submitted.
- **Reconcile discrepancies:** If Admin finds packets where the archive test count doesn't match the database, tests may have been lost. Worth flagging.
- **Lead Finder pipeline:** New companies enter from Lead Finder → LC books a visit → LC generates a packet → test day → Admin imports. If the pipeline is thin, check with the LC on lead status.

---

*Last updated: September 2026*  
*Questions or corrections: norman.robichaud@connecthearing.ca*
