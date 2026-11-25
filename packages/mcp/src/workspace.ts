import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { EMPTY_BASELINE, parseBaseline } from './pure/baseline.js'
import type { Baseline } from './pure/baseline.js'
import { EMPTY_GATE_STATE, parseGateState } from './pure/gate.js'
import type { GateState } from './pure/gate.js'

/** The workspace root is the hook's `cwd`, else `UNSEEN_WORKSPACE`, else the process cwd. Never the MCP server's own cwd by design. */
export function resolveWorkspaceRoot(hookCwd: string | undefined, env: Readonly<Record<string, string | undefined>>, processCwd: string): string {
  if (hookCwd !== undefined && hookCwd.trim() !== '') return resolve(hookCwd)
  const fromEnv = env['UNSEEN_WORKSPACE']
  if (fromEnv !== undefined && fromEnv.trim() !== '') return resolve(fromEnv)
  return resolve(processCwd)
}

export const UNSEEN_DIR = '.unseen'

function file(root: string, name: string): string {
  return join(root, UNSEEN_DIR, name)
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

async function writeText(path: string, text: string): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, text, 'utf8')
}

export async function readConfig(root: string): Promise<unknown> {
  const text = await readText(file(root, 'config.json'))
  if (text === null) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

export async function readBaselineFile(root: string, name: 'last-audit.json' | 'turn-start.json'): Promise<Baseline | null> {
  const text = await readText(file(root, name))
  return text === null ? null : parseBaseline(text)
}

export async function writeBaselineFile(root: string, name: 'last-audit.json' | 'turn-start.json', baseline: Baseline): Promise<void> {
  await writeText(file(root, name), `${JSON.stringify(baseline, null, 2)}\n`)
}

export async function removeUnseenFile(root: string, name: string): Promise<void> {
  await rm(file(root, name), { force: true })
}

export async function readGateState(root: string): Promise<GateState | null> {
  const text = await readText(file(root, 'gate-state.json'))
  return text === null ? null : parseGateState(text)
}

export async function writeGateState(root: string, state: GateState): Promise<void> {
  await writeText(file(root, 'gate-state.json'), `${JSON.stringify(state, null, 2)}\n`)
}

export { EMPTY_BASELINE, EMPTY_GATE_STATE }
