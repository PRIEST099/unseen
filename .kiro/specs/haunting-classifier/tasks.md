# Implementation Plan: Haunting Classifier

## Overview

The haunting classifier is a pure functional layer that transforms raw audit data into classified accessibility issues. This plan implements 10 detection algorithms, severity assignment, scoring, speech generation, and axe cross-checking, with comprehensive property-based testing throughout.

## Tasks

- [ ] 0. Extend RawAudit with DOM Node Data (Runner Prerequisite)
  - **Files:** `packages/core/src/types.ts`, `src/runner/collectors.ts` (domNodes, headings, html/body ids, imgSrcAttributes), `src/runner/axe.ts` (axe node ids), `src/audit.ts` (assemble + capture hook)
  - Add `RawAudit.domNodes: Record<string /* backendDOMNodeId */, DomNodeInfo>`, where `DomNodeInfo = { tag: string; parentId: number | null; attrs: { id?; class?; role?; href?; src?; alt?; type?; tabindex?; 'aria-hidden'?; 'aria-label'?; placeholder?; disabled? }; outerHTMLSnippet: string /* <= 300 chars */ }`
  - **Coverage:** every backendDOMNodeId referenced by any other RawAudit field (boundingBoxes, axNodes, textNodeStyles, elementCursorStyles, imgAltAttributes, imgSrcAttributes, eventListenerSignals, tabWalkResult steps/cycles/trapRegionNodeIds, domAxMapping, pageMetadata ids, axe node ids), plus every ancestor up to and including `body`, plus `html`
  - Add `imgSrcAttributes`, `HeadingRecord.backendDOMNodeId` (from headingIds), `PageMetadata.htmlBackendDOMNodeId` and `bodyBackendDOMNodeId`
  - **AxeViolationNode:** keep `target` and add `backendDOMNodeId: number | null`. This is the single `axeNodeIds` field; resolve it in the same page session at collection time. Resolve a single-string target with querySelector(target[0]) then DOM.describeNode; a multi-part (iframe or shadow) target gets null
  - Radio and menuitemradio state: keep the CDP `checked` property in axNodes (assert it)
  - In audit.ts add `AuditHooks.beforeClose?: (page: Page, raw: RawAudit) => Promise<void>` to auditUrlWithHooks, awaited after assemble() and before the context closes (fixture capture uses it)
  - No `explicitRoles` or `isHiddenRoot` field: the classifier reads `domNodes[id].attrs.role` and `attrs['aria-hidden']`
  - Update `tests/determinism.int.spec.ts` normalise() to canonicalise the new ids: domNodes keys and parentId, imgSrcAttributes keys, headings[].backendDOMNodeId, pageMetadata html/body ids, and axe nodes[].backendDOMNodeId
  - _Requirements: 0.1-0.9_
  - **Tests:** new `packages/core/tests/raw-audit-dom-nodes.int.spec.ts` (Playwright) on the three Cursed Shop pages. Assert that every id referenced anywhere in RawAudit has a domNodes entry, that following parentId from any entry reaches body, that outerHTMLSnippet.length <= 300, that heading ids map to h1-h6 tags, that htmlBackendDOMNodeId maps to tag 'html', that every axe node with a single-string target has a non-null id, and that a checked radio has `checked: 'true'`
  - **Checkpoint:** `npm run typecheck -w @the-unseen/core`, then `npx playwright test` in packages/core
  - **MUST be complete before Task 1**

- [ ] 1. Capture RawAudit fixtures from Cursed Shop
  - **DEPENDENCY:** Task 0 must be complete, AND audit-engine fix runs 19 and 19b must have landed
  - Run `npm run test:integration -w @the-unseen/core` and `npm run verify -w cursed-shop`; both must pass before capturing
  - Create `packages/core/tests/fixtures/capture.mjs`: plain ESM JavaScript, no TypeScript syntax, no `__dirname`, no tsx
  - Resolve paths with `fileURLToPath(new URL('./raw/', import.meta.url))`
  - **Imports:** `import { auditUrlWithHooks } from '../../dist/audit.js'`, `import { getPool } from '../../dist/index.js'`, `import { startShopServer } from './shop-server.ts'` (type-stripped)
  - `const shop = await startShopServer()` (no arguments). Launch Chromium with channel: `process.env.UNSEEN_CHROMIUM_CHANNEL || undefined`, allowPrivate: true
  - For each page, call `auditUrlWithHooks(`${shop.baseUrl}/${page}`, { allowPrivate: true }, { beforeClose })`
  - In `beforeClose(page, raw)`, with the page still open, resolve every selector in expected-hauntings.json[page] (hauntings[*].selectors and controls[*]) through CDP `DOM.getDocument({depth:-1})` + `DOM.querySelectorAll` + `DOM.describeNode` into `{self: number[], subtree: number[]}`
  - Fail if `document.querySelectorAll('*').length !== raw.boundingBoxes.length`, if any self id is missing from raw.boundingBoxes, or if a non-CursedLoop selector matches anything other than exactly 1 element
  - Before writing, assert `raw.collectionErrors.length === 0` and endReason: index 'body', product 'body', checkout 'trap' (golden $meta.walkNote)
  - Write JSON with recursively sorted keys and `screenshotPng: ""`
  - Call `await getPool().close()` and `await shop.close()` in finally
  - Set `process.exitCode = 1` on error
  - Add `"capture:fixtures": "npm run build && node --experimental-strip-types tests/fixtures/capture.mjs"` to packages/core/package.json. Run it with `npm run capture:fixtures -w @the-unseen/core`
  - Do not add tsx
  - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6_
  - _Design: Testing Strategy § Fixture Capture_
  - **Tests:** Verify JSON files exist and contain valid RawAudit structure

