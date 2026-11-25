import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { ClassifiedAudit } from '@the-unseen/core'
import { MAX_GATE_MESSAGE_CHARS } from '../src/pure/gate-message.js'
import { QUIET_GAP_MS } from '../src/pure/gate.js'
import { defaultHookDeps, runGate, runOnSave, withDeadline } from '../src/hooks-cli.js'
import type { HookDeps } from '../src/hooks-cli.js'
import { classifiedFrom } from './arbitraries/classified-audit.js'
import { makeHaunting } from './arbitraries/haunting.js'

const HAUNTED = '<html lang="en"><body><button class="checkout"><svg></svg></button></body></html>'
const FIXED = '<html lang="en"><body><button class="checkout" aria-label="Checkout"><svg></svg></button></body></html>'

let root: string
let clock: number
let calls: { url: string[]; html: string[] }
let reachable: boolean

/** A fake audit: any html with an aria-label is clean (score 0), any other html has one Wraith Nameless Spirit (score 15). */
function auditFake(html: string): ClassifiedAudit {
  return html.includes('aria-label') ? classifiedFrom([], 0) : classifiedFrom([makeHaunting()], 15)
}

function deps(env: Record<string, string | undefined> = {}): HookDeps {
  return {
    ...defaultHookDeps(),
    now: () => clock,
    env,
    processCwd: tmpdir(),
    auditUrl: (url) => {
      calls.url.push(url)
      return Promise.resolve(classifiedFrom([makeHaunting()], 15, url))
    },
    auditHtml: (html) => {
      calls.html.push(html)
      return Promise.resolve(auditFake(html))
    },
    reachable: () => Promise.resolve(reachable),
  }
}

const payload = (session = 's1'): string => JSON.stringify({ hook_event_name: 'Stop', cwd: root, session_id: session })

async function touch(file: string, text?: string): Promise<void> {
  if (text !== undefined) await writeFile(join(root, file), text, 'utf8')
  clock += 1000
  const when = new Date(clock)
  await utimes(join(root, file), when, when)
}

