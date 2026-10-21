import type { ReactNode } from 'react';
import {
  BRANDING_ADDONS, CAPTAIN_PATCH_STYLE_META, JERSEY_TYPE_LABELS, LACES_LABELS, NAME_STYLE_LABELS,
  PANT_SHELL_TYPE_LABELS, PANT_TOGGLES, SHOULDER_CUT_LABELS, SOCK_TYPE_LABELS,
  addonHint, buildAddonsForJerseyType, tierById,
} from '@/lib/constants';
import { buildsDiffer, captainCounts, customBrandingFiles, jerseyTypesInUse, perSetShellTypes, perSetSockTypes, setBuilds } from '@/lib/order-utils';
import { describeOrderTotals, describeSet, offersGoaliePantOption, orderIncludesPantShells, orderIncludesSocks, type OrderTotals } from '@/lib/order-utils';
import { isNoName } from '@/lib/roster-edit';
import { keepersOfSet } from '@/lib/keepers';
import type { BuildSheet } from '@/lib/data/repository';
import {
  COMMENT_AUDIENCE_LABEL, COMMENT_SECTIONS,
  type AssetRole, type CommentSection, type CustomBrandingItem, type KeeperJersey, type SectionComment, type SheetComment, type ViewableAsset,
} from '@/lib/types';
import { Card, Field, Section, Stat } from '@/components/ui';
import { ArtworkGallery } from '@/components/artwork-gallery';
import { CaptaincyBadge, GoalieBadge } from '@/components/captaincy';
import { RosterBreakdown } from '@/components/order-form/roster-breakdown';

/*
 * The build sheet, rendered.
 *
 * The customer's share page and the factory's production sheet show the same
 * build — totals, build type, add-ons, roster, artwork, contact — and they
 * used to be two copies of the same JSX. These are the sections, once, read
 * from the shared `BuildSheet` view (repository.ts). A section changed here
 * changes on both sheets, which is the point: the team and the people sewing
 * the jerseys must be reading the same thing.
 *
 * Keepers are the one difference the sections know about. Passed in only by
 * the factory sheet, they add rows and counts; left out, as the customer's
 * page leaves them out, nothing here mentions them.
 */

/*
 * Number reference photos belong with Number Details, not three screens down
 * in the logo gallery. They were being rendered there, correctly, and nobody
 * looked for them there. Pulled up into Build Type and hidden from the gallery.
 */
export const NUMBER_ROLES: AssetRole[] = ['number_reference', 'number_reference_home', 'number_reference_away'];

/** Custom branding's two pictures live with the branding, not in the logo gallery. */
export const CUSTOM_BRANDING_ROLES: AssetRole[] = ['custom_branding_logo', 'custom_branding_placement'];

/*
 * Keenan's section comments, at the top of the section they belong to.
 *
 * The sheet's sections are coarser than the form's (Build Type carries the
 * numbers and the pants too), so a comment from a form section with another
 * name is labelled with it. What arrives here is already filtered for the
 * reader — see sheetComments in data/logic.ts.
 */
