import type { AssetRole, CaptainPatchStyle, JerseyTier, JerseyType, LacesStyle, NameStyle, Order, OrderMode, OrderStatus, PantShellType, ShoulderCut, SockType } from './types';

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

export const STATUS_META: Record<
  OrderStatus,
  { label: string; emoji: string; className: string; order: number }
> = {
  incomplete:          { label: 'Incomplete',          emoji: '⚠️', order: 0, className: 'border-red-500/60 text-red-300 bg-red-500/10' },
  draft:               { label: 'Draft',               emoji: '📝', order: 1, className: 'border-sky-500/60 text-sky-300 bg-sky-500/10' },
  waiting_for_payment: { label: 'Waiting for Payment', emoji: '💰', order: 2, className: 'border-amber-500/60 text-amber-200 bg-amber-500/10' },
  waiting_for_approval:{ label: 'Waiting for Approval', emoji: '✍️', order: 3, className: 'border-orange-400/60 text-orange-200 bg-orange-500/10' },
  in_production:       { label: 'In Production',       emoji: '🟡', order: 4, className: 'border-ppc-gold/60 text-ppc-gold bg-ppc-gold/10' },
  shipped:             { label: 'Shipped',             emoji: '📦', order: 5, className: 'border-indigo-400/60 text-indigo-300 bg-indigo-500/10' },
  completed:           { label: 'Completed',           emoji: '🟢', order: 6, className: 'border-emerald-500/60 text-emerald-300 bg-emerald-500/10' },
};

export const STATUS_OPTIONS = (Object.keys(STATUS_META) as OrderStatus[]).sort(
  (a, b) => STATUS_META[a].order - STATUS_META[b].order,
);

/* ------------------------------------------------------------------ *
 * Order mode
 * ------------------------------------------------------------------ */

export const ORDER_MODE_META: Record<OrderMode, { label: string; blurb: string }> = {
  single_set:    { label: 'Single Set',    blurb: 'One uniform design for all games' },
  home_away_set: { label: 'Home/Away Set', blurb: 'Separate home and away uniforms (2 sets)' },
  multiple_sets: { label: 'Multiple Sets', blurb: 'Custom number of uniform sets' },
};

/* ------------------------------------------------------------------ *
 * Build types
 * ------------------------------------------------------------------ */

export const JERSEY_TYPE_LABELS: Record<JerseyType, string> = {
  sublimated: 'Sublimated',
  reversible_sublimated: 'Reversible Sublimated',
  embroidered: 'Embroidered',
};

export const SOCK_TYPE_LABELS: Record<SockType, string> = {
  sublimated: 'Sublimated',
  reversible_sublimated: 'Reversible Sublimated',
  embroidered: 'Embroidered',
};

export const PANT_SHELL_TYPE_LABELS: Record<PantShellType, string> = {
  sublimated: 'Sublimated',
  embroidered: 'Embroidered',
};

export const LACES_LABELS: Record<LacesStyle, string> = {
  none: 'None',
  hanging: 'Hanging Laces',
  straight: 'Straight Laces',
  x_laces: 'X Laces',
};

export const SHOULDER_CUT_LABELS: Record<ShoulderCut, string> = {
  rounded: 'Rounded',
  straight: 'Straight',
};

export const NAME_STYLE_LABELS: Record<NameStyle, string> = {
  free_standing_letters: 'Free Standing Letters',
  name_bars: 'Name Bars',
};

export const CAPTAIN_PATCH_STYLE_META: Record<CaptainPatchStyle, { label: string; blurb: string }> = {
  standard_matching: {
    label: 'Standard Matching',
    blurb: "C's and A's will match the number color and design style",
  },
  custom_design: {
    label: 'Custom Design',
    blurb: 'Upload custom C and A designs (different from numbers)',
  },
};

/* ------------------------------------------------------------------ *
 * Add-on toggles — single source of truth, so the form and the read-only
 * view can never drift out of sync.
 * ------------------------------------------------------------------ */

/**
 * The add-ons offered in the Add-Ons section.
 *
 * `jerseyTypes` limits an option to certain builds. Two are mutually exclusive
 * by construction:
 *   Stitched-On Sublimated Logos — sublimated builds only
 *   Twill Border Numbers         — embroidered builds only
 *
 * Pant Logo and Pant Number are NOT here. They live in their own Pants section
 * that only appears when the order actually includes pant shells, because
 * offering them on a jersey-only order is just noise.
 *
 * Front Crest was dropped — it isn't an option Keenan sells as an add-on.
 */
