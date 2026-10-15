import { repo } from '@/lib/data';
import { requireRole } from '@/lib/auth';
import { rosterToCsv } from '@/lib/csv';

/**
 * The roster as our CSV. The roster in use by default; `?roster=<id>` for any
 * other roster on the order (Roster 1, Roster 2…), named after it.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole('staff');
  const { id } = await params;
  const bundle = await repo.getOrder(id);
  if (!bundle) return new Response('Not found', { status: 404 });

  const wanted = new URL(req.url).searchParams.get('roster');
  const version = wanted ? bundle.rosters.find((v) => v.id === wanted) : bundle.rosters.find((v) => v.inUse);
  const rows = wanted ? await repo.getRosterRows(id, wanted) : bundle.roster;
  if (!rows) return new Response('Not found', { status: 404 });

  const csv = rosterToCsv(rows, bundle.order.nameStyle);
  const slug = (bundle.order.teamName || 'roster').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const which = version && bundle.rosters.length > 1 ? `-roster-${version.number}` : '-roster';

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}${which}.csv"`,
    },
  });
}
