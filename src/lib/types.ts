import type { CalendarDate } from './dates';

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

export const ORDER_STATUSES = [
  'incomplete',
  'draft',
  'design_talk',
  'finalizing_details',
  'waiting_for_deposit',
  'waiting_for_approval',
  'waiting_for_production_deposit',
  'in_production',
  'waiting_for_final_approval',
  'waiting_for_payment',
  'shipped',
  'completed',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/* ------------------------------------------------------------------ *
 * Customer updates
 *
 * The emails Keenan can send a team as their order moves, one per stage.
 * Design: docs/superpowers/specs/2026-09-25-customer-order-status-design.md
 * ------------------------------------------------------------------ */

export const UPDATE_STAGES = [
  'design_talk',
  'mockup_ready',
  'finalizing_details',
  'initial_deposit_requested',
  'initial_deposit_received',
  'proof_ready',
  'approval_confirmed',
  'production_deposit_requested',
  'production_deposit_received',
  'in_production',
  'final_payment_requested',
  'shipped',
  'completed',
  'payment_received',
  'review_request',
] as const;
export type UpdateStage = (typeof UPDATE_STAGES)[number];

/** How the staff panel and the history name each email. */
export const UPDATE_STAGE_LABEL: Record<UpdateStage, string> = {
  design_talk: 'Send us your logos and inspiration',
  mockup_ready: 'Mockup ready',
  finalizing_details: 'Roster and contact details',
  initial_deposit_requested: 'Initial deposit requested',
  initial_deposit_received: 'Initial deposit received',
  proof_ready: 'Proof ready to approve',
  approval_confirmed: 'Approval confirmed',
  production_deposit_requested: 'Pre-production deposit requested',
  production_deposit_received: 'Pre-production deposit received',
  in_production: 'In production',
  final_payment_requested: 'Jerseys are done',
  shipped: 'Shipped',
  completed: 'Thanks',
  payment_received: 'Payment received',
  review_request: 'Review and referral',
};

/**
 * Which round of the mockup a "Mockup ready" email is about. Keenan picks it
 * in the send panel; it's recorded on the sent row as `detail`, so the
 * history reads "Mockup ready · V2" and a resend keeps its own version.
 */
export const MOCKUP_VERSIONS = ['V1', 'V2', 'V3', 'V4'] as const;
export type MockupVersion = (typeof MOCKUP_VERSIONS)[number];

export const PAYMENT_KINDS = ['initial_deposit', 'production_deposit', 'final_payment'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

/** How the staff panel and the history name each payment kind. */
export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  initial_deposit: 'initial deposit',
  production_deposit: 'pre-production deposit',
  final_payment: 'final payment',
};

/** The `detail` on a "Jerseys are done" record that went out without a payment ask, so a resend does the same. */
export const ALREADY_PAID_DETAIL = 'already paid';

/** One email that went out. No amount is ever recorded here — see the money rule. */
export interface CustomerEmailRecord {
  stage: UpdateStage;
  /** ISO instant. */
  sentAt: string;
  to: string;
  messageId: string;
  /** A short label, e.g. which payment — "final payment". Never an amount; see the money rule. */
  detail?: string;
}

/** One row of app-wide settings. Three strings Keenan writes once. */
export interface AppSettings {
  /** Prefilled into the three request emails, editable before sending. */
  howToPay: string;
  /** The Google review link; empty hides the button in the Review and referral email. */
  googleReviewUrl: string;
  /** The referral sentence in the Review and referral email; empty hides it. */
  referralLine: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  howToPay:
    'E-transfer to info@powerplaycustoms.ca (no fee), or pay by card (3% processing fee). Put your team name in the message.',
  googleReviewUrl: '',
  referralLine:
    "Know another team that needs jerseys? Send them our way and mention your team, and we'll look after you both.",
};

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

/**
 * How the player's name goes on the back — including not at all.
 *
 * "none" is a real choice, not a missing answer: plenty of teams order jerseys
 * with numbers only. Without it, those orders sat on whatever the default was
 * and the manufacturer had to be told separately.
 */
export const NAME_STYLES = ['free_standing_letters', 'name_bars', 'none'] as const;
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
  'pant_design',
  'pant_logo',
  'pant_number',
  'font',
  'design_svg',
  'finished_photo',
  // Custom branding: the extra logo (a sponsor's, say) and where it goes.
  'custom_branding_logo',
  'custom_branding_placement',
] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

