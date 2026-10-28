import { dayOfWeek, isDateKey, localDateKey } from './dates';
import type { Category, DateKey, Routine, RoutineInput, ScheduleChange, Weekday } from './types';

export const MAX_NAME_LENGTH = 80;
export const MAX_MEMO_LENGTH = 500;

export function isActiveRoutine(routine: Routine): boolean {
  return !routine.deletedAt && !routine.finishedAt;
}

/** Daily scheduling remains historical; only the record viewport is frozen. */
export function recordReferenceDate(routine: Routine, today: DateKey): DateKey {
  return routine.finishedDate ?? (routine.finishedAt ? localDateKey(new Date(routine.finishedAt)) : today);
}

export type ValidationCode = 'nameRequired' | 'nameTooLong' | 'memoTooLong' | 'invalidCategory' | 'invalidColor' | 'daysRequired' | 'invalidDays';

export class RoutineValidationError extends Error {
  constructor(public readonly code: ValidationCode) {
    super(code);
    this.name = 'RoutineValidationError';
  }
}

const categories: Category[] = ['other', 'health', 'learning', 'mind', 'life'];

function normalizeDays(days: Weekday[]): Weekday[] {
  if (!days.length) throw new RoutineValidationError('daysRequired');
  if (days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new RoutineValidationError('invalidDays');
  }
  return [...new Set(days)].sort((a, b) => a - b);
}

export function normalizeRoutineInput(input: RoutineInput): RoutineInput {
  const name = input.name.trim();
  const memo = input.memo.trim();
  if (!name) throw new RoutineValidationError('nameRequired');
  if (name.length > MAX_NAME_LENGTH) throw new RoutineValidationError('nameTooLong');
  if (memo.length > MAX_MEMO_LENGTH) throw new RoutineValidationError('memoTooLong');
  if (!categories.includes(input.category)) throw new RoutineValidationError('invalidCategory');
  if (!/^#[\da-f]{6}$/i.test(input.color)) throw new RoutineValidationError('invalidColor');
  return { name, memo, category: input.category, color: input.color.toLowerCase(), days: normalizeDays(input.days) };
}

/** Shared by scheduling and its label, including legacy histories out of order. */
export function effectiveSchedule(routine: Routine, date: DateKey): ScheduleChange | undefined {
  return routine.scheduleHistory.reduce<ScheduleChange | undefined>((active, candidate) => {
    if (candidate.effectiveFrom > date) return active;
    return !active || candidate.effectiveFrom >= active.effectiveFrom ? candidate : active;
  }, undefined);
}

/** Most recent effective schedule governs a day; creation's local day is inclusive. */
export function isScheduled(routine: Routine, date: DateKey): boolean {
  if (date < routine.createdDate) return false;
  const schedule = effectiveSchedule(routine, date);
  return schedule?.days.includes(dayOfWeek(date)) ?? false;
}

/**
 * Edits are effective on the supplied local day. A second edit that day replaces
 * that day's entry. Earlier days are never rewritten; future entries are retained.
 */
export function updateSchedule(history: ScheduleChange[], days: Weekday[], effectiveFrom: DateKey): ScheduleChange[] {
  if (!isDateKey(effectiveFrom)) throw new RangeError('Invalid effective date');
  const normalized = normalizeDays(days);
  const result = history.map(entry => ({ ...entry, days: [...entry.days] }));
  const current = [...result].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
    .find(entry => entry.effectiveFrom <= effectiveFrom);
  if (current && [...current.days].sort((a, b) => a - b).join(',') === normalized.join(',')) {
    return result.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }
  return [...result.filter(entry => entry.effectiveFrom !== effectiveFrom), { effectiveFrom, days: normalized }]
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}
