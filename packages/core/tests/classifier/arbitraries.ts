import fc from 'fast-check'
import type {
  AXNode,
  AxeViolation,
  ComputedStyleMap,
  DomNodeInfo,
  RawAudit,
  TabCycle,
  TabStep,
} from '../../src/types.js'
import type { Haunting, HauntingSeverity, HauntingType } from '../../src/classifier/types.js'
import { HAUNTING_TYPES } from '../../src/classifier/types.js'
import { WCAG_1_3_1, WCAG_4_1_2, WCAG_1_4_3 } from '../../src/classifier/wcag.js'
import type { RGBColor } from '../../src/classifier/contrast.js'
import { ax, baseRaw, BODY_ID, HTML_ID, mapping } from './builders.js'

export const arbChannel: fc.Arbitrary<number> = fc.integer({ min: 0, max: 255 })
export const arbRgb: fc.Arbitrary<RGBColor> = fc.record({ r: arbChannel, g: arbChannel, b: arbChannel })
export const arbRgbString: fc.Arbitrary<string> = arbRgb.map(({ r, g, b }) => `rgb(${r}, ${g}, ${b})`)

const arbSeverity: fc.Arbitrary<HauntingSeverity> = fc.constantFrom('Wraith', 'Restless', 'Banished')
const arbType: fc.Arbitrary<HauntingType> = fc.constantFrom(...HAUNTING_TYPES)

/** A Haunting with every field filled; only severity and isPrimary matter to the score. */
export const arbHaunting: fc.Arbitrary<Haunting> = fc
  .record({
    type: arbType,
    severity: arbSeverity,
    isPrimary: fc.boolean(),
    nodeId: fc.integer({ min: 1, max: 50 }),
  })
  .map(({ type, severity, isPrimary, nodeId }) => ({
    id: `${type}-${nodeId}`,
    type,
    severity,
    wcag: [type === 'TheFog' ? WCAG_1_4_3 : type === 'WhisperingField' ? WCAG_1_3_1 : WCAG_4_1_2],
    nodeIds: [nodeId],
    box: null,
    htmlSnippet: '',
    explanation: '',
    persona: 'As a user, I test.',
    fix: { instruction: '', codeSnippet: '' },
    isPrimary,
    secondary: [],
  }))

export const arbPrimaryHaunting: fc.Arbitrary<Haunting> = arbHaunting.map((h) => ({ ...h, isPrimary: true }))

// ---------------------------------------------------------------------------
// AX nodes (for speech tests)
// ---------------------------------------------------------------------------

export const SPEECH_ROLES: readonly string[] = [
  'button', 'link', 'checkbox', 'radio', 'switch', 'textbox', 'searchbox', 'spinbutton', 'slider', 'combobox',
  'listbox', 'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'treeitem', 'gridcell', 'img', 'image',
  'heading', 'list', 'listitem', 'table', 'row', 'columnheader', 'rowheader', 'cell', 'form', 'region', 'main',
  'navigation', 'banner', 'contentinfo', 'complementary', 'dialog', 'alertdialog', 'alert', 'status', 'log',
  'paragraph', 'article', 'separator',
]

/** Names that cannot collide with a label word or with the words "undefined" and "null". */
export const arbRealName: fc.Arbitrary<string> = fc
  .stringMatching(/^[QXZ][qxz0-9]{2,8}$/)
  .map((s) => `${s}Name`)

export const arbBlank: fc.Arbitrary<string> = fc.constantFrom('', ' ', '  ', '\t', '\n ')

const arbTri: fc.Arbitrary<string> = fc.constantFrom('true', 'false', 'mixed')
const arbBool: fc.Arbitrary<boolean> = fc.boolean()

export const arbAxNode = (roles: readonly string[] = SPEECH_ROLES): fc.Arbitrary<AXNode> =>
  fc
    .record({
      role: fc.constantFrom(...roles),
      name: fc.oneof(arbRealName, arbBlank),
      checked: arbTri,
      pressed: arbTri,
      selected: arbBool,
      expanded: arbBool,
      disabled: arbBool,
      required: arbBool,
      level: fc.integer({ min: 1, max: 6 }),
      withLevel: arbBool,
    })
    .map((r) =>
      ax({
        id: 10,
        role: r.role,
        name: r.name,
        props: {
          checked: r.checked,
          pressed: r.pressed,
          selected: r.selected,
          expanded: r.expanded,
          disabled: r.disabled,
          required: r.required,
          ...(r.withLevel ? { level: r.level } : {}),
        },
      })
    )

// ---------------------------------------------------------------------------
// RawAudit
// ---------------------------------------------------------------------------

