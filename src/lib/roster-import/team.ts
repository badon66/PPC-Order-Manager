import type { SubmittedPlayer } from '@/lib/types';
import { buildImport, pickName, type ImportContext } from './build';
import { emptyDecisions, type ImportAnalysis, type ImportField, type NameFormat } from './types';

/**
 * The team's side of a roster import: their file, turned into the rows of
 * their own form for them to check before they send it.
 *
 * Same engine as Keenan's importer (`buildImport`), with one difference that
 * matters: a team doesn't settle questions on a preview screen, so nothing
 * uncertain is filled in at all. A size the table can't translate, a cell the
 * two AI readings disagreed on, a goalie with no goalie cut — each is left
 * blank and marked on the row, with what their file said, for them to fill in.
 * Only three things are asked up front, because without them nothing else can
 * be read: which column is which (when that isn't certain), which part of a
 * full name goes on the back, and whether plain S/M/L sizes are youth or adult.
 *
 * Pure and tested (tests/roster-import/team.test.ts).
 */

export interface TeamAnswers {
  columns: Record<number, ImportField>;
  nameFormat: NameFormat | null;
  bare: Record<number, 'youth' | 'senior'>;
}

export const noAnswers = (): TeamAnswers => ({ columns: {}, nameFormat: null, bare: {} });

export type TeamQuestion =
  | { kind: 'column'; col: number; header: string; sample: string[]; options: ImportField[] }
  | { kind: 'nameFormat'; sample: string; examples: Record<NameFormat, string> }
  | { kind: 'bare'; col: number; header: string; sample: string[] };

export type FlagField = 'playerNameAsPrinted' | 'number' | 'isGoalie' | 'captaincy' | 'jerseySize' | 'sockSize' | 'pantShellSize';

export interface RowFlag {
  field: FlagField;
  message: string;
}

export interface TeamFill {
  questions: TeamQuestion[];
  players: SubmittedPlayer[];
  /** One list per player, same order. */
  flags: RowFlag[][];
  /** Rows of their file that weren't added, as text: a coach line, a total. */
  leftOut: string[];
  /** Anything else written on the file. Shown to them, never acted on. */
  otherText: string[];
}

/** Field → the input on the team's row it lands in. */
const TARGET: Partial<Record<ImportField, FlagField>> = {
  name: 'playerNameAsPrinted', fullName: 'playerNameAsPrinted', firstName: 'playerNameAsPrinted',
  lastName: 'playerNameAsPrinted', nameAndNumber: 'playerNameAsPrinted', number: 'number',
  goalie: 'isGoalie', position: 'isGoalie', letter: 'captaincy',
  jerseySize: 'jerseySize', sockSize: 'sockSize', pantSize: 'pantShellSize',
};

/** Row-issue id prefixes from build.ts → the input they're about. */
const ISSUE_TARGET: Array<[RegExp, FlagField]> = [
  [/^(nn|namepart|blank):/, 'playerNameAsPrinted'],
  [/^(num|zero|edit-num):/, 'number'],
  [/^(goalie|pos|goalie-size):/, 'isGoalie'],
  [/^(letter|letter-mismatch):/, 'captaincy'],
  [/^goalie-pants:/, 'pantShellSize'],
];

const SINGLETON: ReadonlySet<ImportField> = new Set<ImportField>([
  'name', 'fullName', 'firstName', 'lastName', 'nameAndNumber', 'number', 'position', 'goalie', 'letter',
  'jerseySize', 'sockSize', 'pantSize',
]);

