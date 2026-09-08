'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCallList } from '@/app/sales/actions';

/** A list is a name. Contacts come later, by uploading sheets into it. */
export function NewListForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createCallList(name);
      if (res.ok) router.push(`/sales/${res.listId}`);
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted">List name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Beer league, Youth, High school" className="mt-1" required />
        </label>
        <button type="submit" disabled={pending} className="inline-flex items-center justify-center rounded-lg bg-ppc-gold px-4 py-2.5 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-50">
          {pending ? 'Creating…' : 'Create list'}
        </button>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <p className="text-xs text-muted">One list per kind of team. You add contacts to it by uploading spreadsheets, as many times as you like.</p>
    </form>
  );
}
