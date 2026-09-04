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
   - **Visit date** — the scheduled date of the site visit
   - **Assign to tech** — select the technician from the dropdown
6. Click **Generate & Write to Outbox**.

The packet appears in the Schedule calendar and in the tech's TechTool inbox. The status shows as **Outbox** until the tech opens it.

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

**Steps:**

1. Go to **Import** in the sidebar.
2. Select the **technician** whose inbox you want to check.
3. A list of waiting packets appears. Select the packet you want to import.
4. Review the **preview**:
   - New workers are highlighted — these are employees who appear in the packet but are not yet in MasterDB. Confirm them or skip.
   - Any flagged decisions (e.g., unknown location, worker name mismatch) appear here. Resolve each one before proceeding.
5. Click **Commit**.
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

Reconcile is a sanity check: it compares what's in the archive folder on OneDrive against what's recorded in the database. Run it periodically, or any time you suspect a packet was lost.

**Steps:**

1. Go to **Reconcile** in the sidebar.
2. The app scans the archive folders for all active technicians and compares them to the packets table in MasterDB.
3. Results appear as:
   - **Matched** — packet in archive and in database, consistent
   - **Archive only** — packet file exists but no database record (may need re-import)
   - **Database only** — database record but no archive file (may have been moved or deleted)
4. Investigate any unmatched items. A packet in "Archive only" can usually be re-imported from the Import screen.

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

1. Go to **Settings** → **Users**.
2. Add or edit users with their name, role (Admin, LC, Aud-Tech, Management), and OneDrive folder name if they are a technician.

**Technicians** are a separate record from users — they appear in packet generation dropdowns and have a designated OneDrive folder.

1. Go to **Settings** → **Technicians**.
2. Each tech record needs a **folder name** — this must exactly match the folder name inside `techs/` on the shared OneDrive (e.g., `norm`, `heather`). The outbox and inbox folders live under this path.

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
3. You will see all packets assigned to you with a status of **Outbox** (not yet opened) or **In Progress**.
4. Tap a packet to open it. TechTool loads the worker roster and company details.
5. Repeat for any other packets you need for the trip.

Once opened, the packet is cached locally. You can work fully offline from this point.

---

### Run a Hearing Test

**Steps:**

1. From **Inbox**, open the packet for the site you're at.
2. Tap a worker's name to begin their test.
3. Complete the **pre-test questionnaire** — HPD use, noise exposure history, any recent loud noise events.
4. Run the audiogram. Enter thresholds for each frequency in both ears.
5. The app calculates the audiometric category based on the location's province rules and displays it immediately.
6. Complete the **post-test section** if applicable (referral decisions, counselling notes).
7. Save the test. The worker's row in the roster updates to show their result.
8. Move to the next worker.

**Dual-booth:** If you're running two booths simultaneously, TechTool handles both — open one worker in each panel and work them in parallel.

**Baseline tests:** First-time workers are flagged automatically. Their test becomes the baseline on record.

---

### Handle a Walk-In

A walk-in is a worker who shows up for testing but is not on the original roster for the day.

**Steps:**

1. Go to **New Visit** in the sidebar.
2. Search for the **company** by name and select it.
3. Select the **location** for this visit.
4. Search for the **worker** by name.
   - If they're already in the database, select them.
   - If not, enter their details (name, employee ID) to create a new record.
5. TechTool creates a mini-packet for this worker on the spot.
6. Proceed with the test the same way as a scheduled worker.

The walk-in test is submitted alongside the main packet when you finish the visit.

---

### Submit Completed Results

When all workers for a visit are tested, submit the packet. This sends the results back to Admin for import.

**Steps:**

1. From **Inbox**, open the completed packet.
2. Review the worker list — all tested workers show a category result. Workers marked **Not Tested** will remain untested in the record (document the reason if needed).
3. Tap **Submit**.
4. The packet moves from your outbox to your inbox folder on OneDrive. Admin will see it on the Import screen.

**If you're still offline when you finish:** TechTool saves results locally. Submit as soon as you have a connection — the file will sync to OneDrive automatically.

---

## 5. Management Reference

### What You Need to Know

You do not need to operate MasterDB day-to-day. This section is a quick-reference for interpreting the data and understanding what your team is doing.

### The Schedule View

The Schedule screen in MasterDB shows a month calendar of all scheduled site visits, colour-coded by technician. A chip on the calendar means a packet has been generated for that date. You can click any chip to see the company, location, tech, and packet status.

**Statuses:**
| Status | Meaning |
|---|---|
| Outbox | Packet generated, tech hasn't opened it yet |
| In Progress | Tech has opened and begun testing |
| Inbox | Tech submitted, waiting for Admin to import |
| Archived | Admin has imported and closed the visit |

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

- **Inbox backlog:** Packets stuck in "Inbox" status haven't been imported yet. Ask Admin if visits from more than a day or two ago are still showing Inbox.
- **Reconcile discrepancies:** If Admin finds packets in the archive with no database record, tests may have been lost. Worth flagging.
- **Lead Finder pipeline:** New companies enter from Lead Finder → LC books a visit → LC generates a packet → test day → Admin imports. If the pipeline is thin, check with the LC on lead status.

---

*Last updated: September 2026*  
*Questions or corrections: norman.robichaud@connecthearing.ca*
