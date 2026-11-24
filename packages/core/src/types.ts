// Schema version literal — increment when a breaking change is made
export type SchemaVersion = "1"

// Top-level audit result
export type RawAudit = {
  schemaVersion: SchemaVersion
  auditedUrl: string
  auditedAt: string // ISO 8601
  screenshotPng: string // base64-encoded PNG
  viewportWidth: number
  viewportHeight: number
  boundingBoxes: BoundingBox[]
  axNodes: AXNode[]
  axeViolations: AxeViolation[]
  axeIncomplete: AxeViolation[]
  textNodeStyles: Record<string, TextNodeStyle> // keyed by backendDOMNodeId (string)
  elementCursorStyles: Record<string, string> // keyed by backendDOMNodeId (string)
  imgAltAttributes: Record<string, string | null> // keyed by backendDOMNodeId; null = absent
  imgSrcAttributes: Record<string, string | null> // keyed by backendDOMNodeId of every <img>; null = no src attribute
  domNodes: Record<string, DomNodeInfo> // keyed by backendDOMNodeId (string)
  eventListenerSignals: EventListenerSignal[]
  tabWalkResult: TabWalkResult
  pageMetadata: PageMetadata
  domAxMapping: DomAxMapping[]
  resourceUsage: ResourceUsage
  blockedRequests: Array<{ url: string; reason: string }>
  abortedResources: string[]
  collectionErrors: CollectionError[]
}

// The attributes the classifier may read from a DOM node (nothing else is recorded)
export const DOM_ATTR_NAMES = [
  'id', 'class', 'role', 'href', 'src', 'alt', 'type', 'tabindex', 'aria-hidden', 'aria-label', 'placeholder', 'disabled',
] as const
export type DomAttrName = (typeof DOM_ATTR_NAMES)[number]

// One DOM node, as the classifier needs it for ancestry, snippets and attribute checks
export type DomNodeInfo = {
  tag: string // lower-case local name; '#text' and '#document' for those node types
  parentId: number | null // backendDOMNodeId of the parent element (the host for shadow roots and frames)
  attrs: Partial<Record<DomAttrName, string>> // present attributes only; a bare attribute is ''
  outerHTMLSnippet: string // at most 300 characters
}

// AX node from CDP Accessibility.getFullAXTree
export type AXNode = {
  nodeId: string
  backendDOMNodeId: number
  role: AXValue
  name: AXValue
  description: AXValue
  properties: AXProperty[]
  states: AXProperty[]
  ignored: boolean
  ignoredReasons: AXProperty[]
  childIds: string[]
  parentId?: string
  frameId?: string // set for nodes of a child frame; absent for the main frame. Node ids of a child frame are prefixed with it
}

export type AXValue = {
  type: string
  value?: string | boolean | number
  sources?: AXValueSource[]
}

export type AXValueSource = {
  type: string
  value?: AXValue
  attribute?: string
  attributeValue?: AXValue
  superseded?: boolean
  nativeSource?: string
  nativeSourceValue?: AXValue
  invalid?: boolean
  invalidReason?: string
}

export type AXProperty = {
  name: string
  value: AXValue
}

// Bounding box in screenshot pixel coordinates
export type BoundingBox = {
  backendDOMNodeId: number
  x: number
  y: number
  width: number
  height: number
}

// Tab walk output
export type TabWalkResult = {
  steps: TabStep[]
  trapDetected: boolean
  trapRegionNodeIds: string[] // backendDOMNodeIds in the trap region
  stepCapReached: boolean
  cycles: TabCycle[]
  walkStartedAtMs: number // epoch ms when the walk started (after the settle window)
  endReason: TabWalkEndReason
}

export type TabWalkEndReason =
  | "body"
  | "trap"
  | "step-cap"
  | "cycle-includes-all"
  | "no-focusables"
  | "no-focus"
  | "cdp-error"
  | "composite-stuck" // focus stayed inside one frame or shadow host past its press budget
  | "navigated" // the page navigated mid-walk; later focusables were not walked
  | "cycle-repeated" // an escapable cycle was re-entered: focus can only leave it backwards

export type TabStep = {
  index: number // 0-based step counter
  backendDOMNodeId: string
  focusSnapshot: FocusSnapshot
  cdpError: boolean // true if CDP read failed for this step
  compositeTruncated?: true // focus stayed inside this frame or shadow host past the 50-press sub-cap
  baselineUnavailable?: true // the unfocused look could not be read; `before` is empty
  innerFocusUnreadable?: true // focus is on a frame or closed-shadow host; where it really sits inside cannot be read
}

export type FocusSnapshot = {
  before: ComputedStyleMap // styles captured before Tab keypress
  after: ComputedStyleMap // styles captured after focus arrives
}

export type ComputedStyleMap = Record<string, string> // CSS property → computed value

