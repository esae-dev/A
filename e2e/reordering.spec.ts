import { expect, test, type Page, type BrowserContext } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' })
const names = (page: Page) => page.locator('.routine-name').allTextContents()

async function data(page: Page) {
  return page.evaluate(() => new Promise<{ routines: Record<string, unknown>[]; completions: Record<string, unknown>[]; preferences: Record<string, unknown>[]; version: number }>((resolve, reject) => {
    const request = indexedDB.open('eha-habit')
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(['routines', 'completions', 'preferences'], 'readonly')
      const routines = tx.objectStore('routines').getAll()
      const completions = tx.objectStore('completions').getAll()
      const preferences = tx.objectStore('preferences').getAll()
      tx.oncomplete = () => { db.close(); resolve({ routines: routines.result, completions: completions.result, preferences: preferences.result, version: db.version }) }
      tx.onerror = () => reject(tx.error)
    }
    request.onerror = () => reject(request.error)
  }))
}

async function add(page: Page, name: string) {
  await page.getByRole('button', { name: '루틴 추가', exact: true }).first().click()
  await page.getByLabel('습관 이름').fill(name)
  await page.getByRole('button', { name: '만들기', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function mouseMove(page: Page, from: string, to: string, cancel = false) {
  const start = (await page.getByRole('button', { name: `${from} 순서 변경`, exact: true }).boundingBox())!
  const target = (await page.getByRole('button', { name: `${to} 순서 변경`, exact: true }).boundingBox())!
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 - 12, { steps: 3 })
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 })
  if (cancel) await page.keyboard.press('Escape')
  await page.mouse.up()
}

async function touchMove(page: Page, context: BrowserContext, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] })
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / 12, y: from.y + (to.y - from.y) * i / 12, id: 1 }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test('upgrades actual v1 IndexedDB, preserves all data, and persists mouse order and undo restoration', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T12:00:00+09:00'))
  // Bootstrap an empty same-origin page so the NEW app cannot create its schema first.
  await page.route('**/A/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>v1 test fixture</title>' }))
  await page.goto('./')
  const legacy = await page.evaluate(() => new Promise<{ routines: Record<string, unknown>[]; completions: Record<string, unknown>[]; preferences: Record<string, unknown>[] }>((resolve, reject) => {
    const request = indexedDB.open('eha-habit', 10) // Dexie v1 uses native IDB version 10.
    request.onupgradeneeded = () => {
      const db = request.result
      const routines = db.createObjectStore('routines', { keyPath: 'id' })
      routines.createIndex('createdAt', 'createdAt'); routines.createIndex('deletedAt', 'deletedAt')
      const completions = db.createObjectStore('completions', { keyPath: 'id' })
      completions.createIndex('[routineId+date]', ['routineId', 'date'], { unique: true })
      for (const field of ['routineId', 'date', 'updatedAt']) completions.createIndex(field, field)
      db.createObjectStore('preferences', { keyPath: 'id' })
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const routines = ['A', 'B', 'C', 'D'].map((id, index) => ({
        id, name: `기존 루틴 ${id}`, memo: `기존 메모 ${id}`, category: 'learning', color: '#8b63c7',
        scheduleHistory: [{ effectiveFrom: '2026-10-19', days: [0, 1, 2, 3, 4, 5, 6] }, { effectiveFrom: '2026-10-27', days: [2, 4] }],
        createdDate: '2026-10-19', createdAt: `2026-10-19T0${index}:00:00Z`, updatedAt: '2026-10-25T04:00:00Z',
        ...(id === 'D' ? { deletedAt: '2026-10-25T05:00:00Z' } : {}),
      }))
      const completions = [
        { id: 'a1', routineId: 'A', date: '2026-10-25', completed: true },
        { id: 'a2', routineId: 'A', date: '2026-10-26', completed: true },
        { id: 'b1', routineId: 'B', date: '2026-10-25', completed: false },
        { id: 'd1', routineId: 'D', date: '2026-10-25', completed: true },
      ].map(c => ({ ...c, createdAt: `${c.date}T02:00:00Z`, updatedAt: `${c.date}T03:00:00Z` }))
      const preferences = [{ id: 'app', language: 'ko', theme: 'dark' }]
      const tx = db.transaction(['routines', 'completions', 'preferences'], 'readwrite')
      routines.forEach(r => tx.objectStore('routines').put(r))
      completions.forEach(c => tx.objectStore('completions').put(c))
      preferences.forEach(p => tx.objectStore('preferences').put(p))
      tx.oncomplete = () => { db.close(); resolve({ routines, completions, preferences }) }
      tx.onerror = () => reject(tx.error)
    }
  }))
  await page.unroute('**/A/')
  await page.reload()
  await expect.poll(() => names(page)).toEqual(['기존 루틴 B', '기존 루틴 C', '기존 루틴 A'])
  const upgraded = await data(page)
  expect(upgraded.version).toBe(20)
  expect(upgraded.routines.map(({ sortOrder, ...r }) => r)).toEqual(legacy.routines)
  expect(upgraded.routines.map(r => r.sortOrder)).toEqual([0, 1, 2, 3])
  expect(upgraded.completions).toEqual(legacy.completions)
  expect(upgraded.preferences).toEqual(legacy.preferences)
  await mouseMove(page, '기존 루틴 C', '기존 루틴 B')
  await expect.poll(() => names(page)).toEqual(['기존 루틴 C', '기존 루틴 B', '기존 루틴 A'])
  expect((await data(page)).completions).toEqual(legacy.completions)
  await page.reload()
  await expect.poll(() => names(page)).toEqual(['기존 루틴 C', '기존 루틴 B', '기존 루틴 A'])
  await page.getByRole('button', { name: '기존 루틴 A 완료 취소', exact: true }).click()
  await expect.poll(() => names(page)).toEqual(['기존 루틴 A', '기존 루틴 C', '기존 루틴 B'])
  await page.getByRole('button', { name: '기존 루틴 A 완료하기', exact: true }).click()
  await expect.poll(() => names(page)).toEqual(['기존 루틴 C', '기존 루틴 B', '기존 루틴 A'])
  await page.getByRole('button', { name: '스트릭', exact: true }).click()
  await expect(page.locator('.streak-card').filter({ has: page.getByRole('heading', { name: '기존 루틴 A', exact: true }) }).locator('.streak-value.current')).toHaveText('2회')
})

