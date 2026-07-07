# Connect Hearing Industrial Division
## HCP Platform: Complete User Manual

### MasterDB

#### What is MasterDB?
MasterDB is the office administration component of the HCP-Web Hearing Conservation Platform used by Connect Hearing's Industrial Division. It runs entirely in your browser and works offline once loaded.

#### What MasterDB does
MasterDB is the central database for your industrial audiometric testing program. It stores company records, employee records, test results, baselines, and generated packets. It also receives completed test packets from field technicians via the sync folder.

#### What MasterDB does not do
MasterDB does not conduct audiometric tests — that is handled by TechTool, which runs on the technician's field device. MasterDB and TechTool communicate by exchanging JSON packet files through a shared sync folder (typically on OneDrive).

#### The two-app workflow
1. **Office creates a packet** in MasterDB (Generate Packet) and saves it to the sync folder.
2. **Technician opens the packet** in TechTool on-site, conducts tests, and submits the completed packet back to the sync folder.
3. **Office reviews and imports** the completed packet in MasterDB (Incoming Packets), which writes all test results to the database.

> MasterDB stores all data locally in your browser using OPFS (Origin Private File System). Data is tied to this browser on this device. Use the backup feature in Settings regularly.

---

### Getting Started

#### First launch
When you open MasterDB for the first time the database is empty. You can either load demo data to explore the app, or begin entering real data right away.
To load demo data, click **Load Demo Data** on the Dashboard. This adds two sample companies, employees, and test history. Remove it any time via Settings → Clear Demo Data.

#### Setting up your sync folder
The sync folder is a shared folder (typically on OneDrive) that MasterDB and TechTool use to exchange packet files. You need to connect it before generating or receiving packets.
1. Go to **Settings** in the sidebar.
2. Under **Sync Folder**, click **Connect Folder** and select your OneDrive sync folder.
3. The sync indicator in the sidebar footer will show a green dot when connected.

#### Adding your first company
1. Click **Companies** in the sidebar.
2. Click **+ Add Company** and fill in the company name, province, and contact details.
3. Open the company and add employees via the **Employees** tab.

#### Recommended setup order
For a new installation: Settings → organization profile → connect sync folder → add company logo → add technician profiles → add companies → add employees → generate first packet.

---

### Dashboard
The Dashboard gives you a quick overview of the current state of your hearing conservation program. It is the first screen you see when MasterDB opens.

#### KPI tiles
The tiles across the top show key numbers at a glance. Clicking the Companies, Active Employees, or Incoming Packets tiles navigates directly to that screen.

| TILE | WHAT IT SHOWS |
| :--- | :--- |
| **Companies** | Total active companies in the database |
| **Active Employees** | Employees with active status across all companies |
| **Tests (30 days)** | Test records entered or imported in the last 30 days |
| **Incoming Packets** | Completed packets from techs awaiting review. Highlighted when packets are waiting. |
| **Pending (in field)** | Packets that have been generated and sent but not yet returned |

#### Incoming Completed Packets panel
Lists the most recent submitted packets waiting to be imported. Click **Review →** on any packet to go directly to the import confirmation screen. Click **Check Sync Folder** to scan for newly submitted packets from the field.

#### Overdue Tests panel
Lists employees whose last test was more than 24 months ago, or who have never been tested. Use this list to prioritize scheduling. Click **Schedule** in the sidebar to book visits.

---

### Companies
The Companies screen lists all companies in your database. Each company has its own employees, test history, packets, and schedule.

#### Finding a company
Type in the search box to filter by company name. The result count updates as you type.

#### Adding a company
1. Click **+ Add Company**.
2. Enter the company name and province (required). Province determines which regulatory rules apply to test classifications.
3. Optionally add contact details and address.
4. **Sticky Notes** travel with every packet generated for this company and appear in TechTool — use them for site-specific instructions to the technician (e.g. "ask for Bob at the gate", "booth is in the lunchroom").
5. Click **Save Company**. You will be taken directly to the company detail screen.

