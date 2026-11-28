import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * The ghost in every gilt-framed painting: it is on every page (the landing hero, the séance, the
 * not-found and state pages, and every audit lens), it peeks in from behind the inner edge of the frame,
 * and it never covers text, controls, the plaque or the candle. The intro is already seen (`./fixtures`).
 */

const SAMPLE = '/sample/cursed-shop-index'
const PAINTING_GHOST = 'svg.painting-ghost'

/** The 8 routes the self-audit visits, with the heading that says the page has rendered. */
const ROUTES: { path: string; heading: RegExp }[] = [
  { path: '/', heading: /^THE UNSEEN$/ },
  { path: SAMPLE, heading: /^Spirit Sight/ },
  { path: `${SAMPLE}/whisper`, heading: /^Whisper Walk/ },
  { path: `${SAMPLE}/keyboard`, heading: /^Keyboard Walk/ },
  { path: `${SAMPLE}/daylight`, heading: /^Daylight report/ },
  { path: '/nonexistent', heading: /^Page not found$/ },
  { path: '/audit/expired-job', heading: /^Audit not found$/ },
  { path: '/sample/no-such-sample', heading: /^Sample not found$/ },
]

type Geometry = {
  ariaHidden: string | null
  painting: { left: number; top: number; right: number; bottom: number }
  boxes: { name: string; left: number; top: number; right: number; bottom: number }[]
  /** Everything a ghost must keep clear of: text, controls, the plaque and the candle. */
  obstacles: { name: string; left: number; top: number; right: number; bottom: number }[]
  mood: string | null
  decorativeInStage: number
}

/** What the page says about the painting ghost, read in one go so the two checks see the same frame. */
async function readGeometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const ghost = document.querySelector('svg.painting-ghost')
    if (ghost === null) throw new Error('no painting ghost')
    const painting = ghost.closest('.painting')
    if (painting === null) throw new Error('the ghost is not in a painting')
    const rect = (element: Element): { left: number; top: number; right: number; bottom: number } => {
      const { left, top, right, bottom } = element.getBoundingClientRect()
      return { left, top, right, bottom }
    }
    const box = rect(painting)
    const style = getComputedStyle(painting)
    const inner = {
      left: box.left + parseFloat(style.borderLeftWidth),
      top: box.top + parseFloat(style.borderTopWidth),
      right: box.right - parseFloat(style.borderRightWidth),
      bottom: box.bottom - parseFloat(style.borderBottomWidth),
    }
    // The contract: the outer svg box and both eye ellipses lie inside the picture's padding box. The
    // body paths are clipped visually by the svg's viewBox, so their own client rects are not checked.
    const eyes = [...ghost.querySelectorAll('g[transform] > ellipse')].map((eye, index) => ({ name: `eye ${index}`, ...rect(eye) }))
    const boxes = [{ name: 'svg', ...rect(ghost) }, ...eyes]
    const obstacles: Geometry['obstacles'] = []
    for (const selector of ['.hero-plaque', '.landing-candle', 'a[href], button, input, select, textarea, summary']) {
      for (const element of document.querySelectorAll(selector)) {
        const r = rect(element)
        if (r.right > r.left && r.bottom > r.top) obstacles.push({ name: selector, ...r })
      }
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if ((node.textContent ?? '').trim() === '' || node.parentElement?.closest('[aria-hidden="true"]') != null) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const r of range.getClientRects()) obstacles.push({ name: `text "${(node.textContent ?? '').trim().slice(0, 20)}"`, left: r.left, top: r.top, right: r.right, bottom: r.bottom })
    }
    return {
      ariaHidden: ghost.getAttribute('aria-hidden'),
      painting: inner,
      boxes,
      obstacles,
      mood: ghost.getAttribute('data-mood'),
      decorativeInStage: document.querySelectorAll('.stage-frame .painting-ghost, .haunting-overlay .painting-ghost, .ghost-layer .painting-ghost, .stage-frame svg.ghost, .ghost-layer svg.ghost').length,
    }
  })
}

const SLACK = 1

function expectInside(name: string, inner: Geometry['painting'], outer: Geometry['painting']): void {
  expect(inner.left, `${name} left`).toBeGreaterThanOrEqual(outer.left - SLACK)
  expect(inner.top, `${name} top`).toBeGreaterThanOrEqual(outer.top - SLACK)
  expect(inner.right, `${name} right`).toBeLessThanOrEqual(outer.right + SLACK)
  expect(inner.bottom, `${name} bottom`).toBeLessThanOrEqual(outer.bottom + SLACK)
}

