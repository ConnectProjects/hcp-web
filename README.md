# HCP-Web

**Open Source Hearing Conservation Platform**  
Browser-based audiometric workflow management for industrial hearing conservation programs.

Built by [Norm Robichaud](https://github.com/NormRobichaud), Industrial Audiometric Technician  
Connect Hearing Canada — Industrial Division

---

## What Is HCP-Web?

HCP-Web is a browser-based platform for managing occupational audiometric testing programs at industrial sites — sawmills, mines, factories, foundries, and anywhere workers are exposed to hazardous noise.

It replaces paper-based and spreadsheet-based workflows with a modern, provincially compliant system that works on any laptop, requires no IT approval, and functions fully offline in the field.

The platform consists of three integrated tools:

**TechTool** — Used by field audiometric technicians. Runs in Edge as an installed app on any Windows laptop. Downloads company packets, works fully offline at remote industrial sites, and uploads completed tests when connectivity returns.

**MasterDB** — Used by office administrators. Manages companies, employees, test history, scheduling, and reporting. Imports completed results from the field. All data lives in a single SQLite file on your office-controlled OneDrive — never on any external server.

**Lead Finder** — Used by Logistical Coordinators to discover companies likely to have noise-exposed workers. Searches business registries and Google Places, tracks lead status, and generates outreach lists. Separate Supabase backend.

TechTool and MasterDB are a unified app with role-based routing — the same URL serves both roles depending on who logs in.

---

## Key Features

- **No installation required** — opens in Edge like any website, pinned as an app
- **Full offline capability** — sync packets before your trip, work anywhere
- **Provincially compliant classification** — Alberta OHS Part 16, BC WorkSafeBC, Saskatchewan OHS Regulations, expanding
- **Data-driven classification engine** — new provinces added as data, no code changes required
- **Zero data exposure** — all worker health records live in your OneDrive, never on any HCP-Web server
- **HPD adequacy calculation** — CSA Z94.2-14 derating built in
- **OneDrive-backed database** — single canonical SQLite file on your shared OneDrive folder; no sync conflicts, no merge logic

---

## How Data Privacy Works

This is the most important thing to understand about HCP-Web:

**No worker data ever touches the HCP-Web server or this repository.**

The host server delivers only the application code — HTML, CSS, and JavaScript. It holds no database, no patient records, and no business logic that processes sensitive information.

All worker health records, company data, and audiometric test results live in one place:

**Your OneDrive** — a single `masterdb.sqlite` file in your shared OneDrive folder. The browser accesses it through the File System Access API against your locally-synced OneDrive folder. The file never leaves your Microsoft 365 tenant.

This architecture makes HCP-Web suitable for occupational health records under WorkSafeBC, Alberta OHS, and Saskatchewan OHS requirements.

---

## Province Support

| Province | Regulation | Status |
|---|---|---|
| Alberta | OHS Part 16, Schedule 3 | ✅ Active |
| British Columbia | WorkSafeBC OHS Regulation 7.8 | ✅ Active |
| Saskatchewan | OHS Regulations 1996, s.113 | ✅ Active |
| Manitoba | TBD | 🔜 Planned |
| Ontario | TBD | 🔜 Planned |

Province classification rules are stored as JSON data files. Contributing a new province rule set is a data contribution, not a code change. See [Contributing](#contributing).

---

## Quick Start (Self-Hosted)

### Prerequisites

- A Microsoft 365 account with OneDrive sync running on Windows
- Microsoft Edge browser (for app-mode installation)
- A shared OneDrive folder that both office and field machines have synced

### Deploy

1. Fork this repository
2. Connect your fork to Netlify, Cloudflare Pages, or GitHub Pages
3. Deploy — no build step required, it's a static site
4. Open your deployed URL — the hub page links to MasterDB and TechTool
5. On first launch, click **Grant Folder Access** and select your shared OneDrive folder

Full setup documentation: [docs/setup.md](docs/setup.md)

---

## Architecture Overview

```
Host Server              OneDrive Folder           Devices
────────────             ──────────────────         ───────────────────
App code only       ←→   masterdb.sqlite       ←→  MasterDB (Edge app)
HTML / CSS / JS          techs/{name}/outbox        TechTool (Edge app)
Zero patient data        techs/{name}/inbox          File System Access API
                         techs/{name}/archive        to locally-synced folder
```

The browser uses the **File System Access API** to read and write the SQLite database directly from the locally-synced OneDrive folder. No Microsoft Graph API, no cloud calls — just a local folder that OneDrive happens to keep in sync.

**Packet flow:**
1. MasterDB writes a company packet to `techs/{folder}/outbox/`
2. TechTool reads the packet, technician runs tests
3. Technician submits — packet moves from outbox → inbox
4. MasterDB imports the result and moves it to archive

See [docs/architecture.md](docs/architecture.md) for full technical detail.

---

## Directory Map

```
masterdb2/          MasterDB + TechTool unified app (live)
  app.js            App shell, role-based routing, sidebar
  db/               Database layer (sql.js, FSA storage, schema, import)
  screens/          MasterDB admin screens
  vendor/           sql-wasm.js + sql-wasm.wasm (self-contained)

techtool2/          TechTool field screens (loaded by masterdb2/app.js)
  screens/          Field technician screens (schedule, test, inbox, new visit)

lead-finder/        Noise-hazard lead discovery tool (separate Supabase project)
  js/               Feature modules
  supabase/         Edge Functions and migrations

shared/             Code shared across apps
  classification/   Province audiometric classification engine
  rules/            Province rule JSON files
  packet/           Packet format, import/export logic
  components/       Shared UI widgets
  counsel/          Counselling/referral logic
```

---

---

## License

Copyright © 2026 Connect Hearing Canada. All rights reserved.

This software is the proprietary property of Connect Hearing Canada.
Unauthorized use, reproduction, distribution, or deployment is strictly
prohibited without express written permission.

For licensing inquiries: [norman.robichaud@connecthearing.ca](mailto:norman.robichaud@connecthearing.ca)

---

## Contributing

This is a proprietary internal tool for Connect Hearing Canada. The repository is
public for development purposes only. Contributions are accepted only from Connect
Hearing Canada staff and authorized contractors.

---

## About the Author

Norm Robichaud is an Industrial Audiometric Technician with Connect Hearing Canada's Industrial Division, traveling extensively across BC and Alberta conducting workplace hearing tests at industrial sites. He built HCP-Web to solve real problems encountered in the field — IT-locked laptops, spotty connectivity, provincial compliance gaps, and the friction of spreadsheet-based workflows.

Connect Hearing Canada enabled the professional experience and domain knowledge that made this project possible. They receive free use of HCP-Web in perpetuity.

---

## Acknowledgements

- **Connect Hearing Canada** — founding use case and professional home
- **WorkSafe Saskatchewan** — *Audiometric Testing in Saskatchewan* guide
- **Alberta OHS** — Part 16 Noise classification framework
- **WorkSafeBC** — Hearing Loss Prevention Program standards
- **CSA Group** — Z94.2-14 Hearing Protection Devices standard

---

*© 2026 Connect Hearing Canada. All rights reserved.*  
*HCP-Web is not affiliated with or endorsed by WorkSafeBC, Alberta OHS, or WorkSafe Saskatchewan.*
