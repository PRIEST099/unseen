import type { CDPSession, Page } from 'playwright'
import type {
  AXNode,
  CollectionError,
  DomAxMapping,
  DomNodeInfo,
  EventListenerSignal,
  HeadingRecord,
  PageMetadata,
  TextNodeStyle,
} from '../types.js'
import { DOM_ATTR_NAMES } from '../types.js'
import { backendIdOfObject, backendIdsOfObject, callByValue, callToObject, evaluateToObject, openCdp, releaseObject } from './cdp.js'
import {
  HEADING_TAGS_FN,
  IMG_ALTS_FN,
  IMG_SRCS_FN,
  MAPPING_ROWS_FN,
  PICK_FN,
  SLICE_FN,
  TEXT_BATCH_FN,
  TEXT_ELEMENTS_EXPR,
} from './collector-scripts.js'

const BATCH_SIZE = 100
export const BATCH_TIMEOUT_MS = 10_000
const MAX_LISTENER_NODES = 5000
const POINTER_EVENTS = ['click', 'mousedown', 'pointerdown', 'pointerup'] as const
type PointerEvent = (typeof POINTER_EVENTS)[number]

export type CollectorOptions = {
  /** Each page call (enumeration or a batch of 100 nodes) gets this long. Default 10 000 ms. */
  batchTimeoutMs?: number
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<never>((_, rej) => {
      t = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)
    }),
  ])
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Number of items in a remote list. */
const lengthOf = (cdp: CDPSession, list: string): Promise<number> => callByValue<number>(cdp, list, 'function () { return this.length }')

// ---------------------------------------------------------------------------
// Task 9: text node styles (The Fog) and cursor styles (Lost Soul)
// ---------------------------------------------------------------------------

type RawTextStyle = {
  color: string
  backgroundColor: string
  fontSize: string
  fontWeight: string
  backgroundUncertain: boolean
}

type TextBatch = { idx: number[]; rows: RawTextStyle[] }

export function isLargeText(fontSize: string, fontWeight: string): boolean {
  const px = parseFloat(fontSize)
  const weight = fontWeight === 'bold' ? 700 : parseInt(fontWeight, 10)
  if (!Number.isFinite(px)) return false
  return px >= 24 || (px >= 18.66 && Number.isFinite(weight) && weight >= 700)
}

/** One batch of at most 100 text elements: styles for the visible ones, keyed by backendDOMNodeId. */
async function textBatch(cdp: CDPSession, list: string, start: number, timeoutMs: number): Promise<Record<string, TextNodeStyle>> {
  const { idx, rows } = await withTimeout(
    callByValue<TextBatch>(cdp, list, TEXT_BATCH_FN, [start, BATCH_SIZE]),
    timeoutMs,
    `text-styles batch ${start}`
  )
  const out: Record<string, TextNodeStyle> = {}
  if (idx.length === 0) return out
  const picked = await withTimeout(callToObject(cdp, list, PICK_FN, [idx]), timeoutMs, `text-styles batch ${start}`)
  try {
    const ids = await withTimeout(backendIdsOfObject(cdp, picked), timeoutMs, `text-styles batch ${start}`)
    rows.forEach((raw, i) => {
      const id = ids[i]
      if (id != null) out[String(id)] = { ...raw, isLargeText: isLargeText(raw.fontSize, raw.fontWeight) }
    })
  } finally {
    await releaseObject(cdp, picked)
  }
  return out
}

async function collectTextStyles(cdp: CDPSession, timeoutMs: number, errors: CollectionError[]): Promise<Record<string, TextNodeStyle>> {
  const out: Record<string, TextNodeStyle> = {}
  const list = await withTimeout(evaluateToObject(cdp, TEXT_ELEMENTS_EXPR), timeoutMs, 'text-styles enumeration')
  try {
    const total = await withTimeout(lengthOf(cdp, list), timeoutMs, 'text-styles enumeration')
    for (let start = 0; start < total; start += BATCH_SIZE) {
      try {
        Object.assign(out, await textBatch(cdp, list, start, timeoutMs))
      } catch (e) {
        errors.push({ step: 'text-styles', message: msg(e) })
      }
    }
  } finally {
    await releaseObject(cdp, list)
  }
  return out
}

