import type { Page } from 'playwright'
import type {
  AXNode,
  CollectionError,
  DomAxMapping,
  EventListenerSignal,
  HeadingRecord,
  PageMetadata,
  TextNodeStyle,
} from '../types.js'
import { backendIdsOf, openCdp } from './cdp.js'

const BATCH_SIZE = 100
const BATCH_TIMEOUT_MS = 10_000
const MAX_LISTENER_NODES = 5000
const POINTER_EVENTS = ['click', 'mousedown', 'pointerdown', 'pointerup'] as const
type PointerEvent = (typeof POINTER_EVENTS)[number]

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

// ---------------------------------------------------------------------------
// Task 9: text node styles (The Fog) and cursor styles (Lost Soul)
// ---------------------------------------------------------------------------

/** Elements that directly own visible, non-whitespace text. Stored on window for batching. */
const TEXT_ELEMENTS_EXPR = `(() => {
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    let has = false
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim() !== '') { has = true; break }
    if (!has) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue
    out.push(el)
  }
  window.__unseenTextEls = out
  return out
})()`

type RawTextStyle = {
  color: string
  backgroundColor: string
  fontSize: string
  fontWeight: string
  backgroundUncertain: boolean
}

export function isLargeText(fontSize: string, fontWeight: string): boolean {
  const px = parseFloat(fontSize)
  const weight = fontWeight === 'bold' ? 700 : parseInt(fontWeight, 10)
  if (!Number.isFinite(px)) return false
  return px >= 24 || (px >= 18.66 && Number.isFinite(weight) && weight >= 700)
}

export async function collectTextNodeStyles(
  page: Page,
  signals: EventListenerSignal[] = []
): Promise<{
  textNodeStyles: Record<string, TextNodeStyle>
  elementCursorStyles: Record<string, string>
  errors: CollectionError[]
}> {
  const textNodeStyles: Record<string, TextNodeStyle> = {}
  const elementCursorStyles: Record<string, string> = {}
  const errors: CollectionError[] = []
  const cdp = await openCdp(page)
  try {
    const ids = await backendIdsOf(cdp, TEXT_ELEMENTS_EXPR)
    for (let start = 0; start < ids.length; start += BATCH_SIZE) {
      try {
        const batch = await withTimeout(
          page.evaluate(
            ([s, n]) => {
              const parse = (c: string) => {
                const m = c.match(/rgba?\(([^)]+)\)/)
                if (!m) return null
                const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number)
                return { a: p.length > 3 ? p[3]! : 1 }
              }
              const els = ((window as unknown as { __unseenTextEls: Element[] }).__unseenTextEls ?? []).slice(s, s + n)
              return els.map((el) => {
                const cs = getComputedStyle(el)
                let uncertain = false
                let bg = 'rgb(255, 255, 255)'
                for (let cur: Element | null = el; cur; cur = cur.parentElement) {
                  const c = getComputedStyle(cur)
                  if (c.backgroundImage && c.backgroundImage !== 'none') uncertain = true
                  const col = parse(c.backgroundColor)
                  if (!col || col.a === 0) continue
                  if (col.a < 1) {
                    uncertain = true
                    continue
                  }
                  bg = c.backgroundColor
                  break
                }
                return {
                  color: cs.color,
                  backgroundColor: bg,
                  fontSize: cs.fontSize,
                  fontWeight: cs.fontWeight,
                  backgroundUncertain: uncertain,
                }
              })
            },
            [start, BATCH_SIZE] as const
          ),
          BATCH_TIMEOUT_MS,
          `text-styles batch ${start}`
        )
        batch.forEach((raw: RawTextStyle, i) => {
          const id = ids[start + i]
          if (id == null) return
          textNodeStyles[String(id)] = { ...raw, isLargeText: isLargeText(raw.fontSize, raw.fontWeight) }
        })
      } catch (e) {
        errors.push({ step: 'text-styles', message: msg(e) })
      }
    }

    for (const sig of signals) {
      try {
        const { object } = (await cdp.send('DOM.resolveNode', { backendNodeId: sig.backendDOMNodeId })) as {
          object: { objectId: string }
        }
        const { result } = (await cdp.send('Runtime.callFunctionOn', {
          objectId: object.objectId,
          functionDeclaration: 'function(){ return this.nodeType === 1 ? getComputedStyle(this).cursor : null }',
          returnByValue: true,
        })) as { result: { value: string | null } }
        if (result.value) elementCursorStyles[String(sig.backendDOMNodeId)] = result.value
      } catch (e) {
        errors.push({ step: 'text-styles', message: `cursor: ${msg(e)}`, backendDOMNodeId: sig.backendDOMNodeId })
      }
    }
  } catch (e) {
    errors.push({ step: 'text-styles', message: msg(e) })
  } finally {
    await cdp.detach().catch(() => undefined)
  }
  return { textNodeStyles, elementCursorStyles, errors }
}

// ---------------------------------------------------------------------------
// Task 10: event listener signals (Lost Soul)
// ---------------------------------------------------------------------------

