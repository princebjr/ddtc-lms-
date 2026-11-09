// Due dates (Phase 7; D13). Shown and entered in Ghana time: Africa/Accra is GMT all year with no
// daylight saving, so a due date's Ghana time is its UTC time.

const TIME_ZONE = 'Africa/Accra';
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const dateTime = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const shortDate = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' });
const clockTime = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "20 Nov 2026, 23:59" (Ghana time). @param {string} iso */
export function formatDue(iso) {
  return dateTime.format(new Date(iso));
}

const shortDateTime = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "20 Nov, 23:59" (Ghana time), for lists. @param {string} iso */
export function formatDueShort(iso) {
  return shortDateTime.format(new Date(iso));
}

/** Whole Ghana calendar days from one moment to another. @param {Date} from @param {Date} to */
function calendarDays(from, to) {
  return Math.round((Date.parse(dayKey.format(to)) - Date.parse(dayKey.format(from))) / 86_400_000);
}

/**
 * The learner's due-date chip: today, tomorrow, in a few days or the date; overdue, or late allowed
 * when the assignment accepts late work. An extension replaces the due date (D13).
 * @param {{ dueAt: string, allowLate?: boolean, extendedTo?: string | null }} assignment
 * @param {Date} [now]
 * @returns {{ label: string, tone: 'info' | 'warning' | 'error', overdue: boolean, effective: string }}
 */
export function dueStatus({ dueAt, allowLate = false, extendedTo = null }, now = new Date()) {
  const effective = extendedTo ?? dueAt;
  const due = new Date(effective);
  if (due.getTime() <= now.getTime()) {
    return allowLate ? { label: 'Late allowed', tone: 'warning', overdue: true, effective } : { label: 'Overdue', tone: 'error', overdue: true, effective };
  }
  const days = calendarDays(now, due);
  const prefix = extendedTo ? 'Extended: due' : 'Due';
  const label =
    days <= 0 ? `${prefix} today, ${clockTime.format(due)}` : days === 1 ? `${prefix} tomorrow, ${clockTime.format(due)}` : days < 7 ? `${prefix} in ${days} days` : `${prefix} ${shortDate.format(due)}`;
  return { label, tone: days <= 1 ? 'warning' : 'info', overdue: false, effective };
}

/** The value for a date-and-time field (Ghana time) from a stored moment. @param {string | null | undefined} iso */
export function toGhanaInput(iso) {
  return iso ? new Date(iso).toISOString().slice(0, 16) : '';
}

/** The stored moment from a date-and-time field filled in Ghana time. @param {string} value */
export function fromGhanaInput(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00Z` : '';
}