async function collectCursorStyles(cdp: CDPSession, signals: EventListenerSignal[], errors: CollectionError[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const sig of signals) {
    try {
      const { object } = (await cdp.send('DOM.resolveNode', { backendNodeId: sig.backendDOMNodeId })) as {
        object: { objectId: string }
      }
      const cursor = await callByValue<string | null>(
        cdp,
        object.objectId,
        'function(){ return this.nodeType === 1 ? getComputedStyle(this).cursor : null }'
      )
      if (cursor) out[String(sig.backendDOMNodeId)] = cursor
    } catch (e) {
      errors.push({ step: 'text-styles', message: `cursor: ${msg(e)}`, backendDOMNodeId: sig.backendDOMNodeId })
    }
  }
  return out
}

export async function collectTextNodeStyles(
  page: Page,
  signals: EventListenerSignal[] = [],
  options: CollectorOptions = {}
): Promise<{
  textNodeStyles: Record<string, TextNodeStyle>
  elementCursorStyles: Record<string, string>
  errors: CollectionError[]
}> {
  const errors: CollectionError[] = []
  let textNodeStyles: Record<string, TextNodeStyle> = {}
  let elementCursorStyles: Record<string, string> = {}
  let cdp: CDPSession | undefined
  try {
    cdp = await openCdp(page)
    textNodeStyles = await collectTextStyles(cdp, options.batchTimeoutMs ?? BATCH_TIMEOUT_MS, errors)
    elementCursorStyles = await collectCursorStyles(cdp, signals, errors)
  } catch (e) {
    errors.push({ step: 'text-styles', message: msg(e) })
  } finally {
    await cdp?.detach().catch(() => undefined)
  }
  return { textNodeStyles, elementCursorStyles, errors }
}
// ---------------------------------------------------------------------------
// Task 10: event listener signals (Lost Soul)
// ---------------------------------------------------------------------------

export async function collectEventListeners(
  page: Page,
  options: { maxNodes?: number } = {}
): Promise<{ signals: EventListenerSignal[]; errors: CollectionError[] }> {
  const maxNodes = options.maxNodes ?? MAX_LISTENER_NODES
  const signals: EventListenerSignal[] = []
  const errors: CollectionError[] = []
  let cdp
  try {
    cdp = await openCdp(page)
  } catch (e) {
    return { signals: [], errors: [{ step: 'event-listeners', message: `CDP unavailable: ${msg(e)}` }] }
  }
  try {
    const { result: counted } = (await cdp.send('Runtime.evaluate', {
      expression: `document.querySelectorAll('*').length`,
      returnByValue: true,
    })) as { result: { value?: number } }
    const total = counted.value ?? 0
    if (total > maxNodes) {
      // Not silent: nodes past the cap are never checked, so say so.
      errors.push({ step: 'event-listeners', message: `node cap reached: only the first ${maxNodes} of ${total} elements were checked` })
    }
    const { result } = (await cdp.send('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll('*')).slice(0, ${maxNodes})`,
    })) as { result: { objectId?: string } }
    if (!result.objectId) throw new Error('could not list DOM nodes')
    const { result: props } = (await cdp.send('Runtime.getProperties', {
      objectId: result.objectId,
      ownProperties: true,
    })) as { result: Array<{ name: string; value?: { objectId?: string } }> }
    const items = props.filter((p) => /^\d+$/.test(p.name)).sort((a, b) => Number(a.name) - Number(b.name))
    for (const item of items) {
      const objectId = item.value?.objectId
      if (!objectId) continue
      let backendId: number | null = null
      try {
        const { node } = (await cdp.send('DOM.describeNode', { objectId })) as {
          node: { backendNodeId: number; nodeName: string }
        }
        backendId = node.backendNodeId
        const { listeners } = (await cdp.send('DOMDebugger.getEventListeners', {
          objectId,
          depth: 0,
          pierce: false,
        })) as { listeners: Array<{ type: string }> }
        const types = [...new Set(listeners.map((l) => l.type))].filter((t): t is PointerEvent =>
          (POINTER_EVENTS as readonly string[]).includes(t)
        )
        if (types.length > 0) {
          signals.push({ backendDOMNodeId: node.backendNodeId, eventTypes: types, tagName: node.nodeName.toLowerCase() })
        }
      } catch (e) {
        errors.push({ step: 'event-listeners', message: msg(e), ...(backendId != null ? { backendDOMNodeId: backendId } : {}) })
      }
    }
    await cdp.send('Runtime.releaseObject', { objectId: result.objectId }).catch(() => undefined)
  } catch (e) {
    return { signals: [], errors: [{ step: 'event-listeners', message: msg(e) }] }
  } finally {
    await cdp.detach().catch(() => undefined)
  }
  return { signals, errors }
}

