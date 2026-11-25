import { copyFile, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { SERVER_JS, ensureBuilt, runNode } from './helpers/cli.js'

const DEMO_PAGE = fileURLToPath(new URL('../../../power/demo/checkout.html', import.meta.url))
const STOP = (cwd: string): string => JSON.stringify({ hook_event_name: 'Stop', cwd, session_id: 'e2e-session' })

let workspace: string
let gateShim: string

async function touch(file: string): Promise<void> {
  const when = new Date(Date.now() + 1000)
  await utimes(file, when, when)
}

beforeAll(async () => {
  ensureBuilt()
  workspace = await mkdtemp(join(tmpdir(), 'unseen gate e2e '))
  gateShim = join(workspace, '.kiro', 'hooks', 'scripts', 'unseen-gate.mjs')
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

describe('ghost gate end to end (real Chromium, installed shims, no stubs)', () => {
  test('install-hooks writes the shims into a workspace whose path contains a space', async () => {
    await copyFile(DEMO_PAGE, join(workspace, 'checkout.html'))
    const result = await runNode(SERVER_JS, ['install-hooks', workspace])
    expect(result.code).toBe(0)
    expect(existsSync(gateShim)).toBe(true)
  })

  test('a haunted page blocks: exit 1 and the Nameless Spirit on stderr', async () => {
    await touch(join(workspace, 'checkout.html'))
    const result = await runNode(gateShim, [], { stdin: STOP(workspace), cwd: workspace, timeoutMs: 170000 })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Nameless Spirit')
    expect(result.stderr).toContain('Wraith')
    expect(result.stderr).toContain('<button class="checkout"')
    expect(result.stderr.length).toBeLessThan(3000)
    expect(result.stderr).toContain('report the before score')
    expect(result.stdout).toBe('')
  })

  test('after the fix the gate passes: exit 0 and the before and after scores are printed', async () => {
    const file = join(workspace, 'checkout.html')
    const html = await readFile(file, 'utf8')
    await writeFile(file, html.replace('<button class="checkout" type="button">', '<button class="checkout" type="button" aria-label="Checkout">'))
    await touch(file)
    const result = await runNode(gateShim, [], { stdin: STOP(workspace), cwd: workspace, timeoutMs: 170000 })
    expect(result.code).toBe(0)
    const match = /gate passed \(score (\d+), before (\d+)\)/.exec(result.stdout)
    expect(match, result.stdout).not.toBeNull()
    const after = Number(match?.[1])
    const before = Number(match?.[2])
    expect(before).toBeGreaterThan(0)
    expect(after).toBeLessThan(before)
    expect(existsSync(join(workspace, '.unseen', 'turn-start.json'))).toBe(false)
  })
})