#### Company Detail screen
Clicking any company opens its detail screen, which has four tabs:

| TAB | CONTENTS |
| :--- | :--- |
| **Employees** | All employees at this company. Add, edit, or view individual employee records and test history. |
| **Packets** | All packets generated for or received from this company. |
| **Schedule** | Upcoming and past visits for this company. |
| **Notes** | Internal sticky notes and company-level information. |

> Province can be changed after a company is created in the company edit form. Changing the province does not retroactively reclassify existing test records — only new tests will use the updated rules.

---

### Employees
The Employees screen lists all employees across all companies. You can search by name or company, and filter by classification.

#### Adding an employee
Employees are added from within a company's detail screen (Companies → open a company → Employees tab → Add Employee). They cannot be added from the global Employees list screen.

#### Employee record
| FIELD | NOTES |
| :--- | :--- |
| **First / Last Name** | Required. Used for packet generation and duplicate matching on import. |
| **Date of Birth** | Used to confirm identity during import. Strongly recommended — avoids name conflict ambiguity. |
| **Hire Date** | Optional. Used for reporting. |
| **Job Title** | Travels with the packet to TechTool. |
| **Status** | Active or inactive. Inactive employees are excluded from new packets. |

#### Baseline
Each employee should have one active baseline — the reference audiogram that all future periodic tests are compared against. The baseline is set automatically when a Baseline test is imported. You can also set or update it manually from the employee detail screen.

#### Manual Test Entry
You can manually add or edit test records for an employee without using the packet workflow. Open the employee, click **Manual Test Entry**, fill in the date and thresholds, and save. This is useful for entering historical data or fixing errors.

#### Deleting Records
To delete an employee or a specific test record, use the **Delete** or **Remove** buttons on their respective detail screens. This will permanently remove the data from the database.
> If an employee has no baseline on file, periodic tests cannot be classified. Make sure all employees have a baseline before their first periodic test.

---

### Packets
A packet is a bundle of employee records and instructions sent to a technician for an on-site testing visit. Packets are generated in MasterDB, completed in TechTool, and then returned to MasterDB for import.

#### Packet lifecycle
1. **Pending** — packet has been generated and saved to the sync folder, awaiting pickup by TechTool.
2. **Submitted** — technician has completed the visit and returned the packet to the sync folder inbox.
3. **Imported** — packet has been reviewed and imported into MasterDB. Test results are now in the database.
4. **Archived** — packet has been archived and is no longer active.

#### Generating a packet
1. Go to the company's detail screen and click **Generate Packet**.
2. Select the visit date and the technician who will conduct the tests.
3. Review the employee list. Active employees are included by default — deselect any who will not be tested.
4. Click **Generate & Save to Sync Folder**. The packet JSON is written to the sync folder's outbox.
> The sync folder must be connected before you can generate a packet. Go to Settings if you see a sync folder warning.

---

### Incoming Packets
The Incoming screen shows all completed packets that have been submitted by technicians and are waiting to be reviewed and imported into MasterDB.

#### Checking for new packets
Click **Check Sync Folder** to scan the sync folder inbox for new completed packets. MasterDB will find any JSON files in the inbox, register them as submitted packets, and move them to the archive folder so the inbox stays clean.

#### Reviewing and importing a packet
1. Click **Review & Import →** on any waiting packet.
2. The Review Import screen shows every employee in the packet, their test results, and the classification assigned by TechTool.
3. Review the results. Employees who were not tested during this visit are shown in grey at the bottom.
4. Click **Import Tests into MasterDB** to finalize, OR click **Reject** if the packet. Rejected packets stay in the database with a "Rejected" status for future review.

#### Warnings you may see
| WARNING | WHAT TO DO |
| :--- | :--- |
| **Company not found in MasterDB** | The company name in the packet doesn't match any company in your database. Create the company first, or check for a name spelling difference. |
| **Records already imported** | This packet has been imported before. Importing again will create duplicate test records. Only proceed if you are sure this is needed. |

