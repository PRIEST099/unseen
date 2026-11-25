import { afterEach, describe, expect, it, vi } from 'vitest'
import http from 'node:http'
import net from 'node:net'
import { SsrfGuardProxy, parseAuthority } from './ssrf-guard-proxy.js'
import type { BlockedEntry, DialFn, DialTarget } from './ssrf-guard-proxy.js'
import type { LookupFn } from './dns-resolver.js'

const PUBLIC_V4 = '93.184.216.34'
const PUBLIC_V6 = '2606:4700:4700::1111'

type Harness = {
  proxyPort: number
  log: BlockedEntry[]
  lookup: ReturnType<typeof vi.fn<LookupFn>>
  dialed: DialTarget[]
  upstreamHeaders: http.IncomingHttpHeaders[]
  upstreamUrls: string[]
}

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c()
})

/** An echo/HTTP upstream on 127.0.0.1, a fake resolver and a fake dialler that always lands on the upstream. */
async function harness(opts: { lookup?: LookupFn; served?: string[]; dial?: (target: DialTarget, upstreamPort: number) => net.Socket; redirect?: boolean } = {}): Promise<Harness> {
  const upstreamHeaders: http.IncomingHttpHeaders[] = []
  const upstreamUrls: string[] = []
  const sockets = new Set<net.Socket>()
  const upstream = http.createServer((req, res) => {
    upstreamHeaders.push(req.headers)
    upstreamUrls.push(req.url ?? '')
    if (opts.redirect) {
      res.writeHead(302, { location: 'http://127.0.0.1:9/admin' }).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain' }).end(`host=${req.headers.host ?? ''}`)
  })
  // Tunnel targets (any port but 80) land on a raw echo server; port 80 lands on the HTTP upstream.
  const echo = net.createServer((s) => {
    s.on('error', () => undefined)
    sockets.add(s)
    s.on('close', () => sockets.delete(s))
    s.pipe(s)
  })
  await new Promise<void>((ok) => echo.listen(0, '127.0.0.1', () => ok()))
  const echoAddress = echo.address()
  if (!echoAddress || typeof echoAddress === 'string') throw new Error('no echo port')
  upstream.on('connection', (s) => {
    sockets.add(s)
    s.on('error', () => undefined)
    s.on('close', () => sockets.delete(s))
  })
  await new Promise<void>((ok) => upstream.listen(0, '127.0.0.1', () => ok()))
  const address = upstream.address()
  if (!address || typeof address === 'string') throw new Error('no upstream port')
  const upstreamPort = address.port

  const dialed: DialTarget[] = []
  const wrappedDial: DialFn = (target) => {
    dialed.push(target)
    return opts.dial
      ? opts.dial(target, upstreamPort)
      : net.connect({ host: '127.0.0.1', port: target.port === 80 ? upstreamPort : echoAddress.port })
  }
  const lookup = vi.fn<LookupFn>(opts.lookup ?? (async () => [{ address: PUBLIC_V4, family: 4 }]))
  const log: BlockedEntry[] = []
  const proxy = new SsrfGuardProxy({ blockedLog: log, lookup, dial: wrappedDial, servedAuthorities: opts.served })
  const proxyPort = await proxy.start()
  cleanups.push(async () => {
    await proxy.stop()
    for (const s of sockets) s.destroy()
    await new Promise((ok) => upstream.close(() => ok(undefined)))
    await new Promise((ok) => echo.close(() => ok(undefined)))
  })
  return { proxyPort, log, lookup, dialed, upstreamHeaders, upstreamUrls }
}

/** Send raw bytes to the proxy and collect the reply until the proxy closes or `idleMs` passes. */
function raw(port: number, payload: string, idleMs = 400): Promise<string> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    let data = ''
    let timer = setTimeout(() => socket.destroy(), idleMs)
    socket.on('data', (d) => {
      data += d.toString('latin1')
      clearTimeout(timer)
      timer = setTimeout(() => socket.destroy(), idleMs)
    })
    socket.on('error', () => undefined)
    socket.on('close', () => {
      clearTimeout(timer)
      resolve(data)
    })
    socket.write(payload)
  })
}

