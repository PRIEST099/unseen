import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { GATE_SHIM, ON_SAVE_SHIM, installHooks } from '../src/install-hooks.js'
import { runNode } from './helpers/cli.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'unseen install ')) // a path with a space, like this repository
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

type Hook = { name: string; trigger: string; matcher?: string; enabled?: boolean; action: { type: string; command?: string; timeout?: number; prompt?: string } }

async function hooks(): Promise<Hook[]> {
  const data: unknown = JSON.parse(await readFile(join(dir, '.kiro', 'hooks', 'unseen-hooks.json'), 'utf8'))
  if (typeof data !== 'object' || data === null || !('hooks' in data) || !Array.isArray(data.hooks)) throw new Error('bad hooks file')
  expect(data).toHaveProperty('version', 'v1')
  return data.hooks
}

describe('install-hooks', () => {
  test('writes the three files', async () => {
    const result = await installHooks(dir, join(dir, 'server.js'))
    expect(result.files).toHaveLength(3)
    for (const f of ['.kiro/hooks/unseen-hooks.json', `.kiro/hooks/scripts/${ON_SAVE_SHIM}`, `.kiro/hooks/scripts/${GATE_SHIM}`]) {
      expect(existsSync(join(dir, f)), f).toBe(true)
    }
  })

  test('hook entries: on-save (90 s), gate (150 s) and a disabled agent fallback', async () => {
    await installHooks(dir, join(dir, 'server.js'))
    const list = await hooks()
    const onSave = list.find((h) => h.trigger === 'PostFileSave')
    expect(onSave?.matcher).toBe('.*\\.(html|tsx|jsx|vue|svelte|css)$')
    expect(onSave?.action).toMatchObject({ type: 'command', timeout: 90 })
    const stops = list.filter((h) => h.trigger === 'Stop')
    expect(stops).toHaveLength(2)
    expect(stops.find((h) => h.action.type === 'command')?.action.timeout).toBe(150)
    const fallback = stops.find((h) => h.action.type === 'agent')
    expect(fallback?.enabled).toBe(false)
    expect(fallback?.action.prompt).toContain('unseen-gate.mjs')
  })

  test('every command path in the hook file exists after install', async () => {
    await installHooks(dir, join(dir, 'server.js'))
    for (const h of await hooks()) {
      if (h.action.type !== 'command') continue
      const script = /^node (\S+)$/.exec(h.action.command ?? '')?.[1]
      expect(script, h.name).toBeDefined()
      expect(existsSync(join(dir, script ?? 'missing')), script).toBe(true)
    }
  })

  test('the shims bake in the absolute node and server paths', async () => {
    await installHooks(dir, join(dir, 'my server.js'))
    const text = await readFile(join(dir, '.kiro', 'hooks', 'scripts', GATE_SHIM), 'utf8')
    expect(text).toContain(JSON.stringify(process.execPath))
    expect(text).toContain(JSON.stringify(join(dir, 'my server.js')))
    expect(text).toContain('"gate"')
  })
})

describe('shims forward the exit code, stdout, stderr and stdin (workspace path contains a space)', () => {
  async function stub(exitCode: number): Promise<string> {
    const path = join(dir, 'stub server.js')
    await writeFile(
      path,
      `let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{ console.log('sub=' + process.argv[2] + ' stdin=' + s); console.error('err-line'); process.exitCode = ${exitCode} })`
    )
    return path
  }

  test.each([0, 1, 3])('exit code %i is forwarded', async (code) => {
    await installHooks(dir, await stub(code))
    const result = await runNode(join(dir, '.kiro', 'hooks', 'scripts', GATE_SHIM), [], { stdin: '{"session_id":"x"}', cwd: dir, timeoutMs: 20000 })
    expect(result.code).toBe(code)
    expect(result.stdout).toContain('sub=gate stdin={"session_id":"x"}')
    expect(result.stderr).toContain('err-line')
  })

  test('the on-save shim runs the on-save sub-command', async () => {
    await installHooks(dir, await stub(0))
    const result = await runNode(join(dir, '.kiro', 'hooks', 'scripts', ON_SAVE_SHIM), [], { cwd: dir, timeoutMs: 20000 })
    expect(result.stdout).toContain('sub=on-save')
  })

  test('UNSEEN_MCP_SERVER_JS overrides the baked path', async () => {
    await installHooks(dir, join(dir, 'does-not-exist.js'))
    const result = await runNode(join(dir, '.kiro', 'hooks', 'scripts', GATE_SHIM), [], { cwd: dir, env: { UNSEEN_MCP_SERVER_JS: await stub(1) }, timeoutMs: 20000 })
    expect(result.code).toBe(1)
  })

  test('a node binary that cannot start prints one line and exits 0', async () => {
    await installHooks(dir, await stub(1), join(dir, 'no-such-node.exe'))
    const result = await runNode(join(dir, '.kiro', 'hooks', 'scripts', GATE_SHIM), [], { cwd: dir, timeoutMs: 20000 })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('could not start the auditor')
  })
})
