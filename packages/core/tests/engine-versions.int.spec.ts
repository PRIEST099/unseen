import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { auditHtml, getPool } from '../src/index.js'

const HTML = '<!doctype html><html lang="en"><head><title>Engine</title></head><body><main><h1>Engine</h1></main></body></html>'

test.afterAll(async () => {
  await getPool().close()
})

test('records the tool versions the audit ran with', async () => {
  const raw = await auditHtml(HTML)
  const pkg: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const axePkg: unknown = JSON.parse(readFileSync(new URL('../../../node_modules/axe-core/package.json', import.meta.url), 'utf8'))
  const versionOf = (value: unknown): string =>
    typeof value === 'object' && value !== null && 'version' in value && typeof value.version === 'string' ? value.version : ''

  expect(raw.engine).toBeDefined()
  expect(raw.engine?.unseenVersion).toBe(versionOf(pkg))
  expect(raw.engine?.unseenVersion).not.toBe('')
  // The axe version comes from the results of the run, so it must equal the installed axe-core.
  expect(raw.engine?.axeVersion).toBe(versionOf(axePkg))
  // Chromium reports a dotted version such as 141.0.7390.37.
  expect(raw.engine?.chromiumVersion).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
})