/* ------------------------------------------------------------------ *
 * Section comments
 *
 * A comment Keenan pins to the top of one section of the order form ("Add
 * comment" beside the section's tick), with who gets to read it.
 * ------------------------------------------------------------------ */

export const COMMENT_AUDIENCES = ['everyone', 'factory', 'internal'] as const;
export type CommentAudience = (typeof COMMENT_AUDIENCES)[number];

export const COMMENT_AUDIENCE_LABEL: Record<CommentAudience, string> = {
  everyone: 'Customer + factory',
  factory: 'Factory only',
  internal: 'Just me',
};

/**
 * One custom branding logo — a sponsor's, say. Its files are the
 * `custom_branding_logo` / `custom_branding_placement` assets carrying this
 * id as their groupId. An order can have several.
 */
export interface CustomBrandingItem {
  id: string;
  /** Whose logo: "Smith Plumbing". */
  name: string;
  /** What it is and where it goes. */
  notes: string;
}

export interface SectionComment {
  text: string;
  audience: CommentAudience;
}

/**
 * The form sections a comment can sit on, with the name the sheets show it
 * under. Keys are the order form's section ids.
 */
export const COMMENT_SECTIONS = {
  team: 'Team & Payment',
  contact: 'Shipping & Contact',
  mode: 'Order Mode',
  totals: 'Order Totals',
  build: 'Build Type',
  numbers: 'Numbers & Names',
  addons: 'Add-Ons & Customization',
  branding: 'Powerplay Branding',
  artwork: 'Logos & Artwork',
  pants: 'Pants & Pant Shells',
  roster: 'Player Roster',
  notes: 'Notes & Approval',
} as const;
export type CommentSection = keyof typeof COMMENT_SECTIONS;

/** A comment as a sheet carries it: already filtered for that sheet's reader. */
export interface SheetComment {
  section: CommentSection;
  text: string;
}

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

export const JERSEY_TIERS = ['lite', 'premier', 'hybrid', 'elite', 'pro', 'reversible'] as const;
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
    blurb: 'Player names as printed, numbers, jersey and sock sizes — typed in, or a file they upload',
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
 * Website intake
 *
 * The website's order page offers three starting points. The one the
 * customer picked decides how their client-link page opens (see
 * src/lib/route-copy.ts) and which sections it asks for.
 * ------------------------------------------------------------------ */

export const STARTING_POINTS = ['Design ready', 'Starting from scratch', 'Ordered before'] as const;
export type StartingPoint = (typeof STARTING_POINTS)[number];

/** The customer page's flavour, derived from the starting point. `null` = an order Keenan made by hand. */
export type RouteVariant = 'ready' | 'scratch' | 'reorder';

export const ORDER_SOURCES = ['manual', 'website'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

/**
 * What the team typed on the website, word for word. Team name, contact and
 * jersey tier are also mapped into their normal Order fields; this keeps the
 * rest, so nothing they wrote is lost to a mapping.
 */
export interface WebsiteEnquiry {
  startingPoint: StartingPoint;
  league: string;
  quantity: string;
  timeline: string;
  jerseyStyle: string;
  items: string[];
  artworkStatus: string;
  colours: string;
  inspiration: string;
  extraDetails: string;
  previousOrder: string;
  /** "How did you hear about us?" — one of the page's fixed answers, or empty. */
  source: string;
  /** ISO instant the enquiry arrived. A timestamp, not a calendar date. */
  receivedAt: string;
}

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

  /**
   * This set's own build, when the sets aren't all built the same — a home
   * set embroidered and an away set sublimated (Keenan, 2026-10-20). Absent
   * or null = the order's own jersey type and tier, which are the first
   * set's. Only sets after the first ever carry one (see setBuilds).
   */
  jerseyType?: JerseyType | null;
  jerseyTier?: JerseyTier | null;
  /** Who or what the extras are for, and what sizes. */
  extrasNotes: string;

  /** Only used in multiple_sets mode. */
  notes?: string;
}