const TAGS = ['div', 'span', 'a', 'button', 'input', 'img', 'svg', 'h1', 'h2', 'h3', 'h4', 'p', 'section', 'form', 'li', 'dialog'] as const
const AX_ROLES = ['button', 'link', 'textbox', 'image', 'img', 'checkbox', 'radio', 'combobox', 'generic', 'none', 'heading', 'main', 'StaticText', 'dialog']
const EVENTS = ['click', 'mousedown', 'pointerdown', 'pointerup'] as const
const AXE_RULES = ['button-name', 'link-name', 'image-alt', 'color-contrast', 'label', 'html-has-lang', 'aria-hidden-focus', 'nested-interactive', 'region']

const arbAttrs: fc.Arbitrary<DomNodeInfo['attrs']> = fc.record(
  {
    id: fc.constantFrom('checkout', 'cart-1', 'x', 'main'),
    class: fc.constantFrom('btn', 'checkout-btn', 'card', 'x y'),
    role: fc.constantFrom('button', 'presentation', 'none', 'dialog', 'img'),
    href: fc.constant('#'),
    src: fc.constantFrom('img/a.png', '/x/b.svg?v=2#h'),
    alt: fc.constantFrom('', 'a'),
    'aria-hidden': fc.constant('true'),
    placeholder: fc.constant('p'),
    disabled: fc.constant(''),
  },
  { requiredKeys: [] }
)

type ElementSpec = {
  tag: (typeof TAGS)[number]
  parentPick: number
  attrs: DomNodeInfo['attrs']
  hasAx: boolean
  role: string
  name: string
  ignored: boolean
  props: { checked: string; disabled: boolean }
  hasBox: boolean
  box: { x: number; y: number; width: number; height: number }
  text: { color: string; background: string; uncertain: boolean; large: boolean } | null
  events: Array<(typeof EVENTS)[number]> | null
  hasMapping: boolean
  mappingFlags: [boolean, boolean, boolean, boolean, boolean, boolean]
}

const arbElement: fc.Arbitrary<ElementSpec> = fc.record({
  tag: fc.constantFrom(...TAGS),
  parentPick: fc.nat(100),
  attrs: arbAttrs,
  hasAx: fc.boolean(),
  role: fc.constantFrom(...AX_ROLES),
  name: fc.constantFrom('', ' ', 'Buy now', 'Name'),
  ignored: fc.boolean(),
  props: fc.record({ checked: arbTri, disabled: arbBool }),
  hasBox: fc.boolean(),
  box: fc.record({ x: fc.nat(2000), y: fc.nat(2000), width: fc.nat(500), height: fc.nat(500) }),
  text: fc.option(fc.record({ color: arbRgbString, background: arbRgbString, uncertain: arbBool, large: arbBool }), { nil: null }),
  events: fc.option(fc.subarray([...EVENTS], { minLength: 1 }), { nil: null }),
  hasMapping: arbBool,
  mappingFlags: fc.tuple(arbBool, arbBool, arbBool, arbBool, arbBool, arbBool),
})

const arbStyleMap: fc.Arbitrary<ComputedStyleMap> = fc.record({
  'adjacent-background-color': arbRgbString,
  'background-color': arbRgbString,
  'border-color': arbRgbString,
  'box-shadow': fc.constantFrom('none', 'rgb(0, 0, 0) 0px 0px 4px 2px', 'rgba(0, 0, 0, 0) 0px 0px 0px 0px'),
  'outline-color': arbRgbString,
  'outline-offset': fc.constant('0px'),
  'outline-style': fc.constantFrom('none', 'solid', 'auto'),
  'outline-width': fc.constantFrom('0px', '1px', '3px'),
  'text-decoration-line': fc.constantFrom('none', 'underline'),
  'text-decoration-style': fc.constantFrom('solid', 'dashed'),
  'border-style': fc.constantFrom('none', 'solid'),
  'border-width': fc.constantFrom('0px', '1px', '2px'),
  color: arbRgbString,
})

type TabSpec = { pick: number; before: ComputedStyleMap; after: ComputedStyleMap; cdpError: boolean; empty: boolean }
const arbTabSpec: fc.Arbitrary<TabSpec> = fc.record({
  pick: fc.nat(100),
  before: arbStyleMap,
  after: arbStyleMap,
  cdpError: fc.boolean(),
  empty: fc.boolean(),
})


type RawSpec = {
  elements: ElementSpec[]
  tabs: TabSpec[]
  trap: { detected: boolean; escapable: boolean; includesAll: boolean; pick: number[] }
  lang: string | null
  hasMain: boolean
  axe: Array<{ rule: string; picks: Array<number | null> }>
}

const arbRawSpec: fc.Arbitrary<RawSpec> = fc.record({
  elements: fc.array(arbElement, { minLength: 0, maxLength: 12 }),
  tabs: fc.array(arbTabSpec, { minLength: 0, maxLength: 8 }),
  trap: fc.record({ detected: arbBool, escapable: arbBool, includesAll: arbBool, pick: fc.array(fc.nat(100), { minLength: 1, maxLength: 4 }) }),
  lang: fc.constantFrom<string | null>('en', 'fr-CA', '', 'x', 'not a tag', null),
  hasMain: arbBool,
  axe: fc.array(fc.record({ rule: fc.constantFrom(...AXE_RULES), picks: fc.array(fc.option(fc.nat(100), { nil: null }), { maxLength: 3 }) }), { maxLength: 5 }),
})

