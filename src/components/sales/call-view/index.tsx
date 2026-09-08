'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { CallList, CallLog, CallSession, Contact, LeadRating } from '@/lib/types';
import type { CalendarDate } from '@/lib/dates';
import { CALL_OUTCOME_OPTIONS } from '@/lib/constants';
import { logCall, skipContact, updateCallLog } from '@/app/sales/actions';
import { applicableItems, fillPlaceholders } from '@/lib/sales/script';
import { isClosed, linkedContacts, sessionTallyFor, validateCallLog, type CallLogInput } from '@/lib/data/sales-logic';
import { TextArea } from '@/components/order-form/fields';
import { EmptyState, Warning } from '@/components/ui';
import { useCallerName } from '../use-caller-name';
import { ContactPanel } from './contact-panel';
import { ScriptPanel } from './script-panel';
import { seedForOutcome } from './outcome-panel';
import { FinishDialog } from './finish-dialog';
import { CallSummary } from './call-summary';
import { FooterBar, type SaveState } from './footer-bar';
import { useCallKeys } from './use-keyboard';
import { blankDraft, useDraft, type CallDraft } from './use-draft';
import { formatClock, useCallSession, useElapsedSince } from './use-timers';

export interface CallViewProps {
  list: CallList;
  contacts: Contact[];
  logs: CallLog[];
  sessions: CallSession[];
  queue: string[];
  startId: string | null;
  callerDefault: string;
  today: CalendarDate;
}

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
  };
}

export function draftFromLog(g: CallLog): CallDraft {
  return {
    ...blankDraft(g.startedAt),
    outcome: g.outcome, leadRating: g.leadRating, notes: g.notes, answers: { ...g.answers },
    checklist: [...g.checklist], followUp: { ...g.followUp }, email: g.email, reason: g.reason,
    referral: { ...g.referral }, newPhone: g.newPhone,
    jerseyManager: { ...g.jerseyManager, person: { ...g.jerseyManager.person } },
  };
}

