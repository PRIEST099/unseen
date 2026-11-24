import type { AXNode, AXValueSource, BoundingBox, RawAudit } from '../types.js'

export type RGBA = { r: number; g: number; b: number; a: number }

// ---------------------------------------------------------------------------
// Stable ids
// ---------------------------------------------------------------------------

/** Deterministic FNV-1a (32 bit) hash of type + node id + kind, as 8 hex digits. No crypto. */
export function hauntingId(type: string, nodeId: number, kind?: string): string {
  const text = `${type}|${nodeId}|${kind ?? ''}`
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${type}-${hash.toString(16).padStart(8, '0')}`
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

function channel(token: string): number | null {
  const t = token.trim()
  const n = parseFloat(t)
  if (!Number.isFinite(n)) return null
  return clamp(t.endsWith('%') ? (n / 100) * 255 : n, 0, 255)
}

function alpha(token: string | undefined): number | null {
  if (token === undefined) return 1
  const t = token.trim()
  const n = parseFloat(t)
  if (!Number.isFinite(n)) return null
  return clamp(t.endsWith('%') ? n / 100 : n, 0, 1)
}

function parseFunctional(s: string): RGBA | null {
  const m = /^rgba?\(([^)]*)\)$/i.exec(s)
  if (!m) return null
  const [colour, slashAlpha] = (m[1] ?? '').split('/')
  const parts = (colour ?? '').split(/[\s,]+/).filter((p) => p !== '')
  const fourth = slashAlpha ?? parts[3]
  if (parts.length < 3 || parts.length > 4) return null
  const r = channel(parts[0] ?? '')
  const g = channel(parts[1] ?? '')
  const b = channel(parts[2] ?? '')
  const a = alpha(fourth)
  return r === null || g === null || b === null || a === null ? null : { r, g, b, a }
}

function parseHex(s: string): RGBA | null {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s)
  const hex = m?.[1]
  if (!hex) return null
  const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex
  const byte = (i: number): number => parseInt(full.slice(i * 2, i * 2 + 2), 16)
  return { r: byte(0), g: byte(1), b: byte(2), a: full.length === 8 ? byte(3) / 255 : 1 }
}

function parseColorFunction(s: string): RGBA | null {
  const m = /^color\(\s*srgb\s+([^)]*)\)$/i.exec(s)
  if (!m) return null
  const [colour, slashAlpha] = (m[1] ?? '').split('/')
  const parts = (colour ?? '').split(/\s+/).filter((p) => p !== '')
  if (parts.length !== 3) return null
  const [r, g, b] = parts.map((p) => parseFloat(p))
  const a = alpha(slashAlpha)
  if (r === undefined || g === undefined || b === undefined || a === null) return null
  if (![r, g, b].every(Number.isFinite)) return null
  return { r: clamp(r, 0, 1) * 255, g: clamp(g, 0, 1) * 255, b: clamp(b, 0, 1) * 255, a }
}

/** Parse rgb()/rgba(), #hex, `transparent` and `color(srgb ...)`. Anything else is null. */
export function parseCssColor(s: string | undefined | null): RGBA | null {
  if (typeof s !== 'string') return null
  const t = s.trim()
  if (t.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  return parseFunctional(t) ?? parseHex(t) ?? parseColorFunction(t)
}

/** Composite `color` over `background` (source-over). The result is opaque when the background is. */
export function blend(color: RGBA, background: RGBA): RGBA {
  const a = clamp(color.a, 0, 1)
  const out = a + background.a * (1 - a)
  if (out <= 0) return { r: 0, g: 0, b: 0, a: 0 }
  const mix = (c: number, b: number): number => (c * a + b * background.a * (1 - a)) / out
  return { r: mix(color.r, background.r), g: mix(color.g, background.g), b: mix(color.b, background.b), a: out }
}

// ---------------------------------------------------------------------------
// Boxes, AX nodes, DOM nodes
// ---------------------------------------------------------------------------

export function findBox(boxes: readonly BoundingBox[], id: number): BoundingBox | null {
  return boxes.find((b) => b.backendDOMNodeId === id) ?? null
}

/** The AX node for a DOM node, preferring one that is not ignored. */
export function axByBackendId(raw: RawAudit, id: number): AXNode | undefined {
  if (id <= 0) return undefined
  let fallback: AXNode | undefined
  for (const n of raw.axNodes) {
    if (n.backendDOMNodeId !== id) continue
    if (!n.ignored) return n
    fallback ??= n
  }
  return fallback
}

/** AX ancestors, nearest first, following `parentId`. Cycle-safe. */
export function axAncestors(raw: RawAudit, id: number): AXNode[] {
  const byNode = new Map(raw.axNodes.map((n) => [n.nodeId, n] as const))
  const out: AXNode[] = []
  const seen = new Set<string>()
  let cur = axByBackendId(raw, id)
  while (cur?.parentId !== undefined && !seen.has(cur.parentId)) {
    seen.add(cur.parentId)
    const parent = byNode.get(cur.parentId)
    if (!parent) break
    out.push(parent)
    cur = parent
  }
  return out
}

/** AX descendants (breadth first) following `childIds`. Cycle-safe. */
export function axDescendants(raw: RawAudit, id: number): AXNode[] {
  const byNode = new Map(raw.axNodes.map((n) => [n.nodeId, n] as const))
  const start = axByBackendId(raw, id)
  if (!start) return []
  const out: AXNode[] = []
  const seen = new Set<string>([start.nodeId])
  const queue: AXNode[] = [start]
  for (let node = queue.shift(); node; node = queue.shift()) {
    for (const childId of node.childIds) {
      const child = byNode.get(childId)
      if (!child || seen.has(childId)) continue
      seen.add(childId)
      out.push(child)
      queue.push(child)
    }
  }
  return out
}

/** DOM ancestors, nearest first, following `domNodes[id].parentId`. Cycle-safe. */
export function domAncestors(raw: RawAudit, id: number): number[] {
  const out: number[] = []
  const seen = new Set<number>([id])
  let cur = raw.domNodes[String(id)]?.parentId ?? null
  while (cur !== null && !seen.has(cur)) {
    out.push(cur)
    seen.add(cur)
    cur = raw.domNodes[String(cur)]?.parentId ?? null
  }
  return out
}

/** DOM descendants (all depths) of `id`. */
export function domDescendants(raw: RawAudit, id: number): number[] {
  const children = new Map<number, number[]>()
  for (const [key, info] of Object.entries(raw.domNodes)) {
    if (info.parentId === null) continue
    const list = children.get(info.parentId) ?? []
    list.push(Number(key))
    children.set(info.parentId, list)
  }
  const out: number[] = []
  const seen = new Set<number>([id])
  const stack = [id]
  for (let cur = stack.pop(); cur !== undefined; cur = stack.pop()) {
    for (const child of children.get(cur) ?? []) {
      if (seen.has(child)) continue
      seen.add(child)
      out.push(child)
      stack.push(child)
    }
  }
  return out
}

/** `outerHTMLSnippet` of the node, or `<tag>` when the snippet is missing. At most 300 characters. */
export function snippet(raw: RawAudit, id: number): string {
  const info = raw.domNodes[String(id)]
  const text = info?.outerHTMLSnippet ?? `<${info?.tag ?? 'element'}>`
  return text.length > 300 ? text.slice(0, 300) : text
}

const NATIVE_TAGS = new Set(['button', 'input', 'select', 'textarea', 'summary'])

/**
 * Native interactive element: button, input, select, textarea, summary; an `<a>` with an href whose AX
 * role is link; or an editable element (AX `editable` property). An `<a>` without href is not native.
 */
export function isNativeInteractive(raw: RawAudit, id: number): boolean {
  const info = raw.domNodes[String(id)]
  if (!info) return false
  if (NATIVE_TAGS.has(info.tag)) return true
  const ax = axByBackendId(raw, id)
  if (info.tag === 'a') return info.attrs.href !== undefined && ax?.role.value === 'link'
  return ax?.properties.some((p) => p.name === 'editable' && String(p.value.value ?? '') !== '') ?? false
}

/** Keep only ids that have no ancestor in the same set. */
export function filterOutermost(raw: RawAudit, ids: readonly number[]): number[] {
  const set = new Set(ids)
  return ids.filter((id) => !domAncestors(raw, id).some((a) => set.has(a)))
}

/** Last path segment of an image `src`, without query or hash. Null for data/blob URLs and empty paths. */
export function fileNameFromSrc(src: string | null | undefined): string | null {
  if (typeof src !== 'string') return null
  const trimmed = src.trim()
  if (trimmed === '' || /^(data|blob|javascript):/i.test(trimmed)) return null
  const cut = trimmed.search(/[?#]/)
  const path = cut === -1 ? trimmed : trimmed.slice(0, cut)
  const last = path.split('/').filter((s) => s !== '').pop()
  return last && last !== '' ? last : null
}

/** First `name.sources` entry that is not superseded and has a non-empty value. */
export function winningNameSource(node: AXNode): AXValueSource | undefined {
  return node.name.sources?.find((s) => s.superseded !== true && String(s.value?.value ?? '').trim() !== '')
}

export function isPlaceholderSource(source: AXValueSource | undefined): boolean {
  if (!source) return false
  return source.attribute === 'placeholder' || source.attribute === 'aria-placeholder' || source.type === 'placeholder'
}

/** The trimmed accessible name of an AX node ('' when absent). */
export function axName(node: AXNode): string {
  return String(node.name.value ?? '').trim()
}

export function axRole(node: AXNode): string {
  return String(node.role.value ?? '')
}

/** A property value from `properties` as a string, or undefined when the node does not have it. */
export function axProp(node: AXNode, name: string): string | undefined {
  const p = node.properties.find((x) => x.name === name)
  return p === undefined || p.value.value === undefined ? undefined : String(p.value.value)
}