---

### Schedule
The Schedule screen helps you plan upcoming site visits and track which companies are due for testing.

#### Adding a visit
1. Click **+ Add Visit**.
2. Select the company, date, and technician.
3. Add any notes (e.g. contact person, access instructions).

#### Marking a visit complete
Once a packet has been generated and the visit has taken place, mark the schedule entry as complete using the **✓ Complete** button. Completed visits move to the Past Visits section.
You can also schedule visits from within a company's detail screen under the Schedule tab.

---

### Reports
The Reports screen generates printable summaries of test results for companies and individual employees.

#### Company Annual Report
A full summary of all test activity for a company over a selected date range. Includes a breakdown of classifications, STS flags, and a table of all employees tested. Suitable for annual regulatory submissions.
1. Select **Company Annual Report**.
2. Choose the company and the date range.
3. Click **Generate** to preview, then **Print / Save as PDF**.

#### Employee History Report
A full audiometric history for a single employee, including audiogram charts for all tests on file. Suitable for providing to an employee or their physician.

#### STS / Flagged Report
Lists all employees with active STS flags or abnormal classifications. Useful for follow-up planning and regulatory reporting.
> For best print results use Chrome or Edge and set margins to "None" or "Minimum" in the print dialog. The reports are formatted for letter-size paper in portrait orientation.

---

### Settings

#### Organization Profile
Your organization's name, address, and contact information. This appears on referral forms, reports, and other printed documents. Fill this in before generating any printed output.

#### Sync Folder
Connect or reconnect your OneDrive (or other shared) folder here. MasterDB needs folder access to send packets to technicians and receive completed packets back. The green dot in the sidebar footer indicates a connected folder.
Folder access is re-requested each browser session — if the dot is grey when you open MasterDB, go to Settings and click **Reconnect**.

#### Company Logo
Upload your organization's logo here. It appears in the sidebar, on generated reports, and on referral forms. PNG or JPG, recommended minimum 400px wide. When the sync folder is connected, the logo is automatically pushed to TechTool when uploaded.

#### Theme Color
Change the sidebar and accent color to match your organization's branding.

#### Technicians
Manage the list of technicians who conduct tests. Each technician record includes their name, initials, sync folder name, IAT number, and email. The IAT number is their Industrial Audiometric Technician certification number — it appears on referral forms.

#### Province Rules
View the classification rules and counselling templates for each province. These are read-only — contact your administrator to update rules.

#### Database Backup
Click **Download Backup** to save a copy of the entire database as a .sqlite file. Store this somewhere safe — it is your only recovery option if the browser data is cleared.
> **Clearing your browser data** (cookies, site data, cache) will permanently delete your MasterDB database. Back up regularly.

#### Clear Demo Data
If you loaded demo data during setup, remove it here once you are ready to work with real data.

---

### Import Legacy Excel
The Legacy Import feature allows you to bring historical audiometric test data from the old TechTool Excel workbooks into MasterDB. This is a one-time migration tool — once your data is in MasterDB you will use the normal packet workflow going forward.

#### What it imports
Each legacy Excel file contains the baseline test records for one company visit. The importer reads employee names, dates of birth, test dates, test types, and audiometric thresholds at seven frequencies per ear (0.5k, 1k, 2k, 3k, 4k, 6k, 8k).
If the test type is **Baseline**, the importer also creates a baseline record for the employee — provided they don't already have one.

