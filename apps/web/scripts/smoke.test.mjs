import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { runSmoke } from './smoke.mjs'

let server

/** A stub hosted auditor. `overrides` replace single behaviours so each check can be failed on its own. */
async function start(overrides = {}) {
  const behaviour = { csp: true, ssrfStatus: 403, echoIp: false, liveStatus: 'done', health: 'ok', ...overrides }
  server = createServer((request, response) => {
    const send = (status, body, headers = {}) => {
      response.writeHead(status, { 'Content-Type': 'application/json', ...headers }).end(typeof body === 'string' ? body : JSON.stringify(body))
    }
    const path = new URL(request.url ?? '/', 'http://x').pathname
    if (path === '/api/health') return send(200, { status: behaviour.health })
    if (path === '/') {
      const headers = { 'Content-Type': 'text/html', ...(behaviour.csp ? { 'Content-Security-Policy': "default-src 'self'" } : {}) }
      return send(200, '<div id="root"></div>', headers)
    }
    if (path === '/api/samples') return send(200, [{ id: 's1' }])
    if (path === '/api/samples/s1') return send(200, { result: { score: 98 } })
    if (path === '/api/audit' && request.method === 'POST') {
      let raw = ''
      request.on('data', (chunk) => (raw += chunk))
      request.on('end', () => {
        const { url } = JSON.parse(raw)
        if (url.includes('169.254')) {
          return send(behaviour.ssrfStatus, { error: 'SSRF_BLOCKED', message: behaviour.echoIp ? `blocked ${url}` : 'Cannot audit private or internal URLs' })
        }
        return send(202, { id: 'job1' })
      })
      return undefined
    }
    if (path === '/api/audit/job1') {
      return send(200, behaviour.liveStatus === 'done' ? { status: 'done', result: { score: 12 } } : { status: 'error', error: 'TIMEOUT' })
    }
    return send(404, { error: 'NOT_FOUND' })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
})

const byName = (results) => Object.fromEntries(results.map((result) => [result.name, result]))

describe('runSmoke', () => {
  it('passes every check against a healthy auditor', async () => {
    const results = await runSmoke(await start())
    expect(results.map((result) => [result.name, result.ok])).toEqual([
      ['health', true],
      ['spa and csp', true],
      ['samples', true],
      ['ssrf block', true],
      ['live audit', true],
    ])
    expect(byName(results)['live audit']?.detail).toBe('audit finished, score 12')
  })

  it('skips the live audit with live: false', async () => {
    const results = await runSmoke(await start(), { live: false })
    expect(results.some((result) => result.name === 'live audit')).toBe(false)
  })

  it('fails the CSP check when the header is missing', async () => {
    const results = byName(await runSmoke(await start({ csp: false }), { live: false }))
    expect(results['spa and csp']?.ok).toBe(false)
    expect(results['health']?.ok).toBe(true)
  })

  it('fails when the metadata address is not refused with a 4xx', async () => {
    expect(byName(await runSmoke(await start({ ssrfStatus: 202 }), { live: false }))['ssrf block']?.ok).toBe(false)
  })

  it('fails when the error body echoes the blocked address', async () => {
    expect(byName(await runSmoke(await start({ echoIp: true }), { live: false }))['ssrf block']?.ok).toBe(false)
  })

  it('fails when the health body is wrong or the live audit errors', async () => {
    const results = byName(await runSmoke(await start({ health: 'down', liveStatus: 'error' })))
    expect(results['health']?.ok).toBe(false)
    expect(results['live audit']?.ok).toBe(false)
  })

  it('reports a connection failure as failed checks instead of throwing', async () => {
    const url = await start()
    await new Promise((resolve) => server.close(resolve))
    const results = await runSmoke(url, { live: false })
    expect(results.every((result) => !result.ok)).toBe(true)
    server = createServer()
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  })
})
