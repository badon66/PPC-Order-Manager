'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { renameCallList } from '@/app/sales/actions';

/** The list's name as the page title, with a pencil that turns it into an input. */
export function RenameList({ listId, name }: { listId: string; name: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <span className="truncate">{name}</span>
        <button type="button" onClick={() => { setValue(name); setEditing(true); }} className="text-sm font-normal text-muted hover:text-ppc-gold" aria-label="Rename list" title="Rename">✎</button>
      </h1>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await renameCallList(listId, value);
          if (!res.ok) { setError(res.error); return; }
          setEditing(false);
          router.refresh();
        });
      }}
    >
      <input value={value} onChange={(e) => setValue(e.target.value)} className="text-xl font-bold" aria-label="List name" autoFocus />
      <button type="submit" disabled={pending} className="rounded-lg bg-ppc-gold px-3 py-1.5 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-50">Save</button>
      <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-ppc-gold/60">Cancel</button>
      {error && <span className="text-sm text-red-300">{error}</span>}
    </form>
  );
}
