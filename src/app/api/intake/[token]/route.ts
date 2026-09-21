import { NextResponse } from 'next/server';
import { repo } from '@/lib/data';
import { TOKEN_RE } from '@/lib/data/intake-logic';
import { corsHeaders, originOf } from '@/lib/intake-http';

export const dynamic = 'force-dynamic';

/**
 * "Has the Draft for this token been created yet?" — asked by the website's
 * success panel before it shows the upload button, because the enquiry is
 * sent with a keepalive fetch the page never waits for. Reveals nothing but
 * existence, for a 64-hex token the asker already holds.
 */
export async function OPTIONS(req: Request) {
  const origin = originOf(req);
  if (!origin) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const origin = originOf(req);
  if (!origin) return NextResponse.json({ ok: false, error: 'Origin not allowed.' }, { status: 403 });
  const { token } = await params;
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ ok: false, error: 'Bad token.' }, { status: 400, headers: corsHeaders(origin) });
  }
  const link = await repo.getByRosterToken(token);
  return NextResponse.json({ ok: true, ready: !!link }, { headers: corsHeaders(origin) });
}
