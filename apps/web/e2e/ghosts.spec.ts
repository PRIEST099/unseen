import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { INTRO_SEEN_KEY, test as seenTest } from './fixtures'
import { analyzeWithPausedClock, pauseClock } from './intro-clock'

/**
 * The ghosts in the margins: the lights-on intro, the peeking ghosts, the lantern and the "Hide ghosts"
 * switch. The intro specs use the plain Playwright `test` (a real first visit); the others start with the
 * intro already seen (`./fixtures`). The default viewport (1280 x 720) gets three ghosts.
 *
 * The ghosts hide BEHIND the page (under the header, the panel and the footer), so most of the checks
 * here are about stacking order and about where the visible part of a ghost is.
 */

const HIDE_GHOSTS_KEY = 'unseen.hide-ghosts'
const INTRO = '.lights-on'
const GHOSTS = '.margin-ghost'
const STATUS_TEXT = 'Lighting the candles…'
/** `SKIP_CLICK_GRACE_MS` in LightsOn.tsx, with a little to spare. */
const SKIP_GRACE_MS = 400

type Rect = { left: number; right: number; top: number; bottom: number }

async function rectOf(page: Page, selector: string): Promise<Rect> {
  return page.evaluate((query) => {
    const element = document.querySelector(query)
    if (element === null) throw new Error(`no ${query}`)
    const { left, right, top, bottom } = element.getBoundingClientRect()
    return { left, right, top, bottom }
  }, selector)
}

/** The part of ghost `index` that shows: its box, inside the window, over the wall (not the panel or its ring). */
async function visibleRect(page: Page, index = 0): Promise<Rect> {
  return page.evaluate((position) => {
    const element = document.querySelectorAll('.margin-ghost')[position]
    if (element === undefined) throw new Error('no ghost')
    const box = element.getBoundingClientRect()
    const main = document.getElementById('main')?.getBoundingClientRect()
    const width = document.documentElement.clientWidth
    const height = document.documentElement.clientHeight
    const onLeft = box.left + box.width / 2 < width / 2
    const wallLeft = main === undefined ? 0 : onLeft ? 0 : main.right + 6
    const wallRight = main === undefined ? width : onLeft ? main.left - 6 : width
    return {
      left: Math.max(box.left, wallLeft),
      right: Math.min(box.right, wallRight),
      top: Math.max(box.top, 0),
      bottom: Math.min(box.bottom, height),
    }
  }, index)
}

const centre = (rect: Rect): { x: number; y: number } => ({ x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 })

async function spotsOf(page: Page): Promise<string[]> {
  return page.locator(GHOSTS).evaluateAll((all) =>
    all.map((element) => `${element.getAttribute('data-edge')}/${element.getAttribute('data-anchor')}/${element.getAttribute('data-pos')}`),
  )
}

/**
 * The eyes of every margin ghost, as Chromium lays them out: the bounding box of each eye oval of the
 * drawing, after the CSS turn. (That box is a little larger than the turned oval, so this is strict.)
 */
async function eyeRects(page: Page): Promise<Rect[][]> {
  return page.locator(GHOSTS).evaluateAll((all) =>
    all.map((ghost) =>
      [...ghost.querySelectorAll('svg.ghost > ellipse')].map((eye) => {
        const { left, right, top, bottom } = eye.getBoundingClientRect()
        return { left, right, top, bottom }
      }),
    ),
  )
}

/** What hides a ghost: the window edges, the header, the panel with its 6 px ring, and the footer. */
type Wall = { width: number; height: number; headerBottom: number; panel: Rect; footerTop: number }

async function wallOf(page: Page): Promise<Wall> {
  return page.evaluate(() => {
    const rect = (query: string): DOMRect | undefined => document.querySelector(query)?.getBoundingClientRect()
    const main = rect('#main')
    return {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      headerBottom: rect('header.app-header')?.bottom ?? 0,
      panel: main === undefined ? { left: 0, right: 0, top: 0, bottom: 0 } : { left: main.left, right: main.right, top: main.top, bottom: main.bottom },
      footerTop: rect('footer.app-footer')?.top ?? Number.POSITIVE_INFINITY,
    }
  })
}

/** Rounding and the turned box's extra corners: a pixel or two. */
const EYE_SLACK = 2

/** An eye shows when all of it is on the wall: in the window, below the header, above the footer, beside the panel ring. */
function eyeShows(eye: Rect, wall: Wall): boolean {
  const inWindow = eye.left >= -EYE_SLACK && eye.right <= wall.width + EYE_SLACK && eye.bottom <= wall.height + EYE_SLACK
  const belowHeader = eye.top >= wall.headerBottom - EYE_SLACK
  const aboveFooter = eye.bottom <= wall.footerTop + EYE_SLACK
  const besidePanel = eye.right <= wall.panel.left - 6 + EYE_SLACK || eye.left >= wall.panel.right + 6 - EYE_SLACK
  return inWindow && belowHeader && aboveFooter && besidePanel
}

