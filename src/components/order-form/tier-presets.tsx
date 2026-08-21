'use client';

import {
  ADDON_TOGGLES, TIER_CONTROLLED_ADDONS, matchesTier, tierById, tierPatch, tiersForJerseyType,
  type AddonKey, type TierDef,
} from '@/lib/constants';
import type { JerseyTier, JerseyType, Order } from '@/lib/types';

/**
 * Build tier presets.
 *
 * Picking a tier ticks its features and unticks the other tier-controlled ones,
 * so what you get is always a known build rather than whatever was left over
 * from the last order. Add-ons no tier owns — front crest, arm numbers, stop
 * sign patch, pant logo/number — are per-order choices and stay untouched.
 *
 * The offered tiers follow the jersey type, so you can't pick an embroidered
 * tier for a sublimated jersey by accident:
 *
 *   Sublimated             Lite  →  Premier
 *   Embroidered            Elite →  Pro
 *   Reversible sublimated  Reversible
 *
 * The tier you applied is stored on the order. If you then change a toggle by
 * hand, this says "Premier (modified)" rather than quietly claiming it's still
 * a stock Premier — the tier name ends up on paperwork, so it shouldn't lie.
 */

const LABELS = Object.fromEntries(ADDON_TOGGLES.map((a) => [a.key, a.label])) as Record<
  AddonKey,
  string
>;

export function TierPresets({
  jerseyType,
  appliedTier,
  order,
  onApply,
}: {
  jerseyType: JerseyType | null;
  appliedTier: JerseyTier | null;
  /** Just the add-on booleans — enough to tell whether a tier still matches. */
  order: Pick<Order, AddonKey>;
  onApply: (tier: JerseyTier, patch: Record<AddonKey, boolean>) => void;
}) {
  const available = tiersForJerseyType(jerseyType);

  if (!jerseyType) {
    return (
      <div className="rounded-lg border border-dashed border-line px-4 py-4 text-sm text-muted">
        Pick a <span className="font-semibold text-foreground">Jersey Type</span> in Build Type and
        the matching build tiers will show up here.
      </div>
    );
  }

  const applied = tierById(appliedTier);
  // A stored tier from a different jersey type is stale — the type changed under it.
  const appliedIsValid = applied ? applied.jerseyTypes.includes(jerseyType) : false;
  const exact = available.find((t) => matchesTier(order, t));

  return (
    <div className="space-y-3 rounded-lg border border-ppc-gold/40 bg-ppc-gold/[0.04] p-4">
      <div>
        <div className="text-sm font-bold text-ppc-gold">Build tier</div>
        <p className="mt-0.5 text-xs text-muted">
          Sets the standard features for this build. You can still change any toggle afterwards.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {available.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            isApplied={appliedIsValid && applied?.id === tier.id}
            isExactMatch={exact?.id === tier.id}
            onApply={() => onApply(tier.id, tierPatch(tier))}
          />
        ))}
      </div>

      <StatusLine
        appliedTier={appliedIsValid ? applied : undefined}
        exact={exact}
        staleTier={applied && !appliedIsValid ? applied : undefined}
        order={order}
      />
    </div>
  );
}

function TierCard({
  tier,
  isApplied,
  isExactMatch,
  onApply,
}: {
  tier: TierDef;
  isApplied: boolean;
  isExactMatch: boolean;
  onApply: () => void;
}) {
  const active = isApplied && isExactMatch;
  return (
    <button
      type="button"
      data-tier={tier.id}
      onClick={onApply}
      className={`rounded-lg border p-3 text-left transition-colors ${
        active
          ? 'border-ppc-gold bg-ppc-gold/10'
          : 'border-line bg-surface-2 hover:border-ppc-gold/50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-bold ${active ? 'text-ppc-gold' : ''}`}>{tier.label}</span>
        {active && <span className="text-xs font-bold text-ppc-gold">✓ Applied</span>}
        {isApplied && !isExactMatch && (
          <span className="text-[0.65rem] font-bold text-amber-300">MODIFIED</span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted">{tier.blurb}</p>
      <ul className="mt-2 space-y-0.5">
        {tier.addons.map((key) => (
          <li key={key} className="text-xs text-muted">
            <span className="text-ppc-gold">·</span> {LABELS[key]}
          </li>
        ))}
      </ul>
    </button>
  );
}

function StatusLine({
  appliedTier,
  exact,
  staleTier,
  order,
}: {
  appliedTier?: TierDef;
  exact?: TierDef;
  staleTier?: TierDef;
  order: Pick<Order, AddonKey>;
}) {
  if (staleTier) {
    return (
      <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        This order was set to <strong>{staleTier.label}</strong>, which doesn&apos;t apply to the
        jersey type you&apos;ve now chosen. Pick one of the tiers above.
      </p>
    );
  }

  if (appliedTier && !exact) {
    const added = TIER_CONTROLLED_ADDONS.filter(
      (k) => order[k] && !appliedTier.addons.includes(k),
    );
    const removed = appliedTier.addons.filter((k) => !order[k]);
    return (
      <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        <strong>{appliedTier.label} (modified)</strong>
        {added.length > 0 && <> · added {added.map((k) => LABELS[k]).join(', ')}</>}
        {removed.length > 0 && <> · removed {removed.map((k) => LABELS[k]).join(', ')}</>}
      </p>
    );
  }

  if (exact) {
    return (
      <p className="text-xs font-semibold text-emerald-300">
        ✓ Standard {exact.label} build.
      </p>
    );
  }

  return (
    <p className="text-xs text-muted">
      No tier applied — the toggles below are whatever you&apos;ve set by hand.
    </p>
  );
}
