import type { Page } from 'playwright'
import type { AXNode, AXProperty, AXValue } from '../types.js'
import { AuditCollectionError } from '../types.js'

type CdpAxValue = { type: string; value?: unknown; sources?: unknown[] }
type CdpAxNode = {
  nodeId: string
  backendDOMNodeId?: number
  role?: CdpAxValue
  name?: CdpAxValue
  description?: CdpAxValue
  properties?: Array<{ name: string; value: CdpAxValue }>
  ignored: boolean
  ignoredReasons?: Array<{ name: string; value: CdpAxValue }>
  childIds?: string[]
  parentId?: string
}

const EMPTY_VALUE: AXValue = { type: 'none', value: undefined }

/** CDP reports images as `image` or `img`; treat them as the same role. */
export function isImageRole(role: string | undefined | null): boolean {
  return role === 'image' || role === 'img'
}

/** CDP `InlineTextBox` nodes are text runs with no DOM element behind them. */
export function isInlineTextBox(node: { role?: { value?: unknown } }): boolean {
  return node.role?.value === 'InlineTextBox'
}

// Keep `sources` (and every other field) verbatim: the Whispering Field rule
// needs to know when the winning name source is `placeholder`.
function toValue(v: CdpAxValue | undefined): AXValue {
  return v ? (v as AXValue) : EMPTY_VALUE
}

function toProps(list: Array<{ name: string; value: CdpAxValue }> | undefined): AXProperty[] {
  return (list ?? []).map((p) => ({ name: p.name, value: toValue(p.value) }))
}

/**
 * State-like CDP properties. CDP has no separate `states` field, so these are
 * copied into `states` while also staying in `properties` (nothing is dropped).
 */
const STATE_NAMES = new Set([
  'busy', 'disabled', 'editable', 'focusable', 'focused', 'hidden', 'hiddenRoot',
  'invalid', 'modal', 'readonly', 'required', 'selected', 'checked', 'expanded', 'pressed',
])

export function mapAxNode(n: CdpAxNode): AXNode {
  const properties = toProps(n.properties)
  return {
    nodeId: n.nodeId,
    backendDOMNodeId: n.backendDOMNodeId ?? 0,
    role: toValue(n.role),
    name: toValue(n.name),
    description: toValue(n.description),
    properties,
    states: properties.filter((p) => STATE_NAMES.has(p.name)),
    ignored: n.ignored,
    ignoredReasons: toProps(n.ignoredReasons),
    childIds: n.childIds ?? [],
    parentId: n.parentId,
  }
}

export async function collectAxTree(page: Page): Promise<AXNode[]> {
  let session
  try {
    session = await page.context().newCDPSession(page)
  } catch (err) {
    throw new AuditCollectionError('ax-tree', err)
  }
  try {
    const { nodes } = (await session.send('Accessibility.getFullAXTree')) as { nodes: CdpAxNode[] }

    const missing = nodes.filter((n) => n.backendDOMNodeId === undefined && !isInlineTextBox(n))
    if (missing.length > 0) {
      throw new AuditCollectionError(
        'ax-tree',
        new Error(`${missing.length} AX node(s) lack backendDOMNodeId (first: ${missing[0]!.nodeId})`)
      )
    }
    if (nodes.length === 0) {
      const childCount = await page.evaluate(() => document.body?.children.length ?? 0)
      if (childCount > 0) {
        throw new AuditCollectionError('ax-tree', new Error('empty AX tree for a non-empty body'))
      }
    }
    return nodes.map(mapAxNode)
  } catch (err) {
    if (err instanceof AuditCollectionError) throw err
    throw new AuditCollectionError('ax-tree', err)
  } finally {
    await session.detach().catch(() => undefined)
  }
}
