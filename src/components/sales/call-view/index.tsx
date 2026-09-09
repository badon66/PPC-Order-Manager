'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { CallList, CallLog, CallOutcome, CallSession, Contact, LeadRating } from '@/lib/types';
import type { CalendarDate } from '@/lib/dates';
import { CALL_OUTCOME_OPTIONS } from '@/lib/constants';
import { logCall, skipContact, updateCallLog } from '@/app/sales/actions';
import { applicableItems, fillPlaceholders } from '@/lib/sales/script';
import type { AlsoIn } from '@/lib/sales/match';
import { isClosed, linkedContacts, sessionTallyFor, validateCallLog } from '@/lib/data/sales-logic';
import { EmptyState, Warning } from '@/components/ui';
import { useCallerName } from '../use-caller-name';
import { ContactPanel } from './contact-panel';
import { CallHistory } from './history';
import { seedForOutcome } from './outcome-panel';
import { OutcomeBoard, isImmediate } from './outcome-board';
import { PickupLine } from './pickup-line';
import { OpeningPanel } from './opening-panel';
import { DiscoveryPanel } from './discovery-panel';
import { ClosePanel } from './close-panel';
import { ObjectionsPanel } from './objections-panel';
import { QuickFacts } from './quick-facts';
import { CallSettings } from './call-settings';
import { FooterBar, type SaveState } from './footer-bar';
import { useCallKeys } from './use-keyboard';
import { draftFromLog, inputFromDraft, useDraft, type CallDraft } from './use-draft';
import { formatClock, useCallSession, useElapsedSince } from './use-timers';

export interface CallViewProps {
  list: CallList;
  contacts: Contact[];
  logs: CallLog[];
  sessions: CallSession[];
  /** Per contact id: the other lists the same person is in. Computed by the page. */
  alsoIn: Record<string, AlsoIn[]>;
  queue: string[];
  startId: string | null;
  callerDefault: string;
  today: CalendarDate;
}

export { inputFromDraft, draftFromLog };

const SHORTCUTS: Array<[string, string]> = [
  ['1–9, 0, -', 'Pick an outcome (No answer and Voicemail log at once)'], ['Shift+1…5', 'Rate the lead'], ['Ctrl+Enter', 'Log the call'],
  ['Ctrl+→', 'Skip'], ['Ctrl+←', 'Previous'], ['/', 'Jump to notes'], ['Esc', 'Clear the outcome / leave a text box'], ['?', 'This sheet'],
];

const COLUMN = 'min-h-0 overflow-y-auto rounded-xl border border-line bg-surface p-4';

/**
 * The calling screen. At 1600px and wider it is a fixed-height grid of four
 * columns that scroll inside themselves; below that, the columns stack and
 * the page scrolls. All call state lives in the draft (autosaved per
 * contact); the list's editable text lives in `list` state so edits show at
 * once. Logging goes through `logCall`, unchanged.
 */
