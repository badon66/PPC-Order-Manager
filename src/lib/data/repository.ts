import type {
  AppUser, ChangeLogEntry, ClientLinkSections, ClientRosterSubmission, Order, OrderAsset,
  RosterEntry,
} from '@/lib/types';

/**
 * The whole data layer sits behind this interface.
 *
 * Right now it's backed by a JSON file on disk (see ./json-store.ts) so the app
 * runs with no database and no accounts. Swapping to Supabase means writing one
 * more implementation of this interface and changing the export in ./index.ts —
 * no page or component touches storage directly.
 *
 * Note the shape deliberately mirrors what the Supabase version will do:
 * everything is async, everything takes an actor for the change log, and
 * public reads are separate methods that return redacted data.
 */

export interface Actor {
  email: string;
  name: string;
}

export interface OrderListFilters {
  search?: string;
  status?: string | 'all';
  includeCompleted?: boolean;
}

/** An order plus the related rows a page normally needs alongside it. */
export interface OrderBundle {
  order: Order;
  roster: RosterEntry[];
  assets: OrderAsset[];
  submissions: ClientRosterSubmission[];
}

/**
 * What a customer sees on their share link.
 *
 * Contact and shipping ARE included, on purpose: the customer needs to check
 * their own name, phone, and delivery address are right before the order ships.
 * Catching a wrong address here is worth far more than hiding it.
 *
 * Consequence to keep in mind: the share link is public to anyone holding it.
 * The token is long and random so it can't be guessed, but a forwarded link
 * carries the address with it.
 *
 * Still deliberately excluded: internal notes, the change history, the font
 * file, and anything else that isn't the customer's own information.
 */
export interface PublicOrderView {
  /**
   * The row id.
   *
   * Only ever read on the server — the approval action needs something to
   * write against. It must not be rendered: the whole point of the share token
   * is that a leaked link isn't also a database key.
   */
  orderId: string;
  teamName: string;
  invoiceNumber: string;
  status: Order['status'];
  datePaid: Order['datePaid'];
  estimatedFinishDate: Order['estimatedFinishDate'];
  trackingCode: string;
  googleDriveLink: string;
  orderMode: Order['orderMode'];
  sets: Order['sets'];
  jerseyType: Order['jerseyType'];
  sockType: Order['sockType'];
  pantShellType: Order['pantShellType'];
  numberDetails: string;
  /**
   * Must stay in step with ADDON_TOGGLES — the share page maps over that list,
   * so a key missing here silently renders as "No" to the customer.
   */
  addons: Pick<
    Order,
    | 'dimpledShoulders' | 'reinforcedElbows' | 'underarmVents' | 'frontCrest'
    | 'armNumbers' | 'printedSizingTag' | 'ppcBackBranding' | 'stopSignPatch'
    | 'rubberizedPpcCrest' | 'stitchedSublimatedLogos' | 'twillBorderNumbers'
    | 'pantLogo' | 'pantNumber' | 'lacesStyle' | 'shoulderCut' | 'nameStyle'
    | 'hasCaptainPatches' | 'hasShoulderLogos'
  >;
  assets: OrderAsset[];
  roster: RosterEntry[];
  /** Numbers and sizes for the spare jerseys. */
  extraJerseyDetails: Order['extraJerseyDetails'];
  /** Whether to render the sign-off block on the customer's page. */
  requestApproval: boolean;
  approvedBy: string;
  approvedDate: Order['approvedDate'];
  approvalRecord: Order['approvalRecord'];
  specialNotes: string;

  /** Shown so the customer can confirm it's correct before anything ships. */
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    street: string;
    secondary: string;
    city: string;
    province: string;
    postal: string;
  };
}

export interface Repository {
  /* Orders ------------------------------------------------------------- */
  listOrders(filters?: OrderListFilters): Promise<Order[]>;
  getOrder(id: string): Promise<OrderBundle | null>;
  createOrder(patch: Partial<Order>, actor: Actor): Promise<Order>;
  updateOrder(id: string, patch: Partial<Order>, actor: Actor): Promise<Order>;
  softDeleteOrder(id: string, actor: Actor): Promise<void>;
  restoreOrder(id: string, actor: Actor): Promise<void>;

  /* Roster ------------------------------------------------------------- */
  replaceRoster(orderId: string, entries: RosterEntry[], actor: Actor): Promise<RosterEntry[]>;

  /* Assets ------------------------------------------------------------- */
  addAsset(asset: Omit<OrderAsset, 'id'>, actor: Actor): Promise<OrderAsset>;
  removeAsset(assetId: string, actor: Actor): Promise<void>;

  /* Public (token-addressed, redacted) --------------------------------- */
  getByShareToken(token: string): Promise<PublicOrderView | null>;
  getByRosterToken(token: string): Promise<{
    orderId: string;
    teamName: string;
    /** False = the link is switched off; the page tells the customer so. */
    enabled: boolean;
    status: Order['status'];
    /**
     * True once the order reached production. The form renders read-only and
     * the write is refused — a customer cannot change a jersey being sewn.
     */
    locked: boolean;
    sections: ClientLinkSections;
    orderMode: Order['orderMode'];
    /** Whether the order actually includes socks / pant shells. */
    includesSocks: boolean;
    includesPantShells: boolean;
    /**
     * Players on the team — how many roster slots the form opens with.
     * Not the jersey count: home/away doubles jerseys, not people.
     */
    jerseyCount: number;
    /** Spares, which are numbered separately from the roster. */
    extraJerseys: number;
    extraJerseyDetails: Order['extraJerseyDetails'];
    /** Sign-off state — the form carries the same approval block. */
    requestApproval: boolean;
    approvedBy: string;
    approvedDate: Order['approvedDate'];
    approvalRecord: Order['approvalRecord'];
    shareToken: string;
    /** What's already on the roster, so the customer can see what you have. */
    existingRosterCount: number;
  } | null>;
  /**
   * Record a client submission. `revision` and `changes` are worked out by the
   * store by diffing against that customer's previous submission — the caller
   * doesn't supply them.
   */
  submitClientRoster(
    token: string,
    submission: Omit<
      ClientRosterSubmission,
      'id' | 'orderId' | 'submittedAt' | 'acceptedAt' | 'revision' | 'changes'
    >,
  ): Promise<void>;
  /** The customer's own most recent submission, for pre-filling their form. */
  getLatestSubmissionByRosterToken(token: string): Promise<ClientRosterSubmission | null>;
  acceptSubmission(submissionId: string, actor: Actor): Promise<void>;

  /* History ------------------------------------------------------------ */
  getHistory(orderId: string): Promise<ChangeLogEntry[]>;

  /* Users -------------------------------------------------------------- */
  listUsers(): Promise<AppUser[]>;
}
