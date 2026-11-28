import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

/** The page clock never runs past this while axe runs: well under the intro's 3.2 s minimum. */
const AXE_CLOCK_BUDGET_MS = 600
const CLOCK_STEP_MS = 1
const REAL_WAIT_MS = 10

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>

/**
 * The intro is skipped in an automated browser (`navigator.webdriver`) unless `sessionStorage["unseen.intro-force"]`
 * is "1". Every spec that tests the intro sets it in an init script (the flag is per tab, and a reload keeps it).
 */
export async function forceIntro(page: Page): Promise<void> {
  await page.addInitScript(() => window.sessionStorage.setItem('unseen.intro-force', '1'))
}

/**
 * Pauses the page clock before the page loads. `clock.install()` alone keeps time running, so the
 * intro's timers would still fire; paused, no timer fires until the test moves the
 * clock (`runFor`, `resume`).
 */
export async function pauseClock(page: Page): Promise<void> {
  const start = new Date('2026-10-31T20:00:00Z').getTime()
  await page.clock.install({ time: start })
  await page.clock.pauseAt(start + 1_000)
}

/**
 * Runs axe on a page whose clock is paused. axe schedules its own work with `setTimeout`, so the
 * clock is moved on 1 ms at a time until axe is done, and never by more than `AXE_CLOCK_BUDGET_MS`
 * in all: none of the intro's timers can fire during the analysis.
 */
export async function analyzeWithPausedClock(page: Page): Promise<AxeResults> {
  let done = false
  const analysis = new AxeBuilder({ page }).analyze().finally(() => {
    done = true
  })
  for (let moved = 0; !done && moved < AXE_CLOCK_BUDGET_MS; moved += CLOCK_STEP_MS) {
    await page.clock.runFor(CLOCK_STEP_MS)
    await new Promise((resolve) => setTimeout(resolve, REAL_WAIT_MS))
  }
  return analysis
}
