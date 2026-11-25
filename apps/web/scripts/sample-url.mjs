// The display URL recorded in a pre-audited Cursed Shop sample.
//
// The samples are audited on a throwaway local server, so the URL stored with them must not be
// that server's address, and it must never be a domain we do not own. By default it is the
// relative path at which this app serves the shop (`/cursed-shop/<page>`). When PUBLIC_BASE_URL
// is set at build time (for example https://unseen.example.org), it is prefixed to that path.

export const SHOP_PATH_PREFIX = '/cursed-shop/'

/**
 * @param {string} page            a page of apps/cursed-shop, for example `index.html`
 * @param {string | undefined} publicBaseUrl  the PUBLIC_BASE_URL env value, if any
 * @returns {string}
 */
export function sampleDisplayUrl(page, publicBaseUrl) {
  const pagePath = `${SHOP_PATH_PREFIX}${page.replace(/^\/+/, '')}`
  const base = (publicBaseUrl ?? '').trim()
  if (base === '') return pagePath
  let parsed
  try {
    parsed = new URL(base)
  } catch {
    throw new Error(`PUBLIC_BASE_URL must be an absolute http(s) URL, got ${JSON.stringify(base)}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`PUBLIC_BASE_URL must be an absolute http(s) URL, got ${JSON.stringify(base)}`)
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    throw new Error('PUBLIC_BASE_URL must not carry a query string or fragment')
  }
  // Keep any path prefix the app is mounted under, without doubling the slash.
  const prefix = parsed.pathname.replace(/\/+$/, '')
  return `${parsed.origin}${prefix}${pagePath}`
}
