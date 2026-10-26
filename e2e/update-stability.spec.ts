import { standalone } from './standalone'
import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' })
declare global {
  interface Window {
    aehaHolder?: IDBDatabase
    aehaReleaseWriter?: boolean
    aehaOpenRequests?: number
  }
}

async function seed(holder: Page, version = 10) {
  await holder.route('**/A/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated connection holder</title>' }))
  await holder.goto('./')
  return holder.evaluate(version => new Promise<{ routines: Record<string, unknown>[]; completions: Record<string, unknown>[]; preferences: Record<string, unknown>[] }>((resolve, reject) => {
    const request = indexedDB.open('eha-habit', version)
    request.onupgradeneeded = () => {
      const db = request.result
      const routines = db.createObjectStore('routines', { keyPath: 'id' })
      for (const field of ['createdAt', 'deletedAt', ...(version === 20 ? ['sortOrder'] : [])]) routines.createIndex(field, field)
      const completions = db.createObjectStore('completions', { keyPath: 'id' })
      completions.createIndex('[routineId+date]', ['routineId', 'date'], { unique: true })
      for (const field of ['routineId', 'date', 'updatedAt']) completions.createIndex(field, field)
      db.createObjectStore('preferences', { keyPath: 'id' })
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      window.aehaHolder = db
      db.onversionchange = () => {} // Deliberately hold open, like a frozen old Chrome tab.
      const routines = ['A', 'B'].map((id, index) => ({ id, name: id, memo: 'original', category: 'learning', color: '#8b63c7',
        scheduleHistory: [{ effectiveFrom: '2026-10-19', days: [0, 1, 2, 3, 4, 5, 6] }], createdDate: '2026-10-19',
        createdAt: `2026-10-19T0${index}:00:00Z`, updatedAt: '2026-10-25T01:00:00Z', ...(version === 20 ? { sortOrder: index } : {}) }))
      const completions = [
        { id: 'a1', routineId: 'A', date: '2026-10-25', completed: true },
        { id: 'a2', routineId: 'A', date: '2026-10-26', completed: true },
        { id: 'b1', routineId: 'B', date: '2026-10-25', completed: false },
      ].map(c => ({ ...c, createdAt: `${c.date}T02:00:00Z`, updatedAt: `${c.date}T03:00:00Z` }))
      const preferences = [{ id: 'app', language: 'ko', theme: 'dark' }]
      const tx = db.transaction(['routines', 'completions', 'preferences'], 'readwrite')
      routines.forEach(r => tx.objectStore('routines').put(r))
      completions.forEach(c => tx.objectStore('completions').put(c))
      preferences.forEach(p => tx.objectStore('preferences').put(p))
      tx.oncomplete = () => resolve({ routines, completions, preferences })
      tx.onerror = () => reject(tx.error)
    }
  }), version)
}

async function data(page: Page) {
  return page.evaluate(() => new Promise<{ routines: Record<string, unknown>[]; completions: Record<string, unknown>[]; preferences: Record<string, unknown>[] }>((resolve, reject) => {
    const request = indexedDB.open('eha-habit')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(['routines', 'completions', 'preferences'], 'readonly')
      const routines = tx.objectStore('routines').getAll(), completions = tx.objectStore('completions').getAll(), preferences = tx.objectStore('preferences').getAll()
      tx.oncomplete = () => { db.close(); resolve({ routines: routines.result, completions: completions.result, preferences: preferences.result }) }
      tx.onerror = () => reject(tx.error)
    }
  }))
}

test('a second tab blocks upgrade, shows recovery guidance, and closing it restores every record', async ({ page, context }) => {
  const holder = await context.newPage()
  const old = await seed(holder)
  await standalone(page)
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open
    window.aehaOpenRequests = 0
    IDBFactory.prototype.open = function(...args: Parameters<typeof open>) {
      if (args[0] === 'eha-habit') window.aehaOpenRequests!++
      return open.apply(this, args)
    }
  })
  await page.clock.setFixedTime(new Date('2026-10-26T12:00:00+09:00'))
  await page.goto('./')
  await expect(page.getByRole('alert')).toContainText('다른 AEHA 창')
  await expect(page.getByRole('alert')).toContainText('다른 AEHA 창을 닫고 다시 시도')
  await expect(page.locator('#launch-brand')).toBeHidden()
  await expect(page.getByText('루틴을 불러오는 중…', { exact: true })).toHaveCount(0)
  const requests = await page.evaluate(() => window.aehaOpenRequests)
  for (let attempt = 0; attempt < 3; attempt++) await page.getByRole('button', { name: '다시 시도', exact: true }).click()
  expect(await page.evaluate(() => window.aehaOpenRequests)).toBe(requests)
  await holder.close()
  await expect(page.locator('.routine-name')).toHaveText(['B', 'A'])
  await expect(page.locator('.storage-banner')).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const recovered = await data(page)
  expect(recovered.routines.map(({ sortOrder, ...r }) => r)).toEqual(old.routines)
  expect(recovered.completions).toEqual(old.completions)
  expect(recovered.preferences).toEqual(old.preferences)
  await page.getByRole('button', { name: '스트릭', exact: true }).click()
  await expect(page.locator('.streak-card').filter({ has: page.getByRole('heading', { name: 'A', exact: true }) }).locator('.streak-value.current')).toHaveText('2회')
  await page.reload()
  await expect(page.locator('.routine-name')).toHaveText(['B', 'A'])
})

test('an open AEHA connection closes for a newer version and asks for reload instead of reconnecting', async ({ page, context }) => {
  const holder = await context.newPage()
  await seed(holder)
  await holder.evaluate(() => window.aehaHolder!.close())
  await page.goto('./')
  await expect(page.locator('.routine-card')).toHaveCount(2)
  const before = await data(page)
  await holder.evaluate(() => new Promise<void>((resolve, reject) => {
    // This isolated future connection only changes the test DB's native version.
    const request = indexedDB.open('eha-habit', 30)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => { request.result.close(); resolve() }
  }))
  await expect(page.getByRole('alert')).toContainText('연결을 닫았습니다')
  await expect(page.getByRole('button', { name: '새로고침', exact: true })).toBeVisible()
  await expect(page.locator('.check-button').first()).toBeDisabled()
  await expect(page.locator('.drag-handle').first()).toBeDisabled()
  expect(await data(holder)).toEqual(before)
})

test('a stalled initial read without an upgrade event replaces loading with retry guidance and recovers', async ({ page, context }) => {
  const holder = await context.newPage()
  const old = await seed(holder, 20)
  await holder.evaluate(() => {
    window.aehaReleaseWriter = false
    const tx = window.aehaHolder!.transaction('routines', 'readwrite')
    const hold = () => {
      const request = tx.objectStore('routines').get('A')
      request.onsuccess = () => { if (!window.aehaReleaseWriter) hold() }
    }
    hold()
  })
  await page.clock.install({ time: new Date('2026-10-26T12:00:00+09:00') })
  await page.goto('./')
  await expect(page.getByText('루틴을 불러오는 중…', { exact: true })).toBeVisible()
  await page.clock.fastForward(8100)
  await expect(page.getByRole('alert')).toContainText('시간이 걸리고')
  await expect(page.getByText('루틴을 불러오는 중…', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '다시 시도', exact: true }).click()
  await expect(page.getByRole('button', { name: '새로고침', exact: true })).toBeVisible()
  await holder.evaluate(() => { window.aehaReleaseWriter = true })
  await expect(page.locator('.routine-name')).toHaveText(['B', 'A'])
  await expect(page.locator('.storage-banner')).toHaveCount(0)
  expect(await data(page)).toEqual(old)
})
