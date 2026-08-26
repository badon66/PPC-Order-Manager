import type {
  ChangeLogEntry, ClientLinkSections, ClientRosterSubmission, Order, OrderAsset, OrderStatus,
  RosterEntry, SubmissionChange, SubmittedContact,
} from '@/lib/types';
import { DEFAULT_CLIENT_LINK_SECTIONS } from '@/lib/types';
import { STATUS_META } from '@/lib/constants';
import { newId, orderIncludesPantShells, orderIncludesSocks } from '@/lib/order-utils';
import type { Actor, PublicOrderView } from './repository';

/**
 * Store-agnostic rules.
 *
 * Everything in here is about *what the app means*, not about where rows are
 * kept: what counts as a change worth logging, what a customer is allowed to
 * see, what accepting a submission does to an order. The JSON store and the
 * Supabase store both call it.
 *
 * It lives apart because it used to live inside json-store.ts, and copying it
 * into a second implementation is how two stores quietly stop agreeing — the
 * customer's share page leaking a field on one backend and not the other, or a
 * field logged in dev and silently not in production.
 *
 * Nothing here does I/O. Everything is a pure function over plain objects.
 */

/* ------------------------------------------------------------------ *
 * Schema healing
 *
 * Rows written before a field existed simply lack it, and the first page to
 * touch one crashes on `undefined`. That happened with `clientLinkSections`.
 *
 * Both stores heal on read. Postgres doesn't make this unnecessary — the
 * column is `jsonb`, so an old row inside it is just as short as an old row in
 * a JSON file.
 *
 * ADD A LINE HERE whenever a new non-optional field goes on Order,
 * RosterEntry or ClientRosterSubmission.
 * ------------------------------------------------------------------ */

export function healOrder(o: Order): Order {
  o.clientLinkSections ??= { ...DEFAULT_CLIENT_LINK_SECTIONS };
  o.rubberizedPpcCrest ??= false;
  o.stitchedSublimatedLogos ??= false;
  o.twillBorderNumbers ??= false;
  o.jerseyTier ??= null;
  o.requestClientDetails ??= false;
  o.productionStartDate ??= null;
  o.productionFinishDate ??= null;
  o.deletedAt ??= null;
  for (const set of (o.sets ??= [])) {
    set.extraJerseys ??= 0;
    set.extraSockPairs ??= 0;
    set.extraPantShells ??= 0;
    set.extrasNotes ??= '';
  }
  return o;
}

export function healSubmission(s: ClientRosterSubmission): ClientRosterSubmission {
  s.inspiration ??= [];
  s.sections ??= { ...DEFAULT_CLIENT_LINK_SECTIONS };
  s.revision ??= 1;
  s.changes ??= [];
  return s;
}

/* ------------------------------------------------------------------ *
 * Change log
 * ------------------------------------------------------------------ */

/** Fields not worth a history line of their own — noise. */
const UNLOGGED = new Set(['updatedAt', 'createdAt', 'id', 'shareToken', 'rosterToken', 'sets']);

export function diffFields(
  before: Order,
  after: Partial<Order>,
): Array<{ field: string; from: unknown; to: unknown }> {
  const out: Array<{ field: string; from: unknown; to: unknown }> = [];
  for (const [k, v] of Object.entries(after)) {
    if (UNLOGGED.has(k)) continue;
    const prev = (before as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(prev) !== JSON.stringify(v)) out.push({ field: k, from: prev, to: v });
  }
  return out;
}

