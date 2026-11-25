/**
 * Pure parameters and decisions for the optional ambient drone (requirement 33, 19.6, 20.5).
 * No Web Audio I/O here: `drone-engine.ts` turns these numbers into audio nodes.
 */

/** The drone's output gain never exceeds 20% of full scale, so Web Speech stays intelligible (task 3.3). */
export const DRONE_MASTER_CAP = 0.2

/** Peak output gain of the drone (requirement 33.1). */
export const DRONE_PEAK_GAIN = 0.04

/** Two slightly detuned sine oscillators; the beat between them is about 0.4 Hz (requirement 33.1). */
export const DRONE_FREQUENCIES_HZ: readonly [number, number] = [55, 55.4]

/** Lowpass cutoff that keeps the drone soft (requirement 33.1). */
export const DRONE_LOWPASS_HZ = 400

/** Fade-in so the drone never starts with a click (requirement 33.1). */
export const DRONE_FADE_IN_S = 2

/** Fade-out that ends well inside the 100 ms "stops immediately" budget. */
export const DRONE_FADE_OUT_S = 0.06

/** The oscillators are stopped this long after a stop request, so the fade-out reaches silence first. */
export const DRONE_STOP_AFTER_S = 0.08

/** Feedback delay that gives the drone a soft, reverb-like tail. */
export const DRONE_DELAY_S = 0.31

/** Feedback below 1 keeps the delay loop stable; the loop decays on every pass. */
export const DRONE_FEEDBACK = 0.35

/** How much of the delayed signal is mixed back into the output. */
export const DRONE_WET = 0.4

export type FadeInPlan = { startAt: number; peakAt: number; peak: number }
export type FadeOutPlan = { rampEndAt: number; stopAt: number }

/** The drone plays only when the user turned sound on AND does not prefer reduced motion. */
export function shouldPlayDrone(soundEnabled: boolean, reducedMotion: boolean): boolean {
  return soundEnabled && !reducedMotion
}

/** Clamps any requested gain into `[0, DRONE_MASTER_CAP]`. NaN becomes silence. */
export function clampDroneGain(requested: number): number {
  if (Number.isNaN(requested)) return 0
  return Math.min(DRONE_MASTER_CAP, Math.max(0, requested))
}

export function planFadeIn(now: number): FadeInPlan {
  return { startAt: now, peakAt: now + DRONE_FADE_IN_S, peak: clampDroneGain(DRONE_PEAK_GAIN) }
}

export function planFadeOut(now: number): FadeOutPlan {
  return { rampEndAt: now + DRONE_FADE_OUT_S, stopAt: now + DRONE_STOP_AFTER_S }
}
