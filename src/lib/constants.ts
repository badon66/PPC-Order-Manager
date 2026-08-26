import type {
  CaptainPatchStyle, JerseyTier, JerseyType, LacesStyle, NameStyle, Order, OrderMode,
  OrderStatus, PantShellType, ShoulderCut, SockType,
} from './types';

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
 * TODO: Keenan to confirm the real address. Everything else about the link is
 * finished; only this line changes.
 */
export const SIZING_CHART_URL = 'https://powerplaycustoms.ca/pages/sizing-chart';

/** Explicit escape hatch, so odd cases are visible rather than hidden in free text. */
export const SIZE_OTHER = 'Other';

/* ------------------------------------------------------------------ *
 * Artwork slot limits
 * ------------------------------------------------------------------ */

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
