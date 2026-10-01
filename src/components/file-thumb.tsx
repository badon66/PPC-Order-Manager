/**
 * The small picture-or-badge shown next to an uploaded file.
 *
 * One implementation, used by Keenan's artwork groups, the additional logos
 * and the customer's form. There were three copies, and they had already
 * started to disagree about what counts as an image.
 *
 * A browser can draw PNG, JPG, WebP, GIF and SVG in an <img>. It cannot draw
 * .ai, .eps or .pdf, so those get their format as a badge instead of a broken
 * image. The badge is gold for the vector formats we want a logo in, so an
 * upload that went right looks like it went right: a grey box reading "FILE"
 * after sending an .ai reads as a failure, and people "fix" it with a JPG.
 *
 * No 'use client' — it's a plain function of its props and renders on either
 * side.
 */

const IMAGE = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
const VECTOR_BADGES = /^(AI|EPS|PS|PDF|SVG|CDR)$/;

export function fileBadge(fileName: string): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(fileName);
  return m ? m[1].toUpperCase() : 'FILE';
}

export function isPreviewable(fileName: string): boolean {
  return IMAGE.test(fileName);
}

export function FileThumb({
  fileName,
  url,
  size = 'sm',
}: {
  fileName: string;
  /** A URL the browser can load now — a signed one, for the private bucket. */
  url: string;
  size?: 'sm' | 'md';
}) {
  const box = size === 'md' ? 'h-12 w-12' : 'h-9 w-9';

  if (isPreviewable(fileName) && url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" title={fileName} className={`${box} shrink-0 rounded object-cover`} />;
  }

  const badge = fileBadge(fileName);
  const vector = VECTOR_BADGES.test(badge);
  return (
    <span
      title={fileName}
      className={`flex ${box} shrink-0 items-center justify-center rounded text-[0.6rem] font-bold ${
        vector ? 'bg-ppc-gold/15 text-ppc-gold' : 'bg-surface-2 text-muted'
      }`}
    >
      {badge}
    </span>
  );
}
