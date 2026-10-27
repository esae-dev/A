import { expect, test, type Page } from '@playwright/test'
import { contrastRatio } from './contrast'

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' })

async function watchEntries(page: Page) {
  await page.addInitScript(() => {
    const events: string[] = []
    ;(window as unknown as { summaryEntries: string[] }).summaryEntries = events
    document.addEventListener('animationstart', event => {
      if (event.animationName === 'summary-label-in') events.push(getComputedStyle(event.target as Element).animationDuration)
    }, true)
  })
}
const summaryEntries = (page: Page) => page.evaluate(() => (window as unknown as { summaryEntries: string[] }).summaryEntries)

async function settleSummary(page: Page) {
  await page.locator('.today-summary').evaluate(async el => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    await Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})))
  })
}

async function recordTransition(page: Page) {
  await page.bringToFront()
  await settleSummary(page)
  await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('.today-summary')!, fill = card.querySelector<HTMLElement>('.summary-fill')!, label = card.querySelector<HTMLElement>('.summary-label')!
    let clicked = false, afterClick = 0
    document.addEventListener('click', () => { clicked = true }, { once: true, capture: true })
    const frames: { width: number; background: number[]; labelOpacity: number }[] = []
    const animations: { name: string; duration: number; easing: string }[] = []
    const result = new Promise<{ frames: typeof frames; animations: typeof animations }>(resolve => {
      const sample = () => {
        const background = getComputedStyle(card).backgroundColor.match(/[\d.]+/g)!.slice(0, 3).map(Number)
        frames.push({ width: fill.getBoundingClientRect().width / fill.parentElement!.getBoundingClientRect().width, background, labelOpacity: Number(getComputedStyle(label).opacity) })
        const running = card.getAnimations({ subtree: true })
        for (const animation of running) {
          const timing = animation.effect!.getTiming()
          animations.push({ name: animation instanceof CSSTransition ? animation.transitionProperty : (animation as CSSAnimation).animationName, duration: Number(timing.duration), easing: timing.easing ?? 'linear' })
        }
        if (clicked) afterClick++
        if (!clicked || afterClick < 40 || running.some(a => a.playState === 'running' || a.pending)) requestAnimationFrame(sample)
        else resolve({ frames, animations })
      }
      sample()
    })
    ;(window as unknown as { summaryMotion: typeof result }).summaryMotion = result
  })
}

async function expectSoftTransition(page: Page, completing: boolean) {
  const result = await page.evaluate(() => (window as unknown as { summaryMotion: Promise<{ frames: { width: number; background: number[]; labelOpacity: number }[]; animations: { name: string; duration: number; easing: string }[] }> }).summaryMotion)
  const start = result.frames[0], end = result.frames.at(-1)!
  expect(end.width).toBeCloseTo(completing ? 1 : .5, 2)
  expect(result.frames.some(f => f.width > .51 && f.width < .99), JSON.stringify(result)).toBe(true)
  expect(result.animations.some(a => a.name === 'width' && a.duration === 550)).toBe(true)
  expect(result.animations.some(a => a.name === 'background-color' && a.duration === 500)).toBe(true)
  expect(result.animations.every(a => a.name !== 'summary-complete' && a.name !== 'transform' && a.name !== 'box-shadow')).toBe(true)
  expect(result.animations.filter(a => a.name === 'width' || a.name === 'background-color').every(a => a.easing === 'cubic-bezier(0.22, 1, 0.36, 1)')).toBe(true)
  // Every painted color stays between the ordinary and final surfaces; no flash
  // overshoot or return to the original background after the transition ends.
  for (let channel = 0; channel < 3; channel++) {
    const from = start.background[channel], to = end.background[channel], direction = Math.sign(to - from)
    for (let i = 1; i < result.frames.length; i++) {
      const value = result.frames[i].background[channel], previous = result.frames[i - 1].background[channel]
      expect(value).toBeGreaterThanOrEqual(Math.min(from, to) - 1)
      expect(value).toBeLessThanOrEqual(Math.max(from, to) + 1)
      expect((value - previous) * direction).toBeGreaterThanOrEqual(-1)
    }
  }
  expect(start.background).not.toEqual(end.background)
  if (completing) {
    expect(result.frames.some(f => f.labelOpacity > 0 && f.labelOpacity < 1)).toBe(true)
    expect(result.animations.some(a => a.name === 'summary-label-in' && a.duration === 300)).toBe(true)
  }
}
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