#### Supported file formats
| VARIATION | HANDLED AUTOMATICALLY |
| :--- | :--- |
| **Header row position** | Yes — scans all rows to find headers, not just row 2 or 3 |
| **Column order** | Yes — matched by column name, not position |
| **Headers with embedded notes** | Yes — text after the first line break is ignored |
| **3-letter month abbreviations** | Yes (JUL, AUG) |
| **Full month names** | Yes (JULY, AUGUST, SEPTEMBER) |
| **SEPT as abbreviation** | Yes |
| **Unknown day of birth** | Yes — defaults to the 1st of the month |
| **Company name in file** | Yes — reads "Company/City:" cell if present |
| **Company name from filename** | Yes — used as fallback when not in the file |
| **Visit date from filename** | Yes — parsed from month/day/year in the filename |

#### Step-by-step import process
**STEP 1 — DROP THE FILE**
1. Click **Import Legacy** in the sidebar.
2. Drag and drop the .xlsx file onto the drop zone, or click **browse** to select it.
3. MasterDB parses the file and shows a preview.

**STEP 2 — REVIEW THE PREVIEW**
The preview shows the detected company name, visit date, and the first 10 employee rows. Check that the data looks correct before proceeding.
| NOTICE | MEANING |
| :--- | :--- |
| ✓ 14/14 frequency columns mapped | All frequency columns were found and matched. Good. |
| ⚠ Frequency columns not found | Some frequency columns couldn't be matched. They will be left blank. |
| ⚠ N rows will be skipped | Rows with unreadable or missing test dates. Listed individually. |
Click **Continue →** when you are satisfied with the preview.

**STEP 3 — RESOLVE NAME CONFLICTS (IF ANY)**
If MasterDB finds employees in the file whose names match an existing employee at the same company, but cannot confirm the match by date of birth, a conflict resolution screen appears.
| OPTION | WHEN TO USE IT |
| :--- | :--- |
| **Use existing** | The person in the file is the same person already in the database. |
| **Create as new employee** | This is a different person who happens to share the same name. |
| **Skip** | Do not import any rows for this person in this file. |
Every conflict must have a selection before you can continue.

**STEP 4 — IMPORT COMPLETE**
| STAT | MEANING |
| :--- | :--- |
| **Company: Created / Matched** | Whether the company was found in the database or created as new |
| **Employees: X new · Y matched** | New employee records created vs. existing records matched |
| **Tests inserted** | Number of test records written to the database |
| **Baselines set** | Number of new baseline records created |
| **Skipped** | Rows skipped due to conflict resolution (only shown if > 0) |

#### Duplicate protection
The importer will not create duplicate test records. If you import the same file twice, the second import will find that all test records already exist and insert nothing.

#### Province
All companies created during a legacy import are defaulted to **Alberta (AB)**. If a company is in a different province, update it in the Company Detail screen after import. Legacy imported tests do not have province-based classification applied.

#### Naming conventions for best results
The importer extracts the company name and visit date from the filename when they are not in the file. For best results, name your files like:
`Company_Name_Month_DD_YYYY.xlsx`
For example: `Kal_Tire_089_Jul_22_2025.xlsx` → Company: "Kal Tire 089", Visit date: 2025-07-22

---

### Classifications Reference
Classifications are assigned automatically based on provincial rules. In TechTool, this happens at the time of testing. In MasterDB, classifications are imported with the completed packet.
When a result is Abnormal or STS, the referral to a physician or audiologist is completed on-site during the counselling session — Connect Hearing carries the paper referral forms for this purpose. Referral forms can also be printed from TechTool or MasterDB.

#### Alberta (OHS Code Part 16)
Alberta has five classification rules across two outcomes: Abnormal (A) and Standard Threshold Shift (EW). Normal (N) is the result when no rule fires. Rules 1–3 fire on any test regardless of whether a baseline exists. Rules 4 and 5 require a baseline.

| CODE | LABEL | TRIGGER | ACTION |
| :--- | :--- | :--- | :--- |
| **N** | Normal | No rule triggered | No action required. |
| **EW** | Standard Threshold Shift | Average shift ≥ 10 dB at 2000, 3000, and 4000 Hz (either ear) vs baseline | Sets STS flag. Notify worker within 30 days. Forward to physician or audiologist for assessment. |
| **A** | Abnormal | Threshold > 25 dB at 500–2000 Hz; or > 60 dB at 3–6K Hz; or > 30 dB asymmetry at 3–6K Hz; or shift ≥ 15 dB at two consecutive frequencies 1–6K Hz | Referral required. Employer must be notified within 30 days. Sets STS flag. |

