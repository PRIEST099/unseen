import type { CDPSession, Page } from 'playwright'
import type { CollectionError, ComputedStyleMap, TabCycle, TabStep, TabWalkResult } from '../types.js'
import {
  activeElementBackendId,
  backendIdOfObject,
  backendIdsOf,
  hasUnreadableInside,
  injectInspectorStyles,
  isCompositeHost,
  openCdp,
  withForcedFocusWithin,
} from './cdp.js'

/**
 * Calculate the step cap for the Tab walk
 * Formula: focusableCount * 2 + 10
 *
 * @param focusableCount Number of focusable elements on the page
 * @returns Maximum number of steps to take
 */
export function stepCap(focusableCount: number): number {
  return focusableCount * 2 + 10
}

// ---------------------------------------------------------------------------
// Task 13: the Tab walk (hauntings.md §5 Cursed Loop, §6 Invisible Wanderer)
// ---------------------------------------------------------------------------

/** What the walk needs from a page. A fake driver makes the walk unit-testable. */
export interface TabDriver {
  /** Move focus to nothing and park the Tab starting point at the top of the document. */
  prepare(): Promise<void>
  /** The focused element's id right now, or null when focus is on body/none. */
  activeId(): Promise<string | null>
  /** backendDOMNodeIds (as strings) of every focusable element, in DOM order. */
  focusableIds(): Promise<string[]>
  /** Focus-indicator styles of an element right now. Throws if CDP fails. */
  styles(id: string): Promise<ComputedStyleMap>
  /**
   * The element's look with focus moved off it, then focus is given back. Does not
   * depend on a page's own blur/focusin handlers. Null when the page kept focus on it.
   */
  unfocusedStyles(id: string): Promise<ComputedStyleMap | null>
  /** Press Tab; return the newly focused id, or null when focus is on body/none. */
  pressTab(): Promise<string | null>
  /** Press Escape then Shift+Tab; return the focused id, or null. */
  escapeTest(): Promise<string | null>
  /** True while at least one of these elements is still in the document and rendered. */
  anyShown(ids: string[]): Promise<boolean>
  /** The trap region: the members' dialog, else their nearest common ancestor. */
  regionOf(ids: string[]): Promise<string | null>
  /** True for an iframe or shadow host: repeated focus on it means focus moves inside it. */
  isComposite(id: string): Promise<boolean>
  /**
   * True when focus on this element hides where focus really is: a frame whose document cannot be
   * entered (cross-origin), or a closed shadow host. Its focus styles cannot be judged from outside.
   */
  innerUnreadable?(id: string): Promise<boolean>
  /** True once the page has navigated since the driver was created. */
  navigated(): boolean
}

type WalkOutcome = Omit<TabWalkResult, 'walkStartedAtMs'> & { errors: CollectionError[] }
type EndReason = TabWalkResult['endReason']

/** After this many Tab presses in a row fail, the walk ends with `cdp-error`. */
const MAX_CONSECUTIVE_FAILURES = 3
/** Tab presses spent inside one frame or shadow host before its step is marked `compositeTruncated`. */
export const HOST_SUBCAP = 50
/** Further presses allowed to move past a truncated host before the walk ends with `composite-stuck`. */
export const HOST_MOVE_PAST = 50

/** Records steps with their before/after snapshots (Req 11.4, 11.10, 11.12). */
class StepRecorder {
  readonly steps: TabStep[] = []

  private constructor(
    private readonly driver: TabDriver,
    private readonly baseline: Map<string, ComputedStyleMap>,
    private readonly baselineFailed: Set<string>
  ) {}

  /** Reads the unfocused look of every focusable. Call after `driver.prepare()`. */
  static async create(driver: TabDriver, focusables: readonly string[], focused: string | null): Promise<StepRecorder> {
    const baseline = new Map<string, ComputedStyleMap>()
    const failed = new Set<string>()
    for (const id of focusables) {
      try {
        // Never read the baseline of an element that still holds focus: it would show the focused look.
        const look = id === focused ? await driver.unfocusedStyles(id) : await driver.styles(id)
        if (look === null) failed.add(id)
        else baseline.set(id, look)
      } catch {
        failed.add(id)
      }
    }
    return new StepRecorder(driver, baseline, failed)
  }

