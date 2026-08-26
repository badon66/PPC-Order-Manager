import Link from 'next/link';
import { notFound } from 'next/navigation';
import { repo } from '@/lib/data';
import { formatTimestamp, timestampDay } from '@/lib/dates';
import { Card, Section, StatusBadge } from '@/components/ui';
import type { ChangeLogEntry } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * The full record of what happened to an order and when.
 *
 * The order page shows the twenty most recent entries with the date only,
 * which answers "what's been going on lately". This page answers the other
 * question — "when exactly did that change, and who changed it" — which is the
 * one that matters when a customer says a size is wrong and the jerseys are
 * already at the manufacturer.
 *
 * So: no truncation, times to the minute, and the before/after values spelled
 * out rather than summarised. Grouped by day, newest first, because that's how
 * you actually scan for "what happened last Tuesday".
 *
 * Entries whose actor is the client are marked, since "the customer changed
 * this themselves" and "we changed it for them" are different facts and the
 * summary line alone doesn't always make that obvious.
 */

function ValueChange({ entry }: { entry: ChangeLogEntry }) {
  if (!entry.field && entry.fromValue == null && entry.toValue == null) return null;

  const from = entry.fromValue?.trim();
  const to = entry.toValue?.trim();

  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs">
      {entry.field && <span className="font-mono text-muted">{entry.field}</span>}
      <span className="text-muted line-through decoration-red-400/50">{from || '(empty)'}</span>
      <span className="text-muted">→</span>
      <span className="font-semibold text-emerald-300">{to || '(empty)'}</span>
    </div>
  );
}

export default async function OrderHistory({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await repo.getOrder(id);
  if (!bundle) notFound();

  const { order } = bundle;
  const history = await repo.getHistory(order.id);

  // Newest first, then grouped into days. getHistory already sorts, but this
  // page must not depend on that — a store returning them the other way round
  // would silently produce a reversed timeline rather than an obvious error.
  const sorted = [...history].sort((a, b) => b.at.localeCompare(a.at));
  const days = new Map<string, ChangeLogEntry[]>();
  for (const h of sorted) {
    const key = timestampDay(h.at);
    const list = days.get(key);
    if (list) list.push(h);
    else days.set(key, [h]);
  }

  const clientEdits = sorted.filter((h) => h.actorEmail === 'client').length;

  return (
    <div className="space-y-5">
      <Link
        href={`/orders/${order.id}`}
        className="text-sm font-semibold text-muted hover:text-ppc-gold"
      >
        ← Back to {order.teamName || 'order'}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{order.teamName || 'Untitled order'}</h1>
          <p className="text-sm text-muted">
            Full history — {sorted.length} entr{sorted.length === 1 ? 'y' : 'ies'}
            {clientEdits > 0 && `, ${clientEdits} from the customer`}
          </p>
        </div>
        <StatusBadge status={order.status} size="lg" />
      </div>

      {sorted.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted">Nothing has been recorded on this order yet.</p>
        </Card>
      ) : (
        <div className="space-y-5">
          {[...days.entries()].map(([day, entries]) => (
            <Section key={day} title={day}>
              <ol className="space-y-3">
                {entries.map((h) => {
                  const byClient = h.actorEmail === 'client';
                  return (
                    <li
                      key={h.id}
                      className={`border-l-2 pl-3 ${byClient ? 'border-ppc-gold/70' : 'border-line'}`}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <span className="text-sm font-semibold">{h.summary}</span>
                        <span className="font-mono text-xs text-muted">
                          {formatTimestamp(h.at)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                        <span>{h.actorName}</span>
                        {byClient && (
                          <span className="rounded border border-ppc-gold/40 px-1 text-[10px] font-bold uppercase tracking-wide text-ppc-gold">
                            Customer
                          </span>
                        )}
                      </div>
                      <ValueChange entry={h} />
                    </li>
                  );
                })}
              </ol>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}
