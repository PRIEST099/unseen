import type { Haunting, RawAudit } from '@the-unseen/core'

export const SELECTOR_FALLBACK = '(see htmlSnippet)'

const TOKEN = /^[A-Za-z_][\w-]*$/

function axeTarget(haunting: Pick<Haunting, 'nodeIds'>, raw: Pick<RawAudit, 'axeViolations'>): string | null {
  for (const violation of raw.axeViolations) {
    for (const node of violation.nodes) {
      if (node.backendDOMNodeId !== null && haunting.nodeIds.includes(node.backendDOMNodeId) && node.target.length > 0) {
        return node.target.join(' ')
      }
    }
  }
  return null
}

/** `tag#id.class` built only from tokens found in the opening tag of the snippet. */
function snippetSelector(htmlSnippet: string): string | null {
  const open = /^\s*<([A-Za-z][\w-]*)([^>]*)>?/.exec(htmlSnippet)
  if (!open) return null
  const tag = open[1] ?? ''
  const attrs = open[2] ?? ''
  const id = /\sid\s*=\s*"([^"]*)"/.exec(` ${attrs}`)?.[1]
  const cls = /\sclass\s*=\s*"([^"]*)"/.exec(` ${attrs}`)?.[1]
  const idPart = id !== undefined && TOKEN.test(id) ? `#${id}` : ''
  const classes = (cls ?? '').split(/\s+/).filter((c) => TOKEN.test(c))
  return `${tag}${idPart}${classes.map((c) => `.${c}`).join('')}`
}

export function selectorFor(
  haunting: Pick<Haunting, 'nodeIds' | 'htmlSnippet'>,
  raw: Pick<RawAudit, 'axeViolations'>
): string {
  return axeTarget(haunting, raw) ?? snippetSelector(haunting.htmlSnippet) ?? SELECTOR_FALLBACK
}
