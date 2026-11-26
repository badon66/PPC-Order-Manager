import type { ChangeLogEntry, Order } from '@/lib/types';
import { STATUS_META } from '@/lib/constants';
import { formatLong, isCalendarDate } from '@/lib/dates';
import { FACTORY_STEP_LABEL, isFactoryStep, type FactoryState } from './steps';

/**
 * "What's new from Powerplay" — Keenan's changes to a job, as the factory
 * sees them (Keenan, 2026-11-25: any change to an order already sent to the
 * factory is shown to them automatically).
 *
 * Built from the change log, through an ALLOWLIST. A field not named in
 * FACTORY_FIELDS is never described to the factory — so a money field
 * (orderValue, paymentsReceived, datePaid…), an internal note, or any field
 * added to the order later says nothing here until someone decides it should.
 * tests/factory/changes.test.ts holds that line.
 */

type Kind = 'text' | 'date' | 'flag' | 'choice' | 'list';

/** Order fields the factory is told about, with the words for them. Mirrors what the production sheet shows. */
export const FACTORY_FIELDS: Partial<Record<keyof Order, { label: string; kind: Kind }>> = {
  teamName: { label: 'Team name', kind: 'text' },
  invoiceNumber: { label: 'Job number', kind: 'text' },
  estimatedFinishDate: { label: 'Needed by', kind: 'date' },
  deliveryConcern: { label: 'Delivery notes', kind: 'text' },
  orderMode: { label: 'Order type', kind: 'choice' },
  numberOfSets: { label: 'Number of sets', kind: 'text' },
  sets: { label: 'Quantities', kind: 'list' },
  jerseyType: { label: 'Jersey type', kind: 'choice' },
  jerseyTier: { label: 'Jersey build', kind: 'choice' },
  sockType: { label: 'Sock type', kind: 'choice' },
  multiPanelSocks: { label: 'Multi-panel socks', kind: 'flag' },
  pantShellType: { label: 'Pant shell type', kind: 'choice' },
  isSample: { label: 'Sample order', kind: 'flag' },
  numberDetails: { label: 'Number details', kind: 'text' },
  nameStyle: { label: 'Name style', kind: 'choice' },
  dimpledShoulders: { label: 'Dimpled shoulders', kind: 'flag' },
  reinforcedElbows: { label: 'Reinforced elbows', kind: 'flag' },
  underarmVents: { label: 'Underarm vents', kind: 'flag' },
  frontCrest: { label: 'Front crest', kind: 'flag' },
  armNumbers: { label: 'Arm numbers', kind: 'flag' },
  printedSizingTag: { label: 'Printed size tag', kind: 'flag' },
  ppcBackBranding: { label: 'Powerplay back branding', kind: 'flag' },
  stopSignPatch: { label: 'Stop sign patch', kind: 'flag' },
  rubberizedPpcCrest: { label: 'Rubberized Powerplay crest', kind: 'flag' },
  stitchedSublimatedLogos: { label: 'Stitched-on logos', kind: 'flag' },
  twillBorderNumbers: { label: 'Double twill outlines', kind: 'flag' },
  pantLogo: { label: 'Pant logo', kind: 'flag' },
  pantNumber: { label: 'Pant number', kind: 'flag' },
  goaliePantReversedLogos: { label: 'Goalie pant reversed logos', kind: 'flag' },
  lacesStyle: { label: 'Laces', kind: 'choice' },
  shoulderCut: { label: 'Shoulder cut', kind: 'choice' },
  stitchedShoulderTrim: { label: 'Stitched shoulder trim', kind: 'flag' },
  hasCaptainPatches: { label: 'Captain patches', kind: 'flag' },
  hasShoulderLogos: { label: 'Shoulder logos', kind: 'flag' },
  shoulderLogosSame: { label: 'Same logo on both shoulders', kind: 'flag' },
  captainPatchStyle: { label: 'Captain patch style', kind: 'choice' },
  captainCQuantity: { label: "Captain C's", kind: 'text' },
  captainAQuantity: { label: "Alternate A's", kind: 'text' },
  captainAwayCQuantity: { label: "Away captain C's", kind: 'text' },
  captainAwayAQuantity: { label: "Away alternate A's", kind: 'text' },
  captainPatchNotes: { label: 'Captain patch notes', kind: 'text' },
  extraJerseyDetails: { label: 'Spare jerseys', kind: 'list' },
  keeperJerseys: { label: 'Jerseys kept for Powerplay', kind: 'list' },
  brandingNotes: { label: 'Branding notes', kind: 'text' },
  customBranding: { label: 'Custom branding', kind: 'flag' },
  customBrandingItems: { label: 'Custom branding logos', kind: 'list' },
  specialNotes: { label: 'Order notes', kind: 'text' },
  factoryNotes: { label: 'Notes for the factory', kind: 'text' },
  designReferenceNotes: { label: 'Design reference notes', kind: 'text' },
  collarReferenceNotes: { label: 'Collar notes', kind: 'text' },
  mainCrestNotes: { label: 'Main crest notes', kind: 'text' },
  trackingCode: { label: 'Tracking number', kind: 'text' },
  productionStartDate: { label: 'Production start', kind: 'date' },
  productionFinishDate: { label: 'Production finished', kind: 'date' },
  contactFirstName: { label: 'Ship-to first name', kind: 'text' },
  contactLastName: { label: 'Ship-to last name', kind: 'text' },
  contactPhone: { label: 'Ship-to phone', kind: 'text' },
  shippingStreet: { label: 'Ship-to street', kind: 'text' },
  shippingSecondary: { label: 'Ship-to unit', kind: 'text' },
  shippingCity: { label: 'Ship-to city', kind: 'text' },
  shippingProvince: { label: 'Ship-to province / state', kind: 'text' },
  shippingPostal: { label: 'Ship-to postal code', kind: 'text' },
};

