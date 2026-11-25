import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFogPainter, rgbToHex } from './fog-canvas'
import type { FogPatch } from './fog-density'
import { FOG_FEATHER_PX, waveCenter, waveProgress } from './fog-wave'

/**
 * jsdom has no 2D canvas, so each canvas gets a small recording context. It keeps what a real
 * context would need to know to say whether a pixel is painted: clears, fills (clipped and
 * translated, with their alpha) and images drawn from the band canvas.
 */
type Rect = { x: number; y: number; width: number; height: number }
type Op =
  | { kind: 'clear'; rect: Rect }
  | { kind: 'fill'; rect: Rect; alpha: number; paint: 'tint' | 'pattern' | 'gradient'; composite: string }
  | { kind: 'image'; rect: Rect }

type State = { alpha: number; composite: string; clip: Rect | null; tx: number; ty: number; fill: unknown }

/** Average coverage of one fill with the noise pattern (the tile averages about half its peak alpha). */
const PATTERN_COVERAGE = 0.4
const PATTERN = { pattern: true }

function intersect(a: Rect, b: Rect | null): Rect {
  if (b === null) return a
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) }
}

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
}

class RecordingContext {
  ops: Op[] = []
  private state: State = { alpha: 1, composite: 'source-over', clip: null, tx: 0, ty: 0, fill: null }
  private stack: State[] = []
  private path: Rect | null = null
  shadowColor = ''
  shadowBlur = 0

  constructor(readonly canvas: HTMLCanvasElement) {}

  get globalAlpha(): number {
    return this.state.alpha
  }
  set globalAlpha(value: number) {
    this.state.alpha = value
  }
  get globalCompositeOperation(): string {
    return this.state.composite
  }
  set globalCompositeOperation(value: string) {
    this.state.composite = value
  }
  get fillStyle(): unknown {
    return this.state.fill
  }
  set fillStyle(value: unknown) {
    this.state.fill = value
  }

  save(): void {
    this.stack.push({ ...this.state })
  }
  restore(): void {
    this.state = this.stack.pop() ?? this.state
  }
  beginPath(): void {
    this.path = null
  }
  rect(x: number, y: number, width: number, height: number): void {
    this.path = { x: x + this.state.tx, y: y + this.state.ty, width, height }
  }
  clip(): void {
    if (this.path !== null) this.state.clip = intersect(this.path, this.state.clip)
  }
  translate(x: number, y: number): void {
    this.state.tx += x
    this.state.ty += y
  }
  setTransform(): void {
    this.state.tx = 0
    this.state.ty = 0
  }
  clearRect(x: number, y: number, width: number, height: number): void {
    this.ops.push({ kind: 'clear', rect: { x, y, width, height } })
  }
  fillRect(x: number, y: number, width: number, height: number): void {
    const rect = intersect({ x: x + this.state.tx, y: y + this.state.ty, width, height }, this.state.clip)
    const paint = this.state.fill === PATTERN ? 'pattern' : typeof this.state.fill === 'string' ? 'tint' : 'gradient'
    this.ops.push({ kind: 'fill', rect, alpha: this.state.alpha, paint, composite: this.state.composite })
  }
  drawImage(image: HTMLCanvasElement, x: number, y: number): void {
    this.ops.push({ kind: 'image', rect: { x, y, width: image.width, height: image.height } })
  }
  createImageData(width: number, height: number): { data: Uint8ClampedArray } {
    return { data: new Uint8ClampedArray(width * height * 4) }
  }
  putImageData(): void {}
  createPattern(): unknown {
    return PATTERN
  }
  createLinearGradient(): { addColorStop: () => void } {
    return { addColorStop: () => undefined }
  }
}

const contexts = new Map<HTMLCanvasElement, RecordingContext>()

function contextOf(canvas: HTMLCanvasElement): RecordingContext {
  const context = contexts.get(canvas)
  if (context === undefined) throw new Error('no context')
  return context
}

