# Product-lead review: haunting-classifier spec (before implementation)

Date: 2026-11-24. Method: a Claude Code review workflow with 3 reviewers (steering fidelity, RawAudit feasibility, golden file and tasks), each followed by a skeptical verifier. **49 confirmed findings**; 3 rejected.

Run 12c must amend the spec (requirements, design and tasks) for every finding below **before** any classifier code is written.

## 1. [blocker] .kiro/specs/haunting-classifier/requirements.md:212 (steering-fidelity)

**Issue:** The golden counts include secondary hauntings, but the spec checks the golden file against countsByType, which counts primary hauntings only. The golden test cannot pass as written.

**Evidence:** Req 15.4: "THE Classifier SHALL count only primary hauntings in `countsByType`". Req 30.1: "`hauntings: Haunting[]` (primary hauntings only)". tasks.md 21.1: "Assert countsByType matches `apps/cursed-shop/expected-hauntings.json`". In expected-hauntings.json (countUnit "element"), index lists `header .nav-icons .icon-btn:nth-child(1)`, `(2)` and `.social-links .social-link:nth-child(1)` under both NamelessSpirit (count 9) and InvisibleWanderer (count 21). product.html has the same three elements under both NamelessSpirit (3) and InvisibleWanderer (9). index.html CSS line 693-697 gives `.icon-btn:focus,.social-link:focus{outline:none}`, so both detectors fire on these elements. With Nameless Spirit > Invisible Wanderer precedence, the primary-only InvisibleWanderer count is 18 on index and 6 on product. Separately, the design throws secondaries away: there is no `secondary` field, and ClassifiedAudit.hauntings is primary-only. Prompt 12 says secondaries are "attached as `secondary`".

**Fix:** Requirements: add 15.5 "THE Classifier SHALL attach each suppressed haunting to its primary as `secondary: Haunting[]` (unscored, excluded from severity counts and score)". Add 30.8 "`detectedCountsByType: Record<HauntingType, number>` counting primary plus secondary instances per element". Change Req 20.1-20.3 and tasks 21.1-21.3 to "Assert `detectedCountsByType` (primary ∪ secondary, deduplicated per element) equals the golden count for each type, and that the union of primary and secondary node ids per type equals the resolved golden selectors." Design: add `secondary?: Haunting[]` to the `Haunting` type.

**Verifier note:** Confirmed. On index, icon-btn 1 and 2 and social-link 1 appear under both NamelessSpirit and InvisibleWanderer (CSS lines 693-697 set `outline:none`), so a primary-only countsByType gives InvisibleWanderer 18 against the golden 21 (6 against 9 on product). The Haunting/ClassifiedAudit types also have nowhere to keep the secondaries that Req 15.3 requires; the proposed fix (`secondary`, `detectedCountsByType`, golden asserts on primary ∪ secondary) is right.

## 2. [blocker] .kiro/specs/haunting-classifier/design.md:699 (steering-fidelity)

**Issue:** Invisible Wanderer condition (a) checks the outline against the element's own background-color instead of the adjacent background. The runner already collects that adjacent background as `adjacent-background-color`. As written, a correct same-colour ring drawn outside a button is reported as invisible, which breaks golden controls. The rule is also restated differently from the steering.

