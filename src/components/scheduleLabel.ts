import type { Language, Routine } from '../domain/types'
import { effectiveSchedule, isScheduled } from '../domain/routines'
import { messages, weekdays } from '../i18n'

export function scheduleLabel(routine: Routine, date: string, language: Language) {
  const days = [...new Set(effectiveSchedule(routine, date)?.days ?? [])].sort((a, b) => a - b)
  const daysLabel = days.length === 7 ? messages[language].daily : days.map(day => weekdays[language][day]).join(',')
  const due = isScheduled(routine, date)
  return { due, daysLabel, full: due ? daysLabel : `${messages[language].off}${daysLabel ? ` (${daysLabel})` : ''}` }
}