export async function collectEventListeners(
  page: Page
): Promise<{ signals: EventListenerSignal[]; errors: CollectionError[] }> {
  const signals: EventListenerSignal[] = []
  const errors: CollectionError[] = []
  let cdp
  try {
    cdp = await openCdp(page)
  } catch (e) {
    return { signals: [], errors: [{ step: 'event-listeners', message: `CDP unavailable: ${msg(e)}` }] }
  }
  try {
    const { result } = (await cdp.send('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll('*')).slice(0, ${MAX_LISTENER_NODES})`,
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

export async function collectPageMetadata(
  page: Page,
  axNodes: AXNode[]
): Promise<{ metadata: PageMetadata; imgAltAttributes: Record<string, string | null> }> {
  const nameById = new Map<number, string>()
  for (const n of axNodes) {
    if (n.backendDOMNodeId > 0) nameById.set(n.backendDOMNodeId, String(n.name.value ?? ''))
  }
  const cdp = await openCdp(page)
  try {
    const headingIds = await backendIdsOf(cdp, `Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))`)
    const imgIds = await backendIdsOf(cdp, `Array.from(document.querySelectorAll('img'))`)
    const dom = await page.evaluate(() => ({
      lang: document.documentElement.getAttribute('lang'),
      headingTags: Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'), (h) => h.tagName.toLowerCase()),
      alts: Array.from(document.querySelectorAll('img'), (i) => i.getAttribute('alt')),
      hasMain: document.querySelector('main, [role="main"]') !== null,
    }))
    const headings: HeadingRecord[] = dom.headingTags.map((tagName, i) => {
      const id = headingIds[i]
      return { tagName, accessibleName: id != null ? nameById.get(id) ?? '' : '', domOrderIndex: i }
    })
    const roles = new Set<string>()
    for (const n of axNodes) {
      const role = String(n.role.value ?? '')
      if (!n.ignored && LANDMARK_ROLES.includes(role)) roles.add(role)
    }
    const imgAltAttributes: Record<string, string | null> = {}
    dom.alts.forEach((alt, i) => {
      const id = imgIds[i]
      if (id != null) imgAltAttributes[String(id)] = alt
    })
    return {
      metadata: {
        htmlLang: dom.lang,
        headings,
        landmarkRoles: LANDMARK_ROLES.filter((r) => roles.has(r)),
        hasMainLandmark: dom.hasMain || roles.has('main'),
      },
      imgAltAttributes,
    }
  } finally {
    await cdp.detach().catch(() => undefined)
  }
}

// ---------------------------------------------------------------------------
// Task 12: DOM-to-AX mapping (The Veiled)
// ---------------------------------------------------------------------------

const MAPPING_EXPR = `(() => {
  const els = Array.from(document.querySelectorAll('body, body *'))
  window.__unseenMapEls = els
  return els
})()`

export async function buildDomAxMapping(
  page: Page,
  axNodes: AXNode[]
): Promise<{ mapping: DomAxMapping[]; errors: CollectionError[] }> {
  if (axNodes.length === 0) {
    return { mapping: [], errors: [{ step: 'dom-ax-mapping', message: 'axTreeUnavailable: true' }] }
  }
  const visibleAx = new Set(axNodes.filter((n) => !n.ignored && n.backendDOMNodeId > 0).map((n) => n.backendDOMNodeId))
  const cdp = await openCdp(page)
  try {
    const ids = await backendIdsOf(cdp, MAPPING_EXPR)
    const rows = await page.evaluate(() => {
      const els = (window as unknown as { __unseenMapEls: Element[] }).__unseenMapEls
      const docW = document.documentElement.scrollWidth
      const docH = document.documentElement.scrollHeight
      const sx = window.scrollX
      const sy = window.scrollY
      const FOCUSABLE =
        'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, [contenteditable=""], [contenteditable="true"], [tabindex]'
      const isFocusable = (el: Element) => {
        if (!el.matches(FOCUSABLE)) return false
        if ((el as HTMLButtonElement).disabled) return false
        const ti = el.getAttribute('tabindex')
        return ti === null || Number(ti) >= 0
      }
      const visibleBox = (el: Element) => {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return false
        const cs = getComputedStyle(el)
        if (cs.visibility === 'hidden' || cs.display === 'none') return false
        for (let cur: Element | null = el; cur; cur = cur.parentElement) {
          if (Number(getComputedStyle(cur).opacity) === 0) return false
        }
        const x = r.left + sx
        const y = r.top + sy
        return x + r.width > 0 && y + r.height > 0 && x < docW && y < docH
      }
      return els.map((el) => {
        const visible = visibleBox(el)
        let ariaHidden = false
        for (let cur: Element | null = el; cur; cur = cur.parentElement) {
          if (cur.getAttribute('aria-hidden') === 'true') {
            ariaHidden = true
            break
          }
        }
        const role = el.getAttribute('role')
        let hasVisibleText = false
        if (visible) {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
          for (let t = walker.nextNode(); t; t = walker.nextNode()) {
            if ((t.textContent ?? '').trim() !== '' && t.parentElement && visibleBox(t.parentElement)) {
              hasVisibleText = true
              break
            }
          }
        }
        let containsFocusable = false
        for (const d of el.querySelectorAll(FOCUSABLE)) {
          if (isFocusable(d)) {
            containsFocusable = true
            break
          }
        }
        return {
          visible,
          tagName: el.tagName.toLowerCase(),
          ariaHidden,
          isPresentational: role === 'presentation' || role === 'none',
          isFocusable: isFocusable(el),
          hasVisibleText,
          containsFocusable,
        }
      })
    })
    const mapping: DomAxMapping[] = []
    rows.forEach((r, i) => {
      const id = ids[i]
      if (id == null || !r.visible) return
      mapping.push({
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
    return { mapping, errors: [] }
  } catch (e) {
    return { mapping: [], errors: [{ step: 'dom-ax-mapping', message: msg(e) }] }
  } finally {
    await cdp.detach().catch(() => undefined)
  }
}

