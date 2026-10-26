import Dexie, { type Table } from 'dexie';
import type { Completion, Preferences, Routine } from '../domain/types';
import { compareLegacyOrder } from '../domain/ordering';

export interface PreferenceRecord extends Omit<Preferences, 'theme'> {
  id: 'app';
  /** Read compatibility only; migrated once to a concrete theme by the repository. */
  theme: Preferences['theme'] | 'system';
}

export type StorageStatus = 'idle' | 'opening' | 'ready' | 'blocked' | 'slow' | 'reload-required' | 'error';
export const STORAGE_WAIT_MS = 8000;

export class DatabaseReloadRequiredError extends Error {
  constructor() { super('Reload AEHA to use the updated database'); this.name = 'DatabaseReloadRequiredError'; }
}

/** Schema versions belong here so data can be migrated without resetting it. */
export class HabitDatabase extends Dexie {
  routines!: Table<Routine, string>;
  completions!: Table<Completion, string>;
  preferences!: Table<PreferenceRecord, string>;
  private storageStatus: StorageStatus = 'idle';
  private listeners = new Set<() => void>();
  private preparing: Promise<void> | null = null;
  getStorageStatus = (): StorageStatus => this.storageStatus;
  subscribeStorageStatus = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private report(status: StorageStatus) {
    if (status === this.storageStatus) return;
    this.storageStatus = status;
    this.listeners.forEach(listener => listener());
  }

  prepare(): Promise<void> {
    if (this.storageStatus === 'reload-required') return Promise.reject(new DatabaseReloadRequiredError());
    if (this.isOpen()) return Promise.resolve();
    if (!this.preparing) {
      this.report('opening');
      const timer = setTimeout(() => {
        if (this.storageStatus === 'opening') this.report('slow');
      }, STORAGE_WAIT_MS);
      // Retain the pending native request, so repeated retries do not queue more upgrades.
      this.preparing = Promise.resolve().then(() => this.open()).then(() => {
        if (this.storageStatus === 'reload-required') throw new DatabaseReloadRequiredError();
        this.report('ready');
      }).catch(error => {
        if (this.storageStatus !== 'reload-required') this.report('error');
        throw error;
      }).finally(() => { clearTimeout(timer); this.preparing = null; });
    }
    return this.preparing;
  }

  constructor(name = 'eha-habit') {
    super(name);
    this.on('blocked', () => { this.report('blocked'); });
    this.on('ready', () => { if (this.storageStatus !== 'reload-required') this.report('ready'); }, true);
    this.on('versionchange', () => {
      // IDB close lets existing transactions finish. Disable automatic reopening by
      // obsolete code, otherwise an old tab can reconnect while the upgrade waits.
      this.close();
      this.report('reload-required');
      return false; // Replace Dexie's default handler, which allows auto-open again.
    });
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
