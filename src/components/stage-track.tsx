import { STATUS_META } from '@/lib/constants';
import { formatLong, formatShort } from '@/lib/dates';
import { TRACK_STATUSES, type StageSummary } from '@/lib/data/stage-track';
import { paymentLabel, type PaymentState } from '@/lib/payments';
import type { OrderStatus } from '@/lib/types';

/**
 * Where the order is, drawn for Keenan.
 *
 * Two parts. The TRACK: every stage as a dot on one line, done ones filled,
 * the current one ringed and a size bigger, with a short fact under each (the
 * day it happened, "In" for a deposit, "Out Oct 1" for the factory). It reads
 * left to right as the order moves, and on the ultrawide it has the room to.
 *
 * The NOW panel under it: four cards that answer, in order, what's happening,
 * what moves it on, when it's due, and what on this order needs a hand. The
 * last card is the point of the panel. A quiet green "Nothing outstanding" is
 * the state you want every order in; anything else is the job.
 *
 * Server component. KEENAN ONLY: the value and payments on it never reach a
 * public page (publicViewOf doesn't carry them; the leak test checks).
 */

export function StageTrack({ summary }: { summary: StageSummary }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <ol className="flex min-w-[52rem] items-start" aria-label="Order stages">
        {summary.nodes.map((n, i) => {
          const first = i === 0;
          const last = i === summary.nodes.length - 1;
          const leftOn = n.state !== 'upcoming';
          const rightOn = n.state === 'done';
          const meta = STATUS_META[n.status];
          return (
            <li key={n.status} className="flex min-w-0 flex-1 flex-col items-center" aria-current={n.state === 'current' ? 'step' : undefined}>
              <div className="flex h-10 w-full items-center">
                <span className={`h-0.5 flex-1 ${first ? 'opacity-0' : leftOn ? 'bg-ppc-gold' : 'bg-line'}`} />
                {n.state === 'current' ? (
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center" title={meta.label}>
                    <span className="absolute inset-0 animate-pulse rounded-full bg-ppc-gold/25" aria-hidden />
                    <span className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-ppc-gold bg-background text-base">
                      {meta.emoji}
                    </span>
                  </span>
                ) : n.state === 'done' ? (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ppc-gold text-sm font-black text-black" title={meta.label}>
                    ✓
                  </span>
                ) : (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-xs text-muted" title={meta.label}>
                    {meta.emoji}
                  </span>
                )}
                <span className={`h-0.5 flex-1 ${last ? 'opacity-0' : rightOn ? 'bg-ppc-gold' : 'bg-line'}`} />
              </div>
              <div className="mt-2 px-1 text-center">
                <div
                  className={`text-xs leading-tight ${
                    n.state === 'current' ? 'font-bold text-ppc-gold' : n.state === 'done' ? 'font-semibold' : 'text-muted'
                  }`}
                >
                  {n.label}
                </div>
                <div className={`mt-0.5 text-[0.7rem] leading-tight tabular-nums ${n.state === 'current' ? 'text-ppc-gold/80' : 'text-muted'}`}>
                  {n.fact ?? ' '}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function StageNow({
  summary,
  payments,
  valueLabel,
  productionStart = null,
  productionFinish = null,
}: {
  summary: StageSummary;
  payments: PaymentState;
  /** Already formatted. Keenan's page only. */
  valueLabel: string;
  productionStart?: string | null;
  productionFinish?: string | null;
}) {
  const meta = STATUS_META[summary.current];
  const f = summary.finish;
  const finishTone =
    f.tone === 'overdue'
      ? 'border-red-500/60 bg-red-500/10'
      : f.tone === 'due-soon'
        ? 'border-amber-400/60 bg-amber-500/10'
        : f.tone === 'done'
          ? 'border-emerald-500/50 bg-emerald-500/10'
          : 'border-line bg-surface-2';
  const finishBig =
    f.tone === 'done'
      ? f.date ? formatLong(f.date) : '—'
      : f.date ? formatLong(f.date) : 'Not set';
  const finishSub =
    f.tone === 'done'
      ? summary.current === 'completed' ? 'Completed' : 'Shipped'
      : f.delta === null
        ? 'The production queue can’t see this order without one.'
        : f.delta < 0
          ? `${Math.abs(f.delta)} day${Math.abs(f.delta) === 1 ? '' : 's'} past`
          : f.delta === 0
            ? 'Today'
            : `in ${f.delta} day${f.delta === 1 ? '' : 's'}`;
  const dots = [payments.initialDeposit, payments.productionDeposit, payments.finalPayment];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-xl border-2 border-ppc-gold bg-ppc-gold/10 p-4">
        <div className="text-[0.65rem] font-bold uppercase tracking-widest text-ppc-gold/80">Now</div>
        <div className="mt-1 flex items-center gap-2 text-xl font-black text-ppc-gold">
          <span aria-hidden>{meta.emoji}</span> {meta.label}
        </div>
        <p className="mt-1 text-sm">{summary.headline}</p>
        <p className="mt-2 text-xs text-muted">
          {summary.daysInStage !== null && summary.inStageSince
            ? `${summary.daysInStage === 0 ? 'Since today' : `${summary.daysInStage} day${summary.daysInStage === 1 ? '' : 's'} here`} · since ${formatShort(summary.inStageSince)}`
            : ''}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ppc-gold/30 pt-3 text-sm">
          <span className="font-bold tabular-nums">{valueLabel}</span>
          <span className="inline-flex items-center gap-1 text-xs text-muted" title={paymentLabel(payments)}>
            {dots.map((on, i) => (
              <span key={i} aria-hidden className={`inline-block h-2 w-2 rounded-full ${on ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
            ))}
            <span className={payments.initialDeposit ? 'text-emerald-300' : ''}>{paymentLabel(payments)}</span>
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <div className="text-[0.65rem] font-bold uppercase tracking-widest text-muted">Next</div>
        <p className="mt-1.5 text-sm leading-snug">{summary.next}</p>
      </div>

      <div className={`rounded-xl border p-4 ${finishTone}`}>
        <div className="text-[0.65rem] font-bold uppercase tracking-widest text-muted">
          {f.tone === 'done' ? 'Finished' : 'Estimated finish'}
        </div>
        <div className={`mt-1 text-xl font-black tabular-nums ${f.tone === 'overdue' ? 'text-red-200' : f.tone === 'due-soon' ? 'text-amber-200' : f.tone === 'done' ? 'text-emerald-200' : ''}`}>
          {finishBig}
        </div>
        <p className="mt-0.5 text-xs text-muted">{finishSub}</p>
        {(productionStart || productionFinish) && (
          <p className="mt-2 border-t border-line/60 pt-2 text-xs text-muted">
            Production {productionStart ? formatShort(productionStart) : '?'} → {productionFinish ? formatShort(productionFinish) : 'not finished'}
          </p>
        )}
      </div>

      <div className={`rounded-xl border p-4 ${summary.attention.length ? 'border-amber-400/60 bg-amber-500/10' : 'border-emerald-500/50 bg-emerald-500/10'}`}>
        <div className="text-[0.65rem] font-bold uppercase tracking-widest text-muted">Needs a hand</div>
        {summary.attention.length === 0 ? (
          <p className="mt-1.5 text-sm font-semibold text-emerald-200">Nothing outstanding ✓</p>
        ) : (
          <ul className="mt-1.5 space-y-1 text-sm text-amber-100">
            {summary.attention.map((a) => (
              <li key={a} className="flex gap-1.5 leading-snug">
                <span aria-hidden>•</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Every date on the order, in the order they happen. The quick-edit popup
 * shows the same list; this is the one on the order page. Blank rungs stay,
 * muted, so a missing date is visibly missing rather than silently absent.
 */
export function DateLadder({
  rungs,
}: {
  rungs: Array<[label: string, date: string | null]>;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      {rungs.map(([label, d]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line/50 py-1.5">
          <dt className="text-muted">{label}</dt>
          <dd className={d ? 'font-semibold tabular-nums' : 'text-muted'}>{d ? formatLong(d) : '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The same track as a thin meter, for a board card: one segment per stage,
 * filled up to and including the current one. Reads the position without
 * reading the label.
 */
export function StageMeter({ status }: { status: OrderStatus }) {
  const here = STATUS_META[status === 'incomplete' ? 'draft' : status].order;
  return (
    <div className="flex gap-0.5" aria-hidden title={STATUS_META[status].label}>
      {TRACK_STATUSES.map((s) => {
        const p = STATUS_META[s].order;
        const fill = p < here ? 'bg-ppc-gold/70' : p === here ? 'bg-ppc-gold' : 'bg-line';
        return <span key={s} className={`h-1 flex-1 rounded-sm ${fill}`} />;
      })}
    </div>
  );
}