/**
 * What was actually agreed to, captured at the moment of signing.
 *
 * A name and a date alone don't answer the question that matters if a team
 * later says they never agreed: what wording was on screen, did they tick the
 * box, when exactly, and from where. Written once and never edited — changing
 * it after the fact would defeat the point of having it.
 */
export interface ApprovalRecord {
  /** The printed name, typed under the signature. */
  signedName: string;
  /**
   * The signature itself, drawn by hand: a PNG data URL.
   *
   * Typing a name proves somebody had the link and could reach a keyboard. A
   * drawn mark is at least an act — it's what stops a manager signing on the
   * captain's behalf without thinking about it. Stored inline on the record
   * rather than in the artwork bucket: it's small, it's part of the evidence,
   * and it must not be reachable by an expiring URL.
   */
  signatureDataUrl: string;
  /** ISO instant, not a calendar date — this is a moment, not a day. */
  signedAt: string;
  /** They ticked the terms box. Sign-off is refused without it. */
  termsAccepted: boolean;
  /** The terms page they were linked to, as it stood that day. */
  termsUrl: string;
  /**
   * The exact sentence they agreed to, copied in rather than referenced. If
   * the wording is ever changed, old approvals still say what they said.
   */
  statement: string;
  /** Rough origin, for a "was this really them" conversation. Not identity. */
  ipAddress: string;
  userAgent: string;
  /**
   * The roster they verified, separately from the order as a whole: a box of
   * its own ticked before Approve would go. Absent on approvals from before
   * the roster check existed. The fingerprint is what lets the order page say
   * "the roster changed after they checked it".
   */
  roster?: RosterVerification | null;
}

export interface RosterVerification {
  /** The sentence beside the box, copied in as it read. */
  statement: string;
  rosterId: string;
  /** "Roster 2" — the number at the time, for a person reading the record. */
  rosterNumber: number;
  rows: number;
  /** See rosterFingerprint in lib/roster-versions.ts. */
  fingerprint: string;
}

/**
 * One of the rosters on an order: Roster 1, Roster 2… See lib/roster-versions.ts.
 * The rows themselves are RosterEntry rows carrying this id.
 */
export interface RosterVersion {
  id: string;
  /** Never reused, so "Roster 3" still means the same roster after Roster 2 is deleted. */
  number: number;
  source: RosterSource;
  /** The file it was read from, when it came from one. */
  fileName: string;
  /**
   * Where that file is stored (a bucket key), so the original can be opened
   * beside the roster read from it. Absent on rosters from before imports.
   */
  fileUrl?: string;
  /** The team submission it came from, when it did. */
  submissionId: string;
  /** ISO instant. */
  createdAt: string;
  /** One line for the list: "Read from roster.pdf (two AI readings, checked)". */
  note: string;
}

export type RosterSource = 'manual' | 'import' | 'submission';

/**
 * A spare jersey, with the number and size it should be made in.
 *
 * Extras aren't on the roster — no player's name goes on them — but they still
 * have to be manufactured as something, and "3 extra jerseys" with no numbers
 * is an order the factory can't fill. One entry per extra.
 */
export interface ExtraJersey {
  number: string;
  /** Jersey size. Empty when this spare is socks only. */
  size: string;
  /** Sock size. Empty when the order has no spare socks. */
  sockSize: string;
  /**
   * A spare pair of socks with no jersey.
   *
   * Two spare jerseys and three spare sock pairs is three spares, one of which
   * is socks only — the counts don't have to match, and this is how the odd
   * one out is described rather than left unexplained.
   */
  sockOnly: boolean;
  notes: string;
}

/**
 * A jersey made for Powerplay to keep.
 *
 * A sample for the wall, a reference for a remake, a spare to have on hand:
 * whatever the reason, it is NOT the team's. It is never on their sheet, never
 * on their bill, never in the roster tally, and never in the totals the team
 * signs off on. The factory makes it alongside the set it copies and holds it
 * at the facility for Powerplay instead of packing it with the team's order.
 *
 * Kept on the order rather than inside the set because the customer's view
 * carries the sets whole, and a keeper must not travel with them.
 */
