import { loadFactoryJob } from '@/lib/factory/load';
import { rosterToCsv } from '@/lib/csv';

/**
 * The roster as a CSV, off a factory job page. The proxy has already checked
 * the factory cookie (or Keenan's); `loadFactoryJob` refuses any order that
 * isn't a job the factory may see. Built from the FACTORY view, so it can
 * only contain what that view contains.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await loadFactoryJob(id);
  if (!job) return new Response('Not found', { status: 404 });

  const csv = rosterToCsv(job.view.roster, job.view.addons.nameStyle);
  const slug = (job.view.teamName || 'roster').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-roster.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
