import { isActiveRoutine, isScheduled } from './routines';
import type { Completion, DateKey, Routine } from './types';

/** The exact pre-v2 ordering, also used to assign migration defaults. */
export function compareLegacyOrder(a: Routine, b: Routine): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

export function compareManualOrder(a: Routine, b: Routine): number {
  const position = (r: Routine) => Number.isFinite(r.sortOrder) ? r.sortOrder! : Number.MAX_SAFE_INTEGER;
  return position(a) - position(b) || compareLegacyOrder(a, b);
}

export function completionIds(completions: readonly Completion[], today: DateKey): Set<string> {
  return new Set(completions.filter(c => c.date === today && c.completed).map(c => c.routineId));
}

/** 0: pending, 1: completed, 2: unavailable. These groups never change manual order. */
export function homeGroup(routine: Routine, completed: ReadonlySet<string>, today: DateKey): number {
  return !isScheduled(routine, today) ? 2 : completed.has(routine.id) ? 1 : 0;
}

export function orderForHome(routines: readonly Routine[], completed: ReadonlySet<string>, today: DateKey): Routine[] {
  return routines.filter(isActiveRoutine).sort((a, b) => homeGroup(a, completed, today) - homeGroup(b, completed, today) || compareManualOrder(a, b));
}

/** Reorder only the chosen group's existing slots; preserve all other positions. */
export function moveWithinHomeGroup(routines: readonly Routine[], activeId: string, overId: string, completed: ReadonlySet<string>, today: DateKey): Routine[] {
  const manual = routines.filter(isActiveRoutine).sort(compareManualOrder);
  const active = manual.find(r => r.id === activeId);
  const over = manual.find(r => r.id === overId);
  if (!active || !over || activeId === overId || homeGroup(active, completed, today) !== homeGroup(over, completed, today)) return manual;
  const group = homeGroup(active, completed, today);
  const members = manual.filter(r => homeGroup(r, completed, today) === group);
  const from = members.findIndex(r => r.id === activeId);
  const to = members.findIndex(r => r.id === overId);
  members.splice(to, 0, members.splice(from, 1)[0]);
  let index = 0;
  return manual.map(r => homeGroup(r, completed, today) === group ? members[index++] : r);
}