- [ ] 2. Set up classifier module structure and types
  - [ ] 2.1 Create core type definitions
    - Create `packages/core/src/classifier/types.ts`
    - Define `HauntingType`, `HauntingSeverity`, `Haunting`, `UnclassifiedHaunting`
    - Define `ClassifiedAudit`, `ManualCheckNode`, `AxeCrossCheck`
    - Define `DetectorFunction` type signature
    - _Requirements: 29, 30_
    - _Design: Components and Interfaces § Core Types_
  
  - [ ] 2.2 Create WCAG criterion definitions
    - Create `packages/core/src/classifier/wcag.ts`
    - Export constant objects for all 12 WCAG criteria referenced in hauntings (including 2.4.13)
    - Each includes id, level, title, url fields
    - _Requirements: 2.5, 3.8, 4.8, 5.6, 6.5, 7.5, 8.6, 9.5, 10.5, 11.6_
    - _Design: Appendix: WCAG Criterion Definitions_
  
  - [ ] 2.3 Create classifier directory structure
    - Create `packages/core/src/classifier/` directory
    - Create `packages/core/src/classifier/detectors/` subdirectory
    - Create placeholder files for all 10 detectors
    - Create placeholder files for severity.ts, precedence.ts, score.ts, speech.ts, contrast.ts, explanation.ts, axe-cross-check.ts
    - _Design: Architecture § Module Layout_
  
  - [ ] 2.4 Write unit tests for type definitions
    - Test that DetectorFunction signature matches expected shape
    - Test that all WCAG constants are well-formed
    - _Requirements: 29, 30_

  - [ ] 2.5 Create shared helper utilities
    - Create `packages/core/src/classifier/util.ts`
    - Implement `hauntingId(type, nodeId, kind?)` (deterministic FNV-1a, no crypto)
    - Implement `parseCssColor(s): {r,g,b,a}|null` plus `blend(color, background)`
    - Implement `findBox`, `axByBackendId`
    - Implement `axAncestors(raw, id)` and `axDescendants(raw, id)` over parentId/childIds
    - Implement `snippet(raw, id)` = raw.domNodes[id]?.outerHTMLSnippet ?? `<${raw.domNodes[id]?.tag ?? 'element'}>`
    - Implement `domAncestors`/`domDescendants` over domNodes.parentId
    - Implement `isNativeInteractive`, `filterOutermost`
    - Implement `fileNameFromSrc` (last path segment, no query or hash)
    - Implement `winningNameSource(node)` — first name.sources entry with superseded !== true and non-empty value.value
    - Implement `isCoreTask(h, raw)` per the steering/decision E rule, or place it in 12.1 before it is used
    - Implement the IW predicates: `hasVisibleOutline`, `hasVisibleBoxShadow`, `hasVisibleColorChange`, `hasTextDecorationChange`, or create them in 11.5
    - _Requirements: 5.7, Findings 23, 32, 39, 49_
    - **Tests:** Write property tests for each helper with fast-check

  - [ ] 2.6 Create test arbitraries
    - Create `packages/core/tests/classifier/arbitraries.ts`. It is type-checked by tsconfig.test.json and not shipped in dist
    - Export `arbRawAudit` (including domNodes with a consistent parentId tree, imgSrcAttributes, heading/html/body ids and axe node ids that reference existing nodes) and `arbHaunting`
    - Import them from the `src/classifier/*.test.ts` files
    - _Requirements: 22, 23, 24, 25, 26, Finding 42, 72_

