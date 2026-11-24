import type { RawAudit } from '../types.js'
import type { Haunting, HauntingSeverity, HauntingType, UnclassifiedHaunting } from './types.js'
import { axByBackendId, axName, axRole, domAncestors } from './util.js'

/** Blocking-type table: only these types can make a core task impossible for AT users. */
export const BLOCKING_TYPES: ReadonlySet<HauntingType> = new Set(['CursedLoop', 'NamelessSpirit', 'WhisperingField', 'LostSoul'])

export const CORE_TASK_KEYWORDS: readonly string[] = [
  'submit',
  'checkout',
  'buy',
  'pay',
  'login',
  'sign in',
  'sign up',
  'search',
  'continue',
  'cart',
  'add to',
  'basket',
  'register',
  'subscribe',
]

const NAMELESS_BLOCKING_ROLES = new Set(['button', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab'])

export type PrimaryHaunting = UnclassifiedHaunting & { isPrimary: true; secondary: UnclassifiedHaunting[] }

const hasKeyword = (text: string): boolean => {
  const lower = text.toLowerCase()
  return CORE_TASK_KEYWORDS.some((k) => lower.includes(k))
}

const mentionsCheckoutOrCart = (text: string | undefined): boolean => /checkout|cart/i.test(text ?? '')

/** The element or an ancestor is a form, a dialog, or has a checkout/cart id or class. */
function onCriticalPath(raw: RawAudit, id: number): boolean {
  return [id, ...domAncestors(raw, id)].some((i) => {
    const node = raw.domNodes[String(i)]
    if (!node) return false
    const role = node.attrs.role
    if (node.tag === 'form' && i !== id) return true
    if (node.tag === 'dialog' || role === 'dialog' || role === 'alertdialog') return true
    return mentionsCheckoutOrCart(node.attrs.id) || mentionsCheckoutOrCart(node.attrs.class)
  })
}

/** Text that says what a button or link is for: its name, or (when unnamed) its id, class, aria-label and snippet. */
function purposeText(raw: RawAudit, id: number, name: string): string {
  if (name !== '') return name
  const node = raw.domNodes[String(id)]
  return [node?.attrs.id, node?.attrs.class, node?.attrs['aria-label'], node?.outerHTMLSnippet].filter(Boolean).join(' ')
}

/** Core task flow (hauntings.md §Severity): a form, dialog or checkout/cart region, or a button/link with a task keyword. */
export function isCoreTask(h: UnclassifiedHaunting, raw: RawAudit): boolean {
  const id = h.nodeIds[0]
  if (id === undefined) return false
  if (onCriticalPath(raw, id)) return true
  const ax = axByBackendId(raw, id)
  const role = ax === undefined ? undefined : axRole(ax)
  if (ax === undefined || (role !== 'button' && role !== 'link')) return false
  return hasKeyword(purposeText(raw, id, axName(ax)))
}

/** Can this haunting make the task impossible? (the design's blocking table) */
function canBlock(h: UnclassifiedHaunting, raw: RawAudit): boolean {
  if (!BLOCKING_TYPES.has(h.type)) return false
  if (h.type !== 'NamelessSpirit') return true
  const id = h.nodeIds[0]
  const ax = id === undefined ? undefined : axByBackendId(raw, id)
  return ax !== undefined && NAMELESS_BLOCKING_ROLES.has(axRole(ax))
}

function severityOf(h: UnclassifiedHaunting, raw: RawAudit, counts: ReadonlyMap<HauntingType, number>): HauntingSeverity {
  if (canBlock(h, raw) && isCoreTask(h, raw)) return 'Wraith'
  if ((counts.get(h.type) ?? 0) >= 3 || h.wcag[0]?.level === 'A') return 'Restless'
  return 'Banished'
}

/** Apply the severity rules (first match wins) to each primary and to its secondaries. */
export function assignSeverity(primaries: readonly PrimaryHaunting[], raw: RawAudit): Haunting[] {
  const counts = new Map<HauntingType, number>()
  for (const p of primaries) counts.set(p.type, (counts.get(p.type) ?? 0) + 1)
  return primaries.map((p) => {
    const secondary: Haunting[] = p.secondary.map((s) => ({ ...s, severity: severityOf(s, raw, counts), isPrimary: false, secondary: [] }))
    return { ...p, severity: severityOf(p, raw, counts), isPrimary: true, secondary }
  })
}
