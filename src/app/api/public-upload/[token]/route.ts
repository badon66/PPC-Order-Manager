import { repo } from '@/lib/data';
import { createUploadUrl, isBucketKey, putFile, resolveFileUrl } from '@/lib/storage';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * Upload endpoint for the customer's roster form.
 *
 * No session, on purpose — customers don't log in. What stands in for auth is
 * the roster token: it has to resolve to a live order with the client link
 * switched on, or nothing gets stored. So the "credential" is the same
 * unguessable link the customer was sent, and switching the link off in the
 * order form also shuts this endpoint for that order.
 */

/** Same gate for every verb here: a live order with the link switched on. */
async function openLink(token: string) {
  const link = await repo.getByRosterToken(token);
  if (!link || !link.enabled) return null;
  // A locked order takes no new files either — an upload that can't be
  // attached to anything is just an orphan in the bucket.
  if (link.locked) return null;
  return link;
}

/**
 * Ask for a signed URL to upload straight to storage, and afterwards for a
 * preview link. Mirrors /api/upload/sign — see the long comment there for why
 * the file can't travel through this function: Vercel caps a serverless
 * request body at about 4.5 MB, so a customer's phone photo of a crest was
 * being rejected before any of this code ran.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await openLink(token))) {
    return Response.json({ error: 'This link is not active.' }, { status: 403 });
  }
  if (!isSupabaseConfigured()) return Response.json({ error: 'not-configured' }, { status: 409 });

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
    return Response.json(await createUploadUrl({ name, size, type }));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await openLink(token))) {
    return Response.json({ error: 'This link is not active.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }
  const { fileUrl } = (body ?? {}) as { fileUrl?: unknown };
  if (typeof fileUrl !== 'string' || !isBucketKey(fileUrl)) {
    return Response.json({ error: 'Expected a bucket key.' }, { status: 400 });
  }

  return Response.json({ previewUrl: await resolveFileUrl(fileUrl) });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await openLink(token))) {
    return Response.json({ error: 'This link is not active.' }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }

  try {
    const stored = await putFile(file);
    /*
     * `fileUrl` is what gets stored — a key in the private bucket. The browser
     * can't load that, so hand back a signed link too for the thumbnail it
     * shows the moment the upload finishes. Only the key is ever persisted.
     */
    return Response.json({ ...stored, previewUrl: await resolveFileUrl(stored.fileUrl) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
