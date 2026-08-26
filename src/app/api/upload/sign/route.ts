import { requireRole } from '@/lib/auth';
import { createUploadUrl, isBucketKey, resolveFileUrl } from '@/lib/storage';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * Hand the browser a one-shot URL to upload a file directly to storage.
 *
 * Two tiny JSON round-trips instead of one large POST, because Vercel caps a
 * function's request body at roughly 4.5 MB and nothing raises that. The file
 * itself never touches this server.
 *
 * POST { name, size, type }  -> { uploadUrl, fileUrl, fileName }
 * PUT  { fileUrl }           -> { previewUrl }
 *
 * The second call is separate on purpose: a read link signed before the object
 * exists is a link to nothing, and the thumbnail would be broken exactly once
 * per upload, which is the sort of bug people learn to ignore.
 */

export async function POST(req: Request) {
  await requireRole('staff');

  if (!isSupabaseConfigured()) {
    return Response.json({ error: 'not-configured' }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const { name, size, type } = (body ?? {}) as { name?: unknown; size?: unknown; type?: unknown };
  if (typeof name !== 'string' || typeof size !== 'number' || typeof type !== 'string') {
    return Response.json({ error: 'Expected { name, size, type }.' }, { status: 400 });
  }

  try {
    // Validates size and MIME type before signing, so an oversized file is
    // refused here rather than after the browser has spent a minute sending it.
    return Response.json(await createUploadUrl({ name, size, type }));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  await requireRole('staff');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const { fileUrl } = (body ?? {}) as { fileUrl?: unknown };
  // Only ever sign a key in our own bucket. Without this the endpoint would
  // sign whatever string it was handed.
  if (typeof fileUrl !== 'string' || !isBucketKey(fileUrl)) {
    return Response.json({ error: 'Expected a bucket key.' }, { status: 400 });
  }

  return Response.json({ previewUrl: await resolveFileUrl(fileUrl) });
}
