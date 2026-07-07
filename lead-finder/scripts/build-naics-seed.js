#!/usr/bin/env node
/**
 * build-naics-seed.js
 *
 * One-time script to populate naics_reference from Statistics Canada RDaaS API.
 * Dynamically finds the current RELEASED NAICS version — no hardcoded IDs.
 *
 * Usage:
 *   node scripts/build-naics-seed.js
 *
 * Requires a .env file (or environment variables):
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY=eyJ...   (service_role key, NOT the anon key)
 *
 * Keyword list for noise-hazard flagging: scripts/naics-keywords.json
 * Edit that file to add/remove keywords before re-running.
 *
 * Node >= 18 required (uses native fetch).
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// ---- Load .env (simple parser, no dependency) ----------------
function loadEnv() {
  try {
    const envPath = join(__dir, '..', '.env');
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env not found; rely on real env vars
  }
}

loadEnv();

const SUPABASE_URL       = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RDAAS_BASE         = 'https://api.statcan.gc.ca/rdaas';
const PAGE_SIZE          = 200;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('\nError: Missing environment variables.');
  console.error('  Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env or your environment.\n');
  process.exit(1);
}

// Load keyword list from config file so Norm can edit it without touching script logic
const KEYWORDS = JSON.parse(readFileSync(join(__dir, 'naics-keywords.json'), 'utf8'));

// ---- RDaaS helpers -------------------------------------------
async function rdaasGet(path) {
  const url = `${RDAAS_BASE}${path}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`RDaaS HTTP ${res.status} for ${url}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 200)}`);
  }
}

/**
 * RDaaS returns JSON-LD. The actual array of items can live in several places
 * depending on the endpoint. This helper extracts it regardless of nesting.
 */
function extractArray(data) {
  if (Array.isArray(data))                          return data;
  if (Array.isArray(data?.['@graph']))              return data['@graph'];
  if (Array.isArray(data?.results?.['@graph']))     return data.results['@graph'];
  if (Array.isArray(data?.categories?.['@graph']))  return data.categories['@graph'];
  if (Array.isArray(data?.results))                 return data.results;
  if (Array.isArray(data?.items))                   return data.items;
  if (Array.isArray(data?.categories))              return data.categories;
  return [];
}

/** Extract the short opaque ID from an RDaaS @id URL like
 *  "https://api.statcan.gc.ca/rdaas/classification/S049Pjk4RIUgw6j2" */
function idFromUrl(url) {
  return String(url ?? '').split('/').filter(Boolean).pop() ?? '';
}

/**
 * Locate the ID of the current, released NAICS Canada classification.
 * Searches RDaaS, filters for audience=STANDARDS, status=RELEASED,
 * abbreviation=NAICS (excludes variants/aggregates), and picks highest version.
 */
