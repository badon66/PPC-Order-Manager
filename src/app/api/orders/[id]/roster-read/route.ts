import { repo } from '@/lib/data';
import { requireRole } from '@/lib/auth';
import { isBucketKey, readStoredFile } from '@/lib/storage';
import { readRosterFile } from '@/lib/roster-import/read';
import { aiContextOf, importContextOf } from '@/lib/roster-import/analyze';

/**
 * Read a roster file for Keenan's importer. Returns an ImportAnalysis (or a
 * plain-sentence error) and stores nothing: rows only exist once he accepts
 * the preview, through acceptRosterImport.
 *
 * POST multipart:
 *   file      the bytes to read — a photo already shrunk by the browser, or
 *             the file itself when it's under the request limit
 *   fileUrl   where the original was uploaded (kept on the new roster)
 *   fileName  for the screen
 * With no `file`, the original is read from storage instead — how a big PDF
 * gets past Vercel's 4.5 MB request cap. Only our own storage keys are read.
 */

// A PDF is read twice by AI, side by side; see read.ts for the time budget.
export const maxDuration = 60;

const MAX_POSTED_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole('staff');
  const { id } = await params;
  const bundle = await repo.getOrder(id);
  if (!bundle) return Response.json({ ok: false, error: 'Order not found.' }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: 'Expected a file.' }, { status: 400 });
  }
  const file = form.get('file');
  const given = String(form.get('fileUrl') ?? '');
  const fileUrl = isBucketKey(given) || given.startsWith('/uploads/') ? given : '';
  const fileName = String(form.get('fileName') ?? '').slice(0, 200) || (file instanceof File ? file.name : 'roster');

  let bytes: Uint8Array;
  if (file instanceof File) {
    if (file.size > MAX_POSTED_BYTES) {
      return Response.json({ ok: false, error: 'That file is too large to send for reading.' }, { status: 413 });
    }
    bytes = new Uint8Array(await file.arrayBuffer());
  } else if (fileUrl) {
    try {
      bytes = await readStoredFile(fileUrl);
    } catch (e) {
      return Response.json({ ok: false, error: (e as Error).message }, { status: 400 });
    }
  } else {
    return Response.json({ ok: false, error: 'No file to read.' }, { status: 400 });
  }

  const ctx = importContextOf(bundle.order);
  const result = await readRosterFile({ bytes, fileName, fileUrl, context: aiContextOf(ctx) });
  return Response.json(result);
}