  get lastId(): string | undefined {
    return this.steps[this.steps.length - 1]?.backendDOMNodeId
  }

  markTruncated(): void {
    const last = this.steps[this.steps.length - 1]
    if (last) last.compositeTruncated = true
  }

  /** The unfocused look; for an element outside the pre-walk set it is read on demand. */
  private async baselineOf(id: string): Promise<{ before: ComputedStyleMap; cdpError: boolean; unavailable: boolean }> {
    const known = this.baseline.get(id)
    if (known) return { before: known, cdpError: false, unavailable: false }
    if (this.baselineFailed.has(id)) return { before: {}, cdpError: true, unavailable: false }
    try {
      const look = await this.driver.unfocusedStyles(id)
      if (look === null) return { before: {}, cdpError: false, unavailable: true }
      this.baseline.set(id, look)
      return { before: look, cdpError: false, unavailable: false }
    } catch {
      return { before: {}, cdpError: true, unavailable: false }
    }
  }

  async record(id: string): Promise<void> {
    let after: ComputedStyleMap = {}
    let afterFailed = false
    try {
      after = await this.driver.styles(id)
    } catch {
      afterFailed = true
    }
    const base = await this.baselineOf(id)
    const step: TabStep = {
      index: this.steps.length,
      backendDOMNodeId: id,
      focusSnapshot: { before: base.before, after },
      cdpError: afterFailed || base.cdpError,
    }
    if (base.unavailable) step.baselineUnavailable = true
    if (await this.innerUnreadable(id)) step.innerFocusUnreadable = true
    this.steps.push(step)
  }

  private async innerUnreadable(id: string): Promise<boolean> {
    try {
      return (await this.driver.innerUnreadable?.(id)) === true
    } catch {
      return false
    }
  }

  /** A Tab press or escape test that failed: no element id is known. */
  recordFailure(): void {
    this.steps.push({ index: this.steps.length, backendDOMNodeId: '', focusSnapshot: { before: {}, after: {} }, cdpError: true })
  }
}

type Segment = { ids: string[]; stepIdx: number[] }

async function isCompositeSafe(driver: TabDriver, id: string): Promise<boolean> {
  try {
    return await driver.isComposite(id)
  } catch {
    return false
  }
}

/** Whether any cycle member is still shown; null when that could not be read. */
async function cycleShown(driver: TabDriver, ids: string[]): Promise<boolean | null> {
  try {
    return await driver.anyShown(ids)
  } catch {
    return null
  }
}

async function nextFocus(driver: TabDriver, rec: StepRecorder, failures: number): Promise<{ id: string | null; failures: number }> {
  try {
    return { id: await driver.pressTab(), failures: 0 }
  } catch {
    rec.recordFailure()
    return { id: '', failures: failures + 1 }
  }
}

/** The state of one walk. A walk is single use. */
class Walk {
  private readonly cycles: TabCycle[] = []
  private readonly errors: CollectionError[] = []
  private readonly visited = new Set<string>()
  private readonly seenCycles = new Set<string>()
  private seg: Segment = { ids: [], stepIdx: [] }
  private failures = 0
  private host = { id: '', presses: 0 }

  constructor(
    private readonly driver: TabDriver,
    private readonly focusables: readonly string[],
    private readonly rec: StepRecorder
  ) {}

  private end(endReason: EndReason): WalkOutcome {
    return {
      steps: this.rec.steps,
      trapDetected: false,
      trapRegionNodeIds: [],
      stepCapReached: endReason === 'step-cap',
      cycles: this.cycles,
      endReason,
      errors: this.errors,
    }
  }

  private enter(id: string): void {
    this.seg.ids.push(id)
    this.seg.stepIdx.push(this.rec.steps.length - 1)
    this.visited.add(id)
  }

