'use client';

import { useState, useTransition } from 'react';
import type { ClientRosterSubmission, RosterEntry } from '@/lib/types';
import { CLIENT_LINK_SECTION_META, type ClientLinkSections } from '@/lib/types';
import { acceptClientSubmission } from '@/app/orders/actions';
import { formatShort } from '@/lib/dates';
import { CaptaincyBadge, GoalieBadge } from '@/components/captaincy';
import { FilePreview } from '@/components/file-preview';

/**
 * Review a client submission before it touches the order.
 *
 * Shows exactly what came in, flags two players in it sharing a number, and
 * does nothing until Accept is clicked. Accepting makes their players a roster
 * of its own (Roster N, put in use) — the roster already on the order is kept,
 * never merged into, so a resend can't double anyone up. Multiple submissions
 * are listed newest-first; each is accepted independently.
 */
export function SubmissionReview({
  signedUrls,
  orderId,
  submissions,
  currentRoster,
}: {
  orderId: string;
  submissions: ClientRosterSubmission[];
  /**
   * Stored fileUrl → a link that actually loads. Artwork sits in a private
   * bucket, so the server signs these before handing them down; this component
   * doesn't need to know that's where files live.
   */
  signedUrls: Record<string, string>;
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
        <SubmissionCard key={s.id} s={s} orderId={orderId} currentRoster={currentRoster} signedUrls={signedUrls} />
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
                <SubmissionCard key={s.id} s={s} orderId={orderId} currentRoster={currentRoster} signedUrls={signedUrls} />
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
  signedUrls,
}: {
  s: ClientRosterSubmission;
  orderId: string;
  currentRoster: RosterEntry[];
  signedUrls: Record<string, string>;
}) {
  const [pending, start] = useTransition();
  const done = Boolean(s.acceptedAt);

  // Two players in this list on one number: worth a look before it's a roster.
  const numberCount = new Map<string, number>();
  for (const p of s.players) if (p.number && !p.sockOnly) numberCount.set(p.number, (numberCount.get(p.number) ?? 0) + 1);
  const isDup = (p: ClientRosterSubmission['players'][number]) =>
    Boolean(p.number && !p.sockOnly && (numberCount.get(p.number) ?? 0) > 1);

  const dupCount = s.players.filter(isDup).length;
  // A pant column only when someone has a pant size: most orders have no shells.
  const hasPants = s.players.some((p) => (p.pantShellSize ?? '').trim() !== '');
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
          {dupCount} player{dupCount === 1 ? ' shares' : 's share'} a number with someone else in this
          list (marked below).
        </p>
      )}
      {!done && s.players.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          Accepting makes these {s.players.length} player{s.players.length === 1 ? '' : 's'} a new roster
          and puts it in use{currentRoster.length ? ` — the ${currentRoster.length} on the roster now are kept as they are` : ''}.
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

      {s.colours && (
        <p className="mt-3 text-sm"><span className="text-muted">Colours:</span> {s.colours}</p>
      )}

      {s.players.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">
            {s.players.length} player{s.players.length === 1 ? '' : 's'}
          </div>
          {s.convertedFrom && (
            <p className="mt-1 text-xs text-muted">
              Converted from their file{' '}
              <a href={signedUrls[s.convertedFrom.fileUrl] ?? s.convertedFrom.fileUrl} target="_blank" rel="noreferrer"
                className="font-semibold text-ppc-gold hover:underline">{s.convertedFrom.fileName || 'roster file'}</a>
              {' '}on their form, then checked by them before sending.
            </p>
          )}
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-1 pr-2">Name</th>
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-2">Jersey</th>
                  <th className="py-1 pr-2">Sock</th>
                  {hasPants && <th className="py-1 pr-2">Pant</th>}
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
                        {p.isGoalie && <GoalieBadge />}
                        <CaptaincyBadge value={p.captaincy} />
                        {p.sockOnly && <span className="ml-1.5 text-[0.65rem] text-muted">SOCK ONLY</span>}
                        {dup && <span className="ml-1.5 text-[0.65rem]">SAME #</span>}
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums">{p.number || '—'}</td>
                      <td className="py-1.5 pr-2">{p.jerseySize || '—'}</td>
                      <td className="py-1.5 pr-2">{p.sockSize || '—'}</td>
                      {hasPants && <td className="py-1.5 pr-2">{p.pantShellSize || '—'}</td>}
                      <td className="py-1.5 text-muted">{p.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {s.rosterAnswer === 'later' && (
        <p className="mt-3 text-sm text-muted">
          Roster: not ready yet — they&apos;ll come back to their link with the names.
        </p>
      )}

      {(s.rosterFiles?.length ?? 0) > 0 && (
        <>
          <FileGrid title={`${s.rosterFiles.length} roster file${s.rosterFiles.length === 1 ? '' : 's'}`}
            items={s.rosterFiles.map((f) => ({
              url: signedUrls[f.fileUrl] ?? f.fileUrl, name: f.fileName, caption: f.notes,
            }))} />
          {!done && (
            <p className="mt-1 text-xs text-muted">
              Accepting keeps the file on the order. To turn it into players, use Import it under
              Player Roster: it&apos;s read, checked with you, and becomes its own roster.
            </p>
          )}
        </>
      )}

      {s.logos.length > 0 && (
        <FileGrid title={`${s.logos.length} logo${s.logos.length === 1 ? '' : 's'}`}
          items={s.logos.map((l) => ({
            url: signedUrls[l.fileUrl] ?? l.fileUrl, name: l.fileName,
            caption: [l.logoName, l.placementNotes, l.description].filter(Boolean).join(' — '),
          }))} />
      )}

      {(s.inspiration?.length ?? 0) > 0 && (
        <FileGrid title={`${s.inspiration.length} inspiration image${s.inspiration.length === 1 ? '' : 's'}`}
          items={s.inspiration.map((i) => ({
            url: signedUrls[i.fileUrl] ?? i.fileUrl, name: i.fileName, caption: i.notes,
          }))} />
      )}
    </div>
  );
}

function FileGrid({ title, items }: { title: string; items: Array<{ url: string; name: string; caption: string }> }) {
  return (
    <div className="mt-3">
      <div className="text-xs font-bold uppercase tracking-wide text-muted">{title}</div>
      <ul className="mt-1 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="rounded border border-line bg-surface p-2">
            {/* What they sent, whole — a picture is checked by looking at all of it. */}
            <FilePreview fileName={it.name} url={it.url} />
            <div className="mt-2 min-w-0">
              <a href={it.url} target="_blank" rel="noreferrer" className="block truncate text-xs font-semibold text-ppc-gold hover:underline">{it.name}</a>
              {it.caption && <div className="text-xs text-muted">{it.caption}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
