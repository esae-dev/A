import { describe, expect, it } from 'vitest';
import { compareManualOrder, moveWithinHomeGroup, orderForHome } from './ordering';
import type { Routine } from './types';

const today = '2026-10-26';
function routine(id: string, sortOrder?: number, off = false): Routine {
  return { id, sortOrder, name: id, memo: '', category: 'other', color: '#3974db', createdDate: today,
    createdAt: `${today}T00:00:00Z`, updatedAt: `${today}T00:00:00Z`,
    scheduleHistory: [{ effectiveFrom: today, days: off ? [0, 6] : [0, 1, 2, 3, 4, 5, 6] }] };
}
const ids = (routines: Routine[]) => routines.map(r => r.id);

describe('manual and home order', () => {
  it('groups pending, completed and off days while retaining each group’s manual order', () => {
    const records = [routine('a', 3), routine('b', 1), routine('off', 0, true), routine('c', 2)];
    expect(ids(orderForHome(records, new Set(['b', 'off']), today))).toEqual(['c', 'a', 'b', 'off']);
  });
  it('restores the manual position after unchecking without changing sort metadata', () => {
    const records = [routine('a', 0), routine('b', 1), routine('c', 2)];
    const before = structuredClone(records);
    expect(ids(orderForHome(records, new Set(['a']), today))).toEqual(['b', 'c', 'a']);
    expect(ids(orderForHome(records, new Set(), today))).toEqual(['a', 'b', 'c']);
    expect(records).toEqual(before);
  });
  it('moves only matching group slots and restores hidden manual positions on undo', () => {
    const a = routine('a', 0), b = routine('b', 1), c = routine('c', 2), d = routine('d', 3);
    const records = [a, b, c, d];
    const moved = moveWithinHomeGroup(records, 'd', 'b', new Set(['a', 'c']), today);
    expect(ids(moved)).toEqual(['a', 'd', 'c', 'b']);
    expect(ids(records)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('does not allow cross-group, missing or self drops', () => {
    const records = [routine('a', 0), routine('b', 1), routine('off', 2, true)];
    for (const [from, to] of [['a', 'b'], ['a', 'off'], ['missing', 'a'], ['a', 'a']]) {
      expect(ids(moveWithinHomeGroup(records, from, to, new Set(['b']), today))).toEqual(['a', 'b', 'off']);
    }
  });
  it('uses legacy creation/ID order for old or tied positions and hides tombstones', () => {
    const records = [routine('z'), routine('a'), { ...routine('gone', -1), deletedAt: '2026-10-26T01:00:00Z' }];
    expect(ids(orderForHome(records, new Set(), today))).toEqual(['a', 'z']);
    expect([routine('z', 1), routine('a', 1)].sort(compareManualOrder).map(r => r.id)).toEqual(['a', 'z']);
  });
  it('recomputes groups for the new local day without carrying yesterday’s completed group', () => {
    const records = [routine('a', 0), routine('b', 1)];
    expect(ids(orderForHome(records, new Set(['a']), today))).toEqual(['b', 'a']);
    expect(ids(orderForHome(records, new Set(), '2026-10-27'))).toEqual(['a', 'b']);
  });
});
