import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const SAMPLE = '/sample/cursed-shop-index'
const WHISPER = `${SAMPLE}/whisper`
// The committed sample records the relative URL /cursed-shop/index.html, shown as "Cursed Shop (sample)".
const HOSTNAME = 'Cursed Shop (sample)'

type TrackLine = { backendDOMNodeId: number; text: string; note?: string; box: { x: number; y: number; width: number; height: number } | null }
type Spoken = { text: string; pitch: number; rate: number }

/**
 * A stand-in for window.speechSynthesis (requirement 28.6): speak() calls onstart, then onend after
 * `__endDelay` ms, and records what was spoken. Written as a string so it runs untyped in the page.
 */
const SPEECH_STUB = `
  (() => {
    const spoken = []
    window.__spoken = spoken
    window.__endDelay = 10
    const stub = {
      speaking: false, pending: false, paused: false,
      speak(utterance) {
        spoken.push({ text: utterance.text, pitch: utterance.pitch, rate: utterance.rate })
        setTimeout(() => {
          if (utterance.onstart) utterance.onstart({})
          setTimeout(() => { if (utterance.onend) utterance.onend({}) }, window.__endDelay)
        }, 0)
      },
      cancel() {}, pause() {}, resume() {}, getVoices() { return [] },
      addEventListener() {}, removeEventListener() {},
    }
    Object.defineProperty(window, 'speechSynthesis', { value: stub, configurable: true })
  })()
`

async function loadTrack(page: Page): Promise<TrackLine[]> {
  const response = await page.request.get('/api/samples/cursed-shop-index')
  const body: { speechTrack: TrackLine[] } = await response.json()
  return body.speechTrack
}

async function spokenSoFar(page: Page): Promise<Spoken[]> {
  return page.evaluate((): Spoken[] => Reflect.get(window, '__spoken'))
}

