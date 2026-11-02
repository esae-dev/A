import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { HabitDatabase } from './db';
import { createRepository } from './repository';
import { BackupError, MAX_BACKUP_BYTES, backupSummary, parseBackup, serializeBackup, validateBackup, type HabitBackup } from './backup';
import { readBackupFile } from '../backupFile';
import { calculateStreak } from '../domain/streak';
import { recordReferenceDate } from '../domain/routines';
import { compareManualOrder } from '../domain/ordering';
import type { Completion, Routine } from '../domain/types';

const id = (n: number) => `12fba555-1234-4abc-8def-${String(n).padStart(12, '0')}`;
const now = () => new Date('2026-11-02T03:00:00.000Z');
function fixture(): HabitBackup {
  const base: Routine = { id: id(1), name: '독서 📚', memo: '첫 줄\n두 번째 줄', color: '#8b63c7', category: 'learning', sortOrder: 7,
    createdDate: '2026-10-19', createdAt: '2026-10-19T01:00:00Z', updatedAt: '2026-10-26T02:00:00Z',
    scheduleHistory: [{ effectiveFrom: '2026-11-03', days: [2, 5, 0] }, { effectiveFrom: '2026-10-19', days: [0, 1, 2, 3, 4, 5, 6] }] };
  const routines = [base, { ...base, id: id(2), name: '마무리', sortOrder: 2, finishedAt: '2026-10-26T01:00:00Z', finishedDate: '2026-10-26' },
    { ...base, id: id(3), deletedAt: '2026-10-27T00:00:00Z' }, { ...base, id: id(4), finishedAt: '2026-10-26T01:00:00Z', deletedAt: '2026-10-27T00:00:00Z' }];
  const completions: Completion[] = [
    { id: id(101), routineId: id(1), date: '2026-11-02', completed: false, createdAt: '2026-11-02T01:00:00Z', updatedAt: '2026-11-02T02:00:00Z' },
    ...[1, 2, 3, 4].map(n => ({ id: id(101 + n), routineId: id(n), date: '2026-10-20', completed: n !== 3, createdAt: '2026-10-20T01:00:00Z', updatedAt: '2026-10-20T01:00:00Z' })),
  ];
  return { format: 'aeha-backup', formatVersion: 1, exportedAt: now().toISOString(), data: { routines, completions, preferences: [{ id: 'app', language: 'en', theme: 'light' }] } };
}
const databases: HabitDatabase[] = [];
function setup() {
  const db = new HabitDatabase(`aeha-backup-test-${crypto.randomUUID()}`); databases.push(db);
  return { db, repo: createRepository(db, now, () => 'dark') };
}
afterEach(async () => { for (const db of databases.splice(0)) await db.delete(); });

