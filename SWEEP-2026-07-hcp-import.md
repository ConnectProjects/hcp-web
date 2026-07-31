# SWEEP — blast radius of the import/sync fault (July 2026 SK tour)

Read-only analysis of the on-disk sync JSON (`…\Brothen, Jan's files - TechTool\`) on 2026-07-30.
Companion to `INCIDENT-2026-07-29-yorkton.md`. This is **not** just a Yorkton problem.

## ⚠️ Live-sync warning
While running this sweep, location **284**'s `province` value **changed between two reads of
`locations.json`**. Instances are still syncing into this folder right now. Any remediation must
start by **freezing** multi-instance activity (everyone off except one), or cleanup will be
re-corrupted as it happens.

## 1. Packets that imported wrong (count ≠ source)

| packet | completed in packet | landed in DB | failure |
|---|---|---|---|
| SK-CSN-KlassenSwift-20260720-CS | 7 | 14 | **double import** |
| SK-KalTire-704ReginaSK-20260721-CS | 4 | 8 | **double import** |
| SK-KalTire-705ReginaSK-20260721-CS | 11 | 22 | **double import** |
| SK-KalTire-736MooseJawS-20260721-CS | 8 | 24 | **triple import** |
| SK-KalTire-20260720-CS | 8 | 22 | **~triple import** |
| SK-KalTire-721HumboldtS-20260728-CS | 2 | **0** | **total loss** (the "blank report" symptom) |
| SK-KalTire-731YorktonSK-20260729-CS | 6 | 2 | **partial loss** (the incident) |
| SK-KalTire-20260730-CS | 5 | 1 | **partial loss** |

Two distinct damage modes, both from the same root fault:
- **Over-import** (5 packets): the same packet imported by two/three instances, each minting its
  own test rows → duplicate audiometric records.
- **Under-import** (3 packets): rows minted on one instance destroyed by PK collision in the
  merge → lost records. Humboldt lost **both** its tests (0 landed).

## 2. Duplicate location records — network-wide (21 pairs)

Every Kal Tire SK store (and #287 CSN) exists twice: an **active duplicate** and a **deactivated
`", SK"` twin**. This is the trap that routed imports onto the wrong record. All 21 need the
same merge (dup → `", SK"` canonical, reactivate SK, retire dup, province = SK):

```
207 #287 Assiniboia      → 82  #287 Assiniboia, SK
210 #427 Regina          → 89  #427 Regina, SK
269 #703 Regina          → 151 #703 Regina, SK
270 #704 Regina          → 152 #704 Regina, SK
271 #705 Regina          → 153 #705 Regina, SK
273 #707 Regina          → 155 #707 Regina, SK
274 #711 North Battleford → 156 #711 North Battleford, SK
275 #714 Saskatoon       → 157 #714 Saskatoon, SK
276 #716 Saskatoon       → 158 #716 Saskatoon, SK
277 #718 Saskatoon       → 159 #718 Saskatoon, SK
278 #719 Saskatoon       → 160 #719 Saskatoon, SK
279 #721 Humboldt        → 161 #721 Humboldt, SK
280 #722 Davidson        → 162 #722 Davidson, SK
282 #727 Tisdale         → 164 #727 Tisdale, SK
283 #729 Melville        → 165 #729 Melville, SK
284 #731 Yorkton         → 166 #731 Yorkton, SK
285 #733 Weyburn         → 167 #733 Weyburn, SK
286 #734 Swift Current   → 168 #734 Swift Current, SK
287 #735 Prince Albert   → 169 #735 Prince Albert, SK
288 #736 Moose Jaw       → 170 #736 Moose Jaw, SK
289 #740 Estevan         → 171 #740 Estevan, SK
```

## 3. Duplicate test rows

**35** employee+date combinations carry duplicate test rows in 2026 (same worker, same day,
imported more than once). Some are demo/test employees (George Jungle, Frank Oz, Mary Poppins,
New Worker, Solo Employee), but many are real (e.g. Kyle Todderan, Maysun Peters, Mark Morte on
2026-07-20). These need de-duplication (keep one, drop the copy) as part of remediation.

## 4. Cross-linked records

Only **1** surviving cross-link in 2026: test 7300 → Connor Garding (the Yorkton/Selsek
collision). The other collisions manifested as **loss** (§1 under-imports) rather than a visible
cross-link, because the losing row was deleted outright in the merge rather than leaving a
dangling reference.

## Implication for sequencing

Remediating this by hand (dedupe 21 locations, dedupe 35 test groups, rebuild 3 lost packets)
**while instances keep colliding** is Sisyphean — new collisions will appear faster than cleanup.
The durable fix (globally-unique ids + eTag/`If-Match` + single-writer coordination) should land
**before** the bulk data cleanup, and the cleanup should run once, on a single frozen instance.
