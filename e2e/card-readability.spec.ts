import { expect, test, type Page } from '@playwright/test'
import type { Routine, Completion } from '../src/domain/types'
import { contrastRatio } from './contrast'

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' })
const palette = [
  ['Soft Blue', '#6B94E8'], ['Fresh Mint', '#61BEA7'], ['Lilac', '#A28BE5'],
  ['Blush Pink', '#DF88AE'], ['Soft Coral', '#E99D83'], ['Clear Sky', '#73BADF'],
] as const
const rgb = (hex: string) => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
const cardFor = (page: Page, name: string) => page.locator('.routine-card').filter({ has: page.getByRole('heading', { name, exact: true }) })
async function readData(page: Page) {
  return page.evaluate(() => new Promise<{ routines: Routine[]; completions: Completion[]; version: number }>((resolve, reject) => {
    const r = indexedDB.open('eha-habit')
    r.onerror = () => reject(r.error)
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction(['routines', 'completions'])
      const routines = tx.objectStore('routines').getAll(), completions = tx.objectStore('completions').getAll()
      tx.oncomplete = () => { db.close(); resolve({ routines: routines.result, completions: completions.result, version: db.version }) }
    }
  }))
}
async function add(page: Page, name: string, memo = '', choice?: string) {
  await page.getByRole('button', { name: '루틴 추가', exact: true }).first().click()
  await expect(page.getByLabel('카테고리')).toHaveCount(0)
  await page.getByLabel('습관 이름').fill(name)
  await page.getByRole('dialog').getByLabel('메모').fill(memo)
  if (choice) await page.getByRole('button', { name: choice, exact: true }).click()
  else await expect(page.getByRole('button', { name: 'Soft Blue', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.color-option')).toHaveCount(6)
  expect(await page.locator('.color-option').evaluateAll(elements => elements.map(el => el.getAttribute('aria-label')))).toEqual(palette.map(p => p[0]))
  expect(await page.locator('.color-option > span').evaluateAll(elements => elements.map(el => getComputedStyle(el).backgroundColor))).toEqual(palette.map(p => rgb(p[1])))
  await page.getByRole('button', { name: '만들기', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

for (const theme of ['light', 'dark'] as const) test(`notes, six presets and clear weekdays at 320px in ${theme}`, async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T12:00:00+09:00'))
  await page.goto('./')
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page.getByRole('button', { name: theme === 'light' ? '라이트' : '다크', exact: true }).click()
  await page.getByRole('button', { name: '홈', exact: true }).click()
  const notes = ['', '잠들기 전에 읽기', '첫 번째 줄\n두 번째 줄\n세 번째 줄', '긴메모'.repeat(100)]
  const names = ['메모 없음', '한 줄 메모', '여러 줄 메모', '긴 메모', '코랄 루틴', '스카이 루틴']
  for (let i = 0; i < names.length; i++) await add(page, names[i], notes[i] ?? '', i ? palette[i][0] : undefined)
  await page.setViewportSize({ width: 320, height: 844 })
  for (let i = 0; i < notes.length; i++) {
    const card = cardFor(page, names[i])
    await expect(card.locator('.routine-meta')).toHaveText('매일')
    await expect(card.locator('.routine-memo')).toHaveCount(i ? 1 : 0)
    if (i) {
      expect(await card.locator('.routine-memo').textContent()).toBe(notes[i])
      await expect(card.locator('.routine-memo')).toHaveCSS('white-space', 'pre-wrap')
      const geometry = await card.evaluate(el => {
        const note = el.querySelector<HTMLElement>('.routine-memo')!, controls = el.querySelector('.routine-actions')!, handle = el.querySelector('.drag-handle')!
        return { overflow: note.scrollWidth > note.clientWidth, separated: note.getBoundingClientRect().top >= Math.max(controls.getBoundingClientRect().bottom, handle.getBoundingClientRect().bottom), panel: getComputedStyle(note).backgroundColor, card: getComputedStyle(el).backgroundColor }
      })
      expect(geometry.overflow).toBe(false)
      expect(geometry.separated).toBe(true)
      expect(geometry.panel).not.toBe(geometry.card)
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/aeha-readability-${theme}-home.png`, fullPage: true, animations: 'disabled' })
  for (let i = 0; i < names.length; i++) {
    await page.getByRole('button', { name: `${names[i]} 완료하기`, exact: true }).tap()
    const check = page.getByRole('button', { name: `${names[i]} 완료 취소`, exact: true })
    await expect(check).toBeEnabled()
    expect(await contrastRatio(check, 'fill')).toBeGreaterThanOrEqual(4.5)
    await expect(cardFor(page, names[i]).locator('.routine-accent')).toHaveCSS('background-color', rgb(palette[i][1]))
  }
  const before = await readData(page)
  expect(before.version).toBe(20)
  names.forEach((name, index) => {
    const routine = before.routines.find(r => r.name === name)!
    expect(routine.color).toBe(palette[index][1].toLowerCase())
    expect(routine.category).toBe('other')
  })
  await page.getByRole('button', { name: '메모 없음 수정', exact: true }).tap()
  await page.getByRole('button', { name: '요일 선택', exact: true }).click()
  for (const day of ['일요일', '화요일', '목요일', '토요일']) await page.getByRole('button', { name: day, exact: true }).click()
  await expect(page.locator('.weekday-picker button')).toHaveCount(7)
  await expect(page.locator('.weekday-picker button[aria-pressed="true"]')).toHaveCount(3)
  const rects = await page.locator('.weekday-picker button').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height, x: r.x } }))
  expect(Math.max(...rects.map(r => r.width)) - Math.min(...rects.map(r => r.width))).toBeLessThan(1)
  rects.forEach((r, i) => { expect(r.height).toBeGreaterThanOrEqual(44); if (i) expect(r.x).toBeGreaterThanOrEqual(rects[i - 1].x + rects[i - 1].width) })
  const selected = page.getByRole('button', { name: '월요일', exact: true }), unselected = page.getByRole('button', { name: '일요일', exact: true })
  expect(await selected.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(await unselected.evaluate(el => getComputedStyle(el).backgroundColor))
  expect(await contrastRatio(selected)).toBeGreaterThanOrEqual(4.5)
  expect(await contrastRatio(page.locator('.repeat-control button.selected'))).toBeGreaterThanOrEqual(4.5)
  await expect(page.getByText('요일 변경은 내일부터 적용됩니다.', { exact: true })).toBeVisible()
  expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: `test-results/aeha-readability-${theme}-editor.png`, animations: 'disabled' })
  await page.getByRole('button', { name: '매일', exact: true }).click()
  await expect(page.locator('.weekday-picker')).toHaveCount(0)
  await page.getByRole('button', { name: '요일 선택', exact: true }).click()
  await expect(page.locator('.weekday-picker button[aria-pressed="true"]')).toHaveCount(3)
  await page.getByRole('button', { name: '변경 저장', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const after = await readData(page)
  expect(after.completions).toEqual(before.completions)
  expect(after.routines.find(r => r.name === names[0])!.scheduleHistory.at(-1)).toEqual({ effectiveFrom: '2026-10-27', days: [1, 3, 5] })
  await page.getByRole('button', { name: '스트릭', exact: true }).click()
  for (let i = 0; i < names.length; i++) {
    const card = page.locator('.streak-card').filter({ has: page.getByRole('heading', { name: names[i], exact: true }) })
    await expect(card.locator('.heatmap-grid .completed').first()).toHaveCSS('background-color', rgb(palette[i][1]))
    expect(await contrastRatio(card.locator('.streak-value.current'), 'card')).toBeGreaterThanOrEqual(3)
    await expect(card.locator('.streak-value.current')).toHaveText('1회')
  }
})

test('editing legacy colors and categories preserves records until a new preset is chosen', async ({ page }) => {
  await page.goto('./')
  await add(page, '기존 루틴', '첫 줄\n둘째 줄')
  await page.getByRole('button', { name: '기존 루틴 완료하기', exact: true }).tap()
  await expect(page.getByRole('button', { name: '기존 루틴 완료 취소', exact: true })).toBeEnabled()
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const r = indexedDB.open('eha-habit')
    r.onerror = () => reject(r.error)
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction('routines', 'readwrite'), store = tx.objectStore('routines'), all = store.getAll()
      all.onsuccess = () => store.put({ ...all.result[0], category: 'learning', color: '#8b63c7' })
      tx.oncomplete = () => { db.close(); resolve() }
    }
  }))
  await page.reload()
  const before = await readData(page)
  await expect(cardFor(page, '기존 루틴').locator('.routine-meta')).toHaveText('매일')
  await expect(cardFor(page, '기존 루틴').locator('.routine-accent')).toHaveCSS('background-color', 'rgb(139, 99, 199)')
  await page.getByRole('button', { name: '기존 루틴 수정', exact: true }).tap()
  await expect(page.locator('.color-option[aria-pressed="true"]')).toHaveCount(0)
  await expect(page.getByLabel('카테고리')).toHaveCount(0)
  await page.getByLabel('습관 이름').fill('이름만 변경')
  await page.getByRole('button', { name: '변경 저장', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const renamed = await readData(page)
  expect(renamed.routines[0]).toMatchObject({ ...before.routines[0], name: '이름만 변경', updatedAt: renamed.routines[0].updatedAt })
  expect(renamed.completions).toEqual(before.completions)
  await page.getByRole('button', { name: '이름만 변경 수정', exact: true }).tap()
  await page.getByRole('button', { name: 'Clear Sky', exact: true }).click()
  await page.getByRole('button', { name: '변경 저장', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const changed = await readData(page)
  expect(changed.routines[0].category).toBe('learning')
  expect(changed.routines[0].color).toBe('#73badf')
  expect(changed.completions).toEqual(before.completions)
  await page.reload()
  await expect(cardFor(page, '이름만 변경').locator('.routine-accent')).toHaveCSS('background-color', 'rgb(115, 186, 223)')
})
