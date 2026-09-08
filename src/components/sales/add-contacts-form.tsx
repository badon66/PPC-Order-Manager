'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadIntoList } from '@/app/sales/actions';

/**
 * Upload a sheet into this list. Rows that match a contact already here (same
 * phone or email) fill its blanks; the rest are added. The report is
 * persisted on the list and shown below after the page refreshes.
 */
export function AddContactsForm({ listId }: { listId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const form = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await uploadIntoList(listId, fd);
      if (!res.ok) { setError(res.error); return; }
      setDone(`${res.added} added · ${res.merged} matched existing contact${res.merged === 1 ? '' : 's'}${res.alsoIn ? ` · ${res.alsoIn} also in another list` : ''}`);
      form.current?.reset();
      setFileName('');
      router.refresh();
    });
  }

  return (
    <form ref={form} onSubmit={onSubmit} className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted">Spreadsheet (.xlsx or .csv)</span>
          <input type="file" name="file" accept=".xlsx,.csv" required onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} className="mt-1 block w-full text-sm" />
          {fileName && <span className="mt-1 block truncate text-xs text-muted">{fileName}</span>}
        </label>
        <button type="submit" disabled={pending} className="inline-flex items-center justify-center rounded-lg bg-ppc-gold px-4 py-2.5 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-50">
          {pending ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {done && <p className="text-sm text-emerald-300">{done}</p>}
      <p className="text-xs text-muted">
        Same{' '}
        <a href="/templates/powerplay-call-list-template.xlsx" download className="font-semibold text-ppc-gold hover:underline">blank template</a>
        {' '}as always. A row with the same phone or email as a contact already here fills in that contact&apos;s blanks instead of being added twice. A Script tab replaces this list&apos;s script; leave it out to keep the current one.
      </p>
    </form>
  );
}
