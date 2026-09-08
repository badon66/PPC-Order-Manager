'use client';

import Link from 'next/link';
import type { CallLog, CallSession, Contact, ScriptItem } from '@/lib/types';
import { keyForHeader } from '@/lib/sales/columns';
import { phoneDisplay, telHref } from '@/lib/sales/phone';
import { localTimeFor } from '@/lib/sales/timezones';
import type { AlsoIn } from '@/lib/sales/match';
import { OutcomeBadge } from '../outcome-badge';
import { StarRating } from '../star-rating';
import { AlsoInLine } from '../also-in';
import { CallHistory } from './history';
import { useNow } from './use-timers';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === '' || children === null || children === undefined) return null;
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-sm">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Small gold pill for the contact who handles the jerseys. */
export function ManagerBadge() {
  return <span className="inline-flex items-center rounded-full border border-ppc-gold/70 bg-ppc-gold/10 px-2 py-0.5 text-[0.7rem] font-semibold text-ppc-gold">Jersey manager</span>;
}

export function ContactPanel({
  contact: c, logs, script, linked, listId, sessionsById = {}, alsoIn = [],
}: {
  contact: Contact;
  logs: CallLog[];
  script: ScriptItem[];
  /** Other contacts at the same team (same organisation name in this list). */
  linked: Contact[];
  listId: string;
  sessionsById?: Record<string, CallSession>;
  /** The same person (phone or email) in other lists. */
  alsoIn?: AlsoIn[];
}) {
  const now = useNow(60_000);
  const local = localTimeFor(c, now);
  const tel = telHref(c.phone);
  const altTel = telHref(c.altPhone);
  const extra = Object.entries(c.raw ?? {}).filter(([h, v]) => v && !keyForHeader(h));
  const orgLine = [c.orgName, c.orgType].filter(Boolean).join(' · ');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold leading-tight">{c.contactName || <span className="text-muted">No contact name</span>}</h2>
        <p className="text-sm text-muted">{[c.role, orgLine].filter(Boolean).join(' — ')}</p>
        <p className="mt-1 flex flex-wrap gap-2 text-xs">
          {c.isJerseyManager && <ManagerBadge />}
          {c.source === 'referral' && <span className="text-violet-300">Added from a call</span>}
        </p>
        <AlsoInLine items={alsoIn} />
      </div>

      <div className="space-y-2 rounded-lg border border-line bg-surface-2 p-3">
        {c.doNotCall ? (
          <p className="text-sm font-semibold text-red-300">Number hidden — Do Not Call</p>
        ) : (
          <p className="text-xl font-bold tabular-nums">
            {tel ? <a href={tel} className="hover:text-ppc-gold">{phoneDisplay(c.phone)}</a> : <span className="text-muted">No phone</span>}
            {c.altPhone && <span className="ml-3 text-sm font-normal text-muted">alt {altTel ? <a href={altTel} className="hover:text-ppc-gold">{phoneDisplay(c.altPhone)}</a> : c.altPhone}</span>}
          </p>
        )}
        <p className="text-sm">{c.email ? <a href={`mailto:${c.email}`} className="hover:text-ppc-gold">{c.email}</a> : <span className="text-muted">No email</span>}</p>
        <p className="text-sm text-muted">
          {[c.city, c.province].filter(Boolean).join(', ') || 'Location unknown'}
          {local && <> · <span className="font-semibold text-foreground">{local}</span> local</>}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {c.priority && <span>Priority <span className="font-semibold text-foreground">{c.priority}</span></span>}
          {c.bestTimeToCall && <span>Best: {c.bestTimeToCall}</span>}
          {c.leadSource && <span>Source: {c.leadSource}</span>}
          <span className="flex items-center gap-1">Rating <StarRating value={c.leadRating} /></span>
        </p>
      </div>

      {linked.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ppc-gold">Also at this team <span className="ml-1 text-muted">{linked.length}</span></h3>
          <ul className="space-y-1.5">
            {linked.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <Link href={`/sales/${listId}/contacts/${x.id}`} className="font-semibold hover:text-ppc-gold">{x.contactName || x.orgName || '—'}</Link>
                  {x.role && <span className="text-xs text-muted">{x.role}</span>}
                  {x.isJerseyManager && <ManagerBadge />}
                  {x.doNotCall && <span className="text-xs text-red-300">Do Not Call</span>}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {!x.doNotCall && x.phone && <span className="tabular-nums">{phoneDisplay(x.phone)}</span>}
                  <OutcomeBadge outcome={x.lastOutcome} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="space-y-1.5">
        <Row label="League">{c.league}</Row>
        <Row label="Divisions">{c.ageDivisions}</Row>
        <Row label="Size">{[c.teams !== null ? `${c.teams} team${c.teams === 1 ? '' : 's'}` : '', c.players !== null ? `~${c.players} players` : ''].filter(Boolean).join(' · ')}</Row>
        <Row label="Season">{[c.seasonStartMonth ? `starts ${c.seasonStartMonth}` : '', c.orderingMonth ? `orders ${c.orderingMonth}` : ''].filter(Boolean).join(' · ')}</Row>
        <Row label="Supplier">{[c.currentSupplier, c.lastOrderedYear ? `last ${c.lastOrderedYear}` : ''].filter(Boolean).join(' · ')}</Row>
        <Row label="Colours">{c.colours}</Row>
        <Row label="Web">{c.website ? <a href={c.website} target="_blank" rel="noreferrer" className="text-ppc-gold hover:underline">{c.website}</a> : ''}</Row>
        <Row label="Social">{c.social}</Row>
        <Row label="Sheet notes">{c.notes}</Row>
        {extra.map(([h, v]) => <Row key={h} label={h}>{v}</Row>)}
      </dl>

      <div>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ppc-gold">History <span className="ml-1 text-muted">{logs.length}</span></h3>
        <CallHistory contact={c} logs={logs} script={script} sessionsById={sessionsById} />
      </div>
    </div>
  );
}
