// Serves dist-replay/ the way GitHub Pages does: under a sub-path, no custom headers, and
// 404.html (status 404) for any path that is not a file. Used by the replay e2e and for a local look:
//   npm run build:replay -w @the-unseen/web ; npm run serve:replay -w @the-unseen/web
// UNSEEN_REPLAY_BASE (default /unseen/) must match the base the build used. PORT defaults to 4173.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../dist-replay')
const base = `/${(process.env.UNSEEN_REPLAY_BASE ?? '/unseen/').replace(/^\/+|\/+$/g, '')}/`
const port = Number(process.env.PORT) || 4173

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
}

async function readInside(relative) {
  const filePath = path.resolve(root, relative)
  if (filePath !== root && !filePath.startsWith(root + path.sep)) return undefined
  try {
    return { body: await readFile(filePath), type: MIME[path.extname(filePath)] ?? 'application/octet-stream' }
  } catch {
    return undefined
  }
}

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
  if (!pathname.startsWith(base)) {
    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
    return
  }
  const relative = pathname.slice(base.length)
  const file = await readInside(relative === '' || relative.endsWith('/') ? `${relative}index.html` : relative)
  if (file !== undefined) {
    response.writeHead(200, { 'Content-Type': file.type }).end(file.body)
    return
  }
  const fallback = await readInside('404.html')
  response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end(fallback?.body ?? 'Not found')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Replay edition at http://127.0.0.1:${port}${base}`)
})
