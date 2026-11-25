import type { BoundingBox, Haunting, TabCycle, TabStep, TabWalkResult } from '@the-unseen/core'

/** Time the ghost spends on each step at 1x, in ms (requirement 15.2, 15.3). */
export const STEP_MS = 300
/** Fade of a revealed Lost Soul, in ms. Instant under reduced motion. */
export const SOUL_FADE_MS = 600
/** An escapable cycle is circled this many times, then the ghost breaks free (requirement 15.5). */
export const ESCAPABLE_LAPS = 2
/** A keyboard trap is circled this many times, then the walk stops (requirement 15.6). */
export const TRAP_LAPS = 3

export const WALK_SPEED_OPTIONS = [0.5, 1, 2] as const
export type WalkSpeed = (typeof WALK_SPEED_OPTIONS)[number]

export const TRAPPED_TEXT = 'Trapped: keyboard users cannot leave this dialog'

/** Time between two steps. Never 0: an instant walk would finish at once and loop forever. */
export function stepIntervalMs(speed: number): number {
  return Math.round(STEP_MS / Math.max(speed, 0.1))
}

/** Reads a `<select>` value back into one of the offered speeds (1x when unknown). */
export function parseWalkSpeed(value: string): WalkSpeed {
  const parsed = Number(value)
  return WALK_SPEED_OPTIONS.find((option) => option === parsed) ?? 1
}

export function walkSpeedLabel(speed: WalkSpeed): string {
  return `${speed}×`
}

/** One position of the ghost: a recorded Tab step, or an extra lap the walk adds to a cycle. */
export type WalkFrame = {
  /** The recorded Tab step this frame shows (or, for an extra lap, the step that closed the cycle). */
  stepIndex: number
  nodeId: number
  cycle?: { lap: number; laps: number; trap: boolean }
  /** The last frame of a keyboard trap: the walk stops here. */
  trapped?: true
}

export type WalkTrap = { haunting: Haunting; entryFrame: number }

export type WalkModel = {
  frames: readonly WalkFrame[]
  /** Number of recorded Tab steps ("Step i of n"). */
  stepCount: number
  trap: WalkTrap | null
}

type CycleSpan = { members: number[]; start: number; closing: number; laps: number; trap: boolean }

function toNodeId(value: string): number {
  return Number(value)
}

/** The recorded step on which the cycle comes back to its first member, or null when it never does. */
function closingStep(steps: readonly TabStep[], cycle: TabCycle): number | null {
  const first = cycle.nodeIds[0]
  if (first === undefined) return null
  for (let index = cycle.startStepIndex + 1; index < steps.length; index += 1) {
    if (steps[index]?.backendDOMNodeId === first) return index
  }
  return null
}

function spanFor(steps: readonly TabStep[], cycle: TabCycle, laps: number, trap: boolean): CycleSpan | null {
  const closing = closingStep(steps, cycle)
  if (closing === null) return null
  return { members: cycle.nodeIds.map(toNodeId), start: cycle.startStepIndex, closing, laps, trap }
}

function escapableIds(cycles: readonly TabCycle[]): ReadonlySet<string> {
  return new Set(cycles.filter((cycle) => cycle.escapable === true).flatMap((cycle) => cycle.nodeIds))
}

/** The inescapable Cursed Loop the walk gets stuck in, with the recorded cycle that matches it. */
function findTrap(steps: readonly TabStep[], cycles: readonly TabCycle[], hauntings: readonly Haunting[]): { haunting: Haunting; span: CycleSpan | null } | null {
  const escapable = escapableIds(cycles)
  const candidates = hauntings.filter((haunting) => haunting.type === 'CursedLoop' && !haunting.nodeIds.some((id) => escapable.has(String(id))))
  for (const haunting of candidates) {
    const ids = new Set(haunting.nodeIds.map(String))
    const cycle = cycles.find((candidate) => candidate.escapable !== true && candidate.nodeIds.some((id) => ids.has(id)))
    const span = cycle === undefined ? null : spanFor(steps, cycle, TRAP_LAPS, true)
    if (span !== null || steps.some((step) => ids.has(step.backendDOMNodeId))) return { haunting, span }
  }
  return null
}

