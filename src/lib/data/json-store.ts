import { promises as fs } from 'fs';
import path from 'path';
import type {
  AppUser, ChangeLogEntry, ClientRosterSubmission, Order, OrderAsset, RosterEntry,
  SubmissionChange, SubmittedContact,
} from '@/lib/types';
import { newId, newToken, blankOrder } from '@/lib/order-utils';
import { DEFAULT_CLIENT_LINK_SECTIONS } from '@/lib/types';
import type {
  Actor, OrderBundle, OrderListFilters, PublicOrderView, Repository,
} from './repository';
import { seedDatabase } from './seed';

/**
 * File-backed store. Stands in for Supabase so the app runs with no database
 * and no accounts. Everything here is deliberately behind the Repository
 * interface so replacing it is a contained change.
 *
 * NOT for production: no concurrency control, no auth, single file.
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
 * the /orders/new route handler wrote to one instance's cache, and the edit
 * page read a different, stale one and 404'd on an order that existed.
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

/**
 * Fill in fields that were added to the schema after a row was written.
 *
 * The JSON store has no migrations, so an order created before a field existed
 * simply lacks it — and the first page to touch it crashes on `undefined`.
 * That happened with `clientLinkSections`. Healing on load means every reader
 * sees a complete row, and any write persists the healed version.
 *
 * Add a line here whenever a new non-optional field goes on Order/RosterEntry.
 */
