import { expect, test, type Page } from '@playwright/test'
import type { Completion, Preferences, Routine } from '../src/domain/types'
import { routineAction } from './actions'
import { contrastRatio } from './contrast'

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' })
type Data = { version: number; routines: Routine[]; completions: Completion[]; preferences: (Preferences & { id: string })[] }
const names = { study: '독서의 시간', exercise: '아침 운동' }
async function data(page: Page): Promise<Data> {
  return page.evaluate(() => new Promise<Data>((resolve, reject) => {
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

async function seedExisting(page: Page, theme: 'light' | 'dark', language: 'ko' | 'en', checked = true) {
  // The local day is Oct 26, while the ISO timestamp is still Oct 25.
  await page.clock.setFixedTime(new Date('2026-10-26T00:30:00+09:00'))
  await page.addInitScript(() => {
    const events: string[] = []
    ;(window as unknown as { finishEntryEvents: string[] }).finishEntryEvents = events
    document.addEventListener('animationstart', event => { if (event.animationName === 'summary-label-in') events.push(event.animationName) }, true)
  })
  await page.route('**/A/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Existing AEHA v2 data</title>' }))
  await page.goto('./')
  await page.evaluate(({ theme, language, checked }) => new Promise<void>((resolve, reject) => {
    const r = indexedDB.open('eha-habit', 20)
    r.onerror = () => reject(r.error)
    r.onupgradeneeded = () => {
      const db = r.result, routines = db.createObjectStore('routines', { keyPath: 'id' })
      for (const field of ['createdAt', 'deletedAt', 'sortOrder']) routines.createIndex(field, field)
      const completions = db.createObjectStore('completions', { keyPath: 'id' })
      completions.createIndex('[routineId+date]', ['routineId', 'date'], { unique: true })
      for (const field of ['routineId', 'date', 'updatedAt']) completions.createIndex(field, field)
      db.createObjectStore('preferences', { keyPath: 'id' })
    }
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction(['routines', 'completions', 'preferences'], 'readwrite')
      const study = { id: 'study', name: '독서의 시간', memo: '책을 읽고\n한 줄 남기기', category: 'learning', color: '#8b63c7', sortOrder: 7,
        createdDate: '2026-10-19', createdAt: '2026-10-19T01:00:00Z', updatedAt: '2026-10-25T01:00:00Z',
        scheduleHistory: [{ effectiveFrom: '2026-10-27', days: [2, 4] }, { effectiveFrom: '2026-10-19', days: [0, 1, 2, 3, 4, 5, 6] }] }
      const routines = [study, { ...study, id: 'exercise', name: '아침 운동', category: 'health', color: '#61bea7', sortOrder: 2 }, { ...study, id: 'deleted', name: '삭제된 기록', deletedAt: '2026-10-25T08:00:00Z' }]
      routines.forEach(row => tx.objectStore('routines').put(row))
      const records = Array.from({ length: 8 }, (_, i) => {
        const date = `2026-10-${19 + i}`, timestamp = new Date(`${date}T00:10:00+09:00`).toISOString()
        return { id: `day-${i}`, routineId: 'study', date, completed: i === 7 ? checked : ![2, 5].includes(i), createdAt: timestamp, updatedAt: timestamp }
      })
      records.push({ ...records[7], id: 'exercise-today', routineId: 'exercise', completed: true }, { ...records[0], id: 'deleted-check', routineId: 'deleted' })
      records.forEach(row => tx.objectStore('completions').put(row))
      tx.objectStore('preferences').put({ id: 'app', language, theme })
      tx.oncomplete = () => { db.close(); localStorage.setItem('aeha-theme-hint', theme); resolve() }
      tx.onerror = () => reject(tx.error)
    }
  }), { theme, language, checked })
  await page.unroute('**/A/')
  await page.reload()
  await expect(page.locator('.routine-card')).toHaveCount(2)
  await expect(page.locator('html')).toHaveAttribute('lang', language)
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
  return data(page)
}

async function confirmFinish(page: Page, name: string, language: 'ko' | 'en') {
  await routineAction(page, name, 'finish', language, true)
  const dialog = page.getByRole('dialog', { name: language === 'ko' ? '루틴을 마무리할까요?' : 'Finish this routine?', exact: true })
  await dialog.getByRole('button', { name: language === 'ko' ? '루틴 마무리' : 'Finish routine', exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

async function showRecords(page: Page, language: 'ko' | 'en') {
  await page.getByRole('navigation').getByRole('button', { name: language === 'ko' ? '스트릭' : 'Streaks', exact: true }).click()
  await page.getByRole('button', { name: language === 'ko' ? '완료 기록' : 'Completed records', exact: true }).click()
}
const cells = (page: Page) => page.locator('.streak-card.is-finished .heatmap-grid [role="img"]').evaluateAll(items => items.map(el => ({ label: el.getAttribute('aria-label'), classes: el.className })))

for (const [theme, language] of [['light', 'ko'], ['dark', 'en']] as const) test(`finishes legacy data, keeps inclusive records and freezes the archive across months and offline restart in ${theme}/${language}`, async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const before = await seedExisting(page, theme, language)
  await expect(page.locator('.summary-count')).toHaveText('2 / 2')
  await page.setViewportSize({ width: 320, height: 568 })
  await routineAction(page, names.study, 'finish', language, true)
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(names.study, { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: language === 'ko' ? '취소' : 'Cancel', exact: true })).toBeFocused()
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  const buttons = await dialog.getByRole('button').evaluateAll(items => items.map(el => {
    const box = el.getBoundingClientRect(); return { left: box.left, right: box.right, height: box.height }
  }))
  expect(buttons[0].right).toBeLessThanOrEqual(buttons[1].left)
  expect(buttons.every(b => b.height >= 48 && b.height < 60)).toBe(true)
  await page.screenshot({ path: `test-results/aeha-finish-confirm-${theme}.png`, animations: 'disabled' })
  await page.keyboard.press('Escape')
  expect(await data(page)).toEqual(before)
  await expect(page.getByRole('button', { name: `${names.study} ${language === 'ko' ? '메뉴' : 'Actions'}`, exact: true })).toBeFocused()
  await page.setViewportSize({ width: 390, height: 844 })
  await confirmFinish(page, names.study, language)
  await expect(page.locator('.routine-name')).toHaveText([names.exercise])
  await expect(page.locator('.summary-count')).toHaveText('1 / 1')
  await expect(page.locator('.page-title')).toBeFocused()
  expect(await page.evaluate(() => (window as unknown as { finishEntryEvents: string[] }).finishEntryEvents)).toEqual([])
  const after = await data(page), original = before.routines.find(r => r.id === 'study')!
  expect(after.version).toBe(20)
  expect(after.routines.find(r => r.id === 'study')).toEqual({ ...original, finishedAt: '2026-10-25T15:30:00.000Z', finishedDate: '2026-10-26', updatedAt: '2026-10-25T15:30:00.000Z' })
  expect(after.routines.filter(r => r.id !== 'study')).toEqual(before.routines.filter(r => r.id !== 'study'))
  expect(after.completions).toEqual(before.completions)
  expect(after.preferences).toEqual(before.preferences)
  await page.getByRole('navigation').getByRole('button', { name: language === 'ko' ? '스트릭' : 'Streaks', exact: true }).click()
  await expect(page.locator('.streak-routine-name')).toHaveText([names.exercise])
  await page.getByRole('button', { name: language === 'ko' ? '완료 기록' : 'Completed records', exact: true }).click()
  const card = page.locator('.streak-card.is-finished')
  await expect(card.getByRole('heading', { name: names.study, exact: true })).toBeVisible()
  await expect(card).toHaveAttribute('data-through-date', '2026-10-26')
  await expect(card.locator('.streak-value.total')).toHaveText(language === 'ko' ? '6일' : '6days')
  await expect(card.locator('.streak-value.longest')).toHaveText(language === 'ko' ? '2회' : '2days')
  expect(await card.locator('time').evaluateAll(items => items.map(el => el.getAttribute('datetime')))).toEqual(['2026-10-19', '2026-10-26'])
  await expect(card.locator('.heatmap-week')).toHaveCount(26)
  await expect(card.locator('.heatmap-grid .completed')).toHaveCount(6)
  await expect(card.locator('.is-finish-date')).toHaveCount(1)
  await expect(card.locator('.is-today')).toHaveCount(0)
  await expect(card.locator('.routine-color-dot')).toHaveCSS('background-color', 'rgb(139, 99, 199)')
  await expect(card.getByRole('button')).toHaveCount(0)
  expect(await contrastRatio(card.locator('.streak-value.total'), 'card')).toBeGreaterThanOrEqual(3)
  const frozen = await cells(page)
  expect(frozen).toHaveLength(182)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.screenshot({ path: `test-results/aeha-finished-${theme}-${width}.png`, animations: 'disabled' })
  }
  await page.clock.setFixedTime(new Date('2027-07-01T12:00:00+09:00'))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(card).toHaveAttribute('data-through-date', '2026-10-26')
  expect(await cells(page)).toEqual(frozen)
  expect(await data(page)).toEqual(after)
  await page.reload()
  await expect(page.locator('.routine-name')).toHaveText([names.exercise])
  await showRecords(page, language)
  expect(await cells(page)).toEqual(frozen)
  expect(await data(page)).toEqual(after)
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.routine-name')).toHaveText([names.exercise])
  await showRecords(page, language)
  expect(await cells(page)).toEqual(frozen)
  expect(await data(page)).toEqual(after)
  await context.setOffline(false)
  expect(errors).toEqual([])
})

test('failed finish is reversible; finishing an unchecked day does not create a check or replay the all-done entry', async ({ page }) => {
  const before = await seedExisting(page, 'dark', 'ko', false)
  await expect(page.locator('.summary-count')).toHaveText('1 / 2')
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(...args: Parameters<typeof put>) {
      if (this.name === 'routines' && (args[0] as Routine).finishedAt) throw new DOMException('Isolated finish failure', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  await routineAction(page, names.study, 'finish')
  await page.getByRole('dialog').getByRole('button', { name: '루틴 마무리', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('마무리하지 못했습니다. 다시 시도해 주세요.', { exact: true })).toBeVisible()
  await expect(page.locator('.routine-card')).toHaveCount(2)
  await expect(page.locator('.summary-count')).toHaveText('1 / 2')
  expect(await data(page)).toEqual(before)
  await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click()
  await page.reload()
  await expect(page.locator('.routine-card')).toHaveCount(2)
  await confirmFinish(page, names.study, 'ko')
  await expect(page.locator('.summary-count')).toHaveText('1 / 1')
  await expect(page.locator('.summary-label')).toHaveText('오늘도 완료!')
  expect(await page.evaluate(() => (window as unknown as { finishEntryEvents: string[] }).finishEntryEvents)).toEqual([])
  expect((await data(page)).completions).toEqual(before.completions)
  await showRecords(page, 'ko')
  await expect(page.locator('.streak-value.total')).toHaveText('5일')
  await expect(page.locator('.is-finish-date')).toHaveClass(/missed/)
  await page.getByRole('button', { name: '홈', exact: true }).click()
  await confirmFinish(page, names.exercise, 'ko')
  await expect(page.getByRole('heading', { name: '루틴 없음', exact: true })).toBeVisible()
  await expect(page.locator('.today-summary')).toHaveCount(0)
  await showRecords(page, 'ko')
  await expect(page.locator('.streak-card.is-finished')).toHaveCount(2)
  expect((await data(page)).completions).toEqual(before.completions)
})

test('deletion stays separate from finished records and keeps the deleted routine history intact', async ({ page }) => {
  const before = await seedExisting(page, 'light', 'ko')
  await routineAction(page, names.exercise, 'delete')
  await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page.locator('.routine-name')).toHaveText([names.study])
  const afterDelete = await data(page), deleted = afterDelete.routines.find(r => r.id === 'exercise')!
  expect(deleted.deletedAt).toBeTruthy()
  expect(deleted.finishedAt).toBeUndefined()
  expect(afterDelete.completions).toEqual(before.completions)
  await showRecords(page, 'ko')
  await expect(page.getByRole('heading', { name: '완료 기록 없음', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '홈', exact: true }).click()
  await confirmFinish(page, names.study, 'ko')
  await showRecords(page, 'ko')
  await expect(page.locator('.streak-routine-name')).toHaveText([names.study])
  expect((await data(page)).completions).toEqual(before.completions)
})
