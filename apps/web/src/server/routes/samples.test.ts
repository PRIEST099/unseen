import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadSampleIndex, samplesRoutes } from './samples.js'

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0])

const metadata = {
  id: 'demo',
  name: 'Demo',
  url: 'https://example.test/',
  score: 42,
  countsByType: { NamelessSpirit: 1 },
  thumbnailUrl: '/api/samples/demo/thumbnail.jpg',
}

let dir: string
let server: FastifyInstance

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'unseen-samples-'))
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify([metadata]))
  writeFileSync(path.join(dir, 'demo.json'), JSON.stringify({ id: 'demo', name: 'Demo' }))
  writeFileSync(path.join(dir, 'demo.png'), PNG_BYTES)
  writeFileSync(path.join(dir, 'demo-thumb.jpg'), JPG_BYTES)
  // A file next to the samples that must never be reachable through `:id`.
  writeFileSync(path.join(dir, 'secret.json'), JSON.stringify({ secret: true }))

  server = fastify()
  await server.register(samplesRoutes, { prefix: '/api', samplesDir: dir })
  await server.ready()
})

afterAll(async () => {
  await server.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('samples routes', () => {
  it('GET /api/samples returns the cached index', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/samples' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([metadata])
  })

  it('GET /api/samples/:id returns the sample JSON', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/samples/demo' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ id: 'demo', name: 'Demo' })
  })

  it('serves the screenshot as image/png', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/samples/demo/screenshot.png' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('image/png')
    expect(response.rawPayload.equals(PNG_BYTES)).toBe(true)
  })

  it('serves the thumbnail as image/jpeg', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/samples/demo/thumbnail.jpg' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('image/jpeg')
    expect(response.rawPayload.equals(JPG_BYTES)).toBe(true)
  })

  it('returns 404 for unknown ids on every sample route', async () => {
    for (const suffix of ['', '/screenshot.png', '/thumbnail.jpg']) {
      const response = await server.inject({ method: 'GET', url: `/api/samples/nope${suffix}` })
      expect(response.statusCode).toBe(404)
    }
  })

  it('does not serve files that are not listed in index.json (path traversal)', async () => {
    for (const id of ['secret', '..%2Fsecret', '..%5Csecret', '%2e%2e%2findex', 'demo%00']) {
      const response = await server.inject({ method: 'GET', url: `/api/samples/${id}` })
      expect(response.statusCode).toBe(404)
    }
  })

  it('rejects a malformed index.json at startup', () => {
    const badDir = mkdtempSync(path.join(tmpdir(), 'unseen-samples-bad-'))
    try {
      writeFileSync(path.join(badDir, 'index.json'), JSON.stringify([{ id: 1 }]))
      expect(() => loadSampleIndex(badDir)).toThrow(/not a valid SampleMetadata/)
    } finally {
      rmSync(badDir, { recursive: true, force: true })
    }
  })
})
