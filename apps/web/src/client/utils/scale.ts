export type ScaleState = {
  pngWidth: number // intrinsic PNG width (img.naturalWidth)
  pngHeight: number // intrinsic PNG height (img.naturalHeight)
  containerWidth: number // available width in CSS px
  scaleFactor: number // min(1, containerWidth / pngWidth)
  scaledWidth: number // pngWidth * scaleFactor
  scaledHeight: number // pngHeight * scaleFactor
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

/**
 * Scale a screenshot to the container width, never above 1:1 (requirement 8.4).
 * The screenshot and its overlay layers all use the same result, so they cannot drift apart.
 */
export function computeScale(pngWidth: number, pngHeight: number, containerWidth: number): ScaleState {
  if (!isPositiveFinite(pngWidth) || !isPositiveFinite(pngHeight) || !isPositiveFinite(containerWidth)) {
    throw new RangeError('computeScale needs positive, finite dimensions')
  }
  const scaleFactor = Math.min(1, containerWidth / pngWidth)
  return {
    pngWidth,
    pngHeight,
    containerWidth,
    scaleFactor,
    scaledWidth: pngWidth * scaleFactor,
    scaledHeight: pngHeight * scaleFactor,
  }
}
