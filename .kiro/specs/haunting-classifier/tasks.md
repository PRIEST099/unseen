# Implementation Plan: Haunting Classifier

## Overview

The haunting classifier is a pure functional layer that transforms raw audit data into classified accessibility issues. This plan implements 10 detection algorithms, severity assignment, scoring, speech generation, and axe cross-checking, with comprehensive property-based testing throughout.

## Tasks

- [ ] 1. Capture RawAudit fixtures from Cursed Shop
  - Start `apps/cursed-shop` server on localhost
  - Create `packages/core/tests/fixtures/capture.ts` script
  - Run `auditUrl` for index.html, product.html, checkout.html
  - Save RawAudit JSON to `packages/core/tests/fixtures/raw/{page}.json`
  - Commit fixtures to git for use in golden tests
  - _Requirements: 27.1, 27.2, 27.3, 27.4_
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
    - Export constant objects for all 11 WCAG criteria referenced in hauntings
    - Each includes id, level, title, url fields
    - _Requirements: 2.5, 3.8, 4.8, 5.6, 6.5, 7.5, 8.6, 9.5, 10.5, 11.6_
    - _Design: Appendix: WCAG Criterion Definitions_
  
  - [ ] 2.3 Create classifier directory structure
    - Create `packages/core/src/classifier/` directory
    - Create `packages/core/src/classifier/detectors/` subdirectory
    - Create placeholder files for all 10 detectors
    - Create placeholder files for severity.ts, precedence.ts, score.ts, speech.ts, contrast.ts, explanation.ts, axe-cross-check.ts
    - _Design: Architecture § Module Layout_
  
  - [ ]* 2.4 Write unit tests for type definitions
    - Test that DetectorFunction signature matches expected shape
    - Test that all WCAG constants are well-formed
    - _Requirements: 29, 30_

- [ ] 3. Implement contrast computation module
  - [ ] 3.1 Implement WCAG luminance and contrast ratio functions
    - Create `packages/core/src/classifier/contrast.ts`
    - Implement `relativeLuminance(rgb: RGBColor): Luminance` with gamma expansion
    - Implement `contrastRatio(c1: RGBColor, c2: RGBColor): ContrastRatio`
    - Export `RGBColor`, `Luminance`, `ContrastRatio` types
    - _Requirements: 18.1, 18.2, 18.3_
    - _Design: Data Models § Contrast Computation_
  
  - [ ]* 3.2 Write property tests for contrast invariants
    - **Property 7: Contrast ratio is symmetric**
    - **Validates: Requirements 18.4, 23.2**
    - Generate 100+ random color pairs with fast-check
    - Verify `contrastRatio(c1, c2) === contrastRatio(c2, c1)`
    - _Requirements: 18.4, 23.1, 23.2_
  
  - [ ]* 3.3 Write property tests for contrast bounds
    - **Property 8: Contrast ratio is bounded**
    - **Validates: Requirements 18.6, 23.3**
    - Generate 100+ random color pairs with fast-check
    - Verify `1 <= contrastRatio(c1, c2) <= 21`
    - _Requirements: 18.6, 23.1, 23.3_
  
  - [ ]* 3.4 Write property tests for identical colors
    - **Property 9: Identical colors have ratio 1**
    - **Validates: Requirements 18.5, 23.4**
    - Generate 100+ random colors with fast-check
    - Verify `contrastRatio(c, c) === 1`
    - _Requirements: 18.5, 23.1, 23.4_
  
  - [ ]* 3.5 Write unit tests for contrast edge cases
    - Test black-on-white returns 21
    - Test white-on-black returns 21
    - Test mid-gray combinations
    - _Requirements: 18_

