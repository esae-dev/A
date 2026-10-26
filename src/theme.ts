import type { Theme } from './domain/types'

/** Presentation hint only. IndexedDB remains the authoritative preference. */
export function initialTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme: Theme, remember: boolean) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#161f2d' : '#ffffff')
  if (remember) {
    try { localStorage.setItem('aeha-theme-hint', theme) } catch { /* An unavailable hint must never block records. */ }
  }
}

export function finishLaunch(immediate = false) {
  const root = document.documentElement
  if (!root.dataset.launch) return
  if (immediate) { root.dataset.launch = 'dismissed'; return }
  if (root.dataset.launch !== 'pending') return
  const started = performance.getEntriesByName('aeha-launch-start')[0]?.startTime ?? performance.now()
  // If the delayed logo never appeared, skip even the exit fade.
  root.dataset.launch = performance.now() - started < 100 ? 'dismissed' : 'ready'
}
