'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CopyButton } from '@/components/order-controls';
import { createFactoryLink } from '@/app/orders/factory-link-action';

/**
 * The factory link, beside the share and client-form links on the order page.
 *
 * Copy it when there is one; make it when there isn't (orders from before the
 * factory sheet). The link opens /factory/<token>, which asks for the factory
 * code — so sending it to Michael is safe even though it's a bare URL.
 */
export function FactoryLink({ orderId, link }: { orderId: string; link: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (link) return <CopyButton label="Copy Factory Link" value={link} />;

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-ppc-gold/60 bg-ppc-gold/10 px-3.5 py-2 text-sm font-semibold text-ppc-gold hover:bg-ppc-gold/20 disabled:opacity-50"
        onClick={() =>
          start(async () => {
            const r = await createFactoryLink(orderId);
            if (!r.ok) setError(r.error ?? 'Could not make the link');
            else router.refresh();
          })
        }
      >
        {pending ? 'Making…' : 'Make Factory Link'}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </span>
  );
}