async function openWhisper(page: Page): Promise<void> {
  await page.addInitScript({ content: SPEECH_STUB })
  await page.goto(WHISPER)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Whisper Walk: ${HOSTNAME}`)
  await expect(page.getByRole('heading', { level: 2, name: 'Screen reader announcements' })).toBeVisible()
  await expect(page.locator('img[alt="Audited page screenshot"]')).toBeVisible()
}

test.describe('Whisper walk', () => {
  test('Play speaks in a whisper through its own gesture, leaves the ambient sound off and advances the caption; Pause and the step buttons move it by hand', async ({ page }) => {
    const track = await loadTrack(page)
    expect(track.length).toBeGreaterThan(5)
    // Counts AudioContext constructions: the drone must start only from the header toggle (requirement 33.2).
    await page.addInitScript(() => {
      Reflect.set(window, '__audioContexts', 0)
      const Original = window.AudioContext
      if (typeof Original !== 'function') return
      window.AudioContext = class extends Original {
        constructor(options?: AudioContextOptions) {
          super(options)
          Reflect.set(window, '__audioContexts', Number(Reflect.get(window, '__audioContexts')) + 1)
        }
      }
    })
    await openWhisper(page)
    // Each utterance lasts about 400 ms, so the test can see every caption in turn.
    await page.evaluate(() => Reflect.set(window, '__endDelay', 400))

    const text = page.locator('.whisper-text')
    const counter = page.locator('.whisper-counter')
    const sound = page.getByRole('button', { name: 'Toggle sound' })
    await expect(text).toHaveText(track[0]!.text)
    await expect(counter).toHaveText(`1 of ${track.length}`)
    await expect(sound).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.whisper-caption')).toHaveAttribute('aria-live', 'polite')

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    // Play allows Web Speech by itself (requirement 20.4); the header toggle controls only the drone and
    // chimes (requirement 33.3), so it stays off and no AudioContext is created.
    await expect(sound).toHaveAttribute('aria-pressed', 'false')

    // The first utterance ends, and the caption moves on to the second line.
    await expect(counter).toHaveText(`2 of ${track.length}`, { timeout: 10_000 })
    await expect(text).toHaveText(track[1]!.text)
    expect(await page.evaluate((): unknown => Reflect.get(window, '__audioContexts'))).toBe(0)
    await expect(sound).toHaveAttribute('aria-pressed', 'false')
    const spoken = await spokenSoFar(page)
    expect(spoken[0]?.text).toBe(track[0]!.text)
    for (const utterance of spoken) {
      // Chromium stores pitch and rate as 32-bit floats, so 0.8 reads back as 0.800000011920929.
      expect(utterance.pitch).toBeLessThanOrEqual(0.8 + 1e-6)
      expect(utterance.rate).toBeLessThanOrEqual(0.85 + 1e-6)
    }

    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await page.waitForTimeout(100)
    const pausedAt = await counter.textContent()
    await page.waitForTimeout(1200)
    await expect(counter).toHaveText(pausedAt ?? '')
    const spokenWhilePaused = (await spokenSoFar(page)).length

    await page.getByRole('button', { name: 'Step forward' }).click()
    const afterForward = Number((pausedAt ?? '').split(' ')[0]) + 1
    await expect(counter).toHaveText(`${afterForward} of ${track.length}`)
    await expect(text).toHaveText(track[afterForward - 1]!.text)

    await page.getByRole('button', { name: 'Step back' }).click()
    await expect(counter).toHaveText(pausedAt ?? '')
    // Stepping while paused changes the caption without speaking.
    expect((await spokenSoFar(page)).length).toBe(spokenWhilePaused)
  })

  test('highlights the spoken element on the screenshot, at the same scale', async ({ page }) => {
    const track = await loadTrack(page)
    const firstWithBox = track.findIndex((line) => line.box !== null && line.box.width > 0 && line.box.height > 0)
    expect(firstWithBox).toBeGreaterThanOrEqual(0)
    await openWhisper(page)

    for (let step = 0; step < firstWithBox; step += 1) await page.getByRole('button', { name: 'Step forward' }).click()
    const line = track[firstWithBox]!
    const highlight = page.locator('.whisper-highlight')
    await expect(highlight).toHaveAttribute('data-node-id', String(line.backendDOMNodeId))
    // The highlight sits in an aria-hidden layer with no text or focusable content.
    await expect(page.locator('svg.haunting-overlay')).toHaveAttribute('aria-hidden', 'true')

    const placement = await page.evaluate(() => {
      const image = document.querySelector('img[alt="Audited page screenshot"]')
      const box = document.querySelector('.whisper-highlight-box')
      if (!(image instanceof HTMLImageElement) || box === null) return null
      const imageRect = image.getBoundingClientRect()
      const boxRect = box.getBoundingClientRect()
      return {
        scale: imageRect.width / image.naturalWidth,
        left: boxRect.left - imageRect.left,
        top: boxRect.top - imageRect.top,
        width: boxRect.width,
      }
    })
    expect(placement).not.toBeNull()
    const pad = 4
    expect(Math.abs((placement?.left ?? 0) - (line.box!.x - pad) * (placement?.scale ?? 1))).toBeLessThan(2)
    expect(Math.abs((placement?.top ?? 0) - (line.box!.y - pad) * (placement?.scale ?? 1))).toBeLessThan(2)
    expect(Math.abs((placement?.width ?? 0) - (line.box!.width + 2 * pad) * (placement?.scale ?? 1))).toBeLessThan(2)
  })

  test('keeps the caption off the live region during audio, and a slower speed lowers the rate', async ({ page }) => {
    const track = await loadTrack(page)
    await openWhisper(page)
    await page.evaluate(() => Reflect.set(window, '__endDelay', 600_000))
    await page.getByLabel('Speed').selectOption('0.5')

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    // While audio plays the caption is not announced a second time.
    await expect(page.locator('.whisper-caption')).toHaveAttribute('aria-live', 'off')
    await expect.poll(async () => (await spokenSoFar(page)).length).toBeGreaterThan(0)
    const [first] = await spokenSoFar(page)
    expect(first?.text).toBe(track[0]!.text)
    expect(first?.rate).toBeCloseTo(0.425, 3)

    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect(page.locator('.whisper-caption')).toHaveAttribute('aria-live', 'polite')
  })

  test('captions only advances on a timer with no audio, and does not turn the ambient sound on', async ({ page }) => {
    const track = await loadTrack(page)
    await openWhisper(page)
    await page.getByRole('checkbox', { name: 'Captions only' }).check()

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.locator('.whisper-caption')).toHaveAttribute('aria-live', 'polite')
    await expect(page.locator('.whisper-counter')).toHaveText(`2 of ${track.length}`, { timeout: 10_000 })
    expect(await spokenSoFar(page)).toEqual([])
    await expect(page.getByRole('button', { name: 'Toggle sound' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('does not play on its own, and has labelled controls', async ({ page }) => {
    await openWhisper(page)
    await page.waitForTimeout(800)
    expect(await spokenSoFar(page)).toEqual([])
    for (const name of ['Play', 'Step back', 'Step forward']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    }
    await expect(page.getByLabel('Speed')).toBeVisible()
    await expect(page.getByLabel('Voice')).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Captions only' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Whisper walk' })).toHaveAttribute('aria-current', 'page')
  })
})