describe('full backup and atomic replacement', () => {
  it('round-trips an empty database without manufacturing preferences or changing the schema', async () => {
    const a = setup(), b = setup(), backup = await a.repo.exportBackup();
    expect(backup.data).toEqual({ routines: [], completions: [], preferences: [] });
    const result = await b.repo.restoreBackup(parseBackup(serializeBackup(backup)));
    expect(result).toEqual({ routines: [], completions: [], preferences: { language: 'ko', theme: 'dark' } });
    expect((await b.repo.exportBackup()).data).toEqual(backup.data);
    expect(b.db.verno).toBe(2);
  });

  it('backs up all raw rows, restores on another DB and re-exports identical records including metadata and undo', async () => {
    const a = setup(), b = setup(), original = fixture();
    const legacy = original.data.routines[0] as Routine & { futureMetadata?: unknown };
    legacy.futureMetadata = { origin: 'old-client', retained: true };
    await a.repo.restoreBackup(original);
    const exported = await a.repo.exportBackup();
    expect(exported.data).toEqual(original.data);
    expect(backupSummary(exported)).toEqual({ active: 1, finished: 1, records: 5 });
    expect((await a.repo.getSnapshot()).routines).toHaveLength(2);
    // Replacement must remove unrelated existing rows on the destination too.
    await b.repo.createRoutine({ name: 'Replace me', memo: '', category: 'other', color: '#6B94E8', days: [1] });
    const next = await b.repo.restoreBackup(parseBackup(serializeBackup(exported)));
    expect((await b.repo.exportBackup()).data).toEqual(exported.data);
    expect(next).toEqual(await a.repo.getSnapshot());
    expect(next.routines.sort(compareManualOrder).map(r => r.id)).toEqual([id(2), id(1)]);
    for (const routine of next.routines) {
      const through = recordReferenceDate(routine, '2026-11-02');
      expect(calculateStreak(routine, next.completions, through)).toEqual(calculateStreak(routine, original.data.completions, through));
    }
    b.db.close();
    expect((await b.repo.exportBackup()).data).toEqual(exported.data);
    const added = await b.repo.createRoutine({ name: 'New', memo: '', category: 'other', color: '#6B94E8', days: [0, 1, 2, 3, 4, 5, 6] });
    expect(original.data.routines.map(r => r.id)).not.toContain(added.id);
    expect(added.id).toMatch(/^[\da-f-]{36}$/);
  });

  it('preserves absent optional fields, out-of-order schedules, legacy system settings and timezone timestamps', async () => {
    const { repo } = setup(), backup = fixture();
    delete backup.data.routines[0].sortOrder;
    delete backup.data.routines[1].finishedDate;
    backup.data.routines[0].updatedAt = '2026-10-26T11:00:00+09:00';
    backup.data.preferences[0].theme = 'system';
    expect((await repo.restoreBackup(backup)).preferences.theme).toBe('dark');
    expect((await repo.exportBackup()).data).toEqual(backup.data);
  });

  it('serializes legacy optional undefined fields as absent, while still requiring the record fields', () => {
    const backup = fixture(); backup.data.routines[0].sortOrder = undefined;
    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.data.routines[0]).not.toHaveProperty('sortOrder');
    expect(parsed.data.routines[0].scheduleHistory).toEqual(backup.data.routines[0].scheduleHistory);
  });

  it('uses a coherent read transaction when another connection writes during export', async () => {
    const { db, repo } = setup(), initial = fixture(); await repo.restoreBackup(initial);
    let writer: Promise<unknown> | undefined;
    db.routines.hook('reading', row => {
      if (!writer) writer = Dexie.ignoreTransaction(() => db.transaction('rw', db.routines, db.completions, async () => {
        await db.routines.update(id(1), { name: 'New name' });
        await db.completions.update(id(101), { completed: true });
      }));
      return row;
    });
    const exported = await repo.exportBackup(); await writer;
    expect(exported.data).toEqual(initial.data);
    expect((await db.routines.get(id(1)))?.name).toBe('New name');
    expect((await db.completions.get(id(101)))?.completed).toBe(true);
  });

  it.each(['routines', 'completions', 'preferences'] as const)('rolls back every table when writing %s fails after replacement begins', async table => {
    const { db, repo } = setup(); await repo.restoreBackup(fixture());
    const before = await repo.exportBackup(), replacement = fixture(); replacement.data.routines[0].name = 'Must not persist';
    const fail = () => { throw new Error('Injected restore write failure'); };
    if (table === 'routines') db.routines.hook('creating', fail);
    if (table === 'completions') db.completions.hook('creating', fail);
    if (table === 'preferences') db.preferences.hook('creating', fail);
    await expect(repo.restoreBackup(replacement)).rejects.toThrow('Injected restore write failure');
    expect((await repo.exportBackup()).data).toEqual(before.data);
    expect(db.verno).toBe(2);
  });
});

