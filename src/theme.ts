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

let launchFrame = 0

export function finishLaunch(immediate = false) {
  const root = document.documentElement
  if (!root.dataset.launch) return
  if (immediate) { cancelAnimationFrame(launchFrame); root.dataset.launch = 'dismissed'; return }
  if (root.dataset.launch !== 'pending') return
  // Paint the logo even on a cached launch. The app is already rendered and
  // interactive underneath; neither data reads nor a minimum timer gates entry.
  root.dataset.launch = 'revealing'
  launchFrame = requestAnimationFrame(() => {
    launchFrame = requestAnimationFrame(() => {
      if (root.dataset.launch === 'revealing') root.dataset.launch = 'ready'
    })
  })
}
