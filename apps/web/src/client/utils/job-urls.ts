/**
 * Remembers which URL each audit job was started for, so an expired job can be audited again
 * (requirement 31.4), also from a new tab, a new window or a pasted link. The map lives in
 * `localStorage`, keeps the newest `MAX_REMEMBERED` jobs, and forgets a job `JOB_URL_TTL_MS`
 * after it was remembered. This is job memory, not a user preference: nothing else is stored.
 * Storage that is missing, throws, or refuses writes is ignored. Passing `null` as the storage
 * means "no storage".
 */

const STORAGE_KEY = 'unseen.job-urls'
export const MAX_REMEMBERED = 20
/** Two hours: longer than the server keeps a result, so an expired job can still be re-audited. */
export const JOB_URL_TTL_MS = 2 * 60 * 60 * 1000

/** `at` is when the job was remembered, in epoch milliseconds. */
type Entry = { id: string; url: string; at: number }

function isEntry(value: unknown): value is Entry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'url' in value &&
    typeof value.url === 'string' &&
    'at' in value &&
    typeof value.at === 'number' &&
    Number.isFinite(value.at)
  )
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Accessing localStorage throws when site data is blocked.
    return null
  }
}

/** Entries that are well formed and not expired at `now`, oldest first. */
function read(storage: Storage | null, now: number): Entry[] {
  if (storage === null) return []
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isEntry).filter((entry) => now - entry.at <= JOB_URL_TTL_MS)
  } catch {
    return []
  }
}

export function rememberJobUrl(
  id: string,
  url: string,
  storage: Storage | null = defaultStorage(),
  now: number = Date.now(),
): void {
  if (storage === null || id === '') return
  const others = read(storage, now).filter((entry) => entry.id !== id)
  const next = [...others, { id, url, at: now }].slice(-MAX_REMEMBERED)
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage is full or blocked: "Audit again" is simply not offered.
  }
}

export function recallJobUrl(id: string, storage: Storage | null = defaultStorage(), now: number = Date.now()): string | undefined {
  return read(storage, now).find((entry) => entry.id === id)?.url
}
