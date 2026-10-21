import type { CalendarDate } from '@/lib/dates';
import type {
  ApprovalRecord, AppSettings, ChangeLogEntry, ClientLinkSections, ClientRosterSubmission, ExtraJersey, Order, OrderAsset, OrderStatus, RosterEntry, RosterVersion, SubmissionChange, SubmittedContact,
} from '@/lib/types';
import { COMMENT_AUDIENCES, COMMENT_SECTIONS, DEFAULT_APP_SETTINGS, DEFAULT_CLIENT_LINK_SECTIONS, ROSTER_ANSWER_LABELS } from '@/lib/types';
import type { CommentAudience, CommentSection, SectionComment, SheetComment } from '@/lib/types';
import { STATUS_META, awaitingFinish, captaincyLabel } from '@/lib/constants';
import { nextHomeAwayClaims } from '@/lib/roster-edit';
import { planNewRoster, rosterLabel } from '@/lib/roster-versions';
import {
  approvalOpen, extraRowCount, newId, orderIncludesPantShells, orderIncludesSocks, rosterSlotCount,
} from '@/lib/order-utils';
import type { Actor, BuildSheet, FactoryOrderView, PublicOrderView } from './repository';
import type { RouteVariant } from '@/lib/types';
import { variantOf } from './intake-logic';
import { stagePagePaths } from './stage-pages';
import { timelineOf, type TimelineStep } from './timeline';

/** Adapts stagePagePaths' {design, details} to timelineOf's {designUrl, detailsUrl} opts. */
function stageUrls(token: string): { designUrl: string; detailsUrl: string } {
  const paths = stagePagePaths(token);
  return { designUrl: paths.design, detailsUrl: paths.details };
}

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
  o.stitchedShoulderTrim ??= false;
  o.multiPanelSocks ??= false;
  o.goaliePantReversedLogos ??= false;
  o.orderValue ??= null;
  o.completedAt ??= null;
  o.paymentsReceived ??= null;
  o.sentToFactoryAt ??= null;
  o.jerseyTier ??= null;
  o.requestClientDetails ??= false;
  o.productionStartDate ??= null;
  o.productionFinishDate ??= null;
  o.requestApproval ??= false;
  o.extraJerseyDetails ??= [];
  o.keeperJerseys ??= [];
  o.rosters ??= [];
  o.activeRosterId ??= '';
  o.rosterNumbersUsed ??= o.rosters.reduce((m, v) => Math.max(m, v.number), 0);
  o.rosterReads ??= [];
  o.factoryNotes ??= '';
  o.brandingNotes ??= '';
  o.customBranding ??= false;
  o.customBrandingNotes ??= '';
  // One description became a list of logos: the old one is the first.
  o.customBrandingItems ??= o.customBranding || o.customBrandingNotes
    ? [{ id: 'custom-branding-1', name: '', notes: o.customBrandingNotes ?? '' }]
    : [];
  o.captainAwayCQuantity ??= 0;
  o.captainAwayAQuantity ??= 0;
  o.sectionComments ??= {};
  // Not minted here: a heal runs on every read and isn't persisted, so a token
  // made here would change on every page load. createFactoryLink mints it.
  o.factoryToken ??= '';
  o.approvalRecord ??= null;
  o.deletedAt ??= null;
  o.source ??= 'manual';
  o.enquiry ??= null;
  o.customerEmails ??= [];
  o.contactFirstName ??= '';
  o.trackingCode ??= '';
  o.approvedBy ??= '';
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
  s.rosterFiles ??= [];
  s.extras ??= [];
  s.sections ??= { ...DEFAULT_CLIENT_LINK_SECTIONS };
  s.revision ??= 1;
  s.changes ??= [];
  s.colours ??= '';
  for (const p of (s.players ??= [])) p.captaincy ??= '';
  return s;
}

/**
 * Rows imported from Base44 and every row written before captaincy existed
 * have no such field. Filled in on load so the rest of the app can treat it as
 * a plain string rather than checking for undefined at every use.
 */
export function healRosterEntry(r: RosterEntry): RosterEntry {
  r.captaincy ??= '';
  // Rows written before this field existed are treated as Keenan's own, so
  // the first replacing accept after this ships can't delete work he typed.
  r.fromSubmissionId ??= '';
  r.noName ??= false;
  // Rows from before an order could hold more than one roster belong to the original one.
  r.rosterId ??= '';
  return r;
}

/** Settings rows written before a field existed get the default for it. */
export function healSettings(s: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    howToPay: s?.howToPay ?? DEFAULT_APP_SETTINGS.howToPay,
    googleReviewUrl: s?.googleReviewUrl ?? DEFAULT_APP_SETTINGS.googleReviewUrl,
    referralLine: s?.referralLine ?? DEFAULT_APP_SETTINGS.referralLine,
  };
}

