export const MAX_CONSECUTIVE_BLOCKS = 5
/** After this long without a block, the block counter starts again. */
export const QUIET_GAP_MS = 10 * 60 * 1000

export type GateInput = {
  anyDirty: boolean
  auditable: boolean
  criticalCount: number
  consecutiveBlocks: number
  sessionChanged: boolean
}

export type GateAction = 'skip' | 'pass' | 'block' | 'gave-up'

/** Total and pure. See design.md "Gate". */
export function decideGate(input: GateInput): GateAction {
  if (!input.anyDirty || !input.auditable) return 'skip'
  if (input.criticalCount <= 0) return 'pass'
  const blocks = input.sessionChanged ? 0 : input.consecutiveBlocks
  return blocks >= MAX_CONSECUTIVE_BLOCKS ? 'gave-up' : 'block'
}

export type GateState = {
  sessionId: string
  consecutiveBlocks: number
  lastBlockMs: number
  lastPassMs: number
}

export const EMPTY_GATE_STATE: GateState = { sessionId: '', consecutiveBlocks: 0, lastBlockMs: 0, lastPassMs: 0 }

/** Never throws. Anything malformed is the empty state. */
export function parseGateState(text: string): GateState {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ...EMPTY_GATE_STATE }
  }
  if (typeof data !== 'object' || data === null) return { ...EMPTY_GATE_STATE }
  const r = data as Record<string, unknown>
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
  return {
    sessionId: typeof r['sessionId'] === 'string' ? r['sessionId'] : '',
    consecutiveBlocks: Math.floor(num(r['consecutiveBlocks'])),
    lastBlockMs: num(r['lastBlockMs']),
    lastPassMs: num(r['lastPassMs']),
  }
}

/**
 * True when the stored block counter belongs to another session, or the last block is older than the quiet gap.
 * Without a session id in the payload, only the quiet gap applies.
 */
export function isSessionChanged(state: GateState, sessionId: string, nowMs: number): boolean {
  if (sessionId !== '' && state.sessionId !== sessionId) return true
  return state.lastBlockMs > 0 && nowMs - state.lastBlockMs > QUIET_GAP_MS
}
