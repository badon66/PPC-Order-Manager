import Link from 'next/link';
import { notFound } from 'next/navigation';
import { repo } from '@/lib/data';
import { formatLong, formatShort } from '@/lib/dates';
import {
  CAPTAIN_PATCH_STYLE_META, JERSEY_TYPE_LABELS, LACES_LABELS, NAME_STYLE_LABELS,
  PANT_SHELL_TYPE_LABELS, PANT_TOGGLES, SHOULDER_CUT_LABELS, SOCK_TYPE_LABELS, STATUS_META,
  addonsForJerseyType, matchesTier, tierById,
} from '@/lib/constants';
import { computeTotals, contactFullName, describeOrderTotals, describeSet, formattedAddress } from '@/lib/order-utils';
import { resolveAll } from '@/lib/storage';
import { baseUrl, isLocalUrl } from '@/lib/base-url';
import { ArtworkGallery } from '@/components/artwork-gallery';
import { Button, Card, Field, Section, Stat, StatusBadge, Warning, YesNo } from '@/components/ui';
import { CopyButton, OperationalControls } from '@/components/order-controls';
import { SubmissionReview } from '@/components/submission-review';
import { SignatureProof } from '@/components/signature-proof';
import { CaptaincyBadge, GoalieBadge } from '@/components/captaincy';
import { ApproveBlock } from '@/app/share/[token]/approve';
import type { Order } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await repo.getOrder(id);
  if (!bundle) notFound();

  const { order, roster, submissions } = bundle;

  // Request-scoped, so it can't be a module constant. See lib/base-url.ts.
  const BASE_URL = await baseUrl();
  const shareLink = `${BASE_URL}/share/${order.shareToken}`;
  const rosterLink = `${BASE_URL}/roster/${order.rosterToken}`;

  /*
   * Artwork is a key in a private bucket, so every link on this page has to be
   * signed first. Submitted logos and inspiration images are signed too — they
   * went through the same upload path — and handed down as a lookup so the
   * review panel doesn't need to know where files live.
   */
  const assets = (await resolveAll(bundle.assets)).map((a) => ({
    ...a,
    viewUrl: a.resolvedUrl,
    placementViewUrl: a.placementResolvedUrl,
  }));
  const submittedFiles = submissions.flatMap((s) => [
    ...s.logos.map((l) => ({ fileUrl: l.fileUrl })),
    ...(s.inspiration ?? []).map((i) => ({ fileUrl: i.fileUrl })),
  ]);
  const signedUrls = Object.fromEntries(
    (await resolveAll(submittedFiles)).map((f) => [f.fileUrl, f.resolvedUrl]),
  );
  /*
   * The font is pulled out of the artwork gallery and shown up top.
   *
   * It isn't reference material you look at — it's a file someone needs to
   * download before they can do anything, and burying it under the crest and
   * the shoulder logos meant scrolling past everything to reach the one thing
   * that's actually a download.
   */
  const fonts = assets.filter((a) => a.role === 'font');

  const totals = computeTotals(order, roster);
  const history = await repo.getHistory(order.id);
  const pendingSubs = submissions.filter((s) => !s.acceptedAt);
  // Tracking only exists once there's a parcel. Same threshold the editable
  // control uses — see OperationalControls.
  const showTracking = STATUS_META[order.status].order >= STATUS_META.in_production.order;

  const hasPantShells =
    order.sets.some((s) => (s.pantShells || 0) + (s.extraPantShells || 0) > 0) ||
    order.pantShellType !== null;

  return (
    <div className="space-y-5">
      <Link href="/orders" className="text-sm font-semibold text-muted hover:text-ppc-gold">
        ← Back to Orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{order.teamName || 'Untitled order'}</h1>
          <p className="text-sm text-muted">Order Details</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} size="lg" />
          <Button href={`/orders/${order.id}/edit`} variant="primary">
            Edit Order
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <CopyButton label="Copy Address" value={formattedAddress(order)} />
        <CopyButton label="Copy Share Link" value={shareLink} />
        <CopyButton label="Copy Client Form Link" value={rosterLink} />
        <Button href={`/api/orders/${order.id}/roster.csv`}>Download CSV Roster</Button>
      </div>

      {/*
        * Only ever appears on a laptop. A localhost link works perfectly for
        * the person who copied it and for nobody else, so the moment to say so
        * is before it's pasted into an email — not after a customer replies
        * that the link is broken.
        */}
      {isLocalUrl(BASE_URL) && (
        <p className="text-xs text-amber-400">
          These links point at <code>{BASE_URL}</code> and will only open on this computer. Set{' '}
          <code>NEXT_PUBLIC_BASE_URL</code> to the live site before sending one to a customer.
        </p>
      )}

      {totals.mismatch && <Warning>{totals.mismatchDetail}</Warning>}

      {pendingSubs.length > 0 && (
        <Warning>
          {pendingSubs.length} client submission{pendingSubs.length === 1 ? '' : 's'} waiting for
          review. Nothing is added to the roster until you accept it.
        </Warning>
      )}

      <Section title="Operational">
        <OperationalControls
          orderId={order.id}
          status={order.status}
          estimatedFinishDate={order.estimatedFinishDate}
          productionStartDate={order.productionStartDate}
          productionFinishDate={order.productionFinishDate}
          jerseyType={order.jerseyType}
          trackingCode={order.trackingCode}
        />
      </Section>

      <Section title="Order Information">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Team Name">{order.teamName}</Field>
          <Field label="Invoice Number">{order.invoiceNumber}</Field>
          <Field label="Date Paid">{formatLong(order.datePaid)}</Field>
          <Field label="Production Start">{formatLong(order.productionStartDate)}</Field>
          <Field label="Estimated Finish">{formatLong(order.estimatedFinishDate)}</Field>
          <Field label="Production Finished">{formatLong(order.productionFinishDate)}</Field>
          {/* Same rule as the editable field: no parcel, no tracking. */}
          {showTracking && <Field label="Tracking Code">{order.trackingCode}</Field>}
          <Field label="Google Drive">
            {order.googleDriveLink ? (
              <a
                href={order.googleDriveLink}
                target="_blank"
                rel="noreferrer"
                className="text-ppc-gold hover:underline"
              >
                View Files →
              </a>
            ) : null}
          </Field>
        </div>

        {fonts.length > 0 && (
          <div className="mt-4 border-t border-line/60 pt-4">
            <p className="text-xs font-medium text-muted">
              {fonts.length === 1 ? 'Font' : 'Fonts'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {fonts.map((f) => (
                <a
                  key={f.id}
                  href={f.viewUrl}
                  download={f.fileName || undefined}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3.5 py-2 text-sm font-semibold hover:border-ppc-gold/60 hover:text-ppc-gold"
                >
                  ↓ {f.displayName?.trim() || f.fileName || 'Download font'}
                </a>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Contact & Shipping">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Contact">{contactFullName(order)}</Field>
          <Field label="Email">{order.contactEmail}</Field>
          <Field label="Phone">{order.contactPhone}</Field>
          <Field label="Street">{order.shippingStreet}</Field>
          <Field label="City">{order.shippingCity}</Field>
          <Field label="Province/State">{order.shippingProvince}</Field>
          <Field label="Postal Code">{order.shippingPostal}</Field>
        </div>
        <p className="mt-4 text-xs text-muted">
          Also shown on the customer&apos;s share link so they can check it&apos;s right.
        </p>
      </Section>

      <Section title="Order Totals">
        {/* Zeros are dropped, not printed — see Stat. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total Jerseys" value={totals.totalJerseys} accent hideWhenZero />
          <Stat label="Sock Pairs" value={totals.totalSockPairs} hideWhenZero />
          <Stat label="Pant Shells" value={totals.totalPantShells} hideWhenZero />
        </div>
        {describeOrderTotals(totals) && (
          <p className="mt-3 text-sm font-semibold text-ppc-gold">{describeOrderTotals(totals)}</p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {order.sets.map((s, i) => (
            <Card key={i} className="p-3">
              <div className="text-sm font-bold text-ppc-gold">{s.label}</div>
              <dl className="mt-2 space-y-1 text-sm">
                <SetRow label="Player Jerseys" value={s.playerJerseys} />
                <SetRow label="Goalie Jerseys" value={s.goalieJerseys} />
                <SetRow label="Socks (Pairs)" value={s.sockPairs} />
                <SetRow label="Pant Shells" value={s.pantShells} />
                {s.extraJerseys > 0 && <SetRow label="Extra Jerseys" value={s.extraJerseys} accent />}
                {s.extraSockPairs > 0 && <SetRow label="Extra Sock Pairs" value={s.extraSockPairs} accent />}
                {s.extraPantShells > 0 && <SetRow label="Extra Pant Shells" value={s.extraPantShells} accent />}
              </dl>
              {describeSet(s) && (
                <p className="mt-2 border-t border-line pt-2 text-xs font-semibold text-ppc-gold">
                  {describeSet(s)}
                </p>
              )}
              {s.extrasNotes && (
                <p className="mt-1 text-xs text-muted">Extras: {s.extrasNotes}</p>
              )}
              {s.notes && <p className="mt-2 text-xs text-muted">{s.notes}</p>}
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Build Type">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Jersey Type">
            {order.jerseyType ? JERSEY_TYPE_LABELS[order.jerseyType] : ''}
          </Field>
          <Field label="Sock Type">{order.sockType ? SOCK_TYPE_LABELS[order.sockType] : ''}</Field>
          <Field label="Pant Shell Type">
            {order.pantShellType ? PANT_SHELL_TYPE_LABELS[order.pantShellType] : ''}
          </Field>
        </div>
        {order.numberDetails && (
          <div className="mt-4">
            <Field label="Number Details">{order.numberDetails}</Field>
          </div>
        )}
      </Section>

      <Section title="Add-Ons & Customization">
        {(() => {
          const tier = tierById(order.jerseyTier);
          if (!tier) return null;
          const stock = matchesTier(order, tier);
          return (
            <div
              className={`mb-4 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-bold ${
                stock
                  ? 'border-ppc-gold/60 bg-ppc-gold/10 text-ppc-gold'
                  : 'border-amber-500/60 bg-amber-500/10 text-amber-200'
              }`}
            >
              {tier.label} build
              {!stock && <span className="text-xs font-semibold">(modified)</span>}
            </div>
          );
        })()}
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {/* Same filter the form uses — an embroidered order shouldn't list
              a sublimated-only option just to say "No" to it. */}
          {addonsForJerseyType(order.jerseyType).map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between border-b border-line/60 py-1.5 text-sm">
              <span className="text-muted">{label}</span>
              <YesNo value={Boolean(order[key as keyof Order])} />
            </div>
          ))}
          {hasPantShells &&
            PANT_TOGGLES.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between border-b border-line/60 py-1.5 text-sm">
                <span className="text-muted">{label}</span>
                <YesNo value={Boolean(order[key as keyof Order])} />
              </div>
            ))}
          <LabelRow label="Laces Style" value={LACES_LABELS[order.lacesStyle]} />
          <LabelRow label="Shoulder Cut" value={SHOULDER_CUT_LABELS[order.shoulderCut]} />
          <LabelRow label="Name Style" value={NAME_STYLE_LABELS[order.nameStyle]} />
          <div className="flex items-center justify-between border-b border-line/60 py-1.5 text-sm">
            <span className="text-muted">Shoulder Logos</span>
            <span className={order.hasShoulderLogos ? 'font-semibold text-ppc-gold' : 'text-muted'}>
              {order.hasShoulderLogos
                ? order.shoulderLogosSame
                  ? 'Same both sides'
                  : 'Left / right differ'
                : 'None'}
            </span>
          </div>
        </div>

        {order.hasCaptainPatches && (
          <div className="mt-4 rounded-lg border border-line bg-surface-2 p-3">
            <div className="text-sm font-bold text-ppc-gold">Captain Patches</div>
            <div className="mt-2 grid gap-4 sm:grid-cols-3">
              <Field label="Style">
                {order.captainPatchStyle ? CAPTAIN_PATCH_STYLE_META[order.captainPatchStyle].label : ''}
              </Field>
              <Field label="Quantity of C's">{order.captainCQuantity || 0}</Field>
              <Field label="Quantity of A's">{order.captainAQuantity || 0}</Field>
            </div>
            {order.captainPatchNotes && (
              <p className="mt-2 text-sm text-muted">{order.captainPatchNotes}</p>
            )}
          </div>
        )}
      </Section>

      <Section
        title={
          pendingSubs.length > 0
            ? `Client Submissions (${pendingSubs.length} to review)`
            : 'Client Submissions'
        }
      >
        <SubmissionReview
          signedUrls={signedUrls} orderId={order.id} submissions={submissions} currentRoster={roster} />
      </Section>

      {/*
        * Spares belong in this table, same as on the customer's page.
        *
        * "Is #99 on this order?" gets answered by scanning the roster. A spare
        * listed somewhere else reads as absent, and the answer is wrong.
        */}
      <Section
        title={`Player Roster (${roster.length}${
          order.extraJerseyDetails.length ? ` + ${order.extraJerseyDetails.length} spare` : ''
        }${order.extraJerseyDetails.length > 1 ? 's' : ''})`}
      >
        {roster.length === 0 && order.extraJerseyDetails.length === 0 ? (
          <p className="text-sm text-muted">No players added yet.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Jersey</th>
                  <th className="py-2 pr-3">Sock</th>
                  <th className="py-2 pr-3">Jerseys</th>
                  <th className="py-2 pr-3">Socks</th>
                  <th className="py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((r) => (
                  <tr key={r.id} className="border-b border-line/50">
                    <td className="py-2 pr-3 font-semibold">
                      {r.playerNameAsPrinted || <span className="text-muted">—</span>}
                      {r.isGoalie && <GoalieBadge />}
                      <CaptaincyBadge value={r.captaincy} />
                      {r.sockOnly && (
                        <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[0.65rem] text-muted">
                          SOCK ONLY
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{r.number || '—'}</td>
                    <td className="py-2 pr-3">{r.jerseySize || '—'}</td>
                    <td className="py-2 pr-3">{r.sockSize || '—'}</td>
                    <td className="py-2 pr-3 tabular-nums">{r.jerseysPerPlayer}</td>
                    <td className="py-2 pr-3 tabular-nums">{r.socksPerPlayer}</td>
                    <td className="py-2 text-muted">{r.notes || '—'}</td>
                  </tr>
                ))}

                {order.extraJerseyDetails.map((x, i) => (
                  <tr key={`spare-${i}`} className="border-b border-line/50 bg-ppc-gold/5">
                    <td className="py-2 pr-3">
                      <span className="rounded border border-ppc-gold/50 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-ppc-gold">
                        Spare
                      </span>
                      {x.sockOnly && (
                        <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[0.65rem] text-muted">
                          SOCK ONLY
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{x.number || '—'}</td>
                    <td className="py-2 pr-3">{x.sockOnly ? '—' : x.size || '—'}</td>
                    <td className="py-2 pr-3">{x.sockSize || '—'}</td>
                    <td className="py-2 pr-3 tabular-nums">{x.sockOnly ? 0 : 1}</td>
                    <td className="py-2 pr-3 tabular-nums">{x.sockSize ? 1 : 0}</td>
                    <td className="py-2 text-muted">{x.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Logos & Artwork">
        <ArtworkGallery assets={assets} hideRoles={['font']} />
        {(order.designReferenceNotes || order.collarReferenceNotes || order.mainCrestNotes) && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Design Reference Notes">{order.designReferenceNotes}</Field>
            <Field label="Collar Reference Notes">{order.collarReferenceNotes}</Field>
            <Field label="Main Crest Notes">{order.mainCrestNotes}</Field>
          </div>
        )}
      </Section>

      <Section title="Notes & Approval">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Approved By">{order.approvedBy}</Field>
          <Field label="Approval Date">{formatLong(order.approvedDate)}</Field>
          <Field label="Special Notes">{order.specialNotes}</Field>
        </div>
        {order.approvedDate && (
          <p className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            Signed off {formatLong(order.approvedDate)}. Order is locked — changes after this point
            are recorded in the history below.
          </p>
        )}
        {order.approvalRecord && <SignatureProof record={order.approvalRecord} />}
      </Section>

      <Section title={`History (${history.length})`}>
        {history.length === 0 ? (
          <p className="text-sm text-muted">Nothing recorded yet.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {history.slice(0, 20).map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-3 border-b border-line/50 pb-2">
                <span className="font-semibold">{h.summary}</span>
                <span className="text-xs text-muted">
                  {h.actorName} · {formatShort(h.at.slice(0, 10))}
                </span>
              </li>
            ))}
          </ol>
        )}
        {/*
          * Always offered, not only when the list is truncated: this summary
          * shows dates but not times, and "when exactly" is the question that
          * matters once a customer disputes a change.
          */}
        <Link
          href={`/orders/${order.id}/history`}
          className="mt-3 inline-block text-sm font-semibold text-ppc-gold hover:underline"
        >
          View full history
          {history.length > 20 && ` — all ${history.length} entries, with times`}
          {history.length <= 20 && ' — with exact times and what changed'} →
        </Link>
      </Section>

      {/*
        * Sign-off at the bottom of the order sheet itself.
        *
        * Same block, same record, same server action as the customer's page —
        * it just isn't always convenient to send a link. A team manager
        * standing at the rink can read this screen and sign on the phone in
        * front of them, and it counts exactly the same.
        *
        * Only while the toggle is on and nothing has been signed yet: once
        * there's a signature it lives in Notes & Approval above, and a second
        * one is refused by the server anyway.
        */}
      {order.requestApproval && !order.approvedDate && !order.approvalRecord && (
        <Section title="Sign Off">
          <ApproveBlock token={order.shareToken} teamName={order.teamName} audience="staff" />
        </Section>
      )}
    </div>
  );
}

function SetRow({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={accent ? 'text-ppc-gold' : 'text-muted'}>{label}</dt>
      <dd className={`font-semibold tabular-nums ${accent ? 'text-ppc-gold' : ''}`}>{value}</dd>
    </div>
  );
}

function LabelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
