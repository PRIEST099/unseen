export type SampleMetadata = {
  id: string
  name: string
  url: string
  score: number
  thumbnailUrl: string
}

function isSampleMetadata(value: unknown): value is SampleMetadata {
  if (typeof value !== 'object' || value === null) return false
  const candidate: Record<string, unknown> = { ...value }
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.url === 'string' &&
    typeof candidate.score === 'number' &&
    typeof candidate.thumbnailUrl === 'string'
  )
}

/** Keeps the entries of `GET /api/samples` that have the fields the landing cards need. */
export function parseSamples(body: unknown): SampleMetadata[] {
  if (!Array.isArray(body)) return []
  return body.filter(isSampleMetadata).map(({ id, name, url, score, thumbnailUrl }) => ({
    id,
    name,
    url,
    score,
    thumbnailUrl,
  }))
}

export async function fetchSamples(signal: AbortSignal): Promise<SampleMetadata[]> {
  const response = await fetch('/api/samples', { signal })
  if (!response.ok) throw new Error(`Samples request failed with status ${response.status}`)
  const body: unknown = await response.json()
  return parseSamples(body)
}
