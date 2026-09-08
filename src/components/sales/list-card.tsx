import type { CallList, Contact } from '@/lib/types';
import type { CalendarDate } from '@/lib/dates';
import { formatShort, timestampDay } from '@/lib/dates';
import { BUSINESS_TIMEZONE, CALL_OUTCOME_META } from '@/lib/constants';
import { isClosed } from '@/lib/data/sales-logic';
import { Button, Card } from '@/components/ui';
import { DeleteListButton } from './delete-list-button';

export function ListCard({ list, contacts, today }: { list: CallList; contacts: Contact[]; today: CalendarDate }) {
  const total = contacts.length;
  const called = contacts.filter((c) => c.callCount > 0).length;
  const reached = contacts.filter((c) => c.lastOutcome && CALL_OUTCOME_META[c.lastOutcome].group === 'talked').length;
  const voicemails = contacts.filter((c) => c.lastOutcome === 'voicemail').length;
  const dueToday = contacts.filter((c) => c.callCount > 0 && !c.doNotCall && !!c.nextCallDate && c.nextCallDate <= today && !isClosed(c)).length;
  const dnc = contacts.filter((c) => c.doNotCall).length;
  const pct = total ? Math.round((called / total) * 100) : 0;
  const latest = list.imports[0];
  const problems = latest ? latest.skipped.length + latest.warnings.length : 0;

  return (
    <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-ppc-gold/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-bold">{list.name}</h3>
          <p className="text-xs text-muted">
            Created {formatShort(timestampDay(list.createdAt, BUSINESS_TIMEZONE))} by {list.createdBy || '—'}
            {' · '}{list.imports.length} upload{list.imports.length === 1 ? '' : 's'}
            {problems > 0 && <> · <span className="text-amber-300">{problems} import note{problems === 1 ? '' : 's'}</span></>}
          </p>
        </div>
        <DeleteListButton listId={list.id} name={list.name} />
      </div>

      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold">{called} of {total} called</span>
          <span className="tabular-nums text-muted">{pct}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-ppc-gold transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <Count label="Reached" n={reached} />
        <Count label="Voicemail" n={voicemails} />
        <Count label="Due today" n={dueToday} accent />
        <Count label="Do not call" n={dnc} />
      </dl>

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Button href={`/sales/${list.id}/call`} variant="primary">Start calling</Button>
        <Button href={`/sales/${list.id}`}>Contacts</Button>
        <Button href={`/api/sales/${list.id}/export.csv`}>Export CSV</Button>
      </div>
    </Card>
  );
}

function Count({ label, n, accent = false }: { label: string; n: number; accent?: boolean }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className={`font-semibold tabular-nums ${accent && n > 0 ? 'text-ppc-gold' : ''}`}>{n}</dd>
    </div>
  );
}
