import { notFound } from 'next/navigation';
import { repo } from '@/lib/data';
import { formatLong } from '@/lib/dates';
import { describeSet } from '@/lib/order-utils';
import {
  JERSEY_TYPE_LABELS, LACES_LABELS, NAME_STYLE_LABELS, PANT_SHELL_TYPE_LABELS,
  PANT_TOGGLES, SHOULDER_CUT_LABELS, SOCK_TYPE_LABELS, addonsForJerseyType,
} from '@/lib/constants';
import { Card, Field, Section, Stat, StatusBadge, YesNo } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Customer-facing. No login.
 *
 * Reached through an unguessable per-order token, not the row id — a leaked
 * link should not also be a database key, and the token can be rotated.
 *
 * getByShareToken() builds this view field-by-field rather than spreading the
 * order, so contact details and the shipping address cannot leak here by
 * accident when someone adds a field later.
 */

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await repo.getByShareToken(token);
  if (!view) notFound();

  const playing = view.roster.filter((r) => !r.sockOnly);
  const hasPantShells =
    view.sets.some((s) => (s.pantShells || 0) + (s.extraPantShells || 0) > 0) ||
    view.pantShellType !== null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ppc-gold">{view.teamName}</h1>
          <p className="text-sm text-muted">Shared Order Details</p>
        </div>
        <StatusBadge status={view.status} size="lg" />
      </div>

      <Section title="Order Information">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Team Name">{view.teamName}</Field>
          <Field label="Invoice Number">{view.invoiceNumber}</Field>
          <Field label="Date Paid">{formatLong(view.datePaid)}</Field>
          <Field label="Estimated Finish">{formatLong(view.estimatedFinishDate)}</Field>
          {view.trackingCode && <Field label="Tracking Code">{view.trackingCode}</Field>}
          {view.googleDriveLink && (
            <Field label="Google Drive">
              <a
                href={view.googleDriveLink}
                target="_blank"
                rel="noreferrer"
                className="text-ppc-gold hover:underline"
              >
                View Files →
              </a>
            </Field>
          )}
        </div>
        <p className="mt-4 text-xs text-muted">
          Finish dates are estimates. Shipping can be affected by customs and carriers, especially
          on cross-border orders.
        </p>
      </Section>

      <Section title="Shipping & Contact — please check this">
        <p className="mb-4 text-sm text-muted">
          This is where the order ships and who we&apos;ll contact. If anything here is wrong,
          tell us before the order goes into production — we can&apos;t reroute it afterwards.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Contact Name">
            {[view.contact.firstName, view.contact.lastName].filter(Boolean).join(' ')}
          </Field>
          <Field label="Email">{view.contact.email}</Field>
          <Field label="Phone">{view.contact.phone}</Field>
          <Field label="Street Address">
            {[view.contact.street, view.contact.secondary].filter(Boolean).join(', ')}
          </Field>
          <Field label="City">{view.contact.city}</Field>
          <Field label="Province / State">{view.contact.province}</Field>
          <Field label="Postal Code">{view.contact.postal}</Field>
        </div>
      </Section>

      <Section title="Order Totals">
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label="Total Players" value={playing.length} accent />
          <Stat
            label="Total Jerseys"
            value={
              playing.reduce((n, r) => n + (r.jerseysPerPlayer || 0), 0) +
              view.sets.reduce((n, s) => n + (s.extraJerseys || 0), 0)
            }
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {view.sets.map((s, i) => (
            <Card key={i} className="p-3">
              <div className="text-sm font-bold text-ppc-gold">{s.label}</div>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted">Player Jerseys</dt><dd className="font-semibold">{s.playerJerseys}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Goalie Jerseys</dt><dd className="font-semibold">{s.goalieJerseys}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Socks (Pairs)</dt><dd className="font-semibold">{s.sockPairs}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Pant Shells</dt><dd className="font-semibold">{s.pantShells}</dd></div>
                {s.extraJerseys > 0 && <div className="flex justify-between"><dt className="text-ppc-gold">Extra Jerseys</dt><dd className="font-semibold text-ppc-gold">{s.extraJerseys}</dd></div>}
                {s.extraSockPairs > 0 && <div className="flex justify-between"><dt className="text-ppc-gold">Extra Sock Pairs</dt><dd className="font-semibold text-ppc-gold">{s.extraSockPairs}</dd></div>}
                {s.extraPantShells > 0 && <div className="flex justify-between"><dt className="text-ppc-gold">Extra Pant Shells</dt><dd className="font-semibold text-ppc-gold">{s.extraPantShells}</dd></div>}
              </dl>
              {describeSet(s) && (
                <p className="mt-2 border-t border-line pt-2 text-xs font-semibold text-ppc-gold">{describeSet(s)}</p>
              )}
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Build Type">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Jersey Type">{view.jerseyType ? JERSEY_TYPE_LABELS[view.jerseyType] : ''}</Field>
          <Field label="Sock Type">{view.sockType ? SOCK_TYPE_LABELS[view.sockType] : ''}</Field>
          <Field label="Pant Shell Type">
            {view.pantShellType ? PANT_SHELL_TYPE_LABELS[view.pantShellType] : ''}
          </Field>
        </div>
        {view.numberDetails && (
          <div className="mt-4">
            <Field label="Number Details">{view.numberDetails}</Field>
          </div>
        )}
      </Section>

      <Section title="Add-Ons & Customization">
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {/* Filtered the same way the order form filters them, so the customer
              isn't told "No" to an option that doesn't exist on their build. */}
          {addonsForJerseyType(view.jerseyType).map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between border-b border-line/60 py-1.5 text-sm">
              <span className="text-muted">{label}</span>
              <YesNo value={Boolean(view.addons[key as keyof typeof view.addons])} />
            </div>
          ))}
          {hasPantShells &&
            PANT_TOGGLES.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between border-b border-line/60 py-1.5 text-sm">
                <span className="text-muted">{label}</span>
                <YesNo value={Boolean(view.addons[key as keyof typeof view.addons])} />
              </div>
            ))}
          <div className="flex items-center justify-between border-b border-line/60 py-1.5 text-sm">
            <span className="text-muted">Laces Style</span>
            <span className="font-semibold">{LACES_LABELS[view.addons.lacesStyle]}</span>
          </div>
          <div className="flex items-center justify-between border-b border-line/60 py-1.5 text-sm">
            <span className="text-muted">Shoulder Cut</span>
            <span className="font-semibold">{SHOULDER_CUT_LABELS[view.addons.shoulderCut]}</span>
          </div>
          <div className="flex items-center justify-between border-b border-line/60 py-1.5 text-sm">
            <span className="text-muted">Name Style</span>
            <span className="font-semibold">{NAME_STYLE_LABELS[view.addons.nameStyle]}</span>
          </div>
        </div>
      </Section>

      {view.roster.length > 0 && (
        <Section title={`Player Roster (${view.roster.length})`}>
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Jersey</th>
                  <th className="py-2">Sock</th>
                </tr>
              </thead>
              <tbody>
                {view.roster.map((r) => (
                  <tr key={r.id} className="border-b border-line/50">
                    <td className="py-2 pr-3 font-semibold">
                      {r.playerNameAsPrinted || <span className="text-muted">—</span>}
                      {r.isGoalie && <span className="ml-2 text-xs text-ppc-gold">G</span>}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{r.number || '—'}</td>
                    <td className="py-2 pr-3">{r.sockOnly ? 'Sock only' : r.jerseySize || '—'}</td>
                    <td className="py-2">{r.sockSize || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {(view.approvedBy || view.approvedDate) && (
        <Section title="Approval">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Approved By">{view.approvedBy}</Field>
            <Field label="Approval Date">{formatLong(view.approvedDate)}</Field>
          </div>
          <p className="mt-4 text-xs text-muted">
            Once a proof is approved the order is locked and final — no changes or cancellations
            after this point.
          </p>
        </Section>
      )}
    </div>
  );
}
