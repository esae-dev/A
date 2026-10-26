import type { DateKey, Weekday } from './types';

const pad = (value: number) => String(value).padStart(2, '0');

/** Read the user's local calendar fields, not toISOString().slice(0, 10). */
export function localDateKey(date = new Date()): DateKey {
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid date');
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function calendarDate(key: DateKey): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new RangeError('Invalid calendar date');
  const [year, month, day] = key.split('-').map(Number);
  // UTC is only an arithmetic container for an already-local calendar key.
  // No local timestamp is converted to UTC, and DST cannot skip/repeat a date.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new RangeError('Invalid calendar date');
  }
  return date;
}

export function isDateKey(value: string): value is DateKey {
  try {
    calendarDate(value);
    return true;
  } catch {
    return false;
  }
}

export function addDays(key: DateKey, amount: number): DateKey {
  if (!Number.isInteger(amount)) throw new RangeError('Day offset must be an integer');
  const date = calendarDate(key);
  date.setUTCDate(date.getUTCDate() + amount);
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function dayOfWeek(key: DateKey): Weekday {
  return calendarDate(key).getUTCDay() as Weekday;
}
