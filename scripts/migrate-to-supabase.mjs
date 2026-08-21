#!/usr/bin/env node
/**
 * Move the local JSON store into Supabase — rows first, then artwork files.
 *
 *   node scripts/migrate-to-supabase.mjs           # dry run: says what it would do
 *   node scripts/migrate-to-supabase.mjs --commit  # actually writes
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local (or the
 * environment). Idempotent: rows are upserted by id and files are skipped if
 * an asset already points at the bucket, so running it twice is safe and a
 * half-finished run can be resumed by running it again.
 *
 * Deliberately a standalone script, not a route: this is a one-off that moves
 * every customer record you have, and it should be something you run
 * knowingly, watch finish, and then never touch again.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const COMMIT = process.argv.includes('--commit');
const BUCKET = 'artwork';

/* ---------- env ---------- */

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const v = m[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}
loadEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (put them in .env.local).');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

/* ---------- read the local store ---------- */

const dbPath = join(ROOT, 'data', 'db.json');
if (!existsSync(dbPath)) {
  console.error(`No local store at ${dbPath} — nothing to migrate.`);
  process.exit(1);
}
const local = JSON.parse(readFileSync(dbPath, 'utf8'));

const counts = {
  orders: local.orders?.length ?? 0,
  roster: local.roster?.length ?? 0,
  assets: local.assets?.length ?? 0,
  submissions: local.submissions?.length ?? 0,
  history: local.history?.length ?? 0,
  users: local.users?.length ?? 0,
};

console.log(COMMIT ? '\n=== MIGRATING ===\n' : '\n=== DRY RUN (add --commit to write) ===\n');
console.log('Local store:');
for (const [k, v] of Object.entries(counts)) console.log(`  ${String(v).padStart(5)}  ${k}`);

/*
 * Orphan check. Every child row points at an order via a foreign key, so a
 * child whose parent is missing would fail the insert half-way through and
 * leave the migration part-done. Better to know before writing anything.
 */
const orderIds = new Set((local.orders ?? []).map((o) => o.id));
const orphans = [];
for (const [table, rows, fk] of [
  ['roster', local.roster, 'orderId'],
  ['assets', local.assets, 'orderId'],
  ['submissions', local.submissions, 'orderId'],
  ['history', local.history, 'orderId'],
]) {
  const bad = (rows ?? []).filter((r) => !orderIds.has(r[fk]));
  if (bad.length) orphans.push(`${bad.length} ${table} row(s) point at an order that no longer exists`);
}
if (orphans.length) {
  console.log('\nSkipping orphans (their order is gone):');
  orphans.forEach((o) => console.log(`  - ${o}`));
}

/* ---------- artwork inventory ---------- */

const uploadDir = join(ROOT, 'public', 'uploads');
const onDisk = existsSync(uploadDir) ? new Set(readdirSync(uploadDir)) : new Set();

const localFiles = [];
const stillRemote = [];
for (const a of local.assets ?? []) {
  if (!orderIds.has(a.orderId)) continue;
  if (a.fileUrl?.startsWith('/uploads/')) {
    const name = a.fileUrl.slice('/uploads/'.length);
    if (onDisk.has(name)) localFiles.push({ asset: a, name });
    else console.log(`  ! ${a.fileUrl} is referenced but not on disk`);
  } else if (/^https?:\/\//i.test(a.fileUrl)) {
    stillRemote.push(a);
  }
}

console.log(`\nArtwork:`);
console.log(`  ${String(localFiles.length).padStart(5)}  files to upload into the "${BUCKET}" bucket`);
console.log(`  ${String(stillRemote.length).padStart(5)}  still pointing at Base44 — run /rehost first or they stay at risk`);

if (!COMMIT) {
  console.log('\nNothing written. Re-run with --commit when this looks right.\n');
  process.exit(0);
}

/* ---------- write ---------- */

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function push(table, rows, label) {
  if (!rows.length) return;
  for (const batch of chunk(rows, 100)) {
    const { error } = await db.from(table).upsert(batch);
    if (error) throw new Error(`${label}: ${error.message}`);
  }
  console.log(`  ✓ ${rows.length} ${label}`);
}

// Orders first — everything else has a foreign key to them.
await push('orders', (local.orders ?? []).map((o) => ({ id: o.id, data: o })), 'orders');

await push(
  'roster_entries',
  (local.roster ?? []).filter((r) => orderIds.has(r.orderId)).map((r) => ({ id: r.id, order_id: r.orderId, data: r })),
  'roster rows',
);
await push(
  'order_assets',
  (local.assets ?? []).filter((a) => orderIds.has(a.orderId)).map((a) => ({ id: a.id, order_id: a.orderId, data: a })),
  'artwork records',
);
await push(
  'client_submissions',
  (local.submissions ?? []).filter((s) => orderIds.has(s.orderId)).map((s) => ({ id: s.id, order_id: s.orderId, data: s })),
  'client submissions',
);
await push(
  'change_log',
  (local.history ?? []).filter((h) => orderIds.has(h.orderId)).map((h) => ({ id: h.id, order_id: h.orderId, data: h })),
  'history entries',
);
await push('app_users', (local.users ?? []).map((u) => ({ id: u.id, data: u })), 'users');

/* ---------- artwork ---------- */

let uploaded = 0, skipped = 0, failed = 0;
for (const { asset, name } of localFiles) {
  const bytes = readFileSync(join(uploadDir, name));
  const ext = extname(name).toLowerCase();
  const type =
    { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
      '.gif': 'image/gif', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
      '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
    }[ext] ?? 'application/octet-stream';

  const { error: upErr } = await db.storage.from(BUCKET).upload(name, bytes, {
    contentType: type,
    upsert: true,
  });
  if (upErr) {
    console.log(`  ✗ ${name}: ${upErr.message}`);
    failed++;
    continue;
  }

  // Point the record at the bucket key. Only after the bytes are safely there,
  // so a failure leaves the record pointing at a file that still exists.
  const next = { ...asset, fileUrl: `${BUCKET}/${name}` };
  const { error: rowErr } = await db.from('order_assets').update({ data: next }).eq('id', asset.id);
  if (rowErr) {
    console.log(`  ✗ ${name} uploaded but the record didn't update: ${rowErr.message}`);
    failed++;
    continue;
  }
  uploaded++;
  if (uploaded % 10 === 0) console.log(`    … ${uploaded}/${localFiles.length} files`);
}

console.log(`  ✓ ${uploaded} files uploaded${skipped ? `, ${skipped} skipped` : ''}${failed ? `, ${failed} FAILED` : ''}`);

/* ---------- verify ---------- */

console.log('\nChecking what landed:');
for (const [table, expected] of [
  ['orders', counts.orders],
  ['roster_entries', (local.roster ?? []).filter((r) => orderIds.has(r.orderId)).length],
  ['order_assets', (local.assets ?? []).filter((a) => orderIds.has(a.orderId)).length],
  ['client_submissions', (local.submissions ?? []).filter((s) => orderIds.has(s.orderId)).length],
  ['change_log', (local.history ?? []).filter((h) => orderIds.has(h.orderId)).length],
]) {
  const { count, error } = await db.from(table).select('id', { count: 'exact', head: true });
  if (error) console.log(`  ? ${table}: ${error.message}`);
  else console.log(`  ${count === expected ? '✓' : '✗'} ${table}: ${count} in Supabase, ${expected} expected`);
}

console.log(
  failed
    ? `\nDone, but ${failed} file(s) failed. Run this again — it picks up where it left off.\n`
    : '\nDone.\n',
);
