import Link from 'next/link';
import { loadFactoryBalance } from '@/lib/factory/balance';
import { inCurrency, usd, type JobPayment } from '@/lib/factory/money';
import { FACTORY_STEP_LABEL } from '@/lib/factory/steps';
import { formatShort, formatTimestamp } from '@/lib/dates';
import { CostCheckNote } from '@/components/factory/money-summary';
import { SendMoneyForm, UndoPayment } from '@/components/factory/send-money';

export const dynamic = 'force-dynamic';

/**
 * KEENAN'S factory balance: what he owes Michael, job by job.
 *
 * Behind the admin code (not under /factory — the factory cookie can't open
 * it). The factory sees its own cost, what was paid and what's owed on its
 * dashboard; the cost check against the standard rates and the profit column
 * exist only here and on the order page.
 */
export default async function BalancePage({ searchParams }: { searchParams: Promise<{ cur?: string }> }) {
  const { cur: curRaw } = await searchParams;
  const { rows, totals, settings } = await loadFactoryBalance();
  const rate = settings.usdToCad;
  const cur: 'usd' | 'cad' = curRaw === 'cad' && rate ? 'cad' : 'usd';
  const show = (cents: number) => inCurrency(cents, cur, rate);

  // Open: still being made, or money still moving on it. The rest (shipped and square, or old jobs never costed) folds away.
  const isOpen = (r: (typeof rows)[number]) => !r.card.done || r.card.money.balance !== 0;
  const open = rows.filter(isOpen);
  const settled = rows.filter((r) => !isOpen(r));
  const uncosted = open.filter((r) => r.card.money.cost === null).length;
  const flagged = rows.filter((r) => r.check.kind === 'flag').length;

  // One line per payment, however many jobs it was split across.
  const payments = new Map<string, { id: string; at: string; by: string; note: string; cents: number; jobs: string[] }>();
  for (const r of rows) {
    for (const p of r.card.money.payments as JobPayment[]) {
      const got = payments.get(p.paymentId) ?? { id: p.paymentId, at: p.at, by: p.by, note: p.note, cents: 0, jobs: [] };
      got.cents += p.cents;
      got.jobs.push(`${r.order.teamName || 'Untitled'} ${usd(p.cents)}`);
      payments.set(p.paymentId, got);
    }
  }
  const paymentList = [...payments.values()].sort((a, b) => b.at.localeCompare(a.at));

  const table = (list: typeof rows) => (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[52rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[0.7rem] uppercase tracking-wide text-muted">
            <th className="px-3 py-2">Job</th>
            <th className="px-3 py-2">Factory cost</th>
            <th className="px-3 py-2">At your rates (USD)</th>
            <th className="px-3 py-2 text-right">Paid</th>
            <th className="px-3 py-2 text-right">Due now</th>
            <th className="px-3 py-2 text-right">Outstanding</th>
            <th className="px-3 py-2 text-right">Your profit</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => {
            const m = r.card.money;
            const step = r.card.state.step ? FACTORY_STEP_LABEL[r.card.state.step] : r.card.powerplay === 'making' ? 'New' : 'Finished';
            return (
              <tr key={r.order.id} className="border-b border-line/50 align-top last:border-0">
                <td className="px-3 py-2.5">
                  <Link href={`/orders/${r.order.id}#factory`} className="font-bold hover:text-ppc-gold">{r.order.teamName || 'Untitled order'}</Link>
                  <div className="text-xs text-muted">
                    {step}{r.card.sentAt ? ` · sent ${formatShort(r.card.sentAt)}` : ''}{m.fullDue ? ' · full amount due' : ' · half due'}
                  </div>
                </td>
                <td className="px-3 py-2.5 tabular-nums">
                  {m.cost === null ? <span className="font-semibold text-amber-200">Not entered</span> : <span className="font-semibold">{show(m.cost)}</span>}
                  {m.shipping > 0 && <div className="text-xs text-muted">+ {show(m.shipping)} extra shipping</div>}
                </td>
                <td className="px-3 py-2.5"><CostCheckNote check={r.check} /></td>
                <td className="px-3 py-2.5 text-right tabular-nums">{m.paid ? show(m.paid) : <span className="text-muted">—</span>}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${m.dueNow > 0 ? 'font-bold text-ppc-gold' : 'text-muted'}`}>{m.dueNow ? show(m.dueNow) : '—'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {m.balance < 0 ? <span className="text-emerald-300">{show(-m.balance)} ahead</span> : m.balance ? show(m.balance) : <span className="text-muted">{m.cost === null ? '—' : 'Paid ✓'}</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.profit === null ? <span className="text-muted">—</span> : `${usd(r.profit)} CAD`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const pill = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-bold ${active ? 'bg-ppc-gold text-black' : 'border border-line text-muted hover:text-ppc-gold'}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Factory balance</h1>
          <p className="text-sm text-muted">What you owe the factory. They see the cost, paid and owed numbers too — never your prices or profit.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href="/balance" className={pill(cur === 'usd')}>USD</Link>
          {rate ? (
            <Link href="/balance?cur=cad" className={pill(cur === 'cad')}>CAD</Link>
          ) : (
            <Link href="/settings" className="text-xs font-semibold text-muted hover:text-ppc-gold">Set the exchange rate to see CAD →</Link>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border-2 border-ppc-gold bg-ppc-gold/10 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ppc-gold">Due now</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{show(totals.dueNow)}</p>
          <p className="mt-1 text-xs text-muted">Half of each job in progress, all of each finished job, less what you&apos;ve paid.</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Total outstanding</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{show(totals.outstanding)}</p>
          <p className="mt-1 text-xs text-muted">Everything not yet paid on every job{totals.credit > 0 ? `, after ${show(totals.credit)} paid ahead` : ''}.</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Paid so far</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{show(totals.paid)}</p>
          <p className="mt-1 text-xs text-muted">
            {cur === 'cad' && rate ? `Converted at 1 USD = ${rate} CAD (Settings). ` : ''}
            {uncosted > 0 ? `${uncosted} open job${uncosted === 1 ? ' has' : 's have'} no cost yet. ` : ''}
            {flagged > 0 ? `${flagged} cost${flagged === 1 ? '' : 's'} flagged.` : ''}
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ppc-gold">I sent money</h2>
        <SendMoneyForm jobs={rows.filter((r) => !r.card.done || r.card.money.balance > 0).map((r) => ({ id: r.order.id, label: `${r.order.teamName || 'Untitled'}${r.card.money.balance > 0 ? ` — ${usd(r.card.money.balance)} outstanding` : ''}` }))} />
        <p className="mt-2 text-xs text-muted">Always in US dollars. “The whole balance” pays what&apos;s due first, oldest job first. The factory gets a notice and their balance drops right away.</p>
      </section>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">No jobs have gone to the factory yet.</p>
      ) : (
        <>
          {table(open)}
          {settled.length > 0 && (
            <details className="rounded-xl border border-line bg-surface">
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-muted hover:text-ppc-gold">Shipped and settled ({settled.length})</summary>
              <div className="p-2 pt-0">{table(settled)}</div>
            </details>
          )}
        </>
      )}

      <section className="rounded-xl border border-line bg-surface">
        <h2 className="border-b border-line px-3 py-2 text-sm font-bold uppercase tracking-wide text-ppc-gold">Payments you sent</h2>
        {paymentList.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted">None recorded yet.</p>
        ) : (
          <ul className="divide-y divide-line/50">
            {paymentList.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-bold tabular-nums">{usd(p.cents)} USD</span>
                  <span className="text-muted"> · {p.jobs.join(' · ')}</span>
                  {p.note && <span className="block text-xs text-muted">“{p.note}”</span>}
                </span>
                <span className="flex items-center gap-3 text-xs text-muted">
                  {formatTimestamp(p.at)}
                  <UndoPayment paymentId={p.id} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
