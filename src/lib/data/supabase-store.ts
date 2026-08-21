import type {
  AppUser, ChangeLogEntry, ClientRosterSubmission, Order, OrderAsset, RosterEntry,
} from '@/lib/types';
import { newId, newToken, blankOrder } from '@/lib/order-utils';
import { supabase } from '@/lib/supabase';
import type {
  Actor, OrderBundle, OrderListFilters, PublicOrderView, Repository,
} from './repository';
import {
  approvalLogEntry, buildSubmission, healOrder, healSubmission, logEntry, matchesSearch,
  planAcceptance, publicViewOf, rosterLinkView, submissionLogEntries, updateLogEntries,
} from './logic';

/**
 * Postgres-backed store, for the hosted app.
 *
 * Every table keeps its entity as JSONB in a `data` column, with the handful of
 * fields the app filters on generated from that JSON and indexed (see
 * supabase/migrations/0001_init.sql). So this file is mostly `select data` and
 * `upsert({ id, data })` — the shape going in is the shape coming out, and
 * there is no snake_case mapping layer to get wrong.
 *
 * The rules live in ./logic.ts, shared with the JSON store, so the two backends
 * cannot disagree about what gets logged or what a customer is allowed to see.
 *
 * WHAT THIS DOES NOT DO: transactions. supabase-js speaks PostgREST, which has
 * no multi-statement transaction. A multi-row operation is ordered so that a
 * failure part-way leaves something recoverable rather than something wrong —
 * see the comments on replaceRoster and acceptSubmission. For a single
 * operator making one change at a time this is the right trade; if this ever
 * gets concurrent writers, those two operations become RPCs in Postgres.
 */

const ORDERS = 'orders';
const ROSTER = 'roster_entries';
const ASSETS = 'order_assets';
const SUBMISSIONS = 'client_submissions';
const HISTORY = 'change_log';
const USERS = 'app_users';

