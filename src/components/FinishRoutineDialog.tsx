import { useEffect, useRef, useState } from 'react'
import type { Language, Routine } from '../domain/types'
import { messages } from '../i18n'
import { restoreRoutineFocus } from './DeleteRoutineDialog'

export function FinishRoutineDialog({ routine, language, busy, onFinish, onClose, returnFocus }: {
  routine: Routine; language: Language; busy: boolean; onFinish: () => Promise<void>; onClose: () => void; returnFocus: HTMLElement | null
}) {
  const t = messages[language], dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const element = dialog.current!
    element.showModal(); cancel.current?.focus()
    return () => { element.close(); restoreRoutineFocus(returnFocus) }
  }, [returnFocus])
  async function finish() {
    if (busy) return
    setError(false)
    try { await onFinish() } catch { setError(true) }
  }
  return <dialog className="routine-dialog finish-dialog" ref={dialog} aria-labelledby="finish-title" aria-describedby="finish-name finish-body" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="editor-sheet">
      <h2 id="finish-title">{t.finishConfirm}</h2>
      <p id="finish-name" className="delete-routine-name">{routine.name}</p>
      <p id="finish-body" className="finish-description">{t.finishBody}</p>
      {error && <p className="form-error" role="alert">{t.finishError}</p>}
      <div className="delete-confirmation-actions">
        <button className="secondary-button" ref={cancel} disabled={busy} onClick={onClose}>{t.cancel}</button>
        <button className="primary-button" disabled={busy} onClick={() => void finish()}>{t.finish}</button>
      </div>
    </div>
  </dialog>
}
