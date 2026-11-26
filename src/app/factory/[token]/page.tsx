import { notFound, redirect } from 'next/navigation';
import { repo } from '@/lib/data';
import { isFactoryJob } from '@/lib/factory/steps';

export const dynamic = 'force-dynamic';

/**
 * The old per-job factory link. Retired (Keenan, 2026-11-25): the dashboard
 * is the factory's way in. A link already sent still works — it forwards to
 * the job's page, behind the same passcode — but only for a job the factory
 * may see.
 */
export default async function OldFactoryLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const orders = await repo.listOrders({ status: 'all', includeCompleted: true });
  const order = token ? orders.find((o) => o.factoryToken === token) : undefined;
  if (!order || !isFactoryJob(order)) notFound();
  redirect(`/factory/jobs/${order.id}`);
}
