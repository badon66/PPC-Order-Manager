'use client';

import { useEffect, useState } from 'react';
import { FileThumb, isPreviewable } from './file-thumb';

/**
 * A thumbnail you can click to see the file full-size.
 *
 * Checking a crest means looking at it at a size where a wrong colour or a
 * missing stroke shows; the thumbnail is for finding it, the lightbox is for
 * checking it. Images open in an overlay over the page. Anything a browser
 * can't draw (.ai, .eps) opens in a new tab instead, which downloads it — the
 * honest behaviour, since there is nothing to show.
 */
export function ClickableThumb({
  fileName,
  url,
  size = 'lg',
}: {
  fileName: string;
  url: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [open, setOpen] = useState(false);
  const previewable = isPreviewable(fileName) && Boolean(url);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => (previewable ? setOpen(true) : window.open(url, '_blank', 'noreferrer'))}
        title={previewable ? `View ${fileName} full size` : `Open ${fileName}`}
        className="shrink-0 rounded transition-transform hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-ppc-gold/60"
      >
        <FileThumb fileName={fileName} url={url} size={size} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={fileName}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/90 p-6"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={fileName}
            className="max-h-[92vh] max-w-[92vw] rounded object-contain shadow-2xl"
          />
          <div className="pointer-events-none absolute bottom-4 left-0 right-0 text-center text-xs text-white/70">
            {fileName} · click anywhere or press Esc to close
          </div>
        </div>
      )}
    </>
  );
}
