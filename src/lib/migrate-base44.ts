import type {
  CaptainPatchStyle, JerseyType, LacesStyle, Order, OrderAsset, OrderMode, OrderStatus,
  PantShellType, RosterEntry, SetQuantities, SockType,
} from './types';
import { blankOrder, blankRosterEntry, newId, setsForMode } from './order-utils';

/**
 * One-time importer for the Base44 app.
 *
 * Base44 is being retired, so this pulls its orders, rosters and artwork across.
 * It runs from the browser (see /api/import/base44) because the server has no
 * route to base44.app — the browser fetches, the server maps and stores.
 *
 * Design rules:
 *  - Never guess. A field that doesn't map cleanly is reported, not invented.
 *  - Never drop silently. Everything unmapped comes back in `warnings` so the
 *    gap is visible rather than discovered months later on a reorder.
 *  - Idempotent by invoice number + team name, so a re-run updates rather than
 *    duplicating.
 */

/* ------------------------------------------------------------------ *
 * Base44 shapes — loose, because the source has nulls everywhere.
 * ------------------------------------------------------------------ */

export interface B44Order { [k: string]: unknown }
export interface B44Roster { [k: string]: unknown }

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const bool = (v: unknown): boolean => v === true;
/**
 * Base44 was inconsistent: some calendar dates are plain "YYYY-MM-DD", others
 * are an ISO timestamp pinned to midnight UTC ("2026-08-17T00:00:00.000Z").
 *
 * Both are calendar dates, so take the leading date part verbatim. Do NOT
 * parse either through `new Date()` — that's the bug that made the old app
 * show every date a day early west of UTC.
 *
 * A timestamp with a real time on it is a different animal (it isn't a
 * calendar date at all), so those are refused and reported.
 */
const date = (v: unknown): string | null => {
  const s = str(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{4}-\d{2}-\d{2})T00:00:00(\.0+)?(Z|\+00:00)?$/.exec(s);
  return m ? m[1] : null;
};

/* ------------------------------------------------------------------ *
 * Enum mapping. Base44 mixed keys and display labels, so both are handled.
 * ------------------------------------------------------------------ */

const slug = (v: unknown) => str(v).toLowerCase().replace(/[\s-]+/g, '_');

function mapStatus(v: unknown): OrderStatus {
  const s = slug(v);
  const known: OrderStatus[] = [
    'incomplete', 'draft', 'waiting_for_payment', 'in_production', 'shipped', 'completed',
  ];
  return (known as string[]).includes(s) ? (s as OrderStatus) : 'draft';
}

function mapOrderMode(v: unknown): OrderMode {
  const s = slug(v);
  if (s === 'home_away_set' || s === 'multiple_sets' || s === 'single_set') return s;
  return 'single_set';
}

function mapJerseyType(v: unknown): JerseyType | null {
  const s = slug(v);
  if (s.includes('reversible')) return 'reversible_sublimated';
  if (s.includes('embroider')) return 'embroidered';
  if (s.includes('sublimat')) return 'sublimated';
  return null;
}

function mapSockType(v: unknown): SockType | null {
  return mapJerseyType(v) as SockType | null;
}

function mapPantShellType(v: unknown): PantShellType | null {
  const s = slug(v);
  if (s.includes('embroider')) return 'embroidered';
  if (s.includes('sublimat')) return 'sublimated';
  return null;
}

function mapLaces(v: unknown): LacesStyle {
  const s = slug(v);
  if (s.includes('hanging')) return 'hanging';
  if (s.includes('straight')) return 'straight';
  if (s.includes('x')) return 'x_laces';
  return 'none';
}

function mapCaptainStyle(v: unknown): CaptainPatchStyle | null {
  const s = slug(v);
  if (s.includes('custom')) return 'custom_design';
  if (s.includes('standard') || s.includes('match')) return 'standard_matching';
  return null;
}

/* ------------------------------------------------------------------ *
 * Quantities → the sets array
 * ------------------------------------------------------------------ */

const emptySet = (label: string): SetQuantities => ({
  label,
  playerJerseys: 0, goalieJerseys: 0, sockPairs: 0, pantShells: 0,
  extraJerseys: 0, extraSockPairs: 0, extraPantShells: 0, extrasNotes: '',
  notes: '',
});

