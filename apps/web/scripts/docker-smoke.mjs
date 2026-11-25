// Runs the built image and the smoke test against it, then removes the container:
//   npm run docker:build -w @the-unseen/web ; npm run docker:smoke -w @the-unseen/web
// Env: UNSEEN_IMAGE (default unseen-web), SMOKE_HOST_PORT (default 8080), SMOKE_NO_LIVE=1 to skip the live audit.
// The container gets no private-network access from this script; it only publishes one port on localhost.
import { execFileSync, spawnSync } from 'node:child_process'
import { runSmoke } from './smoke.mjs'

const image = process.env.UNSEEN_IMAGE ?? 'unseen-web'
const hostPort = process.env.SMOKE_HOST_PORT ?? '8080'
const name = 'unseen-smoke'
const baseUrl = `http://localhost:${hostPort}`

function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8' })
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) return true
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return false
}

spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' })
let failed = true
try {
  // --ipc=host is what the Playwright image documents for Chromium, which otherwise runs out of shared memory.
  docker(['run', '-d', '--name', name, '-p', `${hostPort}:8080`, '--ipc=host', image])
  if (!(await waitForHealth())) {
    console.error('FAIL  the container did not become healthy within 60 s')
  } else {
    const results = await runSmoke(baseUrl, { live: process.env.SMOKE_NO_LIVE !== '1', auditUrl: process.env.SMOKE_AUDIT_URL ?? 'https://example.com/' })
    for (const { name: check, ok, detail } of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${check}: ${detail}`)
    failed = results.some((result) => !result.ok)
    console.log(failed ? `Smoke test FAILED against image ${image}` : `Smoke test passed against image ${image}`)
  }
  if (failed) console.error(docker(['logs', '--tail', '60', name]))
} finally {
  spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' })
}
process.exit(failed ? 1 : 0)