export const ADDON_TOGGLES = [
  { key: 'dimpledShoulders',        label: 'Dimpled Shoulders' },
  { key: 'rubberizedPpcCrest',      label: 'Rubberized PPC Crest' },
  { key: 'printedSizingTag',        label: 'Printed Size Tag' },
  { key: 'ppcBackBranding',         label: 'Back PPC Label' },
  { key: 'underarmVents',           label: 'Underarm Vents' },
  { key: 'reinforcedElbows',        label: 'Reinforced Elbows' },
  { key: 'twillBorderNumbers',      label: 'Twill Border Numbers',
    jerseyTypes: ['embroidered'] as JerseyType[] },
  { key: 'stitchedSublimatedLogos', label: 'Stitched-On Sublimated Logos',
    jerseyTypes: ['sublimated', 'reversible_sublimated'] as JerseyType[] },
  { key: 'stopSignPatch',           label: 'Stop Sign Patch' },
  { key: 'armNumbers',              label: 'Arm Numbers' },
] as const;

/** Add-ons that apply to the chosen jersey type. */
export function addonsForJerseyType(jerseyType: JerseyType | null) {
  return ADDON_TOGGLES.filter((a) => {
    const limit = (a as { jerseyTypes?: JerseyType[] }).jerseyTypes;
    if (!limit) return true;
    return jerseyType ? limit.includes(jerseyType) : false;
  });
}

/** Pant options — shown only when the order includes pant shells. */
export const PANT_TOGGLES = [
  { key: 'pantLogo',   label: 'Pant Logo' },
  { key: 'pantNumber', label: 'Pant Number' },
] as const;

/** Photographs of each lace style, shown on the picker. */
export const LACES_IMAGES: Record<LacesStyle, string> = {
  none: '/laces/none.png',
  hanging: '/laces/hanging.png',
  straight: '/laces/straight.png',
  x_laces: '/laces/x_laces.png',
};

/* ------------------------------------------------------------------ *
 * Build tier presets
 *
 * Picking a tier ticks that tier's features and unticks the other
 * tier-controlled ones, so the result is always a known build. Add-ons that
 * aren't part of any tier (front crest, arm numbers, stop sign patch, pant
 * logo/number) are order-by-order choices and are never touched by a preset.
 *
 * Which tiers are offered follows the jersey type — sublimated gets the
 * sublimated ladder, embroidered gets the embroidered one.
 * ------------------------------------------------------------------ */

export type AddonKey =
  | (typeof ADDON_TOGGLES)[number]['key']
  | (typeof PANT_TOGGLES)[number]['key'];

export interface TierDef {
  id: JerseyTier;
  label: string;
  blurb: string;
  /** Jersey types this tier can be used with. */
  jerseyTypes: JerseyType[];
  addons: AddonKey[];
}

const LITE_BASE: AddonKey[] = [
  'dimpledShoulders',
  'rubberizedPpcCrest',
  'printedSizingTag',
  'ppcBackBranding',
];

export const TIER_DEFS: TierDef[] = [
  {
    id: 'lite',
    label: 'Lite',
    blurb: 'Entry sublimated build.',
    jerseyTypes: ['sublimated'],
    addons: [...LITE_BASE],
  },
  {
    id: 'premier',
    label: 'Premier',
    blurb: 'Lite plus vents, reinforced elbows and stitched-on logos.',
    jerseyTypes: ['sublimated'],
    addons: [...LITE_BASE, 'underarmVents', 'reinforcedElbows', 'stitchedSublimatedLogos'],
  },
  {
    id: 'elite',
    label: 'Elite',
    blurb: 'The embroidered equivalent of Lite.',
    jerseyTypes: ['embroidered'],
    addons: [...LITE_BASE],
  },
  {
    id: 'pro',
    label: 'Pro',
    blurb: 'Elite plus vents, reinforced elbows and twill border numbers.',
    jerseyTypes: ['embroidered'],
    addons: [...LITE_BASE, 'underarmVents', 'reinforcedElbows', 'twillBorderNumbers'],
  },
  {
    id: 'reversible',
    label: 'Reversible',
    blurb: 'Reversible sublimated build. Back PPC label is the stitched-on version; no printed size tag.',
    jerseyTypes: ['reversible_sublimated'],
    addons: ['dimpledShoulders', 'rubberizedPpcCrest', 'ppcBackBranding', 'reinforcedElbows'],
  },
];

