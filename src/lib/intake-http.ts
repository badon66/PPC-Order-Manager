import { allowedOrigins, isAllowedOrigin } from '@/lib/data/intake-logic';

/**
 * CORS for the two intake routes. Only the website's origins get a reply;
 * everything else is refused before any body is read. Route files may only
 * export HTTP verbs, which is why these two helpers live here.
 */
export function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

/** The request's Origin when it is one of ours, otherwise null. */
export function originOf(req: Request): string | null {
  const origin = req.headers.get('origin');
  return isAllowedOrigin(origin, allowedOrigins()) ? origin : null;
}
