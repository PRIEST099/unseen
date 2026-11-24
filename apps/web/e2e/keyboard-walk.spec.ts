import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const SAMPLE = '/sample/cursed-shop-index'
const CHECKOUT = '/sample/cursed-shop-checkout'
// The committed samples rewrite the audited URL to https://the-unseen.app/cursed-shop/<page>.
const HOSTNAME = 'the-unseen.app'
const TRAPPED = 'Trapped: keyboard users cannot leave this dialog'

type Box = { backendDOMNodeId: number; x: number; y: number; width: number; height: number }
type SampleBody = {
  result: {
    raw: { tabWalkResult: { steps: Array<{ backendDOMNodeId: string }> }; boundingBoxes: Box[] }
    hauntings: Array<{ type: string }>
  }
}

async function loadSample(page: Page, id: string): Promise<SampleBody> {
  const response = await page.request.get(`/api/samples/${id}`)
  return response.json()
}

async function openWalk(page: Page, path: string): Promise<void> {
  await page.goto(`${path}/keyboard`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Keyboard Walk: ${HOSTNAME}`)
  await expect(page.getByRole('heading', { level: 2, name: 'Tab sequence' })).toBeVisible()
  await expect(page.locator('img[alt="Audited page screenshot"]')).toBeVisible()
}

const caption = (page: Page) => page.locator('.walk-step')
const events = (page: Page) => page.locator('.walk-events')
const play = (page: Page) => page.getByRole('button', { name: 'Play', exact: true })
const forward = (page: Page) => page.getByRole('button', { name: 'Step forward' })

async function stepForward(page: Page, times: number): Promise<void> {
  for (let count = 0; count < times; count += 1) await forward(page).click()
}

async function stepNumber(page: Page): Promise<number> {
  const text = (await caption(page).textContent()) ?? ''
  return Number(/^Step (\d+) of /.exec(text)?.[1] ?? 0)
}

test.describe('Keyboard walk', () => {
  test('Play moves the ghost along the Tab sequence, Pause holds it, and the step buttons move it by hand', async ({ page }) => {
    const body = await loadSample(page, 'cursed-shop-index')
    const total = body.result.raw.tabWalkResult.steps.length
    await openWalk(page, SAMPLE)

    await expect(caption(page)).toContainText(`Step 1 of ${total}: `)
    await expect(page.locator('.tab-ghost')).toBeVisible()
    const toggle = play(page)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.walk-caption')).toHaveAttribute('aria-live', 'polite')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.walk-caption')).toHaveAttribute('aria-live', 'off')
    await expect.poll(() => stepNumber(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(5)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await page.waitForTimeout(100)
    const pausedAt = await stepNumber(page)
    await page.waitForTimeout(900)
    expect(await stepNumber(page)).toBe(pausedAt)

    await forward(page).click()
    expect(await stepNumber(page)).toBe(pausedAt + 1)
    await page.getByRole('button', { name: 'Step back' }).click()
    expect(await stepNumber(page)).toBe(pausedAt)
    await page.getByRole('button', { name: 'Restart' }).click()
    await expect(caption(page)).toContainText(`Step 1 of ${total}: `)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  test('the ghost stands on the stepped element, inside the same scaled SVG', async ({ page }) => {
    const body = await loadSample(page, 'cursed-shop-index')
    const { steps } = body.result.raw.tabWalkResult
    const boxOf = (index: number): Box => {
      const box = body.result.raw.boundingBoxes.find((candidate) => candidate.backendDOMNodeId === Number(steps[index]?.backendDOMNodeId))
      if (box === undefined) throw new Error(`no box for step ${index}`)
      return box
    }
    await openWalk(page, SAMPLE)
    await expect(page.locator('svg.ghost-layer .tab-ghost')).toHaveCount(1)
    await expect(page.locator('svg.ghost-layer')).toHaveAttribute('aria-hidden', 'true')

    // Frames 0-18 are the recorded steps one for one; pick the first later step that has a box.
    const target = steps.findIndex(
      (entry, index) => index > 0 && index < 19 && body.result.raw.boundingBoxes.some((box) => box.backendDOMNodeId === Number(entry.backendDOMNodeId)),
    )
    expect(target).toBeGreaterThan(0)
    await stepForward(page, target)
    const expected = boxOf(target)
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const image = document.querySelector('img[alt="Audited page screenshot"]')
          const aura = document.querySelector('.ghost-aura')
          if (!(image instanceof HTMLImageElement) || aura === null) return null
          const imageRect = image.getBoundingClientRect()
          const auraRect = aura.getBoundingClientRect()
          const scale = imageRect.width / image.naturalWidth
          return {
            x: (auraRect.left + auraRect.width / 2 - imageRect.left) / scale,
            y: (auraRect.top + auraRect.height / 2 - imageRect.top) / scale,
          }
        }),
      )
      .toEqual({ x: expect.closeTo(expected.x + expected.width / 2, -1), y: expect.closeTo(expected.y + expected.height / 2, -1) })
  })

  test('reveals Lost Souls as the ghost passes them, announces them, and shows all of them by the end', async ({ page }) => {
    const body = await loadSample(page, 'cursed-shop-index')
    const souls = body.result.hauntings.filter((haunting) => haunting.type === 'LostSoul').length
    expect(souls).toBeGreaterThan(0)
    await openWalk(page, SAMPLE)

    const revealed = page.locator('.lost-soul-reveal[data-revealed="true"]')
    await expect(page.locator('.lost-soul-reveal')).toHaveCount(souls)
    await expect(revealed).toHaveCount(0)

    // Step by hand until the first Lost Soul is announced as skipped, then it is on show.
    let announced = false
    for (let count = 0; count < 45 && !announced; count += 1) {
      await forward(page).click()
      announced = ((await events(page).textContent()) ?? '').includes('Lost Soul skipped: ')
    }
    expect(announced).toBe(true)
    expect(await revealed.count()).toBeGreaterThan(0)
    expect(await revealed.count()).toBeLessThan(souls)

    await page.getByRole('button', { name: 'Restart' }).click()
    await expect(revealed).toHaveCount(0)
    await page.getByLabel('Speed').selectOption('2')
    await play(page).click()
    await expect(events(page)).toContainText('End of the Tab walk: ', { timeout: 30_000 })
    await expect(revealed).toHaveCount(souls)
    await expect(play(page)).toHaveAttribute('aria-pressed', 'false')
  })

  test('circles an escapable cycle twice, then breaks free and carries on', async ({ page }) => {
    await openWalk(page, SAMPLE)
    // Frames 0-18 are single steps; 19-21 are the recorded lap, 22-23 the added lap, then step 22 of the walk resumes.
    await stepForward(page, 19)
    await expect(events(page)).toContainText('Escapable cycle: lap 1 of 2')
    await stepForward(page, 3)
    await expect(events(page)).toContainText('Escapable cycle: lap 2 of 2')
    const circling = await stepNumber(page)
    await forward(page).click()
    expect(await stepNumber(page)).toBe(circling)
    await forward(page).click()
    await expect(events(page)).not.toContainText('Escapable cycle')
    expect(await stepNumber(page)).toBe(circling + 1)
  })

  test('traps the ghost in a Cursed Loop: ember ring, stop, and the trapped status', async ({ page }) => {
    await openWalk(page, CHECKOUT)
    await expect(page.locator('.trap-ring')).toHaveCount(1)
    await page.getByLabel('Speed').selectOption('2')
    await play(page).click()
    await expect(events(page)).toContainText(TRAPPED, { timeout: 15_000 })
    await expect(events(page)).toContainText('Cursed Loop: trapped')
    await expect(play(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.trap-ring ellipse')).toHaveClass(/cursed-loop-glow/)
    // The walk is over: there is no step beyond the trap.
    const before = await stepNumber(page)
    await forward(page).click()
    expect(await stepNumber(page)).toBe(before)
    await expect(events(page)).toContainText(TRAPPED)
    // Finite animation: the glow runs twice for 2 s, under the 5 s limit.
    const duration = await page.locator('.trap-ring ellipse').evaluate((element) => {
      const style = getComputedStyle(element)
      return { iterations: style.animationIterationCount, duration: style.animationDuration }
    })
    expect(duration).toEqual({ iterations: '2', duration: '2s' })
  })

  test('reduced motion: no transitions, but the walk still advances in 300 ms steps', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openWalk(page, SAMPLE)
    await expect(page.locator('.tab-ghost')).toHaveCSS('transition-duration', '0s')
    await expect(page.locator('.lost-soul-reveal').first()).toHaveCSS('transition-duration', '0s')

    const starts = Date.now()
    await play(page).click()
    // Not instant: it must not have jumped to the end or even past the first step straight away.
    expect(await stepNumber(page)).toBeLessThanOrEqual(2)
    await expect.poll(() => stepNumber(page), { timeout: 5_000 }).toBeGreaterThanOrEqual(4)
    expect(Date.now() - starts).toBeGreaterThanOrEqual(600)
  })

  test('has labelled controls, and does not start on its own', async ({ page }) => {
    await openWalk(page, SAMPLE)
    await page.waitForTimeout(800)
    await expect(caption(page)).toContainText('Step 1 of ')
    for (const name of ['Play', 'Step back', 'Step forward', 'Restart']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    }
    await expect(page.getByLabel('Speed')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Keyboard walk' })).toHaveAttribute('aria-current', 'page')
    await expect(events(page).locator('p')).toHaveCount(0)
  })
})
