import { describe, expect, it } from 'vitest';
import { isActiveRoutine, isScheduled, recordReferenceDate } from './routines';
import { dailyProgress } from './progress';
import { moveWithinHomeGroup, orderForHome } from './ordering';
import { calculateStreak, getCellState } from './streak';
import type { Routine } from './types';

const today = '2026-10-26';
const base: Routine = { id: 'a', name: 'A', memo: '', category: 'other', color: '#6b94e8', sortOrder: 0, createdDate: '2026-10-19', createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-19T00:00:00Z', scheduleHistory: [{ effectiveFrom: '2026-10-19', days: [1, 3, 5] }] };
const finished: Routine = { ...base, finishedAt: '2026-10-25T15:30:00Z', finishedDate: today };

describe('routine lifecycle and frozen history', () => {
  it('treats legacy routines as active while distinguishing finishing from deletion', () => {
    expect(isActiveRoutine(base)).toBe(true);
    expect(isActiveRoutine(finished)).toBe(false);
    expect(isActiveRoutine({ ...base, deletedAt: '2026-10-25T00:00:00Z' })).toBe(false);
    expect(finished.deletedAt).toBeUndefined();
    expect(recordReferenceDate(base, '2027-08-01')).toBe('2027-08-01');
    expect(recordReferenceDate(finished, '2027-08-01')).toBe(today);
  });
  it('excludes finished routines from the home groups, manual moves and today progress, including 0/0', () => {
    const active = { ...base, id: 'b', sortOrder: 1 }, routines = [finished, active], before = structuredClone(routines);
    expect(orderForHome(routines, new Set(['a']), today)).toEqual([active]);
    expect(moveWithinHomeGroup(routines, 'b', 'a', new Set(), today)).toEqual([active]);
    expect(dailyProgress(routines, [], today)).toEqual({ done: 0, total: 1, allDone: false });
    expect(dailyProgress([finished], [], today)).toEqual({ done: 0, total: 0, allDone: false });
    expect(routines).toEqual(before);
  });
  it('preserves eligible historical dates and ignores off-day, undone and post-finish records in totals', () => {
    const records = ['2026-10-19', '2026-10-21', '2026-10-23', '2026-10-24', '2026-10-26', '2026-10-28'].map((date, i) => ({ id: String(i), routineId: 'a', date, completed: date !== '2026-10-26', createdAt: `${date}T00:00:00Z`, updatedAt: `${date}T00:00:00Z` }));
    expect(isScheduled(finished, today)).toBe(true);
    const through = recordReferenceDate(finished, '2027-08-01');
    expect(calculateStreak(finished, records, through)).toEqual({ current: 3, longest: 3, total: 3 });
    expect(getCellState(finished, records, '2026-10-24', through)).toBe('off');
    expect(getCellState(finished, records, today, through)).toBe('missed');
    expect(getCellState(finished, records, '2026-10-28', through)).toBe('future');
  });
});
