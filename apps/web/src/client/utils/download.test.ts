import { describe, expect, it, vi } from 'vitest'
import { downloadBlob } from './download'
import { manualCheckHelp, manualCheckLabel } from './manual-check'

describe('downloadBlob', () => {
  it('clicks a temporary download link and revokes the object URL afterwards', () => {
    const events: string[] = []
    const clicks: Array<{ href: string; download: string }> = []
    const scheduled: Array<() => void> = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.getAttribute('href') ?? '', download: this.download })
      events.push(`click (link attached: ${document.body.contains(this)})`)
    })

    downloadBlob(new Blob(['x']), 'unseen-audit-a-1.md', {
      document,
      createObjectURL: () => {
        events.push('create')
        return 'blob:test'
      },
      revokeObjectURL: (url) => events.push(`revoke ${url}`),
      schedule: (callback) => scheduled.push(callback),
    })
    click.mockRestore()

    expect(clicks).toEqual([{ href: 'blob:test', download: 'unseen-audit-a-1.md' }])
    expect(document.querySelector('a[download]')).toBeNull()
    expect(events).toEqual(['create', 'click (link attached: true)'])
    scheduled.forEach((callback) => callback())
    expect(events).toEqual(['create', 'click (link attached: true)', 'revoke blob:test'])
  })
})

describe('manual check labels', () => {
  it('words each known reason and passes an unknown one through', () => {
    expect(manualCheckLabel('contrast-uncertain')).toBe('Contrast uncertain: image or gradient background')
    expect(manualCheckLabel('off-screen-content')).toMatch(/^Off-screen content/)
    expect(manualCheckLabel('focus-style-unavailable')).toMatch(/^Focus style unavailable/)
    expect(manualCheckLabel('something-new')).toBe('something-new')
    expect(manualCheckHelp('something-new')).not.toBe('')
  })
})
