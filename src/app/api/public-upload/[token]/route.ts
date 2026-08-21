import { repo } from '@/lib/data';
import { putFile, resolveFileUrl } from '@/lib/storage';

/**
 * Upload endpoint for the customer's roster form.
 *
 * No session, on purpose — customers don't log in. What stands in for auth is
 * the roster token: it has to resolve to a live order with the client link
 * switched on, or nothing gets stored. So the "credential" is the same
 * unguessable link the customer was sent, and switching the link off in the
 * order form also shuts this endpoint for that order.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await repo.getByRosterToken(token);
  if (!link || !link.enabled) {
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
