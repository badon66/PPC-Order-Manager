import { repo } from '@/lib/data';
import { rosterToCsv } from '@/lib/csv';

/**
 * The roster as a CSV, for whoever holds the share link.
 *
 * Same file the admin route produces, addressed by the share token instead of
 * the order id, so the team or the manufacturer can pull it without signing
 * in. It comes from the PUBLIC view, so it can only ever contain what that
 * view contains — the roster and the name style. Nothing about money is in
 * either, and this route never touches the full order.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await repo.getByShareToken(token);
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
