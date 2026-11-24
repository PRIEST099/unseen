Amend the **`haunting-classifier`** spec (`.kiro/specs/haunting-classifier/requirements.md`, `design.md`, `tasks.md`) before any classifier code is written. An independent review confirmed **49 findings**, with evidence, in **`docs/brief/review-notes/classifier-spec-review-1.md`**. Three reviewers overlapped, so many findings repeat; the groups below are the deduplicated decisions. Apply every group, then walk the review note's 49 items and make sure each one is resolved. **Do not write implementation code in this run**, except the runner data extension described in group D, which is only a spec change here.

## Product-lead decisions (apply exactly)

**A. Golden counting: primary plus secondary** (findings 1, 8, 13, 10, 14)
- `Haunting` gets `secondary?: Haunting[]`. Suppressed hauntings are attached to their primary, unscored, and kept.
- `ClassifiedAudit` gets `detectedCountsByType`: primary ∪ secondary, deduplicated per element. `countsByType` stays primary-only and drives the score.
- The golden test asserts `detectedCountsByType` equals the golden counts, and that the per-type union of node ids equals the resolved golden selectors.
- A golden `controls` entry means "not flagged **as the haunting type that control names**", not "never flagged".

**B. Selectors in a browser-free test** (findings 9, 15, 36, 37)
- Fixture capture is the only step with a browser. In the **same page session** as the `RawAudit`, it resolves every golden selector (counts and controls) to `backendDOMNodeId`s and writes a sidecar file, `packages/core/tests/fixtures/raw/<page>.selectors.json`.
- The golden test reads only these JSON files.
- Write the capture script as an ESM `.mjs` (no `__dirname`, no `tsx`). Use `UNSEEN_CHROMIUM_CHANNEL`, the existing `tests/fixtures/shop-server.ts` approach, and an `npm run capture:fixtures -w @the-unseen/core` script.
- Fixture capture runs **after** the audit-engine fixes from runs 19 and 19b land. Note that dependency in `tasks.md`.

**C. Detector rule corrections** (findings 2, 16, 29, 3, 11, 17, 4, 5, 12, 18, 21, 45, 22, 24, 47, 30, 35, 6, 7, 19, 31)
- **Invisible Wanderer:**
  - Measure contrast against `after['adjacent-background-color']`, never the element's own background.
  - Implement (b) the box-shadow rule fully. It is currently a stub.
  - Steps with `cdpError` or an empty `backendDOMNodeId` go to `needsManualCheck`, not to hauntings.
  - At most one Invisible Wanderer per element.
- **Whispering Field:** the winning name source is the first entry of `name.sources` that has a non-empty trimmed `value.value` and is not `superseded`. Case (b) holds when that source's `type` is `placeholder`. Add a unit test with a realistic CDP `sources` array, where the earlier candidates have no value.
- **The Veiled:**
  - Case (b) requires the node to be excluded through `aria-hidden="true"` or `role="presentation"`/`"none"`, AND its subtree to have visible text or a focusable descendant.
  - Report **one haunting per hidden subtree root**, not one per descendant.
- **Hollow Portrait:** an aria-hidden image that is the sole content of a named button or link is NOT a Hollow Portrait. Fix Req 3.4 to match `hauntings.md`.
- **Lost Soul:** only `<a href>`, `button`, `input`, `select`, `textarea`, `summary` and `[contenteditable]` count as native interactive elements. An `<a>` without `href` is not native. Remove the extra exclusion that the steering does not have.
- **Cursed Loop:** the haunting's `nodeIds` = `tabWalkResult.trapRegionNodeIds` (region element first). Encode the golden `$meta.cursedLoopMatch` rule.
- **Precedence:** group by **every** node id a haunting covers, not only `nodeIds[0]`. A Cursed Loop member that is also a Whispering Field keeps the Whispering Field as a secondary of the loop.
- **Page-level and heading hauntings:**
  - Silent Tongue → the `html` element's node id.
  - Shattered Order `no-main` → `body`; `no-h1` → `body`; `heading-skip` → the later heading's node id.
  - Never `nodeIds: []`.

**D. Data that `RawAudit` must carry** (findings 23, 32, 33, 34, 39, 46)
- Add a compact `domNodes: Record<backendDOMNodeId, DomNodeInfo>` to `RawAudit`:
  - `tag`, `parentId`
  - the attributes `id`, `class`, `role`, `href`, `src`, `alt`, `type`, `tabindex`, `aria-hidden`, `aria-label`, `placeholder`, `disabled`
  - `outerHTMLSnippet` (≤ 300 chars)
- Cover every element referenced by any other `RawAudit` field, plus their ancestors up to `body`.
- In axe results, keep `target` selectors **and** resolve each axe node to a `backendDOMNodeId` at collection time (`axeNodeIds`), so the cross-check is by node id.
- Specify this as a **new task 0** in `haunting-classifier/tasks.md` that edits the runner (`packages/core/src/runner/`) and `types.ts`, with its own integration test. It is the only runner change in this spec.
- Radio and menuitemradio state come from the CDP `checked` property.

**E. Severity, speech and WCAG** (findings 25, 26, 49, 27, 44, 48)
- Severity predicates must be deterministic: define "core task" from `hauntings.md` keywords plus the element's ancestry (inside a `form`, `role=dialog`, a checkout or cart region) using `domNodes`. Define "blocks the task" per type in a table.
- Speech: include every special-case row from the steering verbatim (`"edit text, blank"`, `"unlabelled graphic, <filename>"`, and so on).
  - Sound effects ("garbled whisper") are a separate `soundCue` field, never in `speech`.
  - Add `speechNote` for the Whispering Field "name vanishes once you type" note.
- `Haunting.wcag` becomes an array: the full criteria list from the steering.

**F. Tasks plan** (findings 20, 28, 38, 40, 41, 42, 43)
- **Nothing is optional.** Remove every `*` and the "can be skipped" note. The golden tests, every fast-check property (≥ 100 runs) and the boundary test are required.
- Fix the pipeline order so it is consistent: detect → precedence → severity → score.
- Every helper a detector uses must be created by an earlier task.
- **ESLint:** install `eslint@9` and `typescript-eslint`, add a flat `eslint.config.js` with `no-restricted-imports` for `src/classifier/**`, and add an `npm run lint` script. Also keep the grep test.
- Checkpoint commands must work on Windows: use the existing npm scripts (`npm run typecheck`, `npx vitest --run`, `npx playwright test` in `packages/core`). Do not invent root scripts.
- The `computeScore(hauntings: readonly Haunting[])` signature matches the steering exactly.
- Add tasks for documenting precedence in `hauntings.md`, the contrast luminance-monotonicity property, and per-detector purity tests.

## Done means
The three spec files are consistent with each other and with `hauntings.md`. Your final message is a table with the finding number (1–49), the group (A–F), and where it is resolved (file and section). If any finding is wrong, say why instead of applying it.
