import { supportedLanguages } from '../config';
import { isDateKey } from '../domain/dates';
import { MAX_MEMO_LENGTH, MAX_NAME_LENGTH } from '../domain/routines';
import type { Completion, Routine } from '../domain/types';
import type { PreferenceRecord } from './db';

export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const MAX_RECORDS = 100_000;
export interface BackupData { routines: Routine[]; completions: Completion[]; preferences: PreferenceRecord[] }
export interface HabitBackup { format: 'aeha-backup'; formatVersion: 1; exportedAt: string; data: BackupData }
export type BackupErrorCode = 'invalid-json' | 'not-backup' | 'unsupported-version' | 'invalid-data' | 'too-large';
export class BackupError extends Error {
  constructor(readonly code: BackupErrorCode) { super(code); this.name = 'BackupError'; }
}
function invalid(): never { throw new BackupError('invalid-data'); }
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
const dateKey = (value: unknown): value is string => typeof value === 'string' && isDateKey(value);
function timestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  return Boolean(parts && isDateKey(parts[1]) && +parts[2] < 24 && +parts[3] < 60 && +parts[4] < 60 && (!parts[6] || (+parts[6] < 24 && +parts[7] < 60)) && Number.isFinite(Date.parse(value)));
}

/** Bound nesting/work before walking tables; keep unknown JSON metadata intact. */
function checkStructure(value: unknown) {
  const stack = [{ value, depth: 0 }];
  let nodes = 0, characters = 0;
  while (stack.length) {
    const { value: item, depth } = stack.pop()!;
    if (++nodes > 2_000_000 || depth > 12) invalid();
    if (typeof item === 'string') characters += item.length;
    else if (typeof item === 'number') { if (!Number.isFinite(item)) invalid(); }
    else if (Array.isArray(item)) {
      if (item.length > MAX_RECORDS) invalid();
      for (const child of item) stack.push({ value: child, depth: depth + 1 });
    } else if (object(item)) {
      const keys = Object.keys(item);
      if (keys.length > 64) invalid();
      for (const key of keys) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) invalid();
        characters += key.length;
        stack.push({ value: item[key], depth: depth + 1 });
      }
    } else if (item !== undefined && item !== null && typeof item !== 'boolean') invalid();
    if (characters > MAX_BACKUP_BYTES) throw new BackupError('too-large');
  }
}
function rows(value: unknown, maximum = MAX_RECORDS): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > maximum || !value.every(object)) return invalid();
  return value;
}

/** No normalization: IDs, colors, order, timestamps and optional fields survive. */
export function validateBackup(value: unknown): HabitBackup {
  if (!object(value) || value.format !== 'aeha-backup') throw new BackupError('not-backup');
  if (typeof value.formatVersion !== 'number') invalid();
  if (value.formatVersion !== 1) throw new BackupError('unsupported-version');
  checkStructure(value);
  if (!timestamp(value.exportedAt) || !object(value.data)) invalid();
  const routines = rows(value.data.routines, 10_000), completions = rows(value.data.completions), preferences = rows(value.data.preferences, 1);
  const routineIds = new Set<string>(), completionIds = new Set<string>(), pairs = new Set<string>();
  for (const row of routines) {
    if (!uuid(row.id) || routineIds.has(row.id)) invalid();
    routineIds.add(row.id);
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > MAX_NAME_LENGTH || typeof row.memo !== 'string' || row.memo.length > MAX_MEMO_LENGTH) invalid();
    if (!['other', 'health', 'learning', 'mind', 'life'].includes(row.category as string) || typeof row.color !== 'string' || !/^#[\da-f]{6}$/i.test(row.color)) invalid();
    if (!dateKey(row.createdDate) || !timestamp(row.createdAt) || !timestamp(row.updatedAt)) invalid();
    for (const field of ['deletedAt', 'finishedAt']) if (row[field] !== undefined && !timestamp(row[field])) invalid();
    if (row.finishedDate !== undefined && (!dateKey(row.finishedDate) || row.finishedAt === undefined)) invalid();
    if (row.sortOrder !== undefined && (!Number.isSafeInteger(row.sortOrder) || (row.sortOrder as number) < 0)) invalid();
    const history = rows(row.scheduleHistory, 4096);
    if (!history.length) invalid();
    for (const change of history) {
      if (!dateKey(change.effectiveFrom) || !Array.isArray(change.days) || change.days.length < 1 || change.days.length > 7 || change.days.some(day => !Number.isInteger(day) || day < 0 || day > 6) || new Set(change.days).size !== change.days.length) invalid();
    }
  }
  for (const row of completions) {
    if (!uuid(row.id) || completionIds.has(row.id) || !uuid(row.routineId) || !routineIds.has(row.routineId) || !dateKey(row.date) || typeof row.completed !== 'boolean' || !timestamp(row.createdAt) || !timestamp(row.updatedAt)) invalid();
    const pair = `${row.routineId}/${row.date}`;
    if (pairs.has(pair)) invalid();
    completionIds.add(row.id); pairs.add(pair);
  }
  for (const row of preferences) {
    if (row.id !== 'app' || !supportedLanguages.some(language => language.value === row.language) || !['light', 'dark', 'system'].includes(row.theme as string)) invalid();
  }
  // Detach validated records from the preview/caller before any async DB work.
  return structuredClone(value) as unknown as HabitBackup;
}

export function parseBackup(text: string): HabitBackup {
  if (text.length > MAX_BACKUP_BYTES || new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new BackupError('too-large');
  // Reject pathological nesting before JSON.parse allocates its object tree.
  // Brackets inside quoted/escaped memo text are ordinary user data.
  let depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{' || character === '[') { if (++depth > 12) invalid(); }
    else if (character === '}' || character === ']') depth--;
  }
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new BackupError('invalid-json'); }
  return validateBackup(value);
}
export function serializeBackup(backup: HabitBackup): string {
  const json = JSON.stringify(validateBackup(backup));
  if (new TextEncoder().encode(json).byteLength > MAX_BACKUP_BYTES) throw new BackupError('too-large');
  return json;
}
export function backupSummary(backup: HabitBackup) {
  return {
    active: backup.data.routines.filter(row => !row.deletedAt && !row.finishedAt).length,
    finished: backup.data.routines.filter(row => !row.deletedAt && row.finishedAt).length,
    // Every raw row, including explicit undo and soft-deleted routine history.
    records: backup.data.completions.length,
  };
}
