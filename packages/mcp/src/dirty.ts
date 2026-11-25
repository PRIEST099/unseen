import { readdir, stat } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

export const UI_EXTENSIONS: ReadonlySet<string> = new Set(['.html', '.tsx', '.jsx', '.vue', '.svelte', '.css'])
export const SKIPPED_DIRS: ReadonlySet<string> = new Set(['node_modules', '.git', '.unseen', '.kiro', 'dist'])
export const MAX_WALK_ENTRIES = 20_000
/** With no gate state, files changed in this window count as dirty. */
export const FIRST_RUN_WINDOW_MS = 30 * 60 * 1000

export type DirtyFile = { path: string; rel: string; mtimeMs: number }

export function isUiFile(name: string): boolean {
  return UI_EXTENSIONS.has(extname(name).toLowerCase())
}

/** UI files under `root` modified after `sinceMs`, newest first. The walk is bounded. */
export async function findDirtyFiles(root: string, sinceMs: number): Promise<DirtyFile[]> {
  const found: DirtyFile[] = []
  const pending: string[] = [root]
  let visited = 0
  while (pending.length > 0 && visited < MAX_WALK_ENTRIES) {
    const dir = pending.pop() ?? root
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      visited++
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) pending.push(join(dir, entry.name))
      } else if (entry.isFile() && isUiFile(entry.name)) {
        const path = join(dir, entry.name)
        try {
          const { mtimeMs } = await stat(path)
          if (mtimeMs > sinceMs) found.push({ path, rel: relative(root, path).split('\\').join('/'), mtimeMs })
        } catch {
          // The file vanished between readdir and stat.
        }
      }
    }
  }
  return found.sort((a, b) => b.mtimeMs - a.mtimeMs || a.rel.localeCompare(b.rel))
}
