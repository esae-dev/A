import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseReloadRequiredError, HabitDatabase, STORAGE_WAIT_MS } from './db';
import { createRepository } from './repository';

const schema1 = { routines: 'id, createdAt, deletedAt', completions: 'id, &[routineId+date], routineId, date, updatedAt', preferences: 'id' };
const connections: Dexie[] = [];
afterEach(async () => {
  vi.useRealTimers(); vi.restoreAllMocks();
  const names = new Set(connections.map(db => db.name));
  connections.forEach(db => db.close()); connections.length = 0;
  for (const name of names) await Dexie.delete(name);
});

describe('database connection lifecycle', () => {
  it('reports a real blocked v1→v2 upgrade and recovers the original records after the holder closes', async () => {
    const old = new Dexie(`aeha-blocked-${crypto.randomUUID()}`); connections.push(old);
    old.version(1).stores(schema1);
    old.on('versionchange', () => false); // Simulate an unresponsive/frozen old tab.
    const routine = { id: 'old', name: 'Read', memo: 'preserve', category: 'learning', color: '#8b63c7', createdDate: '2026-10-19', createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-25T01:00:00Z', scheduleHistory: [{ effectiveFrom: '2026-10-19', days: [0, 1, 2, 3, 4, 5, 6] }] };
    const completion = { id: 'record', routineId: 'old', date: '2026-10-25', completed: true, createdAt: '2026-10-25T00:00:00Z', updatedAt: '2026-10-25T00:00:00Z' };
    await old.table('routines').put(routine);
    await old.table('completions').put(completion);
    await old.table('preferences').put({ id: 'app', language: 'en', theme: 'dark' });
    const current = new HabitDatabase(old.name); connections.push(current);
    const states: string[] = [];
    const unsubscribe = current.subscribeStorageStatus(() => states.push(current.getStorageStatus()));
    const pending = createRepository(current).getSnapshot();
    await vi.waitFor(() => expect(current.getStorageStatus()).toBe('blocked'));
    expect(current.isOpen()).toBe(false);
    expect(current.prepare()).toBe(current.prepare());
    expect(await old.table('routines').get('old')).toEqual(routine);
    old.close();
    const snapshot = await pending;
    expect(snapshot.routines).toEqual([{ ...routine, sortOrder: 0 }]);
    expect(snapshot.completions).toEqual([completion]);
    expect(snapshot.preferences).toEqual({ language: 'en', theme: 'dark' });
    expect(current.getStorageStatus()).toBe('ready');
    expect(states).toEqual(expect.arrayContaining(['opening', 'blocked', 'ready']));
    unsubscribe();
  });

  it('closes an existing connection on versionchange and prevents obsolete code from reopening it', async () => {
    const current = new HabitDatabase(`aeha-versionchange-${crypto.randomUUID()}`); connections.push(current);
    const repository = createRepository(current);
    const routine = await repository.createRoutine({ name: 'Keep', memo: '', category: 'other', color: '#3974db', days: [0, 1, 2, 3, 4, 5, 6] });
    const future = new Dexie(current.name); connections.push(future);
    // Only this isolated test database goes to v3; the application schema stays v2.
    future.version(3).stores({ ...schema1, routines: `${schema1.routines}, sortOrder` });
    await future.open();
    expect(current.isOpen()).toBe(false);
    expect(current.getStorageStatus()).toBe('reload-required');
    await expect(repository.getSnapshot()).rejects.toBeInstanceOf(DatabaseReloadRequiredError);
    await expect(current.routines.count()).rejects.toMatchObject({ name: 'DatabaseClosedError' });
    expect(await future.table('routines').get(routine.id)).toEqual(routine);
  });

  it('reports an unusually slow open even without a blocked event, then clears it on recovery', async () => {
    const database = new HabitDatabase(`aeha-slow-${crypto.randomUUID()}`); connections.push(database);
    vi.useFakeTimers();
    let resolve!: (db: Dexie) => void;
    const pending = new Dexie.Promise<Dexie>(done => { resolve = done; });
    const open = vi.spyOn(database, 'open').mockReturnValue(pending);
    const deleting = vi.spyOn(database, 'delete');
    const ready = database.prepare();
    expect(database.prepare()).toBe(ready);
    await Promise.resolve();
    vi.advanceTimersByTime(STORAGE_WAIT_MS + 1);
    expect(database.getStorageStatus()).toBe('slow');
    expect(open).toHaveBeenCalledTimes(1);
    expect(deleting).not.toHaveBeenCalled();
    resolve(database);
    await ready;
    expect(database.getStorageStatus()).toBe('ready');
  });

  it('permits a fresh open after an error without deleting the database', async () => {
    const database = new HabitDatabase(`aeha-retry-${crypto.randomUUID()}`); connections.push(database);
    const open = vi.spyOn(database, 'open').mockRejectedValueOnce(new Error('temporary storage error')).mockResolvedValueOnce(database);
    const deleting = vi.spyOn(database, 'delete');
    await expect(database.prepare()).rejects.toThrow('temporary storage error');
    expect(database.getStorageStatus()).toBe('error');
    await database.prepare();
    expect(database.getStorageStatus()).toBe('ready');
    expect(open).toHaveBeenCalledTimes(2);
    expect(deleting).not.toHaveBeenCalled();
  });
});
