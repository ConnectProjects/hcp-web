# Phase 1a — Graph API Spike

Proves the file operations MasterDB v2 depends on (DESIGN-masterdb-rebuild.md §2)
against the shared OneDrive folder, from a plain browser sign-in. All writes go to
`db/spike-test/` inside the shared folder — production files are never touched.
A cleanup button removes the test folder afterward.

## One-time setup: Azure app registration (~5 minutes)

The spike (and MasterDB v2 itself) needs an Azure "app registration" — an ID that
lets a web page ask Microsoft for permission to act on your OneDrive. Nothing is
installed anywhere; it's a registration record in Azure.

1. Go to https://portal.azure.com and sign in with your
   `@connecthearing.ca` / Sonova work account.
2. Search for **App registrations** → **New registration**.
   - Name: `HCP MasterDB`
   - Supported account types: **Accounts in this organizational directory only**
   - Redirect URI: pick platform **Single-page application (SPA)** and enter
     `http://localhost:8000`
   - Register.
3. On the app's Overview page, copy the **Application (client) ID** and the
   **Directory (tenant) ID** — these go into the spike page's two fields.
   (Neither value is a secret.)
4. No API-permission setup needed up front — the spike requests
   `Files.ReadWrite.All` (delegated) at sign-in and Azure will show a consent
   prompt. **If it instead says "approval required", that's a spike finding:**
   the Sonova tenant requires an admin to consent, and we take that to IT.
   (If the portal blocks you from registering an app at all, that's also a
   finding — same conversation with IT, and I have a fallback design for it.)

Later, before launch, we add the GitHub Pages URL as a second redirect URI on
the same registration.

## Running the spike

From the repo root:

```
npx http-server -p 8000
```

Then open http://localhost:8000/spike-graph/ and click through:

1. **Sign in** — MSAL popup with your work account.
2. **Locate shared folder** — finds "Brothen, Jan's files - TechTool" whether it
   was shared classically or added as a OneDrive shortcut, and confirms the
   `db/` subfolder is reachable on Jan's drive.
3. **Run all verb tests** — exercises, inside `db/spike-test/`:
   - simple upload + download round-trip
   - conditional upload with current eTag (accepted) and stale eTag
     (**must be rejected with 412** — this is the concurrency protection the
     whole v2 design rests on)
   - create-if-absent, two variants (write-lock semantics)
   - server-side copy + poll (the pre-import backup pattern)
   - move + rename (the packet-archive pattern)
   - 9 MB upload session in 5 MiB chunks (the ~20 MB masterdb.sqlite path)
4. **Cleanup** — deletes `db/spike-test/`.
5. **Copy results** — copies the full log; paste it back into Claude Code.

## Pass criteria

All checks green, in particular: stale-eTag → 412, at least ONE of the two
create-if-absent variants working, and the upload session completing. Any FAIL
is a real finding about the tenant/API, not necessarily a bug — copy the log
back and we adapt the design.
