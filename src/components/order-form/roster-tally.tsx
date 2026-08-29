'use client';

import type { OrderMode, RosterEntry, SetQuantities } from '@/lib/types';

/**
 * Live reconciliation between what the roster says and what the set quantities
 * say. Lifted straight from the Base44 app, which showed "Home Jerseys: 18/18 ✓"
 * above the roster — genuinely the best idea in that form, because it catches a
 * miscount while you're still filling it in rather than at the factory.
 *
 * One change: the old version only ever showed a tick. This also shows the gap
 * and which way it runs, since "17/18" on its own doesn't tell you whether you
 * forgot a player or over-ordered.
 */

export interface Tally {
  label: string;
  assigned: number;
  declared: number;
  /** Produced on top of the roster. Shown, but never counted as a mismatch. */
  extra: number;
}

export function buildTallies(
  mode: OrderMode,
  sets: SetQuantities[],
  roster: RosterEntry[],
  includes: { socks: boolean; pantShells: boolean } = { socks: true, pantShells: true },
): Tally[] {
  const playing = roster.filter((r) => !r.sockOnly);
  const declaredJerseys = (s?: SetQuantities) =>
    s ? (s.playerJerseys || 0) + (s.goalieJerseys || 0) : 0;

  if (mode === 'home_away_set') {
    return [
      {
        label: 'Home Jerseys',
        assigned: playing.reduce((n, r) => n + (r.homeJersey || 0), 0),
        declared: declaredJerseys(sets[0]),
        extra: sets[0]?.extraJerseys ?? 0,
      },
      {
        label: 'Away Jerseys',
        assigned: playing.reduce((n, r) => n + (r.awayJersey || 0), 0),
        declared: declaredJerseys(sets[1]),
        extra: sets[1]?.extraJerseys ?? 0,
      },
      ...(includes.socks
        ? [
            {
              label: 'Home Socks',
              assigned: roster.reduce((n, r) => n + (r.homeSocks || 0), 0),
              declared: sets[0]?.sockPairs ?? 0,
              extra: sets[0]?.extraSockPairs ?? 0,
            },
            {
              label: 'Away Socks',
              assigned: roster.reduce((n, r) => n + (r.awaySocks || 0), 0),
              declared: sets[1]?.sockPairs ?? 0,
              extra: sets[1]?.extraSockPairs ?? 0,
            },
          ]
        : []),
    ];
  }

  /*
   * A garment the order doesn't include gets no tally at all.
   *
   * The tally used to appear whenever a roster row claimed one, and rows
   * created before the sock fix default to socksPerPlayer: 1 — so a
   * jerseys-only order with sixteen players showed "Socks 0 / 16", demanding
   * sixteen pairs of socks nobody ordered.
   *
   * Filtering on what the ORDER includes rather than on what rows happen to
   * say means stale rows can't resurrect it. Same rule as the roster columns
   * and the totals: the order decides what exists.
   */
  return [
    {
      label: 'Jerseys',
      assigned: playing.reduce((n, r) => n + (r.jerseysPerPlayer || 0), 0),
      declared: sets.reduce((n, s) => n + declaredJerseys(s), 0),
      extra: sets.reduce((n, s) => n + (s.extraJerseys || 0), 0),
    },
    ...(includes.socks
      ? [{
          label: 'Socks',
          assigned: roster.reduce((n, r) => n + (r.socksPerPlayer || 0), 0),
          declared: sets.reduce((n, s) => n + (s.sockPairs || 0), 0),
          extra: sets.reduce((n, s) => n + (s.extraSockPairs || 0), 0),
        }]
      : []),
    ...(includes.pantShells
      ? [{
          label: 'Pant Shells',
          assigned: roster.reduce((n, r) => n + (r.shellsPerPlayer || 0), 0),
          declared: sets.reduce((n, s) => n + (s.pantShells || 0), 0),
          extra: sets.reduce((n, s) => n + (s.extraPantShells || 0), 0),
        }]
      : []),
  ];
}

export function RosterTally({ tallies }: { tallies: Tally[] }) {
  const shown = tallies.filter((t) => t.declared > 0 || t.assigned > 0 || t.extra > 0);
  if (shown.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {shown.map((t) => {
        const diff = t.assigned - t.declared;
        const ok = diff === 0;
        return (
          <span
            key={t.label}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
              ok
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-500/60 bg-amber-500/10 text-amber-200'
            }`}
            title={
              ok
                ? 'Roster matches the set quantities'
                : diff > 0
                  ? `${diff} more assigned on the roster than ordered`
                  : `${Math.abs(diff)} short of the ordered quantity`
            }
          >
            {t.label}: {t.assigned}/{t.declared}{' '}
            {ok ? '✓' : diff > 0 ? `(+${diff})` : `(${diff})`}
            {t.extra > 0 && (
              <span className="ml-1 font-normal opacity-80">
                · +{t.extra} extra = {t.declared + t.extra}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
