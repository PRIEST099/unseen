import { replayAssetUrl, replayConfig } from './replay-config'
import type { ReplayConfig } from './replay-config'

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
export function parseSamples(body: unknown, config: ReplayConfig = replayConfig): SampleMetadata[] {
  if (!Array.isArray(body)) return []
  return body.filter(isSampleMetadata).map(({ id, name, url, score, thumbnailUrl }) => ({
    id,
    name,
    url,
    score,
    // The replay build keeps thumbnails next to the audits; the API path in the index does not exist there.
    thumbnailUrl: config.replay ? replayAssetUrl(config, `${id}-thumb.jpg`) : thumbnailUrl,
  }))
}

export function samplesEndpoint(config: ReplayConfig = replayConfig): string {
  return config.replay ? replayAssetUrl(config, 'index.json') : '/api/samples'
}

export async function fetchSamples(signal: AbortSignal, config: ReplayConfig = replayConfig): Promise<SampleMetadata[]> {
  const response = await fetch(samplesEndpoint(config), { signal })
  if (!response.ok) throw new Error(`Samples request failed with status ${response.status}`)
  const body: unknown = await response.json()
  return parseSamples(body, config)
}
