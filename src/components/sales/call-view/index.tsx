'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { CallList, CallLog, Contact, LeadRating } from '@/lib/types';
import type { CalendarDate } from '@/lib/dates';
import { formatTimestamp } from '@/lib/dates';
import { BUSINESS_TIMEZONE, CALL_OUTCOME_OPTIONS } from '@/lib/constants';
import { logCall, skipContact, updateCallLog } from '@/app/sales/actions';
import { applicableItems, fillPlaceholders } from '@/lib/sales/script';
import { isClosed, sessionTally, validateCallLog, type CallLogInput } from '@/lib/data/sales-logic';
import { TextArea } from '@/components/order-form/fields';
import { EmptyState, Warning } from '@/components/ui';
import { useCallerName } from '../use-caller-name';
import { OutcomeBadge } from '../outcome-badge';
import { ContactPanel } from './contact-panel';
import { ScriptPanel } from './script-panel';
import { OutcomePanel, seedForOutcome } from './outcome-panel';
import { FooterBar, type SaveState } from './footer-bar';
import { useCallKeys } from './use-keyboard';
import { blankDraft, useDraft, type CallDraft } from './use-draft';
import { formatClock, useElapsedSince, useSessionTimer } from './use-timers';

export interface CallViewProps {
  list: CallList;
  contacts: Contact[];
  logs: CallLog[];
  queue: string[];
  startId: string | null;
  callerDefault: string;
  today: CalendarDate;
}

export function inputFromDraft(d: CallDraft, callerName: string, now: string): CallLogInput {
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
  };
}

export function draftFromLog(g: CallLog): CallDraft {
  return {
    ...blankDraft(g.startedAt),
    outcome: g.outcome, leadRating: g.leadRating, notes: g.notes, answers: { ...g.answers },
    checklist: [...g.checklist], followUp: { ...g.followUp }, email: g.email, reason: g.reason,
    referral: { ...g.referral }, newPhone: g.newPhone,
  };
}

const SHORTCUTS: Array<[string, string]> = [
  ['1–9, 0, -', 'Pick an outcome (on-screen order)'], ['Shift+1…5', 'Rate the lead'], ['Ctrl+Enter', 'Save & Next'],
  ['Ctrl+→', 'Skip'], ['Ctrl+←', 'Previous'], ['/', 'Jump to notes'], ['Esc', 'Leave a text box'], ['?', 'This sheet'],
];

