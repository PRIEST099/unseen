import type { Page } from 'playwright'
import { BrowserPool, PageLoader } from '../../src/runner/browser.js'
import { PermissiveSafeFetchPolicy } from '../../src/runner/safe-fetch.js'

/** Load a URL through the real pipeline and hand the page to `fn`. */
export async function withPage<T>(pool: BrowserPool, url: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await pool.acquire()
  const loader = new PageLoader()
  const context = await loader.createContext(browser)
  try {
    const { page } = await loader.loadPage(context, url, new PermissiveSafeFetchPolicy())
    return await fn(page)
  } finally {
    await context.close()
    await pool.release(browser)
  }
}
