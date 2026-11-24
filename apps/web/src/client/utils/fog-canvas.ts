import { FOG_FEATHER_PX } from './fog-wave'
import { parseHexColor } from './fog-density'
import type { Rgb } from './fog-density'
import { generateNoiseTile, NOISE_TILE_SIZE } from './noise-tile'

export type FogPainter = {
  /** Draws the fog band centred at `center` (CSS px from the top of the screenshot). */
  paint: (center: number) => void
  clear: () => void
}

const FALLBACK_FOG_COLOR: Rgb = [160, 160, 160]
const FOG_ALPHA = 0.9

/** Reads `--color-mist` from the document, as the fog tint (requirement 12.2). */
export function readFogColor(): Rgb {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--color-mist')
  return parseHexColor(value) ?? FALLBACK_FOG_COLOR
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
    image.data[index * 4 + 3] = Math.round((values[index] ?? 0) * 255 * FOG_ALPHA)
  }
  context.putImageData(image, 0, 0)
  return tile
}

/**
 * Paints the fog wave onto the screenshot canvas: a 256x256 value-noise tile tinted with the
 * mist colour, shown through a band with a soft 64 px feather above and below its centre.
 * Returns null when the browser has no 2D canvas.
 */
export function createFogPainter(canvas: HTMLCanvasElement, color: Rgb = readFogColor()): FogPainter | null {
  const context = canvas.getContext('2d')
  if (context === null) return null
  const tile = tintedTile(generateNoiseTile(), color)
  const pattern = tile === null ? null : context.createPattern(tile, 'repeat')
  if (pattern === null) return null
  const clear = (): void => context.clearRect(0, 0, canvas.width, canvas.height)
  const paint = (center: number): void => {
    const top = center - FOG_FEATHER_PX
    const height = FOG_FEATHER_PX * 2
    clear()
    context.save()
    context.beginPath()
    context.rect(0, top, canvas.width, height)
    context.clip()
    context.fillStyle = pattern
    context.fillRect(0, top, canvas.width, height)
    context.globalCompositeOperation = 'destination-in'
    const feather = context.createLinearGradient(0, top, 0, top + height)
    feather.addColorStop(0, 'transparent')
    feather.addColorStop(0.5, 'black')
    feather.addColorStop(1, 'transparent')
    context.fillStyle = feather
    context.fillRect(0, top, canvas.width, height)
    context.restore()
  }
  return { paint, clear }
}
