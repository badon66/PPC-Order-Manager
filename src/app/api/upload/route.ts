import { requireRole } from '@/lib/auth';
import { putFile } from '@/lib/storage';

export async function POST(req: Request) {
  await requireRole('staff');

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }

  try {
    const stored = await putFile(file);
    return Response.json(stored);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
