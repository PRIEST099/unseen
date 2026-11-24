import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

const PAGES_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), 'pages')

export type PagesServer = {
  /** `http://127.0.0.1:<port>` */
  baseUrl: string
  /** Same server under another origin (`http://localhost:<port>`), for cross-origin frames. */
  altBaseUrl: string
  close: () => Promise<void>
}

export type PagesServerOptions = {
  /** Extra response headers per file name, e.g. `{ 'csp.html': { 'content-security-policy': "style-src 'self'" } }`. */
  headers?: Record<string, Record<string, string>>
}

/**
 * Serves `tests/fixtures/pages/*` on 127.0.0.1. The token `{{ALT_ORIGIN}}` in a
 * page is replaced with the alternate origin so fixtures can embed cross-origin frames.
 */
export async function startPagesServer(options: PagesServerOptions = {}): Promise<PagesServer> {
  let port = 0
  const server: Server = createServer(async (req, res) => {
    try {
      const name = basename(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname))
      const raw = await readFile(join(PAGES_ROOT, name), 'utf8')
      const body = raw.replaceAll('{{ALT_ORIGIN}}', `http://localhost:${port}`)
      res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(name)] ?? 'text/html; charset=utf-8', ...(options.headers?.[name] ?? {}) })
      res.end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()))
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('pages server has no port')
  port = addr.port
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    altBaseUrl: `http://localhost:${port}`,
    close: () => new Promise((ok) => server.close(() => ok())),
  }
}
