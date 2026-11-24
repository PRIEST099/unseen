import { describe, expect, it } from 'vitest'
import { baseRaw, HTML_ID } from '../../../tests/classifier/builders.js'
import { detectSilentTongue } from './silent-tongue.js'

const withLang = (htmlLang: string | null): ReturnType<typeof baseRaw> => {
  const raw = baseRaw()
  return { ...raw, pageMetadata: { ...raw.pageMetadata, htmlLang } }
}

describe('detectSilentTongue', () => {
  it('flags a missing lang', () => {
    expect(detectSilentTongue(withLang(null))).toHaveLength(1)
  })

  it('flags invalid values', () => {
    for (const bad of ['', 'x', 'english', 'e1', 'en_US', 'en-', 'en US', '12', 'en-x']) {
      expect(detectSilentTongue(withLang(bad)), bad).toHaveLength(1)
    }
  })

  it('accepts valid tags', () => {
    for (const ok of ['en', 'en-US', 'fr-CA', 'zh-Hans-CN', 'haw', 'es-419', 'EN']) {
      expect(detectSilentTongue(withLang(ok)), ok).toEqual([])
    }
  })

  it('nodeIds is [htmlBackendDOMNodeId], with a garbled-whisper cue and no speech', () => {
    const [h] = detectSilentTongue(withLang(null))
    expect(h?.nodeIds).toEqual([HTML_ID])
    expect(h?.soundCue).toBe('garbled-whisper')
    expect(h?.speech).toBeUndefined()
    expect(h?.wcag.map((c) => c.id)).toEqual(['3.1.1'])
    expect(h?.id).toMatch(/^SilentTongue-[0-9a-f]{8}$/)
  })

  it('names the bad value in the explanation', () => {
    expect(detectSilentTongue(withLang('zz zz'))[0]?.explanation).toContain('"zz zz"')
  })
})