// ---------------------------------------------------------------------------
// Task 11: page metadata (Silent Tongue, Shattered Order, Hollow Portrait)
// ---------------------------------------------------------------------------

const LANDMARK_ROLES = ['main', 'navigation', 'banner', 'contentinfo', 'complementary', 'region', 'form']

/** Ids and attributes of the same elements, read from one remote list so they cannot drift apart. */
async function readList<T>(cdp: CDPSession, expression: string, attributesFn: string): Promise<{ ids: Array<number | null>; values: T[] }> {
  const list = await evaluateToObject(cdp, expression)
  try {
    const ids = await backendIdsOfObject(cdp, list)
    const values = await callByValue<T[]>(cdp, list, attributesFn)
    return { ids, values }
  } finally {
    await releaseObject(cdp, list)
  }
}

/** backendDOMNodeId of the element an expression evaluates to, or null when it is null or unreadable. */
async function backendIdOfExpression(cdp: CDPSession, expression: string): Promise<number | null> {
  const { result } = (await cdp.send('Runtime.evaluate', { expression, returnByValue: false })) as {
    result: { objectId?: string; subtype?: string }
  }
  if (!result.objectId || result.subtype === 'null') return null
  try {
    return await backendIdOfObject(cdp, result.objectId)
  } finally {
    await releaseObject(cdp, result.objectId)
  }
}

export type PageMetadataResult = {
  metadata: PageMetadata
  imgAltAttributes: Record<string, string | null>
  imgSrcAttributes: Record<string, string | null>
}

export async function collectPageMetadata(page: Page, axNodes: AXNode[]): Promise<PageMetadataResult> {
  const nameById = new Map<number, string>()
  for (const n of axNodes) {
    if (n.backendDOMNodeId > 0) nameById.set(n.backendDOMNodeId, String(n.name.value ?? ''))
  }
  const cdp = await openCdp(page)
  try {
    const headingList = await readList<string>(cdp, `Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))`, HEADING_TAGS_FN)
    const imgList = await readList<string | null>(cdp, `Array.from(document.querySelectorAll('img'))`, IMG_ALTS_FN)
    const imgSrcList = await readList<string | null>(cdp, `Array.from(document.querySelectorAll('img'))`, IMG_SRCS_FN)
    const htmlId = await backendIdOfExpression(cdp, 'document.documentElement')
    if (htmlId === null) throw new Error('could not read the <html> element id')
    const bodyId = await backendIdOfExpression(cdp, 'document.body')
    const dom = await page.evaluate(() => ({
      lang: document.documentElement.getAttribute('lang'),
      hasMain: document.querySelector('main, [role="main"]') !== null,
    }))
    const headings: HeadingRecord[] = headingList.values.map((tagName, i) => {
      const id = headingList.ids[i]
      return {
        tagName,
        accessibleName: id != null ? nameById.get(id) ?? '' : '',
        domOrderIndex: i,
        backendDOMNodeId: id ?? 0,
      }
    })
    const roles = new Set<string>()
    for (const n of axNodes) {
      const role = String(n.role.value ?? '')
      // Landmarks are page-level: a <main> inside an iframe does not give the page one.
      if (n.frameId === undefined && !n.ignored && LANDMARK_ROLES.includes(role)) roles.add(role)
    }
    const imgAltAttributes: Record<string, string | null> = {}
    imgList.values.forEach((alt, i) => {
      const id = imgList.ids[i]
      if (id != null) imgAltAttributes[String(id)] = alt
    })
    const imgSrcAttributes: Record<string, string | null> = {}
    imgSrcList.values.forEach((src, i) => {
      const id = imgSrcList.ids[i]
      if (id != null) imgSrcAttributes[String(id)] = src
    })
    return {
      metadata: {
        htmlLang: dom.lang,
        headings,
        landmarkRoles: LANDMARK_ROLES.filter((r) => roles.has(r)),
        hasMainLandmark: dom.hasMain || roles.has('main'),
        htmlBackendDOMNodeId: htmlId,
        bodyBackendDOMNodeId: bodyId,
      },
      imgAltAttributes,
      imgSrcAttributes,
    }
  } finally {
    await cdp.detach().catch(() => undefined)
  }
}
// ---------------------------------------------------------------------------
// Task 12: DOM-to-AX mapping (The Veiled)
// ---------------------------------------------------------------------------