const connectReq = (authority: string): string => `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`

describe('parseAuthority', () => {
  it.each([
    ['example.test:443', { host: 'example.test', port: 443 }],
    ['[::1]:8080', { host: '::1', port: 8080 }],
    ['127.0.0.1:1', { host: '127.0.0.1', port: 1 }],
    ['example.test:65535', { host: 'example.test', port: 65535 }],
  ])('parses %s', (text, expected) => {
    expect(parseAuthority(text)).toEqual(expected)
  })

  it.each(['example.test', 'example.test:', 'example.test:0', 'example.test:65536', ':80', '[::1]', '::1:80', 'a b:80', 'a@b:80', 'a/b:80', 'http://a:80', '[::1]x:80'])(
    'rejects %s',
    (text) => {
      expect(parseAuthority(text)).toBeNull()
    }
  )
})

describe('CONNECT', () => {
  it('tunnels to a public name and pins the validated address', async () => {
    const h = await harness()
    const reply = await raw(h.proxyPort, `${connectReq('example.test:443')}ping`)
    expect(reply).toContain('HTTP/1.1 200 Connection Established')
    expect(reply.endsWith('ping')).toBe(true)
    expect(h.dialed).toEqual([{ address: PUBLIC_V4, port: 443, family: 4 }])
    expect(h.log).toEqual([])
  })

  it('refuses a loopback literal with 403 and logs the authority', async () => {
    const h = await harness()
    const reply = await raw(h.proxyPort, connectReq('127.0.0.1:8080'))
    expect(reply).toMatch(/^HTTP\/1\.1 403 /)
    expect(h.log).toEqual([{ url: 'connect://127.0.0.1:8080', reason: 'blocked IP address (loopback)' }])
    expect(h.dialed).toEqual([])
    expect(h.lookup).not.toHaveBeenCalled()
  })

  it('refuses [::1] and the metadata address', async () => {
    const h = await harness()
    expect(await raw(h.proxyPort, connectReq('[::1]:80'))).toMatch(/^HTTP\/1\.1 403 /)
    expect(await raw(h.proxyPort, connectReq('169.254.169.254:80'))).toMatch(/^HTTP\/1\.1 403 /)
    expect(h.log.map((l) => l.url)).toEqual(['connect://[::1]:80', 'connect://169.254.169.254:80'])
    expect(h.dialed).toEqual([])
  })

  it('refuses a name that resolves to a private address, even next to a public one', async () => {
    const h = await harness({
      lookup: async () => [
        { address: PUBLIC_V4, family: 4 },
        { address: '10.0.0.7', family: 4 },
      ],
    })
    expect(await raw(h.proxyPort, connectReq('mixed.test:80'))).toMatch(/^HTTP\/1\.1 403 /)
    expect(h.log[0]?.reason).toContain('blocked IP address (private)')
    expect(h.dialed).toEqual([])
  })

  it('answers 502 and logs when DNS fails', async () => {
    const h = await harness({
      lookup: async () => {
        throw Object.assign(new Error('nope'), { code: 'ENOTFOUND' })
      },
    })
    expect(await raw(h.proxyPort, connectReq('missing.test:80'))).toMatch(/^HTTP\/1\.1 502 /)
    expect(h.log[0]?.url).toBe('connect://missing.test:80')
    expect(h.log[0]?.reason).toContain('DNS resolution failed')
  })

  it('answers 400 to a malformed authority', async () => {
    const h = await harness()
    expect(await raw(h.proxyPort, connectReq('example.test'))).toMatch(/^HTTP\/1\.1 400 /)
    expect(await raw(h.proxyPort, connectReq('example.test:0'))).toMatch(/^HTTP\/1\.1 400 /)
    expect(h.dialed).toEqual([])
  })

  it('asks DNS once per hostname (the validated answer is pinned)', async () => {
    const h = await harness()
    await raw(h.proxyPort, connectReq('example.test:443'))
    await raw(h.proxyPort, connectReq('example.test:8443'))
    expect(h.lookup).toHaveBeenCalledTimes(1)
    expect(h.dialed.map((d) => d.port)).toEqual([443, 8443])
  })

  it('DNS rebinding: the second lookup would be private, but it is never made', async () => {
    let calls = 0
    const h = await harness({ lookup: async () => [{ address: calls++ === 0 ? PUBLIC_V4 : '127.0.0.1', family: 4 }] })
    await raw(h.proxyPort, connectReq('rebind.test:80'))
    await raw(h.proxyPort, connectReq('rebind.test:80'))
    expect(calls).toBe(1)
    expect(h.dialed.map((d) => d.address)).toEqual([PUBLIC_V4, PUBLIC_V4])
  })

  it.each(['audit.test:80', 'AUDIT.TEST:80', 'audit.test.:80', 'Audit.Test.:80'])('refuses the served authority %s with 403 and never dials or resolves it', async (authority) => {
    const h = await harness({ served: ['audit.test:80'], lookup: async () => [{ address: '127.0.0.1', family: 4 }] })
    expect(await raw(h.proxyPort, connectReq(authority))).toMatch(/^HTTP\/1\.1 403 /)
    expect(h.log).toHaveLength(1)
    expect(h.log[0]?.url).toBe(`connect://${authority}`)
    expect(h.dialed).toEqual([])
    expect(h.lookup).not.toHaveBeenCalled()
  })

  it('normalises case and trailing dots in the configured served authority too', async () => {
    const h = await harness({ served: ['AUDIT.Test.:80'] })
    expect(await raw(h.proxyPort, connectReq('audit.test:80'))).toMatch(/^HTTP\/1\.1 403 /)
    expect(h.dialed).toEqual([])
  })

  it('a canary resolver that maps the served name to loopback gets zero hits', async () => {
    const canary = vi.fn<LookupFn>(async () => [{ address: '127.0.0.1', family: 4 }])
    const h = await harness({ served: ['audit.test:80'], lookup: canary })
    await raw(h.proxyPort, connectReq('AUDIT.TEST.:80'))
    await raw(h.proxyPort, 'GET http://Audit.Test./ HTTP/1.1\r\nHost: audit.test\r\n\r\n')
    expect(canary).not.toHaveBeenCalled()
    expect(h.dialed).toEqual([])
  })

  it('a served name on another port is not served and takes the normal validation path', async () => {
    const h = await harness({ served: ['audit.test:80'] })
    expect(await raw(h.proxyPort, connectReq('audit.test:443'))).toContain('200 Connection Established')
    expect(h.dialed).toHaveLength(1)
  })
  it('survives a client reset in the middle of a tunnel', async () => {
    const h = await harness()
    const uncaught = vi.fn()
    process.on('uncaughtException', uncaught)
    try {
      const socket = net.connect({ host: '127.0.0.1', port: h.proxyPort })
      socket.on('error', () => undefined)
      await new Promise<void>((ok) => socket.once('connect', () => ok()))
      socket.write(connectReq('example.test:443'))
      await new Promise<void>((ok) => socket.once('data', () => ok()))
      socket.resetAndDestroy()
      await new Promise((ok) => setTimeout(ok, 150))
      expect(uncaught).not.toHaveBeenCalled()
      expect(await raw(h.proxyPort, `${connectReq('example.test:443')}ok`)).toContain('200 Connection Established')
    } finally {
      process.off('uncaughtException', uncaught)
    }
  })

  it('Happy Eyeballs: an unreachable AAAA address falls through to the A address', async () => {
    const h = await harness({
      lookup: async () => [
        { address: PUBLIC_V6, family: 6 },
        { address: PUBLIC_V4, family: 4 },
      ],
      dial: (target, upstreamPort) => {
        if (target.family === 6) {
          const dead = new net.Socket()
          setImmediate(() => dead.destroy(new Error('ENETUNREACH')))
          return dead
        }
        return net.connect({ host: '127.0.0.1', port: upstreamPort })
      },
    })
    const reply = await raw(h.proxyPort, `${connectReq('dual.test:80')}x`)
    expect(reply).toContain('200 Connection Established')
    expect(h.dialed.map((d) => d.family)).toEqual([6, 4])
  })

  it('fails closed with 502 when every address is unreachable', async () => {
    const h = await harness({
      dial: () => {
        const dead = new net.Socket()
        setImmediate(() => dead.destroy(new Error('ECONNREFUSED')))
        return dead
      },
    })
    expect(await raw(h.proxyPort, connectReq('example.test:80'))).toMatch(/^HTTP\/1\.1 502 /)
    expect(h.log[0]?.reason).toContain('upstream connection failed')
  })
})

