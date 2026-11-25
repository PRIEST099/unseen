// Audit engine entry point: the public contract, exported by name (no wildcard re-exports).
// Internals (the pool class, the loader, collectors, the walker) are imported from their own modules.
export { auditAndClassify, auditHtmlAndClassify, auditUrl, auditHtml, OriginScopedPolicy } from './audit.js'
export { announce, buildSpeechTrack } from './classifier/speech.js'
export { generateExplanation, generateFix, generatePersona } from './classifier/explanation.js'
export { HAUNTING_TYPES } from './classifier/types.js'
export { ALL_WCAG, SOUND_CUE_BY_TYPE, WCAG_BY_TYPE } from './classifier/wcag.js'
export { getPool } from './runner/browser.js'
export { PermissiveSafeFetchPolicy, RestrictiveSafeFetchPolicy } from './runner/safe-fetch.js'
export {
  AuditCollectionError,
  AuditContextError,
  AuditResourceLimitError,
  AuditTimeoutError,
  HtmlSizeError,
  NonHtmlContentError,
  SsrfBlockedError,
} from './types.js'
export type {
  AxeCrossCheck,
  ClassifiedAudit,
  Haunting,
  HauntingFix,
  HauntingSeverity,
  HauntingType,
  ManualCheckNode,
  WCAGCriterion,
} from './classifier/types.js'
export type { SpeechLine } from './classifier/types.js'
export type {
  AuditOptions,
  OnProgressCallback,
  ProgressStage,
  AXNode,
  AXProperty,
  AXValue,
  AXValueSource,
  AxeViolation,
  AxeViolationNode,
  BoundingBox,
  CollectionError,
  ComputedStyleMap,
  DomAxMapping,
  DomNodeInfo,
  EventListenerSignal,
  FocusSnapshot,
  HeadingRecord,
  PageMetadata,
  RawAudit,
  ResourceUsage,
  SafeFetchPolicy,
  SchemaVersion,
  TabCycle,
  TabStep,
  TabWalkEndReason,
  TabWalkResult,
  TextNodeStyle,
} from './types.js'