/** Every add-on a preset controls. Anything outside this set is left alone. */
export const TIER_CONTROLLED_ADDONS: AddonKey[] = [
  ...new Set(TIER_DEFS.flatMap((t) => t.addons)),
];

export function tiersForJerseyType(jerseyType: JerseyType | null): TierDef[] {
  if (!jerseyType) return [];
  return TIER_DEFS.filter((t) => t.jerseyTypes.includes(jerseyType));
}

export function tierById(id: JerseyTier | null): TierDef | undefined {
  return id ? TIER_DEFS.find((t) => t.id === id) : undefined;
}

/** Does the order's current toggles exactly match this tier? */
export function matchesTier(order: Pick<Order, AddonKey>, tier: TierDef): boolean {
  return TIER_CONTROLLED_ADDONS.every(
    (key) => Boolean(order[key]) === tier.addons.includes(key),
  );
}

/** The toggle changes a tier implies. Non-tier add-ons are absent from this. */
export function tierPatch(tier: TierDef): Record<AddonKey, boolean> {
  return Object.fromEntries(
    TIER_CONTROLLED_ADDONS.map((key) => [key, tier.addons.includes(key)]),
  ) as Record<AddonKey, boolean>;
}

/* ------------------------------------------------------------------ *
 * Sizes
 *
 * BUG THIS FIXES: all three size fields were free text in the old app, on both
 * the admin roster and the client-facing form. Live data already contained
 * "Goalie XL" and "Sock Only" sitting in the jersey-size column, and that goes
 * straight to the manufacturer.
 *
 * Editable in one place. Goalie cut is a separate flag on the roster row, not a
 * size string, and sock-only is its own flag too.
 * ------------------------------------------------------------------ */

/*
 * The real size ranges, as ordered from the manufacturer.
 *
 * Jersey sizes split by position, because a goalie cut is a different garment
 * and not a bigger version of the same one. The row's `isGoalie` flag picks
 * the list — see jerseySizesFor(). Before this, both shared one generic
 * S/M/L/XL list, which is how "Goalie XL" ended up typed into the size column
 * of live orders as free text.
 *
 * Order matters: these render in dropdowns in exactly this sequence, smallest
 * first, so don't sort them alphabetically.
 */

export const PLAYER_JERSEY_SIZES: readonly string[] = [
  'Youth S/M',
  'Youth L/XL',
  'Senior Small',
  'Senior Medium',
  'Senior Large',
  'Senior XL',
  'Senior XXL',
  'Senior XXXL',
];

export const GOALIE_JERSEY_SIZES: readonly string[] = [
  'Junior Goalie',
  'Goalie S/M',
  'Goalie L',
  'Goalie XL',
  'Goalie 2XL',
  'Goalie 3XL',
];

/** Which jersey sizes a given roster row can choose from. */
export function jerseySizesFor(isGoalie: boolean): readonly string[] {
  return isGoalie ? GOALIE_JERSEY_SIZES : PLAYER_JERSEY_SIZES;
}

/**
 * Both lists together.
 *
 * Only for code that has to recognise any valid size without knowing whose row
 * it is — CSV import, validation. Never use it to populate a dropdown; that
 * would offer a goalie cut to a forward.
 */
export const JERSEY_SIZES: readonly string[] = [...PLAYER_JERSEY_SIZES, ...GOALIE_JERSEY_SIZES];

