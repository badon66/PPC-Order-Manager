import { promises as fs } from 'fs';
import path from 'path';
import type {
  AppUser, ChangeLogEntry, ClientRosterSubmission, Order, OrderAsset, RosterEntry,
} from '@/lib/types';
import { newId, newToken, blankOrder } from '@/lib/order-utils';
import type {
  Actor, OrderBundle, OrderListFilters, PublicOrderView, Repository,
} from './repository';
import {
  CLIENT_LOCKED_MESSAGE, approvalLogEntry, buildSubmission, clientEditingLocked, healOrder, healRosterEntry, healSubmission, logEntry, matchesSearch, planAcceptance, publicViewOf, rosterLinkView, submissionLogEntries, updateLogEntries,
} from './logic';
import { seedDatabase } from './seed';

/**
 * File-backed store. Lets the app run with no database at all, which is how it
 * gets developed locally.
 *
 * The rules — what gets logged, what a customer sees, what accepting a
 * submission does — are NOT here. They're in ./logic.ts, shared with the
 * Supabase store. This file is only about reading and writing a JSON file.
 *
 * NOT for production: no concurrency control beyond a single-process write
 * queue, and a serverless host has no writable disk anyway.
 */

export interface Database {
  orders: Order[];
  roster: RosterEntry[];
  assets: OrderAsset[];
  submissions: ClientRosterSubmission[];
  history: ChangeLogEntry[];
  users: AppUser[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

/**
 * State lives on globalThis, not in module scope.
 *
 * Next bundles route handlers and pages separately, so a plain module-level
 * `let cache` gives each route its own copy. That bit us: creating an order in
 * one route wrote to that instance's cache, and the edit page read a different,
 * stale one and 404'd on an order that existed.
 *
 * The mtime check is the second half of the fix — even a shared cache goes
 * stale if anything else touches the file.
 */
interface StoreState {
  cache: Database | null;
  mtimeMs: number;
  writeQueue: Promise<unknown>;
}

const g = globalThis as unknown as { __ppcStore?: StoreState };
const state: StoreState = (g.__ppcStore ??= {
  cache: null,
  mtimeMs: 0,
  writeQueue: Promise.resolve(),
});

function heal(db: Database): Database {
  db.orders.forEach(healOrder);
  db.submissions.forEach(healSubmission);
  db.roster.forEach(healRosterEntry);
  return db;
}

async function load(): Promise<Database> {
  try {
    const stat = await fs.stat(DATA_FILE);
    if (state.cache && stat.mtimeMs === state.mtimeMs) return state.cache;
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    state.cache = heal(JSON.parse(raw) as Database);
    state.mtimeMs = stat.mtimeMs;
  } catch {
    if (state.cache) return state.cache;
    state.cache = heal(seedDatabase());
    await persist(state.cache);
  }
  return state.cache!;
}

async function persist(db: Database): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
  state.cache = db;
  state.mtimeMs = (await fs.stat(DATA_FILE)).mtimeMs;
}

/** Serialise writes so two requests can't clobber the file. */
function withWrite<T>(fn: (db: Database) => Promise<T> | T): Promise<T> {
  const next = state.writeQueue.then(async () => {
    const db = await load();
    const result = await fn(db);
    await persist(db);
    return result;
  });
  state.writeQueue = next.catch(() => undefined);
  return next;
}

export const jsonStore: Repository = {
  async listOrders(filters: OrderListFilters = {}) {
    const db = await load();
    const { search = '', status = 'all', includeCompleted = false } = filters;

    return db.orders
      .filter((o) => !o.deletedAt)
      .filter((o) => (includeCompleted ? true : o.status !== 'completed'))
      .filter((o) => (status === 'all' ? true : o.status === status))
      .filter((o) => matchesSearch(o, search))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async getOrder(id: string): Promise<OrderBundle | null> {
    const db = await load();
    const order = db.orders.find((o) => o.id === id && !o.deletedAt);
    if (!order) return null;
    return {
      order,
      roster: db.roster.filter((r) => r.orderId === id).sort((a, b) => a.sortOrder - b.sortOrder),
      assets: db.assets.filter((a) => a.orderId === id).sort((a, b) => a.slot - b.slot),
      submissions: db.submissions
        .filter((s) => s.orderId === id)
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    };
  },

  async createOrder(patch, actor) {
    return withWrite((db) => {
      const order: Order = { ...blankOrder(), ...patch };
      order.createdAt = new Date().toISOString();
      order.updatedAt = order.createdAt;
      db.orders.push(order);
      db.history.push(
        logEntry({
          orderId: order.id,
          action: 'order_created',
          summary: `Order created${order.teamName ? ` for ${order.teamName}` : ''}`,
          actorEmail: actor.email,
          actorName: actor.name,
        }),
      );
      return order;
    });
  },

  async updateOrder(id, patch, actor) {
    return withWrite((db) => {
      const idx = db.orders.findIndex((o) => o.id === id);
      if (idx === -1) throw new Error(`Order ${id} not found`);
      const before = db.orders[idx];

      db.history.push(...updateLogEntries(before, patch, actor));

      const after: Order = { ...before, ...patch, updatedAt: new Date().toISOString() };
      const approval = approvalLogEntry(before, after, actor);
      if (approval) db.history.push(approval);

      db.orders[idx] = after;
      return after;
    });
  },

  async softDeleteOrder(id, actor) {
    await withWrite((db) => {
      const o = db.orders.find((x) => x.id === id);
      if (!o) return;
      o.deletedAt = new Date().toISOString();
      o.updatedAt = o.deletedAt;
      db.history.push(
        logEntry({
          orderId: id, action: 'order_deleted',
          summary: 'Order moved to trash',
          actorEmail: actor.email, actorName: actor.name,
        }),
      );
    });
  },

  async restoreOrder(id, actor) {
    await withWrite((db) => {
      const o = db.orders.find((x) => x.id === id);
      if (!o) return;
      o.deletedAt = null;
      o.updatedAt = new Date().toISOString();
      db.history.push(
        logEntry({
          orderId: id, action: 'order_restored',
          summary: 'Order restored from trash',
          actorEmail: actor.email, actorName: actor.name,
        }),
      );
    });
  },

  async replaceRoster(orderId, entries, actor) {
    return withWrite((db) => {
      const before = db.roster.filter((r) => r.orderId === orderId).length;
      db.roster = db.roster.filter((r) => r.orderId !== orderId);
      const normalised = entries.map((e, i) => ({ ...e, orderId, sortOrder: i }));
      db.roster.push(...normalised);
      db.history.push(
        logEntry({
          orderId, action: 'roster_changed',
          fromValue: `${before} players`,
          toValue: `${normalised.length} players`,
          summary: `Roster updated: ${before} → ${normalised.length} players`,
          actorEmail: actor.email, actorName: actor.name,
        }),
      );
      const o = db.orders.find((x) => x.id === orderId);
      if (o) o.updatedAt = new Date().toISOString();
      return normalised;
    });
  },

  async addAsset(asset, actor) {
    return withWrite((db) => {
      const created: OrderAsset = { ...asset, id: newId() };
      db.assets.push(created);
      db.history.push(
        logEntry({
          orderId: asset.orderId, action: 'asset_added',
          summary: `Artwork added: ${asset.displayName || asset.fileName} (${asset.role})`,
          actorEmail: actor.email, actorName: actor.name,
        }),
      );
      return created;
    });
  },

  async removeAsset(assetId, actor) {
    await withWrite((db) => {
      const a = db.assets.find((x) => x.id === assetId);
      if (!a) return;
      db.assets = db.assets.filter((x) => x.id !== assetId);
      db.history.push(
        logEntry({
          orderId: a.orderId, action: 'asset_removed',
          summary: `Artwork removed: ${a.displayName || a.fileName} (${a.role})`,
          actorEmail: actor.email, actorName: actor.name,
        }),
      );
    });
  },

  /* ---------------- public, token-addressed, redacted ---------------- */

  async getByShareToken(token): Promise<PublicOrderView | null> {
    const db = await load();
    const o = db.orders.find((x) => x.shareToken === token && !x.deletedAt);
    if (!o) return null;
    return publicViewOf(
      o,
      db.roster.filter((r) => r.orderId === o.id),
      db.assets.filter((a) => a.orderId === o.id),
    );
  },

  async getByRosterToken(token) {
    const db = await load();
    const o = db.orders.find((x) => x.rosterToken === token && !x.deletedAt);
    if (!o) return null;
    return rosterLinkView(o, db.roster.filter((r) => r.orderId === o.id).length);
  },

  async submitClientRoster(token, submission) {
    await withWrite((db) => {
      const o = db.orders.find((x) => x.rosterToken === token && !x.deletedAt);
      if (!o) throw new Error('Invalid link');
      // Same rule as the Supabase store, enforced at the write. See logic.ts.
      if (clientEditingLocked(o.status)) throw new Error(CLIENT_LOCKED_MESSAGE);
      const previous = db.submissions
        .filter((x) => x.orderId === o.id)
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
        .pop();

      const created = buildSubmission(o.id, previous, submission);
      db.submissions.push(created);
      db.history.push(...submissionLogEntries(created, o.teamName));
    });
  },

  async acceptSubmission(submissionId, actor) {
    await withWrite((db) => {
      const s = db.submissions.find((x) => x.id === submissionId);
      if (!s || s.acceptedAt) return;
      const order = db.orders.find((o) => o.id === s.orderId);
      if (!order) return;

      const plan = planAcceptance(
        s,
        order,
        db.roster.filter((r) => r.orderId === s.orderId),
        db.assets.filter((a) => a.orderId === s.orderId),
      );

      db.roster.push(...plan.roster);
      db.assets.push(...plan.assets);
      Object.assign(order, plan.orderPatch);

      order.updatedAt = new Date().toISOString();
      s.acceptedAt = order.updatedAt;
      db.history.push(
        logEntry({
          orderId: s.orderId, action: 'submission_accepted',
          summary: plan.summary,
          actorEmail: actor.email, actorName: actor.name,
        }),
      );
    });
  },

  async getLatestSubmissionByRosterToken(token) {
    const db = await load();
    const o = db.orders.find((x) => x.rosterToken === token && !x.deletedAt);
    if (!o) return null;
    return (
      db.submissions
        .filter((s) => s.orderId === o.id)
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
        .pop() ?? null
    );
  },

  async getHistory(orderId) {
    const db = await load();
    return db.history
      .filter((h) => h.orderId === orderId)
      .sort((a, b) => b.at.localeCompare(a.at));
  },

  async listUsers() {
    const db = await load();
    return db.users;
  },
};

/**
 * Point an existing asset at a new URL. Used by the Base44 import's second
 * pass, which copies each remote file into local storage so the artwork
 * doesn't die with the old app.
 */
export async function rehostAsset(assetId: string, fileUrl: string): Promise<boolean> {
  return withWrite((db) => {
    const a = db.assets.find((x) => x.id === assetId);
    if (!a) return false;
    a.fileUrl = fileUrl;
    return true;
  });
}

/** Test/dev helper — forget the in-memory cache. */
export function resetCache(): void {
  state.cache = null;
  state.mtimeMs = 0;
}

export { newToken };
