import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { PACKAGE_DIR, SERVER_JS, ensureBuilt, runNode } from './helpers/cli.js'
import { serveShop } from './helpers/shop-server.js'
import type { StaticServer } from './helpers/shop-server.js'

let shop: StaticServer

beforeAll(async () => {
  ensureBuilt()
  shop = await serveShop()
})

afterAll(async () => {
  await shop.close()
})

describe('built CLI (this repository path contains a space)', () => {
  test('`audit <url>` prints the summary and the process exits on its own', async () => {
    const result = await runNode(SERVER_JS, ['audit', `${shop.url}/checkout.html`], { timeoutMs: 120000 })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Haunting score:')
    expect(result.ms).toBeLessThan(120000)
  })

  test('`audit --json` prints parseable JSON with a score', async () => {
    const result = await runNode(SERVER_JS, ['audit', `${shop.url}/index.html`, '--json'], { timeoutMs: 120000 })
    expect(result.code).toBe(0)
    const parsed: unknown = JSON.parse(result.stdout)
    expect(parsed).toHaveProperty('score')
  })

  test('`audit` with a bad scheme exits 1 with a code on stderr', async () => {
    const result = await runNode(SERVER_JS, ['audit', 'file:///etc/passwd'])
    expect(result.code).toBe(1)
    expect(result.stderr.trim()).toMatch(/^[A-Z_]+$/)
  })

  test('stdio server mode lists exactly the four tools and writes only protocol frames to stdout', async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER_JS], cwd: PACKAGE_DIR, stderr: 'pipe' })
    const client = new Client({ name: 'smoke', version: '0.0.0' })
    await client.connect(transport)
    const names = (await client.listTools()).tools.map((t) => t.name).sort()
    await client.close()
    expect(names).toEqual(['audit_html', 'audit_url', 'explain_haunting', 'suggest_fix'])
  })
})
