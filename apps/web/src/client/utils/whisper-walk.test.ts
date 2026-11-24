import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { WHISPER_PITCH, WHISPER_RATE } from './whisper-speech'
import {
  captionDelayMs,
  clampIndex,
  counterText,
  estimateSpeechMs,
  MIN_CAPTION_MS,
  MIN_WHISPER_RATE,
  parseSpeed,
  pauseBetweenMs,
  SPEED_OPTIONS,
  utteranceTimeoutMs,
  whisperRate,
} from './whisper-walk'

describe('whisperRate', () => {
  it('maps the offered speeds to clamp(0.85 * speed, 0.4, 0.85)', () => {
    expect(whisperRate(1)).toBeCloseTo(0.85)
    expect(whisperRate(0.75)).toBeCloseTo(0.6375)
    expect(whisperRate(0.5)).toBeCloseTo(0.425)
    expect(WHISPER_PITCH).toBeLessThanOrEqual(0.8)
  })

  it('stays within [0.4, 0.85] for every positive speed, and never decreases as speed rises', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 8, noNaN: true }), fc.double({ min: 0.01, max: 8, noNaN: true }), (a, b) => {
        const [slow, fast] = a <= b ? [a, b] : [b, a]
        const rate = whisperRate(fast)
        expect(rate).toBeLessThanOrEqual(WHISPER_RATE)
        expect(rate).toBeGreaterThanOrEqual(MIN_WHISPER_RATE)
        expect(whisperRate(slow)).toBeLessThanOrEqual(rate)
      }),
    )
  })
})

describe('captions-only and timeout timing', () => {
  it('uses max(1500 ms, 60 ms x characters)', () => {
    expect(captionDelayMs('')).toBe(MIN_CAPTION_MS)
    expect(captionDelayMs('x'.repeat(25))).toBe(1500)
    expect(captionDelayMs('x'.repeat(100))).toBe(6000)
  })

  it('times an utterance out after at least twice the caption delay', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), fc.constantFrom(...SPEED_OPTIONS), (text, speed) => {
        const rate = whisperRate(speed)
        expect(estimateSpeechMs(text, rate)).toBeGreaterThanOrEqual(captionDelayMs(text))
        expect(utteranceTimeoutMs(text, rate)).toBeGreaterThanOrEqual(2 * captionDelayMs(text))
      }),
    )
  })
})

describe('pauseBetweenMs', () => {
  it('shortens as the speed rises', () => {
    expect(pauseBetweenMs(0.5)).toBeGreaterThan(pauseBetweenMs(0.75))
    expect(pauseBetweenMs(0.75)).toBeGreaterThan(pauseBetweenMs(1))
    expect(pauseBetweenMs(2)).toBeLessThan(pauseBetweenMs(1))
  })
})

describe('index and speed helpers', () => {
  it('clamps an index into the track and tolerates an empty track', () => {
    fc.assert(
      fc.property(fc.integer({ min: -50, max: 500 }), fc.integer({ min: 1, max: 100 }), (index, length) => {
        const result = clampIndex(index, length)
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThanOrEqual(length - 1)
      }),
    )
    expect(clampIndex(3, 0)).toBe(0)
  })

  it('parses only the offered speeds and falls back to 1x', () => {
    expect(parseSpeed('0.5')).toBe(0.5)
    expect(parseSpeed('0.75')).toBe(0.75)
    expect(parseSpeed('1')).toBe(1)
    expect(parseSpeed('2')).toBe(1)
    expect(parseSpeed('banana')).toBe(1)
  })

  it('counts from one', () => {
    expect(counterText(0, 12)).toBe('1 of 12')
  })
})
