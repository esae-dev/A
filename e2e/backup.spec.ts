import { devices, expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { HabitBackup } from '../src/data/backup'
import { standalone } from './standalone'

test.use({ ...devices['Pixel 5'], defaultBrowserType: 'chromium', timezoneId: 'Asia/Seoul' })
const id = (n: number) => `c829117e-cd84-4fb4-831b-${String(n).padStart(12, '0')}`
function fixture(): HabitBackup {
  const base = { id: id(1), name: '독서', memo: '첫 줄\n두 번째 줄', category: 'learning' as const, color: '#8b63c7', sortOrder: 7, createdDate: '2026-10-19', createdAt: '2026-10-19T01:00:00Z', updatedAt: '2026-11-02T01:00:00Z',
    scheduleHistory: [{ effectiveFrom: '2026-11-03', days: [2, 5, 0] as (0 | 2 | 5)[] }, { effectiveFrom: '2026-10-19', days: [0, 1, 2, 3, 4, 5, 6] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[] }] }
  return { format: 'aeha-backup', formatVersion: 1, exportedAt: '2026-11-02T03:00:00Z', data: {
    routines: [base, { ...base, id: id(2), name: '운동', sortOrder: 2, color: '#61BEA7' }, { ...base, id: id(3), name: '마무리한 루틴', finishedAt: '2026-10-26T01:00:00Z', finishedDate: '2026-10-26' }, { ...base, id: id(4), name: '삭제 루틴', deletedAt: '2026-11-01T00:00:00Z' }],
    completions: [[1, '2026-10-20', true], [1, '2026-11-02', false], [2, '2026-11-02', true], [3, '2026-10-20', true], [3, '2026-10-21', true], [4, '2026-10-20', true]].map(([n, date, completed], i) => ({ id: id(100 + i), routineId: id(Number(n)), date: String(date), completed: Boolean(completed), createdAt: `${date}T01:00:00Z`, updatedAt: `${date}T02:00:00Z` })),
    preferences: [{ id: 'app', language: 'ko', theme: 'dark' }],
  } }
}
async function raw(page: Page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('eha-habit')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(['routines', 'completions', 'preferences'])
      const routines = tx.objectStore('routines').getAll(), completions = tx.objectStore('completions').getAll(), preferences = tx.objectStore('preferences').getAll()
      tx.oncomplete = () => { db.close(); resolve({ version: db.version, data: { routines: routines.result, completions: completions.result, preferences: preferences.result } }) }
      tx.onerror = () => reject(tx.error)
    }
  })) as Promise<{ version: number; data: HabitBackup['data'] }>
}
async function open(page: Page) {
  await standalone(page)
  await page.clock.setFixedTime(new Date('2026-11-02T12:00:00+09:00'))
  await page.goto('./')
  await expect(page.getByRole('heading', { name: '루틴 없음', exact: true })).toBeVisible()
}
async function seed(page: Page) {
  await open(page)
  await page.evaluate(backup => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('eha-habit')
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(['routines', 'completions', 'preferences'], 'readwrite')
      for (const name of ['routines', 'completions', 'preferences'] as const) for (const row of backup.data[name]) tx.objectStore(name).put(row)
      tx.oncomplete = () => { db.close(); resolve() }; tx.onerror = () => reject(tx.error)
    }
    request.onerror = () => reject(request.error)
  }), fixture())
  await page.reload(); await expect(page.locator('.routine-card')).toHaveCount(2)
}
async function settings(page: Page, english = false) {
  await page.getByRole('navigation').getByRole('button', { name: english ? 'Settings' : '설정', exact: true }).click()
}
async function saveBackup(page: Page, name = '백업하기') {
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name, exact: true }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toMatch(/^aeha-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
  const content = await readFile((await download.path())!, 'utf8')
  expect(await download.failure()).toBeNull()
  return JSON.parse(content) as HabitBackup
}
async function pick(page: Page, value: unknown, english = false) {
  const choosing = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: english ? 'Restore' : '복원하기', exact: true }).click()
  await (await choosing).setFiles({ name: 'aeha-backup.json', mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) })
}
async function add(page: Page, name: string) {
  await page.getByRole('button', { name: '루틴 추가', exact: true }).first().click()
  await page.getByLabel('습관 이름').fill(name)
  await page.getByRole('button', { name: '만들기', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('mobile standalone download → different device → cancel/current backup/replace → restart → identical re-backup', async ({ page, browser }) => {
  await seed(page)
  const original = await raw(page)
  await settings(page)
  const exported = await saveBackup(page)
  expect(exported.data).toEqual(original.data)
  await expect(page.getByRole('status')).toContainText('실제로 저장했는지')
  const targetContext = await browser.newContext({ ...devices['Pixel 5'], timezoneId: 'Asia/Seoul', baseURL: page.url() })
  try {
    const target = await targetContext.newPage(); await open(target)
    await add(target, '이 기기의 기존 루틴')
    await settings(target)
    await target.getByRole('button', { name: '라이트', exact: true }).click()
    await target.getByRole('combobox', { name: '언어' }).selectOption('en')
    const before = await raw(target)
    await target.setViewportSize({ width: 320, height: 568 })
    await pick(target, exported, true)
    const dialog = target.getByRole('dialog', { name: 'Restore this backup?', exact: true })
    await expect(dialog.getByRole('heading', { name: 'Restore this backup?', exact: true })).toBeFocused()
    await expect(dialog.getByRole('button', { name: 'Replace all and restore', exact: true })).toBeDisabled()
    expect(await dialog.locator('dd').allTextContents()).toEqual([expect.any(String), '2', '1', '6'])
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await target.screenshot({ path: 'test-results/aeha-backup-preview-320.png', animations: 'disabled' })
    expect(await raw(target)).toEqual(before)
    const currentBackup = await saveBackup(target, 'Back up current data')
    expect(currentBackup.data).toEqual(before.data)
    await target.keyboard.press('Escape')
    await expect(target.getByRole('dialog')).toHaveCount(0)
    await expect(target.getByRole('button', { name: 'Restore', exact: true })).toBeFocused()
    expect(await raw(target)).toEqual(before)
    await pick(target, exported, true)
    await dialog.getByRole('checkbox').check()
    await target.screenshot({ path: 'test-results/aeha-backup-confirm-320.png', animations: 'disabled' })
    await dialog.getByRole('button', { name: 'Replace all and restore', exact: true }).click()
    await expect(target.getByRole('dialog')).toHaveCount(0)
    await expect(target.locator('html')).toHaveAttribute('lang', 'ko')
    await expect(target.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await target.evaluate(() => localStorage.getItem('aeha-theme-hint'))).toBe('dark')
    await expect(target.getByRole('status')).toHaveText('백업의 기록과 설정을 복원했습니다.')
    expect(await raw(target)).toEqual(original)
    await target.getByRole('button', { name: '홈', exact: true }).click()
    await expect(target.locator('.routine-name')).toHaveText(['독서', '운동'])
    await expect(target.locator('.summary-count')).toHaveText('1 / 2')
    await target.getByRole('button', { name: '스트릭', exact: true }).click()
    await expect(target.locator('.streak-routine-name')).toHaveText(['운동', '독서'])
    await target.getByRole('button', { name: '완료 기록', exact: true }).click()
    await expect(target.locator('.streak-routine-name')).toHaveText(['마무리한 루틴'])
    await expect(target.locator('.streak-value.total')).toHaveText('2일')
    await expect(target.locator('.streak-value.longest')).toHaveText('2회')
    await expect(target.locator('.streak-card')).toHaveAttribute('data-through-date', '2026-10-26')
    await target.reload()
    await expect(target.locator('.routine-card')).toHaveCount(2)
    await settings(target)
    expect((await saveBackup(target)).data).toEqual(exported.data)
    await target.setViewportSize({ width: 393, height: 851 })
    await target.screenshot({ path: 'test-results/aeha-backup-dark-settings.png', animations: 'disabled' })
    await target.getByRole('button', { name: '홈', exact: true }).click()
    await add(target, '복원 후 새 루틴')
    const added = (await raw(target)).data.routines.find(row => row.name === '복원 후 새 루틴')!
    expect(exported.data.routines.map(row => row.id)).not.toContain(added.id)
  } finally { await targetContext.close() }
})

test('invalid files and failed preference write leave all existing records intact; retry and offline restore work', async ({ page, context }) => {
  await seed(page); await settings(page)
  const before = await raw(page), backup = fixture()
  const errors = [
    ['{', 'JSON 파일을 읽을 수 없습니다.'], [{ format: 'another-app' }, 'AEHA 백업 파일이 아닙니다.'],
    [{ ...backup, formatVersion: 2 }, '지원하지 않는 백업 버전입니다.'],
    [{ ...backup, data: { ...backup.data, completions: [...backup.data.completions, backup.data.completions[0]] } }, '백업의 기록 형식'],
  ] as const
  for (const [file, message] of errors) {
    await pick(page, file)
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await raw(page)).toEqual(before)
  }
  backup.data.preferences[0] = { id: 'app', language: 'en', theme: 'light' }
  backup.data.routines[0].name = 'Restored reading'
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function(...args: Parameters<typeof add>) {
      if (this.name === 'preferences') throw new DOMException('Injected restore failure', 'QuotaExceededError')
      return add.apply(this, args)
    }
  })
  await pick(page, backup)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: '전체 교체하여 복원', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('기존 기록은 변경되지 않았습니다.')
  expect(await raw(page)).toEqual(before)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await dialog.getByRole('button', { name: '취소', exact: true }).click()
  await page.reload(); await expect(page.locator('.routine-card')).toHaveCount(2)
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload(); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await settings(page)
  await pick(page, backup)
  await page.getByRole('dialog').getByRole('checkbox').check()
  await page.getByRole('dialog').getByRole('button', { name: '전체 교체하여 복원', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('status')).toHaveText('Records and settings were restored from the backup.')
  await page.screenshot({ path: 'test-results/aeha-backup-light-settings.png', animations: 'disabled' })
  const reExported = await saveBackup(page, 'Back up')
  expect(reExported.data).toEqual(backup.data)
  await page.reload(); await expect(page.getByRole('heading', { name: 'Restored reading', exact: true })).toBeVisible()
  expect((await raw(page)).data).toEqual(backup.data)
  await context.setOffline(false)
})

test('empty backup requires confirmation and restores empty tables; download failure never reports success', async ({ page }) => {
  await open(page); await settings(page)
  const empty = await saveBackup(page)
  expect(empty.data).toEqual({ routines: [], completions: [], preferences: [] })
  await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('Injected download failure') } })
  await page.getByRole('button', { name: '백업하기', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('백업 파일을 만들지 못했습니다.')
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.getByRole('button', { name: '홈', exact: true }).click(); await add(page, '교체될 기록'); await settings(page)
  await pick(page, empty)
  const dialog = page.getByRole('dialog')
  expect((await dialog.locator('dd').allTextContents()).slice(1)).toEqual(['0', '0', '0'])
  await dialog.getByRole('button', { name: '취소', exact: true }).click()
  expect((await raw(page)).data.routines).toHaveLength(1)
  await pick(page, empty)
  await page.getByRole('dialog').getByRole('checkbox').check()
  await page.getByRole('dialog').getByRole('button', { name: '전체 교체하여 복원', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await raw(page)).data).toEqual(empty.data)
  await page.reload(); await expect(page.getByRole('heading', { name: '루틴 없음', exact: true })).toBeVisible()
})
