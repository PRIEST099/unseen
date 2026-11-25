import { test, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  AuditResourceLimitError,
  AuditTimeoutError,
  HtmlSizeError,
  NonHtmlContentError,
  SsrfBlockedError,
} from '@the-unseen/core'
import { ToolInputError, toToolError } from '../../src/pure/errors.js'
import { ERROR_CODES } from '../../src/pure/result-types.js'

const RUNS = { numRuns: 100 }
const sensitive = fc.constantFrom('http://10.0.0.5/admin', 'https://internal.example/secret?token=abc', '169.254.169.254', '::1', 'at Object.run (D:\\repo\\file.ts:10:5)')

const errorValues: fc.Arbitrary<unknown> = fc.oneof(
  fc.anything(),
  sensitive.map((s) => new Error(s)),
  sensitive.map((s) => new TypeError(`Invalid URL: ${s}`)),
  sensitive.map((s) => ({ message: s, stack: s })),
  fc.constant(null),
  fc.constant(undefined)
)

test('property P6: toToolError is total and returns a listed code', async () => {
  await fc.assert(
    fc.asyncProperty(errorValues, async (value) => {
      const mapped = toToolError(value)
      expect(ERROR_CODES).toContain(mapped.code)
      expect(mapped.message.length).toBeGreaterThan(0)
    }),
    RUNS
  )
})

test('property P6: the message never contains the input URL, IP, stack or error text', async () => {
  await fc.assert(
    fc.asyncProperty(sensitive, async (secret) => {
      const inputs: unknown[] = [
        new Error(secret),
        new SsrfBlockedError(secret, secret),
        new AuditTimeoutError(secret, 5),
        new NonHtmlContentError(secret),
        new TypeError(secret),
      ]
      for (const input of inputs) {
        const mapped = toToolError(input)
        expect(mapped.message).not.toContain(secret)
        expect(mapped.message).not.toMatch(/https?:\/\/|\b\d{1,3}(\.\d{1,3}){3}\b|\sat\s/)
      }
    }),
    RUNS
  )
})

test('maps each Core error class to its code', () => {
  expect(toToolError(new SsrfBlockedError('http://127.0.0.1/', 'loopback')).code).toBe('SSRF_BLOCKED')
  expect(toToolError(new AuditTimeoutError('full-audit', 60000)).code).toBe('TIMEOUT')
  expect(toToolError(new NonHtmlContentError('image/png')).code).toBe('NOT_HTML')
  expect(toToolError(new AuditResourceLimitError('request-count', 501)).code).toBe('RESOURCE_LIMIT')
  expect(toToolError(new HtmlSizeError(99)).code).toBe('INVALID_INPUT')
  expect(toToolError(new ToolInputError('UNKNOWN_HAUNTING_ID', 'x')).code).toBe('UNKNOWN_HAUNTING_ID')
  expect(toToolError(new Error('anything else')).code).toBe('AUDIT_FAILED')
})
