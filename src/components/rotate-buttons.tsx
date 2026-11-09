'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { rotateAssetFile } from '@/app/orders/actions';
import { uploadFile } from '@/components/order-form/assets';
import { canRotate, rotatedCopy } from '@/lib/rotate-image';
import type { ViewableAsset } from '@/lib/types';

/**
 * ⟲ ⟳ under a photo (Keenan, 2026-11-03): turn it a quarter, for good.
 *
 * Turns the actual picture (rotate-image.ts), uploads the turned copy and
 * points the same asset at it — so the email attachment, the factory's
 * download and the customer's sheet all get it the right way up. Staff only:
 * the server action checks. Renders nothing for a file that isn't a photo.
 *
 * `onRotated` hands back the updated asset for a form holding its own list;
 * without it the page is refreshed.
 */
export function RotateButtons({
  asset,
  onRotated,
  className = '',
}: {
  asset: ViewableAsset;
  onRotated?: (next: ViewableAsset) => void;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canRotate(asset.fileName) || !asset.viewUrl) return null;

  async function turn(by: 90 | -90) {
    setBusy(true);
    setError(null);
    try {
      const file = await rotatedCopy(asset.viewUrl, asset.fileName, by);
      const stored = await uploadFile(file);
      const r = await rotateAssetFile(asset.id, asset.orderId, { fileUrl: stored.fileUrl, fileName: asset.fileName });
      if (!r.ok) throw new Error(r.error);
      if (onRotated) onRotated(r.asset);
      else router.refresh();
    } catch (e) {
      setError((e as Error).message || "Couldn't turn that photo.");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    'rounded border border-line bg-surface-2 px-2 py-0.5 text-sm leading-none text-muted hover:border-ppc-gold/60 hover:text-ppc-gold disabled:opacity-40';
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <button type="button" disabled={busy} onClick={() => turn(-90)} title="Turn left" aria-label="Turn photo left" className={btn}>
        ⟲
      </button>
      <button type="button" disabled={busy} onClick={() => turn(90)} title="Turn right" aria-label="Turn photo right" className={btn}>
        ⟳
      </button>
      {busy && <span className="text-xs text-muted">Turning…</span>}
      {error && <span className="text-xs text-red-300">{error}</span>}
    </span>
  );
}
