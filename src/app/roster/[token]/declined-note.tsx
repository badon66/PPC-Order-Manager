import { formatShort } from '@/lib/dates';

/**
 * "We didn't use what you last sent" — on the team's form, when Keenan
 * declined their latest submission (2026-11-09). Their form starts from
 * what's on the order again; this says why, in his words.
 */
export function DeclinedNote({ declined }: { declined: { at: string; reason: string } | null }) {
  if (!declined) return null;
  return (
    <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
      <p className="font-semibold text-amber-200">
        What you sent on {formatShort(declined.at.slice(0, 10))} wasn&apos;t added to your order.
      </p>
      {declined.reason && <p className="mt-1 text-amber-100/90">{declined.reason}</p>}
      <p className="mt-1 text-xs text-muted">
        The form below starts from what&apos;s on your order now. Send it again with anything that still needs changing.
      </p>
    </div>
  );
}
