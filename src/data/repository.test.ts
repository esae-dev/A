import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HabitDatabase } from './db';
import { createRepository, type HabitRepository } from './repository';
import type { Preferences, RoutineInput } from '../domain/types';
import { calculateStreak } from '../domain/streak';
import { compareManualOrder, completionIds, orderForHome } from '../domain/ordering';

const input: RoutineInput = {
  name: '  Read  ',
  memo: 'One chapter',
  category: 'learning',
  color: '#4778ed',
  days: [0, 1, 2, 3, 4, 5, 6],
};

describe('IndexedDB repository', () => {
  let database: HabitDatabase;
  let repository: HabitRepository;
  let clock: Date;

  beforeEach(() => {
    database = new HabitDatabase(`eha-test-${crypto.randomUUID()}`);
    clock = new Date(2026, 9, 26, 10, 0, 0);
    repository = createRepository(database, () => clock);
  });

  afterEach(async () => {
    await database.delete();
  });

  it('creates a validated routine, preserving local creation date and UUID metadata', async () => {
    const routine = await repository.createRoutine(input);
    expect(routine.name).toBe('Read');
    expect(routine.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(routine.createdDate).toBe('2026-10-26');
    expect(routine.scheduleHistory).toEqual([{ effectiveFrom: '2026-10-26', days: input.days }]);
    expect((await repository.getSnapshot()).routines).toEqual([routine]);
    await expect(repository.createRoutine({ ...input, name: '  ' })).rejects.toThrow();
    await expect(repository.createRoutine({ ...input, days: [] })).rejects.toThrow();
    expect(await database.routines.count()).toBe(1);
  });

  it('updates editable fields while preserving ID and past schedules', async () => {
    const routine = await repository.createRoutine(input);
    clock = new Date(2026, 9, 28, 10);
    const updated = await repository.updateRoutine(routine.id, { ...input, name: 'Exercise', days: [2, 5] });
    expect(updated.id).toBe(routine.id);
    expect(updated.createdAt).toBe(routine.createdAt);
    expect(updated.createdDate).toBe('2026-10-26');
    expect(updated.name).toBe('Exercise');
    expect(updated.scheduleHistory).toEqual([
      { effectiveFrom: '2026-10-26', days: input.days },
      { effectiveFrom: '2026-10-29', days: [2, 5] },
    ]);
    const secondUpdate = await repository.updateRoutine(routine.id, { ...input, days: [3] });
    expect(secondUpdate.scheduleHistory).toEqual([
      { effectiveFrom: '2026-10-26', days: input.days },
      { effectiveFrom: '2026-10-29', days: [3] },
    ]);
  });

  it('keeps today checkable after a schedule change and avoids history for a metadata-only edit', async () => {
    const routine = await repository.createRoutine(input);
    const renamed = await repository.updateRoutine(routine.id, { ...input, name: 'Read more' });
    expect(renamed.scheduleHistory).toEqual(routine.scheduleHistory);
    await repository.setCompletion(routine.id, '2026-10-26', true);
    const changed = await repository.updateRoutine(routine.id, { ...input, days: [2] });
    expect(changed.scheduleHistory).toEqual([
      { effectiveFrom: '2026-10-26', days: input.days },
      { effectiveFrom: '2026-10-27', days: [2] },
    ]);
    await repository.setCompletion(routine.id, '2026-10-26', false);
    await repository.setCompletion(routine.id, '2026-10-26', true);
    expect((await repository.getSnapshot()).completions[0].completed).toBe(true);
  });

  it('soft-deletes a routine without discarding its original completion records', async () => {
    const routine = await repository.createRoutine(input);
    await repository.setCompletion(routine.id, '2026-10-26', true);
    await repository.deleteRoutine(routine.id);
    await repository.deleteRoutine(routine.id);
    const snapshot = await repository.getSnapshot();
    expect(snapshot.routines).toEqual([]);
    expect(snapshot.completions).toEqual([]);
    expect((await database.routines.get(routine.id))?.deletedAt).toBe(clock.toISOString());
    expect(await database.completions.count()).toBe(1);
    await expect(repository.setCompletion(routine.id, '2026-10-26', true)).rejects.toThrow('routine-not-found');
    await expect(repository.updateRoutine(routine.id, input)).rejects.toThrow('routine-not-found');
  });

  it('serializes concurrent checks and retains the same record when unchecked and rechecked', async () => {
    const routine = await repository.createRoutine(input);
    await Promise.all(Array.from({ length: 10 }, () => repository.setCompletion(routine.id, '2026-10-26', true)));
    expect(await database.completions.count()).toBe(1);
    const original = (await database.completions.toArray())[0];
    expect(original.completed).toBe(true);
    clock = new Date(2026, 9, 26, 11);
    await repository.setCompletion(routine.id, '2026-10-26', false);
    const undone = (await database.completions.toArray())[0];
    expect(undone).toEqual({ ...original, completed: false, updatedAt: clock.toISOString() });
    await repository.setCompletion(routine.id, '2026-10-26', true);
    expect(await database.completions.count()).toBe(1);
    expect((await database.completions.toArray())[0]).toMatchObject({ id: original.id, completed: true });
  });

  it('enforces the compound unique index even if a client bypasses the repository', async () => {
    const routine = await repository.createRoutine(input);
    await repository.setCompletion(routine.id, '2026-10-26', true);
    const existing = (await database.completions.toArray())[0];
    await expect(database.completions.add({ ...existing, id: crypto.randomUUID() })).rejects.toMatchObject({
      name: 'ConstraintError',
    });
    expect(await database.completions.count()).toBe(1);
  });

  it('rejects malformed, precreation, future and non-target dates without writing', async () => {
    const routine = await repository.createRoutine({ ...input, days: [2] });
    for (const date of ['2026-02-30', '2026-10-25', '2026-10-27', '2026-10-26']) {
      await expect(repository.setCompletion(routine.id, date, true)).rejects.toThrow('invalid-completion');
    }
    await expect(repository.setCompletion('missing', '2026-10-26', true)).rejects.toThrow('routine-not-found');
    expect(await database.completions.count()).toBe(0);
  });

  it('retains routines, undone states and language/theme across database reopen', async () => {
    expect((await repository.getSnapshot()).preferences).toEqual({ language: 'ko', theme: 'dark' });
    const routine = await repository.createRoutine(input);
    await repository.setCompletion(routine.id, '2026-10-26', true);
    await repository.setCompletion(routine.id, '2026-10-26', false);
    await repository.savePreferences({ language: 'en', theme: 'dark' });
    const original = await repository.getSnapshot();
    database.close();
    database = new HabitDatabase(database.name);
    repository = createRepository(database, () => clock);
    expect(await repository.getSnapshot()).toEqual(original);
    expect((await repository.getSnapshot()).completions[0].completed).toBe(false);
    expect((await repository.getSnapshot()).preferences).toEqual({ language: 'en', theme: 'dark' });
  });

  it.each(['light', 'dark'] as const)('migrates legacy system theme once to %s without changing other data', async theme => {
    const routine = await repository.createRoutine(input);
    await repository.setCompletion(routine.id, '2026-10-26', true);
    const records = await database.completions.toArray();
    await database.preferences.put({ id: 'app', language: 'en', theme: 'system' });
    let resolutions = 0;
    repository = createRepository(database, () => clock, () => { resolutions++; return theme; });
    const snapshots = await Promise.all([repository.getSnapshot(), repository.getSnapshot()]);
    expect(resolutions).toBe(1);
    for (const snapshot of snapshots) {
      expect(snapshot.preferences).toEqual({ language: 'en', theme });
      expect(snapshot.routines).toEqual([routine]);
      expect(snapshot.completions).toEqual(records);
    }
    database.close();
    database = new HabitDatabase(database.name);
    repository = createRepository(database, () => clock, () => theme === 'light' ? 'dark' : 'light');
    expect((await repository.getSnapshot()).preferences).toEqual({ language: 'en', theme });
    expect(await database.preferences.get('app')).toEqual({ id: 'app', language: 'en', theme });
  });

  it('defaults to dark on light devices and rejects new system preferences', async () => {
    repository = createRepository(database, () => clock, () => 'light');
    expect((await repository.getSnapshot()).preferences.theme).toBe('dark');
    await expect(repository.savePreferences({ language: 'ko', theme: 'system' } as unknown as Preferences)).rejects.toThrow('invalid-preferences');
    expect(await database.preferences.count()).toBe(0);
  });

  it.each(['light', 'dark'] as const)('preserves saved %s and language instead of applying the new default', async theme => {
    const routine = await repository.createRoutine(input);
    await repository.setCompletion(routine.id, '2026-10-26', true);
    await database.preferences.put({ id: 'app', language: 'en', theme });
    const before = { routines: await database.routines.toArray(), completions: await database.completions.toArray(), preferences: await database.preferences.toArray() };
    database.close();
    database = new HabitDatabase(database.name);
    repository = createRepository(database, () => clock, () => theme === 'light' ? 'dark' : 'light');
    expect((await repository.getSnapshot()).preferences).toEqual({ language: 'en', theme });
    expect({ routines: await database.routines.toArray(), completions: await database.completions.toArray(), preferences: await database.preferences.toArray() }).toEqual(before);
  });

  it('recolors a routine without changing completions, schedules or streaks', async () => {
    const routine = await repository.createRoutine(input);
    await repository.setCompletion(routine.id, '2026-10-26', true);
    const records = await database.completions.toArray();
    const updated = await repository.updateRoutine(routine.id, { ...input, color: '#8b63c7' });
    expect(updated.color).toBe('#8b63c7');
    expect(updated.scheduleHistory).toEqual(routine.scheduleHistory);
    expect(await database.completions.toArray()).toEqual(records);
    expect(calculateStreak(updated, records, '2026-10-26')).toEqual(calculateStreak(routine, records, '2026-10-26'));
  });

  it('persists manual order across reopen and completion/undo never overwrites it', async () => {
    const a = await repository.createRoutine({ ...input, name: 'A' });
    const b = await repository.createRoutine({ ...input, name: 'B' });
    const c = await repository.createRoutine({ ...input, name: 'C' });
    expect(await repository.moveRoutine(c.id, a.id)).toBe(true);
    const beforeCheck = (await database.routines.toArray()).sort(compareManualOrder);
    expect(beforeCheck.map(r => r.id)).toEqual([c.id, a.id, b.id]);
    await repository.setCompletion(c.id, '2026-10-26', true);
    const snapshot = await repository.getSnapshot();
    expect(orderForHome(snapshot.routines, completionIds(snapshot.completions, '2026-10-26'), '2026-10-26').map(r => r.id)).toEqual([a.id, b.id, c.id]);
    expect((await database.routines.toArray()).sort(compareManualOrder)).toEqual(beforeCheck);
    await repository.setCompletion(c.id, '2026-10-26', false);
    database.close();
    database = new HabitDatabase(database.name);
    repository = createRepository(database, () => clock);
    const reopened = await repository.getSnapshot();
    expect(orderForHome(reopened.routines, completionIds(reopened.completions, '2026-10-26'), '2026-10-26').map(r => r.id)).toEqual([c.id, a.id, b.id]);
    expect(reopened.completions).toHaveLength(1);
    expect(reopened.completions[0].completed).toBe(false);
  });

  it('reorders matching slots without changing completion records, schedules or tombstones', async () => {
    const a = await repository.createRoutine({ ...input, name: 'A' });
    const b = await repository.createRoutine({ ...input, name: 'B' });
    const c = await repository.createRoutine({ ...input, name: 'C' });
    const gone = await repository.createRoutine({ ...input, name: 'Gone' });
    await repository.setCompletion(a.id, '2026-10-26', true);
    await repository.setCompletion(gone.id, '2026-10-26', false);
    await repository.deleteRoutine(gone.id);
    const tombstone = await database.routines.get(gone.id);
    const records = await database.completions.toArray();
    clock = new Date(2026, 9, 26, 11);
    await repository.moveRoutine(c.id, b.id);
    expect((await database.routines.toArray()).filter(r => !r.deletedAt).sort(compareManualOrder).map(r => r.id)).toEqual([a.id, c.id, b.id]);
    expect(await database.completions.toArray()).toEqual(records);
    expect(await database.routines.get(gone.id)).toEqual(tombstone);
    expect((await database.routines.get(c.id))?.scheduleHistory).toEqual(c.scheduleHistory);
    expect((await database.routines.get(c.id))?.createdAt).toBe(c.createdAt);
  });

  it('rejects missing/deleted IDs and ignores cross-group or stale drops', async () => {
    const a = await repository.createRoutine(input);
    const b = await repository.createRoutine(input);
    const off = await repository.createRoutine({ ...input, days: [0, 6] });
    const initial = await database.routines.toArray();
    expect(await repository.moveRoutine(a.id, off.id)).toBe(false);
    expect(await database.routines.toArray()).toEqual(initial);
    await repository.setCompletion(a.id, '2026-10-26', true);
    expect(await repository.moveRoutine(a.id, b.id)).toBe(false);
    await expect(repository.moveRoutine('missing', b.id)).rejects.toThrow('routine-not-found');
    await repository.deleteRoutine(b.id);
    await expect(repository.moveRoutine(a.id, b.id)).rejects.toThrow('routine-not-found');
  });

  it('serializes concurrent creations/moves without dropping new routines or duplicating positions', async () => {
    const [a, b, c] = await Promise.all([repository.createRoutine(input), repository.createRoutine(input), repository.createRoutine(input)]);
    expect(new Set((await database.routines.toArray()).map(r => r.sortOrder)).size).toBe(3);
    await Promise.all([repository.moveRoutine(c.id, a.id), repository.createRoutine(input), repository.moveRoutine(b.id, a.id)]);
    const routines = await database.routines.toArray();
    expect(routines).toHaveLength(4);
    expect(new Set(routines.map(r => r.sortOrder)).size).toBe(4);
    expect(routines.map(r => r.id)).toEqual(expect.arrayContaining([a.id, b.id, c.id]));
  });
});