/** Every ghost shows both of its eyes. */
async function expectEyesShow(page: Page): Promise<void> {
  const wall = await wallOf(page)
  const ghosts = await eyeRects(page)
  for (const [index, eyes] of ghosts.entries()) {
    expect(eyes, `ghost ${index} has two eyes`).toHaveLength(2)
    for (const eye of eyes) expect(eyeShows(eye, wall), `ghost ${index}: eye ${JSON.stringify(eye)} on ${JSON.stringify(wall)}`).toBe(true)
  }
}

/** Records, with `performance.now()` in the page, when the intro first appears (its mount) and when it leaves. */
async function watchIntro(page: Page): Promise<void> {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const present = document.querySelector('.lights-on') !== null
      if (present && Reflect.get(window, '__introMountedAt') === undefined) Reflect.set(window, '__introMountedAt', performance.now())
      else if (!present && Reflect.get(window, '__introMountedAt') !== undefined && Reflect.get(window, '__introGoneAt') === undefined) {
        Reflect.set(window, '__introGoneAt', performance.now())
      }
    }).observe(document, { childList: true, subtree: true })
  })
}

/** How long the intro was on the page: from its mount to its removal, in ms. */
async function introLifetime(page: Page): Promise<number> {
  await page.waitForFunction(() => Reflect.get(window, '__introGoneAt') !== undefined)
  return page.evaluate(() => Number(Reflect.get(window, '__introGoneAt')) - Number(Reflect.get(window, '__introMountedAt')))
}

/** The fonts never finish loading: the intro can only end through its own time limit. */
async function fontsNeverLoad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'fonts', { value: { ready: new Promise(() => undefined) }, configurable: true })
  })
}

