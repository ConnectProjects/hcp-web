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
 * Locate the ID of the current, released NAICS Canada classification.
 * Searches RDaaS, filters for audience=STANDARDS, status=RELEASED,
 * and picks the highest version number.
 */
async function findLatestNaicsId() {
  console.log('Searching RDaaS for current NAICS classification…');
  const data = await rdaasGet(
    '/search/classifications?q=North%20American%20Industry%20Classification&limit=20'
  );

  // RDaaS may return a bare array or a wrapped object
  const items = Array.isArray(data)
    ? data
    : (data.results ?? data.items ?? data.classifications ?? Object.values(data)?.[0] ?? []);

  if (!Array.isArray(items) || items.length === 0) {
    console.error('Unexpected RDaaS search response structure:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log(`  Found ${items.length} classification(s). Filtering for STANDARDS + RELEASED…`);

  const candidates = items.filter(c => {
    const audience = String(c.audience ?? c.Audience ?? '').trim().toUpperCase();
    const status   = String(c.status   ?? c.Status   ?? '').trim().toUpperCase();
    return audience === 'STANDARDS' && status === 'RELEASED';
  });

  if (candidates.length === 0) {
    console.error('No RELEASED STANDARDS NAICS found. Sample item:', JSON.stringify(items[0], null, 2));
    process.exit(1);
  }

  // Sort by version descending (semantic version aware)
  candidates.sort((a, b) => {
    const va = String(a.version ?? a.Version ?? '0');
    const vb = String(b.version ?? b.Version ?? '0');
    // Compare each numeric segment
    const partsA = va.split('.').map(Number);
    const partsB = vb.split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const diff = (partsB[i] ?? 0) - (partsA[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });

  const best = candidates[0];
  const id      = best.id ?? best.ID ?? best.classificationId ?? best.ClassificationId;
  const version = best.version ?? best.Version ?? 'unknown';
  const title   = best.title?.en ?? best.titleEn ?? best.title ?? best.Title ?? '';

  if (!id) {
    console.error('Could not extract ID from best candidate:', JSON.stringify(best, null, 2));
    process.exit(1);
  }

  console.log(`  Selected: "${title}" — version ${version} (id: ${id})`);
  return id;
}

/**
 * Paginate through all categories of the given classification.
 * Loops until a page shorter than PAGE_SIZE is returned.
 */
async function fetchAllCategories(classificationId) {
  console.log('\nFetching NAICS categories (paginating)…');
  const all = [];
  let offset = 0;

  while (true) {
    process.stdout.write(`  offset=${offset}… `);
    const data = await rdaasGet(
      `/classification/${classificationId}/categories/detailed?offset=${offset}&limit=${PAGE_SIZE}`
    );

    const page = Array.isArray(data)
      ? data
      : (data.items ?? data.results ?? data.categories ?? []);

    process.stdout.write(`got ${page.length}\n`);
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
// RDaaS may use different field name casing across API versions.
function normalizeCategory(cat) {
  const code = (
    cat.code ?? cat.Code ?? cat.memberCode ?? cat.MemberCode ?? ''
  ).toString().trim();

  const descriptor = (
    cat.descriptor     ?? cat.Descriptor    ??
    cat.descriptionEn  ??
    cat.description?.en ??
    cat.title?.en      ??
    cat.Title?.en      ??
    cat.titleEn        ?? ''
  ).toString().trim();

  const definition = (
    cat.definition             ?? cat.Definition          ??
    cat.classDefinition?.en    ?? cat.ClassDefinition?.en ??
    cat.inclusionExclusion?.en ?? ''
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