function heal(db: Database): Database {
  for (const o of db.orders) {
    o.clientLinkSections ??= { ...DEFAULT_CLIENT_LINK_SECTIONS };
    o.rubberizedPpcCrest ??= false;
    o.stitchedSublimatedLogos ??= false;
    o.twillBorderNumbers ??= false;
    o.jerseyTier ??= null;
    for (const set of o.sets ?? []) {
      set.extraJerseys ??= 0;
      set.extraSockPairs ??= 0;
      set.extraPantShells ??= 0;
      set.extrasNotes ??= '';
    }
    o.requestClientDetails ??= false;
    o.deletedAt ??= null;
  }
  for (const s of db.submissions) {
    s.inspiration ??= [];
    s.sections ??= { ...DEFAULT_CLIENT_LINK_SECTIONS };
    s.revision ??= 1;
    s.changes ??= [];
  }
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

function log(
  db: Database,
  entry: Omit<ChangeLogEntry, 'id' | 'at'>,
): void {
  db.history.push({ ...entry, id: newId(), at: new Date().toISOString() });
}

/** Fields we don't bother logging individually — noise. */
const UNLOGGED = new Set(['updatedAt', 'createdAt', 'id', 'shareToken', 'rosterToken', 'sets']);

function diffFields(before: Order, after: Partial<Order>): Array<{ field: string; from: unknown; to: unknown }> {
  const out: Array<{ field: string; from: unknown; to: unknown }> = [];
  for (const [k, v] of Object.entries(after)) {
    if (UNLOGGED.has(k)) continue;
    const prev = (before as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(prev) !== JSON.stringify(v)) out.push({ field: k, from: prev, to: v });
  }
  return out;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * What changed between two client submissions.
 *
 * Players are matched on jersey number where there is one, otherwise on name,
 * so a size correction reads as "changed" rather than "removed and added".
 */
function diffSubmissions(
  prev: ClientRosterSubmission | undefined,
  next: Omit<ClientRosterSubmission, 'id' | 'orderId' | 'submittedAt' | 'acceptedAt' | 'revision' | 'changes'>,
): SubmissionChange[] {
  if (!prev) return [];
  const out: SubmissionChange[] = [];

  const keyOf = (p: { number: string; playerNameAsPrinted: string }) =>
    (p.number || '').trim() || p.playerNameAsPrinted.trim().toLowerCase();

  const before = new Map(prev.players.map((p) => [keyOf(p), p]));
  const after = new Map(next.players.map((p) => [keyOf(p), p]));

  for (const [k, p] of after) {
    const was = before.get(k);
    if (!was) {
      out.push({
        section: 'roster',
        label: `Player ${p.playerNameAsPrinted || p.number || '(unnamed)'}`,
        from: '—',
        to: `added (#${p.number || '?'}, ${p.jerseySize || 'no size'})`,
      });
      continue;
    }
    const fields: Array<[string, string, string]> = [
      ['name', was.playerNameAsPrinted, p.playerNameAsPrinted],
      ['number', was.number, p.number],
      ['jersey size', was.jerseySize, p.jerseySize],
      ['sock size', was.sockSize, p.sockSize],
      ['notes', was.notes, p.notes],
    ];
    for (const [what, from, to] of fields) {
      if ((from || '') !== (to || '')) {
        out.push({
          section: 'roster',
          label: `${p.playerNameAsPrinted || p.number || 'Player'} — ${what}`,
          from: from || '—',
          to: to || '—',
        });
      }
    }
    if (was.isGoalie !== p.isGoalie) {
      out.push({
        section: 'roster',
        label: `${p.playerNameAsPrinted || p.number || 'Player'} — goalie`,
        from: was.isGoalie ? 'Yes' : 'No',
        to: p.isGoalie ? 'Yes' : 'No',
      });
    }
  }
  for (const [k, p] of before) {
    if (!after.has(k)) {
      out.push({
        section: 'roster',
        label: `Player ${p.playerNameAsPrinted || p.number || '(unnamed)'}`,
        from: `#${p.number || '?'}, ${p.jerseySize || 'no size'}`,
        to: 'removed',
      });
    }
  }

  if (prev.logos.length !== next.logos.length) {
    out.push({ section: 'logos', label: 'Logo files', from: String(prev.logos.length), to: String(next.logos.length) });
  }
  if ((prev.inspiration?.length ?? 0) !== next.inspiration.length) {
    out.push({
      section: 'inspiration', label: 'Inspiration images',
      from: String(prev.inspiration?.length ?? 0), to: String(next.inspiration.length),
    });
  }

  const pc = prev.contact, nc = next.contact;
  if (pc || nc) {
    const fields: Array<[string, keyof SubmittedContact]> = [
      ['first name', 'firstName'], ['last name', 'lastName'], ['email', 'email'],
      ['phone', 'phone'], ['street', 'street'], ['unit', 'secondary'],
      ['city', 'city'], ['province', 'province'], ['postal code', 'postal'],
    ];
    for (const [what, key] of fields) {
      const from = pc?.[key] ?? '';
      const to = nc?.[key] ?? '';
      if (from !== to) {
        out.push({ section: 'personalDetails', label: `Contact — ${what}`, from: from || '—', to: to || '—' });
      }
    }
  }

  return out;
}

export const jsonStore: Repository = {
  async listOrders(filters: OrderListFilters = {}) {
    const db = await load();
    const { search = '', status = 'all', includeCompleted = false } = filters;
    const needle = search.trim().toLowerCase();

    return db.orders
      .filter((o) => !o.deletedAt)
      .filter((o) => (includeCompleted ? true : o.status !== 'completed'))
      .filter((o) => (status === 'all' ? true : o.status === status))
      .filter((o) =>
        needle
          ? o.teamName.toLowerCase().includes(needle) ||
            o.invoiceNumber.toLowerCase().includes(needle)
          : true,
      )
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
      log(db, {
        orderId: order.id,
        action: 'order_created',
        summary: `Order created${order.teamName ? ` for ${order.teamName}` : ''}`,
        actorEmail: actor.email,
        actorName: actor.name,
      });
      return order;
    });
  },

  async updateOrder(id, patch, actor) {
    return withWrite((db) => {
      const idx = db.orders.findIndex((o) => o.id === id);
      if (idx === -1) throw new Error(`Order ${id} not found`);
      const before = db.orders[idx];

      for (const change of diffFields(before, patch)) {
        if (change.field === 'status') {
          log(db, {
            orderId: id,
            action: 'status_changed',
            field: 'status',
            fromValue: str(change.from),
            toValue: str(change.to),
            summary: `Status changed from ${str(change.from) ?? '—'} to ${str(change.to) ?? '—'}`,
            actorEmail: actor.email,
            actorName: actor.name,
          });
        } else {
          log(db, {
            orderId: id,
            action: 'field_changed',
            field: change.field,
            fromValue: str(change.from),
            toValue: str(change.to),
            summary: `${change.field} changed`,
            actorEmail: actor.email,
            actorName: actor.name,
          });
        }
      }

      const after: Order = { ...before, ...patch, updatedAt: new Date().toISOString() };

      // Approval snapshot: makes "what was signed off, and when" answerable later.
      const justApproved = !before.approvedDate && !!after.approvedDate;
      if (justApproved) {
        log(db, {
          orderId: id,
          action: 'approved',
          summary: `Approved by ${after.approvedBy || 'unnamed'} on ${after.approvedDate}. Order locked.`,
          snapshot: JSON.parse(JSON.stringify(after)) as Order,
          actorEmail: actor.email,
          actorName: actor.name,
        });
      }

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
      log(db, {
        orderId: id, action: 'order_deleted',
        summary: 'Order moved to trash',
        actorEmail: actor.email, actorName: actor.name,
      });
    });
  },

  async restoreOrder(id, actor) {
    await withWrite((db) => {
      const o = db.orders.find((x) => x.id === id);
      if (!o) return;
      o.deletedAt = null;
      o.updatedAt = new Date().toISOString();
      log(db, {
        orderId: id, action: 'order_restored',
        summary: 'Order restored from trash',
        actorEmail: actor.email, actorName: actor.name,
      });
    });
  },

  async replaceRoster(orderId, entries, actor) {
    return withWrite((db) => {
      const before = db.roster.filter((r) => r.orderId === orderId).length;
      db.roster = db.roster.filter((r) => r.orderId !== orderId);
      const normalised = entries.map((e, i) => ({ ...e, orderId, sortOrder: i }));
      db.roster.push(...normalised);
      log(db, {
        orderId, action: 'roster_changed',
        fromValue: `${before} players`,
        toValue: `${normalised.length} players`,
        summary: `Roster updated: ${before} → ${normalised.length} players`,
        actorEmail: actor.email, actorName: actor.name,
      });
      const o = db.orders.find((x) => x.id === orderId);
      if (o) o.updatedAt = new Date().toISOString();
      return normalised;
    });
  },

  async addAsset(asset, actor) {
    return withWrite((db) => {
      const created: OrderAsset = { ...asset, id: newId() };
      db.assets.push(created);
      log(db, {
        orderId: asset.orderId, action: 'asset_added',
        summary: `Artwork added: ${asset.displayName || asset.fileName} (${asset.role})`,
        actorEmail: actor.email, actorName: actor.name,
      });
      return created;
    });
  },

  async removeAsset(assetId, actor) {
    await withWrite((db) => {
      const a = db.assets.find((x) => x.id === assetId);
      if (!a) return;
      db.assets = db.assets.filter((x) => x.id !== assetId);
      log(db, {
        orderId: a.orderId, action: 'asset_removed',
        summary: `Artwork removed: ${a.displayName || a.fileName} (${a.role})`,
        actorEmail: actor.email, actorName: actor.name,
      });
    });
  },

  /* ---------------- public, token-addressed, redacted ---------------- */

  async getByShareToken(token): Promise<PublicOrderView | null> {
    const db = await load();
    const o = db.orders.find((x) => x.shareToken === token && !x.deletedAt);
    if (!o) return null;
    // Still built field-by-field rather than spread, so a field added to Order
    // later doesn't appear on the customer's page just because someone forgot.
    return {
      teamName: o.teamName,
      invoiceNumber: o.invoiceNumber,
      status: o.status,
      datePaid: o.datePaid,
      estimatedFinishDate: o.estimatedFinishDate,
      trackingCode: o.trackingCode,
      googleDriveLink: o.googleDriveLink,
      orderMode: o.orderMode,
      sets: o.sets,
      jerseyType: o.jerseyType,
      sockType: o.sockType,
      pantShellType: o.pantShellType,
      numberDetails: o.numberDetails,
      addons: {
        dimpledShoulders: o.dimpledShoulders,
        reinforcedElbows: o.reinforcedElbows,
        underarmVents: o.underarmVents,
        frontCrest: o.frontCrest,
        armNumbers: o.armNumbers,
        printedSizingTag: o.printedSizingTag,
        ppcBackBranding: o.ppcBackBranding,
        stopSignPatch: o.stopSignPatch,
        rubberizedPpcCrest: o.rubberizedPpcCrest,
        stitchedSublimatedLogos: o.stitchedSublimatedLogos,
        twillBorderNumbers: o.twillBorderNumbers,
        pantLogo: o.pantLogo,
        pantNumber: o.pantNumber,
        lacesStyle: o.lacesStyle,
        shoulderCut: o.shoulderCut,
        nameStyle: o.nameStyle,
        hasCaptainPatches: o.hasCaptainPatches,
        hasShoulderLogos: o.hasShoulderLogos,
      },
      assets: db.assets.filter((a) => a.orderId === o.id && a.role !== 'font'),
      roster: db.roster.filter((r) => r.orderId === o.id).sort((a, b) => a.sortOrder - b.sortOrder),
      approvedBy: o.approvedBy,
      approvedDate: o.approvedDate,
      specialNotes: o.specialNotes,
      contact: {
        firstName: o.contactFirstName,
        lastName: o.contactLastName,
        email: o.contactEmail,
        phone: o.contactPhone,
        street: o.shippingStreet,
        secondary: o.shippingSecondary,
        city: o.shippingCity,
        province: o.shippingProvince,
        postal: o.shippingPostal,
      },
    };
  },

  async getByRosterToken(token) {
    const db = await load();
    const o = db.orders.find((x) => x.rosterToken === token && !x.deletedAt);
    if (!o) return null;
    return {
      orderId: o.id,
      teamName: o.teamName,
      enabled: o.requestClientDetails,
      sections: o.clientLinkSections ?? { logos: true, inspiration: false, roster: true, personalDetails: false },
      orderMode: o.orderMode,
      existingRosterCount: db.roster.filter((r) => r.orderId === o.id).length,
    };
  },

  async submitClientRoster(token, submission) {
    await withWrite((db) => {
      const o = db.orders.find((x) => x.rosterToken === token && !x.deletedAt);
      if (!o) throw new Error('Invalid link');
      const previous = db.submissions
        .filter((x) => x.orderId === o.id)
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
        .pop();

      const created: ClientRosterSubmission = {
        ...submission,
        id: newId(),
        orderId: o.id,
        revision: (previous?.revision ?? 0) + 1,
        changes: diffSubmissions(previous, submission),
        submittedAt: new Date().toISOString(),
        acceptedAt: null,
      };
      db.submissions.push(created);
      const parts: string[] = [];
      if (created.players.length) parts.push(`${created.players.length} player(s)`);
      if (created.logos.length) parts.push(`${created.logos.length} logo(s)`);
      if (created.inspiration.length) parts.push(`${created.inspiration.length} inspiration image(s)`);
      if (created.contact) parts.push('contact details');
      if (created.revision === 1) {
        log(db, {
          orderId: o.id, action: 'client_submitted',
          summary: `Client submitted ${parts.length ? parts.join(', ') : 'an empty form'}`,
          actorEmail: 'client', actorName: o.teamName || 'Client',
        });
      } else {
        // A revisit. Log the headline, then one line per actual change, so the
        // history answers "what did they change, and when" without opening
        // the submission.
        log(db, {
          orderId: o.id, action: 'client_submitted',
          summary:
            `Client updated their form (revision ${created.revision}) — ` +
            (created.changes.length
              ? `${created.changes.length} change${created.changes.length === 1 ? '' : 's'}`
              : 'nothing changed'),
          actorEmail: 'client', actorName: o.teamName || 'Client',
        });
        for (const c of created.changes) {
          log(db, {
            orderId: o.id, action: 'client_submitted',
            field: c.label, fromValue: c.from, toValue: c.to,
            summary: `Client changed ${c.label}: ${c.from} → ${c.to}`,
            actorEmail: 'client', actorName: o.teamName || 'Client',
          });
        }
      }
    });
  },

  /**
   * Accepting a submission moves its contents onto the order. What "onto the
   * order" means depends on the section:
   *
   *  players      → appended to the roster (never replaces — Keenan can delete
   *                 duplicates in the roster table; silent replacement would be
   *                 the worse mistake)
   *  logos        → become additional_logo assets, one group per submitted logo
   *  inspiration  → become design_reference assets
   *  contact      → written onto the order's contact/shipping fields — but only
   *                 the fields the customer actually filled in, so a partial
   *                 submission doesn't blank out something Keenan already had
   *
   * The submission is kept afterwards, marked accepted, so it can be referred
   * back to.
   */
  async acceptSubmission(submissionId, actor) {
    await withWrite((db) => {
      const s = db.submissions.find((x) => x.id === submissionId);
      if (!s || s.acceptedAt) return;
      const order = db.orders.find((o) => o.id === s.orderId);
      if (!order) return;

      const parts: string[] = [];

      /* players */
      const existing = db.roster.filter((r) => r.orderId === s.orderId);
      let sortOrder = existing.length;
      const homeAway = order.orderMode === 'home_away_set';
      for (const p of s.players) {
        db.roster.push({
          id: newId(),
          orderId: s.orderId,
          playerNameAsPrinted: p.playerNameAsPrinted,
          number: p.number,
          isGoalie: p.isGoalie,
          sockOnly: p.sockOnly,
          jerseySize: p.jerseySize,
          sockSize: p.sockSize,
          pantShellSize: '',
          jerseysPerPlayer: p.sockOnly ? 0 : 1,
          socksPerPlayer: 1,
          shellsPerPlayer: 0,
          // In home/away mode a submitted player is assumed to get one of
          // each; Keenan can un-tick in the roster table.
          homeJersey: homeAway && !p.sockOnly ? 1 : 0,
          awayJersey: homeAway && !p.sockOnly ? 1 : 0,
          homeSocks: homeAway ? 1 : 0,
          awaySocks: 0,
          armNumbers: '', shoulderLogo: '', pantLogo: '', pantNumber: '',
          notes: p.notes,
          sortOrder: sortOrder++,
        });
      }
      if (s.players.length) parts.push(`${s.players.length} player(s) added to roster`);

      /* logos → additional_logo assets, grouped */
      const existingLogoSlots = db.assets.filter(
        (a) => a.orderId === s.orderId && a.role === 'additional_logo',
      ).length;
      s.logos.forEach((l, i) => {
        db.assets.push({
          id: newId(),
          orderId: s.orderId,
          role: 'additional_logo',
          slot: existingLogoSlots + i,
          fileUrl: l.fileUrl,
          fileName: l.fileName,
          displayName: l.logoName || l.fileName,
          notes: [l.placementNotes, l.description].filter(Boolean).join(' — '),
          groupId: newId(),
        });
      });
      if (s.logos.length) parts.push(`${s.logos.length} logo(s) added`);

      /* inspiration → design_reference assets */
      const existingRefSlots = db.assets.filter(
        (a) => a.orderId === s.orderId && a.role === 'design_reference',
      ).length;
      (s.inspiration ?? []).forEach((img, i) => {
        db.assets.push({
          id: newId(),
          orderId: s.orderId,
          role: 'design_reference',
          slot: existingRefSlots + i,
          fileUrl: img.fileUrl,
          fileName: img.fileName,
          displayName: 'Client inspiration',
          notes: img.notes,
        });
      });
      if (s.inspiration?.length) parts.push(`${s.inspiration.length} inspiration image(s) added to design references`);

      /* contact → order fields, non-empty values only */
      if (s.contact) {
        const c = s.contact;
        const put = (key: keyof Order, v: string) => {
          if (v && v.trim()) (order as unknown as Record<string, unknown>)[key] = v.trim();
        };
        put('contactFirstName', c.firstName);
        put('contactLastName', c.lastName);
        put('contactEmail', c.email);
        put('contactPhone', c.phone);
        put('shippingStreet', c.street);
        put('shippingSecondary', c.secondary);
        put('shippingCity', c.city);
        put('shippingProvince', c.province);
        put('shippingPostal', c.postal);
        parts.push('contact details updated');
      }

      order.updatedAt = new Date().toISOString();
      s.acceptedAt = order.updatedAt;
      log(db, {
        orderId: s.orderId, action: 'submission_accepted',
        summary: `Accepted client submission: ${parts.length ? parts.join('; ') : 'nothing to add'}`,
        actorEmail: actor.email, actorName: actor.name,
      });
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
 * pass, which copies each remote file into public/uploads so the artwork
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
