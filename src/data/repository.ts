import { db, type HabitDatabase } from './db';
import { addDays, isDateKey, localDateKey } from '../domain/dates';
import { isActiveRoutine, isScheduled, normalizeRoutineInput, updateSchedule } from '../domain/routines';
import type { Completion, DateKey, Preferences, Routine, RoutineInput, Theme } from '../domain/types';
import { supportedLanguages, themes } from '../config';
import { compareLegacyOrder, compareManualOrder, completionIds, moveWithinHomeGroup } from '../domain/ordering';

export interface HabitSnapshot {
  routines: Routine[];
  completions: Completion[];
  preferences: Preferences;
}

export class RepositoryError extends Error {
  constructor(readonly code: 'routine-not-found' | 'routine-finished' | 'invalid-completion' | 'invalid-preferences') {
    super(code);
    this.name = 'RepositoryError';
  }
}

const defaultPreferences: Preferences = { language: 'ko', theme: 'dark' };

function currentDeviceTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The UI depends on this API, never on Dexie tables or IndexedDB requests. */
export function createRepository(database: HabitDatabase, now: () => Date = () => new Date(), deviceTheme: () => Theme = currentDeviceTheme) {
  async function requireRoutine(id: string): Promise<Routine> {
    const routine = await database.routines.get(id);
    if (!routine || routine.deletedAt) throw new RepositoryError('routine-not-found');
    if (routine.finishedAt) throw new RepositoryError('routine-finished');
    return routine;
  }

  return {
    getStorageStatus: database.getStorageStatus,
    subscribeStorageStatus: database.subscribeStorageStatus,
    async getSnapshot(): Promise<HabitSnapshot> {
      await database.prepare();
      return database.transaction('rw', database.routines, database.completions, database.preferences, async () => {
        const [allRoutines, allCompletions, savedPreferences] = await Promise.all([
          database.routines.toArray(),
          database.completions.toArray(),
          database.preferences.get('app'),
        ]);
        const routines = allRoutines
          .filter((routine) => !routine.deletedAt)
          .sort(compareLegacyOrder);
        const visibleIds = new Set(routines.map((routine) => routine.id));
        const theme = savedPreferences?.theme === 'system' ? deviceTheme() : savedPreferences?.theme;
        if (savedPreferences?.theme === 'system') {
          // Keep the language and any future fields; never touch routine/history data.
          await database.preferences.put({ ...savedPreferences, theme: theme! });
        }
        return {
          routines,
          completions: allCompletions.filter((completion) => visibleIds.has(completion.routineId)),
          preferences: savedPreferences
            ? { language: savedPreferences.language, theme: theme! }
            : { ...defaultPreferences },
        };
      });
    },

    async createRoutine(input: RoutineInput): Promise<Routine> {
      await database.prepare();
      const values = normalizeRoutineInput(input);
      const date = now();
      const timestamp = date.toISOString();
      const createdDate = localDateKey(date);
      const { days, name, memo, category, color } = values;
      const routine: Routine = {
        name,
        memo,
        category,
        color,
        id: crypto.randomUUID(),
        scheduleHistory: [{ effectiveFrom: createdDate, days }],
        createdDate,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      return database.transaction('rw', database.routines, async () => {
        const last = await database.routines.orderBy('sortOrder').last();
        routine.sortOrder = (last?.sortOrder ?? -1) + 1;
        await database.routines.add(routine);
        return routine;
      });
    },

    async updateRoutine(id: string, input: RoutineInput): Promise<Routine> {
      await database.prepare();
      const { days, name, memo, category, color } = normalizeRoutineInput(input);
      return database.transaction('rw', database.routines, async () => {
        const routine = await requireRoutine(id);
        const date = now();
        const updated: Routine = {
          ...routine,
          name,
          memo,
          category,
          color,
          // Tomorrow preserves the meaning of today's already-recorded work.
          scheduleHistory: updateSchedule(routine.scheduleHistory, days, addDays(localDateKey(date), 1)),
          updatedAt: date.toISOString(),
        };
        await database.routines.put(updated);
        return updated;
      });
    },

    async finishRoutine(id: string): Promise<void> {
      await database.prepare();
      await database.transaction('rw', database.routines, async () => {
        const routine = await database.routines.get(id);
        if (!routine || routine.deletedAt) throw new RepositoryError('routine-not-found');
        if (routine.finishedAt) return;
        const date = now();
        const timestamp = date.toISOString();
        // Inclusive of today's existing check/undo. Never manufacture completion,
        // truncate a schedule or rewrite a historical record when finishing.
        await database.routines.put({ ...routine, finishedAt: timestamp, finishedDate: localDateKey(date), updatedAt: timestamp });
      });
    },

    async deleteRoutine(id: string): Promise<void> {
      await database.prepare();
      await database.transaction('rw', database.routines, async () => {
        const routine = await database.routines.get(id);
        // Retain both routine and completion records for a future sync adapter.
        if (!routine || routine.deletedAt) return;
        const timestamp = now().toISOString();
        await database.routines.put({ ...routine, deletedAt: timestamp, updatedAt: timestamp });
      });
    },

    async setCompletion(routineId: string, date: DateKey, completed: boolean): Promise<void> {
      await database.prepare();
      await database.transaction('rw', database.routines, database.completions, async () => {
        const routine = await requireRoutine(routineId);
        const current = now();
        if (
          typeof completed !== 'boolean' ||
          !isDateKey(date) ||
          date > localDateKey(current) ||
          date < routine.createdDate ||
          !isScheduled(routine, date)
        ) {
          throw new RepositoryError('invalid-completion');
        }
        const existing = await database.completions.where('[routineId+date]').equals([routineId, date]).first();
        if (existing?.completed === completed) return;
        const timestamp = current.toISOString();
        const completion: Completion = existing
          ? { ...existing, completed, updatedAt: timestamp }
          : {
              id: crypto.randomUUID(),
              routineId,
              date,
              completed,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
        // Updating the same record also preserves an explicit false (undo) state.
        await database.completions.put(completion);
      });
    },

    async savePreferences(preferences: Preferences): Promise<void> {
      await database.prepare();
      if (
        !supportedLanguages.some(language => language.value === preferences.language) ||
        !themes.includes(preferences.theme)
      ) {
        throw new RepositoryError('invalid-preferences');
      }
      await database.preferences.put({ id: 'app', language: preferences.language, theme: preferences.theme });
    },

    async moveRoutine(activeId: string, overId: string): Promise<boolean> {
      await database.prepare();
      return database.transaction('rw', database.routines, database.completions, async () => {
        // Re-read data inside the transaction, so stale tabs cannot drop new routines
        // or overwrite completion/schedule changes made while a drag was in progress.
        const routines = (await database.routines.toArray()).filter(isActiveRoutine).sort(compareManualOrder);
        if (!routines.some(r => r.id === activeId) || !routines.some(r => r.id === overId)) throw new RepositoryError('routine-not-found');
        const today = localDateKey(now());
        const records = await database.completions.where('date').equals(today).toArray();
        const moved = moveWithinHomeGroup(routines, activeId, overId, completionIds(records, today), today);
        if (moved.every((r, index) => r.id === routines[index].id)) return false;
        const timestamp = now().toISOString();
        const changed = moved.flatMap((r, index) => r.sortOrder === index ? [] : [{ ...r, sortOrder: index, updatedAt: timestamp }]);
        await database.routines.bulkPut(changed);
        return true;
      });
    },
  };
}

export type HabitRepository = ReturnType<typeof createRepository>;
export const repository = createRepository(db);
