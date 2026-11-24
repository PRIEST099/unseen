# Requirements Document

## Introduction

The haunting-classifier transforms raw audit data into classified haunting instances with severity assignments, a Haunting Score, and speech announcements. It is a pure functional layer in `packages/core/src/classifier/` that takes a `RawAudit` (browser data collected by the runner) and produces a `ClassifiedAudit` (hauntings with explanations, fixes, and scoring). The classifier must follow all detection rules, severity rules, scoring rules, and speech rules defined in `.kiro/steering/hauntings.md` exactly.

## Glossary

- **Haunting**: A detected accessibility issue mapped to a WCAG 2.2 success criterion, with a type (e.g. "NamelessSpirit"), severity (Wraith/Restless/Banished), location (node IDs and bounding box), and explanation
- **RawAudit**: The output from the browser runner containing AX tree, axe violations, Tab walk results, text styles, event listeners, and page metadata
- **ClassifiedAudit**: The output from the classifier containing hauntings, the Haunting Score, counts by type, and cross-references to axe violations
- **Detector**: A pure function that examines a `RawAudit` and returns `Haunting[]` for one haunting type
- **Severity**: One of Wraith (critical, blocks core tasks), Restless (multiple instances or level A), or Banished (single instance, level AA, non-critical)
- **Haunting_Score**: A number from 0 to 100 computed from weighted severity counts using an exponential curve
- **Primary_Haunting**: The main haunting assigned to an element when multiple detection rules match; only primary hauntings are scored
- **Secondary_Haunting**: A haunting that applies to an element but is not scored because a higher-precedence primary haunting already applies
- **Speech_Announcement**: The text a screen reader would speak for an AX node, constructed from name, role, and state per WCAG ARIA announcement patterns

## Requirements

### Requirement 0: Extend RawAudit with DOM Node Data (Runner Prerequisite)

**User Story:** As the classifier, I need compact DOM node information in RawAudit, so that I can determine ancestry, attributes, and HTML snippets without a browser.

#### Acceptance Criteria

1. THE Runner SHALL add `RawAudit.domNodes: Record<backendDOMNodeId, DomNodeInfo>` covering every element referenced by any other RawAudit field, plus their ancestors up to `body`
2. `DomNodeInfo` SHALL include: `tag: string`, `parentId: number | null`, attributes: `id`, `class`, `role`, `href`, `src`, `alt`, `type`, `tabindex`, `aria-hidden`, `aria-label`, `placeholder`, `disabled`, and `outerHTMLSnippet: string` (≤ 300 chars)
3. THE Runner SHALL add `RawAudit.imgSrcAttributes: Record<string, string | null>` for every image element
4. THE Runner SHALL extend `HeadingRecord` with `backendDOMNodeId: number` (from `headingIds[i]`)
5. THE Runner SHALL extend `PageMetadata` with `htmlBackendDOMNodeId: number` and `bodyBackendDOMNodeId: number | null`
6. THE Runner SHALL extend `AxeViolationNode` with `backendDOMNodeId: number | null`, resolved via `document.querySelector(target.join(' '))` and DOM.describeNode
7. THE Runner SHALL extend `AxeViolationNode` to keep `target` selectors AND resolve each axe node to `backendDOMNodeId` at collection time (`axeNodeIds`), so the cross-check is by node id
8. THE Runner SHALL report radio and menuitemradio state from the CDP `checked` property
9. This is task 0 in `haunting-classifier/tasks.md` that edits `packages/core/src/runner/` and `types.ts`, with its own integration test

### Requirement 1: Classify Raw Audit Data

**User Story:** As the audit engine, I want to classify raw audit data into hauntings, so that the web app can display them and compute a Haunting Score.

#### Acceptance Criteria

1. THE Classifier SHALL export a pure function `classify(raw: RawAudit): ClassifiedAudit`
2. WHEN `classify` is called with a `RawAudit`, THE Classifier SHALL return a `ClassifiedAudit` containing hauntings, score, counts by type, needs-manual-check nodes, and axe cross-check results
3. THE Classifier SHALL NOT perform any I/O operations (no file reads, no network requests, no console output)
4. THE Classifier SHALL NOT import any module from `packages/core/src/runner/`
5. THE Classifier SHALL NOT mutate the input `RawAudit` object

### Requirement 2: Detect Nameless Spirit Hauntings

**User Story:** As a keyboard and screen-reader user, I want interactive elements to have accessible names, so that I know what each control does.

#### Acceptance Criteria

1. WHEN an AX node has an interactive role AND its computed accessible name is empty, THE Nameless_Spirit_Detector SHALL create a haunting instance for that node
2. THE Nameless_Spirit_Detector SHALL recognize these interactive roles: `button`, `link`, `menuitem`, `menuitemcheckbox`, `menuitemradio`, `tab`, `checkbox`, `radio`, `switch`, `option`, `combobox`, `listbox`, `treeitem`, `gridcell`
3. THE Nameless_Spirit_Detector SHALL use `role.value` and `name.value` from the AX node
4. THE Nameless_Spirit_Detector SHALL generate speech text containing only the role name (e.g. `"button"`)
5. THE Nameless_Spirit_Detector SHALL map each instance to primary WCAG criterion 4.1.2 (Name, Role, Value). `wcagAlso` SHALL contain 2.4.4 (Link Purpose) when role is link, and 1.1.1 (Non-text Content) when the control's only content is an image

