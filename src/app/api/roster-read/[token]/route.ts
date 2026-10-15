import { repo } from '@/lib/data';
import { isBucketKey } from '@/lib/storage';
import { readRosterFile } from '@/lib/roster-import/read';
import { aiContextOf, importContextOf, teamImportContext } from '@/lib/roster-import/analyze';

/**
 * The team's roster file, turned into rows on their own form.
 *
 * Public, like the form itself: the roster token is the credential, and it
 * must belong to a live order with the link switched on and not yet locked —
 * the same gate as /api/public-upload. On top of that, a few conversions a
 * day per order (ROSTER_READS_PER_DAY in data/logic.ts): each one is a paid
 * AI call, and the link is a URL that can be forwarded.
 *
 * The file arrives as bytes (a photo shrunk by the browser first), never as a
 * storage key — a public caller is never allowed to point the server at a
 * stored file. Nothing is stored here: the rows go back to the form, the team
 * checks them, and they arrive with the submission like rows typed by hand.
 *
 * The file's contents are the team's data, sent back to the same team.
 */

export const maxDuration = 60;

const MAX_POSTED_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await repo.getByRosterToken(token);
  if (!link || !link.enabled || link.locked) {
    return Response.json({ ok: false, error: 'This link is not active.' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: 'Expected a file.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ ok: false, error: 'No file to read.' }, { status: 400 });
  }
  if (file.size > MAX_POSTED_BYTES) {
    return Response.json(
      { ok: false, error: "That file is too big to convert here. Send it as it is — we'll type it up." },
      { status: 413 },
    );
  }

  // Counted before reading, so a failed or slow read still counts against the day.
  const gate = await repo.noteRosterRead(token, new Date().toISOString());
  if (!gate.allowed || !gate.orderId) {
    return Response.json(
      { ok: false, error: "That's as many conversions as we can do for one team today. Send the file as it is and we'll type it up." },
      { status: 429 },
    );
  }
  const bundle = await repo.getOrder(gate.orderId);
  if (!bundle) return Response.json({ ok: false, error: 'This link is not active.' }, { status: 403 });

  const given = String(form.get('fileUrl') ?? '');
  const ctx = importContextOf(bundle.order);
  const result = await readRosterFile({
    bytes: new Uint8Array(await file.arrayBuffer()),
    fileName: String(form.get('fileName') ?? '').slice(0, 200) || file.name,
    // Only echoed back for the submission's record of where the rows came from.
    fileUrl: isBucketKey(given) || given.startsWith('/uploads/') ? given : '',
    context: aiContextOf(ctx),
  });
  return Response.json(result.ok ? { ...result, context: teamImportContext(ctx) } : result);
}