/** The frames that add the missing laps after the cycle's closing frame. */
function extraLapFrames(span: CycleSpan): WalkFrame[] {
  const frames: WalkFrame[] = []
  const rest = [...span.members.slice(1), span.members[0] ?? 0]
  for (let lap = 2; lap <= span.laps; lap += 1) {
    for (const nodeId of rest) frames.push({ stepIndex: span.closing, nodeId, cycle: { lap, laps: span.laps, trap: span.trap } })
  }
  return frames
}

/** Fallback when a trap has no matching recorded cycle: stop after the last step inside it. */
function truncateAtLastTrapStep(frames: WalkFrame[], haunting: Haunting): WalkFrame[] {
  const ids = new Set(haunting.nodeIds)
  let last = -1
  frames.forEach((frame, index) => {
    if (ids.has(frame.nodeId)) last = index
  })
  if (last < 0) return frames
  const kept = frames.slice(0, last + 1)
  const final = kept[last]
  if (final !== undefined) kept[last] = { ...final, trapped: true }
  return kept
}

function applySpans(steps: readonly TabStep[], spans: readonly CycleSpan[]): WalkFrame[] {
  const trapSpan = spans.find((span) => span.trap)
  const frames: WalkFrame[] = []
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
    if (trapSpan !== undefined && stepIndex > trapSpan.closing) break
    const step = steps[stepIndex]
    if (step === undefined) continue
    const span = spans.find((candidate) => stepIndex >= candidate.start && stepIndex <= candidate.closing)
    const frame: WalkFrame = { stepIndex, nodeId: toNodeId(step.backendDOMNodeId) }
    if (span !== undefined) frame.cycle = { lap: 1, laps: span.laps, trap: span.trap }
    frames.push(frame)
    if (span !== undefined && stepIndex === span.closing) frames.push(...extraLapFrames(span))
  }
  if (trapSpan !== undefined) {
    const final = frames[frames.length - 1]
    if (final !== undefined) frames[frames.length - 1] = { ...final, trapped: true }
  }
  return frames
}

/**
 * Turns the recorded Tab walk into the frames the ghost visits. An escapable cycle is circled twice
 * (one recorded lap plus one added) and the ghost then breaks free. An inescapable Cursed Loop is
 * circled three times and the frames end there, so the walk stops with the ghost stuck inside.
 */
export function buildWalkModel(walk: TabWalkResult, hauntings: readonly Haunting[]): WalkModel {
  const { steps, cycles } = walk
  const spans: CycleSpan[] = []
  for (const cycle of cycles) {
    if (cycle.escapable !== true) continue
    const span = spanFor(steps, cycle, ESCAPABLE_LAPS, false)
    if (span !== null) spans.push(span)
  }
  const trap = findTrap(steps, cycles, hauntings)
  if (trap !== null && trap.span !== null) spans.push(trap.span)
  let frames = applySpans(steps, spans)
  if (trap !== null && trap.span === null) frames = truncateAtLastTrapStep(frames, trap.haunting)
  const trapIds = trap === null ? null : new Set(trap.haunting.nodeIds)
  const entryFrame = trapIds === null ? -1 : frames.findIndex((frame) => frame.cycle?.trap === true || trapIds.has(frame.nodeId))
  const hasTrapFrame = frames.some((frame) => frame.trapped === true)
  return {
    frames,
    stepCount: steps.length,
    trap: trap !== null && entryFrame >= 0 && hasTrapFrame ? { haunting: trap.haunting, entryFrame } : null,
  }
}

export function boxesByNode(boxes: readonly BoundingBox[]): ReadonlyMap<number, BoundingBox> {
  const lookup = new Map<number, BoundingBox>()
  for (const box of boxes) if (!lookup.has(box.backendDOMNodeId)) lookup.set(box.backendDOMNodeId, box)
  return lookup
}

/** The box the ghost stands on at `index`: the nearest earlier frame that has a box when this one has none. */
export function ghostBoxAt(frames: readonly WalkFrame[], boxes: ReadonlyMap<number, BoundingBox>, index: number): BoundingBox | null {
  for (let current = Math.min(index, frames.length - 1); current >= 0; current -= 1) {
    const frame = frames[current]
    const box = frame === undefined ? undefined : boxes.get(frame.nodeId)
    if (box !== undefined) return box
  }
  return null
}

