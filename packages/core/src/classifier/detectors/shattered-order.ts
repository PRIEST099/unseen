import type { RawAudit } from '../../types.js'
import { generateExplanation, generateFix, generatePersona } from '../explanation.js'
import type { ShatteredOrderKind, UnclassifiedHaunting } from '../types.js'
import { WCAG_BY_TYPE } from '../wcag.js'
import { findBox, hauntingId, snippet } from '../util.js'

type Target = { id: number; kind: ShatteredOrderKind; fromLevel?: number; toLevel?: number }

function build(raw: RawAudit, t: Target): UnclassifiedHaunting {
  return {
    id: hauntingId('ShatteredOrder', t.id, t.kind),
    type: 'ShatteredOrder',
    kind: t.kind,
    wcag: [...WCAG_BY_TYPE.ShatteredOrder],
    nodeIds: [t.id],
    box: findBox(raw.boundingBoxes, t.id),
    speech: undefined,
    htmlSnippet: snippet(raw, t.id),
    explanation: generateExplanation('ShatteredOrder', t),
    persona: generatePersona('ShatteredOrder'),
    fix: generateFix('ShatteredOrder', t),
  }
}

/** The body node id: pageMetadata first, then the domAxMapping row for `body`. Null when neither has it. */
function bodyId(raw: RawAudit): number | null {
  return raw.pageMetadata.bodyBackendDOMNodeId ?? raw.domAxMapping.find((m) => m.tagName.toLowerCase() === 'body')?.backendDOMNodeId ?? null
}

const levelOf = (tagName: string): number => parseInt(tagName.slice(1), 10)

/** Detector 9: no h1, a skipped heading level, or no main landmark. Each is its own instance. */
export function detectShatteredOrder(raw: RawAudit): UnclassifiedHaunting[] {
  const { headings, hasMainLandmark } = raw.pageMetadata
  const body = bodyId(raw)
  const targets: Target[] = []
  if (body !== null && !headings.some((h) => h.tagName === 'h1')) targets.push({ id: body, kind: 'no-h1' })
  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1]
    const cur = headings[i]
    if (!prev || !cur || cur.backendDOMNodeId <= 0) continue
    const [from, to] = [levelOf(prev.tagName), levelOf(cur.tagName)]
    if (to - from > 1) targets.push({ id: cur.backendDOMNodeId, kind: 'heading-skip', fromLevel: from, toLevel: to })
  }
  if (body !== null && !hasMainLandmark) targets.push({ id: body, kind: 'no-main' })
  return targets.map((t) => build(raw, t))
}
