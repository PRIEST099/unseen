import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/**
 * Vitest global setup: build the package before the tests run, so the package-entry test checks the
 * `dist/index.js` that consumers import and never a stale build.
 */
export default function buildPackage(): void {
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
  execFileSync(process.execPath, [tsc, '-p', '.'], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'pipe' })
}