**Evidence:** design.md 698-699: `const bgColor = parseColor(after["background-color"]) // adjacent background (simplification)`. hauntings.md §6 (a): "the outline colour has ≥ 3:1 contrast against the background adjacent to the element". The runner, tab-walker.ts FOCUS_STYLES_FN, returns `'adjacent-background-color': adj`, the nearest opaque ancestor background. Cursed shop index.html: `.add-to-cart-btn{background-color:var(--color-primary)}` and `.add-to-cart-btn:focus{outline:2px solid var(--color-primary)}` (#6d4c41 on #6d4c41 gives 1:1). The golden index control `visibleFocus` lists `.product-grid .product-card:nth-child(1) .add-to-cart-btn`. product.html `.btn:focus{outline:2px solid var(--color-primary)}` on `.btn{background-color:var(--color-primary)}`, and golden product `visibleFocus` lists `.btn`. Both would be reported as Invisible Wanderers.

**Fix:** Design §6 hasVisibleOutline: replace with `const bgColor = parseColor(after["adjacent-background-color"])`. Use the same adjacent background for the box-shadow check in (b). Requirement 7.2 (a): change to "outline colour has ≥ 3:1 contrast against `focusSnapshot.after['adjacent-background-color']` (the nearest opaque ancestor background), never the element's own background-color". Add unit test 11.6: "outline colour equal to the element's own background but ≥3:1 against the adjacent background is NOT flagged".

**Verifier note:** Confirmed. Design line 699 compares the outline against the element's own `background-color`, but the runner's FOCUS_STYLES_FN already returns `adjacent-background-color`. The index `.add-to-cart-btn` and product `.btn` (both golden visibleFocus controls) have a #6d4c41 outline on a #6d4c41 background (1:1), and product `.btn` has no higher-precedence haunting, so InvisibleWanderer becomes 10 against 9; apply the fix as written.

## 3. [blocker] .kiro/specs/haunting-classifier/design.md:776 (steering-fidelity)

**Issue:** Whispering Field case (b) picks the wrong winning name source. In CDP `name.sources`, the candidates that come before the winner carry no `superseded` flag and no value. `find(s => !s.superseded)` therefore returns the first candidate (aria-labelledby), never the placeholder, so placeholder-only fields are never flagged.

**Evidence:** design.md 776-777: `const winningSource = sources.find(s => !s.superseded); if (winningSource && winningSource.type === "placeholder")`. CDP marks only the sources after the winner as `superseded: true`. Earlier unused sources (aria-labelledby, aria-label, label) appear without a value and without `superseded`. Golden checkout WhisperingField=3 needs `#email` (`<input type="email" id="email" class="placeholder-only" placeholder="john@example.com">`), `#cardNumber` and `#newsletterForm input[type=email]` (placeholder only). Req 8.3 says only "use `name.sources` ... to determine the winning name source" and never defines "winning".

**Fix:** Req 8.3: "The winning source is the first entry of `name.sources` whose `value` is present and whose `value.value` is a non-empty string after trimming, and which is not `superseded`. Case (b) applies when that entry has `type === 'placeholder'` (or `attribute === 'placeholder'` / `'aria-placeholder'`)." Design line 776: `const winningSource = sources.find(s => !s.superseded && typeof s.value?.value === 'string' && s.value.value.trim() !== '')`. Add a unit test that uses a realistic CDP sources array: aria-labelledby (no value), aria-label (no value), label (no value), placeholder (value), title (superseded).

**Verifier note:** Confirmed. In Chromium's name.sources, unused sources listed before the winner (aria-labelledby, aria-label, label) have no value and no `superseded` flag, so `find(s => !s.superseded)` returns aria-labelledby and never placeholder. All 3 golden checkout Whispering Fields (#email, #cardNumber, newsletter input) are placeholder-only and would be missed; adopt the fix (first non-superseded source with a non-empty value) and the realistic-sources unit test.

## 4. [blocker] .kiro/specs/haunting-classifier/design.md:957 (steering-fidelity)

**Issue:** Veiled case (b) leaves out the steering's requirement that the node be excluded by aria-hidden or role presentation/none. It flags every visible element without a non-ignored AX node that has text or a focusable child, such as plain spans that Chromium marks ignored. The exclusion branch inside it can never run.

**Evidence:** design.md 957: `if (!mapping.hasAxNode && (mapping.hasVisibleText || mapping.containsFocusable)) {`. Then 959: `if (mapping.isPresentational && !mapping.hasVisibleText && !mapping.containsFocusable) continue` is always false inside that branch. hauntings.md §10 (b): "...but is excluded from the accessibility tree via `aria-hidden=\"true\"` or `role=\"presentation\"`/`\"none\"`, AND the hidden subtree contains visible non-whitespace text or a focusable element". collectors.ts buildDomAxMapping emits a row for every visible `body *` element, with `hasAxNode: visibleAx.has(id)` (non-ignored only). Req 11.2/11.3 make the same omission: "visually present but excluded from the accessibility tree".

**Fix:** Req 11.2/11.3: "WHEN a DOM node is visually present AND (`ariaHidden` is true OR `isPresentational` is true) AND it has no non-ignored AX node AND (`hasVisibleText` OR `containsFocusable` OR `isFocusable`) ...". Design line 957: `if ((mapping.ariaHidden || mapping.isPresentational) && !mapping.hasAxNode && (mapping.hasVisibleText || mapping.containsFocusable || mapping.isFocusable))`. Delete the dead decorative-skip block.

**Verifier note:** Confirmed. Design line 957 flags any visible mapping row without a non-ignored AX node that has text or a focusable child; Chromium marks plain spans/divs (and often body) ignored, so this floods results, and the presentational skip at line 959 can never run. Case (b) must require `ariaHidden || isPresentational`, as steering §10(b) says; the fix is right.

## 5. [blocker] .kiro/specs/haunting-classifier/design.md:940 (steering-fidelity)

**Issue:** The Veiled detector reports every element of a hidden subtree (the root, each text element and each focusable descendant) instead of one haunting per hidden subtree. This conflicts with Req 11.1 ("for that subtree") and with the golden counts.

**Evidence:** In collectors.ts, `ariaHidden` is inherited: `for (cur = el; cur; cur = cur.parentElement) if (cur.getAttribute('aria-hidden') === 'true') ariaHidden = true`. The design flags case (a) on every `ariaHidden && isFocusable` row (line 940) and case (b) on every row with text. index.html `<div class="promo-strip" aria-hidden="true"><p>Autumn sale...</p><a href="#products" class="promo-strip-link">` gives 3 hauntings (div, p, a) against golden TheVeiled count 1 (`.promo-strip`). checkout `.promo-banner` (span and a children) plus `.badge-free` gives 4 against golden 2.

**Fix:** Req 11: add "11.7 THE Veiled_Detector SHALL report one haunting per hidden subtree root: the outermost element carrying `aria-hidden=\"true\"` (AX node whose `ignoredReasons` contains `ariaHiddenElement`, or the mapping row with `ariaHidden` whose parent element is not `ariaHidden`), or the element with role presentation/none itself. Descendants are folded into `nodeIds` of that one haunting, never reported separately. Cases (a) and (b) on the same root produce one haunting." Update the design algorithm to match.

**Verifier note:** Confirmed and separate from finding 4. `ariaHidden` is inherited in collectors.ts, so index `.promo-strip` gives 3 hauntings (div, p, and the a via case a) against golden 1, and checkout gives 4 (`.promo-banner` div/span/a plus `.badge-free`) against golden 2. Collapse each hidden subtree to its outermost aria-hidden or presentational root, as the fix proposes.

## 6. [blocker] .kiro/specs/haunting-classifier/design.md:261 (steering-fidelity)

**Issue:** Precedence keys a group on `nodeIds[0]` only, and Cursed Loop's nodeIds are the cycle members. On checkout, the trapped newsletter input is a cycle member and also a golden Whispering Field. Either it is wrongly made secondary (WhisperingField 2 vs golden 3), or, if nodeIds[0] happens to be another member, the input ends up with two primaries, which breaks Property 17.

**Evidence:** design.md 261: "Group all hauntings by their primary `backendDOMNodeId` (the first element in `nodeIds`)". design.md 627: `nodeIds: cycle.nodeIds.map(...)`. checkout.html: `<form class="modal-form" id="newsletterForm"><input type="email" placeholder="Your email address" required>` inside the trapped `.modal-content`. Golden WhisperingField includes `#newsletterForm input[type=email]` (count 3). The golden `$meta.cursedLoopMatch` matches CursedLoop by "recorded trap-region node (the focus-cycle members' dialog or common-ancestor element)". The runner sets `trapRegionNodeIds = [region, ...cycleIds]`.

**Fix:** Design §Precedence: "The precedence key of a haunting is a single backendDOMNodeId. For Cursed Loop it is the trap region node (`tabWalkResult.trapRegionNodeIds[0]`, the dialog/common ancestor). Cycle members go in `nodeIds` after it but do not take part in precedence. For all other types it is `nodeIds[0]`." Design §5: `nodeIds: raw.tabWalkResult.trapRegionNodeIds.map(Number)` and `id: generateId('CursedLoop', regionId)`. Req 15.1: "each precedence key has at most one primary haunting". Property 17 should be restated the same way.

**Verifier note:** Confirmed. The design sets CursedLoop nodeIds to the cycle members and groups precedence on nodeIds[0]. The checkout trap cycle contains the newsletter input (focused first at checkout.html:991), which is a golden Whispering Field, so it is either demoted to secondary or ends up with two primaries. Key CursedLoop on `tabWalkResult.trapRegionNodeIds[0]` (the runner puts the region first), as the fix says.

## 7. [blocker] .kiro/specs/haunting-classifier/design.md:883 (steering-fidelity)

**Issue:** Page-level and heading-skip hauntings get `nodeIds: []`, but Req 20.5 and the golden file need node ids resolved from selectors: Silent Tongue `html`, no-main `body`, heading-skip on the skipping heading. The heading-skip id also uses the heading's list index instead of a backendDOMNodeId, which conflicts with prompt 12. HeadingRecord has no backendDOMNodeId to use.

**Evidence:** design.md 887-892: `id: generateId("ShatteredOrder", i, "heading-skip"), ... nodeIds: [], box: null`. design.md 266: page-level hauntings "have `nodeIds: []`". Golden product ShatteredOrder selector `.product-info h4.details-heading`. Golden checkout: `.footer-content > .footer-col:nth-child(1) h4` and `body` (kinds heading-skip, no-main). SilentTongue selector `html`. Req 20.5: "match node IDs (resolved from selectors) for each haunting instance". Prompt 12: "`id` (stable hash of type + `backendDOMNodeId` + `kind`)". types.ts `HeadingRecord = { tagName; accessibleName; domOrderIndex }` has no node id (collectors.ts computes `headingIds` but drops them).

**Fix:** Req 10.2: "heading-skip SHALL set `nodeIds: [backendDOMNodeId of the heading whose level jumps]`, and `id` = hash(type, that id, kind)". This needs `HeadingRecord.backendDOMNodeId: number`; add it as a runner prerequisite task before task 9.5. Req 10.3: no-main uses the `body` node id (the domAxMapping row with tagName 'body'). Req 9: Silent Tongue uses the `<html>` node id, or Req 20.5 states that `html`/`body` selectors for page-level kinds are matched by kind, not by node id. Add ShatteredOrder heading-skip to the precedence section as "never collides; always primary".

**Verifier note:** Confirmed. Req 20.5 and prompt 12 need selector-resolved node ids (`html`, `body`, the skipping h4), but page-level and heading-skip hauntings get `nodeIds: []`, the heading-skip id hashes a list index, and HeadingRecord drops the `headingIds` that collectors.ts computes. Correction: domAxMapping covers only `body, body *`, so `html` has no node id in RawAudit; take the 'matched by kind' option for SilentTongue, use the body row for no-main, and add the runner prerequisite for HeadingRecord.backendDOMNodeId.

## 8. [blocker] .kiro/specs/haunting-classifier/requirements.md:212 (rawaudit-feasibility)

**Issue:** Counting only primary hauntings in countsByType makes the golden test impossible to pass. The golden file counts every detector hit per type, so it includes elements that precedence would demote to secondary.

**Evidence:** Req 15.4: "THE Classifier SHALL count only primary hauntings in `countsByType` and in the Haunting Score computation"; design.md:127 `countsByType: Record<HauntingType, number> // counts primary hauntings only`. expected-hauntings.json index.html lists `header .nav-icons .icon-btn:nth-child(1)`, `(2)` and `.social-links .social-link:nth-child(1)` under NamelessSpirit (count 9) and again under InvisibleWanderer (count 21). product.html does the same (NS 3, IW 9). With NamelessSpirit > Invisible Wanderer precedence, primary-only counts would give IW 18 on index and 6 on product. Design.md also never says where secondaries are kept: `hauntings: Haunting[] // primary hauntings only` and there is no secondary field, but the brief says "Others are attached as `secondary`".

**Fix:** Replace Req 15.4 with: "THE Classifier SHALL compute the Haunting Score from primary hauntings only. `countsByType` SHALL count every detected instance (primary and secondary) per type, so each type's count equals the golden per-type count." Add Req 30.1a: "Each primary Haunting SHALL carry `secondary: Haunting[]`, the lower-precedence hauntings on the same backendDOMNodeId." In design.md:127 change the comment to `// all instances per type (primary + secondary); score uses primary only`, and add `secondary: Haunting[]` to the Haunting type.

**Verifier note:** Confirmed: the golden file lists icon-btn 1 and 2 and social-link 1 under both NamelessSpirit and InvisibleWanderer, so primary-only countsByType gives IW 18/6 instead of 21/9; also ClassifiedAudit.hauntings is 'primary only' even though precedence step 4 returns primary plus secondary, so secondaries are lost. Apply the fix, but the simplest structural change is to keep every haunting in `hauntings` with the existing `isPrimary` flag (or add a top-level `secondary: Haunting[]`) rather than nesting per-haunting arrays.

## 9. [blocker] .kiro/specs/haunting-classifier/design.md:1041 (rawaudit-feasibility)

**Issue:** The spec never says how golden CSS selectors become backendDOMNodeIds in a browser-free test. RawAudit holds no selectors, classes or attributes, and backendDOMNodeIds are only valid inside one page session. auditUrl closes its context before returning, so the capture script cannot resolve selectors afterwards. The golden test is also placed under Playwright, against the brief's "classifier tests need no browser".

**Evidence:** design.md:1041 "4. Assert node IDs (resolved from selectors) match"; tasks.md 21.1 "Assert node IDs (resolved from selectors) match"; Req 20.5 "match node IDs (resolved from selectors)". types.ts: `BoundingBox = { backendDOMNodeId, x, y, width, height }` and no other per-node identity. audit.ts:149 `await context.close()` runs inside auditUrl. design.md:1044 `packages/core/tests/classify.int.spec.ts`, run with `npm run test:integration` (Playwright). Useful fact: browser.ts:334-354 builds `boundingBoxes` in `document.querySelectorAll('*')` order and throws if the CDP pre-order count differs, so `boundingBoxes[i]` is the i-th element in document order.

**Fix:** Add to Req 27: "27.5 For each page, THE Fixture_Capturer SHALL also write `packages/core/tests/fixtures/raw/{page}.selectors.json` mapping every selector in expected-hauntings.json (hauntings and controls) to `{ ids: number[], descendantIds: number[] }`. To compute it, load the same URL at the same viewport after the 1500 ms settle window and take `i = Array.from(document.querySelectorAll('*')).indexOf(el)`. Then `id = raw.boundingBoxes[i].backendDOMNodeId`, and `descendantIds` are the ids of `el.querySelectorAll('*')` mapped the same way. The capturer SHALL fail if `querySelectorAll('*').length !== raw.boundingBoxes.length`, or if any matched element's rect differs from `raw.boundingBoxes[i]`." Change design.md Golden test to load `{page}.selectors.json`, never use a browser, and live at `packages/core/src/classifier/golden.test.ts` (Vitest). Move task 21 to Vitest and extend task 1 with 27.5.

**Verifier note:** Confirmed: RawAudit carries no selectors or attributes, and backendDOMNodeIds from a fresh page load differ from the fixture's, so nothing can resolve golden selectors to fixture ids (spec says only 'resolved from selectors'); the selectors.json capture with a document-order plus rect cross-check against boundingBoxes is a workable fix, and the golden test should then be a browser-free Vitest test as the brief requires.

## 10. [blocker] .kiro/specs/haunting-classifier/requirements.md:267 (rawaudit-feasibility)

**Issue:** Req 20.4 cannot be satisfied. Several golden `controls` selectors are also expected hauntings of another type, so each control only means "not flagged as one specific type".

**Evidence:** Req 20.4: "THE Classifier SHALL NOT flag any element listed in the `controls` section". Conflicts in the golden file: index `visibleFocus` includes `.product-grid .product-card:nth-child(1) .add-to-cart-btn`, which is also a NamelessSpirit. index `namedSocialLinks` `.social-links .social-link:nth-child(2)` is also an InvisibleWanderer. product `decorativeAltNotHollow` `.product-thumb:nth-child(1..3)` are also LostSoul hauntings. checkout `visibleFocusInTrap` `.modal-form input` is the WhisperingField `#newsletterForm input[type=email]`.

**Fix:** Replace Req 20.4 with: "THE golden test SHALL assert that no element matched by a control group has a haunting (primary or secondary) of that group's excluded types: cookieBanner→CursedLoop; decorativeImages→HollowPortrait; accessibleCardLinks→LostSoul, InvisibleWanderer; namedQuickView→NamelessSpirit, LostSoul; visibleFocus→InvisibleWanderer; decorativeIcons→HollowPortrait, TheVeiled; namedSocialLinks→NamelessSpirit; hasMain→ShatteredOrder(no-main); hasH1→ShatteredOrder(no-h1); hasLang→SilentTongue; decorativeAltNotHollow→HollowPortrait; namedField→WhisperingField; properLabels→WhisperingField; visibleFocusInTrap→InvisibleWanderer; mouseOnlyNativeExits→LostSoul."

**Verifier note:** Confirmed: `.modal-form input` is the same element as `#newsletterForm input[type=email]` (form.modal-form#newsletterForm), card-1 add-to-cart-btn is both a NamelessSpirit and a visibleFocus control, social-link 2 is both IW and namedSocialLinks, and the product thumbs are both LostSoul and decorativeAltNotHollow, so Req 20.4 as written cannot pass; the per-group excluded-type table fix is correct.

## 11. [blocker] .kiro/specs/haunting-classifier/design.md:776 (rawaudit-feasibility)

**Issue:** The Whispering Field placeholder check picks the wrong name source. CDP `name.sources` lists every candidate in priority order, and sources that do not apply have no `value` and no `superseded` flag. `find(s => !s.superseded)` therefore returns the first candidate (aria-labelledby), not the winner, so placeholder-only fields are never flagged.

**Evidence:** design.md:775-777 `const sources = node.name.sources || []; const winningSource = sources.find(s => !s.superseded); if (winningSource && winningSource.type === "placeholder")`. types.ts AXValueSource: `{ type; value?: AXValue; attribute?; superseded?; invalid? ... }`, and ax-tree.ts keeps sources verbatim. Golden checkout expects WhisperingField count 3 (`#email`, `#cardNumber`, `#newsletterForm input[type=email]`), all named only by placeholder. The current logic yields 0.

**Fix:** Replace the case (b) block in design.md and Req 8.3 with: "The winning source is the first entry in `name.sources` that has `value` with a non-empty trimmed string `value.value`, `superseded !== true` and `invalid !== true`. Case (b) applies when that source has `type === 'placeholder'` (covers both `placeholder` and `aria-placeholder`)." Code: `const win = (node.name.sources ?? []).find(s => !s.superseded && !s.invalid && typeof s.value?.value === 'string' && s.value.value.trim() !== ''); if (win?.type === 'placeholder') ...`. Add a unit test in task 9.4 with a realistic CDP sources array (aria-labelledby, aria-label and label entries with no value, then placeholder with a value).

**Verifier note:** Confirmed: CDP lists non-applying candidates (aria-labelledby, aria-label, label) first with no value and no superseded flag, so `sources.find(s => !s.superseded)` returns aria-labelledby and #email, #cardNumber and the newsletter input (placeholder-only) are never flagged; the fix (first non-superseded, non-invalid source that has a non-empty value) is correct.

## 12. [blocker] .kiro/specs/haunting-classifier/design.md:957 (rawaudit-feasibility)

**Issue:** The Veiled case (b) does not require the node to be hidden by aria-hidden or role=presentation/none. It also reports every node inside an aria-hidden subtree, not just the hidden root. `DomAxMapping.ariaHidden` is inherited (true for every descendant), and RawAudit has no parent link, so a descendant cannot be told apart from the root. Golden counts are exceeded.

**Evidence:** design.md:940 `if (mapping.ariaHidden && mapping.isFocusable)` and design.md:957 `if (!mapping.hasAxNode && (mapping.hasVisibleText || mapping.containsFocusable))`. collectors.ts:316-321 sets ariaHidden when any ancestor has aria-hidden="true". collectors.ts:283 `hasAxNode` is false for every node that Chromium ignores for any reason. Steering §10(b) requires exclusion "via `aria-hidden="true"` or `role="presentation"`/`"none"`". index.html:803-806 `<div class="promo-strip" aria-hidden="true"><p>…</p><a … class="promo-strip-link">`: the design flags the div, the p and the a, giving 3 where the golden expects 1 (`.promo-strip`). checkout.html:893-896 promo-banner/span/a plus `.badge-free` give 4 where the golden expects 2.

**Fix:** Rewrite Req 11 and the design algorithm: "A Veiled candidate is a domAxMapping row that is the ROOT of the exclusion: either the aria-hidden root (its AXNode has an `ignoredReasons` entry named `ariaHiddenElement`, not `ariaHiddenSubtree`), or `isPresentational === true`. Rows with `ariaHidden === false && isPresentational === false` are never Veiled. Report a candidate only if `hasVisibleText || containsFocusable || isFocusable`. Descendants of a reported root, including focusable descendants (case a), SHALL NOT produce their own Veiled haunting and SHALL be appended to the root haunting's `nodeIds`." Because ignoredReasons depends on Chromium, also add a runner task before task 1: extend `DomAxMapping` with `ariaHiddenRoot: boolean` (the element's own `aria-hidden="true"`) and `parentBackendDOMNodeId: number | null`. The detector uses these when present.

**Verifier note:** Confirmed: collectors.ts sets ariaHidden for every descendant, and case (b) only tests !hasAxNode, so promo-strip div + p + a (case a) give 3 vs golden 1, and checkout promo-banner/span/a + badge-free give 4 vs 2; it also flags any node Chromium ignores for unrelated reasons; restrict to exclusion roots and fold descendants into the root as proposed (ignoredReasons ariaHiddenElement vs ariaHiddenSubtree is usable today; the runner fields are a fallback).

## 13. [blocker] .kiro/specs/haunting-classifier/requirements.md:212 (golden-and-tasks)

**Issue:** The golden test cannot pass on index or product. The golden counts every detection of each type and ignores precedence, but the spec counts only primary hauntings in countsByType and asserts on countsByType. The same elements are both NamelessSpirit and InvisibleWanderer in the golden file, so precedence demotes the InvisibleWanderer copy to secondary and drops it from the count. ClassifiedAudit also has no field that holds the secondaries.

**Evidence:** Req 15.4: "THE Classifier SHALL count only primary hauntings in `countsByType`". Design line 125: `hauntings: Haunting[] // primary hauntings only`. Tasks 21.1-21.3: "Assert countsByType matches ... expected-hauntings.json". In expected-hauntings.json index.html, NamelessSpirit lists "header .nav-icons .icon-btn:nth-child(1)", "...(2)" and ".social-links .social-link:nth-child(1)", and InvisibleWanderer (count 21) lists the same 3 elements (".nav-icons .icon-btn:nth-child(1)", "(2)", ".social-links .social-link:nth-child(1)"). product.html has the same overlap (InvisibleWanderer count 9). With NamelessSpirit > InvisibleWanderer precedence, the classifier produces index InvisibleWanderer 18 (golden 21) and product 6 (golden 9). verify.mjs, which produced the golden counts, uses `countsOf(H)` = raw per-type lengths with no precedence.

**Fix:** Add Req 15.5: "Each primary Haunting SHALL carry `secondary: UnclassifiedHaunting[]` holding the lower-precedence detections on the same element, and ClassifiedAudit SHALL expose `detectedCountsByType: Record<HauntingType, number>`, the count of primary plus secondary detections per type." Change Req 20.1-20.3 to "... SHALL produce `detectedCountsByType` (primary + secondary) equal to `count` in expected-hauntings.json", and keep `countsByType` (primary only) for the score and UI. Change tasks 21.1-21.3 to match.

**Verifier note:** Confirmed. Req 15.4 and design line 125 count only primary hauntings, but verify.mjs countsOf() counts raw per-type detections, and index/product list icon-btn 1-2 and social-link 1 under both NamelessSpirit and InvisibleWanderer. Primary-only counting gives index 18 and product 6 instead of 21 and 9. The proposed fix is right: keep `secondary` plus `detectedCountsByType` for the golden test and use `countsByType` for score and UI.

## 14. [blocker] .kiro/specs/haunting-classifier/requirements.md:267 (golden-and-tasks)

**Issue:** Req 20.4 says no control element may be flagged at all. The golden file itself lists control elements as hauntings of other types, so the requirement cannot be met. Controls only guard against the haunting type they demonstrate.

**Evidence:** Req 20.4: "THE Classifier SHALL NOT flag any element listed in the `controls` section". In expected-hauntings.json, index controls.visibleFocus includes ".product-grid .product-card:nth-child(1) .add-to-cart-btn", which is also NamelessSpirit selector #3. controls.namedSocialLinks ".social-links .social-link:nth-child(2)/(3)" are also InvisibleWanderer selectors. verify.mjs line 320 says "controls must NOT be flagged as the specific haunting they guard against" and uses a CONTROL_GUARD map.

**Fix:** Replace Req 20.4 with: "THE golden test SHALL assert that no element matched by a control selector appears in any detection (primary or secondary) of the guarded type(s): cookieBanner→CursedLoop; decorativeImages→HollowPortrait; accessibleCardLinks→LostSoul,NamelessSpirit; namedQuickView→NamelessSpirit; visibleFocus→InvisibleWanderer; decorativeIcons→HollowPortrait,TheVeiled; namedSocialLinks→NamelessSpirit; hasMain→ShatteredOrder(no-main); hasH1→ShatteredOrder(no-h1); hasLang→SilentTongue; decorativeAltNotHollow→HollowPortrait; namedField→WhisperingField; properLabels→WhisperingField; visibleFocusInTrap→InvisibleWanderer; mouseOnlyNativeExits→LostSoul." This mirrors verify.mjs CONTROL_GUARD. Add the table to the design's golden-test section and to tasks 21.x.

**Verifier note:** Confirmed. index visibleFocus includes card-1 .add-to-cart-btn (also NamelessSpirit #3), namedSocialLinks are InvisibleWanderer selectors, and checkout visibleFocusInTrap '.modal-form input' is the WhisperingField newsletter input, so Req 20.4 as written cannot pass. Replace it with the per-type CONTROL_GUARD table copied verbatim from verify.mjs lines 323-339.

## 15. [blocker] .kiro/specs/haunting-classifier/requirements.md:268 (golden-and-tasks)

**Issue:** The fixture plan cannot resolve golden selectors to node ids. Chromium allocates backendNodeIds per renderer, so they differ between runs, and auditUrl closes its page before returning. A RawAudit fixture holds no selectors and no DOM, so a browser-less test has nothing to resolve ".product-card:nth-child(1) .card-link" against.

**Evidence:** Req 20.5: "match node IDs (resolved from selectors)". Design lines 1062-1077: the capture script only calls `auditUrl(...)` and writes JSON. In packages/core/tests/determinism.int.spec.ts the normalise() comment reads "Chromium-allocated ids (DOM backendNodeIds and AX nodeIds), which differ per renderer". In src/audit.ts, runAudit closes the context in `finally { await context.close() }` before returning RawAudit.

**Fix:** Add Req 27.5: "WHILE the page that produced the RawAudit is still open, THE Fixture_Capturer SHALL resolve every selector in expected-hauntings.json (hauntings and controls) to backendNodeIds with CDP DOM.getDocument({depth:-1}) + DOM.querySelectorAll + DOM.describeNode. It SHALL write packages/core/tests/fixtures/raw/{page}.selectors.json as {"<selector>": {"self": number[], "subtree": number[]}} (subtree = the element and all its descendants, needed for cursedLoopMatch)." Add a task 1.1 before capture: extract the body of runAudit in src/audit.ts into an exported `collectRawAudit(page, url, policy, options, tracker): Promise<RawAudit>`, called by auditUrl unchanged, so the capturer (tests/ may import runner) can drive PageLoader, collect, resolve selectors, and only then close the context. The golden test SHALL compare classifier nodeIds against these ids.

**Verifier note:** Confirmed. RawAudit has no selectors or DOM, determinism.int.spec.ts says backendNodeIds differ per renderer, and runAudit closes the context in finally before returning, so 'resolved from selectors' has no mechanism. The fix is right: resolve selectors to ids (self and subtree) while the page is still open, via an extracted collectRawAudit(page, ...), and write {page}.selectors.json next to each fixture.

## 16. [blocker] .kiro/specs/haunting-classifier/design.md:698 (golden-and-tasks)

**Issue:** The Invisible Wanderer outline check compares the outline colour with the element's own background. The steering and the runner both use the adjacent background. Wherever a control's outline colour equals its fill, the check reports an invisible indicator, which flags golden visibleFocus controls and inflates the counts. hasVisibleBoxShadow is a stub that always returns false. The step loop also neither dedupes repeated steps nor skips cdpError steps.

**Evidence:** design.md lines 698-703: `const bgColor = parseColor(after["background-color"]) // adjacent background (simplification)` and `return contrast >= 3.0`. Line 710: `return false // placeholder`. Line 660: `for (const step of raw.tabWalkResult.steps)` with no dedupe or cdpError check. The runner already provides the adjacent background: tab-walker.ts FOCUS_STYLES_FN returns `'adjacent-background-color': adj`. In index.html, `.add-to-cart-btn{background-color:var(--color-primary)}` and `.add-to-cart-btn:focus{outline:2px solid var(--color-primary)}` give a 1:1 ratio for 6 buttons, including the control `.product-card:nth-child(1) .add-to-cart-btn`. `.cookie-banner .btn{background-color:#fff}` with `outline:2px solid #FFF3E0` gives about 1.1:1. product.html `.btn{background-color:var(--color-primary)}` with `.btn:focus{outline:2px solid var(--color-primary)}` hits control `.btn`. Result: index InvisibleWanderer 28 (golden 21), product 10 (golden 9). Steps repeat after an escapable cycle: runWalk sets `segment = [out]` and continues, so the return target is visited twice.

**Fix:** Replace Req 7.2(a) and (b) with: "contrast is measured between the indicator colour, alpha-blended over `after['adjacent-background-color']`, and `after['adjacent-background-color']`. For (b), parse every rgb()/rgba() colour in `after['box-shadow']` when it differs from `before['box-shadow']` and is not 'none', and take the best ratio. For (c), blend before and after over the adjacent background." Add Req 7.6: "THE detector SHALL evaluate each backendDOMNodeId once (first non-cdpError step) and SHALL skip steps with `cdpError: true`." Delete the 'simplification' line and the placeholder stub from the design, and use verify.mjs judgeIndicator as the reference algorithm.

**Verifier note:** Confirmed. Design line 699 compares the outline with the element's own background-color, although the steering says 'adjacent background' and tab-walker FOCUS_STYLES_FN already emits 'adjacent-background-color'. The .add-to-cart-btn, product .btn and cookie .btn outlines match their own fill, hasVisibleBoxShadow is a stub returning false, and runWalk pushes the repeated node as a step, so steps must be deduped and cdpError steps skipped. Use verify.mjs judgeIndicator (blend over adjBg) as the reference.

## 17. [blocker] .kiro/specs/haunting-classifier/design.md:776 (golden-and-tasks)

**Issue:** The Whispering Field winning-source logic returns the first source not marked superseded. In CDP name.sources, candidate sources that have no value (aria-labelledby, aria-label, label) are not marked superseded and come before placeholder. The lookup therefore never reaches the placeholder source, and placeholder-only fields are never flagged.

**Evidence:** design.md lines 776-777: `const winningSource = sources.find(s => !s.superseded)` and `if (winningSource && winningSource.type === "placeholder")`. The checkout golden expects WhisperingField 3 ("#email", "#cardNumber", "#newsletterForm input[type=email]"). All three are placeholder-only (checkout.html line 816: `<input type="email" id="email" ... placeholder="john@example.com">`, no label), so the design yields 0. verify.mjs line 180 uses `srcs.find((s) => !s.superseded && s.value && String(s.value.value || '').trim() !== '')` and checks `winning.attribute || winning.nativeSource || winning.type` === 'placeholder'.

**Fix:** Change Req 8.3 to: "The winning name source is the first entry of `name.sources` with `superseded !== true` AND a non-empty `value.value`. It is a placeholder source when `attribute === 'placeholder'` or `attribute === 'aria-placeholder'` or `type === 'placeholder'`." Update the design code to match.

**Verifier note:** Confirmed. sources.find(s => !s.superseded) stops at the empty aria-labelledby/aria-label/label candidates, and CDP reports a placeholder as type 'attribute' with attribute 'placeholder', not type 'placeholder', so the condition fails twice. Checkout then yields 0 WhisperingField against golden 3. Adopt the verify.mjs line 180-181 rule exactly as the finding proposes.

## 18. [blocker] .kiro/specs/haunting-classifier/design.md:940 (golden-and-tasks)

**Issue:** The Veiled reports every element inside a hidden subtree instead of the subtree's root. Case (b) also leaves out the steering condition 'excluded via aria-hidden or role=presentation/none', so any visible element that Chromium leaves out of the AX tree for another reason (ignoredReasons such as "uninteresting" or an active modal) gets flagged. On the golden pages this over-counts by 2 on each page.

**Evidence:** design.md line 940: `if (mapping.ariaHidden && mapping.isFocusable)`. Line 957: `if (!mapping.hasAxNode && (mapping.hasVisibleText || mapping.containsFocusable))`. collectors.ts buildDomAxMapping emits a row for every visible element in `body, body *`, and `ariaHidden` is inherited (`for (let cur = el; cur; cur = cur.parentElement) if (cur.getAttribute('aria-hidden') === 'true')`). index.html line 803: `<div class="promo-strip" aria-hidden="true"><p>...</p><a href="#products" class="promo-strip-link">`. The design flags .promo-strip, its p, and .promo-strip-link: 3 against golden 1 (".promo-strip"). checkout .promo-banner (span + a.promo-link) plus .badge-free gives 4 against golden 2. verify.mjs line 200 collapses to roots: `.filter((e) => !e.parentElement.closest('[aria-hidden=true],[role=presentation],[role=none]'))`.

**Fix:** Replace Req 11.1-11.3 with: "THE Veiled_Detector SHALL report one instance per hidden root: a domAxMapping row with (ariaHidden || isPresentational) whose AX node's ignoredReasons contains 'ariaHiddenElement' or 'presentationalRole' (not 'ariaHiddenSubtree'). It qualifies when it is visible and (hasVisibleText || containsFocusable || isFocusable). Its nodeIds SHALL be [root, ...focusable descendants]." Add: "Rows without (ariaHidden || isPresentational) SHALL never produce a Veiled instance." If ignoredReasons cannot identify the root, require the runner to add `isHiddenRoot: boolean` to DomAxMapping, as a prerequisite task coordinated with the runner work.

**Verifier note:** Confirmed. collectors.ts emits a row for every visible body element, sets ariaHidden by walking up ancestors, and sets hasAxNode only for non-ignored nodes. The design therefore flags .promo-strip, its <p> and .promo-strip-link (3 against golden 1). Case (b) is also not limited to aria-hidden/presentational rows as the steering requires. The fix is right: report one instance per hidden root (verify.mjs line 200), and if ignoredReasons cannot identify the root, add an isHiddenRoot flag to the runner.

## 19. [blocker] .kiro/specs/haunting-classifier/design.md:886 (golden-and-tasks)

**Issue:** The golden file gives Shattered Order heading-skip and no-main instances, and Silent Tongue, a concrete element (the later heading, body, html). The design emits `nodeIds: []` for all of them, and HeadingRecord has no backendDOMNodeId, so the classifier cannot name the heading at all. The design also contradicts itself on which kinds are page-level.

**Evidence:** design.md lines 887-892: heading-skip pushes `nodeIds: [], box: null`. Line 266 says only "Silent Tongue, Shattered Order with kind: \"no-h1\" or \"no-main\"" are page-level. types.ts HeadingRecord = `{ tagName; accessibleName; domOrderIndex }` (no node id). Golden: product ShatteredOrder selector ".product-info h4.details-heading"; checkout ".footer-content > .footer-col:nth-child(1) h4" plus "body" with kinds ["heading-skip","no-main"]; SilentTongue "html". verify.mjs line 194 records `vid: heads[i].vid` (the later heading) for heading-skip.

**Fix:** Add Req 10.6: "A heading-skip instance SHALL have nodeIds = [backendDOMNodeId of the later heading (heads[i])]. no-h1, no-main and SilentTongue are page-level (nodeIds: []). The golden test SHALL match page-level instances by type + kind + count only, and SHALL assert the ShatteredOrder kinds multiset equals `kinds` when present." Add a prerequisite task (coordinate with the runner work, since types.ts is shared): add `backendDOMNodeId: number` to HeadingRecord, filled in collectPageMetadata from the headingIds array it already computes.

**Verifier note:** Confirmed. heading-skip pushes nodeIds: [], design line 266 calls only no-h1/no-main page-level, and HeadingRecord has no node id even though collectPageMetadata already computes headingIds (collectors.ts line 230). The golden file expects the later heading's element, as verify.mjs line 194 does. The fix is right (add backendDOMNodeId to HeadingRecord, match page-level kinds by type + kind + count, and assert the kinds multiset).

## 20. [blocker] .kiro/specs/haunting-classifier/tasks.md:527 (golden-and-tasks)

**Issue:** Tasks.md marks the golden tests, every fast-check property test and the boundary test optional (*), and its notes say they can be skipped. The steering, the brief and the requirements make all of them mandatory. If Kiro skips optional tasks, it ships the classifier with no property or golden tests at all.

**Evidence:** tasks.md line 583: "Tasks marked with `*` are optional property and unit tests that can be skipped for faster MVP". Starred tasks: 21.1/21.2/21.3 (golden), 3.2-3.4, 5.3-5.6, 14.2, 15.2-15.7, 17.2, 18.3-18.5 (properties), 19.2 (boundary). hauntings.md: "Invariants (enforced by property-based tests)" and speech.ts "is pure and must be property-tested". tech.md: "Do not ship a classifier function without its fast-check suite." Req 32.3: boundary test "SHALL run as part of the unit test suite".

**Fix:** Remove `*` from 3.2-3.4, 5.3-5.6, 14.2, 15.2-15.7, 17.2, 18.3-18.5, 19.2 and 21.1-21.3. Replace the Notes bullet with: "Property-based tests, the boundary test and the golden tests are mandatory (hauntings.md, tech.md). Only example-based unit tests marked * are optional."

**Verifier note:** Confirmed. tasks.md line 583 makes every * task skippable, including golden tests 21.1-21.3 and all fast-check property tasks, while tech.md line 49 says 'Do not ship a classifier function without its fast-check suite' and the brief makes the golden test a must-have. Apply the fix as proposed.

## 21. [major] .kiro/specs/haunting-classifier/design.md:706 (steering-fidelity)

**Issue:** Invisible Wanderer has three more gaps. Condition (b) is a stub that always returns false. Steps with `cdpError: true` (empty `after`) are flagged. A node visited more than once in the Tab walk (an escapable cycle) is reported once per step instead of once per element.

**Evidence:** design.md 706-711: `function hasVisibleBoxShadow(...) { ... return false // placeholder }`. hauntings.md §6 (b): "`box-shadow` changed to a non-transparent shadow with ≥ 3:1 contrast against the adjacent background". In the design loop (660-685), every `step` of `raw.tabWalkResult.steps` pushes a haunting, with no `cdpError` check and no dedupe. tab-walker.ts pushes `{ before: baseline.get(id) ?? {}, after, cdpError }` with `after = {}` on failure. An escapable cycle (index cookie banner, a golden control) repeats node ids in `steps`. The golden countUnit is "element".

**Fix:** Design §6: specify hasVisibleBoxShadow as "box-shadow differs between before and after, the after value is not `none`, and at least one parsed shadow colour has alpha > 0 and contrastRatio(shadowColour, adjacent-background-color) ≥ 3". Add to Req 7: "7.6 Steps with `cdpError: true` SHALL NOT produce a haunting; they go to `needsManualCheck` with reason `focus-style-unreadable`. 7.7 At most one Invisible Wanderer per backendDOMNodeId, even if the walk visited it more than once."

**Verifier note:** Confirmed. `hasVisibleBoxShadow` returns false as a placeholder. Steps with `cdpError: true` have `after={}`, all four checks then fail and the step is flagged; tab-walker line 160 even pushes a step with `backendDOMNodeId: ''`, which parses to NaN. Nothing dedupes by node, though the golden countUnit is element. The fix is right; also skip steps whose `backendDOMNodeId` is empty.

## 22. [major] .kiro/specs/haunting-classifier/requirements.md:54 (steering-fidelity)

**Issue:** Req 3.4 inverts the steering's aria-hidden exception. The steering says an aria-hidden image that is the sole content of a button or link is NOT a Hollow Portrait: the parent is reported as a Nameless Spirit instead. Req 3.4 says to flag it. The design never implements the "report the parent instead" suppression for non-hidden images or SVGs either, so `<a href><img src=x.png></a>` is counted twice.

**Evidence:** Req 3.4: "SHALL skip images with `aria-hidden=\"true\"` UNLESS the image is the sole content of a button or link". hauntings.md §2: "...unless the image is the sole content of a `<button>` or `<a href>`, in which case the parent element is a Nameless Spirit (haunting #1) and should be reported there instead" and "or when it is the sole content of a link or button (parent is the Nameless Spirit, not the SVG)". The design algorithm (447-478) has no sole-content check.

**Fix:** Replace Req 3.4 with: "THE Hollow_Portrait_Detector SHALL skip images that are aria-hidden or ignored. WHEN an image or inline SVG is the sole content of a `button`/`link` AX node whose name is empty, THE Hollow_Portrait_Detector SHALL NOT report the image; the parent is reported by the Nameless_Spirit_Detector instead." Add design step: "if the AX parent (via `parentId`) has role button/link, empty name, and this image is its only non-ignored child → continue".

**Verifier note:** Req 3.4 does invert steering §2: as an acceptance criterion it requires flagging an aria-hidden image that is the sole content of a control, while steering and design line 439 say the parent Nameless Spirit is reported instead (the algorithm's `ignored` skip already does that). Rewrite Req 3.4 as proposed, but limit the sole-content suppression of non-hidden content to inline SVG, the only case steering names; it does not explicitly extend that suppression to non-hidden `<img>`.

## 23. [major] .kiro/specs/haunting-classifier/design.md:462 (steering-fidelity)

**Issue:** Several Hollow Portrait steering rules depend on data that RawAudit does not have, and the design calls helpers with no defined data source. The helpers are `getExplicitRole`, the inline-SVG `role="img"` check, and the speech filename from `src`. The inline-SVG rule (Req 3.5/3.6) is not in the algorithm at all.

**Evidence:** design.md 462: `const explicitRole = getExplicitRole(raw, node.backendDOMNodeId)`. design.md 471: `generateHollowPortraitSpeech(node, raw) // "unlabelled graphic, [filename]"`. hauntings.md §2 Sound: "`unlabelled graphic` followed by the filename extracted from the `src` attribute" and "For inline `<svg>`: flag only when the SVG has an explicit `role=\"img\"` attribute". types.ts RawAudit has `imgAltAttributes` only. There is no src, no role attribute, and AXNode has no tagName (DomAxMapping has `tagName` and `isPresentational` but not role="img").

**Fix:** Add a requirement: "3.9 Hollow Portrait inputs: tag name from `domAxMapping[].tagName`. For `tagName==='svg'`, flag only if the element has an explicit `role=\"img\"` attribute, read from a new RawAudit field `explicitRoles: Record<string,string>` (runner prerequisite task). The filename comes from a new `imgSrcAttributes: Record<string,string|null>`, taking the last path segment without query or hash, or the AX `url` property if it is present in the fixture. Without a src, speak `\"unlabelled graphic\"` alone." Add the SVG branch to the design algorithm. Add a prerequisite runner task before task 8.3.

**Verifier note:** The concrete gap is the filename: RawAudit has no `src`, so the spoken `"unlabelled graphic, [filename]"` (Req 3.7, steering §2 Sound) cannot be produced, and the SVG branch is absent from the algorithm. Narrow the fix: add only `imgSrcAttributes` as a runner prerequisite (falling back to plain 'unlabelled graphic'), identify SVGs through `domAxMapping.tagName`, and drop `getExplicitRole`/`explicitRoles`, since role presentation/none already gives an AX role of none and is skipped by the role check.

## 24. [major] .kiro/specs/haunting-classifier/design.md:565 (steering-fidelity)

**Issue:** The Lost Soul design restates the steering's native-element rule incorrectly and adds an exclusion the steering does not have. It treats every `<a>` as native (the steering says `<a href>`), drops `[contenteditable]`, and skips any element without an AX node. The inside-native, contains-native and outermost helpers have no data source in RawAudit. Golden checkout LostSoul=0 relies on the contains-native skip.

**Evidence:** design.md 565: `if (["button", "a", "input", "select", "textarea", "summary"].includes(tagLower)) return false`. design.md 570: `if (!axNode) return false`. design.md 574-581: `isInsideInteractive`, `containsInteractive`, `filterOutermost` are undefined. hauntings.md §4: "is not a native interactive element (`<button>`, `<a href>`, ... `[contenteditable]`)". checkout.html `modal.addEventListener('click', ...)` on `div#newsletterModal`, which contains an input and buttons, must be skipped.

**Fix:** Req 5.3: "`<a>` counts as native only when its AX role is `link` (i.e. it has href); `[contenteditable]` is detected via domAxMapping `isFocusable` with AX state `editable`". Remove `if (!axNode) return false`. Add Req 5.7: "Ancestry for the inside, contains and outermost rules is computed by walking `axNodes` `parentId`/`childIds` (the full tree includes ignored nodes), with element tags from `domAxMapping[].tagName`. Containing a native interactive element = any descendant whose tag is button/select/textarea/input/summary or whose AX role is link."

**Verifier note:** Confirmed. The tag list treats every `<a>` as native, though steering says `<a href>`. `isInsideInteractive`, `containsInteractive` and `filterOutermost` are undefined and RawAudit has no DOM tree, yet golden checkout LostSoul=0 depends on skipping `div#newsletterModal` (it has a click listener and contains an input and buttons). Define ancestry via AX parentId/childIds plus domAxMapping.tagName, treat `<a>` as native only with AX role link, and drop `if (!axNode) return false`.

## 25. [major] .kiro/specs/haunting-classifier/requirements.md:194 (steering-fidelity)

**Issue:** The speech requirements leave out the steering's special-case rows: empty textbox gives `"edit text, blank"`, empty image gives `"unlabelled graphic, [filename]"`, and placeholder-only gives a name plus a UI note. Prompt 12 puts these in `speech.ts` `announce(node)`. The design hand-rolls them inside detectors instead, so the Whisper walk's `generateSpeech` would say just "edit text" for an empty field. The Haunting type also has no field for the placeholder UI note.

**Evidence:** hauntings.md speech examples: `textbox, name="" → "edit text, blank"`, `img, name="" → "unlabelled graphic, [filename]"`, placeholder-only → `"Email address, edit text" + UI note`. Prompt 12: "`speech.ts`: `announce(node)` → string ... including the placeholder-name case". tasks 5.2: "Implement `generateSpeech(axNode: AXNode): string`". design.md 765/784 build the strings inline in the detector (`// + UI note`). The design Haunting type has only `speech?: string`.

**Fix:** Req 14: add "14.9 `announce(node)` (exported name per prompt 12) SHALL return `\"<roleLabel>, blank\"` for textbox/searchbox/spinbutton/slider/combobox with an empty name, and `\"unlabelled graphic[, filename]\"` for img/image with an empty name. 14.10 It SHALL return `{text, note?}` or a companion `announceNote(node)` that yields `\"name disappears when typing\"` when the winning name source is placeholder." Add `speechNote?: string` to Haunting. Detectors call announce, not inline templates. Exempt these steering rows from the Property 12 'no fabricated text' check.

**Verifier note:** Confirmed. The steering speech table requires `"edit text, blank"` and `"unlabelled graphic, [filename]"`, and prompt 12 puts the placeholder note in speech.ts `announce`. The design's generic speech would say just 'edit text' for an empty field during the Whisper walk, and the Haunting type has no field for the UI note. Add the special cases to `announce`, add `speechNote`, and exempt these rows from Property 12.

## 26. [major] .kiro/specs/haunting-classifier/requirements.md:168 (steering-fidelity)

**Issue:** Severity rules are encoded in a way that can't be implemented deterministically. "Makes the task impossible" has no predicate. The steering's "A checkout button that is a Nameless Spirit is always Wraith" is left out of the requirements. A Nameless Spirit's empty name can never match the keyword list. "Inside a `<form>`" has no data source. The spec doesn't say whether the "≥3 instances" count is taken before or after precedence.

**Evidence:** Req 12.1: "part of a core task flow AND makes the task impossible for AT users" (no definition). hauntings.md: "A checkout button that is a Nameless Spirit is always Wraith." (absent from Req 12). design.md 277: "check DOM ancestor chain via `backendDOMNodeId` lookup", but RawAudit has no DOM tree. Data flow (52-58) and tasks 18.1 run precedence before severity, while task 14.1 types `resolvePrecedence(hauntings: Haunting[])` (already severity-tagged).

**Fix:** Req 12.1: "Blocking types = NamelessSpirit, WhisperingField, LostSoul, CursedLoop (record this table in steering §Severity for sign-off). Wraith = blocking type AND core-task-flow element." Add 12.6: "A NamelessSpirit on a button is Wraith when it is inside a form or its class/id/text-content signals checkout/cart (steering example)." Req 12.4: "inside a `<form>` = some AX ancestor via `parentId` maps to a domAxMapping row with `tagName === 'form'`". Req 12.2: "instance count is per page, per type, over primary hauntings after precedence". Change task 14.1's signature to UnclassifiedHaunting.

**Verifier note:** Confirmed. 'Makes the task impossible' has no predicate. The 'checkout button Nameless Spirit is always Wraith' rule is missing from Req 12, although task 12.2 tests it, and a Nameless Spirit's empty name can never match a keyword. 'Inside a `<form>`' points to a DOM ancestor chain RawAudit lacks. Define the blocking-type predicate (for sign-off, since steering is itself vague), the form check via AX parentId to a domAxMapping row with tagName form, and that instance counts are per page over primaries after precedence.

## 27. [major] .kiro/specs/haunting-classifier/design.md:101 (steering-fidelity)

**Issue:** `Haunting.wcag` holds a single criterion, but the requirements say each instance maps to several criteria. The design and Req 2.5 also restate the Nameless Spirit mapping differently from each other. Invisible Wanderer's required 2.4.13 guidance reference is missing.

**Evidence:** design.md 101: `wcag: WCAGCriterion`. Req 2.5: "SHALL map each instance to WCAG 4.1.2 ..., 2.4.4 ..., and 1.1.1 (for image buttons)", and likewise Req 5.6, 8.6, 10.5 and 11.6 list two or three criteria. design.md 430: "Also 2.4.4 (Link Purpose) for links, and 1.1.1 ... for buttons containing only an image". hauntings.md §6 WCAG: "Reference 2.4.13 Focus Appearance (AAA) as guidance only". The design appendix has no 2.4.13 entry.

**Fix:** Design type: `wcag: WCAGCriterion` (primary; drives the level-A severity rule) plus `wcagAlso: WCAGCriterion[]`. Req 2.5: "primary 4.1.2. `wcagAlso` gets 2.4.4 when role is link, and 1.1.1 when the control's only content is an image". Primary criterion for the other types: Lost Soul 2.1.1, Whispering Field 1.3.1, Shattered Order 1.3.1, Veiled 1.3.1, Cursed Loop 2.1.2, Invisible Wanderer 2.4.7 (with `guidance: 2.4.13`, never 2.4.11). Add `WCAG_2_4_13` (level AAA) to the appendix and make task 2.2 cover 12 criteria.

**Verifier note:** Confirmed. Reqs 2.5, 5.6, 8.6, 10.5 and 11.6 require several criteria per instance, but `Haunting.wcag` holds one. The design leaves the extra criteria as comments, and the steering's 2.4.13 guidance for Invisible Wanderer is absent. Keep `wcag` singular as prompt 12 defines it (it drives the level-A rule), add `wcagAlso` and 2.4.13 as guidance-only, and bump task 2.2 to 12 criteria.

## 28. [major] .kiro/specs/haunting-classifier/tasks.md:527 (steering-fidelity)

**Issue:** The golden tests and every property-based test are marked optional (`*`), and the Notes say they "can be skipped". Prompt 12 makes both must-haves. No task updates steering with the precedence order, which prompt 12 requires.

**Evidence:** tasks.md: `- [ ]* 21.1 Write golden test for index.html` (also 21.2, 21.3, and 3.2-3.4, 5.3-5.6, 15.2-15.7, 17.2, 18.3-18.5). Notes: "Tasks marked with `*` are optional ... can be skipped for faster MVP". Prompt 12: "**Golden test:** ... must equal ... exactly" and "Property-based tests (fast-check, ≥ 100 runs each)", plus "Document this precedence in the design and in the steering." hauntings.md has no precedence section, and no task adds one.

**Fix:** Remove the `*` from 21.1-21.3 and from every property-test subtask (3.2-3.4, 5.3-5.6, 15.2-15.7, 17.2, 18.3-18.5, 14.2). Delete the 'optional' note. Add task 14.4: "Append §Precedence to `.kiro/steering/hauntings.md`: Cursed Loop > Nameless Spirit > Whispering Field > Lost Soul > Hollow Portrait > Veiled > Invisible Wanderer > Fog. Secondaries are attached and unscored. Silent Tongue and Shattered Order never collide."

**Verifier note:** Confirmed. Golden tests 21.1-21.3 and every property-test subtask are marked `*` and the Notes say they 'can be skipped', against prompt 12's must-haves, and no task adds the precedence section to steering as prompt 12 requires. Remove the `*` markers (including 14.2 and 18.5) and add the steering-update task; Kiro owns `.kiro/steering`, so this is a valid Kiro task.

## 29. [major] .kiro/specs/haunting-classifier/design.md:699 (rawaudit-feasibility)

**Issue:** The Invisible Wanderer outline check measures contrast against the element's own background-color, not the adjacent background the runner already records. This flags visible-focus controls as hauntings. Box-shadow criterion (b) is a stub that always returns false.

**Evidence:** design.md:699 `const bgColor = parseColor(after["background-color"]) // adjacent background (simplification)`; design.md:710 `return false // placeholder`. tab-walker.ts:176-195 records `'adjacent-background-color'` (nearest opaque ancestor background) in every ComputedStyleMap. index.html:432 `.add-to-cart-btn{background-color:var(--color-primary)}` and :706 `.add-to-cart-btn:focus{outline:2px solid var(--color-primary)}` give a ratio of 1, so the visibleFocus control card-1 add-to-cart-btn is flagged. `.card-link` and `.promo-strip-link` have transparent backgrounds `rgba(0, 0, 0, 0)`, so #6d4c41 outlines compare against black (~2.8:1) or fail to parse. That flags the accessibleCardLinks and visibleFocus controls and inflates IW above 21. Against the adjacent white card background the ratio is ~7.6:1.

**Fix:** In design.md (a), use `parseColor(after["adjacent-background-color"])` and remove "(simplification)". In (b), say: "box-shadow differs between before and after, the after value is not `none`, and at least one shadow layer's colour has alpha > 0 and ≥ 3:1 contrast against `after['adjacent-background-color']`." In Req 7.2 (a) and (b), add "(the `adjacent-background-color` entry of `focusSnapshot.after`)". State that `parseColor` returns null for alpha < 1, and that a null colour means the criterion fails.

**Verifier note:** Confirmed: tab-walker already records 'adjacent-background-color', but design (a) compares against the element's own background-color, so `.add-to-cart-btn` (primary outline on primary background, ratio 1) is flagged on all 6 cards, which breaks the visibleFocus control and IW=21; transparent backgrounds also mis-parse, and the (b) box-shadow stub `return false` must be specified; apply the fix as written.

## 30. [major] .kiro/specs/haunting-classifier/design.md:627 (rawaudit-feasibility)

**Issue:** The Cursed Loop haunting uses `cycle.nodeIds` and ignores `tabWalkResult.trapRegionNodeIds`. The golden match rule works on the trap region (dialog or common ancestor) and checks descendant relationships, which needs ancestry data the test does not have.

**Evidence:** design.md:627 `nodeIds: cycle.nodeIds.map(id => parseInt(id, 10))` and box/snippet from `cycle.nodeIds[0]`. types.ts:80 `trapRegionNodeIds: string[] // backendDOMNodeIds in the trap region`. tab-walker.ts:145 puts the region (the `.modal-content` dialog) first, then the cycle ids. Golden $meta.cursedLoopMatch: "every recorded trap-region node … is the selector element or a descendant of it. checkout uses #newsletterModal". Req 6.4 says to use `trapDetected`, but the design never reads it.

**Fix:** Design §5: "Emit at most one CursedLoop, and only when `tabWalkResult.trapDetected === true`. Use the cycle whose `escapable === false`. Set `nodeIds = trapRegionNodeIds.map(Number)` (region first). Take `box` and `htmlSnippet` from `nodeIds[0]` (the region). Precedence groups this haunting by the region id only." Req 20 adds: "A CursedLoop matches its golden selector when every id in `nodeIds` is in `ids ∪ descendantIds` from `{page}.selectors.json`."

**Verifier note:** The golden descendant match would pass with cycle ids too (they are inside #newsletterModal), but the concrete defect is that grouping by cycle.nodeIds[0] (the newsletter input) makes CursedLoop outrank that input's WhisperingField, and the box circles one input instead of the trap region; use trapRegionNodeIds (region first) gated on trapDetected as proposed.

## 31. [major] .kiro/specs/haunting-classifier/design.md:873 (rawaudit-feasibility)

**Issue:** Page-level hauntings get `nodeIds: []`, but the golden file expects them to resolve to the `html` element, the `body` element and the offending heading. RawAudit cannot supply those ids: `HeadingRecord` has no backendDOMNodeId, and nothing records the html or body ids.

**Evidence:** design.md:816, 873, 891 and 910 all use `nodeIds: []`, with `box: null`. Golden checkout: SilentTongue selectors `["html"]`; ShatteredOrder selectors `[".footer-content > .footer-col:nth-child(1) h4", "body"]` with kinds `["heading-skip","no-main"]`; product heading-skip selector `.product-info h4.details-heading`. types.ts:152-156 `HeadingRecord = { tagName; accessibleName; domOrderIndex }`. collectors.ts:230 computes `headingIds` but stores only the names.

**Fix:** Add a runner task before task 1: "Extend `HeadingRecord` with `backendDOMNodeId: number | null` (from `headingIds[i]`), and `PageMetadata` with `htmlBackendDOMNodeId: number` and `bodyBackendDOMNodeId: number | null`." Then in design.md: SilentTongue `nodeIds = [htmlBackendDOMNodeId]`; no-h1 and no-main `nodeIds = [bodyBackendDOMNodeId]`; heading-skip `nodeIds = [headings[i].backendDOMNodeId]` (the deeper heading), with id `generateId(type, nodeIds[0] ?? 0, kind)`. Precedence still treats ShatteredOrder and SilentTongue as always primary (they are not in the precedence list).

**Verifier note:** Confirmed: HeadingRecord has no backendDOMNodeId (collectors.ts:238-241 computes headingIds[i] but stores only the name), and nothing records the html or body ids, so `nodeIds: []` cannot match the golden selectors html, body or `.product-info h4.details-heading`; the runner extension plus the design changes are needed.

## 32. [major] .kiro/specs/haunting-classifier/design.md:574 (rawaudit-feasibility)

**Issue:** Several rules need DOM ancestry or tag information that RawAudit does not carry: Lost Soul's inside/contains/outermost checks, severity's "inside a `<form>`", and Hollow Portrait's "sole content of a button/link" and explicit-role checks. The design calls undefined helpers over data that does not exist. It also silently skips Lost Soul candidates that have no AX node.

**Evidence:** design.md:569-575 `findAXNode … if (!axNode) return false`, `isInsideInteractive(raw, …)`, `containsInteractive(raw, …)`; :581 `filterOutermost(raw, …)` "sort by DOM depth"; :277 "Element is inside a `<form>` (check DOM ancestor chain via `backendDOMNodeId` lookup)"; :462 `getExplicitRole(raw, …)`. RawAudit's only per-node structural data: `EventListenerSignal.tagName`, `DomAxMapping.tagName` (visible elements only, no parent), `AXNode.parentId`/`childIds` (AX tree, and an unnamed `<form>` like checkout `#checkoutForm` is not guaranteed to have AX role `form`). Steering §4 lists no AX-node precondition. product.html:665-667 `<img alt="" onclick>` thumbnails are expected LostSouls and may be ignored AX nodes.

**Fix:** Add a runner task before task 1: "Extend `BoundingBox` (built from the full `DOM.getDocument` walk in collectBoundingBoxes) with `tagName: string`, `parentBackendDOMNodeId: number | null`, and `attrs: { role?: string; href?: boolean; contenteditable?: boolean }`." In design.md, define `parentOf`, `ancestorsOf` and `descendantsOf` over that map, and specify: Lost Soul skips an element when it or any ancestor or descendant is native-interactive (button, a[href], input, select, textarea, summary, [contenteditable]) or has an interactive AX role. An element with no AX node counts as non-interactive (replace `if (!axNode) return false`). Outermost = drop any candidate that has a qualifying ancestor. Core task flow = any ancestor with tagName `form`. Hollow Portrait explicit role = `attrs.role`.

**Verifier note:** isInsideInteractive, containsInteractive, filterOutermost, getExplicitRole and the '<form> ancestor' check have no defined data source, and `if (!axNode) return false` can drop the expected product-thumb LostSouls; correction: Lost Soul ancestry and native-interactive checks can be specified now over AXNode.parentId/childIds (getFullAXTree includes ignored nodes) using AX roles, so only <form> ancestry (unnamed forms are not role=form) needs the runner tagName/parent extension.

## 33. [major] .kiro/specs/haunting-classifier/requirements.md:220 (rawaudit-feasibility)

**Issue:** The axe cross-check is specified "by backendDOMNodeId", but axe nodes in RawAudit carry only CSS selector targets and HTML. A pure classifier cannot match them to haunting nodes, so `hauntingToAxe` would always be empty and every violation would land in `unmapped`. Axe's best-practice rules are also never run, so ShatteredOrder can never be corroborated.

**Evidence:** Req 16.1: "map each haunting instance to the axe rule IDs that detected the same element (by `backendDOMNodeId`)"; tasks.md 17.1 "Map each haunting to axe violations by backendDOMNodeId". types.ts:183-187 `AxeViolationNode = { html; target: string[]; failureSummary }`. axe.ts:6 `AXE_TAGS = ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']` excludes `best-practice`, so `heading-order`, `page-has-heading-one` and `landmark-one-main` never run.

**Fix:** Add a runner task before task 1: "Extend `AxeViolationNode` with `backendDOMNodeId: number | null`, resolved in the page via `document.querySelector(target.join(' '))` and then DOM.describeNode." Rewrite Req 16.1: "match on `AxeViolationNode.backendDOMNodeId ∈ haunting.nodeIds`. A node with a null id is matched by rule→type table only (button-name, link-name → NamelessSpirit; image-alt, svg-img-alt, role-img-alt → HollowPortrait; color-contrast → TheFog; label → WhisperingField; html-has-lang, html-lang-valid → SilentTongue; aria-hidden-focus → TheVeiled; scrollable-region-focusable, nested-interactive → none) and otherwise goes to `unmapped`." Add a note: "ShatteredOrder has no corroborating axe rule because best-practice tags are not run."

**Verifier note:** Confirmed: AxeViolationNode has only html, target and failureSummary, so Req 16.1/task 17.1 'by backendDOMNodeId' cannot be implemented and every violation falls into unmapped; best-practice rules are also never run (AXE_TAGS), so add the runner backendDOMNodeId resolution plus the rule→type fallback and the ShatteredOrder note as proposed.

## 34. [major] .kiro/specs/haunting-classifier/requirements.md:370 (rawaudit-feasibility)

**Issue:** `htmlSnippet` (the outerHTML of the primary element) and the Hollow Portrait filename (from `src`) both need DOM data the runner does not collect. `extractSnippet` and `generateHollowPortraitSpeech` have no source.

**Evidence:** Req 29.4 "`htmlSnippet` (≤ 300 chars)"; design.md:105 `htmlSnippet: string // ≤ 300 chars; outerHTML of the primary element`; every detector calls `extractSnippet(raw, id)`. Req 3.7 "filename is extracted from the `src` attribute". RawAudit only has `imgAltAttributes: Record<string, string | null>` and `AxeViolationNode.html`. No outerHTML or `src` is collected (collectors.ts:231-251 read only `alt`).

**Fix:** Add a runner task before task 1: "Add `RawAudit.nodeSnippets: Record<string, string>` (outerHTML truncated to 300 chars, keyed by backendDOMNodeId) for every element in eventListenerSignals, domAxMapping, textNodeStyles, tabWalk steps and AX nodes with interactive, form or image roles. Add `RawAudit.imgSrcAttributes: Record<string, string | null>`." Then define in design.md: `extractSnippet = nodeSnippets[id] ?? '<' + tagName + '>'`; filename = last path segment of `imgSrcAttributes[id]` without the query string, with speech `"unlabelled graphic"` when absent (never "undefined").

**Verifier note:** Confirmed: the runner collects neither outerHTML nor img src (collectors.ts reads only alt), so extractSnippet and the Hollow Portrait '[filename]' speech have no source and invite 'undefined' in speech, which Req 14.8 forbids; add nodeSnippets and imgSrcAttributes (or define a tagName-only fallback snippet plus a no-filename speech) as proposed.

## 35. [major] .kiro/specs/haunting-classifier/requirements.md:94 (golden-and-tasks)

**Issue:** The spec never encodes the golden $meta.cursedLoopMatch rule, so Req 20.5's node-id equality fails for CursedLoop. The design also builds CursedLoop nodeIds from the cycle members instead of the trap region the runner records. That leaves precedence ambiguous: the newsletter input is both a cycle member and a WhisperingField. If 'same element' means any nodeId (Property 17 wording), WhisperingField drops to 2 against golden 3.

**Evidence:** expected-hauntings.json $meta.cursedLoopMatch: "matches the golden selector when every recorded trap-region node ... is the selector element or a descendant of it ... the detected trap region is its .modal-content dialog". design.md line 627: `nodeIds: cycle.nodeIds.map(id => parseInt(id, 10))`, and the box/snippet use cycle.nodeIds[0]. tab-walker.ts line 145: `trapRegionNodeIds = [...new Set([...(region ? [region] : []), ...cycleIds])]`. Design line 261 groups by `nodeIds` first element, while Property 17 (line 1249) says "each element has at most one primary haunting (by backendDOMNodeId)".

**Fix:** Change Req 6.4 to: "A non-escapable cycle without includesAllFocusables, when tabWalkResult.trapDetected is true, yields one instance with nodeIds = tabWalkResult.trapRegionNodeIds (region first). box and htmlSnippet come from nodeIds[0]." Add Req 20.6: "A CursedLoop instance matches a golden selector when every id in its nodeIds is in that selector's `subtree` set from {page}.selectors.json." Add to Req 15: "Precedence collisions are keyed on nodeIds[0] only. Other ids in nodeIds never demote another haunting." Reword Property 17 to "at most one primary haunting per nodeIds[0]".

**Verifier note:** Confirmed, and distinct from finding 0. Exact node-id matching cannot match '#newsletterModal', so the cursedLoopMatch descendant rule must be encoded. With nodeIds = cycle members, nodeIds[0] is a trap member, which can be the newsletter input, so precedence grouping by nodeIds[0] (design line 261) would demote that input's WhisperingField. The fix is right: use trapRegionNodeIds (region first) and key precedence on nodeIds[0] only.

## 36. [major] .kiro/specs/haunting-classifier/design.md:1062 (golden-and-tasks)

**Issue:** The capture script and task 1 will not run on this repo and can stall Kiro. They rely on `__dirname` in an ESM package, on tsx (not installed), on a `capture-fixtures` script nobody adds, and on port 3000 (the shop serves on 4173). Task 1 starts a long-running server inside an agent step. The browser pool is never closed, so the process hangs. Failures exit 0. Req 27.4's stable key order is not implemented, and a multi-MB screenshot gets committed.

**Evidence:** design.md: `const BASE = "http://localhost:3000"`, `resolve(__dirname, "raw", filename)`, `writeFileSync(path, JSON.stringify(raw, null, 2))`, `captureFixtures().catch(console.error)`, scripts `"capture-fixtures": "tsx tests/fixtures/capture.ts"`. packages/core/package.json has `"type": "module"` and no tsx or capture-fixtures script (node_modules/tsx is absent). apps/cursed-shop/package.json: `"start": "serve -l 4173 ."`. tasks.md line 10: "Start `apps/cursed-shop` server on localhost". browser.ts getPool() keeps idle browsers until `BrowserPool.close()`. packages/core/tests/fixtures/shop-server.ts already exports `startShopServer()` (127.0.0.1, random port, closable).

**Fix:** Rewrite design §Fixture Capture and task 1 as follows. The script uses `startShopServer()` from tests/fixtures/shop-server.ts, never `npm start`. It resolves paths with `fileURLToPath(new URL('./raw/', import.meta.url))`. It calls `{ allowPrivate: true }`, then `await getPool().close()` and `await shop.close()` in finally, and sets `process.exitCode = 1` on error. It writes JSON with recursively sorted keys and `screenshotPng: ""` (the classifier never reads it). Add `"capture-fixtures": "node --experimental-strip-types tests/fixtures/capture.ts"` (Node 22.6+) or add tsx to devDependencies in the same task. Before writing, the script asserts `collectionErrors.length === 0` and endReason: index 'body', product 'body', checkout 'trap'.

**Verifier note:** Confirmed. The script uses __dirname in a 'type: module' package, port 3000 while the shop serves on 4173, a tsx script that is not installed, no exitCode on failure, a pool that is never closed, and no stable key ordering (Req 27.4). The fix is right; prefer adding tsx to devDependencies over --experimental-strip-types for reliability, and use startShopServer() with { allowPrivate: true }.

## 37. [major] .kiro/specs/haunting-classifier/tasks.md:9 (golden-and-tasks)

**Issue:** Fixture capture is wave 0, but the runner is being fixed concurrently. Fixtures captured now freeze runner bugs, and a later golden failure cannot be pinned on the classifier or the runner. No task re-captures the fixtures or checks the runner against the golden file first.

**Evidence:** tasks.md wave graph: `{ "id": 0, "tasks": ["1"] }`. The brief says capture "may use `auditUrl` from the finished audit engine". expected-hauntings.json $meta.walkNote: "checkout Tab walk starts inside the newsletter trap and stops when the trap is declared". This depends on runner behaviour (e.g. baseline styles for the pre-focused input).

**Fix:** Make task 1 depend on the runner fixes landing, and add a sub-task first: "Run `npm run verify -w cursed-shop` and the existing `npm run test:integration -w @the-unseen/core`; both must pass before capturing." Add task 20.5 before the golden tests: "Re-capture fixtures (`npm run capture-fixtures -w @the-unseen/core`) and commit them if they changed." Add to design: "Re-capture whenever packages/core/src/runner/** or apps/cursed-shop/*.html changes."

**Verifier note:** Mostly real, but correct the fix: the brief requires capture first, so keep task 1 first. Add a re-capture task immediately before 21, and add runner/** changes to the design's 'Regeneration' trigger, which today names only shop HTML. Gate on `npm run test:integration -w @the-unseen/core` only, because verify.mjs does its own detection and never exercises the runner.

## 38. [major] .kiro/specs/haunting-classifier/tasks.md:355 (golden-and-tasks)

**Issue:** The pipeline order contradicts itself, which will stall or split Kiro. The data flow runs precedence before severity, but resolvePrecedence takes Haunting[] (which needs severity) while assignSeverity takes UnclassifiedHaunting[]. Task 18.1 runs precedence before severity anyway and re-generates explanation and fix, which the detectors already fill. Nothing says whether severity's '≥3 instances of the same type' counts before or after precedence.

**Evidence:** design.md lines 52-58: "Precedence resolver → ... → Severity assigner". tasks.md 14.1: `resolvePrecedence(hauntings: Haunting[]): Haunting[]`. 12.1: `assignSeverity(hauntings: UnclassifiedHaunting[], raw: RawAudit): Haunting[]`. 18.1: "Call resolvePrecedence ... Call assignSeverity ... Call generateExplanation and generateFix". design.md line 244: UnclassifiedHaunting already has "explanation, persona, and fix".

**Fix:** State one order in design §Data Flow and task 18.1: detectors → `resolvePrecedence(UnclassifiedHaunting[]): Array<UnclassifiedHaunting & {isPrimary: boolean; secondary: UnclassifiedHaunting[]}>` → `assignSeverity(primaries, raw)`, where the ≥3 count uses primaries of the same type → computeScore → crossCheckAxe. Delete the "Call generateExplanation and generateFix" step from 18.1, since detectors produce them.

**Verifier note:** Confirmed. 14.1 resolvePrecedence takes Haunting[] (which needs severity) and 12.1 assignSeverity takes UnclassifiedHaunting[], yet 18.1 calls precedence first, so the types do not line up. 18.1 also regenerates explanation and fix that detectors already fill, and the ≥3-instances rule never says whether it counts before or after precedence. Apply the proposed single ordering.

## 39. [major] .kiro/specs/haunting-classifier/tasks.md:163 (golden-and-tasks)

**Issue:** Detector tasks call helpers that no task creates. Some of them need data RawAudit does not contain (outerHTML, the img src, explicit role attributes, DOM ancestry), so Kiro will stall or invent data.

**Evidence:** design.md uses `generateId` (line 412), `findBox`, `extractSnippet(raw, id)` (line 418), `getExplicitRole(raw, id)` (line 462), `generateHollowPortraitSpeech(node, raw)` ("filename extracted from the `src` attribute", line 483), `parseColor` (line 506), `findAXNode`, `isInsideInteractive`, `containsInteractive`, `filterOutermost` (lines 569-581). types.ts RawAudit has no outerHTML, no src and no DOM tree; only imgAltAttributes, the AX tree (parentId/childIds, ignored nodes included) and domAxMapping. No task in tasks.md creates any of these helpers.

**Fix:** Add task 2.5 "Shared helpers (packages/core/src/classifier/util.ts) with property tests": `hauntingId(type, nodeId, kind)` (deterministic FNV-1a, no crypto), `parseCssColor(s): {r,g,b,a}|null` plus `blend`, `findBox`, `axByBackendId`, and `axAncestors(raw, id)`/`axDescendants(raw, id)` over parentId/childIds. Say that Lost Soul inside/contains/outermost uses these AX helpers. For data RawAudit lacks, either state that htmlSnippet is built from AX role+name ("<button> (no name)") and the Hollow Portrait filename comes from the AX `url` property or is omitted, or add a prerequisite runner task adding `outerHtmlSnippets: Record<string,string>` and `imgSrc: Record<string,string>` to RawAudit.

**Verifier note:** Confirmed. No task creates generateId, findBox, extractSnippet, parseColor, findAXNode, isInsideInteractive, containsInteractive or filterOutermost. RawAudit has no outerHTML (design line 105 says htmlSnippet is outerHTML), no img src (Req 3.7 filename) and no DOM ancestry for the <form> check in severity. Add the util task and either define fallbacks from AX data or add the runner prerequisite fields, as proposed.

## 40. [major] .kiro/specs/haunting-classifier/tasks.md:574 (golden-and-tasks)

**Issue:** Two test steps fail as written. The final checkpoint runs a root script that does not exist. Task 22.3 calls the shop on the wrong port with the default SSRF policy, which blocks localhost.

**Evidence:** tasks.md line 575: "Run full test suite: `npm test` and `npm run test:integration`". The root package.json scripts are build/test/typecheck/shop (no test:integration), so npm prints 'Missing script'. Line 568: `auditAndClassify("http://localhost:3000/index.html")`. The shop serves on 4173. audit.ts selectPolicy: `options.allowPrivate ? new PermissiveSafeFetchPolicy() : new RestrictiveSafeFetchPolicy()`, so localhost is blocked and the call throws SsrfBlockedError.

**Fix:** Task 23: "Run `npm test -w @the-unseen/core` and `npm run test:integration -w @the-unseen/core` (works in PowerShell and bash)." Task 22.3: "Start `startShopServer()` from tests/fixtures/shop-server.ts in beforeAll and call `auditAndClassify(`${shop.baseUrl}/index.html`, { allowPrivate: true })`; close the server and `getPool().close()` in afterAll."

**Verifier note:** Confirmed. The root package.json has no test:integration script, and 22.3 targets localhost:3000 (the shop serves on 4173) without allowPrivate, so RestrictiveSafeFetchPolicy blocks loopback. Apply the proposed workspace-scoped commands and the startShopServer() plus { allowPrivate: true } setup.

## 41. [major] .kiro/specs/haunting-classifier/tasks.md:509 (golden-and-tasks)

**Issue:** The ESLint task cannot be done as written. ESLint is not installed, `.eslintrc.json` is the legacy format that ESLint 9 ignores, no TypeScript parser is configured for .ts files, and no script or checkpoint ever runs lint, so Req 31.2 is never checked.

**Evidence:** tasks.md 19.1: "Add to `.eslintrc.json` (or create if doesn't exist)" and "Forbid patterns `**/runner/**`". There is no eslint in node_modules or in any package.json, and no eslint config file in the repo. design.md lines 1116-1131 show a legacy `overrides` config.

**Fix:** Rewrite 19.1: "Add devDependencies `eslint@^9` and `typescript-eslint@^8` to the root package.json. Create a root `eslint.config.js` (flat config) using typescript-eslint's parser for `packages/core/src/classifier/**/*.ts` with `no-restricted-imports: ['error', { patterns: [{ group: ['**/runner/*', '../runner/*', './runner/*'], message: 'classifier must not import runner (structure.md)' }] }]`. Add a `"lint": "eslint packages/core/src/classifier"` script." Add `npm run lint` to checkpoints 20 and 23.

**Verifier note:** Confirmed. eslint is not installed anywhere and there is no config file, a legacy .eslintrc.json is not read by ESLint 9 by default, nothing parses .ts, and no script or checkpoint runs lint, so Req 31.2 is never checked. Apply the proposed flat-config rewrite and add lint to checkpoints 20 and 23.

## 42. [major] .kiro/specs/haunting-classifier/tasks.md:56 (golden-and-tasks)

**Issue:** Several required items have no task: documenting precedence in the steering, the contrast luminance-monotonicity property, purity tests for each detector, and a shared RawAudit arbitrary that five property tasks each assume.

**Evidence:** The brief says "Document this precedence in the design and in the steering". hauntings.md has no precedence section, and no task edits it. Req 23.5 "luminance increases monotonically with brighter colours" has no task (3.2-3.4 cover 23.2-23.4 only). Req 26.2 says "all detectors", but 18.3/18.4 test only `classify`. Tasks 17.2, 18.3, 18.4 and 18.5 each say "Generate 100+ random RawAudit inputs", and no task builds that generator.

**Fix:** Add task 14.0: "Add a '## Precedence (double counting)' section to .kiro/steering/hauntings.md with the order Cursed Loop > Nameless Spirit > Whispering Field > Lost Soul > Hollow Portrait > Veiled > Invisible Wanderer > Fog, keyed on nodeIds[0], secondaries not scored but counted for the golden test." Add task 3.6: "Property: relativeLuminance is non-decreasing in each channel, and contrastRatio grows with |L1-L2|." Add task 2.6: "Create packages/core/src/classifier/test-arbitraries.ts exporting `arbRawAudit` and `arbHaunting` (fast-check)." Change 18.3/18.4 to loop over all 10 detectors plus classify with deep-frozen input.

**Verifier note:** Real for the steering precedence section, which the brief requires and hauntings.md lacks, and for Req 23.5 luminance monotonicity, which has no task. Also real for per-detector purity: Req 26.2 says all detectors but 18.3/18.4 test only classify. The shared arbitraries task is a nice-to-have rather than a defect.

## 43. [minor] .kiro/specs/haunting-classifier/tasks.md:383 (steering-fidelity)

**Issue:** The computeScore signature differs from the one the steering mandates (it is missing `readonly`).

**Evidence:** tasks.md 15.1: "Implement `computeScore(hauntings: Haunting[]): number`". hauntings.md: "The classifier function signature must be: `function computeScore(hauntings: readonly Haunting[]): number`".

**Fix:** tasks.md 15.1 and design §Score: "`computeScore(hauntings: readonly Haunting[]): number`" (it filters `isPrimary` internally).

**Verifier note:** Minor but concrete: steering says the signature 'must be' `computeScore(hauntings: readonly Haunting[]): number`, and task 15.1 drops `readonly`, which would reject readonly arrays from callers. Fix task 15.1 and design §Score as stated.

## 44. [minor] .kiro/specs/haunting-classifier/design.md:818 (steering-fidelity)

**Issue:** Silent Tongue puts the steering's sound effect into the spoken `speech` text. A TTS engine would read out the words "garbled whisper", which is fabricated speech.

**Evidence:** design.md 818: `speech: "garbled whisper", // metaphorical`. hauntings.md §8 Sound: "A garbled whisper" (an audio cue). Speech invariant 3: "no fabricated text".

**Fix:** Design §8: `speech: undefined`, and add `sound: 'garbled-whisper'` (or leave the cue to the UI layer). Do the same for Cursed Loop's chime.

**Verifier note:** Minor but concrete: design §8 puts the literal 'garbled whisper' into `speech`, so a TTS engine would say it aloud, although steering means an audio cue. Set `speech: undefined` and leave the cue to the UI layer; correction: Cursed Loop already has `speech: undefined` (design line 629), so that part of the fix is unnecessary.

## 45. [minor] .kiro/specs/haunting-classifier/design.md:660 (rawaudit-feasibility)

**Issue:** The Invisible Wanderer loop ignores `TabStep.cdpError` and repeated steps. Failed CDP reads (after = {}) are flagged as hauntings, and nodes revisited after an escapable cycle produce duplicate hauntings with the same id.

**Evidence:** types.ts:91 `cdpError: boolean // true if CDP read failed for this step`; tab-walker.ts:123-130 sets `after = {}` on failure. design.md:660 `for (const step of raw.tabWalkResult.steps)` has no cdpError check and no dedupe. Escapable cycles (index cookie banner) leave the same id in `steps` more than once (tab-walker.ts:132-152).

**Fix:** Design §6: "Skip steps with `cdpError === true` and add them to `needsManualCheck` with reason 'focus-style-unavailable'. Evaluate each backendDOMNodeId once, using its first non-error step." Add `'focus-style-unavailable'` to `ManualCheckNode.reason`.

**Verifier note:** Confirmed: failed reads produce steps with after={} and cdpError=true (and Tab failures produce backendDOMNodeId '' giving NaN), and cycle members and escape-landing nodes appear in steps more than once, so the design's unfiltered loop flags CDP failures and emits duplicate same-id IW hauntings; skip cdpError steps (send them to manual check) and evaluate each id once, as proposed.

## 46. [minor] .kiro/specs/haunting-classifier/design.md:336 (rawaudit-feasibility)

**Issue:** The speech state table maps radio and menuitemradio to `selected`/`unselected` without naming the CDP property. CDP reports radio state in the `checked` property, so reading `selected` would always announce "unselected".

**Evidence:** design.md:336 `| radio, menuitemradio | selected, unselected | "selected" / "unselected" |`. ax-tree.ts:312-315 STATE_NAMES keeps both `checked` and `selected`; for radios Chromium sets `checked`.

**Fix:** Add a "Source property" column to the design table: checkbox/menuitemcheckbox/switch → `checked` ('true'|'false'|'mixed'); radio/menuitemradio → `checked` ('true' → "selected", otherwise "unselected"); option/tab → `selected`; combobox/treeitem → `expanded`; button → `pressed`; any → `disabled`, `required`; heading level → `level` property.

**Verifier note:** Minor but concrete: the design table names `selected` for radio/menuitemradio, but Chromium reports radio state only in the `checked` property, so a literal implementation always says 'unselected'; add the source-property column as proposed, and keep steering's output words ('selected'/'unselected').

## 47. [minor] .kiro/specs/haunting-classifier/design.md:565 (golden-and-tasks)

**Issue:** Lost Soul treats every `<a>` as native interactive. The steering exempts only `<a href>`, so a clickable anchor without href is wrongly skipped. The design also silently drops candidates with no AX node.

**Evidence:** design.md line 565: `if (["button", "a", "input", "select", "textarea", "summary"].includes(tagLower)) return false`. Line 570: `if (!axNode) return false`. hauntings.md §4: "is not a native interactive element (`<button>`, `<a href>`, ...)".

**Fix:** Treat `a` as native only when its AX role is `link` (Chromium gives an href-less anchor role generic). When no AX node exists, keep the candidate and rely on the role check being absent.

**Verifier note:** Minor but real. Design line 565 exempts every <a>, while the steering exempts only <a href>, and line 570 drops candidates with no AX node. The Cursed Shop Lost Souls are divs, so golden counts are unaffected. Apply the fix: treat <a> as native only when it has an href (AX role link).

## 48. [minor] .kiro/specs/haunting-classifier/design.md:96 (golden-and-tasks)

**Issue:** The Haunting type has no field for the Whispering Field 'name vanishes when you type' note, which Req 8.5 and the steering require. The design leaves it as a code comment.

**Evidence:** Req 8.5: "with a UI note that the name vanishes when the user types". design.md line 784: `speech: `${name}, ${ROLE_LABEL_MAP[role]}`, // + UI note`. The Haunting type (lines 96-110) has only `speech?: string`.

**Fix:** Add `speechNote?: string` to Haunting in design §Core Types and Req 29.4. Set it to "name disappears when typing" for placeholder-only Whispering Field instances.

**Verifier note:** Minor but real. The brief and the steering (hauntings.md line 209) require the 'name disappears when typing' UI note, but Haunting has no field for it and the design leaves it as a code comment. Add speechNote?: string as proposed.

## 49. [minor] .kiro/specs/haunting-classifier/design.md:272 (golden-and-tasks)

**Issue:** Wraith requires that the haunting 'makes the task impossible for AT users', but the spec gives no operational test for that. Task 12.1 cannot be implemented deterministically without guessing, and the guess changes every score.

**Evidence:** design.md line 272: "Wraith — the haunting affects a core task flow element AND makes the task impossible for AT users." No list of blocking types is given. Req 12.1 repeats the same wording.

**Fix:** Add to Req 12: "A haunting 'makes the task impossible' iff its type is CursedLoop, NamelessSpirit, WhisperingField or LostSoul. HollowPortrait, TheFog, InvisibleWanderer, TheVeiled, ShatteredOrder and SilentTongue never qualify for Wraith." Alternatively, get an explicit list confirmed by the product lead before task 12.1.

**Verifier note:** Minor but real: 'makes the task impossible' has no deterministic test, and the guess changes every score. Correct the fix: the steering wins, so get the blocking-type list decided and written into hauntings.md §Severity first, then reference it from Req 12. Do not invent the list only in the spec, and keep the steering example that a checkout-button Nameless Spirit is always Wraith.
