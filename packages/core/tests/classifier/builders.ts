import type {
  AXNode,
  AXProperty,
  AXValueSource,
  ComputedStyleMap,
  DomAxMapping,
  DomNodeInfo,
  EventListenerSignal,
  RawAudit,
  TabStep,
  TabWalkResult,
  TextNodeStyle,
} from '../../src/types.js'

export const HTML_ID = 1
export const BODY_ID = 2

/** A minimal, valid RawAudit: html > body, lang="en", a main landmark, nothing else. */
export function baseRaw(overrides: Partial<RawAudit> = {}): RawAudit {
  return {
    schemaVersion: '1',
    auditedUrl: 'http://127.0.0.1:0/',
    auditedAt: '2026-01-01T00:00:00.000Z',
    screenshotPng: '',
    viewportWidth: 1280,
    viewportHeight: 900,
    boundingBoxes: [],
    axNodes: [],
    axeViolations: [],
    axeIncomplete: [],
    textNodeStyles: {},
    elementCursorStyles: {},
    imgAltAttributes: {},
    imgSrcAttributes: {},
    domNodes: {
      [HTML_ID]: { tag: 'html', parentId: null, attrs: {}, outerHTMLSnippet: '<html lang="en">' },
      [BODY_ID]: { tag: 'body', parentId: HTML_ID, attrs: {}, outerHTMLSnippet: '<body>' },
    },
    eventListenerSignals: [],
    tabWalkResult: {
      steps: [],
      trapDetected: false,
      trapRegionNodeIds: [],
      stepCapReached: false,
      cycles: [],
      walkStartedAtMs: 0,
      endReason: 'body',
    },
    pageMetadata: {
      htmlLang: 'en',
      headings: [],
      landmarkRoles: ['main'],
      hasMainLandmark: true,
      htmlBackendDOMNodeId: HTML_ID,
      bodyBackendDOMNodeId: BODY_ID,
    },
    domAxMapping: [],
    resourceUsage: { totalBytes: 0, requestCount: 0, maxResourceBytes: 0, responseTimings: [] },
    blockedRequests: [],
    abortedResources: [],
    collectionErrors: [],
    ...overrides,
  }
}

export function dom(tag: string, parentId: number | null, attrs: DomNodeInfo['attrs'] = {}, snippet?: string): DomNodeInfo {
  const attrText = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('')
  return { tag, parentId, attrs, outerHTMLSnippet: snippet ?? `<${tag}${attrText}>` }
}

export type AxSpec = {
  id: number
  role: string
  name?: string
  ignored?: boolean
  props?: Record<string, string | boolean | number>
  sources?: AXValueSource[]
  parentId?: string
  childIds?: string[]
  ignoredReasons?: string[]
}

export const axId = (id: number): string => `ax${id}`

export function ax(spec: AxSpec): AXNode {
  const properties: AXProperty[] = Object.entries(spec.props ?? {}).map(([name, value]) => ({
    name,
    value: { type: typeof value === 'boolean' ? 'booleanOrUndefined' : 'token', value },
  }))
  return {
    nodeId: axId(spec.id),
    backendDOMNodeId: spec.id,
    role: { type: 'role', value: spec.role },
    name: { type: 'computedString', value: spec.name ?? '', ...(spec.sources ? { sources: spec.sources } : {}) },
    description: { type: 'none' },
    properties,
    states: [],
    ignored: spec.ignored ?? false,
    ignoredReasons: (spec.ignoredReasons ?? []).map((name) => ({ name, value: { type: 'boolean', value: true } })),
    childIds: spec.childIds ?? [],
    ...(spec.parentId !== undefined ? { parentId: spec.parentId } : {}),
  }
}

export function mapping(id: number, tagName: string, over: Partial<DomAxMapping> = {}): DomAxMapping {
  return {
    backendDOMNodeId: id,
    tagName,
    hasAxNode: true,
    ariaHidden: false,
    isPresentational: false,
    isFocusable: false,
    hasVisibleText: false,
    containsFocusable: false,
    ...over,
  }
}

export function style(over: Partial<TextNodeStyle> = {}): TextNodeStyle {
  return {
    color: 'rgb(0, 0, 0)',
    backgroundColor: 'rgb(255, 255, 255)',
    fontSize: '16px',
    fontWeight: '400',
    backgroundUncertain: false,
    isLargeText: false,
    ...over,
  }
}

export function signal(id: number, tagName = 'div', eventTypes: EventListenerSignal['eventTypes'] = ['click']): EventListenerSignal {
  return { backendDOMNodeId: id, eventTypes, tagName }
}

export const FOCUS_BASE: ComputedStyleMap = {
  'adjacent-background-color': 'rgb(255, 255, 255)',
  'background-color': 'rgba(0, 0, 0, 0)',
  'border-color': 'rgb(0, 0, 0)',
  'box-shadow': 'none',
  'outline-color': 'rgb(0, 0, 0)',
  'outline-offset': '0px',
  'outline-style': 'none',
  'outline-width': '3px',
  'text-decoration-line': 'none',
  'text-decoration-style': 'solid',
  'text-decoration-thickness': 'auto',
  'border-style': 'none',
  'border-width': '0px',
  color: 'rgb(0, 0, 0)',
}

export function step(id: number | '', after: ComputedStyleMap = {}, over: Partial<TabStep> = {}, before: ComputedStyleMap = {}): TabStep {
  return {
    index: 0,
    backendDOMNodeId: String(id),
    focusSnapshot: { before: { ...FOCUS_BASE, ...before }, after: { ...FOCUS_BASE, ...after } },
    cdpError: false,
    ...over,
  }
}

export function walk(over: Partial<TabWalkResult> = {}): TabWalkResult {
  return { ...baseRaw().tabWalkResult, ...over }
}