/** Approximate alpha of the pixel at (x, y) on the main canvas after all recorded ops. */
function alphaAt(canvas: HTMLCanvasElement, x: number, y: number): number {
  let alpha = 0
  for (const op of contextOf(canvas).ops) {
    if (!contains(op.rect, x, y)) continue
    if (op.kind === 'clear') alpha = 0
    else if (op.kind === 'image') alpha = Math.max(alpha, 0.5)
    else if (op.composite === 'source-over') {
      const coverage = op.alpha * (op.paint === 'pattern' ? PATTERN_COVERAGE : 1)
      alpha = alpha + coverage * (1 - alpha)
    }
  }
  return alpha
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

const WIDTH = 400
const HEIGHT = 1200
const PATCH: FogPatch = { x: 50, y: 900, width: 200, height: 40, density: 0.8 }

beforeEach(() => {
  contexts.clear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const context = contexts.get(this) ?? new RecordingContext(this)
    contexts.set(this, context)
    return context as unknown as CanvasRenderingContext2D
  } as typeof HTMLCanvasElement.prototype.getContext)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('rgbToHex', () => {
  it('formats and clamps channels', () => {
    expect(rgbToHex([0, 15, 255])).toBe(`#${'000fff'}`)
    expect(rgbToHex([300, -4, 16.4])).toBe(`#${'ff0010'}`)
  })
})

describe('fog painter: the wave leaves fog behind (fix 1.6)', () => {
  it('returns null without a 2D canvas', () => {
    vi.restoreAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(createFogPainter(makeCanvas(WIDTH, HEIGHT), [1, 2, 3])).toBeNull()
  })

  it('keeps the screenshot painted after the wave completes', () => {
    const canvas = makeCanvas(WIDTH, HEIGHT)
    const painter = createFogPainter(canvas, [142, 138, 168])
    expect(painter).not.toBeNull()
    // Run the whole 800 ms wave at 60 fps, then settle, as the view does.
    for (let elapsed = 0; elapsed < 800; elapsed += 16) {
      painter?.paint(waveCenter(waveProgress(elapsed), HEIGHT), [PATCH], elapsed)
    }
    painter?.settle([PATCH])

    for (const [x, y] of [
      [1, 1],
      [WIDTH / 2, HEIGHT / 2],
      [WIDTH - 1, HEIGHT - 1],
    ] as const) {
      expect(alphaAt(canvas, x, y)).toBeGreaterThanOrEqual(0.25)
      expect(alphaAt(canvas, x, y)).toBeLessThan(0.5)
    }
    // Nothing clears the canvas after the final settle.
    const ops = contextOf(canvas).ops
    const lastClear = ops.map((op) => op.kind).lastIndexOf('clear')
    expect(ops.slice(lastClear + 1).some((op) => op.kind === 'fill' && op.rect.width === WIDTH && op.rect.height === HEIGHT)).toBe(true)
    // The band is gone once the wave has passed.
    expect(ops.slice(lastClear + 1).some((op) => op.kind === 'image')).toBe(false)
  })

  it('draws denser fog over a contrast haunting, scaled by its density', () => {
    const canvas = makeCanvas(WIDTH, HEIGHT)
    const painter = createFogPainter(canvas, [142, 138, 168])
    painter?.settle([PATCH, { ...PATCH, x: 260, width: 100, density: 0.3 }])
    const mist = alphaAt(canvas, 20, 100)
    const dense = alphaAt(canvas, PATCH.x + 10, PATCH.y + 10)
    const light = alphaAt(canvas, 270, PATCH.y + 10)
    expect(dense).toBeGreaterThan(light)
    expect(light).toBeGreaterThan(mist)
  })

  it('mid-wave: fog above the band, the band at the centre, the page untouched below it', () => {
    const canvas = makeCanvas(WIDTH, HEIGHT)
    const painter = createFogPainter(canvas, [142, 138, 168])
    const center = 500
    painter?.paint(center, [PATCH], 400)
    expect(alphaAt(canvas, 10, 100)).toBeGreaterThanOrEqual(0.25)
    const band = contextOf(canvas).ops.find((op) => op.kind === 'image')
    expect(band?.rect).toEqual({ x: 0, y: center - FOG_FEATHER_PX, width: WIDTH, height: FOG_FEATHER_PX * 2 })
    expect(band?.rect.height).toBeGreaterThanOrEqual(240)
    expect(alphaAt(canvas, 10, center + FOG_FEATHER_PX + 1)).toBe(0)
    // The patch below the band has not been reached yet.
    expect(alphaAt(canvas, PATCH.x + 10, PATCH.y + 10)).toBe(0)
  })

  it('clear() removes every trace at once', () => {
    const canvas = makeCanvas(WIDTH, HEIGHT)
    const painter = createFogPainter(canvas, [142, 138, 168])
    painter?.settle([PATCH])
    painter?.clear()
    expect(alphaAt(canvas, 10, 10)).toBe(0)
    expect(alphaAt(canvas, PATCH.x + 10, PATCH.y + 10)).toBe(0)
  })
})
