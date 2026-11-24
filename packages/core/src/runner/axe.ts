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

/** backendDOMNodeId of `document.querySelector(selector)`, or null (no match, invalid selector, CDP failure). */
async function backendIdOfSelector(cdp: CDPSession, selector: string): Promise<number | null> {
  try {
    const { result, exceptionDetails } = (await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(selector)})`,
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
 * normalisation: only a target that axe reported as exactly one plain string is resolved. An
 * iframe or shadow target (several parts, or a nested array) stays null.
 */
export async function resolveAxeNodeIds(page: Page, raw: AxeResultLike[], normalised: AxeViolation[]): Promise<void> {
  const cdp = await openCdp(page)
  const cache = new Map<string, number | null>()
  try {
    for (const [ri, result] of raw.entries()) {
      for (const [ni, node] of result.nodes.entries()) {
        const only = node.target.length === 1 ? node.target[0] : undefined
        if (typeof only !== 'string') continue
        if (!cache.has(only)) cache.set(only, await backendIdOfSelector(cdp, only))
        const target = normalised[ri]?.nodes[ni]
        if (target) target.backendDOMNodeId = cache.get(only) ?? null
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