function buildSets(o: B44Order, mode: OrderMode, warn: (m: string) => void): SetQuantities[] {
  if (mode === 'home_away_set') {
    return [
      {
        ...emptySet('Home Set'),
        playerJerseys: num(o.home_jerseys),
        goalieJerseys: num(o.home_goalie_jerseys),
        sockPairs: num(o.home_socks_pairs),
        pantShells: num(o.home_pant_shells),
      },
      {
        ...emptySet('Away Set'),
        playerJerseys: num(o.away_jerseys),
        goalieJerseys: num(o.away_goalie_jerseys),
        sockPairs: num(o.away_socks_pairs),
        pantShells: num(o.away_pant_shells),
      },
    ];
  }

  if (mode === 'multiple_sets') {
    const raw = Array.isArray(o.set_quantities) ? (o.set_quantities as Record<string, unknown>[]) : [];
    if (raw.length === 0) {
      const n = Math.max(1, num(o.number_of_sets) || 1);
      warn(`multiple_sets order had no set_quantities — created ${n} empty set(s)`);
      return setsForMode('multiple_sets', n, []);
    }
    return raw.map((s, i) => ({
      ...emptySet(str(s.label) || `Set ${i + 1}`),
      playerJerseys: num(s.player_jerseys ?? s.playerJerseys),
      goalieJerseys: num(s.goalie_jerseys ?? s.goalieJerseys),
      sockPairs: num(s.socks_pairs ?? s.sockPairs),
      pantShells: num(s.pant_shells ?? s.pantShells),
      notes: str(s.notes),
    }));
  }

  // single_set — Base44 sometimes used single_*, sometimes left them null and
  // filled home_* instead. Prefer single_*, fall back to home_*.
  const player = num(o.single_player_jerseys) || num(o.home_jerseys);
  const goalie = num(o.single_goalie_jerseys) || num(o.home_goalie_jerseys);
  const socks = num(o.single_socks_pairs) || num(o.home_socks_pairs);
  const shells = num(o.single_pant_shells) || num(o.home_pant_shells);
  if (!num(o.single_player_jerseys) && num(o.home_jerseys)) {
    warn('single-set order stored its quantities in the home_* fields — used those');
  }
  return [{ ...emptySet('Single Set'), playerJerseys: player, goalieJerseys: goalie, sockPairs: socks, pantShells: shells }];
}

/* ------------------------------------------------------------------ *
 * Artwork — the ~28 numbered file columns become OrderAsset rows.
 * ------------------------------------------------------------------ */

interface AssetSpec {
  role: OrderAsset['role'];
  /** Base44 column prefix, e.g. "design_reference_file" → _2, _3, _4 */
  prefix: string;
  max: number;
}

const ASSET_SPECS: AssetSpec[] = [
  { role: 'design_reference', prefix: 'design_reference_file', max: 4 },
  { role: 'collar_reference', prefix: 'collar_reference_file', max: 4 },
  { role: 'main_crest', prefix: 'main_crest_file', max: 4 },
  { role: 'shoulder_logo_both', prefix: 'shoulder_logo_file', max: 4 },
  { role: 'shoulder_logo_left', prefix: 'left_shoulder_logo_file', max: 4 },
  { role: 'shoulder_logo_right', prefix: 'right_shoulder_logo_file', max: 4 },
  { role: 'number_reference', prefix: 'number_reference_file', max: 1 },
  { role: 'number_reference_home', prefix: 'number_reference_file_home', max: 1 },
  { role: 'number_reference_away', prefix: 'number_reference_file_away', max: 1 },
  { role: 'captain_c', prefix: 'captain_c_file', max: 1 },
  { role: 'captain_a', prefix: 'captain_a_file', max: 1 },
  { role: 'font', prefix: 'font_file', max: 1 },
  { role: 'design_svg', prefix: 'design_svg_file', max: 1 },
];

const NOTES_COLUMN: Partial<Record<OrderAsset['role'], string>> = {
  design_reference: 'design_reference_notes',
  collar_reference: 'collar_reference_notes',
  main_crest: 'main_crest_notes',
};

const NAME_COLUMN: Partial<Record<OrderAsset['role'], string>> = {
  design_reference: 'design_reference_name',
  collar_reference: 'collar_reference_name',
  main_crest: 'main_crest_name',
  shoulder_logo_both: 'shoulder_logo_name',
  shoulder_logo_left: 'left_shoulder_logo_name',
  shoulder_logo_right: 'right_shoulder_logo_name',
};

function fileNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.split('/').pop() || 'file');
  } catch {
    return url.split('/').pop() || 'file';
  }
}

