import { z } from 'zod'
import { HAUNTING_TYPES } from '@the-unseen/core'
import type { HauntingType } from '@the-unseen/core'

export const MAX_HTML_INPUT_BYTES = 1_048_576

const httpUrl = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      const p = new URL(value).protocol
      return p === 'http:' || p === 'https:'
    } catch {
      return false
    }
  }, 'Only http and https URLs are accepted')

export const auditUrlInput = z.object({ url: httpUrl, page: z.enum(['summary', 'full']).optional() }).strict()

export const auditHtmlInput = z
  .object({ html: z.string().refine((h) => Buffer.byteLength(h, 'utf8') <= MAX_HTML_INPUT_BYTES, 'html is larger than 1 MB') })
  .strict()

const hauntingType = z.custom<HauntingType>((v) => typeof v === 'string' && (HAUNTING_TYPES as readonly string[]).includes(v))

export const explainInput = z
  .object({ type: hauntingType.optional(), id: z.string().min(1).optional() })
  .strict()
  .refine((v) => (v.type === undefined) !== (v.id === undefined), 'Give exactly one of type or id')

export const suggestFixInput = z
  .object({ id: z.string().min(1), framework: z.enum(['html', 'react', 'vue']).optional() })
  .strict()

export type ToolName = 'audit_url' | 'audit_html' | 'explain_haunting' | 'suggest_fix'

type JsonSchema = { type: 'object'; properties: Record<string, unknown>; additionalProperties: false; required?: string[] }

export type ToolDefinition = { name: ToolName; description: string; inputSchema: JsonSchema }

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: 'audit_url',
    description:
      'Audit a running page (http or https, localhost allowed) for accessibility hauntings. Returns the Haunting Score, the top hauntings with selectors and source-level fixes, and a Markdown summary. Automated checks find roughly 30-40% of WCAG issues.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'http or https URL of the page' },
        page: { type: 'string', enum: ['summary', 'full'], description: 'summary (default) or full classified audit without the screenshot' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'audit_html',
    description: 'Audit an HTML string (at most 1 MB) for accessibility hauntings. Same result shape as audit_url.',
    inputSchema: {
      type: 'object',
      properties: { html: { type: 'string', description: 'A complete HTML document or fragment' } },
      required: ['html'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_haunting',
    description: 'Explain a haunting type, or a haunting id from an audit in this session: what is wrong, who it affects, the WCAG criteria and a speech example.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: [...HAUNTING_TYPES], description: 'A haunting type' },
        id: { type: 'string', description: 'A haunting id from a previous audit in this session' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'suggest_fix',
    description: 'Return the source-level fix for a haunting id from an audit in this session, in html, react or vue syntax. Re-audit after applying it.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'A haunting id from a previous audit in this session' },
        framework: { type: 'string', enum: ['html', 'react', 'vue'] },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
]
