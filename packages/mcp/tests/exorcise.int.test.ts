import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { auditAndClassify, getPool } from '@the-unseen/core'
import { SHOP_DIR, serveDirectory } from './helpers/shop-server.js'
import type { StaticServer } from './helpers/shop-server.js'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const COPY_DIR = join(ROOT, 'demo', 'cursed-shop-exorcised')
const PAGES = ['index.html', 'product.html', 'checkout.html'] as const

let original: StaticServer
let copy: StaticServer
const scores = new Map<string, { before: number; after: number; hauntingsAfter: number }>()

beforeAll(async () => {
  original = await serveDirectory(SHOP_DIR)
  copy = await serveDirectory(COPY_DIR)
  for (const page of PAGES) {
    const before = await auditAndClassify(`${original.url}/${page}`, { allowPrivate: true })
    const after = await auditAndClassify(`${copy.url}/${page}`, { allowPrivate: true })
    scores.set(page, { before: before.score, after: after.score, hauntingsAfter: after.hauntings.length })
  }
})

afterAll(async () => {
  await original.close()
  await copy.close()
  await getPool().close()
})

describe('exorcised Cursed Shop copy', () => {
  test.each(PAGES)('%s scores lower than the original', (page) => {
    const s = scores.get(page)
    expect(s?.before).toBeGreaterThan(0)
    expect(s?.after).toBeLessThan(s?.before ?? 0)
  })

  test.each(PAGES)('%s has no hauntings left', (page) => {
    expect(scores.get(page)?.hauntingsAfter).toBe(0)
  })

  test('demo/cursed-shop-exorcised has no package.json, so it is outside the npm workspaces', () => {
    expect(existsSync(join(COPY_DIR, 'package.json'))).toBe(false)
    for (const page of PAGES) expect(existsSync(join(COPY_DIR, page)), page).toBe(true)
  })

  test('the README records the computed before and after scores per page', () => {
    const readme = readFileSync(join(COPY_DIR, 'README.md'), 'utf8')
    for (const page of PAGES) {
      const s = scores.get(page)
      expect(readme).toContain(`| ${page} | ${s?.before} | ${s?.after} |`)
    }
    expect(readme).toMatch(/30.{1,3}40%/)
    expect(readme).not.toMatch(/\b(is|are|now|fully)\s+(accessible|compliant)\b|passes WCAG|WCAG compliant/i)
  })
})

describe('the original Cursed Shop is untouched', () => {
  test('git diff --exit-code -- apps/cursed-shop is empty', () => {
    const result = spawnSync('git', ['diff', '--exit-code', '--', 'apps/cursed-shop'], { cwd: ROOT, encoding: 'utf8' })
    expect(result.status, result.stdout).toBe(0)
  })

  test('npm run verify -w cursed-shop passes', () => {
    const npm = process.platform === 'win32' ? { cmd: 'cmd.exe', args: ['/c', 'npm', 'run', 'verify', '-w', 'cursed-shop'] } : { cmd: 'npm', args: ['run', 'verify', '-w', 'cursed-shop'] }
    const result = spawnSync(npm.cmd, npm.args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, UNSEEN_CHROMIUM_CHANNEL: 'chromium' }, timeout: 170000 })
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  })
})
