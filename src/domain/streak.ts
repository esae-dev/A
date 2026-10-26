import { addDays, isDateKey } from './dates';
import { isScheduled } from './routines';
import type { Completion, DateKey, Routine } from './types';

export interface Streak {
  current: number;
  longest: number;
  total: number;
}

export type CellState = 'completed' | 'missed' | 'off' | 'future';

/** Resolve defensively by update timestamp; cancellation is an explicit state. */
function completionDays(routineId: string, completions: Completion[]): Set<DateKey> {
  const latest = new Map<DateKey, Completion>();
  for (const completion of completions) {
    if (completion.routineId !== routineId) continue;
    const existing = latest.get(completion.date);
    if (!existing || existing.updatedAt <= completion.updatedAt) latest.set(completion.date, completion);
  }
  return new Set([...latest.values()].filter(completion => completion.completed).map(completion => completion.date));
}

export function calculateStreak(routine: Routine, completions: Completion[], today: DateKey): Streak {
  if (!isDateKey(today) || !isDateKey(routine.createdDate)) throw new RangeError('Invalid streak date');
  const completed = completionDays(routine.id, completions);
  let current = 0;
  let longest = 0;
  let total = 0;
  for (let date = routine.createdDate; date <= today; date = addDays(date, 1)) {
    if (!isScheduled(routine, date)) continue;
    if (completed.has(date)) {
      current += 1;
      total += 1;
      longest = Math.max(longest, current);
    } else if (date < today) {
      current = 0;
    }
  }
  return { current, longest, total };
}

export function getCellState(routine: Routine, completions: Completion[], date: DateKey, today: DateKey): CellState {
  if (date > today) return 'future';
  if (!isScheduled(routine, date)) return 'off';
  return completionDays(routine.id, completions).has(date) ? 'completed' : 'missed';
}
