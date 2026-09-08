'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CallOutcome, FollowUp, JerseyManagerAnswer, LeadRating, Referral } from '@/lib/types';
import { blankJerseyManager } from '@/lib/data/sales-logic';

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
}

export function blankDraft(startedAt: string): CallDraft {
  return {
    startedAt, outcome: null, leadRating: null, notes: '', answers: {}, checklist: [],
    followUp: { date: null, time: '', note: '' }, email: '', reason: '',
    referral: { name: '', role: '', phone: '', email: '' }, newPhone: '',
    jerseyManager: blankJerseyManager(),
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
      // A draft saved before the jersey-manager field existed gets the blank answer.
      if (raw) restored = { ...blankDraft(new Date().toISOString()), ...(JSON.parse(raw) as Partial<CallDraft>) };
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