export function teamFill(a: ImportAnalysis, ctx: ImportContext, answers: TeamAnswers): TeamFill {
  // Every cell the readings disagreed on is left blank, never one reading picked.
  const disputes = Object.fromEntries(a.disputes.map((x) => [`${x.row}:${x.col}`, '']));
  const result = buildImport(a, { ...emptyDecisions(), ...answers, disputes }, ctx);

  /* -------- the questions that have to come first -------- */

  const taken = new Set(
    result.columns.filter((c) => c.status !== 'open' && c.status !== 'ignored' && SINGLETON.has(c.field)).map((c) => c.field),
  );
  const offered: ImportField[] = [
    'name', 'fullName', 'firstName', 'lastName', 'nameAndNumber', 'number', 'jerseySize',
    ...(ctx.includesSocks ? (['sockSize'] as const) : []),
    ...(ctx.includesPantShells ? (['pantSize'] as const) : []),
    'goalie', 'position', 'letter', 'notes', 'ignore',
  ];
  const questions: TeamQuestion[] = result.columns
    .filter((c) => c.status === 'open')
    .map((c) => ({
      kind: 'column' as const,
      col: c.index,
      header: c.header,
      sample: c.sample,
      options: offered.filter((f) => !SINGLETON.has(f) || !taken.has(f)),
    }));

  if (result.needs.nameFormat) {
    const sample = result.rows.find((x) => /\s|,/.test(x.name))?.name ?? '';
    questions.push({
      kind: 'nameFormat',
      sample,
      examples: {
        last: pickName(sample, 'last').value,
        full: pickName(sample, 'full').value,
        first: pickName(sample, 'first').value,
      },
    });
  }
  for (const col of result.needs.bare) {
    const c = result.columns[col];
    questions.push({ kind: 'bare', col, header: c?.header ?? '', sample: c?.sample ?? [] });
  }

  /* -------- the rows -------- */

  const players: SubmittedPlayer[] = result.rows.map((x) => ({
    playerNameAsPrinted: x.noName ? '' : x.name,
    number: x.number,
    isGoalie: x.isGoalie && !x.sockOnly,
    captaincy: x.sockOnly ? '' : x.captaincy,
    sockOnly: ctx.includesSocks ? x.sockOnly : false,
    jerseySize: x.sockOnly ? '' : x.jerseySize,
    sockSize: ctx.includesSocks ? x.sockSize : '',
    pantShellSize: ctx.includesPantShells ? x.pantShellSize : '',
    notes: x.notes,
  }));

  const flags: RowFlag[][] = result.rows.map(() => []);
  const at = new Map(result.rows.map((x, i) => [x.sourceRow, i]));
  const flag = (row: number, field: FlagField, message: string) => {
    const i = at.get(row);
    if (i === undefined) return;
    if (!flags[i].some((f) => f.field === field)) flags[i].push({ field, message });
  };

  for (const d of a.disputes) {
    const col = result.columns[d.col];
    const field = col && col.status !== 'open' && col.status !== 'ignored' ? TARGET[col.field] : undefined;
    if (!field) continue;
    const seen = d.readings.map((x) => (x ? `"${x}"` : 'blank')).join(' or ');
    flag(d.row, field, `We couldn't read this clearly — it looked like ${seen}. Please fill it in.`);
  }

  for (const i of result.issues) {
    if (i.row === undefined || i.level === 'info') continue;
    const hit = ISSUE_TARGET.find(([re]) => re.test(i.id));
    if (hit) flag(i.row, hit[1], i.message.replace(/^Row \d+(, [^:]+)?:\s*/, ''));
  }

  result.rows.forEach((x) => {
    const sizes: Array<[FlagField, keyof typeof x.was, string]> = [
      ['jerseySize', 'jerseySize', 'jersey size'],
      ['sockSize', 'sockSize', 'sock size'],
      ['pantShellSize', 'pantShellSize', 'pant shell size'],
    ];
    for (const [field, key, label] of sizes) {
      const said = x.was[key];
      const now = x[field as 'jerseySize' | 'sockSize' | 'pantShellSize'];
      if (said && !now && !(field === 'jerseySize' && x.sockOnly)) {
        flag(x.sourceRow, field, `Your file says "${said}" — pick the ${label} that matches.`);
      }
    }
  });

  return {
    questions,
    players,
    flags,
    leftOut: result.leftOut.filter((x) => !x.reason.startsWith('The header row')).map((x) => x.text).filter(Boolean),
    otherText: a.otherText,
  };
}
