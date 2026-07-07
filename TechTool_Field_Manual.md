# TechTool: Field Operations Manual

This document contains the complete in-app manual for TechTool, the field component of the HCP platform.

---

## 1. Overview

### What is TechTool?
TechTool is the field component of the HCP-Web Hearing Conservation Platform. It runs in a browser on the technician's device — phone, tablet, or laptop — and works fully offline once loaded. No internet connection is required on-site.

### What TechTool does
TechTool guides you through a complete industrial audiometric testing visit. It loads your assigned employee list from a packet, walks you through threshold entry and classification for each employee, and bundles the completed results into a packet that gets submitted back to the office via the sync folder.

### What TechTool does not do
TechTool does not conduct the audiometric test itself — that is done using your calibrated audiometer. TechTool is where you record the thresholds from the audiometer and calculate the classification result. It also does not store permanent records — those live in MasterDB at the office.

### The two-app workflow
1. **Office generates a packet** in MasterDB and saves it to the sync folder (OneDrive).
2. **You sync TechTool** on your device to download the packet before you leave for site, or on-site if you have a connection.
3. **You test each employee** on-site, entering thresholds and reviewing classifications in TechTool.
4. **You submit the completed packet** back to the sync folder when done. The office then imports the results into MasterDB.

> **Note**: TechTool stores packets locally on your device using IndexedDB. Data persists between sessions but is tied to this browser on this device. Always submit completed packets promptly.

---

## 2. Getting Started

### First launch — setting up your profile
1. Enter your full name and initials. These are recorded on every test you conduct.
2. Enter your **folder name** — the subfolder name within the sync folder where your packets are stored. Ask your MasterDB administrator if unsure.
3. Enter your **IAT number** — your Industrial Audiometric Technician certification number. This appears on referral forms.
4. Tap **Start**. Your profile is saved and you will go directly to the Dashboard on future launches.

### Connecting the sync folder
1. From the Dashboard, tap **↓ Sync**.
2. If no sync folder is connected, a folder picker will appear. Navigate to and select your OneDrive sync folder root.
3. TechTool will look for packets in the `techs/[your folder name]` subfolder.

> **Warning**: Folder access must be re-granted each browser session on most devices. If packets don't sync, try tapping Sync again.

### Before going to site
1. Open TechTool in Chrome or Edge while you have internet access.
2. Tap **↓ Sync** to download your assigned packets.
3. Confirm the correct company and employee count appears on the Dashboard.
4. You are now ready to work offline.

---

## 3. Screens

### Dashboard
The Dashboard is your home screen. It shows today's testing assignments, upcoming visits, and your sync status.

*   **Today section**: Shows all packets with a visit date matching today's date. Each card displays the company name, province, and tested/total ratio. Tap any card to open the company.
*   **Upcoming section**: Shows the next five packets scheduled for future dates.
*   **Sync button**: Tap **↓ Sync** to check the sync folder for new packets.

| Button | Action |
| :--- | :--- |
| ↓ Sync | Download new packets from the sync folder |
| ☰ | Go to Schedule — full list of all packets |
| ⚙ | Go to Settings |

### Schedule
The Schedule screen lists all packets on this device, organized by date.

| Status | Meaning |
| :--- | :--- |
| Synced | Packet downloaded, not yet started |
| In Progress | Some employees have been tested |
| Complete | All employees resolved (tested or skipped) |
| Submitted | Packet has been submitted back to the office |

### Company Screen
Starting point for each visit. Shows company details and sticky notes.

| Item | Details |
| :--- | :--- |
| Company name | Confirms you have the right packet |
| Visit date | Scheduled date for this visit |
| Sticky notes | Site-specific instructions from the office — **read these first** |

### Employee List
Your main working screen during a visit.

| Badge | Meaning |
| :--- | :--- |
| ✓ Tested | Test entry complete |
| Pending | Not yet tested |
| Skipped | Marked as not tested with a reason |

**Skipping an Employee Reasons:**
*   Not present today
*   Left company
*   Declined to test
*   Other

**Adding an employee on-site**: Tap **+ Add Employee**. Enter name and job title. These will be created in MasterDB on import.

---

## 4. Testing Workflow

### Pre-Test Questionnaire
Mandatory survey conducted before thresholds are entered:
*   **Noise Exposure**: Confirms if the worker has been exposed to noise within the last two hours.
*   **HPD Use**: Confirms if the worker regularly wears hearing protection in noisy environments.
*   **Employer Info**: Confirms if the employer provided noise-induced hearing loss education in the last year.

### Test Entry
Where you record audiometric thresholds.

*   **Baseline**: No baseline on file (reference audiogram).
*   **Periodic**: Existing baseline on file (comparison test).

**Steps:**
1. Tap frequency cell.
2. Select value (0-100 dB, or NR).
3. Check the live audiogram chart.

### Classification
Result of applying provincial rules to entered thresholds.

| Result Colour | Categories |
| :--- | :--- |
| Green | Normal (N), Normal Change (NC) |
| Yellow | Early Warning (EW), Early Warning Change (EWC) |
| Red | Abnormal (A), Abnormal Change (AC) |

### Counsel
Review and edit counsel text. A template is pre-populated based on the result.

*   **Counsel text**: Editable text that goes to the employee and MasterDB.
*   **Tech notes**: Internal office-only observations.
*   **Referral forms**: For Abnormal or STS, complete paper forms. Tap **Print Referral Form** to generate a pre-filled PDF.

### Finalize & Submit
1. **Finalize**: Review the test record summary and tap **Confirm & Save**.
2. **Submit Packet**: When all employees are resolved, tap **Submit Packet →**.
3. **Connectivity**: You need internet/OneDrive access to submit. The packet is written to the `inbox` folder.

---

## 5. Reference

### Classifications Reference

#### Alberta (OHS Code Part 16)
| Code | Label | On-site Action |
| :--- | :--- | :--- |
| **N** | Normal | No significant finding. No special action. |
| **EW** | STS | Avg shift ≥ 10 dB at 2K+3K+4K. Complete referral on-site. |
| **A** | Abnormal | Significant finding. Medical referral required. |

*   **Rule 1**: Threshold > 25 dB at 500–2000 Hz.
*   **Rule 2**: Threshold > 60 dB at 3000–6000 Hz.
*   **Rule 3**: Asymmetry > 30 dB averaged at 3K+4K+6K.
*   **Rule 4**: Shift ≥ 15 dB at two consecutive frequencies 1K–6K.
*   **Rule 5 (STS)**: Average shift ≥ 10 dB at 2K+3K+4K.

#### British Columbia (WorkSafeBC)
*   **Baseline**: N (Normal), EW (Early Warning Notch), A (Abnormal Threshold).
*   **Periodic**: NC (Normal Change), EWC (shift ≥ 15dB at 3k/4k), AC (shift ≥ 15dB at 2 adjacent).

#### Saskatchewan (OHS 1996)
*   **EW**: Single frequency shift ≥ 15 dB at 2K–6K.
*   **A**: Absolute or shift threshold exceeded. Referral required.

---

## 6. Troubleshooting

### Sync finds no packets
*   **Wrong folder selected**: Select root of OneDrive, not subfolder.
*   **Folder name mismatch**: Check Settings initials/folder name vs MasterDB.
*   **Not generated**: Confirm office has sent the packet.

### Submit fails
*   **No connection**: Ensure you have active internet.
*   **Permission denied**: Reload TechTool and re-grant folder access.

> **Warning**: Clearing browser data with unsubmitted packets causes **permanent data loss**. Always submit before resetting or clearing history.