for (const theme of ['light', 'dark'] as const) test(`last check settles into lavender; undo, redo, tab return and restart in ${theme}`, async ({ page }) => {
  const errors: string[] = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', error => errors.push(error.message))
  await watchEntries(page)
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
  expect(await summaryEntries(page)).toEqual([])
  await recordTransition(page)
  await check('B').tap()
  await expectSoftTransition(page, true)
  await expect.poll(() => summaryEntries(page)).toEqual(['0.3s'])
  await expect(summary).toHaveClass(/is-complete/)
  await expect(summary.locator('.summary-label')).toHaveText(complete)
  await expect(summary.locator('.summary-label svg')).toHaveCount(1)
  await expect(bar).toHaveAttribute('aria-valuenow', '2')
  await expect(summary.locator('.summary-fill')).toHaveCSS('background-color', 'rgb(166, 157, 230)')
  await expect(summary).toHaveCSS('background-color', en ? 'rgb(36, 43, 64)' : 'rgb(245, 244, 251)')
  await expect(summary).not.toHaveClass(/is-completing/)
  expect(await summary.locator('.summary-fill').evaluate(el => Math.abs(el.getBoundingClientRect().width - el.parentElement!.getBoundingClientRect().width))).toBeLessThan(1)
  expect(await contrastRatio(summary.locator('.summary-label'), 'summary')).toBeGreaterThanOrEqual(4.5)
  await page.screenshot({ path: `test-results/aeha-all-done-${theme}.png`, animations: 'allow' })
  await page.getByRole('button', { name: streak, exact: true }).click()
  await expect(summary).toHaveCount(0)
  await page.getByRole('button', { name: home, exact: true }).click()
  await expect(summary.locator('.summary-label')).toHaveText(complete)
  expect(await summaryEntries(page)).toHaveLength(1)
  expect(await summary.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0)
  await page.reload()
  await expect(summary.locator('.summary-label')).toHaveText(complete)
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(await summaryEntries(page)).toEqual([])
  expect(await summary.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0)
  await recordTransition(page)
  await check('B', true).tap()
  await expectSoftTransition(page, false)
  await expect(summary.locator('.summary-label')).toHaveText(normal)
  await expect(summary).not.toHaveClass(/is-complete|is-completing/)
  await expect(bar).toHaveAttribute('aria-valuenow', '1')
  await recordTransition(page)
  await check('B').tap()
  await expectSoftTransition(page, true)
  await expect.poll(() => summaryEntries(page)).toEqual(['0.3s'])
  await expect(summary.locator('.summary-label')).toHaveText(complete)
  expect(errors).toEqual([])
})

test('zero due routines never complete, while off-day routines do not prevent eligible completion', async ({ page }) => {
  await watchEntries(page)
  await page.clock.setFixedTime(new Date('2026-10-26T12:00:00+09:00'))
  await page.goto('./')
  await expect(page.locator('.today-summary')).toHaveCount(0)
  await add(page, '쉬는 루틴', true)
  const summary = page.locator('.today-summary')
  await expect(summary.locator('.summary-count')).toHaveText('0 / 0')
  await expect(summary).not.toHaveClass(/is-complete/)
  await expect(summary.locator('.summary-label')).toHaveText('오늘 완료')
  await expect(summary.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  expect(await summaryEntries(page)).toEqual([])
  await add(page, '오늘 루틴')
  await page.getByRole('button', { name: '오늘 루틴 완료하기', exact: true }).tap()
  await expect(summary.locator('.summary-count')).toHaveText('1 / 1')
  await expect(summary.locator('.summary-label')).toHaveText('오늘도 완료!')
  await expect.poll(() => summaryEntries(page)).toHaveLength(1)
})

test('a failed last completion never leaves a success label or entry animation behind', async ({ page }) => {
  await watchEntries(page)
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
  await expect(page.locator('.today-summary')).not.toHaveClass(/is-complete|is-completing/)
  await expect(page.getByRole('button', { name: 'A 완료하기', exact: true })).toHaveAttribute('aria-pressed', 'false')
  expect(await summaryEntries(page)).toEqual([])
  await page.reload()
  await expect(page.locator('.summary-label')).toHaveText('오늘 완료')
  await page.getByRole('button', { name: 'A 완료하기', exact: true }).tap()
  await expect(page.locator('.summary-label')).toHaveText('오늘도 완료!')
  await expect.poll(() => summaryEntries(page)).toHaveLength(1)
})

test('reduced motion keeps the completed styling with no entry or progress animation', async ({ page }) => {
  await watchEntries(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./')
  await add(page, 'A')
  await page.getByRole('button', { name: 'A 완료하기', exact: true }).tap()
  await expect(page.locator('.summary-label')).toHaveText('오늘도 완료!')
  await expect(page.locator('.summary-fill')).toHaveCSS('background-color', 'rgb(166, 157, 230)')
  await expect(page.locator('.summary-fill')).toHaveCSS('transition-property', 'none')
  expect(await page.locator('.today-summary').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0)
  expect(await summaryEntries(page)).toEqual([])
})