- [ ] 4. Checkpoint - Ensure all tests pass
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
    - Implement `generateSpeech(axNode: AXNode): string`
    - Apply formula: `[name, role, state].filter(Boolean).join(", ")`
    - Handle heading level concatenation
    - Return empty string for generic/none/presentation roles
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_
    - _Design: Data Models § Speech Announcement Generation_
  
  - [ ]* 5.3 Write property tests for speech invariants
    - **Property 10: Speech always includes role**
    - **Validates: Requirements 14.3, 25.3**
    - Generate 100+ random AX nodes with fast-check
    - Verify announcement contains role label (unless generic/none/presentation)
    - _Requirements: 25.1, 25.2_
  
  - [ ]* 5.4 Write property tests for name inclusion
    - **Property 11: Speech includes name iff non-empty**
    - **Validates: Requirements 14.2, 25.2**
    - Generate 100+ random AX nodes with fast-check
    - Verify name appears iff `axNode.name.value.trim().length > 0`
    - _Requirements: 25.1, 25.2_
  
  - [ ]* 5.5 Write property tests for no fabricated text
    - **Property 12: Speech contains no fabricated text**
    - **Validates: Requirements 14.8, 25.3**
    - Generate 100+ random AX nodes with fast-check
    - Verify announcement does not contain "undefined", "null", or unexpected text
    - _Requirements: 25.1, 25.3_
  
  - [ ]* 5.6 Write property test for generic node skipping
    - **Property 13: Generic nodes are skipped**
    - **Validates: Requirements 14.5, 25.4**
    - Generate 100+ AX nodes with generic/none/presentation roles
    - Verify empty string returned
    - _Requirements: 25.1, 25.4_
  
  - [ ]* 5.7 Write unit tests for speech examples
    - Test button with name: "Add to cart, button"
    - Test button without name: "button"
    - Test checkbox checked: "Subscribe, checkbox, checked"
    - Test textbox with placeholder-only name
    - _Requirements: 14_

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
  
  - [ ]* 6.3 Write unit tests for all explanations and fixes
    - Test each of 10 haunting types generates valid explanation, persona, and fix
    - Verify code snippets use correct HTML/ARIA syntax
    - _Requirements: 19_

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement core detectors (Part 1: Nameless Spirit, Hollow Portrait, Silent Tongue)
  - [ ] 8.1 Implement Nameless Spirit detector
    - Create `packages/core/src/classifier/detectors/nameless-spirit.ts`
    - Implement `detectNamelessSpirit(raw: RawAudit): UnclassifiedHaunting[]`
    - Check 14 interactive roles for empty accessible names
    - Use `generateSpeech`, `generateExplanation`, `generateFix` helpers
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
    - _Design: Detector Algorithms § 1. Nameless Spirit_
  
  - [ ]* 8.2 Write unit tests for Nameless Spirit detector
    - Test all 14 interactive roles are recognized
    - Test non-empty names are not flagged
    - Test node with name="  " (whitespace) is flagged
    - _Requirements: 2_
  
  - [ ] 8.3 Implement Hollow Portrait detector
    - Create `packages/core/src/classifier/detectors/hollow-portrait.ts`
    - Implement `detectHollowPortrait(raw: RawAudit): UnclassifiedHaunting[]`
    - Treat img and image roles as equivalent
    - Skip alt="", role=presentation/none, aria-hidden (with exceptions)
    - Handle inline SVG rules
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_
    - _Design: Detector Algorithms § 2. Hollow Portrait_
  
  - [ ]* 8.4 Write unit tests for Hollow Portrait detector
    - Test img role with empty name is flagged
    - Test image role with empty name is flagged
    - Test alt="" is not flagged
    - Test role=presentation with no text/focusable is not flagged
    - Test SVG with role=img and no name is flagged
    - Test SVG icon inside named button is not flagged
    - _Requirements: 3_
  
  - [ ] 8.5 Implement Silent Tongue detector
    - Create `packages/core/src/classifier/detectors/silent-tongue.ts`
    - Implement `detectSilentTongue(raw: RawAudit): UnclassifiedHaunting[]`
    - Check for missing lang attribute
    - Validate lang with BCP 47 regex: `/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/`
    - Return page-level haunting (nodeIds: [], box: null)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
    - _Design: Detector Algorithms § 8. Silent Tongue_
  
  - [ ]* 8.6 Write unit tests for Silent Tongue detector
    - Test missing lang attribute is flagged
    - Test invalid lang values are flagged
    - Test valid lang="en" is not flagged
    - Test valid lang="en-US" is not flagged
    - _Requirements: 9_

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
  
  - [ ]* 9.2 Write unit tests for The Fog detector
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
    - Use name.sources to determine winning source
    - Generate appropriate speech for each case
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
    - _Design: Detector Algorithms § 7. Whispering Field_
  
  - [ ]* 9.4 Write unit tests for Whispering Field detector
    - Test textbox with empty name is flagged
    - Test textbox with placeholder-only name is flagged
    - Test textbox with label is not flagged
    - Test all 5 form field roles
    - _Requirements: 8_
  
  - [ ] 9.5 Implement Shattered Order detector
    - Create `packages/core/src/classifier/detectors/shattered-order.ts`
    - Implement `detectShatteredOrder(raw: RawAudit): UnclassifiedHaunting[]`
    - Check for no-h1 (kind: "no-h1")
    - Check for heading-skip (kind: "heading-skip")
    - Check for no-main landmark (kind: "no-main")
    - Each check produces separate haunting with appropriate kind field
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
    - _Design: Detector Algorithms § 9. Shattered Order_
  
  - [ ]* 9.6 Write unit tests for Shattered Order detector
    - Test page with no h1 is flagged with kind="no-h1"
    - Test h1→h3 skip is flagged with kind="heading-skip"
    - Test page with no main landmark is flagged with kind="no-main"
    - Test page with h1 and main is not flagged
    - _Requirements: 10_

