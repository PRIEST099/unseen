import type { FastifyPluginAsync } from 'fastify'

export type HealthResponse = { status: 'ok' }

/** Liveness probe for Docker health checks and load balancers. Final path: GET /api/health. */
export const healthRoutes: FastifyPluginAsync = async (server): Promise<void> => {
  server.get('/health', async (): Promise<HealthResponse> => ({ status: 'ok' }))
}