### Requirement 3: Detect Hollow Portrait Hauntings

**User Story:** As a screen-reader user, I want images to have text alternatives, so that I understand their purpose.

#### Acceptance Criteria

1. WHEN an AX node has role `img` or `image` AND the accessible name is empty AND `alt` is not explicitly set to `""`, THE Hollow_Portrait_Detector SHALL create a haunting instance for that node
2. THE Hollow_Portrait_Detector SHALL treat `img` and `image` roles as equivalent
3. THE Hollow_Portrait_Detector SHALL skip images with `role="presentation"` or `role="none"`
4. THE Hollow_Portrait_Detector SHALL skip images with `aria-hidden="true"`. WHEN an image or inline SVG is the sole content of a `button`/`link` AX node whose name is empty, THE Hollow_Portrait_Detector SHALL NOT report the image; the parent is reported by the Nameless_Spirit_Detector instead
5. WHEN an inline SVG has an explicit `role="img"` attribute AND no accessible name, THE Hollow_Portrait_Detector SHALL create a haunting instance
6. THE Hollow_Portrait_Detector SHALL NOT flag inline SVG icons inside already-named controls
7. THE Hollow_Portrait_Detector SHALL generate speech text as `"unlabelled graphic, [filename]"` where filename is extracted from the `src` attribute. When no `src` is available, speech SHALL be `"unlabelled graphic"` alone
8. THE Hollow_Portrait_Detector SHALL map each instance to WCAG 1.1.1 (Non-text Content)
9. THE Hollow_Portrait_Detector SHALL use tag name from `domAxMapping[].tagName`. For `tagName === 'svg'`, flag only if the element has an explicit `role="img"` attribute, read from `RawAudit.explicitRoles` (runner prerequisite task). The filename comes from `RawAudit.imgSrcAttributes`, taking the last path segment without query or hash

### Requirement 4: Detect The Fog Hauntings

**User Story:** As a low-vision user, I want sufficient text contrast, so that I can read content without strain.

#### Acceptance Criteria

1. WHEN text contrast ratio is below 4.5:1 for normal text, THE Fog_Detector SHALL create a haunting instance for that text node
2. WHEN text contrast ratio is below 3:1 for large text, THE Fog_Detector SHALL create a haunting instance for that text node
3. THE Fog_Detector SHALL consider text large when it is ≥18pt or ≥14pt bold
4. THE Fog_Detector SHALL compute contrast ratio using the WCAG 2.x relative luminance formula
5. WHEN the effective background cannot be resolved to a single colour, THE Fog_Detector SHALL mark the text node `contrastUncertain: true` and SHALL NOT create a haunting instance
6. THE Fog_Detector SHALL skip disabled text (`aria-disabled` or `:disabled`)
7. THE Fog_Detector SHALL skip decorative text (empty alt, role none/presentation)
8. THE Fog_Detector SHALL map each instance to WCAG 1.4.3 (Contrast Minimum)

### Requirement 5: Detect Lost Soul Hauntings

**User Story:** As a keyboard user, I want all clickable elements to be keyboard-accessible, so that I can interact with the page without a mouse.

#### Acceptance Criteria

1. WHEN an element has a click event handler AND is not in the Tab walk sequence AND does not have an interactive ARIA role AND is not a native interactive element, THE Lost_Soul_Detector SHALL create a haunting instance for that element
2. THE Lost_Soul_Detector SHALL detect click event handlers using event types `click`, `mousedown`, `pointerdown`, or `pointerup` from `EventListenerSignal[]`
3. THE Lost_Soul_Detector SHALL treat only these elements as native interactive: `<button>`, `<a href>`, `<input>`, `<select>`, `<textarea>`, `<summary>`, `[contenteditable]`. An `<a>` without `href` is not native. An `<a>` counts as native only when its AX role is `link`. `[contenteditable]` is detected via domAxMapping `isFocusable` with AX state `editable`
4. THE Lost_Soul_Detector SHALL report only the outermost qualifying element when a child and ancestor both match
5. THE Lost_Soul_Detector SHALL skip any element that is inside or contains a native interactive element
6. THE Lost_Soul_Detector SHALL map each instance to WCAG 2.1.1 (Keyboard) and 4.1.2 (Name, Role, Value)
7. THE Lost_Soul_Detector SHALL compute ancestry by walking `axNodes` `parentId`/`childIds` (the full tree includes ignored nodes), with element tags from `domAxMapping[].tagName`. Containing a native interactive element means any descendant whose tag is button/select/textarea/input/summary or whose AX role is link

### Requirement 6: Detect Cursed Loop Hauntings

**User Story:** As a keyboard user, I want to be able to escape from focus traps, so that I can navigate the entire page.

#### Acceptance Criteria