type MappingRow = {
  visible: boolean
  tagName: string
  ariaHidden: boolean
  isPresentational: boolean
  isFocusable: boolean
  hasVisibleText: boolean
  containsFocusable: boolean
}

/** One chunk of at most 100 elements: the mapping rows of the visible ones, and of focusable content under aria-hidden. */
async function mappingChunk(cdp: CDPSession, list: string, start: number, visibleAx: Set<number>, timeoutMs: number): Promise<DomAxMapping[]> {
  const label = `dom-ax-mapping chunk ${start}`
  const rows = await withTimeout(callByValue<MappingRow[]>(cdp, list, MAPPING_ROWS_FN, [start, BATCH_SIZE]), timeoutMs, label)
  const slice = await withTimeout(callToObject(cdp, list, SLICE_FN, [start, BATCH_SIZE]), timeoutMs, label)
  try {
    const ids = await withTimeout(backendIdsOfObject(cdp, slice), timeoutMs, label)
    const out: DomAxMapping[] = []
    rows.forEach((r, i) => {
      const id = ids[i]
      // Case (a) of The Veiled (a focusable inside aria-hidden) has no visibility condition: a link parked
      // off screen can still take keyboard focus. Every other row needs a visible box (case (b)).
      const focusableUnderAriaHidden = r.ariaHidden && (r.isFocusable || r.containsFocusable)
      if (id == null || (!r.visible && !focusableUnderAriaHidden)) return
      out.push({
        backendDOMNodeId: id,
        tagName: r.tagName,
        hasAxNode: visibleAx.has(id),
        ariaHidden: r.ariaHidden,
        isPresentational: r.isPresentational,
        isFocusable: r.isFocusable,
        hasVisibleText: r.hasVisibleText,
        containsFocusable: r.containsFocusable,
      })
    })
    return out
  } finally {
    await releaseObject(cdp, slice)
  }
}

export async function buildDomAxMapping(
  page: Page,
  axNodes: AXNode[],
  options: CollectorOptions = {}
): Promise<{ mapping: DomAxMapping[]; errors: CollectionError[] }> {
  if (axNodes.length === 0) {
    return { mapping: [], errors: [{ step: 'dom-ax-mapping', message: 'axTreeUnavailable: true' }] }
  }
  const timeoutMs = options.batchTimeoutMs ?? BATCH_TIMEOUT_MS
  const visibleAx = new Set(axNodes.filter((n) => !n.ignored && n.backendDOMNodeId > 0).map((n) => n.backendDOMNodeId))
  const mapping: DomAxMapping[] = []
  const errors: CollectionError[] = []
  let cdp: CDPSession | undefined
  try {
    cdp = await openCdp(page)
    const list = await withTimeout(evaluateToObject(cdp, MAPPING_EXPR), timeoutMs, 'dom-ax-mapping enumeration')
    try {
      const total = await withTimeout(lengthOf(cdp, list), timeoutMs, 'dom-ax-mapping enumeration')
      for (let start = 0; start < total; start += BATCH_SIZE) {
        try {
          mapping.push(...(await mappingChunk(cdp, list, start, visibleAx, timeoutMs)))
        } catch (e) {
          errors.push({ step: 'dom-ax-mapping', message: msg(e) })
        }
      }
    } finally {
      await releaseObject(cdp, list)
    }
  } catch (e) {
    errors.push({ step: 'dom-ax-mapping', message: msg(e) })
  } finally {
    await cdp?.detach().catch(() => undefined)
  }
  return { mapping, errors }
}

const MAPPING_EXPR = `Array.from(document.querySelectorAll('body, body *'))`

// ---------------------------------------------------------------------------
// Task 0 (haunting-classifier): DOM node snapshot (ancestry, attributes, snippets)
// ---------------------------------------------------------------------------

export const SNIPPET_MAX_CHARS = 300
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
const DOM_ATTR_SET: ReadonlySet<string> = new Set<string>(DOM_ATTR_NAMES)