- [ ] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement complex detectors (Part 3: Lost Soul, Cursed Loop, Invisible Wanderer, The Veiled)
  - [ ] 11.1 Implement Lost Soul detector
    - Create `packages/core/src/classifier/detectors/lost-soul.ts`
    - Implement `detectLostSoul(raw: RawAudit): UnclassifiedHaunting[]`
    - Check for click handlers (click, mousedown, pointerdown, pointerup)
    - Verify element not in Tab walk sequence
    - Verify not native interactive element
    - Apply outermost rule (report ancestor, suppress child)
    - Skip elements inside or containing native interactive elements
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
    - _Design: Detector Algorithms § 4. Lost Soul_
  
  - [ ]* 11.2 Write unit tests for Lost Soul detector
    - Test div with click handler not in Tab walk is flagged
    - Test button with click handler is not flagged (native interactive)
    - Test nested clickable divs report only outermost
    - Test clickable inside button is not flagged
    - _Requirements: 5_
  
  - [ ] 11.3 Implement Cursed Loop detector
    - Create `packages/core/src/classifier/detectors/cursed-loop.ts`
    - Implement `detectCursedLoop(raw: RawAudit): UnclassifiedHaunting[]`
    - Use `tabWalkResult.cycles` from RawAudit
    - Skip cycles marked escapable
    - Skip cycles that include all focusables
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
    - _Design: Detector Algorithms § 5. Cursed Loop_
  
  - [ ]* 11.4 Write unit tests for Cursed Loop detector
    - Test non-escapable cycle is flagged
    - Test escapable cycle is not flagged
    - Test cycle including all focusables is not flagged
    - _Requirements: 6_
  
  - [ ] 11.5 Implement Invisible Wanderer detector
    - Create `packages/core/src/classifier/detectors/invisible-wanderer.ts`
    - Implement `detectInvisibleWanderer(raw: RawAudit): UnclassifiedHaunting[]`
    - Check all Tab walk steps for visible focus indicators
    - Implement 4 visibility criteria: outline, box-shadow, color change, text-decoration
    - Handle Chromium outline-style=none quirk
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
    - _Design: Detector Algorithms § 6. Invisible Wanderer_
  
  - [ ]* 11.6 Write unit tests for Invisible Wanderer detector
    - Test element with no outline change is flagged
    - Test element with visible outline is not flagged
    - Test element with box-shadow change is not flagged
    - Test element with background-color change ≥3:1 is not flagged
    - _Requirements: 7_
  
  - [ ] 11.7 Implement The Veiled detector
    - Create `packages/core/src/classifier/detectors/veiled.ts`
    - Implement `detectTheVeiled(raw: RawAudit): UnclassifiedHaunting[]`
    - Check for focusable inside aria-hidden (case a)
    - Check for visible content excluded from AX tree (case b)
    - Skip purely decorative elements (img alt="", role=presentation/none with no text/focusable)
    - Use domAxMapping from RawAudit
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
    - _Design: Detector Algorithms § 10. The Veiled_
  
  - [ ]* 11.8 Write unit tests for The Veiled detector
    - Test focusable inside aria-hidden is flagged
    - Test visible text with aria-hidden is flagged
    - Test img alt="" with role=presentation is not flagged
    - Test decorative div with role=none is not flagged
    - _Requirements: 11_