  async run(focused: string | null): Promise<WalkOutcome> {
    const cap = stepCap(this.focusables.length)
    if (focused !== null && this.focusables.includes(focused)) {
      // Something kept focus through prepare(): it is the first step.
      await this.rec.record(focused)
      this.enter(focused)
    }
    while (this.rec.steps.length < cap) {
      const out = await this.tick()
      if (out) return out
    }
    return this.end('step-cap')
  }

  private async tick(): Promise<WalkOutcome | null> {
    const next = await nextFocus(this.driver, this.rec, this.failures)
    this.failures = next.failures
    if (this.driver.navigated()) return this.end('navigated')
    if (next.id === '') return this.failures >= MAX_CONSECUTIVE_FAILURES ? this.end('cdp-error') : null
    if (next.id === null) return this.end(this.rec.steps.length === 0 ? 'no-focus' : 'body')
    return this.onFocus(next.id)
  }

  private async onFocus(id: string): Promise<WalkOutcome | null> {
    // Focus staying on a frame or shadow host means it moves inside: not a cycle, and not a step.
    if (id === this.rec.lastId && (await isCompositeSafe(this.driver, id))) return this.compositePress(id)
    this.host = { id: '', presses: 0 }
    await this.rec.record(id)
    const first = this.seg.ids.indexOf(id)
    if (first === -1) {
      this.enter(id)
      return null
    }
    return this.resolveCycle(first)
  }

  /** Presses inside a composite host have their own budget, so a big embed cannot eat the step cap. */
  private compositePress(id: string): WalkOutcome | null {
    if (this.host.id !== id) this.host = { id, presses: 0 }
    const presses = ++this.host.presses
    if (presses === HOST_SUBCAP) this.rec.markTruncated()
    if (presses <= HOST_SUBCAP + HOST_MOVE_PAST) return null
    this.errors.push({
      step: 'tab-walk',
      message:
        `Focus stayed inside one frame or shadow root for ${presses} Tab presses. ` +
        'Its contents cannot be read from outside, so a keyboard trap there cannot be confirmed or ruled out.',
    })
    return this.end('composite-stuck')
  }

  /**
   * A repeat was seen inside the current segment. Decide: the walk is over (the
   * cycle ends a full visit, or was re-entered), a trap, or an escapable cycle.
   */
  private async resolveCycle(first: number): Promise<WalkOutcome | null> {
    const nodeIds = this.seg.ids.slice(first)
    const cycle = {
      nodeIds,
      startStepIndex: this.seg.stepIdx[first] ?? 0,
      includesAllFocusables: this.focusables.every((f) => nodeIds.includes(f)),
      allFocusablesVisited: this.focusables.every((f) => this.visited.has(f)),
    }
    if (cycle.allFocusablesVisited) {
      this.cycles.push(cycle)
      return this.end('cycle-includes-all')
    }
    const key = [...nodeIds].sort().join('\u0000')
    if (this.seenCycles.has(key)) {
      // Escape lands outside, Tab walks straight back in: focus can only leave backwards.
      this.cycles.push({ ...cycle, escapable: true })
      return this.end('cycle-repeated')
    }
    this.seenCycles.add(key)
    return this.escape(cycle)
  }

  private async escape(cycle: Omit<TabCycle, 'escapable'>): Promise<WalkOutcome | null> {
    let out: string | null
    try {
      out = await this.driver.escapeTest()
    } catch {
      this.rec.recordFailure()
      return this.end('cdp-error')
    }
    if (this.driver.navigated()) return this.end('navigated')
    // Req 11.8: still inside the cycle is a trap. No focus at all is a trap only while the cycle's
    // elements are still shown; a dialog that closed on Escape means the user did escape.
    const trapped = out !== null ? cycle.nodeIds.includes(out) : await cycleShown(this.driver, cycle.nodeIds)
    if (trapped === null) {
      this.rec.recordFailure()
      return this.end('cdp-error')
    }
    if (trapped) {
      this.cycles.push({ ...cycle, escapable: false })
      return this.trap(cycle.nodeIds)
    }
    this.cycles.push({ ...cycle, escapable: true })
    if (out === null) {
      this.seg = { ids: [], stepIdx: [] }
      return null
    }
    await this.rec.record(out)
    this.seg = { ids: [], stepIdx: [] }
    this.enter(out)
    return null
  }

