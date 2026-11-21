import type { Page } from 'playwright'
import type { ComputedStyleMap, CycleResult, TabCycle, TabStep, TabWalkResult } from '../types.js'
import { activeElementBackendId, backendIdOfObject, backendIdsOf, openCdp } from './cdp.js'

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
}

type WalkCore = Omit<TabWalkResult, 'walkStartedAtMs'>

export async function runWalk(driver: TabDriver): Promise<WalkCore> {
  const focusables = await driver.focusableIds()
  if (focusables.length === 0) {
    return { steps: [], trapDetected: false, trapRegionNodeIds: [], stepCapReached: false, cycles: [], endReason: 'no-focusables' }
  }
  const cap = stepCap(focusables.length)

  // "before" = the unfocused look of each element, captured before the walk.
  const baseline = new Map<string, ComputedStyleMap>()
  for (const id of focusables) {
    try {
      baseline.set(id, await driver.styles(id))
    } catch {
      /* recorded as cdpError when the element is reached */
    }
  }

  const steps: TabStep[] = []
  const cycles: TabCycle[] = []
  const visited = new Set<string>()
  let segment: string[] = []
  let segmentStart = 0

  for (let i = 0; i < cap; i++) {
    const id = await driver.pressTab()
    if (id === null) {
      return { steps, trapDetected: false, trapRegionNodeIds: [], stepCapReached: false, cycles, endReason: steps.length === 0 ? 'no-focus' : 'body' }
    }
    let after: ComputedStyleMap = {}
    let cdpError = false
    try {
      after = await driver.styles(id)
    } catch {
      cdpError = true
    }
    steps.push({ index: i, backendDOMNodeId: id, focusSnapshot: { before: baseline.get(id) ?? {}, after }, cdpError })

    const firstSeen = segment.indexOf(id)
    if (firstSeen !== -1) {
      const cycleIds = segment.slice(firstSeen)
      const startStepIndex = segmentStart + firstSeen
      if (focusables.every((f) => visited.has(f))) {
        cycles.push({ nodeIds: cycleIds, startStepIndex, escapable: true, includesAllFocusables: true })
        return { steps, trapDetected: false, trapRegionNodeIds: [], stepCapReached: false, cycles, endReason: 'cycle-includes-all' }
      }
      const out = await driver.escapeTest()
      const escaped = out === null || !cycleIds.includes(out)
      cycles.push({ nodeIds: cycleIds, startStepIndex, escapable: escaped })
      if (!escaped) {
        const region = await driver.regionOf(cycleIds)
        const trapRegionNodeIds = [...new Set([...(region ? [region] : []), ...cycleIds])]
        return { steps, trapDetected: true, trapRegionNodeIds, stepCapReached: false, cycles, endReason: 'trap' }
      }
      // Escapable: segment the walk and keep going from the new focus position.
      segment = out === null ? [] : [out]
      segmentStart = steps.length
      if (out !== null) visited.add(out)
      continue
    }
    segment.push(id)
    visited.add(id)
  }
  return { steps, trapDetected: false, trapRegionNodeIds: [], stepCapReached: true, cycles, endReason: 'step-cap' }
}

const NO_TRANSITIONS = '*,*::before,*::after{transition:none!important;animation:none!important}'

const TABBABLES_EXPR = `(() => {
  const sel = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, [contenteditable=""], [contenteditable="true"], [tabindex]'
  return Array.from(document.querySelectorAll(sel)).filter((el) => {
    if (el.disabled) return false
    const ti = el.getAttribute('tabindex')
    if (ti !== null && Number(ti) < 0) return false
    if (el.closest('[inert]')) return false
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
  })
})()`

/** Reads the focus-indicator styles plus the nearest opaque ancestor background (for 3:1 checks). */
const FOCUS_STYLES_FN = `function () {
  const cs = getComputedStyle(this)
  let adj = 'rgb(255, 255, 255)'
  for (let cur = this.parentElement; cur; cur = cur.parentElement) {
    const c = getComputedStyle(cur).backgroundColor
    const m = c.match(/rgba?\(([^)]+)\)/)
    if (!m) continue
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    if ((p.length > 3 ? p[3] : 1) === 1) { adj = c; break }
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
  const resolve = async (id: string) => {
    const { object } = (await cdp.send('DOM.resolveNode', { backendNodeId: Number(id) })) as { object: { objectId: string } }
    return object.objectId
  }
  const settle = () => page.waitForTimeout(30)
  return {
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
      const id = await activeElementBackendId(cdp)
      return id === null ? null : String(id)
    },
    async escapeTest() {
      await page.keyboard.press('Escape')
      await settle()
      await page.keyboard.press('Shift+Tab')
      await settle()
      const id = await activeElementBackendId(cdp)
      return id === null ? null : String(id)
    },
    async regionOf(ids) {
      const objectIds = await Promise.all(ids.map((i) => resolve(i).catch(() => null)))
      const { result } = (await cdp.send('Runtime.callFunctionOn', {
        objectId: objectIds.find((o) => o) ?? undefined,
        functionDeclaration: REGION_FN,
        arguments: objectIds.map((o) => (o ? { objectId: o } : { value: null })),
        returnByValue: false,
      })) as { result: { objectId?: string } }
      if (!result.objectId) return null
      const id = await backendIdOfObject(cdp, result.objectId)
      return id === null ? null : String(id)
    },
  }
}

/** Real-keyboard Tab walk. Call after networkidle and the 1500 ms settle window. */
export async function walkTabs(page: Page): Promise<TabWalkResult> {
  await page.addStyleTag({ content: NO_TRANSITIONS })
  const walkStartedAtMs = Date.now()
  const cdp = await openCdp(page)
  try {
    const core = await runWalk(pageDriver(page, cdp))
    return { ...core, walkStartedAtMs }
  } finally {
    await cdp.detach().catch(() => undefined)
  }
}
