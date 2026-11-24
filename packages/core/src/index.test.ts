import { describe, expect, it } from 'vitest'
import * as api from './index.js'

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
      'getPool',
    ])
  })
})
