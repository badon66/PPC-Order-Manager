import type { ChangeLogEntry, Order, RosterEntry } from '@/lib/types';
import { computeTotals } from '@/lib/order-utils';
import { daysBetween, formatShort } from '@/lib/dates';
import { STATUS_META } from '@/lib/constants';
import { changesFor, type FactoryChange } from './changes';
import { FACTORY_STEP_LABEL, factoryStateOf, type FactoryState } from './steps';
import { jobMoneyOf, type JobMoney } from './money';

/**
 * One job as the factory's dashboard shows it.
 *
 * Built FIELD BY FIELD, like the public views (see CLAUDE.md): this object is
 * what reaches the factory's browser, so nothing is spread from the order. A
 * new field on Order reaches the factory only if someone adds it here.
 * No customer price, no customer payments — tests/factory/board.test.ts
 * checks by value and by key. The one money object on it, `money`, is the
 * FACTORY'S OWN: what it charges Powerplay, what Powerplay has sent, what's
 * owed (lib/factory/money.ts) — built only from the factory_* money entries.
 */
export interface FactoryJobCard {
  id: string;
  teamName: string;
  jobNumber: string;
  jerseys: number;
  sockPairs: number;
  pantShells: number;
  /** Jerseys made for Powerplay to keep, on top of the team's. */
  keepers: number;
  /** When Powerplay needs it (their estimated finish), YYYY-MM-DD or null. */
  neededBy: string | null;
  sentAt: string | null;
  state: FactoryState;
  /** Powerplay's changes since the job was sent, newest first. */
  changes: Array<FactoryChange & { isNew: boolean }>;
  newChanges: number;
  /**
   * Where POWERPLAY has the order, in the factory's terms. An order Powerplay
   * already moved past production (final check, final payment) is finished
   * whatever the factory's own steps say — so jobs from before the dashboard
   * existed don't all ask to be marked Received.
   */
  powerplay: 'making' | 'finished' | 'shipped';
  /** Powerplay has shipped or closed the order: off the open list, nothing to do. */
  done: boolean;
  /** The factory's own cost for the job and what Powerplay has paid toward it. USD cents. */
  money: JobMoney;
}

export function jobCardOf(o: Order, roster: RosterEntry[], history: ChangeLogEntry[]): FactoryJobCard {
  const mine = history.filter((h) => h.orderId === o.id);
  const state = factoryStateOf(mine);
  const totals = computeTotals(o, roster);
  const changes = changesFor(o, mine, state);
  const at = STATUS_META[o.status].order;
  const powerplay = at >= STATUS_META.shipped.order ? 'shipped' : at > STATUS_META.in_production.order ? 'finished' : 'making';
  return {
    id: o.id,
    teamName: o.teamName || 'Untitled job',
    jobNumber: o.invoiceNumber ?? '',
    jerseys: totals.totalJerseys,
    sockPairs: totals.totalSockPairs,
    pantShells: totals.totalPantShells,
    keepers: (o.keeperJerseys ?? []).length,
    neededBy: o.estimatedFinishDate ?? null,
    sentAt: o.sentToFactoryAt ?? null,
    state,
    changes,
    newChanges: changes.filter((c) => c.isNew).length,
    powerplay,
    done: powerplay === 'shipped',
    // The whole amount is due once the job is finished: Completed or Shipped WITH Keenan's
    // approval (a waiting request doesn't count), or Powerplay already past production.
    money: jobMoneyOf(mine, state.step === 'completed' || state.step === 'shipped' || powerplay !== 'making'),
  };
}

export type ReminderTone = 'act' | 'late' | 'info';

export interface FactoryReminder {
  orderId: string;
  teamName: string;
  text: string;
  tone: ReminderTone;
}

/**
 * What a job needs from the factory right now — the "To do" list. Worked out
 * from the job itself, so it's never stale and nobody has to write it:
 *   act   something to do (mark it received, set a date, read a change)
 *   late  past a date
 *   info  nothing to do; waiting on Powerplay
 */
export function remindersFor(card: FactoryJobCard, today: string): FactoryReminder[] {
  if (card.done) return [];
  const out: FactoryReminder[] = [];
  const add = (text: string, tone: ReminderTone) => out.push({ orderId: card.id, teamName: card.teamName, text, tone });
  const { state } = card;
  const finished = state.step === 'completed' || state.step === 'shipped' || state.pending !== null || card.powerplay !== 'making';

  if (card.newChanges > 0) {
    add(`Powerplay changed ${card.newChanges === 1 ? 'something' : `${card.newChanges} things`} — open the job to see`, 'act');
  }
  if (state.step === null && !state.pending && card.powerplay === 'making') add('New job — mark it Received', 'act');
  // Only for a job being made now: orders finished before the dashboard existed aren't chased for a cost.
  if (card.money.cost === null && card.powerplay === 'making') add('Enter your cost for this job', 'act');
  if (state.pending) add(`${FACTORY_STEP_LABEL[state.pending.step]} is waiting for Powerplay to approve`, 'info');
  if (state.step === 'shipped' && !state.pending) {
    // Shipped and approved, but Powerplay still has the order open: nothing for the factory to do.
  } else if (!finished) {
    if (!state.finishDate) add('Set the date you expect to finish', 'act');
    else if (daysBetween(today, state.finishDate) < 0) add(`Your finish date (${formatShort(state.finishDate)}) has passed — update the date or the step`, 'late');
    if (card.neededBy && daysBetween(today, card.neededBy) < 0) add(`Powerplay needed this by ${formatShort(card.neededBy)}`, 'late');
    else if (card.neededBy && state.finishDate && daysBetween(card.neededBy, state.finishDate) > 0) {
      add(`Your finish date is after the day Powerplay needs it (${formatShort(card.neededBy)})`, 'late');
    }
  }
  if ((state.step === 'completed' || (card.powerplay === 'finished' && state.step !== 'shipped')) && !state.pending) {
    add('Finished — mark it Shipped with the tracking number when it leaves', 'act');
  }
  return out;
}

const TONE_RANK: Record<ReminderTone, number> = { late: 0, act: 1, info: 2 };

/** Every reminder across the board, the urgent ones first. */
export function allReminders(cards: FactoryJobCard[], today: string): FactoryReminder[] {
  return cards.flatMap((c) => remindersFor(c, today)).sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
}

/** The board's order: jobs needing something first, then by the day Powerplay needs them. */
export function sortCards(cards: FactoryJobCard[], today: string): FactoryJobCard[] {
  const urgency = (c: FactoryJobCard) => {
    const r = remindersFor(c, today);
    return r.some((x) => x.tone === 'late') ? 0 : r.some((x) => x.tone === 'act') ? 1 : 2;
  };
  return [...cards].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      urgency(a) - urgency(b) ||
      (a.neededBy ?? '9999').localeCompare(b.neededBy ?? '9999') ||
      a.teamName.localeCompare(b.teamName),
  );
}