export function CallView(props: CallViewProps) {
  const { list, today } = props;
  const [callerName] = useCallerName(props.callerDefault);
  const [contacts, setContacts] = useState<Record<string, Contact>>(() => Object.fromEntries(props.contacts.map((c) => [c.id, c])));
  const [logs, setLogs] = useState<CallLog[]>(props.logs);
  const [queue, setQueue] = useState<string[]>(props.queue);
  const [currentId, setCurrentId] = useState<string | null>(props.startId);
  const [history, setHistory] = useState<string[]>([]);
  const [sessionLogs, setSessionLogs] = useState<Record<string, string>>({}); // contactId → logId written this session
  const [editing, setEditing] = useState<CallLog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Record<string, string>>({});
  const [help, setHelp] = useState(false);
  const notesRef = useRef<HTMLDivElement>(null);

  const session = useSessionTimer(list.id);
  const { draft, patch, replace, clear } = useDraft(currentId);
  const elapsed = useElapsedSince(currentId ? draft.startedAt : null);

  const current = currentId ? contacts[currentId] : null;
  const contactLogs = useMemo(() => (current ? logs.filter((g) => g.contactId === current.id) : []), [logs, current]);
  const script = useMemo(
    () => (current ? applicableItems(list.script, current).map((i) => ({ ...i, text: fillPlaceholders(i.text, current, callerName), response: fillPlaceholders(i.response, current, callerName) })) : []),
    [list.script, current, callerName],
  );
  const position = current ? queue.indexOf(current.id) : -1;
  const waitingOnDate = useMemo(
    () => Object.values(contacts).filter((c) => !c.doNotCall && c.callCount > 0 && !!c.nextCallDate && c.nextCallDate > today && !isClosed(c)).length,
    [contacts, today],
  );
  const tally = useMemo(() => sessionTally(logs, callerName, today), [logs, callerName, today]);
  const loggedThisSession = current ? logs.find((g) => g.id === sessionLogs[current.id]) ?? null : null;
  const showingSummary = !!loggedThisSession && !editing;

  const validation = useMemo(
    () => (current && draft.outcome ? validateCallLog(inputFromDraft(draft, callerName, new Date().toISOString()), current, { replacing: !!editing }) : null),
    [current, draft, callerName, editing],
  );
  const missing = !current ? null : current.doNotCall && draft.outcome !== 'do_not_call' ? 'Do Not Call' : !draft.outcome ? 'Pick an outcome' : (validation && Object.values(validation.blocking)[0]) || null;
  const canSave = !!current && !showingSummary && !missing;

  const goTo = useCallback((id: string | null) => {
    setHistory((h) => (currentId ? [...h, currentId] : h));
    setCurrentId(id);
    setEditing(null);
    setNotice(null);
    setError(null);
    setFieldErrors({});
    setWarnings({});
  }, [currentId]);

  const nextAfter = (id: string | null, q: string[]) => q.find((x) => x !== id) ?? null;

  function skip() {
    if (!current) return;
    const id = current.id;
    const q = [...queue.filter((x) => x !== id), id];
    setQueue(q);
    setContacts((m) => ({ ...m, [id]: { ...m[id], skipCount: m[id].skipCount + 1, lastSkippedAt: new Date().toISOString() } }));
    skipContact(list.id, id).then((r) => { if (!r.ok) setNotice(r.error); });
    goTo(nextAfter(id, q));
  }

  function previous() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setCurrentId(prev);
    setEditing(null);
    setError(null);
  }

  function startEdit() {
    if (!loggedThisSession) return;
    replace(draftFromLog(loggedThisSession));
    setEditing(loggedThisSession);
  }

  async function save() {
    if (!current || !canSave) return;
    setSaveState('saving');
    setError(null);
    const input = inputFromDraft(draft, callerName, new Date().toISOString());
    const res = editing ? await updateCallLog(editing.id, current.id, input) : await logCall(list.id, current.id, input);
    if (!res.ok) {
      setSaveState('error');
      setError(res.error);
      setFieldErrors(res.errors ?? {});
      return;
    }
    setSaveState('idle');
    setWarnings(res.warnings);
    setLogs((l) => (editing ? l.map((g) => (g.id === res.log.id ? res.log : g)) : [res.log, ...l]));
    setContacts((m) => ({ ...m, [res.contact.id]: res.contact, ...(res.referral ? { [res.referral.id]: res.referral } : {}) }));
    setSessionLogs((s) => ({ ...s, [res.contact.id]: res.log.id }));
    const q = queue.filter((x) => x !== res.contact.id);
    const nextQueue = res.referral ? [res.referral.id, ...q] : q;
    setQueue(nextQueue);
    clear();
    setEditing(null);
    goTo(nextAfter(res.contact.id, nextQueue));
  }

  useCallKeys({
    onOutcome: (i) => { if (current && !current.doNotCall && !showingSummary) patch(seedForOutcome(draft, CALL_OUTCOME_OPTIONS[i], current, today)); },
    onRating: (n) => { if (current && !showingSummary) patch({ leadRating: (draft.leadRating === n ? null : n) as LeadRating | null }); },
    onSave: () => { void save(); },
    onSkip: skip,
    onPrevious: previous,
    onFocusNotes: () => notesRef.current?.querySelector('textarea')?.focus(),
    onHelp: () => setHelp((h) => !h),
  }, !!current);

  return (
    <div className="space-y-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href={`/sales/${list.id}`} onClick={session.clear} className="text-muted hover:text-ppc-gold">← {list.name}</Link>
        <div className="flex items-center gap-4 tabular-nums text-muted">
          <span>{position >= 0 ? `${position + 1} of ${queue.length} in queue` : current ? 'Not in queue' : `${queue.length} in queue`}</span>
          <span>⏱ calling for <span className="font-semibold text-foreground">{formatClock(session.seconds)}</span></span>
          {current && <span><span className="font-semibold text-foreground">{formatClock(elapsed)}</span> here</span>}
        </div>
      </div>

      {notice && <Warning>{notice}</Warning>}
      {help && (
        <div className="rounded-xl border border-line bg-surface p-4 text-sm">
          <div className="mb-2 flex items-center justify-between"><span className="font-bold uppercase tracking-wide text-ppc-gold">Keyboard</span><button type="button" onClick={() => setHelp(false)} className="text-muted hover:text-ppc-gold">close</button></div>
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {SHORTCUTS.map(([k, v]) => <div key={k} className="flex gap-3"><dt className="w-24 shrink-0 font-mono text-xs text-ppc-gold">{k}</dt><dd className="text-muted">{v}</dd></div>)}
          </dl>
        </div>
      )}

      {!current ? (
        <EmptyState
          title="Nothing left in the queue"
          hint={`${waitingOnDate} contact${waitingOnDate === 1 ? ' is' : 's are'} waiting on a future date. Open the contacts table to pick someone directly.`}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <section className="rounded-xl border border-line bg-surface p-4">
            {current.doNotCall && <div className="mb-3"><Warning>Do Not Call — this contact asked not to be contacted. Outcomes are disabled.</Warning></div>}
            <ContactPanel contact={current} logs={contactLogs} script={list.script} />
          </section>
          <section className="space-y-6">
            <div className="rounded-xl border border-line bg-surface p-4">
              <ScriptPanel
                items={script}
                answers={draft.answers}
                checklist={draft.checklist}
                onAnswer={(id, v) => patch({ answers: { ...draft.answers, [id]: v } })}
                onTick={(id, on) => patch({ checklist: on ? [...new Set([...draft.checklist, id])] : draft.checklist.filter((x) => x !== id) })}
                disabled={current.doNotCall || showingSummary}
              />
            </div>
            <div ref={notesRef} className="rounded-xl border border-line bg-surface p-4">
              <TextArea label="Notes" value={draft.notes} onChange={(v) => patch({ notes: v })} rows={4} placeholder="What they said, what you promised…" />
              <p className="mt-1 text-xs text-muted">Drafts save automatically on this device. Press / to jump here.</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ppc-gold">Outcome</h3>
              {showingSummary && loggedThisSession ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 p-3 text-sm">
                  <span>Logged as <OutcomeBadge outcome={loggedThisSession.outcome} /> <span className="text-muted">{formatTimestamp(loggedThisSession.endedAt, BUSINESS_TIMEZONE)}</span></span>
                  <button type="button" onClick={startEdit} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-ppc-gold/60 hover:text-ppc-gold">Edit</button>
                </div>
              ) : (
                <>
                  {editing && <p className="mb-3 text-xs text-amber-300">Editing the call logged at {formatTimestamp(editing.endedAt, BUSINESS_TIMEZONE)} — saving replaces it.</p>}
                  <OutcomePanel draft={draft} onChange={patch} contact={current} today={today} disabled={current.doNotCall} errors={fieldErrors} warnings={warnings} />
                </>
              )}
            </div>
          </section>
        </div>
      )}

      <FooterBar
        canPrevious={history.length > 0}
        onPrevious={previous}
        canSkip={!!current}
        onSkip={skip}
        canSave={canSave}
        onSave={() => { void save(); }}
        saveLabel={editing ? 'Update call' : 'Save & Next →'}
        saveState={saveState}
        error={error}
        missing={missing}
        tally={tally}
        onHelp={() => setHelp((h) => !h)}
      />
    </div>
  );
}
