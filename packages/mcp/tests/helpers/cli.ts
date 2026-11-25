import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url))
export const SERVER_JS = fileURLToPath(new URL('../../dist/server.js', import.meta.url))

/** Builds core and mcp with the local TypeScript so the CLI under test is never stale. Argument arrays only. */
export function ensureBuilt(): void {
  const require = createRequire(import.meta.url)
  const tsc = require.resolve('typescript/bin/tsc')
  for (const project of [fileURLToPath(new URL('../../../core', import.meta.url)), PACKAGE_DIR]) {
    const result = spawnSync(process.execPath, [tsc, '-p', project], { encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`build failed for ${project}:\n${result.stdout}\n${result.stderr}`)
  }
}

export type RunResult = { code: number | null; stdout: string; stderr: string; ms: number }

/** Runs `node <script> <args>` with the given stdin and environment; resolves when the process exits. */
export function runNode(script: string, args: readonly string[], options: { stdin?: string; cwd?: string; env?: Record<string, string>; timeoutMs?: number } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const child = spawn(process.execPath, [script, ...args], {
      cwd: options.cwd,
      env: { ...process.env, UNSEEN_CHROMIUM_CHANNEL: 'chromium', ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')))
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`timed out after ${options.timeoutMs ?? 170000} ms\n${stdout}\n${stderr}`))
    }, options.timeoutMs ?? 170000)
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, ms: Date.now() - started })
    })
    child.stdin.end(options.stdin ?? '')
  })
}
