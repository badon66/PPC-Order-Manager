import Link from 'next/link';
import type { BalanceRow } from '@/lib/factory/balance';
import { inCurrency, usd } from '@/lib/factory/money';

/** KEENAN ONLY: the verdict of the cost check, in words. */
export function CostCheckNote({ check }: { check: BalanceRow['check'] }) {
  if (check.kind === 'none') return <span className="text-muted">—</span>;
  if (check.kind === 'unknown') {
    return <span className="text-xs text-muted" title={check.expected.unpriced.join(', ')}>No standard rate for these items</span>;
  }
  const { expected, diff, partial } = check;
  const lines = expected.lines.map((l) => `${l.qty} × ${l.label}${l.each === null ? ' (no rate)' : ` @ ${usd(l.each)}`}`).join('\n');
  return (
    <span title={lines} className="block">
      <span className="tabular-nums">{usd(expected.cents)}</span>
      {check.kind === 'flag' ? (
        <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[0.7rem] font-bold text-white">
          ⚑ {diff > 0 ? `${usd(diff)} over` : `${usd(-diff)} under`}
        </span>
      ) : (
        <span className="ml-1.5 text-xs text-emerald-300">{diff === 0 ? '✓ matches' : `✓ ${diff > 0 ? '+' : '−'}${usd(Math.abs(diff))}`}</span>
      )}
      {partial && <span className="block text-[0.7rem] text-amber-200">Leaves out: {expected.unpriced.join(', ')}</span>}
    </span>
  );
}

/** KEENAN ONLY: one job's factory money on the order page. */
export function FactoryMoneySummary({ row, usdToCad }: { row: BalanceRow; usdToCad: number | null }) {
  const m = row.card.money;
  if (m.cost === null && m.paid === 0) {
    return (
      <p className="text-sm text-muted">
        Factory cost: <span className="font-semibold text-foreground">not entered yet</span> — the factory is asked for it on their job page.
      </p>
    );
  }
  const cell = (label: string, value: React.ReactNode, strong = false) => (
    <div className="rounded-lg border border-line px-3 py-2">
      <p className="text-[0.7rem] uppercase tracking-wide text-muted">{label}</p>
      <p className={`tabular-nums ${strong ? 'text-lg font-bold text-ppc-gold' : 'font-semibold'}`}>{value}</p>
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {cell('Factory cost', m.cost === null ? 'not entered' : `${usd(m.cost)}${m.shipping ? ` + ${usd(m.shipping)} ship` : ''}`)}
        {cell('At your rates', <CostCheckNote check={row.check} />)}
        {cell('Paid', usd(m.paid))}
        {cell('Due now', usd(m.dueNow), m.dueNow > 0)}
        {cell(m.balance < 0 ? 'Paid ahead' : 'Outstanding', usd(Math.abs(m.balance)))}
        {cell('Your profit', row.profit === null ? '—' : `${usd(row.profit)} CAD`)}
      </div>
      <p className="text-xs text-muted">
        US dollars{usdToCad ? ` · outstanding is about ${inCurrency(Math.max(0, m.balance), 'cad', usdToCad)}` : ''}.{' '}
        {m.fullDue ? 'The job is finished, so the full amount is due.' : 'Half is due until you approve Completed, then the rest.'}{' '}
        <Link href="/balance" className="font-semibold text-ppc-gold hover:underline">Factory balance →</Link>
      </p>
    </div>
  );
}