- [ ] 12. Implement severity assignment module
  - [ ] 12.1 Create severity assigner
    - Create `packages/core/src/classifier/severity.ts`
    - Implement `assignSeverity(hauntings: UnclassifiedHaunting[], raw: RawAudit): Haunting[]`
    - Apply rules in order: Wraith (core task flow + blocks task), Restless (≥3 instances or level A), Banished (all others)
    - Implement core task flow detection: inside form OR button/link with keywords
    - Keywords: submit, checkout, buy, pay, login, sign in, sign up, search, continue, cart, add to, basket, register, subscribe
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
    - _Design: Data Models § Severity Assignment_
  
  - [ ]* 12.2 Write unit tests for severity assignment
    - Test checkout button with Nameless Spirit gets Wraith
    - Test 3+ instances of same type get Restless
    - Test level A criterion gets Restless
    - Test single level AA non-critical gets Banished
    - Test keyword matching is case-insensitive
    - _Requirements: 12_

- [ ] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Implement precedence resolution module
  - [ ] 14.1 Create precedence resolver
    - Create `packages/core/src/classifier/precedence.ts`
    - Implement `resolvePrecedence(hauntings: Haunting[]): Haunting[]`
    - Define precedence order: CursedLoop > NamelessSpirit > WhisperingField > LostSoul > HollowPortrait > TheVeiled > InvisibleWanderer > TheFog
    - Group hauntings by primary backendDOMNodeId
    - Mark first (highest precedence) as isPrimary: true, rest as isPrimary: false
    - Page-level hauntings (nodeIds: []) are always primary
    - _Requirements: 15.1, 15.2, 15.3, 15.4_
    - _Design: Data Models § Precedence Model_
  
  - [ ]* 14.2 Write property tests for primary haunting uniqueness
    - **Property 17: Primary haunting uniqueness**
    - **Validates: Requirements 15.1**
    - Generate 100+ random haunting sets with fast-check
    - Verify each element has at most one primary haunting
    - _Requirements: 15.1_
  
  - [ ]* 14.3 Write unit tests for precedence resolution
    - Test CursedLoop beats NamelessSpirit on same element
    - Test NamelessSpirit beats WhisperingField on same element
    - Test page-level hauntings are always primary
    - Test multiple elements can each have primary hauntings
    - _Requirements: 15_

- [ ] 15. Implement score computation module
  - [ ] 15.1 Create score computer
    - Create `packages/core/src/classifier/score.ts`
    - Implement `computeScore(hauntings: Haunting[]): number`
    - Filter to isPrimary: true only
    - Apply weights: Wraith=20, Restless=8, Banished=3
    - Use formula: `round(100 * (1 - exp(-rawScore / 120)))`
    - _Requirements: 13.1, 13.2, 13.3, 13.4_
    - _Design: Data Models § Score Computation_
  
  - [ ]* 15.2 Write property tests for score determinism
    - **Property 1: Score is deterministic**
    - **Validates: Requirements 13.5, 21.5, 22.2**
    - Generate 100+ random haunting sets with fast-check
    - Verify calling computeScore twice returns same value
    - _Requirements: 13.5, 22.1, 22.2_
  
  - [ ]* 15.3 Write property tests for score monotonicity
    - **Property 2: Score is monotonic non-decreasing**
    - **Validates: Requirements 13.5, 22.4**
    - Generate 100+ random haunting sets with fast-check
    - Verify adding any haunting never decreases score
    - _Requirements: 13.5, 22.1, 22.4_
  
  - [ ]* 15.4 Write property tests for score order-independence
    - **Property 3: Score is order-independent**
    - **Validates: Requirements 13.6, 22.3**
    - Generate 100+ random haunting sets with fast-check
    - Verify all permutations produce same score
    - _Requirements: 13.6, 22.1, 22.3_
  
  - [ ]* 15.5 Write property tests for score bounds
    - **Property 4: Score is bounded**
    - **Validates: Requirements 13.4, 22.5**
    - Generate 100+ random haunting sets with fast-check
    - Verify 0 <= score <= 100
    - _Requirements: 13.4, 22.1, 22.5_
  
  - [ ]* 15.6 Write property tests for score zero baseline
    - **Property 5: Score zero baseline**
    - **Validates: Requirements 13.3, 22.6**
    - Verify computeScore([]) === 0
    - _Requirements: 13.3, 22.1, 22.6_
  
  - [ ]* 15.7 Write property tests for score severity-dominance
    - **Property 6: Score severity-dominance**
    - **Validates: Requirements 13.7, 22.7**
    - Generate 100+ random haunting sets with fast-check
    - Verify replacing haunting with higher severity never decreases score
    - _Requirements: 13.7, 22.1, 22.7_
  
  - [ ]* 15.8 Write unit tests for score edge cases
    - Test empty input returns 0
    - Test single Wraith returns ≈15
    - Test five Wraiths returns ≈57
    - _Requirements: 13_

