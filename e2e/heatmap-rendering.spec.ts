import { devices, expect, test, type Locator, type Page } from '@playwright/test'

// Android-sized Chromium with fractional device scale, where the reported paint
// artifacts occurred. Each test has its own browser storage, never user data.
test.use({ ...devices['Pixel 5'], defaultBrowserType: 'chromium', timezoneId: 'Asia/Seoul' })

async function readData(page: Page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
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

async function seed(page: Page, theme: 'light' | 'dark', language: 'ko' | 'en') {
  await page.clock.setFixedTime(new Date('2026-11-02T12:00:00+09:00'))
  await page.route('**/A/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Existing AEHA storage</title>' }))
  await page.goto('./')
  await page.evaluate(({ theme, language }) => new Promise<void>((resolve, reject) => {
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
      const fixtures = [
        { id: 'recent', name: '새로 시작한 독서', createdDate: '2026-10-30', days: [0, 1, 2, 3, 4, 5, 6], color: '#6B94E8' },
        { id: 'long', name: '월수금 운동', createdDate: '2026-05-10', days: [1, 3, 5], color: '#61BEA7' },
        { id: 'archive-recent', name: '마무리한 독서', createdDate: '2026-10-30', days: [0, 1, 2, 3, 4, 5, 6], color: '#8b63c7', finishedDate: '2026-11-02', finishedAt: '2026-11-02T02:00:00Z' },
        { id: 'archive-long', name: '마무리한 운동', createdDate: '2026-05-10', days: [1, 3, 5], color: '#E99D83', finishedDate: '2026-10-26', finishedAt: '2026-10-26T02:00:00Z' },
      ]
      fixtures.forEach(({ days, ...row }, sortOrder) => tx.objectStore('routines').put({ ...row, sortOrder, memo: '기존 메모', category: 'learning', createdAt: `${row.createdDate}T01:00:00Z`, updatedAt: '2026-11-02T02:00:00Z', scheduleHistory: [{ effectiveFrom: row.createdDate, days }] }))
      const records: Record<string, [string, boolean][]> = {
        recent: [['2026-10-30', true], ['2026-10-31', false], ['2026-11-01', true], ['2026-11-02', false]],
        long: [['2026-06-01', true], ['2026-10-26', true], ['2026-10-28', true], ['2026-10-30', false], ['2026-11-02', true]],
        'archive-recent': [['2026-10-30', true], ['2026-10-31', false], ['2026-11-01', true], ['2026-11-02', false]],
        // An existing post-finish record stays in storage but is not rendered as
        // an achievement or included in the frozen archive's statistics.
        'archive-long': [['2026-06-01', true], ['2026-10-19', true], ['2026-10-21', true], ['2026-10-23', false], ['2026-10-26', true], ['2026-10-28', true]],
      }
      for (const [routineId, days] of Object.entries(records)) for (const [date, completed] of days) tx.objectStore('completions').put({ id: `${routineId}-${date}`, routineId, date, completed, createdAt: `${date}T03:00:00Z`, updatedAt: `${date}T03:00:00Z` })
      tx.objectStore('preferences').put({ id: 'app', theme, language })
      tx.oncomplete = () => { db.close(); localStorage.setItem('aeha-theme-hint', theme); resolve() }
      tx.onerror = () => reject(tx.error)
    }
  }), { theme, language })
  await page.unroute('**/A/')
  await page.reload()
  await expect(page.locator('.routine-card')).toHaveCount(2)
  return readData(page)
}

async function checkGrid(card: Locator) {
  await expect(card.locator('.heatmap-week')).toHaveCount(26)
  await expect(card.locator('.heatmap-grid .heatmap-cell')).toHaveCount(182)
  const geometry = await card.evaluate(el => {
    const cells = Array.from(el.querySelectorAll<HTMLElement>('.heatmap-grid .heatmap-cell'))
    const first = cells[0].getBoundingClientRect(), weekdays = el.querySelector('.heatmap-weekdays span')!.getBoundingClientRect()
    return {
      dates: cells.map(cell => cell.dataset.date),
      aligned: cells.every((cell, i) => {
        const box = cell.getBoundingClientRect()
        return box.width === 13 && box.height === 13 && Math.abs(box.left - first.left - Math.floor(i / 7) * 17) < .1 && Math.abs(box.top - first.top - i % 7 * 17) < .1
      }),
      weekdayAligned: Math.abs(first.top - weekdays.top) < .1,
      simplePaint: cells.every(cell => {
        const css = getComputedStyle(cell)
        return css.backgroundImage === 'none' && css.boxShadow === 'none' && css.filter === 'none' && css.transform === 'none'
      }),
    }
  })
  expect(geometry.aligned && geometry.weekdayAligned && geometry.simplePaint).toBe(true)
  expect(new Set(geometry.dates).size).toBe(182)
  for (let i = 1; i < geometry.dates.length; i++) expect(Date.parse(geometry.dates[i]!) - Date.parse(geometry.dates[i - 1]!)).toBe(86_400_000)
}

