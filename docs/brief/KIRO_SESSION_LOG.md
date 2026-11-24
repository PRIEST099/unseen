# Kiro Session Log

This log records how THE UNSEEN is built, for the Kiroween write-up.

**Setup:** The entrant pairs with two AI agents:

- **Claude Code** is the product lead and reviewer. It wrote `PRODUCT_BRIEF.md`, sends instructions to Kiro, and reviews Kiro's output. It does **not** write application code.
- **Kiro** (Kiro CLI 3.5.0, headless `kiro-cli chat --no-interactive`, plus the Kiro IDE) writes the steering docs, specs, code, tests, hooks and the Power.

Each entry below records the instruction sent to Kiro, the mode, the model, and what Kiro produced.

---

## 2026-11-19 · Run 01: Generate steering docs
- **Instruction:** `docs/brief/prompts/01-steering.md` (read the brief, create six steering docs with front-matter inclusion modes)
- **Command:** `kiro-cli chat --no-interactive --trust-workspace --trust-tools=fs_read,fs_write` (prompt via stdin), model `auto`
- **Kiro produced:** `.kiro/steering/{product,tech,structure,hauntings,design-system,security}.md`
- **Cost:** about 2.3 credits

## 2026-11-19 · Run 02: Steering review, round 1
- **Instruction:** `docs/brief/prompts/02-steering-review.md`. Claude Code's review found:
  - the score saturates with `min(100, raw)`
  - the signature "Veiled" haunting was missing
  - the trap rule needed an Escape test
  - Lost Soul detection would flood with false positives through inherited `cursor:pointer`
  - plus refinements to Hollow Portrait, Invisible Wanderer and the core-flow keywords
- **Kiro produced:** in-place edits to `hauntings.md` (now 10 hauntings, exponential saturating score, severity-dominance invariant)

## 2026-11-19 · Run 03: Spec `audit-engine` (spec mode)
- **Instruction:** `docs/brief/prompts/03-spec-audit-engine.md`
- **Command:** `kiro-cli chat --v3 --mode spec --no-interactive ...`, model `auto`
- **Kiro produced:** `.kiro/specs/audit-engine/{requirements,design,tasks}.md`: 15 EARS requirements, full TypeScript types, a Mermaid sequence diagram, 5 fast-check properties, 16 tasks in 9 waves
- **Cost:** about 17.7 credits. That's expensive on the free plan, so later specs are asked to be shorter and implementation moves to cheaper models.
- **Review note:** tasks 7–13 use `apps/cursed-shop` fixtures, so the Cursed Shop must be built before them.

## 2026-11-19 · Run 04: Implement `audit-engine` tasks 1–4
- **Instruction:** `docs/brief/prompts/04-impl-audit-engine-1-4.md`
- **Command:** `kiro-cli chat --v3 --no-interactive --model qwen3-coder-next --trust-tools=fs_read,fs_write,<shell>` (cheap model to save free-plan credits)
- **Kiro produced:**
  - the npm-workspaces monorepo, strict tsconfig and Vitest
  - `types.ts` with 7 typed errors
  - `safe-fetch.ts`
  - pure `stepCap` and `detectCycle` helpers
  - 47 tests (4 fast-check properties)
- **Kiro marked tasks 1–4 `[x]`**
- **Independent verification by Claude Code:** `tsc --noEmit` exit 0; `vitest --run` 47/47 pass.
- **Security review by Claude Code:** see `docs/brief/review-notes/safe-fetch-review-1.md`. It found fail-open on DNS errors, IPv6 blocked only by an accidental parse error, missing reserved ranges, and no DNS-rebinding pinning. These are deferred to the dedicated `safe-fetch` spec.

## 2026-11-19 · Run 05: Cursed Shop (vibe mode, no spec)
- **Instruction:** `docs/brief/prompts/05-vibe-cursed-shop.md`. Deliberately vibe-coded, to compare with spec-driven development in the write-up.
- **Command:** `kiro-cli chat --v3 --no-interactive --trust-workspace` (prompt via stdin); model and credits not recorded.
- **Kiro produced:** `apps/cursed-shop/` (3 pages, 6 SVGs, `expected-hauntings.json`, README, `package.json`). Kiro reported every haunting planted; the review below found most did not fire.

