'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadCallList } from '@/app/sales/actions';

/**
 * One step: pick the file, name the list, upload. The action parses and
 * creates the list; you land on it with the import report. No preview — a
 * bad upload is one delete away, and the report is persisted on the list.
 */
export function UploadForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [fileName, setFileName] = useState('');
  const form = useRef<HTMLFormElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFileName(f?.name ?? '');
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set('name', name);
    start(async () => {
      const res = await uploadCallList(fd);
      if (res.ok) router.push(`/sales/${res.listId}`);
      else setError(res.error);
    });
  }

  return (
    <form ref={form} onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted">Spreadsheet (.xlsx or .csv)</span>
          <input type="file" name="file" accept=".xlsx,.csv" required onChange={onFile} className="mt-1 block w-full text-sm" />
          {fileName && <span className="mt-1 block truncate text-xs text-muted">{fileName}</span>}
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted">List name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. OMHA associations — fall 2026" className="mt-1" />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-lg bg-ppc-gold px-4 py-2.5 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-50"
        >
          {pending ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <p className="text-xs text-muted">
        Start from the{' '}
        <a href="/templates/powerplay-call-list-template.xlsx" download className="font-semibold text-ppc-gold hover:underline">
          blank template
        </a>
        {' '}— contacts on one tab, the call script on another. Each upload makes a new list.
      </p>
    </form>
  );
}