1. WHEN the Tab walk visits a focus cycle before all focusable elements have been visited AND pressing Escape then Shift+Tab does not move focus outside the cycle, THE Cursed_Loop_Detector SHALL create a haunting instance for that trap
2. WHEN pressing Escape or Shift+Tab moves focus outside a cycle, THE Cursed_Loop_Detector SHALL mark the cycle `escapable: true` and SHALL NOT create a haunting instance
3. WHEN a cycle includes all focusable elements on the page, THE Cursed_Loop_Detector SHALL NOT create a haunting instance
4. THE Cursed_Loop_Detector SHALL emit at most one CursedLoop, and only when `tabWalkResult.trapDetected === true`. Use the cycle whose `escapable === false`. SET `nodeIds = trapRegionNodeIds.map(Number)` (region first). Take `box` and `htmlSnippet` from `nodeIds[0]` (the region). The haunting's `nodeIds` SHALL equal `tabWalkResult.trapRegionNodeIds` (region element first)
5. THE Cursed_Loop_Detector SHALL map each instance to WCAG 2.1.2 (No Keyboard Trap)

### Requirement 7: Detect Invisible Wanderer Hauntings

**User Story:** As a keyboard user, I want visible focus indicators, so that I know which element has focus.

#### Acceptance Criteria

1. WHEN an element is in the Tab walk sequence AND the computed focus indicator is not visible after a real Tab keypress, THE Invisible_Wanderer_Detector SHALL create a haunting instance for that element
2. THE Invisible_Wanderer_Detector SHALL measure contrast between the indicator colour (alpha-blended over `after['adjacent-background-color']`) and `after['adjacent-background-color']` (the nearest opaque ancestor background). THE Invisible_Wanderer_Detector SHALL consider an indicator visible when at least one of these holds: (a) `outline-style` ≠ `none` AND `outline-width` ≥ 1px AND outline colour has ≥ 3:1 contrast against `focusSnapshot.after['adjacent-background-color']`; (b) `box-shadow` changed to a non-transparent shadow with ≥ 3:1 contrast against `after['adjacent-background-color']`. Parse every rgb()/rgba() colour in `after['box-shadow']` when it differs from `before['box-shadow']` and is not 'none', and take the best ratio; (c) `border-color` or `background-color` changed and the contrast between the before and after colours (blended over the adjacent background) is ≥ 3:1; (d) `text-decoration` changed
3. THE Invisible_Wanderer_Detector SHALL ignore `outline-offset`, `outline-width`, and `outline-color` deltas when `outline-style` is `none`
4. THE Invisible_Wanderer_Detector SHALL use `focusSnapshot.before` and `focusSnapshot.after` from each Tab step
5. THE Invisible_Wanderer_Detector SHALL map each instance to WCAG 2.4.7 Focus Visible (AA) as primary criterion. `guidance` SHALL be 2.4.13 Focus Appearance (AAA, never 2.4.11)
6. THE Invisible_Wanderer_Detector SHALL evaluate each backendDOMNodeId once (first non-cdpError step) and SHALL skip steps with `cdpError: true`. Steps with `cdpError === true` SHALL be added to `needsManualCheck` with reason `'focus-style-unavailable'`. At most one Invisible Wanderer per backendDOMNodeId

### Requirement 8: Detect Whispering Field Hauntings

**User Story:** As a screen-reader user, I want form fields to have accessible labels, so that I know what to enter.

#### Acceptance Criteria

1. WHEN an AX node has role `textbox`, `searchbox`, `spinbutton`, `slider`, or `combobox` AND the accessible name is empty, THE Whispering_Field_Detector SHALL create a haunting instance for that node
2. WHEN an AX node has one of these roles AND the winning name source is the `placeholder` attribute, THE Whispering_Field_Detector SHALL create a haunting instance for that node
3. THE Whispering_Field_Detector SHALL determine the winning name source as the first entry of `name.sources` with `superseded !== true` AND a non-empty `value.value`. It is a placeholder source when `attribute === 'placeholder'` or `attribute === 'aria-placeholder'` or `type === 'placeholder'`. THE Whispering_Field_Detector SHALL add a unit test with a realistic CDP `sources` array where the earlier candidates (aria-labelledby, aria-label, label) have no value
4. FOR empty-name instances, THE Whispering_Field_Detector SHALL generate speech text as `"edit text, blank"` (or the appropriate role name)
5. FOR placeholder-only-name instances, THE Whispering_Field_Detector SHALL generate speech text as `"<placeholder text>, edit text"` with `speechNote: "name disappears when typing"`
6. THE Whispering_Field_Detector SHALL map each instance to WCAG 1.3.1 (Info and Relationships), 3.3.2 (Labels or Instructions), and 4.1.2 (Name, Role, Value)

### Requirement 9: Detect Silent Tongue Hauntings

**User Story:** As a screen-reader user, I want pages to declare their language, so that my screen reader can pronounce text correctly.

#### Acceptance Criteria

