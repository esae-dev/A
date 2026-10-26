import { describe, expect, it } from 'vitest';
import { isScheduled, normalizeRoutineInput, RoutineValidationError, updateSchedule } from './routines';
import type { Routine, RoutineInput, ScheduleChange, Weekday } from './types';

const input: RoutineInput = { name: '  Read  ', memo: '  A chapter  ', category: 'learning', color: '#ABCDEF', days: [5, 2, 2] };
const history: ScheduleChange[] = [{ effectiveFrom: '2026-10-19', days: [1, 3, 5] }];
const routine: Routine = {
  id: 'r1', name: 'Read', memo: '', category: 'learning', color: '#abcdef',
  scheduleHistory: history, createdDate: '2026-10-19', createdAt: '2026-10-19T09:00:00Z', updatedAt: '2026-10-19T09:00:00Z',
};

describe('routine validation', () => {
  it('normalizes text, color and unique sorted weekdays without mutation', () => {
    expect(normalizeRoutineInput(input)).toEqual({ ...input, name: 'Read', memo: 'A chapter', color: '#abcdef', days: [2, 5] });
    expect(input.days).toEqual([5, 2, 2]);
  });

  it('returns only editable fields even when callers pass a wider object', () => {
    expect(normalizeRoutineInput({ ...input, id: 'not-editable' } as RoutineInput)).not.toHaveProperty('id');
  });

  it.each([
    [{ name: '   ' }, 'nameRequired'],
    [{ name: 'x'.repeat(81) }, 'nameTooLong'],
    [{ memo: 'x'.repeat(501) }, 'memoTooLong'],
    [{ color: 'red' }, 'invalidColor'],
    [{ category: 'invalid' }, 'invalidCategory'],
    [{ days: [] }, 'daysRequired'],
    [{ days: [7] }, 'invalidDays'],
    [{ days: [1.5] }, 'invalidDays'],
  ])('rejects invalid input %o', (override, code) => {
    expect(() => normalizeRoutineInput({ ...input, ...override } as RoutineInput)).toThrow(new RoutineValidationError(code as RoutineValidationError['code']));
  });
});

describe('effective-dated schedules', () => {
  it('never schedules days before creation', () => {
    expect(isScheduled(routine, '2026-10-16')).toBe(false);
    expect(isScheduled(routine, '2026-10-19')).toBe(true);
    expect(isScheduled(routine, '2026-10-20')).toBe(false);
  });

  it('preserves history when an edit takes effect tomorrow', () => {
    const edited = { ...routine, scheduleHistory: updateSchedule(history, [2, 4, 6], '2026-10-27') };
    expect(isScheduled(edited, '2026-10-26')).toBe(true);
    expect(isScheduled(edited, '2026-10-27')).toBe(true);
    expect(isScheduled(edited, '2026-10-28')).toBe(false);
    expect(edited.scheduleHistory).toHaveLength(2);
    expect(history).toEqual([{ effectiveFrom: '2026-10-19', days: [1, 3, 5] }]);
  });

  it('replaces repeated edits for the same effective date', () => {
    const first = updateSchedule(history, [2, 4, 6], '2026-10-27');
    const second = updateSchedule(first, [0, 6], '2026-10-27');
    expect(second).toEqual([...history, { effectiveFrom: '2026-10-27', days: [0, 6] }]);
    expect(first[1].days).toEqual([2, 4, 6]);
  });

  it('does not add a history entry for an unchanged schedule', () => {
    expect(updateSchedule(history, [5, 1, 3], '2026-10-27')).toEqual(history);
  });

  it('keeps existing later entries if the local calendar moves backwards', () => {
    const later = [...history, { effectiveFrom: '2026-10-29', days: [4] as Weekday[] }];
    expect(updateSchedule(later, [2], '2026-10-27')).toEqual([
      ...history,
      { effectiveFrom: '2026-10-27', days: [2] },
      { effectiveFrom: '2026-10-29', days: [4] },
    ]);
  });
});
