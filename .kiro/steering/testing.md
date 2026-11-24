---
inclusion: fileMatch
fileMatchPattern: ["**/*.test.ts", "**/*.int.spec.ts", "**/tests/**"]
---

# THE UNSEEN — Testing Conventions

## Property-based testing (fast-check)

All pure modules in `packages/core/src/classifier/` must have property-based tests. Use these conventions:

### Test structure

```typescript
import { test } from 'vitest';
import * as fc from 'fast-check';

test('property: <invariant description>', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryInput,
      async (input) => {
        const result = functionUnderTest(input);
        // assertion here
      }
    ),
    { numRuns: 100 } // ≥200 for security-critical code
  );
});
```

- Use `fc.asyncProperty` with `await fc.assert(...)` even for sync functions — it is the consistent pattern.
- `numRuns`: 100 minimum, 200+ for security-sensitive modules (safe-fetch, SSRF guards).
- Each property test checks one invariant. Split multiple invariants into separate `test()` blocks.

### Arbitraries

- Keep arbitraries outside `src/` — they are test data generators, not production code.
- Place them in `packages/core/tests/arbitraries/` and import by name.
- Reuse arbitraries across test files. If you need a `Haunting[]` generator, check if it already exists before creating a new one.

### Mutation testing

Before declaring a test done, mentally revert the fix or introduce a plausible bug:
- If the test still passes, it is not covering the invariant. Strengthen the assertion.
- If the test fails, the test is good.

This is a mental exercise — no tooling required. The goal is to prevent tests that assert tautologies or ignore edge cases.

## Integration tests (Playwright Test)

Integration tests live in `packages/core/tests/` and use fixture pages to verify haunting detection end-to-end.

### Fixture page conventions

- Each fixture is a single `.html` file under `packages/core/tests/fixtures/`.
- Name it after the haunting or bug it demonstrates: `nameless-spirit-button.html`, `hollow-portrait-missing-alt.html`, `keyboard-trap-modal.html`.
- Keep fixtures minimal: only the HTML needed to trigger the haunting. No external CSS or JS unless the haunting requires it.
- Document the expected haunting in a `<!-- Expected: ... -->` comment at the top of the file.

### Test structure

```typescript
import { test, expect } from '@playwright/test';
import { auditHtml } from '../src/audit.js';

test('detects <haunting> in <scenario>', async () => {
  const html = `...fixture HTML...`;
  const result = await auditHtml(html, { url: 'http://test.local' });
  
  expect(result.hauntings.some(h => 
    h.type === 'nameless-spirit' && h.nodeIds.includes(...)
  )).toBe(true);
});
```

- Load the fixture via `auditHtml()` with an in-memory HTML string, or via `auditUrl()` with a local file server if the fixture requires separate resources (images, scripts).
- Assert on the `hauntings` array: check `type`, `severity`, `nodeIds`, or other fields as needed.
- Use `result.raw` to inspect the underlying AX tree, axe results, or Tab walk when debugging.

### Regression test workflow

When fixing a bug:
1. Write a fixture page that reproduces the bug (the test fails).
2. Fix the implementation.
3. Run the test (now passes).
4. Mentally revert the fix — the test must fail again.

## Test file naming

- Unit / property tests: `<module>.test.ts` next to `<module>.ts`
- Integration tests: `<feature>.int.spec.ts` in `packages/core/tests/`
- Fast-check arbitraries: `packages/core/tests/arbitraries/<type>.ts`

## Test exclusion from build

Every `tsconfig.json` excludes `**/*.test.ts` and `**/*.int.spec.ts` from the production build. Test files are never deployed.

## Coverage philosophy

Coverage percentage is not a target. Meaningful invariant coverage is the target:
- Pure functions: property tests that check the invariants in `hauntings.md` and the spec.
- I/O modules: integration tests against fixture pages with known hauntings.
- Boundary conditions: empty inputs, zero-length strings, missing attributes, closed tabs, network errors.

If a test does not assert an invariant or a requirement, delete it.
