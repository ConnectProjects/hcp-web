# Operations — packet import & sync (office procedure)

Plain-English procedure for back-office staff running MasterDB. Background in
`INCIDENT-2026-07-29-yorkton.md`. **Keep this current.**

## Why there's a procedure at all

Several MasterDB computers share one OneDrive folder. If two of them import the
same packets at the same time, records can be duplicated or lost (this happened
on the July 2026 SK tour). Until the permanent fix ships, we prevent that by
having **one** computer do the automatic importing.

## The import-owner computer = **Heather**

One office computer is the "import owner." It automatically pulls in completed
packets from techs. Everyone else still sees all the data, but doesn't
auto-import — which is what keeps records from colliding.

**Heather's office computer is the import owner.** She's the dominant daily user
and her machine is reliably on and connected, so packets get imported promptly,
and her reports reflect what was just imported.

### How to set it (already done once, but for reference / new PCs)

On the import-owner computer only:
1. Hard-refresh MasterDB (Ctrl+Shift+R) so it's on the latest version.
2. **Settings → OneDrive Sync Folder** → tick **"Auto-import packets on this computer."**
3. Confirm it shows **● ON — this computer imports**.

On every other computer (Judy, Norm, etc.): leave that box **unticked** (the default).

> The setting is remembered per-browser on that PC. If the browser data is
> cleared, the PC is replaced, or a different browser is used, it resets to OFF —
> just tick it again. If Heather ever has two browsers open, only tick the one
> she actually works in.

## Away-day protocol (Heather off / on vacation)

Packets only *auto*-import while the owner computer is on. If Heather is out:

- **Short absence (a day):** nothing to do. Packets wait safely in the inbox and
  import when she's back. If something is urgent, anyone can import manually
  (see below).
- **Extended absence (vacation):** temporarily move ownership to one other
  person, and **only one**:
  1. On Heather's computer, **untick** the box first (Settings → OneDrive Sync).
     *Never have two owners at once.*
  2. On the stand-in's computer (e.g. Norm), **tick** the box.
  3. When Heather returns: untick the stand-in's box, then re-tick Heather's.

The rule that matters: **exactly one owner at any time.** Two owners re-opens the
door to collisions.

## Manual import (the escape hatch — works on any computer)

Any computer can import on demand: **Incoming → Check Sync Folder.** This is safe
to use even when you're not the owner (e.g. Heather's away and a packet is
urgent).

Two safety behaviours you'll notice:
- After you click, there's a short **1–3 second pause** before it starts. That's
  deliberate — it spaces out near-simultaneous clicks from two computers.
- If another computer is importing at that moment, you'll see **"Another computer
  is importing right now — please try again in a moment."** Wait a few seconds and
  click again. Nothing was imported twice.

## What this protects (and what it doesn't, yet)

- ✅ Automatic imports can't race across computers (single owner).
- ✅ Two tabs / two clicks on the same or different computers serialize instead of
  colliding.
- ✅ Every import is now all-or-nothing: if a packet doesn't fully import, it rolls
  back and shows an error instead of silently importing part of it.
- ⚠️ These are strong safeguards but still *best-effort* across computers (they
  depend on the owner setting being correct and on OneDrive syncing promptly).
  The permanent, structural fix (globally-unique record ids) is a separate piece
  of work still to come. Until then, keep to the one-owner rule.

## After any app update

When MasterDB is updated, **everyone hard-refreshes** (Ctrl+Shift+R) so all
computers are on the same version. Then double-check the owner box is still ON on
Heather's computer and OFF everywhere else.
