export const NOISE_TILE_SIZE = 256

/** Small seeded PRNG (mulberry32) so a tile is reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function octave(size: number, cells: number, random: () => number): Float32Array {
  const lattice = new Float32Array(cells * cells)
  for (let index = 0; index < lattice.length; index += 1) lattice[index] = random()
  const out = new Float32Array(size * size)
  const step = cells / size
  for (let y = 0; y < size; y += 1) {
    const fy = y * step
    const y0 = Math.floor(fy)
    const ty = smooth(fy - y0)
    for (let x = 0; x < size; x += 1) {
      const fx = x * step
      const x0 = Math.floor(fx)
      const tx = smooth(fx - x0)
      const at = (cx: number, cy: number): number => lattice[(cy % cells) * cells + (cx % cells)] ?? 0
      const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx
      const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx
      out[y * size + x] = top * (1 - ty) + bottom * ty
    }
  }
  return out
}

/**
 * A tileable 2D value-noise tile: three octaves of a wrapped random lattice, normalised to
 * [0, 1]. Row-major, `size * size` values. The same seed always gives the same tile.
 */
export function generateNoiseTile(size: number = NOISE_TILE_SIZE, seed: number = 1): Float32Array {
  const random = mulberry32(seed)
  const cellCounts = [4, 8, 16]
  const weights = [0.55, 0.3, 0.15]
  const tile = new Float32Array(size * size)
  cellCounts.forEach((cells, index) => {
    const layer = octave(size, cells, random)
    const weight = weights[index] ?? 0
    for (let i = 0; i < tile.length; i += 1) tile[i] = (tile[i] ?? 0) + (layer[i] ?? 0) * weight
  })
  return tile
}
