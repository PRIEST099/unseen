import { readFile } from 'node:fs/promises'
import type { ClassifiedAudit, Haunting } from '@the-unseen/core'
import { auditAndClassify, auditHtmlAndClassify } from '@the-unseen/core'
import { fingerprints, newHauntings } from './pure/baseline.js'
import type { Baseline } from './pure/baseline.js'
import { isCritical } from './pure/critical.js'
import { resolveDevUrl } from './pure/dev-url.js'
import { EMPTY_GATE_STATE, decideGate, isSessionChanged } from './pure/gate.js'
import { gateMessage } from './pure/gate-message.js'
import { selectorFor } from './pure/selector.js'
import { DISPLAY_NAME, orderHauntings } from './pure/summary.js'
import type { ToolHaunting } from './pure/result-types.js'
import { FIRST_RUN_WINDOW_MS, findDirtyFiles } from './dirty.js'
import type { DirtyFile } from './dirty.js'
import * as ws from './workspace.js'

export const ON_SAVE_DEADLINE_MS = 75_000
export const GATE_DEADLINE_MS = 130_000
export const MAX_HTML_TARGETS = 5
const REACHABLE_TIMEOUT_MS = 3_000

export type HookResult = { code: number; stdout: string; stderr: string }

/** Everything that touches the outside world, so tests can replace it. */
export type HookDeps = {
  now: () => number
  env: Readonly<Record<string, string | undefined>>
  processCwd: string
  auditUrl: (url: string) => Promise<ClassifiedAudit>
  auditHtml: (html: string) => Promise<ClassifiedAudit>
  reachable: (url: string) => Promise<boolean>
  readText: (path: string) => Promise<string>
}

export function defaultHookDeps(): HookDeps {
  return {
    now: () => Date.now(),
    env: process.env,
    processCwd: process.cwd(),
    auditUrl: (url) => auditAndClassify(url, { allowPrivate: true }),
    auditHtml: (html) => auditHtmlAndClassify(html, { allowPrivate: true }),
    reachable: probe,
    readText: (path) => readFile(path, 'utf8'),
  }
}

async function probe(url: string): Promise<boolean> {
  try {
    await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(REACHABLE_TIMEOUT_MS) })
    return true
  } catch {
    return false
  }
}

export type HookPayload = { cwd?: string; sessionId: string }

/** Stdin is `{hook_event_name, cwd, session_id}`. Anything else is tolerated and ignored. */
export function parsePayload(text: string): HookPayload {
  try {
    const data: unknown = JSON.parse(text)
    if (typeof data !== 'object' || data === null) return { sessionId: '' }
    const r = data as Record<string, unknown>
    const payload: HookPayload = { sessionId: typeof r['session_id'] === 'string' ? r['session_id'] : '' }
    if (typeof r['cwd'] === 'string') payload.cwd = r['cwd']
    return payload
  } catch {
    return { sessionId: '' }
  }
}

export type AuditedTarget = { label: string; classified: ClassifiedAudit }

async function auditDirty(root: string, dirty: readonly DirtyFile[], deps: HookDeps): Promise<AuditedTarget[]> {
  const config = await ws.readConfig(root)
  const dev = resolveDevUrl(deps.env, config)
  if (dev.source !== 'default' && dirty.length > 0 && (await deps.reachable(dev.url))) {
    return [{ label: dev.url, classified: await deps.auditUrl(dev.url) }]
  }
  const targets: AuditedTarget[] = []
  for (const file of dirty.filter((f) => f.rel.toLowerCase().endsWith('.html')).slice(0, MAX_HTML_TARGETS)) {
    targets.push({ label: file.rel, classified: await deps.auditHtml(await deps.readText(file.path)) })
  }
  return targets
}

function toBaseline(targets: readonly AuditedTarget[], savedAtMs: number): Baseline {
  const out: Baseline = { savedAtMs, targets: {} }
  for (const t of targets) out.targets[t.label] = { score: t.classified.score, fingerprints: fingerprints(t.classified.hauntings) }
  return out
}

function maxScore(b: Pick<Baseline, 'targets'>): number {
  return Object.values(b.targets).reduce((m, t) => Math.max(m, t.score), 0)
}

function toolHaunting(h: Haunting, classified: ClassifiedAudit): ToolHaunting {
  return {
    id: h.id,
    type: h.type,
    severity: h.severity,
    wcag: h.wcag.map((c) => ({ id: c.id, url: c.url })),
    selector: selectorFor(h, classified.raw),
    htmlSnippet: h.htmlSnippet,
    fix: h.fix,
  }
}

function describe(h: ToolHaunting): string {
  return `${DISPLAY_NAME[h.type]} (${h.severity}) on ${h.selector}`
}

/** The cutoff for "dirty": the last gate pass, or the first-run window when there is none. */
async function dirtyThreshold(root: string, deps: HookDeps): Promise<{ since: number; state: Awaited<ReturnType<typeof ws.readGateState>> }> {
  const state = await ws.readGateState(root)
  const since = state !== null && state.lastPassMs > 0 ? state.lastPassMs : deps.now() - FIRST_RUN_WINDOW_MS
  return { since, state }
}

