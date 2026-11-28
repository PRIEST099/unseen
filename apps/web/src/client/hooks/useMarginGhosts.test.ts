import { afterEach, describe, expect, it } from 'vitest'
import { resetPlannedSpots } from '../utils/ghost-spots'
import type { Placement, Spot } from '../utils/ghost-spots'
import { fitGhosts, isLanternFocus, markHidden } from './useMarginGhosts'
import type { GhostState } from './useMarginGhosts'

const placement: Placement = {
  innerWidth: 1440,
  viewWidth: 1440,
  height: 900,
  size: 150,
  minY: 104,
  panelLeft: 144,
  panelRight: 1296,
  panelMinY: 112,
  panelMaxY: 788,
  footerTop: 824,
}

const spot = (pos: number, edge: Spot['edge'] = 'left'): Spot => ({ edge, anchor: 'window', pos })
const ghost = (id: number, hidden: boolean, at: Spot = spot(200 + id * 200)): GhostState => ({ id, spot: at, hidden, instant: true })

afterEach(() => resetPlannedSpots())

describe('markHidden', () => {
  it('returns the very same list when every named ghost is already hidden, or none is named', () => {
    const list = [ghost(0, true), ghost(1, false)]
    expect(markHidden(list, new Set([0]))).toBe(list)
    expect(markHidden(list, new Set())).toBe(list)
    expect(markHidden(list, new Set([7]))).toBe(list)
  })

  it('hides only the named ghosts that were showing', () => {
    const list = [ghost(0, false), ghost(1, false), ghost(2, true)]
    const next = markHidden(list, new Set([1, 2]))
    expect(next).not.toBe(list)
    expect(next.map((entry) => entry.hidden)).toEqual([false, true, true])
    expect(next[0]).toBe(list[0])
  })
})

describe('fitGhosts', () => {
  it('plans nothing for a count of 0 and returns the same empty list', () => {
    const empty: GhostState[] = []
    expect(fitGhosts(empty, 0, placement)).toBe(empty)
    expect(fitGhosts([ghost(0, false)], 0, placement)).toEqual([])
  })

  it('plans the first ghosts in place, at the window edges', () => {
    const planned = fitGhosts([], 3, placement)
    expect(planned).toHaveLength(3)
    for (const entry of planned) {
      expect(entry.instant).toBe(true)
      expect(entry.spot.anchor).toBe('window')
    }
  })

  it('leaves a list alone when it fits (the same list, so nothing renders again)', () => {
    const planned = fitGhosts([], 3, placement)
    expect(fitGhosts(planned, 3, placement)).toBe(planned)
  })

  it('moves a showing ghost whose spot no longer fits, and gives it a spot that slides in', () => {
    const list = [ghost(0, false, spot(700))]
    const squat: Placement = { ...placement, height: 500 }
    const next = fitGhosts(list, 1, squat)
    expect(next).not.toBe(list)
    expect(next[0]?.instant).toBe(false)
    expect(next[0]?.spot).not.toEqual(list[0]?.spot)
  })

  it('leaves a hidden ghost alone: nobody sees it, and it picks a fresh spot when it returns', () => {
    const list = [ghost(0, true, spot(700))]
    const squat: Placement = { ...placement, height: 500 }
    expect(fitGhosts(list, 1, squat)).toBe(list)
  })

  it('drops a showing ghost for which no spot shows its face, and adds none (a 24 px margin)', () => {
    const slim: Placement = { ...placement, innerWidth: 1100, viewWidth: 1100, panelLeft: 24, panelRight: 1076 }
    const list = [ghost(0, false, spot(300)), ghost(1, false, spot(300, 'right'))]
    expect(fitGhosts(list, 3, slim)).toEqual([])
    expect(fitGhosts([], 3, slim)).toEqual([])
  })

  it('adds ghosts when the window grows, and drops the last ones when it shrinks, keeping ids', () => {
    const planned = fitGhosts([], 2, placement)
    const grown = fitGhosts(planned, 3, placement)
    expect(grown).toHaveLength(3)
    expect(grown.slice(0, 2)).toEqual(planned)
    expect(grown[2]?.instant).toBe(false)
    expect(fitGhosts(grown, 2, placement).map((entry) => entry.id)).toEqual([0, 1])
  })
})

describe('isLanternFocus', () => {
  it('ignores a container that only takes focus from code (tabindex -1)', () => {
    const main = document.createElement('main')
    main.tabIndex = -1
    document.body.append(main)
    main.focus()
    expect(isLanternFocus(main)).toBe(false)
    main.remove()
  })
})
