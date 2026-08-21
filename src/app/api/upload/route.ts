import { requireRole } from '@/lib/auth';
import { putFile, resolveFileUrl } from '@/lib/storage';

export async function POST(req: Request) {
  await requireRole('staff');

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
