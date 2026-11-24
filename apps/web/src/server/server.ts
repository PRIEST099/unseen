import { fileURLToPath } from 'node:url'
import fastify from 'fastify'
import type { FastifyInstance, FastifyServerOptions } from 'fastify'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { auditRoutes } from './routes/audit.js'
import { healthRoutes } from './routes/health.js'
import { samplesRoutes } from './routes/samples.js'

export type ServerOptions = {
  /** Global cap on audits running at once. Default 2. */
  maxConcurrency?: number
  /** Overrides the default logger (JSON in production, pino-pretty otherwise). */
  logger?: FastifyServerOptions['logger']
  /** Directory holding the built SPA. Defaults to dist/client next to dist/server. */
  clientDir?: string
}

export const PRODUCTION_PRIVATE_FLAG_ERROR =
  'UNSEEN_DEV_ALLOW_PRIVATE=1 is forbidden in production (NODE_ENV=production)'

const DEFAULT_MAX_CONCURRENCY = 2
// src/server/ and dist/server/ are the same depth, so both resolve to apps/cursed-shop and dist/client.
const CURSED_SHOP_DIR = fileURLToPath(new URL('../../../cursed-shop', import.meta.url))
const DEFAULT_CLIENT_DIR = fileURLToPath(new URL('../client', import.meta.url))

const CONTENT_SECURITY_POLICY = {
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:'],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  },
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/** Dev runs the SPA through Vite; production and the e2e server (`NODE_ENV=test`) serve the build. */
function shouldServeSpa(): boolean {
  return isProduction() || process.env.NODE_ENV === 'test'
}

function resolveLogger(option: ServerOptions['logger']): FastifyServerOptions['logger'] {
  if (option !== undefined) return option
  return isProduction() ? true : { transport: { target: 'pino-pretty' } }
}

/** Production must never run with the private-network escape hatch the dev server uses. */
function assertSafeEnvironment(): void {
  if (isProduction() && process.env.UNSEEN_DEV_ALLOW_PRIVATE === '1') {
    throw new Error(PRODUCTION_PRIVATE_FLAG_ERROR)
  }
}

function registerApi(server: FastifyInstance, maxConcurrency: number): void {
  server.register(
    async (api): Promise<void> => {
      // Helmet is opt-in per route (global: false), so only this scope and the SPA get the CSP.
      api.addHook('onRequest', async (_request, reply): Promise<void> => {
        reply.helmet()
      })
      await api.register(auditRoutes, { maxConcurrency })
      await api.register(samplesRoutes)
      await api.register(healthRoutes)
    },
    { prefix: '/api' },
  )
}

/** The demo storefront needs its inline scripts, so it is served without helmet. */
function registerCursedShop(server: FastifyInstance): void {
  server.register(async (shop): Promise<void> => {
    await shop.register(fastifyStatic, {
      root: CURSED_SHOP_DIR,
      prefix: '/cursed-shop/',
      decorateReply: false,
    })
  })
}

function isStaticAssetPath(url: string): boolean {
  const pathname = url.split('?')[0] ?? ''
  const lastSegment = pathname.split('/').pop() ?? ''
  return lastSegment.includes('.')
}

function isBackendPath(url: string): boolean {
  return /^\/(api|cursed-shop)(\/|\?|$)/.test(url)
}

/** Serves the built SPA with the strict CSP and falls back to index.html for client-side routes. */
function registerSpa(server: FastifyInstance, clientDir: string): void {
  server.register(async (spa): Promise<void> => {
    spa.addHook('onRequest', async (_request, reply): Promise<void> => {
      reply.helmet()
    })
    // decorateReply stays true on this instance only: the not-found handler needs reply.sendFile.
    await spa.register(fastifyStatic, { root: clientDir, prefix: '/' })
    spa.setNotFoundHandler((request, reply) => {
      const isNavigation = request.method === 'GET' || request.method === 'HEAD'
      if (!isNavigation || isBackendPath(request.url) || isStaticAssetPath(request.url)) {
        return reply.code(404).send({ error: 'NOT_FOUND' })
      }
      return reply.type('text/html; charset=utf-8').sendFile('index.html')
    })
  })
}

export function createServer(options: ServerOptions = {}): FastifyInstance {
  assertSafeEnvironment()

  const server = fastify({
    logger: resolveLogger(options.logger),
    trustProxy: true, // rate limiting behind a reverse proxy needs the real client IP
  })

  server.register(helmet, { global: false, contentSecurityPolicy: CONTENT_SECURITY_POLICY })
  server.register(rateLimit, { global: false })

  registerApi(server, options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY)
  registerCursedShop(server)
  if (shouldServeSpa()) {
    registerSpa(server, options.clientDir ?? DEFAULT_CLIENT_DIR)
  }

  return server
}
