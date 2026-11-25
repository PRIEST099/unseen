import { getPool } from '@the-unseen/core'
import { GATE_DEADLINE_MS, ON_SAVE_DEADLINE_MS, defaultHookDeps, runGate, runOnSave, withDeadline } from './hooks-cli.js'
import type { HookResult } from './hooks-cli.js'
import { installHooks } from './install-hooks.js'
import { toToolError } from './pure/errors.js'
import { Session } from './session.js'
import { auditUrlTool } from './tools/audit-url.js'

export const USAGE = [
  'Usage:',
  '  unseen-mcp                      start the MCP server on stdio',
  '  unseen-mcp audit <url> [--json] audit one URL and print the result',
  '  unseen-mcp on-save              hook: audit changed UI files (reads hook JSON on stdin)',
  '  unseen-mcp gate                 hook: block the end of a turn while critical hauntings remain',
  '  unseen-mcp install-hooks [dir]  write the hook files into dir/.kiro/hooks (default: current directory)',
].join('\n')

export type CliIo = { stdout: (text: string) => void; stderr: (text: string) => void; readStdin: () => Promise<string> }

async function auditCommand(args: readonly string[], io: CliIo): Promise<number> {
  const url = args.find((a) => !a.startsWith('--'))
  if (url === undefined) {
    io.stderr(`INVALID_INPUT: missing URL\n${USAGE}\n`)
    return 1
  }
  try {
    const result = await auditUrlTool({ url }, new Session())
    io.stdout(args.includes('--json') ? `${JSON.stringify(result, null, 2)}\n` : `${result.summary}\n`)
    return 0
  } catch (error: unknown) {
    io.stderr(`${toToolError(error).code}\n`)
    return 1
  }
}

/** A hook never fails because the auditor broke: it prints one line and exits 0. */
async function hookCommand(kind: 'on-save' | 'gate', io: CliIo): Promise<number> {
  const deps = defaultHookDeps()
  const stdin = await io.readStdin()
  let result: HookResult
  try {
    const work = kind === 'gate' ? runGate(stdin, deps) : runOnSave(stdin, deps)
    result = await withDeadline(work, kind === 'gate' ? GATE_DEADLINE_MS : ON_SAVE_DEADLINE_MS, kind)
  } catch (error: unknown) {
    io.stderr(`unseen-mcp ${kind}: ${error instanceof Error ? error.message : String(error)}\n`)
    result = { code: 0, stdout: `THE UNSEEN: ${kind} could not audit (${toToolError(error).code}); skipped.\n`, stderr: '' }
  }
  if (result.stdout !== '') io.stdout(result.stdout)
  if (result.stderr !== '') io.stderr(result.stderr)
  return result.code
}

async function installCommand(args: readonly string[], io: CliIo): Promise<number> {
  const dir = args.find((a) => !a.startsWith('--')) ?? process.cwd()
  try {
    const result = await installHooks(dir)
    io.stdout(`THE UNSEEN hooks written to ${result.dir}:\n${result.files.map((f) => `  ${f}`).join('\n')}\n`)
    return 0
  } catch (error: unknown) {
    io.stderr(`install-hooks failed: ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}

export const CLI_COMMANDS: ReadonlySet<string> = new Set(['audit', 'on-save', 'gate', 'install-hooks', '--help', '-h', 'help'])

/** Runs one sub-command and always closes the browser pool, so the process can exit. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const [command, ...rest] = argv
  try {
    switch (command) {
      case 'audit':
        return await auditCommand(rest, io)
      case 'on-save':
      case 'gate':
        return await hookCommand(command, io)
      case 'install-hooks':
        return await installCommand(rest, io)
      default:
        io.stdout(`${USAGE}\n`)
        return command === undefined || command === 'help' || command === '--help' || command === '-h' ? 0 : 1
    }
  } finally {
    await getPool().close()
  }
}
