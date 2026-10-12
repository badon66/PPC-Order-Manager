'use client';

import { useActionState } from 'react';
import { unlockFactory } from './actions';

export function FactoryUnlockForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(unlockFactory, {});

  return (
    <form action={action} className="mt-5 space-y-3">
      <input type="hidden" name="next" value={next} />
      <input
        name="code"
        type="password"
        autoFocus
        autoComplete="off"
        inputMode="numeric"
        placeholder="Factory code"
        aria-invalid={Boolean(state?.error)}
      />
      {state?.error && (
        <p className="text-sm font-semibold text-red-300">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-ppc-gold px-4 py-2.5 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-50"
      >
        {pending ? 'Checking…' : 'Open the sheet'}
      </button>
    </form>
  );
}
