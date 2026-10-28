import { expect, test, type Page } from '@playwright/test'
import { standalone } from './standalone'

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', colorScheme: 'light' })

async function watchTheme(page: Page) {
  await page.addInitScript(() => {
    const frames: { theme: string; background: string }[] = []
    ;(window as unknown as { initialThemeFrames: typeof frames }).initialThemeFrames = frames
    const sample = () => {
      frames.push({ theme: document.documentElement.dataset.theme ?? '', background: getComputedStyle(document.body ?? document.documentElement).backgroundColor })
      if (frames.length < 80) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
}

async function records(page: Page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.open('eha-habit')
    r.onerror = () => reject(r.error)
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction(['routines', 'completions', 'preferences'])
      const routines = tx.objectStore('routines').getAll(), completions = tx.objectStore('completions').getAll(), preferences = tx.objectStore('preferences').getAll()
      tx.oncomplete = () => { db.close(); resolve({ version: db.version, routines: routines.result, completions: completions.result, preferences: preferences.result }) }
      tx.onerror = () => reject(tx.error)
    }
  }))
}

for (const blockedHint of [false, true]) test(`new standalone user starts dark before JS and stays dark${blockedHint ? ' without localStorage' : ''}`, async ({ page }) => {
  await standalone(page)
  await watchTheme(page)
  if (blockedHint) await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Isolated unavailable presentation hint', 'SecurityError') } }))
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/assets/index-*.js', async route => { await held; await route.continue() })
  await page.goto('./', { waitUntil: 'commit' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(18, 26, 39)')
  await expect(page.locator('#launch-brand')).toHaveCSS('background-color', 'rgb(18, 26, 39)')
  await expect(page.locator('#launch-brand .launch-dark')).toBeVisible()
  release()
  await expect(page.getByRole('heading', { name: '루틴 없음', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => (window as unknown as { initialThemeFrames: unknown[] }).initialThemeFrames.length)).toBeGreaterThanOrEqual(10)
  const frames = await page.evaluate(() => (window as unknown as { initialThemeFrames: { theme: string; background: string }[] }).initialThemeFrames)
  expect(frames.every(f => f.theme === 'dark' && f.background === 'rgb(18, 26, 39)')).toBe(true)
  await page.getByRole('button', { name: '설정', exact: true }).click()
  const buttons = page.getByRole('group', { name: '테마', exact: true }).getByRole('button')
  await expect(buttons).toHaveText(['라이트', '다크'])
  await expect(buttons.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: `test-results/aeha-new-dark${blockedHint ? '-without-hint' : ''}.png`, animations: 'disabled' })
})

for (const theme of ['light', 'dark'] as const) test(`saved ${theme}, English and existing records survive restart and a stale theme hint`, async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '루틴 추가', exact: true }).first().click()
  await page.getByLabel('습관 이름').fill('기존 사용자 기록')
  await page.getByRole('button', { name: '만들기', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '기존 사용자 기록 완료하기', exact: true }).click()
  await expect(page.getByRole('button', { name: '기존 사용자 기록 완료 취소', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page.getByRole('button', { name: theme === 'light' ? '라이트' : '다크', exact: true }).click()
  await page.getByRole('combobox', { name: '언어', exact: true }).selectOption('en')
  const before = await records(page)
  await watchTheme(page)
  await page.reload()
  await expect(page.getByRole('button', { name: '기존 사용자 기록 Undo completion', exact: true })).toBeEnabled()
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect.poll(() => page.evaluate(() => (window as unknown as { initialThemeFrames: unknown[] }).initialThemeFrames.length)).toBeGreaterThanOrEqual(10)
  const frames = await page.evaluate(() => (window as unknown as { initialThemeFrames: { theme: string; background: string }[] }).initialThemeFrames)
  expect(frames.every(f => f.theme === theme && f.background === (theme === 'dark' ? 'rgb(18, 26, 39)' : 'rgb(246, 245, 243)'))).toBe(true)
  expect(await records(page)).toEqual(before)
  // The hint never overrides IndexedDB, even when it is absent or stale.
  for (const hint of [null, theme === 'light' ? 'dark' : 'light']) {
    await page.evaluate(value => value === null ? localStorage.removeItem('aeha-theme-hint') : localStorage.setItem('aeha-theme-hint', value), hint)
    await page.reload()
    await expect(page.getByRole('button', { name: '기존 사용자 기록 Undo completion', exact: true })).toBeEnabled()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    expect(await page.evaluate(() => localStorage.getItem('aeha-theme-hint'))).toBe(theme)
    expect(await records(page)).toEqual(before)
  }
  await page.getByRole('button', { name: 'Streaks', exact: true }).click()
  await expect(page.locator('.streak-value.current')).toHaveText('1')
})

test('Apple icon reference is versioned, square, opaque navy to every edge and works offline', async ({ page, context }) => {
  await page.goto('./')
  const link = page.locator('link[rel="apple-touch-icon"]')
  await expect(link).toHaveAttribute('sizes', '180x180')
  await expect(link).toHaveAttribute('href', '/A/apple-touch-icon-v2.png')
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  const icons = await page.evaluate(async () => {
    const results = []
    const base = new URL('.', document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')!.href)
    for (const name of ['apple-touch-icon.png', 'apple-touch-icon-v2.png']) {
      const response = await fetch(new URL(name, base).href)
      if (!response.ok) throw new Error(`Could not read ${name}`)
      const bitmap = await createImageBitmap(await response.blob())
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(bitmap, 0, 0)
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      let alphaMin = 255, alphaMax = 0, brightEdgePixels = 0, transparentEdgePixels = 0
      const corners = []
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4, alpha = data[i + 3]
        alphaMin = Math.min(alphaMin, alpha); alphaMax = Math.max(alphaMax, alpha)
        if ((x === 0 || x === canvas.width - 1) && (y === 0 || y === canvas.height - 1)) corners.push([...data.slice(i, i + 4)])
        if (Math.min(x, y, canvas.width - 1 - x, canvas.height - 1 - y) < 4) {
          if (alpha !== 255) transparentEdgePixels++
          if (Math.max(data[i], data[i + 1], data[i + 2]) > 100) brightEdgePixels++
        }
      }
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(data).buffer))].map(b => b.toString(16).padStart(2, '0')).join('')
      results.push({ width: bitmap.width, height: bitmap.height, alphaMin, alphaMax, brightEdgePixels, transparentEdgePixels, corners, digest })
      bitmap.close()
    }
    return results
  })
  for (const icon of icons) {
    expect(icon).toMatchObject({ width: 180, height: 180, alphaMin: 255, alphaMax: 255, brightEdgePixels: 0, transparentEdgePixels: 0 })
    expect(icon.corners).toEqual([[40, 54, 79, 255], [29, 42, 65, 255], [27, 39, 62, 255], [16, 28, 48, 255]])
  }
  expect(icons[0].digest).toBe(icons[1].digest)
  await context.setOffline(false)
})