  private async trap(cycleIds: string[]): Promise<WalkOutcome> {
    let region: string | null = null
    try {
      region = await this.driver.regionOf(cycleIds)
    } catch {
      region = null
    }
    const trapRegionNodeIds = [...new Set([...(region ? [region] : []), ...cycleIds])]
    return { ...this.end('trap'), trapDetected: true, trapRegionNodeIds }
  }
}

function earlyEnd(endReason: EndReason): WalkOutcome {
  return { steps: [], trapDetected: false, trapRegionNodeIds: [], stepCapReached: false, cycles: [], endReason, errors: [] }
}

export async function runWalk(driver: TabDriver): Promise<WalkOutcome> {
  let focusables: string[]
  try {
    focusables = await driver.focusableIds()
  } catch {
    return earlyEnd('cdp-error')
  }
  if (focusables.length === 0) return earlyEnd('no-focusables')

  await driver.prepare().catch(() => undefined)
  // prepare() is not a guarantee: focus-trap code can pull focus back at once.
  const focused = await driver.activeId().catch(() => null)
  const rec = await StepRecorder.create(driver, focusables, focused)
  return new Walk(driver, focusables, rec).run(focused)
}

const NO_TRANSITIONS = '*,*::before,*::after{transition:none!important;animation:none!important}'

/** Every focusable in the page, piercing open shadow roots and same-origin frames. */
const TABBABLES_EXPR = `(() => {
  const sel = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, [contenteditable=""], [contenteditable="true"], [tabindex]'
  const out = []
  const usable = (el) => {
    if (el.disabled) return false
    const ti = el.getAttribute('tabindex')
    if (ti !== null && Number(ti) < 0) return false
    if (el.closest('[inert]')) return false
    const r = el.getBoundingClientRect()
    const cs = el.ownerDocument.defaultView.getComputedStyle(el)
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
  }
  const frameDoc = (el) => { try { return el.contentDocument } catch (e) { return null } }
  const visit = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const doc = (el.tagName === 'IFRAME' || el.tagName === 'FRAME') ? frameDoc(el) : null
      if (el.matches(sel) && !doc && usable(el)) out.push(el)
      if (el.shadowRoot) visit(el.shadowRoot)
      if (doc) visit(doc)
    }
  }
  visit(document)
  return out
})()`

/**
 * Blur the focused element at every level (shadow roots, same-origin frames), then
 * park the sequential-focus starting point at the top of the document by focusing
 * and removing a temporary element (inside the open modal dialog, if any). Without this, Tab would resume from wherever
 * the page left focus and skip everything before it. Focus events are swallowed in
 * the capture phase of each window while this runs, so focusin-based traps, focus-trap
 * libraries and blur handlers do not undo it.
 */
const RESET_FOCUS_EXPR = `(() => {
  const chain = []
  const wins = new Set([window])
  let a = document.activeElement
  for (let depth = 0; a && depth < 32; depth++) {
    chain.push(a)
    wins.add(a.ownerDocument.defaultView)
    let next = null
    if (a.shadowRoot && a.shadowRoot.activeElement) next = a.shadowRoot.activeElement
    else if (a.tagName === 'IFRAME' || a.tagName === 'FRAME') { try { next = a.contentDocument && a.contentDocument.activeElement } catch (e) { next = null } }
    a = next
  }
  const types = ['focus', 'blur', 'focusin', 'focusout']
  const stop = (e) => e.stopImmediatePropagation()
  for (const w of wins) for (const t of types) w.addEventListener(t, stop, true)
  try {
    for (const el of chain.reverse()) if (typeof el.blur === 'function') el.blur()
    // A modal dialog makes the rest of the page inert, so the marker must go inside the open modal.
    const hosts = []
    for (const d of document.querySelectorAll('dialog')) { try { if (d.matches(':modal')) hosts.unshift(d) } catch (e) { /* no :modal */ } }
    hosts.push(document.body || document.documentElement)
    for (const host of hosts) {
      const marker = document.createElement('span')
      marker.setAttribute('tabindex', '-1')
      host.insertBefore(marker, host.firstChild)
      marker.focus({ preventScroll: true })
      const placed = marker.getRootNode().activeElement === marker
      marker.remove()
      if (placed) break
    }
  } finally {
    for (const w of wins) for (const t of types) w.removeEventListener(t, stop, true)
  }
  return true
})()`

