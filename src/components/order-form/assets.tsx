'use client';

import { useRef, useState } from 'react';
import { MAX_FILES_PER_REFERENCE_GROUP } from '@/lib/constants';
import type { AssetRole, OrderAsset, ViewableAsset } from '@/lib/types';

/**
 * Artwork slots.
 *
 * The old schema had ~28 individually-numbered file columns (main_crest_file_2,
 * left_shoulder_logo_file_4, ...). Here every file is a row with a role and a
 * slot, so "allow a fifth reference image" is a number change, not a migration.
 */

export interface AssetGroupProps {
  orderId: string;
  role: AssetRole;
  title: string;
  hint?: string;
  max?: number;
  assets: ViewableAsset[];
  notes?: string;
  onNotesChange?: (v: string) => void;
  onAdd: (asset: Omit<OrderAsset, 'id'>) => Promise<void>;
  onRemove: (assetId: string) => Promise<void>;
}

/**
 * `fileUrl` is the key we store; `previewUrl` is a signed link that works right
 * now, for the thumbnail shown the instant the upload lands.
 */
async function uploadFile(
  file: File,
): Promise<{ fileUrl: string; fileName: string; previewUrl: string }> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Upload failed');
  return json;
}

export function AssetGroup({
  orderId,
  role,
  title,
  hint,
  max = MAX_FILES_PER_REFERENCE_GROUP,
  assets,
  notes,
  onNotesChange,
  onAdd,
  onRemove,
}: AssetGroupProps) {
  const mine = assets.filter((a) => a.role === role).sort((a, b) => a.slot - b.slot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList) {
    setError(null);
    setBusy(true);
    try {
      let slot = mine.length;
      for (const file of Array.from(files)) {
        if (slot >= max) {
          setError(`${title} holds up to ${max} files.`);
          break;
        }
        const stored = await uploadFile(file);
        await onAdd({
          orderId,
          role,
          slot,
          fileUrl: stored.fileUrl,
          fileName: stored.fileName,
          displayName: '',
          notes: '',
        });
        slot++;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-sm font-semibold">{title}</span>
          <span className="ml-2 text-xs text-muted">
            {mine.length}/{max}
          </span>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept="image/*,.pdf,.svg,.ttf,.otf,.woff,.woff2"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={busy || mine.length >= max}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold hover:border-ppc-gold/60 disabled:opacity-40"
        >
          {busy ? 'Uploading…' : '+ Upload'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-red-300">{error}</p>}

      {mine.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {mine.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded border border-line bg-surface p-2">
              <Thumb fileName={a.fileName} url={a.viewUrl} />
              <div className="min-w-0 flex-1">
                <a
                  href={a.viewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs font-semibold text-ppc-gold hover:underline"
                >
                  {a.fileName}
                </a>
              </div>
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                aria-label="Remove file"
                className="rounded px-1.5 py-1 text-xs text-muted hover:text-red-300"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {onNotesChange && (
        <textarea
          className="mt-3"
          rows={2}
          placeholder={`${title} notes...`}
          value={notes ?? ''}
          onChange={(e) => onNotesChange(e.target.value)}
        />
      )}
    </div>
  );
}

function Thumb({ fileName, url }: { fileName: string; url: string }) {
  const isImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(fileName);
  if (!isImage) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface-2 text-[0.6rem] font-bold text-muted">
        FILE
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url}
      alt=""
      className="h-9 w-9 shrink-0 rounded object-cover"
    />
  );
}
