import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { HabitDatabase } from './db';
import { createRepository } from './repository';
import { calculateStreak } from '../domain/streak';
import { compareLegacyOrder, compareManualOrder } from '../domain/ordering';
import type { Completion, Routine } from '../domain/types';

// Deliberately create the OLD production schema, not the new database class.
const v1 = { routines: 'id, createdAt, deletedAt', completions: 'id, &[routineId+date], routineId, date, updatedAt', preferences: 'id' };
const connections: Dexie[] = [];
afterEach(async () => { const names = new Set(connections.map(db => db.name)); connections.forEach(db => db.close()); connections.length = 0; for (const name of names) await Dexie.delete(name); });

async function seed() {
  const database = new Dexie(`aeha-upgrade-${crypto.randomUUID()}`);
  connections.push(database);
  database.version(1).stores(v1);
  const base: Routine = { id: 'z', name: '독서', memo: '기존 메모', category: 'learning', color: '#8b63c7',
    scheduleHistory: [{ effectiveFrom: '2026-10-19', days: [0, 1, 2, 3, 4, 5, 6] }, { effectiveFrom: '2026-10-27', days: [2, 4] }],
    createdDate: '2026-10-19', createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-25T04:00:00Z' };
  const routines = [base, { ...base, id: 'a', name: '운동' }, { ...base, id: 'deleted', deletedAt: '2026-10-25T06:00:00Z' }];
  const completions: Completion[] = [
    { id: 'first', routineId: 'z', date: '2026-10-25', completed: true, createdAt: '2026-10-25T02:00:00Z', updatedAt: '2026-10-25T02:00:00Z' },
    { id: 'second', routineId: 'z', date: '2026-10-26', completed: true, createdAt: '2026-10-26T02:00:00Z', updatedAt: '2026-10-26T02:00:00Z' },
    { id: 'undone', routineId: 'a', date: '2026-10-25', completed: false, createdAt: '2026-10-25T02:00:00Z', updatedAt: '2026-10-25T03:00:00Z' },
    { id: 'deleted-record', routineId: 'deleted', date: '2026-10-25', completed: true, createdAt: '2026-10-25T02:00:00Z', updatedAt: '2026-10-25T02:00:00Z' },
  ];
  const preferences = { id: 'app', language: 'en', theme: 'dark' };
  await database.table('routines').bulkPut(routines);
  await database.table('completions').bulkPut(completions);
  await database.table('preferences').put(preferences);
  database.close();
  return { name: database.name, routines, completions, preferences };
}

describe('upgrade real v1 data to v2', () => {
  it('preserves every routine, completion/undo, tombstone, timestamp, schedule and preference', async () => {
    const old = await seed();
    const database = new HabitDatabase(old.name); connections.push(database);
    await database.open();
    expect(database.verno).toBe(2);
    const migrated = await database.routines.toArray();
    expect(migrated.map(({ sortOrder, ...routine }) => routine)).toEqual([...old.routines].sort((a, b) => a.id.localeCompare(b.id)));
    const legacyOrder = [...old.routines].sort(compareLegacyOrder);
    expect([...migrated].sort(compareManualOrder).map(r => r.id)).toEqual(legacyOrder.map(r => r.id));
    expect([...migrated].sort(compareManualOrder).map(r => r.sortOrder)).toEqual([0, 1, 2]);
    expect(await database.completions.toArray()).toEqual([...old.completions].sort((a, b) => a.id.localeCompare(b.id)));
    expect(await database.preferences.get('app')).toEqual(old.preferences);
    const upgraded = migrated.find(r => r.id === 'z')!;
    expect(calculateStreak(upgraded, old.completions, '2026-10-26')).toEqual(calculateStreak(old.routines[0], old.completions, '2026-10-26'));
    const snapshot = await createRepository(database).getSnapshot();
    expect(snapshot.routines.map(r => r.id)).toEqual(['a', 'z']);
    database.close();
    const reopened = new HabitDatabase(old.name); connections.push(reopened);
    expect(await reopened.routines.toArray()).toEqual(migrated);
    expect(await reopened.completions.count()).toBe(4);
    await expect(reopened.completions.add({ ...old.completions[0], id: 'duplicate' })).rejects.toMatchObject({ name: 'ConstraintError' });
  });

  it('rolls back failed upgrade writes and can subsequently upgrade without lost records', async () => {
    const old = await seed();
    const failed = new Dexie(old.name); connections.push(failed);
    failed.version(1).stores(v1);
    failed.version(2).stores({ ...v1, routines: `${v1.routines}, sortOrder` }).upgrade(async tx => {
      await tx.table('routines').update('z', { sortOrder: 99, name: 'not committed' });
      throw new Error('simulate interrupted migration');
    });
    await expect(failed.open()).rejects.toThrow('simulate interrupted migration');
    failed.close();
    const previous = new Dexie(old.name); connections.push(previous);
    previous.version(1).stores(v1);
    expect(await previous.table('routines').get('z')).toEqual(old.routines[0]);
    expect(await previous.table('completions').count()).toBe(4);
    previous.close();
    const upgraded = new HabitDatabase(old.name); connections.push(upgraded);
    await upgraded.open();
    expect((await upgraded.routines.get('z'))?.name).toBe('독서');
    expect(await upgraded.completions.count()).toBe(4);
  });
});