- [ ] 3. Implement contrast computation module
  - [ ] 3.1 Implement WCAG luminance and contrast ratio functions
    - Create `packages/core/src/classifier/contrast.ts`
    - Implement `relativeLuminance(rgb: RGBColor): Luminance` with gamma expansion
    - Implement `contrastRatio(c1: RGBColor, c2: RGBColor): ContrastRatio`
    - Export `RGBColor`, `Luminance`, `ContrastRatio` types
    - _Requirements: 18.1, 18.2, 18.3_
    - _Design: Data Models § Contrast Computation_
  
  - [ ] 3.2 Write property tests for contrast invariants
    - **Property 7: Contrast ratio is symmetric**
    - **Validates: Requirements 18.4, 23.2**
    - Generate 100+ random color pairs with fast-check
    - Verify `contrastRatio(c1, c2) === contrastRatio(c2, c1)`
    - _Requirements: 18.4, 23.1, 23.2_
  
  - [ ] 3.3 Write property tests for contrast bounds
    - **Property 8: Contrast ratio is bounded**
    - **Validates: Requirements 18.6, 23.3**
    - Generate 100+ random color pairs with fast-check
    - Verify `1 <= contrastRatio(c1, c2) <= 21`
    - _Requirements: 18.6, 23.1, 23.3_
  
  - [ ] 3.4 Write property tests for identical colors
    - **Property 9: Identical colors have ratio 1**
    - **Validates: Requirements 18.5, 23.4**
    - Generate 100+ random colors with fast-check
    - Verify `contrastRatio(c, c) === 1`
    - _Requirements: 18.5, 23.1, 23.4_
  
  - [ ] 3.5 Write unit tests for contrast edge cases
    - Test black-on-white returns 21
    - Test white-on-black returns 21
    - Test mid-gray combinations
    - _Requirements: 18_

  - [ ] 3.6 Write property test for luminance monotonicity
    - **Property 19: Luminance monotonicity**
    - **Validates: Requirements 23.5**
    - Generate 100+ random color pairs with fast-check
    - Verify (1) raising any single channel never lowers relativeLuminance, and (2) for a fixed darker colour, contrastRatio is non-decreasing as the lighter colour's luminance increases
    - _Requirements: 23.5, Finding 42, 50_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Run `npm run typecheck -w @the-unseen/core`
  - Run `npx vitest --run` in `packages/core`
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement speech announcement module
  - [ ] 5.1 Create role and state label maps
    - Create `packages/core/src/classifier/speech.ts`
    - Define `ROLE_LABEL_MAP` with all 35+ role labels
    - Define state label extraction rules for checkbox, radio, switch, etc.
    - Export `SpeechComponents`, `RoleLabel`, `StateLabel` types
    - _Requirements: 14.6, 14.7_
    - _Design: Components and Interfaces § Speech Types_
  
  - [ ] 5.2 Implement speech announcement generation
    - Implement `announce(node: AXNode, raw: RawAudit): string` and `announceNote(node: AXNode): string | undefined`
    - Apply formula: `[name, role, state].filter(Boolean).join(", ")`
    - Handle heading level concatenation
    - Return empty string for generic/none/presentation roles
    - Include the steering special rows verbatim
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.9, 14.10_
    - _Design: Data Models § Speech Announcement Generation_
  
  - [ ] 5.3 Write property tests for speech invariants
    - **Property 10: Speech always includes role**
    - **Validates: Requirements 14.3, 25.2**
    - Generate 100+ random AX nodes with fast-check
    - Verify announcement contains role label (unless generic/none/presentation)
    - _Requirements: 25.1, 25.2_
  
  - [ ] 5.4 Write property tests for name inclusion
    - **Property 11: Speech includes name iff non-empty**
    - **Validates: Requirements 14.2, 25.3**
    - Generate 100+ random AX nodes with fast-check
    - Verify name appears iff `axNode.name.value.trim().length > 0`
    - _Requirements: 25.1, 25.2_
  
  - [ ] 5.5 Write property tests for no fabricated text
    - **Property 12: Speech contains no fabricated text**
    - **Validates: Requirements 14.8, 25.4**
    - Generate 100+ random AX nodes with fast-check
    - Verify announcement does not contain "undefined", "null", or unexpected text
    - Exempt the steering special rows
    - _Requirements: 25.1, 25.3, 43_
  
  - [ ] 5.6 Write property test for generic node skipping
    - **Property 13: Generic nodes are skipped**
    - **Validates: Requirements 14.5, (generic exception in 25.2)**
    - Generate 100+ AX nodes with generic/none/presentation roles
    - Verify empty string returned
    - _Requirements: 25.1, 25.4_
  
  - [ ] 5.7 Write unit tests for speech examples
    - Test button with name: "Add to cart, button"
    - Test button without name: "button"
    - Test checkbox checked: "Subscribe, checkbox, checked"
    - Test textbox name="" -> "edit text, blank"
    - Test searchbox name="" -> "search, blank"
    - Test placeholder-only -> "Email address, edit text" with note "name disappears when typing"
    - Test img name="" src="/img/logo.png?v=2#x" -> "unlabelled graphic, logo.png"
    - Test img with no src -> "unlabelled graphic"
    - Test radio with checked='true' -> "<name>, radio button, selected"
    - _Requirements: 14, 48_

- [ ] 6. Implement explanation and fix generation module
  - [ ] 6.1 Create explanation generator
    - Create `packages/core/src/classifier/explanation.ts`
    - Implement `generateExplanation(type: HauntingType, context: ExplanationContext): string`
    - Implement `generatePersona(type: HauntingType): string`
    - Each explanation is 1-2 sentences describing what is wrong
    - Each persona is one sentence starting with "As a [user type]"
    - _Requirements: 19.1, 19.2_
    - _Design: Detector Algorithms § each detector's explanation field_
  
  - [ ] 6.2 Create fix suggestion generator
    - Implement `generateFix(type: HauntingType, context: FixContext): HauntingFix`
    - Each fix includes plain-language instruction and code snippet template
    - Use correct HTML/ARIA syntax in code snippets
    - _Requirements: 19.3, 19.4_
    - _Design: Detector Algorithms § each detector's fix field_
  
  - [ ] 6.3 Write unit tests for all explanations and fixes
    - Test each of 10 haunting types generates valid explanation, persona, and fix
    - Verify code snippets use correct HTML/ARIA syntax
    - _Requirements: 19_

- [ ] 7. Checkpoint - Ensure all tests pass
  - Run `npm run typecheck -w @the-unseen/core`
  - Run `npx vitest --run` in `packages/core`
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement core detectors (Part 1: Nameless Spirit, Hollow Portrait, Silent Tongue)
  - [ ] 8.1 Implement Nameless Spirit detector
    - Create `packages/core/src/classifier/detectors/nameless-spirit.ts`
    - Implement `detectNamelessSpirit(raw: RawAudit): UnclassifiedHaunting[]`
    - Check 14 interactive roles for empty accessible names
    - Use `generateSpeech`, `generateExplanation`, `generateFix` helpers
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
    - _Design: Detector Algorithms § 1. Nameless Spirit_
  
  - [ ] 8.2 Write unit tests for Nameless Spirit detector
    - Test all 14 interactive roles are recognized
    - Test non-empty names are not flagged
    - Test node with name="  " (whitespace) is flagged
    - _Requirements: 2_
  
  - [ ] 8.3 Implement Hollow Portrait detector
    - Create `packages/core/src/classifier/detectors/hollow-portrait.ts`
    - Implement `detectHollowPortrait(raw: RawAudit): UnclassifiedHaunting[]`
    - Treat img and image roles as equivalent
    - Skip alt="", role presentation/none and aria-hidden images (always)
    - Never report an image or SVG that is the sole content of an unnamed button/link (the parent is the Nameless Spirit), or an SVG inside a named control
    - Flag svg only with an explicit role="img" (domNodes role attribute)
    - Handle inline SVG rules
    - _Requirements: 3.1-3.9_
    - _Design: Detector Algorithms § 2. Hollow Portrait_
  
  - [ ] 8.4 Write unit tests for Hollow Portrait detector
    - Test img role with empty name is flagged
    - Test image role with empty name is flagged
    - Test alt="" is not flagged
    - Test role=presentation with no text/focusable is not flagged
    - Test SVG with role=img and no name is flagged
    - Test SVG icon inside named button is not flagged
    - Test aria-hidden <img> as sole content of a <button> -> no HollowPortrait
    - Test <a href><svg></svg></a> -> no HollowPortrait
    - _Requirements: 3, 51_
  
  - [ ] 8.5 Implement Silent Tongue detector
    - Create `packages/core/src/classifier/detectors/silent-tongue.ts`
    - Implement `detectSilentTongue(raw: RawAudit): UnclassifiedHaunting[]`
    - Check for missing lang attribute
    - Validate lang with BCP 47 regex: `/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/`
    - Return one haunting with nodeIds: [raw.pageMetadata.htmlBackendDOMNodeId], id = hauntingId('SilentTongue', htmlId), speech undefined, soundCue 'garbled-whisper'
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
    - _Design: Detector Algorithms § 8. Silent Tongue_
  
  - [ ] 8.6 Write unit tests for Silent Tongue detector
    - Test missing lang attribute is flagged
    - Test invalid lang values are flagged
    - Test valid lang="en" is not flagged
    - Test valid lang="en-US" is not flagged
    - Assert nodeIds equals [htmlBackendDOMNodeId]
    - _Requirements: 9, 52_