async function checkRaster(page: Page, card: Locator) {
  const scroll = card.locator('.heatmap-scroll')
  // Center the graph so the fixed bottom navigation cannot cover the raster.
  await scroll.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }))
  const image = await scroll.screenshot({ animations: 'disabled' })
  const sample = await scroll.evaluate(el => {
    const clip = el.getBoundingClientRect(), background = getComputedStyle(el.closest('.streak-card')!).backgroundColor
    return { width: clip.width, height: clip.height, cells: Array.from(el.querySelectorAll('.heatmap-cell')).flatMap(cell => {
      const box = cell.getBoundingClientRect(), color = getComputedStyle(cell).backgroundColor
      if (box.left < clip.left || box.right > clip.right) return []
      return [{ x: box.left + box.width / 2 - clip.left, y: box.top + box.height / 2 - clip.top, color: color === 'rgba(0, 0, 0, 0)' ? background : color }]
    }) }
  })
  // Inspect the actual screenshot pixels, not just computed CSS. Each visible
  // cell's inner 5x5 CSS pixels must stay uniformly its state/routine color.
  const result = await page.evaluate(async ({ png, sample }) => {
    const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(image, 0, 0)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const scaleX = image.width / sample.width, scaleY = image.height / sample.height
    let unexpected = 0
    for (const cell of sample.cells) {
      const rgb = cell.color.match(/\d+/g)!.slice(0, 3).map(Number)
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const i = (Math.floor((cell.y + dy) * scaleY) * canvas.width + Math.floor((cell.x + dx) * scaleX)) * 4
        if (rgb.some((value, channel) => Math.abs(value - pixels[i + channel]) > 1)) unexpected++
      }
    }
    return { checked: sample.cells.length, unexpected }
  }, { png: image.toString('base64'), sample })
  expect(result.checked).toBeGreaterThan(50)
  expect(result.unexpected).toBe(0)
}

async function checkScroll(page: Page, card: Locator) {
  const scroll = card.locator('.heatmap-scroll')
  // ResizeObserver fits whole week columns and then restores the latest week.
  // Finish that initial layout before deliberately scrolling to older dates.
  await expect.poll(() => scroll.evaluate(el => el.style.width)).not.toBe('')
  await scroll.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  for (const edge of ['left', 'right'] as const) {
    await scroll.evaluate((el, edge) => { el.scrollLeft = edge === 'left' ? 0 : el.scrollWidth }, edge)
    await expect.poll(() => scroll.evaluate((el, edge) => Math.abs(el.scrollLeft - (edge === 'left' ? 0 : el.scrollWidth - el.clientWidth)), edge)).toBeLessThan(1)
    await expect.poll(() => scroll.evaluate(el => {
      const clip = el.getBoundingClientRect()
      const labels = Array.from(el.querySelectorAll('.heatmap-months > span')).filter(label => label.textContent).map(label => {
        const range = document.createRange(); range.selectNodeContents(label); const box = range.getBoundingClientRect()
        return { left: box.left - clip.left, right: box.right - clip.left, width: clip.width }
      })
      const visible = labels.filter(label => label.right > 0 && label.left < label.width)
      // A following month may enter at the right scroll boundary. The first
      // visible month must be readable and labels must never overlap.
      return {
        firstReadable: visible.length > 0 && visible[0].left >= -.5 && visible[0].right <= visible[0].width + .5,
        overlapping: visible.some((label, i) => i > 0 && label.left < visible[i - 1].right),
      }
    })).toEqual({ firstReadable: true, overlapping: false })
    await checkGrid(card)
    await checkRaster(page, card)
  }
}

