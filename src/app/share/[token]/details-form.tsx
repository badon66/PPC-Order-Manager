'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SubmittedContact } from '@/lib/types';
import { sendShippingDetails } from './actions';

/**
 * The contact and shipping details, filled in right on the order sheet when
 * the order is missing them (Keenan, 2026-10-20). Starts from what we have —
 * what they sent and Keenan hasn't added yet, else what's on the order — so
 * nobody types their name twice. Sent as a submission for Keenan to accept.
 */
export function ShippingDetailsForm({
  token,
  start,
  waiting,
}: {
  token: string;
  start: SubmittedContact;
  /** They've sent details already, waiting for Keenan to add them. */
  waiting: boolean;
}) {
  const router = useRouter();
  const [c, setC] = useState<SubmittedContact>(start);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const put = (k: keyof SubmittedContact) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: e.target.value });

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await sendShippingDetails(token, c);
      setMsg(r.ok
        ? { ok: true, text: "Got it, thanks. We'll add these to your order." }
        : { ok: false, text: r.error ?? 'That didn’t send. Please try again.' });
      if (r.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        {waiting
          ? "We've got the details you sent and will add them to your order. If anything's wrong, fix it below and send it again."
          : "We still need who to contact and where the order ships. Fill it in here and send it — it goes straight to us."}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input placeholder="First name" value={c.firstName} onChange={put('firstName')} />
        <input placeholder="Last name" value={c.lastName} onChange={put('lastName')} />
        <input placeholder="Email" type="email" value={c.email} onChange={put('email')} />
        <input placeholder="Phone" type="tel" value={c.phone} onChange={put('phone')} />
        <input className="sm:col-span-2" placeholder="Street address" value={c.street} onChange={put('street')} />
        <input className="sm:col-span-2" placeholder="Unit / suite (optional)" value={c.secondary} onChange={put('secondary')} />
        <input placeholder="City" value={c.city} onChange={put('city')} />
        <input placeholder="Province / State" value={c.province} onChange={put('province')} />
        <input placeholder="Postal code" value={c.postal} onChange={put('postal')} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={send}
          className="rounded-lg bg-ppc-gold px-5 py-2.5 text-sm font-bold text-black hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Sending…' : waiting ? 'Send updated details' : 'Send my details'}
        </button>
        {msg && (
          <span aria-live="polite" className={`text-sm font-semibold ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
