'use server';

import { revalidatePath } from 'next/cache';
import { repo, type ContactPatch } from '@/lib/data';
import { currentActor, requireRole } from '@/lib/auth';
import { newId } from '@/lib/order-utils';
import { today } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';
import type { CallLog, CallSession, Contact } from '@/lib/types';
import { parseCallListFile } from '@/lib/sales/import';
import {
  applyCallLog, applySkip, blankCallSession, linkedContacts, planJerseyManager, referralContactFrom,
  sessionEnd, validateCallLog, type CallLogInput,
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
  | {
      ok: true;
      log: CallLog;
      contact: Contact;
      /** A new row created by this call — a referral or a newly named jersey manager. */
      referral: Contact | null;
      /** Flag changes on other contacts of the same team. */
      others: ContactPatch[];
      warnings: Record<string, string>;
    }
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

  const bundle = await repo.getCallList(listId);
  const contact = bundle?.contacts.find((c) => c.id === contactId) ?? null;
  if (!bundle || !contact) return { ok: false, error: 'Contact not found on this list' };
  const linked = linkedContacts(contact, bundle.contacts);

  const input = normaliseInput(raw);
  const { blocking, warnings } = validateCallLog(input, contact, {
    replacing: false,
    linkedIds: linked.map((c) => c.id),
    sessionIds: bundle.sessions.map((s) => s.id),
  });
  if (Object.keys(blocking).length) return { ok: false, error: 'Some fields need fixing', errors: blocking };

  const now = new Date().toISOString();
  const log: CallLog = { ...input, id: newId(), listId, contactId, callerName: input.callerName.trim() || actor.name, createdAt: now, updatedAt: now };
  const plan = planJerseyManager(contact, linked, log, now);
  const patch = { ...applyCallLog(contact, log, today(BUSINESS_TIMEZONE), { replacing: false }), ...plan.currentPatch };
  // A newly named jersey manager takes precedence over a plain referral; the referral stays on the log either way.
  const named = plan.newContact ?? (log.outcome === 'referred' ? referralContactFrom(contact, log, now) : null);
  const newContact = named ? { ...named, id: newId() } : null;

  await repo.addCallLog(log, patch, newContact, actor, plan.otherPatches);
  revalidatePath('/sales');
  revalidatePath(`/sales/${listId}`);
  return { ok: true, log, contact: { ...contact, ...patch }, referral: newContact, others: plan.otherPatches, warnings };
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

  // An edit keeps the session it was made in and never re-plans the jersey manager (that already happened).
  const log: CallLog = {
    ...existing, ...input, id: existing.id, listId: existing.listId, contactId: existing.contactId,
    sessionId: existing.sessionId, jerseyManager: existing.jerseyManager, createdAt: existing.createdAt, updatedAt: new Date().toISOString(),
  };
  const patch = applyCallLog(contact, log, today(BUSINESS_TIMEZONE), { replacing: true });

  await repo.updateCallLog(log, patch, actor);
  revalidatePath('/sales');
  revalidatePath(`/sales/${existing.listId}`);
  return { ok: true, log, contact: { ...contact, ...patch }, referral: null, others: [], warnings };
}

/* ------------------------------------------------------------------ *
 * Calling sessions
 * ------------------------------------------------------------------ */

export type SessionResult = { ok: true; session: CallSession } | { ok: false; error: string };

/**
 * Opens a session for this list. Any session still open on the list is closed
 * first — at its last call, or its start — so an abandoned tab never leaves
 * two sessions running.
 */
export async function startSession(listId: string, callerName: string): Promise<SessionResult> {
  await requireRole('staff');
  const actor = await currentActor();
  const bundle = await repo.getCallList(listId);
  if (!bundle) return { ok: false, error: 'List not found' };

  for (const open of bundle.sessions.filter((s) => !s.endedAt)) {
    await repo.endCallSession(open.id, sessionEnd(open, bundle.logs), actor);
  }
  const session = await repo.createCallSession(blankCallSession(newId(), listId, callerName.trim() || actor.name, new Date().toISOString()), actor);
  revalidatePath(`/sales/${listId}`);
  return { ok: true, session };
}

/** Closes a session at now. Safe to call twice. */
export async function endSession(listId: string, sessionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole('staff');
  const actor = await currentActor();
  const sessions = await repo.listCallSessions(listId);
  const s = sessions.find((x) => x.id === sessionId);
  if (!s) return { ok: false, error: 'Session not found' };
  if (!s.endedAt) await repo.endCallSession(sessionId, new Date().toISOString(), actor);
  revalidatePath(`/sales/${listId}`);
  return { ok: true };
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