const pretty = (v: string) => v.replace(/_/g, ' ');
const clip = (v: string, n = 80) => (v.length > n ? `${v.slice(0, n)}…` : v);

function show(kind: Kind, raw: string | null | undefined): string {
  const v = (raw ?? '').trim();
  if (kind === 'flag') return v === 'true' ? 'on' : 'off';
  if (!v || v === 'null') return 'blank';
  if (kind === 'date') return isCalendarDate(v) ? formatLong(v) : v;
  if (kind === 'choice') return pretty(v);
  return `“${clip(v)}”`;
}

export interface FactoryChange {
  id: string;
  orderId: string;
  at: string;
  text: string;
}

/** One history entry in the factory's words, or null when it isn't theirs to see. */
export function describeChange(h: ChangeLogEntry): string | null {
  switch (h.action) {
    case 'field_changed': {
      const def = h.field ? FACTORY_FIELDS[h.field as keyof Order] : undefined;
      if (!def) return null;
      if (def.kind === 'list') return `${def.label} changed — check the sheet`;
      if (def.kind === 'flag') return `${def.label} turned ${show('flag', h.toValue)}`;
      return `${def.label}: ${show(def.kind, h.fromValue)} → ${show(def.kind, h.toValue)}`;
    }
    case 'status_changed': {
      const to = h.toValue as keyof typeof STATUS_META | undefined;
      return to && STATUS_META[to] ? `Order status is now ${STATUS_META[to].label}` : null;
    }
    case 'roster_changed':
      // The roster's own summary names players, numbers and sizes — all on the sheet already.
      return h.summary ? clip(h.summary, 200) : 'Roster changed';
    case 'asset_added':
    case 'asset_removed':
    case 'asset_rotated':
      // Finished-jersey photos are the factory's own; a customer-facing photo change is still artwork.
      return h.summary ? clip(h.summary, 160) : 'Artwork changed';
    case 'factory_step_approved':
      return isFactoryStep(h.toValue) ? `Powerplay approved ${FACTORY_STEP_LABEL[h.toValue]}` : null;
    case 'factory_step_declined':
      return isFactoryStep(h.toValue)
        ? `Powerplay did not approve ${FACTORY_STEP_LABEL[h.toValue]}${h.fromValue ? `: “${clip(h.fromValue, 160)}”` : ''}`
        : null;
    default:
      return null;
  }
}

/** The history actions the factory's feed is built from — what to ask the store for. */
export const FEED_ACTIONS = [
  'field_changed', 'status_changed', 'roster_changed', 'asset_added', 'asset_removed', 'asset_rotated',
  'factory_step_approved', 'factory_step_declined',
] as const;

/**
 * When a job became the factory's: the day it was sent, as the start of that
 * day; with no sent date, the moment it reached In Production; failing both,
 * the beginning of time (an old order already past production).
 */
export function sentInstant(o: Pick<Order, 'sentToFactoryAt'>, history: ChangeLogEntry[]): string {
  const day = (o.sentToFactoryAt ?? '').trim();
  if (day) return `${day}T00:00:00.000Z`;
  const reached = history
    .filter((h) => h.action === 'status_changed' && h.toValue === 'in_production')
    .sort((a, b) => a.at.localeCompare(b.at))[0];
  return reached?.at ?? '';
}

/**
 * Keenan's changes to one job since it was sent, newest first, each marked
 * new when it's after the factory last opened the job.
 */
export function changesFor(
  o: Pick<Order, 'id' | 'sentToFactoryAt'>,
  history: ChangeLogEntry[],
  state: Pick<FactoryState, 'seenAt'>,
): Array<FactoryChange & { isNew: boolean }> {
  const since = sentInstant(o, history);
  const out: Array<FactoryChange & { isNew: boolean }> = [];
  for (const h of history) {
    if (h.orderId !== o.id || h.at < since) continue;
    const text = describeChange(h);
    if (text === null) continue;
    out.push({ id: h.id, orderId: o.id, at: h.at, text, isNew: !state.seenAt || h.at > state.seenAt });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
