import { FOG_BAND_HEIGHT_PX, FOG_FEATHER_PX, MIST_ALPHA, hauntedExtent } from './fog-wave'
import { parseHexColor } from './fog-density'
import type { FogPatch, Rgb } from './fog-density'
import { generateNoiseTile, NOISE_TILE_SIZE } from './noise-tile'

export type FogPainter = {
  /**
   * One frame of the wave. Above `center` the fog has settled (mist plus denser fog over the
   * contrast hauntings); at `center` the moving band (CSS px from the top of the screenshot).
   */
  paint: (center: number, patches: readonly FogPatch[], elapsedMs: number) => void
  /** The haunted state once the wave has passed: settled fog over the whole screenshot. It stays until `clear()`. */
  settle: (patches: readonly FogPatch[]) => void
  clear: () => void
}

const FALLBACK_FOG_COLOR: Rgb = [160, 160, 160]
/** Peak alpha of one noise texel in the tinted tile. */
const NOISE_ALPHA = 0.9
/** The settled mist is a flat tint plus noise; together they average about MIST_ALPHA. */
const MIST_TINT_ALPHA = MIST_ALPHA / 2
const MIST_NOISE_ALPHA = 0.4
/** Denser fog spills a little past the haunted text so its edges read as fog, not as a box. */
const PATCH_PAD_PX = 10
const PATCH_BLUR_PX = 14
/** The band is a dense tint under two drifting noise layers. */
const BAND_TINT_ALPHA = 0.55
const BAND_DRIFT_PX_PER_MS = 0.08

/** Reads `--color-mist` from the document, as the fog tint (requirement 12.2). */
export function readFogColor(): Rgb {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--color-mist')
  return parseHexColor(value) ?? FALLBACK_FOG_COLOR
}

/** `#rrggbb` for a canvas fill style. */
export function rgbToHex(color: Rgb): string {
  return `#${color.map((channel) => Math.round(Math.min(Math.max(channel, 0), 255)).toString(16).padStart(2, '0')).join('')}`
}

let noiseValues: Float32Array | null = null

/** The noise tile is deterministic, so it is generated once per page. */
function sharedNoise(): Float32Array {
  noiseValues ??= generateNoiseTile()
  return noiseValues
}

function tintedTile(values: Float32Array, color: Rgb): HTMLCanvasElement | null {
  const tile = document.createElement('canvas')
  tile.width = NOISE_TILE_SIZE
  tile.height = NOISE_TILE_SIZE
  const context = tile.getContext('2d')
  if (context === null) return null
  const image = context.createImageData(NOISE_TILE_SIZE, NOISE_TILE_SIZE)
  for (let index = 0; index < values.length; index += 1) {
    image.data[index * 4] = color[0]
    image.data[index * 4 + 1] = color[1]
    image.data[index * 4 + 2] = color[2]
    image.data[index * 4 + 3] = Math.round((values[index] ?? 0) * 255 * NOISE_ALPHA)
  }
  context.putImageData(image, 0, 0)
  return tile
}

/**
 * Paints Spirit Sight's fog onto the screenshot canvas, tinted with the mist colour. The wave
 * leaves fog behind it: a low-alpha mist over everything it has passed, denser fog over the
 * contrast hauntings, and a 240 px band of drifting noise with a soft feather above and below its
 * centre. Returns null when the browser has no 2D canvas.
 */
