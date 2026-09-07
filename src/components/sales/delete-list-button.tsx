'use client';

import { useTransition } from 'react';
import { deleteCallList } from '@/app/sales/actions';

export function DeleteListButton({ listId, name }: { listId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete the list "${name}"? Calls already logged are kept but hidden with it.`)) return;
        start(() => deleteCallList(listId));
      }}
      className="rounded-lg border border-red-500/50 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
    >
      Delete
    </button>
  );
}
