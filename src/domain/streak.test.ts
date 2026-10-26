import { describe, expect, it } from 'vitest';
import { calculateStreak, getCellState } from './streak';
import { updateSchedule } from './routines';
import type { Completion, Routine, Weekday } from './types';

const everyDay: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
function routine(days = everyDay, createdDate = '2026-10-19'): Routine {
  return {
    id: 'r1', name: 'Read', memo: '', category: 'learning', color: '#356af1',
    scheduleHistory: [{ effectiveFrom: createdDate, days }], createdDate,
    createdAt: `${createdDate}T09:00:00Z`, updatedAt: `${createdDate}T09:00:00Z`,
  };
}
function completion(date: string, completed = true, routineId = 'r1'): Completion {
  return { id: `${routineId}-${date}`, routineId, date, completed, createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z` };
}
const records = (...dates: string[]) => dates.map(date => completion(date));

describe('streak calculation', () => {
  it('counts consecutive daily completions', () => {
    expect(calculateStreak(routine(), records('2026-10-19', '2026-10-20', '2026-10-21'), '2026-10-21'))
      .toEqual({ current: 3, longest: 3, total: 3 });
  });

  it('keeps a previous streak while today remains unchecked', () => {
    expect(calculateStreak(routine(), records('2026-10-19', '2026-10-20', '2026-10-21'), '2026-10-22'))
      .toEqual({ current: 3, longest: 3, total: 3 });
  });

  it('breaks the streak once an unchecked scheduled day has ended', () => {
    expect(calculateStreak(routine(), records('2026-10-19', '2026-10-20', '2026-10-21'), '2026-10-23'))
      .toEqual({ current: 0, longest: 3, total: 3 });
  });

  it('starts again after a missed day while preserving the longest streak', () => {
    expect(calculateStreak(routine(), records('2026-10-19', '2026-10-20', '2026-10-21', '2026-10-23'), '2026-10-23'))
      .toEqual({ current: 1, longest: 3, total: 4 });
  });

  it('counts Tuesday, Friday and Sunday as three consecutive scheduled occurrences', () => {
    expect(calculateStreak(routine([2, 5, 0]), records('2026-10-20', '2026-10-23', '2026-10-25'), '2026-10-25'))
      .toEqual({ current: 3, longest: 3, total: 3 });
  });

  it('non-target weekdays do not break a streak', () => {
    expect(calculateStreak(routine([2, 5, 0]), records('2026-10-20', '2026-10-23', '2026-10-25'), '2026-10-26'))
      .toEqual({ current: 3, longest: 3, total: 3 });
  });

  it('a missed target day breaks the streak even across non-target days', () => {
    expect(calculateStreak(routine([2, 5, 0]), records('2026-10-20', '2026-10-25'), '2026-10-26'))
      .toEqual({ current: 1, longest: 1, total: 2 });
  });

  it('ignores dates before creation and future records', () => {
    expect(calculateStreak(routine(everyDay, '2026-10-22'), records('2026-10-21', '2026-10-22', '2026-10-23'), '2026-10-22'))
      .toEqual({ current: 1, longest: 1, total: 1 });
  });

  it('counts only this routine and only historical target days', () => {
    const completions = [...records('2026-10-19', '2026-10-20'), completion('2026-10-23', true, 'other')];
    expect(calculateStreak(routine([2, 5]), completions, '2026-10-23'))
      .toEqual({ current: 1, longest: 1, total: 1 });
  });

  it('treats cancellation as incomplete and never double-counts duplicates', () => {
    const completed = completion('2026-10-19');
    expect(calculateStreak(routine(), [completed, completed], '2026-10-19').current).toBe(1);
    const canceled = { ...completed, completed: false, updatedAt: '2026-10-19T13:00:00Z' };
    expect(calculateStreak(routine(), [canceled, completed], '2026-10-20')).toEqual({ current: 0, longest: 0, total: 0 });
  });

  it('undoing today keeps the prior streak until the day ends', () => {
    expect(calculateStreak(routine(), [...records('2026-10-19', '2026-10-20'), completion('2026-10-21', false)], '2026-10-21'))
      .toEqual({ current: 2, longest: 2, total: 2 });
  });

  it('applies a changed schedule tomorrow without changing today or past meanings', () => {
    const original = routine([1, 3, 5]);
    const edited = { ...original, scheduleHistory: updateSchedule(original.scheduleHistory, [2, 4, 6], '2026-10-27') };
    const completed = records('2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26');
    expect(calculateStreak(edited, completed, '2026-10-26')).toEqual({ current: 4, longest: 4, total: 4 });
    expect(calculateStreak(edited, [...completed, completion('2026-10-27')], '2026-10-28'))
      .toEqual({ current: 5, longest: 5, total: 5 });
  });

  it('new unchecked routines start at zero', () => {
    expect(calculateStreak(routine(), [], '2026-10-19')).toEqual({ current: 0, longest: 0, total: 0 });
    expect(calculateStreak(routine(), [], '2026-10-18')).toEqual({ current: 0, longest: 0, total: 0 });
  });
});

describe('contribution cell states', () => {
  const habit = routine([1, 3, 5]);
  const completions = records('2026-10-19');

  it('distinguishes completed, missed, non-target and future dates', () => {
    expect(getCellState(habit, completions, '2026-10-19', '2026-10-23')).toBe('completed');
    expect(getCellState(habit, completions, '2026-10-21', '2026-10-23')).toBe('missed');
    expect(getCellState(habit, completions, '2026-10-20', '2026-10-23')).toBe('off');
    expect(getCellState(habit, completions, '2026-10-24', '2026-10-23')).toBe('future');
  });

  it('makes pre-creation dates unavailable and cancellation visible', () => {
    expect(getCellState(habit, completions, '2026-10-16', '2026-10-23')).toBe('off');
    expect(getCellState(habit, [completion('2026-10-19', false)], '2026-10-19', '2026-10-23')).toBe('missed');
  });
});
