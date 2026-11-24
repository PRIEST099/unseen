import type { AXNode, Haunting } from '@the-unseen/core'
import { hauntingDisplayName } from './haunting-display'

export type AxLookup = ReadonlyMap<number, AXNode>

const MAX_LABEL_LENGTH = 60
const SILENT_TONGUE_LABEL = 'The spirits speak a garbled tongue'
const SHATTERED_ORDER_LABELS: Record<string, string> = {
  'no-h1': 'Missing level 1 heading',
  'heading-skip': 'Skipped heading level',
  'no-main': 'Missing main landmark',
}
/** Roles that say nothing useful about an unnamed element. */
const UNINFORMATIVE_ROLES: ReadonlySet<string> = new Set(['generic', 'none', 'presentation', 'RootWebArea', 'StaticText', 'text'])

export function buildAxLookup(axNodes: readonly AXNode[]): AxLookup {
  const lookup = new Map<number, AXNode>()
  for (const node of axNodes) {
    if (node.backendDOMNodeId !== 0 && !lookup.has(node.backendDOMNodeId)) lookup.set(node.backendDOMNodeId, node)
  }
  return lookup
}

function tidy(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > MAX_LABEL_LENGTH ? `${collapsed.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…` : collapsed
}

function axString(value: { value?: string | boolean | number } | undefined): string {
  return typeof value?.value === 'string' ? tidy(value.value) : ''
}

function snippetText(htmlSnippet: string): string {
  return tidy(htmlSnippet.replace(/<[^>]*>?/g, ' '))
}

function snippetTag(htmlSnippet: string): string {
  return /<([a-zA-Z][\w-]*)/.exec(htmlSnippet)?.[1]?.toLowerCase() ?? ''
}

function pageLevelLabel(haunting: Haunting): string | undefined {
  if (haunting.type === 'SilentTongue') return SILENT_TONGUE_LABEL
  if (haunting.type === 'ShatteredOrder') return SHATTERED_ORDER_LABELS[haunting.kind ?? ''] ?? 'Heading structure'
  return undefined
}

/**
 * The element part of an accessible name: the computed accessible name when there is one, else
 * the role, else the visible text or tag from the HTML snippet, else "element".
 */
export function elementLabel(haunting: Haunting, axNodes: AxLookup): string {
  const pageLevel = pageLevelLabel(haunting)
  if (pageLevel !== undefined) return pageLevel
  const node = haunting.nodeIds.map((id) => axNodes.get(id)).find((candidate) => candidate !== undefined)
  const name = axString(node?.name)
  if (name !== '') return name
  const role = axString(node?.role)
  if (role !== '' && !UNINFORMATIVE_ROLES.has(role)) return role
  return snippetText(haunting.htmlSnippet) || snippetTag(haunting.htmlSnippet) || 'element'
}

/** Requirement 10.2: "[Haunting Display Name]: [element name or role when unnamed], [severity]". */
export function buildOverlayLabel(haunting: Haunting, axNodes: AxLookup): string {
  return `${hauntingDisplayName(haunting.type)}: ${elementLabel(haunting, axNodes)}, ${haunting.severity}`
}
