import type { Database } from './json-store';
import type { Order, RosterEntry, SetQuantities } from '@/lib/types';
import { blankOrder, newId, newToken, setsForMode } from '@/lib/order-utils';

/**
 * Sample data only — invented teams and contacts, nothing from the live Base44
 * app. Delete data/db.json to regenerate, or clear this out before real use.
 */

function order(patch: Partial<Order>): Order {
  return { ...blankOrder(), ...patch };
}

/** Fills in the extras fields so seed literals stay readable. */
function set(
  label: string,
  playerJerseys: number,
  goalieJerseys: number,
  sockPairs: number,
  pantShells: number,
  extra: Partial<Pick<SetQuantities, 'extraJerseys' | 'extraSockPairs' | 'extraPantShells' | 'extrasNotes' | 'notes'>> = {},
): SetQuantities {
  return {
    label, playerJerseys, goalieJerseys, sockPairs, pantShells,
    extraJerseys: extra.extraJerseys ?? 0,
    extraSockPairs: extra.extraSockPairs ?? 0,
    extraPantShells: extra.extraPantShells ?? 0,
    extrasNotes: extra.extrasNotes ?? '',
    notes: extra.notes ?? '',
  };
}

function players(
  orderId: string,
  rows: Array<[name: string, num: string, size: string, goalie?: boolean, sockOnly?: boolean]>,
): RosterEntry[] {
  return rows.map(([name, num, size, goalie = false, sockOnly = false], i) => ({
    id: newId(),
    orderId,
    playerNameAsPrinted: name,
    number: num,
    isGoalie: goalie,
    captaincy: '',
    sockOnly,
    jerseySize: sockOnly ? '' : size,
    sockSize: 'Senior',
    pantShellSize: '',
    jerseysPerPlayer: sockOnly ? 0 : 2,
    socksPerPlayer: 1,
    shellsPerPlayer: 0,
    homeJersey: sockOnly ? 0 : 1,
    awayJersey: sockOnly ? 0 : 1,
    homeSocks: 1,
    awaySocks: 0,
    armNumbers: '',
    shoulderLogo: '',
    pantLogo: '',
    pantNumber: '',
    notes: '',
    sortOrder: i,
  }));
}

