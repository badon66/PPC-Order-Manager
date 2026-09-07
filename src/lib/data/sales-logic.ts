/**
 * Sales rules — pure functions, no I/O. Both stores and the sales actions call
 * these so the two backends can't disagree. Kept out of ./logic.ts only
 * because that file is already 700 lines of order rules; the contract is the
 * same: nothing here reads or writes anything.
 *
 * Design: docs/superpowers/specs/2026-09-06-sales-cold-calling-design.md §5–§6, §8.
 */
import type {
  CalendarDate,
} from '@/lib/dates';
import { addDays, isCalendarDate, timestampDay } from '@/lib/dates';
import type {
  CallList, CallLog, CallOutcome, Contact, ContactBucket, ImportReport, ScriptItem,
} from '@/lib/types';
import { CALL_OUTCOMES } from '@/lib/types';
import { BUSINESS_TIMEZONE, PRIORITY_RANK } from '@/lib/constants';
import { isNorthAmerican } from '@/lib/sales/phone';

export type CallLogInput = Omit<CallLog, 'id' | 'listId' | 'contactId' | 'createdAt' | 'updatedAt'>;

export const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/* ------------------------------------------------------------------ *
 * Factories and healing
 * ------------------------------------------------------------------ */

export function blankContact(listId: string, sortOrder: number, now: string): Contact {
  return {
    id: '', listId, sortOrder, source: 'sheet', referredFromContactId: null,
    orgName: '', orgType: '', contactName: '', role: '', phone: '', altPhone: '', email: '',
    city: '', province: '', timezoneOverride: '', league: '', ageDivisions: '', teams: null,
    players: null, seasonStartMonth: '', orderingMonth: '', currentSupplier: '', lastOrderedYear: '',
    colours: '', website: '', social: '', leadSource: '', priority: '', bestTimeToCall: '',
    doNotCall: false, notes: '', raw: {},
    lastOutcome: null, lastCalledAt: null, callCount: 0, skipCount: 0, lastSkippedAt: null,
    nextCallDate: null, leadRating: null,
    createdAt: now, updatedAt: now,
  };
}

export function blankCallList(id: string, name: string, sourceFileName: string, createdBy: string, now: string): CallList {
  return {
    id, name, sourceFileName, script: [],
    importReport: { imported: 0, skipped: [], warnings: [] },
    createdBy, createdAt: now, updatedAt: now, deletedAt: null,
  };
}

export function blankCallLogInput(startedAt: string): CallLogInput {
  return {
    outcome: 'no_answer', leadRating: null, notes: '', answers: {}, checklist: [],
    startedAt, endedAt: startedAt, durationSeconds: 0, callerName: '',
    followUp: { date: null, time: '', note: '' }, email: '', reason: '',
    referral: { name: '', role: '', phone: '', email: '' }, newPhone: '',
  };
}

/*
 * Healing patches the row IN PLACE and returns it — the same contract as
 * healOrder / healRosterEntry in ./logic.ts, which the stores rely on when
 * they heal cached rows on load. Only `undefined` fields are filled, so a
 * legitimate 0, '' or null is never overwritten. The clock fallback below only
 * fires for a row with no createdAt at all, which the factories never produce.
 *
 * ADD A LINE HERE whenever a new non-optional field goes on Contact.
 */
export function healContact(c: Contact): Contact {
  const b = blankContact(c.listId ?? '', c.sortOrder ?? 0, c.createdAt ?? new Date().toISOString());
  for (const k of Object.keys(b) as Array<keyof Contact>) {
    if (c[k] === undefined) (c as unknown as Record<string, unknown>)[k] = b[k];
  }
  return c;
}

export function healCallList(l: CallList): CallList {
  l.script ??= [];
  l.script.forEach((s: ScriptItem) => { s.options ??= []; s.response ??= ''; s.showWhen ??= ''; });
  l.importReport ??= { imported: 0, skipped: [], warnings: [] } as ImportReport;
  l.createdBy ??= '';
  l.deletedAt ??= null;
  return l;
}

export function healCallLog(g: CallLog): CallLog {
  const b = blankCallLogInput(g.startedAt ?? g.createdAt ?? new Date().toISOString());
  for (const k of Object.keys(b) as Array<keyof CallLogInput>) {
    if (g[k] === undefined) (g as unknown as Record<string, unknown>)[k] = b[k];
  }
  return g;
}

/* ------------------------------------------------------------------ *
 * State transitions
 * ------------------------------------------------------------------ */

const CLOSED_OUTCOMES: ReadonlySet<CallOutcome> = new Set(['not_interested', 'do_not_call', 'referred', 'meeting_booked']);