for (const [theme, language] of [['dark', 'ko'], ['light', 'en']] as const) test(`clean Android heatmap paints, frozen archives and unchanged legacy data in ${theme}/${language}`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const before = await seed(page, theme, language), korean = language === 'ko'
  await page.getByRole('button', { name: korean ? '스트릭' : 'Streaks', exact: true }).click()
  const card = (name: string) => page.locator('.streak-card').filter({ has: page.getByRole('heading', { name, exact: true }) })
  const recent = card('새로 시작한 독서'), old = card('월수금 운동')
  await expect(recent.locator('.streak-value.current')).toHaveText(korean ? '1회' : '1')
  await expect(old.locator('.streak-value.longest')).toHaveText(korean ? '2회' : '2')
  await expect(recent.locator('.heatmap-grid .before-creation')).toHaveCount(173)
  await expect(recent.locator('.heatmap-grid .off')).toHaveCount(0)
  await expect(recent.locator('.heatmap-grid .missed')).toHaveCount(2)
  await expect(recent.locator('.heatmap-grid .completed')).toHaveCount(2)
  await expect(recent.locator('.heatmap-grid .future')).toHaveCount(5)
  await expect(recent.locator('[data-date="2026-10-29"]')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(recent.locator('[data-date="2026-10-31"]')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(recent.locator('[data-date="2026-10-30"]')).toHaveCSS('background-color', 'rgb(107, 148, 232)')
  await expect(old.locator('[data-date="2026-11-01"]')).toHaveClass('heatmap-cell off')
  await expect(old.locator('[data-date="2026-11-01"]')).toHaveCSS('background-image', 'none')
  await expect(recent.locator('.heatmap-grid .future').first()).toHaveCSS('border-top-style', 'dashed')
  for (const width of [393, 320]) {
    await page.setViewportSize({ width, height: 851 })
    await checkScroll(page, recent)
    await checkScroll(page, old)
    await old.locator('.heatmap-scroll').screenshot({ path: `test-results/aeha-heatmap-${theme}-long-grid-${width}.png` })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `test-results/aeha-heatmap-${theme}-active-${width}.png`, animations: 'disabled' })
  }
  await page.getByRole('button', { name: korean ? '완료 기록' : 'Completed records', exact: true }).click()
  const archived = card('마무리한 독서'), archivedOld = card('마무리한 운동')
  await expect(archived).toHaveAttribute('data-through-date', '2026-11-02')
  await expect(archivedOld).toHaveAttribute('data-through-date', '2026-10-26')
  await expect(archived.locator('.streak-value.total')).toHaveText(korean ? '2일' : '2days')
  await expect(archivedOld.locator('.streak-value.total')).toHaveText(korean ? '4일' : '4days')
  await expect(archivedOld.locator('.streak-value.longest')).toHaveText(korean ? '2회' : '2days')
  await expect(archived.locator('.heatmap-grid .before-creation')).toHaveCount(173)
  await expect(archived.locator('.heatmap-grid .future')).toHaveCount(0)
  await expect(archived.locator('.heatmap-grid .after-finish')).toHaveCount(5)
  await expect(archived.locator('.heatmap-grid .after-finish').first()).toHaveCSS('border-top-style', 'solid')
  await expect(archivedOld.locator('[data-date="2026-10-28"]')).toHaveClass('heatmap-cell after-finish')
  await expect(archived.getByRole('button', { name: /마무리한 독서/ })).toBeEnabled()
  const frozen = await archivedOld.locator('.heatmap-grid').innerHTML()
  for (const width of [393, 320]) {
    await page.setViewportSize({ width, height: 851 })
    await checkScroll(page, archived)
    await checkScroll(page, archivedOld)
    await archivedOld.locator('.heatmap-scroll').screenshot({ path: `test-results/aeha-heatmap-${theme}-finished-long-grid-${width}.png` })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `test-results/aeha-heatmap-${theme}-finished-${width}.png`, animations: 'disabled' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  }
  await page.clock.setFixedTime(new Date('2027-07-01T12:00:00+09:00'))
  await page.reload()
  await expect(page.locator('.routine-card')).toHaveCount(2)
  await page.getByRole('button', { name: korean ? '스트릭' : 'Streaks', exact: true }).click()
  await page.getByRole('button', { name: korean ? '완료 기록' : 'Completed records', exact: true }).click()
  expect(await archivedOld.locator('.heatmap-grid').innerHTML()).toBe(frozen)
  expect(await readData(page)).toEqual(before)
  expect(errors).toEqual([])
})
