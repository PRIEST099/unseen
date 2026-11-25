import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { runNode } from './helpers/cli.js'

const STAGED_SCRIPT = fileURLToPath(new URL('./fixtures/web-self-audit.mjs', import.meta.url))
const STAGED_HOOK = fileURLToPath(new URL('./fixtures/web-self-audit-on-save.json', import.meta.url))
const REAL_SCRIPT = fileURLToPath(new URL('../../../.kiro/hooks/scripts/web-self-audit.mjs', import.meta.url))
const REAL_HOOK = fileURLToPath(new URL('../../../.kiro/hooks/web-self-audit-on-save.json', import.meta.url))
const PREFIX = 'THE UNSEEN web self-audit:'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'unseen self audit ')) // a path with a space
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function runner(body: string): Promise<string> {
  const path = join(dir, 'stub runner.mjs')
  await writeFile(path, body)
  return path
}

async function runScript(stub: string, env: Record<string, string> = {}): Promise<{ code: number | null; lines: string[]; stderr: string }> {
  const result = await runNode(STAGED_SCRIPT, [], { cwd: dir, env: { UNSEEN_WORKSPACE: dir, UNSEEN_SELF_AUDIT_RUNNER: stub, ...env }, timeoutMs: 30000 })
  return { code: result.code, lines: result.stdout.split(/\r?\n/).filter((l) => l.length > 0), stderr: result.stderr }
}

describe('web-self-audit script (stubbed runner)', () => {
  test('pass: one line with the check count, exit 0, CI=1 reaches the runner', async () => {
    const stub = await runner(`console.log(process.env.CI === '1' ? '8 passed (40s)' : 'CI missing'); process.exitCode = 0`)
    const result = await runScript(stub)
    expect(result.code).toBe(0)
    expect(result.lines).toEqual([`${PREFIX} pass (8 checks clean).`])
  })

  test('fail: one line with the failed count and the first haunting type, exit 0', async () => {
    const stub = await runner(
      `console.log('Hauntings on /:\\n- NamelessSpirit (Wraith, 4.1.2 2.4.4): x\\n    <button>\\n- TheFog (Banished, 1.4.3): y'); console.log('2 failed'); console.log('6 passed'); process.exitCode = 1`
    )
    const result = await runScript(stub)
    expect(result.code).toBe(0)
    expect(result.lines).toEqual([`${PREFIX} fail (2 failed; first haunting: NamelessSpirit).`])
  })

  test('fail without a parsable haunting still prints one line and exits 0', async () => {
    const stub = await runner(`console.error('boom'); process.exitCode = 3`)
    const result = await runScript(stub)
    expect(result.code).toBe(0)
    expect(result.lines).toEqual([`${PREFIX} fail (1 failed; see the Playwright output for details).`])
  })

  test('timeout: the runner is killed, one timeout line, exit 0', async () => {
    const stub = await runner(`setTimeout(() => {}, 60000)`)
    const result = await runScript(stub, { UNSEEN_SELF_AUDIT_TIMEOUT_MS: '1500' })
    expect(result.code).toBe(0)
    expect(result.lines).toEqual([`${PREFIX} timed out after 2 s.`])
  })

  test('debounce: a second run inside the window is skipped and does not start the runner', async () => {
    const marker = join(dir, 'ran.txt')
    const stub = await runner(`import { appendFileSync } from 'node:fs'; appendFileSync(${JSON.stringify(marker)}, 'x'); console.log('1 passed')`)
    const first = await runScript(stub)
    const second = await runScript(stub)
    expect(first.lines).toEqual([`${PREFIX} pass (1 checks clean).`])
    expect(second.lines).toEqual([`${PREFIX} skipped (ran less than 30 s ago).`])
    expect(second.code).toBe(0)
    expect(readFileSync(marker, 'utf8')).toBe('x')
  })

  test('after the debounce window the runner starts again', async () => {
    const stub = await runner(`console.log('1 passed')`)
    await runScript(stub, { UNSEEN_SELF_AUDIT_DEBOUNCE_MS: '300' })
    await new Promise((r) => setTimeout(r, 600))
    const again = await runScript(stub, { UNSEEN_SELF_AUDIT_DEBOUNCE_MS: '300' })
    expect(again.lines).toEqual([`${PREFIX} pass (1 checks clean).`])
  })
})

describe('web-self-audit hook definition (staged copy, and the real file when it exists)', () => {
  const hooks = [STAGED_HOOK, ...(existsSync(REAL_HOOK) ? [REAL_HOOK] : [])]

  test.each(hooks)('%s is a PostFileSave command hook for apps/web client files', (path) => {
    const data: unknown = JSON.parse(readFileSync(path, 'utf8'))
    expect(data).toMatchObject({
      version: 'v1',
      hooks: [{ trigger: 'PostFileSave', matcher: 'apps/web/src/client/.*\\.(tsx|ts|css)$', action: { type: 'command', command: 'node .kiro/hooks/scripts/web-self-audit.mjs' } }],
    })
    const matcher = new RegExp('apps/web/src/client/.*\\.(tsx|ts|css)$')
    expect(matcher.test('apps/web/src/client/components/AppHeader.tsx')).toBe(true)
    expect(matcher.test('apps/web/src/server/server.ts')).toBe(false)
    expect(matcher.test('apps/web/src/client/main.html')).toBe(false)
  })

  test('the real files, when present, equal the staged copies', () => {
    if (existsSync(REAL_HOOK)) expect(readFileSync(REAL_HOOK, 'utf8')).toBe(readFileSync(STAGED_HOOK, 'utf8'))
    if (existsSync(REAL_SCRIPT)) expect(readFileSync(REAL_SCRIPT, 'utf8')).toBe(readFileSync(STAGED_SCRIPT, 'utf8'))
  })
})
