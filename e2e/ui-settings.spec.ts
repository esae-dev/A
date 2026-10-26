import { expect, test, type Page } from '@playwright/test'
import { contrastRatio } from './contrast'

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' })

async function addRoutine(page: Page, name: string, color: string) {
  await page.getByRole('button', { name: '루틴 추가', exact: true }).first().click()
  await page.getByLabel('습관 이름').fill(name)
  await page.getByRole('button', { name: color, exact: true }).click()
  await page.getByRole('button', { name: '만들기', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function readData(page: Page) {
  return page.evaluate(() => new Promise<Record<string, unknown[]>>((resolve, reject) => {
    const request = indexedDB.open('eha-habit')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const stores = ['routines', 'completions', 'preferences']
      const tx = database.transaction(stores, 'readonly')
      const result: Record<string, unknown[]> = {}
      for (const name of stores) {
        const all = tx.objectStore(name).getAll()
        all.onsuccess = () => { result[name] = all.result }
      }
      tx.oncomplete = () => { database.close(); resolve(result) }
      tx.onerror = () => { database.close(); reject(tx.error) }
    }
  }))
}

for (const theme of ['light', 'dark'] as const) {
  test(`legacy system preference resolves once to ${theme} and preserves records`, async ({ page }) => {
    await page.goto('./')
    await addRoutine(page, '기존 독서 기록', 'Lilac')
    await page.getByRole('button', { name: '기존 독서 기록 완료하기' }).click()
    await expect(page.getByRole('button', { name: '기존 독서 기록 완료 취소' })).toBeVisible()
    const before = await readData(page)
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('eha-habit')
      request.onsuccess = () => {
        const database = request.result
        const tx = database.transaction('preferences', 'readwrite')
        tx.objectStore('preferences').put({ id: 'app', language: 'en', theme: 'system' })
        tx.oncomplete = () => { database.close(); resolve() }
        tx.onerror = () => reject(tx.error)
      }
      request.onerror = () => reject(request.error)
    }))
    await page.emulateMedia({ colorScheme: theme })
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    const migrated = await readData(page)
    expect(migrated.routines).toEqual(before.routines)
    expect(migrated.completions).toEqual(before.completions)
    expect(migrated.preferences).toEqual([{ id: 'app', language: 'en', theme }])
    await page.emulateMedia({ colorScheme: theme === 'light' ? 'dark' : 'light' })
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await page.getByRole('button', { name: 'Streaks', exact: true }).click()
    await expect(page.locator('.streak-value.current')).toHaveText('1')
  })

  test(`routine colors stay independent of navy UI in ${theme} mode`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-25T12:00:00+09:00'))
    await page.goto('./')
    const routines = [
      { name: '독서', choice: 'Soft Blue', rgb: 'rgb(162, 139, 229)' },
      { name: '운동', choice: 'Fresh Mint', rgb: 'rgb(97, 190, 167)' },
      { name: '영어', choice: 'Soft Coral', rgb: 'rgb(233, 157, 131)' },
    ]
    for (const routine of routines) {
      await addRoutine(page, routine.name, routine.choice)
      await page.getByRole('button', { name: `${routine.name} 완료하기`, exact: true }).click()
      await expect(page.getByRole('button', { name: `${routine.name} 완료 취소`, exact: true })).toBeEnabled()
    }
    await page.clock.setFixedTime(new Date('2026-10-26T12:00:00+09:00'))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    for (const routine of routines) {
      await page.getByRole('button', { name: `${routine.name} 완료하기`, exact: true }).click()
      await expect(page.getByRole('button', { name: `${routine.name} 완료 취소`, exact: true })).toBeVisible()
    }
    const before = await readData(page)
    await page.getByRole('button', { name: '독서 수정', exact: true }).click()
    await page.getByRole('button', { name: 'Lilac', exact: true }).click()
    await page.getByRole('button', { name: '변경 저장', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await readData(page)).completions).toEqual(before.completions)
    await page.getByRole('button', { name: '설정', exact: true }).click()
    await page.getByRole('button', { name: theme === 'light' ? '라이트' : '다크', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    const navy = theme === 'light' ? 'rgb(48, 69, 101)' : 'rgb(167, 184, 211)'
    await expect(page.locator('.nav-item.active')).toHaveCSS('color', navy)
    await page.evaluate(() => window.scrollTo(0, 0))
    expect((await page.locator('.settings-card').boundingBox())!.y).toBeLessThan(170)
    await expect(page.locator('.page-description, .settings-note')).toHaveCount(0)
    await page.screenshot({ path: `test-results/navy-${theme}-settings.png`, animations: 'disabled' })
    await page.getByRole('button', { name: '홈', exact: true }).click()
    for (const routine of routines) {
      const card = page.locator('.routine-card').filter({ has: page.getByRole('heading', { name: routine.name, exact: true }) })
      await expect(card.locator('.routine-accent')).toHaveCSS('background-color', routine.rgb)
      expect(await card.locator('.check-button').evaluate(element => getComputedStyle(element, '::before').backgroundColor)).toBe(routine.rgb)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `test-results/navy-${theme}-home.png`, animations: 'disabled' })
    await page.getByRole('button', { name: '루틴 추가', exact: true }).click()
    await page.getByRole('heading', { name: '루틴 추가', exact: true }).click()
    await expect(page.locator('.editor-submit')).toHaveCSS('background-color', navy)
    await page.screenshot({ path: `test-results/navy-${theme}-editor.png`, animations: 'disabled' })
    await page.getByRole('button', { name: '닫기', exact: true }).click()
    await page.getByRole('button', { name: '스트릭', exact: true }).click()
    for (const routine of routines) {
      const card = page.locator('.streak-card').filter({ has: page.getByRole('heading', { name: routine.name, exact: true }) })
      await expect(card.locator('.heatmap-grid .completed')).toHaveCount(2)
      await expect(card.locator('.heatmap-grid .completed').first()).toHaveCSS('background-color', routine.rgb)
      expect(await contrastRatio(card.locator('.streak-value.current'), 'card')).toBeGreaterThanOrEqual(3)
      await expect(card.locator('.routine-color-dot')).toHaveCSS('background-color', routine.rgb)
      await expect(card.locator('.streak-value.current')).toHaveText('2회')
      const colors = await card.locator('.heatmap-legend .heatmap-cell').evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor))
      expect(new Set(colors).size).toBe(4)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    expect((await page.locator('.streak-card').first().boundingBox())!.y).toBeLessThan(170)
    await page.screenshot({ path: `test-results/navy-${theme}-streaks.png`, animations: 'disabled' })
    await page.reload()
    await expect(page.getByRole('button', { name: '독서 완료 취소', exact: true })).toBeVisible()
    expect((await readData(page)).completions).toEqual(before.completions)
  })
}