describe('plain HTTP', () => {
  it('forwards an absolute-form GET and strips Proxy-* headers', async () => {
    const h = await harness()
    const reply = await raw(
      h.proxyPort,
      'GET http://example.test/a/b?q=1 HTTP/1.1\r\nHost: example.test\r\nProxy-Authorization: secret\r\nProxy-Connection: keep-alive\r\nX-Keep: yes\r\n\r\n'
    )
    expect(h.log).toEqual([])
    expect(reply).toMatch(/^HTTP\/1\.1 200 /)
    expect(reply).toContain('host=example.test')
    expect(h.upstreamUrls).toEqual(['/a/b?q=1'])
    expect(h.upstreamHeaders[0]?.['proxy-authorization']).toBeUndefined()
    expect(h.upstreamHeaders[0]?.['proxy-connection']).toBeUndefined()
    expect(h.upstreamHeaders[0]?.['x-keep']).toBe('yes')
  })

  it('takes the target from the request-target, never from the Host header', async () => {
    const h = await harness()
    const reply = await raw(h.proxyPort, 'GET http://example.test/ HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n')
    expect(reply).toMatch(/^HTTP\/1\.1 200 /)
    expect(h.dialed[0]?.address).toBe(PUBLIC_V4)
    expect(reply).toContain('host=example.test')
    expect(h.log).toEqual([])
  })

  it('refuses an absolute-form request to loopback', async () => {
    const h = await harness()
    const reply = await raw(h.proxyPort, 'GET http://127.0.0.1:9/secret HTTP/1.1\r\nHost: example.test\r\n\r\n')
    expect(reply).toMatch(/^HTTP\/1\.1 403 /)
    expect(h.log).toEqual([{ url: 'http://127.0.0.1:9/secret', reason: 'blocked IP address (loopback)' }])
  })

  it('answers 400 to an origin-form request and to other schemes', async () => {
    const h = await harness()
    expect(await raw(h.proxyPort, 'GET /x HTTP/1.1\r\nHost: example.test\r\n\r\n')).toMatch(/^HTTP\/1\.1 400 /)
    expect(await raw(h.proxyPort, 'GET ftp://example.test/ HTTP/1.1\r\nHost: example.test\r\n\r\n')).toMatch(/^HTTP\/1\.1 400 /)
    expect(h.dialed).toEqual([])
  })

  it('answers 400 to an Upgrade request', async () => {
    const h = await harness()
    const reply = await raw(h.proxyPort, 'GET http://example.test/ws HTTP/1.1\r\nHost: example.test\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n')
    expect(reply).toMatch(/^HTTP\/1\.1 400 /)
    expect(h.dialed).toEqual([])
  })

  it('does not follow redirects: the 302 goes back to the client unchanged', async () => {
    const h = await harness({ redirect: true })
    const reply = await raw(h.proxyPort, 'GET http://example.test/r HTTP/1.1\r\nHost: example.test\r\n\r\n')
    expect(reply).toMatch(/^HTTP\/1\.1 302 /)
    expect(reply.toLowerCase()).toContain('location: http://127.0.0.1:9/admin')
    expect(h.dialed).toHaveLength(1)
  })
})

