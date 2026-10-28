import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import { closestCenter, DndContext, KeyboardSensor, MeasuringStrategy, PointerSensor, useDndContext, useSensor, useSensors, type Announcements, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core'
import { defaultAnimateLayoutChanges, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { completionIds, homeGroup, orderForHome } from '../domain/ordering'
import { isScheduled } from '../domain/routines'
import type { Completion, Language, Routine } from '../domain/types'
import { messages } from '../i18n'
import { Icon } from './Icon'
import { useReducedMotion } from './useReducedMotion'
import { contrastInk } from './colorContrast'
import { RoutineActions } from './RoutineActions'
import { scheduleLabel } from './scheduleLabel'

interface Props {
  routines: Routine[]
  completions: Completion[]
  today: string
  language: Language
  busy: boolean
  onToggle: (routine: Routine) => Promise<void>
  onEdit: (routine: Routine, opener: HTMLElement) => void
  onFinish: (routine: Routine, opener: HTMLElement) => void
  onDelete: (routine: Routine, opener: HTMLElement) => void
  onMove: (activeId: string, overId: string) => Promise<unknown>
}

export function RoutineList(props: Props) {
  const { routines, completions, today, language, busy, onMove } = props
  const t = messages[language]
  const [animateChecks, setAnimateChecks] = useState(false)
  const [pendingChecks, setPendingChecks] = useState<Record<string, boolean>>({})
  const completed = useMemo(() => {
    const ids = completionIds(completions, today)
    for (const [id, done] of Object.entries(pendingChecks)) done ? ids.add(id) : ids.delete(id)
    return ids
  }, [completions, today, pendingChecks])
  const ordered = useMemo(() => orderForHome(routines, completed, today), [routines, completed, today])
  const items = useMemo(() => ordered.map(routine => routine.id), [ordered])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const collisions: CollisionDetection = args => {
    const active = routines.find(r => r.id === args.active.id)
    if (!active) return []
    const group = homeGroup(active, completed, today)
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(container => {
      const candidate = routines.find(r => r.id === container.id)
      return candidate && homeGroup(candidate, completed, today) === group
    }) })
  }
  const name = (id: string | number) => routines.find(r => r.id === id)?.name ?? ''
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${name(active.id)} ${t.dragStart}`,
    onDragOver: ({ active, over }) => over ? `${name(active.id)}, ${name(over.id)} ${t.dragOver}` : undefined,
    onDragEnd: ({ active }) => `${name(active.id)} ${t.dragEnd}`,
    onDragCancel: () => t.dragCancel,
  }
  async function finish({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over || active.id === over.id) return
    try { await onMove(String(active.id), String(over.id)); setStatus(t.orderSaved) }
    catch { setStatus(t.orderError) }
  }
  async function toggle(routine: Routine) {
    // Reflect the tap and begin layout motion without waiting for IndexedDB.
    setAnimateChecks(true)
    setPendingChecks(checks => ({ ...checks, [routine.id]: !completed.has(routine.id) }))
    try { await props.onToggle(routine) }
    catch { /* The parent shows the write error; remove the optimistic state below. */ }
    finally {
      setPendingChecks(checks => { const next = { ...checks }; delete next[routine.id]; return next })
    }
  }

  return <>
    <DndContext sensors={sensors} collisionDetection={collisions} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      modifiers={[({ transform }) => ({ ...transform, x: 0 })]}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t.dragInstructions } }}
      onDragStart={({ active }) => { setAnimateChecks(false); setStatus(''); setActiveId(String(active.id)) }}
      onDragEnd={event => void finish(event)} onDragCancel={() => setActiveId(null)}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className="routine-list">
          {ordered.map(routine => <SortableRoutineCard key={routine.id} {...props} onToggle={toggle} animateChecks={animateChecks} routine={routine}
            done={completed.has(routine.id) && isScheduled(routine, today)} interactionDisabled={busy || activeId !== null || Object.keys(pendingChecks).length > 0} />)}
        </div>
        <RefreshLayoutMeasurements items={items} />
      </SortableContext>
    </DndContext>
    <span className="sr-only" role="status" aria-live="polite">{status}</span>
  </>
}

function RefreshLayoutMeasurements({ items }: { items: string[] }) {
  const { measureDroppableContainers } = useDndContext()
  // SortableContext refreshes measurements during dragging only. After a check
  // regroup, cache the new layout too, so the next undo FLIPs from that position.
  useEffect(() => { measureDroppableContainers(items) }, [items, measureDroppableContainers])
  return null
}

function SortableRoutineCard({ routine, language, today, busy, done, interactionDisabled, animateChecks, onToggle, onEdit, onFinish, onDelete }: Props & { routine: Routine; done: boolean; interactionDisabled: boolean; animateChecks: boolean }) {
  const reducedMotion = useReducedMotion()
  const { measureDroppableContainers } = useDndContext()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, items } = useSortable({
    id: routine.id,
    disabled: { draggable: busy, droppable: false },
    transition: reducedMotion ? null : animateChecks ? { duration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' } : undefined,
    animateLayoutChanges: args => !reducedMotion && (animateChecks ? true : defaultAnimateLayoutChanges(args)),
  })
  const t = messages[language]
  const isDue = isScheduled(routine, today)
  const schedule = scheduleLabel(routine, today, language)
  // Sortable's drag-index gate can cancel an idle FLIP when a saved snapshot
  // replaces the item array. Only its inverted setup frame needs zero duration.
  const checkTransition = transform ? 'transform 0ms linear' : 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1)'
  const style = { '--routine-color': routine.color, '--routine-ink': contrastInk(routine.color), transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : null), transition: reducedMotion ? undefined : animateChecks ? checkTransition : transition } as CSSProperties
  function toggle() {
    // Capture this layout before regrouping. Measurements from a previous FLIP
    // can otherwise miss the next move, especially with different card heights.
    flushSync(() => measureDroppableContainers(items))
    void onToggle(routine)
  }
  return <article ref={setNodeRef} className={`routine-card${done ? ' is-done' : ''}${!isDue ? ' is-off' : ''}${isDragging ? ' is-dragging' : ''}`} style={style}>
    <button className="drag-handle" ref={setActivatorNodeRef} {...attributes} {...listeners}
      aria-label={`${routine.name} ${t.reorder}`} aria-roledescription={t.sortable} disabled={busy}>
      <svg width="18" height="22" viewBox="0 0 18 22" fill="currentColor" aria-hidden="true">
        {[6, 11, 16].map(y => <g key={y}><circle cx="6" cy={y} r="1" /><circle cx="12" cy={y} r="1" /></g>)}
      </svg>
    </button>
    <span className="routine-accent" aria-hidden="true" />
    <div className="routine-content">
      <h2 className="routine-name">{routine.name}</h2>
      <p className={`routine-meta${!isDue && schedule.daysLabel ? ' is-rest' : ''}`} title={schedule.full} aria-label={schedule.full}>{!isDue && schedule.daysLabel ? <><span className="rest-context">{t.off} (</span>{schedule.daysLabel}<span className="rest-context">)</span></> : schedule.full}</p>
    </div>
    {routine.memo && <p className="routine-memo">{routine.memo}</p>}
    <div className="routine-actions">
      <button className="check-button" disabled={!isDue || interactionDisabled} aria-pressed={done} aria-label={`${routine.name} ${!isDue ? t.off : done ? t.undo : t.todo}`} onClick={toggle}>
        {done ? <Icon name="check" size={22} /> : !isDue ? <span aria-hidden="true">−</span> : null}
      </button>
      <RoutineActions routine={routine} language={language} disabled={interactionDisabled} onEdit={onEdit} onFinish={onFinish} onDelete={onDelete} />
    </div>
  </article>
}
