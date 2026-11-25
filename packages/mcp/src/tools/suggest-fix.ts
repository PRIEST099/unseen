import type { HauntingType } from '@the-unseen/core'
import type { Session } from '../session.js'
import { ToolInputError } from '../pure/errors.js'
import { applyFramework, findForbidden } from '../pure/fix-variants.js'
import type { Framework } from '../pure/fix-variants.js'
import { DISPLAY_NAME } from '../pure/summary.js'
import { suggestFixInput } from '../types.js'

export type FixSuggestion = {
  id: string
  type: HauntingType
  framework: Framework
  instruction: string
  codeSnippet: string
  note: string
  text: string
}

export const SOURCE_NOTE =
  'Make this change in your source file (not at runtime), then call audit_url or audit_html on the same page to confirm the haunting is gone.'

export function suggestFix(args: unknown, session: Session): FixSuggestion {
  const input = suggestFixInput.parse(args)
  const haunting = session.find(input.id)
  if (haunting === undefined) throw new ToolInputError('UNKNOWN_HAUNTING_ID', 'unknown id')
  const framework: Framework = input.framework ?? 'html'
  const fix = applyFramework(haunting.fix, framework)
  const text = [`# Fix for ${DISPLAY_NAME[haunting.type]} (${framework})`, fix.instruction, '```', fix.codeSnippet, '```', SOURCE_NOTE].join('\n')
  const forbidden = findForbidden(text)
  // A last guard: a fix that patches a page at runtime is never returned. The property tests keep this from tripping.
  if (forbidden !== null) throw new Error(`fix for ${haunting.type} contains forbidden token ${forbidden}`)
  return { id: haunting.id, type: haunting.type, framework, instruction: fix.instruction, codeSnippet: fix.codeSnippet, note: SOURCE_NOTE, text }
}

export function suggestFixTool(args: unknown, session: Session): Promise<Record<string, unknown>> {
  try {
    return Promise.resolve({ ...suggestFix(args, session) })
  } catch (error: unknown) {
    return Promise.reject(error)
  }
}