test.describe('the lights-on intro', () => {
  test('starts dark with a status line, keeps the real page in the tree, and is gone within 2.5 s of its mount', async ({ page }) => {
    await watchIntro(page)
    await page.goto('/')
    const status = page.getByRole('status').filter({ hasText: STATUS_TEXT })
    await expect(status).toBeVisible()
    // The real page renders underneath the whole time and stays in the accessibility tree.
    await expect(page.getByRole('heading', { level: 1, name: 'THE UNSEEN' })).toHaveCount(1)
    await expect(page.locator(`${INTRO} .lights-on-dark`)).toHaveAttribute('aria-hidden', 'true')
    await expect(page.locator(`${INTRO} .lights-on-ghost`)).not.toHaveCount(0)

    await expect(page.locator(INTRO)).toHaveCount(0, { timeout: 3_000 })
    const lifetime = await introLifetime(page)
    // At least the 900 ms minimum and the 600 ms fade; gone by 2.5 s after mount.
    expect(lifetime).toBeGreaterThanOrEqual(1_500)
    expect(lifetime).toBeLessThanOrEqual(2_500)
    // The status text goes with the dark layer, and the page is usable.
    await expect(status).toHaveCount(0)
    await expect(page.getByLabel('Enter a URL to audit')).toBeEnabled()
    // The intro's ghosts hand over to the peeking ghosts.
    await expect(page.locator(GHOSTS)).toHaveCount(3)
  })

  test('is gone within 2.5 s of its mount even when the fonts never finish loading', async ({ page }) => {
    await fontsNeverLoad(page)
    await watchIntro(page)
    await page.goto('/')
    await expect(page.getByRole('status').filter({ hasText: STATUS_TEXT })).toBeVisible()
    await expect(page.locator(INTRO)).toHaveCount(0, { timeout: 3_000 })
    const lifetime = await introLifetime(page)
    // Only the time limit can end it here. The lights come on at 1.8 s after mount less the load time
    // (at most 700 ms of it), then a 600 ms fade: at least 1.7 s. An intro that did not wait for the fonts
    // would be gone after 900 + 600 = 1.5 s.
    expect(lifetime).toBeGreaterThanOrEqual(1_650)
    expect(lifetime).toBeLessThanOrEqual(2_500)
  })

  test('the margin ghosts wait invisible while the intro plays, and show when it ends: one ghost, not two', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(INTRO)).toHaveCount(1)
    await expect(page.locator('.margin-ghosts')).toHaveAttribute('data-intro', 'true')
    expect(await page.locator('.margin-ghosts').evaluate((element) => getComputedStyle(element).visibility)).toBe('hidden')
    await expect(page.locator(INTRO)).toHaveCount(0, { timeout: 3_000 })
    await expect(page.locator('.margin-ghosts')).toHaveAttribute('data-intro', 'false')
    expect(await page.locator('.margin-ghosts').evaluate((element) => getComputedStyle(element).visibility)).toBe('visible')
  })

  test('the intro ghosts land where the margin ghosts stand: on the real margins, not a default', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(`${INTRO}[data-phase="lights"]`)).toHaveCount(1, { timeout: 3_000 })
    // The target of each dart is set the moment the lights come on (the dart itself takes 500 ms).
    const landed = await page.locator('.lights-on-ghost').evaluateAll((all) =>
      all.map((element) => {
        const match = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec((element as HTMLElement).style.transform)
        return { x: Math.round(Number(match?.[1])), y: Math.round(Number(match?.[2])) }
      }),
    )
    await expect(page.locator(INTRO)).toHaveCount(0, { timeout: 3_000 })
    const margin = await page.locator(GHOSTS).evaluateAll((all) =>
      all.map((element) => ({ x: Math.round(parseFloat((element as HTMLElement).style.left)), y: Math.round(parseFloat((element as HTMLElement).style.top)) })),
    )
    expect(margin).toHaveLength(3)
    // Each margin ghost stands exactly where one of the intro's ghosts was sent.
    for (const ghost of margin) expect(landed, `no intro ghost was sent to ${ghost.x},${ghost.y}`).toContainEqual(ghost)
  })

  test('the landing page is usable during the intro: Tab still reaches the skip link', async ({ page }) => {
    // Paused before the page loads: no intro timer can fire, so only the key press can end the dark.
    await pauseClock(page)
    await page.goto('/')
    await expect(page.locator(`${INTRO}[data-phase="dark"]`)).toHaveCount(1)
    await expect(page.getByRole('status').filter({ hasText: STATUS_TEXT })).toBeVisible()
    await page.keyboard.press('Tab')
    // The key press skipped the intro and was not swallowed.
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
    await expect(page.locator(INTRO)).toHaveCount(0)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Toggle sound' })).toBeFocused()
  })

  test('a click on the dark skips it', async ({ page }) => {
    // Paused before the page loads: only the click can end the dark.
    await pauseClock(page)
    await page.goto('/')
    await expect(page.locator(`${INTRO}[data-phase="dark"]`)).toHaveCount(1)
    await page.mouse.click(640, 360)
    await expect(page.locator(INTRO)).toHaveCount(0, { timeout: 1_000 })
  })

  test('plays once per browser session, not on a later load or navigation', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(INTRO)).toHaveCount(0, { timeout: 3_000 })
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), INTRO_SEEN_KEY)).not.toBeNull()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'THE UNSEEN' })).toBeVisible()
    await expect(page.locator(INTRO)).toHaveCount(0)
    await page.goto('/sample/cursed-shop-index')
    await page.getByRole('link', { name: 'THE UNSEEN' }).click()
    await expect(page.locator(INTRO)).toHaveCount(0)
  })

  test('the intro itself leaves nothing to fix: no axe violations while its dark phase is on screen', async ({ page }) => {
    // The clock is paused before the page loads: the intro's timers cannot fire while axe runs (axe's
    // own timers are stepped through, never more than 600 ms of page time).
    await pauseClock(page)
    await page.goto('/')
    await expect(page.locator(`${INTRO}[data-phase="dark"]`)).toHaveCount(1)
    await expect(page.getByRole('status').filter({ hasText: STATUS_TEXT })).toBeVisible()
    const results = await analyzeWithPausedClock(page)
    // Still dark after the analysis: axe saw the dark layer and the status text.
    await expect(page.locator(`${INTRO}[data-phase="dark"] .lights-on-dark`)).toHaveCount(1)
    await expect(page.getByRole('status').filter({ hasText: STATUS_TEXT })).toBeVisible()
    expect(results.violations.map((rule) => rule.id)).toEqual([])
    // The status text sits on its own solid panel, and no ghost drifts over it: contrast stays measurable.
    expect(results.incomplete.map((rule) => rule.id)).toEqual([])
    // It was the paused clock that held it: once time runs again, the time limit ends it.
    await page.clock.resume()
    await expect(page.locator(INTRO)).toHaveCount(0, { timeout: 4_000 })
  })

  test('never plays when the ghosts are hidden', async ({ page }) => {
    await page.addInitScript((key) => window.localStorage.setItem(key, '1'), HIDE_GHOSTS_KEY)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'THE UNSEEN' })).toBeVisible()
    await expect(page.locator(INTRO)).toHaveCount(0)
    await expect(page.locator(GHOSTS)).toHaveCount(0)
  })
})

