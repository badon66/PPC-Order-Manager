import type { CalendarDate } from './dates';

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

export const ORDER_STATUSES = [
  'incomplete',
  'draft',
  'waiting_for_payment',
  'in_production',
  'shipped',
  'completed',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_MODES = ['single_set', 'home_away_set', 'multiple_sets'] as const;
export type OrderMode = (typeof ORDER_MODES)[number];

export const JERSEY_TYPES = ['sublimated', 'reversible_sublimated', 'embroidered'] as const;
export type JerseyType = (typeof JERSEY_TYPES)[number];

export const SOCK_TYPES = ['sublimated', 'reversible_sublimated', 'embroidered'] as const;
export type SockType = (typeof SOCK_TYPES)[number];

export const PANT_SHELL_TYPES = ['sublimated', 'embroidered'] as const;
export type PantShellType = (typeof PANT_SHELL_TYPES)[number];

export const LACES_STYLES = ['none', 'hanging', 'straight', 'x_laces'] as const;
export type LacesStyle = (typeof LACES_STYLES)[number];

export const SHOULDER_CUTS = ['rounded', 'straight'] as const;
export type ShoulderCut = (typeof SHOULDER_CUTS)[number];

export const NAME_STYLES = ['free_standing_letters', 'name_bars'] as const;
export type NameStyle = (typeof NAME_STYLES)[number];

export const CAPTAIN_PATCH_STYLES = ['standard_matching', 'custom_design'] as const;
export type CaptainPatchStyle = (typeof CAPTAIN_PATCH_STYLES)[number];

/**
 * Artwork roles. Replaces the ~28 individually-numbered file columns in the old
 * schema (main_crest_file_2, left_shoulder_logo_file_4, ...). Adding a new
 * reference image is now a row, not a migration.
 */
export const ASSET_ROLES = [
  'design_reference',
  'collar_reference',
  'main_crest',
  'number_reference',
  'number_reference_home',
  'number_reference_away',
  'shoulder_logo_both',
  'shoulder_logo_left',
  'shoulder_logo_right',
  'captain_c',
  'captain_a',
  'captain_extra',
  'additional_logo',
  'pant_logo',
  'pant_number',
  'font',
  'design_svg',
] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

export const USER_ROLES = ['admin', 'staff'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/* ------------------------------------------------------------------ *
 * Build tiers
 *
 * Two parallel ladders, one per construction method:
 *
 *   Sublimated   Lite  →  Premier
 *   Embroidered  Elite →  Pro
 *
 * Elite is the embroidered equivalent of Lite; Pro is the embroidered
 * equivalent of Premier. They differ only where construction forces it —
 * Premier gets stitched-on sublimated logos, Pro gets twill border numbers.
 *
 * Reversible sublimated is its own single tier.
 * ------------------------------------------------------------------ */

export const JERSEY_TIERS = ['lite', 'premier', 'elite', 'pro', 'reversible'] as const;
export type JerseyTier = (typeof JERSEY_TIERS)[number];

/* ------------------------------------------------------------------ *
 * Client link config
 * ------------------------------------------------------------------ */

/**
 * The four things a customer can be asked for through their link. Each is
 * independently on/off per order.
 */
export interface ClientLinkSections {
  /** Team logos, sponsor logos, crest files. */
  logos: boolean;
  /** Design inspiration — reference images, "we like this look" pictures. */
  inspiration: boolean;
  /** Player names, numbers, sizes. */
  roster: boolean;
  /** Contact name, email, phone, shipping address. */
  personalDetails: boolean;
}

export const CLIENT_LINK_SECTION_META: Record<
  keyof ClientLinkSections,
  { label: string; blurb: string }
> = {
  logos: {
    label: 'Logos',
    blurb: 'Team logo, sponsor logos, crest files',
  },
  inspiration: {
    label: 'Design Inspiration',
    blurb: 'Reference images — looks they like, other jerseys, colour ideas',
  },
  roster: {
    label: 'Roster',
    blurb: 'Player names as printed, numbers, jersey and sock sizes',
  },
  personalDetails: {
    label: 'Personal Details',
    blurb: 'Contact name, email, phone, shipping address',
  },
};

export const DEFAULT_CLIENT_LINK_SECTIONS: ClientLinkSections = {
  logos: true,
  inspiration: false,
  roster: true,
  personalDetails: false,
};

/* ------------------------------------------------------------------ *
 * Entities
 * ------------------------------------------------------------------ */

export interface SetQuantities {
  /** Label shown in the UI: "Home Set", "Away Set", "Set 1"... */
  label: string;

  /**
   * What the roster covers. These are the counts that get checked against
   * player rows — 17 players means 17 player jerseys.
   */
  playerJerseys: number;
  goalieJerseys: number;
  sockPairs: number;
  pantShells: number;

  /**
   * On top of the roster. Spares, a coach's jersey, a set for the banner —
   * anything produced that no player row accounts for.
   *
   * Kept separate from the counts above on purpose: the roster tally checks
   * players against player counts, and extras would break that comparison if
   * they were folded in. The grand total adds them back.
   */
  extraJerseys: number;
  extraSockPairs: number;
  extraPantShells: number;
  /** Who or what the extras are for, and what sizes. */
  extrasNotes: string;

  /** Only used in multiple_sets mode. */
  notes?: string;
}

export interface OrderAsset {
  id: string;
  orderId: string;
  role: AssetRole;
  /** Ordering within a role. Design/collar/crest allow up to 4. */
  slot: number;
  fileUrl: string;
  fileName: string;
  displayName: string;
  notes: string;
  /** Groups the entries of an "Additional Logos" block together. */
  groupId?: string;
}

export interface RosterEntry {
  id: string;
  orderId: string;
  /** Name exactly as it will be printed on the jersey. */
  playerNameAsPrinted: string;
  number: string;
  isGoalie: boolean;
  /**
   * A participant who is only receiving socks (no jersey). In the old app this
   * was faked by typing "Sock Only" into the jersey-size column.
   */
  sockOnly: boolean;
  jerseySize: string;
  sockSize: string;
  pantShellSize: string;
  jerseysPerPlayer: number;
  socksPerPlayer: number;
  shellsPerPlayer: number;
  homeJersey: number;
  awayJersey: number;
  homeSocks: number;
  awaySocks: number;
  armNumbers: string;
  shoulderLogo: string;
  pantLogo: string;
  pantNumber: string;
  notes: string;
  sortOrder: number;
}

export interface Order {
  id: string;

  /* Team & payment */
  teamName: string;
  invoiceNumber: string;
  datePaid: CalendarDate | null;
  googleDriveLink: string;
  status: OrderStatus;
  estimatedFinishDate: CalendarDate | null;
  trackingCode: string;
  isSample: boolean;

  /* Contact & shipping — ADMIN ONLY. Never rendered on a public page. */
  contactFirstName: string;
  contactLastName: string;
  /** Missing from the old admin form entirely. Now load-bearing for the Gmail link. */
  contactEmail: string;
  contactPhone: string;
  shippingStreet: string;
  shippingSecondary: string;
  shippingCity: string;
  shippingProvince: string;
  shippingPostal: string;
  /** Master switch: is the client link turned on for this order at all? */
  requestClientDetails: boolean;
  /**
   * What the client link asks for. Only the ticked sections render on the
   * customer's form. Keenan sets this per order when he switches the link on.
   */
  clientLinkSections: ClientLinkSections;

  /* Order mode & quantities */
  orderMode: OrderMode;
  numberOfSets: number;
  sets: SetQuantities[];
  playersTotal: number;

  /* Build types */
  jerseyType: JerseyType | null;
  sockType: SockType | null;
  pantShellType: PantShellType | null;

  /* Number details */
  numberDetails: string;

  /* Add-ons */
  dimpledShoulders: boolean;
  reinforcedElbows: boolean;
  underarmVents: boolean;
  frontCrest: boolean;
  armNumbers: boolean;
  printedSizingTag: boolean;
  /** "Back PPC Label" — one field. On reversible builds it's the stitched-on version. */
  ppcBackBranding: boolean;
  rubberizedPpcCrest: boolean;
  /** Premier only: logos stitched onto the sublimated body. */
  stitchedSublimatedLogos: boolean;
  /** Pro only: twill border on the numbers. */
  twillBorderNumbers: boolean;
  stopSignPatch: boolean;
  pantLogo: boolean;
  pantNumber: boolean;
  lacesStyle: LacesStyle;
  shoulderCut: ShoulderCut;
  nameStyle: NameStyle;

  hasCaptainPatches: boolean;
  captainPatchStyle: CaptainPatchStyle | null;
  captainCQuantity: number;
  captainAQuantity: number;
  captainPatchNotes: string;

  hasShoulderLogos: boolean;
  shoulderLogosSame: boolean;

  /**
   * The build tier last applied from a preset. Kept so the order detail page
   * and anything sent to production can name the tier, not just list toggles.
   * It records what was APPLIED — if the toggles are since changed by hand the
   * UI says "Premier (modified)" rather than pretending nothing moved.
   */
  jerseyTier: JerseyTier | null;

  /* Per-group artwork notes (assets themselves live in OrderAsset) */
  designReferenceNotes: string;
  collarReferenceNotes: string;
  mainCrestNotes: string;

  /* Notes & approval */
  specialNotes: string;
  approvedBy: string;
  approvedDate: CalendarDate | null;
  deliveryConcern: string;

  /* Public link tokens — long, random, per-order, revocable. NOT the row id. */
  shareToken: string;
  rosterToken: string;

  /* Bookkeeping */
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/* ------------------------------------------------------------------ *
 * Client submissions (staging — never auto-merged onto the order)
 * ------------------------------------------------------------------ */

export interface SubmittedPlayer {
  playerNameAsPrinted: string;
  number: string;
  isGoalie: boolean;
  sockOnly: boolean;
  jerseySize: string;
  sockSize: string;
  notes: string;
}

export interface SubmittedLogo {
  fileUrl: string;
  fileName: string;
  logoName: string;
  placementNotes: string;
  description: string;
}

export interface SubmittedInspiration {
  fileUrl: string;
  fileName: string;
  /** "We like the stripe pattern on this one" — what they want you to notice. */
  notes: string;
}

export interface SubmittedContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  secondary: string;
  city: string;
  province: string;
  postal: string;
}

/** One field the customer changed between two visits to their link. */
export interface SubmissionChange {
  section: keyof ClientLinkSections;
  label: string;
  from: string;
  to: string;
}

export interface ClientRosterSubmission {
  id: string;
  orderId: string;
  /**
   * Which visit this was. The customer can reopen their link and revise, so a
   * single order can have several — 1 is the first submission.
   */
  revision: number;
  /**
   * What changed since their previous submission. Empty on the first one.
   * Recorded so a late edit to a name or size is never invisible.
   */
  changes: SubmissionChange[];
  /** Snapshot of which sections were asked for at the time — so a review reads right later. */
  sections: ClientLinkSections;
  players: SubmittedPlayer[];
  logos: SubmittedLogo[];
  inspiration: SubmittedInspiration[];
  /** Only present when personalDetails was requested. */
  contact?: SubmittedContact;
  confirmed: boolean;
  submittedAt: string;
  /** Set when the admin accepts it onto the order. Submission is kept either way. */
  acceptedAt: string | null;
}

/* ------------------------------------------------------------------ *
 * Change history
 * ------------------------------------------------------------------ */

export type ChangeAction =
  | 'order_created'
  | 'field_changed'
  | 'status_changed'
  | 'roster_changed'
  | 'asset_added'
  | 'asset_removed'
  | 'client_submitted'
  | 'submission_accepted'
  | 'approved'
  | 'order_deleted'
  | 'order_restored';

export interface ChangeLogEntry {
  id: string;
  orderId: string;
  action: ChangeAction;
  field?: string;
  fromValue?: string | null;
  toValue?: string | null;
  summary: string;
  /** Full order snapshot, written on approval so "what was signed off" is answerable. */
  snapshot?: Order;
  actorEmail: string;
  actorName: string;
  at: string;
}

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}