test('supports real touch drag, keyboard reorder/cancel and separate check/edit taps', async ({ page, context }) => {
  await page.goto('./')
  for (const name of ['A', 'B', 'C']) await add(page, name)
  await mouseMove(page, 'C', 'A', true)
  await expect.poll(() => names(page)).toEqual(['A', 'B', 'C'])
  const handle = page.getByRole('button', { name: 'C 순서 변경', exact: true })
  await handle.focus()
  await page.keyboard.press('Space')
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('status').filter({ hasText: 'C, B 위치로 이동합니다.' })).toHaveCount(1)
  await page.keyboard.press('Space')
  await expect.poll(() => names(page)).toEqual(['A', 'C', 'B'])
  await handle.click({ trial: true })
  const from = (await handle.boundingBox())!
  const to = (await page.getByRole('button', { name: 'A 순서 변경', exact: true }).boundingBox())!
  await touchMove(page, context, { x: from.x + 22, y: from.y + 22 }, { x: to.x + 22, y: to.y + 22 })
  await expect.poll(() => names(page)).toEqual(['C', 'A', 'B'])
  const manual = (await data(page)).routines
  await page.getByRole('button', { name: 'C 완료하기', exact: true }).tap()
  await expect.poll(() => names(page)).toEqual(['A', 'B', 'C'])
  await page.getByRole('button', { name: 'C 완료 취소', exact: true }).tap()
  await expect.poll(() => names(page)).toEqual(['C', 'A', 'B'])
  expect((await data(page)).routines).toEqual(manual)
  await page.getByRole('button', { name: 'C 수정', exact: true }).tap()
  await expect(page.getByRole('dialog', { name: '루틴 수정' })).toBeVisible()
  await page.getByRole('button', { name: '닫기', exact: true }).tap()
  await page.reload()
  await expect.poll(() => names(page)).toEqual(['C', 'A', 'B'])
  await page.screenshot({ path: 'test-results/aeha-manual-order.png', animations: 'disabled' })
})

test('touch scrolling the card body does not reorder or change completions', async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('./')
  for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) await add(page, name)
  const before = await data(page)
  await page.evaluate(() => window.scrollTo(0, 0))
  await touchMove(page, context, { x: 140, y: 450 }, { x: 140, y: 240 })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  expect(await data(page)).toEqual(before)
})
