import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { getPool, HAUNTING_TYPES } from '@the-unseen/core'
import { createUnseenServer } from '../src/server-core.js'
import { serveShop } from './helpers/shop-server.js'
import type { StaticServer } from './helpers/shop-server.js'

let shop: StaticServer
let client: Client

beforeAll(async () => {
  shop = await serveShop()
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await createUnseenServer().connect(serverSide)
  client = new Client({ name: 'test-client', version: '0.0.0' })
  await client.connect(clientSide)
})

afterAll(async () => {
  await client.close()
  await shop.close()
  await getPool().close()
})

type Structured = {
  score: number
  summary: string
  hauntings: { id: string; type: string; severity: string; selector: string }[]
  classified?: { raw: Record<string, unknown> }
  code?: string
  text: string
  displayName: string
  persona: string
  explanation: string
  wcag: unknown[]
  framework: string
}

async function call(name: string, args: Record<string, unknown>): Promise<{ isError: boolean; data: Structured }> {
  const result = await client.callTool({ name, arguments: args })
  const data = result['structuredContent']
  if (typeof data !== 'object' || data === null) throw new Error('no structuredContent')
  return { isError: result['isError'] === true, data: data as Structured }
}

const HAUNTED_BUTTON = `<!DOCTYPE html><html lang="en"><head><title>t</title></head><body><main><h1>Cart</h1>
<form><button class="checkout"><svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg></button></form></main></body></html>`

describe('the four tools over an in-memory MCP client', () => {
  test('lists exactly the four tools', async () => {
    const names = (await client.listTools()).tools.map((t) => t.name).sort()
    expect(names).toEqual(['audit_html', 'audit_url', 'explain_haunting', 'suggest_fix'])
  })

  test('audit_url on checkout.html returns a score, counts and a Wraith', async () => {
    const { isError, data } = await call('audit_url', { url: `${shop.url}/checkout.html` })
    expect(isError).toBe(false)
    expect(data.score).toBeGreaterThan(0)
    expect(data.hauntings.some((h) => h.severity === 'Wraith')).toBe(true)
    expect(data.summary).toContain('Haunting score:')
  })

  test('the summary for checkout.html matches the snapshot', async () => {
    const { data } = await call('audit_url', { url: `${shop.url}/checkout.html` })
    expect(data.summary.split(shop.url).join('http://shop.test')).toMatchSnapshot()
  })

  test("page: 'full' returns the classified audit without a screenshot", async () => {
    const { data } = await call('audit_url', { url: `${shop.url}/checkout.html`, page: 'full' })
    expect(data.classified).toBeDefined()
    expect(data.classified?.raw).not.toHaveProperty('screenshotPng')
  })

  test('audit_html on an icon-only checkout button returns a Wraith NamelessSpirit', async () => {
    const { isError, data } = await call('audit_html', { html: HAUNTED_BUTTON })
    expect(isError).toBe(false)
    expect(data.hauntings.some((h) => h.type === 'NamelessSpirit' && h.severity === 'Wraith')).toBe(true)
  })

  test('a file:/// URL is INVALID_INPUT', async () => {
    const { isError, data } = await call('audit_url', { url: 'file:///etc/passwd' })
    expect(isError).toBe(true)
    expect(data.code).toBe('INVALID_INPUT')
  })

  test('a non-HTML URL is NOT_HTML', async () => {
    const { isError, data } = await call('audit_url', { url: `${shop.url}/expected-hauntings.json` })
    expect(isError).toBe(true)
    expect(data.code).toBe('NOT_HTML')
  })

  test('an unreachable page is a typed AUDIT_FAILED or TIMEOUT error without the URL in the message', async () => {
    const result = await client.callTool({ name: 'audit_url', arguments: { url: 'http://127.0.0.1:1/' } })
    expect(result['isError']).toBe(true)
    expect(JSON.stringify(result['content'])).not.toContain('127.0.0.1')
  })

  test('explain_haunting by type works for all ten types', async () => {
    for (const type of HAUNTING_TYPES) {
      const { isError, data } = await call('explain_haunting', { type })
      expect(isError, type).toBe(false)
      expect(data.text, type).toContain(data.displayName)
      expect(data.persona, type).toMatch(/^As a/)
      expect(data.wcag.length, type).toBeGreaterThan(0)
    }
  })

  test('explain_haunting and suggest_fix by id after an audit, in html, react and vue', async () => {
    const audit = await call('audit_url', { url: `${shop.url}/checkout.html` })
    const id = audit.data.hauntings[0]?.id ?? ''
    expect(id).not.toBe('')
    const explained = await call('explain_haunting', { id })
    expect(explained.isError).toBe(false)
    expect(explained.data.explanation.length).toBeGreaterThan(10)
    for (const framework of ['html', 'react', 'vue']) {
      const fix = await call('suggest_fix', { id, framework })
      expect(fix.isError, framework).toBe(false)
      expect(fix.data.framework).toBe(framework)
      expect(fix.data.text).toContain('audit_url or audit_html')
    }
  })

  test('explain_haunting and suggest_fix reject unknown ids and bad input with typed codes', async () => {
    expect((await call('explain_haunting', { id: 'nope' })).data.code).toBe('UNKNOWN_HAUNTING_ID')
    expect((await call('suggest_fix', { id: 'nope' })).data.code).toBe('UNKNOWN_HAUNTING_ID')
    expect((await call('explain_haunting', {})).data.code).toBe('INVALID_INPUT')
    expect((await call('explain_haunting', { type: 'TheFog', id: 'x' })).data.code).toBe('INVALID_INPUT')
  })
})
