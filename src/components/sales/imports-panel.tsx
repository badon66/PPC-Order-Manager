import Link from 'next/link';
import type { Contact, ImportRecord } from '@/lib/types';
import { formatTimestamp } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';

function summary(r: ImportRecord): string {
  const bits = [`${r.added} added`, `${r.merged.length} matched`];
  if (r.alsoIn.length) bits.push(`${r.alsoIn.length} also in another list`);
  if (r.skipped.length) bits.push(`${r.skipped.length} skipped`);
  if (r.warnings.length) bits.push(`${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'}`);
  if (r.scriptReplaced) bits.push('script replaced');
  return bits.join(' · ');
}

/**
 * What each upload did. The latest opens to its detail; earlier ones are one
 * line each. No 'use client' — the list page renders it on the server.
 */
export function ImportsPanel({ imports, contacts, listId }: { imports: ImportRecord[]; contacts: Contact[]; listId: string }) {
  if (imports.length === 0) return null;
  const [latest, ...earlier] = imports;
  const nameOf = (id: string) => {
    const c = contacts.find((x) => x.id === id);
    return c ? (c.contactName || c.orgName || '—') : 'Removed contact';
  };
  const tone = latest.skipped.length + latest.warnings.length > 0
    ? 'border-amber-500/50 bg-amber-500/10 text-amber-100/90'
    : 'border-line bg-surface text-muted';
  return (
    <div className="space-y-2">
      <details className={`rounded-lg border px-3.5 py-2.5 text-sm ${tone}`}>
        <summary className="cursor-pointer font-semibold">
          Last upload: {latest.fileName || '—'} — {summary(latest)}
          <span className="font-normal opacity-70"> · {formatTimestamp(latest.at, BUSINESS_TIMEZONE)} by {latest.by || '—'}</span>
        </summary>
        <div className="mt-2 space-y-2">
          {latest.merged.length > 0 && (
            <div>
              <p className="font-semibold">Matched an existing contact:</p>
              <ul className="ml-4 list-disc">
                {latest.merged.map((m, i) => (
                  <li key={i}>
                    Line {m.line} → <Link href={`/sales/${listId}/contacts/${m.contactId}`} className="font-semibold hover:text-ppc-gold">{nameOf(m.contactId)}</Link>
                    {m.filled.length ? ` — filled ${m.filled.join(', ')}` : ' — already up to date'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {latest.alsoIn.length > 0 && (
            <div>
              <p className="font-semibold">Also in another list:</p>
              <ul className="ml-4 list-disc">
                {latest.alsoIn.map((a, i) => (
                  <li key={i}>Line {a.line} is also in <Link href={`/sales/${a.listId}/contacts/${a.contactId}`} className="font-semibold hover:text-ppc-gold">{a.listName}</Link></li>
                ))}
              </ul>
            </div>
          )}
          {latest.skipped.length > 0 && (
            <div>
              <p className="font-semibold">Skipped rows (fix the sheet and re-upload):</p>
              <ul className="ml-4 list-disc">
                {latest.skipped.map((s, i) => <li key={i}>Line {s.line}: {s.reason}{s.raw ? <span className="opacity-70"> — {s.raw}</span> : null}</li>)}
              </ul>
            </div>
          )}
          {latest.warnings.length > 0 && (
            <div>
              <p className="font-semibold">Kept as typed, worth a look:</p>
              <ul className="ml-4 list-disc">
                {latest.warnings.map((w, i) => <li key={i}>Line {w.line}: {w.reason}</li>)}
              </ul>
            </div>
          )}
          {latest.merged.length + latest.alsoIn.length + latest.skipped.length + latest.warnings.length === 0 && (
            <p className="opacity-70">Nothing to flag.</p>
          )}
        </div>
      </details>
      {earlier.length > 0 && (
        <details className="rounded-lg border border-line px-3.5 py-2 text-sm text-muted">
          <summary className="cursor-pointer">Earlier uploads <span className="ml-1">{earlier.length}</span></summary>
          <ul className="mt-2 space-y-1">
            {earlier.map((r, i) => <li key={i}>{formatTimestamp(r.at, BUSINESS_TIMEZONE)} · {r.fileName || '—'} — {summary(r)}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
