Create the Kiro spec **`haunting-classifier`** in `.kiro/specs/haunting-classifier/` (`requirements.md`, `design.md`, `tasks.md`). Do not implement yet. `.kiro/steering/hauntings.md` is the single source of truth, so the spec must not restate rules differently: reference its sections and encode them as acceptance criteria. Keep `requirements.md` under about 20 KB.

## Scope
`packages/core/src/classifier/` holds **pure functions only**, with no I/O and no imports from `runner/`. Enforce that with an ESLint `no-restricted-imports` rule plus a test that greps the folder.

- `classify(raw: RawAudit): ClassifiedAudit`, built from:
  - `hauntings.ts`: one detector per haunting, 10 in total. Each detector is a pure function `(raw) => Haunting[]`.
  - `severity.ts`: Banished / Restless / Wraith, per steering §Severity.
  - `score.ts`: `computeScore`, per steering §Haunting Score (weights 20/8/3, `round(100*(1-exp(-raw/120)))`).
  - `speech.ts`: `announce(node)` → string, per steering §Speech, including the placeholder-name case (`"<placeholder>, edit text"` plus a "vanishes when you type" note).
  - `contrast.ts`: WCAG 2.x relative luminance and contrast ratio, shared with the web app's token test.
- `Haunting` type:
  - `id` (stable hash of type + `backendDOMNodeId` + `kind`)
  - `type`, `kind?`, `severity`, `wcag` (criterion id, level, title, url)
  - `nodeIds`, `box` (from the RawAudit bounding boxes)
  - `speech?`, `htmlSnippet` (≤ 300 chars)
  - `explanation`, `persona` (who it hurts, one line), `fix` (plain-language fix plus a code snippet template)
- `ClassifiedAudit`:
  - `hauntings`, `score`, `countsByType`
  - `needsManualCheck[]` (for example `contrastUncertain` Fog nodes; never counted as hauntings)
  - `automatedCoverageNote`: the honest "automated checks find about 30–40% of issues" line
  - `axeCrossCheck`: which axe rule ids corroborate each haunting, and any axe violation that mapped to no haunting

## Must-have requirements (EARS)
- Every detector rule from steering, including the round-2 decisions:
  - placeholder-only Whispering Field
  - Shattered Order kinds `no-h1`, `heading-skip`, `no-main`
  - `img`/`image` equivalence, and the inline-SVG Hollow Portrait rule
  - Veiled only with visible text or a focusable descendant
  - Invisible Wanderer: 3:1 visibility conditions (a)–(d), mapped to 2.4.7
  - Fog `contrastUncertain`
  - an escapable cycle is not a Cursed Loop
- **No double counting:** each element has at most one *primary* haunting. Precedence: Cursed Loop > Nameless Spirit > Whispering Field > Lost Soul > Hollow Portrait > Veiled > Invisible Wanderer > Fog. Others are attached as `secondary` and are not scored. Document this precedence in the design and in the steering.
- **Golden test:** the classifier run on `RawAudit`s of all 3 Cursed Shop pages must equal `apps/cursed-shop/expected-hauntings.json` exactly: counts, selectors resolved to node ids, and controls never flagged. Capture each page's `RawAudit` once as a JSON fixture (`packages/core/tests/fixtures/raw/*.json`), so classifier tests need no browser.

## Property-based tests (fast-check, ≥ 100 runs each)
1. Score: deterministic, order-independent, monotonic non-decreasing, bounded to [0, 100], `score([]) === 0`, and severity-dominance (steering §Invariants 1–6).
2. Contrast: symmetric, bounded to [1, 21], equal to 1 for identical colours, and monotonic in luminance difference.
3. Classification is total: for any generated `RawAudit`, every axe violation maps to at most one primary haunting or appears in the unmapped list. None is lost.
4. Speech: always contains the role label, contains the name iff the name is non-empty, and never contains "undefined"/"null".
5. Detectors are pure: same input gives the same output, and the input is not mutated (deep-freeze the input in tests).

## Tasks
Small and ordered, each ending in passing tests. Fixture capture comes first; it may use `auditUrl` from the finished audit engine. The final task wires `classify` into `auditUrl`'s public API as `auditAndClassify(url, opts)`, exported from `packages/core`.
