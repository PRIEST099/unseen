import type { FastifyPluginAsync } from 'fastify'

export type AuditRoutesOptions = {
  /** Global cap on audits running at once (UNSEEN_MAX_CONCURRENCY). */
  maxConcurrency: number
}

/**
 * Placeholder so the server factory compiles and registers the audit plugin.
 * Task 1.4 replaces this file with POST /audit, GET /audit/:id and the screenshot route.
 */
export const auditRoutes: FastifyPluginAsync<AuditRoutesOptions> = async (): Promise<void> => {}
