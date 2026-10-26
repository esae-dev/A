import { describe, expect, it } from 'vitest'
import type { Routine } from '../domain/types'
import { scheduleLabel } from './scheduleLabel'

const routine: Routine = { id: 'old', name: 'Read', memo: '', category: 'learning', color: '#8b63c7', createdAt: '', updatedAt: '', createdDate: '2026-10-19', scheduleHistory: [{ effectiveFrom: '2026-10-19', days: [5, 2, 0] }] }
describe('home schedule labels', () => {
  it.each([['ko', '화,금,일'], ['en', 'Tue,Fri,Sun']] as const)('sorts days Monday-first with no spaces in %s', (language, expected) => {
    expect(scheduleLabel(routine, '2026-10-25', language)).toEqual({ due: true, daysLabel: expected, full: expected })
  })
  it.each([['ko', '오늘은 쉬는 날 (화,금,일)'], ['en', 'Rest day (Tue,Fri,Sun)']] as const)('includes real days on a rest day in %s', (language, expected) => {
    expect(scheduleLabel(routine, '2026-10-26', language).full).toBe(expected)
    expect(scheduleLabel(routine, '2026-10-26', language).due).toBe(false)
  })
  it('uses the latest effective entry, ignoring future and out-of-order legacy history', () => {
    const old: Routine = { ...routine, scheduleHistory: [{ effectiveFrom: '2026-10-26', days: [6, 1] }, { effectiveFrom: '2026-10-27', days: [2] }, ...routine.scheduleHistory] }
    expect(scheduleLabel(old, '2026-10-26', 'ko')).toEqual({ due: true, daysLabel: '월,토', full: '월,토' })
  })
  it('keeps daily concise and leaves the stored order untouched', () => {
    const old = { ...routine, scheduleHistory: [{ effectiveFrom: '2026-10-19', days: [6, 2, 0, 1, 5, 3, 4] }] } as Routine
    const before = structuredClone(old)
    expect(scheduleLabel(old, '2026-10-26', 'ko').full).toBe('매일')
    expect(scheduleLabel(old, '2026-10-26', 'en').full).toBe('Every day')
    expect(old).toEqual(before)
  })
  it('does not invent days when no entry is effective', () => {
    expect(scheduleLabel({ ...routine, scheduleHistory: [] }, '2026-10-26', 'ko')).toEqual({ due: false, daysLabel: '', full: '오늘은 쉬는 날' })
  })
})