describe('stop', () => {
  it('closes within one second even with an open tunnel', async () => {
    const h = await harness()
    const socket = net.connect({ host: '127.0.0.1', port: h.proxyPort })
    socket.on('error', () => undefined)
    await new Promise<void>((ok) => socket.once('connect', () => ok()))
    socket.write(connectReq('example.test:443'))
    await new Promise<void>((ok) => socket.once('data', () => ok()))
    const t0 = Date.now()
    const live = cleanups.pop()
    await live?.()
    expect(Date.now() - t0).toBeLessThan(1_500)
    socket.destroy()
  })
})

describe('served authorities over absolute-form HTTP', () => {
  it.each(['http://audit.test/', 'http://AUDIT.TEST/x', 'http://audit.test./x', 'http://audit.test:80/x'])('refuses %s with 403', async (url) => {
    const h = await harness({ served: ['audit.test:80'] })
    expect(await raw(h.proxyPort, `GET ${url} HTTP/1.1\r\nHost: audit.test\r\n\r\n`)).toMatch(/^HTTP\/1\.1 403 /)
    expect(h.log).toHaveLength(1)
    expect(h.dialed).toEqual([])
    expect(h.lookup).not.toHaveBeenCalled()
  })
})

describe('strict authority parsing is shared', () => {
  it('absolute-form port 0 is a 400 with no dial, like CONNECT', async () => {
    const h = await harness()
    expect(await raw(h.proxyPort, 'GET http://example.test:0/ HTTP/1.1\r\nHost: example.test\r\n\r\n')).toMatch(/^HTTP\/1\.1 400 /)
    expect(await raw(h.proxyPort, connectReq('example.test:0'))).toMatch(/^HTTP\/1\.1 400 /)
    expect(h.dialed).toEqual([])
    expect(h.lookup).not.toHaveBeenCalled()
  })

  it('parseAuthority lowercases and strips one trailing dot', () => {
    expect(parseAuthority('Example.TEST.:80')).toEqual({ host: 'example.test', port: 80 })
  })
})

