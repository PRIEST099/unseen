import AxeBuilder from '@axe-core/playwright'
import type { Page } from 'playwright'
import type { AxeViolation, CollectionError } from '../types.js'

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const
export const AXE_TIMEOUT_MS = 30_000

const IMPACTS = ['minor', 'moderate', 'serious', 'critical'] as const
type Impact = (typeof IMPACTS)[number]

type AxeResultLike = {
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
      failureSummary: n.failureSummary ?? '',
    })),
  }
}

export type AxeRunResult = {
  violations: AxeViolation[]
  incomplete: AxeViolation[]
  error?: CollectionError
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
    return {
      violations: results.violations.map((r) => normalizeAxeResult(r as AxeResultLike)),
      incomplete: results.incomplete.map((r) => normalizeAxeResult(r as AxeResultLike)),
    }
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
