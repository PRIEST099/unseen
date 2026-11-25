// Smoke test for a running hosted auditor (a local container or a deployed URL):
//   node scripts/smoke.mjs http://localhost:8080 [--no-live]
// Checks, in order:
//   1. GET /api/health answers {"status":"ok"}
//   2. GET /  serves the SPA with a Content-Security-Policy header
//   3. the pre-recorded samples are served, and one carries a numeric score
//   4. POST /api/audit for http://169.254.169.254/ is refused with a 4xx SSRF_BLOCKED error that does not echo the address
//   5. a live audit of SMOKE_AUDIT_URL (default https://example.com/) finishes and returns a numeric score
//      (skipped with --no-live, for hosts without outbound internet)
// Exit code 0 when every check passes, 1 otherwise. Nothing is faked: each line is a real request.
import { pathToFileURL } from 'node:url'

const POLL_MS = 1000
const LIVE_TIMEOUT_MS = 120_000

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function getJson(baseUrl, path) {
  const response = await fetch(new URL(path, baseUrl))
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = undefined
  }
  return { response, body, text }
}

async function postAudit(baseUrl, url) {
  const response = await fetch(new URL('/api/audit', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = undefined
  }
  return { response, body, text }
}

async function checkHealth(baseUrl) {
  const { response, body } = await getJson(baseUrl, '/api/health')
  if (response.status !== 200 || !isRecord(body) || body.status !== 'ok') {
    throw new Error(`expected 200 {"status":"ok"}, got ${response.status}`)
  }
  return 'status ok'
}

async function checkSpa(baseUrl) {
  const response = await fetch(new URL('/', baseUrl))
  const html = await response.text()
  if (response.status !== 200) throw new Error(`expected 200, got ${response.status}`)
  if (!html.includes('id="root"')) throw new Error('the page has no #root element, so it is not the SPA')
  const csp = response.headers.get('content-security-policy')
  if (csp === null || !csp.includes("default-src 'self'")) throw new Error('no Content-Security-Policy header with default-src')
  return 'SPA served with a Content-Security-Policy header'
}

async function checkSamples(baseUrl) {
  const { response, body } = await getJson(baseUrl, '/api/samples')
  if (response.status !== 200 || !Array.isArray(body) || body.length === 0) throw new Error(`no samples (status ${response.status})`)
  const first = body[0]
  if (!isRecord(first) || typeof first.id !== 'string') throw new Error('the sample index has no id')
  const sample = await getJson(baseUrl, `/api/samples/${encodeURIComponent(first.id)}`)
  const score = isRecord(sample.body) && isRecord(sample.body.result) ? sample.body.result.score : undefined
  if (sample.response.status !== 200 || typeof score !== 'number') throw new Error(`sample ${first.id} has no numeric score`)
  return `${body.length} samples, ${first.id} scores ${score}`
}

async function checkSsrf(baseUrl) {
  const { response, body, text } = await postAudit(baseUrl, 'http://169.254.169.254/')
  if (response.status < 400 || response.status >= 500) throw new Error(`expected a 4xx, got ${response.status}`)
  if (!isRecord(body) || body.error !== 'SSRF_BLOCKED') throw new Error(`expected error SSRF_BLOCKED, got ${text.slice(0, 120)}`)
  if (text.includes('169.254')) throw new Error('the error body echoes the blocked address')
  return `refused with ${response.status} SSRF_BLOCKED`
}

async function checkLiveAudit(baseUrl, auditUrl) {
  const submitted = await postAudit(baseUrl, auditUrl)
  if (submitted.response.status !== 202 || !isRecord(submitted.body) || typeof submitted.body.id !== 'string') {
    throw new Error(`the audit was not accepted: ${submitted.response.status} ${submitted.text.slice(0, 120)}`)
  }
  const id = encodeURIComponent(submitted.body.id)
  const deadline = Date.now() + LIVE_TIMEOUT_MS
  while (Date.now() < deadline) {
    const { body } = await getJson(baseUrl, `/api/audit/${id}`)
    if (isRecord(body) && body.status === 'done') {
      const score = isRecord(body.result) ? body.result.score : undefined
      if (typeof score !== 'number') throw new Error('the audit finished without a numeric score')
      return `audit finished, score ${score}`
    }
    if (isRecord(body) && body.status === 'error') throw new Error(`the audit failed: ${String(body.error)}`)
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
  throw new Error(`the audit did not finish within ${LIVE_TIMEOUT_MS / 1000} s`)
}

/** Runs every check and returns one result per check; a thrown error becomes a failed result. */
export async function runSmoke(baseUrl, { live = true, auditUrl = 'https://example.com/' } = {}) {
  const checks = [
    ['health', () => checkHealth(baseUrl)],
    ['spa and csp', () => checkSpa(baseUrl)],
    ['samples', () => checkSamples(baseUrl)],
    ['ssrf block', () => checkSsrf(baseUrl)],
    ...(live ? [['live audit', () => checkLiveAudit(baseUrl, auditUrl)]] : []),
  ]
  const results = []
  for (const [name, run] of checks) {
    try {
      results.push({ name, ok: true, detail: await run() })
    } catch (error) {
      results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) })
    }
  }
  return results
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const baseUrl = args.find((arg) => !arg.startsWith('--')) ?? process.env.SMOKE_BASE_URL ?? 'http://localhost:8080'
  const results = await runSmoke(baseUrl, { live: !args.includes('--no-live'), auditUrl: process.env.SMOKE_AUDIT_URL ?? 'https://example.com/' })
  for (const { name, ok, detail } of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`)
  const failed = results.filter((result) => !result.ok).length
  console.log(failed === 0 ? `Smoke test passed against ${baseUrl}` : `Smoke test FAILED (${failed} of ${results.length}) against ${baseUrl}`)
  process.exit(failed === 0 ? 0 : 1)
}