/** Out of the queue for good (§5). bad_number only closes when no new number was given. */
export function isClosed(c: Contact): boolean {
  if (!c.lastOutcome) return false;
  if (c.lastOutcome === 'bad_number') return c.nextCallDate === null;
  return CLOSED_OUTCOMES.has(c.lastOutcome);
}

export function contactBucket(c: Contact): ContactBucket {
  if (c.doNotCall) return 'do_not_call';
  if (c.callCount === 0) return 'uncalled';
  switch (c.lastOutcome) {
    case 'no_answer': case 'voicemail': return 'retry';
    case 'bad_number': return c.nextCallDate ? 'retry' : 'done';
    case 'callback': case 'send_info': case 'interested': case 'meeting_booked': case 'not_now': return 'follow_up';
    default: return 'done';
  }
}

export function nextCallDateFor(input: CallLogInput, _contact: Contact, today: CalendarDate): CalendarDate | null {
  switch (input.outcome) {
    case 'no_answer': return addDays(today, 2);
    case 'voicemail': return addDays(today, 4);
    case 'bad_number': return input.newPhone.trim() ? today : null;
    case 'callback': case 'send_info': case 'interested': case 'meeting_booked': case 'not_now':
      return input.followUp.date;
    default: return null;
  }
}

/**
 * The only thing that writes a contact's call state. `replacing` = the log is
 * an edit of the contact's most recent call, so it is not a second call.
 */
export function applyCallLog(contact: Contact, log: CallLog, today: CalendarDate, opts: { replacing: boolean }): Partial<Contact> {
  const patch: Partial<Contact> = {
    lastOutcome: log.outcome,
    nextCallDate: nextCallDateFor(log, contact, today),
    updatedAt: log.endedAt,
  };
  if (!opts.replacing) {
    patch.callCount = contact.callCount + 1;
    patch.lastCalledAt = log.endedAt;
  }
  if (log.leadRating) patch.leadRating = log.leadRating;
  if ((log.outcome === 'send_info' || log.outcome === 'interested') && log.email.trim()) patch.email = log.email.trim();
  if (log.outcome === 'bad_number' && log.newPhone.trim()) {
    patch.phone = log.newPhone.trim();
    patch.altPhone = [contact.altPhone, contact.phone].map((s) => s.trim()).filter(Boolean).join(', ');
  }
  if (log.outcome === 'do_not_call') patch.doNotCall = true;
  return patch;
}

export function applySkip(contact: Contact, now: string): Partial<Contact> {
  return { skipCount: contact.skipCount + 1, lastSkippedAt: now, updatedAt: now };
}

/* ------------------------------------------------------------------ *
 * Queue (§5)
 * ------------------------------------------------------------------ */

const skippedToday = (c: Contact, today: CalendarDate) =>
  !!c.lastSkippedAt && timestampDay(c.lastSkippedAt, BUSINESS_TIMEZONE) === today;