export function SectionComments({
  comments,
  sections,
  sheetTitle,
}: {
  comments: SheetComment[];
  sections: CommentSection[];
  /** The section's own title: a comment from the form section of that name isn't labelled. */
  sheetTitle?: string;
}) {
  const mine = comments.filter((c) => sections.includes(c.section));
  if (!mine.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {mine.map((c) => (
        <div key={c.section} className="rounded-lg border-l-4 border-ppc-gold bg-ppc-gold/10 px-3 py-2">
          {COMMENT_SECTIONS[c.section] !== sheetTitle && (
            <p className="text-[0.7rem] font-bold uppercase tracking-wide text-ppc-gold">{COMMENT_SECTIONS[c.section]}</p>
          )}
          <p className="whitespace-pre-wrap text-sm">{c.text}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Keenan's own order page: every comment, whoever it's for, with who sees it.
 */
export function OwnerSectionComments({
  comments,
  sections,
}: {
  comments: Partial<Record<CommentSection, SectionComment>> | undefined;
  sections: CommentSection[];
}) {
  const mine = sections.flatMap((s) => {
    const c = comments?.[s];
    return c && c.text.trim() ? [{ section: s, ...c }] : [];
  });
  if (!mine.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {mine.map((c) => (
        <div key={c.section} className="rounded-lg border-l-4 border-ppc-gold bg-ppc-gold/10 px-3 py-2">
          <p className="text-[0.7rem] font-bold uppercase tracking-wide text-ppc-gold">
            {COMMENT_SECTIONS[c.section]} · <span className="text-muted">{COMMENT_AUDIENCE_LABEL[c.audience]}</span>
          </p>
          <p className="whitespace-pre-wrap text-sm">{c.text.trim()}</p>
        </div>
      ))}
    </div>
  );
}

/** The custom branding's logo and its location, side by side. */
export function CustomBrandingPictures({ assets, teamName }: { assets: ViewableAsset[]; teamName: string }) {
  return (
    <div className="mt-3 grid items-start gap-4 sm:grid-cols-2">
      {CUSTOM_BRANDING_ROLES.map((role) => {
        const files = assets.filter((a) => a.role === role);
        return files.length ? (
          // Each half holds one role, so its own gallery is one column wide.
          <div key={role} className="[&_.grid]:grid-cols-1">
            <ArtworkGallery assets={files} teamName={teamName} />
          </div>
        ) : null;
      })}
    </div>
  );
}

/**
 * Every custom branding logo: whose it is, what and where, and its two
 * pictures side by side. Same on both sheets and Keenan's page.
 */
export function CustomBrandingList({
  items,
  assets,
  teamName,
}: {
  items: CustomBrandingItem[];
  assets: ViewableAsset[];
  teamName: string;
}) {
  if (!items.length) return null;
  return (
    <div className="space-y-4">
      {items.map((item, n) => {
        const files = customBrandingFiles(items, assets, item.id);
        return (
          <div key={item.id} className={n > 0 ? 'border-t border-line/60 pt-4' : ''}>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-ppc-gold/60 bg-ppc-gold/10 px-3 py-1.5 text-sm font-semibold text-ppc-gold">
              <span aria-hidden>&#10003;</span> {item.name.trim() || (items.length > 1 ? `Custom branding ${n + 1}` : 'Custom branding')}
            </span>
            {item.notes.trim() && <p className="mt-2 whitespace-pre-wrap text-sm">{item.notes}</p>}
            {files.length > 0 && <CustomBrandingPictures assets={files} teamName={teamName} />}
          </div>
        );
      })}
    </div>
  );
}

/**
 * How each set is built, when they aren't all the same (home embroidered,
 * away sublimated). Nothing when they are: the one type and tier say it.
 */
export function SetBuildsList({ order }: { order: Pick<BuildSheet, 'sets' | 'jerseyType' | 'jerseyTier' | 'sockType' | 'pantShellType'> }) {
  if (!buildsDiffer(order)) return null;
  const socksEach = perSetSockTypes(order);
  const shellsEach = perSetShellTypes(order);
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-2">
      {setBuilds(order).map((b, i) => (
        <div key={i} className="rounded-lg border border-ppc-gold/60 bg-ppc-gold/10 px-3 py-2">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">{b.label}</div>
          <div className="text-sm font-bold text-ppc-gold">
            {[tierById(b.jerseyTier)?.label, b.jerseyType ? JERSEY_TYPE_LABELS[b.jerseyType] : null].filter(Boolean).join(' · ') || 'Not set yet'}
          </div>
          {socksEach && b.socks > 0 && (
            <div className="text-xs">Socks: <span className="font-semibold">{b.sockType ? SOCK_TYPE_LABELS[b.sockType] : 'not set'}</span></div>
          )}
          {shellsEach && b.shells > 0 && (
            <div className="text-xs">Pant shells: <span className="font-semibold">{b.pantShellType ? PANT_SHELL_TYPE_LABELS[b.pantShellType] : 'not set'}</span></div>
          )}
        </div>
      ))}
    </div>
  );
}

/** "Embroidered", or "Home: Embroidered · Away: Sublimated" when each set has its own. */
export function typesBySet(order: Pick<BuildSheet, 'sets' | 'jerseyType' | 'jerseyTier' | 'sockType' | 'pantShellType'>, what: 'socks' | 'shells'): string {
  const each = what === 'socks' ? perSetSockTypes(order) : perSetShellTypes(order);
  const label = (t: string | null) =>
    t ? (what === 'socks' ? SOCK_TYPE_LABELS[t as keyof typeof SOCK_TYPE_LABELS] : PANT_SHELL_TYPE_LABELS[t as keyof typeof PANT_SHELL_TYPE_LABELS]) : 'not set';
  if (!each) {
    const t = what === 'socks' ? order.sockType : order.pantShellType;
    return t ? label(t) : '';
  }
  return setBuilds(order)
    .filter((b) => (what === 'socks' ? b.socks : b.shells) > 0)
    .map((b) => `${b.label.replace(/ Set$/, '')}: ${label(what === 'socks' ? b.sockType : b.pantShellType)}`)
    .join(' · ');
}

/** C's and A's — one count, or home and away separately (different designs). */
export function CaptainCountFields({ order }: { order: Parameters<typeof captainCounts>[0] }) {
  return (
    <>
      {captainCounts(order).map((k) => (
        <div key={k.label || 'all'} className="contents">
          <Field label={`${k.label ? `${k.label} — ` : ''}Quantity of C's`}>{k.c}</Field>
          <Field label={`${k.label ? `${k.label} — ` : ''}Quantity of A's`}>{k.a}</Field>
        </div>
      ))}
    </>
  );
}

const hasComment = (comments: SheetComment[], sections: CommentSection[]) =>
  comments.some((c) => sections.includes(c.section));


export function sheetHasPantShells(sheet: Pick<BuildSheet, 'sets' | 'pantShellType'>): boolean {
  return (
    sheet.sets.some((s) => (s.pantShells || 0) + (s.extraPantShells || 0) > 0) ||
    sheet.pantShellType !== null
  );
}

/* ------------------------------------------------------------------ *
 * Totals
 * ------------------------------------------------------------------ */

export function OrderTotalsSection({
  sheet,
  totals,
  keepers,
}: {
  sheet: BuildSheet;
  totals: OrderTotals;
  /** Factory sheet only. Adds the jerseys being made for Powerplay on top of the team's. */
  keepers?: KeeperJersey[];
}) {
  const keeperCount = keepers?.length ?? 0;
  return (
    <Section title="Order Totals">
      <SectionComments comments={sheet.sectionComments} sections={['mode', 'totals']} sheetTitle="Order Totals" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total Jerseys" value={totals.totalJerseys} accent hideWhenZero />
        <Stat label="Sock Pairs" value={totals.totalSockPairs} hideWhenZero />
        <Stat label="Pant Shells" value={totals.totalPantShells} hideWhenZero />
        {keeperCount > 0 && <Stat label="+ Jerseys for Powerplay to keep" value={keeperCount} accent />}
      </div>
      {describeOrderTotals(totals) && (
        <p className="mt-3 text-sm font-semibold text-ppc-gold">{describeOrderTotals(totals)}</p>
      )}
      {keeperCount > 0 && (
        <p className="mt-1 text-sm font-semibold text-amber-300">
          Make {totals.totalJerseys + keeperCount} jerseys in total: {totals.totalJerseys} for the team
          plus {keeperCount} for Powerplay to keep (see Keep for Powerplay, above).
        </p>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sheet.sets.map((s, i) => {
          const mine = keepers ? keepersOfSet(keepers, i) : [];
          return (
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
                {mine.length > 0 && (
                  <div className="flex justify-between"><dt className="font-semibold text-amber-300">Keep for Powerplay</dt><dd className="font-semibold text-amber-300">{mine.length}</dd></div>
                )}
              </dl>
              {describeSet(s) && (
                <p className="mt-2 border-t border-line pt-2 text-xs font-semibold text-ppc-gold">{describeSet(s)}</p>
              )}
            </Card>
          );
        })}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Build type
 * ------------------------------------------------------------------ */

export function BuildTypeSection({ sheet, assets }: { sheet: BuildSheet; assets: ViewableAsset[] }) {
  const tier = tierById(sheet.jerseyTier);
  return (
    <Section title="Build Type">
      <SectionComments comments={sheet.sectionComments} sections={['build', 'numbers', 'pants']} sheetTitle="Build Type" />
      {/* The tier is the headline fact about what was bought — it was on the
          order sheet and nowhere on this page. */}
      {tier && !buildsDiffer(sheet) && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-ppc-gold/60 bg-ppc-gold/10 px-3 py-1.5 text-sm font-bold text-ppc-gold">
          {tier.label} build
        </div>
      )}
      {/* Sets built differently: each set's tier and type, in place of the one. */}
      <SetBuildsList order={sheet} />
      <div className="grid gap-4 sm:grid-cols-3">
        {sheet.numberOfSets > 1 && (
          <Field label="Number of Sets">{sheet.numberOfSets}</Field>
        )}
        {!buildsDiffer(sheet) && (
          <Field label="Jersey Type">{sheet.jerseyType ? JERSEY_TYPE_LABELS[sheet.jerseyType] : ''}</Field>
        )}
        <Field label="Sock Type">
          {typesBySet(sheet, 'socks')}
          {sheet.sockType && sheet.multiPanelSocks && (
            <span className="ml-2 rounded border border-ppc-gold/60 bg-ppc-gold/10 px-1.5 py-0.5 text-xs font-semibold text-ppc-gold">Pro cut multi-panel</span>
          )}
        </Field>
        <Field label="Pant Shell Type">
          {typesBySet(sheet, 'shells')}
        </Field>
      </div>
      {sheet.numberDetails && (
        <div className="mt-4">
          <Field label="Number Details">{sheet.numberDetails}</Field>
        </div>
      )}
      {assets.some((a) => NUMBER_ROLES.includes(a.role)) && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-muted">Number Reference Photos</div>
          {/* Home and away side by side, each half the width, not stacked. */}
          <div className="grid gap-4 sm:grid-cols-2">
            {NUMBER_ROLES.filter((r) => assets.some((a) => a.role === r)).map((r) => (
              <ArtworkGallery key={r} assets={assets.filter((a) => a.role === r)} teamName={sheet.teamName} />
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Add-ons
 * ------------------------------------------------------------------ */

export function AddOnsSection({
  sheet,
  assets = [],
}: {
  sheet: BuildSheet;
  /** For the custom branding pictures, shown with the branding. */
  assets?: ViewableAsset[];
}) {
  const brandingFiles = assets.filter((a) => CUSTOM_BRANDING_ROLES.includes(a.role));
  const hasPantShells = sheetHasPantShells(sheet);
  /*
   * Two lists instead of a grid of label/Yes/No rows. In the grid, each
   * "Yes" landed right beside the next row's name and read as part of it.
   * What's on the jersey is the thing to see at a glance, so it gets the
   * gold chips; what isn't is one muted line underneath.
   */
  // Build add-ons here; the Powerplay branding has its own block below.
  const toggles = [
    ...buildAddonsForJerseyType(jerseyTypesInUse(sheet)).map((a) => ({ key: a.key, label: a.label, hint: addonHint(a) })),
    ...(hasPantShells ? PANT_TOGGLES : []),
    // Goalie shells with the logos on the back of the legs — only a question
    // when there's a goalie and shells, so it's only listed then.
    ...(offersGoaliePantOption(sheet)
      ? [{ key: 'goaliePantReversedLogos', label: 'Reversed Logos on Goalie Pant Shells (back of the legs)' }]
      : []),
    { key: 'stitchedShoulderTrim', label: 'Stitch-on Shoulder Trim' },
  ] as Array<{ key: string; label: string; hint?: string }>;
  const on = toggles.filter((t) => Boolean(sheet.addons[t.key as keyof typeof sheet.addons]));
  const off = toggles.filter((t) => !sheet.addons[t.key as keyof typeof sheet.addons]);
  const brandingOn = BRANDING_ADDONS.filter((a) => Boolean(sheet.addons[a.key]));
  const brandingOff = BRANDING_ADDONS.filter((a) => !sheet.addons[a.key]);

  return (
    <Section title="Add-Ons & Customization">
      <SectionComments comments={sheet.sectionComments} sections={['addons']} sheetTitle="Add-Ons & Customization" />
      <div className="text-xs font-bold uppercase tracking-wide text-muted">Included on this order</div>
      {on.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {on.map((t) => (
            <span
              key={t.key}
              title={t.hint}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ppc-gold/60 bg-ppc-gold/10 px-3 py-1.5 text-sm font-semibold text-ppc-gold"
            >
              <span aria-hidden>&#10003;</span> {t.label}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">No add-ons on this order.</p>
      )}
      {off.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          <span className="font-semibold">Not included:</span> {off.map((t) => t.label).join(' · ')}
        </p>
      )}
      {/* The twill explanation in words, not only on hover: a tooltip is invisible on a phone. */}
      {on.some((t) => t.hint) && (
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {on.filter((t) => t.hint).map((t) => (
            <li key={t.key}><span className="font-semibold text-foreground">{t.label}:</span> {t.hint}</li>
          ))}
        </ul>
      )}

      {/*
        * Powerplay's branding, apart from the build. Same chips, its own
        * heading, and the notes about any changes to it right underneath:
        * "no back label on this one" is an instruction the factory acts on.
        */}
      <div className="mt-5 rounded-lg border border-line bg-surface-2 p-3">
        <div className="text-xs font-bold uppercase tracking-wide text-muted">Powerplay branding</div>
        <div className="mt-2">
          <SectionComments comments={sheet.sectionComments} sections={['branding']} sheetTitle="Powerplay Branding" />
        </div>
        {brandingOn.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {brandingOn.map((a) => (
              <span
                key={a.key}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ppc-gold/60 bg-ppc-gold/10 px-3 py-1.5 text-sm font-semibold text-ppc-gold"
              >
                <span aria-hidden>&#10003;</span> {a.label}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">No Powerplay branding on this order.</p>
        )}
        {brandingOff.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            <span className="font-semibold">Not included:</span> {brandingOff.map((a) => a.label).join(' · ')}
          </p>
        )}
        {sheet.brandingNotes && (
          <div className="mt-3 border-t border-line/60 pt-3">
            <p className="text-xs font-medium text-muted">Changes to the branding</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{sheet.brandingNotes}</p>
          </div>
        )}
        {/*
          * Someone else's logo in the branding — a sponsor's, usually. The
          * logo and a picture of where it goes, shown whole, with what Keenan
          * wrote about it.
          */}
        {sheet.customBranding && sheet.customBrandingItems.length > 0 && (
          <div className="mt-3 border-t border-line/60 pt-3">
            <CustomBrandingList items={sheet.customBrandingItems} assets={brandingFiles} teamName={sheet.teamName} />
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Laces">{LACES_LABELS[sheet.addons.lacesStyle]}</Field>
        <Field label="Shoulder Cut">{SHOULDER_CUT_LABELS[sheet.addons.shoulderCut]}</Field>
        <Field label="Name Style">{NAME_STYLE_LABELS[sheet.addons.nameStyle]}</Field>
        <Field label="Shoulder Logos">
          {sheet.addons.hasShoulderLogos
            ? sheet.shoulderLogosSame
              ? 'Same both sides'
              : 'Left / right differ'
            : 'None'}
        </Field>
      </div>

      {sheet.addons.hasCaptainPatches && (
        <div className="mt-4 rounded-lg border border-line bg-surface-2 p-3">
          <div className="text-sm font-bold text-ppc-gold">Captain Patches</div>
          <div className="mt-2 grid gap-4 sm:grid-cols-3">
            <Field label="Style">
              {sheet.captainPatchStyle ? CAPTAIN_PATCH_STYLE_META[sheet.captainPatchStyle].label : ''}
            </Field>
            <CaptainCountFields order={sheet} />
          </div>
          {sheet.captainPatchNotes && (
            <p className="mt-2 text-sm text-muted">{sheet.captainPatchNotes}</p>
          )}
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Roster
 * ------------------------------------------------------------------ */

/** The badge a keeper row wears, on the factory sheet and on Keenan's. */
export function KeeperBadge() {
  return (
    <span className="rounded border border-amber-400/70 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
      Keep for Powerplay
    </span>
  );
}

export function RosterSection({
  sheet,
  csvHref,
  keepers,
}: {
  sheet: BuildSheet;
  /** Where the roster CSV downloads from — the share route or the factory route. */
  csvHref: string;
  /** Factory sheet only: keeper rows, marked, under the spares. */
  keepers?: KeeperJersey[];
}) {
  const spares = sheet.extraJerseyDetails;
  const keeperRows = keepers ?? [];
  if (
    sheet.roster.length === 0 && spares.length === 0 && keeperRows.length === 0 &&
    !hasComment(sheet.sectionComments, ['roster'])
  ) return null;

  const title = `Player Roster (${sheet.roster.length}${
    spares.length ? ` + ${spares.length} spare${spares.length > 1 ? 's' : ''}` : ''
  }${keeperRows.length ? ` + ${keeperRows.length} for Powerplay` : ''})`;
  const showSocks = orderIncludesSocks(sheet);
  // Pant shells on the order, OR a pant size typed on any row: a size that was
  // entered is shown whatever the totals say, so it can never silently vanish.
  const showPants =
    orderIncludesPantShells(sheet) || sheet.roster.some((r) => (r.pantShellSize ?? '').trim() !== '');

  return (
    <Section title={title} id="roster">
      <SectionComments comments={sheet.sectionComments} sections={['roster']} sheetTitle="Player Roster" />
      {/*
        * The sizes, counted, before the rows. "How many larges?" is what the
        * factory asks and what a manager checks their list against, and
        * counting a column of twenty by eye is how that goes wrong. Same
        * component the order form shows Keenan.
        */}
      {sheet.roster.length > 0 && (
        <div className="mb-4">
          <RosterBreakdown entries={sheet.roster} mode={sheet.orderMode} sets={sheet.sets} showSocks={showSocks} showPantShells={showPants} />
        </div>
      )}
      <div className="mb-3 flex justify-end">
        {/* The same file Keenan's side produces, keyed by this page's token
            instead of the order id. No sign-in, no money in it. */}
        <a
          href={csvHref}
          className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold hover:border-ppc-gold/60 hover:text-ppc-gold"
        >
          Download roster (CSV)
        </a>
      </div>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Jersey Size</th>
              <th className="py-2 pr-3">Sock Size</th>
              {/* Only when the order has pant shells; an empty column on every other order reads as "missing". */}
              {showPants && <th className="py-2 pr-3">Pant Shell Size</th>}
              {/*
                * Always rendered, even when every row is empty.
                *
                * This sheet goes to the manufacturer as well as the team,
                * and a note is usually the one thing on a row that isn't
                * obvious from the sizes — "needs an A", "sleeve length",
                * "spell it with the accent". It was collected on the
                * client form and then shown to nobody.
                */}
              <th className="py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {sheet.roster.map((r) => (
              <tr key={r.id} className="border-b border-line/50">
                <td className="py-2 pr-3 font-semibold">
                  {/* Spelled out: a blank here would read as "still to come" to
                      the manufacturer, and this one is finished. */}
                  {isNoName(r, sheet.addons.nameStyle) ? (
                    <span className="font-normal italic text-muted">No name</span>
                  ) : (
                    r.playerNameAsPrinted || <span className="text-muted">—</span>
                  )}
                  {r.isGoalie && <GoalieBadge />}
                  <CaptaincyBadge value={r.captaincy} />
                </td>
                <td className="py-2 pr-3 tabular-nums">{r.number || '—'}</td>
                <td className="py-2 pr-3">{r.sockOnly ? 'Sock only' : r.jerseySize || '—'}</td>
                <td className="py-2 pr-3">{r.sockSize || '—'}</td>
                {showPants && <td className="py-2 pr-3">{r.pantShellSize || '—'}</td>}
                <td className="py-2 text-muted">{r.notes || '—'}</td>
              </tr>
            ))}

            {/*
              * Spares sit in the same table as the players, highlighted.
              *
              * They were a separate section below, which is where the
              * question "is #99 on this order?" goes unanswered — you look
              * at the roster, don't see it, and stop. Same table, marked
              * SPARE, so one read covers everything being made.
              */}
            {spares.map((x, i) => (
              <tr key={`extra-${i}`} className="border-b border-line/50 bg-ppc-gold/5">
                <td className="py-2 pr-3">
                  <span className="rounded border border-ppc-gold/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ppc-gold">
                    Spare
                  </span>
                </td>
                <td className="py-2 pr-3 tabular-nums">{x.number || '—'}</td>
                <td className="py-2 pr-3">{x.sockOnly ? 'Socks only' : x.size || '—'}</td>
                <td className="py-2 pr-3">{x.sockSize || '—'}</td>
                {showPants && <td className="py-2 pr-3">—</td>}
                {/* Same column as the players', not tucked beside the badge. */}
                <td className="py-2 text-muted">{x.notes || '—'}</td>
              </tr>
            ))}

            {/*
              * Keepers, same table again, for the same reason — and marked
              * louder than the spares, because these must NOT go in the
              * team's box. Factory sheet only; the customer never sees a row.
              */}
            {keeperRows.map((k) => (
              <tr key={`keeper-${k.id}`} className="border-b border-line/50 bg-amber-400/5">
                <td className="py-2 pr-3">
                  <KeeperBadge />
                  {k.name.trim() && <span className="ml-2 font-semibold">{k.name.trim()}</span>}
                </td>
                <td className="py-2 pr-3 tabular-nums">{k.number || '—'}</td>
                <td className="py-2 pr-3">{k.size || '—'}</td>
                <td className="py-2 pr-3">—</td>
                {showPants && <td className="py-2 pr-3">—</td>}
                <td className="py-2 text-amber-200">
                  {sheet.sets.length > 1 ? `Copy of the ${sheet.sets[k.setIndex]?.label ?? 'set'}. ` : ''}
                  Hold at the facility for Powerplay. Not for the team.
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Artwork
 * ------------------------------------------------------------------ */

export function ArtworkSection({
  sheet,
  assets,
  hideRoles = NUMBER_ROLES,
}: {
  sheet: BuildSheet;
  assets: ViewableAsset[];
  /** Roles shown elsewhere on the page. The number photos always are (Build Type); the factory sheet adds the font, which it offers as a download. */
  hideRoles?: AssetRole[];
}) {
  const hidden = [...hideRoles, ...CUSTOM_BRANDING_ROLES];
  const shown = assets.filter((a) => !hidden.includes(a.role));
  if (shown.length === 0 && !hasComment(sheet.sectionComments, ['artwork'])) return null;
  return (
    <Section title="Logos & Artwork">
      <SectionComments comments={sheet.sectionComments} sections={['artwork']} sheetTitle="Logos & Artwork" />
      {shown.length > 0 && <ArtworkGallery assets={assets} hideRoles={hidden} teamName={sheet.teamName} />}
      {/*
        * The notes that go with the artwork, same as the order sheet shows
        * them. Whoever is making these needs the instruction as much as
        * the picture.
        */}
      {(sheet.designReferenceNotes || sheet.collarReferenceNotes || sheet.mainCrestNotes) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Design Reference Notes">{sheet.designReferenceNotes}</Field>
          <Field label="Collar Reference Notes">{sheet.collarReferenceNotes}</Field>
          <Field label="Main Crest Notes">{sheet.mainCrestNotes}</Field>
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Contact
 * ------------------------------------------------------------------ */

export function ContactSection({ sheet, intro, title }: { sheet: BuildSheet; title: string; intro?: ReactNode }) {
  const c = sheet.contact;
  return (
    <Section title={title}>
      <SectionComments comments={sheet.sectionComments} sections={['contact']} />
      {intro}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Contact Name">
          {[c.firstName, c.lastName].filter(Boolean).join(' ')}
        </Field>
        <Field label="Email">{c.email}</Field>
        <Field label="Phone">{c.phone}</Field>
        <Field label="Street Address">
          {[c.street, c.secondary].filter(Boolean).join(', ')}
        </Field>
        <Field label="City">{c.city}</Field>
        <Field label="Province / State">{c.province}</Field>
        <Field label="Postal Code">{c.postal}</Field>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Notes
 * ------------------------------------------------------------------ */

/**
 * Order notes and captain-patch notes. `specialNotes` was on the customer's
 * view since it was written and was never put on the page, so anything typed
 * into it reached nobody. Whitespace is preserved: these get typed as lists.
 */
export function NotesSection({ sheet }: { sheet: BuildSheet }) {
  if (!sheet.specialNotes && !sheet.captainPatchNotes && !hasComment(sheet.sectionComments, ['team', 'notes'])) return null;
  return (
    <Section title="Notes">
      <SectionComments comments={sheet.sectionComments} sections={['team', 'notes']} />
      {sheet.specialNotes && (
        <p className="whitespace-pre-wrap text-sm">{sheet.specialNotes}</p>
      )}
      {sheet.captainPatchNotes && (
        <div className={sheet.specialNotes ? 'mt-4 border-t border-line/60 pt-4' : ''}>
          <p className="text-xs font-medium text-muted">Captain Patches</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{sheet.captainPatchNotes}</p>
        </div>
      )}
    </Section>
  );
}
