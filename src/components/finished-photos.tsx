'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { attachAsset, detachAsset } from '@/app/orders/actions';
import { uploadFile } from '@/components/order-form/assets';
import type { ViewableAsset } from '@/lib/types';

/**
 * Finished-jersey photos, managed straight from the staff panel.
 *
 * Same three-step upload the artwork groups use (see `uploadFile` in
 * order-form/assets.tsx) — imported rather than copied, so the Vercel
 * body-size workaround it encodes only has to be right in one place.
 *
 * `router.refresh()` after every add/remove: this card is a client island on
 * a server-rendered page, and the photo count elsewhere in the panel (and
 * whether the standalone card is even shown) is the server's own read of the
 * assets, not local state.
 */

const MAX_FINISHED_PHOTOS = 8;

export function FinishedPhotos({ orderId, photos }: { orderId: string; photos: ViewableAsset[] }) {
  const router = useRouter();
  const mine = [...photos].sort((a, b) => a.slot - b.slot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList) {
    setError(null);
    setBusy(true);
    try {
      let slot = mine.length;
      for (const file of Array.from(files)) {
        if (slot >= MAX_FINISHED_PHOTOS) {
          setError(`Finished photos hold up to ${MAX_FINISHED_PHOTOS} files.`);
          break;
        }
        const stored = await uploadFile(file);
        await attachAsset({
          orderId,
          role: 'finished_photo',
          slot,
          fileUrl: stored.fileUrl,
          fileName: stored.fileName,
          displayName: stored.fileName,
          notes: '',
        });
        slot++;
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(assetId: string) {
    setError(null);
    await detachAsset(assetId, orderId);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">
          {mine.length} of {MAX_FINISHED_PHOTOS}
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept="image/*"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={busy || mine.length >= MAX_FINISHED_PHOTOS}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold hover:border-ppc-gold/60 disabled:opacity-40"
        >
          {busy ? 'Uploading…' : '+ Add photos'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-red-300">{error}</p>}

      {mine.length > 0 && (
        <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {mine.map((p) => (
            <li key={p.id} className="group relative overflow-hidden rounded-lg border border-line bg-black/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.viewUrl} alt="" className="h-16 w-full object-cover" />
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label="Remove photo"
                className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white opacity-0 transition group-hover:opacity-100"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
