import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SHOP_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../apps/cursed-shop')

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
}

export type ShopServer = { baseUrl: string; close: () => Promise<void> }

/** Serves apps/cursed-shop on 127.0.0.1 at a random port. */
export async function startShopServer(): Promise<ShopServer> {
  const server: Server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
      const file = normalize(join(SHOP_ROOT, path === '/' ? 'index.html' : path))
      if (!file.startsWith(SHOP_ROOT + sep)) {
        res.writeHead(403).end()
        return
      }
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((ok, fail) => {
    const t = setTimeout(() => fail(new Error('shop file server did not start within 10 s')), 10_000)
    server.listen(0, '127.0.0.1', () => {
      clearTimeout(t)
      ok()
    })
  })
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('shop file server has no port')
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise((ok) => server.close(() => ok())),
  }
}