type Point = { x: number; y: number }

/** Reading order: top to bottom, then left to right. */
function readsBefore(a: Point, b: Point): boolean {
  return a.y < b.y || (a.y === b.y && a.x < b.x)
}

/**
 * True once a step box has reached or passed `soul` in reading order. The first step that does so
 * is the one that moves the ghost past it, so the soul lies between that step and the one before
 * (requirement 15.4); a tie counts as passed, so a soul that shares a corner with a step still shows.
 */
export function hasPassed(stepBox: Point, soul: Point): boolean {
  return !readsBefore(stepBox, soul)
}

function soulBox(soul: Haunting): BoundingBox | null {
  return soul.type === 'LostSoul' ? soul.box : null
}

/**
 * For each frame, the Lost Souls that become visible there (each soul once): the souls the ghost
 * passes on its way to that frame's box. When a walk that is not stuck in a trap reaches its last
 * frame, souls below the last step box are revealed too, so every soul Tab skipped is shown.
 */
export function planSoulReveals(
  frames: readonly WalkFrame[],
  boxes: ReadonlyMap<number, BoundingBox>,
  hauntings: readonly Haunting[],
  trapped: boolean,
): ReadonlyArray<readonly Haunting[]> {
  const souls = hauntings.filter((haunting) => soulBox(haunting) !== null)
  const plan: Haunting[][] = frames.map(() => [])
  const revealed = new Set<string>()
  const reveal = (frameIndex: number, matches: (soul: BoundingBox) => boolean): void => {
    for (const soul of souls) {
      const box = soulBox(soul)
      if (box === null || revealed.has(soul.id) || !matches(box)) continue
      revealed.add(soul.id)
      plan[frameIndex]?.push(soul)
    }
  }
  frames.forEach((frame, frameIndex) => {
    const box = boxes.get(frame.nodeId)
    if (box !== undefined) reveal(frameIndex, (soul) => hasPassed(box, soul))
  })
  if (!trapped && frames.length > 0) reveal(frames.length - 1, () => true)
  return plan
}

/** Ids of the Lost Souls visible at frame `index` (those revealed at or before it). */
export function revealedSoulIds(plan: ReadonlyArray<readonly Haunting[]>, index: number): ReadonlySet<string> {
  const ids = new Set<string>()
  for (let frame = 0; frame <= index && frame < plan.length; frame += 1) {
    for (const soul of plan[frame] ?? []) ids.add(soul.id)
  }
  return ids
}

/** The speech of each node: the first line the speech track has for it. */
export function speechByNode(track: ReadonlyArray<{ backendDOMNodeId: number; text: string }>): ReadonlyMap<number, string> {
  const lookup = new Map<number, string>()
  for (const line of track) if (!lookup.has(line.backendDOMNodeId)) lookup.set(line.backendDOMNodeId, line.text)
  return lookup
}

/** "Step {i} of {n}: {speech of the focused node}" (requirement 15.8). */
export function stepCaption(frame: WalkFrame, stepCount: number, speech: ReadonlyMap<number, string>): string {
  return `Step ${frame.stepIndex + 1} of ${stepCount}: ${speech.get(frame.nodeId) ?? 'element'}`
}

/** The event lines for one frame: skipped Lost Souls, cycle laps and the trap. */
export function frameEvents(frame: WalkFrame, skippedLabels: readonly string[]): string[] {
  const lines: string[] = []
  if (skippedLabels.length > 0) lines.push(`Lost Soul skipped: ${skippedLabels.join(', ')}`)
  if (frame.cycle !== undefined && !frame.cycle.trap) lines.push(`Escapable cycle: lap ${frame.cycle.lap} of ${frame.cycle.laps}, then breaking free`)
  if (frame.cycle?.trap === true) lines.push(`Cursed Loop: lap ${frame.cycle.lap} of ${frame.cycle.laps}`)
  if (frame.trapped === true) lines.push('Cursed Loop: trapped', TRAPPED_TEXT)
  return lines
}