export function createFogPainter(canvas: HTMLCanvasElement, color: Rgb = readFogColor()): FogPainter | null {
  const context = canvas.getContext('2d')
  if (context === null) return null
  const tile = tintedTile(sharedNoise(), color)
  if (tile === null) return null
  const pattern = context.createPattern(tile, 'repeat')
  const band = document.createElement('canvas')
  const bandContext = band.getContext('2d')
  const bandPattern = bandContext?.createPattern(tile, 'repeat') ?? null
  if (pattern === null || bandContext === null || bandPattern === null) return null
  const tint = rgbToHex(color)

  const clear = (): void => context.clearRect(0, 0, canvas.width, canvas.height)

  /** Settled fog from the top of the screenshot down to `extent`. */
  const drawSettled = (extent: number, patches: readonly FogPatch[]): void => {
    if (extent <= 0) return
    const width = canvas.width
    context.save()
    context.beginPath()
    context.rect(0, 0, width, extent)
    context.clip()
    context.globalAlpha = MIST_TINT_ALPHA
    context.fillStyle = tint
    context.fillRect(0, 0, width, extent)
    context.globalAlpha = MIST_NOISE_ALPHA
    context.fillStyle = pattern
    context.fillRect(0, 0, width, extent)
    for (const patch of patches) {
      if (patch.y - PATCH_PAD_PX >= extent) continue
      const x = patch.x - PATCH_PAD_PX
      const y = patch.y - PATCH_PAD_PX
      const w = patch.width + PATCH_PAD_PX * 2
      const h = patch.height + PATCH_PAD_PX * 2
      context.shadowColor = tint
      context.shadowBlur = PATCH_BLUR_PX
      context.globalAlpha = patch.density * 0.6
      context.fillStyle = tint
      context.fillRect(x, y, w, h)
      context.shadowBlur = 0
      context.globalAlpha = patch.density
      context.fillStyle = pattern
      context.fillRect(x, y, w, h)
    }
    context.restore()
  }

  /** The moving band, composed off-screen so its feather does not cut into the settled fog. */
  const drawBand = (center: number, elapsedMs: number): void => {
    const width = canvas.width
    if (band.width !== width) band.width = width
    if (band.height !== FOG_BAND_HEIGHT_PX) band.height = FOG_BAND_HEIGHT_PX
    const drift = (elapsedMs * BAND_DRIFT_PX_PER_MS) % NOISE_TILE_SIZE
    bandContext.save()
    bandContext.clearRect(0, 0, width, FOG_BAND_HEIGHT_PX)
    bandContext.globalAlpha = BAND_TINT_ALPHA
    bandContext.fillStyle = tint
    bandContext.fillRect(0, 0, width, FOG_BAND_HEIGHT_PX)
    bandContext.globalAlpha = 1
    bandContext.fillStyle = bandPattern
    bandContext.translate(drift, 0)
    bandContext.fillRect(-NOISE_TILE_SIZE, 0, width + NOISE_TILE_SIZE * 2, FOG_BAND_HEIGHT_PX)
    bandContext.translate(-drift * 2.5, NOISE_TILE_SIZE / 2)
    bandContext.fillRect(-NOISE_TILE_SIZE, -NOISE_TILE_SIZE, width + NOISE_TILE_SIZE * 2, FOG_BAND_HEIGHT_PX + NOISE_TILE_SIZE)
    bandContext.setTransform(1, 0, 0, 1, 0, 0)
    bandContext.globalCompositeOperation = 'destination-in'
    const feather = bandContext.createLinearGradient(0, 0, 0, FOG_BAND_HEIGHT_PX)
    feather.addColorStop(0, 'transparent')
    feather.addColorStop(0.35, 'black')
    feather.addColorStop(0.65, 'black')
    feather.addColorStop(1, 'transparent')
    bandContext.fillStyle = feather
    bandContext.fillRect(0, 0, width, FOG_BAND_HEIGHT_PX)
    bandContext.restore()
    context.drawImage(band, 0, center - FOG_FEATHER_PX)
  }

  const paint = (center: number, patches: readonly FogPatch[], elapsedMs: number): void => {
    clear()
    drawSettled(hauntedExtent(center, canvas.height), patches)
    drawBand(center, elapsedMs)
  }

  const settle = (patches: readonly FogPatch[]): void => {
    clear()
    drawSettled(canvas.height, patches)
  }

  return { paint, settle, clear }
}