export const SOCK_SIZES: readonly string[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL'];

export const PANT_SHELL_SIZES: readonly string[] = [
  'Senior Small',
  'Senior Medium',
  'Senior Large',
  'Senior XL',
  'Senior XXL',
  'Senior Goalie',
];

/**
 * Where "check the sizing chart" sends a customer.
 *
 * The real page on the Shopify store. An earlier version of this line was a
 * guessed path that 404'd — if this ever needs changing, open it in a browser
 * first and paste what the address bar says.
 */
/**
 * The terms a customer agrees to when they sign off a proof.
 *
 * Verified live before shipping. Both this and SIZING_CHART_URL point at real
 * pages on the Shopify store — an earlier guessed path 404'd, which is worse
 * than a missing link because it looks finished.
 */
export const TERMS_URL = 'https://www.powerplaycustoms.ca/policies/terms-of-service';

/**
 * The sentence the customer is agreeing to, stored verbatim on every approval.
 *
 * Written to match the actual policy rather than to sound reassuring: sign-off
 * locks the order, and once it is in production nothing can be changed at all.
 * Between those two points a change may be possible and is not promised —
 * saying "we'll try" would be a commitment nobody made.
 *
 * NOT LEGAL ADVICE. This is plain-language wording that matches what Keenan
 * told me the policy is; a lawyer should look at it before it carries weight.
 * If it changes, old approvals keep the sentence they were signed against —
 * see ApprovalRecord.statement.
 */
export const APPROVAL_STATEMENT =
  'I have checked this order and confirm the design, names, numbers, sizes and ' +
  'shipping details are correct. I understand that approving it finalises the ' +
  'order: any change after this point may not be possible, is not guaranteed, ' +
  'and once the order goes into production nothing can be changed at all.';

export const SIZING_CHART_URL = 'https://www.powerplaycustoms.ca/pages/hockey-size-chart';

/** Explicit escape hatch, so odd cases are visible rather than hidden in free text. */
export const SIZE_OTHER = 'Other';

/* ------------------------------------------------------------------ *
 * Production lead times
 *
 * Working days from the moment jerseys go into production, not from the order
 * being placed — design and sign-off sit in between and take however long the
 * team takes to reply.
 *
 * Ranges, because that's the honest shape of it. The estimated finish date
 * auto-fills with the LATE end: a customer told the early date and given the
 * late one is disappointed, while the reverse is a nice surprise. The full
 * range is shown next to the field so the early date isn't lost.
 * ------------------------------------------------------------------ */

export const LEAD_TIME_DAYS: Record<JerseyType, { min: number; max: number }> = {
  sublimated: { min: 12, max: 18 },
  reversible_sublimated: { min: 17, max: 23 },
  embroidered: { min: 22, max: 28 },
};

/* ------------------------------------------------------------------ *
 * Artwork slot limits
 * ------------------------------------------------------------------ */

/**
 * The roles that are a logo going somewhere specific on the jersey.
 *
 * These get the two-file treatment: a placement close-up plus the print-ready
 * artwork. Design and collar references are reference images — you look at
 * them, nobody prints them — so they stay a single file.
 */
export const LOGO_ROLES: readonly AssetRole[] = [
  'main_crest',
  'shoulder_logo_both',
  'shoulder_logo_left',
  'shoulder_logo_right',
  'additional_logo',
  'captain_c',
  'captain_a',
  'captain_extra',
  'pant_logo',
];

export function isLogoRole(role: AssetRole): boolean {
  return LOGO_ROLES.includes(role);
}

export const MAX_FILES_PER_REFERENCE_GROUP = 4;

/**
 * The design reference is one file, not four.
 *
 * It's the image the manufacturer actually builds from and the one everyone
 * points at in a conversation. Four slots invited four half-versions with no
 * indication which was current — the collar and crest groups are genuinely
 * multi-file, this one isn't.
 *
 * Existing orders imported from Base44 sometimes carry several. Those still
 * display; the limit only stops more being added.
 */
export const MAX_DESIGN_REFERENCE_FILES = 1;
export const MAX_FILES_PER_ADDITIONAL_LOGO = 2;

/* ------------------------------------------------------------------ *
 * CSV — must stay compatible with the old export, it's what goes to production.
 * ------------------------------------------------------------------ */

export const CSV_COLUMNS = [
  'Player Name',
  'Number',
  'Goalie',
  'Jersey Size',
  'Sock Size',
  'Pant Size',
  'Jerseys',
  'Socks',
  'Home Jersey',
  'Away Jersey',
  'Home Socks',
  'Away Socks',
  'Notes',
] as const;

/* ------------------------------------------------------------------ */

export const BUSINESS_TIMEZONE = 'America/Edmonton';
export const DUE_SOON_WINDOW_DAYS = 7;
