import type { Page } from 'playwright'
import type { ComputedStyleMap, CycleResult, TabCycle, TabStep, TabWalkResult } from '../types.js'
import {
  activeElementBackendId,
  backendIdOfObject,
  backendIdsOf,
  injectInspectorStyles,
  isCompositeHost,
  openCdp,
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

/**
 * Detect if a sequence of focus steps contains a cycle
 * 
 * A cycle is detected when the same backendDOMNodeId appears a second time
 * before all focusable elements have been visited at least once.
 * 
 * @param steps Array of backendDOMNodeId strings in focus order
 * @param focusableCount Expected number of unique focusable elements
 * @returns CycleResult with cycle detection info
 */
export function detectCycle(steps: readonly string[], focusableCount: number): CycleResult {
  const visitedSet = new Set<string>()
  const focusableSet = new Set<string>()
  
  // Build focusableSet from the first focusableCount unique IDs
  for (const step of steps) {
    if (!visitedSet.has(step)) {
      visitedSet.add(step)
      focusableSet.add(step)
      if (focusableSet.size >= focusableCount) {
        break
      }
    }
  }
  
  // Reset visitedSet for cycle detection
  visitedSet.clear()
  
  // Walk steps looking for a cycle
  for (let i = 0; i < steps.length; i++) {
    const stepId = steps[i]
    
    if (visitedSet.has(stepId)) {
      // Found a repeat - check if we've visited all focusable elements
      if (visitedSet.size < focusableCount) {
        // Cycle detected before all focusables were visited
        // Collect cycle nodeIds from first occurrence to current
        const cycleStartIndex = steps.indexOf(stepId)
        const cycleNodeIds = steps.slice(cycleStartIndex, i)
        return {
          hasCycle: true,
          cycleStart: cycleStartIndex,
          cycleNodeIds: cycleNodeIds,
        }
      }
    }
    
    visitedSet.add(stepId)
  }
  
  // No cycle detected
  return {
    hasCycle: false,
    cycleStart: -1,
    cycleNodeIds: [],
  }
}


// ---------------------------------------------------------------------------
// Task 13: the Tab walk (hauntings.md §5 Cursed Loop, §6 Invisible Wanderer)
// ---------------------------------------------------------------------------

/** What the walk needs from a page. A fake driver makes the walk unit-testable. */
export interface TabDriver {
  /** Blur the focused element and move the Tab starting point to the top of the document. */
  prepare(): Promise<void>
  /** backendDOMNodeIds (as strings) of every focusable element, in DOM order. */
  focusableIds(): Promise<string[]>
  /** Focus-indicator styles of an element right now. Throws if CDP fails. */
  styles(id: string): Promise<ComputedStyleMap>
  /** Press Tab; return the newly focused id, or null when focus is on body/none. */
  pressTab(): Promise<string | null>
  /** Press Escape then Shift+Tab; return the focused id, or null. */
  escapeTest(): Promise<string | null>
  /** The trap region: the members' dialog, else their nearest common ancestor. */
  regionOf(ids: string[]): Promise<string | null>
  /** True for an iframe or shadow host: repeated focus on it means focus moves inside it. */
  isComposite(id: string): Promise<boolean>
}

type WalkCore = Omit<TabWalkResult, 'walkStartedAtMs'>
type EndReason = TabWalkResult['endReason']

/** After this many Tab presses in a row fail, the walk ends with `cdp-error`. */
const MAX_CONSECUTIVE_FAILURES = 3

function finish(steps: TabStep[], cycles: TabCycle[], endReason: EndReason): WalkCore {
  return { steps, trapDetected: false, trapRegionNodeIds: [], stepCapReached: endReason === 'step-cap', cycles, endReason }
}

/** Records steps with their before/after snapshots (Req 11.4, 11.10, 11.12). */
class StepRecorder {
  readonly steps: TabStep[] = []

  private constructor(
    private readonly driver: TabDriver,
    private readonly baseline: Map<string, ComputedStyleMap>,
    private readonly baselineFailed: Set<string>
  ) {}

  /** Reads the unfocused look of every focusable. Call after `driver.prepare()`. */
  static async create(driver: TabDriver, focusables: readonly string[]): Promise<StepRecorder> {
    const baseline = new Map<string, ComputedStyleMap>()
    const failed = new Set<string>()
    for (const id of focusables) {
      try {
        baseline.set(id, await driver.styles(id))
      } catch {
        failed.add(id)
      }
    }
    return new StepRecorder(driver, baseline, failed)
  }

  get lastId(): string | undefined {
    return this.steps[this.steps.length - 1]?.backendDOMNodeId
  }

  async record(id: string): Promise<void> {
    let after: ComputedStyleMap = {}
    let cdpError = this.baselineFailed.has(id)
    try {
      after = await this.driver.styles(id)
    } catch {
      cdpError = true
    }
    this.steps.push({
      index: this.steps.length,
      backendDOMNodeId: id,
      focusSnapshot: { before: this.baseline.get(id) ?? {}, after },
      cdpError,
    })
  }

  /** A Tab press or escape test that failed: no element id is known. */
  recordFailure(): void {
    this.steps.push({ index: this.steps.length, backendDOMNodeId: '', focusSnapshot: { before: {}, after: {} }, cdpError: true })
  }
}

type Segment = { ids: string[]; stepIdx: number[] }
type CycleVerdict = { end: WalkCore } | { segment: Segment }

async function isCompositeSafe(driver: TabDriver, id: string): Promise<boolean> {
  try {
    return await driver.isComposite(id)
  } catch {
    return false
  }
}

async function trapResult(driver: TabDriver, rec: StepRecorder, cycles: TabCycle[], cycleIds: string[]): Promise<WalkCore> {
  let region: string | null = null
  try {
    region = await driver.regionOf(cycleIds)
  } catch {
    region = null
  }
  const trapRegionNodeIds = [...new Set([...(region ? [region] : []), ...cycleIds])]
  return { ...finish(rec.steps, cycles, 'trap'), trapDetected: true, trapRegionNodeIds }
}

/**
 * A repeat was seen inside the current segment. Decide: not a trap (the cycle
 * covers every focusable), a trap (the escape test stays in or loses focus),
 * or an escapable cycle (record the landing element, start a new segment).
 */
async function resolveCycle(
  driver: TabDriver,
  focusables: readonly string[],
  visited: Set<string>,
  seg: Segment,
  first: number,
  cycles: TabCycle[],
  rec: StepRecorder
): Promise<CycleVerdict> {
  const nodeIds = seg.ids.slice(first)
  const startStepIndex = seg.stepIdx[first] ?? 0
  if (focusables.every((f) => visited.has(f))) {
    cycles.push({ nodeIds, startStepIndex, escapable: true, includesAllFocusables: true })
    return { end: finish(rec.steps, cycles, 'cycle-includes-all') }
  }
  let out: string | null
  try {
    out = await driver.escapeTest()
  } catch {
    rec.recordFailure()
    return { end: finish(rec.steps, cycles, 'cdp-error') }
  }
  // Req 11.8: focus still inside the cycle, or no focus at all, is a trap.
  if (out === null || nodeIds.includes(out)) {
    cycles.push({ nodeIds, startStepIndex, escapable: false })
    return { end: await trapResult(driver, rec, cycles, nodeIds) }
  }
  cycles.push({ nodeIds, startStepIndex, escapable: true })
  await rec.record(out)
  visited.add(out)
  return { segment: { ids: [out], stepIdx: [rec.steps.length - 1] } }
}

async function nextFocus(driver: TabDriver, rec: StepRecorder, failures: number): Promise<{ id: string | null; failures: number }> {
  try {
    return { id: await driver.pressTab(), failures: 0 }
  } catch {
    rec.recordFailure()
    return { id: '', failures: failures + 1 }
  }
}

export async function runWalk(driver: TabDriver): Promise<WalkCore> {
  let focusables: string[]
  try {
    focusables = await driver.focusableIds()
  } catch {
    return finish([], [], 'cdp-error')
  }
  if (focusables.length === 0) return finish([], [], 'no-focusables')

  await driver.prepare().catch(() => undefined)
  const rec = await StepRecorder.create(driver, focusables)
  const cap = stepCap(focusables.length)
  const cycles: TabCycle[] = []
  const visited = new Set<string>()
  let seg: Segment = { ids: [], stepIdx: [] }
  let failures = 0

  while (rec.steps.length < cap) {
    const next = await nextFocus(driver, rec, failures)
    failures = next.failures
    if (next.id === '') {
      if (failures >= MAX_CONSECUTIVE_FAILURES) return finish(rec.steps, cycles, 'cdp-error')
      continue
    }
    if (next.id === null) return finish(rec.steps, cycles, rec.steps.length === 0 ? 'no-focus' : 'body')
    const id = next.id
    const repeatOfLast = id === rec.lastId
    await rec.record(id)
    // Focus staying on a frame or shadow host means it moves inside; not a cycle.
    if (repeatOfLast && (await isCompositeSafe(driver, id))) continue

    const first = seg.ids.indexOf(id)
    if (first === -1) {
      seg.ids.push(id)
      seg.stepIdx.push(rec.steps.length - 1)
      visited.add(id)
      continue
    }
    const verdict = await resolveCycle(driver, focusables, visited, seg, first, cycles, rec)
    if ('end' in verdict) return verdict.end
    seg = verdict.segment
  }
  return finish(rec.steps, cycles, 'step-cap')
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
 * and removing a temporary element. Without this, Tab would resume from wherever
 * the page left focus and skip everything before it.
 */
const RESET_FOCUS_EXPR = `(() => {
  const chain = []
  let a = document.activeElement
  for (let depth = 0; a && depth < 32; depth++) {
    chain.push(a)
    let next = null
    if (a.shadowRoot && a.shadowRoot.activeElement) next = a.shadowRoot.activeElement
    else if (a.tagName === 'IFRAME' || a.tagName === 'FRAME') { try { next = a.contentDocument && a.contentDocument.activeElement } catch (e) { next = null } }
    a = next
  }
  for (const el of chain.reverse()) if (typeof el.blur === 'function') el.blur()
  const host = document.body || document.documentElement
  const marker = document.createElement('span')
  marker.setAttribute('tabindex', '-1')
  host.insertBefore(marker, host.firstChild)
  marker.focus({ preventScroll: true })
  marker.remove()
  return true
})()`

/** Reads the focus-indicator styles plus the nearest opaque ancestor background (for 3:1 checks). */
const FOCUS_STYLES_FN = `function () {
  const cs = getComputedStyle(this)
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
  let adj = 'rgb(255, 255, 255)'
  for (let cur = parentOf(this); cur; cur = parentOf(cur)) {
    const c = cur.ownerDocument.defaultView.getComputedStyle(cur).backgroundColor
    if (alphaOf(c) === 1) { adj = c; break }
  }
  return {
    'outline-style': cs.outlineStyle,
    'outline-width': cs.outlineWidth,
    'outline-color': cs.outlineColor,
    'box-shadow': cs.boxShadow,
    'border-color': cs.borderColor,
    'background-color': cs.backgroundColor,
    'text-decoration': cs.textDecorationLine + ' ' + cs.textDecorationStyle + ' ' + cs.textDecorationColor,
    'adjacent-background-color': adj,
  }
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

function pageDriver(page: Page, cdp: Awaited<ReturnType<typeof openCdp>>): TabDriver {
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
    async prepare() {
      await cdp.send('Runtime.evaluate', { expression: RESET_FOCUS_EXPR })
    },
    async focusableIds() {
      return (await backendIdsOf(cdp, TABBABLES_EXPR)).filter((x): x is number => x != null).map(String)
    },
    async styles(id) {
      const objectId = await resolve(id)
      const { result } = (await cdp.send('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: FOCUS_STYLES_FN,
        returnByValue: true,
      })) as { result: { value: ComputedStyleMap } }
      return result.value
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
  }
}

/** Real-keyboard Tab walk. Call after networkidle and the 1500 ms settle window. */
export async function walkTabs(page: Page): Promise<TabWalkResult> {
  const walkStartedAtMs = Date.now()
  const cdp = await openCdp(page)
  try {
    // CDP inspector stylesheets are not blocked by a page's CSP (page.addStyleTag is).
    await injectInspectorStyles(cdp, NO_TRANSITIONS)
    const core = await runWalk(pageDriver(page, cdp))
    return { ...core, walkStartedAtMs }
  } finally {
    await cdp.detach().catch(() => undefined)
  }
}