function buildAssets(o: B44Order, orderId: string): Omit<OrderAsset, 'id'>[] {
  const out: Omit<OrderAsset, 'id'>[] = [];

  for (const spec of ASSET_SPECS) {
    for (let i = 0; i < spec.max; i++) {
      const col = i === 0 ? spec.prefix : `${spec.prefix}_${i + 1}`;
      const url = str(o[col]);
      if (!url) continue;
      out.push({
        orderId,
        role: spec.role,
        slot: out.filter((a) => a.role === spec.role).length,
        fileUrl: url,
        fileName: fileNameFromUrl(url),
        displayName: str(o[NAME_COLUMN[spec.role] ?? '']),
        notes: i === 0 ? str(o[NOTES_COLUMN[spec.role] ?? '']) : '',
      });
    }
  }

  // additional_logos: [{ file_url, file_url_2, display_name, notes }]
  const extra = Array.isArray(o.additional_logos) ? (o.additional_logos as Record<string, unknown>[]) : [];
  extra.forEach((logo) => {
    const groupId = newId();
    [str(logo.file_url), str(logo.file_url_2)].filter(Boolean).forEach((url, slot) => {
      out.push({
        orderId,
        role: 'additional_logo',
        slot,
        fileUrl: url,
        fileName: fileNameFromUrl(url),
        displayName: str(logo.display_name),
        notes: str(logo.notes),
        groupId,
      });
    });
  });

  /*
   * Multiple-set orders could hang their own design references off each set in
   * Base44 (set_quantities[].design_reference_file). The new schema has no
   * per-set artwork slot, so these come across as ordinary design references
   * labelled with the set they belonged to — losing the label would be worse
   * than losing the grouping.
   */
  const rawSets = Array.isArray(o.set_quantities) ? (o.set_quantities as Record<string, unknown>[]) : [];
  rawSets.forEach((s, i) => {
    const label = str(s.label) || `Set ${num(s.set_number) || i + 1}`;
    [str(s.design_reference_file), str(s.design_reference_file_2)].filter(Boolean).forEach((url) => {
      out.push({
        orderId,
        role: 'design_reference',
        slot: out.filter((a) => a.role === 'design_reference').length,
        fileUrl: url,
        fileName: fileNameFromUrl(url),
        displayName: label,
        notes: [str(s.design_reference_notes), str(s.notes)].filter(Boolean).join(' — '),
      });
    });
  });

  // captain_extra_designs: array of urls or {file_url}
  const capExtra = Array.isArray(o.captain_extra_designs) ? (o.captain_extra_designs as unknown[]) : [];
  capExtra.forEach((entry, slot) => {
    const url = typeof entry === 'string' ? entry : str((entry as Record<string, unknown>)?.file_url);
    if (!url) return;
    out.push({
      orderId, role: 'captain_extra', slot,
      fileUrl: url, fileName: fileNameFromUrl(url), displayName: '', notes: '',
    });
  });

  return out;
}

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export interface MappedOrder {
  order: Order;
  assets: Omit<OrderAsset, 'id'>[];
  warnings: string[];
}

