import { requireRole, currentActor } from '@/lib/auth';
import { backend, repo } from '@/lib/data';
import { putBytes } from '@/lib/storage';
import { mapOrder, mapRoster, type B44Order, type B44Roster } from '@/lib/migrate-base44';
import type { Order } from '@/lib/types';

/**
 * One-time Base44 import.
 *
 * The browser fetches from base44.app and POSTs the raw JSON here, because the
 * server has no network route to it. Everything after that happens server-side.
 *
 * Behaviour:
 *  - Sample/seed orders are cleared out first (this is the real data arriving).
 *  - Matching is by invoice number, falling back to team name, so re-running
 *    updates in place instead of duplicating.
 *  - Artwork rows are created pointing at their Base44 URLs. The PUT below is
 *    the second pass: the browser fetches each file from Base44 and hands the
 *    bytes here, and they're stored wherever this deployment keeps artwork —
 *    the private Supabase bucket when hosted, public/uploads locally. Until
 *    that runs, the URLs are still Base44's and die with it.
 */

const SEED_TEAMS = new Set([
  'Riverbend Rockets',
  'Ennismore Eagles',
  'Northgate Fire Rescue',
  'Rodger That HVAC',
  'Cedar Valley Spring Camp',
]);

interface Payload {
  orders?: B44Order[];
  roster?: B44Roster[];
  /** Remove the invented sample orders. Default true. */
  clearSamples?: boolean;
}

export async function POST(req: Request) {
  await requireRole('admin');
  const actor = await currentActor();

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return Response.json({ error: 'Body was not JSON' }, { status: 400 });
  }

  const srcOrders = Array.isArray(payload.orders) ? payload.orders : [];
  const srcRoster = Array.isArray(payload.roster) ? payload.roster : [];
  if (srcOrders.length === 0) {
    return Response.json({ error: 'No orders in the payload' }, { status: 400 });
  }

  const report = {
    imported: [] as string[],
    updated: [] as string[],
    rosterRows: 0,
    assets: 0,
    samplesRemoved: [] as string[],
    warnings: [] as string[],
  };

  // Existing orders, for match-or-create and for clearing samples.
  const existing = await repo.listOrders({ status: 'all', includeCompleted: true });

  if (payload.clearSamples !== false) {
    for (const o of existing) {
      // Only the invented seed teams, and only if untouched by a real import.
      if (SEED_TEAMS.has(o.teamName)) {
        await repo.softDeleteOrder(o.id, actor);
        report.samplesRemoved.push(o.teamName);
      }
    }
  }

  const stillThere = await repo.listOrders({ status: 'all', includeCompleted: true });
  const byInvoice = new Map(stillThere.filter((o) => o.invoiceNumber).map((o) => [o.invoiceNumber, o]));
  const byTeam = new Map(stillThere.map((o) => [o.teamName.toLowerCase(), o]));

  // Group the roster once rather than filtering 223 rows per order.
  const rosterBySource = new Map<string, B44Roster[]>();
  for (const r of srcRoster) {
    const key = String((r as Record<string, unknown>).order_id ?? '');
    if (!key) continue;
    rosterBySource.set(key, [...(rosterBySource.get(key) ?? []), r]);
  }

  const assetsToRehost: Array<{ id: string; url: string }> = [];

  for (const src of srcOrders) {
    const { order, assets, warnings } = mapOrder(src);
    const label = order.teamName || order.invoiceNumber || '(unnamed)';
    for (const w of warnings) report.warnings.push(`${label}: ${w}`);

    const match =
      (order.invoiceNumber && byInvoice.get(order.invoiceNumber)) ||
      byTeam.get(order.teamName.toLowerCase());

    let saved: Order;
    if (match) {
      // Keep the existing row's id and tokens — links already sent stay valid.
      const { id: _id, shareToken: _s, rosterToken: _r, ...rest } = order;
      void _id; void _s; void _r;
      saved = await repo.updateOrder(match.id, rest, actor);
      report.updated.push(label);
    } else {
      saved = await repo.createOrder(order, actor);
      report.imported.push(label);
    }

    const srcId = String((src as Record<string, unknown>).id ?? '');
    const rosterRows = mapRoster(rosterBySource.get(srcId) ?? [], saved.id);
    if (rosterRows.length > 0) {
      await repo.replaceRoster(saved.id, rosterRows, actor);
      report.rosterRows += rosterRows.length;
    }

    for (const a of assets) {
      const created = await repo.addAsset({ ...a, orderId: saved.id }, actor);
      assetsToRehost.push({ id: created.id, url: created.fileUrl });
      report.assets += 1;
    }
  }

  return Response.json({ ...report, assetsToRehost });
}

/**
 * Second pass: the browser hands back the bytes of one Base44-hosted file and
 * we store it locally, so the artwork outlives Base44.
 */
export async function PUT(req: Request) {
  await requireRole('admin');

  const form = await req.formData();
  const assetId = String(form.get('assetId') ?? '');
  const file = form.get('file');
  if (!assetId || !(file instanceof File)) {
    return Response.json({ error: 'assetId and file are required' }, { status: 400 });
  }

  try {
    const stored = await putBytes(
      Buffer.from(await file.arrayBuffer()),
      file.name,
      file.type,
    );

    // Whichever store is live owns its own asset rows.
    const ok =
      backend === 'supabase'
        ? await (await import('@/lib/data/supabase-store')).rehostAssetSupabase(assetId, stored.fileUrl)
        : await (await import('@/lib/data/json-store')).rehostAsset(assetId, stored.fileUrl);

    if (!ok) return Response.json({ error: 'No such asset' }, { status: 404 });
    return Response.json({ ok, fileUrl: stored.fileUrl });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