- [ ] 9. Implement core detectors (Part 2: The Fog, Whispering Field, Shattered Order)
  - [ ] 9.1 Implement The Fog detector
    - Create `packages/core/src/classifier/detectors/fog.ts`
    - Implement `detectTheFog(raw: RawAudit): UnclassifiedHaunting[]`
    - Use `contrastRatio` function from contrast.ts
    - Apply 4.5:1 threshold for normal text, 3:1 for large text
    - Skip backgroundUncertain nodes (add to needsManualCheck instead)
    - Skip disabled and decorative text
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_
    - _Design: Detector Algorithms § 3. The Fog_
  
  - [ ] 9.2 Write unit tests for The Fog detector
    - Test contrast below 4.5:1 for normal text is flagged
    - Test contrast below 3:1 for large text is flagged
    - Test contrast above thresholds is not flagged
    - Test backgroundUncertain is skipped
    - _Requirements: 4_
  
  - [ ] 9.3 Implement Whispering Field detector
    - Create `packages/core/src/classifier/detectors/whispering-field.ts`
    - Implement `detectWhisperingField(raw: RawAudit): UnclassifiedHaunting[]`
    - Check 5 form field roles: textbox, searchbox, spinbutton, slider, combobox
    - Detect empty name (case a) and placeholder-only name (case b)
    - Winning source = first name.sources entry with superseded !== true and a non-empty trimmed value.value. It is a placeholder source when attribute is 'placeholder'/'aria-placeholder' or type is 'placeholder'
    - Set speechNote 'name disappears when typing' for case b
    - Generate appropriate speech for each case
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
    - _Design: Detector Algorithms § 7. Whispering Field_
  
  - [ ] 9.4 Write unit tests for Whispering Field detector
    - Test textbox with empty name is flagged
    - Test textbox with placeholder-only name is flagged
    - Test textbox with label is not flagged
    - Test all 5 form field roles
    - Test sources [aria-labelledby (no value), aria-label (no value), label (no value), {type:'attribute', attribute:'placeholder', value:{type:'computedString', value:'john@example.com'}}, title (superseded:true)] -> flagged with speech "john@example.com, edit text" and speechNote "name disappears when typing"
    - _Requirements: 8, 53_
  
  - [ ] 9.5 Implement Shattered Order detector
    - Create `packages/core/src/classifier/detectors/shattered-order.ts`
    - Implement `detectShatteredOrder(raw: RawAudit): UnclassifiedHaunting[]`
    - Check for no-h1 (kind: "no-h1")
    - Check for heading-skip (kind: "heading-skip")
    - Check for no-main landmark (kind: "no-main")
    - no-h1 and no-main: nodeIds [bodyBackendDOMNodeId]
    - heading-skip: nodeIds [headings[i].backendDOMNodeId] (the later heading), id = hauntingId(type, that id, kind)
    - Each check produces separate haunting with appropriate kind field
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
    - _Design: Detector Algorithms § 9. Shattered Order_
  
  - [ ] 9.6 Write unit tests for Shattered Order detector
    - Test page with no h1 is flagged with kind="no-h1"
    - Test h1→h3 skip is flagged with kind="heading-skip"
    - Test page with no main landmark is flagged with kind="no-main"
    - Test page with h1 and main is not flagged
    - Assert these nodeIds, and that h1 -> h3 gives a heading-skip on the h3's id
    - _Requirements: 10, 54_

