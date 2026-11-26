import Link from 'next/link';
import { loadFactoryBoard } from '@/lib/factory/load';
import { allReminders, type FactoryJobCard, type ReminderTone } from '@/lib/factory/board';
import { FACTORY_STEPS, FACTORY_STEP_LABEL } from '@/lib/factory/steps';
import { balanceTotals, usd } from '@/lib/factory/money';
import { FACTORY_TEXT as T } from '@/lib/factory/text';
import { daysBetween, formatShort } from '@/lib/dates';
import { LocalTime } from '@/components/factory/local-time';

export const dynamic = 'force-dynamic';

/**
 * The factory's dashboard: every job Powerplay has sent, on one screen.
 *
 * Laid out for a desktop. The jobs are a dense table (one line each — team,
 * quantities, step, both dates, what's waiting), not cards, so twenty jobs
 * fit without scrolling. Beside it, the two lists that keep both sides up to
 * date: "To do" (what each job needs from the factory, worked out from the
 * job itself) and "What's new" (every change Powerplay made to a sent job).
 * On a narrow screen the side lists drop below the table.
 *
 * Reads only `FactoryJobCard`s — see lib/factory/board.ts. No price exists
 * on this page to leak.
 */

const TONE: Record<ReminderTone, string> = {
  late: 'border-red-500/50 bg-red-500/10 text-red-200',
  act: 'border-ppc-gold/50 bg-ppc-gold/10 text-ppc-gold',
  info: 'border-line bg-surface-2 text-muted',
};