test.describe('the intro on a touch screen', () => {
  test.use({ hasTouch: true })

  test('a tap that skips the intro does not press the control under it', async ({ page }) => {
    // Paused before the page loads, so the intro is still dark when the tap lands (no 900 ms or 1.8 s timer races it).
    await pauseClock(page)
    await page.goto('/')
    await expect(page.locator(`${INTRO}[data-phase="dark"]`)).toHaveCount(1)
    const toggle = page.getByRole('button', { name: 'Hide ghosts' })
    const box = await toggle.boundingBox()
    if (box === null) throw new Error('no "Hide ghosts" button')
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    // The click that follows the tap ends it; failing that, the short grace after the gesture does.
    await page.clock.runFor(SKIP_GRACE_MS)
    await expect(page.locator(INTRO)).toHaveCount(0, { timeout: 2_000 })
    // The tap only skipped the intro: the "Hide ghosts" button underneath was not pressed.
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator(GHOSTS)).toHaveCount(3)
    expect(await page.evaluate(() => window.localStorage.getItem('unseen.hide-ghosts'))).toBeNull()
    // And once it is over, a tap on the button works as usual.
    await toggle.tap()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('no intro; the ghosts stay still in their spots; no lantern; "Hide ghosts" still removes them', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'THE UNSEEN' })).toBeVisible()
    await expect(page.locator(INTRO)).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: STATUS_TEXT })).toHaveCount(0)
    await expect(page.locator(GHOSTS)).toHaveCount(3)
    await expect(page.locator('.lantern')).toHaveCount(0)

    const animations = await page.evaluate(() =>
      [...document.querySelectorAll('.margin-ghost-bob, .margin-ghost-slide')].map((element) => {
        const style = getComputedStyle(element)
        return [style.animationName, style.transitionDuration]
      }),
    )
    for (const [name, duration] of animations) {
      expect(name).toBe('none')
      expect(duration).toBe('0s')
    }

    // The pointer no longer sends them away, even when it is right on the first ghost's visible part.
    const before = await spotsOf(page)
    const target = centre(await visibleRect(page, 0))
    await page.mouse.move(640, 5)
    await page.mouse.move(target.x, target.y, { steps: 6 })
    await page.mouse.move(target.x, target.y + 2)
    await page.waitForTimeout(400)
    await expect(page.locator(`${GHOSTS}[data-hidden="true"]`)).toHaveCount(0)
    expect(await spotsOf(page)).toEqual(before)

    await page.getByRole('button', { name: 'Hide ghosts' }).click()
    await expect(page.locator(GHOSTS)).toHaveCount(0)
  })
})

