import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ClassifiedAudit } from '@the-unseen/core'

type SampleFile = { result: ClassifiedAudit }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSampleFile(value: unknown): value is SampleFile {
  return isRecord(value) && isRecord(value.result) && isRecord(value.result.raw) && typeof value.result.score === 'number'
}

/** A real, committed ClassifiedAudit (from the generated samples) for tests that need a result object. Not shipped. */
export function loadSampleAudit(id = 'cursed-shop-index'): ClassifiedAudit {
  const parsed: unknown = JSON.parse(readFileSync(fileURLToPath(new URL(`../../../samples/${id}.json`, import.meta.url)), 'utf8'))
  if (!isSampleFile(parsed)) throw new Error(`samples/${id}.json does not hold a ClassifiedAudit`)
  return parsed.result
}