async function readJson(name: string): Promise<Record<string, unknown>> {
  const data: unknown = JSON.parse(await readFile(join(root, '.unseen', name), 'utf8'))
  if (typeof data !== 'object' || data === null) throw new Error('not an object')
  return Object.fromEntries(Object.entries(data))
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'unseen hooks '))
  clock = Date.now()
  calls = { url: [], html: [] }
  reachable = false
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('gate', () => {
  test('nothing changed: silent exit 0 and no audit', async () => {
    await writeFile(join(root, 'a.html'), HAUNTED)
    await utimes(join(root, 'a.html'), new Date(clock - 3 * 3600_000), new Date(clock - 3 * 3600_000))
    const result = await runGate(payload(), deps())
    expect(result).toEqual({ code: 0, stdout: '', stderr: '' })
    expect(calls.html).toHaveLength(0)
    expect(existsSync(join(root, '.unseen'))).toBe(false)
  })

  test('only a css file changed and no dev URL: one line, exit 0', async () => {
    await touch('a.css', 'body{}')
    const result = await runGate(payload(), deps())
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('nothing to audit')
  })

  test('a haunted page blocks with exit 1 and the instruction on stderr', async () => {
    await touch('checkout.html', HAUNTED)
    const result = await runGate(payload(), deps())
    expect(result.code).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('Nameless Spirit (Wraith)')
    expect(result.stderr).toContain('button.checkout')
    expect(result.stderr.trim().endsWith('report the before score 15 and the new score before finishing.')).toBe(true)
    expect(result.stderr.length).toBeLessThan(MAX_GATE_MESSAGE_CHARS)
  })

  test('fix, save, gate again: exit 0 and the before score comes from turn-start.json', async () => {
    await touch('checkout.html', HAUNTED)
    expect((await runOnSave(payload(), deps())).stdout).toContain('1 new haunting: Nameless Spirit (Wraith) on button.checkout')
    expect(existsSync(join(root, '.unseen', 'turn-start.json'))).toBe(true)
    await touch('checkout.html', FIXED)
    expect((await runOnSave(payload(), deps())).stdout).toContain('no new hauntings (score 0)')
    const result = await runGate(payload(), deps())
    expect(result).toEqual({ code: 0, stdout: 'THE UNSEEN: gate passed (score 0, before 15).\n', stderr: '' })
    expect(existsSync(join(root, '.unseen', 'turn-start.json'))).toBe(false)
    expect((await readJson('gate-state.json'))['lastPassMs']).toBe(clock)
  })

  test('without on-save the gate records the turn start itself before it blocks', async () => {
    await touch('checkout.html', HAUNTED)
    await runGate(payload(), deps())
    expect(existsSync(join(root, '.unseen', 'turn-start.json'))).toBe(true)
    await touch('checkout.html', FIXED)
    expect((await runGate(payload(), deps())).stdout).toContain('before 15')
  })

  test('after a pass the same unchanged file is no longer dirty', async () => {
    await touch('checkout.html', FIXED)
    expect((await runGate(payload(), deps())).stdout).toContain('gate passed')
    calls.html.length = 0
    expect(await runGate(payload(), deps())).toEqual({ code: 0, stdout: '', stderr: '' })
    expect(calls.html).toHaveLength(0)
  })

  test('the sixth consecutive block gives up', async () => {
    await touch('checkout.html', HAUNTED)
    for (let i = 0; i < 5; i++) expect((await runGate(payload(), deps())).code).toBe(1)
    const sixth = await runGate(payload(), deps())
    expect(sixth.code).toBe(0)
    expect(sixth.stdout).toContain('gave up')
  })

  test('a new session id resets the block counter', async () => {
    await touch('checkout.html', HAUNTED)
    for (let i = 0; i < 5; i++) await runGate(payload('s1'), deps())
    expect((await runGate(payload('s2'), deps())).code).toBe(1)
  })

  test('a quiet gap longer than 10 minutes resets the block counter', async () => {
    await touch('checkout.html', HAUNTED)
    for (let i = 0; i < 5; i++) await runGate(payload(), deps())
    clock += QUIET_GAP_MS + 1
    expect((await runGate(payload(), deps())).code).toBe(1)
  })

  test('a reachable configured dev URL is audited instead of the html files', async () => {
    reachable = true
    await touch('checkout.html', HAUNTED)
    const result = await runGate(payload(), deps({ UNSEEN_DEV_URL: 'http://localhost:4000/checkout.html' }))
    expect(result.code).toBe(1)
    expect(calls.url).toEqual(['http://localhost:4000/checkout.html'])
    expect(calls.html).toHaveLength(0)
  })

  test('an unreachable dev URL falls back to the changed html files', async () => {
    await touch('checkout.html', HAUNTED)
    await runGate(payload(), deps({ UNSEEN_DEV_URL: 'http://localhost:4000/' }))
    expect(calls.url).toHaveLength(0)
    expect(calls.html).toHaveLength(1)
  })

  test('the default dev URL is never probed or audited', async () => {
    reachable = true
    await touch('checkout.html', HAUNTED)
    await runGate(payload(), deps())
    expect(calls.url).toHaveLength(0)
  })

  test('.unseen is written under the hook cwd, not the process cwd', async () => {
    await touch('checkout.html', HAUNTED)
    await runGate(payload(), deps())
    expect(existsSync(join(root, '.unseen', 'gate-state.json'))).toBe(true)
    expect(existsSync(join(tmpdir(), '.unseen'))).toBe(false)
  })

  test('files under node_modules and .git are ignored', async () => {
    await mkdir(join(root, 'node_modules', 'x'), { recursive: true })
    await touch('node_modules/x/index.html', HAUNTED)
    expect((await runGate(payload(), deps())).code).toBe(0)
    expect(calls.html).toHaveLength(0)
  })

  test('garbage on stdin is tolerated', async () => {
    const result = await runGate('not json', { ...deps(), processCwd: root })
    expect(result.code).toBe(0)
  })
})

describe('on-save', () => {
  test('nothing changed: one line, exit 0', async () => {
    const result = await runOnSave(payload(), deps())
    expect(result).toEqual({ code: 0, stdout: 'THE UNSEEN: nothing to audit; skipped.\n', stderr: '' })
  })

  test('a second save of the same haunted page reports no new hauntings and keeps the turn start', async () => {
    await touch('checkout.html', HAUNTED)
    await runOnSave(payload(), deps())
    const first = await readJson('turn-start.json')
    await touch('checkout.html')
    expect((await runOnSave(payload(), deps())).stdout).toContain('no new hauntings (score 15)')
    expect(await readJson('turn-start.json')).toEqual(first)
  })
})

describe('deadline', () => {
  test('a hook that outlives its deadline prints one line and exits 0', async () => {
    const slow = new Promise<{ code: number; stdout: string; stderr: string }>(() => undefined)
    const result = await withDeadline(slow, 20, 'gate')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('timed out')
  })
})
