// Packs @the-unseen/core and @the-unseen/mcp and installs both tarballs globally, so `unseen-mcp` is on PATH.
// Nothing is published. Use `--prefix <dir>` to install into a throwaway prefix instead of the global one.
// Spawns use process.execPath and argument arrays only (this repository's path contains a space).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function npmCli() {
  const fromEnv = process.env.npm_execpath
  if (fromEnv && existsSync(fromEnv) && fromEnv.endsWith('.js')) return fromEnv
  const bundled = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  if (existsSync(bundled)) return bundled
  throw new Error('Cannot find npm-cli.js next to node. Run this script through `npm run unseen:install-global`.')
}

function npm(args, options = {}) {
  const result = spawnSync(process.execPath, [npmCli(), ...args], { cwd: ROOT, encoding: 'utf8', ...options })
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(' ')} failed (${result.status})\n${result.stdout ?? ''}\n${result.stderr ?? ''}`)
  }
  return result.stdout ?? ''
}

function main() {
  const prefixIndex = process.argv.indexOf('--prefix')
  const prefix = prefixIndex > -1 ? process.argv[prefixIndex + 1] : undefined
  const packDir = mkdtempSync(join(tmpdir(), 'unseen-pack-'))
  try {
    npm(['run', 'build', '-w', '@the-unseen/core'], { stdio: 'inherit', encoding: undefined })
    npm(['run', 'build', '-w', '@the-unseen/mcp'], { stdio: 'inherit', encoding: undefined })
    npm(['pack', '-w', '@the-unseen/core', '-w', '@the-unseen/mcp', '--pack-destination', packDir])
    const tarballs = readdirSync(packDir)
      .filter((f) => f.endsWith('.tgz'))
      .sort()
      .map((f) => join(packDir, f))
    if (tarballs.length !== 2) throw new Error(`expected 2 tarballs, found ${tarballs.length}`)
    console.log(`Packed: ${tarballs.join(', ')}`)
    const install = ['install', '-g', ...(prefix ? ['--prefix', prefix] : []), ...tarballs]
    npm(install, { stdio: 'inherit', encoding: undefined })
    console.log(prefix ? `Installed into ${prefix}.` : 'Installed globally. Run: unseen-mcp --help')
  } finally {
    rmSync(packDir, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
