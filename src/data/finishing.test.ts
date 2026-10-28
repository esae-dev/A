import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HabitDatabase } from './db';
import { createRepository, type HabitRepository } from './repository';
import { calculateStreak } from '../domain/streak';
import { isActiveRoutine, recordReferenceDate } from '../domain/routines';
import { dailyProgress } from '../domain/progress';
import { orderForHome } from '../domain/ordering';
import type { Completion, Routine } from '../domain/types';

describe('finishing existing routines without deleting history', () => {
  let database: HabitDatabase, repository: HabitRepository, clock: Date;
  const study: Routine = { id: 'study', name: '기존 독서', memo: '첫 줄\n둘째 줄', category: 'learning', color: '#8b63c7', sortOrder: 5,
    createdDate: '2026-10-19', createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-25T04:00:00Z',
    scheduleHistory: [{ effectiveFrom: '2026-10-27', days: [2, 4] }, { effectiveFrom: '2026-10-19', days: [0, 1, 2, 3, 4, 5, 6] }] };
  const exercise: Routine = { ...study, id: 'exercise', name: '운동', sortOrder: 2 };
  const gone: Routine = { ...study, id: 'deleted', deletedAt: '2026-10-25T08:00:00Z' };
  const records: Completion[] = Array.from({ length: 8 }, (_, i) => {
    const date = `2026-10-${19 + i}`;
    return { id: `day-${i}`, routineId: 'study', date, completed: ![2, 5].includes(i), createdAt: `${date}T02:00:00Z`, updatedAt: `${date}T03:00:00Z` };
  });
  const input = { name: study.name, memo: study.memo, category: study.category, color: study.color, days: [0, 1, 2, 3, 4, 5, 6] as Routine['scheduleHistory'][number]['days'] };
  const raw = async () => ({ routines: await database.routines.toArray(), completions: await database.completions.toArray(), preferences: await database.preferences.toArray() });

  beforeEach(async () => {
    database = new HabitDatabase(`aeha-finish-${crypto.randomUUID()}`);
    clock = new Date(2026, 9, 26, 20);
    repository = createRepository(database, () => clock);
    await database.routines.bulkPut([study, exercise, gone]);
    await database.completions.bulkPut([...records, { ...records[0], id: 'deleted-check', routineId: 'deleted' }]);
    await database.preferences.put({ id: 'app', language: 'en', theme: 'light' });
  });
  afterEach(async () => { await database.delete(); });

  it('extends a pre-existing v2 record atomically and preserves every other field, record and setting across reopen', async () => {
    const before = await raw();
    database.close();
    database = new HabitDatabase(database.name);
    repository = createRepository(database, () => clock);
    await repository.finishRoutine(study.id);
    expect(database.verno).toBe(2);
    const finished = (await database.routines.get(study.id))!;
    expect(finished).toEqual({ ...study, finishedAt: clock.toISOString(), finishedDate: '2026-10-26', updatedAt: clock.toISOString() });
    const after = await raw();
    expect(after.completions).toEqual(before.completions);
    expect(after.preferences).toEqual(before.preferences);
    expect(after.routines.filter(r => r.id !== study.id)).toEqual(before.routines.filter(r => r.id !== study.id));
    const snapshot = await repository.getSnapshot();
    expect(snapshot.routines.find(r => r.id === study.id)).toEqual(finished);
    expect(snapshot.completions).toEqual(before.completions.filter(c => c.routineId !== 'deleted'));
    expect(isActiveRoutine(finished)).toBe(false);
    expect(orderForHome(snapshot.routines, new Set(['study']), '2026-10-26').map(r => r.id)).toEqual(['exercise']);
    expect(dailyProgress(snapshot.routines, snapshot.completions, '2026-10-26')).toEqual({ done: 0, total: 1, allDone: false });
    expect(calculateStreak(finished, snapshot.completions, recordReferenceDate(finished, '2027-07-01'))).toEqual({ total: 6, longest: 2, current: 2 });
    database.close(); database = new HabitDatabase(database.name);
    repository = createRepository(database, () => clock);
    expect(await raw()).toEqual(after);
    expect((await repository.getSnapshot()).routines.find(r => r.id === study.id)?.finishedDate).toBe('2026-10-26');
  });

  it.each(['checked', 'undone', 'absent'] as const)('keeps the finish-day record %s and never auto-completes it', async state => {
    await database.completions.delete('day-7');
    if (state !== 'absent') await repository.setCompletion(study.id, '2026-10-26', state === 'checked');
    const before = await database.completions.toArray();
    await repository.finishRoutine(study.id);
    expect(await database.completions.toArray()).toEqual(before);
    const finished = (await database.routines.get(study.id))!;
    expect(finished.scheduleHistory).toEqual(study.scheduleHistory);
    expect(calculateStreak(finished, before, recordReferenceDate(finished, '2028-01-01')).total).toBe(state === 'checked' ? 6 : 5);
  });

  it('rejects new checks, undo, edits and drag moves after finishing without modifying the frozen data', async () => {
    await repository.finishRoutine(study.id);
    const before = await raw();
    for (const date of ['2026-10-19', '2026-10-26', '2026-10-27']) {
      await expect(repository.setCompletion(study.id, date, true)).rejects.toThrow('routine-finished');
      await expect(repository.setCompletion(study.id, date, false)).rejects.toThrow('routine-finished');
    }
    await expect(repository.updateRoutine(study.id, input)).rejects.toThrow('routine-finished');
    await expect(repository.moveRoutine(study.id, exercise.id)).rejects.toThrow('routine-not-found');
    await expect(repository.moveRoutine(exercise.id, study.id)).rejects.toThrow('routine-not-found');
    expect(await raw()).toEqual(before);
  });

  it('keeps the original finish date on repeated requests and treats soft deletion independently', async () => {
    await repository.finishRoutine(study.id);
    const finished = await database.routines.get(study.id), beforeRecords = await database.completions.toArray();
    clock = new Date(2027, 0, 15, 12);
    await repository.finishRoutine(study.id);
    expect(await database.routines.get(study.id)).toEqual(finished);
    await repository.deleteRoutine(exercise.id);
    expect((await database.routines.get(exercise.id))?.finishedAt).toBeUndefined();
    await expect(repository.finishRoutine(exercise.id)).rejects.toThrow('routine-not-found');
    await repository.deleteRoutine(study.id);
    expect(await database.routines.get(study.id)).toEqual({ ...finished, deletedAt: clock.toISOString(), updatedAt: clock.toISOString() });
    expect(await database.completions.toArray()).toEqual(beforeRecords);
    expect((await repository.getSnapshot()).routines).toEqual([]);
  });

  it('rolls back a failed finish write without changing routines, records or settings', async () => {
    const before = await raw();
    database.routines.hook('updating', changes => { if ((changes as Partial<Routine>).finishedAt) throw new Error('Isolated finish write failure'); });
    await expect(repository.finishRoutine(study.id)).rejects.toThrow('Isolated finish write failure');
    expect(await raw()).toEqual(before);
    expect((await repository.getSnapshot()).routines.filter(isActiveRoutine)).toHaveLength(2);
  });
});
