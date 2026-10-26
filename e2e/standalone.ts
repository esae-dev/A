import type { Page } from '@playwright/test'

/** Emulates the web display-mode only; this does not emulate Android's OS splash. */
export async function standalone(page: Page) {
  await page.addInitScript(() => {
    const match = window.matchMedia.bind(window)
    window.matchMedia = query => {
      const result = match(query)
      if (query === '(display-mode: standalone)') Object.defineProperty(result, 'matches', { value: true })
      return result
    }
  })
}
