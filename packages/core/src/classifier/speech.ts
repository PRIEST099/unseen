import type { AXNode, BoundingBox, RawAudit } from '../types.js'
import type { SpeechLine } from './types.js'
import { axName, axProp, axRole, fileNameFromSrc, isPlaceholderSource, winningNameSource } from './util.js'

export type RoleLabel = string // human-readable role name
export type StateLabel = string // e.g. "checked", "expanded", "dimmed"

export type SpeechComponents = {
  name: string
  role: string
  state: string
}

/** The role label map from hauntings.md §Speech announcement rules. */
export const ROLE_LABEL_MAP: Readonly<Record<string, RoleLabel>> = {
  button: 'button',
  link: 'link',
  checkbox: 'checkbox',
  radio: 'radio button',
  switch: 'switch',
  textbox: 'edit text',
  searchbox: 'search',
  spinbutton: 'spin button',
  slider: 'slider',
  combobox: 'combo box',
  listbox: 'list box',
  option: 'option',
  menuitem: 'menu item',
  menuitemcheckbox: 'menu item checkbox',
  menuitemradio: 'menu item radio',
  tab: 'tab',
  treeitem: 'tree item',
  gridcell: 'grid cell',
  img: 'graphic',
  image: 'graphic',
  heading: 'heading',
  list: 'list',
  listitem: 'list item',
  table: 'table',
  row: 'row',
  columnheader: 'column header',
  rowheader: 'row header',
  cell: 'cell',
  form: 'form',
  region: 'region',
  main: 'main',
  navigation: 'navigation',
  banner: 'banner',
  contentinfo: 'content info',
  complementary: 'complementary',
  dialog: 'dialog',
  alertdialog: 'alert dialog',
  alert: 'alert',
  status: 'status',
  log: 'log',
}

export const SKIPPED_ROLES: ReadonlySet<string> = new Set(['generic', 'none', 'presentation'])
const BLANK_ROLES: ReadonlySet<string> = new Set(['textbox', 'searchbox', 'spinbutton', 'slider', 'combobox'])
export const PLACEHOLDER_NOTE = 'name disappears when typing'

const has = (map: Readonly<Record<string, string>>, key: string): boolean => Object.prototype.hasOwnProperty.call(map, key)

function headingLevel(node: AXNode, raw: RawAudit): string | undefined {
  const level = axProp(node, 'level')
  if (level !== undefined && /^[1-6]$/.test(level)) return level
  const tag = raw.domNodes[String(node.backendDOMNodeId)]?.tag
  return tag !== undefined && /^h[1-6]$/.test(tag) ? tag.slice(1) : undefined
}

export function roleLabel(node: AXNode, raw: RawAudit): RoleLabel {
  const role = axRole(node)
  const label = has(ROLE_LABEL_MAP, role) ? (ROLE_LABEL_MAP[role] ?? role) : role
  if (role !== 'heading') return label
  const level = headingLevel(node, raw)
  return level === undefined ? label : `${label} level ${level}`
}

function checkedState(node: AXNode, role: string): StateLabel {
  const checked = axProp(node, 'checked')
  if (role === 'radio' || role === 'menuitemradio') return checked === 'true' ? 'selected' : 'unselected'
  if (role === 'switch') return checked === 'true' ? 'on' : 'off'
  if (checked === 'true') return 'checked'
  return checked === 'mixed' ? 'mixed' : 'unchecked'
}

/** The state words that apply to the role (hauntings.md §State rules), in speaking order. */
function stateLabels(node: AXNode): StateLabel[] {
  const role = axRole(node)
  const out: StateLabel[] = []
  if (role === 'checkbox' || role === 'menuitemcheckbox' || role === 'radio' || role === 'menuitemradio' || role === 'switch') {
    out.push(checkedState(node, role))
  } else if (role === 'button') {
    if (axProp(node, 'pressed') === 'true') out.push('pressed')
  } else if (role === 'option' || role === 'tab') {
    if (axProp(node, 'selected') === 'true') out.push('selected')
  } else if (role === 'combobox' || role === 'treeitem') {
    const expanded = axProp(node, 'expanded')
    if (expanded === 'true') out.push('expanded')
    else if (expanded === 'false') out.push('collapsed')
  }
  if (axProp(node, 'disabled') === 'true') out.push('dimmed')
  if (axProp(node, 'required') === 'true') out.push('required')
  return out
}

/** Split an announcement into its parts (exported for tests). */
export function speechComponents(node: AXNode, raw: RawAudit): SpeechComponents {
  return { name: axName(node), role: roleLabel(node, raw), state: stateLabels(node).join(', ') }
}

/**
 * What a screen reader says for this AX node: `[name, role, state].filter(Boolean).join(", ")`, with the
 * steering special rows (blank form fields, unlabelled graphics). Generic, none and presentation say nothing.
 */
export function announce(node: AXNode, raw: RawAudit): string {
  const role = axRole(node)
  if (SKIPPED_ROLES.has(role)) return ''
  const { name, state } = speechComponents(node, raw)
  const label = roleLabel(node, raw)
  if (name === '' && (role === 'img' || role === 'image')) {
    const file = fileNameFromSrc(raw.imgSrcAttributes[String(node.backendDOMNodeId)])
    return file === null ? 'unlabelled graphic' : `unlabelled graphic, ${file}`
  }
  if (name === '' && BLANK_ROLES.has(role)) return [label, 'blank', state].filter(Boolean).join(', ')
  return [name, label, state].filter(Boolean).join(', ')
}

/** `"name disappears when typing"` when a form field is named by its placeholder only. */
export function announceNote(node: AXNode): string | undefined {
  if (!BLANK_ROLES.has(axRole(node)) || axName(node) === '') return undefined
  return isPlaceholderSource(winningNameSource(node)) ? PLACEHOLDER_NOTE : undefined
}

/**
 * The Whisper Walk speech track: one line per non-ignored AX node, in the order of `raw.axNodes` (CDP tree order).
 * Nodes that announce nothing (generic, none, presentation) are left out. Pure: reuses `announce` and `announceNote`.
 */
export function buildSpeechTrack(raw: RawAudit): SpeechLine[] {
  const boxes = new Map<number, BoundingBox>()
  for (const box of raw.boundingBoxes) {
    if (!boxes.has(box.backendDOMNodeId)) boxes.set(box.backendDOMNodeId, box)
  }
  const lines: SpeechLine[] = []
  for (const node of raw.axNodes) {
    if (node.ignored === true) continue
    const text = announce(node, raw)
    if (text === '') continue
    const note = announceNote(node)
    lines.push({
      backendDOMNodeId: node.backendDOMNodeId,
      text,
      ...(note !== undefined ? { note } : {}),
      box: boxes.get(node.backendDOMNodeId) ?? null,
    })
  }
  return lines
}
