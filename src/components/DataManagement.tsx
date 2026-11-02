import { useEffect, useRef, useState } from 'react'
import { repository } from '../data/repository'
import { BackupError, backupSummary, type HabitBackup } from '../data/backup'
import { downloadBackup, readBackupFile } from '../backupFile'
import type { Language } from '../domain/types'
import { restoreRoutineFocus } from './DeleteRoutineDialog'
import { dataCopy } from './dataCopy'

type Notice = 'exported' | 'restored' | null
type Failure = 'invalidJson' | 'notBackup' | 'unsupportedVersion' | 'invalidData' | 'tooLarge' | 'exportTooLarge' | 'exportFailed' | 'restoreFailed' | null
function failure(cause: unknown, fallback: Failure): Failure {
  if (!(cause instanceof BackupError)) return fallback
  return { 'invalid-json': 'invalidJson', 'not-backup': 'notBackup', 'unsupported-version': 'unsupportedVersion', 'invalid-data': 'invalidData', 'too-large': 'tooLarge' }[cause.code] as Failure
}

export function DataManagement({ language, busy, onRestore }: { language: Language; busy: boolean; onRestore: (backup: HabitBackup) => Promise<void> }) {
  const t = dataCopy[language], input = useRef<HTMLInputElement>(null), restoreButton = useRef<HTMLButtonElement>(null)
  const pending = useRef(false)
  const [working, setWorking] = useState(false), [preview, setPreview] = useState<HabitBackup | null>(null)
  const [notice, setNotice] = useState<Notice>(null), [error, setError] = useState<Failure>(null)
  const disabled = busy || working
  async function exportData() {
    if (pending.current || busy) return
    pending.current = true; setWorking(true); setNotice(null); setError(null)
    try { downloadBackup(await repository.exportBackup()); setNotice('exported') }
    catch (cause) { setError(cause instanceof BackupError && cause.code === 'too-large' ? 'exportTooLarge' : failure(cause, 'exportFailed')) }
    finally { pending.current = false; setWorking(false) }
  }
  async function selectFile(file?: File) {
    if (!file || pending.current || busy) return
    pending.current = true; setWorking(true); setNotice(null); setError(null)
    try { setPreview(await readBackupFile(file)) }
    catch (cause) { setError(failure(cause, 'invalidJson')) }
    finally { pending.current = false; setWorking(false) }
  }
  async function restore() {
    if (!preview || pending.current || busy) return
    pending.current = true; setWorking(true); setNotice(null); setError(null)
    try { await onRestore(preview); setPreview(null); setNotice('restored') }
    catch (cause) { setError(failure(cause, 'restoreFailed')) }
    finally { pending.current = false; setWorking(false) }
  }
  const status = working ? t.working : notice ? t[notice] : null
  const errorText = error ? t[error] : null
  return <section className="data-card" aria-labelledby="data-title">
    <h2 className="setting-label" id="data-title">{t.title}</h2>
    <p className="data-description">{t.description}</p>
    <div className="data-actions">
      <button type="button" className="secondary-button" disabled={disabled} onClick={() => void exportData()}>{t.backup}</button>
      <button type="button" className="secondary-button" ref={restoreButton} disabled={disabled} onClick={() => input.current?.click()}>{t.restore}</button>
    </div>
    <input ref={input} hidden type="file" accept="application/json,.json" aria-label={t.restore} tabIndex={-1} disabled={disabled} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void selectFile(file) }} />
    <p className="data-transfer">{t.transfer}</p>
    {!preview && status && <p className="data-status" role="status">{status}</p>}
    {!preview && errorText && <p className="data-error" role="alert">{errorText}</p>}
    {preview && <RestoreDialog backup={preview} language={language} busy={disabled} locked={working} status={status} error={errorText} returnFocus={restoreButton.current}
      onBackup={() => void exportData()} onRestore={() => void restore()} onClose={() => { if (!pending.current) { setPreview(null); setError(null); setNotice(null) } }} />}
  </section>
}

function RestoreDialog({ backup, language, busy, locked, status, error, returnFocus, onBackup, onRestore, onClose }: {
  backup: HabitBackup; language: Language; busy: boolean; locked: boolean; status: string | null; error: string | null; returnFocus: HTMLElement | null;
  onBackup: () => void; onRestore: () => void; onClose: () => void
}) {
  const t = dataCopy[language], dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  useEffect(() => {
    const element = dialog.current!
    element.showModal(); heading.current?.focus({ preventScroll: true })
    return () => { element.close(); restoreRoutineFocus(returnFocus) }
  }, [returnFocus])
  const summary = backupSummary(backup)
  const created = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(backup.exportedAt))
  return <dialog className="routine-dialog restore-dialog" ref={dialog} aria-labelledby="restore-title" aria-describedby="restore-warning" onCancel={event => { event.preventDefault(); if (!locked) onClose() }}>
    <div className="editor-sheet">
      <h2 id="restore-title" ref={heading} tabIndex={-1}>{t.confirm}</h2>
      <dl className="backup-summary">
        <div className="backup-date"><dt>{t.created}</dt><dd><time dateTime={backup.exportedAt}>{created}</time></dd></div>
        <div><dt>{t.active}</dt><dd>{summary.active}</dd></div>
        <div><dt>{t.finished}</dt><dd>{summary.finished}</dd></div>
        <div className="backup-date"><dt>{t.records}</dt><dd>{summary.records}</dd></div>
      </dl>
      <p className="data-transfer">{t.recordsNote}</p>
      <p className="data-description" id="restore-warning">{t.replace}</p>
      <button type="button" className="secondary-button backup-current" disabled={busy} onClick={onBackup}>{t.backupCurrent}</button>
      <label className="restore-acknowledge"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} /><span>{t.acknowledge}</span></label>
      {status && <p className="data-status" role="status">{status}</p>}
      {error && <p className="data-error" role="alert">{error}</p>}
      <div className="restore-actions">
        <button type="button" className="secondary-button" disabled={locked} onClick={onClose}>{t.cancel}</button>
        <button type="button" className="primary-button" disabled={busy || !acknowledged} onClick={onRestore}>{t.confirmRestore}</button>
      </div>
    </div>
  </dialog>
}