## 2026-11-20 · Independent review of the Cursed Shop (Claude Code workflow: 3 reviewers + synthesis)
- Visual, haunting-accuracy and keyboard reviewers tested Kiro's vibe-coded shop in real Chromium (axe-core, the CDP AX tree, real key presses). Full evidence: `docs/brief/review-notes/cursed-shop-review-1.md`.
- **Result:** not demo-ready.
  - Nameless Spirit and Hollow Portrait fired 0 times (Kiro had "fixed" its own planted bugs with aria-labels and `alt=""`).
  - The modal was not a true keyboard trap.
  - The golden file was mostly wrong.
  - The visuals were clip-art, and the layout overflowed horizontally at 390px.
- **Lesson for the write-up (spec vs vibe):** the spec-driven audit-engine tasks were precise and verifiable on the first pass. The vibe-coded shop *looked* done but failed verification on almost every acceptance point.

## 2026-11-20 · Run 06: Steering review, round 2 (product-lead decisions)
- **Instruction:** `docs/brief/prompts/06-steering-review-2.md` (command and credits not recorded)
- **Kiro produced:** in-place edits to `.kiro/steering/hauntings.md` and the matching parts of `.kiro/specs/audit-engine/requirements.md` and `design.md`.
- **Decisions:**
  - placeholder-only fields count as Whispering Field
  - a missing `<main>` counts as Shattered Order
  - CDP `image` and `img` roles are treated the same
  - Veiled excludes decorative hidden icons
  - Invisible Wanderer uses a contrast-aware visibility test, mapped to 2.4.7
  - the Tab walker segments after an escapable cycle
  - the walk starts after a settle window
  - Fog marks unresolvable backgrounds as uncertain

## 2026-11-20 · Run 07: Cursed Shop fix pass
- **Instruction:** `docs/brief/prompts/07-cursed-shop-fix.md` (the synthesized punch list plus override header)
- **Command:** `kiro-cli chat --v3 --no-interactive --trust-workspace` (prompt via stdin); model and credits not recorded.
- **Kiro produced:** edits across the three shop pages, the SVGs, the golden file and the README. Results are in the re-verification below.

## 2026-11-20 · Re-verification after Run 07 (Claude Code workflow: 2 verifiers)
- **Fixed:**
  - Nameless Spirit, Fog, Silent Tongue and Veiled counts match the golden file
  - no horizontal overflow at 390px
  - a working index → product → checkout path
  - a richer hero
- **Regressed:** Kiro's redrawn SVGs contain duplicate `cx`/`cy` attributes (invalid XML), so every product image is broken.
- **Still wrong:**
  - the cookie-banner control is missing
  - index Lost Souls are native links
  - the modal still escapes with Tab+Enter
  - Hollow Portrait counts are off on every page
  - the golden file and README contradict the updated rules
- Evidence: `docs/brief/review-notes/cursed-shop-review-2.md`

## 2026-11-20 · Run 08: Cursed Shop fix pass 2
- **Instruction:** `docs/brief/prompts/08-cursed-shop-fix-2.md` (30 items, in priority order, because the free credits are nearly exhausted: about 7 of 50 left)
- **Outcome:** the run stopped partway with `UsageLimitReachedError` (MONTHLY_REQUEST_COUNT): the free plan's 50 credits were exhausted.
- **Completed before the stop (re-checked by Claude Code against the files):**
  - the 6 SVGs are valid XML
  - index cards 1, 2, 4 and 6 now use `div.card-link` and `div.quick-view`, and `alert()` is gone
  - the meadow and sea images have `alt=""`
  - icon SVGs have `role="none" focusable="false"`
- **Not done:**
  - the checkout trap exits still have no `tabindex="-1"`
  - there is still no cookie banner
  - the product-related and cart images still have `alt` attributes
  - the golden file and README are stale
  - the product page ignores `?product=`
  - checkout still shows 2024
- The rest is queued as `prompts/09-cursed-shop-finish.md`.

## 2026-11-20 · Prep while paused (no Kiro run)
- Claude Code wrote the remaining instruction queue while waiting for credits: `prompts/09`–`17` plus `prompts/README.md` (order, model, estimated credits, review gate per run).
- These are instructions only; Kiro still writes all the code. Product-lead amendments carried into them from reviews:
  - Chromium channel via env
  - the 1500 ms settle window
  - preserve `name.sources`
  - Fog `backgroundUncertain`
  - Veiled subtree text/focusable
  - walker segmenting
  - `auditHtml` must not be blocked by its own SSRF guard: an origin-scoped allow