1. WHEN the `<html>` element has no `lang` attribute, THE Silent_Tongue_Detector SHALL create a haunting instance
2. WHEN the `lang` attribute value is not a valid BCP 47 language tag, THE Silent_Tongue_Detector SHALL create a haunting instance
3. THE Silent_Tongue_Detector SHALL validate BCP 47 tags using a primary-subtag regex: `/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/`
4. THE Silent_Tongue_Detector SHALL use `pageMetadata.htmlLang` from the RawAudit
5. THE Silent_Tongue_Detector SHALL map each instance to WCAG 3.1.1 (Language of Page)

### Requirement 10: Detect Shattered Order Hauntings

**User Story:** As a screen-reader user, I want logical heading structure and landmarks, so that I can navigate the page efficiently.

#### Acceptance Criteria

1. WHEN the page has no `<h1>` element, THE Shattered_Order_Detector SHALL create a haunting instance with `kind: "no-h1"`
2. WHEN heading levels skip, THE Shattered_Order_Detector SHALL create a haunting instance with `kind: "heading-skip"` for each skip. heading-skip SHALL set `nodeIds: [backendDOMNodeId of the heading whose level jumps]`, and `id` = hash(type, that id, kind). This requires `HeadingRecord.backendDOMNodeId: number`; add it as a runner prerequisite task before task 9.5
3. WHEN no `main` landmark is present, THE Shattered_Order_Detector SHALL create a haunting instance with `kind: "no-main"`. no-main uses the `body` node id (the domAxMapping row with tagName 'body')
4. THE Shattered_Order_Detector SHALL use `pageMetadata.headings`, `pageMetadata.hasMainLandmark`, and `pageMetadata.landmarkRoles` from the RawAudit
5. THE Shattered_Order_Detector SHALL map each instance to WCAG 1.3.1 (Info and Relationships) and 2.4.6 (Headings and Labels)
6. THE golden test SHALL match page-level instances (no-h1, no-main, SilentTongue) by type + kind + count only. For ShatteredOrder, THE golden test SHALL assert the kinds multiset equals `kinds` when present

### Requirement 11: Detect The Veiled Hauntings

**User Story:** As a screen-reader user, I want all visible content to be accessible, so that I don't miss important information.

#### Acceptance Criteria

1. THE Veiled_Detector SHALL report one instance per hidden subtree root: a domAxMapping row with (ariaHidden || isPresentational) whose AX node's ignoredReasons contains 'ariaHiddenElement' or 'presentationalRole' (not 'ariaHiddenSubtree'). The root qualifies when it is visible and (hasVisibleText || containsFocusable || isFocusable). Its nodeIds SHALL be [root, ...focusable descendants]
2. WHEN a DOM node is visually present AND (`ariaHidden` is true OR `isPresentational` is true) AND it has no non-ignored AX node AND (`hasVisibleText` OR `containsFocusable` OR `isFocusable`), THE Veiled_Detector SHALL create a haunting instance for that subtree root. Rows without (ariaHidden || isPresentational) SHALL never produce a Veiled instance
3. WHEN a focusable element exists inside an `aria-hidden="true"` subtree (the outermost element carrying `aria-hidden="true"`), THE Veiled_Detector SHALL create one haunting for that subtree root. Descendants are folded into `nodeIds` of that one haunting, never reported separately. Cases (a) and (b) on the same root produce one haunting
4. THE Veiled_Detector SHALL skip purely decorative elements: `<img alt="">`, elements with `role="presentation"`/`"none"` that contain no focusable children and no visible text
5. THE Veiled_Detector SHALL use `domAxMapping` from the RawAudit to determine which DOM nodes have no corresponding AX node
6. THE Veiled_Detector SHALL map each instance to WCAG 1.3.1 (Info and Relationships) and 4.1.2 (Name, Role, Value)
7. If ignoredReasons cannot identify the root, require the runner to add `isHiddenRoot: boolean` to DomAxMapping, as a prerequisite task coordinated with the runner work

### Requirement 12: Assign Severity to Hauntings

**User Story:** As a developer, I want hauntings prioritized by severity, so that I can fix the most critical issues first.

#### Acceptance Criteria

1. WHEN a haunting affects an element that is part of a core task flow AND the haunting type makes the task impossible for AT users, THE Severity_Assigner SHALL assign severity `Wraith`. A haunting 'makes the task impossible' iff its type is CursedLoop, NamelessSpirit, WhisperingField or LostSoul. HollowPortrait, TheFog, InvisibleWanderer, TheVeiled, ShatteredOrder and SilentTongue never qualify for Wraith
2. WHEN a haunting affects multiple elements (≥3 instances of the same type per page, per type, over primary hauntings after precedence) OR the WCAG criterion is level A, THE Severity_Assigner SHALL assign severity `Restless`
3. FOR all other hauntings, THE Severity_Assigner SHALL assign severity `Banished`
4. THE Severity_Assigner SHALL recognize core task flow elements as: elements inside a `<form>` (determined by: some AX ancestor via `parentId` maps to a domAxMapping row with `tagName === 'form'`), or with role `button`/`link` that contain these words (case-insensitive): "submit", "checkout", "buy", "pay", "login", "sign in", "sign up", "search", "continue", "cart", "add to", "basket", "register", "subscribe"
5. THE Severity_Assigner SHALL apply these rules in the order listed (first match wins)
6. A NamelessSpirit on a button is Wraith when it is inside a form or its accessible name signals checkout/cart per the steering example. Record the blocking-type table in steering §Severity for sign-off

