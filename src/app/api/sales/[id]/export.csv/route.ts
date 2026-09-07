import { repo } from '@/lib/data';
import { requireRole } from '@/lib/auth';
import { callListToCsv } from '@/lib/sales/export';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole('staff');
  const { id } = await params;
  const bundle = await repo.getCallList(id);
  if (!bundle) return new Response('Not found', { status: 404 });

  const csv = callListToCsv(bundle);
  const slug = (bundle.list.name || 'call-list').replace(/[^a-z0-9]+/gi, '-').toLowerCase();

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-calls.csv"`,
    },
  });
}
