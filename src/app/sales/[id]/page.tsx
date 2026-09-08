import Link from 'next/link';
import { notFound } from 'next/navigation';
import { repo } from '@/lib/data';
import { currentUser } from '@/lib/auth';
import type { Contact, ContactBucket } from '@/lib/types';
import { today, formatShort } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';
import { contactBucket, isClosed } from '@/lib/data/sales-logic';
import { phoneDisplay } from '@/lib/sales/phone';
import { Button, Card, EmptyState } from '@/components/ui';
import { OutcomeBadge } from '@/components/sales/outcome-badge';
import { StarRating } from '@/components/sales/star-rating';
import { ImportsPanel } from '@/components/sales/imports-panel';
import { AddContactsForm } from '@/components/sales/add-contacts-form';
import { RenameList } from '@/components/sales/rename-list';
import { RowActions } from '@/components/sales/row-actions';
import { SessionsPanel } from '@/components/sales/sessions-panel';
import { ManagerBadge } from '@/components/sales/call-view/contact-panel';

export const dynamic = 'force-dynamic';

type Search = { q?: string; bucket?: string };

const BUCKETS: Array<{ key: ContactBucket | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'uncalled', label: 'Uncalled' },
  { key: 'retry', label: 'Retry' },
  { key: 'follow_up', label: 'Follow-up' },
  { key: 'done', label: 'Done' },
  { key: 'do_not_call', label: 'Do not call' },
];

