import http from 'node:http'
import net from 'node:net'
import { pipeline } from 'node:stream'
import type { Duplex } from 'node:stream'
import type { LookupFn } from './dns-resolver.js'
import { DNS_TIMEOUT_MS } from './dns-resolver.js'
import { normaliseHost, validateHost } from './host-validator.js'
import type { HostVerdict } from './host-validator.js'

export type BlockedEntry = { url: string; reason: string }

export type DialTarget = { address: string; port: number; family: 0 | 4 | 6 }
/** The dial seam. The default opens a TCP connection to the validated IP literal. */
export type DialFn = (target: DialTarget) => net.Socket

export type ProxyOptions = {
  /** Every refusal and failure is appended here. */
  blockedLog: BlockedEntry[]
  /** Exact `host:port` authorities that are dialled without DNS or range checks. */
  allowAuthorities?: readonly string[]
  lookup?: LookupFn
  dial?: DialFn
  dnsTimeoutMs?: number
  connectTimeoutMs?: number
}

export const CONNECT_TIMEOUT_MS = 10_000
const HAPPY_EYEBALLS_STAGGER_MS = 250
const MAX_CONCURRENT_LOOKUPS = 8
const STOP_TIMEOUT_MS = 1_000

const AUTHORITY = /^(?:\[([0-9a-fA-F:.%a-zA-Z0-9]+)\]|([^:[\]\s/@?#]+)):(\d{1,5})$/

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'trailers',
  'transfer-encoding',
  'upgrade',
])

export type Authority = { host: string; port: number }

/** Strict `host:port` / `[v6]:port` parser. Port 1-65535 is required. */
export function parseAuthority(text: string): Authority | null {
  const match = AUTHORITY.exec(text)
  if (!match) return null
  const host = match[1] ?? match[2]
  const port = Number(match[3])
  if (host === undefined || host === '' || !Number.isInteger(port) || port < 1 || port > 65535) return null
  return { host, port }
}

function defaultDial(target: DialTarget): net.Socket {
  return net.connect(target.family === 0 ? { host: target.address, port: target.port } : { host: target.address, port: target.port, family: target.family })
}

function noop(): void {
  /* errors are handled by the stage that owns the socket */
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function isoAuthority(host: string, port: number): string {
  return `${host.toLowerCase()}:${port}`
}

/**
 * A per-audit forward proxy that is the enforcement point for SSRF: it resolves each hostname once,
 * rejects blocked addresses, dials only the validated IPs (DNS pinning), and sees every redirect hop,
 * WebSocket and TLS tunnel Chromium makes. It never follows redirects and never trusts a Host header.
 */
export class SsrfGuardProxy {
  private readonly server: http.Server
  private readonly sockets = new Set<Duplex>()
  private readonly cache = new Map<string, Promise<HostVerdict>>()
  private readonly allowed: Set<string>
  private readonly dial: DialFn
  private readonly lookup: LookupFn | undefined
  private lookupsRunning = 0
  private readonly lookupWaiters: Array<() => void> = []
  private stopped = false

  constructor(private readonly options: ProxyOptions) {
    this.allowed = new Set((options.allowAuthorities ?? []).map((a) => a.toLowerCase()))
    this.dial = options.dial ?? defaultDial
    this.lookup = options.lookup
    this.server = http.createServer((req, res) => this.handleRequest(req, res))
    this.server.on('connect', (req, socket, head) => this.handleConnect(req, socket, head))
    this.server.on('upgrade', (_req, socket) => {
      this.track(socket)
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
    })
    this.server.on('connection', (socket) => this.track(socket))
    this.server.on('clientError', (_err, socket) => socket.destroy())
  }

  async start(): Promise<number> {
    await new Promise<void>((ok, fail) => {
      this.server.once('error', fail)
      this.server.listen(0, '127.0.0.1', () => {
        this.server.off('error', fail)
        ok()
      })
    })
    const addr = this.server.address()
    if (!addr || typeof addr === 'string') throw new Error('proxy has no port')
    return addr.port
  }

  async stop(): Promise<void> {
    this.stopped = true
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    this.cache.clear()
    await new Promise<void>((ok) => {
      const timer = setTimeout(ok, STOP_TIMEOUT_MS)
      this.server.close(() => {
        clearTimeout(timer)
        ok()
      })
      this.server.closeAllConnections()
    })
  }

  private track(socket: Duplex): void {
    this.sockets.add(socket)
    socket.on('error', noop)
    socket.once('close', () => this.sockets.delete(socket))
  }

  private log(url: string, reason: string): void {
    this.options.blockedLog.push({ url, reason })
  }

  // ---- validation ---------------------------------------------------------

  private async withLookupSlot<T>(work: () => Promise<T>): Promise<T> {
    while (this.lookupsRunning >= MAX_CONCURRENT_LOOKUPS) {
      await new Promise<void>((ok) => this.lookupWaiters.push(ok))
    }
    this.lookupsRunning++
    try {
      return await work()
    } finally {
      this.lookupsRunning--
      this.lookupWaiters.shift()?.()
    }
  }

  /** Validate once per hostname for the proxy's lifetime: DNS is never asked a second time. */
  private validate(host: string): Promise<HostVerdict> {
    const key = host.toLowerCase()
    const cached = this.cache.get(key)
    if (cached) return cached
    const pending = this.withLookupSlot(() => validateHost(host, this.lookup, this.options.dnsTimeoutMs ?? DNS_TIMEOUT_MS))
    this.cache.set(key, pending)
    return pending
  }


  // ---- dialling -----------------------------------------------------------

  /** Try the validated addresses in order, staggered by 250 ms. The first to connect wins. */
  private connectAny(addresses: ReadonlyArray<{ address: string; family: 0 | 4 | 6 }>, port: number): Promise<net.Socket> {
    const timeoutMs = this.options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS
    return new Promise<net.Socket>((resolve, reject) => {
      const attempts: net.Socket[] = []
      let next = 0
      let pending = 0
      let done = false
      let lastError: unknown = new Error('no address to dial')
      let stagger: ReturnType<typeof setTimeout> | undefined
      const settle = (): void => {
        done = true
        clearTimeout(stagger)
        clearTimeout(overall)
      }
      const overall = setTimeout(() => {
        if (done) return
        settle()
        for (const s of attempts) s.destroy()
        reject(new Error('connect timeout'))
      }, timeoutMs)
      const launch = (): void => {
        if (done) return
        const target = addresses[next++]
        if (!target) {
          if (pending === 0) {
            settle()
            reject(lastError)
          }
          return
        }
        pending++
        const socket = this.dial({ address: target.address, port, family: target.family })
        this.track(socket)
        attempts.push(socket)
        socket.once('connect', () => {
          if (done) {
            socket.destroy()
            return
          }
          settle()
          for (const s of attempts) if (s !== socket) s.destroy()
          resolve(socket)
        })
        socket.once('error', (err) => {
          pending--
          lastError = err
          socket.destroy()
          if (!done) {
            clearTimeout(stagger)
            launch()
          }
        })
        stagger = setTimeout(launch, HAPPY_EYEBALLS_STAGGER_MS)
      }
      launch()
    })
  }

  /** Resolve the target to a connected socket, or answer the client with the refusal. */
  private async openUpstream(host: string, port: number): Promise<{ socket: net.Socket } | { status: number; reason: string }> {
    if (this.allowed.has(isoAuthority(host, port))) {
      const family: 0 | 4 | 6 = net.isIPv6(host) ? 6 : net.isIPv4(host) ? 4 : 0
      const literal = [{ address: host, family }]
      return { socket: await this.connectAny(literal, port) }
    }
    const verdict = await this.validate(host)
    if (!verdict.ok) return { status: verdict.kind === 'blocked' ? 403 : 502, reason: verdict.reason }
    try {
      return { socket: await this.connectAny(verdict.addresses, port) }
    } catch (err) {
      return { status: 502, reason: `upstream connection failed: ${errorText(err)}` }
    }
  }

  // ---- CONNECT ------------------------------------------------------------

  private handleConnect(req: http.IncomingMessage, client: Duplex, head: Buffer): void {
    this.track(client)
    void this.connect(req.url ?? '', client, head).catch((err: unknown) => {
      this.log(`connect://${req.url ?? ''}`, `proxy error: ${errorText(err)}`)
      this.refuse(client, 502, 'Bad Gateway')
    })
  }

  private async connect(authority: string, client: Duplex, head: Buffer): Promise<void> {
    const parsed = parseAuthority(authority)
    if (!parsed) {
      this.log(`connect://${authority}`, 'invalid CONNECT authority')
      this.refuse(client, 400, 'Bad Request')
      return
    }
    const upstream = await this.openUpstream(parsed.host, parsed.port)
    if (client.destroyed || this.stopped) {
      if ('socket' in upstream) upstream.socket.destroy()
      return
    }
    if (!('socket' in upstream)) {
      this.log(`connect://${authority}`, upstream.reason)
      this.refuse(client, upstream.status, upstream.status === 403 ? 'Forbidden' : 'Bad Gateway')
      return
    }
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    if (head.length > 0) upstream.socket.write(head)
    const close = (): void => {
      client.destroy()
      upstream.socket.destroy()
    }
    pipeline(client, upstream.socket, close)
    pipeline(upstream.socket, client, close)
  }

  private refuse(client: Duplex, status: number, text: string): void {
    if (client.destroyed) return
    client.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  }

  // ---- plain HTTP ---------------------------------------------------------

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    req.on('error', noop)
    res.on('error', noop)
    void this.forward(req, res).catch((err: unknown) => {
      this.log(req.url ?? '', `proxy error: ${errorText(err)}`)
      this.fail(res, 502, 'proxy error')
    })
  }

  private fail(res: http.ServerResponse, status: number, message: string): void {
    if (res.headersSent) {
      res.destroy()
      return
    }
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', connection: 'close' })
    res.end(message)
  }

  private async forward(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const target = parseAbsoluteHttp(req.url ?? '')
    if (!target) {
      this.log(req.url ?? '', 'proxy accepts only absolute-form http: requests')
      this.fail(res, 400, 'bad request')
      return
    }
    const upstream = await this.openUpstream(target.host, target.port)
    if (!('socket' in upstream)) {
      this.log(target.url.href, upstream.reason)
      this.fail(res, upstream.status, upstream.status === 403 ? 'blocked' : 'bad gateway')
      return
    }
    const out = http.request({
      method: req.method,
      path: `${target.url.pathname}${target.url.search}`,
      headers: upstreamHeaders(req.headers, target.url.host),
      createConnection: () => upstream.socket,
    })
    out.on('error', (err) => {
      this.log(target.url.href, `upstream request failed: ${errorText(err)}`)
      this.fail(res, 502, 'bad gateway')
    })
    out.on('response', (inbound) => {
      inbound.on('error', noop)
      res.writeHead(inbound.statusCode ?? 502, inbound.statusMessage, responseHeaders(inbound.headers))
      pipeline(inbound, res, noop)
    })
    pipeline(req, out, noop)
    res.on('close', () => out.destroy())
  }
}

type HttpTarget = { url: URL; host: string; port: number }

/** The target of an absolute-form request. It comes from the request-target only, never from Host. */
function parseAbsoluteHttp(text: string): HttpTarget | null {
  if (!/^http:\/\//i.test(text)) return null
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' || url.hostname === '') return null
  return { url, host: normaliseHost(url.hostname), port: url.port === '' ? 80 : Number(url.port) }
}

function upstreamHeaders(headers: http.IncomingHttpHeaders, host: string): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {}
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || HOP_BY_HOP.has(name) || name.startsWith('proxy-') || name === 'host') continue
    out[name] = value
  }
  out.host = host
  out.connection = 'close'
  return out
}

function responseHeaders(headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {}
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || HOP_BY_HOP.has(name)) continue
    out[name] = value
  }
  out.connection = 'close'
  return out
}
