import type { Page } from '@playwright/test'

export type ShotComparison = {
  sameSize: boolean
  /** Pixels that are probe-coloured (r > 200, g < 80, b > 200) in `after` but were not in `before`. */
  newProbePixels: number
  /** Probe-coloured pixels in `after`, whatever `before` held. */
  probePixels: number
  /** The largest difference in any single colour channel (0-255) between the two shots. */
  maxChannelDiff: number
}

/**
 * Decodes two PNG screenshots in the page's canvas and compares them by colour, not by bytes.
 * Re-rastered layers can differ by a channel value or two without any visible change.
 */
export async function compareShots(page: Page, before: Buffer, after: Buffer): Promise<ShotComparison> {
  return page.evaluate(
    async ({ a, b }) => {
      const read = async (base64: string): Promise<ImageData> => {
        const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const context = canvas.getContext('2d')
        if (context === null) throw new Error('no 2d context')
        context.drawImage(bitmap, 0, 0)
        return context.getImageData(0, 0, bitmap.width, bitmap.height)
      }
      const first = await read(a)
      const second = await read(b)
      if (first.width !== second.width || first.height !== second.height) {
        return { sameSize: false, newProbePixels: 0, probePixels: 0, maxChannelDiff: 255 }
      }
      const isProbe = (data: Uint8ClampedArray, at: number): boolean =>
        data[at] > 200 && data[at + 1] < 80 && data[at + 2] > 200
      let newProbePixels = 0
      let probePixels = 0
      let maxChannelDiff = 0
      for (let at = 0; at < first.data.length; at += 4) {
        const probeAfter = isProbe(second.data, at)
        if (probeAfter) probePixels += 1
        if (probeAfter && !isProbe(first.data, at)) newProbePixels += 1
        for (let channel = 0; channel < 3; channel += 1) {
          maxChannelDiff = Math.max(maxChannelDiff, Math.abs(first.data[at + channel] - second.data[at + channel]))
        }
      }
      return { sameSize: true, newProbePixels, probePixels, maxChannelDiff }
    },
    { a: before.toString('base64'), b: after.toString('base64') },
  )
}
