import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const STAGED = fileURLToPath(new URL('./fixtures/guard-protected-shell.mjs', import.meta.url))
const REAL = fileURLToPath(new URL('../../../.kiro/hooks/scripts/guard-protected-shell.mjs', import.meta.url))
const HOOK_JSON = fileURLToPath(new URL('../../../.kiro/hooks/guard-protected-files.json', import.meta.url))

const targets = [STAGED, ...(existsSync(REAL) ? [REAL] : [])]

function run(script: string, stdin: string): { code: number | null; stderr: string } {
  const result = spawnSync(process.execPath, [script], { input: stdin, encoding: 'utf8' })
  return { code: result.status, stderr: result.stderr }
}

function shellPayload(command: string, tool = 'execute_pwsh'): string {
  return JSON.stringify({ hook_event_name: 'preToolUse', cwd: '/w', tool_name: tool, tool_input: { command } })
}

const BLOCKED = [
  'cp x apps/cursed-shop/expected-hauntings.json',
  'echo {} > docs/brief/x.md',
  `node -e "require('fs').writeFileSync('apps/cursed-shop/expected-hauntings.json','')"`,
  'mv x.json apps\\cursed-shop\\expected-hauntings.json',
  'rm docs/brief/PRODUCT_BRIEF.md',
  'del docs\\brief\\x.md',
  'Copy-Item a.json apps/cursed-shop/expected-hauntings.json',
  'Move-Item a docs/brief/a.md',
  'Remove-Item docs/brief -Recurse',
  'Set-Content -Path apps/cursed-shop/expected-hauntings.json -Value "{}"',
  '"{}" | Out-File apps/cursed-shop/expected-hauntings.json',
  'echo hi | tee docs/brief/x.md',
  "sed -i 's/a/b/' docs/brief/x.md",
  'echo KEY=1 >> .env',
  'echo KEY=1 >> .env.local',
  `node -e "fs.appendFileSync('.env','x')"`,
  `node -e "fs.rmSync('docs/brief',{recursive:true})"`,
  `node -e "fs.unlinkSync('apps/cursed-shop/expected-hauntings.json')"`,
  'git checkout -- apps/cursed-shop/expected-hauntings.json',
]

const ALLOWED = [
  'cat apps/cursed-shop/expected-hauntings.json',
  'type docs\\brief\\PRODUCT_BRIEF.md',
  'Get-Content apps/cursed-shop/expected-hauntings.json',
  'git diff docs/brief',
  'git diff -- apps/cursed-shop/expected-hauntings.json',
  'npm test',
  'cat .env',
  'cat docs/brief/prompts/45-deploy-and-replay.md 2>&1',
  `node -e "console.log(process.env.HOME)"`,
  `node -e "const f=require('./apps/cursed-shop/expected-hauntings.json');console.log(Object.keys(f).map(k=>k))"`,
  'echo hello > out.txt',
  'cp a.txt b.txt',
]

describe.each(targets)('guard-protected-shell (%s)', (script) => {
  test.each(BLOCKED)('blocks: %s', (command) => {
    const { code, stderr } = run(script, shellPayload(command))
    expect(code).toBe(2)
    expect(stderr).toContain('BLOCKED')
  })

  test.each(ALLOWED)('allows: %s', (command) => {
    expect(run(script, shellPayload(command)).code).toBe(0)
  })

  test('blocks the same commands through execute_bash and the toolInput spelling', () => {
    const payload = JSON.stringify({ toolInput: { command: 'cp x docs/brief/y.md' } })
    expect(run(script, payload).code).toBe(2)
  })

  test('malformed JSON that names a protected path fails closed', () => {
    expect(run(script, '{"tool_input":{"command":"cp x apps/cursed-shop/expected-hauntings.json"').code).toBe(2)
  })

  test('malformed JSON that names no protected path fails open', () => {
    expect(run(script, '{"tool_input":{"command":"npm test"').code).toBe(0)
    expect(run(script, '').code).toBe(0)
  })

  test('a payload without a command string is scanned as text', () => {
    expect(run(script, JSON.stringify({ tool_input: { args: ['rm', 'docs/brief/x'] } })).code).toBe(2)
    expect(run(script, JSON.stringify({ tool_input: {} })).code).toBe(0)
  })
})

describe('hook registration', () => {
  test('the staged and real scripts are identical', () => {
    if (!existsSync(REAL)) return
    expect(readFileSync(REAL, 'utf8')).toBe(readFileSync(STAGED, 'utf8'))
  })

  test('guard-protected-files.json watches write tools and both shell tools', () => {
    const config: unknown = JSON.parse(readFileSync(HOOK_JSON, 'utf8'))
    const text = JSON.stringify(config)
    expect(text).toContain('fs_write|str_replace|fs_append|delete_file')
    expect(text).toContain('execute_bash|execute_pwsh')
    expect(text).toContain('guard-protected-shell.mjs')
  })
})
