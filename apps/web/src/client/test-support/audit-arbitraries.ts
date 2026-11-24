import type { ClassifiedAudit, Haunting, ManualCheckNode, WCAGCriterion } from '@the-unseen/core'
import fc from 'fast-check'
import sampleJson from '../../../samples/cursed-shop-index.json'
import { isClassifiedAudit } from '../utils/audit-source'
import { arbHaunting } from './haunting-arbitraries'

const CRITERIA: readonly WCAGCriterion[] = [
  { id: '1.1.1', level: 'A', title: 'Non-text Content', url: 'https://www.w3.org/WAI/WCAG22/Understanding/non-text-content' },
  { id: '1.3.1', level: 'A', title: 'Info and Relationships', url: 'https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships' },
  { id: '1.4.3', level: 'AA', title: 'Contrast (Minimum)', url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum' },
  { id: '1.4.10', level: 'AA', title: 'Reflow', url: 'https://www.w3.org/WAI/WCAG22/Understanding/reflow' },
  { id: '2.1.1', level: 'A', title: 'Keyboard', url: 'https://www.w3.org/WAI/WCAG22/Understanding/keyboard' },
  { id: '2.4.7', level: 'AA', title: 'Focus Visible', url: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-visible' },
  { id: '4.1.2', level: 'A', title: 'Name, Role, Value', url: 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value' },
]

/** One to three distinct criteria, primary first. */
export const arbWcagList: fc.Arbitrary<WCAGCriterion[]> = fc.uniqueArray(fc.constantFrom(...CRITERIA), {
  minLength: 1,
  maxLength: 3,
  selector: (criterion) => criterion.id,
})

/** Hauntings with a WCAG list and a unique id each. */
export const arbWcagHauntings: fc.Arbitrary<Haunting[]> = fc.array(fc.tuple(arbHaunting, arbWcagList), { maxLength: 25 }).map((pairs) =>
  pairs.map(([haunting, wcag], index) => ({ ...haunting, id: `h-${index}`, wcag })),
)

const arbManualNode: fc.Arbitrary<ManualCheckNode> = fc.record({
  backendDOMNodeId: fc.integer({ min: 0, max: 500 }),
  reason: fc.constantFrom('contrast-uncertain', 'off-screen-content', 'focus-style-unavailable'),
  htmlSnippet: fc.constantFrom('<p>Hi</p>', '<span class="a`b">x</span>', '<div>\n  two lines\n</div>'),
})

function loadSampleAudit(): ClassifiedAudit {
  if (!isClassifiedAudit(sampleJson.result)) throw new Error('The committed cursed-shop-index sample is not a ClassifiedAudit')
  return sampleJson.result
}

/** The committed Cursed Shop sample: a real ClassifiedAudit as the client receives it (screenshot stripped). */
export const SAMPLE_AUDIT: ClassifiedAudit = loadSampleAudit()

/** The real sample's `raw` and coverage note around generated hauntings, manual-check nodes and score. */
export function makeAudit(hauntings: Haunting[], needsManualCheck: ManualCheckNode[] = [], score = 42): ClassifiedAudit {
  return {
    ...SAMPLE_AUDIT,
    hauntings,
    score,
    needsManualCheck,
    raw: { ...SAMPLE_AUDIT.raw, auditedUrl: 'https://shop.example.com/page', auditedAt: '2026-01-02T03:04:05.000Z' },
  }
}

export const arbAudit: fc.Arbitrary<ClassifiedAudit> = fc
  .tuple(arbWcagHauntings, fc.array(arbManualNode, { maxLength: 4 }), fc.integer({ min: 0, max: 100 }))
  .map(([hauntings, manual, score]) => makeAudit(hauntings, manual, score))