/** Reads the focus-indicator styles plus the nearest opaque ancestor background (for 3:1 checks). */
const STYLE_READER_SRC = `
  // Alpha of any serialized colour. rgb()/rgba() and CSS Color 4 functions (oklch, lab, color(...)) all
  // put alpha after a slash or as a fourth component; a colour without one is opaque.
  const alphaOf = (c) => {
    if (c === 'transparent') return 0
    const slash = c.match(/\\/\\s*([\\d.]+)(%?)\\s*\\)$/)
    if (slash) return parseFloat(slash[1]) / (slash[2] ? 100 : 1)
    const legacy = c.match(/^rgba\\(([^)]+)\\)$/)
    if (legacy) { const p = legacy[1].split(',').map((s) => parseFloat(s)); return p.length > 3 ? p[3] : 1 }
    return 1
  }
  const parentOf = (el) => {
    if (el.parentElement) return el.parentElement
    const root = el.getRootNode()
    if (root && root.host) return root.host
    try { return el.ownerDocument.defaultView.frameElement } catch (e) { return null }
  }
  const readStyles = (el) => {
    const cs = el.ownerDocument.defaultView.getComputedStyle(el)
    let adj = 'rgb(255, 255, 255)'
    for (let cur = parentOf(el); cur; cur = parentOf(cur)) {
      const c = cur.ownerDocument.defaultView.getComputedStyle(cur).backgroundColor
      if (alphaOf(c) === 1) { adj = c; break }
    }
    return {
      'outline-style': cs.outlineStyle,
      'outline-width': cs.outlineWidth,
      'outline-color': cs.outlineColor,
      'outline-offset': cs.outlineOffset,
      'box-shadow': cs.boxShadow,
      'border-style': cs.borderStyle,
      'border-width': cs.borderWidth,
      'border-color': cs.borderColor,
      'background-color': cs.backgroundColor,
      color: cs.color,
      'text-decoration-line': cs.textDecorationLine,
      'text-decoration-style': cs.textDecorationStyle,
      'text-decoration-thickness': cs.textDecorationThickness,
      'adjacent-background-color': adj,
    }
  }`

const FOCUS_STYLES_FN = `function () {${STYLE_READER_SRC}
  return readStyles(this)
}`

/**
 * Moves focus off the element with every focus event swallowed (so the page's own
 * handlers cannot pull it back), reads the unfocused look, and gives focus back.
 */
const UNFOCUSED_STYLES_FN = `function () {${STYLE_READER_SRC}
  const el = this
  const win = el.ownerDocument.defaultView
  const root = el.getRootNode()
  const types = ['focus', 'blur', 'focusin', 'focusout']
  const stop = (e) => e.stopImmediatePropagation()
  for (const t of types) win.addEventListener(t, stop, true)
  try {
    el.blur()
    if (root.activeElement === el) return null
    const styles = readStyles(el)
    el.focus({ preventScroll: true })
    return styles
  } finally {
    for (const t of types) win.removeEventListener(t, stop, true)
  }
}`

const SHOWN_FN = `function () {
  return this.isConnected && this.checkVisibility({ visibilityProperty: true })
}`

const REGION_FN = `function (...members) {
  const els = members.filter(Boolean)
  if (els.length === 0) return null
  const dlg = els[0].closest('[role=dialog],[role=alertdialog],[aria-modal=true],dialog')
  if (dlg && els.every((e) => dlg.contains(e))) return dlg
  let anc = els[0]
  while (anc && !els.every((e) => anc.contains(e))) anc = anc.parentElement
  return anc
}`

