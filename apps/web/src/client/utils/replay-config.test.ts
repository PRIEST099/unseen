import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { auditEndpoint, fetchAudit, screenshotEndpoint } from './audit-source'
import { submitAudit } from './audit-api'
import { normalizeBasePath, readReplayConfig, replayAssetUrl, sanitizeLiveUrl } from './replay-config'
import type { ReplayConfig } from './replay-config'
import { fetchSamples, parseSamples, samplesEndpoint } from './samples'

const REPLAY: ReplayConfig = { replay: true, basePath: '/unseen/', liveUrl: 'https://unseen.example.com/' }
const HOSTED: ReplayConfig = { replay: false, basePath: '/', liveUrl: '' }

const arbId = fc.stringMatching(/^[a-z0-9-]{1,30}$/)

describe('readReplayConfig', () => {
  it('is the hosted app unless VITE_REPLAY is exactly "1"', () => {
    expect(readReplayConfig({}).replay).toBe(false)
    expect(readReplayConfig({ VITE_REPLAY: '0' }).replay).toBe(false)
    expect(readReplayConfig({ VITE_REPLAY: 'true' }).replay).toBe(false)
    expect(readReplayConfig({ VITE_REPLAY: '1' }).replay).toBe(true)
  })

  it('reads the base path and the live URL', () => {
    expect(readReplayConfig({ VITE_REPLAY: '1', BASE_URL: '/unseen/', VITE_LIVE_URL: 'https://live.example.com' })).toEqual({
      replay: true,
      basePath: '/unseen/',
      liveUrl: 'https://live.example.com/',
    })
  })

  it('leaves the live URL out when it is empty or not a plain http(s) URL', () => {
    for (const value of ['', '  ', 'javascript:alert(1)', 'data:text/html,x', '/relative', 'not a url', 'ftp://x.example.com']) {
      expect(sanitizeLiveUrl(value)).toBe('')
    }
    expect(readReplayConfig({ VITE_REPLAY: '1' }).liveUrl).toBe('')
  })
})

describe('normalizeBasePath', () => {
  it('always yields a path with one leading and one trailing slash', async () => {
    await fc.assert(
      fc.asyncProperty(fc.stringMatching(/^[/]{0,3}[a-z0-9-]{1,12}([/][a-z0-9-]{1,12}){0,2}[/]{0,3}$/), async (input) => {
        const result = normalizeBasePath(input)
        expect(result).toMatch(/^\/([a-z0-9-]+\/)+$/)
      }),
      { numRuns: 100 },
    )
    expect(normalizeBasePath('')).toBe('/')
    expect(normalizeBasePath('/')).toBe('/')
    expect(normalizeBasePath('unseen')).toBe('/unseen/')
  })
})

describe('replay endpoints', () => {
  it('never point at /api, for any sample id and any base path', async () => {
    await fc.assert(
      fc.asyncProperty(arbId, fc.constantFrom('/', '/unseen/', '/a/b/'), async (id, basePath) => {
        const config: ReplayConfig = { ...REPLAY, basePath }
        for (const kind of ['sample', 'job'] as const) {
          const urls = [auditEndpoint({ kind, id }, config), screenshotEndpoint({ kind, id }, config)]
          for (const url of urls) {
            expect(url.startsWith(`${basePath}replay-data/`)).toBe(true)
            expect(url).not.toContain('/api')
          }
        }
        expect(samplesEndpoint(config)).toBe(`${basePath}replay-data/index.json`)
      }),
      { numRuns: 100 },
    )
  })

  it('keeps the hosted API paths when not in replay', () => {
    expect(auditEndpoint({ kind: 'sample', id: 'x' }, HOSTED)).toBe('/api/samples/x')
    expect(auditEndpoint({ kind: 'job', id: 'x' }, HOSTED)).toBe('/api/audit/x')
    expect(screenshotEndpoint({ kind: 'sample', id: 'x' }, HOSTED)).toBe('/api/samples/x/screenshot.png')
    expect(samplesEndpoint(HOSTED)).toBe('/api/samples')
  })

  it('maps thumbnails to static files in replay and keeps the index path otherwise', () => {
    const body = [{ id: 's1', name: 'N', url: '/u', score: 3, thumbnailUrl: '/api/samples/s1/thumbnail.jpg' }]
    expect(parseSamples(body, REPLAY)[0]?.thumbnailUrl).toBe('/unseen/replay-data/s1-thumb.jpg')
    expect(parseSamples(body, HOSTED)[0]?.thumbnailUrl).toBe('/api/samples/s1/thumbnail.jpg')
  })

  it('builds asset URLs under the base path', () => {
    expect(replayAssetUrl(REPLAY, 'a.json')).toBe('/unseen/replay-data/a.json')
  })
})

describe('replay isolation: no request reaches /api', () => {
  it('requests only static files when loading samples and audits', async () => {
    const requested: string[] = []
    const fetchFn = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      requested.push(String(input))
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchFn)
    try {
      await fetchSamples(new AbortController().signal, REPLAY)
      await fetchAudit({ kind: 'sample', id: 'cursed-shop-index' }, fetchFn, REPLAY)
    } finally {
      vi.unstubAllGlobals()
    }
    expect(requested).toEqual(['/unseen/replay-data/index.json', '/unseen/replay-data/cursed-shop-index.json'])
  })

  it('makes no request at all for a job id or a URL submission', async () => {
    const fetchFn = vi.fn(async (): Promise<Response> => new Response('{}'))
    expect(await fetchAudit({ kind: 'job', id: 'abc' }, fetchFn, REPLAY)).toEqual({ status: 'not-found' })
    const submitted = await submitAudit('https://example.com/', fetchFn, REPLAY)
    expect(submitted.ok).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('does submit in the hosted app (the guard is specific to replay)', async () => {
    const fetchFn = vi.fn(async (): Promise<Response> => new Response(JSON.stringify({ id: 'j1' }), { status: 202 }))
    expect(await submitAudit('https://example.com/', fetchFn, HOSTED)).toEqual({ ok: true, id: 'j1' })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
