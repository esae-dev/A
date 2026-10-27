import { expect, test, type Page } from '@playwright/test'
import { contrastRatio } from './contrast'

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' })

async function watchCelebrations(page: Page) {
  await page.addInitScript(() => {
    const events: string[] = []
    ;(window as unknown as { celebrations: string[] }).celebrations = events
    document.addEventListener('animationstart', event => {
      if (event.animationName === 'summary-complete') events.push(getComputedStyle(event.target as Element).animationDuration)
    }, true)
  })
}
const celebrations = (page: Page) => page.evaluate(() => (window as unknown as { celebrations: string[] }).celebrations)
async function add(page: Page, name: string, onlySunday = false) {
  await page.getByRole('button', { name: '루틴 추가', exact: true }).first().click()
  await page.getByLabel('습관 이름').fill(name)
  if (onlySunday) {
    await page.getByRole('button', { name: '요일 선택', exact: true }).click()
    for (const day of ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일']) await page.getByRole('button', { name: day, exact: true }).click()
  }
  await page.getByRole('button', { name: '만들기', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

for (const theme of ['light', 'dark'] as const) test(`committed last check celebrates once; undo, redo, tab return and restart in ${theme}`, async ({ page }) => {
  const errors: string[] = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', error => errors.push(error.message))
  await watchCelebrations(page)
  await page.goto('./')
  for (const name of ['A', 'B']) await add(page, name)
  const en = theme === 'dark'
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page.getByRole('button', { name: en ? '다크' : '라이트', exact: true }).click()
  if (en) await page.getByRole('combobox', { name: '언어', exact: true }).selectOption('en')
  const home = en ? 'Home' : '홈', streak = en ? 'Streaks' : '스트릭'
  const normal = en ? 'Completed today' : '오늘 완료', complete = en ? 'All done today!' : '오늘도 완료!'
  const check = (name: string, done = false) => page.getByRole('button', { name: `${name} ${en ? done ? 'Undo completion' : 'Mark complete' : done ? '완료 취소' : '완료하기'}`, exact: true })
  await page.getByRole('button', { name: home, exact: true }).click()
  const summary = page.locator('.today-summary'), bar = summary.getByRole('progressbar')
  await expect(summary.locator('.summary-label')).toHaveText(normal)
  await check('A').tap()
  await expect(bar).toHaveAttribute('aria-valuenow', '1')
  expect(await celebrations(page)).toEqual([])
  await check('B').tap()
  await expect.poll(() => celebrations(page)).toEqual(['0.6s'])
  await expect(summary).toHaveClass(/is-complete/)
  await expect(summary.locator('.summary-label')).toHaveText(complete)
  await expect(summary.locator('.summary-label svg')).toHaveCount(1)
  await expect(bar).toHaveAttribute('aria-valuenow', '2')
  await expect(summary.locator('.summary-fill')).toHaveCSS('background-color', 'rgb(97, 190, 167)')
  await expect(summary).not.toHaveClass(/is-celebrating/)
  expect(await summary.locator('.summary-fill').evaluate(el => Math.abs(el.getBoundingClientRect().width - el.parentElement!.getBoundingClientRect().width))).toBeLessThan(1)
  expect(await contrastRatio(summary.locator('.summary-label'), 'summary')).toBeGreaterThanOrEqual(4.5)
  await page.screenshot({ path: `test-results/aeha-all-done-${theme}.png`, animations: 'allow' })
  await page.getByRole('button', { name: streak, exact: true }).click()
  await expect(summary).toHaveCount(0)
  await page.getByRole('button', { name: home, exact: true }).click()
  await expect(summary.locator('.summary-label')).toHaveText(complete)
  expect(await celebrations(page)).toHaveLength(1)
  await page.reload()
  await expect(summary.locator('.summary-label')).toHaveText(complete)
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(await celebrations(page)).toEqual([])
  await check('B', true).tap()
  await expect(summary.locator('.summary-label')).toHaveText(normal)
  await expect(summary).not.toHaveClass(/is-complete|is-celebrating/)
  await expect(bar).toHaveAttribute('aria-valuenow', '1')
  await check('B').tap()
  await expect.poll(() => celebrations(page)).toEqual(['0.6s'])
  await expect(summary.locator('.summary-label')).toHaveText(complete)
  expect(errors).toEqual([])
})

test('zero due routines never complete, while off-day routines do not prevent eligible completion', async ({ page }) => {
  await watchCelebrations(page)
  await page.clock.setFixedTime(new Date('2026-10-26T12:00:00+09:00'))
  await page.goto('./')
  await expect(page.locator('.today-summary')).toHaveCount(0)
  await add(page, '쉬는 루틴', true)
  const summary = page.locator('.today-summary')
  await expect(summary.locator('.summary-count')).toHaveText('0 / 0')
  await expect(summary).not.toHaveClass(/is-complete/)
  await expect(summary.locator('.summary-label')).toHaveText('오늘 완료')
  await expect(summary.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  expect(await celebrations(page)).toEqual([])
  await add(page, '오늘 루틴')
  await page.getByRole('button', { name: '오늘 루틴 완료하기', exact: true }).tap()
  await expect(summary.locator('.summary-count')).toHaveText('1 / 1')
  await expect(summary.locator('.summary-label')).toHaveText('오늘도 완료!')
  await expect.poll(() => celebrations(page)).toHaveLength(1)
})

test('a failed last completion never leaves a success label or celebration behind', async ({ page }) => {
  await watchCelebrations(page)
  await page.goto('./')
  await add(page, 'A')
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(...args: Parameters<typeof put>) {
      if (this.name === 'completions') throw new DOMException('Isolated completion write failure', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  await page.getByRole('button', { name: 'A 완료하기', exact: true }).tap()
  await expect(page.locator('.error-banner')).toBeVisible()
  await expect(page.locator('.summary-label')).toHaveText('오늘 완료')
  await expect(page.locator('.today-summary')).not.toHaveClass(/is-complete|is-celebrating/)
  await expect(page.getByRole('button', { name: 'A 완료하기', exact: true })).toHaveAttribute('aria-pressed', 'false')
  expect(await celebrations(page)).toEqual([])
  await page.reload()
  await expect(page.locator('.summary-label')).toHaveText('오늘 완료')
  await page.getByRole('button', { name: 'A 완료하기', exact: true }).tap()
  await expect(page.locator('.summary-label')).toHaveText('오늘도 완료!')
  await expect.poll(() => celebrations(page)).toHaveLength(1)
})

test('reduced motion keeps the completed styling with no highlight or progress animation', async ({ page }) => {
  await watchCelebrations(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./')
  await add(page, 'A')
  await page.getByRole('button', { name: 'A 완료하기', exact: true }).tap()
  await expect(page.locator('.summary-label')).toHaveText('오늘도 완료!')
  await expect(page.locator('.summary-fill')).toHaveCSS('background-color', 'rgb(97, 190, 167)')
  await expect(page.locator('.summary-fill')).toHaveCSS('transition-property', 'none')
  expect(await page.locator('.today-summary').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0)
  expect(await celebrations(page)).toEqual([])
})