/** Postgrest returns `{ data, error }` everywhere; surface errors as throws. */
function unwrap<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: no data returned`);
  return res.data;
}

type Row<T> = { id: string; data: T };

const rows = <T>(r: Array<Row<T>> | null): T[] => (r ?? []).map((x) => x.data);

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

async function putOrder(o: Order): Promise<void> {
  const res = await supabase().from(ORDERS).upsert({ id: o.id, data: o });
  if (res.error) throw new Error(`save order: ${res.error.message}`);
}

async function appendHistory(entries: ChangeLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const res = await supabase()
    .from(HISTORY)
    .insert(entries.map((e) => ({ id: e.id, order_id: e.orderId, data: e })));
  if (res.error) throw new Error(`write history: ${res.error.message}`);
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

async function orderById(id: string, includeDeleted = false): Promise<Order | null> {
  let q = supabase().from(ORDERS).select('id, data').eq('id', id);
  if (!includeDeleted) q = q.is('deleted_at', null);
  const res = await q.maybeSingle();
  if (res.error) throw new Error(`load order: ${res.error.message}`);
  return res.data ? healOrder((res.data as Row<Order>).data) : null;
}

async function orderByToken(column: 'share_token' | 'roster_token', token: string): Promise<Order | null> {
  const res = await supabase()
    .from(ORDERS)
    .select('id, data')
    .eq(column, token)
    .is('deleted_at', null)
    .maybeSingle();
  if (res.error) throw new Error(`load order by token: ${res.error.message}`);
  return res.data ? healOrder((res.data as Row<Order>).data) : null;
}

async function rosterOf(orderId: string): Promise<RosterEntry[]> {
  const res = await supabase()
    .from(ROSTER).select('id, data').eq('order_id', orderId).order('sort_order');
  return rows<RosterEntry>(unwrap(res, 'load roster'));
}

async function assetsOf(orderId: string): Promise<OrderAsset[]> {
  const res = await supabase()
    .from(ASSETS).select('id, data').eq('order_id', orderId).order('slot');
  return rows<OrderAsset>(unwrap(res, 'load artwork'));
}

async function submissionsOf(orderId: string): Promise<ClientRosterSubmission[]> {
  const res = await supabase()
    .from(SUBMISSIONS)
    .select('id, data')
    .eq('order_id', orderId)
    .order('submitted_at', { ascending: false });
  return rows<ClientRosterSubmission>(unwrap(res, 'load submissions')).map(healSubmission);
}

/* ------------------------------------------------------------------ *
 * The store
 * ------------------------------------------------------------------ */

export const supabaseStore: Repository = {
  async listOrders(filters: OrderListFilters = {}) {
    const { search = '', status = 'all', includeCompleted = false } = filters;

    let q = supabase()
      .from(ORDERS)
      .select('id, data')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (status !== 'all') q = q.eq('status', status);
    else if (!includeCompleted) q = q.neq('status', 'completed');

    const all = rows<Order>(unwrap(await q, 'list orders')).map(healOrder);

    // Status is filtered in SQL because it's indexed; search is filtered here
    // so both backends agree exactly on what "matches" means. Over this many
    // orders the difference is unmeasurable.
    const wanted = all
      .filter((o) => (status === 'all' && !includeCompleted ? o.status !== 'completed' : true))
      .filter((o) => matchesSearch(o, search));

    return wanted;
  },

  async getOrder(id: string): Promise<OrderBundle | null> {
    const order = await orderById(id);
    if (!order) return null;
    const [roster, assets, submissions] = await Promise.all([
      rosterOf(id), assetsOf(id), submissionsOf(id),
    ]);
    return { order, roster, assets, submissions };
  },

  async createOrder(patch, actor) {
    const order: Order = { ...blankOrder(), ...patch };
    order.createdAt = new Date().toISOString();
    order.updatedAt = order.createdAt;

    await putOrder(order);
    await appendHistory([
      logEntry({
        orderId: order.id,
        action: 'order_created',
        summary: `Order created${order.teamName ? ` for ${order.teamName}` : ''}`,
        actorEmail: actor.email,
        actorName: actor.name,
      }),
    ]);
    return order;
  },

  async updateOrder(id, patch, actor) {
    const before = await orderById(id, true);
    if (!before) throw new Error(`Order ${id} not found`);

    const after: Order = { ...before, ...patch, updatedAt: new Date().toISOString() };

    // Order matters: the row is the thing that must be right. History is
    // written after, so a failure there loses a log line rather than an edit.
    await putOrder(after);
    const entries = updateLogEntries(before, patch, actor);
    const approval = approvalLogEntry(before, after, actor);
    if (approval) entries.push(approval);
    await appendHistory(entries);

    return after;
  },

  async softDeleteOrder(id, actor) {
    const o = await orderById(id, true);
    if (!o) return;
    o.deletedAt = new Date().toISOString();
    o.updatedAt = o.deletedAt;
    await putOrder(o);
    await appendHistory([
      logEntry({
        orderId: id, action: 'order_deleted',
        summary: 'Order moved to trash',
        actorEmail: actor.email, actorName: actor.name,
      }),
    ]);
  },

  async restoreOrder(id, actor) {
    const o = await orderById(id, true);
    if (!o) return;
    o.deletedAt = null;
    o.updatedAt = new Date().toISOString();
    await putOrder(o);
    await appendHistory([
      logEntry({
        orderId: id, action: 'order_restored',
        summary: 'Order restored from trash',
        actorEmail: actor.email, actorName: actor.name,
      }),
    ]);
  },

  async replaceRoster(orderId, entries, actor) {
    const before = (await rosterOf(orderId)).length;
    const normalised = entries.map((e, i) => ({ ...e, orderId, sortOrder: i }));

    /*
     * Insert first, then delete what was there before.
     *
     * The other order — delete then insert — turns a failed insert into an
     * erased roster. This way a failure leaves duplicates, which are visible
     * and fixable. Losing a 20-player roster to a dropped connection is not.
     */
    const keep = new Set(normalised.map((e) => e.id));
    if (normalised.length) {
      const res = await supabase().from(ROSTER).upsert(
        normalised.map((e) => ({ id: e.id, order_id: orderId, data: e })),
      );
      if (res.error) throw new Error(`save roster: ${res.error.message}`);
    }

    const stale = (await rosterOf(orderId)).filter((r) => !keep.has(r.id)).map((r) => r.id);
    if (stale.length) {
      const res = await supabase().from(ROSTER).delete().in('id', stale);
      if (res.error) throw new Error(`clear old roster: ${res.error.message}`);
    }

    await appendHistory([
      logEntry({
        orderId, action: 'roster_changed',
        fromValue: `${before} players`,
        toValue: `${normalised.length} players`,
        summary: `Roster updated: ${before} → ${normalised.length} players`,
        actorEmail: actor.email, actorName: actor.name,
      }),
    ]);

    const o = await orderById(orderId, true);
    if (o) {
      o.updatedAt = new Date().toISOString();
      await putOrder(o);
    }

    return normalised;
  },

  async addAsset(asset, actor) {
    const created: OrderAsset = { ...asset, id: newId() };
    const res = await supabase()
      .from(ASSETS)
      .insert({ id: created.id, order_id: created.orderId, data: created });
    if (res.error) throw new Error(`add artwork: ${res.error.message}`);

    await appendHistory([
      logEntry({
        orderId: asset.orderId, action: 'asset_added',
        summary: `Artwork added: ${asset.displayName || asset.fileName} (${asset.role})`,
        actorEmail: actor.email, actorName: actor.name,
      }),
    ]);
    return created;
  },

  async removeAsset(assetId, actor) {
    const found = await supabase().from(ASSETS).select('id, data').eq('id', assetId).maybeSingle();
    if (found.error) throw new Error(`find artwork: ${found.error.message}`);
    if (!found.data) return;
    const a = (found.data as Row<OrderAsset>).data;

    const res = await supabase().from(ASSETS).delete().eq('id', assetId);
    if (res.error) throw new Error(`remove artwork: ${res.error.message}`);

    await appendHistory([
      logEntry({
        orderId: a.orderId, action: 'asset_removed',
        summary: `Artwork removed: ${a.displayName || a.fileName} (${a.role})`,
        actorEmail: actor.email, actorName: actor.name,
      }),
    ]);
  },

  /* ---------------- public, token-addressed, redacted ---------------- */

  async getByShareToken(token): Promise<PublicOrderView | null> {
    const o = await orderByToken('share_token', token);
    if (!o) return null;
    const [roster, assets] = await Promise.all([rosterOf(o.id), assetsOf(o.id)]);
    return publicViewOf(o, roster, assets);
  },

  async getByRosterToken(token) {
    const o = await orderByToken('roster_token', token);
    if (!o) return null;
    return rosterLinkView(o, (await rosterOf(o.id)).length);
  },

  async submitClientRoster(token, submission) {
    const o = await orderByToken('roster_token', token);
    if (!o) throw new Error('Invalid link');

    const previous = await this.getLatestSubmissionByRosterToken(token);
    const created = buildSubmission(o.id, previous, submission);

    const res = await supabase()
      .from(SUBMISSIONS)
      .insert({ id: created.id, order_id: o.id, data: created });
    if (res.error) {
      /*
       * (order_id, revision) is unique, so two submissions racing for the same
       * revision number collide here rather than silently overwriting one
       * another. Say so plainly — the customer just needs to send it again.
       */
      if (res.error.code === '23505') {
        throw new Error('That was submitted twice at once — please send it again.');
      }
      throw new Error(`save submission: ${res.error.message}`);
    }

    await appendHistory(submissionLogEntries(created, o.teamName));
  },

  async acceptSubmission(submissionId, actor) {
    const found = await supabase()
      .from(SUBMISSIONS).select('id, data').eq('id', submissionId).maybeSingle();
    if (found.error) throw new Error(`find submission: ${found.error.message}`);
    if (!found.data) return;

    const s = healSubmission((found.data as Row<ClientRosterSubmission>).data);
    if (s.acceptedAt) return;

    const order = await orderById(s.orderId, true);
    if (!order) return;

    const [roster, assets] = await Promise.all([rosterOf(s.orderId), assetsOf(s.orderId)]);
    const plan = planAcceptance(s, order, roster.length, assets);

    /*
     * Ordered so a failure part-way is recoverable: the new rows go in first,
     * and the submission is only marked accepted once they're all there. Fail
     * before that and the submission is still pending, so accepting again
     * finishes the job — at worst duplicating rows, which are visible and
     * deletable. Marking it accepted first would strand the contents.
     */
    if (plan.roster.length) {
      const res = await supabase().from(ROSTER).insert(
        plan.roster.map((r) => ({ id: r.id, order_id: r.orderId, data: r })),
      );
      if (res.error) throw new Error(`add submitted players: ${res.error.message}`);
    }
    if (plan.assets.length) {
      const res = await supabase().from(ASSETS).insert(
        plan.assets.map((a) => ({ id: a.id, order_id: a.orderId, data: a })),
      );
      if (res.error) throw new Error(`add submitted artwork: ${res.error.message}`);
    }

    const after: Order = { ...order, ...plan.orderPatch, updatedAt: new Date().toISOString() };
    await putOrder(after);

    s.acceptedAt = after.updatedAt;
    const marked = await supabase()
      .from(SUBMISSIONS).update({ data: s }).eq('id', submissionId);
    if (marked.error) throw new Error(`mark submission accepted: ${marked.error.message}`);

    await appendHistory([
      logEntry({
        orderId: s.orderId, action: 'submission_accepted',
        summary: plan.summary,
        actorEmail: actor.email, actorName: actor.name,
      }),
    ]);
  },

  async getLatestSubmissionByRosterToken(token) {
    const o = await orderByToken('roster_token', token);
    if (!o) return null;
    const res = await supabase()
      .from(SUBMISSIONS)
      .select('id, data')
      .eq('order_id', o.id)
      .order('revision', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (res.error) throw new Error(`load latest submission: ${res.error.message}`);
    return res.data ? healSubmission((res.data as Row<ClientRosterSubmission>).data) : null;
  },

  async getHistory(orderId) {
    const res = await supabase()
      .from(HISTORY)
      .select('id, data')
      .eq('order_id', orderId)
      .order('at', { ascending: false });
    return rows<ChangeLogEntry>(unwrap(res, 'load history'));
  },

  async listUsers() {
    const res = await supabase().from(USERS).select('id, data');
    return rows<AppUser>(unwrap(res, 'list users'));
  },
};

/**
 * Point an existing asset at a new URL. Used by the Base44 rescue pass, which
 * copies each remote file into the artwork bucket so it doesn't die with the
 * old app.
 */
export async function rehostAssetSupabase(assetId: string, fileUrl: string): Promise<boolean> {
  const found = await supabase().from(ASSETS).select('id, data').eq('id', assetId).maybeSingle();
  if (found.error) throw new Error(`find artwork: ${found.error.message}`);
  if (!found.data) return false;

  const a = { ...(found.data as Row<OrderAsset>).data, fileUrl };
  const res = await supabase().from(ASSETS).update({ data: a }).eq('id', assetId);
  if (res.error) throw new Error(`update artwork: ${res.error.message}`);
  return true;
}

export { newToken };