export function CallView(props: CallViewProps) {
  const { today } = props;
  const [list, setList] = useState<CallList>(props.list);
  const [callerName] = useCallerName(props.callerDefault);
  const [contacts, setContacts] = useState<Record<string, Contact>>(() => Object.fromEntries(props.contacts.map((c) => [c.id, c])));
  const [logs, setLogs] = useState<CallLog[]>(props.logs);
  const [queue, setQueue] = useState<string[]>(props.queue);
  const [currentId, setCurrentId] = useState<string | null>(props.startId);
  const [history, setHistory] = useState<string[]>([]);
  const [sessionLogs, setSessionLogs] = useState<Record<string, string>>({}); // contactId → logId written this session
  const [editing, setEditing] = useState<CallLog | null>(null);
  const [openingOpen, setOpeningOpen] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Record<string, string>>({});
  const [help, setHelp] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const session = useCallSession(list.id, props.callerDefault);
  const { draft, patch, update, replace, clear } = useDraft(currentId);
  // Nested fields go through `update` so a burst of taps never reads a stale draft.
  const tick = (id: string, on: boolean) => update((d) => ({ ...d, checklist: on ? [...new Set([...d.checklist, id])] : d.checklist.filter((x) => x !== id) }));
  const answer = (id: string, v: string) => update((d) => ({ ...d, answers: { ...d.answers, [id]: v } }));
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
  const opening = script.filter((i) => i.section === 'opening');
  const discoveryItems = script.filter((i) => i.section === 'discovery');
  const objections = script.filter((i) => i.section === 'objections');
  const closeItems = script.filter((i) => i.section === 'close');
  const position = current ? queue.indexOf(current.id) : -1;
  const waitingOnDate = useMemo(
    () => allContacts.filter((c) => !c.doNotCall && c.callCount > 0 && !!c.nextCallDate && c.nextCallDate > today && !isClosed(c)).length,
    [allContacts, today],
  );
  const tally = useMemo(() => sessionTallyFor(logs, session.session?.id ?? null), [logs, session.session]);
  const loggedThisSession = current ? logs.find((g) => g.id === sessionLogs[current.id]) ?? null : null;
  const showingSummary = !!loggedThisSession && !editing;
  const sessionId = session.session?.id ?? null;

  const missingFor = useCallback((d: CallDraft): string | null => {
    if (!current) return 'No contact';
    if (current.doNotCall && d.outcome !== 'do_not_call') return 'Do Not Call — only that outcome can be logged';
    if (!d.outcome) return 'Pick an outcome';
    const v = validateCallLog(inputFromDraft(d, callerName, new Date().toISOString(), sessionId), current, { replacing: !!editing, linkedIds: linked.map((c) => c.id) });
    return Object.values(v.blocking)[0] ?? null;
  }, [current, callerName, sessionId, editing, linked]);
  const missing = current ? missingFor(draft) : null;
  const canSave = !!current && !showingSummary && !missing;

  const goTo = useCallback((id: string | null) => {
    setHistory((h) => (currentId ? [...h, currentId] : h));
    setCurrentId(id);
    setEditing(null);
    setOpeningOpen(true);
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
    setOpeningOpen(true);
    setError(null);
  }

  function startEdit() {
    if (!loggedThisSession) return;
    replace(draftFromLog(loggedThisSession));
    setEditing(loggedThisSession);
  }

  /** Save `d` (the draft, or the draft plus a just-picked outcome) and move on. */
  async function save(d: CallDraft = draft) {
    if (!current || showingSummary) return;
    const problem = missingFor(d);
    if (problem) { setError(problem); return; }
    setSaveState('saving');
    setError(null);
    const input = inputFromDraft(d, callerName, new Date().toISOString(), sessionId);
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
    goTo(nextAfter(res.contact.id, nextQueue));
  }

  /** A button on the board, or its hotkey. Immediate outcomes log at once; the rest open their strip. */
  function pick(o: CallOutcome) {
    if (!current || showingSummary) return;
    if (current.doNotCall && o !== 'do_not_call') return;
    if (draft.outcome === o && !isImmediate(o)) { patch({ outcome: null }); return; }
    const seeded: CallDraft = { ...draft, ...seedForOutcome(draft, o, current, today) };
    if (isImmediate(o) && !editing) { void save(seeded); return; }
    patch(seeded);
  }

  useCallKeys({
    onOutcome: (i) => pick(CALL_OUTCOME_OPTIONS[i]),
    onRating: (n) => { if (current && !showingSummary) patch({ leadRating: (draft.leadRating === n ? null : n) as LeadRating | null }); },
    onLog: () => { if (canSave) void save(); },
    onSkip: skip,
    onPrevious: previous,
    onFocusNotes: () => notesRef.current?.focus(),
    onHelp: () => setHelp((h) => !h),
    onEscape: () => { if (draft.outcome) patch({ outcome: null }); else setHelp(false); },
  }, !!current);

  const disabledInputs = !current || current.doNotCall || showingSummary;
  const onScriptSaved = (s: CallList['script']) => setList((l) => ({ ...l, script: s }));

  return (
    <div data-testid="call-screen" className="flex min-h-0 flex-1 flex-col gap-3 pb-4 wide:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3 text-[15px]">
        <Link href={`/sales/${list.id}`} onClick={() => { void session.end(); }} className="text-muted hover:text-ppc-gold">← {list.name}</Link>
        <div className="flex items-center gap-5 tabular-nums text-muted">
          <span data-testid="queue-position">{position >= 0 ? `${position + 1} of ${queue.length} in queue` : current ? 'Not in queue' : `${queue.length} in queue`}</span>
          <span>⏱ calling for <span className="font-semibold text-foreground">{formatClock(session.seconds)}</span></span>
          {current && <span><span className="font-semibold text-foreground">{formatClock(elapsed)}</span> here</span>}
          <button type="button" onClick={() => setHelp((h) => !h)} className="rounded border border-line px-1.5 text-[12px] hover:text-ppc-gold" title="Keyboard shortcuts">?</button>
          <button type="button" onClick={() => setSettingsOpen(true)} className="rounded border border-line px-2 py-0.5 text-[13px] hover:border-ppc-gold/60 hover:text-ppc-gold" title="Pickup line and voicemail message">⚙ Settings</button>
        </div>
      </div>

      {settingsOpen && <CallSettings list={list} onClose={() => setSettingsOpen(false)} onSaved={(l) => { setList(l); setSettingsOpen(false); }} />}

      {notice && <Warning>{notice}</Warning>}
      {help && (
        <div className="rounded-xl border border-line bg-surface p-4 text-[15px]">
          <div className="mb-2 flex items-center justify-between"><span className="font-bold uppercase tracking-wide text-ppc-gold">Keyboard</span><button type="button" onClick={() => setHelp(false)} className="text-muted hover:text-ppc-gold">close</button></div>
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2 wide:grid-cols-4">
            {SHORTCUTS.map(([k, v]) => <div key={k} className="flex gap-3"><dt className="w-28 shrink-0 font-mono text-[13px] text-ppc-gold">{k}</dt><dd className="text-muted">{v}</dd></div>)}
          </dl>
        </div>
      )}

      {!current ? (
        <EmptyState
          title="Nothing left in the queue"
          hint={`${waitingOnDate} contact${waitingOnDate === 1 ? ' is' : 's are'} waiting on a future date. Open the contacts table to pick someone directly.`}
        />
      ) : (
        <div data-testid="call-columns" className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2 wide:grid-cols-[440px_minmax(0,9fr)_minmax(0,7fr)_600px] wide:grid-rows-[minmax(0,1fr)]">
          {/* Column 1 — who they are, plus the facts you get asked for */}
          <section data-testid="col-contact" className="flex min-h-0 flex-col gap-3">
            <div className={`${COLUMN} flex-1`}>
              {current.doNotCall && <div className="mb-3"><Warning>Do Not Call — this contact asked not to be contacted. Only that outcome can be logged.</Warning></div>}
              <ContactPanel contact={current} logs={contactLogs} script={list.script} linked={linked} listId={list.id} sessionsById={sessionsById} alsoIn={props.alsoIn[current.id] ?? []} showHistory={false} />
            </div>
            <div className="max-h-[40%] min-h-0 overflow-y-auto">
              <QuickFacts listId={list.id} value={list.quickFacts} onSaved={setList} />
            </div>
          </section>

          {/* Column 2 — what to say and what to ask */}
          <section data-testid="col-script" className={`${COLUMN} space-y-6`}>
            <PickupLine value={list.pickupLine} contact={current} callerName={callerName} onOpenSettings={() => setSettingsOpen(true)} />
            <OpeningPanel
              key={current.id}
              listId={list.id}
              items={opening}
              rawScript={list.script}
              checklist={draft.checklist}
              onTick={tick}
              open={openingOpen}
              onToggle={() => setOpeningOpen((o) => !o)}
              onScriptSaved={onScriptSaved}
              disabled={disabledInputs}
              voicemailScript={fillPlaceholders(list.voicemailScript, current, callerName)}
              onVoicemail={() => pick('voicemail')}
              onOpenSettings={() => setSettingsOpen(true)}
            />
            <DiscoveryPanel
              items={discoveryItems}
              linked={linked}
              jerseyManager={draft.jerseyManager}
              onJerseyManager={(p) => update((d) => ({ ...d, jerseyManager: { ...d.jerseyManager, ...p } }))}
              discovery={draft.discovery}
              onDiscovery={(p) => update((d) => ({ ...d, discovery: { ...d.discovery, ...(typeof p === 'function' ? p(d.discovery) : p) } }))}
              onAnswer={answer}
              disabled={disabledInputs}
            />
            <ClosePanel
              items={closeItems}
              checklist={draft.checklist}
              onTick={tick}
              disabled={disabledInputs}
            />
          </section>

          {/* Column 3 — what to say back */}
          <section data-testid="col-objections" className={COLUMN}>
            <ObjectionsPanel listId={list.id} items={objections} rawScript={list.script} onScriptSaved={onScriptSaved} />
          </section>

          {/* Column 4 — what happened */}
          <section data-testid="col-outcome" className="flex min-h-0 flex-col gap-3">
            <div className="rounded-xl border border-line bg-surface p-4">
              <label className="block">
                <span className="text-[13px] font-bold uppercase tracking-wide text-ppc-gold">Notes</span>
                <textarea
                  ref={notesRef}
                  className="mt-2 w-full text-[15px] leading-relaxed"
                  rows={5}
                  value={draft.notes}
                  onChange={(e) => patch({ notes: e.target.value })}
                  placeholder="What they said, what you promised…  ( / jumps here )"
                  disabled={showingSummary}
                />
              </label>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <OutcomeBoard
                draft={draft}
                onChange={patch}
                onPick={pick}
                contact={current}
                today={today}
                disabled={showingSummary}
                errors={fieldErrors}
                warnings={warnings}
                missing={missing}
                saving={saveState === 'saving'}
                error={error}
                logged={showingSummary ? loggedThisSession : null}
                editing={!!editing}
                onLog={() => { void save(); }}
                onClear={() => { patch({ outcome: null }); setError(null); if (editing) setEditing(null); }}
                onEdit={startEdit}
              />
            </div>
            <div className={`${COLUMN} flex-1`}>
              <h3 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-ppc-gold">History <span className="ml-1 text-muted">{contactLogs.length}</span></h3>
              <CallHistory contact={current} logs={contactLogs} script={list.script} sessionsById={sessionsById} />
            </div>
          </section>
        </div>
      )}

      <FooterBar
        canPrevious={history.length > 0}
        onPrevious={previous}
        canSkip={!!current}
        onSkip={skip}
        tally={tally}
        onHelp={() => setHelp((h) => !h)}
      />
    </div>
  );
}