/* ------------------------------------------------------------------ *
 * Change log
 * ------------------------------------------------------------------ */

/** Fields not worth a history line of their own — noise. */
// Roster list changes write their own history lines (see the roster actions); the raw JSON diff would be noise.
const UNLOGGED = new Set(['updatedAt', 'createdAt', 'id', 'shareToken', 'rosterToken', 'factoryToken', 'sets', 'customerEmails', 'rosters', 'activeRosterId', 'rosterNumbersUsed', 'rosterReads']);

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

/**
 * The patch an update should actually apply.
 *
 * `completedAt` is the day the job was DONE, and done means shipped: the day
 * the box left is the day the work finished, whatever housekeeping status it
 * sits in afterwards. So the stamp lands the first time an order reaches
 * Shipped or beyond (Completed directly, if Shipped was skipped), and never
 * moves again on its own. Keenan can still edit it.
 *
 * Store-agnostic, so both backends stamp it the same way; without it "sales
 * this year" has no date to count by.
 */
export function stampCompletion(before: Order, patch: Partial<Order>, today: CalendarDate): Partial<Order> {
  if (!patch.status || patch.completedAt || before.completedAt) return patch;
  const crosses = !awaitingFinish(patch.status) && awaitingFinish(before.status);
  return crosses ? { ...patch, completedAt: today } : patch;
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

  // A stage page only ever submits its own sections — a details-page visit
  // carries no logos or inspiration, and a design-page visit carries no
  // roster or contact. Comparing against a previous submission's fuller set
  // would otherwise read as "everything was removed", when really this visit
  // just never touched it.
  if (next.sections.roster) {
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
      if ((was.captaincy || '') !== (p.captaincy || '')) {
        out.push({
          section: 'roster',
          label: `${p.playerNameAsPrinted || p.number || 'Player'} — letter`,
          from: captaincyLabel(was.captaincy),
          to: captaincyLabel(p.captaincy),
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

    if ((prev.rosterFiles?.length ?? 0) !== next.rosterFiles.length) {
      out.push({
        section: 'roster', label: 'Roster files',
        from: String(prev.rosterFiles?.length ?? 0), to: String(next.rosterFiles.length),
      });
    }
    // "Not yet" turning into a typed list is the change Keenan is waiting
    // for, so it gets its own line rather than hiding behind the player rows.
    if ((prev.rosterAnswer ?? '') !== (next.rosterAnswer ?? '')) {
      out.push({
        section: 'roster', label: 'Roster',
        from: prev.rosterAnswer ? ROSTER_ANSWER_LABELS[prev.rosterAnswer] : '—',
        to: next.rosterAnswer ? ROSTER_ANSWER_LABELS[next.rosterAnswer] : '—',
      });
    }
  }

  if (next.sections.logos && prev.logos.length !== next.logos.length) {
    out.push({
      section: 'logos', label: 'Logo files',
      from: String(prev.logos.length), to: String(next.logos.length),
    });
  }
  if (next.sections.inspiration && (prev.inspiration?.length ?? 0) !== next.inspiration.length) {
    out.push({
      section: 'inspiration', label: 'Inspiration images',
      from: String(prev.inspiration?.length ?? 0), to: String(next.inspiration.length),
    });
  }
  // Colours only ever travels with logos or inspiration — see cleanSubmission
  // — so a submission carrying neither has nothing to compare here either.
  if ((next.sections.logos || next.sections.inspiration) && (prev.colours ?? '') !== (next.colours ?? '')) {
    out.push({
      section: 'inspiration', label: 'Colours',
      from: prev.colours || '—', to: next.colours || '—',
    });
  }

  if (next.sections.personalDetails) {
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
    if (created.players.length) {
      parts.push(`${created.players.length} player(s)${created.convertedFrom ? ` (converted from ${created.convertedFrom.fileName || 'their file'} and checked by them)` : ''}`);
    }
    if (created.rosterFiles.length) parts.push(`${created.rosterFiles.length} roster file(s)`);
    if (created.rosterAnswer === 'later') parts.push('roster not ready yet');
    if (created.logos.length) parts.push(`${created.logos.length} logo(s)`);
    if (created.inspiration.length) parts.push(`${created.inspiration.length} inspiration image(s)`);
    if (created.colours) parts.push('team colours');
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
 *  players      → a NEW roster of their own (Roster N), put in use. The
 *                 previous roster is kept exactly as it was — nothing Keenan
 *                 typed is overwritten by a team's resend, and he deletes the
 *                 rosters he doesn't need. (It used to replace the rows of the
 *                 previous submission inside one roster; "a separate roster
 *                 per upload" is Keenan's call, 2026-10-15.)
 *  logos        → additional_logo assets, one group per submitted logo
 *  inspiration  → design_reference assets
 *  contact      → only the fields the customer actually filled in, so a partial
 *                 submission can't blank out something already on the order
 *
 * Returns the rows to insert and the patch to apply. The caller persists them;
 * the submission itself is kept, marked accepted.
 */
export interface AcceptancePlan {
  /** Rows of the new roster, already stamped with its id. Empty when the submission has no players. */
  roster: RosterEntry[];
  /** The roster those rows make, when there are any. */
  newRoster: RosterVersion | null;
  assets: OrderAsset[];
  orderPatch: Partial<Order>;
  summary: string;
}

export function planAcceptance(
  submission: ClientRosterSubmission,
  order: Order,
  /** Every roster row on the order, all rosters — needed to number the new roster. */
  existingRoster: RosterEntry[],
  existingAssets: OrderAsset[],
  now: string = new Date().toISOString(),
): AcceptancePlan {
  const parts: string[] = [];
  const roster: RosterEntry[] = [];
  const assets: OrderAsset[] = [];
  const orderPatch: Partial<Order> = {};
  let newRoster: RosterVersion | null = null;

  const homeAway = order.orderMode === 'home_away_set';
  let sortOrder = 0;

  /*
   * Budgets, so a new roster can't over-assign what was ordered.
   *
   * Counted down across the batch: twelve pairs of socks against fifteen
   * players gives the first twelve a pair and the rest none. The new roster
   * stands on its own, so it starts from what the order declares — not from
   * what an older roster happens to hold.
   */
  const declared = (pick: (s: Order['sets'][number]) => number) =>
    order.sets.reduce((n, x) => n + (pick(x) || 0), 0);

  let jerseyBudget = declared((x) => (x.playerJerseys || 0) + (x.goalieJerseys || 0));
  let sockBudget = declared((x) => x.sockPairs || 0);
  let shellBudget = declared((x) => x.pantShells || 0);

  // Home/away sock ticks are budgeted per set against what this batch has
  // already placed, same as the table does for a hand-added row.
  const ticks = () => nextHomeAwayClaims(order.sets, roster);

  const takeJersey = () => jerseyBudget-- > 0;
  const takeSocks = () => sockBudget-- > 0;
  const takeShells = () => shellBudget-- > 0;

  if (submission.players.length) {
    const fromFile = submission.convertedFrom?.fileName ?? '';
    const plan = planNewRoster(order, existingRoster, {
      source: 'submission',
      fileName: fromFile,
      fileUrl: submission.convertedFrom?.fileUrl ?? '',
      submissionId: submission.id,
      note: fromFile
        ? `Sent by the team (revision ${submission.revision}), converted from ${fromFile} and checked by them`
        : `Sent by the team (revision ${submission.revision})`,
    }, { newId: newId(), now });
    newRoster = plan.version;
    orderPatch.rosters = plan.rosters;
    orderPatch.activeRosterId = plan.activeRosterId;
    orderPatch.rosterNumbersUsed = plan.numbersUsed;
  }

  for (const p of submission.players) {
    roster.push({
      id: newId(),
      orderId: order.id,
      playerNameAsPrinted: p.playerNameAsPrinted,
      number: p.number,
      isGoalie: p.isGoalie,
      captaincy: p.captaincy || '',
      sockOnly: p.sockOnly,
      // The client form doesn't ask; Keenan ticks it on his side.
      noName: false,
      jerseySize: p.jerseySize,
      sockSize: p.sockSize,
      pantShellSize: p.pantShellSize ?? '',
      /*
       * Accepting a submission must respect what was ordered, same as adding a
       * row by hand does.
       *
       * `socksPerPlayer: 1` used to be unconditional, so accepting fifteen
       * players onto an order with twelve pairs of socks assigned fifteen —
       * and an order with no socks at all assigned a pair to everyone. The
       * running claim is tracked across the batch so the first twelve take a
       * pair and the rest take none.
       */
      jerseysPerPlayer: p.sockOnly ? 0 : takeJersey() ? 1 : 0,
      socksPerPlayer: takeSocks() ? 1 : 0,
      shellsPerPlayer: takeShells() ? 1 : 0,
      // In home/away mode a submitted player is assumed to get one of each;
      // Keenan can un-tick in the roster table. Same per-set rule as a row
      // added in the table: ticked while that set still has quantity.
      homeJersey: homeAway && !p.sockOnly ? 1 : 0,
      awayJersey: homeAway && !p.sockOnly ? 1 : 0,
      homeSocks: homeAway && orderIncludesSocks(order) && ticks().homeSocks ? 1 : 0,
      awaySocks: homeAway && orderIncludesSocks(order) && ticks().awaySocks ? 1 : 0,
      armNumbers: '', shoulderLogo: '', pantLogo: '', pantNumber: '',
      notes: p.notes,
      sortOrder: sortOrder++,
      fromSubmissionId: submission.id,
      rosterId: newRoster?.id ?? '',
    });
  }
  if (newRoster) {
    parts.push(`${submission.players.length} player(s) as ${rosterLabel(newRoster)}, now in use (the previous roster is kept)`);
  }
  // A roster file that wasn't converted is never merged: nobody's name goes on
  // a jersey off a file nobody checked. It stays on the submission and under
  // Player Roster on the order page, where Keenan can import it.
  if (submission.rosterFiles?.length) {
    parts.push(`${submission.rosterFiles.length} roster file(s) kept for importing`);
  }

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

  // Appended, never overwritten — Keenan's own notes on the order stay, and a
  // second submission with the same colours doesn't repeat itself.
  if (submission.colours && !(order.designReferenceNotes || '').includes(`Team colours: ${submission.colours}`)) {
    orderPatch.designReferenceNotes = [order.designReferenceNotes, `Team colours: ${submission.colours}`]
      .filter(Boolean)
      .join('\n');
    parts.push('team colours added to design notes');
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
    newRoster,
    assets,
    orderPatch,
    summary: `Accepted client submission: ${parts.length ? parts.join('; ') : 'nothing to add'}`,
  };
}

/* ------------------------------------------------------------------ *
 * AI readings of a team's roster file
 * ------------------------------------------------------------------ */

/**
 * How many times a day a team's form may have its roster file read by AI.
 *
 * The form is public (the roster link is the only credential) and a reading
 * costs money, so a stuck refresh loop or a curious forward can't run it up.
 * Six is far more than a real team needs: one upload, maybe a corrected one.
 * Keenan's own imports don't count.
 */
export const ROSTER_READS_PER_DAY = 6;

export function planRosterRead(reads: string[], now: string): { allowed: boolean; reads: string[] } {
  const cutoff = Date.parse(now) - 24 * 60 * 60 * 1000;
  const recent = (reads ?? []).filter((x) => Date.parse(x) > cutoff);
  if (recent.length >= ROSTER_READS_PER_DAY) return { allowed: false, reads: reads ?? [] };
  return { allowed: true, reads: [...recent, now].slice(-20) };
}

/* ------------------------------------------------------------------ *
 * The customer's view
 * ------------------------------------------------------------------ */

/**
 * The build sheet — the part of an order the customer and the factory both
 * read. See BuildSheet in repository.ts.
 *
 * Built field-by-field, never by spreading the order.
 *
 * That is the whole point: a field added to Order tomorrow does not appear on
 * anyone's sheet because someone forgot to exclude it. Adding something here
 * has to be a deliberate act — and it lands on BOTH sheets, which is what a
 * build detail should do. Money, keepers and factory notes are never here;
 * they go on exactly the view that is allowed to carry them.
 *
 * Contact and shipping ARE included — the customer needs to check their own
 * address before anything ships, and the factory ships to it.
 */
export function buildSheetOf(o: Order, roster: RosterEntry[]): BuildSheet {
  return {
    teamName: o.teamName,
    invoiceNumber: o.invoiceNumber,
    status: o.status,
    estimatedFinishDate: o.estimatedFinishDate,
    productionStartDate: o.productionStartDate,
    productionFinishDate: o.productionFinishDate,
    deliveryConcern: o.deliveryConcern,
    trackingCode: o.trackingCode,
    orderMode: o.orderMode,
    numberOfSets: o.numberOfSets,
    sets: o.sets,
    jerseyTier: o.jerseyTier,
    isSample: o.isSample,
    jerseyType: o.jerseyType,
    sockType: o.sockType,
    multiPanelSocks: o.multiPanelSocks,
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
      goaliePantReversedLogos: o.goaliePantReversedLogos,
      lacesStyle: o.lacesStyle,
      shoulderCut: o.shoulderCut,
      stitchedShoulderTrim: o.stitchedShoulderTrim,
      nameStyle: o.nameStyle,
      hasCaptainPatches: o.hasCaptainPatches,
      hasShoulderLogos: o.hasShoulderLogos,
    },
    captainPatchStyle: o.captainPatchStyle,
    captainCQuantity: o.captainCQuantity,
    captainAQuantity: o.captainAQuantity,
    captainAwayCQuantity: o.captainAwayCQuantity ?? 0,
    captainAwayAQuantity: o.captainAwayAQuantity ?? 0,
    shoulderLogosSame: o.shoulderLogosSame,
    roster: [...roster].sort((a, b) => a.sortOrder - b.sortOrder),
    // Spares are on both sheets — they're part of what's being made, and a
    // team checking an order should see the numbers going on them. Keepers
    // are NOT: see factoryViewOf.
    extraJerseyDetails: o.extraJerseyDetails ?? [],
    approvedBy: o.approvedBy,
    approvedDate: o.approvedDate,
    brandingNotes: o.brandingNotes ?? '',
    customBranding: Boolean(o.customBranding),
    customBrandingItems: o.customBranding ? (o.customBrandingItems ?? []).map((i) => ({ id: i.id, name: i.name, notes: i.notes })) : [],
    // Deliberately empty here: who may read a comment depends on the sheet,
    // so publicViewOf and factoryViewOf each fill in their own.
    sectionComments: [],
    specialNotes: o.specialNotes,
    captainPatchNotes: o.captainPatchNotes,
    designReferenceNotes: o.designReferenceNotes,
    collarReferenceNotes: o.collarReferenceNotes,
    mainCrestNotes: o.mainCrestNotes,
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
 * The customer's view: the build sheet plus what their own page needs. The
 * spread here is of `buildSheetOf`'s deliberate list, never of the order.
 */
export function publicViewOf(
  o: Order,
  roster: RosterEntry[],
  assets: OrderAsset[],
  history: ChangeLogEntry[] = [],
  submissions: ClientRosterSubmission[] = [],
): PublicOrderView {
  const reminder = clientFormReminder(o);
  return {
    ...buildSheetOf(o, roster),
    // The customer reads only what Keenan marked for everyone.
    sectionComments: sheetComments(o, ['everyone']),
    orderId: o.id,
    datePaid: o.datePaid,
    googleDriveLink: o.googleDriveLink,
    // The font file is a licensed asset, not something the customer ordered.
    assets: assets.filter((a) => a.role !== 'font'),
    requestApproval: approvalOpen(o),
    approvalRecord: o.approvalRecord,
    // No stage URLs here: the /share sheet is circulated widely, and a stage
    // page URL is built from the roster token — the write credential. See
    // rosterLinkView, which is the one place that link belongs.
    timeline: timelineOf(o, history),
    // What the team's form still takes, and whether to remind them of it.
    // See clientFormReminder: after production only a missing address nags.
    clientFormOpen: reminder.open,
    clientFormSections: reminder.sections,
    pendingContact: pendingContactOf(submissions),
  };
}

/**
 * The newest contact details the customer sent that aren't on the order yet:
 * from the newest submission that carried any, if Keenan hasn't accepted it.
 */
export function pendingContactOf(submissions: ClientRosterSubmission[]): SubmittedContact | null {
  const newest = [...submissions]
    .filter((s) => s.sections?.personalDetails && s.contact)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
  return newest && !newest.acceptedAt ? newest.contact ?? null : null;
}

/**
 * Can the shipping details still be sent from the share sheet? Until the order
 * ships, whether or not the team's form link is switched on — but only while
 * the order is missing something the box needs (or they've sent details that
 * are waiting, and may want to fix them). A complete address is changed by
 * telling Keenan, as it always was.
 */
export function shareDetailsOpen(
  status: OrderStatus,
  /** The order's contact as the sheet shows it. */
  onOrder: SubmittedContact,
  pending: SubmittedContact | null,
): boolean {
  return !clientDetailsLocked(status) && (!contactComplete(onOrder) || Boolean(pending));
}

/**
 * The factory's view: the build sheet plus the factory's own business. Same
 * rule as above — the only spread is of the deliberate build-sheet list.
 *
 * Keepers travel here and nowhere public: they're Powerplay's jerseys, made
 * on this run and held at the facility, and the team never hears about them.
 * The font comes along because the factory prints the names. No money, no
 * payment date, no signature record, no timeline — none of it is the
 * factory's to see.
 */
export function factoryViewOf(o: Order, roster: RosterEntry[], assets: OrderAsset[]): FactoryOrderView {
  return {
    ...buildSheetOf(o, roster),
    // The factory reads "everyone" and "factory only"; "just me" stays Keenan's.
    sectionComments: sheetComments(o, ['everyone', 'factory']),
    assets,
    factoryNotes: o.factoryNotes ?? '',
    keeperJerseys: o.keeperJerseys ?? [],
    sentToFactoryAt: o.sentToFactoryAt ?? null,
    rosterLocked: clientEditingLocked(o.status),
  };
}

/* ------------------------------------------------------------------ *
 * Section comments
 * ------------------------------------------------------------------ */

const SECTION_ORDER = Object.keys(COMMENT_SECTIONS) as CommentSection[];

/**
 * The comments a sheet carries, for the audiences it may show — in the
 * order of the form, empty ones left out.
 */
export function sheetComments(o: Pick<Order, 'sectionComments'>, audiences: CommentAudience[]): SheetComment[] {
  const all = o.sectionComments ?? {};
  return SECTION_ORDER.flatMap((section) => {
    const c = all[section];
    return c && c.text.trim() && audiences.includes(c.audience) ? [{ section, text: c.text.trim() }] : [];
  });
}

/**
 * What saveOrder keeps of the form's comments: known sections only, a known
 * audience (anything else becomes "just me" — never published by accident),
 * text capped. An empty comment is kept while it's being typed; the sheets
 * skip it.
 */
export function cleanSectionComments(v: unknown): Partial<Record<CommentSection, SectionComment>> {
  const out: Partial<Record<CommentSection, SectionComment>> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, c] of Object.entries(v as Record<string, unknown>)) {
    if (!(k in COMMENT_SECTIONS) || !c || typeof c !== 'object') continue;
    const { text, audience } = c as { text?: unknown; audience?: unknown };
    out[k as CommentSection] = {
      text: typeof text === 'string' ? text.slice(0, 4000) : '',
      audience: COMMENT_AUDIENCES.includes(audience as CommentAudience) ? (audience as CommentAudience) : 'internal',
    };
  }
  return out;
}

/**
 * Can the customer still change what's being MADE — the roster, the logos,
 * the inspiration?
 *
 * Yes right up until the jerseys are being made, and never after. Once a
 * roster is at the manufacturer, a size changed on a form is not a correction
 * — it's a discrepancy between what the customer believes they ordered and
 * what is being sewn, and nobody finds out until the box arrives.
 *
 * The contact and shipping details are NOT part of this lock: they're how
 * the jerseys reach the team, not what's sewn, and they stay open until the
 * box ships. See openClientSections — that, not this, is what decides what
 * the customer's form takes.
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

/**
 * Has the box gone? From Shipped on, the delivery address is history: a new
 * one typed into the form would change nothing, while telling the customer
 * it had. Same STATUS_META reading as clientEditingLocked.
 */
export function clientDetailsLocked(status: OrderStatus): boolean {
  return STATUS_META[status].order >= STATUS_META.shipped.order;
}

const CLIENT_SECTION_KEYS: ReadonlyArray<keyof ClientLinkSections> = ['logos', 'inspiration', 'roster', 'personalDetails'];

export const NO_CLIENT_SECTIONS: Readonly<ClientLinkSections> = Object.freeze({
  logos: false, inspiration: false, roster: false, personalDetails: false,
});

export function anyClientSection(s: ClientLinkSections): boolean {
  return CLIENT_SECTION_KEYS.some((k) => s[k]);
}

/**
 * Which of the asked-for sections the customer can still send, given where
 * the order is. The one rule every customer page, the submit action and both
 * stores go by.
 *
 *  before production      everything asked for
 *  in production → paid   the personal details only: the roster, logos and
 *                         inspiration are being made (clientEditingLocked),
 *                         but a team that never filled in where the box goes
 *                         has to be able to now — production finishing
 *                         before the address is in is normal (Keenan,
 *                         2026-10-16)
 *  shipped, completed     nothing
 *
 * `asked` is what the page asks for: the link's ticked sections, or a stage
 * page's own fixed set.
 */
export function openClientSections(asked: ClientLinkSections, status: OrderStatus): ClientLinkSections {
  if (!clientEditingLocked(status)) {
    return {
      logos: Boolean(asked.logos),
      inspiration: Boolean(asked.inspiration),
      roster: Boolean(asked.roster),
      personalDetails: Boolean(asked.personalDetails),
    };
  }
  return { ...NO_CLIENT_SECTIONS, personalDetails: Boolean(asked.personalDetails) && !clientDetailsLocked(status) };
}

/** The order's contact and shipping fields, in the shape the customer's form uses. */
export function contactOfOrder(
  o: Pick<Order, 'contactFirstName' | 'contactLastName' | 'contactEmail' | 'contactPhone' | 'shippingStreet' | 'shippingSecondary' | 'shippingCity' | 'shippingProvince' | 'shippingPostal'>,
): SubmittedContact {
  return {
    firstName: o.contactFirstName ?? '',
    lastName: o.contactLastName ?? '',
    email: o.contactEmail ?? '',
    phone: o.contactPhone ?? '',
    street: o.shippingStreet ?? '',
    secondary: o.shippingSecondary ?? '',
    city: o.shippingCity ?? '',
    province: o.shippingProvince ?? '',
    postal: o.shippingPostal ?? '',
  };
}

/**
 * Is there everything the box needs to ship? A name, a phone and the full
 * street address — what goes on the label (formattedAddress in order-utils).
 * The unit line is optional; the email isn't a shipping detail.
 */
export function contactComplete(c: SubmittedContact | null | undefined): boolean {
  if (!c) return false;
  const has = (v: string | null | undefined) => Boolean((v ?? '').trim());
  return (
    (has(c.firstName) || has(c.lastName)) &&
    has(c.phone) && has(c.street) && has(c.city) && has(c.province) && has(c.postal)
  );
}

/** Is anything the box needs to ship missing from the order itself? */
export function shippingDetailsMissing(o: Parameters<typeof contactOfOrder>[0]): boolean {
  return !contactComplete(contactOfOrder(o));
}

/**
 * What a customer page asks for.
 *
 * The hub: what Keenan ticked. A stage page (`/design`, `/details`): its own
 * fixed sections before production, whatever the link is set to — that's the
 * page's job. From production on a stage page asks only for what the link
 * itself still asks for, so an old email's `/details` link doesn't ask for an
 * address Keenan has unticked because he already has it.
 */
export function pageAsks(
  linkSections: ClientLinkSections,
  status: OrderStatus,
  stageSections?: ClientLinkSections,
): ClientLinkSections {
  if (!stageSections) return { ...linkSections };
  if (!clientEditingLocked(status)) return { ...stageSections };
  return {
    logos: stageSections.logos && linkSections.logos,
    inspiration: stageSections.inspiration && linkSections.inspiration,
    roster: stageSections.roster && linkSections.roster,
    personalDetails: stageSections.personalDetails && linkSections.personalDetails,
  };
}

/**
 * The share sheet's "we still need a few things from you" box.
 *
 * Before production: whatever the team's form is open for, as it always was.
 * From production on only the contact and shipping details can still be open,
 * and the box shows only while the order is actually missing them — the
 * finalizing email ticks Personal Details on nearly every order, so without
 * that every finished order would ask for an address it already has.
 */
export function clientFormReminder(o: Order): { open: boolean; sections: ClientLinkSections } {
  const sections = o.requestClientDetails
    ? openClientSections(o.clientLinkSections ?? { ...DEFAULT_CLIENT_LINK_SECTIONS }, o.status)
    : { ...NO_CLIENT_SECTIONS };
  const open = anyClientSection(sections) && (!clientEditingLocked(o.status) || shippingDetailsMissing(o));
  return { open, sections };
}

export function rosterLinkView(o: Order, existingRosterCount: number, history: ChangeLogEntry[] = []): {
  orderId: string;
  teamName: string;
  enabled: boolean;
  status: OrderStatus;
  /**
   * True once the order is in production or beyond: the roster, logos and
   * inspiration can't change, and the roster/artwork upload routes refuse.
   * Not "the form is closed" — the contact and shipping details can still be
   * open. That's `open`.
   */
  locked: boolean;
  /** What Keenan ticked. */
  sections: ClientLinkSections;
  /**
   * What the form still takes: the ticked sections minus whatever the order
   * has moved past (openClientSections). All off when the link is switched
   * off. From production on, at most the personal details.
   */
  open: ClientLinkSections;
  /** Which website route made this order, for the customer page's wording. null = made by hand. */
  variant: RouteVariant | null;
  orderMode: Order['orderMode'];
  /** Whether to ask for sock / pant shell sizes at all. */
  includesSocks: boolean;
  includesPantShells: boolean;
  /**
   * How many PEOPLE are on the team — the number of roster slots the form
   * opens with. Not the jersey total: home/away doubles the jerseys and not
   * the squad. See rosterSlotCount.
   */
  jerseyCount: number;
  /** How many spares, and whatever numbers Keenan has already put on them. */
  extraJerseys: number;
  extraJerseyDetails: ExtraJersey[];
  /** Sign-off state, so the form can carry the same approval block. */
  requestApproval: boolean;
  approvedBy: string;
  approvedDate: CalendarDate | null;
  /** The signature itself, so a signed order looks signed on either link. */
  approvalRecord: ApprovalRecord | null;
  /** So the form can point at the full order for review before signing. */
  shareToken: string;
  existingRosterCount: number;
  timeline: TimelineStep[];
} {
  const sections = o.clientLinkSections ?? { ...DEFAULT_CLIENT_LINK_SECTIONS };
  return {
    orderId: o.id,
    teamName: o.teamName,
    // `enabled` stays "has Keenan switched the link on", so the two reasons a
    // form won't accept input remain distinguishable — the customer gets told
    // which one applies rather than one vague dead end.
    enabled: o.requestClientDetails,
    status: o.status,
    locked: clientEditingLocked(o.status),
    sections,
    open: o.requestClientDetails ? openClientSections(sections, o.status) : { ...NO_CLIENT_SECTIONS },
    variant: variantOf(o.enquiry?.startingPoint),
    orderMode: o.orderMode,
    includesSocks: orderIncludesSocks(o),
    includesPantShells: orderIncludesPantShells(o),
    // Roster jerseys only — extras are spares nobody's name goes on.
    jerseyCount: rosterSlotCount(o),
    // Spares are asked for separately: no name goes on them, but they still
    // need a number and a size before anyone can make them.
    extraJerseys: extraRowCount(o),
    extraJerseyDetails: o.extraJerseyDetails ?? [],
    // The same sign-off appears here as on the share page. A team that only
    // ever opens the form link would otherwise never be asked to approve.
    requestApproval: approvalOpen(o),
    approvedBy: o.approvedBy,
    approvedDate: o.approvedDate,
    approvalRecord: o.approvalRecord,
    shareToken: o.shareToken,
    existingRosterCount,
    // Only when the form link is actually open for editing — a locked order,
    // or one where the link was never switched on, has nowhere for a "fill
    // this in" link to send anyone.
    timeline: timelineOf(
      o,
      history,
      o.requestClientDetails && !clientEditingLocked(o.status) ? stageUrls(o.rosterToken) : undefined,
    ),
  };
}

/**
 * What the customer is told when nothing they could send is open any more.
 *
 * Hiding the form is not enough on its own: the page is public, the token is
 * the only credential, and a tab left open before production started will
 * happily POST afterwards. The check has to be at the write, and it has to be
 * in both backends — hence assertSectionsOpen, here next to the rule.
 */
export const CLIENT_LOCKED_MESSAGE =
  'This order is already in production, so it can no longer be changed here. ' +
  'Get in touch with Powerplay Customs if something is wrong.';

export const CLIENT_SHIPPED_MESSAGE =
  'This order has already shipped, so it can no longer be changed here. ' +
  'Get in touch with Powerplay Customs if something is wrong.';

/**
 * A form opened before production, sent after it, that still has something
 * open: refused rather than trimmed, and told how to send what's left.
 */
export const CLIENT_STALE_FORM_MESSAGE =
  "Your order has gone into production since this page was opened, so the roster and design can't change now. " +
  'Reload the page to send your contact and shipping details.';

export const CLIENT_NOT_COLLECTING_MESSAGE =
  "This link isn't collecting anything right now. Get in touch with Powerplay Customs if you were expecting to send something.";

export function clientLockedMessage(status: OrderStatus): string {
  return clientDetailsLocked(status) ? CLIENT_SHIPPED_MESSAGE : CLIENT_LOCKED_MESSAGE;
}

/** Thrown by both stores at the write; its message is written for the customer. */
export class ClientLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientLockedError';
  }
}

/** By name, not instanceof, so a second copy of this module can't hide one. */
export function isClientLockedError(e: unknown): e is ClientLockedError {
  return e instanceof Error && e.name === 'ClientLockedError';
}

/**
 * What a customer's submit may keep, decided before anything is cleaned.
 *
 *  asked  what the page asks for: the link's ticked sections, or a stage
 *         page's own fixed set
 *  shown  what the form on their screen showed, sent with the submit. A form
 *         from before this rule doesn't send it; it showed everything asked.
 *
 * Nothing open → refused with the reason. A section on their screen that no
 * order at this stage takes (the roster, logos or inspiration after
 * production) means the page was opened before production → refused, not
 * trimmed: keeping the address and quietly dropping a size change would tell
 * them both went through, and the size is what gets sewn. Otherwise → the
 * open sections their form showed. A section Keenan has unticked since they
 * opened the page is dropped, as it always was.
 */
export function submittableSections(
  asked: ClientLinkSections,
  status: OrderStatus,
  shown: unknown,
): { ok: true; sections: ClientLinkSections } | { ok: false; error: string } {
  const open = openClientSections(asked, status);
  if (!anyClientSection(open)) {
    return { ok: false, error: anyClientSection(asked) ? clientLockedMessage(status) : CLIENT_NOT_COLLECTING_MESSAGE };
  }
  const s = shown && typeof shown === 'object' ? (shown as Record<string, unknown>) : null;
  const onScreen: ClientLinkSections = s
    ? { logos: s.logos === true, inspiration: s.inspiration === true, roster: s.roster === true, personalDetails: s.personalDetails === true }
    : { ...asked };
  const possible = openClientSections({ logos: true, inspiration: true, roster: true, personalDetails: true }, status);
  if (CLIENT_SECTION_KEYS.some((k) => onScreen[k] && !possible[k])) {
    return { ok: false, error: CLIENT_STALE_FORM_MESSAGE };
  }
  return {
    ok: true,
    sections: {
      logos: open.logos && onScreen.logos,
      inspiration: open.inspiration && onScreen.inspiration,
      roster: open.roster && onScreen.roster,
      personalDetails: open.personalDetails && onScreen.personalDetails,
    },
  };
}

/**
 * The check at the write, in both stores: every section a submission carries
 * must still be open now. The submit action checked a moment ago; the status
 * can change in between.
 */
export function assertSectionsOpen(status: OrderStatus, sections: ClientLinkSections): void {
  const open = openClientSections(sections, status);
  if (CLIENT_SECTION_KEYS.every((k) => !sections[k] || open[k])) return;
  throw new ClientLockedError(anyClientSection(open) ? CLIENT_STALE_FORM_MESSAGE : clientLockedMessage(status));
}

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
