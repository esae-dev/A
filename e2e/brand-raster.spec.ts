import { devices, expect, test } from '@playwright/test'
import { standalone } from './standalone'

test.use({ ...devices['Pixel 5'], defaultBrowserType: 'chromium', serviceWorkers: 'block' })

for (const theme of ['light', 'dark'] as const) test(`original ${theme} logo matches transparent PNG and is used in headers and standalone launch`, async ({ page }) => {
  await standalone(page)
  await page.goto('./')
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page.getByRole('button', { name: theme === 'light' ? '라이트' : '다크', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
  await page.getByRole('button', { name: '홈', exact: true }).click()
  const png = `/A/brand/logo-${theme}-raster-v1.png`
  const logo = page.locator(`.brand-logo-${theme}`)
  await expect(logo).toHaveAttribute('src', png)
  await expect.poll(() => logo.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1530)

  const comparison = await page.evaluate(async ({ theme, png }) => {
    const svg = new Image(), raster = new Image()
    svg.src = `/A/brand/logo-${theme}.svg`; raster.src = png
    await Promise.all([svg.decode(), raster.decode()])
    const width = 1530, height = 540
    const pixels = (image: HTMLImageElement) => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(image, 0, 0, width, height)
      return ctx.getImageData(0, 0, width, height).data
    }
    const original = pixels(svg), rendered = pixels(raster)
    let transparent = 0, opaque = 0, errorSum = 0, blackWing = 0, opaqueDifference = 0, alphaErrorSum = 0, edgeMismatch = 0, hardMismatch = 0
    for (let i = 0; i < original.length; i += 4) {
      const a = original[i + 3], b = rendered[i + 3]
      if (b === 0) transparent++
      if (b === 255) opaque++
      alphaErrorSum += Math.abs(a - b)
      if (Math.abs(a - b) > 2) edgeMismatch++
      if ((a === 255 && b === 0) || (a === 0 && b === 255)) hardMismatch++
      for (let channel = 0; channel < 3; channel++) {
        // Ignore undefined RGB in transparent pixels; compare premultiplied
        // colors so anti-aliased edges are checked as they appear on screen.
        const delta = Math.abs(original[i + channel] * a / 255 - rendered[i + channel] * b / 255)
        errorSum += delta
        if (a === 255 && b === 255) opaqueDifference = Math.max(opaqueDifference, Math.abs(original[i + channel] - rendered[i + channel]))
      }
      const x = (i / 4) % width
      if (x < 130 * 3 && b === 255 && Math.max(rendered[i], rendered[i + 1], rendered[i + 2]) < 90) blackWing++
    }
    const corners = [0, width - 1, width * (height - 1), width * height - 1].map(pixel => rendered[pixel * 4 + 3])
    return { width: raster.naturalWidth, height: raster.naturalHeight, transparent, opaque, corners, averageError: errorSum / (width * height * 3), blackWing, opaqueDifference, averageAlphaError: alphaErrorSum / (width * height), edgeMismatch, hardMismatch }
  }, { theme, png })
  expect(comparison).toMatchObject({ width: 1530, height: 540, corners: [0, 0, 0, 0] })
  expect(comparison.transparent).toBeGreaterThan(1530 * 540 * .7)
  expect(comparison.opaque).toBeGreaterThan(10_000)
  // Canvas and screenshot rasterization use slightly different edge coverage.
  // Interior colors must match; only a small fraction of edge pixels may vary.
  expect(comparison.hardMismatch).toBe(0)
  expect(comparison.opaqueDifference).toBeLessThanOrEqual(2)
  expect(comparison.edgeMismatch).toBeLessThan(1530 * 540 * .005)
  expect(comparison.averageAlphaError).toBeLessThan(.15)
  expect(comparison.averageError).toBeLessThan(.15)
  if (theme === 'dark') expect(comparison.blackWing).toBe(0)

  await page.screenshot({ path: `test-results/aeha-raster-${theme}-home.png`, animations: 'disabled' })
  for (const tab of ['스트릭', '설정', '홈']) {
    await page.getByRole('navigation').getByRole('button', { name: tab, exact: true }).click()
    await expect(logo).toBeVisible()
    await expect(logo).toHaveAttribute('src', png)
    const dimensions = await page.locator('.brand-logo').evaluate(el => { const box = el.getBoundingClientRect(); return { width: box.width, height: box.height } })
    expect(dimensions).toEqual({ width: 142, height: 50 })
  }

  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/assets/index-*.js', async route => { await held; await route.continue() })
  try {
    await page.reload({ waitUntil: 'commit' })
    const launch = page.locator(`#launch-brand .launch-${theme}`)
    await expect(page.locator('#launch-brand')).toBeVisible()
    await expect(launch).toHaveAttribute('src', png)
    await expect(page.locator('link[rel="preload"][as="image"]')).toHaveAttribute('href', png)
    await expect.poll(() => launch.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1530)
    await expect(launch).toHaveCSS('width', '248px')
    await page.screenshot({ path: `test-results/aeha-raster-${theme}-launch.png`, animations: 'disabled' })
  } finally { release() }
  await expect(page.getByRole('heading', { name: '오늘의 루틴', exact: true })).toBeVisible()
  await expect(page.locator('#launch-brand')).toBeHidden()
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
})