export interface KeeperJersey {
  id: string;
  /** Which set it copies (index into Order.sets). Home vs away matters to the factory. */
  setIndex: number;
  /** Number on the back. Typed, or picked at random from the numbers nobody on the roster has. */
  number: string;
  /** Name on the back. Usually blank. */
  name: string;
  /** Jersey size. Defaults to the most common size on the roster. */
  size: string;
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

  /*
   * Logos carry two files, not one.
   *
   * `fileUrl` above is the print-ready artwork — the vector the manufacturer
   * works from, often a .ai or .eps that no browser can render. These two hold
   * a close-up photo showing where on the jersey the logo actually sits, which
   * is the thing a person needs to see and the thing a flat file can't tell
   * them.
   *
   * Optional, and only meaningful for the logo roles (see LOGO_ROLES in
   * constants.ts). Design and collar references are single images and don't
   * use them.
   */
  placementFileUrl?: string;
  placementFileName?: string;
}

/**
 * An asset plus a link the browser can actually load.
 *
 * Stored artwork lives in a private bucket, so `fileUrl` is a key, not a URL.
 * Server components sign it into `viewUrl` before handing assets to anything
 * that renders them.
 *
 * NEVER PERSIST THIS. `viewUrl` expires, so a stored copy is a link that works
 * in testing and is dead by the time a customer opens it. Everything written
 * back to the store is a plain OrderAsset.
 */
/**
 * An asset plus links a browser can load.
 *
 * `viewUrl` signs `fileUrl` (the print-ready artwork). `placementViewUrl`
 * signs `placementFileUrl` when there is one — empty string otherwise, so a
 * caller can test it without optional chaining.
 *
 * Neither is ever persisted: a signed URL works in testing and is dead by the
 * time a customer opens it.
 */
export type ViewableAsset = OrderAsset & { viewUrl: string; placementViewUrl?: string };

/**
 * Captain's C, alternate's A, or neither.
 *
 * A plain string rather than a boolean pair, because a player is one or the
 * other and never both — and `''` reads the same in the CSV, the JSON store
 * and the form as it does here.
 */
export type Captaincy = '' | 'C' | 'A';

export interface RosterEntry {
  id: string;
  orderId: string;
  /** Name exactly as it will be printed on the jersey. */
  playerNameAsPrinted: string;
  number: string;
  isGoalie: boolean;
  /**
   * Whose jersey gets a letter.
   *
   * Only means anything in production when the order has captain patches on,
   * but it's asked for either way: the team knows who its captain is long
   * before anyone decides how the letter gets applied.
   */
  captaincy: Captaincy;
  /**
   * A participant who is only receiving socks (no jersey). In the old app this
   * was faked by typing "Sock Only" into the jersey-size column.
   */
  sockOnly: boolean;
  /**
   * This jersey gets no name on the back.
   *
   * A flag rather than an empty name field, for the same reason sockOnly is a
   * flag rather than words typed into the size column: '' means "nobody has
   * filled this in yet", which is a problem to chase, and this means "there is
   * deliberately no name", which is finished work. The manufacturer has to be
   * able to tell those apart. The typed name is kept, so unticking brings it
   * back. See `isNoName` in lib/roster-edit.ts for the derived case (the whole
   * order is No Letters).
   */
  noName: boolean;
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
  /**
   * The client submission this row was created from, or '' for a row Keenan
   * typed or imported himself.
   *
   * This is what makes re-accepting a roster a replacement rather than a
   * second copy. The form prefills from the last submission, so when a team
   * fixes two sizes and sends it back, what arrives is the WHOLE roster
   * again, not a delta — appending it turned 20 players into 40. Accepting
   * now clears the rows the previous submission put there and writes the new
   * set, while anything without a submission id behind it (hand-typed, CSV
   * import) is left alone.
   */
  fromSubmissionId: string;
  /**
   * Which of the order's rosters this row belongs to (Roster 1, Roster 2…).
   * Rows from before there could be more than one have none, and belong to
   * the original roster — see ORIGINAL_ROSTER_ID in lib/roster-versions.ts.
   */
  rosterId: string;
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
  /** When the jerseys actually went into production. Starts the lead-time clock. */
  productionStartDate: CalendarDate | null;
  /** When production actually finished — the real date, against the estimate. */
  productionFinishDate: CalendarDate | null;
  trackingCode: string;
  isSample: boolean;

