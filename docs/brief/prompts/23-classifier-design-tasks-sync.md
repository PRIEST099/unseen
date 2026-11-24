Bring `.kiro/specs/haunting-classifier/design.md` and `tasks.md` into line with the amended `requirements.md`. Run 20 corrected the requirements, but a product-lead consistency check found **80 confirmed contradictions** where `design.md`/`tasks.md` still describe the old behaviour. An implementer follows design pseudo-code literally, so all 80 must go. The full list, with the stale text and the corrected text for each item, is in **`docs/brief/review-notes/classifier-spec-consistency-1.md`**.

Order of truth: `.kiro/steering/hauntings.md`, then the decisions in `docs/brief/prompts/20-classifier-spec-amend.md` (groups A–F), then `requirements.md`.

## How to work
1. **design.md, items 1–44.** Rewrite whole sections rather than patching single lines: Data Flow; the `Haunting`/`UnclassifiedHaunting`/`ClassifiedAudit` types; detector inputs and outputs; Precedence; Severity (add the per-type blocks-the-task table and the deterministic core-task predicate using `domNodes`); Speech; each of the 10 detector algorithms; Fixture capture (ESM `.mjs`, `UNSEEN_CHROMIUM_CHANNEL`, the selectors sidecar captured in the **same page session**, which needs an engine hook or a capture path that keeps the page open); ESLint 9 flat config; test commands (use only scripts that exist, or add them in a task); Correctness Properties. Use the "Correct text" from the note.
   - **WCAG (decision E):** `wcag: WCAGCriterion[]`, primary first, plus `guidance?` (Invisible Wanderer → 2.4.13). Remove `wcagAlso`, and align Req 2.5, Req 29.2 and every detector accordingly.
   - **Precedence (decision C):** collide on **any** shared node id. Cursed Loop `nodeIds` = `trapRegionNodeIds` (region plus members). Silent Tongue and Shattered Order never take part. **Never** `nodeIds: []`.
2. **tasks.md, items 45–75.** Fix each task's text. Make sure task 0 covers the full decision D: `domNodes` coverage and fields, `axeNodeIds`, `htmlBackendDOMNodeId`/`bodyBackendDOMNodeId`, heading node ids, `imgSrcAttributes`, explicit `role` attributes, and the radio `checked` state. Schedule tasks 0, 2.5, 2.6, 3.6 and 14.0 in the dependency graph. Put the fast-check arbitraries somewhere `tsconfig` compiles for tests only (not in `src/`).
3. **requirements.md, items 65–67 and 76–77.**
4. **REVIEW_RESOLUTION.md, items 68 and 78–80.** Correct the claims. Untick "No contradictions" until it is true, then re-tick it with a one-line note: "verified against classifier-spec-consistency-1.md".

**Do not write implementation code.** Do not touch `packages/core/` (another Kiro run is editing the runner) or `apps/`.

## Done means
- grep `design.md` and `tasks.md` for these strings, and none remain: `nodeIds: []`, `wcagAlso`, `!s.superseded)`, `after["background-color"]`, `return false // placeholder`, `tsx`, `__dirname`, `.eslintrc`, `localhost:3000`, `nodeIds[0]`.
- Final message: a table with each item number 1–80 → "fixed in <file §section>", or "not a defect, because …".

If you are running low, stop after a numbered item and say where you stopped. Do not ask a question; just stop.
