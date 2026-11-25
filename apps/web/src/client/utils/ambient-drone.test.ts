import * as fc from 'fast-check'
import { describe, expect, it, test } from 'vitest'
import {
  DRONE_DELAY_S,
  DRONE_FADE_IN_S,
  DRONE_FEEDBACK,
  DRONE_FREQUENCIES_HZ,
  DRONE_LOWPASS_HZ,
  DRONE_MASTER_CAP,
  DRONE_PEAK_GAIN,
  DRONE_WET,
  clampDroneGain,
  planFadeIn,
  planFadeOut,
  shouldPlayDrone,
} from './ambient-drone'

const time = fc.double({ min: 0, max: 100_000, noNaN: true })

describe('shouldPlayDrone', () => {
  it('plays only when sound is on and reduced motion is off', () => {
    expect(shouldPlayDrone(true, false)).toBe(true)
    expect(shouldPlayDrone(true, true)).toBe(false)
    expect(shouldPlayDrone(false, false)).toBe(false)
    expect(shouldPlayDrone(false, true)).toBe(false)
  })

  /** Validates: Requirements 19.6, 20.5, 33.2 */
  test('property: the drone plays exactly when sound is on and reduced motion is off', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), fc.boolean(), async (sound, reduced) => {
        expect(shouldPlayDrone(sound, reduced)).toBe(sound && !reduced)
      }),
      { numRuns: 100 },
    )
  })

  /** Validates: Requirements 19.6, 20.5 */
  test('property: reduced motion never plays the drone, whatever the sound setting', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (sound) => {
        expect(shouldPlayDrone(sound, true)).toBe(false)
      }),
      { numRuns: 100 },
    )
  })
})

describe('drone gain', () => {
  /** Validates: Requirements 33.1 (task 3.3: at most 20% of the master volume) */
  test('property: any requested gain is clamped into [0, 0.2]', async () => {
    await fc.assert(
      fc.asyncProperty(fc.double(), async (requested) => {
        const gain = clampDroneGain(requested)
        expect(gain).toBeGreaterThanOrEqual(0)
        expect(gain).toBeLessThanOrEqual(DRONE_MASTER_CAP)
      }),
      { numRuns: 100 },
    )
  })

  it('maps NaN and negatives to silence and large values to the cap', () => {
    expect(clampDroneGain(Number.NaN)).toBe(0)
    expect(clampDroneGain(-1)).toBe(0)
    expect(clampDroneGain(5)).toBe(DRONE_MASTER_CAP)
  })

  it('uses the specified peak gain, below the cap', () => {
    expect(DRONE_PEAK_GAIN).toBe(0.04)
    expect(DRONE_PEAK_GAIN).toBeLessThanOrEqual(DRONE_MASTER_CAP)
  })
})

describe('drone parameters', () => {
  it('has two detuned low sine frequencies below the lowpass cutoff (requirement 33.1)', () => {
    expect([...DRONE_FREQUENCIES_HZ]).toEqual([55, 55.4])
    expect(DRONE_LOWPASS_HZ).toBe(400)
    for (const hz of DRONE_FREQUENCIES_HZ) expect(hz).toBeLessThan(DRONE_LOWPASS_HZ)
    expect(DRONE_FREQUENCIES_HZ[1] - DRONE_FREQUENCIES_HZ[0]).toBeGreaterThan(0)
  })

  it('keeps the reverb loop stable: feedback below 1 and a short delay', () => {
    expect(DRONE_FEEDBACK).toBeGreaterThan(0)
    expect(DRONE_FEEDBACK).toBeLessThan(1)
    expect(DRONE_DELAY_S).toBeGreaterThan(0)
    expect(DRONE_DELAY_S).toBeLessThan(1)
    expect(DRONE_WET).toBeLessThan(1)
  })
})

describe('fade plans', () => {
  /** Validates: Requirements 33.1 (2 s fade-in, peak capped) */
  test('property: the fade-in starts now and reaches the capped peak after 2 s', async () => {
    await fc.assert(
      fc.asyncProperty(time, async (now) => {
        const plan = planFadeIn(now)
        expect(plan.startAt).toBe(now)
        expect(plan.peakAt - plan.startAt).toBeCloseTo(DRONE_FADE_IN_S, 6)
        expect(plan.peak).toBeGreaterThan(0)
        expect(plan.peak).toBeLessThanOrEqual(DRONE_MASTER_CAP)
      }),
      { numRuns: 100 },
    )
  })

  /** Validates: Requirements 20 (sound off stops the drone immediately) */
  test('property: the fade-out reaches silence and stops the oscillators within 100 ms', async () => {
    await fc.assert(
      fc.asyncProperty(time, async (now) => {
        const plan = planFadeOut(now)
        expect(plan.rampEndAt).toBeGreaterThan(now)
        expect(plan.rampEndAt).toBeLessThanOrEqual(plan.stopAt)
        expect(plan.stopAt - now).toBeLessThanOrEqual(0.1 + 1e-9)
      }),
      { numRuns: 100 },
    )
  })
})