export function seedDatabase(): Database {
  const o1 = order({
    id: newId(),
    teamName: 'Riverbend Rockets',
    invoiceNumber: 'PPC1801',
    datePaid: '2026-08-13',
    status: 'in_production',
    estimatedFinishDate: '2026-09-08',
    orderMode: 'home_away_set',
    sets: [
      set('Home Set', 16, 1, 17, 0, { extraJerseys: 2, extrasNotes: '2 spare home jerseys — XL' }),
      set('Away Set', 16, 1, 0, 0),
    ],
    jerseyType: 'embroidered',
    sockType: 'embroidered',
    numberDetails: 'Purple embroidery outline matching the shoulder stripes.',
    dimpledShoulders: true,
    reinforcedElbows: true,
    underarmVents: true,
    frontCrest: true,
    armNumbers: true,
    printedSizingTag: true,
    ppcBackBranding: true,
    lacesStyle: 'hanging',
    shoulderCut: 'rounded',
    nameStyle: 'name_bars',
    contactFirstName: 'Dana',
    contactLastName: 'Whitfield',
    contactEmail: 'dana.whitfield@example.com',
    contactPhone: '403-555-0142',
    shippingStreet: '112 Rideau Ave',
    shippingCity: 'Blairmore',
    shippingProvince: 'Alberta',
    shippingPostal: 'T0K 0E0',
    approvedBy: 'Dana Whitfield',
    approvedDate: '2026-08-13',
    collarReferenceNotes: 'Hanging laces, "FEAR THE HERD" on the collar.',
    createdAt: '2026-08-10T16:00:00.000Z',
    updatedAt: '2026-08-18T14:20:00.000Z',
  });

  const o2 = order({
    id: newId(),
    teamName: 'Ennismore Eagles',
    invoiceNumber: 'PPC1803',
    datePaid: '2026-08-05',
    status: 'in_production',
    estimatedFinishDate: '2026-09-05',
    orderMode: 'single_set',
    sets: setsForMode('single_set').map((s) => ({
      ...s, playerJerseys: 17, goalieJerseys: 1, sockPairs: 18, pantShells: 0,
    })),
    jerseyType: 'sublimated',
    sockType: 'sublimated',
    frontCrest: true,
    printedSizingTag: true,
    lacesStyle: 'straight',
    contactFirstName: 'Marc',
    contactLastName: 'Belanger',
    contactEmail: 'marc.belanger@example.com',
    contactPhone: '705-555-0188',
    shippingCity: 'Ennismore',
    shippingProvince: 'Ontario',
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-17T09:10:00.000Z',
  });

  const o3 = order({
    id: newId(),
    teamName: 'Northgate Fire Rescue',
    invoiceNumber: 'PPC1806',
    status: 'waiting_for_payment',
    estimatedFinishDate: '2026-08-21',
    orderMode: 'single_set',
    sets: setsForMode('single_set').map((s) => ({
      ...s, playerJerseys: 20, goalieJerseys: 2, sockPairs: 22, pantShells: 0,
    })),
    jerseyType: 'sublimated',
    hasCaptainPatches: true,
    captainPatchStyle: 'standard_matching',
    captainCQuantity: 1,
    captainAQuantity: 2,
    requestClientDetails: true,
    clientLinkSections: { logos: true, inspiration: true, roster: true, personalDetails: true },
    contactFirstName: 'Sean',
    contactLastName: 'Doyle',
    contactEmail: 'sean.doyle@example.com',
    createdAt: '2026-07-28T18:30:00.000Z',
    updatedAt: '2026-08-17T20:05:00.000Z',
  });

  const o4 = order({
    id: newId(),
    teamName: 'Rodger That HVAC',
    status: 'draft',
    orderMode: 'single_set',
    createdAt: '2026-08-11T11:00:00.000Z',
    updatedAt: '2026-08-11T11:00:00.000Z',
  });

  const o5 = order({
    id: newId(),
    teamName: 'Cedar Valley Spring Camp',
    invoiceNumber: 'PPC1795',
    datePaid: '2026-06-02',
    status: 'shipped',
    estimatedFinishDate: '2026-07-05',
    trackingCode: 'CP2049183771CA',
    orderMode: 'multiple_sets',
    numberOfSets: 3,
    sets: [
      set('Set 1', 12, 1, 13, 0, { notes: 'U11 group' }),
      set('Set 2', 12, 1, 13, 0, { notes: 'U13 group' }),
      set('Set 3', 14, 1, 15, 0, { notes: 'U15 group', extraSockPairs: 3, extrasNotes: '3 spare pairs for camp staff' }),
    ],
    jerseyType: 'reversible_sublimated',
    sockType: 'sublimated',
    contactFirstName: 'Priya',
    contactLastName: 'Raman',
    contactEmail: 'priya.raman@example.com',
    contactPhone: '250-555-0117',
    shippingCity: 'Kamloops',
    shippingProvince: 'British Columbia',
    approvedBy: 'Priya Raman',
    approvedDate: '2026-06-02',
    createdAt: '2026-05-20T15:00:00.000Z',
    updatedAt: '2026-07-06T13:45:00.000Z',
  });

  const roster = [
    ...players(o1.id, [
      ['Hansen', '7', 'L'], ['Tiberius', '55', 'L'], ['MacKay', '5', 'L'],
      ['Gaffney', '1', 'XL', true], ['Portman', '77', 'XL'], ['Larson', '32', 'XL'],
      ['Cole', '68', 'XL'], ['Jackson', '79', 'XL'], ['Moreau', '42', 'XL'],
      ['Germaine', '97', 'XL'], ['Hall', '59', 'XL'], ['Averman', '64', 'XXL'],
      ['Banks', '81', 'XXL'], ['Reed', '29', 'XXL'], ['Conway', '73', 'XXL'],
      ['Bombay', '11', 'XXL'], ['Lewis', '8', 'L'],
      ['', '', '', false, true], ['', '', '', false, true],
    ]),
    ...players(o2.id, [
      ['Belanger', '9', 'L'], ['Fournier', '21', 'M'], ['Tremblay', '4', 'XL'],
      ['Roy', '30', 'L', true], ['Gagnon', '17', 'L'], ['Cote', '88', 'XL'],
    ]),
  ];

  return {
    orders: [o1, o2, o3, o4, o5],
    roster,
    assets: [],
    submissions: [],
    history: [],
    users: [
      {
        id: newId(),
        email: 'keenanhuber99@gmail.com',
        name: 'Keenan Huber',
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

export { newToken };
