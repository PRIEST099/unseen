import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** The version in packages/core/package.json. `src/` and `dist/` sit at the same depth, so one path serves both. */
function readPackageVersion(): string {
  try {
    const pkg: unknown = require('../package.json')
    if (typeof pkg === 'object' && pkg !== null && 'version' in pkg && typeof pkg.version === 'string') return pkg.version
  } catch {
    /* fall through */
  }
  return ''
}

export const UNSEEN_VERSION: string = readPackageVersion()