async function findLatestNaicsId() {
  console.log('Searching RDaaS for current NAICS classification…');
  const data = await rdaasGet(
    '/search/classifications?q=North%20American%20Industry%20Classification&limit=20'
  );

  const items = extractArray(data);

  if (items.length === 0) {
    console.error('Could not extract items from RDaaS search response.');
    console.error('Top-level keys:', Object.keys(data));
    process.exit(1);
  }

  console.log(`  Found ${items.length} result(s). Filtering for STANDARDS + RELEASED + abbreviation=NAICS…`);

  const candidates = items.filter(c => {
    const audience = String(c.audience ?? '').trim().toUpperCase();
    const status   = String(c.status   ?? '').trim().toUpperCase();
    const abbrev   = String(c.abbreviation ?? '').trim().toUpperCase();
    // Only the main NAICS Canada classification carries abbreviation "NAICS"
    return audience === 'STANDARDS' && status === 'RELEASED' && abbrev === 'NAICS';
  });

  if (candidates.length === 0) {
    // Fallback: relax abbreviation requirement, just pick STANDARDS + RELEASED
    console.log('  No abbreviation=NAICS match; falling back to any STANDARDS+RELEASED entry…');
    const fallback = items.filter(c =>
      String(c.audience ?? '').trim().toUpperCase() === 'STANDARDS' &&
      String(c.status   ?? '').trim().toUpperCase() === 'RELEASED'
    );
    if (fallback.length === 0) {
      console.error('No RELEASED STANDARDS NAICS found. Sample item:', JSON.stringify(items[0], null, 2));
      process.exit(1);
    }
    candidates.push(...fallback);
  }

  // Sort by versionNumber descending (the field name RDaaS actually uses)
  candidates.sort((a, b) => {
    const va = String(a.versionNumber ?? a.version ?? '0');
    const vb = String(b.versionNumber ?? b.version ?? '0');
    const partsA = va.split('.').map(Number);
    const partsB = vb.split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const diff = (partsB[i] ?? 0) - (partsA[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });

  const best    = candidates[0];
  const id      = idFromUrl(best['@id'] ?? best.id ?? best.ID ?? '');
  const version = best.versionNumber ?? best.version ?? 'unknown';
  const title   = best.name ?? best.title ?? '';

  if (!id) {
    console.error('Could not extract ID from best candidate:', JSON.stringify(best, null, 2));
    process.exit(1);
  }

  console.log(`  Selected: "${title}" — version ${version} (id: ${id})`);
  return id;
}

/**
 * Fetch all categories for the given classification.
 *
 * The RDaaS categories/detailed endpoint returns the full set in a single
 * response regardless of offset (it ignores the offset parameter). We try a
 * large limit first; if that returns a full page we probe offset=PAGE_SIZE to
 * detect whether the API actually paginates or just repeats the same data.
 * Duplicates are detected via the first item's @id / code.
 */
async function fetchAllCategories(classificationId) {
  console.log('\nFetching NAICS categories…');

  // Try to get everything in one request
  const firstData = await rdaasGet(
    `/classification/${classificationId}/categories/detailed?offset=0&limit=9999`
  );
  const firstPage = extractArray(firstData);
  console.log(`  Got ${firstPage.length} categories in initial request`);

  if (firstPage.length === 0) {
    console.error('  No categories returned — check the classification ID');
    process.exit(1);
  }

  // If fewer than PAGE_SIZE came back, no pagination needed
  if (firstPage.length < PAGE_SIZE) {
    console.log(`  Total categories fetched: ${firstPage.length}`);
    return firstPage;
  }

  // Probe offset=PAGE_SIZE to see if the API actually paginates
  const probeData = await rdaasGet(
    `/classification/${classificationId}/categories/detailed?offset=${PAGE_SIZE}&limit=${PAGE_SIZE}`
  );
  const probePage = extractArray(probeData);

  const firstId = firstPage[0]?.['@id'] ?? firstPage[0]?.code ?? '';
  const probeId = probePage[0]?.['@id'] ?? probePage[0]?.code ?? '';

  if (probeId === firstId || probePage.length === 0) {
    // API repeats the same data — we already have everything from the first fetch
    console.log('  API does not paginate (returns full set in one shot)');
    console.log(`  Total categories fetched: ${firstPage.length}`);
    return firstPage;
  }

  // API does paginate — collect remaining pages
  console.log('  Paginating…');
  const all = [...firstPage];
  let offset = PAGE_SIZE;

  while (true) {
    process.stdout.write(`  offset=${offset}… `);
    const data = await rdaasGet(
      `/classification/${classificationId}/categories/detailed?offset=${offset}&limit=${PAGE_SIZE}`
    );
    const page = extractArray(data);
    process.stdout.write(`got ${page.length}\n`);

    if (page.length === 0) break;
    const pid = page[0]?.['@id'] ?? page[0]?.code ?? '';
    if (pid === firstId) { console.log('  Duplicate page detected — stopping'); break; }

    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`  Total categories fetched: ${all.length}`);
  return all;
}

// ---- Keyword matching ----------------------------------------
function matchesNoise(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

// ---- Normalize raw category object --------------------------
// RDaaS uses JSON-LD; field names vary by endpoint and version.
function normalizeCategory(cat) {
  // Code: plain "code" field, or extract from @id URL as last resort
  const code = (
    cat.code        ?? cat.Code        ??
    cat.memberCode  ?? cat.MemberCode  ??
    idFromUrl(cat['@id'])
  ).toString().trim();

  // Descriptor: prefer explicit descriptor/description fields, then JSON-LD "name"
  const descriptor = (
    cat.descriptor      ?? cat.Descriptor     ??
    cat.descriptionEn   ??
    cat.description?.en ??
    cat.title?.en       ??
    cat.Title?.en       ??
    cat.titleEn         ??
    cat.name            ??   // JSON-LD
    cat.prefLabel?.en   ??   // SKOS
    cat.prefLabel       ?? ''
  ).toString().trim();

  const definition = (
    cat.definition             ?? cat.Definition          ??
    cat.classDefinition?.en    ?? cat.ClassDefinition?.en ??
    cat.inclusionExclusion?.en ??
    cat.scopeNote?.en          ??
    cat.scopeNote              ?? ''
  ).toString().trim();

  const levelDepth = cat.levelDepth ?? cat.LevelDepth ?? cat.depth ?? cat.Depth ?? null;

  return { code, descriptor, definition, levelDepth };
}

// ---- Main ----------------------------------------------------
async function main() {
  const classId    = await findLatestNaicsId();
  const categories = await fetchAllCategories(classId);

  let noiseCount = 0;
  const records = [];

  for (const cat of categories) {
    const { code, descriptor, definition, levelDepth } = normalizeCategory(cat);
    if (!code) continue;  // skip rows without a code

    const isNoise = matchesNoise(descriptor) || matchesNoise(definition);
    if (isNoise) noiseCount++;

    records.push({
      code,
      descriptor:       descriptor || '(no descriptor)',
      definition:       definition || null,
      level_depth:      typeof levelDepth === 'number' ? levelDepth : null,
      is_noise_hazard:  isNoise,
      hazard_score:     isNoise ? 3 : null,  // Norm reviews + adjusts in Admin view
    });
  }

  console.log(
    `\nPreparing upsert: ${records.length} records` +
    ` (${noiseCount} flagged as noise-hazard with starting score=3)`
  );

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });

  // Upsert in batches to avoid payload limits
  const BATCH_SIZE = 500;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error } = await db
      .from('naics_reference')
      .upsert(batch, { onConflict: 'code' });

    if (error) {
      console.error(`\nUpsert error at batch starting offset ${i}:`, error.message);
      process.exit(1);
    }
    console.log(`  Upserted rows ${i + 1}–${Math.min(i + BATCH_SIZE, records.length)}`);
  }

  console.log('\nSeed complete.');
  console.log('Next step: open the Admin screen in Lead Finder to review and adjust');
  console.log('  is_noise_hazard flags and hazard_score values.');
}

main().catch(err => {
  console.error('\nFatal error:', err.message ?? err);
  process.exit(1);
});
