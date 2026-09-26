import { formatLong } from '@/lib/dates';
import type { TimelineStep } from '@/lib/data/timeline';

/**
 * Where the order is, as a vertical list. Done steps ticked, the current step
 * gold with its line and detail, the rest grey. Server component, no state.
 */
export function Timeline({ steps, compact = false }: { steps: TimelineStep[]; compact?: boolean }) {
  return (
    <ol>
      {steps.map((s, n) => {
        const last = n === steps.length - 1;
        const dot =
          s.state === 'done'
            ? 'bg-ppc-gold text-black'
            : s.state === 'current'
              ? 'border-2 border-ppc-gold bg-background text-ppc-gold'
              : 'border border-line bg-surface text-muted';
        const rail = s.state === 'done' ? 'bg-ppc-gold/60' : 'bg-line';
        return (
          <li key={s.key} className="relative flex gap-3" aria-current={s.state === 'current' ? 'step' : undefined}>
            <div className="flex w-6 shrink-0 flex-col items-center">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${dot}`} aria-hidden>
                {s.state === 'done' ? '✓' : s.state === 'current' ? '●' : ''}
              </span>
              {!last && <span className={`w-px flex-1 ${rail}`} style={{ minHeight: compact ? 14 : 22 }} />}
            </div>
            <div className={`min-w-0 flex-1 ${last ? 'pb-0' : compact ? 'pb-3' : 'pb-5'}`}>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <p className={`text-sm ${s.state === 'current' ? 'font-bold text-ppc-gold' : s.state === 'done' ? 'font-semibold' : 'text-muted'}`}>
                  {s.label}
                </p>
                {s.date && <p className="text-xs text-muted">{formatLong(s.date)}</p>}
              </div>
              {s.state === 'current' && s.copy && <p className="mt-0.5 text-sm text-foreground">{s.copy}</p>}
              {s.state === 'done' && !compact && s.copy && s.key === 'proof' && <p className="mt-0.5 text-xs text-muted">{s.copy}</p>}
              {s.detail && <p className="mt-1 text-sm font-semibold">{s.detail}</p>}
              {s.note && <p className="mt-1 text-xs text-muted">{s.note}</p>}
              {s.href && (
                <a href={s.href} className="mt-1 inline-block text-sm font-semibold text-ppc-gold hover:underline">
                  {s.linkLabel} →
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
