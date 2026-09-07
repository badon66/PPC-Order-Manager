'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CallList, CallLog, Contact } from '@/lib/types';
import type { CalendarDate } from '@/lib/dates';
import { skipContact } from '@/app/sales/actions';
import { applicableItems, fillPlaceholders } from '@/lib/sales/script';
import { isClosed } from '@/lib/data/sales-logic';
import { TextArea } from '@/components/order-form/fields';
import { EmptyState, Warning } from '@/components/ui';
import { useCallerName } from '../use-caller-name';
import { ContactPanel } from './contact-panel';
import { ScriptPanel } from './script-panel';
import { useDraft } from './use-draft';
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

export function CallView(props: CallViewProps) {
  const { list, today } = props;
  const [callerName] = useCallerName(props.callerDefault);
  const [contacts, setContacts] = useState<Record<string, Contact>>(() => Object.fromEntries(props.contacts.map((c) => [c.id, c])));
  const [logs] = useState<CallLog[]>(props.logs);
  const [queue, setQueue] = useState<string[]>(props.queue);
  const [currentId, setCurrentId] = useState<string | null>(props.startId);
  const [history, setHistory] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const session = useSessionTimer(list.id);
  const { draft, patch } = useDraft(currentId);
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

  const goTo = useCallback((id: string | null) => {
    setHistory((h) => (currentId ? [...h, currentId] : h));
    setCurrentId(id);
    setNotice(null);
  }, [currentId]);

  const nextAfter = useCallback((id: string | null, q: string[]) => q.find((x) => x !== id) ?? null, []);

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
    setNotice(null);
  }

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
                disabled={current.doNotCall}
              />
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <TextArea label="Notes" value={draft.notes} onChange={(v) => patch({ notes: v })} rows={4} placeholder="What they said, what you promised…" />
              <p className="mt-1 text-xs text-muted">Drafts save automatically on this device.</p>
            </div>
          </section>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex gap-2">
            <button type="button" disabled={history.length === 0} onClick={previous} className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-semibold hover:border-ppc-gold/60 disabled:opacity-30">← Previous</button>
            <button type="button" disabled={!current} onClick={skip} className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-semibold hover:border-ppc-gold/60 disabled:opacity-30">Skip →</button>
          </div>
          <span className="text-xs text-muted">Outcome & save arrive in the next step</span>
        </div>
      </div>
    </div>
  );
}