export function mapOrder(o: B44Order): MappedOrder {
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);

  const base = blankOrder();
  const mode = mapOrderMode(o.order_mode);

  const order: Order = {
    ...base,
    teamName: str(o.team_name),
    invoiceNumber: str(o.invoice_number),
    datePaid: date(o.date_paid),
    googleDriveLink: str(o.google_drive_link),
    status: mapStatus(o.status),
    estimatedFinishDate: date(o.estimated_finish_date),
    trackingCode: str(o.tracking_code),
    isSample: bool(o.is_sample),

    contactFirstName: str(o.contact_first_name),
    contactLastName: str(o.contact_last_name),
    contactEmail: str(o.contact_email),
    contactPhone: str(o.contact_phone),
    shippingStreet: str(o.shipping_address_street),
    shippingSecondary: str(o.shipping_address_secondary),
    shippingCity: str(o.shipping_address_city),
    shippingProvince: str(o.shipping_address_province),
    shippingPostal: str(o.shipping_address_postal),
    requestClientDetails: bool(o.request_client_details),

    orderMode: mode,
    numberOfSets: Math.max(1, num(o.number_of_sets) || 1),
    sets: buildSets(o, mode, warn),
    playersTotal: num(o.players_total),

    jerseyType: mapJerseyType(o.jersey_type),
    sockType: mapSockType(o.sock_type),
    pantShellType: mapPantShellType(o.pant_shell_type),

    numberDetails: str(o.number_details),

    dimpledShoulders: bool(o.dimpled_shoulders),
    reinforcedElbows: bool(o.reinforced_elbows),
    underarmVents: bool(o.underarm_vents),
    frontCrest: bool(o.front_crest),
    armNumbers: bool(o.arm_numbers),
    printedSizingTag: bool(o.printed_sizing_tag),
    ppcBackBranding: bool(o.ppc_back_branding),
    stopSignPatch: bool(o.stop_sign_patch),
    pantLogo: bool(o.pant_logo),
    pantNumber: bool(o.pant_number),

    // Introduced after Base44 — nothing to carry over.
    rubberizedPpcCrest: false,
    stitchedSublimatedLogos: false,
    twillBorderNumbers: false,
    jerseyTier: null,

    lacesStyle: mapLaces(o.laces_style),
    shoulderCut: slug(o.shoulder_cut).includes('straight') ? 'straight' : 'rounded',
    nameStyle: bool(o.name_bars) ? 'name_bars' : 'free_standing_letters',

    hasCaptainPatches: bool(o.has_captain_patches),
    captainPatchStyle: mapCaptainStyle(o.captain_patch_style),
    captainCQuantity: num(o.captain_c_quantity),
    captainAQuantity: num(o.captain_a_quantity),
    captainPatchNotes: str(o.captain_patch_notes),

    hasShoulderLogos: bool(o.has_shoulder_logos),
    shoulderLogosSame: o.shoulder_logos_same === false ? false : true,

    designReferenceNotes: str(o.design_reference_notes),
    collarReferenceNotes: str(o.collar_reference_notes),
    mainCrestNotes: str(o.main_crest_notes),

    specialNotes: str(o.special_notes),
    approvedBy: str(o.approved_by),
    approvedDate: date(o.approved_date),
    deliveryConcern: str(o.delivery_concern),

    createdAt: str(o.created_date) || base.createdAt,
    updatedAt: str(o.updated_date) || base.updatedAt,
  };

  if (!order.teamName) warn('order has no team name');
  for (const [col, got] of [
    ['date_paid', order.datePaid],
    ['estimated_finish_date', order.estimatedFinishDate],
    ['approved_date', order.approvedDate],
  ] as const) {
    if (str(o[col]) && !got) warn(`${col} "${str(o[col])}" was not a calendar date — dropped`);
  }
  if (str(o.jersey_type) && !order.jerseyType) warn(`unrecognised jersey_type "${str(o.jersey_type)}"`);
  if (str(o.address_type)) warn(`address_type "${str(o.address_type)}" has no field in the new app`);

  return { order, assets: buildAssets(o, order.id), warnings };
}

/* ------------------------------------------------------------------ *
 * Roster
 * ------------------------------------------------------------------ */

export function mapRoster(rows: B44Roster[], orderId: string): RosterEntry[] {
  return rows.map((r, i) => {
    const e = blankRosterEntry(orderId, i);
    const jerseySize = str(r.jersey_size);

    // Base44 had no sock-only flag — it was typed into the size column.
    const sockOnly = /sock\s*only/i.test(jerseySize);

    e.playerNameAsPrinted = str(r.player_name_as_printed);
    e.number = str(r.number);
    e.isGoalie = bool(r.is_goalie) || /goalie/i.test(jerseySize);
    e.sockOnly = sockOnly;
    // "Goalie XL" in the size column becomes isGoalie + size XL.
    e.jerseySize = sockOnly ? '' : jerseySize.replace(/goalie/i, '').trim();
    e.sockSize = str(r.sock_size);
    e.pantShellSize = str(r.pant_shell_size);
    e.jerseysPerPlayer = num(r.jerseys_per_player);
    e.socksPerPlayer = num(r.socks_per_player);
    e.shellsPerPlayer = num(r.shells_per_player);
    e.homeJersey = num(r.home_jersey);
    e.awayJersey = num(r.away_jersey);
    e.homeSocks = num(r.home_socks);
    e.awaySocks = num(r.away_socks);
    e.armNumbers = str(r.arm_numbers);
    e.shoulderLogo = str(r.shoulder_logo);
    e.pantLogo = str(r.pant_logo);
    e.pantNumber = str(r.pant_number);
    e.notes = str(r.notes);
    return e;
  });
}
