import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer, PRODUCTION_PRIVATE_FLAG_ERROR } from './server.js'

const servers: FastifyInstance[] = []
const tempDirs: string[] = []

function build(options: Parameters<typeof createServer>[0] = {}): FastifyInstance {
  const server = createServer({ logger: false, ...options })
  servers.push(server)
  return server
}

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(servers.splice(0).map((server) => server.close()))
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('createServer', () => {
  it('GET /api/health returns 200 { status: "ok" } with the strict CSP', async () => {
    const response = await build().inject({ method: 'GET', url: '/api/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })

    const csp = response.headers['content-security-policy']
    expect(csp).toEqual(expect.stringContaining("default-src 'self'"))
    expect(csp).toEqual(expect.stringContaining("script-src 'self'"))
    expect(csp).toEqual(expect.stringContaining("object-src 'none'"))
    expect(csp).toEqual(expect.stringContaining("frame-ancestors 'none'"))
  })

  it('serves the samples routes under /api', async () => {
    const response = await build().inject({ method: 'GET', url: '/api/samples' })
    expect(response.statusCode).toBe(200)
    expect(Array.isArray(response.json())).toBe(true)
    expect(response.headers['content-security-policy']).toBeDefined()
  })

  it('serves /cursed-shop/index.html as HTML without a CSP header', async () => {
    const response = await build().inject({ method: 'GET', url: '/cursed-shop/index.html' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.body).toContain('<html')
    expect(response.headers['content-security-policy']).toBeUndefined()
  })

  it('returns 404 for unknown API routes in development', async () => {
    const response = await build().inject({ method: 'GET', url: '/api/nope' })
    expect(response.statusCode).toBe(404)
  })

  it('refuses UNSEEN_DEV_ALLOW_PRIVATE=1 in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('UNSEEN_DEV_ALLOW_PRIVATE', '1')
    expect(() => createServer({ logger: false })).toThrowError(
      'UNSEEN_DEV_ALLOW_PRIVATE=1 is forbidden in production (NODE_ENV=production)',
    )
    expect(PRODUCTION_PRIVATE_FLAG_ERROR).toBe(
      'UNSEEN_DEV_ALLOW_PRIVATE=1 is forbidden in production (NODE_ENV=production)',
    )
  })

  it('allows UNSEEN_DEV_ALLOW_PRIVATE=1 outside production', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('UNSEEN_DEV_ALLOW_PRIVATE', '1')
    expect(() => build()).not.toThrow()
  })
})

describe('createServer in production', () => {
  function productionServer(): FastifyInstance {
    const clientDir = mkdtempSync(path.join(tmpdir(), 'unseen-client-'))
    tempDirs.push(clientDir)
    writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><html lang="en"><h1>SPA shell</h1></html>')
    mkdirSync(path.join(clientDir, 'assets'))
    writeFileSync(path.join(clientDir, 'assets', 'app.js'), 'console.log(1)')
    vi.stubEnv('NODE_ENV', 'production')
    return build({ clientDir })
  }

  it('serves the SPA shell with the CSP at / and for client-side routes', async () => {
    const server = productionServer()
    for (const url of ['/', '/sample/cursed-shop-index/daylight', '/seance/abc']) {
      const response = await server.inject({ method: 'GET', url })
      expect(response.statusCode).toBe(200)
      expect(response.body).toContain('SPA shell')
      expect(response.headers['content-security-policy']).toBeDefined()
    }
  })

  it('serves built assets and keeps 404s for missing assets and backend paths', async () => {
    const server = productionServer()
    expect((await server.inject({ method: 'GET', url: '/assets/app.js' })).statusCode).toBe(200)
    expect((await server.inject({ method: 'GET', url: '/assets/missing.js' })).statusCode).toBe(404)
    expect((await server.inject({ method: 'GET', url: '/api/nope' })).statusCode).toBe(404)
    expect((await server.inject({ method: 'GET', url: '/cursed-shop/nope' })).statusCode).toBe(404)
  })

  it('serves the SPA under NODE_ENV=test (the e2e server) but not under development', async () => {
    const clientDir = mkdtempSync(path.join(tmpdir(), 'unseen-client-'))
    tempDirs.push(clientDir)
    writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><html lang="en"><h1>SPA shell</h1></html>')

    vi.stubEnv('NODE_ENV', 'test')
    const testServer = build({ clientDir })
    expect((await testServer.inject({ method: 'GET', url: '/sample/x' })).body).toContain('SPA shell')

    vi.stubEnv('NODE_ENV', 'development')
    const devServer = build({ clientDir })
    expect((await devServer.inject({ method: 'GET', url: '/sample/x' })).statusCode).toBe(404)
  })

  it('still serves the cursed shop without a CSP and the API with one', async () => {
    const server = productionServer()
    const shop = await server.inject({ method: 'GET', url: '/cursed-shop/index.html' })
    expect(shop.statusCode).toBe(200)
    expect(shop.headers['content-security-policy']).toBeUndefined()
    const health = await server.inject({ method: 'GET', url: '/api/health' })
    expect(health.statusCode).toBe(200)
    expect(health.headers['content-security-policy']).toBeDefined()
  })
})