function intersects(a: Geometry['painting'], b: Geometry['painting']): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
]) {
  test(`every page has a painting ghost whose outer svg box and both eye ellipses are inside the picture's padding box and clear of everything (${viewport.width} px wide)`, async ({ page }) => {
    await page.setViewportSize(viewport)
    for (const route of ROUTES) {
      await page.goto(route.path)
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
      await expect(page.locator(PAINTING_GHOST), route.path).toHaveCount(1)
      // The first frame of a ghost that slides in is hidden: wait until it stands in its spot.
      await expect(page.locator(PAINTING_GHOST)).toHaveAttribute('data-out', 'false')
      const geometry = await readGeometry(page)
      expect(geometry.ariaHidden, route.path).toBe('true')
      for (const box of geometry.boxes) {
        expectInside(`${route.path} ${box.name}`, box, geometry.painting)
        for (const obstacle of geometry.obstacles) {
          expect(intersects(box, obstacle), `${route.path}: ${box.name} meets ${obstacle.name}`).toBe(false)
        }
      }
      expect(geometry.boxes.filter((box) => box.name.startsWith('eye'))).toHaveLength(2)
      // Never a decorative ghost inside an audit stage: real findings are drawn there.
      expect(geometry.decorativeInStage, route.path).toBe(0)
      expect(await page.locator('.stage-frame .painting-ghost, .haunting-overlay .painting-ghost, .ghost-layer .painting-ghost').count()).toBe(0)
      expect(geometry.mood, route.path).toBe(route.path.endsWith('/daylight') ? 'sleepy' : 'looking')
    }
  })
}

for (const viewport of [
  { width: 1800, height: 1200 },
  { width: 430, height: 932 },
]) {
  test(`a painting ghost on a side edge stands upright: its eyes are side by side (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: /^THE UNSEEN$/ })).toBeVisible()
    const ghost = page.locator(PAINTING_GHOST)
    await expect(ghost).toHaveAttribute('data-out', 'false')
    const edge = await ghost.getAttribute('data-edge')
    test.skip(edge !== 'left' && edge !== 'right', `the ghost is on the ${edge ?? 'unknown'} edge here`)
    const centres = await ghost.evaluate((svg) =>
      [...svg.querySelectorAll('g[transform] > ellipse')].map((eye) => {
        const r = eye.getBoundingClientRect()
        return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }
      }),
    )
    expect(centres).toHaveLength(2)
    const [a, b] = centres
    if (a === undefined || b === undefined) throw new Error('no eyes')
    expect(Math.abs(a.y - b.y), `eyes ${JSON.stringify(centres)}`).toBeLessThan(Math.abs(a.x - b.x))
  })
}

test('the lantern startles the painting ghost; it comes back at another spot within 8 s', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const ghost = page.locator(PAINTING_GHOST)
  await expect(ghost).toHaveAttribute('data-out', 'false')
  const where = async (): Promise<string> => ghost.evaluate((element) => `${element.getAttribute('data-edge')}/${(element as SVGElement).style.left}/${(element as SVGElement).style.top}`)
  const before = await where()
  const box = await ghost.boundingBox()
  if (box === null) throw new Error('no ghost box')
  await page.mouse.move(5, 5)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 })
  await expect(ghost).toHaveAttribute('data-out', 'true')
  await expect(ghost).toHaveAttribute('data-gone', 'true')
  expect(await ghost.evaluate((element) => getComputedStyle(element).visibility)).toBe('hidden')
  await page.mouse.move(5, 5, { steps: 4 })
  await expect(ghost).toHaveAttribute('data-out', 'false', { timeout: 8_000 })
  expect(await ghost.evaluate((element) => getComputedStyle(element).visibility)).toBe('visible')
  expect(await where()).not.toBe(before)
})

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } })

  test('a tap inside the painting startles the ghost; a tap on a nearby control still works', async ({ page }) => {
    await page.goto('/')
    const ghost = page.locator(PAINTING_GHOST)
    await expect(ghost).toHaveAttribute('data-out', 'false')
    const box = await ghost.boundingBox()
    if (box === null) throw new Error('no ghost box')
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    await expect(ghost).toHaveAttribute('data-out', 'true')
    const toggle = page.getByRole('button', { name: 'Hide ghosts' })
    await toggle.tap()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(ghost).toHaveCount(0)
  })
})

test('"Hide ghosts" removes the painting ghost and the margin ghosts on an audit route, and the choice survives a lens change and a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(SAMPLE)
  await expect(page.locator(PAINTING_GHOST)).toHaveCount(1)
  await expect(page.locator('.margin-ghost').first()).toBeAttached()
  await page.getByRole('button', { name: 'Hide ghosts' }).click()
  await expect(page.locator(PAINTING_GHOST)).toHaveCount(0)
  await expect(page.locator('.margin-ghost')).toHaveCount(0)
  await page.getByRole('link', { name: /Keyboard walk/i }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: /^Keyboard Walk/ })).toBeVisible()
  await expect(page.locator(PAINTING_GHOST)).toHaveCount(0)
  await expect(page.locator('.margin-ghost')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: /^Keyboard Walk/ })).toBeVisible()
  await expect(page.locator(PAINTING_GHOST)).toHaveCount(0)
  await expect(page.locator('.margin-ghost')).toHaveCount(0)
})

test('on an audit lens the margin ghosts appear where the wall is wide, never on Daylight, and nothing animates for good', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(SAMPLE)
  await expect(page.getByRole('heading', { level: 1, name: /^Spirit Sight/ })).toBeVisible()
  await expect(page.locator('.margin-ghost').first()).toBeAttached()
  // No sliver: every margin ghost shows both of its eyes, above the footer.
  const problems = await page.evaluate(() => {
    const footerTop = document.querySelector('footer.app-footer')?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
    const width = document.documentElement.clientWidth
    const out: string[] = []
    for (const ghost of document.querySelectorAll('.margin-ghost')) {
      const eyes = [...ghost.querySelectorAll('svg.ghost > ellipse')].map((eye) => eye.getBoundingClientRect())
      if (eyes.length !== 2) out.push('not two eyes')
      for (const eye of eyes) if (eye.bottom > footerTop + 2 || eye.left < -2 || eye.right > width + 2) out.push(`eye ${eye.left},${eye.top} is cut off`)
    }
    return out
  })
  expect(problems).toEqual([])
  await page.waitForTimeout(2_000)
  const running = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').map((animation) => animation.id || String(animation.effect?.getComputedTiming().iterations)))
  expect(running).toEqual([])

  for (const size of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(size)
    await page.goto(`${SAMPLE}/daylight`)
    await expect(page.getByRole('heading', { level: 1, name: /^Daylight report/ })).toBeVisible()
    await expect(page.locator(PAINTING_GHOST)).toHaveCount(1)
    await expect(page.locator('.margin-ghost')).toHaveCount(0)
  }
})

/** The ghost's full art size in px: the svg shows part of the 120-unit art box, so scale its width back up. */
async function fullArtSize(page: Page): Promise<number> {
  const ghost = page.locator(PAINTING_GHOST)
  await expect(ghost).toHaveAttribute('data-out', 'false')
  return ghost.evaluate((element) => {
    const width = Number(element.getAttribute('width'))
    const viewBoxWidth = Number((element.getAttribute('viewBox') ?? '').split(/\s+/)[2])
    return (width * 120) / viewBoxWidth
  })
}

test('the Daylight ghost is the last one left: smaller, fainter, sleepy, and it never bobs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${SAMPLE}/keyboard`)
  await expect(page.getByRole('heading', { level: 1, name: /^Keyboard Walk/ })).toBeVisible()
  const normal = await fullArtSize(page)
  await page.goto(`${SAMPLE}/daylight`)
  await expect(page.getByRole('heading', { level: 1, name: /^Daylight report/ })).toBeVisible()
  const ghost = page.locator(PAINTING_GHOST)
  await expect(ghost).toHaveAttribute('data-mood', 'sleepy')
  expect(await ghost.evaluate((element) => getComputedStyle(element).opacity)).toBe('0.75')
  expect(await ghost.evaluate((element) => getComputedStyle(element.querySelector('.painting-ghost-bob') as Element).animationName)).toBe('none')
  const sleepy = await fullArtSize(page)
  expect(sleepy).toBeLessThan(normal)
  expect(sleepy).toBeGreaterThanOrEqual(40)
  expect(sleepy).toBeLessThanOrEqual(105)
})

