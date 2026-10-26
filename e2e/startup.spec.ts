import { expect, test } from '@playwright/test'
import { standalone } from './standalone'

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' })

test('standalone preboot uses the existing logo and cached dark surface, then exits without waiting for its animation', async ({ page, context }) => {
  await standalone(page)
  await page.addInitScript(() => localStorage.setItem('aeha-theme-hint', 'dark'))
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/assets/index-*.js', async route => { await held; await route.continue() })
  await page.goto('./', { waitUntil: 'commit' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('#launch-brand')).toBeVisible()
  await expect(page.locator('#launch-brand .launch-dark')).toHaveCSS('opacity', '1')
  await expect(page.locator('#launch-brand')).toHaveCSS('background-color', 'rgb(18, 26, 39)')
  await expect(page.locator('#launch-brand')).toHaveCSS('pointer-events', 'none')
  await expect(page.locator('#launch-brand .launch-dark')).toHaveAttribute('src', '/A/brand/logo-dark.svg')
  await expect.poll(() => page.locator('#launch-brand .launch-dark').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
  await page.screenshot({ path: 'test-results/aeha-standalone-dark-start.png' })
  // Deliberately extend only the test animation. App readiness must not await it.
  await page.addStyleTag({ content: '#launch-brand img{animation-duration:10s}' })
  release()
  await expect(page.getByRole('heading', { name: '오늘의 루틴', exact: true })).toBeVisible()
  await expect(page.locator('#launch-brand')).toBeHidden()
  // IndexedDB is authoritative: a new database defaults to light, regardless of hint.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('aeha-theme-hint'))).toBe('light')
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page.getByRole('button', { name: '다크', exact: true }).click()
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#161f2d')
  await expect(page.locator('.bottom-nav')).toHaveCSS('background-color', 'rgb(22, 31, 45)')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: '오늘의 루틴', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('#launch-brand')).toBeHidden()
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(18, 26, 39)')
  await page.getByRole('button', { name: '루틴 추가', exact: true }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await context.setOffline(false)
})

test('reduced motion skips the web launch layer and storage errors remain actionable', async ({ page }) => {
  await standalone(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => { throw new DOMException('Isolated storage-denied fixture', 'SecurityError') }
  })
  await page.goto('./')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('#launch-brand')).toBeHidden()
  await expect(page.getByRole('button', { name: '다시 시도', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '다시 시도', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
})

test('a dark persisted preference is applied before the module and stays dark on fast subsequent starts', async ({ page }) => {
  await standalone(page)
  await page.goto('./')
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page.getByRole('button', { name: '다크', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.addInitScript(() => {
    const frames: string[] = []
    const logoFrames: boolean[] = []
    ;(window as unknown as { logoFrames: boolean[] }).logoFrames = logoFrames
    ;(window as unknown as { themeFrames: string[] }).themeFrames = frames
    const sample = () => {
      frames.push(document.documentElement.dataset.theme ?? '')
      const layer = document.getElementById('launch-brand'), image = layer?.querySelector<HTMLImageElement>('.launch-dark')
      logoFrames.push(Boolean(layer && image && image.naturalWidth && getComputedStyle(layer).display !== 'none' && getComputedStyle(layer).visibility === 'visible' && Number(getComputedStyle(layer).opacity) > 0 && Number(getComputedStyle(image).opacity) > 0))
      if (frames.length < 40) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: '오늘의 루틴', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeVisible()
  await expect(page.locator('#launch-brand')).toBeHidden()
  await expect.poll(() => page.evaluate(() => (window as unknown as { themeFrames: string[] }).themeFrames.length)).toBeGreaterThan(0)
  const frames = await page.evaluate(() => (window as unknown as { themeFrames: string[] }).themeFrames)
  expect(frames.length).toBeGreaterThan(0)
  expect(frames.every(theme => theme === 'dark')).toBe(true)
  expect(await page.evaluate(() => (window as unknown as { logoFrames: boolean[] }).logoFrames.some(Boolean))).toBe(true)
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#161f2d')
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page.getByRole('button', { name: '라이트', exact: true }).click()
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#ffffff')
  await expect(page.locator('.bottom-nav')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
})
