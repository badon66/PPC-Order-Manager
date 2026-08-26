/**
 * Calendar-date handling.
 *
 * BUG THIS FIXES: the previous Base44 app stored dates as "YYYY-MM-DD" and then
 * rendered them with `new Date(str)`, which parses a date-only string as a UTC
 * instant. Formatted back in America/Edmonton (UTC-6/-7) that lands on the
 * PREVIOUS day. An order paid 2026-08-13 displayed as "August 12, 2026" on every
 * screen, including the customer-facing share page.
 *
 * RULE: a CalendarDate is a plain "YYYY-MM-DD" string. It is never converted to a
 * Date object, never passed through a timezone, and never round-tripped through
 * toISOString(). The date you type is the date that displays. Everywhere.
 */

export type CalendarDate = string; // "YYYY-MM-DD"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export function isCalendarDate(value: unknown): value is CalendarDate {
  return typeof value === 'string' && ISO_DATE.test(value);
}

/** Split "YYYY-MM-DD" into its parts without constructing a Date. */
function parts(date: CalendarDate): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

/** "2026-08-13" -> "August 13, 2026" */
export function formatLong(date: CalendarDate | null | undefined): string {
  if (!isCalendarDate(date)) return '';
  const { y, m, d } = parts(date);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "2026-08-13" -> "Aug 13, 2026" */
export function formatShort(date: CalendarDate | null | undefined): string {
  if (!isCalendarDate(date)) return '';
  const { y, m, d } = parts(date);
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

/** Today in the business's local timezone, as a CalendarDate. */
export function today(timeZone = 'America/Edmonton'): CalendarDate {
  // en-CA gives YYYY-MM-DD, and formatToParts respects the timezone properly.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

/** Whole days from `from` to `to`. Negative means `to` is in the past. */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  const a = parts(from);
  const b = parts(to);
  // Date.UTC on the extracted parts is safe: both sides use the same convention,
  // so the difference is exact whole days regardless of timezone.
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.round(ms / 86_400_000);
}

export type DueStatus = 'overdue' | 'due-soon' | 'scheduled' | 'none';

/** Classify an estimated finish date for the production queue. */
export function dueStatus(
  finishDate: CalendarDate | null | undefined,
  soonWindowDays = 7,
  now: CalendarDate = today(),
): DueStatus {
  if (!isCalendarDate(finishDate)) return 'none';
  const delta = daysBetween(now, finishDate);
  if (delta < 0) return 'overdue';
  if (delta <= soonWindowDays) return 'due-soon';
  return 'scheduled';
}

/** Human phrasing for the queue: "3 days late", "due in 5 days", "due today". */
export function dueLabel(
  finishDate: CalendarDate | null | undefined,
  now: CalendarDate = today(),
): string {
  if (!isCalendarDate(finishDate)) return 'No finish date set';
  const delta = daysBetween(now, finishDate);
  if (delta === 0) return 'Due today';
  if (delta < 0) {
    const n = Math.abs(delta);
    return `${n} day${n === 1 ? '' : 's'} late`;
  }
  return `Due in ${delta} day${delta === 1 ? '' : 's'}`;
}

/** ISO week-ish grouping key for the calendar view: the Monday of that date's week. */
export function weekStart(date: CalendarDate): CalendarDate {
  const { y, m, d } = parts(date);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // Monday = 0
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const { y, m, d } = parts(date);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function monthKey(date: CalendarDate): string {
  return date.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/**
 * A timestamp, shown to the second, in Keenan's timezone.
 *
 * Distinct from `formatLong`/`formatShort`, which take a CalendarDate — a
 * `YYYY-MM-DD` string that must never touch a timezone, because the old app
 * ran every one of those through `new Date()` and displayed every date a day
 * early.
 *
 * This one is the opposite case and the distinction matters: a change-log `at`
 * is a real instant, stored as ISO UTC, and the only correct way to show it is
 * converted into local time. "When did the customer change this?" is a
 * question about a moment, not a calendar square.
 */
export function formatTimestamp(iso: string, timeZone = 'America/Edmonton'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(d);
}

/** Just the day part of an instant, for grouping a log into date headings. */
export function timestampDay(iso: string, timeZone = 'America/Edmonton'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}
