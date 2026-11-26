'use client';

import { useActionState, useState } from 'react';
import { unlockFactory } from './actions';

export function FactoryUnlockForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(unlockFactory, {});
  // Held here: a form is cleared after it's sent, and retyping your name after a wrong passcode is a nuisance.
  const [name, setName] = useState('');

  return (
    <form action={action} className="mt-5 space-y-3">
      <input type="hidden" name="next" value={next} />
      <input
        name="code"
        type="password"
        autoFocus
        autoComplete="off"
        placeholder="Passcode"
        aria-label="Passcode"
        aria-invalid={Boolean(state?.error)}
      />
      {/* Who to show Powerplay as having moved a job or asked a question. */}
      <input name="name" type="text" autoComplete="name" maxLength={40} placeholder="Your name" aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
      {state?.error && (
        <p className="text-sm font-semibold text-red-300">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-ppc-gold px-4 py-2.5 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-50"
      >
        {pending ? 'Checking…' : 'Open the dashboard'}
      </button>
    </form>
  );
}
