import { formatTimestamp } from '@/lib/dates';
import type { ApprovalRecord } from '@/lib/types';

/**
 * What a sign-off looks like after the fact.
 *
 * Rendered identically on the customer's page, the roster form and the admin
 * order sheet, deliberately: if the team and Keenan ever disagree about what
 * was approved, they should both be looking at the same thing.
 *
 * The signature is a data URL held on the record, so it needs no signed link
 * and can't expire — unlike artwork, which lives in the private bucket. It's
 * shown on white because it was drawn in dark ink on white.
 */
export function SignatureProof({ record }: { record: ApprovalRecord }) {
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Signature</p>

      {record.signatureDataUrl ? (
        <div className="mt-2 inline-block max-w-full overflow-hidden rounded-lg border border-line bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={record.signatureDataUrl}
            alt={`Signature of ${record.signedName}`}
            className="block h-auto w-full max-w-xs"
          />
        </div>
      ) : (
        /*
         * Approvals taken before signatures were drawn have a name and nothing
         * else. Saying so is better than an empty box that looks broken.
         */
        <p className="mt-2 text-sm text-muted">
          Signed by name only — this approval predates the signature box.
        </p>
      )}

      <p className="mt-2 text-sm font-semibold">{record.signedName}</p>
      <p className="mt-0.5 text-xs text-muted">
        Signed {formatTimestamp(record.signedAt)}
        {record.termsAccepted ? ', terms and conditions accepted' : ''}.
      </p>
    </div>
  );
}
