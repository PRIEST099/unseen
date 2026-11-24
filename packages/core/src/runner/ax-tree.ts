import type { CDPSession, Page } from 'playwright'
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

const EMPTY_VALUE: AXValue = { type: 'none' }

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
    // Leave the key out when there is no parent, so a JSON round-trip is strictly equal (Req 12.3).
    ...(n.parentId !== undefined ? { parentId: n.parentId } : {}),
  }
}

type FrameTreeNode = { frame: { id: string }; childFrames?: FrameTreeNode[] }

function childFrameIds(tree: FrameTreeNode): string[] {
  return (tree.childFrames ?? []).flatMap((c) => [c.frame.id, ...childFrameIds(c)])
}

/** Node ids are only unique within one frame's tree: a frame's nodes carry its frame id as a prefix. */
function qualify(frameId: string, n: CdpAxNode): CdpAxNode {
  const q = (id: string): string => `${frameId}:${id}`
  return {
    ...n,
    nodeId: q(n.nodeId),
    ...(n.childIds !== undefined ? { childIds: n.childIds.map(q) } : {}),
    ...(n.parentId !== undefined ? { parentId: q(n.parentId) } : {}),
  }
}

/**
 * The AX trees of the main frame's same-process child frames (same-origin iframes), mapped like the
 * main tree. Their nodes keep their real backendDOMNodeIds, so detectors can match them to DOM nodes,
 * Tab steps and axe results. A frame whose tree cannot be read here is skipped. That includes
 * cross-origin frames in their own process: their ids belong to another DOM and cannot be mapped.
 */
async function collectFrameTrees(session: CDPSession, known: ReadonlySet<number>): Promise<AXNode[]> {
  const { frameTree } = (await session.send('Page.getFrameTree')) as { frameTree: FrameTreeNode }
  const out: AXNode[] = []
  const seen = new Set(known)
  for (const frameId of childFrameIds(frameTree)) {
    try {
      const { nodes } = (await session.send('Accessibility.getFullAXTree', { frameId })) as { nodes: CdpAxNode[] }
      for (const n of nodes) {
        const id = n.backendDOMNodeId ?? 0
        if (id > 0 && seen.has(id)) continue
        if (id > 0) seen.add(id)
        out.push({ ...mapAxNode(qualify(frameId, n)), frameId })
      }
    } catch {
      /* not readable from this session: skipped */
    }
  }
  return out
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

    // Chromium emits AX nodes with no DOM node behind them (list markers, ::before/::after
    // generated text, <details> internals, InlineTextBox runs). They are kept with
    // backendDOMNodeId 0, which consumers read as "no DOM node" (Req 5.2 as amended).
    if (nodes.length === 0) {
      const childCount = await page.evaluate(() => document.body?.children.length ?? 0)
      if (childCount > 0) {
        throw new AuditCollectionError('ax-tree', new Error('empty AX tree for a non-empty body'))
      }
    }
    const main = nodes.map(mapAxNode)
    const known = new Set(main.map((n) => n.backendDOMNodeId).filter((id) => id > 0))
    const frames = await collectFrameTrees(session, known).catch((): AXNode[] => [])
    return [...main, ...frames]
  } catch (err) {
    if (err instanceof AuditCollectionError) throw err
    throw new AuditCollectionError('ax-tree', err)
  } finally {
    await session.detach().catch(() => undefined)
  }
}