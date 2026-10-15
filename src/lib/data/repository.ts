import type {
  AppSettings, AppUser, CallList, CallLog, CallSession, ChangeLogEntry, ClientLinkSections, ClientRosterSubmission,
  Contact, CustomerEmailRecord, KeeperJersey, Order, OrderAsset, RosterEntry, RosterVersion, RouteVariant,
} from '@/lib/types';
import type { RosterVersionSummary } from '@/lib/roster-versions';
import type { TimelineStep } from './timeline';

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
  /** The roster IN USE — what every sheet and total reads. Other rosters are in `rosters`. */
  roster: RosterEntry[];
  /** Every roster on the order (Roster 1, 2…), with row counts and which is in use. */
  rosters: RosterVersionSummary[];
  assets: OrderAsset[];
  submissions: ClientRosterSubmission[];
}

/** A call list with everything the sales pages need. Contacts in sheet order, logs and sessions newest first. */
export interface CallListBundle {
  list: CallList;
  contacts: Contact[];
  logs: CallLog[];
  sessions: CallSession[];
}

/** A flag change on another contact of the same team, written alongside a call log. */
export interface ContactPatch {
  id: string;
  patch: Partial<Contact>;
}

/**
 * The build sheet: what is being made, for whom, and the instructions that go
 * with it. The part of an order the customer and the factory both read.
 *
 * One definition, built once (`buildSheetOf` in logic.ts) and carried by both
 * `PublicOrderView` and `FactoryOrderView`, so a build detail added later
 * reaches both sheets or neither — never the team but not the people sewing
 * it. Nothing in here is money, and nothing in here is a keeper.
 *
 * Contact and shipping ARE included, on purpose: the customer needs to check
 * their own name, phone, and delivery address are right before the order
 * ships, and the factory ships straight to that address.
 */
export interface BuildSheet {
  teamName: string;
  invoiceNumber: string;
  status: Order['status'];
  estimatedFinishDate: Order['estimatedFinishDate'];
  /*
   * The production window. This sheet is the manufacturer's copy as well as
   * the team's, so the dates the job is scheduled against belong on it.
   */
  productionStartDate: Order['productionStartDate'];
  productionFinishDate: Order['productionFinishDate'];
  /** A hard date the team needs these by — a tournament, a season opener. */
  deliveryConcern: string;
  trackingCode: string;
  orderMode: Order['orderMode'];
  /** How many sets were ordered, as typed on the sheet. */
  numberOfSets: number;
  sets: Order['sets'];
  /** Premier / Pro / Elite — what they actually bought. */
  jerseyTier: Order['jerseyTier'];
  isSample: boolean;
  jerseyType: Order['jerseyType'];
  sockType: Order['sockType'];
  /** Multi-panel (pro cut) socks — a build detail the manufacturer needs. */
  multiPanelSocks: boolean;
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
    | 'pantLogo' | 'pantNumber' | 'goaliePantReversedLogos' | 'lacesStyle' | 'shoulderCut' | 'stitchedShoulderTrim' | 'nameStyle'
    | 'hasCaptainPatches' | 'hasShoulderLogos'
  >;
  /*
   * Captain patches and shoulder logos in full, not just the on/off toggle.
   * `hasCaptainPatches: true` told the customer nothing about how many C's
   * and A's are being made or in which style, and told the manufacturer
   * even less — those are the details the job is actually built from.
   */
  captainPatchStyle: Order['captainPatchStyle'];
  captainCQuantity: number;
  captainAQuantity: number;
  shoulderLogosSame: boolean;
  roster: RosterEntry[];
  /** Numbers and sizes for the spare jerseys. */
  extraJerseyDetails: Order['extraJerseyDetails'];
  approvedBy: string;
  approvedDate: Order['approvedDate'];
  /** Changes to the Powerplay branding, shown with the branding toggles. */
  brandingNotes: string;
  specialNotes: string;
  /*
   * Production notes. These describe what to make, not what we think about the
   * customer, and the share sheet is what goes to the manufacturer as well as
   * to the team — so the instructions have to travel with it.
   */
  captainPatchNotes: string;
  designReferenceNotes: string;
  collarReferenceNotes: string;
  mainCrestNotes: string;

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

/**
 * What a customer sees on their share link.
 *
 * Consequence to keep in mind: the share link is public to anyone holding it.
 * The token is long and random so it can't be guessed, but a forwarded link
 * carries the address with it.
 *
 * Deliberately excluded: the change history, the font file, the factory-only
 * notes, the keeper jerseys, and anything else that isn't the customer's own
 * order. Notes ARE included — they are instructions about what to make, and
 * the customer is signing off on them.
 */
export interface PublicOrderView extends BuildSheet {
  /**
   * The row id.
   *
   * Only ever read on the server — the approval action needs something to
   * write against. It must not be rendered: the whole point of the share token
   * is that a leaked link isn't also a database key.
   */
  orderId: string;
  datePaid: Order['datePaid'];
  googleDriveLink: string;
  /** Every artwork file except the font — a licensed typeface isn't theirs. */
  assets: OrderAsset[];
  /** Whether to render the sign-off block on the customer's page. */
  requestApproval: boolean;
  approvalRecord: Order['approvalRecord'];

  /** Where the order sits, laid out step by step, for the customer's own page. */
  timeline: TimelineStep[];

