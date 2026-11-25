/** The browser pieces `downloadBlob` needs, injectable so the helper can be tested without a download. */
export type DownloadEnvironment = {
  document: Document
  createObjectURL: (blob: Blob) => string
  revokeObjectURL: (url: string) => void
  schedule: (callback: () => void) => void
}

function browserEnvironment(): DownloadEnvironment {
  return {
    document,
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    schedule: (callback) => {
      window.setTimeout(callback, 0)
    },
  }
}

/**
 * Starts a download of `blob` through a temporary `<a download>` link and revokes the object URL
 * afterwards. A Blob URL is same-origin, so it needs no CSP source.
 */
export function downloadBlob(blob: Blob, filename: string, env: DownloadEnvironment = browserEnvironment()): void {
  const url = env.createObjectURL(blob)
  const link = env.document.createElement('a')
  link.href = url
  link.download = filename
  link.hidden = true
  env.document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    // Revoked on the next task so the browser has already started reading the Blob.
    env.schedule(() => env.revokeObjectURL(url))
  }
}