/** Render any value for the history table. */
export function str(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function logEntry(entry: Omit<ChangeLogEntry, 'id' | 'at'>): ChangeLogEntry {
  return { ...entry, id: newId(), at: new Date().toISOString() };
}

/** The history lines an order update produces. Empty when nothing changed. */
export function updateLogEntries(before: Order, patch: Partial<Order>, actor: Actor): ChangeLogEntry[] {
  return diffFields(before, patch).map((change) =>
    logEntry(
      change.field === 'status'
        ? {
            orderId: before.id,
            action: 'status_changed',
            field: 'status',
            fromValue: str(change.from),
            toValue: str(change.to),
            summary: `Status changed from ${str(change.from) ?? '—'} to ${str(change.to) ?? '—'}`,
            actorEmail: actor.email,
            actorName: actor.name,
          }
        : {
            orderId: before.id,
            action: 'field_changed',
            field: change.field,
            fromValue: str(change.from),
            toValue: str(change.to),
            summary: `${change.field} changed`,
            actorEmail: actor.email,
            actorName: actor.name,
          },
    ),
  );
}

/**
 * Approval snapshot. Written the first time an approval date appears, so
 * "what exactly did the customer sign off, and when" stays answerable even
 * after the order is edited.
 */
export function approvalLogEntry(before: Order, after: Order, actor: Actor): ChangeLogEntry | null {
  if (before.approvedDate || !after.approvedDate) return null;
  return logEntry({
    orderId: after.id,
    action: 'approved',
    summary: `Approved by ${after.approvedBy || 'unnamed'} on ${after.approvedDate}. Order locked.`,
    snapshot: JSON.parse(JSON.stringify(after)) as Order,
    actorEmail: actor.email,
    actorName: actor.name,
  });
}

/* ------------------------------------------------------------------ *
 * Client submissions
 * ------------------------------------------------------------------ */

type NewSubmission = Omit<
  ClientRosterSubmission,
  'id' | 'orderId' | 'submittedAt' | 'acceptedAt' | 'revision' | 'changes'
>;

/**
 * What changed between two client submissions.
 *
 * Players are matched on jersey number where there is one, otherwise on name,
 * so a size correction reads as "changed" rather than "removed and added".
 */
export function diffSubmissions(
  prev: ClientRosterSubmission | undefined | null,
  next: NewSubmission,
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
      ['pant shell size', was.pantShellSize ?? '', p.pantShellSize ?? ''],
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
    out.push({
      section: 'logos', label: 'Logo files',
      from: String(prev.logos.length), to: String(next.logos.length),
    });
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

/** Build the row to store, given the customer's previous submission. */
export function buildSubmission(
  orderId: string,
  previous: ClientRosterSubmission | null | undefined,
  submission: NewSubmission,
): ClientRosterSubmission {
  return {
    ...submission,
    id: newId(),
    orderId,
    revision: (previous?.revision ?? 0) + 1,
    changes: diffSubmissions(previous, submission),
    submittedAt: new Date().toISOString(),
    acceptedAt: null,
  };
}

/**
 * The history lines a submission produces.
 *
 * A revisit gets a headline plus one line per actual change, so the history
 * answers "what did they change, and when" without opening the submission.
 */
export function submissionLogEntries(
  created: ClientRosterSubmission,
  teamName: string,
): ChangeLogEntry[] {
  const who = { actorEmail: 'client', actorName: teamName || 'Client' };

  if (created.revision === 1) {
    const parts: string[] = [];
    if (created.players.length) parts.push(`${created.players.length} player(s)`);
    if (created.logos.length) parts.push(`${created.logos.length} logo(s)`);
    if (created.inspiration.length) parts.push(`${created.inspiration.length} inspiration image(s)`);
    if (created.contact) parts.push('contact details');
    return [
      logEntry({
        orderId: created.orderId,
        action: 'client_submitted',
        summary: `Client submitted ${parts.length ? parts.join(', ') : 'an empty form'}`,
        ...who,
      }),
    ];
  }

  const n = created.changes.length;
  return [
    logEntry({
      orderId: created.orderId,
      action: 'client_submitted',
      summary:
        `Client updated their form (revision ${created.revision}) — ` +
        (n ? `${n} change${n === 1 ? '' : 's'}` : 'nothing changed'),
      ...who,
    }),
    ...created.changes.map((c) =>
      logEntry({
        orderId: created.orderId,
        action: 'client_submitted',
        field: c.label,
        fromValue: c.from,
        toValue: c.to,
        summary: `Client changed ${c.label}: ${c.from} → ${c.to}`,
        ...who,
      }),
    ),
  ];
}

/**
 * What accepting a submission produces.
 *
 *  players      → appended to the roster (never replaces — Keenan deletes
 *                 duplicates himself; silent replacement is the worse mistake)
 *  logos        → additional_logo assets, one group per submitted logo
 *  inspiration  → design_reference assets
 *  contact      → only the fields the customer actually filled in, so a partial
 *                 submission can't blank out something already on the order
 *
 * Returns the rows to insert and the patch to apply. The caller persists them;
 * the submission itself is kept, marked accepted.
 */
export interface AcceptancePlan {
  roster: RosterEntry[];
  assets: OrderAsset[];
  orderPatch: Partial<Order>;
  summary: string;
}

export function planAcceptance(
  submission: ClientRosterSubmission,
  order: Order,
  existingRosterCount: number,
  existingAssets: OrderAsset[],
): AcceptancePlan {
  const parts: string[] = [];
  const roster: RosterEntry[] = [];
  const assets: OrderAsset[] = [];
  const orderPatch: Partial<Order> = {};

  const homeAway = order.orderMode === 'home_away_set';
  let sortOrder = existingRosterCount;

  for (const p of submission.players) {
    roster.push({
      id: newId(),
      orderId: order.id,
      playerNameAsPrinted: p.playerNameAsPrinted,
      number: p.number,
      isGoalie: p.isGoalie,
      sockOnly: p.sockOnly,
      jerseySize: p.jerseySize,
      sockSize: p.sockSize,
      pantShellSize: p.pantShellSize ?? '',
      jerseysPerPlayer: p.sockOnly ? 0 : 1,
      socksPerPlayer: 1,
      shellsPerPlayer: 0,
      // In home/away mode a submitted player is assumed to get one of each;
      // Keenan can un-tick in the roster table.
      homeJersey: homeAway && !p.sockOnly ? 1 : 0,
      awayJersey: homeAway && !p.sockOnly ? 1 : 0,
      homeSocks: homeAway ? 1 : 0,
      awaySocks: 0,
      armNumbers: '', shoulderLogo: '', pantLogo: '', pantNumber: '',
      notes: p.notes,
      sortOrder: sortOrder++,
    });
  }
  if (submission.players.length) parts.push(`${submission.players.length} player(s) added to roster`);

  const logoSlots = existingAssets.filter((a) => a.role === 'additional_logo').length;
  submission.logos.forEach((l, i) => {
    assets.push({
      id: newId(),
      orderId: order.id,
      role: 'additional_logo',
      slot: logoSlots + i,
      fileUrl: l.fileUrl,
      fileName: l.fileName,
      displayName: l.logoName || l.fileName,
      notes: [l.placementNotes, l.description].filter(Boolean).join(' — '),
      groupId: newId(),
    });
  });
  if (submission.logos.length) parts.push(`${submission.logos.length} logo(s) added`);

  const refSlots = existingAssets.filter((a) => a.role === 'design_reference').length;
  (submission.inspiration ?? []).forEach((img, i) => {
    assets.push({
      id: newId(),
      orderId: order.id,
      role: 'design_reference',
      slot: refSlots + i,
      fileUrl: img.fileUrl,
      fileName: img.fileName,
      displayName: 'Client inspiration',
      notes: img.notes,
    });
  });
  if (submission.inspiration?.length) {
    parts.push(`${submission.inspiration.length} inspiration image(s) added to design references`);
  }

  if (submission.contact) {
    const c = submission.contact;
    const put = (key: keyof Order, v: string) => {
      if (v && v.trim()) (orderPatch as Record<string, unknown>)[key] = v.trim();
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

  return {
    roster,
    assets,
    orderPatch,
    summary: `Accepted client submission: ${parts.length ? parts.join('; ') : 'nothing to add'}`,
  };
}

/* ------------------------------------------------------------------ *
 * The customer's view
 * ------------------------------------------------------------------ */

/**
 * Built field-by-field, never by spreading the order.
 *
 * That is the whole point: a field added to Order tomorrow does not appear on
 * a customer's page because someone forgot to exclude it. Adding something
 * here has to be a deliberate act.
 *
 * Contact and shipping ARE included — the customer needs to check their own
 * address before anything ships.
 */
export function publicViewOf(
  o: Order,
  roster: RosterEntry[],
  assets: OrderAsset[],
): PublicOrderView {
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
    // Needed so the share page can call computeTotals: with no roster yet, the
    // player count comes from what Keenan typed, not from counting zero rows.
    playersTotal: o.playersTotal,
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
    // The font file is a licensed asset, not something the customer ordered.
    assets: assets.filter((a) => a.role !== 'font'),
    roster: [...roster].sort((a, b) => a.sortOrder - b.sortOrder),
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
}

/**
 * Can the customer still change what they sent us?
 *
 * Yes right up until the jerseys are being made, and never after. Once a
 * roster is at the manufacturer, a size changed on a form is not a correction
 * — it's a discrepancy between what the customer believes they ordered and
 * what is being sewn, and nobody finds out until the box arrives.
 *
 * Derived from the workflow position in STATUS_META rather than a hardcoded
 * list of locked statuses, so it stays correct on its own: a status inserted
 * before production is editable, one inserted after is locked, and neither
 * requires remembering to edit this function. That `order` field already means
 * "where in the process is this" — this is a second reading of the same fact,
 * not a new one to keep in step.
 */
export function clientEditingLocked(status: OrderStatus): boolean {
  return STATUS_META[status].order >= STATUS_META.in_production.order;
}

export function rosterLinkView(o: Order, existingRosterCount: number): {
  orderId: string;
  teamName: string;
  enabled: boolean;
  status: OrderStatus;
  /** True once the order is in production or beyond — the form goes read-only. */
  locked: boolean;
  sections: ClientLinkSections;
  orderMode: Order['orderMode'];
  /** Whether to ask for sock / pant shell sizes at all. */
  includesSocks: boolean;
  includesPantShells: boolean;
  existingRosterCount: number;
} {
  return {
    orderId: o.id,
    teamName: o.teamName,
    // `enabled` stays "has Keenan switched the link on", so the two reasons a
    // form won't accept input remain distinguishable — the customer gets told
    // which one applies rather than one vague dead end.
    enabled: o.requestClientDetails,
    status: o.status,
    locked: clientEditingLocked(o.status),
    sections: o.clientLinkSections ?? { ...DEFAULT_CLIENT_LINK_SECTIONS },
    orderMode: o.orderMode,
    includesSocks: orderIncludesSocks(o),
    includesPantShells: orderIncludesPantShells(o),
    existingRosterCount,
  };
}

/**
 * Thrown by both stores when a submission arrives for a locked order.
 *
 * Hiding the form is not enough on its own: the page is public, the token is
 * the only credential, and a tab left open before production started will
 * happily POST afterwards. The check has to be at the write, and it has to be
 * in both backends — hence here, next to the rule it enforces.
 */
export const CLIENT_LOCKED_MESSAGE =
  'This order is already in production, so it can no longer be changed here. ' +
  'Get in touch with Powerplay Customs if something is wrong.';

/* ------------------------------------------------------------------ *
 * Listing
 * ------------------------------------------------------------------ */

/**
 * Search matching, shared so both stores agree on what "matches" means.
 * Postgres could do this in SQL, but then a case-folding difference between
 * ILIKE and JS toLowerCase() would show up as a mystery in one backend only.
 */
export function matchesSearch(o: Order, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return (
    o.teamName.toLowerCase().includes(needle) ||
    o.invoiceNumber.toLowerCase().includes(needle)
  );
}