  /*
   * Is the team's form still open, and which parts of it. Enough to remind
   * them on this page; NOT the form's link. The share sheet is forwarded to
   * the manufacturer and whoever else, and the form URL is built from the
   * roster token, which is the credential that writes the roster. A reminder
   * travels safely; the key doesn't.
   */
  clientFormOpen: boolean;
  clientFormSections: ClientLinkSections;
}

/**
 * What the factory sees on /factory/<token>, behind the factory code.
 *
 * The same build sheet as the customer's, plus the two things that are the
 * factory's business and not the team's: the factory-only notes and the keeper
 * jerseys Powerplay is having made for itself. The font IS included — the
 * factory prints the names. Never money, never a payment date, never the
 * customer's timeline or signature record: "the manufacturer never sees a
 * price" (CLAUDE.md), and tests/money/leak.test.ts checks this view too.
 */
export interface FactoryOrderView extends BuildSheet {
  /** Every artwork file, font included. */
  assets: OrderAsset[];
  factoryNotes: string;
  keeperJerseys: KeeperJersey[];
  sentToFactoryAt: Order['sentToFactoryAt'];
  /**
   * True once the roster can't change any more (the order reached production).
   * Before that the sheet says so: names and sizes may still move.
   */
  rosterLocked: boolean;
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
  /**
   * Replace the rows of the roster IN USE (other rosters are untouched).
   * `rosterId` is the roster the caller was editing: if a different roster has
   * been put in use since (another tab, an import), the save is refused rather
   * than writing one roster's rows into another.
   */
  replaceRoster(orderId: string, entries: RosterEntry[], actor: Actor, rosterId?: string): Promise<RosterEntry[]>;
  /** Add a roster (an import), put it in use, and return it. */
  createRoster(
    orderId: string,
    init: Omit<RosterVersion, 'id' | 'number' | 'createdAt'>,
    entries: RosterEntry[],
    actor: Actor,
  ): Promise<RosterVersion>;
  /** Put another of the order's rosters in use. */
  useRoster(orderId: string, rosterId: string, actor: Actor): Promise<void>;
  /** Delete a roster that isn't in use, rows and all. */
  deleteRoster(orderId: string, rosterId: string, actor: Actor): Promise<void>;
  /** One roster's rows, in use or not. Null when the order or roster doesn't exist. */
  getRosterRows(orderId: string, rosterId: string): Promise<RosterEntry[] | null>;
  /**
   * Count an AI reading of a team's roster file against the order's daily
   * allowance, and say whether it may go ahead. See planRosterRead.
   */
  noteRosterRead(rosterToken: string, now: string): Promise<{ allowed: boolean; orderId: string | null }>;

  /* Assets ------------------------------------------------------------- */
  addAsset(asset: Omit<OrderAsset, 'id'>, actor: Actor): Promise<OrderAsset>;
  removeAsset(assetId: string, actor: Actor): Promise<void>;

  /* Public (token-addressed, redacted) --------------------------------- */
  getByShareToken(token: string): Promise<PublicOrderView | null>;
  /** The factory's sheet. Addressed by its own token; the proxy has already checked the factory cookie. */
  getByFactoryToken(token: string): Promise<FactoryOrderView | null>;
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
    variant: RouteVariant | null;
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
    timeline: TimelineStep[];
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
  /** One update email went out: remember it on the order and in the history. */
  recordCustomerEmail(orderId: string, record: CustomerEmailRecord, actor: Actor): Promise<void>;

  /* Settings ----------------------------------------------------------- */
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings, actor: Actor): Promise<void>;

  /* Users -------------------------------------------------------------- */
  listUsers(): Promise<AppUser[]>;

  /* Sales — cold calling ------------------------------------------------ */
  listCallLists(): Promise<CallList[]>;
  getCallList(id: string): Promise<CallListBundle | null>;
  getContact(id: string): Promise<Contact | null>;
  latestCallLogFor(contactId: string): Promise<CallLog | null>;
  /** An empty named list. Contacts only ever arrive through applyImport. */
  createCallList(list: CallList, actor: Actor): Promise<CallList>;
  /** Rename, script, imports — the whole row is replaced. */
  updateCallList(list: CallList, actor: Actor): Promise<void>;
  /**
   * One upload: the list row (script + the new import record) first, then the
   * existing contacts whose blanks were filled, then the new contacts. A
   * failure part-way leaves the report saying more was added than exists —
   * visible on the list page, and the next upload of the same sheet repairs it
   * (matching rows merge, missing rows get added). The other order would add
   * contacts the report doesn't mention.
   */
  applyImport(list: CallList, newContacts: Contact[], updatedContacts: Contact[], actor: Actor): Promise<void>;
  /**
   * Log first, then the contact patch, then the other contacts' flag changes,
   * then the new contact (a referral or a newly named jersey manager), if any.
   * The rules that produce all of these are in ./sales-logic.ts; the store only
   * writes. A failure after the log leaves a contact that looks uncalled — you
   * might ring twice. The other order would lose the notes.
   */
  addCallLog(log: CallLog, contactPatch: Partial<Contact>, newContact: Contact | null, actor: Actor, extraPatches?: ContactPatch[]): Promise<void>;
  updateCallLog(log: CallLog, contactPatch: Partial<Contact>, actor: Actor): Promise<void>;
  updateContact(id: string, patch: Partial<Contact>, actor: Actor): Promise<Contact>;
  /** Logs first, then the contact — a failure part-way leaves a contact with no history, visible and deletable again. */
  deleteContact(id: string, actor: Actor): Promise<void>;
  softDeleteCallList(id: string, actor: Actor): Promise<void>;

  /* Sales — calling sessions. One small row each; logs carry the session id. */
  listCallSessions(listId: string): Promise<CallSession[]>;                       // newest first
  createCallSession(session: CallSession, actor: Actor): Promise<CallSession>;
  endCallSession(id: string, endedAt: string, actor: Actor): Promise<void>;
}
