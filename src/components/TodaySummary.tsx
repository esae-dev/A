import { useLayoutEffect, useRef, useState } from 'react'
import type { dailyProgress } from '../domain/progress'
import type { Language } from '../domain/types'
import { messages } from '../i18n'
import { Icon } from './Icon'
import { useReducedMotion } from './useReducedMotion'

export function TodaySummary({ progress, completionEvent, language }: {
  progress: ReturnType<typeof dailyProgress>
  completionEvent: number
  language: Language
}) {
  const t = messages[language]
  const { done, total, allDone } = progress
  const reducedMotion = useReducedMotion()
  const previousEvent = useRef(completionEvent)
  const [entering, setEntering] = useState(false)

  useLayoutEffect(() => {
    const triggered = previousEvent.current !== completionEvent
    previousEvent.current = completionEvent
    // Mounting an already-complete summary (reload or tab return) is not an event.
    setEntering(triggered && allDone && !reducedMotion)
  }, [completionEvent, allDone, reducedMotion])

  return <section className={`today-summary${allDone ? ' is-complete' : ''}${allDone && entering && !reducedMotion ? ' is-completing' : ''}`} aria-label={t.todayDone}>
    <div className="summary-heading">
      <span className="summary-label" role="status" aria-live="polite" aria-atomic="true" onAnimationEnd={event => { if (event.animationName === 'summary-label-in') setEntering(false) }}>{allDone && <Icon name="check" size={15} />}{allDone ? t.allDoneToday : t.todayDone}</span>
      <span className="summary-count"><strong>{done}</strong><span> / {total}</span></span>
    </div>
    <div className="summary-track" role="progressbar" aria-label={t.progress} aria-valuenow={done} aria-valuemin={0} aria-valuemax={total || 1}>
      <div className="summary-fill" style={{ width: `${total ? done / total * 100 : 0}%` }} />
    </div>
  </section>
}
