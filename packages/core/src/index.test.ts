import { describe, expect, it } from 'vitest'
import * as api from './index.js'
import { buildSpeechTrack } from './index.js'
import type { SpeechLine } from './index.js'

describe('public API of @the-unseen/core (finding 42)', () => {
  it('exports exactly the public contract by name, and no internals', () => {
    expect(Object.keys(api).sort()).toEqual([
      'AuditCollectionError',
      'AuditContextError',
      'AuditResourceLimitError',
      'AuditTimeoutError',
      'HtmlSizeError',
      'NonHtmlContentError',
      'OriginScopedPolicy',
      'PermissiveSafeFetchPolicy',
      'RestrictiveSafeFetchPolicy',
      'SsrfBlockedError',
      'auditAndClassify',
      'auditHtml',
      'auditUrl',
      'buildSpeechTrack',
      'getPool',
    ])
  })

  it('exports buildSpeechTrack and the SpeechLine type for the Whisper Walk', () => {
    expect(buildSpeechTrack).toBeDefined()
    expect(typeof buildSpeechTrack).toBe('function')
    const line: SpeechLine = { backendDOMNodeId: 0, text: 'button', box: null }
    expect(line.text).toBe('button')
  })
})
