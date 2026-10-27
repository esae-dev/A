import { describe, expect, it } from 'vitest'
import { dailyProgress } from './progress'
import type { Completion, Routine } from './types'

const today = '2026-10-26'
const routine = (id: string, days = [0, 1, 2, 3, 4, 5, 6]): Routine => ({
  id, name: id, memo: '', category: 'other', color: '#6b94e8', createdDate: '2026-10-19',
  createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-19T00:00:00Z',
  scheduleHistory: [{ effectiveFrom: '2026-10-19', days: days as Routine['scheduleHistory'][number]['days'] }],
})
const completion = (routineId: string, completed = true, date = today): Completion => ({
  id: `${routineId}-${date}`, routineId, date, completed, createdAt: `${date}T00:00:00Z`, updatedAt: `${date}T00:00:00Z`,
})

describe('daily completion progress', () => {
  it('never completes an empty day, including a day containing only off-day routines', () => {
    expect(dailyProgress([], [], today)).toEqual({ done: 0, total: 0, allDone: false })
    expect(dailyProgress([routine('off', [0])], [completion('off')], today)).toEqual({ done: 0, total: 0, allDone: false })
  })
  it('completes only when every due routine has a true record for the current date', () => {
    const routines = [routine('a'), routine('b'), routine('off', [0])]
    expect(dailyProgress(routines, [completion('a'), completion('b', true, '2026-10-25')], today)).toEqual({ done: 1, total: 2, allDone: false })
    expect(dailyProgress(routines, [completion('a'), completion('b')], today)).toEqual({ done: 2, total: 2, allDone: true })
    expect(dailyProgress(routines, [completion('a'), completion('b', false)], today)).toEqual({ done: 1, total: 2, allDone: false })
  })
  it('excludes deleted, future-created and off-day records from both counts', () => {
    const routines = [routine('a'), { ...routine('deleted'), deletedAt: '2026-10-25T00:00:00Z' }, { ...routine('future'), createdDate: '2026-10-27' }, routine('off', [0])]
    expect(dailyProgress(routines, routines.map(r => completion(r.id)), today)).toEqual({ done: 1, total: 1, allDone: true })
  })
  it('uses the history effective on each local date without changing stored data', () => {
    const r = { ...routine('a'), scheduleHistory: [{ effectiveFrom: '2026-10-27', days: [0] as const }, { effectiveFrom: '2026-10-19', days: [1] as const }] }
    const routines: Routine[] = [{ ...r, scheduleHistory: r.scheduleHistory.map(s => ({ ...s, days: [...s.days] })) }]
    const records = [completion('a')], before = structuredClone({ routines, records })
    expect(dailyProgress(routines, records, today).allDone).toBe(true)
    expect(dailyProgress(routines, records, '2026-10-27')).toEqual({ done: 0, total: 0, allDone: false })
    expect({ routines, records }).toEqual(before)
  })
  it('does not count duplicate or orphaned completion records as additional routines', () => {
    expect(dailyProgress([routine('a'), routine('b')], [completion('a'), { ...completion('a'), id: 'duplicate' }, completion('missing')], today)).toEqual({ done: 1, total: 2, allDone: false })
  })
})