### Requirement 13: Compute Haunting Score

**User Story:** As a product manager, I want a single score summarizing accessibility quality, so that I can track progress over time.

#### Acceptance Criteria

1. THE Score_Computer SHALL compute the Haunting Score using the formula: `round(100 * (1 - exp(-rawScore / 120)))` where `rawScore = sum of (weight × instanceCount) for each haunting`
2. THE Score_Computer SHALL use these weights: Wraith = 20, Restless = 8, Banished = 3
3. THE Score_Computer SHALL return 0 when no hauntings are present
4. THE Score_Computer SHALL return a value in the range [0, 100] for all inputs
5. FOR ALL haunting sets H and h, THE Score_Computer SHALL satisfy `score(H ∪ {h}) >= score(H)` (monotonic non-decreasing)
6. FOR ALL permutations of a haunting set, THE Score_Computer SHALL return the same score (order-independent)
7. FOR ALL haunting sets H and hauntings h, h′ where severity(h′) > severity(h), THE Score_Computer SHALL satisfy `score(H ∪ {h′}) >= score(H ∪ {h})` (severity-dominance)

### Requirement 14: Generate Speech Announcements

**User Story:** As a screen-reader user, I want to hear accurate announcements, so that I understand what each element is.

#### Acceptance Criteria

1. THE Speech_Generator SHALL construct announcements from AX nodes using the formula: `[name, role, state].filter(Boolean).join(", ")`
2. THE Speech_Generator SHALL include the accessible name when `axNode.name.value.trim()` is non-empty
3. THE Speech_Generator SHALL always include the human-readable role label
4. THE Speech_Generator SHALL include state only when relevant to the role. State rules: checkbox/menuitemcheckbox/switch → `checked` property ('true'|'false'|'mixed'); radio/menuitemradio → `checked` property ('true' → "selected", otherwise "unselected"); option/tab → `selected`; combobox/treeitem → `expanded`; button → `pressed`; any → `disabled`, `required`; heading level → `level` property
5. THE Speech_Generator SHALL skip nodes with role `generic`, `none`, or `presentation`
6. THE Speech_Generator SHALL use the role label map defined in `.kiro/steering/hauntings.md` §Speech announcement rules
7. THE Speech_Generator SHALL use the state rules defined in `.kiro/steering/hauntings.md` §Speech announcement rules
8. THE Speech_Generator SHALL NOT include "undefined", "null", or fabricated text in announcements
9. THE Speech_Generator (`announce(node)` exported name per prompt 12) SHALL return `"<roleLabel>, blank"` for textbox/searchbox/spinbutton/slider/combobox with an empty name, and `"unlabelled graphic[, filename]"` for img/image with an empty name
10. THE Speech_Generator SHALL return `{text, note?}` or a companion `announceNote(node)` that yields `"name disappears when typing"` when the winning name source is placeholder. Add `speechNote?: string` to Haunting. Sound effects ("garbled whisper", chime) go in a separate `soundCue` field, never in `speech`. Exempt these steering rows from the Property 12 'no fabricated text' check

### Requirement 15: Prevent Double Counting

**User Story:** As a developer, I want each element to contribute to the score only once, so that the Haunting Score is accurate.

#### Acceptance Criteria

