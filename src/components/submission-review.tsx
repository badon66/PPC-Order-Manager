'use client';

import { useState, useTransition } from 'react';
import type { ClientRosterSubmission, RosterEntry } from '@/lib/types';
import { CLIENT_LINK_SECTION_META, type ClientLinkSections } from '@/lib/types';
import { acceptClientSubmission } from '@/app/orders/actions';
import { formatShort } from '@/lib/dates';

/**
 * Review a client submission before it touches the order.
 *
 * Shows exactly what came in, flags players who look like duplicates of what's
 * already on the roster (same number, or same name), and does nothing until
 * Accept is clicked. Multiple submissions are listed newest-first; each is
 * accepted independently, so a correction and a top-up are both handled by
 * "look at it, decide, click".
 */
export function SubmissionReview({
  orderId,
  submissions,
  currentRoster,
}: {
  orderId: string;
  submissions: ClientRosterSubmission[];
  currentRoster: RosterEntry[];
}) {
  const pending = submissions.filter((s) => !s.acceptedAt);
  const accepted = submissions.filter((s) => s.acceptedAt);
  const [showAccepted, setShowAccepted] = useState(false);

  if (submissions.length === 0) {
    return <p className="text-sm text-muted">Nothing submitted by the client yet.</p>;
  }

  return (
    <div className="space-y-4">
      {pending.length === 0 && (
        <p className="text-sm text-muted">No submissions waiting for review.</p>
      )}
      {pending.map((s) => (
        <SubmissionCard key={s.id} s={s} orderId={orderId} currentRoster={currentRoster} />
      ))}

      {accepted.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowAccepted((v) => !v)}
            className="text-xs font-semibold text-muted hover:text-ppc-gold"
          >
            {showAccepted ? '▾' : '▸'} {accepted.length} already accepted
          </button>
          {showAccepted && (
            <div className="mt-2 space-y-3">
              {accepted.map((s) => (
                <SubmissionCard key={s.id} s={s} orderId={orderId} currentRoster={currentRoster} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubmissionCard({
  s,
  orderId,
  currentRoster,
}: {
  s: ClientRosterSubmission;
  orderId: string;
  currentRoster: RosterEntry[];
}) {
  const [pending, start] = useTransition();
  const done = Boolean(s.acceptedAt);

  const numbers = new Set(currentRoster.map((r) => r.number).filter(Boolean));
  const names = new Set(
    currentRoster.map((r) => r.playerNameAsPrinted.trim().toLowerCase()).filter(Boolean),
  );
  const isDup = (p: ClientRosterSubmission['players'][number]) =>
    (p.number && numbers.has(p.number)) ||
    (p.playerNameAsPrinted && names.has(p.playerNameAsPrinted.trim().toLowerCase()));

  const dupCount = s.players.filter(isDup).length;
  const asked = (Object.keys(CLIENT_LINK_SECTION_META) as Array<keyof ClientLinkSections>)
    .filter((k) => s.sections?.[k])
    .map((k) => CLIENT_LINK_SECTION_META[k].label);

  return (
    <div
      className={`rounded-lg border p-4 ${
        done ? 'border-line bg-surface-2/50 opacity-80' : 'border-ppc-gold/60 bg-ppc-gold/[0.05]'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold">
            {done ? 'Accepted' : 'Waiting for review'} ·{' '}
            <span className="font-normal text-muted">
              submitted {formatShort(s.submittedAt.slice(0, 10))}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-muted">Asked for: {asked.join(', ') || '—'}</div>
        </div>
        {!done && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(() => acceptClientSubmission(s.id, orderId))}
            className="rounded-lg bg-ppc-gold px-4 py-2 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-50"
          >
            {pending ? 'Adding…' : 'Accept → add to order'}
          </button>
        )}
      </div>

      {!done && dupCount > 0 && (
        <p className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {dupCount} player{dupCount === 1 ? '' : 's'} match a number or name already on the
          roster (marked below). Accepting adds them anyway — remove the duplicates in the roster
          table afterwards if that&apos;s what they are.
        </p>
      )}

      {s.contact && (
        <div className="mt-3">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">Contact & shipping</div>
          <p className="mt-1 text-sm">
            {[s.contact.firstName, s.contact.lastName].filter(Boolean).join(' ')}
            {s.contact.email && <> · {s.contact.email}</>}
            {s.contact.phone && <> · {s.contact.phone}</>}
          </p>
          {(s.contact.street || s.contact.city) && (
            <p className="text-sm text-muted">
              {[s.contact.street, s.contact.secondary, s.contact.city, s.contact.province, s.contact.postal]
                .filter(Boolean)
                .join(', ')}
            </p>
          )}
          {!done && (
            <p className="mt-1 text-xs text-muted">
              Accepting writes these onto the order — only the fields they filled in.
            </p>
          )}
        </div>
      )}

      {s.players.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">
            {s.players.length} player{s.players.length === 1 ? '' : 's'}
          </div>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-1 pr-2">Name</th>
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-2">Jersey</th>
                  <th className="py-1 pr-2">Sock</th>
                  <th className="py-1">Notes</th>
                </tr>
              </thead>
              <tbody>
                {s.players.map((p, i) => {
                  const dup = !done && isDup(p);
                  return (
                    <tr key={i} className={`border-b border-line/40 ${dup ? 'text-amber-200' : ''}`}>
                      <td className="py-1.5 pr-2 font-semibold">
                        {p.playerNameAsPrinted || <span className="text-muted">—</span>}
                        {p.isGoalie && <span className="ml-1.5 text-[0.65rem] text-ppc-gold">G</span>}
                        {p.sockOnly && <span className="ml-1.5 text-[0.65rem] text-muted">SOCK ONLY</span>}
                        {dup && <span className="ml-1.5 text-[0.65rem]">DUP?</span>}
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums">{p.number || '—'}</td>
                      <td className="py-1.5 pr-2">{p.jerseySize || '—'}</td>
                      <td className="py-1.5 pr-2">{p.sockSize || '—'}</td>
                      <td className="py-1.5 text-muted">{p.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {s.logos.length > 0 && (
        <FileGrid title={`${s.logos.length} logo${s.logos.length === 1 ? '' : 's'}`}
          items={s.logos.map((l) => ({
            url: l.fileUrl, name: l.fileName,
            caption: [l.logoName, l.placementNotes, l.description].filter(Boolean).join(' — '),
          }))} />
      )}

      {(s.inspiration?.length ?? 0) > 0 && (
        <FileGrid title={`${s.inspiration.length} inspiration image${s.inspiration.length === 1 ? '' : 's'}`}
          items={s.inspiration.map((i) => ({ url: i.fileUrl, name: i.fileName, caption: i.notes }))} />
      )}
    </div>
  );
}

function FileGrid({ title, items }: { title: string; items: Array<{ url: string; name: string; caption: string }> }) {
  return (
    <div className="mt-3">
      <div className="text-xs font-bold uppercase tracking-wide text-muted">{title}</div>
      <ul className="mt-1 grid gap-2 sm:grid-cols-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 rounded border border-line bg-surface p-2">
            {/\.(png|jpe?g|webp|gif|svg)$/i.test(it.name) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-surface-2 text-[0.6rem] font-bold text-muted">FILE</span>
            )}
            <div className="min-w-0 flex-1">
              <a href={it.url} target="_blank" rel="noreferrer" className="block truncate text-xs font-semibold text-ppc-gold hover:underline">{it.name}</a>
              {it.caption && <div className="truncate text-xs text-muted">{it.caption}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