  /* Contact & shipping — ADMIN ONLY. Never rendered on a public page. */
  contactFirstName: string;
  contactLastName: string;
  /** Missing from the old admin form entirely. Now load-bearing for the Gmail link. */
  contactEmail: string;
  contactPhone: string;
  /** Where the order came from. Website orders carry the enquiry below. */
  source: OrderSource;
  enquiry: WebsiteEnquiry | null;
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
  /**
   * Double twill outlines: the number's outline is cut from twill as well
   * (twill on twill, then embroidered on) rather than embroidered, which
   * comes out too thin. Embroidered jerseys only. Standard on Pro, optional
   * on Elite. The key keeps its old name so stored orders still read.
   */
  twillBorderNumbers: boolean;
  stopSignPatch: boolean;
  pantLogo: boolean;
  pantNumber: boolean;
  /**
   * Goalie pant shells with the logos and numbers on the BACK of the legs
   * instead of the front, so they still show once the pads are on. Only
   * means anything when the order has goalie jerseys and pant shells; the
   * form offers it then and nowhere else.
   */
  goaliePantReversedLogos: boolean;
  lacesStyle: LacesStyle;
  /* Money. KEENAN ONLY.
   *
   * These never leave the access-coded side. Not in PublicOrderView, not on
   * /share or /roster, not in the roster CSV, not in ApprovalRecord. The test
   * in tests/money/leak.test.ts fails the build if any of them do. */

  /**
   * Manual override of the order's value, CAD before tax. null = priced
   * automatically from the tier and quantities (lib/pricing.ts). Set only when
   * the list price isn't the deal.
   */
  orderValue: number | null;

  /** The day it was marked Completed. Stamped by `stampCompletion`; editable to correct. */
  completedAt: CalendarDate | null;

  /**
   * Which payments Keenan has marked received, from the quick-edit popup.
   * null = never marked, and lib/payments.ts infers from the order's position.
   * An array, empty included, is his word and is not second-guessed. Never an
   * amount.
   */
  paymentsReceived: PaymentKind[] | null;

  /** The day the job went to Michael. Set by the "Sent off to factory" button. */
  sentToFactoryAt: CalendarDate | null;

  /**
   * Pro cut multi-panel sock construction. Any tier can have it (the socks come
   * sublimated or embroidered either way), so it's a per-order tick beside the
   * build tier. Only means anything when the order has socks; the form hides
   * it otherwise and the price ignores it.
   */
  multiPanelSocks: boolean;

  shoulderCut: ShoulderCut;
  /** Stitched trim along the shoulder seam. Sits with the shoulder cut because that's where you decide it. */
  stitchedShoulderTrim: boolean;
  nameStyle: NameStyle;

  hasCaptainPatches: boolean;
  captainPatchStyle: CaptainPatchStyle | null;
  captainCQuantity: number;
  captainAQuantity: number;
  /**
   * Home/away orders: the away set's C's and A's, a different design from the
   * home set's (captainC/AQuantity above are then the home set's).
   */
  captainAwayCQuantity: number;
  captainAwayAQuantity: number;
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
  /**
   * Changes to the Powerplay branding — "no back label on this one", "crest
   * in gold". Travels with the branding toggles to both sheets.
   */
  brandingNotes: string;
  /**
   * Branding that isn't Powerplay's: an extra logo for a sponsor or the like.
   * The files are assets (`custom_branding_logo`, `custom_branding_placement`);
   * this says what it is and where it goes. Both sheets.
   */
  customBranding: boolean;
  /** Before several logos were allowed: the one description. Healed into customBrandingItems[0]. */
  customBrandingNotes: string;
  /** Each custom branding logo, with its own name, notes and files (by groupId). */
  customBrandingItems: CustomBrandingItem[];
  /**
   * One comment per form section, keyed by section id (COMMENT_SECTIONS), each
   * with its own audience: everyone, the factory only, or just Keenan.
   */
  sectionComments: Partial<Record<CommentSection, SectionComment>>;
  /** Order notes. On the customer's sheet AND the factory's: instructions about what to make. */
  specialNotes: string;
  /**
   * Notes for the factory only. The longer, in-the-weeds instructions Michael
   * needs and the team doesn't: construction details, how to pack the keepers,
   * what to watch on this one. Never on the customer's sheet.
   */
  factoryNotes: string;