async function callOn<T>(cdp: CDPSession, objectId: string, functionDeclaration: string): Promise<T> {
  const { result } = (await cdp.send('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration,
    returnByValue: true,
  })) as { result: { value: T } }
  return result.value
}

function pageDriver(page: Page, cdp: CDPSession, navigated: () => boolean): TabDriver {
  const resolve = async (id: string): Promise<string> => {
    const { object } = (await cdp.send('DOM.resolveNode', { backendNodeId: Number(id) })) as { object: { objectId: string } }
    return object.objectId
  }
  const settle = (): Promise<void> => page.waitForTimeout(30)
  const focusedId = async (): Promise<string | null> => {
    const id = await activeElementBackendId(cdp)
    return id === null ? null : String(id)
  }
  return {
    navigated,
    async prepare() {
      await cdp.send('Runtime.evaluate', { expression: RESET_FOCUS_EXPR })
    },
    activeId: focusedId,
    async focusableIds() {
      return (await backendIdsOf(cdp, TABBABLES_EXPR)).filter((x): x is number => x != null).map(String)
    },
    async styles(id) {
      return callOn<ComputedStyleMap>(cdp, await resolve(id), FOCUS_STYLES_FN)
    },
    async unfocusedStyles(id) {
      const objectId = await resolve(id)
      return withForcedFocusWithin(cdp, objectId, () => callOn<ComputedStyleMap | null>(cdp, objectId, UNFOCUSED_STYLES_FN))
    },
    async pressTab() {
      await page.keyboard.press('Tab')
      await settle()
      return focusedId()
    },
    async escapeTest() {
      await page.keyboard.press('Escape')
      await settle()
      await page.keyboard.press('Shift+Tab')
      await settle()
      return focusedId()
    },
    async anyShown(ids) {
      for (const id of ids) {
        try {
          if (await callOn<boolean>(cdp, await resolve(id), SHOWN_FN)) return true
        } catch {
          /* the node is gone: not shown */
        }
      }
      return false
    },
    async regionOf(ids) {
      const objectIds = (await Promise.all(ids.map((i) => resolve(i).catch(() => null)))).filter((o): o is string => o !== null)
      const [first] = objectIds
      if (first === undefined) return null
      const { result } = (await cdp.send('Runtime.callFunctionOn', {
        objectId: first,
        functionDeclaration: REGION_FN,
        arguments: objectIds.map((o) => ({ objectId: o })),
        returnByValue: false,
      })) as { result: { objectId?: string } }
      if (!result.objectId) return null
      const id = await backendIdOfObject(cdp, result.objectId)
      return id === null ? null : String(id)
    },
    isComposite: (id) => isCompositeHost(cdp, Number(id)),
    innerUnreadable: (id) => hasUnreadableInside(cdp, Number(id)),
  }
}

/** Real-keyboard Tab walk, with the collection errors it produced. Call after networkidle and the settle window. */
export async function walkTabsWithErrors(page: Page): Promise<{ walk: TabWalkResult; errors: CollectionError[] }> {
  const walkStartedAtMs = Date.now()
  const cdp = await openCdp(page)
  try {
    let navigated = false
    cdp.on('Page.frameNavigated', (e: { frame: { parentId?: string } }) => {
      if (!e.frame.parentId) navigated = true
    })
    await cdp.send('Page.enable')
    // CDP inspector stylesheets are not blocked by a page's CSP (page.addStyleTag is).
    await injectInspectorStyles(cdp, NO_TRANSITIONS)
    const { errors, ...core } = await runWalk(pageDriver(page, cdp, () => navigated))
    return { walk: { ...core, walkStartedAtMs }, errors }
  } finally {
    await cdp.detach().catch(() => undefined)
  }
}

/** Real-keyboard Tab walk. Call after networkidle and the 1500 ms settle window. */
export async function walkTabs(page: Page): Promise<TabWalkResult> {
  return (await walkTabsWithErrors(page)).walk
}
