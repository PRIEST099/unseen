import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { ZodError } from 'zod'
import { Session } from './session.js'
import { ToolInputError, errorMessage, toToolError } from './pure/errors.js'
import { auditHtmlTool } from './tools/audit-html.js'
import type { HtmlAuditor } from './tools/audit-html.js'
import { auditUrlTool } from './tools/audit-url.js'
import type { UrlAuditor } from './tools/audit-url.js'
import { explainTool } from './tools/explain.js'
import { suggestFixTool } from './tools/suggest-fix.js'
import { TOOL_DEFINITIONS } from './types.js'

export const SERVER_NAME = 'unseen'
export const SERVER_VERSION = '0.1.0'

export type ServerDeps = { session?: Session; auditUrl?: UrlAuditor; auditHtml?: HtmlAuditor }

function success(structured: Record<string, unknown>, text: string): CallToolResult {
  return { content: [{ type: 'text', text }], structuredContent: structured }
}

function failure(error: unknown): CallToolResult {
  // Details go to stderr only; the client gets a stable code and a fixed message.
  console.error(`unseen-mcp: tool failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`)
  const mapped = error instanceof ZodError ? { code: 'INVALID_INPUT' as const, message: errorMessage('INVALID_INPUT') } : toToolError(error)
  return { isError: true, content: [{ type: 'text', text: `${mapped.code}: ${mapped.message}` }], structuredContent: { ...mapped } }
}

async function run(name: string, args: unknown, session: Session, deps: ServerDeps): Promise<CallToolResult> {
  switch (name) {
    case 'audit_url': {
      const result = await auditUrlTool(args, session, deps.auditUrl)
      return success({ ...result }, result.summary)
    }
    case 'audit_html': {
      const result = await auditHtmlTool(args, session, deps.auditHtml)
      return success({ ...result }, result.summary)
    }
    case 'explain_haunting': {
      const result = await explainTool(args, session)
      return success(result, typeof result['text'] === 'string' ? result['text'] : JSON.stringify(result))
    }
    case 'suggest_fix': {
      const result = await suggestFixTool(args, session)
      return success(result, typeof result['text'] === 'string' ? result['text'] : JSON.stringify(result))
    }
    default:
      throw new ToolInputError('INVALID_INPUT', `unknown tool ${name}`)
  }
}

export function createUnseenServer(deps: ServerDeps = {}): Server {
  const session = deps.session ?? new Session()
  const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOL_DEFINITIONS.map((t) => ({ ...t })) }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await run(request.params.name, request.params.arguments ?? {}, session, deps)
    } catch (error: unknown) {
      return failure(error)
    }
  })
  return server
}
