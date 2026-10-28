import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Language, Routine } from '../domain/types'
import { messages } from '../i18n'
import { Icon } from './Icon'

type Action = (routine: Routine, opener: HTMLElement) => void
export function RoutineActions({ routine, language, disabled, onEdit, onFinish, onDelete }: { routine: Routine; language: Language; disabled: boolean; onEdit: Action; onFinish: Action; onDelete: Action }) {
  const t = messages[language], id = useId()
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const focused = useRef(false)
  const [open, setOpen] = useState(false)
  const [last, setLast] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  function close(restore = false) { focused.current = false; setOpen(false); if (restore) trigger.current?.focus({ preventScroll: true }) }
  function place() {
    if (!trigger.current || !menu.current) return
    const anchor = trigger.current.getBoundingClientRect(), box = menu.current.getBoundingClientRect()
    if (anchor.bottom <= 0 || anchor.top >= innerHeight) { close(); return }
    const bottom = Math.min(innerHeight, document.querySelector('.bottom-nav')?.getBoundingClientRect().top ?? innerHeight) - 8
    setPosition({ left: Math.max(8, Math.min(anchor.right - box.width, document.documentElement.clientWidth - box.width - 8)),
      top: Math.max(8, Math.min(anchor.bottom + box.height + 6 <= bottom ? anchor.bottom + 6 : anchor.top - box.height - 6, bottom - box.height)) })
  }
  useLayoutEffect(() => { if (open) place() }, [open, last])
  useLayoutEffect(() => {
    if (!open || !position || !menu.current || focused.current) return
    const buttons = menu.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    buttons[last ? buttons.length - 1 : 0]?.focus({ preventScroll: true })
    focused.current = true
  }, [open, position, last])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close() }
    const moved = () => place()
    const resized = () => close()
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('scroll', moved, true)
    window.addEventListener('resize', resized)
    window.visualViewport?.addEventListener('resize', resized)
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('scroll', moved, true); window.removeEventListener('resize', resized); window.visualViewport?.removeEventListener('resize', resized) }
  }, [open])
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  function navigate(event: KeyboardEvent) {
    const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      buttons[next]?.focus({ preventScroll: true })
    } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) }
    else if (event.key === 'Tab') {
      event.preventDefault()
      const controls = Array.from(document.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')).filter(el => !menu.current!.contains(el) && el.getClientRects().length)
      const index = controls.indexOf(trigger.current!)
      close(); (controls[index + (event.shiftKey ? -1 : 1)] ?? trigger.current)?.focus()
    }
  }
  function choose(action: Action) { close(); if (trigger.current) action(routine, trigger.current) }
  function show(fromEnd: boolean) { focused.current = false; setLast(fromEnd); setPosition(null); setOpen(true) }
  return <>
    <button className="edit-button" ref={trigger} disabled={disabled} aria-label={`${routine.name} ${t.actions}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => open ? close() : show(false)}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        if (!open) show(event.key === 'ArrowUp')
        else { const buttons = menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'); buttons?.[event.key === 'ArrowUp' ? buttons.length - 1 : 0]?.focus({ preventScroll: true }) }
      } }}><Icon name="more" size={20} /></button>
    {open && createPortal(<div className="routine-menu" ref={menu} id={id} role="menu" aria-label={`${routine.name} ${t.actions}`} style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }} onKeyDown={navigate}
      onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && !trigger.current?.contains(event.relatedTarget as Node)) close() }}>
      <button role="menuitem" tabIndex={-1} onClick={() => choose(onEdit)}>{t.edit}</button>
      <button role="menuitem" tabIndex={-1} onClick={() => choose(onFinish)}>{t.finish}</button>
      <button role="menuitem" tabIndex={-1} className="menu-delete" onClick={() => choose(onDelete)}>{t.remove}</button>
    </div>, document.body)}
  </>
}
