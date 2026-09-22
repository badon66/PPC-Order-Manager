import { NextResponse } from 'next/server';
import { repo } from '@/lib/data';
import { baseUrl } from '@/lib/base-url';
import { intakeOrder, TokenTakenError } from '@/lib/data/intake';
import { INTAKE_MAX_BODY_BYTES, parseIntake, RateLimiter } from '@/lib/data/intake-logic';
import { corsHeaders, originOf } from '@/lib/intake-http';
import { confirmEnquiry } from '@/lib/intake-confirm';

export const dynamic = 'force-dynamic';

/**
 * The website's order page posts an enquiry here the moment a team presses
 * send. No session — what stands in for auth is the browser Origin (only the
 * website's), a honeypot, size caps and a light rate limit. Everything else
 * lives in intake-logic.ts / intake.ts so it is tested without HTTP.
 */

const limiter = new RateLimiter();

export async function OPTIONS(req: Request) {
  const origin = originOf(req);
  if (!origin) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = originOf(req);
  if (!origin) return NextResponse.json({ ok: false, error: 'Origin not allowed.' }, { status: 403 });
  const h = corsHeaders(origin);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  if (!limiter.allow(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Try again in a few minutes.' },
      { status: 429, headers: h },
    );
  }

  const text = await req.text();
  if (text.length > INTAKE_MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: 'Too large.' }, { status: 413, headers: h });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: 'Body must be JSON.' }, { status: 400, headers: h });
  }

  const parsed = parseIntake(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400, headers: h });
  if (parsed.honeypot) return NextResponse.json({ ok: true }, { headers: h });

  try {
    const { order, created } = await intakeOrder(parsed.value, repo);
    const base = await baseUrl();
    const rosterUrl = `${base}/roster/${order.rosterToken}`;
    // Awaited, not fired and forgotten: a serverless function may be frozen
    // the moment the response goes out, and a send left in flight is lost.
    // The page does not wait for this response (keepalive fetch), so the
    // extra second costs the customer nothing. Never throws.
    await confirmEnquiry(parsed.value, rosterUrl, created);
    return NextResponse.json(
      {
        ok: true,
        orderId: order.id,
        rosterUrl,
        managerUrl: `${base}/orders/${order.id}`,
      },
      { headers: h },
    );
  } catch (e) {
    if (e instanceof TokenTakenError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 409, headers: h });
    }
    throw e;
  }
}
