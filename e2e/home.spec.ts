import { expect, test, type Page } from '@playwright/test'

test.use({ timezoneId: 'Asia/Seoul' })

async function createRoutine(page: Page, name: string, color: string, memo: string, weekend = false) {
  await page.getByRole('button', { name: '루틴 추가', exact: true }).first().click()
  await page.getByLabel('습관 이름').fill(name)
  await page.getByLabel('메모').fill(memo)
  await expect(page.getByLabel('카테고리')).toHaveCount(0)
  await page.getByRole('button', { name: color, exact: true }).click()
  if (weekend) {
    await page.getByRole('button', { name: '요일 선택', exact: true }).click()
    for (const day of ['월요일', '화요일', '수요일', '목요일', '금요일']) {
      await page.getByRole('button', { name: day, exact: true }).click()
    }
  }
  await page.getByRole('button', { name: '만들기', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function checkGraphLayout(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  const graph = page.locator('.heatmap-scroll').first()
  await expect.poll(() => graph.evaluate(element => {
    const clip = element.getBoundingClientRect()
    return Array.from(element.querySelectorAll('.heatmap-week')).every(week => {
      const box = week.getBoundingClientRect()
      const visibleWidth = Math.max(0, Math.min(clip.right, box.right) - Math.max(clip.left, box.left))
      return visibleWidth < .5 || Math.abs(visibleWidth - box.width) < .5
    })
  })).toBe(true)
  const metrics = await graph.evaluate(element => {
    const clip = element.getBoundingClientRect()
    const cells = Array.from(element.querySelectorAll('.heatmap-cell')).map(cell => cell.getBoundingClientRect())
    const months = Array.from(element.querySelectorAll('.heatmap-months > span')).filter(label => label.textContent).map(label => {
      const range = document.createRange()
      range.selectNodeContents(label)
      const box = range.getBoundingClientRect()
      return { left: box.left, right: box.right }
    })
    const layout = element.closest('.heatmap-layout')!
    const weekdayTop = layout.querySelector('.heatmap-weekdays span')!.getBoundingClientRect().top
    return {
      overflowing: element.scrollWidth > element.clientWidth,
      square: cells.every(cell => cell.width >= 13 && Math.abs(cell.width - cell.height) < .1),
      axisDelta: Math.abs(weekdayTop - cells[0].top),
      labelsInside: months.every(box => box.left >= clip.left && box.right <= clip.right),
    }
  })
  expect(metrics).toMatchObject({ overflowing: true, square: true, labelsInside: true })
  expect(metrics.axisDelta).toBeLessThan(1)
  await graph.evaluate(element => element.scrollTo({ left: 0 }))
  await expect.poll(() => graph.evaluate(element => element.scrollLeft)).toBe(0)
  await graph.evaluate(element => element.scrollTo({ left: element.scrollWidth }))
  await expect.poll(() => graph.evaluate(element => Math.abs(element.scrollLeft - (element.scrollWidth - element.clientWidth)))).toBeLessThan(1)
}

for (const width of [390, 375, 320]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`AEHA mixed home states and editor at ${width}px in ${theme}`, async ({ page, browser }) => {
      // Playwright gives each test an isolated browser context and IndexedDB.
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.setViewportSize({ width, height: width === 390 ? 844 : width === 375 ? 812 : 568 })
      await page.clock.setFixedTime(new Date('2026-10-26T12:00:00+09:00'))
      await page.goto('./')
      await createRoutine(page, '독서 10쪽', 'Lilac', '잠들기 전 10분')
      await page.clock.setFixedTime(new Date('2026-10-26T12:01:00+09:00'))
      await createRoutine(page, '가벼운 스트레칭', 'Fresh Mint', '하루 5분')
      await page.clock.setFixedTime(new Date('2026-10-26T12:02:00+09:00'))
      await createRoutine(page, '주말 산책', 'Soft Coral', '토요일 · 일요일', true)
      await page.getByRole('button', { name: '독서 10쪽 완료하기', exact: true }).click()
      await expect(page.getByRole('button', { name: '독서 10쪽 완료 취소', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', { name: '설정', exact: true }).click()
      await page.getByRole('button', { name: theme === 'light' ? '라이트' : '다크', exact: true }).click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await page.getByRole('button', { name: '홈', exact: true }).click()
      await page.reload()
      await expect(page.getByRole('link', { name: 'AEHA', exact: true })).toBeVisible()
      const logo = page.locator(`.brand-logo-${theme}`)
      await expect(logo).toBeVisible()
      await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
      await expect(page).toHaveTitle('오늘의 루틴 · AEHA')
      await expect(page.locator('.routine-card')).toHaveCount(3)
      await expect(page.locator('.routine-card.is-done')).toHaveCount(1)
      await expect(page.locator('.routine-card.is-off')).toHaveCount(1)
      await expect(page.getByRole('button', { name: '가벼운 스트레칭 완료하기', exact: true })).toBeEnabled()
      await expect(page.getByRole('button', { name: '주말 산책 오늘은 쉬는 날', exact: true })).toBeDisabled()
      await expect(page.locator('.summary-count')).toHaveText('1 / 2')
      await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(3)
      await expect(page.locator('.page-description, .settings-note, .summary-message')).toHaveCount(0)
      const colors = await page.locator('.routine-accent').evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor))
      expect(new Set(colors).size).toBe(3)
      for (const button of await page.locator('.check-button').all()) {
        const box = (await button.boundingBox())!
        expect(box.width).toBeGreaterThanOrEqual(44)
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
      await page.evaluate(() => window.scrollTo(0, 0))
      expect((await page.locator('.routine-card').first().boundingBox())!.y).toBeLessThan(280)
      const fab = (await page.locator('.fab').boundingBox())!
      const nav = (await page.locator('.bottom-nav').boundingBox())!
      expect(fab.y + fab.height).toBeLessThan(nav.y)
      for (const button of await page.locator('.check-button, .edit-button').all()) {
        const box = (await button.boundingBox())!
        const overlaps = fab.x < box.x + box.width && fab.x + fab.width > box.x && fab.y < box.y + box.height && fab.y + fab.height > box.y
        expect(overlaps).toBe(false)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      await page.screenshot({ path: `test-results/aeha-${theme}-home-${width}.png`, animations: 'disabled' })
      await page.getByRole('button', { name: '루틴 추가', exact: true }).click()
      await expect(page.getByLabel('습관 이름')).toBeFocused()
      await page.getByLabel('습관 이름').fill('아침 물 한 잔')
      await page.getByLabel('메모').fill('일어나서 물 한 잔')
      await expect(page.getByLabel('카테고리')).toHaveCount(0)
      await page.getByRole('button', { name: 'Soft Blue', exact: true }).click()
      await page.getByRole('heading', { name: '루틴 추가', exact: true }).click()
      expect(await page.locator('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await expect(page.getByRole('button', { name: '만들기', exact: true })).toBeVisible()
      await page.screenshot({ path: `test-results/aeha-${theme}-editor-${width}.png`, animations: 'disabled' })
      await page.getByRole('button', { name: '닫기', exact: true }).click()
      await expect(page.locator('.routine-card')).toHaveCount(3)
      {
        await page.getByRole('button', { name: '스트릭', exact: true }).click()
        await expect(page.getByRole('heading', { name: '스트릭', exact: true })).toBeVisible()
        await expect(logo).toBeVisible()
        await page.evaluate(() => window.scrollTo(0, 0))
        await checkGraphLayout(page, width)
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({ path: `test-results/premium-${theme}-streaks-${width}.png`, animations: 'disabled' })
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        const last = (await page.locator('.streak-card').last().boundingBox())!
        const navigation = (await page.locator('.bottom-nav').boundingBox())!
        expect(last.y + last.height).toBeLessThan(navigation.y - 8)
        await page.getByRole('button', { name: '설정', exact: true }).click()
        await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeVisible()
        await expect(logo).toBeVisible()
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({ path: `test-results/premium-${theme}-settings-${width}.png`, animations: 'disabled' })
        await page.getByRole('combobox', { name: '언어' }).selectOption('en')
        await page.getByRole('button', { name: 'Streaks', exact: true }).click()
        await checkGraphLayout(page, width)
        await page.getByRole('button', { name: 'Home', exact: true }).click()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      }
      expect(errors).toEqual([])
      console.log(`Captured actual Chromium ${browser.version()}, ${width}px, ${theme}, isolated context`)
    })
  }
}
