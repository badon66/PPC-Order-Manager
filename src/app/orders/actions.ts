'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { repo } from '@/lib/data';
import { currentActor, requireRole } from '@/lib/auth';
import { isCalendarDate } from '@/lib/dates';
import { ORDER_STATUSES } from '@/lib/types';
import type { Order, OrderAsset, OrderStatus, RosterEntry, ViewableAsset } from '@/lib/types';
import { setsForMode } from '@/lib/order-utils';
import { resolveFileUrl } from '@/lib/storage';

/**
 * Every mutation goes through a server action. Authorization is checked here,
 * server-side, on every call — never in the browser.
 */

export type SaveResult = { ok: true } | { ok: false; error: string };

/* ------------------------------------------------------------------ *
 * Operational fields (order detail page)
 * ------------------------------------------------------------------ */

export async function updateOperationalFields(
  orderId: string,
  patch: {
    status?: string;
    estimatedFinishDate?: string;
    productionStartDate?: string;
    productionFinishDate?: string;
    trackingCode?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  await requireRole('staff');
  const actor = await currentActor();

  const clean: Record<string, unknown> = {};

  if (patch.status !== undefined) {
    if (!(ORDER_STATUSES as readonly string[]).includes(patch.status)) {
      return { ok: false, error: 'Unknown status' };
    }
    clean.status = patch.status as OrderStatus;
  }

  for (const field of ['estimatedFinishDate', 'productionStartDate', 'productionFinishDate'] as const) {
    const raw = patch[field];
    if (raw === undefined) continue;
    const v = raw.trim();
    if (v && !isCalendarDate(v)) return { ok: false, error: 'Date must be YYYY-MM-DD' };
    clean[field] = v || null;
  }

  if (patch.trackingCode !== undefined) clean.trackingCode = patch.trackingCode.trim();

  await repo.updateOrder(orderId, clean, actor);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath('/orders');
  revalidatePath('/queue');
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Order form
 * ------------------------------------------------------------------ */

/**
 * A new order is a real draft row the moment you click New Order, so the form
 * has a URL from the first keystroke.
 *
 * The old Base44 app rendered New Order inline on the list page with no URL
 * change — one accidental refresh destroyed everything typed.
 */
export async function createDraftOrder(): Promise<string> {
  await requireRole('staff');
  const actor = await currentActor();
  const order = await repo.createOrder({ status: 'draft' }, actor);
  // No revalidatePath here: the caller redirects straight to the editor, and
  // every list page is force-dynamic, so there's no cache to bust anyway.
  return order.id;
}

/**
 * What the New Order button submits.
 *
 * Deliberately a POST action rather than a link to a GET route handler: Next
 * prefetches links, and prefetching a handler that creates rows produced blank
 * phantom orders just from loading the list page.
 */
export async function startNewOrder(): Promise<never> {
  const id = await createDraftOrder();
  redirect(`/orders/${id}/edit?start=1`);
}

// Blank date inputs arrive as '' and must be stored as null, or a generated
// date column rejects the row. Keep new date fields on this list too.
const DATE_FIELDS = [
  'datePaid', 'approvedDate', 'estimatedFinishDate',
  'productionStartDate', 'productionFinishDate',
] as const;

/** Fields the form is allowed to write. Anything else is ignored. */
const EDITABLE: ReadonlyArray<keyof Order> = [
  'teamName', 'invoiceNumber', 'datePaid', 'googleDriveLink', 'status',
  'estimatedFinishDate', 'trackingCode', 'isSample',
  'contactFirstName', 'contactLastName', 'contactEmail', 'contactPhone',
  'shippingStreet', 'shippingSecondary', 'shippingCity', 'shippingProvince',
  'shippingPostal', 'requestClientDetails', 'clientLinkSections',
  'orderMode', 'numberOfSets', 'sets', 'playersTotal',
  'jerseyType', 'sockType', 'pantShellType', 'numberDetails',
  'dimpledShoulders', 'reinforcedElbows', 'underarmVents', 'frontCrest',
  'armNumbers', 'printedSizingTag', 'ppcBackBranding', 'stopSignPatch',
  'rubberizedPpcCrest', 'stitchedSublimatedLogos', 'twillBorderNumbers',
  'jerseyTier',
  'pantLogo', 'pantNumber', 'lacesStyle', 'shoulderCut', 'nameStyle',
  'hasCaptainPatches', 'captainPatchStyle', 'captainCQuantity', 'captainAQuantity',
  'captainPatchNotes', 'hasShoulderLogos', 'shoulderLogosSame',
  'designReferenceNotes', 'collarReferenceNotes', 'mainCrestNotes',
  'specialNotes', 'approvedBy', 'approvedDate', 'deliveryConcern',
  /*
   * Added later, and every one of them was silently unsaveable until it was
   * listed here.
   *
   * That's the failure mode of an allowlist: a new field on Order type-checks
   * everywhere, renders in the form, updates on screen, and is dropped on the
   * way to the database. The approval toggle looked like it did nothing for
   * exactly this reason. If you add a field to Order that the form edits, add
   * it here in the same commit.
   *
   * approvalRecord is deliberately NOT here — it's written only by the
   * customer's sign-off action, never by this form, so that a signature can't
   * be edited after the fact.
   */
  'productionStartDate', 'productionFinishDate',
  'extraJerseyDetails', 'requestApproval',
];

/**
 * Two tiers, and the distinction matters.
 *
 * BLOCKING = a value that would corrupt the record if stored (a malformed date).
 * WARNING  = a value worth flagging but perfectly storable (a reused invoice
 *            number, a link missing its protocol).
 *
 * Everything used to be blocking, which meant one duplicate invoice number
 * silently discarded every other edit in the same autosave — you'd type a team
 * name, look away, and lose it. Never throw away the user's typing to enforce a
 * soft rule.
 */
export interface OrderValidation {
  blocking: Record<string, string>;
  warnings: Record<string, string>;
}

export async function validateOrderPatch(patch: Partial<Order>): Promise<OrderValidation> {
  const blocking: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  for (const f of DATE_FIELDS) {
    const v = patch[f];
    if (v !== undefined && v !== null && v !== '' && !isCalendarDate(v as string)) {
      blocking[f] = 'Use a valid date';
    }
  }

  if (patch.invoiceNumber) {
    const existing = await repo.listOrders({ status: 'all', includeCompleted: true });
    const clash = existing.find(
      (o) => o.invoiceNumber && o.invoiceNumber === patch.invoiceNumber && o.id !== (patch as Order).id,
    );
    if (clash) warnings.invoiceNumber = `Already used by ${clash.teamName || 'another order'}`;
  }

  if (patch.googleDriveLink && !/^https?:\/\//i.test(patch.googleDriveLink)) {
    warnings.googleDriveLink = 'Should start with http:// or https://';
  }

  return { blocking, warnings };
}

export async function saveOrder(
  orderId: string,
  patch: Partial<Order>,
): Promise<SaveResult & { errors?: Record<string, string>; warnings?: Record<string, string> }> {
  await requireRole('staff');
  const actor = await currentActor();

  const clean: Partial<Order> = {};
  for (const key of EDITABLE) {
    if (key in patch) (clean as Record<string, unknown>)[key] = patch[key];
  }

  // Empty date strings are null, not "".
  for (const f of DATE_FIELDS) {
    if (clean[f] !== undefined && !clean[f]) (clean as Record<string, unknown>)[f] = null;
  }

  const { blocking, warnings } = await validateOrderPatch({
    ...clean,
    id: orderId,
  } as Partial<Order>);

  // Drop only the fields that would corrupt the record. Save everything else.
  for (const field of Object.keys(blocking)) {
    delete (clean as Record<string, unknown>)[field];
  }

  // Keep the set blocks consistent with the chosen mode.
  if (clean.orderMode) {
    clean.sets = setsForMode(clean.orderMode, clean.numberOfSets ?? 1, clean.sets ?? []);
  }

  await repo.updateOrder(orderId, clean, actor);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath('/orders');
  revalidatePath('/queue');

  return Object.keys(blocking).length > 0
    ? { ok: false, error: 'Some fields need fixing', errors: blocking, warnings }
    : { ok: true, warnings };
}

export async function saveRoster(orderId: string, entries: RosterEntry[]): Promise<SaveResult> {
  await requireRole('staff');
  const actor = await currentActor();
  await repo.replaceRoster(orderId, entries, actor);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath('/orders');
  return { ok: true };
}

export async function attachAsset(asset: Omit<OrderAsset, 'id'>): Promise<ViewableAsset> {
  await requireRole('staff');
  const actor = await currentActor();
  const created = await repo.addAsset(asset, actor);
  revalidatePath(`/orders/${asset.orderId}`);
  // Signed here so the form can show the thumbnail straight away without a
  // round trip through the page. `viewUrl` is display-only and never stored.
  return { ...created, viewUrl: await resolveFileUrl(created.fileUrl) };
}

/**
 * Name and notes live on each asset row, so a logo group with two files carries
 * the same label on both. Updating the group updates every file in it.
 */
export async function renameAssetGroup(
  orderId: string,
  groupId: string,
  patch: { displayName?: string; notes?: string },
): Promise<SaveResult> {
  await requireRole('staff');
  const actor = await currentActor();
  const bundle = await repo.getOrder(orderId);
  if (!bundle) return { ok: false, error: 'Order not found' };

  for (const a of bundle.assets.filter((x) => x.groupId === groupId)) {
    await repo.removeAsset(a.id, actor);
    await repo.addAsset(
      {
        orderId: a.orderId,
        role: a.role,
        slot: a.slot,
        fileUrl: a.fileUrl,
        fileName: a.fileName,
        displayName: patch.displayName ?? a.displayName,
        notes: patch.notes ?? a.notes,
        groupId: a.groupId,
      },
      actor,
    );
  }
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export async function detachAsset(assetId: string, orderId: string): Promise<SaveResult> {
  await requireRole('staff');
  const actor = await currentActor();
  await repo.removeAsset(assetId, actor);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Other
 * ------------------------------------------------------------------ */

export async function acceptClientSubmission(submissionId: string, orderId: string) {
  await requireRole('staff');
  const actor = await currentActor();
  await repo.acceptSubmission(submissionId, actor);
  revalidatePath(`/orders/${orderId}`);
}

export async function deleteOrder(orderId: string) {
  await requireRole('admin');
  const actor = await currentActor();
  await repo.softDeleteOrder(orderId, actor);
  revalidatePath('/orders');
}