export type TabCycle = {
  nodeIds: string[] // backendDOMNodeIds forming the cycle
  startStepIndex: number
  escapable?: boolean // set only when the escape test ran for this cycle
  includesAllFocusables: boolean // the cycle members are every focusable on the page
  allFocusablesVisited: boolean // every focusable had been visited when the cycle closed (the walk ends, not a trap)
}

// Text node computed styles for contrast detection
export type TextNodeStyle = {
  color: string
  backgroundColor: string // effective (resolved from transparent ancestors)
  fontSize: string // e.g. "16px"
  fontWeight: string // e.g. "400"
  backgroundUncertain: boolean // an image, gradient or translucent layer sits between text and the first opaque colour
  isLargeText: boolean // WCAG large text: >= 24px, or >= 18.66px and bold (>= 700)
}

// Click/pointer event listener presence on a node
export type EventListenerSignal = {
  backendDOMNodeId: number
  eventTypes: Array<"click" | "mousedown" | "pointerdown" | "pointerup">
  tagName: string
}

// DOM-to-AX presence mapping for The Veiled detection
export type DomAxMapping = {
  backendDOMNodeId: number
  tagName: string
  hasAxNode: boolean
  ariaHidden: boolean
  isPresentational: boolean
  isFocusable: boolean
  hasVisibleText: boolean // subtree has visible non-whitespace text inside the scrollable area
  containsFocusable: boolean // subtree (excluding the element itself) has a focusable element
}

// Page-level metadata for Silent Tongue and Shattered Order
export type PageMetadata = {
  htmlLang: string | null
  headings: HeadingRecord[]
  landmarkRoles: string[]
  hasMainLandmark: boolean // <main> or role="main" present
  htmlBackendDOMNodeId: number // the <html> element
  bodyBackendDOMNodeId: number | null // the <body> element; null when the page has none
}

export type HeadingRecord = {
  tagName: string // "h1" – "h6"
  accessibleName: string
  domOrderIndex: number // 0-based position among all headings
  backendDOMNodeId: number // 0 when the id could not be read
}

// Network resource usage counters
export type ResourceUsage = {
  totalBytes: number
  requestCount: number
  maxResourceBytes: number
  responseTimings: Array<{ url: string; bytesReceived: number; durationMs: number }>
}

// Non-fatal collection error recorded in RawAudit
export type CollectionError = {
  step: "ax-tree" | "axe" | "event-listeners" | "text-styles" | "dom-ax-mapping" | "tab-walk" | "dom-nodes"
  message: string
  backendDOMNodeId?: number
}

// axe-core violation (normalised)
export type AxeViolation = {
  id: string
  impact: "minor" | "moderate" | "serious" | "critical" | null
  tags: string[]
  description: string
  helpUrl: string
  nodes: AxeViolationNode[]
}

export type AxeViolationNode = {
  html: string
  target: string[] // CSS selector path
  backendDOMNodeId: number | null // null for multi-part (iframe/shadow) targets or when the element cannot be found
  failureSummary: string
}

// Public API options
export type AuditOptions = {
  allowPrivate?: boolean // default false
  timeoutMs?: number // default 60000
  navigationTimeoutMs?: number // default 30000
  safeFetchPolicy?: SafeFetchPolicy // override for testing
  viewport?: { width: number; height: number } // default 1280×900
}

// SSRF guard interface
export interface SafeFetchPolicy {
  /** `'permissive'` runs without the egress proxy. Absent means restrictive. */
  readonly mode?: 'restrictive' | 'permissive'
  shouldBlock(url: string): Promise<{ block: boolean; reason: string }>
}

// Typed error classes
export class AuditTimeoutError extends Error {
  constructor(
    public readonly operation: string,
    public readonly elapsedMs: number
  ) {
    super(`Audit timeout: ${operation} exceeded ${elapsedMs}ms`)
  }
}

export class SsrfBlockedError extends Error {
  constructor(
    public readonly url: string,
    public readonly reason: string
  ) {
    super(`SSRF blocked: ${url} — ${reason}`)
  }
}

export class AuditResourceLimitError extends Error {
  constructor(
    public readonly limitType: "request-count" | "total-weight" | "per-resource",
    public readonly value: number
  ) {
    super(`Resource limit exceeded: ${limitType} = ${value}`)
  }
}

export class NonHtmlContentError extends Error {
  constructor(public readonly contentType: string) {
    super(`Non-HTML content type: ${contentType}`)
  }
}

export class AuditCollectionError extends Error {
  constructor(
    public readonly step: string,
    public readonly cause: unknown
  ) {
    super(`Collection error in step "${step}"`)
  }
}

export class AuditContextError extends Error {
  constructor(public readonly cause: unknown) {
    super('Failed to create browser context')
  }
}

export class HtmlSizeError extends Error {
  constructor(public readonly byteLength: number) {
    super(`HTML input too large: ${byteLength} bytes (max 10485760)`)
  }
}