  /**
   * Numbers and sizes for the spare jerseys.
   *
   * Kept on the order rather than per set: they're one list of spares, and
   * splitting them by set would ask which set a spare belongs to, a question
   * nobody actually asks. Length is kept in step with the extraJerseys total
   * across sets — a gap is flagged rather than silently padded, because an
   * invented number gets printed on a jersey.
   */
  extraJerseyDetails: ExtraJersey[];

  /**
   * Jerseys made for Powerplay to keep — see KeeperJersey. Shown to Keenan and
   * to the factory, never to the customer.
   */
  keeperJerseys: KeeperJersey[];

  /**
   * The order's rosters, and which one is in use (what every sheet, total and
   * CSV reads). Empty until a second roster arrives; see lib/roster-versions.ts.
   * Changed only by the roster actions, never by the form's autosave.
   */
  rosters: RosterVersion[];
  activeRosterId: string;
  /**
   * The highest roster number ever given on this order. A deleted Roster 3
   * is never handed to a new roster, so "Roster 3" in last week's text still
   * means the roster it meant.
   */
  rosterNumbersUsed: number;
  /**
   * When a team's uploaded roster file was read by AI (ISO instants, the last
   * few). The public form can trigger a paid AI reading, so it's limited per
   * order per day, and this is the count.
   */
  rosterReads: string[];

  /**
   * Whether the customer's share page shows a sign-off block at all.
   *
   * Off by default. Sign-off is a commitment the customer makes, so it only
   * appears when Keenan has decided the proof is ready to be signed — not on
   * every share link the moment it's created.
   */
  requestApproval: boolean;

  /** Typed name. What they signed as, not who they are — see approvalRecord. */
  approvedBy: string;
  approvedDate: CalendarDate | null;

  /**
   * What was actually agreed to, captured at the moment of signing.
   *
   * A name and a date alone don't answer the question that matters if a team
   * later says they never agreed: what wording was on screen, did they tick
   * the box, when exactly, and from where. Written once and never edited —
   * changing it after the fact would defeat the point of having it.
   */
  approvalRecord: ApprovalRecord | null;
  deliveryConcern: string;

  /** The update emails sent to this team, one record per send. */
  customerEmails: CustomerEmailRecord[];

