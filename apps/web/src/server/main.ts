import { createServer } from './server.js'

const PORT = Number(process.env.PORT) || 3000
const MAX_CONCURRENCY = Number(process.env.UNSEEN_MAX_CONCURRENCY) || 2

const server = createServer({ maxConcurrency: MAX_CONCURRENCY, logger: true })

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
