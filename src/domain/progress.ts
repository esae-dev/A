import { completionIds } from './ordering'
import { isActiveRoutine, isScheduled } from './routines'
import type { Completion, DateKey, Routine } from './types'

export function dailyProgress(routines: readonly Routine[], completions: readonly Completion[], today: DateKey) {
  const scheduled = routines.filter(routine => isActiveRoutine(routine) && isScheduled(routine, today))
  const completed = completionIds(completions, today)
  const done = scheduled.filter(routine => completed.has(routine.id)).length
  return { done, total: scheduled.length, allDone: scheduled.length > 0 && done === scheduled.length }
}