> When an Alberta test triggers both Abnormal and STS criteria simultaneously, Abnormal takes precedence. Both set the STS flag.

**RULE 1 — ABNORMAL: THRESHOLD > 25 DB AT 500–2000 HZ**
Fires on any test, no baseline needed. Example: right ear 1000 Hz = 30 dB.
| EAR | 500 | 1K | 2K | 3K | 4K | 6K | 8K |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Right | 20 | **30** | 20 | 15 | 15 | 20 | 20 |
| Left | 15 | 20 | 15 | 10 | 10 | 15 | 15 |

**RULE 2 — ABNORMAL: THRESHOLD > 60 DB AT 3000–6000 HZ**
Fires on any test, no baseline needed. Example: right ear 4000 Hz = 65 dB. Classic noise notch that has progressed to Abnormal level.
| EAR | 500 | 1K | 2K | 3K | 4K | 6K | 8K |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Right | 15 | 20 | 25 | 25 | **65** | 55 | 50 |
| Left | 15 | 15 | 20 | 20 | 30 | 35 | 30 |

**RULE 3 — ABNORMAL: ASYMMETRY > 30 DB AVERAGED AT 3K+4K+6K**
Fires on any test, no baseline needed. Catches significant one-sided hearing loss. Example: right ear average = 23.3 dB, left ear average = 61.7 dB, difference = 38.3 dB.
| EAR | 500 | 1K | 2K | 3K | 4K | 6K | 8K |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Right | 15 | 15 | 20 | 20 | 25 | 25 | 30 |
| Left | 15 | 20 | 25 | **60** | **65** | **60** | 55 |

**RULE 4 — ABNORMAL SHIFT: ≥ 15 DB AT TWO CONSECUTIVE FREQUENCIES 1K–6K VS BASELINE**
Requires a baseline. Both frequencies in a consecutive pair must each shift ≥ 15 dB. Example: right ear shifts +15 dB at 2K and +20 dB at 3K.
| | 500 | 1K | 2K | 3K | 4K | 6K | 8K |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Baseline R | 10 | 10 | 15 | 15 | 20 | 20 | 25 |
| Current R | 10 | 10 | **30** | **35** | 25 | 25 | 30 |
| **Shift** | 0 | 0 | **+15** | **+20** | +5 | +5 | +5 |

**RULE 5 — STANDARD THRESHOLD SHIFT (STS): AVERAGE SHIFT ≥ 10 DB AT 2K+3K+4K VS BASELINE**
Requires a baseline. The average of the three shifts at exactly 2K, 3K, and 4K must reach 10 dB. Example: +10 dB at each of 2K, 3K, 4K — average = 10.0 dB → EW.
| | 500 | 1K | 2K | 3K | 4K | 6K | 8K |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Baseline R | 10 | 10 | 15 | 15 | 20 | 20 | 25 |
| Current R | 10 | 10 | **25** | **25** | **30** | 25 | 30 |
| **Shift** | 0 | 0 | **+10** | **+10** | **+10** | +5 | +5 |
Average at 2K+3K+4K = (10+10+10) ÷ 3 = **10.0 dB** → EW / STS flag set.

#### British Columbia (WorkSafeBC)
BC uses separate category sets for baseline and periodic tests. Baseline tests produce N, EW, or A. Periodic tests produce NC, EWC, or AC.

