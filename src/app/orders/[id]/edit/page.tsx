import Link from 'next/link';
import { notFound } from 'next/navigation';
import { repo } from '@/lib/data';
import { OrderForm } from '@/components/order-form';

export const dynamic = 'force-dynamic';

export default async function EditOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const { id } = await params;
  const { start } = await searchParams;
  const bundle = await repo.getOrder(id);
  if (!bundle) notFound();

  return (
    <div className="space-y-4">
      <Link
        href={`/orders/${id}`}
        className="text-sm font-semibold text-muted hover:text-ppc-gold"
      >
        ← Back to order
      </Link>
      <OrderForm
        initialOrder={bundle.order}
        initialRoster={bundle.roster}
        initialAssets={bundle.assets}
        isNew={start === '1'}
      />
    </div>
  );
}