const invalidCases: [string, (backup: HabitBackup) => void][] = [
  ['bad routine UUID', b => { b.data.routines[0].id = 'not-a-uuid'; }],
  ['duplicate routine ID', b => { b.data.routines.push(b.data.routines[0]); }],
  ['duplicate completion ID', b => { b.data.completions.push({ ...b.data.completions[0], date: '2026-11-01' }); }],
  ['duplicate routine/date', b => { b.data.completions.push({ ...b.data.completions[0], id: id(999) }); }],
  ['orphan reference', b => { b.data.completions[0].routineId = id(999); }],
  ['bad completion UUID', b => { b.data.completions[0].id = 'x'; }],
  ['bad date', b => { b.data.completions[0].date = '2026-02-30'; }],
  ['bad creation date', b => { b.data.routines[0].createdDate = 'yesterday'; }],
  ['non-boolean completion', b => { Object.assign(b.data.completions[0], { completed: 1 }); }],
  ['empty name', b => { b.data.routines[0].name = ' '; }],
  ['long name', b => { b.data.routines[0].name = 'x'.repeat(81); }],
  ['long memo', b => { b.data.routines[0].memo = 'x'.repeat(501); }],
  ['invalid color', b => { b.data.routines[0].color = 'red'; }],
  ['invalid category', b => { Object.assign(b.data.routines[0], { category: 'invalid' }); }],
  ['invalid order', b => { b.data.routines[0].sortOrder = -1; }],
  ['fractional order', b => { b.data.routines[0].sortOrder = 1.5; }],
  ['empty history', b => { b.data.routines[0].scheduleHistory = []; }],
  ['invalid history date', b => { b.data.routines[0].scheduleHistory[0].effectiveFrom = '2026-13-01'; }],
  ['invalid weekday', b => { Object.assign(b.data.routines[0].scheduleHistory[0], { days: [7] }); }],
  ['duplicate weekday', b => { Object.assign(b.data.routines[0].scheduleHistory[0], { days: [1, 1] }); }],
  ['empty weekdays', b => { b.data.routines[0].scheduleHistory[0].days = []; }],
  ['invalid timestamp', b => { b.data.routines[0].updatedAt = '2026-02-30T00:00:00Z'; }],
  ['invalid time', b => { b.data.completions[0].createdAt = '2026-11-02T25:00:00Z'; }],
  ['invalid deletion', b => { b.data.routines[0].deletedAt = ''; }],
  ['invalid finish', b => { b.data.routines[1].finishedAt = 'invalid'; }],
  ['invalid finish day', b => { b.data.routines[1].finishedDate = '2026-02-30'; }],
  ['finish day without finish', b => { b.data.routines[0].finishedDate = '2026-10-26'; }],
  ['invalid language', b => { Object.assign(b.data.preferences[0], { language: 'ja' }); }],
  ['invalid theme', b => { Object.assign(b.data.preferences[0], { theme: 'pink' }); }],
  ['invalid preferences key', b => { Object.assign(b.data.preferences[0], { id: 'other' }); }],
  ['duplicate preferences', b => { b.data.preferences.push(b.data.preferences[0]); }],
  ['missing table', b => { Reflect.deleteProperty(b.data, 'completions'); }],
];

describe('untrusted backup files', () => {
  it.each(invalidCases)('rejects %s before touching existing records', async (_, edit) => {
    const { repo } = setup(); await repo.restoreBackup(fixture());
    const before = await repo.exportBackup(), broken = fixture(); edit(broken);
    await expect(repo.restoreBackup(broken)).rejects.toMatchObject({ code: 'invalid-data' });
    expect((await repo.exportBackup()).data).toEqual(before.data);
  });
  it('rejects broken JSON, another app and future versions with distinct errors', () => {
    expect(() => parseBackup('{')).toThrowError(new BackupError('invalid-json'));
    expect(() => parseBackup('{"format":"another-app"}')).toThrowError(new BackupError('not-backup'));
    expect(() => parseBackup(JSON.stringify({ ...fixture(), formatVersion: 2 }))).toThrowError(new BackupError('unsupported-version'));
    expect(parseBackup('\uFEFF' + serializeBackup(fixture()))).toEqual(fixture());
  });
  it('rejects oversized, invalid UTF-8 and excessively nested input', async () => {
    await expect(readBackupFile(new File([new Uint8Array(MAX_BACKUP_BYTES + 1)], 'large.json'))).rejects.toMatchObject({ code: 'too-large' });
    await expect(readBackupFile(new File([new Uint8Array([0xff])], 'bad.json'))).rejects.toMatchObject({ code: 'invalid-json' });
    expect(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1))).toThrowError(new BackupError('too-large'));
    const deep = fixture() as HabitBackup & { extra?: unknown };
    let extra: unknown = 'end'; for (let i = 0; i < 20; i++) extra = { nested: extra }; deep.extra = extra;
    expect(() => validateBackup(deep)).toThrowError(new BackupError('invalid-data'));
    expect(() => parseBackup('['.repeat(100_000))).toThrowError(new BackupError('invalid-data'));
    const quoted = fixture(); quoted.data.routines[0].memo = '\\"[{'.repeat(80);
    expect(parseBackup(serializeBackup(quoted))).toEqual(quoted);
    expect(() => parseBackup(JSON.stringify(fixture()).replace('"memo":"', '"__proto__":{},"memo":"'))).toThrowError(new BackupError('invalid-data'));
  });
  it('validates and detaches the original before an asynchronous restore can be mutated', async () => {
    const { repo } = setup(), backup = fixture(), expected = structuredClone(backup.data);
    const restoring = repo.restoreBackup(backup);
    backup.data.routines[0].name = 'Mutation after confirmation';
    await restoring;
    expect((await repo.exportBackup()).data).toEqual(expected);
  });
});
