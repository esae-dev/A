import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { repository } from './data/repository'
import { STORAGE_WAIT_MS } from './data/db'
import { localDateKey } from './domain/dates'
import { isScheduled } from './domain/routines'
import type { Completion, Language, Preferences, Routine, RoutineInput } from './domain/types'
import { supportedLanguages, themes } from './config'
import { messages } from './i18n'
import { Icon } from './components/Icon'
import { RoutineEditor } from './components/RoutineEditor'
import { StreakCard } from './components/StreakCard'
import { BrandLogo } from './components/BrandLogo'
import { RoutineList } from './components/RoutineList'
import { DeleteRoutineDialog } from './components/DeleteRoutineDialog'
import { applyTheme, finishLaunch, initialTheme } from './theme'

type Page = 'home' | 'streak' | 'settings'
type Snapshot = { routines: Routine[]; completions: Completion[]; preferences: Preferences }

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [page, setPage] = useState<Page>('home')
  const [today, setToday] = useState(localDateKey)
  const [error, setError] = useState(false)
  const [editor, setEditor] = useState<Routine | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Routine | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const [bootTheme] = useState(initialTheme)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadDelayed, setLoadDelayed] = useState(false)
  const storageStatus = useSyncExternalStore(repository.subscribeStorageStatus, repository.getStorageStatus)
  const notice = storageStatus === 'reload-required' ? 'reload' : storageStatus === 'blocked' ? 'blocked' : storageStatus === 'slow' || loadDelayed ? 'slow' : null
  const unavailable = notice !== null
  const controlsBusy = busy || unavailable
  const refreshInFlight = useRef<Promise<void> | null>(null)
  const mutationPending = useRef(false)
  const preferences = snapshot?.preferences ?? { language: 'ko', theme: bootTheme }
  const preferencesReady = snapshot !== null
  const language = preferences.language
  const t = messages[language]

  useLayoutEffect(() => { finishLaunch(Boolean(error || notice)) }, [error, notice])

  const refresh = useCallback(() => {
    if (refreshInFlight.current) return refreshInFlight.current
    setLoading(true)
    setLoadDelayed(false)
    const request = (async () => {
      try {
        setSnapshot(await repository.getSnapshot())
        setError(false)
      } catch { setError(true) }
      finally { setLoading(false); setLoadDelayed(false) }
    })()
    refreshInFlight.current = request
    void request.finally(() => { if (refreshInFlight.current === request) refreshInFlight.current = null })
    return request
  }, [])

  useEffect(() => {
    if (!loading) return
    // Also cover an opened DB whose initial read is stalled (no blocked event).
    const timer = window.setTimeout(() => setLoadDelayed(true), STORAGE_WAIT_MS)
    return () => clearTimeout(timer)
  }, [loading])

  useEffect(() => {
    void refresh()
    const onFocus = () => { setToday(localDateKey()); void refresh() }
    const onVisibility = () => { if (!document.hidden) onFocus() }
    const timer = window.setInterval(() => setToday(localDateKey()), 15_000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh])

  useEffect(() => {
    document.documentElement.lang = language
    document.title = `${page === 'home' ? t.todayTitle : t[page]} · AEHA`
  }, [language, page, t])

  useEffect(() => {
    applyTheme(preferences.theme, preferencesReady)
  }, [preferences.theme, preferencesReady])

  function openEditor(routine: Routine | 'new', opener = document.activeElement as HTMLElement | null) {
    returnFocus.current = opener
    setEditor(routine)
  }

  function confirmDelete(routine: Routine, opener: HTMLElement) {
    returnFocus.current = opener
    setDeleting(routine)
  }

  async function deleteRoutine() {
    if (!deleting) return
    await mutate(() => repository.deleteRoutine(deleting.id))
    setDeleting(null)
  }

  async function mutate(action: () => Promise<unknown>, closeEditor = false) {
    if (mutationPending.current) return
    mutationPending.current = true
    setBusy(true)
    try {
      await action()
      setSnapshot(await repository.getSnapshot())
      setToday(localDateKey())
      setError(false)
      if (closeEditor) setEditor(null)
    } catch (cause) {
      setError(true)
      throw cause
    } finally {
      mutationPending.current = false
      setBusy(false)
    }
  }

  async function saveRoutine(input: RoutineInput) {
    await mutate(() => editor && editor !== 'new'
      ? repository.updateRoutine(editor.id, input)
      : repository.createRoutine(input), true)
  }

  const routines = snapshot?.routines ?? []
  const completions = snapshot?.completions ?? []
  const completedToday = new Set(completions.filter(c => c.date === today && c.completed).map(c => c.routineId))
  const scheduled = routines.filter(r => isScheduled(r, today))
  const doneCount = scheduled.filter(r => completedToday.has(r.id)).length
  const dateLabel = new Intl.DateTimeFormat(supportedLanguages.find(item => item.value === language)?.locale, {
    month: 'long', day: 'numeric', weekday: 'long',
  }).format(new Date(`${today}T12:00:00`))

  function changePreferences(next: Partial<Preferences>) {
    void mutate(() => repository.savePreferences({ ...preferences, ...next })).catch(() => {})
  }

  async function toggleRoutine(routine: Routine) {
    // A backgrounded app or a click at midnight can precede the next clock tick.
    const date = localDateKey()
    setToday(date)
    if (!isScheduled(routine, date)) return
    const completed = completions.some(c => c.routineId === routine.id && c.date === date && c.completed)
    await mutate(() => repository.setCompletion(routine.id, date, !completed))
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#" onClick={event => { event.preventDefault(); setPage('home') }} aria-label="AEHA">
          <BrandLogo />
        </a>
      </header>

      <main className={`page-main${page === 'home' ? ' page-main-home' : ''}`} id="main">
        <div className="page-heading">
          {page === 'home' && <p className="eyebrow">{dateLabel}</p>}
          <h1 className="page-title" tabIndex={-1}>{page === 'home' ? t.todayTitle : t[page]}</h1>
        </div>

        {notice && <div className="storage-banner" role="alert">
          <strong>{notice === 'reload' ? t.storageReloadTitle : notice === 'blocked' ? t.storageBlockedTitle : t.storageSlowTitle}</strong>
          <p>{notice === 'reload' ? t.storageReloadBody : t.storageWaitBody}</p>
          <div className="storage-actions">
            {notice !== 'reload' && <button className="secondary-button" onClick={() => void refresh()}>{t.retry}</button>}
            <button className="secondary-button" onClick={() => window.location.reload()}>{t.reload}</button>
          </div>
        </div>}
        {error && !notice && <div className="error-banner" role="alert">
          <p>{t.error}</p><button className="secondary-button" onClick={() => void refresh()}>{t.retry}</button>
        </div>}

        {!snapshot && !error && !notice && <p className="loading-state" role="status">{t.loading}</p>}

        {snapshot && page === 'home' && <>
          {routines.length > 0 && <section className="today-summary" aria-label={t.todayDone}>
            <div className="summary-heading"><span>{t.todayDone}</span><span className="summary-count"><strong>{doneCount}</strong><span> / {scheduled.length}</span></span></div>
            <div className="summary-track" role="progressbar" aria-label={t.progress} aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={scheduled.length || 1}>
              <div className="summary-fill" style={{ width: `${scheduled.length ? doneCount / scheduled.length * 100 : 0}%` }} />
            </div>
          </section>}

          {routines.length === 0 ? <div className="empty-state">
            <div className="empty-symbol"><Icon name="check" size={28} /></div>
            <h2>{t.emptyTitle}</h2>
            <button className="primary-button" disabled={controlsBusy} onClick={() => openEditor('new')}><Icon name="plus" size={18} />{t.add}</button>
          </div> : <RoutineList key={today} routines={routines} completions={completions} today={today} language={language}
            busy={controlsBusy} onToggle={toggleRoutine} onEdit={openEditor} onDelete={confirmDelete}
            onMove={(activeId, overId) => mutate(() => repository.moveRoutine(activeId, overId))} />}
          <button className="fab" aria-label={t.add} disabled={controlsBusy} onClick={() => openEditor('new')}><Icon name="plus" size={26} /></button>
        </>}

        {snapshot && page === 'streak' && (routines.length > 0
          ? <div className="streak-list">{routines.map(routine => <StreakCard key={routine.id} routine={routine} completions={completions} today={today} language={language} />)}</div>
          : <div className="empty-state"><div className="empty-symbol"><Icon name="streak" size={28} /></div><h2>{t.emptyStreakTitle}</h2><button className="primary-button" disabled={controlsBusy} onClick={() => openEditor('new')}><Icon name="plus" size={18} />{t.add}</button></div>)}

        {snapshot && page === 'settings' && <>
          <div className="settings-card">
            <section className="setting-row">
              <label className="setting-label" htmlFor="language-select">{t.language}</label>
              <select className="language-select" id="language-select" value={language} disabled={controlsBusy} onChange={event => changePreferences({ language: event.target.value as Language })}>
                {supportedLanguages.map(item => <option key={item.value} value={item.value} lang={item.value}>{item.label}</option>)}
              </select>
            </section>
            <section className="setting-row">
              <h2 className="setting-label" id="theme-label">{t.theme}</h2>
              <div className="segmented-control" role="group" aria-labelledby="theme-label">
                {themes.map(value => <button key={value} disabled={controlsBusy} className={preferences.theme === value ? 'selected' : ''} aria-pressed={preferences.theme === value} onClick={() => changePreferences({ theme: value })}>{t[value]}</button>)}
              </div>
            </section>
          </div>
        </>}
      </main>

      <nav className="bottom-nav" aria-label={t.navigation}>
        {(['home', 'streak', 'settings'] as Page[]).map(value => <button className={`nav-item${page === value ? ' active' : ''}`} key={value} aria-current={page === value ? 'page' : undefined} onClick={() => { setPage(value); window.scrollTo({ top: 0 }) }}>
          <Icon name={value} size={23} /><span>{t[value]}</span>
        </button>)}
      </nav>
      {editor && <RoutineEditor routine={editor === 'new' ? undefined : editor} language={language} busy={controlsBusy}
        onSave={saveRoutine} onClose={() => { if (!busy) setEditor(null) }} returnFocus={returnFocus.current} />}
      {deleting && <DeleteRoutineDialog routine={deleting} language={language} busy={controlsBusy} returnFocus={returnFocus.current}
        onDelete={deleteRoutine} onClose={() => { if (!busy) setDeleting(null) }} />}
    </div>
  )
}
