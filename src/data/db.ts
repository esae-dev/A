import Dexie, { type Table } from 'dexie';
import type { Completion, Preferences, Routine } from '../domain/types';
import { compareLegacyOrder } from '../domain/ordering';

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
    this.version(2).stores({
      routines: 'id, createdAt, deletedAt, sortOrder',
      completions: 'id, &[routineId+date], routineId, date, updatedAt',
      preferences: 'id',
    }).upgrade(async transaction => {
      // Dexie runs this inside the atomic upgrade transaction. Never clear a table.
      const routines = await transaction.table<Routine>('routines').toArray();
      routines.sort(compareLegacyOrder);
      await transaction.table<Routine>('routines').bulkPut(routines.map((routine, sortOrder) => ({ ...routine, sortOrder })));
    });
  }
}

export const db = new HabitDatabase();