## 2026-11-21 · Repo tidy-up and handoff before the first push (no Kiro run)
- A Claude Code review workflow (secrets/PII, hygiene and doc-drift reviewers, plus a skeptical verifier) found **40 issues**. No secrets, tokens or credentials were present.
- **Claude Code fixed its own files:**
  - scrubbed local machine paths from the review notes
  - committed the verification probes (`review-notes/probes/`)
  - corrected section references in prompts 10, 11, 14, 15, 16 and 17
  - added notes about superseded rules to the brief
  - backfilled runs 05–07 as "not recorded"
  - added root `README.md`, `LICENSE` (MIT), `.gitignore`, `.gitattributes`, `CLAUDE.md` and `docs/HANDOFF.md`
- **Kiro-owned drift was queued, not hand-edited:**
  - run 10 "Step 0": `structure.md` and `security.md` drift, the conflicting limits, `design-system.md` fonts, the Req 15.3 typo, and the `packages/core` and Cursed Shop config
  - run 09: the `verify.mjs` rewrite, Req 11.8 references and the WCAG levels in the shop README

## 2026-11-21 · Run 09 · started (teammate irumvag, own Kiro account)
- Claimed by the teammate's Claude Code session (macOS, Kiro CLI 3.5.0). Baseline probes before the run match the "Not done" list of run 08: checkout trap exits escape, no cookie banner, 4 index Lost Souls not fired, product/checkout Hollow Portraits not fired, Invisible Wanderer index 22/21 and product 21/9, checkout Whispering Field 3/2 and Shattered Order 2/1.

## 2026-11-21 · Run 09: Cursed Shop finish (teammate irumvag, own Kiro account)
- **Instruction:** `docs/brief/prompts/09-cursed-shop-finish.md`
- **Command:** `kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=fs_read,fs_write,execute_bash --model auto < docs/brief/prompts/09-cursed-shop-finish.md` (Kiro CLI 3.5.0, macOS)
- **Model:** `auto`. **Credits:** not readable headless; the teammate adds the `/usage` delta. Honesty notes: a first send of the same prompt exited with no output and no file changes (its log was lost), and one stray `/usage` sent as a headless prompt cost a tiny amount. Both count against this run's credits.
- **Kiro produced:** all 12 steps, touching only `apps/cursed-shop/`:
  - the checkout true trap (`tabindex="-1"` on both exits)
  - the escapable `#cookieBanner`
  - 4 `div.card-link` listeners plus the display:none quick-view panel
  - `alt` removed from the 4 related and 2 cart images
  - footer and hero `:focus-visible` rules
  - `?product=` lookup
  - static promo strip
  - styling, date and icon items
  - golden-file updates: WhisperingField 3, ShatteredOrder 2 with `kinds`, `cursedLoopMatch`
  - README rewrite (Req 11.8, WCAG table)
  - `verify.mjs` rewrite (`AxeBuilder`, channel env, `file://`, exit codes)
  - `npm run verify` script