  /* Public link tokens — long, random, per-order, revocable. NOT the row id. */
  shareToken: string;
  rosterToken: string;
  /**
   * The factory sheet's token (/factory/<token>). Unlike the two above, the
   * page it opens also asks for the factory code. Empty on orders made before
   * the factory sheet existed, until Keenan makes the link.
   */
  factoryToken: string;

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
  /** Captain or alternate, as the team picked it on the form. */
  captaincy: Captaincy;
  sockOnly: boolean;
  jerseySize: string;
  sockSize: string;
  /** Only asked for when the order actually includes pant shells. */
  pantShellSize: string;
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

/**
 * How the team answered "Is your roster ready?" on their page.
 *   typed  — they filled in the player rows
 *   file   — they uploaded the list they already had (a spreadsheet, a photo of the sheet)
 *   later  — not ready yet; they come back to the same link
 */
export type RosterAnswer = 'typed' | 'file' | 'later';

export const ROSTER_ANSWER_LABELS: Record<RosterAnswer, string> = {
  typed: 'typed in',
  file: 'sent as a file',
  later: 'not ready yet',
};

export interface SubmittedRosterFile {
  fileUrl: string;
  fileName: string;
  /** "Sizes are on the second tab", "the two crossed out have left" — anything about reading it. */
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
  /** Their answer to "Is your roster ready?". Absent on submissions from before it was asked. */
  rosterAnswer?: RosterAnswer;
  /** The list they uploaded instead of typing it in. Never merged onto the roster; Keenan types it up. */
  rosterFiles: SubmittedRosterFile[];
  /**
   * The file the players were read from, when the team uploaded a roster file
   * and the app turned it into rows for them to check before sending.
   */
  convertedFrom?: SubmittedRosterFile | null;
  /** Numbers and sizes for the spare jerseys — no names, so not roster rows. */
  extras: ExtraJersey[];
  logos: SubmittedLogo[];
  inspiration: SubmittedInspiration[];
  /** "Your colours", typed on the design page. */
  colours: string;
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
  | 'customer_emailed'
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

/* ------------------------------------------------------------------ *
 * Sales — cold calling.
 * Design: docs/superpowers/specs/2026-09-06-sales-cold-calling-design.md
 * ------------------------------------------------------------------ */

export const CALL_OUTCOMES = [
  // didn't reach them
  'no_answer', 'voicemail', 'bad_number', 'referred',
  // talked to them
  'callback', 'send_info', 'interested', 'meeting_booked',
  'not_now', 'not_interested', 'do_not_call',
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const SCRIPT_KINDS = ['read', 'reminder', 'question', 'objection', 'jersey_manager'] as const;
export type ScriptKind = (typeof SCRIPT_KINDS)[number];

export const SCRIPT_SECTIONS = ['opening', 'discovery', 'objections', 'close'] as const;
export type ScriptSection = (typeof SCRIPT_SECTIONS)[number];

export type LeadPriority = '' | 'A' | 'B' | 'C';
export type LeadRating = 1 | 2 | 3 | 4 | 5;
export type ContactSource = 'sheet' | 'referral';
export type ContactBucket = 'do_not_call' | 'uncalled' | 'retry' | 'follow_up' | 'done';

/** One row of the sheet's Script tab. Ids are per-list (`s1`, `s2`, …). */
export interface ScriptItem {
  id: string;
  section: ScriptSection;
  kind: ScriptKind;
  text: string;
  /** Objection rows: what to say back. '' otherwise. */
  response: string;
  /** Question rows: the choices. Empty = free-text answer. */
  options: string[];
  /** Show When rule as typed. '' = always. Parsed at render time. */
  showWhen: string;
}

/** One upload into a list. Kept on the list, newest first, capped at 10. */
export interface ImportRecord {
  at: string;                 // instant
  by: string;                 // caller name
  fileName: string;
  added: number;              // new contacts
  merged: Array<{ line: number; contactId: string; filled: string[] }>;
  alsoIn: Array<{ line: number; contactId: string; listId: string; listName: string }>;
  skipped: Array<{ line: number; reason: string; raw: string }>;
  warnings: Array<{ line: number; reason: string }>;
  scriptReplaced: boolean;
}

/** A master list: one per kind of team, grown by uploads. Contacts, logs and sessions hang off it. */
export interface CallList {
  id: string;
  name: string;
  script: ScriptItem[];
  /** The sentence said when they answer. Per list, edited in the calling screen's Settings. */
  pickupLine: string;
  /** What to say when it goes to voicemail. Per list, edited in Settings; shown by "Went to voicemail". */
  voicemailScript: string;
  /** Lead times, minimums, shipping, sizing link — the things asked mid-sentence. Free text, per list. */
  quickFacts: string;
  imports: ImportRecord[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Contact {
  id: string;
  listId: string;
  /** Sheet row order. A referral copies its source's, and sorts after it by createdAt. */
  sortOrder: number;
  source: ContactSource;
  referredFromContactId: string | null;

  /* From the sheet */
  orgName: string;
  orgType: string;
  contactName: string;
  role: string;
  phone: string;
  altPhone: string;
  email: string;
  city: string;
  province: string;
  timezoneOverride: string;
  league: string;
  ageDivisions: string;
  teams: number | null;
  players: number | null;
  seasonStartMonth: string;
  orderingMonth: string;
  currentSupplier: string;
  lastOrderedYear: string;
  colours: string;
  website: string;
  social: string;
  leadSource: string;
  priority: LeadPriority;
  bestTimeToCall: string;
  doNotCall: boolean;
  notes: string;
  /** Every header → cell as uploaded, including columns the importer doesn't know. */
  raw: Record<string, string>;
  /**
   * Handles the jerseys for this team. Set by the Jersey manager script question;
   * at most one contact per linked team (same orgName) carries it.
   */
  isJerseyManager: boolean;
  /** The latest answers to the discovery questions, merged from calls by applyCallLog. */
  discovery: Discovery;

  /* Call state. Written only by applyCallLog / applySkip in data/sales-logic.ts. */
  lastOutcome: CallOutcome | null;
  lastCalledAt: string | null;
  callCount: number;
  skipCount: number;
  lastSkippedAt: string | null;
  nextCallDate: CalendarDate | null;
  leadRating: LeadRating | null;

  createdAt: string;
  updatedAt: string;
}

export interface FollowUp {
  date: CalendarDate | null;
  /** 'HH:MM' or ''. */
  time: string;
  note: string;
}

export interface Referral {
  name: string;
  role: string;
  phone: string;
  email: string;
}

/** The Jersey manager question's answer. '' = not asked or not answered. */
export interface JerseyManagerAnswer {
  answer: '' | 'self' | 'other';
  /** 'other' → an already-known contact at the same team… */
  existingContactId: string;
  /** …or someone new. Blank when existingContactId is set. */
  person: { name: string; role: string; phone: string; email: string; note: string };
}

/** One calling session: opened when the calling view is entered, closed by the back link. */
export interface CallSession {
  id: string;
  listId: string;
  callerName: string;
  startedAt: string;
  /** null while open (or abandoned — see sessionEnd). */
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/* Discovery — the five questions asked on every call that reaches someone. */
export const LAST_REDONE_OPTIONS = ['under_1', '1_2', '2_3', '3_5', '5_plus', 'never'] as const;
export type LastRedone = '' | (typeof LAST_REDONE_OPTIONS)[number];
export const LOOKING_AT_OPTIONS = ['jersey_only', 'jerseys_socks', 'full_set', 'replacement'] as const;
export type LookingAt = '' | (typeof LOOKING_AT_OPTIONS)[number];
export const SUPPLIER_PRIORITIES = ['turnaround', 'durability', 'design_help', 'low_minimums', 'price'] as const;
export type SupplierPriority = (typeof SUPPLIER_PRIORITIES)[number];

export interface Discovery {
  /** Q2 — when the jerseys were last redone. '' = not asked. */
  lastRedone: LastRedone;
  /** Q3 — how happy they are with the current set. Their opinion, NOT leadRating. */
  satisfaction: LeadRating | null;
  /** Q3 — "if you could change one thing…" */
  changeOneThing: string;
  /** Q4 — what they'd be looking at. */
  lookingAt: LookingAt;
  home: boolean;
  away: boolean;
  /** Q5 — first tap is the primary, further taps are "also mentioned". */
  primaryPriority: SupplierPriority | '';
  alsoPriorities: SupplierPriority[];
}

export interface CallLog {
  id: string;
  listId: string;
  contactId: string;
  outcome: CallOutcome;
  leadRating: LeadRating | null;
  notes: string;
  /** ScriptItem.id → chosen option or free text. */
  answers: Record<string, string>;
  /** ScriptItem.ids of reminders ticked. */
  checklist: string[];
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  callerName: string;
  followUp: FollowUp;
  /** Captured on send_info / interested. */
  email: string;
  /** not_interested reason. */
  reason: string;
  referral: Referral;
  /** bad_number replacement. */
  newPhone: string;
  /** The session this call was made in; null for calls logged outside one. */
  sessionId: string | null;
  jerseyManager: JerseyManagerAnswer;
  /** The five discovery questions, typed — so lists can be queried later. */
  discovery: Discovery;
  createdAt: string;
  updatedAt: string;
}