export async function runOnSave(stdinText: string, deps: HookDeps): Promise<HookResult> {
  const payload = parsePayload(stdinText)
  const root = ws.resolveWorkspaceRoot(payload.cwd, deps.env, deps.processCwd)
  const { since } = await dirtyThreshold(root, deps)
  const dirty = await findDirtyFiles(root, since)
  const targets = await auditDirty(root, dirty, deps)
  if (targets.length === 0) return { code: 0, stdout: 'THE UNSEEN: nothing to audit; skipped.\n', stderr: '' }
  const last = await ws.readBaselineFile(root, 'last-audit.json')
  const fresh: ToolHaunting[] = []
  for (const t of targets) {
    const known = last?.targets[t.label]?.fingerprints ?? []
    fresh.push(...newHauntings(known, t.classified.hauntings).map((h) => toolHaunting(h, t.classified)))
  }
  const current = toBaseline(targets, deps.now())
  if ((await ws.readBaselineFile(root, 'turn-start.json')) === null) await ws.writeBaselineFile(root, 'turn-start.json', current)
  await ws.writeBaselineFile(root, 'last-audit.json', current)
  const score = maxScore(current)
  if (fresh.length === 0) return { code: 0, stdout: `THE UNSEEN: no new hauntings (score ${score}).\n`, stderr: '' }
  const shown = orderHauntings(fresh).slice(0, 5).map(describe).join('; ')
  const more = fresh.length > 5 ? `; +${fresh.length - 5} more` : ''
  return { code: 0, stdout: `THE UNSEEN: ${fresh.length} new haunting${fresh.length === 1 ? '' : 's'}: ${shown}${more} (score ${score}).\n`, stderr: '' }
}

export async function runGate(stdinText: string, deps: HookDeps): Promise<HookResult> {
  const payload = parsePayload(stdinText)
  const root = ws.resolveWorkspaceRoot(payload.cwd, deps.env, deps.processCwd)
  const { since, state: stored } = await dirtyThreshold(root, deps)
  const state = stored ?? { ...EMPTY_GATE_STATE }
  const dirty = await findDirtyFiles(root, since)
  if (dirty.length === 0) return { code: 0, stdout: '', stderr: '' }
  const targets = await auditDirty(root, dirty, deps)
  const nowMs = deps.now()
  const critical = targets.flatMap((t) => t.classified.hauntings.filter(isCritical).map((h) => toolHaunting(h, t.classified)))
  const sessionChanged = isSessionChanged(state, payload.sessionId, nowMs)
  const action = decideGate({
    anyDirty: dirty.length > 0,
    auditable: targets.length > 0,
    criticalCount: critical.length,
    consecutiveBlocks: state.consecutiveBlocks,
    sessionChanged,
  })
  return applyGate(action, { root, payload, state, sessionChanged, targets, critical, nowMs })
}

type GateContext = {
  root: string
  payload: HookPayload
  state: NonNullable<Awaited<ReturnType<typeof ws.readGateState>>>
  sessionChanged: boolean
  targets: readonly AuditedTarget[]
  critical: readonly ToolHaunting[]
  nowMs: number
}

async function applyGate(action: ReturnType<typeof decideGate>, c: GateContext): Promise<HookResult> {
  const current = toBaseline(c.targets, c.nowMs)
  const score = maxScore(current)
  if (action === 'skip') {
    return { code: 0, stdout: 'THE UNSEEN: changed files found but nothing to audit here; skipped.\n', stderr: '' }
  }
  const blocks = c.sessionChanged ? 0 : c.state.consecutiveBlocks
  const sessionId = c.payload.sessionId !== '' ? c.payload.sessionId : c.state.sessionId
  if (action === 'gave-up') {
    return { code: 0, stdout: `THE UNSEEN: gate gave up after ${blocks} blocks; ${c.critical.length} critical haunting(s) remain (score ${score}).\n`, stderr: '' }
  }
  if (action === 'pass') {
    const before = (await ws.readBaselineFile(c.root, 'turn-start.json')) ?? current
    await ws.removeUnseenFile(c.root, 'turn-start.json')
    await ws.writeBaselineFile(c.root, 'last-audit.json', current)
    await ws.writeGateState(c.root, { sessionId, consecutiveBlocks: 0, lastBlockMs: 0, lastPassMs: c.nowMs })
    return { code: 0, stdout: `THE UNSEEN: gate passed (score ${score}, before ${maxScore(before)}).\n`, stderr: '' }
  }
  let turnStart = await ws.readBaselineFile(c.root, 'turn-start.json')
  if (turnStart === null) {
    turnStart = current
    await ws.writeBaselineFile(c.root, 'turn-start.json', current)
  }
  await ws.writeBaselineFile(c.root, 'last-audit.json', current)
  await ws.writeGateState(c.root, { sessionId, consecutiveBlocks: blocks + 1, lastBlockMs: c.nowMs, lastPassMs: c.state.lastPassMs })
  const label = c.targets.map((t) => t.label).join(', ')
  return { code: 1, stdout: '', stderr: `${gateMessage(label, score, maxScore(turnStart), orderHauntings(c.critical), c.critical.length)}\n` }
}

/** Races a hook against its internal deadline. On expiry the hook prints one line and exits 0. */
export async function withDeadline(work: Promise<HookResult>, ms: number, name: string): Promise<HookResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<HookResult>((resolve) => {
    timer = setTimeout(() => resolve({ code: 0, stdout: `THE UNSEEN: ${name} timed out after ${Math.round(ms / 1000)} s; skipped.\n`, stderr: '' }), ms)
  })
  try {
    return await Promise.race([work, expired])
  } finally {
    clearTimeout(timer)
  }
}