- **Claude Code verification (independent, not Kiro's summary):**
  - `npm run verify` → VERIFY PASSED, exit 0
  - Perturbing a copy of the golden file (index NamelessSpirit 9 → 10) → VERIFY FAILED, exit 1, so the verifier really checks
  - `imgcheck.mjs`: all images load
  - `trap.mjs`: Tab and Shift+Tab cycle input ↔ Subscribe only; Enter, Space, Escape and Escape+Shift+Tab all keep the modal open with focus inside; the cookie banner exists; the CTA hit-test returns `checkout-btn`; View Cart goes to checkout on all 3 pages; the hero and footer focus ring is `#FFF3E0`; scrollWidth is 390 on all pages
  - `audit.mjs`: all 30 page × haunting counts match the golden file, with no EXTRA or bad selectors. The 3 NOTFIRED notes (checkout CursedLoop, SilentTongue, ShatteredOrder no-main) are page-level hauntings that the probe's per-node selector match cannot pair; their counts match.
  - `packages/core`: untouched, 47/47 tests still pass.
- **Outcome:** passed. The golden file and the shop README are no longer stale. Next: run 10.

## 2026-11-21 · Run 10 · started (teammate irumvag, own Kiro account)
- Claimed by the teammate's Claude Code session. Branched from `kiro/run-09-cursed-shop-finish` (PR #1), because tasks 7+ test against the finished shop.

## 2026-11-21 · Run 10: audit engine tasks 5–8, partial (teammate irumvag, own Kiro account)
- **Instruction:** `docs/brief/prompts/10-impl-audit-engine-5-8.md`
- **Command:** `kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=fs_read,fs_write,execute_bash --model auto < docs/brief/prompts/10-impl-audit-engine-5-8.md`, model `auto`
- **Attempt 1:** failed at once with `ClientThrottleError` ("using credits faster than your rate limit allows"). No changes.
- **Attempt 2 (5 minutes later):** Kiro read the spec, steering and review notes, and probed CDP (backendNodeId alignment; `InlineTextBox` nodes lacking `backendDOMNodeId`; AXNode shape; both Chromium channels launch). It then stopped with `UsageLimitReachedError` (monthly limit) partway through Step 0.
- **Kiro produced (checked by Claude Code against the diff):**
  - Step 0.1: `structure.md` rewritten. No `docs/specs/`, the real shop tree, "(planned)" markers, the ESLint boundary, no CI claim.
  - Step 0.2: Req 15.3 typo fixed.
  - Step 0.3: `tasks.md` Notes fixed.
  - Step 0.4, partly: task 5 limits (2 / 1–20 / 20) and the `buildLaunchArgs` bullet.
- **Not done:**
  - the task 5 acceptance text still says "queue depth 51"
  - `security.md` limits and SSRF API names
  - `design-system.md` fonts
  - `packages/core` and shop/root `package.json` config
  - tasks 5–8, so there is no code yet
- **Credits:** the account's monthly limit is now exhausted. The exact `/usage` figure is for the teammate to add.
- **Next:** `prompts/18-run-10-resume.md`, which lists exactly what is left, once credits are available again (hackathon credit form or the next month).

## 2026-11-21 · Run 10 completion, written by Claude Code, not Kiro (teammate irumvag's decision)
- **Why:** the teammate's Kiro account hit its monthly limit mid-run. The teammate chose to have Claude Code finish the remaining work by hand rather than wait for credits. **This is a deviation from `CLAUDE.md` and the hackathon's built-with-Kiro rule.** It is recorded here so the owner can decide to keep it, or to have Kiro redo it from `prompts/18-run-10-resume.md`.
- **Written by Claude Code:**
  - Step 0.4–0.8:
    - `security.md` limits table (5/min, 30/hour, `UNSEEN_MAX_CONCURRENCY` default 2, queue 20)
    - the real SSRF API names, plus a known-gaps pointer
    - `@fontsource`-only fonts
    - task 5 acceptance text
    - `packages/core` config: `private`, `license`, `playwright` 1.65.1 devDependency, `playwright.config.ts` (`*.int.spec.ts`), `tsconfig.test.json`, `@runner/*` alias removed, Vitest excludes `tests/`
    - shop and root `package.json`
  - Tasks 5–8:
    - `src/runner/browser.ts`: `buildLaunchArgs`, `BrowserPool`, `getPool`, `PageLoader` with the 1500 ms settle window and the deterministic screenshot, and `normalizeBoundingBox`
    - `src/runner/ax-tree.ts`: `name.sources` verbatim, `isImageRole`, `InlineTextBox` exemption (recorded in `design.md`)
    - `src/runner/axe.ts`
    - `tests/fixtures/shop-server.ts` and 3 integration specs
    - Property 5 (200 runs)
  - Also removed an unused `beforeEach` import in Kiro's `safe-fetch.test.ts`. The new test type-check exposed it.
- **Verification:**
  - `npm run typecheck` (src + tests) is clean
  - `vitest --run`: 58/58 (47 existing + 11 new)
  - `playwright test`: 6/6 integration
  - `apps/cursed-shop` `npm run verify`: VERIFY PASSED
- **Credits:** 0 Kiro credits.
- **Next:** run 11 (tasks 9–16), ideally through Kiro once credits exist.

## 2026-11-21 · Run 11 · started (teammate irumvag), written by Claude Code, not Kiro
- The teammate asked Claude Code to do run 11 "the same way" as the run 10 completion: by hand, because there are no Kiro credits. Same deviation from `CLAUDE.md` and the built-with-Kiro rule. Branched from `kiro/run-10-impl-audit-engine-5-8` (PR #2).

## 2026-11-21 · Run 11: audit engine tasks 9–16, written by Claude Code, not Kiro (teammate irumvag's decision)
- **Instruction followed:** `docs/brief/prompts/11-impl-audit-engine-9-16.md`, with all six product-lead amendments. **0 Kiro credits**: there were no credits, so the teammate asked for the same by-hand approach as the run 10 completion. This deviates from `CLAUDE.md` and the built-with-Kiro rule. The owner can keep it, or have Kiro redo it from prompt 11.
- **Written:**
  - `src/runner/collectors.ts`, re-exported from `browser.ts`:
    - task 9 text styles, with `backgroundUncertain` (image, gradient or translucent layer) and `isLargeText`; batches of 100 with a 10 s timeout; cursor styles
    - task 10 `DOMDebugger.getEventListeners` (up to 5,000 nodes)
    - task 11 metadata, with `hasMainLandmark` and `imgAltAttributes`
    - task 12 DOM-to-AX mapping, with `hasVisibleText` and `containsFocusable`; only visible nodes that intersect the scrollable area
  - `src/runner/cdp.ts`: helpers that map elements to backendNodeIds.
  - Task 13 in `tab-walker.ts`:
    - a pure `runWalk(driver)` core plus a real-keyboard page driver
    - the no-transition style injected first, and `walkStartedAtMs`
    - per-step before/after focus styles plus the adjacent opaque background
    - escape test (Escape, then Shift+Tab); escapable cycles reset detection and the walk continues
    - a cycle that covers every focusable is not a trap
  - Task 14 `src/audit.ts`:
    - `auditUrl`: URL/scheme validation, pre-launch SSRF check, policy selection, resource tracking, 60 s overall timeout
    - `auditHtml` on 127.0.0.1 with the origin-scoped allow wrapper (`OriginScopedPolicy`)
  - Task 15 determinism test.
  - New `RawAudit` fields in `types.ts`.
  - Spec deviations recorded in the `tasks.md` Notes.
- **Bug found in earlier Kiro code:** `safe-fetch.ts` called `route.abort('blocked')`. That is not a valid Playwright error code, so every blocked request threw "Route is already handled". Changed to `'blockedbyclient'`, and the fallback abort can no longer throw. Found by the new `auditHtml` restrictive-policy test.
- **Determinism investigation:**
  - The first failures came from Chromium-allocated ids differing per renderer, including ids nested in CDP `relatedNodes`, not from engine output. The test now canonicalises ids by first-seen order. Engine output is unchanged.
  - The screenshot SHA differed in some runs (font rasterisation). Per amendment 6 it is recorded as an annotation, not a failure.
  - 12/12 consecutive determinism runs pass.
- **Task 16 checkpoint:**
  - `npm run typecheck` (src + tests) is clean
  - `vitest --run`: **62/62** (including 2 new walk properties at 100 runs each)
  - `playwright test`: **20/20**. A full `--repeat-each 2` run passed 40/40, one more had 1 determinism failure, and that was fixed by the nested-id normalisation.
  - Shop `npm run verify`: VERIFY PASSED
- **Integration evidence:**
  - checkout `trapDetected === true`, and every trap node is inside `#newsletterModal`
  - index: the cookie banner cycle is `escapable`, `trapDetected === false`, and the walk reaches more than 5 footer links
  - `auditHtml` under the restrictive policy succeeds, while `http://127.0.0.1:1/x.png` lands in `blockedRequests`
- **Next:** run 12 (haunting-classifier spec), owner side.

## 2026-11-24 · Handover (no Kiro run)
- PR #1 (run 09) is merged. PR #2 is retargeted to `main`; PR #3 stays stacked on it.
- A teammate now has Kiro credits. `docs/HANDOFF.md` §2 is updated with the current state, who built what, and the decision on the Claude-written tasks 5–16.
- Added `prompts/19-kiro-review-runs-10-11.md`: Kiro reviews, fixes and adopts tasks 5–16. Recommended before run 12.
