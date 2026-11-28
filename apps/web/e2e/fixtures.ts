import { expect, test as base } from '@playwright/test'

/** The sessionStorage flag that says the lights-on intro has already played in this browser session. */
export const INTRO_SEEN_KEY = 'unseen.intro-seen'

/**
 * `test` for every spec that is not about the intro: the page starts with the intro already seen, so
 * the dark layer never gets in the way of a click or a screenshot. The intro specs
 * (`e2e/ghosts.spec.ts`) import from '@playwright/test' directly and see the real first visit.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((key: string) => {
      try {
        window.sessionStorage.setItem(key, '1')
      } catch {
        // Storage blocked: the app plays the intro once per page load, which the specs wait out.
      }
    }, INTRO_SEEN_KEY)
    await use(page)
  },
})

export { expect }
