/**
 * Remembers which URL each audit job was started for, so an expired job can be audited again
 * (requirement 31.4). The map lives in `sessionStorage` (one tab, gone when the tab closes) and
 * holds at most `MAX_REMEMBERED` jobs. Storage that is missing or refuses writes is ignored.
 * Passing `null` as the storage means "no storage".
 */

const STORAGE_KEY = 'unseen.job-urls'
export const MAX_REMEMBERED = 20

type Entry = { id: string; url: string }

function isEntry(value: unknown): value is Entry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'url' in value &&
    typeof value.url === 'string'
  )
}

function defaultStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

function read(storage: Storage | null): Entry[] {
  if (storage === null) return []
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isEntry) : []
  } catch {
    return []
  }
}

export function rememberJobUrl(id: string, url: string, storage: Storage | null = defaultStorage()): void {
  if (storage === null || id === '') return
  const others = read(storage).filter((entry) => entry.id !== id)
  const next = [...others, { id, url }].slice(-MAX_REMEMBERED)
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage is full or blocked: "Audit again" is simply not offered.
  }
}

export function recallJobUrl(id: string, storage: Storage | null = defaultStorage()): string | undefined {
  return read(storage).find((entry) => entry.id === id)?.url
}
