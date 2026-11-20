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
  eventListenerSignals: EventListenerSignal[]
  tabWalkResult: TabWalkResult
  pageMetadata: PageMetadata
  domAxMapping: DomAxMapping[]
  resourceUsage: ResourceUsage
  blockedRequests: Array<{ url: string; reason: string }>
  abortedResources: string[]
  collectionErrors: CollectionError[]
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
  parentId: string | undefined
}

export type AXValue = {
  type: string
  value: string | boolean | number | undefined
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
}

export type TabStep = {
  index: number // 0-based step counter
  backendDOMNodeId: string
  focusSnapshot: FocusSnapshot
  cdpError: boolean // true if CDP read failed for this step
}

export type FocusSnapshot = {
  before: ComputedStyleMap // styles captured before Tab keypress
  after: ComputedStyleMap // styles captured after focus arrives
}

export type ComputedStyleMap = Record<string, string> // CSS property → computed value

export type TabCycle = {
  nodeIds: string[] // backendDOMNodeIds forming the cycle
  startStepIndex: number
  escapable: boolean
}

// Cycle detection result (pure function output)
export type CycleResult = {
  hasCycle: boolean
  cycleStart: number // index of first repeat, or -1
  cycleNodeIds: string[]
}

// Text node computed styles for contrast detection
export type TextNodeStyle = {
  color: string
  backgroundColor: string // effective (resolved from transparent ancestors)
  fontSize: string // e.g. "16px"
  fontWeight: string // e.g. "400"
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
}

// Page-level metadata for Silent Tongue and Shattered Order
export type PageMetadata = {
  htmlLang: string | null
  headings: HeadingRecord[]
  landmarkRoles: string[]
}

export type HeadingRecord = {
  tagName: string // "h1" – "h6"
  accessibleName: string
  domOrderIndex: number // 0-based position among all headings
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
  step: "ax-tree" | "axe" | "event-listeners" | "text-styles" | "dom-ax-mapping" | "tab-walk"
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