1. WHEN multiple detection rules match the same element (by any `backendDOMNodeId` in the haunting's `nodeIds`), THE Classifier SHALL assign exactly one primary haunting to that element. The precedence key of a haunting is a single backendDOMNodeId. For Cursed Loop it is the trap region node (`tabWalkResult.trapRegionNodeIds[0]`, the dialog/common ancestor). Cycle members go in `nodeIds` after it but do not take part in precedence. For all other types it is `nodeIds[0]`. Each precedence key has at most one primary haunting
2. THE Classifier SHALL apply this precedence (highest to lowest): Cursed Loop, Nameless Spirit, Whispering Field, Lost Soul, Hollow Portrait, The Veiled, Invisible Wanderer, The Fog. ShatteredOrder and SilentTongue never collide; always primary
3. THE Classifier SHALL attach lower-precedence hauntings as `secondary: Haunting[]` (unscored, excluded from severity counts and score)
4. THE Classifier SHALL count only primary hauntings in `countsByType` for scoring
5. Each primary Haunting SHALL carry `secondary: Haunting[]`, the lower-precedence hauntings on the same backendDOMNodeId. ClassifiedAudit SHALL expose `detectedCountsByType: Record<HauntingType, number>`, counting primary plus secondary instances per element (deduplicated)

### Requirement 16: Cross-Check with axe-core

**User Story:** As a developer, I want to see which axe violations corroborate our hauntings, so that I can trust the results.

#### Acceptance Criteria

1. THE Classifier SHALL match hauntings to axe violations on `AxeViolationNode.backendDOMNodeId ∈ haunting.nodeIds`. Extend `AxeViolationNode` with `backendDOMNodeId: number | null`, resolved in the page via `document.querySelector(target.join(' '))` and then DOM.describeNode (runner prerequisite task). A node with a null id is matched by rule→type table only (button-name, link-name → NamelessSpirit; image-alt, svg-img-alt, role-img-alt → HollowPortrait; color-contrast → TheFog; label → WhisperingField; html-has-lang, html-lang-valid → SilentTongue; aria-hidden-focus → TheVeiled; scrollable-region-focusable, nested-interactive → none) and otherwise goes to `unmapped`. ShatteredOrder has no corroborating axe rule because best-practice tags are not run
2. THE Classifier SHALL include in `axeCrossCheck.unmapped` any axe violation that did not map to a haunting instance
3. THE Classifier SHALL include in `axeCrossCheck.hauntingToAxe` a mapping from each haunting ID to the corroborating axe rule IDs

### Requirement 17: Identify Needs-Manual-Check Nodes

**User Story:** As a developer, I want to know which elements need manual verification, so that I don't assume automated checks are complete.

#### Acceptance Criteria

1. WHEN a text node is marked `contrastUncertain: true`, THE Classifier SHALL add it to `needsManualCheck[]`
2. THE Classifier SHALL NOT create a haunting instance for uncertain-contrast nodes
3. THE Classifier SHALL include an `automatedCoverageNote` stating: "Automated checks find approximately 30–40% of WCAG issues. Manual testing is required for complete coverage."

### Requirement 18: Compute WCAG Relative Luminance and Contrast Ratio

**User Story:** As the Fog detector, I want to compute contrast ratios accurately, so that low-contrast text is correctly identified.

#### Acceptance Criteria

1. THE Contrast_Computer SHALL compute relative luminance using the WCAG 2.x formula: `L = 0.2126*R + 0.7152*G + 0.0722*B` where R, G, B are sRGB channel values divided by 255, then gamma-expanded
2. THE Contrast_Computer SHALL gamma-expand each channel using: `channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ^ 2.4`
3. THE Contrast_Computer SHALL compute contrast ratio using: `(lighter + 0.05) / (darker + 0.05)` where lighter and darker are the relative luminances of the two colours
4. FOR ALL colour pairs (c1, c2), THE Contrast_Computer SHALL satisfy `contrastRatio(c1, c2) === contrastRatio(c2, c1)` (symmetric)
5. FOR ALL colours c, THE Contrast_Computer SHALL satisfy `contrastRatio(c, c) === 1` (identical colours have ratio 1)
6. FOR ALL colour pairs, THE Contrast_Computer SHALL return a value in the range [1, 21]

### Requirement 19: Generate Explanations and Fix Suggestions

**User Story:** As a developer, I want clear explanations and fix suggestions for each haunting, so that I know how to resolve it.

#### Acceptance Criteria

1. FOR EACH haunting instance, THE Classifier SHALL generate an `explanation` field describing what is wrong
2. FOR EACH haunting instance, THE Classifier SHALL generate a `persona` field describing who is affected (one sentence)
3. FOR EACH haunting instance, THE Classifier SHALL generate a `fix` field containing plain-language instructions and a code snippet template
4. THE Classifier SHALL generate fix code snippets using the correct HTML or ARIA syntax

### Requirement 20: Validate Against Golden Test

**User Story:** As the test suite, I want the classifier to match expected hauntings exactly, so that regressions are caught immediately.

#### Acceptance Criteria

1. WHEN the classifier runs on the `RawAudit` of `apps/cursed-shop/index.html`, THE Classifier SHALL produce `detectedCountsByType` (primary ∪ secondary, deduplicated per element) equal to `count` in `expected-hauntings.json`
2. WHEN the classifier runs on the `RawAudit` of `apps/cursed-shop/product.html`, THE Classifier SHALL produce `detectedCountsByType` (primary ∪ secondary, deduplicated per element) equal to `count` in `expected-hauntings.json`
3. WHEN the classifier runs on the `RawAudit` of `apps/cursed-shop/checkout.html`, THE Classifier SHALL produce `detectedCountsByType` (primary ∪ secondary, deduplicated per element) equal to `count` in `expected-hauntings.json`
4. THE golden test SHALL assert that no element matched by a control selector appears in any detection (primary or secondary) of the guarded type(s): cookieBanner→CursedLoop; decorativeImages→HollowPortrait; accessibleCardLinks→LostSoul,NamelessSpirit; namedQuickView→NamelessSpirit; visibleFocus→InvisibleWanderer; decorativeIcons→HollowPortrait,TheVeiled; namedSocialLinks→NamelessSpirit; hasMain→ShatteredOrder(no-main); hasH1→ShatteredOrder(no-h1); hasLang→SilentTongue; decorativeAltNotHollow→HollowPortrait; namedField→WhisperingField; properLabels→WhisperingField; visibleFocusInTrap→InvisibleWanderer; mouseOnlyNativeExits→LostSoul
5. THE Classifier SHALL match node IDs (resolved from selectors via `{page}.selectors.json` sidecar files) for each haunting instance. WHILE the page that produced the RawAudit is still open, THE Fixture_Capturer SHALL resolve every selector in expected-hauntings.json (hauntings and controls) to `{selector: {self: number[], subtree: number[]}}` and write `packages/core/tests/fixtures/raw/{page}.selectors.json`. The golden test compares classifier nodeIds against these ids
6. A CursedLoop instance matches a golden selector when every id in its nodeIds is in that selector's `subtree` set from {page}.selectors.json

### Requirement 21: Enforce Purity and Isolation

**User Story:** As the test suite, I want the classifier to be pure and isolated, so that it is easy to test and reason about.

#### Acceptance Criteria

1. THE Classifier SHALL NOT perform any I/O operations
2. THE Classifier SHALL NOT import any module from `packages/core/src/runner/`
3. THE Classifier SHALL NOT access global state or non-deterministic functions (`Date.now()`, `Math.random()`)
4. THE Classifier SHALL NOT mutate its input
5. FOR ALL inputs x, THE Classifier SHALL satisfy `classify(x) === classify(x)` (deterministic)

### Requirement 22: Property Test Score Invariants

**User Story:** As the test suite, I want to verify score computation properties hold for all inputs, so that the score is trustworthy.

#### Acceptance Criteria

1. THE Score_Property_Tests SHALL generate 100+ random haunting sets using fast-check
2. FOR ALL generated inputs, THE Score_Property_Tests SHALL verify the score is deterministic
3. FOR ALL generated inputs, THE Score_Property_Tests SHALL verify the score is order-independent
4. FOR ALL generated inputs, THE Score_Property_Tests SHALL verify the score is monotonic non-decreasing
5. FOR ALL generated inputs, THE Score_Property_Tests SHALL verify the score is bounded to [0, 100]
6. FOR ALL generated inputs, THE Score_Property_Tests SHALL verify `score([]) === 0`
7. FOR ALL generated inputs, THE Score_Property_Tests SHALL verify severity-dominance

### Requirement 23: Property Test Contrast Invariants

**User Story:** As the test suite, I want to verify contrast computation properties hold for all inputs, so that contrast detection is correct.

#### Acceptance Criteria

1. THE Contrast_Property_Tests SHALL generate 100+ random colour pairs using fast-check
2. FOR ALL generated inputs, THE Contrast_Property_Tests SHALL verify contrast ratio is symmetric
3. FOR ALL generated inputs, THE Contrast_Property_Tests SHALL verify contrast ratio is bounded to [1, 21]
4. FOR ALL generated inputs, THE Contrast_Property_Tests SHALL verify identical colours have ratio 1
5. FOR ALL generated inputs, THE Contrast_Property_Tests SHALL verify luminance increases monotonically with brighter colours (relativeLuminance is non-decreasing in each channel, and contrastRatio grows with |L1-L2|)

### Requirement 24: Property Test Classification Totality

**User Story:** As the test suite, I want to verify that every axe violation is accounted for, so that no issues are silently lost.

#### Acceptance Criteria

1. THE Classification_Property_Tests SHALL generate 100+ random `RawAudit` inputs using fast-check
2. FOR ALL generated inputs, THE Classification_Property_Tests SHALL verify every axe violation maps to at most one primary haunting or appears in the unmapped list
3. FOR ALL generated inputs, THE Classification_Property_Tests SHALL verify no axe violation is lost

### Requirement 25: Property Test Speech Invariants

**User Story:** As the test suite, I want to verify speech announcement properties hold for all inputs, so that announcements are correct.

#### Acceptance Criteria

1. THE Speech_Property_Tests SHALL generate 100+ random AX nodes using fast-check
2. FOR ALL generated inputs, THE Speech_Property_Tests SHALL verify the announcement always contains the role label (unless the role is generic/none/presentation)
3. FOR ALL generated inputs, THE Speech_Property_Tests SHALL verify the name appears in the announcement iff the name is non-empty
4. FOR ALL generated inputs, THE Speech_Property_Tests SHALL verify the announcement does not contain "undefined", "null", or fabricated text

### Requirement 26: Property Test Detector Purity

**User Story:** As the test suite, I want to verify that detectors are pure, so that they are predictable and testable.

#### Acceptance Criteria

1. THE Detector_Property_Tests SHALL generate 100+ random `RawAudit` inputs using fast-check
2. FOR ALL generated inputs and all 10 detectors plus classify, THE Detector_Property_Tests SHALL verify calling the detector twice with the same input returns the same output
3. FOR ALL generated inputs, THE Detector_Property_Tests SHALL deep-freeze the input before passing it to the detector
4. FOR ALL generated inputs, THE Detector_Property_Tests SHALL verify the input is not mutated after the detector returns

### Requirement 27: Capture RawAudit Fixtures from Cursed Shop

**User Story:** As the test suite, I want captured `RawAudit` fixtures for each Cursed Shop page, so that classifier tests do not require a browser.

#### Acceptance Criteria

1. THE Fixture_Capturer SHALL run `auditUrl` on `http://localhost:<port>/index.html` and save the `RawAudit` to `packages/core/tests/fixtures/raw/index.json`
2. THE Fixture_Capturer SHALL run `auditUrl` on `http://localhost:<port>/product.html` and save the `RawAudit` to `packages/core/tests/fixtures/raw/product.json`
3. THE Fixture_Capturer SHALL run `auditUrl` on `http://localhost:<port>/checkout.html` and save the `RawAudit` to `packages/core/tests/fixtures/raw/checkout.json`
4. THE Fixture_Capturer SHALL serialize the `RawAudit` as JSON with stable key ordering (recursively sorted keys). Write with `screenshotPng: ""` (the classifier never reads it)
5. WHILE the page that produced the RawAudit is still open, THE Fixture_Capturer SHALL resolve every selector in expected-hauntings.json (hauntings and controls) to backendNodeIds and write `packages/core/tests/fixtures/raw/{page}.selectors.json` as `{"<selector>": {"self": number[], "subtree": number[]}}` (subtree = the element and all its descendants, needed for cursedLoopMatch). Use the same viewport and 1500 ms settle window. The capturer SHALL fail if `querySelectorAll('*').length !== raw.boundingBoxes.length`, or if any matched element's rect differs from `raw.boundingBoxes[i]`
6. Fixture capture depends on the runner fixes from runs 19 and 19b landing first. Note that dependency in tasks.md

### Requirement 28: Expose auditAndClassify API

**User Story:** As the web app, I want a single function that audits a URL and classifies the results, so that I can get hauntings in one call.

#### Acceptance Criteria

1. THE Classifier SHALL export `auditAndClassify(url: string, options?: AuditOptions): Promise<ClassifiedAudit>` from `packages/core/src/index.ts`
2. WHEN `auditAndClassify` is called, THE Classifier SHALL call `auditUrl` to get the `RawAudit`, then call `classify` to get the `ClassifiedAudit`
3. THE Classifier SHALL propagate all errors from `auditUrl` unchanged

### Requirement 29: Define Haunting Type with Stable IDs

**User Story:** As the web app, I want stable haunting IDs, so that I can track specific hauntings across UI updates.

#### Acceptance Criteria

1. THE Haunting type SHALL include an `id` field that is a stable hash of the haunting type, `backendDOMNodeId`, and `kind` (if present)
2. THE Haunting type SHALL include `type`, `kind` (optional), `severity`, `wcag` (primary criterion ID, level, title, URL) plus `wcagAlso: WCAGCriterion[]` for additional criteria
3. THE Haunting type SHALL include `nodeIds` (array of `backendDOMNodeId`), `box` (from `BoundingBox[]`)
4. THE Haunting type SHALL include `speech` (optional), `speechNote` (optional), `htmlSnippet` (≤ 300 chars; outerHTML of the primary element, or fallback from AX role+name)
5. THE Haunting type SHALL include `explanation`, `persona`, `fix` (plain-language and code snippet)
6. THE Haunting type SHALL include `secondary?: Haunting[]` for lower-precedence hauntings on the same element

### Requirement 30: Define ClassifiedAudit Type

**User Story:** As the web app, I want a typed ClassifiedAudit result, so that I can consume hauntings safely.

#### Acceptance Criteria

1. THE ClassifiedAudit type SHALL include `hauntings: Haunting[]` (primary hauntings only, with their `secondary` arrays)
2. THE ClassifiedAudit type SHALL include `score: number` (the Haunting Score)
3. THE ClassifiedAudit type SHALL include `countsByType: Record<HauntingType, number>` (primary hauntings only for scoring)
4. THE ClassifiedAudit type SHALL include `needsManualCheck: ManualCheckNode[]`
5. THE ClassifiedAudit type SHALL include `automatedCoverageNote: string`
6. THE ClassifiedAudit type SHALL include `axeCrossCheck: { hauntingToAxe: Record<string, string[]>; unmapped: AxeViolation[] }`
7. THE ClassifiedAudit type SHALL include the original `RawAudit` for reference
8. THE ClassifiedAudit type SHALL include `detectedCountsByType: Record<HauntingType, number>` counting primary plus secondary instances per element (deduplicated)

### Requirement 31: Enforce No Runner Imports with ESLint

**User Story:** As the build system, I want to prevent classifier modules from importing runner modules, so that the pure/impure boundary is maintained.

#### Acceptance Criteria

1. THE ESLint configuration SHALL include a `no-restricted-imports` rule forbidding any import path that resolves into `src/runner/` from `src/classifier/`
2. WHEN a classifier module attempts to import from the runner, THE ESLint check SHALL fail with a clear error message

### Requirement 32: Enforce No Runner Imports with Test

**User Story:** As the test suite, I want to verify that no classifier file imports from the runner, so that the boundary is maintained even if ESLint is misconfigured.

#### Acceptance Criteria

1. THE Boundary_Test SHALL grep all files in `packages/core/src/classifier/` for import statements
2. WHEN any import path resolves to a file in `packages/core/src/runner/`, THE Boundary_Test SHALL fail
3. THE Boundary_Test SHALL run as part of the unit test suite (Vitest)
