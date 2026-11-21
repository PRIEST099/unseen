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
