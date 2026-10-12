import { repo } from '@/lib/data';
import { rosterToCsv } from '@/lib/csv';

/**
 * The roster as a CSV, off the factory sheet.
 *
 * The proxy has already checked the factory cookie (or Keenan's) before this
 * runs — see src/proxy.ts. It comes from the FACTORY view, so it can only
 * ever contain what that view contains: the roster and the name style. The
 * keepers are not roster rows and are not in this file; they are on the sheet
 * itself, marked, where they can't be mistaken for the team's.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await repo.getByFactoryToken(token);
  if (!view) return new Response('Not found', { status: 404 });

  const csv = rosterToCsv(view.roster, view.addons.nameStyle);
  const slug = (view.teamName || 'roster').replace(/[^a-z0-9]+/gi, '-').toLowerCase();

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-roster.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
