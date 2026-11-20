import { describe, it, expect } from 'vitest'
import {
  AuditTimeoutError,
  SsrfBlockedError,
  AuditResourceLimitError,
  NonHtmlContentError,
  AuditCollectionError,
  AuditContextError,
  HtmlSizeError
} from './types.js'

describe('AuditTimeoutError', () => {
  it('instantiates with correct message and fields', () => {
    const error = new AuditTimeoutError('navigation', 30000)
    expect(error.message).toBe('Audit timeout: navigation exceeded 30000ms')
    expect(error.operation).toBe('navigation')
    expect(error.elapsedMs).toBe(30000)
    expect(error).toBeInstanceOf(AuditTimeoutError)
    expect(error).toBeInstanceOf(Error)
  })
})

describe('SsrfBlockedError', () => {
  it('instantiates with correct message and fields', () => {
    const error = new SsrfBlockedError('http://127.0.0.1', 'loopback address')
    expect(error.message).toBe('SSRF blocked: http://127.0.0.1 — loopback address')
    expect(error.url).toBe('http://127.0.0.1')
    expect(error.reason).toBe('loopback address')
    expect(error).toBeInstanceOf(SsrfBlockedError)
    expect(error).toBeInstanceOf(Error)
  })
})

describe('AuditResourceLimitError', () => {
  it('instantiates with correct message and fields for request-count', () => {
    const error = new AuditResourceLimitError('request-count', 501)
    expect(error.message).toBe('Resource limit exceeded: request-count = 501')
    expect(error.limitType).toBe('request-count')
    expect(error.value).toBe(501)
    expect(error).toBeInstanceOf(AuditResourceLimitError)
    expect(error).toBeInstanceOf(Error)
  })

  it('instantiates with correct message and fields for total-weight', () => {
    const error = new AuditResourceLimitError('total-weight', 52428801)
    expect(error.message).toBe('Resource limit exceeded: total-weight = 52428801')
    expect(error.limitType).toBe('total-weight')
    expect(error.value).toBe(52428801)
  })

  it('instantiates with correct message and fields for per-resource', () => {
    const error = new AuditResourceLimitError('per-resource', 10485761)
    expect(error.message).toBe('Resource limit exceeded: per-resource = 10485761')
    expect(error.limitType).toBe('per-resource')
    expect(error.value).toBe(10485761)
  })
})

describe('NonHtmlContentError', () => {
  it('instantiates with correct message and fields', () => {
    const error = new NonHtmlContentError('application/json')
    expect(error.message).toBe('Non-HTML content type: application/json')
    expect(error.contentType).toBe('application/json')
    expect(error).toBeInstanceOf(NonHtmlContentError)
    expect(error).toBeInstanceOf(Error)
  })
})

describe('AuditCollectionError', () => {
  it('instantiates with correct message and fields', () => {
    const cause = new Error('CDP session unavailable')
    const error = new AuditCollectionError('ax-tree', cause)
    expect(error.message).toBe('Collection error in step "ax-tree"')
    expect(error.step).toBe('ax-tree')
    expect(error.cause).toBe(cause)
    expect(error).toBeInstanceOf(AuditCollectionError)
    expect(error).toBeInstanceOf(Error)
  })
})

describe('AuditContextError', () => {
  it('instantiates with correct message and fields', () => {
    const cause = new Error('Browser not found')
    const error = new AuditContextError(cause)
    expect(error.message).toBe('Failed to create browser context')
    expect(error.cause).toBe(cause)
    expect(error).toBeInstanceOf(AuditContextError)
    expect(error).toBeInstanceOf(Error)
  })
})

describe('HtmlSizeError', () => {
  it('instantiates with correct message and fields', () => {
    const error = new HtmlSizeError(10485761)
    expect(error.message).toBe('HTML input too large: 10485761 bytes (max 10485760)')
    expect(error.byteLength).toBe(10485761)
    expect(error).toBeInstanceOf(HtmlSizeError)
    expect(error).toBeInstanceOf(Error)
  })
})
