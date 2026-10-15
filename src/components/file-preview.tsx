import { FileThumb, isPreviewable } from './file-thumb';

/**
 * A file as it is.
 *
 * Keenan's rule (2026-10-15): no photo is ever shrunk into a thumbnail you
 * have to click to see the whole of. An image is shown whole, at its own
 * shape — never cropped into a square, never squeezed into a fixed box — and
 * as wide as it really is, up to the width of the space it's in. A big photo
 * is scaled down to fit (its proportions kept); a small logo is never blown
 * up past its own size.
 *
 * Clicking still opens the original in a new tab, for zooming or saving — but
 * nothing has to be clicked to be seen.
 *
 * Anything a browser can't draw (.ai, .eps, .pdf) gets its format as a badge
 * instead, the same one FileThumb shows.
 *
 * No 'use client': a plain function of its props.
 */
export function FilePreview({
  fileName,
  url,
  className = '',
}: {
  fileName: string;
  /** A URL that loads now — a signed one for the private bucket. */
  url: string;
  className?: string;
}) {
  if (isPreviewable(fileName) && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" title={`${fileName} — open the original`} className="block w-fit max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={fileName}
          loading="lazy"
          className={`block h-auto max-w-full rounded bg-[repeating-conic-gradient(#ffffff0d_0_25%,transparent_0_50%)] bg-[length:16px_16px] ${className}`}
        />
      </a>
    );
  }
  return (
    <a href={url || undefined} target="_blank" rel="noreferrer" title={`Open ${fileName}`} className="inline-block">
      <FileThumb fileName={fileName} url={url} size="lg" />
    </a>
  );
}