test('Spirit Sight holds the painting ghost still from the click that opens it, before any haunting is revealed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(SAMPLE)
  await expect(page.getByRole('heading', { level: 1, name: /^Spirit Sight/ })).toBeVisible()
  const ghost = page.locator(PAINTING_GHOST)
  await expect(ghost).toHaveAttribute('data-out', 'false')
  await page.mouse.move(5, 5)
  // In one go inside the page: open the overlay, then bring the lantern onto the ghost at once, and
  // look two frames later, while the fog wave is still above the screenshot (nothing revealed yet).
  const seen = await page.evaluate(async () => {
    const toggle = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Open Spirit Sight') || button.getAttribute('aria-label') === 'Open Spirit Sight')
    const svg = document.querySelector('svg.painting-ghost')
    if (toggle === undefined || svg === null) throw new Error('no toggle or no ghost')
    toggle.click()
    await new Promise<void>((done) => requestAnimationFrame(() => done()))
    const box = svg.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    for (let step = 0; step < 4; step += 1) window.dispatchEvent(new PointerEvent('pointermove', { clientX: x + step, clientY: y, pointerType: 'mouse', bubbles: true }))
    await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))
    return {
      pressed: toggle.getAttribute('aria-pressed'),
      revealed: document.querySelectorAll('.haunting-overlay-button').length,
      out: document.querySelector('svg.painting-ghost')?.getAttribute('data-out') ?? null,
    }
  })
  expect(seen.pressed).toBe('true')
  // The moment being tested: open, but no haunting placed yet.
  expect(seen.revealed).toBe(0)
  expect(seen.out).toBe('false')
  await page.waitForTimeout(400)
  await expect(ghost).toHaveAttribute('data-out', 'false')
})
