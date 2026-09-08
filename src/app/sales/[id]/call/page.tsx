import { notFound } from 'next/navigation';
import { repo } from '@/lib/data';
import { currentUser } from '@/lib/auth';
import { today } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';
import { buildQueue } from '@/lib/data/sales-logic';
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

  return (
    <CallView
      list={bundle.list}
      contacts={bundle.contacts}
      logs={bundle.logs}
      sessions={bundle.sessions}
      queue={queue}
      startId={startId}
      callerDefault={user?.name ?? ''}
      today={day}
    />
  );
}