| CODE | LABEL | TEST TYPE | TRIGGER |
| :--- | :--- | :--- | :--- |
| **N** | Normal | Baseline | No rule triggered on initial test |
| **EW** | Early Warning | Baseline | Noise notch ≥ 15 dB at 3K/4K/6K above min(1K,2K) anchor |
| **A** | Abnormal | Baseline | Any threshold ≥ 30 dB at 500–2000 Hz |
| **NC** | Normal Change | Periodic | No shift rule triggered — default for periodic tests |
| **EWC** | Early Warning Change | Periodic | Single frequency shift ≥ 15 dB at 3K or 4K vs baseline |
| **AC** | Abnormal Change | Periodic | Two adjacent frequencies both shift ≥ 15 dB at 500–4K Hz vs baseline |

#### Saskatchewan (OHS Regulations 1996)
Saskatchewan uses three categories. Each test is assessed against absolute thresholds (baseline tests) and shift rules (periodic tests).

| CODE | LABEL | TRIGGER | ACTION |
| :--- | :--- | :--- | :--- |
| **N** | Normal | No rule triggered | No action required. |
| **EW** | Early Warning | Single frequency shift ≥ 15 dB at 2K–6K Hz vs baseline | Retest within 24 months. Counsel on HPD use. |
| **A** | Abnormal | Average threshold ≥ 25 dB at 500–6K Hz (baseline); or shift ≥ 15 dB at two adjacent frequencies; or shift ≥ 25 dB at any single frequency | Referral required. |

---

#### Referral workflow
When a result is Abnormal (A or AC) or Standard Threshold Shift (EW in Alberta), the referral to a physician or audiologist is completed on-site during the counselling session. Connect Hearing carries the paper referral forms for this purpose. The referral form can also be printed directly from TechTool or MasterDB and includes the worker's name, employer, test date, classification, audiogram with threshold values, and counsel text.

#### STS Flag
The STS flag is set on any test classified as EW, EWC, A, or AC. For Alberta specifically, EW represents a Standard Threshold Shift as defined in OHS Code Part 16 — an average threshold shift of 10 dB or more at 2000, 3000, and 4000 Hz. STS-flagged employees appear on the Dashboard KPI tile and in the STS / Flagged report.

---

### TechTool: Field Operations Manual

This section contains the complete operational guide for TechTool, the field component of the HCP platform.

#### 1. Overview
TechTool runs in a browser on the technician's device — phone, tablet, or laptop — and works fully offline once loaded. No internet connection is required on-site.

**What TechTool does:**
Guides you through a complete industrial audiometric testing visit. It loads your assigned employee list from a packet, walks you through threshold entry and classification for each employee, and bundles the completed results into a packet that gets submitted back to the office via the sync folder.

**The two-app workflow:**
1. **Office generates a packet** in MasterDB and saves it to the sync folder (OneDrive).
2. **You sync TechTool** on your device to download the packet before you leave for site.
3. **You test each employee** on-site, entering thresholds and reviewing classifications in TechTool.
4. **You submit the completed packet** back to the sync folder when done.

> **Note**: TechTool stores packets locally on your device using IndexedDB. Data persists between sessions but is tied to this browser on this device. Always submit completed packets promptly.

#### 2. Getting Started
**First launch — setting up your profile:**
1. Enter your full name and initials. These are recorded on every test you conduct.
2. Enter your **folder name** — the subfolder name within the sync folder where your packets are stored.
3. Enter your **IAT number** — your Industrial Audiometric Technician certification number.
4. Tap **Start**.

**Connecting the sync folder:**
1. From the Dashboard, tap **↓ Sync**.
2. If no sync folder is connected, a folder picker will appear. Navigate to and select your OneDrive sync folder root.
3. TechTool will look for packets in the `techs/[your folder name]` subfolder.

> **Warning**: Folder access must be re-granted each browser session. If packets don't sync, try tapping Sync again.

#### 3. Screens
**Dashboard:**
The home screen shows today's testing assignments and sync status.
- **Today section**: Shows packets for today. Tap any card to open the company.
- **Upcoming section**: Shows the next five packets scheduled for future dates.

