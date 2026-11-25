import type { AXNode, RawAudit } from '@the-unseen/core'

/** A complete, empty `RawAudit` for pure code that needs one (speech examples, test data). Fixed values only. */
export function syntheticRaw(overrides: Partial<RawAudit> = {}): RawAudit {
  return {
    schemaVersion: '1',
    auditedUrl: 'http://synthetic.invalid/',
    auditedAt: '2000-01-01T00:00:00.000Z',
    screenshotPng: '',
    viewportWidth: 1280,
    viewportHeight: 800,
    boundingBoxes: [],
    axNodes: [],
    axeViolations: [],
    axeIncomplete: [],
    textNodeStyles: {},
    elementCursorStyles: {},
    imgAltAttributes: {},
    imgSrcAttributes: {},
    domNodes: {},
    eventListenerSignals: [],
    tabWalkResult: {
      steps: [],
      trapDetected: false,
      trapRegionNodeIds: [],
      stepCapReached: false,
      cycles: [],
      walkStartedAtMs: 0,
      endReason: 'no-focusables',
    },
    pageMetadata: {
      htmlLang: 'en',
      headings: [],
      landmarkRoles: [],
      hasMainLandmark: false,
      htmlBackendDOMNodeId: 1,
      bodyBackendDOMNodeId: null,
    },
    domAxMapping: [],
    resourceUsage: { totalBytes: 0, requestCount: 0, maxResourceBytes: 0, responseTimings: [] },
    blockedRequests: [],
    abortedResources: [],
    collectionErrors: [],
    ...overrides,
  }
}

/** A synthetic AX node with a role and an accessible name. */
export function syntheticAxNode(role: string, name: string, backendDOMNodeId = 2): AXNode {
  return {
    nodeId: String(backendDOMNodeId),
    backendDOMNodeId,
    role: { type: 'role', value: role },
    name: { type: 'computedString', value: name },
    description: { type: 'computedString', value: '' },
    properties: [],
    states: [],
    ignored: false,
    ignoredReasons: [],
    childIds: [],
  }
}