seenTest.describe('the ghosts in the margins', () => {
  seenTest('three ghosts peek in from the page margins; each one\'s eyes are on the wall, never under the header or the panel', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(GHOSTS)).toHaveCount(3)
    const main = await rectOf(page, 'main#main')
    const header = await rectOf(page, 'header.app-header')
    for (let index = 0; index < 3; index += 1) {
      // The raw ghost box, unclipped: some of it must stand beside the panel's 6 px ring, below the header.
      const box = await page.locator(GHOSTS).nth(index).evaluate((element) => {
        const { left, right, top, bottom } = element.getBoundingClientRect()
        return { left, right, top, bottom }
      })
      const width = await page.evaluate(() => document.documentElement.clientWidth)
      const besideLeft = Math.min(box.right, main.left - 6) - Math.max(box.left, 0)
      const besideRight = Math.min(box.right, width) - Math.max(box.left, main.right + 6)
      expect(Math.max(besideLeft, besideRight), `ghost ${index} shows beside the panel`).toBeGreaterThan(0)
      expect(box.top).toBeGreaterThanOrEqual(header.bottom)
    }
    // And what shows of it is its face: both eyes, as Chromium draws them, are on the wall.
    await expectEyesShow(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })

  for (const width of [1100, 900]) {
    seenTest(`at ${width} px wide the 24 px margins have no room for a face: no ghost, rather than an eyeless sliver`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1, name: 'THE UNSEEN' })).toBeVisible()
      await expect(page.locator(GHOSTS)).toHaveCount(0)
    })
  }

  for (const width of [1280, 1366, 1440]) {
    seenTest(`at ${width} px wide every ghost shows both eyes`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/')
      await expect(page.locator(GHOSTS)).toHaveCount(3)
      await expectEyesShow(page)
      // The eyes stay on the wall at the bottom of the page too, where the footer is in view.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await expectEyesShow(page)
    })
  }

  seenTest('on a short page the footer is in view: no bottom ghost, no eye behind the footer, and the footer hides the ghost layer', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 900 })
    await page.goto('/nonexistent')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator(GHOSTS)).toHaveCount(3)
    const footer = await rectOf(page, 'footer.app-footer')
    // The footer stands at the bottom of the window here, where the bottom ghosts used to peek up.
    expect(footer.top).toBeLessThan(900)
    expect(footer.bottom).toBeGreaterThan(900 - 2)
    for (const edge of await page.locator(GHOSTS).evaluateAll((all) => all.map((element) => element.getAttribute('data-edge')))) {
      expect(edge).not.toBe('bottom')
    }
    await expectEyesShow(page)
    for (const eyes of await eyeRects(page)) for (const eye of eyes) expect(eye.bottom).toBeLessThanOrEqual(footer.top)

    // The footer paints over the ghost layer: a bright block put in that layer does not change a pixel of it.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.mouse.move(960, 400)
    const clip = { x: 0, y: Math.ceil(footer.top) + 2, width: 1920, height: Math.floor(Math.min(900, footer.bottom) - footer.top) - 4 }
    const without = await page.screenshot({ clip, animations: 'disabled' })
    await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.cssText = 'position:absolute;inset:0;background:rgb(255,0,255);pointer-events:none'
      document.querySelector('.margin-ghosts')?.append(probe)
    })
    const withProbe = await page.screenshot({ clip, animations: 'disabled' })
    expect(withProbe.equals(without)).toBe(true)
  })

  seenTest('where the margin is wide each ghost shows its dome and both eyes (at least 70% of its size)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1000 })
    await page.goto('/')
    await expect(page.locator(GHOSTS)).toHaveCount(3)
    for (let index = 0; index < 3; index += 1) {
      const shown = await visibleRect(page, index)
      const size = await page.locator(GHOSTS).nth(index).evaluate((element) => element.getBoundingClientRect().width)
      expect(size).toBe(150)
      expect((shown.right - shown.left) / size).toBeGreaterThanOrEqual(0.7)
      expect(shown.bottom - shown.top).toBeGreaterThanOrEqual(size * 0.7)
    }
  })

  seenTest('the ghosts are 150 px where the margin is wide, smaller (never under 80 px) where only that shows the face', async ({ page }) => {
    for (const [width, low, high] of [[1920, 150, 150], [1440, 150, 150], [1280, 80, 120]] as const) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/')
      await expect(page.locator(GHOSTS)).toHaveCount(3)
      // The ghost's box (the art inside is turned a little, so it is measured on the box, not the drawing).
      const size = await page.locator(GHOSTS).first().evaluate((element) => Math.round(element.getBoundingClientRect().width))
      expect(size, `${width} px`).toBeGreaterThanOrEqual(low)
      expect(size, `${width} px`).toBeLessThanOrEqual(high)
      expect(await page.locator(`${GHOSTS} svg`).first().getAttribute('width')).toBe(String(size))
    }
  })

  seenTest('the ghosts hide behind the page: the layer is under the header, the panel and the footer', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(GHOSTS)).toHaveCount(3)
    const facts = await page.evaluate(() => {
      const layer = getComputedStyle(document.querySelector('.margin-ghosts') as Element)
      const header = getComputedStyle(document.querySelector('header.app-header') as Element)
      const footer = getComputedStyle(document.querySelector('footer.app-footer') as Element)
      return {
        layerPosition: layer.position,
        layerZ: Number(layer.zIndex),
        bodyIsolation: getComputedStyle(document.body).isolation,
        headerZ: Number(header.zIndex),
        footerZ: footer.zIndex,
        footerPosition: footer.position,
        footerBackground: footer.backgroundColor,
      }
    })
    expect(facts.layerPosition).toBe('fixed')
    expect(facts.layerZ).toBeLessThan(0)
    expect(facts.bodyIsolation).toBe('isolate')
    expect(facts.headerZ).toBeGreaterThan(facts.layerZ)
    // The footer is in the page's normal flow (painted above any negative z-index layer) and opaque.
    // The pixel check on a short page ("the footer hides the ghost layer") shows it.
    expect(['auto', '0']).toContain(facts.footerZ)
    expect(['static', 'relative']).toContain(facts.footerPosition)
    expect(facts.footerBackground).toMatch(/^rgb\(/)
  })

  seenTest('whatever is in the ghost layer is painted behind the header and the panel, and shows only on the wall', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(GHOSTS)).toHaveCount(3)
    // Still pictures: reduced motion stops the painting's drift and the candle, so two shots can be compared.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('.lantern')).toHaveCount(0)
    await page.mouse.move(640, 700)
    const main = await rectOf(page, 'main#main')
    const header = await rectOf(page, 'header.app-header')
    const viewport = page.viewportSize()
    if (viewport === null) throw new Error('no viewport')
    const clip = (rect: Rect): { x: number; y: number; width: number; height: number } => ({
      x: Math.max(0, rect.left),
      y: Math.max(0, rect.top),
      width: Math.min(viewport.width, rect.right) - Math.max(0, rect.left),
      height: Math.min(viewport.height, rect.bottom) - Math.max(0, rect.top),
    })
    const regions = {
      header: clip(header),
      panel: clip({ ...main, top: Math.max(main.top, header.bottom) }),
      wall: { x: 0, y: header.bottom + 8, width: Math.max(8, main.left - 12), height: viewport.height - header.bottom - 16 },
    }
    const shoot = async (): Promise<Record<keyof typeof regions, Buffer>> => ({
      header: await page.screenshot({ clip: regions.header, animations: 'disabled' }),
      panel: await page.screenshot({ clip: regions.panel, animations: 'disabled' }),
      wall: await page.screenshot({ clip: regions.wall, animations: 'disabled' }),
    })
    // Hide the real ghosts so that only the probe differs between the two shots.
    await page.addStyleTag({ content: '.margin-ghost { visibility: hidden !important; }' })
    const without = await shoot()
    // A bright block in the ghost layer, large enough to cross the header, the panel and the wall.
    await page.evaluate(
      ({ left, width, height }) => {
        const probe = document.createElement('div')
        probe.id = 'ghost-layer-probe'
        probe.style.cssText = `position:absolute;left:${left}px;top:0;width:${width}px;height:${height}px;background:rgb(255,0,255);pointer-events:none`
        document.querySelector('.margin-ghosts')?.append(probe)
      },
      { left: -20, width: viewport.width + 40, height: viewport.height },
    )
    const withProbe = await shoot()
    // The header and the panel hide the probe completely; the wall shows it.
    expect(withProbe.header.equals(without.header)).toBe(true)
    expect(withProbe.panel.equals(without.panel)).toBe(true)
    expect(withProbe.wall.equals(without.wall)).toBe(false)
  })

  seenTest('a ghost that changes edge is a new node that starts out of sight: it never slides across the page or spins', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1000 })
    await page.goto('/')
    await expect(page.locator(GHOSTS)).toHaveCount(3)
    const summary = await page.evaluate(async () => {
      type Seen = { keys: Set<string>; firstOpacity: string; fresh: boolean }
      const seen = new Map<Element, Seen>()
      const anchors = new Set<string>()
      const sample = (fresh: boolean): void => {
        for (const element of document.querySelectorAll('.margin-ghost')) {
          const slide = element.querySelector('.margin-ghost-slide')
          const key = `${element.getAttribute('data-edge')}/${element.getAttribute('data-anchor')}`
          anchors.add(element.getAttribute('data-anchor') ?? '')
          const record = seen.get(element) ?? { keys: new Set<string>(), firstOpacity: slide === null ? '' : getComputedStyle(slide).opacity, fresh }
          record.keys.add(key)
          seen.set(element, record)
        }
      }
      let running = true
      const loop = (): void => {
        sample(true)
        if (running) requestAnimationFrame(loop)
      }
      sample(false)
      requestAnimationFrame(loop)
      for (let round = 0; round < 8; round += 1) {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
        document.dispatchEvent(new Event('visibilitychange'))
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
        await new Promise((resolve) => setTimeout(resolve, 350))
      }
      running = false
      const nodes = [...seen.values()]
      return {
        nodes: nodes.length,
        edgesPerNode: nodes.map((record) => record.keys.size),
        newNodeOpacities: nodes.filter((record) => record.fresh).map((record) => record.firstOpacity),
        anchors: [...anchors],
      }
    })
    // Each node keeps one edge and anchor for its whole life; a ghost that moves is another node.
    expect(summary.nodes).toBeGreaterThan(3)
    for (const count of summary.edgesPerNode) expect(count).toBe(1)
    // Every new node is invisible on the first frame it exists in: it slides in from hiding, not from the old edge.
    expect(summary.newNodeOpacities.length).toBeGreaterThan(0)
    for (const opacity of summary.newNodeOpacities) expect(opacity).toBe('0')
    expect(summary.anchors).toContain('panel')
  })

  seenTest('they move while the tab is hidden, and not when it is shown again', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1000 })
    await page.goto('/')
    await expect(page.locator(GHOSTS)).toHaveCount(3)
    const before = await spotsOf(page)
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const moved = await spotsOf(page)
    expect(moved).toHaveLength(before.length)
    // Every ghost moved, not just one of them.
    moved.forEach((spot, index) => expect(spot, `ghost ${index}`).not.toBe(before[index]))
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(await spotsOf(page)).toEqual(moved)
  })

  seenTest('every ghost is decoration: aria-hidden, unfocusable, and the pointer goes through', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(GHOSTS)).toHaveCount(3)
    const facts = await page.evaluate(() =>
      [...document.querySelectorAll('.margin-ghosts, .margin-ghost, .lantern, .ghost')].map((element) => ({
        hidden: element.closest('[aria-hidden="true"]') !== null,
        events: getComputedStyle(element).pointerEvents,
        focusable: element.matches('[tabindex]') || element.querySelector('[tabindex], a, button, input') !== null,
      })),
    )
    expect(facts.length).toBeGreaterThanOrEqual(7)
    for (const fact of facts) {
      expect(fact.hidden).toBe(true)
      expect(fact.focusable).toBe(false)
      expect(fact.events).toBe('none')
    }
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.map((rule) => rule.id)).toEqual([])
    expect(results.incomplete.filter((rule) => rule.id === 'color-contrast')).toEqual([])
  })

  seenTest('a ghost ducks out of sight when the lantern comes near, and comes back somewhere else', async ({ page }) => {
    await page.goto('/')
    const ghosts = page.locator(GHOSTS)
    await expect(ghosts).toHaveCount(3)
    const first = ghosts.first()
    const [spot] = await spotsOf(page)
    const target = centre(await visibleRect(page, 0))
    await page.mouse.move(640, 5)
    await page.mouse.move(target.x, target.y, { steps: 5 })
    await expect(first).toHaveAttribute('data-hidden', 'true')
    // Hidden means out of sight: past the window edge, or wholly behind the panel (after the 250 ms slip).
    await expect
      .poll(async () =>
        first.evaluate((element) => {
          const slide = element.querySelector('.margin-ghost-slide') as Element
          const box = slide.getBoundingClientRect()
          const main = document.getElementById('main')?.getBoundingClientRect()
          const outside = box.right <= 0 || box.left >= document.documentElement.clientWidth || box.top >= document.documentElement.clientHeight
          const behindPanel = main !== undefined && box.left >= main.left && box.right <= main.right
          return (outside || behindPanel) && getComputedStyle(slide).opacity === '0'
        }),
      )
      .toBe(true)
    // Move the lantern away: a few seconds later it is back, and not where it was.
    await page.mouse.move(640, 600)
    await expect(first).toHaveAttribute('data-hidden', 'false', { timeout: 8_000 })
    const [after] = await spotsOf(page)
    expect(after).not.toBe(spot)
  })

  seenTest('the lantern only lights the wall: its clip leaves holes for the header, the panel and the footer', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.lantern')).toHaveCount(1)
    await page.mouse.move(640, 400)
    const main = await rectOf(page, 'main#main')
    const hole = `M${Math.round(main.left - 7)}${Math.round(main.top - 7)}H${Math.round(main.right + 7)}`
    await expect
      .poll(async () => (await page.locator('.lantern').evaluate((element) => element.style.clipPath)).replace(/[\s,]/g, ''))
      .toContain(hole)
    const clip = await page.locator('.lantern').evaluate((element) => getComputedStyle(element).clipPath)
    expect(clip).toContain('evenodd')
    // The light itself can only brighten: it is a warm colour fading to transparent, in the layer behind the page.
    const glow = await page.locator('.lantern-glow').evaluate((element) => getComputedStyle(element).backgroundImage)
    expect(glow).toContain('radial-gradient')
    expect(await page.locator('.lantern').evaluate((element) => element.closest('.margin-ghosts') !== null)).toBe(true)
  })

  seenTest('the lantern clip follows the layout: a route change, and a panel that grows', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.lantern')).toHaveCount(1)
    await page.mouse.move(640, 400)
    const clipOf = async (): Promise<string> =>
      (await page.locator('.lantern').evaluate((element) => element.style.clipPath)).replace(/[\s,]/g, '')
    const holeOf = (rect: Rect): string => `M${Math.round(rect.left - 7)}${Math.round(rect.top - 7)}H${Math.round(rect.right + 7)}V${Math.round(rect.bottom + 7)}`

    // A route change (Landing to a not-found state) swaps the panel: the glow fades out and the clip is made again.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/nonexistent')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('.lantern')).toHaveCount(1)
    const moved = await rectOf(page, 'main#main')
    await expect.poll(clipOf).toContain(holeOf(moved))
    expect(await page.locator('.lantern-glow').evaluate((element) => element.style.opacity)).toBe('0')

    // The panel grows: the clip grows with it, with no pointer move at all.
    await page.evaluate(() => {
      const main = document.getElementById('main')
      if (main !== null) main.style.paddingBottom = '240px'
    })
    const grown = await rectOf(page, 'main#main')
    expect(grown.bottom).toBeGreaterThan(moved.bottom)
    await expect.poll(clipOf).toContain(holeOf(grown))
  })

  seenTest('"Hide ghosts" removes the ghosts, and the choice survives a reload', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(GHOSTS)).toHaveCount(3)
    const toggle = page.getByRole('button', { name: 'Hide ghosts' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(GHOSTS)).toHaveCount(0)
    await expect(page.locator('.lantern')).toHaveCount(0)

    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'THE UNSEEN' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hide ghosts' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(GHOSTS)).toHaveCount(0)

    // And they come back when the switch is pressed again.
    await page.getByRole('button', { name: 'Hide ghosts' }).click()
    await expect(page.locator(GHOSTS)).toHaveCount(3)
  })

  seenTest('there are no ghosts on the result views or in Daylight, and some on every not-found page', async ({ page }) => {
    for (const path of [
      '/sample/cursed-shop-index',
      '/sample/cursed-shop-index/whisper',
      '/sample/cursed-shop-index/keyboard',
      '/sample/cursed-shop-index/daylight',
    ]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.locator(GHOSTS), path).toHaveCount(0)
    }
    for (const path of ['/nonexistent', '/sample/no-such-sample', '/audit/expired-job']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.locator(GHOSTS), path).toHaveCount(3)
    }
  })

  seenTest('there are none on a narrow or a medium screen (no room for a face), and three on a wide one', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 800 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'THE UNSEEN' })).toBeVisible()
    await expect(page.locator(GHOSTS)).toHaveCount(0)
    await page.setViewportSize({ width: 900, height: 800 })
    await expect(page.locator(GHOSTS)).toHaveCount(0)
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.locator(GHOSTS)).toHaveCount(3)
  })

  seenTest('a ghost that was hidden when the window changed size comes back', async ({ page }) => {
    await page.goto('/')
    const ghosts = page.locator(GHOSTS)
    await expect(ghosts).toHaveCount(3)
    const hiddenSpots = (): Promise<string[]> =>
      ghosts.evaluateAll((all) =>
        all
          .filter((element) => element.getAttribute('data-hidden') === 'true')
          .map((element) => `${element.getAttribute('data-edge')}/${element.getAttribute('data-anchor')}/${element.getAttribute('data-pos')}`)
          .sort(),
      )
    const target = centre(await visibleRect(page, 0))
    // One jump: the pointer at ghost 0 hides every ghost within range of it (maybe a second one on the same side).
    await page.mouse.move(640, 5)
    await page.mouse.move(target.x, target.y)
    await expect(ghosts.first()).toHaveAttribute('data-hidden', 'true')
    // Two animation frames: the lantern has looked at the newest pointer position and settled.
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
    const before = await hiddenSpots()
    expect(before.length).toBeGreaterThanOrEqual(1)
    await page.mouse.move(640, 650)
    // Wider: a ghost that is hidden is left alone by the refit, so the same ones are still hidden.
    await page.setViewportSize({ width: 1920, height: 800 })
    await expect(ghosts).toHaveCount(3)
    expect(await hiddenSpots()).toEqual(before)
    // The timer that brings them back survived the change: every ghost comes back.
    await expect(page.locator(`${GHOSTS}[data-hidden="true"]`)).toHaveCount(0, { timeout: 8_000 })
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(ghosts).toHaveCount(3)
  })

  seenTest('keyboard focus near a ghost sends it away too', async ({ page }) => {
    await page.goto('/')
    const ghosts = page.locator(GHOSTS)
    await expect(ghosts).toHaveCount(3)
    const first = ghosts.first()
    const near = centre(await visibleRect(page, 0))
    // A focusable control placed a little way from the ghost, over the wall beside it.
    await page.evaluate(
      ({ x, y }) => {
        const probe = document.createElement('button')
        probe.id = 'focus-probe'
        probe.textContent = 'probe'
        probe.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:5`
        document.body.append(probe)
      },
      { x: Math.max(0, near.x - 20), y: near.y },
    )
    await expect(first).toHaveAttribute('data-hidden', 'false')
    await page.locator('#focus-probe').focus()
    await expect(first).toHaveAttribute('data-hidden', 'true')
  })

  seenTest('focus that code puts on #main (the skip link, every navigation) hides no ghost', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(GHOSTS)).toHaveCount(3)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#main')).toBeFocused()
    // Wait longer than a ghost needs to duck out: none has.
    await page.waitForTimeout(600)
    await expect(page.locator(`${GHOSTS}[data-hidden="true"]`)).toHaveCount(0)
    // The same goes for focus put on #main from code.
    await page.evaluate(() => document.getElementById('main')?.focus())
    await page.waitForTimeout(400)
    await expect(page.locator(`${GHOSTS}[data-hidden="true"]`)).toHaveCount(0)
  })
})
