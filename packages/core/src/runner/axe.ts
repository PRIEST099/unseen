import AxeBuilder from '@axe-core/playwright'
import type { CDPSession, Page } from 'playwright'
import type { AxeViolation, CollectionError } from '../types.js'
import { backendIdOfObject, openCdp, releaseObject } from './cdp.js'

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const
export const AXE_TIMEOUT_MS = 30_000

const IMPACTS = ['minor', 'moderate', 'serious', 'critical'] as const
type Impact = (typeof IMPACTS)[number]

export type AxeResultLike = {
  id: string
  impact?: string | null
  tags: string[]
  description: string
  helpUrl: string
  nodes: Array<{ html: string; target: unknown[]; failureSummary?: string }>
}

export function normalizeImpact(impact: unknown): Impact | null {
  return IMPACTS.includes(impact as Impact) ? (impact as Impact) : null
}

export function normalizeAxeResult(r: AxeResultLike): AxeViolation {
  return {
    id: r.id,
    impact: normalizeImpact(r.impact),
    tags: [...r.tags],
    description: r.description,
    helpUrl: r.helpUrl,
    nodes: r.nodes.map((n) => ({
      html: n.html,
      target: n.target.map((t) => (Array.isArray(t) ? t.join(' ') : String(t))),
      backendDOMNodeId: null, // resolved by resolveAxeNodeIds in the same page session
      failureSummary: n.failureSummary ?? '',
    })),
  }
}

export type AxeRunResult = {
  violations: AxeViolation[]
  incomplete: AxeViolation[]
  error?: CollectionError
}

/** A page expression for the element at the end of an axe target: each part but the last selects an iframe to enter. */
function targetExpression(parts: readonly string[]): string {
  return `(() => {
    let doc = document
    const parts = ${JSON.stringify(parts)}
    for (let i = 0; i < parts.length - 1; i++) {
      const frame = doc.querySelector(parts[i])
      doc = frame && frame.contentDocument
      if (!doc) return null
    }
    return doc.querySelector(parts[parts.length - 1])
  })()`
}

/** The plain selector strings of an axe target, or null for a shadow-DOM target (a nested array) or an empty one. */
function plainParts(target: unknown[]): string[] | null {
  const parts = target.filter((t): t is string => typeof t === 'string')
  return parts.length > 0 && parts.length === target.length ? parts : null
}

/**
 * backendDOMNodeId of the element an axe target points at, or null (no match, invalid selector, CDP
 * failure, or a frame whose document cannot be entered because it is cross-origin).
 */
async function backendIdOfTarget(cdp: CDPSession, parts: readonly string[]): Promise<number | null> {
  try {
    const { result, exceptionDetails } = (await cdp.send('Runtime.evaluate', {
      expression: targetExpression(parts),
      returnByValue: false,
    })) as { result: { objectId?: string; subtype?: string }; exceptionDetails?: unknown }
    if (exceptionDetails || !result.objectId || result.subtype === 'null') return null
    try {
      return await backendIdOfObject(cdp, result.objectId)
    } finally {
      await releaseObject(cdp, result.objectId)
    }
  } catch {
    return null
  }
}

/**
 * Fill `backendDOMNodeId` on every node of `normalised`. `raw` is the same result list before
 * normalisation. A target that is one selector, or a chain of selectors through same-origin iframes, is
 * resolved. A shadow target (a nested array) and a cross-origin frame stay null.
 */
export async function resolveAxeNodeIds(page: Page, raw: AxeResultLike[], normalised: AxeViolation[]): Promise<void> {
  const cdp = await openCdp(page)
  const cache = new Map<string, number | null>()
  try {
    for (const [ri, result] of raw.entries()) {
      for (const [ni, node] of result.nodes.entries()) {
        const parts = plainParts(node.target)
        if (parts === null) continue
        const key = JSON.stringify(parts)
        if (!cache.has(key)) cache.set(key, await backendIdOfTarget(cdp, parts))
        const target = normalised[ri]?.nodes[ni]
        if (target) target.backendDOMNodeId = cache.get(key) ?? null
      }
    }
  } finally {
    await cdp.detach().catch(() => undefined)
  }
}

export async function runAxe(page: Page, timeoutMs = AXE_TIMEOUT_MS): Promise<AxeRunResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`axe timed out after ${timeoutMs}ms`)), timeoutMs)
    })
    const results = await Promise.race([
      new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze(),
      timeout,
    ])
    // passes and inapplicable are discarded on purpose
    const rawViolations = results.violations.map((r) => r as AxeResultLike)
    const rawIncomplete = results.incomplete.map((r) => r as AxeResultLike)
    const violations = rawViolations.map(normalizeAxeResult)
    const incomplete = rawIncomplete.map(normalizeAxeResult)
    await resolveAxeNodeIds(page, rawViolations, violations)
    await resolveAxeNodeIds(page, rawIncomplete, incomplete)
    return { violations, incomplete }
  } catch (err) {
    return {
      violations: [],
      incomplete: [],
      error: { step: 'axe', message: err instanceof Error ? err.message : String(err) },
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
