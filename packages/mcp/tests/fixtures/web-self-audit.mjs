#!/usr/bin/env node

/**
 * web-self-audit.mjs
 *
 * PostFileSave hook for apps/web/src/client/**.(tsx|ts|css).
 * Runs apps/web/e2e/self-audit.spec.ts (the app audits its own production build) with CI=1,
 * so a fresh build is audited, and prints exactly one line. It never blocks: the exit code is always 0.
 *
 * Environment (all optional; the overrides exist for the script's own tests):
 *   UNSEEN_WORKSPACE              workspace root, default: the current directory
 *   UNSEEN_SELF_AUDIT_RUNNER      path of a node script run instead of Playwright
 *   UNSEEN_SELF_AUDIT_TIMEOUT_MS  default 170000
 *   UNSEEN_SELF_AUDIT_DEBOUNCE_MS default 30000
 */

import { spawn } from 'node:child_process'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const PREFIX = 'THE UNSEEN web self-audit:'
const MAX_OUTPUT = 400_000

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const root = resolve(process.env.UNSEEN_WORKSPACE || process.cwd())
const timeoutMs = numberFromEnv('UNSEEN_SELF_AUDIT_TIMEOUT_MS', 170_000)
const debounceMs = numberFromEnv('UNSEEN_SELF_AUDIT_DEBOUNCE_MS', 30_000)
const lockPath = join(root, '.unseen', 'web-self-audit.lock')

function recentlyStarted() {
  try {
    return Date.now() - statSync(lockPath).mtimeMs < debounceMs
  } catch {
    return false
  }
}

function touchLock() {
  mkdirSync(join(root, '.unseen'), { recursive: true })
  writeFileSync(lockPath, String(Date.now()), 'utf8')
}

function command() {
  const runner = process.env.UNSEEN_SELF_AUDIT_RUNNER
  if (runner) return { args: [runner], cwd: root }
  const webDir = join(root, 'apps', 'web')
  const cli = createRequire(join(webDir, 'package.json')).resolve('@playwright/test/cli')
  return { args: [cli, 'test', 'e2e/self-audit.spec.ts', '--reporter=line'], cwd: webDir }
}

function count(output, word) {
  const match = new RegExp(`(\\d+) ${word}`).exec(output)
  return match ? Number(match[1]) : 0
}

/** One line from the runner output and exit status. */
function summarise(output, status) {
  const failed = count(output, 'failed')
  if (status === 0 && failed === 0) return `${PREFIX} pass (${count(output, 'passed')} checks clean).`
  const first = /^\s*- (\w+) \((?:Wraith|Restless|Banished),/m.exec(output)
  const detail = first ? `first haunting: ${first[1]}` : 'see the Playwright output for details'
  return `${PREFIX} fail (${failed || 1} failed; ${detail}).`
}

function run({ args, cwd }) {
  return new Promise((resolveRun) => {
    let output = ''
    let settled = false
    let timer
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveRun(result)
    }
    const collect = (chunk) => {
      if (output.length < MAX_OUTPUT) output += chunk.toString('utf8')
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', () => finish({ output: '', status: 1, startFailed: true }))
    child.on('close', (status) => finish({ output, status: status ?? 1 }))
    timer = setTimeout(() => {
      child.kill()
      finish({ output, status: 1, timedOut: true })
    }, timeoutMs)
  })
}

async function main() {
  if (recentlyStarted()) {
    console.log(`${PREFIX} skipped (ran less than ${Math.round(debounceMs / 1000)} s ago).`)
    return
  }
  touchLock()
  const result = await run(command())
  if (result.timedOut) console.log(`${PREFIX} timed out after ${Math.round(timeoutMs / 1000)} s.`)
  else if (result.startFailed) console.log(`${PREFIX} could not start the runner; skipped.`)
  else console.log(summarise(result.output, result.status))
}

main()
  .catch(() => console.log(`${PREFIX} could not run; skipped.`))
  .finally(() => {
    process.exitCode = 0
  })
