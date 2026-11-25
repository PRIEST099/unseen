import type { ClassifiedAudit, Haunting } from '@the-unseen/core'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeAudit } from '../test-support/audit-arbitraries'
import { makeHaunting } from '../test-support/haunting-arbitraries'
import { previewScore, withoutPreviewed } from '../utils/fix-preview'
import { CLEAN_SITE_MESSAGE, HauntingSidebar, PREVIEW_HINT } from './HauntingSidebar'
import type { SidebarPreview } from './HauntingSidebar'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

let container: HTMLDivElement
let root: Root

const HAUNTINGS: Haunting[] = [
  makeHaunting({ id: 'n-1', type: 'NamelessSpirit', severity: 'Wraith' }),
  makeHaunting({ id: 'n-2', type: 'NamelessSpirit', severity: 'Wraith' }),
  makeHaunting({ id: 'f-1', type: 'TheFog', severity: 'Restless' }),
]
const AUDIT = makeAudit(HAUNTINGS, [], previewScore(HAUNTINGS))
const LABELS = new Map(HAUNTINGS.map((haunting) => [haunting.id, `Label ${haunting.id}`] as const))

/** What SpiritSightView hands the sidebar while `takenOut` are previewed as fixed. */
function previewOf(takenOut: string[], onReset = (): void => undefined): { audit: ClassifiedAudit; preview: SidebarPreview } {
  const ids = new Set(takenOut)
  const remaining = withoutPreviewed(AUDIT.hauntings, ids)
  return {
    audit: { ...AUDIT, hauntings: remaining, score: previewScore(remaining) },
    preview: { auditedScore: AUDIT.score, audited: AUDIT.hauntings, takenOut: ids, onReset },
  }
}

function render(audit: ClassifiedAudit, preview?: SidebarPreview): void {
  act(() => {
    root.render(<HauntingSidebar audit={audit} labels={LABELS} onOpen={() => undefined} onActiveChange={() => undefined} preview={preview} />)
  })
}

const slot = (): HTMLElement | null => container.querySelector('.preview-slot')
const banner = (): HTMLElement | null => container.querySelector('.preview-banner')
const buttonsNamed = (name: string): HTMLButtonElement[] =>
  Array.from(container.querySelectorAll('button')).filter((button) => button.textContent === name)
const toggle = (name: string): HTMLButtonElement | undefined =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('.group-toggle')).find((button) => button.textContent?.includes(name))

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('HauntingSidebar preview slot', () => {
  it('is always rendered: the hint while idle, with hidden reserve copies and no usable reset button', () => {
    render(AUDIT)
    expect(slot()).not.toBeNull()
    expect(slot()?.querySelector('.preview-hint')?.textContent).toBe(PREVIEW_HINT)
    expect(banner()).toBeNull()
    const reserves = Array.from(container.querySelectorAll('.preview-reserve'))
    expect(reserves).toHaveLength(2)
    for (const reserve of reserves) {
      expect(reserve.getAttribute('aria-hidden')).toBe('true')
      const button = reserve.querySelector('button')
      expect(button?.disabled).toBe(true)
      expect(button?.tabIndex).toBe(-1)
    }
    // Only the hidden reserve copies hold a reset button.
    expect(buttonsNamed('Reset preview').every((button) => button.closest('.preview-reserve') !== null)).toBe(true)
  })

  it('reserves the widest count, with and without hauntings left', () => {
    render(AUDIT)
    const [left, none] = Array.from(container.querySelectorAll('.preview-reserve p:not(.preview-audited)')).map((p) => p.textContent)
    expect(left).toContain('88 hauntings are taken out')
    expect(none).toContain('No hauntings are left in this view: all 88 are taken out')
  })

  it('swaps the hint for the notice during a preview, in the same slot, and resets from it', () => {
    const onReset = vi.fn()
    const { audit, preview } = previewOf(['n-1'], onReset)
    render(audit, preview)
    expect(slot()?.querySelector('.preview-hint')).toBeNull()
    expect(banner()?.parentElement).toBe(slot())
    expect(banner()?.getAttribute('aria-hidden')).toBeNull()
    expect(banner()?.textContent).toContain(`Audited score: ${AUDIT.score}/100`)
    expect(banner()?.textContent).toContain('Preview only. 1 haunting is taken out of this view')
    expect(container.querySelector('.score')?.textContent).toContain('Preview score')

    const reset = Array.from(banner()?.querySelectorAll('button') ?? []).find((button) => button.textContent === 'Reset preview')
    expect(reset?.disabled).toBe(false)
    act(() => reset?.click())
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('says the preview tells nothing about the page once every haunting is taken out', () => {
    const { audit, preview } = previewOf(['n-1', 'n-2', 'f-1'])
    render(audit, preview)
    expect(banner()?.textContent).toContain('No hauntings are left in this view: all 3 are taken out')
    expect(banner()?.textContent).toContain('says nothing about the page itself')
    expect(container.textContent).not.toContain(CLEAN_SITE_MESSAGE)
    expect(container.textContent).not.toMatch(/compliant/i)
  })

  it('has no slot on a clean audit, which shows the clean-site text instead', () => {
    render(makeAudit([], [], 0))
    expect(slot()).toBeNull()
    expect(container.querySelector('.clean-note')?.textContent).toBe(CLEAN_SITE_MESSAGE)
  })
})

describe('HauntingSidebar groups during a preview', () => {
  it('keeps a previewed instance in its row, struck through and not a button, and counts what is left', () => {
    const { audit, preview } = previewOf(['n-1'])
    render(audit, preview)
    const group = toggle('Nameless Spirit')
    act(() => group?.click())
    expect(group?.querySelector('.group-count')?.textContent).toBe('1')
    expect(group?.querySelector('.group-severity')?.textContent).toBe('Wraith')

    const list = container.querySelector('#haunting-group-NamelessSpirit')
    const rows = Array.from(list?.querySelectorAll(':scope > li') ?? [])
    expect(rows).toHaveLength(2)
    const takenOut = rows[0]?.querySelector('.instance-taken-out')
    expect(takenOut?.textContent).toBe('Label n-1, taken out in this preview')
    expect(rows[0]?.querySelector('button')).toBeNull()
    expect(rows[1]?.querySelector('.instance-button')?.textContent).toBe('Label n-2')
  })

  it('keeps a fully previewed group as a toggle with a zero count and an unread severity placeholder', () => {
    const { audit, preview } = previewOf(['f-1'])
    render(audit, preview)
    const group = toggle('The Fog')
    expect(group).toBeDefined()
    expect(group?.querySelector('.group-count')?.textContent).toBe('0')
    const severity = group?.querySelector('.group-severity')
    expect(severity?.classList.contains('is-cleared')).toBe(true)
    expect(severity?.getAttribute('aria-hidden')).toBe('true')
    act(() => group?.click())
    expect(container.querySelectorAll('#haunting-group-TheFog .instance-taken-out')).toHaveLength(1)
  })

  it('goes back to plain instance buttons after a reset', () => {
    const { audit, preview } = previewOf(['n-1'])
    render(audit, preview)
    render(AUDIT)
    expect(container.querySelectorAll('.instance-taken-out')).toHaveLength(0)
    expect(container.querySelectorAll('#haunting-group-NamelessSpirit .instance-button')).toHaveLength(2)
    expect(toggle('Nameless Spirit')?.querySelector('.group-count')?.textContent).toBe('2')
  })
})