const SHORTCUTS: Array<[string, string]> = [
  ['1–9, 0, -', 'Pick an outcome and open Call finished'], ['Shift+1…5', 'Rate the lead'], ['Ctrl+Enter', 'Call finished — then Save'],
  ['Ctrl+→', 'Skip'], ['Ctrl+←', 'Previous'], ['/', 'Jump to notes'], ['Esc', 'Close the dialog / leave a text box'], ['?', 'This sheet'],
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
  const [finishOpen, setFinishOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Record<string, string>>({});
  const [help, setHelp] = useState(false);
  const notesRef = useRef<HTMLDivElement>(null);

  const session = useCallSession(list.id, props.callerDefault);
  const { draft, patch, replace, clear } = useDraft(currentId);
  const elapsed = useElapsedSince(currentId ? draft.startedAt : null);

  const current = currentId ? contacts[currentId] : null;
  const allContacts = useMemo(() => Object.values(contacts), [contacts]);
  const linked = useMemo(() => (current ? linkedContacts(current, allContacts) : []), [current, allContacts]);
  const contactLogs = useMemo(() => (current ? logs.filter((g) => g.contactId === current.id) : []), [logs, current]);
  const sessionsById = useMemo(() => Object.fromEntries(props.sessions.map((s) => [s.id, s])), [props.sessions]);
  const script = useMemo(
    () => (current ? applicableItems(list.script, current).map((i) => ({ ...i, text: fillPlaceholders(i.text, current, callerName), response: fillPlaceholders(i.response, current, callerName) })) : []),
    [list.script, current, callerName],
  );
  const position = current ? queue.indexOf(current.id) : -1;
  const waitingOnDate = useMemo(
    () => allContacts.filter((c) => !c.doNotCall && c.callCount > 0 && !!c.nextCallDate && c.nextCallDate > today && !isClosed(c)).length,
    [allContacts, today],
  );
  const tally = useMemo(() => sessionTallyFor(logs, session.session?.id ?? null), [logs, session.session]);
  const loggedThisSession = current ? logs.find((g) => g.id === sessionLogs[current.id]) ?? null : null;
  const showingSummary = !!loggedThisSession && !editing;

  const validation = useMemo(
    () => (current && draft.outcome ? validateCallLog(inputFromDraft(draft, callerName, new Date().toISOString(), session.session?.id ?? null), current, { replacing: !!editing, linkedIds: linked.map((c) => c.id) }) : null),
    [current, draft, callerName, editing, linked, session.session],
  );
  const missing = !current ? null : current.doNotCall && draft.outcome !== 'do_not_call' ? 'Do Not Call' : !draft.outcome ? 'Pick an outcome' : (validation && Object.values(validation.blocking)[0]) || null;
  const canSave = !!current && !showingSummary && !missing;
  const canFinish = !!current && !showingSummary && !current.doNotCall;

  const goTo = useCallback((id: string | null) => {
    setHistory((h) => (currentId ? [...h, currentId] : h));
    setCurrentId(id);
    setEditing(null);
    setFinishOpen(false);
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
    setFinishOpen(false);
    setError(null);
  }

  function startEdit() {
    if (!loggedThisSession) return;
    replace(draftFromLog(loggedThisSession));
    setEditing(loggedThisSession);
    setFinishOpen(true);
  }

  function openFinish() {
    if (!canFinish) return;
    setFinishOpen(true);
  }

  async function save() {
    if (!current || !canSave) return;
    setSaveState('saving');
    setError(null);
    const input = inputFromDraft(draft, callerName, new Date().toISOString(), session.session?.id ?? null);
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
    setContacts((m) => {
      const next = { ...m, [res.contact.id]: res.contact };
      for (const { id, patch: p } of res.others) if (next[id]) next[id] = { ...next[id], ...p };
      if (res.referral) next[res.referral.id] = res.referral;
      return next;
    });
    setSessionLogs((s) => ({ ...s, [res.contact.id]: res.log.id }));
    const q = queue.filter((x) => x !== res.contact.id);
    const nextQueue = res.referral ? [res.referral.id, ...q] : q;
    setQueue(nextQueue);
    clear();
    setEditing(null);
    setFinishOpen(false);
    goTo(nextAfter(res.contact.id, nextQueue));
  }

  useCallKeys({
    onOutcome: (i) => {
      if (!current || current.doNotCall || showingSummary) return;
      patch(seedForOutcome(draft, CALL_OUTCOME_OPTIONS[i], current, today));
      setFinishOpen(true);
    },
    onRating: (n) => { if (current && !showingSummary) patch({ leadRating: (draft.leadRating === n ? null : n) as LeadRating | null }); },
    onFinish: () => { if (finishOpen) void save(); else openFinish(); },
    onSkip: skip,
    onPrevious: previous,
    onFocusNotes: () => notesRef.current?.querySelector('textarea')?.focus(),
    onHelp: () => setHelp((h) => !h),
    onEscape: () => { if (finishOpen) { setFinishOpen(false); setEditing(null); } else setHelp(false); },
  }, !!current);

  return (
    <div className="space-y-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href={`/sales/${list.id}`} onClick={() => { void session.end(); }} className="text-muted hover:text-ppc-gold">← {list.name}</Link>
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
        <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-[minmax(0,3fr)_minmax(0,5fr)_minmax(0,4fr)]">
          <section className="rounded-xl border border-line bg-surface p-4">
            {current.doNotCall && <div className="mb-3"><Warning>Do Not Call — this contact asked not to be contacted. Outcomes are disabled.</Warning></div>}
            <ContactPanel contact={current} logs={contactLogs} script={list.script} linked={linked} listId={list.id} sessionsById={sessionsById} />
          </section>
          <section className="rounded-xl border border-line bg-surface p-4">
            <ScriptPanel
              items={script}
              answers={draft.answers}
              checklist={draft.checklist}
              onAnswer={(id, v) => patch({ answers: { ...draft.answers, [id]: v } })}
              onTick={(id, on) => patch({ checklist: on ? [...new Set([...draft.checklist, id])] : draft.checklist.filter((x) => x !== id) })}
              disabled={current.doNotCall || showingSummary}
              linked={linked}
              jerseyManager={draft.jerseyManager}
              onJerseyManager={(p) => patch({ jerseyManager: { ...draft.jerseyManager, ...p } })}
            />
          </section>
          <section className="space-y-6 lg:col-start-2 2xl:col-start-3 2xl:row-start-1">
            <div ref={notesRef} className="rounded-xl border border-line bg-surface p-4">
              <TextArea label="Notes" value={draft.notes} onChange={(v) => patch({ notes: v })} rows={6} placeholder="What they said, what you promised…" />
              <p className="mt-1 text-xs text-muted">Drafts save automatically on this device. Press / to jump here.</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ppc-gold">Call</h3>
              <CallSummary
                draft={draft}
                logged={showingSummary ? loggedThisSession : null}
                disabled={!canFinish}
                disabledReason={current.doNotCall ? 'Do Not Call — no outcome can be logged.' : null}
                onOpen={openFinish}
                onEdit={startEdit}
              />
            </div>
          </section>
        </div>
      )}

      {current && (
        <FinishDialog
          open={finishOpen}
          contact={current}
          draft={draft}
          onChange={patch}
          editing={editing}
          errors={fieldErrors}
          warnings={warnings}
          missing={missing}
          canSave={canSave}
          saveState={saveState}
          error={error}
          saveLabel={editing ? 'Update call' : 'Save & Next →'}
          onCancel={() => { setFinishOpen(false); setEditing(null); }}
          onSave={() => { void save(); }}
          today={today}
        />
      )}

      <FooterBar
        canPrevious={history.length > 0}
        onPrevious={previous}
        canSkip={!!current}
        onSkip={skip}
        canFinish={canFinish}
        onFinish={openFinish}
        finishLabel={showingSummary ? 'Logged' : 'Call finished'}
        tally={tally}
        onHelp={() => setHelp((h) => !h)}
      />
    </div>
  );
}