function StepCell({ card }: { card: FactoryJobCard }) {
  const { state } = card;
  const reached = state.step ? FACTORY_STEPS.indexOf(state.step) : -1;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${state.step ? 'border-ppc-gold/60 bg-ppc-gold/10 text-ppc-gold' : 'border-sky-400/60 bg-sky-400/10 text-sky-200'}`}>
          {state.step ? FACTORY_STEP_LABEL[state.step] : card.powerplay === 'making' ? T.newBadge : 'Finished'}
        </span>
        {state.pending && (
          <span className="rounded-full border border-amber-400/60 bg-amber-400/10 px-2 py-0.5 text-[0.7rem] font-bold text-amber-200">
            {FACTORY_STEP_LABEL[state.pending.step]} · waiting
          </span>
        )}
      </div>
      {/* Six dots: how far along, at a glance down the column. */}
      <div className="mt-1.5 flex gap-1" aria-hidden>
        {FACTORY_STEPS.map((s, i) => (
          <span key={s} className={`h-1 w-5 rounded-full ${i <= reached ? 'bg-ppc-gold' : 'bg-line'}`} />
        ))}
      </div>
    </div>
  );
}

function DateCell({ date, today, done }: { date: string | null; today: string; done: boolean }) {
  if (!date) return <span className="text-muted">—</span>;
  const days = daysBetween(today, date);
  const late = !done && days < 0;
  const soon = !done && days >= 0 && days <= 7;
  return (
    <span className={late ? 'font-bold text-red-300' : soon ? 'font-semibold text-amber-200' : ''}>
      {formatShort(date)}
      {late && <span className="ml-1 text-xs font-normal">({-days}d late)</span>}
      {soon && <span className="ml-1 text-xs font-normal text-muted">({days === 0 ? 'today' : `${days}d`})</span>}
    </span>
  );
}

function JobsTable({ cards, today }: { cards: FactoryJobCard[]; today: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[54rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[0.7rem] uppercase tracking-wide text-muted">
            <th className="px-3 py-2">Job</th>
            <th className="px-3 py-2">Quantities</th>
            <th className="px-3 py-2">{T.step}</th>
            <th className="px-3 py-2">{T.due}</th>
            <th className="px-3 py-2">{T.yourDate}</th>
            <th className="px-3 py-2 text-right">Cost · owed (USD)</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => {
            const finished = c.done || c.state.step === 'completed' || c.state.step === 'shipped';
            return (
              <tr key={c.id} className="border-b border-line/50 last:border-0 hover:bg-surface-2/60">
                <td className="px-3 py-2.5">
                  <Link href={`/factory/jobs/${c.id}`} className="font-bold hover:text-ppc-gold">
                    {c.teamName}
                  </Link>
                  <div className="text-xs text-muted">
                    {c.jobNumber ? `Job ${c.jobNumber}` : 'No job number'}
                    {c.sentAt ? ` · sent ${formatShort(c.sentAt)}` : ''}
                  </div>
                </td>
                <td className="px-3 py-2.5 tabular-nums">
                  <span className="font-semibold">{c.jerseys}</span> <span className="text-muted">jerseys</span>
                  {c.sockPairs > 0 && <> · <span className="font-semibold">{c.sockPairs}</span> <span className="text-muted">socks</span></>}
                  {c.pantShells > 0 && <> · <span className="font-semibold">{c.pantShells}</span> <span className="text-muted">shells</span></>}
                  {c.keepers > 0 && <div className="text-xs text-amber-300">+ {c.keepers} to keep for Powerplay</div>}
                </td>
                <td className="px-3 py-2.5"><StepCell card={c} /></td>
                <td className="px-3 py-2.5"><DateCell date={c.neededBy} today={today} done={finished} /></td>
                <td className="px-3 py-2.5"><DateCell date={c.state.finishDate || null} today={today} done={finished} /></td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {c.money.cost === null ? (
                    <Link href={`/factory/jobs/${c.id}`} className="rounded-full border border-ppc-gold/60 bg-ppc-gold/10 px-2 py-0.5 text-xs font-bold text-ppc-gold">Enter cost</Link>
                  ) : (
                    <>
                      <span className="font-semibold">{usd(c.money.total)}</span>
                      <div className={`text-xs ${c.money.dueNow > 0 ? 'font-semibold text-ppc-gold' : 'text-muted'}`}>
                        {c.money.balance <= 0 ? 'Paid ✓' : c.money.dueNow > 0 ? `${usd(c.money.dueNow)} due now` : `${usd(c.money.balance)} later`}
                      </div>
                    </>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {c.newChanges > 0 && (
                      <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white" title="Changes from Powerplay you haven't opened">
                        {c.newChanges} new
                      </span>
                    )}
                    <Link
                      href={`/factory/jobs/${c.id}`}
                      className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold hover:border-ppc-gold/60 hover:text-ppc-gold"
                    >
                      {T.open}
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function FactoryDashboard() {
  const { cards, today } = await loadFactoryBoard();
  const active = cards.filter((c) => !c.done);
  const done = cards.filter((c) => c.done);
  const reminders = allReminders(cards, today);
  const feed = cards
    .flatMap((c) => c.changes.map((ch) => ({ ...ch, teamName: c.teamName })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 40);
  const unread = feed.filter((f) => f.isNew).length;
  // Reminders arrive most urgent first; grouped by job in that order, each job taking its most urgent tone.
  const todoJobs: Array<{ orderId: string; teamName: string; tone: ReminderTone; lines: typeof reminders }> = [];
  for (const r of reminders) {
    const job = todoJobs.find((j) => j.orderId === r.orderId);
    if (job) job.lines.push(r);
    else todoJobs.push({ orderId: r.orderId, teamName: r.teamName, tone: r.tone, lines: [r] });
  }

  // What Powerplay owes, across every job (shipped ones too — money can outlast the job).
  const owed = balanceTotals(cards.map((c) => c.money));

  // How many jobs sit at each step — the strip across the top.
  const counts = [
    { label: T.newBadge, n: active.filter((c) => !c.state.step && c.powerplay === 'making').length },
    ...FACTORY_STEPS.map((s) => ({ label: FACTORY_STEP_LABEL[s], n: active.filter((c) => c.state.step === s).length })),
    { label: 'Waiting for approval', n: active.filter((c) => c.state.pending).length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{T.jobs}</h1>
          <p className="text-sm text-muted">
            {active.length} open job{active.length === 1 ? '' : 's'}
            {reminders.filter((r) => r.tone !== 'info').length > 0 && ` · ${reminders.filter((r) => r.tone !== 'info').length} to do`}
            {unread > 0 && ` · ${unread} new from Powerplay`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {counts.map((c) => (
            <span
              key={c.label}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${c.n ? 'border-line bg-surface-2' : 'border-line/50 text-muted opacity-60'}`}
            >
              {c.label} <span className="ml-1 tabular-nums text-ppc-gold">{c.n}</span>
            </span>
          ))}
        </div>
      </div>

      {cards.length > 0 && (
        <div className="flex flex-wrap items-stretch gap-2 text-sm">
          <div className="rounded-xl border-2 border-ppc-gold bg-ppc-gold/10 px-4 py-2">
            <span className="text-xs font-bold uppercase tracking-wide text-ppc-gold">Due now</span>
            <span className="ml-3 text-xl font-bold tabular-nums">{usd(owed.dueNow)}</span>
          </div>
          <div className="rounded-xl border border-line bg-surface px-4 py-2">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">Total outstanding</span>
            <span className="ml-3 text-xl font-bold tabular-nums">{usd(owed.outstanding)}</span>
          </div>
          <div className="rounded-xl border border-line bg-surface px-4 py-2">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">Paid by Powerplay</span>
            <span className="ml-3 text-xl font-bold tabular-nums">{usd(owed.paid)}</span>
          </div>
          <p className="self-center text-xs text-muted">
            US dollars. Half of a job is due while it&apos;s being made; all of it once it&apos;s Completed.
            {owed.credit > 0 && ` Includes ${usd(owed.credit)} Powerplay paid ahead.`}
          </p>
        </div>
      )}

      {cards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">{T.noJobs}</p>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
          <div className="min-w-0 space-y-4">
            <JobsTable cards={active} today={today} />
            {done.length > 0 && (
              <details className="rounded-xl border border-line bg-surface">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-muted hover:text-ppc-gold">
                  Shipped and closed ({done.length})
                </summary>
                <div className="p-2 pt-0"><JobsTable cards={done} today={today} /></div>
              </details>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <section className="rounded-xl border border-line bg-surface">
              <h2 className="border-b border-line px-3 py-2 text-sm font-bold uppercase tracking-wide text-ppc-gold">
                {T.todo} {todoJobs.length > 0 && <span className="ml-1 text-muted">({todoJobs.length} job{todoJobs.length === 1 ? '' : 's'})</span>}
              </h2>
              {reminders.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted">{T.todoEmpty}</p>
              ) : (
                // One block per job, its lines inside: a job needing three things is one row, not three.
                <ul className="max-h-[26rem] space-y-1.5 overflow-y-auto p-2">
                  {todoJobs.map((j) => (
                    <li key={j.orderId}>
                      <Link href={`/factory/jobs/${j.orderId}`} className={`block rounded-lg border px-2.5 py-1.5 text-sm hover:brightness-125 ${TONE[j.tone]}`}>
                        <span className="font-bold text-foreground">{j.teamName}</span>
                        {j.lines.map((line, i) => (
                          <span key={i} className={`block text-xs ${line.tone === 'late' ? 'text-red-200' : line.tone === 'info' ? 'text-muted' : ''}`}>• {line.text}</span>
                        ))}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-line bg-surface">
              <h2 className="border-b border-line px-3 py-2 text-sm font-bold uppercase tracking-wide text-ppc-gold">
                {T.whatsNew} {unread > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white">{unread}</span>}
              </h2>
              {feed.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted">{T.whatsNewEmpty}</p>
              ) : (
                <ul className="max-h-[30rem] divide-y divide-line/50 overflow-y-auto">
                  {feed.map((f) => (
                    <li key={f.id}>
                      <Link href={`/factory/jobs/${f.orderId}`} className="block px-3 py-2 text-sm hover:bg-surface-2/60">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-bold">
                            {f.isNew && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-red-500" aria-label="new" />}
                            {f.teamName}
                          </span>
                          <span className="shrink-0 text-[0.7rem] text-muted"><LocalTime iso={f.at} /></span>
                        </span>
                        <span className={`block text-xs ${f.isNew ? 'text-foreground' : 'text-muted'}`}>{f.text}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
