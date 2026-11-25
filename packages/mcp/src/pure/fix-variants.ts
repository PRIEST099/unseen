import type { HauntingFix } from '@the-unseen/core'

export type Framework = 'html' | 'react' | 'vue'

/** Tokens a fix must never contain: a fix edits source, it never patches a page at runtime. */
export const FORBIDDEN_TOKENS: readonly string[] = ['<script', 'document.', 'innerHTML', 'setAttribute', 'MutationObserver', 'eval', 'new Function']

const FORBIDDEN_PATTERNS: readonly RegExp[] = [/<script/i, /\bdocument\./, /innerHTML/, /setAttribute/, /MutationObserver/, /\beval\b/, /\bnew\s+Function\b/]

/** The first forbidden token found, or null. `eval` and `document.` match as whole words, so "evaluate" is fine. */
export function findForbidden(text: string): string | null {
  const index = FORBIDDEN_PATTERNS.findIndex((p) => p.test(text))
  return index < 0 ? null : (FORBIDDEN_TOKENS[index] ?? null)
}

const VOID_TAGS: ReadonlySet<string> = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'])

const JSX_ATTRIBUTES: Readonly<Record<string, string>> = {
  class: 'className',
  for: 'htmlFor',
  tabindex: 'tabIndex',
  readonly: 'readOnly',
  maxlength: 'maxLength',
  minlength: 'minLength',
  autocomplete: 'autoComplete',
  autofocus: 'autoFocus',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  crossorigin: 'crossOrigin',
  contenteditable: 'contentEditable',
}

const ATTRIBUTE = /(\s)([A-Za-z_:][\w:.-]*)(\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?/g

/** Rewrite one opening tag: JSX attribute names, and a closing slash on void elements. */
function jsxTag(tag: string): string {
  const name = /^<([A-Za-z][\w-]*)/.exec(tag)?.[1]?.toLowerCase() ?? ''
  const renamed = tag.replace(ATTRIBUTE, (_all, space: string, attr: string, value: string | undefined) => `${space}${JSX_ATTRIBUTES[attr] ?? attr}${value ?? ''}`)
  return VOID_TAGS.has(name) && !renamed.endsWith('/>') ? `${renamed.slice(0, -1).trimEnd()} />` : renamed
}

export function toReact(snippet: string): string {
  return snippet.replace(/<[A-Za-z][^>]*>/g, jsxTag)
}

export function toVue(snippet: string): string {
  return `<template>\n  ${snippet}\n</template>`
}

export function applyFramework(fix: HauntingFix, framework: Framework): HauntingFix {
  if (framework === 'react') return { instruction: fix.instruction, codeSnippet: toReact(fix.codeSnippet) }
  if (framework === 'vue') return { instruction: fix.instruction, codeSnippet: toVue(fix.codeSnippet) }
  return { instruction: fix.instruction, codeSnippet: fix.codeSnippet }
}
