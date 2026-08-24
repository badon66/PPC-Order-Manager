#!/usr/bin/env node
/**
 * Prove the Supabase schema behaves before trusting real orders to it.
 *
 *   node scripts/check-supabase.mjs
 *
 * Writes a throwaway order, exercises every query pattern the app actually
 * uses against it, then deletes it. Nothing it touches outlives the run — the
 * test order is prefixed ZZ-SELFTEST and removed at the end (and on failure,
 * and on Ctrl-C).
 *
 * This exists because the schema leans on Postgres generated columns and
 * partial unique indexes. Those either work or they don't, and finding out
 * during a real migration is the wrong time.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const BUCKET = 'artwork';

for (const name of ['.env.local', '.env']) {
  const p = join(ROOT, name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const results = [];
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

/*
 * Deep equality that ignores object key order.
 *
 * Postgres `jsonb` does not store a document verbatim — it parses it, drops
 * duplicate keys, and reorders every object's keys by length and then bytewise.
 * So `JSON.stringify(whatWentIn) === JSON.stringify(whatCameBack)` is false for
 * essentially every order, while the data is byte-for-byte the same values.
 *
 * An earlier version of this file compared the serialised strings and failed
 * on a perfectly healthy database. Key order carries no meaning in JSON and
 * none in the app, which reads `data` as an object.
 *
 * Arrays are order-sensitive and stay that way — `sets` and roster ordering
 * are real information.
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
}

/** Report which keys actually differ, rather than dumping two whole documents. */
function firstDifference(a, b, path = '') {
  if (deepEqual(a, b)) return null;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' ||
      Array.isArray(a) !== Array.isArray(b)) {
    return `${path || '(root)'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = firstDifference(a[k], b[k], path ? `${path}.${k}` : k);
    if (d) return d;
  }
  return `${path || '(root)'}: differing shape`;
}

const same = (a, b, m) => {
  if (!deepEqual(a, b)) throw new Error(`${m} — ${firstDifference(a, b)}`);
};
async function t(name, fn) {
  try { await fn(); results.push(true); console.log('  ✓', name); }
  catch (e) { results.push(false); console.log('  ✗', name, '—', e.message); }
}

const orderId = randomUUID();
const shareToken = `selftest-share-${randomUUID()}`;
const rosterToken = `selftest-roster-${randomUUID()}`;
const uploadedKeys = [];

async function cleanup() {
  // Children cascade from the order, so one delete is enough for the rows.
  await db.from('orders').delete().eq('id', orderId);
  if (uploadedKeys.length) await db.storage.from(BUCKET).remove(uploadedKeys);
}
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

const order = {
  id: orderId,
  teamName: 'ZZ-SELFTEST Rink Rats',
  invoiceNumber: `ZZ-SELFTEST-${Date.now()}`,
  status: 'in_production',
  datePaid: '2026-03-01',
  estimatedFinishDate: null,      // must not break the generated date column
  approvedDate: null,
  shareToken, rosterToken,
  sets: [{ label: 'Home Set', playerJerseys: 17, goalieJerseys: 1, sockPairs: 18, pantShells: 0,
           extraJerseys: 2, extraSockPairs: 0, extraPantShells: 0, extrasNotes: 'spares', notes: '' }],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deletedAt: null,
};

console.log('\nChecking the schema against', url, '\n');

try {
  await t('an order round-trips unchanged', async () => {
    const ins = await db.from('orders').insert({ id: orderId, data: order });
    ok(!ins.error, ins.error?.message);
    const got = await db.from('orders').select('data').eq('id', orderId).single();
    ok(!got.error, got.error?.message);
    same(got.data.data, order, 'stored order differs from what went in');
  });

  await t('generated columns pick the right values out of the JSON', async () => {
    const r = await db.from('orders')
      .select('team_name, invoice_number, status, date_paid, estimated_finish_date, deleted_at, share_token')
      .eq('id', orderId).single();
    ok(!r.error, r.error?.message);
    eq(r.data.team_name, order.teamName, 'team_name');
    eq(r.data.status, 'in_production', 'status');
    // The whole point of storing dates as text and generating a date column:
    // it must come back as the same calendar day, not shifted by a timezone.
    eq(String(r.data.date_paid), '2026-03-01', 'date_paid');
    eq(r.data.estimated_finish_date, null, 'a null date must stay null, not error');
    eq(r.data.deleted_at, null, 'deleted_at');
    eq(r.data.share_token, shareToken, 'share_token');
  });

  await t('token lookup finds exactly one order', async () => {
    const r = await db.from('orders').select('data').eq('roster_token', rosterToken)
      .is('deleted_at', null).maybeSingle();
    ok(!r.error, r.error?.message);
    ok(r.data, 'roster token found nothing');
    eq(r.data.data.id, orderId, 'wrong order');
  });

  await t('a duplicate share token is refused', async () => {
    const clash = await db.from('orders').insert({
      id: randomUUID(),
      data: { ...order, id: randomUUID(), invoiceNumber: 'ZZ-SELFTEST-clash' },
    });
    ok(clash.error, 'a second order reused a share token and Postgres allowed it');
    eq(clash.error.code, '23505', 'expected a unique-violation');
  });

  await t('roster rows insert and come back in order', async () => {
    const rows = [2, 0, 1].map((i) => ({
      id: randomUUID(), orderId, playerNameAsPrinted: `Player ${i}`, number: String(i),
      isGoalie: false, sockOnly: false, jerseySize: 'L', sockSize: 'Senior', pantShellSize: '',
      jerseysPerPlayer: 1, socksPerPlayer: 1, shellsPerPlayer: 0,
      homeJersey: 0, awayJersey: 0, homeSocks: 0, awaySocks: 0,
      armNumbers: '', shoulderLogo: '', pantLogo: '', pantNumber: '', notes: '', sortOrder: i,
    }));
    const ins = await db.from('roster_entries')
      .insert(rows.map((r) => ({ id: r.id, order_id: orderId, data: r })));
    ok(!ins.error, ins.error?.message);

    const got = await db.from('roster_entries').select('data').eq('order_id', orderId).order('sort_order');
    ok(!got.error, got.error?.message);
    eq(got.data.map((x) => x.data.sortOrder).join(','), '0,1,2', 'sort order');
  });

  await t('artwork rows filter by role', async () => {
    const asset = {
      id: randomUUID(), orderId, role: 'main_crest', slot: 0,
      fileUrl: `${BUCKET}/selftest.png`, fileName: 'selftest.png', displayName: '', notes: '',
    };
    const ins = await db.from('order_assets').insert({ id: asset.id, order_id: orderId, data: asset });
    ok(!ins.error, ins.error?.message);
    const got = await db.from('order_assets').select('data').eq('order_id', orderId).eq('role', 'main_crest');
    ok(!got.error, got.error?.message);
    eq(got.data.length, 1, 'assets found by role');
  });

  await t('two submissions cannot claim the same revision', async () => {
    const base = (revision) => ({
      id: randomUUID(), orderId, revision, changes: [],
      sections: { logos: true, inspiration: false, roster: true, personalDetails: false },
      players: [], logos: [], inspiration: [], confirmed: true,
      submittedAt: new Date().toISOString(), acceptedAt: null,
    });
    const first = base(1);
    const a = await db.from('client_submissions').insert({ id: first.id, order_id: orderId, data: first });
    ok(!a.error, a.error?.message);

    const dup = base(1);
    const b = await db.from('client_submissions').insert({ id: dup.id, order_id: orderId, data: dup });
    ok(b.error, 'two submissions took revision 1 — the unique index is missing');
    eq(b.error.code, '23505', 'expected a unique-violation');
  });

  await t('history writes and reads newest-first', async () => {
    const rows = ['2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'].map((at) => ({
      id: randomUUID(), orderId, action: 'field_changed', summary: 'selftest',
      actorEmail: 'selftest', actorName: 'selftest', at,
    }));
    const ins = await db.from('change_log').insert(rows.map((r) => ({ id: r.id, order_id: orderId, data: r })));
    ok(!ins.error, ins.error?.message);
    const got = await db.from('change_log').select('data').eq('order_id', orderId)
      .order('at', { ascending: false });
    ok(!got.error, got.error?.message);
    eq(got.data[0].data.at, '2026-02-01T00:00:00.000Z', 'newest first');
  });

  await t('the artwork bucket is private and signs links', async () => {
    const key = `selftest-${randomUUID()}.txt`;
    const up = await db.storage.from(BUCKET).upload(key, Buffer.from('selftest'), {
      contentType: 'text/plain',
    });
    ok(!up.error, up.error?.message);
    uploadedKeys.push(key);

    const signed = await db.storage.from(BUCKET).createSignedUrl(key, 60);
    ok(!signed.error, signed.error?.message);
    ok(signed.data?.signedUrl?.includes('token='), 'no signature on the URL');

    // The same object without a signature must be refused, or the bucket is public.
    const naked = `${url}/storage/v1/object/public/${BUCKET}/${key}`;
    const res = await fetch(naked);
    ok(!res.ok, `the bucket is PUBLIC — ${naked} returned ${res.status}. Re-run migration 0002.`);
  });

  await t('the publishable key can read nothing', async () => {
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonKey) {
      console.log('      (skipped — set SUPABASE_ANON_KEY to check RLS from the outside)');
      return;
    }
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const r = await anon.from('orders').select('id').limit(1);
    ok(r.error || (r.data ?? []).length === 0,
      'RLS is not blocking the publishable key — it returned rows');
  });

  await t('soft-deleted orders drop out of the live list', async () => {
    const deleted = { ...order, deletedAt: new Date().toISOString() };
    const up = await db.from('orders').update({ data: deleted }).eq('id', orderId);
    ok(!up.error, up.error?.message);
    const live = await db.from('orders').select('id').eq('id', orderId).is('deleted_at', null);
    ok(!live.error, live.error?.message);
    eq(live.data.length, 0, 'a deleted order still shows as live');
  });

  await t('deleting an order takes its children with it', async () => {
    const del = await db.from('orders').delete().eq('id', orderId);
    ok(!del.error, del.error?.message);
    for (const table of ['roster_entries', 'order_assets', 'client_submissions', 'change_log']) {
      const left = await db.from(table).select('id').eq('order_id', orderId);
      eq((left.data ?? []).length, 0, `${table} rows survived the order`);
    }
  });
} finally {
  await cleanup();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
