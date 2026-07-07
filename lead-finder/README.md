# Lead Finder

Noise-hazard lead discovery and RBS submission tracking for Connect Hearing Industrial Division.

## What this is

Lead Finder helps LCs (Licensed Consultants) find companies likely to have workers exposed to hazardous occupational noise, and track which of those leads have been submitted to the RBS sales CRM. It does **not** replicate any RBS functionality — it stores only a single `rbs_status` flag per lead.

---

## Hazard score reference

| Score | Meaning | Example industries |
|---|---|---|
| **5** | Near-certain hazardous exposure — 100+ dBA common, hearing loss expected without protection | Sawmills (gang saws), foundries, rock crushers, metal stamping |
| **4** | High likelihood — 90–100 dBA typical for significant portions of the workday | Machine shops, auto body, heavy equipment operators, forge shops |
| **3** | Moderate — some operations hit hazardous levels but not all workers/all shifts | Printing, woodworking shops, concrete plants |
| **2** | Lower — noise is a secondary concern, occasional exposure | General construction, light fabrication |
| **1** | Flagged by keyword but noise is situational or incidental | Equipment rental offices, some aggregate admin |

Scores are set per NAICS code in the **Admin** screen and can be overridden per company on the Dashboard. The Dashboard default sort is score descending so highest-priority leads surface first. The summary bar counts scores 4–5 as "High hazard."

---

## Framework choice

Plain HTML + CSS + vanilla JavaScript modules — no build step, no framework.

**Why not React?** TechTool and MasterDB (the sibling apps in this repo) are plain HTML/JS and deploy directly to GitHub Pages. Matching that pattern means: no build pipeline to maintain, no node_modules in the deployed app, and files that any team member can edit directly. The dashboard filter/sort state is handled with a simple `filters` object and a single `renderTable()` call — React's state management would add overhead without meaningful benefit at this scale.

---

## Environment variables

### Web app (browser)

Copy `config.example.js` → `config.js` and fill in:

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase project → Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase project → Settings → API → `anon` public key |
| `GOOGLE_PLACES_API_KEY` | Google Cloud Console → APIs & Services → Credentials |

`config.js` is gitignored. The Supabase anon key is safe in the browser because Row Level Security (RLS) enforces that only authenticated users can access data.

**Important:** Restrict your Google Places API key to your deployment domain in the Google Cloud Console (under "Application restrictions → HTTP referrers") to prevent unauthorized use.

### Seed script (Node.js only)

Copy `.env.example` → `.env` and fill in:

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Same as above |
| `SUPABASE_SERVICE_KEY` | Supabase project → Settings → API → `service_role` key |

Use the **service_role** key here (not the anon key) so the script can bypass RLS during bulk insert.

---

## Google Places API: why Text Search

The discovery screen uses [Google Places Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search) via `POST https://places.googleapis.com/v1/places:searchText`.

Text Search was chosen over Nearby Search because:
- LCs search by business type + city name, not GPS coordinates (e.g. "sawmill Prince George BC")
- Text Search accepts a natural-language query, making it much better suited to industrial keyword + location queries
- The Places API (New) Text Search endpoint supports CORS from browsers, so no server proxy is needed

---

## Running locally

1. Clone the repo and open a local static server in the repo root:
   ```bash
   npx serve .
   # or: python -m http.server 8000
   # or: use VS Code Live Server extension
   ```
2. Open `http://localhost:8000/lead-finder/`

No build step required. The app uses native ES modules loaded from the browser.

---

## Running the NAICS seed script

Run this **once** after creating the Supabase tables to populate `naics_reference`:

```bash
cd lead-finder
npm install          # installs @supabase/supabase-js for the script
cp .env.example .env # then fill in SUPABASE_URL and SUPABASE_SERVICE_KEY
node scripts/build-naics-seed.js
```

The script:
1. Queries the Statistics Canada RDaaS API to find the current RELEASED NAICS version (dynamically — no hardcoded ID)
2. Paginates through all NAICS categories
3. Flags any code whose descriptor or definition matches keywords in `scripts/naics-keywords.json`
4. Sets `hazard_score = 3` (medium) for flagged codes as a starting point
5. Upserts everything into `naics_reference`

After running, open the **NAICS Admin** screen in Lead Finder to review and adjust the `is_noise_hazard` flags and `hazard_score` values based on your WorkSafeBC/OHS knowledge.

To add or remove hazard keywords, edit `scripts/naics-keywords.json` and re-run the script (upsert is safe to run repeatedly).

---

## Supabase setup

1. Create a new Supabase project
2. Run the migrations in order via the Supabase SQL editor:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_triggers_indexes.sql`
3. Create a user account in Supabase Auth (Authentication → Users → Invite user)
4. Run the seed script (see above)
5. Fill in `config.js` with the project URL and anon key

---

## Deploying to GitHub Pages

Since this is a plain static app, deployment is straightforward:

1. Commit all files **except** `config.js` and `.env` (they are gitignored)
2. In GitHub repository settings → Pages, set source to the `main` branch, root folder
3. The app will be live at `https://[your-org].github.io/hcp-web/lead-finder/`
4. Create `config.js` directly on the server or use GitHub Secrets + a deploy action to inject it

**Note:** `config.js` must exist on the server for the app to work. For a private repo on GitHub Pages, the simplest approach is to create the file once via the GitHub web editor (it stays out of git history if you add it after the gitignore commit).

---

## Data model summary

| Table | Purpose |
|---|---|
| `naics_reference` | NAICS code lookup seeded from Statistics Canada. Manually curated hazard flags. |
| `companies` | Lead companies. `source='discovered'` = from Places API. `rbs_status` = the one tracking flag this app owns. `deleted_at` = soft delete. |

See `supabase/migrations/` for full schema, indexes, and triggers.

---

## What this app is NOT

- Not a call logger or scheduler (RBS owns that)
- Not a CRM
- Not integrated with CADS or HCP-Web's OneDrive sync
- No mobile/field-capture (reserved for a future phase — the `source='field_capture'` enum value is the placeholder)
