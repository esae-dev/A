import { expect, test } from '@playwright/test'

test.use({ timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' })
for (const theme of ['light', 'dark'] as const) test(`settings labels and full-width controls align in ${theme}`, async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page.getByRole('button', { name: theme === 'light' ? '라이트' : '다크', exact: true }).click()
  if (theme === 'dark') await page.getByRole('combobox', { name: '언어' }).selectOption('en')
  for (const width of [320, 375, 390, 700]) {
    await page.setViewportSize({ width, height: 844 })
    const boxes = await page.locator('.setting-row').evaluateAll(rows => rows.map(row => {
      const label = row.firstElementChild!.getBoundingClientRect(), control = row.lastElementChild!.getBoundingClientRect(), card = row.parentElement!.getBoundingClientRect()
      const css = getComputedStyle(row.parentElement!)
      return { label: { x: label.x, right: label.right, bottom: label.bottom, width: label.width }, control: { x: control.x, y: control.y, right: control.right, width: control.width }, cardRight: card.right, padding: parseFloat(css.paddingRight), overflow: row.scrollWidth > row.clientWidth }
    }))
    expect(boxes).toHaveLength(2)
    expect(Math.abs(boxes[0].label.x - boxes[1].label.x)).toBeLessThan(1)
    expect(Math.abs(boxes[0].control.x - boxes[1].control.x)).toBeLessThan(1)
    expect(Math.abs(boxes[0].control.width - boxes[1].control.width)).toBeLessThan(1)
    for (const box of boxes) {
      expect(box.overflow).toBe(false)
      expect(Math.abs(box.control.right - (box.cardRight - box.padding - 1))).toBeLessThan(1)
      if (width <= 360) {
        expect(Math.abs(box.label.x - box.control.x)).toBeLessThan(1)
        expect(box.control.y).toBeGreaterThan(box.label.bottom)
      } else {
        expect(box.label.width).toBe(width >= 600 ? 80 : 72)
        expect(box.control.x).toBeGreaterThan(box.label.right)
        expect(box.control.width).toBeGreaterThan(box.label.width * 2)
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/aeha-settings-aligned-${theme}-${width}.png`, animations: 'disabled' })
  }
})
