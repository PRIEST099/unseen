import { readServerConfig } from './config.js'
import { createServer } from './server.js'

const config = readServerConfig(process.env)
const PORT = config.port

const server = createServer({
  maxConcurrency: config.maxConcurrency,
  limits: {
    maxQueueDepth: config.maxQueueDepth,
    auditTimeoutMs: config.auditTimeoutMs,
    ratePerMinute: config.ratePerMinute,
    ratePerHour: config.ratePerHour,
    resourceLimits: config.resourceLimits,
  },
  logger: true,
})

process.once('SIGTERM', () => {
  server.log.info('SIGTERM received, closing server')
  server.close().then(
    () => process.exit(0),
    (error: unknown) => {
      server.log.error(error, 'error while closing server')
      process.exit(1)
    },
  )
})

try {
  const address = await server.listen({ port: PORT, host: '0.0.0.0' })
  server.log.info(`Server listening at ${address} (port ${PORT})`)
} catch (error: unknown) {
  server.log.error(error, 'failed to start server')
  process.exit(1)
}
