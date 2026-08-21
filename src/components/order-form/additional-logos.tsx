'use client';

import { useRef, useState } from 'react';
import { MAX_FILES_PER_ADDITIONAL_LOGO } from '@/lib/constants';
import type { OrderAsset, ViewableAsset } from '@/lib/types';

/**
 * Additional logos — sponsor patches and the like.
 *
 * Base44 modelled this as a list of named logos ("Logo 1", "Logo 2"), each with
 * its own label, placement notes and up to two files. That grouping is the
 * useful part: a sponsor logo plus its alternate colourway belong together, and
 * "this one goes between the shoulder stripes on the back" is a note about the
 * logo, not about a file. My first pass flattened it to a bare file list and
 * lost that. This restores it.
 */

interface Group {
  id: string;
  displayName: string;
  notes: string;
  assets: ViewableAsset[];
}

function groupAssets(assets: ViewableAsset[]): Group[] {
  const map = new Map<string, Group>();
  for (const a of assets.filter((x) => x.role === 'additional_logo')) {
    const key = a.groupId ?? a.id;
    const existing = map.get(key);
    if (existing) {
      existing.assets.push(a);
      existing.displayName ||= a.displayName;
      existing.notes ||= a.notes;
    } else {
      map.set(key, {
        id: key,
        displayName: a.displayName,
        notes: a.notes,
        assets: [a],
      });
    }
  }
  return [...map.values()].map((g) => ({
    ...g,
    assets: g.assets.sort((x, y) => x.slot - y.slot),
  }));
}

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

export function AdditionalLogos({
  orderId,
  assets,
  onAdd,
  onRemove,
  onRenameGroup,
}: {
  orderId: string;
  assets: ViewableAsset[];
  onAdd: (a: Omit<OrderAsset, 'id'>) => Promise<void>;
  onRemove: (assetId: string) => Promise<void>;
  onRenameGroup: (groupId: string, patch: { displayName?: string; notes?: string }) => void;
}) {
  const saved = groupAssets(assets);

  // Groups you've added but not yet put a file in. They only become real rows
  // once there's something to attach the label to.
  const [pending, setPending] = useState<Group[]>([]);
  const groups = [...saved, ...pending.filter((p) => !saved.some((s) => s.id === p.id))];

  function addGroup() {
    setPending((p) => [
      ...p,
      { id: crypto.randomUUID(), displayName: '', notes: '', assets: [] },
    ]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Additional Logos</span>
        <button
          type="button"
          onClick={addGroup}
          className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold hover:border-ppc-gold/60"
        >
          + Add Logo
        </button>
      </div>

      {groups.length === 0 && (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-xs text-muted">
          Sponsor logos, patches, anything extra. Each one gets its own name and placement notes.
        </p>
      )}

      {groups.map((g, i) => (
        <LogoCard
          key={g.id}
          index={i}
          group={g}
          orderId={orderId}
          onAdd={onAdd}
          onRemove={onRemove}
          onRenameGroup={onRenameGroup}
          onLocalChange={(patch) =>
            setPending((p) => p.map((x) => (x.id === g.id ? { ...x, ...patch } : x)))
          }
          onDiscard={() => setPending((p) => p.filter((x) => x.id !== g.id))}
        />
      ))}
    </div>
  );
}

function LogoCard({
  index,
  group,
  orderId,
  onAdd,
  onRemove,
  onRenameGroup,
  onLocalChange,
  onDiscard,
}: {
  index: number;
  group: Group;
  orderId: string;
  onAdd: (a: Omit<OrderAsset, 'id'>) => Promise<void>;
  onRemove: (assetId: string) => Promise<void>;
  onRenameGroup: (groupId: string, patch: { displayName?: string; notes?: string }) => void;
  onLocalChange: (patch: Partial<Group>) => void;
  onDiscard: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const persisted = group.assets.length > 0;

  async function handleFiles(files: FileList) {
    setError(null);
    setBusy(true);
    try {
      let slot = group.assets.length;
      for (const file of Array.from(files)) {
        if (slot >= MAX_FILES_PER_ADDITIONAL_LOGO) {
          setError(`Each logo holds up to ${MAX_FILES_PER_ADDITIONAL_LOGO} files.`);
          break;
        }
        const stored = await uploadFile(file);
        await onAdd({
          orderId,
          role: 'additional_logo',
          slot,
          fileUrl: stored.fileUrl,
          fileName: stored.fileName,
          displayName: group.displayName,
          notes: group.notes,
          groupId: group.id,
        });
        slot++;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function setField(field: 'displayName' | 'notes', value: string) {
    onLocalChange({ [field]: value } as Partial<Group>);
    if (persisted) onRenameGroup(group.id, { [field]: value });
  }

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-ppc-gold">
          Logo {index + 1}
        </span>
        {!persisted && (
          <button
            type="button"
            onClick={onDiscard}
            className="text-xs text-muted hover:text-red-300"
          >
            Remove
          </button>
        )}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input
          placeholder="Logo name (e.g. Sponsor — back)"
          defaultValue={group.displayName}
          onBlur={(e) => setField('displayName', e.target.value)}
        />
        <input
          placeholder="Placement notes"
          defaultValue={group.notes}
          onBlur={(e) => setField('notes', e.target.value)}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept="image/*,.pdf,.svg"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={busy || group.assets.length >= MAX_FILES_PER_ADDITIONAL_LOGO}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold hover:border-ppc-gold/60 disabled:opacity-40"
        >
          {busy ? 'Uploading…' : '+ Upload file'}
        </button>
        <span className="text-xs text-muted">
          {group.assets.length}/{MAX_FILES_PER_ADDITIONAL_LOGO}
        </span>
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-red-300">{error}</p>}

      {group.assets.length > 0 && (
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {group.assets.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded border border-line bg-surface p-2"
            >
              <a
                href={a.viewUrl}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-xs font-semibold text-ppc-gold hover:underline"
              >
                {a.fileName}
              </a>
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
    </div>
  );
}
