import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Language, Routine } from '../domain/types'
import { messages } from '../i18n'
import { Icon } from './Icon'

type Action = (routine: Routine, opener: HTMLElement) => void
export function RoutineActions({ routine, language, disabled, onEdit, onDelete }: { routine: Routine; language: Language; disabled: boolean; onEdit: Action; onDelete: Action }) {
  const t = messages[language], id = useId()
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [last, setLast] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  function close(restore = false) { setOpen(false); if (restore) trigger.current?.focus({ preventScroll: true }) }
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return
    const anchor = trigger.current.getBoundingClientRect(), box = menu.current.getBoundingClientRect()
    const bottom = Math.min(innerHeight, document.querySelector('.bottom-nav')?.getBoundingClientRect().top ?? innerHeight) - 8
    setPosition({ left: Math.max(8, Math.min(anchor.right - box.width, document.documentElement.clientWidth - box.width - 8)),
      top: Math.max(8, Math.min(anchor.bottom + box.height + 6 <= bottom ? anchor.bottom + 6 : anchor.top - box.height - 6, bottom - box.height)) })
  }, [open, last])
  useLayoutEffect(() => {
    if (!open || !position || !menu.current) return
    const buttons = menu.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    buttons[last ? buttons.length - 1 : 0]?.focus({ preventScroll: true })
  }, [open, position, last])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close() }
    const moved = () => close()
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('scroll', moved, true)
    window.addEventListener('resize', moved)
    window.visualViewport?.addEventListener('resize', moved)
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('scroll', moved, true); window.removeEventListener('resize', moved); window.visualViewport?.removeEventListener('resize', moved) }
  }, [open])
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  function navigate(event: KeyboardEvent) {
    const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      buttons[next]?.focus()
    } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) }
    else if (event.key === 'Tab') {
      event.preventDefault()
      const controls = Array.from(document.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')).filter(el => !menu.current!.contains(el) && el.getClientRects().length)
      const index = controls.indexOf(trigger.current!)
      close(); (controls[index + (event.shiftKey ? -1 : 1)] ?? trigger.current)?.focus()
    }
  }
  function choose(action: Action) { close(); if (trigger.current) action(routine, trigger.current) }
  return <>
    <button className="edit-button" ref={trigger} disabled={disabled} aria-label={`${routine.name} ${t.actions}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { setLast(false); setPosition(null); setOpen(value => !value) }}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setLast(event.key === 'ArrowUp'); setPosition(null); setOpen(true) } }}><Icon name="more" size={20} /></button>
    {open && createPortal(<div className="routine-menu" ref={menu} id={id} role="menu" aria-label={`${routine.name} ${t.actions}`} style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }} onKeyDown={navigate}
      onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && !trigger.current?.contains(event.relatedTarget as Node)) close() }}>
      <button role="menuitem" tabIndex={-1} onClick={() => choose(onEdit)}>{t.edit}</button>
      <button role="menuitem" tabIndex={-1} className="menu-delete" onClick={() => choose(onDelete)}>{t.remove}</button>
    </div>, document.body)}
  </>
}
