import { notFound } from 'next/navigation';
import { repo } from '@/lib/data';
import { currentUser } from '@/lib/auth';
import { today } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';
import { buildQueue } from '@/lib/data/sales-logic';
import { alsoIn, type AlsoIn } from '@/lib/sales/match';
import { CallView } from '@/components/sales/call-view';

export const dynamic = 'force-dynamic';

/**
 * Thin shell: load, order the queue, pick the starting contact, hand off.
 * `?c=` opens a specific contact — the only way a Do Not Call contact is ever
 * shown (disabled). Nothing is created here; a GET must stay side-effect free.
 */
export default async function CallPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string }> }) {
  const { id } = await params;
  const { c } = await searchParams;
  const bundle = await repo.getCallList(id);
  if (!bundle) notFound();
  const user = await currentUser();
  const day = today(BUSINESS_TIMEZONE);
  const queue = buildQueue(bundle.contacts, day);
  const startId = c && bundle.contacts.some((x) => x.id === c) ? c : (queue[0] ?? null);
  if (c && !bundle.contacts.some((x) => x.id === c)) notFound();

  // The same person in another list — computed here so the view never has to know about other lists.
  const otherLists = (await repo.listCallLists()).filter((l) => l.id !== id);
  const others = (await Promise.all(otherLists.map((l) => repo.getCallList(l.id)))).filter((b) => b !== null);
  const elsewhere: Record<string, AlsoIn[]> = {};
  for (const x of bundle.contacts) {
    const a = alsoIn(x, others);
    if (a.length) elsewhere[x.id] = a;
  }

  return (
    <div className="call-screen flex min-h-0 flex-1 flex-col">
    <CallView
      list={bundle.list}
      contacts={bundle.contacts}
      logs={bundle.logs}
      sessions={bundle.sessions}
      alsoIn={elsewhere}
      queue={queue}
      startId={startId}
      callerDefault={user?.name ?? ''}
      today={day}
    />
    </div>
  );
}
