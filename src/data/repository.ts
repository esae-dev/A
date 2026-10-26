import { db, type HabitDatabase } from './db';
import { addDays, isDateKey, localDateKey } from '../domain/dates';
import { isScheduled, normalizeRoutineInput, updateSchedule } from '../domain/routines';
import type { Completion, DateKey, Preferences, Routine, RoutineInput, Theme } from '../domain/types';
import { supportedLanguages, themes } from '../config';

export interface HabitSnapshot {
  routines: Routine[];
  completions: Completion[];
  preferences: Preferences;
}

export class RepositoryError extends Error {
  constructor(readonly code: 'routine-not-found' | 'invalid-completion' | 'invalid-preferences') {
    super(code);
    this.name = 'RepositoryError';
  }
}

const defaultPreferences: Preferences = { language: 'ko', theme: 'light' };

function currentDeviceTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The UI depends on this API, never on Dexie tables or IndexedDB requests. */
export function createRepository(database: HabitDatabase, now: () => Date = () => new Date(), deviceTheme: () => Theme = currentDeviceTheme) {
  async function requireRoutine(id: string): Promise<Routine> {
    const routine = await database.routines.get(id);
    if (!routine || routine.deletedAt) throw new RepositoryError('routine-not-found');
    return routine;
  }

  return {
    async getSnapshot(): Promise<HabitSnapshot> {
      return database.transaction('rw', database.routines, database.completions, database.preferences, async () => {
        const [allRoutines, allCompletions, savedPreferences] = await Promise.all([
          database.routines.toArray(),
          database.completions.toArray(),
          database.preferences.get('app'),
        ]);
        const routines = allRoutines
          .filter((routine) => !routine.deletedAt)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
        const activeIds = new Set(routines.map((routine) => routine.id));
        const theme = savedPreferences?.theme === 'system' ? deviceTheme() : savedPreferences?.theme;
        if (savedPreferences?.theme === 'system') {
          // Keep the language and any future fields; never touch routine/history data.
          await database.preferences.put({ ...savedPreferences, theme: theme! });
        }
        return {
          routines,
          completions: allCompletions.filter((completion) => activeIds.has(completion.routineId)),
          preferences: savedPreferences
            ? { language: savedPreferences.language, theme: theme! }
            : { ...defaultPreferences },
        };
      });
    },

    async createRoutine(input: RoutineInput): Promise<Routine> {
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
      await database.routines.add(routine);
      return routine;
    },

    async updateRoutine(id: string, input: RoutineInput): Promise<Routine> {
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

    async deleteRoutine(id: string): Promise<void> {
      await database.transaction('rw', database.routines, async () => {
        const routine = await database.routines.get(id);
        // Retain both routine and completion records for a future sync adapter.
        if (!routine || routine.deletedAt) return;
        const timestamp = now().toISOString();
        await database.routines.put({ ...routine, deletedAt: timestamp, updatedAt: timestamp });
      });
    },

    async setCompletion(routineId: string, date: DateKey, completed: boolean): Promise<void> {
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
      if (
        !supportedLanguages.some(language => language.value === preferences.language) ||
        !themes.includes(preferences.theme)
      ) {
        throw new RepositoryError('invalid-preferences');
      }
      await database.preferences.put({ id: 'app', language: preferences.language, theme: preferences.theme });
    },
  };
}

export type HabitRepository = ReturnType<typeof createRepository>;
export const repository = createRepository(db);
