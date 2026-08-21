import { repo } from '@/lib/data';
import { requireRole } from '@/lib/auth';
import { rosterToCsv } from '@/lib/csv';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole('staff');
  const { id } = await params;
  const bundle = await repo.getOrder(id);
  if (!bundle) return new Response('Not found', { status: 404 });

  const csv = rosterToCsv(bundle.roster);
  const slug = (bundle.order.teamName || 'roster').replace(/[^a-z0-9]+/gi, '-').toLowerCase();

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-roster.csv"`,
    },
  });
}
