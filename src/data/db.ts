import Dexie, { type Table } from 'dexie';
import type { Completion, Preferences, Routine } from '../domain/types';

export interface PreferenceRecord extends Omit<Preferences, 'theme'> {
  id: 'app';
  /** Read compatibility only; migrated once to a concrete theme by the repository. */
  theme: Preferences['theme'] | 'system';
}

/** Schema versions belong here so data can be migrated without resetting it. */
export class HabitDatabase extends Dexie {
  routines!: Table<Routine, string>;
  completions!: Table<Completion, string>;
  preferences!: Table<PreferenceRecord, string>;

  constructor(name = 'eha-habit') {
    super(name);
    this.version(1).stores({
      routines: 'id, createdAt, deletedAt',
      completions: 'id, &[routineId+date], routineId, date, updatedAt',
      preferences: 'id',
    });
  }
}

export const db = new HabitDatabase();
