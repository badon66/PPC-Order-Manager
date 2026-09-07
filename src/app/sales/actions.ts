'use server';

import { revalidatePath } from 'next/cache';
import { repo } from '@/lib/data';
import { currentActor, requireRole } from '@/lib/auth';
import { newId } from '@/lib/order-utils';
import { today } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';
import type { CallLog, Contact } from '@/lib/types';
import { parseCallListFile } from '@/lib/sales/import';
import {
  applyCallLog, applySkip, referralContactFrom, validateCallLog, type CallLogInput,
} from '@/lib/data/sales-logic';

/*
 * Every mutation for /sales. Same shape as orders/actions.ts: requireRole,
 * actor, rules from sales-logic, repo, revalidate. Validation is two-tier —
 * blocking means nothing is saved; warnings are saved and returned.
 */

/** A spreadsheet is a few hundred KB. Far under Vercel's body cap; the artwork rule does not apply. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type UploadResult = { ok: true; listId: string } | { ok: false; error: string };

export async function uploadCallList(formData: FormData): Promise<UploadResult> {
  await requireRole('staff');
  const actor = await currentActor();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choose an .xlsx or .csv file' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'That file is over 5 MB — a call list should be far smaller' };
  const listName = String(formData.get('name') ?? '');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const listId = newId();
  const parsed = await parseCallListFile({
    fileName: file.name, bytes, listId, listName, createdBy: actor.name, now: new Date().toISOString(),
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  await repo.createCallList(parsed.list, parsed.contacts, actor);
  revalidatePath('/sales');
  return { ok: true, listId };
}

export type LogCallResult =
  | { ok: true; log: CallLog; contact: Contact; referral: Contact | null; warnings: Record<string, string> }
  | { ok: false; error: string; errors?: Record<string, string> };

/** Blank date inputs arrive as '' and must be stored as null — a generated date column rejects ''. */
function normaliseInput(input: CallLogInput): CallLogInput {
  return {
    ...input,
    followUp: { ...input.followUp, date: input.followUp.date ? input.followUp.date : null },
    leadRating: input.leadRating ? input.leadRating : null,
    durationSeconds: Math.max(0, Math.round(Number(input.durationSeconds) || 0)),
  };
}

export async function logCall(listId: string, contactId: string, raw: CallLogInput): Promise<LogCallResult> {
  await requireRole('staff');
  const actor = await currentActor();

  const contact = await repo.getContact(contactId);
  if (!contact || contact.listId !== listId) return { ok: false, error: 'Contact not found on this list' };

  const input = normaliseInput(raw);
  const { blocking, warnings } = validateCallLog(input, contact, { replacing: false });
  if (Object.keys(blocking).length) return { ok: false, error: 'Some fields need fixing', errors: blocking };

  const now = new Date().toISOString();
  const log: CallLog = { ...input, id: newId(), listId, contactId, callerName: input.callerName.trim() || actor.name, createdAt: now, updatedAt: now };
  const patch = applyCallLog(contact, log, today(BUSINESS_TIMEZONE), { replacing: false });
  const referral = log.outcome === 'referred' ? { ...referralContactFrom(contact, log, now), id: newId() } : null;

  await repo.addCallLog(log, patch, referral, actor);
  revalidatePath('/sales');
  revalidatePath(`/sales/${listId}`);
  return { ok: true, log, contact: { ...contact, ...patch }, referral, warnings };
}

/** Only a contact's most recent call can be edited (spec §6), and Do Not Call can't be undone this way. */
export async function updateCallLog(logId: string, contactId: string, raw: CallLogInput): Promise<LogCallResult> {
  await requireRole('staff');
  const actor = await currentActor();

  const contact = await repo.getContact(contactId);
  const existing = contact ? await repo.latestCallLogFor(contactId) : null;
  if (!existing || !contact) return { ok: false, error: 'Call not found' };
  if (existing.id !== logId) return { ok: false, error: 'Only the most recent call for a contact can be edited' };

  const input = normaliseInput(raw);
  const { blocking, warnings } = validateCallLog(input, contact, { replacing: true });
  if (Object.keys(blocking).length) return { ok: false, error: 'Some fields need fixing', errors: blocking };

  const log: CallLog = { ...existing, ...input, id: existing.id, listId: existing.listId, contactId: existing.contactId, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
  const patch = applyCallLog(contact, log, today(BUSINESS_TIMEZONE), { replacing: true });

  await repo.updateCallLog(log, patch, actor);
  revalidatePath('/sales');
  revalidatePath(`/sales/${existing.listId}`);
  return { ok: true, log, contact: { ...contact, ...patch }, referral: null, warnings };
}

export async function skipContact(listId: string, contactId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole('staff');
  const actor = await currentActor();
  const contact = await repo.getContact(contactId);
  if (!contact || contact.listId !== listId) return { ok: false, error: 'Contact not found on this list' };
  await repo.updateContact(contactId, applySkip(contact, new Date().toISOString()), actor);
  revalidatePath(`/sales/${listId}`);
  return { ok: true };
}

export async function deleteCallList(listId: string): Promise<void> {
  await requireRole('admin');
  const actor = await currentActor();
  await repo.softDeleteCallList(listId, actor);
  revalidatePath('/sales');
}