- [ ] 10. Checkpoint - Ensure all tests pass
  - Run `npm run typecheck -w @the-unseen/core`
  - Run `npx vitest --run` in `packages/core`
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement complex detectors (Part 3: Lost Soul, Cursed Loop, Invisible Wanderer, The Veiled)
  - [ ] 11.1 Implement Lost Soul detector
    - Create `packages/core/src/classifier/detectors/lost-soul.ts`
    - Implement `detectLostSoul(raw: RawAudit): UnclassifiedHaunting[]`
    - Check for click handlers (click, mousedown, pointerdown, pointerup)
    - Verify element not in Tab walk sequence
    - Native = button, input, select, textarea, summary, <a> with AX role link, or an editable element. An <a> without href is not native
    - Do not skip candidates that have no AX node
    - Compute inside/contains/outermost over ancestry (Req 5.7)
    - Apply outermost rule (report ancestor, suppress child)
    - Skip elements inside or containing native interactive elements
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
    - _Design: Detector Algorithms § 4. Lost Soul_
  
  - [ ] 11.2 Write unit tests for Lost Soul detector
    - Test div with click handler not in Tab walk is flagged
    - Test button with click handler is not flagged (native interactive)
    - Test nested clickable divs report only outermost
    - Test clickable inside button is not flagged
    - Test <a onclick> without href and not in the Tab walk -> LostSoul
    - Test an element with a click listener and no AX node -> LostSoul
    - _Requirements: 5, 55_
  
  - [ ] 11.3 Implement Cursed Loop detector
    - Create `packages/core/src/classifier/detectors/cursed-loop.ts`
    - Implement `detectCursedLoop(raw: RawAudit): UnclassifiedHaunting[]`
    - Emit at most one CursedLoop, only when tabWalkResult.trapDetected and a cycle with escapable === false and no includesAllFocusables exists
    - nodeIds = trapRegionNodeIds.map(Number) (region first)
    - Take id/box/snippet from the region (nodeIds[0])
    - soundCue 'chime'
    - Skip cycles marked escapable
    - Skip cycles that include all focusables
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
    - _Design: Detector Algorithms § 5. Cursed Loop_
  
  - [ ] 11.4 Write unit tests for Cursed Loop detector
    - Test non-escapable cycle is flagged
    - Test escapable cycle is not flagged
    - Test cycle including all focusables is not flagged
    - Assert nodeIds[0] is the region
    - _Requirements: 6, 56_
  
  - [ ] 11.5 Implement Invisible Wanderer detector
    - Create `packages/core/src/classifier/detectors/invisible-wanderer.ts`
    - Implement `detectInvisibleWanderer(raw: RawAudit): UnclassifiedHaunting[]`
    - Parse focus walk steps (before/after styles)
    - Measure every indicator contrast against after['adjacent-background-color'] (blended)
    - Implement all five indicator tests: (a) outline-style/width/color with 3:1 against adjacent background; (b) box-shadow changed to non-transparent with 3:1 against adjacent background; (c) border-color or background-color changed with 3:1 between before and after; (d) text-decoration changed
    - Handle Chromium outline-style=none quirk
    - Skip steps with cdpError or empty backendDOMNodeId (classify will add them to needsManualCheck as 'focus-style-unavailable')
    - Evaluate each unique backendDOMNodeId once (deduplicate if visited twice in walk)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
    - _Design: Detector Algorithms § 6. Invisible Wanderer_
  
  - [ ] 11.6 Write unit tests for Invisible Wanderer detector
    - Test element with no outline change is flagged
    - Test element with visible outline (3:1 against adjacent background) is not flagged
    - Test element with outline colour equal to its own background but ≥3:1 against adjacent background is not flagged
    - Test element with box-shadow change (non-transparent, 3:1 against adjacent background) is not flagged
    - Test element with background-color change ≥3:1 (before vs after) is not flagged
    - Test element with text-decoration change is not flagged
    - Test step with cdpError produces no haunting
    - Test node visited twice in walk produces one haunting (deduplicated)
    - _Requirements: 7_
  
  - [ ] 11.7 Implement The Veiled detector
    - Create `packages/core/src/classifier/detectors/veiled.ts`
    - Implement `detectTheVeiled(raw: RawAudit): UnclassifiedHaunting[]`
    - Report one haunting per hidden subtree root (ariaHidden || isPresentational, with AX ignoredReasons ariaHiddenElement or presentationalRole) that has visible non-whitespace text or focusable content
    - Set nodeIds = [root backendDOMNodeId, ...focusable descendant backendDOMNodeIds]
    - Skip purely decorative elements (img alt="", role=presentation/none with no text/focusable)
    - Rows without ariaHidden || isPresentational never qualify (do not flag visible-but-not-in-AX-tree cases)
    - Use domAxMapping from RawAudit
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_
    - _Design: Detector Algorithms § 10. The Veiled_
  
  - [ ] 11.8 Write unit tests for The Veiled detector
    - Test focusable inside aria-hidden is flagged (one haunting with nodeIds [parent, focusable])
    - Test visible text with aria-hidden is flagged (one haunting with nodeIds [parent])
    - Test img alt="" with role=presentation is not flagged
    - Test decorative div with role=none is not flagged
    - Test `<div aria-hidden="true"><p>text</p><a href>...</a></div>` produces exactly 1 haunting with nodeIds [div, a]
    - _Requirements: 11_

- [ ] 12. Implement severity assignment module
  - [ ] 12.1 Create severity assigner
    - Create `packages/core/src/classifier/severity.ts`
    - Implement `assignSeverity(primaries: Array<UnclassifiedHaunting & { isPrimary: true; secondary: UnclassifiedHaunting[] }>, raw: RawAudit): Haunting[]`
    - Apply rules in order: Wraith iff type in {CursedLoop, NamelessSpirit, WhisperingField, LostSoul} AND isCoreTask; Restless iff >= 3 primaries of the same type on the page, or wcag[0].level === 'A'; otherwise Banished
    - Implement isCoreTask(haunting, raw): check domNodes ancestry for form, dialog/alertdialog, checkout/cart id or class; or keywords in AX name; or (when name is empty) keywords in id/class/aria-label/snippet
    - Use blocking table from Design: CursedLoop always blocks; NamelessSpirit blocks if button/menuitem*/tab; WhisperingField always blocks; LostSoul blocks if on critical path (form/dialog/checkout-cart ancestor); others never block
    - Keywords: submit, checkout, buy, pay, login, sign in, sign up, search, continue, cart, add to, basket, register, subscribe (case-insensitive)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
    - _Design: Data Models § Severity Assignment_
  
  - [ ] 12.2 Write unit tests for severity assignment
    - Test unnamed button inside `<form>` gets Wraith
    - Test unnamed button with class 'checkout-btn' gets Wraith
    - Test 3+ instances of same type get Restless
    - Test level A criterion gets Restless
    - Test single level AA non-critical gets Banished
    - Test keyword matching is case-insensitive
    - _Requirements: 12_

