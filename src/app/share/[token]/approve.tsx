'use client';

import { useState } from 'react';
import { APPROVAL_STATEMENT, TERMS_URL } from '@/lib/constants';
import { approveOrder } from './actions';

/**
 * Customer sign-off.
 *
 * Two deliberate steps: a button that opens a dialog, then the dialog itself.
 * Approval is irreversible and locks the order, so it should not be something
 * a thumb can do while scrolling — the dialog is the pause.
 *
 * Inside it, three things have to be true before Approve does anything: the
 * terms box is ticked, a name is typed, and that name is at least a plausible
 * name rather than a keystroke. All three are checked again on the server; the
 * disabled button is a courtesy, not the enforcement.
 */
export function ApproveBlock({ token, teamName }: { token: string; teamName: string }) {
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const signable = agreed && name.trim().length >= 2;

  async function submit() {
    setError(null);
    setBusy(true);
    const res = await approveOrder(token, { signedName: name.trim(), termsAccepted: agreed });
    setBusy(false);
    if (res.ok) {
      setDone(true);
      setOpen(false);
    } else {
      setError(res.error ?? 'Could not record the approval. Please try again.');
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-center">
        <p className="font-semibold text-emerald-200">Thank you — that&apos;s approved.</p>
        <p className="mt-1 text-sm text-muted">
          We&apos;ve recorded your sign-off and we&apos;ll get started. Refresh this page to see it
          on the order.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-ppc-gold/40 bg-ppc-gold/5 p-5">
        <p className="font-semibold text-ppc-gold">Ready to approve?</p>
        <p className="mt-1 text-sm text-muted">
          Have a careful read through everything above first — the design, the names and numbers,
          the sizes, and the shipping address. Approving finalises the order.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-lg bg-ppc-gold px-4 py-2.5 text-sm font-bold text-black hover:brightness-110"
        >
          Approve this order
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Approve this order"
        >
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-surface p-5">
            <h2 className="text-lg font-bold">Approve {teamName || 'this order'}</h2>

            {/*
              * The statement is rendered from the same constant that gets
              * stored on the record, so what they read and what we keep can't
              * drift apart.
              */}
            <p className="mt-3 rounded-lg border border-line bg-surface-2 p-3 text-sm">
              {APPROVAL_STATEMENT}
            </p>

            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                I&apos;ve read and accept the{' '}
                <a
                  href={TERMS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-ppc-gold hover:underline"
                >
                  terms and conditions
                </a>
                .
              </span>
            </label>

            <label className="mt-4 block text-sm">
              <span className="text-xs font-medium text-muted">Sign your name</span>
              <input
                className="mt-1"
                value={name}
                placeholder="Type your full name"
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            {error && <p className="mt-3 text-sm font-semibold text-red-300">{error}</p>}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-muted hover:text-fg"
              >
                Not yet
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!signable || busy}
                className="rounded-lg bg-ppc-gold px-4 py-2 text-sm font-bold text-black hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? 'Recording…' : 'Approve order'}
              </button>
            </div>

            {!signable && (
              <p className="mt-2 text-right text-xs text-muted">
                Tick the box and sign your name to approve.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
