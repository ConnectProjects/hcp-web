# HCP-Web

**Open Source Hearing Conservation Platform**  
Browser-based audiometric workflow management for industrial hearing conservation programs.

Built by [Norm Robichaud](https://github.com/NormRobichaud), Industrial Audiometric Technician  
Connect Hearing Canada — Industrial Division

---

## What Is HCP-Web?

HCP-Web is a browser-based platform for managing occupational audiometric testing programs at industrial sites — sawmills, mines, factories, foundries, and anywhere workers are exposed to hazardous noise.

It replaces paper-based and spreadsheet-based workflows with a modern, provincially compliant system that works on any laptop, requires no IT approval, and functions fully offline in the field.

The platform consists of two integrated applications:

**TechTool** — Used by field audiometric technicians. Runs in Chrome on any Windows laptop. Downloads company packets before a trip, works fully offline at remote industrial sites, and syncs completed tests automatically when connectivity returns.

**MasterDB** — Used by office administrators. Manages companies, employees, test history, scheduling, and reporting. Generates tech packets and imports completed results. All data stays on office-controlled hardware — never on any external server.

---

## Key Features

- **No installation required** — opens in Chrome like any website
- **Full offline capability** — sync packets before your trip, work anywhere
- **Provincially compliant classification** — Alberta OHS Part 16, BC WorkSafeBC, Saskatchewan OHS Regulations, expanding
- **Data-driven classification engine** — new provinces added as data, no code changes required
- **Zero data exposure** — worker health records never leave your hardware or your OneDrive
- **HPD adequacy calculation** — CSA Z94.2-14 derating built in
- **OneDrive sync** — uses your existing Microsoft 365 infrastructure, no new backend required
- **Free to self-host** — deploy to Netlify or Cloudflare Pages in under 30 minutes

---

## How Data Privacy Works

This is the most important thing to understand about HCP-Web:

**No worker data ever touches the HCP-Web server or this repository.**

The host server delivers only the application code — HTML, CSS, and JavaScript. It holds no database, no patient records, and no business logic that processes sensitive information.

All worker health records, company data, and audiometric test results live in one of two places:

1. **Your office machine** — MasterDB stores everything in your browser's local Origin Private File System (OPFS). It never leaves your hardware.
2. **Your OneDrive** — JSON packets travel between office and field via a shared folder in your existing Microsoft 365 tenant. HCP-Web never sees the contents.

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

- A Microsoft 365 account (for OneDrive and authentication)
- A free Netlify or Cloudflare Pages account
- Chrome browser on all devices

### Deploy

1. Fork this repository
2. Connect your fork to Netlify or Cloudflare Pages
3. Deploy — no build step required, it's a static site
4. Register an app in Azure Active Directory to get your Microsoft Graph API credentials
5. Add your credentials to `config.js`
6. Open your deployed URL in Chrome and sign in with your Microsoft 365 account

Full setup documentation: [docs/setup.md](docs/setup.md)

---

## Architecture Overview

```
Host Server              OneDrive Folder          Devices
────────────             ──────────────           ───────
App code only       ←→   /inbox             ←→   TechTool (Chrome)
HTML / CSS / JS          /outbox                  IndexedDB cache
Zero patient data        /archive                 Offline capable
                         ──────────
                         Office Machine
                         MasterDB (Chrome)
                         OPFS database
                         Data never leaves
```

See [docs/architecture.md](docs/architecture.md) for full technical detail.

---

## Managed Hosting

Self-hosting is free and always will be. If you'd prefer a fully managed solution — where setup, hosting, maintenance, compliance updates, and support are handled for you — managed hosting plans are available.

**Managed hosting includes:**

- Branded URL for your organization (e.g., `yourcompany.hcpweb.ca`)
- Onboarding and data migration assistance
- Ongoing hosting and maintenance
- Province rule updates when regulations change
- Priority support

**Pricing** is simple and nominal — designed to be accessible to independent HCP providers and small safety consultancies, not just large corporations.

Contact: [norm@hcpweb.ca](mailto:norm@hcpweb.ca) *(coming soon)*

---

## License

HCP-Web is released under the [Business Source License 1.1](LICENSE).

**In plain language:**

- ✅ Free to use for any non-commercial purpose
- ✅ Free to self-host for your own organization's internal use
- ✅ Free to inspect, modify, and contribute to
- ✅ **Connect Hearing Canada — free use, forever, with gratitude**
- ❌ Offering HCP-Web as a hosted service to third parties requires a commercial license

After four years from each release date, that release converts automatically to the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0), becoming fully open source.

For commercial licensing inquiries: [norm@hcpweb.ca](mailto:norm@hcpweb.ca) *(coming soon)*

---

## Contributing

Contributions are welcome, particularly:

- **Province rule sets** — JSON classification rules for MB, ON, QC, and other provinces
- **Bug reports and fixes**
- **Documentation improvements**
- **Translations** — French language support for Quebec and bilingual workplaces

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

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

*© 2026 Norm Robichaud. All rights reserved under the Business Source License 1.1.*  
*HCP-Web is not affiliated with or endorsed by WorkSafeBC, Alberta OHS, or WorkSafe Saskatchewan.*
