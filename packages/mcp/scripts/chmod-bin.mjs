// Marks the built entry executable. A no-op where the file system has no mode bits (Windows).
import { chmodSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const bin = fileURLToPath(new URL('../dist/server.js', import.meta.url))
if (existsSync(bin)) {
  try {
    chmodSync(bin, 0o755)
  } catch {
    // Mode bits are not supported on this file system.
  }
}
