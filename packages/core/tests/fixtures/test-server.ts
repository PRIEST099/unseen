import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'

export type TestServer = {
  baseUrl: string
  /** Requests received, by path. */
  hits: Map<string, number>
  close: () => Promise<void>
}

export type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void

/** A tiny programmable server on 127.0.0.1. Open sockets are destroyed on close. */
export async function startTestServer(handler: RouteHandler): Promise<TestServer> {
  const hits = new Map<string, number>()
  const sockets = new Set<Socket>()
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    hits.set(path, (hits.get(path) ?? 0) + 1)
    // A client that goes away mid-stream is expected in these tests.
    res.on('error', () => undefined)
    req.on('error', () => undefined)
    handler(req, res)
  })
  server.on('connection', (s) => {
    sockets.add(s)
    s.on('error', () => undefined)
    s.on('close', () => sockets.delete(s))
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()))
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('test server has no port')
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    hits,
    close: () =>
      new Promise((ok) => {
        for (const s of sockets) s.destroy()
        server.close(() => ok())
      }),
  }
}

/**
 * Stream `megabytes` of spaces as a chunked body (no content-length), stopping if the client leaves.
 * Use a script content type: Chromium cancels an image whose bytes do not decode, but reads a script to the end.
 */
export function streamBytes(res: ServerResponse, megabytes: number, contentType = 'text/javascript'): void {
  res.writeHead(200, { 'content-type': contentType })
  const chunk = Buffer.alloc(1024 * 1024, 0x20)
  let sent = 0
  const pump = (): void => {
    while (sent < megabytes) {
      if (res.destroyed || res.writableEnded) return
      sent++
      if (!res.write(chunk)) {
        res.once('drain', pump)
        return
      }
    }
    res.end()
  }
  pump()
}

/** 1x1 transparent PNG. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)
