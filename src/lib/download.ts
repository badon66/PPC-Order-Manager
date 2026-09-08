/**
 * Making a file actually download, with a name worth having.
 *
 * TWO PROBLEMS, BOTH INVISIBLE UNTIL YOU TRY IT ON A REAL ORDER.
 *
 * 1. `<a download>` is ignored cross-origin. Artwork is served from Supabase
 *    signed URLs, which are a different origin to the app, so the attribute
 *    does nothing and the browser just opens the file in a tab. A download
 *    button that silently previews is worse than no button. Supabase honours a
 *    `download` query parameter on a signed URL and answers with
 *    `Content-Disposition: attachment`, which works cross-origin — that's what
 *    `asDownload` adds.
 *
 * 2. The stored filenames are unusable. 81 of the imported assets are things
 *    like `dcaadcd01_Screenshot2026-08-18033820.png`. Downloading six of those
 *    to send to production means six files nobody can tell apart, so the name
 *    is rebuilt from what the file actually is.
 *
 * No server imports here on purpose — a client component may want it.
 */

/** Everything a filesystem, an email client or a zip is happier without. */
function slug(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 60);
}

/** The extension on a filename or URL, lowercased, without the dot. */
export function extensionFrom(...candidates: string[]): string {
  for (const c of candidates) {
    if (!c) continue;
    const m = /\.([a-z0-9]{2,5})(?:\?|#|$)/i.exec(c);
    if (m) return m[1].toLowerCase();
  }
  return '';
}

/**
 * A filename built from what the file is, not what it was called.
 *
 * `downloadName(['The Trashers', 'Main Crest'], 'dcaadcd01_Screenshot.png')`
 * → `The-Trashers-Main-Crest.png`
 *
 * Empty parts are dropped, so this still gives something sensible when the
 * team name isn't to hand.
 */
export function downloadName(parts: Array<string | undefined | null>, ...extSources: string[]): string {
  const base = parts.map((p) => slug(p ?? '')).filter(Boolean).join('-') || 'artwork';
  const ext = extensionFrom(...extSources);
  return ext ? `${base}.${ext}` : base;
}

/**
 * A URL that downloads rather than opens.
 *
 * Only rewritten for Supabase storage URLs, which is where the parameter means
 * something. A local `/uploads/...` path is same-origin, so the plain
 * `download` attribute already works on it, and a leftover base44.app URL is
 * someone else's server that will ignore anything we add — better to hand back
 * a link that opens than one that 404s.
 */
export function asDownload(url: string, filename: string): string {
  if (!url || !url.includes('/storage/v1/object/')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}download=${encodeURIComponent(filename)}`;
}