- [ ] 16. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Implement axe cross-check module
  - [ ] 17.1 Create axe cross-checker
    - Create `packages/core/src/classifier/axe-cross-check.ts`
    - Implement `crossCheckAxe(hauntings: Haunting[], raw: RawAudit): AxeCrossCheck`
    - Map each haunting to axe violations by backendDOMNodeId
    - Build hauntingToAxe map (haunting.id → axe rule IDs)
    - Build unmapped list (axe violations with no corresponding haunting)
    - _Requirements: 16.1, 16.2, 16.3_
    - _Design: Architecture § Data Flow (axe cross-checker step)_
  
  - [ ]* 17.2 Write property tests for axe violation accounting
    - **Property 16: Every axe violation is accounted for**
    - **Validates: Requirements 16.2, 24.2, 24.3**
    - Generate 100+ random RawAudit inputs with fast-check
    - Verify every axe violation either maps to haunting or appears in unmapped
    - _Requirements: 16.2, 24.1, 24.2, 24.3_
  
  - [ ]* 17.3 Write unit tests for axe cross-check
    - Test axe violation matching haunting by nodeId is mapped
    - Test axe violation with no haunting appears in unmapped
    - Test multiple axe rules for same element all map to haunting
    - _Requirements: 16_

- [ ] 18. Implement main classify function
  - [ ] 18.1 Create main classifier entry point
    - Create `packages/core/src/classifier/classify.ts`
    - Implement `classify(raw: RawAudit): ClassifiedAudit`
    - Call all 10 detectors in parallel (or sequentially, doesn't matter for pure functions)
    - Call resolvePrecedence to deduplicate
    - Call assignSeverity
    - Call generateExplanation and generateFix for each haunting
    - Call computeScore
    - Call crossCheckAxe
    - Build needsManualCheck list (contrast-uncertain nodes)
    - Add automatedCoverageNote
    - Return ClassifiedAudit with all fields populated
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 17_
    - _Design: Architecture § Data Flow_
  
  - [ ]* 18.2 Write unit tests for classify integration
    - Test classify returns valid ClassifiedAudit structure
    - Test classify with empty RawAudit returns score 0
    - Test classify does not mutate input
    - _Requirements: 1_
  
  - [ ]* 18.3 Write property tests for classification purity
    - **Property 14: Detector purity**
    - **Validates: Requirements 21.1, 21.5, 26.2**
    - Generate 100+ random RawAudit inputs with fast-check
    - Verify calling classify twice returns same output
    - _Requirements: 21.5, 26.1, 26.2_
  
  - [ ]* 18.4 Write property tests for input immutability
    - **Property 15: Detector does not mutate input**
    - **Validates: Requirements 21.4, 26.4**
    - Generate 100+ random RawAudit inputs with fast-check
    - Deep-freeze input before calling classify
    - Verify no mutation error occurs
    - _Requirements: 21.4, 26.3, 26.4_
  
  - [ ]* 18.5 Write property test for score counts only primary hauntings
    - **Property 18: Score counts only primary hauntings**
    - **Validates: Requirements 15.4**
    - Generate 100+ random RawAudit inputs with fast-check
    - Manually compute score from primary hauntings only
    - Verify matches classify result
    - _Requirements: 15.4_

- [ ] 19. Implement boundary enforcement
  - [ ] 19.1 Add ESLint no-restricted-imports rule
    - Add to `.eslintrc.json` (or create if doesn't exist)
    - Add override for `packages/core/src/classifier/**/*.ts`
    - Forbid patterns `**/runner/**`
    - _Requirements: 31.1, 31.2_
    - _Design: Testing Strategy § Boundary Test (ESLint rule section)_
  
  - [ ]* 19.2 Write boundary violation test
    - Create `packages/core/src/classifier/boundary.test.ts`
    - Grep all classifier files for import statements
    - Verify no imports resolve to `src/runner/`
    - _Requirements: 32.1, 32.2, 32.3_
    - _Design: Testing Strategy § Boundary Test_

- [ ] 20. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 21. Implement golden tests against Cursed Shop fixtures
  - [ ]* 21.1 Write golden test for index.html
    - Load `packages/core/tests/fixtures/raw/index.json`
    - Call `classify(raw)`
    - Assert countsByType matches `apps/cursed-shop/expected-hauntings.json` for index.html
    - Assert node IDs (resolved from selectors) match
    - _Requirements: 20.1, 20.4, 20.5_
    - _Design: Testing Strategy § Integration Tests (Golden test section)_
  
  - [ ]* 21.2 Write golden test for product.html
    - Load `packages/core/tests/fixtures/raw/product.json`
    - Call `classify(raw)`
    - Assert countsByType matches `apps/cursed-shop/expected-hauntings.json` for product.html
    - Assert node IDs match
    - _Requirements: 20.2, 20.4, 20.5_
  
  - [ ]* 21.3 Write golden test for checkout.html
    - Load `packages/core/tests/fixtures/raw/checkout.json`
    - Call `classify(raw)`
    - Assert countsByType matches `apps/cursed-shop/expected-hauntings.json` for checkout.html
    - Assert node IDs match
    - _Requirements: 20.3, 20.4, 20.5_

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
  
  - [ ]* 22.3 Write integration test for auditAndClassify
    - Start cursed-shop server in test setup
    - Call `auditAndClassify("http://localhost:3000/index.html")`
    - Verify returns valid ClassifiedAudit
    - Verify score > 0 (cursed shop has hauntings)
    - Verify hauntings array is non-empty
    - _Requirements: 28_

- [ ] 23. Final checkpoint - Ensure all tests pass
  - Run full test suite: `npm test` and `npm run test:integration`
  - Verify all property tests pass (100+ iterations each)
  - Verify all golden tests pass
  - Verify boundary test passes
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property and unit tests that can be skipped for faster MVP, but are strongly recommended for correctness
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
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4", "3.5"] },
    { "id": 5, "tasks": ["4"] },
    { "id": 6, "tasks": ["5.1"] },
    { "id": 7, "tasks": ["5.2"] },
    { "id": 8, "tasks": ["5.3", "5.4", "5.5", "5.6", "5.7"] },
    { "id": 9, "tasks": ["6.1", "6.2"] },
    { "id": 10, "tasks": ["6.3"] },
    { "id": 11, "tasks": ["7"] },
    { "id": 12, "tasks": ["8.1"] },
    { "id": 13, "tasks": ["8.2"] },
    { "id": 14, "tasks": ["8.3"] },
    { "id": 15, "tasks": ["8.4"] },
    { "id": 16, "tasks": ["8.5"] },
    { "id": 17, "tasks": ["8.6"] },
    { "id": 18, "tasks": ["9.1"] },
    { "id": 19, "tasks": ["9.2"] },
    { "id": 20, "tasks": ["9.3"] },
    { "id": 21, "tasks": ["9.4"] },
    { "id": 22, "tasks": ["9.5"] },
    { "id": 23, "tasks": ["9.6"] },
    { "id": 24, "tasks": ["10"] },
    { "id": 25, "tasks": ["11.1"] },
    { "id": 26, "tasks": ["11.2"] },
    { "id": 27, "tasks": ["11.3"] },
    { "id": 28, "tasks": ["11.4"] },
    { "id": 29, "tasks": ["11.5"] },
    { "id": 30, "tasks": ["11.6"] },
    { "id": 31, "tasks": ["11.7"] },
    { "id": 32, "tasks": ["11.8"] },
    { "id": 33, "tasks": ["12.1"] },
    { "id": 34, "tasks": ["12.2"] },
    { "id": 35, "tasks": ["13"] },
    { "id": 36, "tasks": ["14.1"] },
    { "id": 37, "tasks": ["14.2", "14.3"] },
    { "id": 38, "tasks": ["15.1"] },
    { "id": 39, "tasks": ["15.2", "15.3", "15.4", "15.5", "15.6", "15.7", "15.8"] },
    { "id": 40, "tasks": ["16"] },
    { "id": 41, "tasks": ["17.1"] },
    { "id": 42, "tasks": ["17.2", "17.3"] },
    { "id": 43, "tasks": ["18.1"] },
    { "id": 44, "tasks": ["18.2", "18.3", "18.4", "18.5"] },
    { "id": 45, "tasks": ["19.1"] },
    { "id": 46, "tasks": ["19.2"] },
    { "id": 47, "tasks": ["20"] },
    { "id": 48, "tasks": ["21.1", "21.2", "21.3"] },
    { "id": 49, "tasks": ["22.1", "22.2"] },
    { "id": 50, "tasks": ["22.3"] },
    { "id": 51, "tasks": ["23"] }
  ]
}
```
