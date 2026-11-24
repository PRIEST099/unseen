import { describe, expect, it } from 'vitest'
import { makeHaunting } from '../test-support/haunting-arbitraries'
import { pickSpokenHaunting, speakWhisper, WHISPER_PITCH, WHISPER_RATE } from './whisper-speech'

describe('pickSpokenHaunting', () => {
  it('prefers the first Wraith with speech', () => {
    const restless = makeHaunting({ id: 'r', severity: 'Restless', speech: 'link' })
    const silentWraith = makeHaunting({ id: 's', severity: 'Wraith' })
    const wraith = makeHaunting({ id: 'w', severity: 'Wraith', speech: 'button' })
    expect(pickSpokenHaunting([restless, silentWraith, wraith])?.id).toBe('w')
  })

  it('falls back to the first Restless one, and to nothing', () => {
    const restless = makeHaunting({ id: 'r', severity: 'Restless', speech: 'link' })
    expect(pickSpokenHaunting([makeHaunting({ severity: 'Banished', speech: 'x' }), restless])?.id).toBe('r')
    expect(pickSpokenHaunting([makeHaunting({ severity: 'Banished', speech: 'x' })])).toBeUndefined()
    expect(pickSpokenHaunting([])).toBeUndefined()
  })
})

describe('speakWhisper', () => {
  it('keeps to the whisper limits', () => {
    expect(WHISPER_PITCH).toBeLessThanOrEqual(0.8)
    expect(WHISPER_RATE).toBeLessThanOrEqual(0.85)
  })

  it('does nothing when speech synthesis is unavailable (jsdom)', () => {
    expect(speakWhisper('button')).toBe(false)
  })
})
