import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

/**
 * The replay edition: the same React app as a fully static site (`npm run build:replay`).
 * UNSEEN_REPLAY_BASE is the sub-path it is served under (GitHub Pages for PRIEST099/unseen: /unseen/).
 * UNSEEN_LIVE_URL is the live auditor's address for the one-line notice; empty leaves that sentence out.
 */
const base = process.env.UNSEEN_REPLAY_BASE ?? '/unseen/'
const liveUrl = process.env.UNSEEN_LIVE_URL ?? ''

/** A static host sends no headers, so the policy of the hosted app travels as a meta tag. */
function contentSecurityPolicyMeta(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ')
  return {
    name: 'replay-csp-meta',
    transformIndexHtml: {
      order: 'post',
      handler: (html: string): string =>
        html.replace('<meta charset="UTF-8">', `<meta charset="UTF-8">\n    <meta http-equiv="Content-Security-Policy" content="${policy}">`),
    },
  }
}

export default defineConfig({
  base,
  plugins: [react(), contentSecurityPolicyMeta()],
  define: {
    'import.meta.env.VITE_REPLAY': JSON.stringify('1'),
    'import.meta.env.VITE_LIVE_URL': JSON.stringify(liveUrl),
  },
  build: {
    outDir: 'dist-replay',
    emptyOutDir: true,
    sourcemap: false,
    // Same rule as the hosted build: the policy allows fonts from 'self' only.
    assetsInlineLimit: 0,
  },
})
