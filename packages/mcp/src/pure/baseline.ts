import type { Haunting } from '@the-unseen/core'

export type TargetRecord = { score: number; fingerprints: string[] }
export type Baseline = { savedAtMs: number; targets: Record<string, TargetRecord> }

export const EMPTY_BASELINE: Baseline = { savedAtMs: 0, targets: {} }

type Fingerprintable = Pick<Haunting, 'type' | 'kind' | 'htmlSnippet'>

/** `type|kind|htmlSnippet`, with `#n` for the n-th identical key. Node ids are not part of it: they differ between audits. */
export function fingerprints(hauntings: readonly Fingerprintable[]): string[] {
  const seen = new Map<string, number>()
  return hauntings.map((h) => {
    const key = `${h.type}|${h.kind ?? ''}|${h.htmlSnippet}`
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    return `${key}#${n}`
  })
}

/** Current hauntings whose fingerprint is not in the baseline, in current's order. */
export function newHauntings<T extends Fingerprintable>(baseline: readonly string[], current: readonly T[]): T[] {
  const known = new Set(baseline)
  const prints = fingerprints(current)
  return current.filter((_, i) => !known.has(prints[i] ?? ''))
}

function isTargetRecord(value: unknown): value is TargetRecord {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v['score'] === 'number' && Array.isArray(v['fingerprints']) && v['fingerprints'].every((f) => typeof f === 'string')
}

/** Never throws. Anything that is not a well-formed baseline is the empty baseline. */
export function parseBaseline(text: string): Baseline {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { savedAtMs: 0, targets: {} }
  }
  if (typeof data !== 'object' || data === null) return { savedAtMs: 0, targets: {} }
  const record = data as Record<string, unknown>
  const savedAtMs = typeof record['savedAtMs'] === 'number' && Number.isFinite(record['savedAtMs']) ? record['savedAtMs'] : 0
  const rawTargets = record['targets']
  const targets: Record<string, TargetRecord> = {}
  if (typeof rawTargets === 'object' && rawTargets !== null && !Array.isArray(rawTargets)) {
    for (const [label, value] of Object.entries(rawTargets)) {
      if (isTargetRecord(value)) targets[label] = { score: value.score, fingerprints: [...value.fingerprints] }
    }
  }
  return { savedAtMs, targets }
}