export function buildQueue(contacts: Contact[], today: CalendarDate): string[] {
  const live = contacts.filter((c) => !c.doNotCall);
  const due = live
    .filter((c) => c.callCount > 0 && !!c.nextCallDate && c.nextCallDate <= today && !isClosed(c))
    .sort((a, b) => a.nextCallDate!.localeCompare(b.nextCallDate!) || a.sortOrder - b.sortOrder);
  const uncalled = live
    .filter((c) => c.callCount === 0)
    .sort((a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  const retry = live
    .filter((c) => c.callCount > 0 && contactBucket(c) === 'retry' && !!c.nextCallDate && c.nextCallDate > today)
    .sort((a, b) => (a.lastCalledAt ?? '').localeCompare(b.lastCalledAt ?? ''));
  const withSkipsLast = (bucket: Contact[]) => [
    ...bucket.filter((c) => !skippedToday(c, today)),
    ...bucket.filter((c) => skippedToday(c, today)),
  ];
  return [...withSkipsLast(due), ...withSkipsLast(uncalled), ...withSkipsLast(retry)].map((c) => c.id);
}

/* ------------------------------------------------------------------ *
 * Referral (§6)
 * ------------------------------------------------------------------ */

export function referralContactFrom(source: Contact, log: CallLog, now: string): Contact {
  const r = log.referral;
  return {
    ...blankContact(source.listId, source.sortOrder, now),
    source: 'referral',
    referredFromContactId: source.id,
    orgName: source.orgName, orgType: source.orgType, city: source.city, province: source.province,
    timezoneOverride: source.timezoneOverride, league: source.league, ageDivisions: source.ageDivisions,
    teams: source.teams, players: source.players, seasonStartMonth: source.seasonStartMonth,
    orderingMonth: source.orderingMonth, currentSupplier: source.currentSupplier,
    lastOrderedYear: source.lastOrderedYear, colours: source.colours, website: source.website,
    social: source.social, leadSource: 'Referral', priority: source.priority,
    bestTimeToCall: source.bestTimeToCall,
    contactName: r.name.trim(), role: r.role.trim(), phone: r.phone.trim(), email: r.email.trim(),
    notes: `Referred by ${source.contactName.trim() || source.orgName.trim() || 'a previous contact'}`,
  };
}

/* ------------------------------------------------------------------ *
 * Defaults and validation (§6, §8)
 * ------------------------------------------------------------------ */

/** `YYYY-MM`: the ordering month, this year if still ahead, else next year; unknown month → next month. */
export function defaultNotNowMonth(contact: Contact, today: CalendarDate): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const wanted = MONTH_INDEX[contact.orderingMonth.trim().slice(0, 3).toLowerCase()];
  if (!wanted) {
    const nm = m === 12 ? 1 : m + 1;
    return `${m === 12 ? y + 1 : y}-${String(nm).padStart(2, '0')}`;
  }
  const year = wanted > m ? y : y + 1;
  return `${year}-${String(wanted).padStart(2, '0')}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const NEEDS_DATE: ReadonlySet<CallOutcome> = new Set(['callback', 'send_info', 'interested', 'meeting_booked', 'not_now']);

export function validateCallLog(
  input: CallLogInput,
  contact: Contact,
  opts: { replacing: boolean },
): { blocking: Record<string, string>; warnings: Record<string, string> } {
  const blocking: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  if (!(CALL_OUTCOMES as readonly string[]).includes(input.outcome)) blocking.outcome = 'Pick an outcome';
  if (input.leadRating !== null && !(Number.isInteger(input.leadRating) && input.leadRating >= 1 && input.leadRating <= 5)) {
    blocking.leadRating = 'Rating must be 1–5';
  }
  if (input.followUp.date !== null && !isCalendarDate(input.followUp.date)) blocking['followUp.date'] = 'Date must be YYYY-MM-DD';
  if (input.followUp.time !== '' && !TIME_RE.test(input.followUp.time)) blocking['followUp.time'] = 'Time must be HH:MM';
  if (NEEDS_DATE.has(input.outcome) && !input.followUp.date) {
    blocking['followUp.date'] = input.outcome === 'not_now' ? 'Pick the month to call back' : 'Pick a date';
  }
  if (input.outcome === 'referred' && !input.referral.name.trim() && !input.referral.phone.trim()) {
    blocking.referral = 'Give the referral a name or a phone number';
  }
  if (input.outcome === 'send_info' && !input.email.trim()) blocking.email = 'Where should the catalogue go?';
  if (!Number.isInteger(input.durationSeconds) || input.durationSeconds < 0) blocking.durationSeconds = 'Bad duration';
  if (contact.doNotCall && input.outcome !== 'do_not_call') blocking.outcome = 'This contact is marked Do Not Call';
  if (opts.replacing && contact.lastOutcome === 'do_not_call' && input.outcome !== 'do_not_call') {
    blocking.outcome = 'Do Not Call cannot be undone by editing the call';
  }

  if (input.email.trim() && !EMAIL_RE.test(input.email.trim())) warnings.email = "That doesn't look like an email";
  if (input.outcome === 'interested' && !input.email.trim()) warnings.email = 'No email captured — follow-up will be harder';
  if (input.referral.phone.trim() && !isNorthAmerican(input.referral.phone)) warnings['referral.phone'] = 'Not a 10-digit number';
  if (input.newPhone.trim() && !isNorthAmerican(input.newPhone)) warnings.newPhone = 'Not a 10-digit number';

  return { blocking, warnings };
}

/* ------------------------------------------------------------------ *
 * Session tally (§7 footer)
 * ------------------------------------------------------------------ */

export function sessionTally(logs: CallLog[], callerName: string, today: CalendarDate) {
  const mine = logs.filter((g) => g.callerName === callerName && timestampDay(g.endedAt, BUSINESS_TIMEZONE) === today);
  const talked = new Set<CallOutcome>(['callback', 'send_info', 'interested', 'meeting_booked', 'not_now', 'not_interested', 'do_not_call']);
  return {
    calls: mine.length,
    reached: mine.filter((g) => talked.has(g.outcome)).length,
    voicemails: mine.filter((g) => g.outcome === 'voicemail').length,
    callbacks: mine.filter((g) => g.outcome === 'callback').length,
    infoSent: mine.filter((g) => g.outcome === 'send_info').length,
  };
}