- [ ] 13. Checkpoint - Ensure all tests pass
  - Run `npm run typecheck -w @the-unseen/core`
  - Run `npx vitest --run` in `packages/core`
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Implement precedence resolution module
  - [ ] 14.0 Document precedence in steering
    - Append §Precedence to `.kiro/steering/hauntings.md`
    - Document order: Cursed Loop > Nameless Spirit > Whispering Field > Lost Soul > Hollow Portrait > Veiled > Invisible Wanderer > Fog
    - Explain that precedence groups hauntings by every backendDOMNodeId in nodeIds (Cursed Loop nodeIds = trapRegionNodeIds: the region plus the cycle members)
    - Explain that a lower-precedence haunting that shares any id becomes a secondary of the higher one (e.g. a trapped Whispering Field input is a secondary of the Cursed Loop)
    - Explain secondaries are unscored but counted in detectedCountsByType
    - Note: Silent Tongue and Shattered Order never take part (they use html/body/heading ids and are always primary)
    - _Requirements: 15.1, 15.2, Findings 28, 42_
  
  - [ ] 14.1 Create precedence resolver
    - Create `packages/core/src/classifier/precedence.ts`
    - Implement `resolvePrecedence(hauntings: UnclassifiedHaunting[]): Array<UnclassifiedHaunting & {isPrimary: boolean; secondary: UnclassifiedHaunting[]}>`
    - Define precedence order: CursedLoop > NamelessSpirit > WhisperingField > LostSoul > HollowPortrait > TheVeiled > InvisibleWanderer > TheFog
    - Collisions are on any shared backendDOMNodeId in nodeIds
    - Process in precedence order; the first claimant is primary and later colliders go into its secondary[]
    - SilentTongue and ShatteredOrder (html/body/heading ids) are excluded from collision checking and always primary
    - _Requirements: 15.1, 15.2, 15.3, 15.4_
    - _Design: Data Models § Precedence Model_
  
  - [ ] 14.2 Write property tests for primary haunting uniqueness
    - **Property 17: Primary haunting uniqueness**
    - **Validates: Requirements 15.1**
    - Generate 100+ random haunting sets with fast-check
    - Verify no backendDOMNodeId appears in two participating primaries
    - _Requirements: 15.1_
  
  - [ ] 14.3 Write unit tests for precedence resolution
    - Test CursedLoop beats NamelessSpirit on same element
    - Test NamelessSpirit beats WhisperingField on same element
    - Test hauntings at different nodes are both primary
    - Test a CursedLoop whose trapRegionNodeIds include a WhisperingField input -> the WF is in loop.secondary, and detectedCountsByType.WhisperingField still counts it
    - _Requirements: 15_
    - Test page-level hauntings are always primary
    - Test multiple elements can each have primary hauntings
    - _Requirements: 15_

- [ ] 15. Implement score computation module
  - [ ] 15.1 Create score computer
    - Create `packages/core/src/classifier/score.ts`
    - Implement `computeScore(hauntings: readonly Haunting[]): number`
    - Filter to isPrimary: true only
    - Apply weights: Wraith=20, Restless=8, Banished=3
    - Use formula: `round(100 * (1 - exp(-rawScore / 120)))`
    - _Requirements: 13.1, 13.2, 13.3, 13.4_
    - _Design: Data Models § Score Computation_
  
  - [ ] 15.2 Write property tests for score determinism
    - **Property 1: Score is deterministic**
    - **Validates: Requirements 13.5, 21.5, 22.2**
    - Generate 100+ random haunting sets with fast-check
    - Verify calling computeScore twice returns same value
    - _Requirements: 13.5, 22.1, 22.2_
  
  - [ ] 15.3 Write property tests for score monotonicity
    - **Property 2: Score is monotonic non-decreasing**
    - **Validates: Requirements 13.5, 22.4**
    - Generate 100+ random haunting sets with fast-check
    - Verify adding any haunting never decreases score
    - _Requirements: 13.5, 22.1, 22.4_
  
  - [ ] 15.4 Write property tests for score order-independence
    - **Property 3: Score is order-independent**
    - **Validates: Requirements 13.6, 22.3**
    - Generate 100+ random haunting sets with fast-check
    - Verify all permutations produce same score
    - _Requirements: 13.6, 22.1, 22.3_
  
  - [ ] 15.5 Write property tests for score bounds
    - **Property 4: Score is bounded**
    - **Validates: Requirements 13.4, 22.5**
    - Generate 100+ random haunting sets with fast-check
    - Verify 0 <= score <= 100
    - _Requirements: 13.4, 22.1, 22.5_
  
  - [ ] 15.6 Write property tests for score zero baseline
    - **Property 5: Score zero baseline**
    - **Validates: Requirements 13.3, 22.6**
    - Verify computeScore([]) === 0
    - _Requirements: 13.3, 22.1, 22.6_
  
  - [ ] 15.7 Write property tests for score severity-dominance
    - **Property 6: Score severity-dominance**
    - **Validates: Requirements 13.7, 22.7**
    - Generate 100+ random haunting sets with fast-check
    - Verify replacing haunting with higher severity never decreases score
    - _Requirements: 13.7, 22.1, 22.7_
  
  - [ ] 15.8 Write unit tests for score edge cases
    - Test empty input returns 0
    - Test single Wraith returns ≈15
    - Test five Wraiths returns ≈57
    - _Requirements: 13_

