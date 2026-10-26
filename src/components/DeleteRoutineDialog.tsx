import { useEffect, useRef, useState } from 'react'
import type { Language, Routine } from '../domain/types'
import { messages } from '../i18n'

export function restoreRoutineFocus(opener?: HTMLElement | null) {
  const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>('.page-title')
  target?.focus({ preventScroll: true })
}

export function DeleteRoutineDialog({ routine, language, busy, onDelete, onClose, returnFocus }: { routine: Routine; language: Language; busy: boolean; onDelete: () => Promise<void>; onClose: () => void; returnFocus: HTMLElement | null }) {
  const t = messages[language], dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const element = dialog.current!
    element.showModal(); cancel.current?.focus()
    return () => { element.close(); restoreRoutineFocus(returnFocus) }
  }, [returnFocus])
  async function remove() { if (busy) return; setError(false); try { await onDelete() } catch { setError(true) } }
  return <dialog className="routine-dialog delete-dialog" ref={dialog} aria-labelledby="delete-title" aria-describedby="delete-name" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="editor-sheet">
      <h2 id="delete-title">{t.deleteConfirm}</h2>
      <p id="delete-name" className="delete-routine-name">{routine.name}</p>
      {error && <p className="form-error" role="alert">{t.deleteError}</p>}
      <div className="delete-confirmation-actions">
        <button className="secondary-button" ref={cancel} disabled={busy} onClick={onClose}>{t.cancel}</button>
        <button className="danger-button" disabled={busy} onClick={() => void remove()}>{t.remove}</button>
      </div>
    </div>
  </dialog>
}
