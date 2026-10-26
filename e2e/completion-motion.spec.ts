import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' })

async function add(page: Page, name: string) {
  await page.getByRole('button', { name: '루틴 추가', exact: true }).first().click()
  await page.getByLabel('습관 이름').fill(name)
  await page.getByRole('button', { name: '만들기', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function startRecording(page: Page) {
  await page.bringToFront()
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.routine-card'))
    const frames: { time: number; positions: Record<string, number>; connected: boolean; visible: boolean; checked: boolean }[] = []
    const transitions: number[] = []
    const globals = window as unknown as { motionResult: Promise<{ frames: typeof frames; transitions: number[]; click: number }> }
    let clicked: number | null = null
    let framesAfterClick = 0
    document.addEventListener('click', () => { clicked = performance.now() }, { once: true, capture: true })
    globals.motionResult = new Promise(resolve => {
      const sample = () => {
        const positions: Record<string, number> = {}
        let connected = true, visible = true
        let moving = false
        for (const card of cards) {
          const rect = card.getBoundingClientRect()
          positions[card.querySelector('.routine-name')!.textContent!] = rect.y
          connected &&= card.isConnected && document.querySelectorAll('.routine-card').length === cards.length
          visible &&= rect.height > 0 && getComputedStyle(card).opacity === '1' && getComputedStyle(card).visibility === 'visible'
          for (const animation of card.getAnimations()) {
            if (animation.effect instanceof KeyframeEffect && animation.effect.getKeyframes().some(frame => frame.transform !== undefined)) {
              transitions.push(Number(animation.effect.getTiming().duration))
              moving ||= animation.playState === 'running' || animation.pending
            }
          }
        }
        frames.push({ time: performance.now(), positions, connected, visible, checked: cards.find(card => card.querySelector('.routine-name')!.textContent === 'A')!.querySelector('.check-button')!.getAttribute('aria-pressed') === 'true' })
        if (clicked !== null) framesAfterClick++
        // Wall-clock time can pass while a busy Chromium compositor is paused.
        // Observe painted frames and the actual animation ending before undoing.
        if (clicked === null || framesAfterClick < 30 || moving) requestAnimationFrame(sample)
        else resolve({ frames, transitions, click: clicked })
      }
      sample()
    })
  })
}

async function recording(page: Page) {
  return page.evaluate(() => (window as unknown as { motionResult: Promise<{ frames: { time: number; positions: Record<string, number>; connected: boolean; visible: boolean; checked: boolean }[]; transitions: number[]; click: number }> }).motionResult)
}

test('check and undo animate all existing cards both ways for 300ms without remount/flicker', async ({ page }) => {
  await page.goto('./')
  for (const name of ['A', 'B', 'C']) await add(page, name)
  for (const action of ['complete', 'undo']) {
    await startRecording(page)
    await page.getByRole('button', { name: action === 'complete' ? 'A 완료하기' : 'A 완료 취소', exact: true }).tap()
    const result = await recording(page)
    expect(result.frames.every(frame => frame.connected && frame.visible)).toBe(true)
    expect(result.transitions, JSON.stringify({ action, frames: result.frames.filter((_, i) => i % 4 === 0) })).toContain(300)
    for (const name of ['A', 'B', 'C']) {
      const start = result.frames[0].positions[name]
      const end = result.frames.at(-1)!.positions[name]
      expect(Math.abs(end - start)).toBeGreaterThan(40)
      expect(result.frames.some(frame => frame.positions[name] > Math.min(start, end) + 2 && frame.positions[name] < Math.max(start, end) - 2)).toBe(true)
    }
    const checked = result.frames.find(frame => frame.checked === (action === 'complete'))
    expect(checked).toBeDefined()
    expect(checked!.time - result.click).toBeLessThan(180)
    await expect(page.locator('.routine-name')).toHaveText(action === 'complete' ? ['B', 'C', 'A'] : ['A', 'B', 'C'])
  }
})

test('reduced motion removes automatic layout interpolation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./')
  for (const name of ['A', 'B', 'C']) await add(page, name)
  await startRecording(page)
  await page.getByRole('button', { name: 'A 완료하기', exact: true }).tap()
  const result = await recording(page)
  expect(result.transitions).not.toContain(300)
  expect(result.frames.every(frame => frame.connected && frame.visible)).toBe(true)
  const start = result.frames[0].positions.A, end = result.frames.at(-1)!.positions.A
  expect(Math.abs(end - start)).toBeGreaterThan(40)
  expect(result.frames.some(frame => frame.positions.A > Math.min(start, end) + 2 && frame.positions.A < Math.max(start, end) - 2)).toBe(false)
  await page.getByRole('button', { name: 'A 완료 취소', exact: true }).tap()
  await expect(page.locator('.routine-name')).toHaveText(['A', 'B', 'C'])
})

test('a failed completion write rolls back optimistic check and manual order without saving a false success', async ({ page }) => {
  await page.goto('./')
  for (const name of ['A', 'B']) await add(page, name)
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(...args: Parameters<typeof original>) {
      if (this.name === 'completions') throw new DOMException('test write failure', 'QuotaExceededError')
      return original.apply(this, args)
    }
  })
  await page.getByRole('button', { name: 'A 완료하기', exact: true }).tap()
  await expect(page.locator('.error-banner')).toBeVisible()
  await expect(page.locator('.routine-name')).toHaveText(['A', 'B'])
  await expect(page.getByRole('button', { name: 'A 완료하기', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await page.reload()
  await expect(page.locator('.routine-name')).toHaveText(['A', 'B'])
  await expect(page.getByRole('button', { name: 'A 완료하기', exact: true })).toHaveAttribute('aria-pressed', 'false')
})

test('check and regroup appear before a stalled IndexedDB write completes', async ({ page }) => {
  await page.goto('./')
  for (const name of ['A', 'B']) await add(page, name)
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const runtime = window as unknown as { releaseCompletionWriter: boolean }
    runtime.releaseCompletionWriter = false
    const request = indexedDB.open('eha-habit')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const connection = request.result
      const transaction = connection.transaction('completions', 'readwrite')
      transaction.oncomplete = () => connection.close()
      const hold = () => {
        const reading = transaction.objectStore('completions').get('isolated-write-lock')
        reading.onsuccess = () => { resolve(); if (!runtime.releaseCompletionWriter) hold() }
      }
      hold()
    }
  }))
  await page.getByRole('button', { name: 'A 완료하기', exact: true }).tap()
  await expect(page.getByRole('button', { name: 'A 완료 취소', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'A 완료 취소', exact: true })).toBeDisabled()
  await expect(page.locator('.routine-name')).toHaveText(['B', 'A'])
  await page.evaluate(() => { (window as unknown as { releaseCompletionWriter: boolean }).releaseCompletionWriter = true })
  await expect(page.getByRole('button', { name: 'A 완료 취소', exact: true })).toBeEnabled()
  await page.reload()
  await expect(page.locator('.routine-name')).toHaveText(['B', 'A'])
  await expect(page.getByRole('button', { name: 'A 완료 취소', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