- [ ] 16. Checkpoint - Ensure all tests pass
  - Run `npm run typecheck -w @the-unseen/core`
  - Run `npx vitest --run` in `packages/core`
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Implement axe cross-check module
  - [ ] 17.1 Create axe cross-checker
    - Create `packages/core/src/classifier/axe-cross-check.ts`
    - Implement `crossCheckAxe(hauntings: Haunting[], raw: RawAudit): AxeCrossCheck`
    - Match where AxeViolationNode.backendDOMNodeId is in haunting.nodeIds
    - For nodes with a null id, use the Req 16.1 rule->type table (button-name/link-name -> NamelessSpirit; image-alt/svg-img-alt/role-img-alt -> HollowPortrait; color-contrast -> TheFog; label -> WhisperingField; html-has-lang/html-lang-valid -> SilentTongue; aria-hidden-focus -> TheVeiled; scrollable-region-focusable/nested-interactive -> none)
    - Note: ShatteredOrder has no corresponding axe rule
    - Build hauntingToAxe map (haunting.id → axe rule IDs)
    - Build unmapped list (axe violations with no corresponding haunting)
    - _Requirements: 16.1, 16.2, 16.3_
    - _Design: Architecture § Data Flow (axe cross-checker step)_
  
  - [ ] 17.2 Write property tests for axe violation accounting
    - **Property 16: Every axe violation is accounted for**
    - **Validates: Requirements 16.2, 24.2, 24.3**
    - Generate 100+ random RawAudit inputs with fast-check
    - Verify every axe violation either maps to haunting or appears in unmapped
    - _Requirements: 16.2, 24.1, 24.2, 24.3_
  
  - [ ] 17.3 Write unit tests for axe cross-check
    - Test axe violation matching haunting by nodeId is mapped
    - Test axe violation with no haunting appears in unmapped
    - Test multiple axe rules for same element all map to haunting
    - _Requirements: 16_

- [ ] 18. Implement main classify function
  - [ ] 18.1 Create main classifier entry point
    - Create `packages/core/src/classifier/classify.ts`
    - Implement `classify(raw: RawAudit): ClassifiedAudit`
    - Call all 10 detectors (order does not matter for pure functions)
    - Call resolvePrecedence to deduplicate and assign primary/secondary
    - Call assignSeverity on primaries
    - After assignSeverity: compute countsByType (per-type count of primaries) and detectedCountsByType (per-type count of distinct elements by nodeIds[0] across primaries and all secondary arrays)
    - Call computeScore
    - Call crossCheckAxe
    - Build needsManualCheck list: backgroundUncertain text nodes ('contrast-uncertain') plus Tab steps with cdpError or empty backendDOMNodeId ('focus-style-unavailable')
    - Add automatedCoverageNote
    - Return ClassifiedAudit with all fields populated
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 17_
    - _Design: Architecture § Data Flow_
  
  - [ ] 18.2 Write unit tests for classify integration
    - Test classify returns valid ClassifiedAudit structure
    - Test classify with empty RawAudit returns score 0
    - Test classify does not mutate input
    - _Requirements: 1_
  
  - [ ] 18.3 Write property tests for classification purity
    - **Property 14: Detector purity**
    - **Validates: Requirements 21.1, 21.5, 26.2**
    - Generate 100+ random RawAudit inputs with fast-check
    - Loop over all 10 detectors plus classify with deep-frozen input
    - Verify calling twice returns same output
    - _Requirements: 21.5, 26.1, 26.2_
  
  - [ ] 18.4 Write property tests for input immutability
    - **Property 15: Detector does not mutate input**
    - **Validates: Requirements 21.4, 26.4**
    - Generate 100+ random RawAudit inputs with fast-check
    - Deep-freeze input before calling classify
    - Verify no mutation error occurs
    - _Requirements: 21.4, 26.3, 26.4_
  
  - [ ] 18.5 Write property test for score counts only primary hauntings
    - **Property 18: Score counts only primary hauntings**
    - **Validates: Requirements 15.4**
    - Generate 100+ random RawAudit inputs with fast-check
    - Manually compute score from primary hauntings only
    - Verify matches classify result
    - _Requirements: 15.4_

- [ ] 19. Implement boundary enforcement
  - [ ] 19.1 Add ESLint no-restricted-imports rule
    - Add devDependencies `eslint@^9` and `typescript-eslint@^8` to root package.json
    - Create root `eslint.config.js` (flat config)
    - Use typescript-eslint's parser for `packages/core/src/classifier/**/*.ts`
    - Add `no-restricted-imports: ['error', { patterns: [{ group: ['**/runner/*', '../runner/*', './runner/*'], message: 'classifier must not import runner (structure.md)' }] }]`
    - Add `"lint": "eslint packages/core/src/classifier"` script to root package.json
    - _Requirements: 31.1, 31.2_
    - _Design: Testing Strategy § Boundary Test (ESLint rule section)_
  
  - [ ] 19.2 Write boundary violation test
    - Create `packages/core/src/classifier/boundary.test.ts`
    - Grep all classifier files for import statements
    - Verify no imports resolve to `src/runner/`
    - _Requirements: 32.1, 32.2, 32.3_
    - _Design: Testing Strategy § Boundary Test_