| Button | Action |
| :--- | :--- |
| ↓ Sync | Download new packets from the sync folder |
| ☰ | Go to Schedule — full list of all packets |
| ⚙ | Go to Settings |

**Schedule:**
Lists all packets on this device, organized by date.

| Status | Meaning |
| :--- | :--- |
| Synced | Packet downloaded, not yet started |
| In Progress | Some employees have been tested |
| Complete | All employees resolved (tested or skipped) |
| Submitted | Packet has been submitted back to the office |

**Employee List:**
Your main working screen during a visit.
- **✓ Tested**: Test entry complete.
- **Pending**: Not yet tested.
- **Skipped**: Marked as not tested with a reason (Not present today, Left company, Declined to test).

**Adding an employee on-site**: Tap **+ Add Employee**. These will be created in MasterDB on import.

#### 4. Testing Workflow
**Pre-Test Questionnaire:**
Mandatory survey before thresholds are entered:
- **Noise Exposure**: Confirms if worker was exposed to noise within the last 2 hours.
- **HPD Use**: Confirms if worker regularly wears hearing protection.
- **Employer Info**: Confirms if noise/safety education was provided in the last year.

**Test Entry:**
- **Baseline**: Reference audiogram.
- **Periodic**: Comparison test.
1. Tap frequency cell.
2. Select value (0-100 dB, or NR).
3. Check the live audiogram chart.

**Classification:**
Applied automatically based on provincial rules.
- **Green**: Normal (N), Normal Change (NC)
- **Yellow**: Early Warning (EW), Early Warning Change (EWC)
- **Red**: Abnormal (A), Abnormal Change (AC)

**Counsel:**
Review and edit counsel text.
- **Counsel text**: Editable text that goes to the employee and MasterDB.
- **Referral forms**: For Abnormal or STS, complete paper forms. Tap **Print Referral Form** to generate a pre-filled PDF.

**Finalize & Submit:**
1. **Finalize**: Review the test record summary and tap **Confirm & Save**.
2. **Submit Packet**: When all employees are resolved, tap **Submit Packet →**.
3. **Connectivity**: You need internet/OneDrive access to submit.

---

### Troubleshooting

#### Legacy Import — "Could not find a recognisable header row"
| CAUSE | FIX |
| :--- | :--- |
| **File is a different format** | Check that the file has columns like "First name", "Surname", "Test Date", etc. |
| **Headers are merged/hidden** | Open in Excel, unhide all rows/columns, and re-save. |
| **Unusual spellings** | Rename the headers in Excel to match the standard names. |

#### Legacy Import — dates showing as skipped
Rows are skipped when the test date cannot be parsed. Supported formats: `JUL 29 2009`, `JULY 10 2017`, `SEPT 27 1985`, `2025-07-22`. Reformat the Test Date column in Excel if needed.

#### Legacy Import — wrong company name detected
* Rename the file to follow the `Company_Name_Month_DD_YYYY.xlsx` pattern.
* Or proceed and rename the company record in MasterDB after import.

#### Incoming Packets — "Company not found in MasterDB"
The company name in the packet does not match any company in the database. Create the company in MasterDB first, or check for a name spelling difference.

#### Sync folder disconnects between sessions
This is normal browser behaviour. Go to Settings → Sync Folder → Reconnect at the start of each working session if the indicator shows grey.

#### Data appears to be gone after clearing browser data
MasterDB data is stored in the browser's OPFS. Clearing browser data **will permanently delete it**. Always maintain a current backup via Settings → Download Backup.
> There is no way to recover data lost through a browser clear without a backup file. Back up after every import session.

#### Performance is slow with large datasets
MasterDB uses sql.js running in the browser. Some queries may take a moment with large datasets. Avoid running multiple browser tabs with MasterDB open simultaneously.

#### Getting further help
For issues not covered here, contact your MasterDB administrator or refer to the build specification document (TechTool_MasterDB_BuildSpec).
