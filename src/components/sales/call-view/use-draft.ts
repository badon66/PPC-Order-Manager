'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CallLog, CallOutcome, Discovery, FollowUp, JerseyManagerAnswer, LeadRating, Referral } from '@/lib/types';
import { blankDiscovery, blankJerseyManager, type CallLogInput } from '@/lib/data/sales-logic';

/** Everything typed during a call, before the outcome is saved. */
export interface CallDraft {
  startedAt: string;
  outcome: CallOutcome | null;
  leadRating: LeadRating | null;
  notes: string;
  answers: Record<string, string>;
  checklist: string[];
  followUp: FollowUp;
  email: string;
  reason: string;
  referral: Referral;
  newPhone: string;
  jerseyManager: JerseyManagerAnswer;
  discovery: Discovery;
}

export function blankDraft(startedAt: string): CallDraft {
  return {
    startedAt, outcome: null, leadRating: null, notes: '', answers: {}, checklist: [],
    followUp: { date: null, time: '', note: '' }, email: '', reason: '',
    referral: { name: '', role: '', phone: '', email: '' }, newPhone: '',
    jerseyManager: blankJerseyManager(),
    discovery: blankDiscovery(),
  };
}

/** The draft as the server wants it. `now` is the end of the call. */
export function inputFromDraft(d: CallDraft, callerName: string, now: string, sessionId: string | null): CallLogInput {
  const started = new Date(d.startedAt).getTime();
  return {
    outcome: d.outcome ?? 'no_answer',
    leadRating: d.leadRating,
    notes: d.notes,
    answers: d.answers,
    checklist: d.checklist,
    startedAt: d.startedAt,
    endedAt: now,
    durationSeconds: Math.max(0, Math.round((new Date(now).getTime() - started) / 1000)),
    callerName,
    followUp: d.followUp,
    email: d.email,
    reason: d.reason,
    referral: d.referral,
    newPhone: d.newPhone,
    sessionId,
    jerseyManager: d.jerseyManager,
    discovery: d.discovery,
  };
}

/** A logged call back into a draft, for editing it. */
export function draftFromLog(g: CallLog): CallDraft {
  return {
    ...blankDraft(g.startedAt),
    outcome: g.outcome, leadRating: g.leadRating, notes: g.notes, answers: { ...g.answers },
    checklist: [...g.checklist], followUp: { ...g.followUp }, email: g.email, reason: g.reason,
    referral: { ...g.referral }, newPhone: g.newPhone,
    jerseyManager: { ...g.jerseyManager, person: { ...g.jerseyManager.person } },
    discovery: { ...blankDiscovery(), ...g.discovery, alsoPriorities: [...(g.discovery?.alsoPriorities ?? [])] },
  };
}

const KEY = (id: string) => `ppc.callDraft.${id}`;
const SAVE_MS = 1000;

/**
 * Per-contact draft in localStorage, saved ~1 s after a change (the order
 * form's debounce). A closed tab loses nothing; reopening the contact restores
 * it. Cleared when the call is saved.
 */
export function useDraft(contactId: string | null) {
  const [draft, setDraft] = useState<CallDraft>(() => blankDraft(new Date().toISOString()));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!contactId) return;
    let restored: CallDraft | null = null;
    try {
      const raw = localStorage.getItem(KEY(contactId));
      // A draft saved before a field existed gets that field's blank value.
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CallDraft>;
        const blank = blankDraft(new Date().toISOString());
        restored = { ...blank, ...parsed, discovery: { ...blank.discovery, ...(parsed.discovery ?? {}) } };
      }
    } catch { /* ignore */ }
    loadedFor.current = contactId;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the per-contact draft only after the contact id changes; a lazy useState initializer can't read the current contactId prop
    setDraft(restored ?? blankDraft(new Date().toISOString()));
  }, [contactId]);

  useEffect(() => {
    if (!contactId || loadedFor.current !== contactId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try { localStorage.setItem(KEY(contactId), JSON.stringify(draft)); } catch { /* ignore */ }
    }, SAVE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [draft, contactId]);

  const patch = useCallback((p: Partial<CallDraft>) => setDraft((d) => ({ ...d, ...p })), []);
  const replace = useCallback((d: CallDraft) => setDraft(d), []);
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (contactId) { try { localStorage.removeItem(KEY(contactId)); } catch { /* ignore */ } }
  }, [contactId]);

  return { draft, patch, replace, clear };
}
