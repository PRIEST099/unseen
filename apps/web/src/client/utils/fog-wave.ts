/** Fog wave timing and reveal rules (requirement 12.3). Pure: no DOM, no clock. */
export const FOG_DURATION_MS = 800
/** Half the height of the moving fog band: the band is 240 CSS px tall so it reads on video. */
export const FOG_FEATHER_PX = 120
export const FOG_BAND_HEIGHT_PX = FOG_FEATHER_PX * 2
/** Alpha of the mist that stays over the whole screenshot once the wave has passed. */
export const MIST_ALPHA = 0.3
/**
 * The haunted look of the screenshot above the band (and of the whole screenshot once the wave has
 * passed, or at once under reduced motion): dimmed and desaturated.
 */
export const HAUNTED_FILTER = 'grayscale(0.6) brightness(0.7)'
/** An overlay starts to appear when the wave is this many CSS px above its top edge. */
export const OVERLAY_LEAD_PX = 100
export const OVERLAY_FADE_IN_MS = 400
export const OVERLAY_FADE_OUT_MS = 200

/** CSS `ease-in-out`-like curve; maps [0,1] to [0,1] and is monotonic. */
export function easeInOut(t: number): number {
  const x = Math.min(Math.max(t, 0), 1)
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2
}

/** Eased progress of the wave after `elapsedMs`. */
export function waveProgress(elapsedMs: number, durationMs: number = FOG_DURATION_MS): number {
  if (durationMs <= 0) return 1
  return easeInOut(elapsedMs / durationMs)
}

/** Vertical centre of the fog band: starts one feather above the image and ends one feather below it. */
export function waveCenter(progress: number, scaledHeight: number, feather: number = FOG_FEATHER_PX): number {
  const p = Math.min(Math.max(progress, 0), 1)
  return -feather + p * (scaledHeight + 2 * feather)
}

/** How far down (CSS px) the haunted state reaches for a band centred at `center`: never outside the image. */
export function hauntedExtent(center: number, scaledHeight: number): number {
  return Math.min(Math.max(center, 0), Math.max(scaledHeight, 0))
}

/** True once the wave is within the lead distance of the overlay's top edge (CSS px). */
export function isOverlayRevealed(center: number, boxY: number, scaleFactor: number, lead: number = OVERLAY_LEAD_PX): boolean {
  return center >= boxY * scaleFactor - lead
}

/** How many overlays (already in reading order) the wave has revealed. Always a prefix. */
export function revealedCount(center: number, boxYs: readonly number[], scaleFactor: number): number {
  let count = 0
  while (count < boxYs.length && isOverlayRevealed(center, boxYs[count] ?? 0, scaleFactor)) count += 1
  return count
}