type CdpDomNode = {
  nodeType: number
  nodeName: string
  localName?: string
  nodeValue?: string
  backendNodeId: number
  attributes?: string[]
  children?: CdpDomNode[]
  shadowRoots?: CdpDomNode[]
  contentDocument?: CdpDomNode
}

const escText = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const escAttr = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;')

function startTag(tag: string, attributes: string[] | undefined): string {
  let out = `<${tag}`
  for (let i = 0; i + 1 < (attributes?.length ?? 0); i += 2) {
    out += ` ${attributes![i]}="${escAttr(attributes![i + 1] ?? '')}"`
  }
  return `${out}>`
}

/** Serialise a node into `out`, stopping as soon as the budget is spent. */
function serialize(node: CdpDomNode, out: { s: string }, budget: number): void {
  if (out.s.length >= budget) return
  if (node.nodeType === 3) {
    out.s += escText(node.nodeValue ?? '')
    return
  }
  if (node.nodeType !== 1) return
  const tag = node.localName ?? node.nodeName.toLowerCase()
  out.s += startTag(tag, node.attributes)
  if (VOID_TAGS.has(tag)) return
  for (const child of node.children ?? []) {
    if (out.s.length >= budget) return
    serialize(child, out, budget)
  }
  if (out.s.length < budget) out.s += `</${tag}>`
}

function snippetOf(node: CdpDomNode): string {
  const out = { s: '' }
  if (node.nodeType === 1) serialize(node, out, SNIPPET_MAX_CHARS)
  else out.s = escText((node.nodeValue ?? '').trim())
  return out.s.length > SNIPPET_MAX_CHARS ? out.s.slice(0, SNIPPET_MAX_CHARS) : out.s
}

function pickAttrs(attributes: string[] | undefined): DomNodeInfo['attrs'] {
  const attrs: Record<string, string> = {}
  for (let i = 0; i + 1 < (attributes?.length ?? 0); i += 2) {
    const name = attributes![i]!
    if (DOM_ATTR_SET.has(name)) attrs[name] = attributes![i + 1] ?? ''
  }
  return attrs
}

/** Every element, plus the non-element nodes (text, document) whose ids are in `referenced`. */
function addNode(node: CdpDomNode, parentId: number | null, referenced: ReadonlySet<number>, out: Record<string, DomNodeInfo>): void {
  const isElement = node.nodeType === 1
  const isDocument = node.nodeType === 9
  const wanted = isElement || ((isDocument || node.nodeType === 3) && referenced.has(node.backendNodeId))
  if (wanted) {
    out[String(node.backendNodeId)] = {
      tag: isElement ? (node.localName ?? node.nodeName.toLowerCase()) : isDocument ? '#document' : '#text',
      parentId,
      attrs: isElement ? pickAttrs(node.attributes) : {},
      outerHTMLSnippet: snippetOf(node),
    }
  }
  // Shadow roots and frame documents are transparent: their children hang off the host element.
  const nextParent = isElement ? node.backendNodeId : parentId
  for (const child of node.children ?? []) addNode(child, nextParent, referenced, out)
  for (const root of node.shadowRoots ?? []) {
    for (const child of root.children ?? []) addNode(child, nextParent, referenced, out)
  }
  if (node.contentDocument) {
    for (const child of node.contentDocument.children ?? []) addNode(child, nextParent, referenced, out)
  }
}

/**
 * One atomic `DOM.getDocument` snapshot (piercing shadow roots and same-process frames) turned into
 * `domNodes`. Ids and parents come from the same tree, so they cannot drift apart.
 */
export async function collectDomNodes(
  page: Page,
  referenced: ReadonlySet<number> = new Set()
): Promise<{ domNodes: Record<string, DomNodeInfo>; errors: CollectionError[] }> {
  const domNodes: Record<string, DomNodeInfo> = {}
  let cdp: CDPSession | undefined
  try {
    cdp = await openCdp(page)
    const { root } = (await cdp.send('DOM.getDocument', { depth: -1, pierce: true })) as { root: CdpDomNode }
    addNode(root, null, referenced, domNodes)
    return { domNodes, errors: [] }
  } catch (e) {
    return { domNodes, errors: [{ step: 'dom-nodes', message: msg(e) }] }
  } finally {
    await cdp?.detach().catch(() => undefined)
  }
}