function matches(c: Contact, q: string): boolean {
  if (!q) return true;
  const hay = [c.orgName, c.contactName, c.phone, c.altPhone, c.city, c.email].join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

export default async function ContactsPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const sp = await searchParams;
  const bundle = await repo.getCallList(id);
  if (!bundle) notFound();
  const user = await currentUser();

  const day = today(BUSINESS_TIMEZONE);
  const logCounts: Record<string, number> = {};
  for (const g of bundle.logs) logCounts[g.contactId] = (logCounts[g.contactId] ?? 0) + 1;
  const q = (sp.q ?? '').trim();
  const bucket = (BUCKETS.some((b) => b.key === sp.bucket) ? sp.bucket : 'all') as ContactBucket | 'all';

  const counts = Object.fromEntries(BUCKETS.map((b) => [b.key, 0])) as Record<ContactBucket | 'all', number>;
  for (const c of bundle.contacts) { counts.all += 1; counts[contactBucket(c)] += 1; }

  const due = bundle.contacts.filter((c) => c.callCount > 0 && !c.doNotCall && !!c.nextCallDate && c.nextCallDate <= day && !isClosed(c));
  const shown = bundle.contacts.filter((c) => (bucket === 'all' || contactBucket(c) === bucket) && matches(c, q));
  const link = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    const next = { q, bucket, ...patch };
    if (next.q) p.set('q', next.q);
    if (next.bucket && next.bucket !== 'all') p.set('bucket', next.bucket);
    const s = p.toString();
    return `/sales/${id}${s ? `?${s}` : ''}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/sales" className="text-sm text-muted hover:text-ppc-gold">← Sales</Link>
          <RenameList listId={id} name={bundle.list.name} />
          <p className="text-sm text-muted">{bundle.contacts.length} contacts · {bundle.list.script.length} script lines</p>
        </div>
        <div className="flex gap-2">
          <Button href={`/sales/${id}/call`} variant="primary">Start calling</Button>
          <Button href={`/api/sales/${id}/export.csv`}>Export CSV</Button>
        </div>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ppc-gold">Add contacts</h2>
        <AddContactsForm listId={id} />
      </Card>

      <ImportsPanel imports={bundle.list.imports} contacts={bundle.contacts} listId={id} />

      {due.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ppc-gold">Due today <span className="ml-1 text-muted">{due.length}</span></h2>
          <ul className="divide-y divide-line">
            {due.map((c) => (
              <li key={c.id}>
                <Link href={`/sales/${id}/contacts/${c.id}`} className="flex items-center justify-between gap-3 py-2 hover:text-ppc-gold">
                  <span className="min-w-0 truncate"><span className="font-semibold">{c.contactName || '—'}</span> · {c.orgName}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted"><OutcomeBadge outcome={c.lastOutcome} /> {c.nextCallDate ? formatShort(c.nextCallDate) : ''}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <SessionsPanel sessions={bundle.sessions} logs={bundle.logs} contacts={bundle.contacts} listId={id} now={new Date().toISOString()} />

      <div className="space-y-2 sm:flex sm:items-center sm:gap-2 sm:space-y-0">
        <form className="flex items-center gap-2 sm:flex-1" action={`/sales/${id}`}>
          <input name="q" defaultValue={q} placeholder="Search org, name, phone, city…" className="min-w-[12rem] flex-1" />
          {bucket !== 'all' && <input type="hidden" name="bucket" value={bucket} />}
          <Button type="submit">Search</Button>
        </form>
      </div>
      <div className="flex flex-wrap gap-2">
        {BUCKETS.map((b) => (
          <Link
            key={b.key}
            href={link({ bucket: b.key })}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${bucket === b.key ? 'border-ppc-gold bg-ppc-gold/10 text-ppc-gold' : 'border-line text-muted hover:border-ppc-gold/50'}`}
          >
            {b.label} <span className="tabular-nums opacity-70">{counts[b.key]}</span>
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={bundle.contacts.length === 0 ? 'No contacts yet' : 'No contacts match'}
          hint={q ? 'Try a different search.' : bundle.contacts.length === 0 ? 'Upload a sheet above to add the first contacts.' : 'Nothing in this group yet.'}
        />
      ) : (
        <>
          {/* Wide: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3">Org</th><th className="py-2 pr-3">Contact</th><th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Phone</th><th className="py-2 pr-3">City</th><th className="py-2 pr-3">Rating</th>
                  <th className="py-2 pr-3">Last outcome</th><th className="py-2 pr-3 text-right">Calls</th><th className="py-2">Next call</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <RowActions key={c.id} listId={id} contact={c} callCount={logCounts[c.id] ?? 0} today={day} callerDefault={user?.name ?? ''}>
                    <td className="py-2 pr-3 font-semibold"><Link href={`/sales/${id}/contacts/${c.id}`} className="hover:text-ppc-gold">{c.orgName || '—'}</Link></td>
                    <td className="py-2 pr-3"><Link href={`/sales/${id}/contacts/${c.id}`} className="hover:text-ppc-gold">{c.contactName || '—'}</Link>{c.isJerseyManager && <span className="ml-2 align-middle"><ManagerBadge /></span>}</td>
                    <td className="py-2 pr-3 text-muted">{c.role || '—'}</td>
                    <td className="py-2 pr-3 tabular-nums">{c.doNotCall ? <span className="text-red-300">hidden</span> : phoneDisplay(c.phone) || '—'}</td>
                    <td className="py-2 pr-3 text-muted">{[c.city, c.province].filter(Boolean).join(', ') || '—'}</td>
                    <td className="py-2 pr-3"><StarRating value={c.leadRating} /></td>
                    <td className="py-2 pr-3"><OutcomeBadge outcome={c.doNotCall ? 'do_not_call' : c.lastOutcome} /></td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.callCount}{c.skipCount ? <span className="text-muted"> · {c.skipCount} skip</span> : null}</td>
                    <td className="py-2 tabular-nums text-muted">{c.nextCallDate ? formatShort(c.nextCallDate) : '—'}</td>
                  </RowActions>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">Double-click a row to change its status, quick-edit the person, or delete them.</p>
          </div>
          {/* Phone: cards, not a sideways table. */}
          <div className="space-y-3 md:hidden">
            {shown.map((c) => (
              <Link key={c.id} href={`/sales/${id}/contacts/${c.id}`} className="block">
                <Card className="p-3 hover:border-ppc-gold/60">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.orgName || '—'}</p>
                      <p className="truncate text-sm text-muted">{[c.contactName, c.role].filter(Boolean).join(' · ') || '—'}{c.isJerseyManager && <span className="ml-2"><ManagerBadge /></span>}</p>
                    </div>
                    <OutcomeBadge outcome={c.doNotCall ? 'do_not_call' : c.lastOutcome} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted">
                    <span className="tabular-nums">{c.doNotCall ? 'number hidden' : phoneDisplay(c.phone)}</span>
                    <StarRating value={c.leadRating} />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