describe('dial robustness', () => {
  it('a synchronous throw from dial() is a 502 plus a log entry, never an uncaughtException', async () => {
    const uncaught = vi.fn()
    process.on('uncaughtException', uncaught)
    try {
      const h = await harness({
        dial: () => {
          throw new Error('sync boom')
        },
      })
      expect(await raw(h.proxyPort, connectReq('example.test:80'))).toMatch(/^HTTP\/1\.1 502 /)
      expect(await raw(h.proxyPort, 'GET http://example.test/ HTTP/1.1\r\nHost: example.test\r\n\r\n')).toMatch(/^HTTP\/1\.1 502 /)
      expect(h.log.some((l) => l.reason.includes('sync boom'))).toBe(true)
      expect(uncaught).not.toHaveBeenCalled()
    } finally {
      process.off('uncaughtException', uncaught)
    }
  })

  it('a throw on a later Happy Eyeballs attempt falls through to nothing worse than 502', async () => {
    const uncaught = vi.fn()
    process.on('uncaughtException', uncaught)
    try {
      const h = await harness({
        lookup: async () => [
          { address: PUBLIC_V6, family: 6 },
          { address: PUBLIC_V4, family: 4 },
        ],
        dial: (target) => {
          if (target.family === 4) throw new Error('late boom')
          const dead = new net.Socket()
          setImmediate(() => dead.destroy(new Error('ENETUNREACH')))
          return dead
        },
      })
      expect(await raw(h.proxyPort, connectReq('dual.test:80'), 800)).toMatch(/^HTTP\/1\.1 502 /)
      expect(uncaught).not.toHaveBeenCalled()
    } finally {
      process.off('uncaughtException', uncaught)
    }
  })

  it('a throw on the first attempt still lets a later address connect', async () => {
    const h = await harness({
      lookup: async () => [
        { address: PUBLIC_V6, family: 6 },
        { address: PUBLIC_V4, family: 4 },
      ],
      dial: (target, upstreamPort) => {
        if (target.family === 6) throw new Error('first boom')
        return net.connect({ host: '127.0.0.1', port: upstreamPort })
      },
    })
    expect(await raw(h.proxyPort, `${connectReq('dual.test:80')}x`)).toContain('200 Connection Established')
  })
})