/** Element ids start at 10: html is 1, body is 2. */
const idOf = (index: number): number => 10 + index

function buildRaw(spec: RawSpec): RawAudit {
  const els = spec.elements
  const ids = els.map((_, i) => idOf(i))
  const pickId = (n: number): number => (ids.length === 0 ? BODY_ID : (ids[n % ids.length] ?? BODY_ID))
  const parentOf = (i: number): number => (i === 0 || els[i]!.parentPick % (i + 1) === i ? BODY_ID : idOf(els[i]!.parentPick % i))
  const raw = baseRaw()
  const domNodes: RawAudit['domNodes'] = { ...raw.domNodes }
  els.forEach((e, i) => {
    domNodes[String(idOf(i))] = { tag: e.tag, parentId: parentOf(i), attrs: e.attrs, outerHTMLSnippet: `<${e.tag}>` }
  })
  const axNodes: AXNode[] = els.flatMap((e, i) =>
    e.hasAx
      ? [ax({ id: idOf(i), role: e.role, name: e.name, ignored: e.ignored, props: { checked: e.props.checked, disabled: e.props.disabled } })]
      : []
  )
  const steps: TabStep[] = spec.tabs.map((t, index) => ({
    index,
    backendDOMNodeId: t.empty ? '' : String(pickId(t.pick)),
    focusSnapshot: { before: t.before, after: t.after },
    cdpError: t.cdpError,
  }))
  const cycles: TabCycle[] = [
    { nodeIds: spec.trap.pick.map((p) => String(pickId(p))), startStepIndex: 0, escapable: spec.trap.escapable, includesAllFocusables: spec.trap.includesAll, allFocusablesVisited: false },
  ]
  const headings = els.flatMap((e, i) => (/^h[1-6]$/.test(e.tag) ? [{ tagName: e.tag, accessibleName: '', domOrderIndex: 0, backendDOMNodeId: idOf(i) }] : []))
  const violations: AxeViolation[] = spec.axe.map((a) => ({
    id: a.rule,
    impact: 'serious',
    tags: [],
    description: '',
    helpUrl: '',
    nodes: a.picks.map((p) => ({ html: '', target: ['x'], failureSummary: '', backendDOMNodeId: p === null ? null : pickId(p) })),
  }))
  return {
    ...raw,
    boundingBoxes: els.flatMap((e, i) => (e.hasBox ? [{ backendDOMNodeId: idOf(i), ...e.box }] : [])),
    axNodes,
    axeViolations: violations,
    textNodeStyles: Object.fromEntries(
      els.flatMap((e, i) =>
        e.text
          ? [[String(idOf(i)), { color: e.text.color, backgroundColor: e.text.background, fontSize: '16px', fontWeight: '400', backgroundUncertain: e.text.uncertain, isLargeText: e.text.large }]]
          : []
      )
    ),
    imgAltAttributes: Object.fromEntries(els.flatMap((e, i) => (e.tag === 'img' ? [[String(idOf(i)), e.attrs.alt ?? null]] : []))),
    imgSrcAttributes: Object.fromEntries(els.flatMap((e, i) => (e.tag === 'img' ? [[String(idOf(i)), e.attrs.src ?? null]] : []))),
    domNodes,
    eventListenerSignals: els.flatMap((e, i) => (e.events ? [{ backendDOMNodeId: idOf(i), eventTypes: e.events, tagName: e.tag }] : [])),
    tabWalkResult: {
      ...raw.tabWalkResult,
      steps,
      trapDetected: spec.trap.detected,
      trapRegionNodeIds: spec.trap.detected ? spec.trap.pick.map((p) => String(pickId(p))) : [],
      cycles,
    },
    pageMetadata: { ...raw.pageMetadata, htmlLang: spec.lang, headings, hasMainLandmark: spec.hasMain, htmlBackendDOMNodeId: HTML_ID },
    domAxMapping: els.flatMap((e, i) =>
      e.hasMapping
        ? [mapping(idOf(i), e.tag, { hasAxNode: e.hasAx && !e.ignored, ariaHidden: e.mappingFlags[0], isPresentational: e.mappingFlags[1], isFocusable: e.mappingFlags[2], hasVisibleText: e.mappingFlags[3], containsFocusable: e.mappingFlags[4] })]
        : []
    ),
  }
}

/** A RawAudit whose ids all refer to each other: a parent tree in domNodes, and AX, boxes, steps and axe nodes that point into it. */
export const arbRawAudit: fc.Arbitrary<RawAudit> = arbRawSpec.map(buildRaw)

