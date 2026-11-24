import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify'
import type { HauntingType } from '@the-unseen/core'

export type SampleMetadata = {
  id: string
  name: string
  url: string
  score: number
  countsByType: Record<HauntingType, number>
  thumbnailUrl: string
}

export type SamplesRouteOptions = {
  /** Directory holding index.json and the per-sample files. Defaults to apps/web/samples. */
  samplesDir?: string
}

const DEFAULT_SAMPLES_DIR = fileURLToPath(new URL('../../../samples/', import.meta.url))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSampleMetadata(value: unknown): value is SampleMetadata {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.url === 'string' &&
    typeof value.score === 'number' &&
    isRecord(value.countsByType) &&
    typeof value.thumbnailUrl === 'string'
  )
}

/** Reads and validates samples/index.json synchronously. Throws if it is missing or malformed. */
export function loadSampleIndex(samplesDir: string): SampleMetadata[] {
  const parsed: unknown = JSON.parse(readFileSync(path.join(samplesDir, 'index.json'), 'utf8'))
  if (!Array.isArray(parsed) || !parsed.every(isSampleMetadata)) {
    throw new Error('samples/index.json is not a valid SampleMetadata[]; run `npm run build-samples -w apps/web`')
  }
  return parsed
}

function sendFile(reply: FastifyReply, filePath: string, contentType: string): FastifyReply {
  if (!existsSync(filePath)) {
    return reply.code(404).send({ error: 'NOT_FOUND' })
  }
  return reply.type(contentType).send(readFileSync(filePath))
}

export const samplesRoutes: FastifyPluginAsync<SamplesRouteOptions> = async (
  server: FastifyInstance,
  options: SamplesRouteOptions,
): Promise<void> => {
  const samplesDir = options.samplesDir ?? DEFAULT_SAMPLES_DIR
  // Loaded once, synchronously, before the server starts listening.
  const index = loadSampleIndex(samplesDir)
  const knownIds = new Set(index.map((sample) => sample.id))

  // Only ids listed in index.json reach the filesystem, so `:id` can never carry a path.
  const fileFor = (id: string, suffix: string): string | undefined =>
    knownIds.has(id) ? path.join(samplesDir, `${id}${suffix}`) : undefined

  server.get('/samples', async () => index)

  server.get<{ Params: { id: string } }>('/samples/:id', async (request, reply) => {
    const filePath = fileFor(request.params.id, '.json')
    if (filePath === undefined || !existsSync(filePath)) {
      return reply.code(404).send({ error: 'NOT_FOUND' })
    }
    return reply.type('application/json; charset=utf-8').send(readFileSync(filePath))
  })

  server.get<{ Params: { id: string } }>('/samples/:id/screenshot.png', async (request, reply) => {
    const filePath = fileFor(request.params.id, '.png')
    if (filePath === undefined) return reply.code(404).send({ error: 'NOT_FOUND' })
    return sendFile(reply, filePath, 'image/png')
  })

  server.get<{ Params: { id: string } }>('/samples/:id/thumbnail.jpg', async (request, reply) => {
    const filePath = fileFor(request.params.id, '-thumb.jpg')
    if (filePath === undefined) return reply.code(404).send({ error: 'NOT_FOUND' })
    return sendFile(reply, filePath, 'image/jpeg')
  })
}
