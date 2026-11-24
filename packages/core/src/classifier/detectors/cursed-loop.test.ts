import { describe, expect, it } from 'vitest'
import { baseRaw, BODY_ID, dom, walk } from '../../../tests/classifier/builders.js'
import type { RawAudit, TabCycle } from '../../types.js'
import { detectCursedLoop } from './cursed-loop.js'

const cycle = (over: Partial<TabCycle> = {}): TabCycle => ({
  nodeIds: ['6', '7'],
  startStepIndex: 0,
  escapable: false,
  includesAllFocusables: false,
  allFocusablesVisited: false,
  ...over,
})

const page = (cycles: TabCycle[], trapDetected = true): RawAudit =>
  baseRaw({
    domNodes: { ...baseRaw().domNodes, 5: dom('div', BODY_ID, { role: 'dialog' }), 6: dom('input', 5), 7: dom('button', 5) },
    tabWalkResult: walk({ trapDetected, trapRegionNodeIds: ['5', '6', '7'], cycles }),
  })

describe('detectCursedLoop', () => {
  it('flags a non-escapable cycle that does not include all focusables', () => {
    const found = detectCursedLoop(page([cycle()]))
    expect(found).toHaveLength(1)
    expect(found[0]?.type).toBe('CursedLoop')
    expect(found[0]?.wcag.map((c) => c.id)).toEqual(['2.1.2'])
  })

  it('nodeIds is trapRegionNodeIds with the region first; box, snippet and id come from the region', () => {
    const [h] = detectCursedLoop(page([cycle()]))
    expect(h?.nodeIds).toEqual([5, 6, 7])
    expect(h?.nodeIds[0]).toBe(5)
    expect(h?.htmlSnippet).toBe('<div role="dialog">')
    expect(h?.id).toMatch(/^CursedLoop-/)
    expect(h?.soundCue).toBe('chime')
    expect(h?.speech).toBeUndefined()
  })

  it('does not flag an escapable cycle', () => {
    expect(detectCursedLoop(page([cycle({ escapable: true })]))).toEqual([])
  })

  it('does not flag a cycle that includes all focusables', () => {
    expect(detectCursedLoop(page([cycle({ includesAllFocusables: true })]))).toEqual([])
  })

  it('does not flag a cycle whose escape test did not run (escapable unset)', () => {
    expect(detectCursedLoop(page([cycle({ escapable: undefined })]))).toEqual([])
  })

  it('needs trapDetected', () => {
    expect(detectCursedLoop(page([cycle()], false))).toEqual([])
  })

  it('emits at most one instance even with several trapped cycles', () => {
    expect(detectCursedLoop(page([cycle(), cycle({ nodeIds: ['5', '6'] })]))).toHaveLength(1)
  })

  it('a mix of an escapable and a trapped cycle still reports the trap', () => {
    expect(detectCursedLoop(page([cycle({ escapable: true }), cycle()]))).toHaveLength(1)
  })

  it('is silent when no region id was recorded', () => {
    const raw = page([cycle()])
    expect(detectCursedLoop({ ...raw, tabWalkResult: { ...raw.tabWalkResult, trapRegionNodeIds: [] } })).toEqual([])
  })
})