- [ ] 20. Checkpoint - Ensure all tests pass
  - Run `npm run typecheck -w @the-unseen/core`
  - Run `npx vitest --run` in `packages/core`
  - Run `npm run lint` in root
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 21. Implement golden tests against Cursed Shop fixtures
  - [ ] 21.1 Write golden test for index.html
    - Create `packages/core/src/classifier/golden.test.ts` (Vitest, reads JSON only, no browser)
    - Load `packages/core/tests/fixtures/raw/index.json`
    - Call `classify(raw)`
    - Assert detectedCountsByType matches `apps/cursed-shop/expected-hauntings.json` for index.html
    - Assert per-type union of nodeIds[0] over primary and secondary equals the union of the `self` ids of the golden selectors (resolved from .selectors.json)
    - For CursedLoop: assert every nodeId is in the selector's subtree
    - For SilentTongue and ShatteredOrder: assert type + kind + count match; for ShatteredOrder the kinds multiset equals golden `kinds`
    - For controls (Req 20.4 table): assert no control `self` id appears in a primary or secondary of its guarded types
    - _Requirements: 20.1, 20.4, 20.5, 20.6, 10.6_
    - _Design: Testing Strategy § Integration Tests (Golden test section)_
    - **Note:** Before starting Task 21, re-run Task 1 if runner/** or apps/cursed-shop HTML changed
  
  - [ ] 21.2 Write golden test for product.html
    - Load `packages/core/tests/fixtures/raw/product.json`
    - Call `classify(raw)`
    - Assert detectedCountsByType matches `apps/cursed-shop/expected-hauntings.json` for product.html
    - Apply all assertions from 21.1 (nodeIds union, CursedLoop subtree, page-level kind, controls)
    - _Requirements: 20.2, 20.4, 20.5, 20.6, 10.6_
  
  - [ ] 21.3 Write golden test for checkout.html
    - Load `packages/core/tests/fixtures/raw/checkout.json`
    - Call `classify(raw)`
    - Assert detectedCountsByType matches `apps/cursed-shop/expected-hauntings.json` for checkout.html
    - Apply all assertions from 21.1 (nodeIds union, CursedLoop subtree, page-level kind, controls)
    - _Requirements: 20.3, 20.4, 20.5, 20.6, 10.6_

- [ ] 22. Wire classify into public API
  - [ ] 22.1 Implement auditAndClassify function
    - Open `packages/core/src/audit.ts` (or create if doesn't exist)
    - Implement `auditAndClassify(url: string, options?: AuditOptions): Promise<ClassifiedAudit>`
    - Call `auditUrl(url, options)` to get RawAudit
    - Call `classify(raw)` to get ClassifiedAudit
    - Propagate all errors unchanged
    - _Requirements: 28.1, 28.2, 28.3_
    - _Design: Detector Algorithms (reference to auditAndClassify API)_
  
  - [ ] 22.2 Export auditAndClassify from main index
    - Open `packages/core/src/index.ts`
    - Export `auditAndClassify` function
    - Export `ClassifiedAudit`, `Haunting`, and related classifier types
    - Verify all public types are exported
    - _Requirements: 28.1_
  
  - [ ] 22.3 Write integration test for auditAndClassify
    - Start cursed-shop server in test setup using startShopServer() with { allowPrivate: true }
    - Call `auditAndClassify(shop.baseUrl + "/index.html", { allowPrivate: true })`
    - Verify returns valid ClassifiedAudit
    - Verify score > 0 (cursed shop has hauntings)
    - Verify hauntings array is non-empty
    - Close server and getPool() in afterAll
    - _Requirements: 28_

- [ ] 23. Final checkpoint - Ensure all tests pass
  - Run `npm run typecheck -w @the-unseen/core`
  - Run `npx vitest --run` in `packages/core`
  - Run `npx playwright test` in `packages/core`
  - Run `npm run lint` in root
  - Verify all property tests pass (100+ iterations each)
  - Verify all golden tests pass
  - Verify boundary test passes
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Each detector task references specific requirements for traceability
- Property tests validate universal correctness properties from the design
- Golden tests validate exact expected results against Cursed Shop fixtures
- The classifier is pure: no I/O, no mutation, no non-deterministic operations
- Boundary enforcement (ESLint + test) ensures classifier never imports from runner
- All tests must pass before moving to next checkpoint or final integration

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["0"] },
    { "id": 1, "tasks": ["1"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4", "2.5", "2.6"] },
    { "id": 4, "tasks": ["3.1"] },
    { "id": 5, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6"] },
    { "id": 6, "tasks": ["4"] },
    { "id": 7, "tasks": ["5.1"] },
    { "id": 8, "tasks": ["5.2"] },
    { "id": 9, "tasks": ["5.3", "5.4", "5.5", "5.6", "5.7"] },
    { "id": 10, "tasks": ["6.1", "6.2"] },
    { "id": 11, "tasks": ["6.3"] },
    { "id": 12, "tasks": ["7"] },
    { "id": 13, "tasks": ["8.1"] },
    { "id": 14, "tasks": ["8.2"] },
    { "id": 15, "tasks": ["8.3"] },
    { "id": 16, "tasks": ["8.4"] },
    { "id": 17, "tasks": ["8.5"] },
    { "id": 18, "tasks": ["8.6"] },
    { "id": 19, "tasks": ["9.1"] },
    { "id": 20, "tasks": ["9.2"] },
    { "id": 21, "tasks": ["9.3"] },
    { "id": 22, "tasks": ["9.4"] },
    { "id": 23, "tasks": ["9.5"] },
    { "id": 24, "tasks": ["9.6"] },
    { "id": 25, "tasks": ["10"] },
    { "id": 26, "tasks": ["11.1"] },
    { "id": 27, "tasks": ["11.2"] },
    { "id": 28, "tasks": ["11.3"] },
    { "id": 29, "tasks": ["11.4"] },
    { "id": 30, "tasks": ["11.5"] },
    { "id": 31, "tasks": ["11.6"] },
    { "id": 32, "tasks": ["11.7"] },
    { "id": 33, "tasks": ["11.8"] },
    { "id": 34, "tasks": ["12.0"] },
    { "id": 35, "tasks": ["12.1"] },
    { "id": 36, "tasks": ["12.2"] },
    { "id": 37, "tasks": ["13"] },
    { "id": 38, "tasks": ["14.0"] },
    { "id": 39, "tasks": ["14.1"] },
    { "id": 40, "tasks": ["14.2", "14.3"] },
    { "id": 41, "tasks": ["15.1"] },
    { "id": 41, "tasks": ["15.1"] },
    { "id": 42, "tasks": ["15.2", "15.3", "15.4", "15.5", "15.6", "15.7", "15.8"] },
    { "id": 43, "tasks": ["16"] },
    { "id": 44, "tasks": ["17.1"] },
    { "id": 45, "tasks": ["17.2", "17.3"] },
    { "id": 46, "tasks": ["18.1"] },
    { "id": 47, "tasks": ["18.2", "18.3", "18.4", "18.5"] },
    { "id": 48, "tasks": ["19.1"] },
    { "id": 49, "tasks": ["19.2"] },
    { "id": 50, "tasks": ["20"] },
    { "id": 51, "tasks": ["21.1", "21.2", "21.3"] },
    { "id": 52, "tasks": ["22.1", "22.2"] },
    { "id": 53, "tasks": ["22.3"] },
    { "id": 54, "tasks": ["23"] }
  ]
}
```
