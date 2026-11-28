# Claude Code check: classifier on fresh, unseen pages (anti-overfitting)

Date: 2026-11-24. Method: 3 probes in real Chromium:
- per-type fresh pages with near-miss controls
- real-world markup patterns
- a code review for shop-specific shortcuts

A skeptical verifier then checked each failure against hauntings.md. **26 checks passed; 7 confirmed failures; 3 rejected.** No shop-specific shortcuts were found in the classifier code.

## 1. [major] Unnamed button inside a same-origin iframe is a NamelessSpirit

**Expected:** NamelessSpirit on the iframe's <button type="button"></button>, which is tabbable and announced as just 'button'

**Actual:** FALSE NEGATIVE. Nothing reported, even though the walk visited the button (#83). The CDP AX tree is collected for the main frame only, so iframe content never reaches the AX-based detectors (axNodes has no entry for 83 and no button nodes at all). axe did catch it (button-name, target ['#I','button'], backendDOMNodeId null). But axe-cross-check matched that node through the rule-table fallback to the two UNRELATED link NamelessSpirits on the page, so axeCrossCheck.unmapped stayed [] and the miss was hidden. Suggested fixes: collect the AX tree per frame (Accessibility.getFullAXTree with frameId), and stop using the rule-table fallback to mark a null-id axe node as corroborated by a haunting on a different element.

**Evidence:** positives.html: <iframe id="I" title="Widget" src="/iframe-unnamed.html"></iframe> ; iframe-unnamed.html: <body><button type="button"></button></body>. Output: raw.domNodes['83']={tag:'button',attrs:{type:'button'}}; axNodes with backendDOMNodeId 83: []; axeViolations button-name:1; hauntingToAxe {'NamelessSpirit-772cdb1e':['button-name','link-name'],'NamelessSpirit-7539a3eb':['button-name','link-name']} (these are links A and B); unmapped=[]

## 2. [major] Cross-origin cookie-consent iframe (OOPIF) with visible focus rings inside

**Expected:** No InvisibleWanderer. Focus styles inside a cross-origin frame cannot be read, so per the spirit of hauntings.md this should be needsManualCheck reason 'focus-style-unavailable' (that reason already exists in ManualCheckNode), not a haunting. Score 0.

**Actual:** FALSE POSITIVE. InvisibleWanderer (Banished) on the <iframe> element, score 2. The walker stays on the frame element (cdp.ts: cross-origin stays on the frame element) and compares the iframe's own before/after styles (outline-style none both times), so the check always fails. Any third-party consent, chat, or payment iframe produces this.

**Evidence:** form-xo.html = form.html with <iframe class="cookie" title="Cookie consent" src="http://localhost:{port}/cookie.html"></iframe> (page on 127.0.0.1, so cross-site). Output: hauntings [{type:InvisibleWanderer,severity:Banished,nodeIds:[53],snippet:'<iframe class="cookie" title="Cookie consent" ...>'}]; step 4 focusSnapshot before/after identical, outline-style none; needsManualCheck has only the 2 hero contrast entries.

## 3. [minor] Golden test coverage gaps (things it does not assert)

**Expected:** The golden test pins element identity for every type, plus kinds, primary/secondary split, severity and score

**Actual:** (1) SilentTongue and ShatteredOrder are excluded from the element-id check, so only count and kind are tested. product.html's ShatteredOrder entry has no 'kinds', so on product only count=1 is checked: a wrong kind or wrong heading would still pass. (2) The test never asserts countsByType (primary), the secondary placement, severity or score. Precedence is therefore covered only by the precedence.test.ts property tests, not by the golden. (3) The CursedLoop check is only 'every trap node lies inside the #newsletterModal subtree'. I checked these by hand and they are currently correct: product heading-skip on node 68 = the sidecar h4.details-heading (h1 to h4); checkout heading-skip on node 234, no-main on body 34, SilentTongue on html 25; checkout WF on #newsletterForm input (3) is a secondary of the CursedLoop.

**Evidence:** golden.test.ts uses PAGE_LEVEL = {SilentTongue, ShatteredOrder}, which are skipped in the 'elements are exactly the golden selectors' test. `if (wanted) expect(kinds)...` runs only when the golden has kinds, and product.html's ShatteredOrder entry = {count:1, selectors:['.product-info h4.details-heading']} has none. Manual check: probe4.mjs in the same scratchpad clsprobe folder.

## 4. [major] Invisible Wanderer: a colour-only focus change must not count as a visible indicator (steering (d) means a text-decoration change such as an added underline)

**Expected:** A link with outline:none whose colour shifts imperceptibly on focus (#555 to #4f4f4f), with no border and no underline, is flagged as InvisibleWanderer, the same as a link with no change at all

**Actual:** Real Chromium flags only #plain. #shade is NOT flagged. The runner serialises 'text-decoration' as line+style+color, and textDecorationColor is currentColor. Any change in text colour therefore makes hasTextDecorationChange true ('none solid rgb(85, 85, 85)' to 'none solid rgb(79, 79, 79)'). Even a 1-unit change counts. hasVisibleColorChange also accepts a border-color change when border-style is none / border-width 0 (border-color is also currentColor). It ignores the border-style and border-width the runner already collects. The result is a false negative for the very common pattern 'a:focus{outline:none;color:X}'.

**Evidence:** Page (focus.html): <style>body{background:#fff} a{color:#555;text-decoration:none} a:focus{outline:none} a.shade:focus{color:#4f4f4f}</style><main><h1>Probe</h1><p><a id="shade" class="shade" href="#a">Shade link</a></p><p><a id="plain" href="#b">Plain link</a></p>... Output: 'P InvisibleWanderer Banished <a id="plain" href="#b">Plain link</a>' and nothing for #shade. Step 15 before/after text-decoration: 'none solid rgb(85, 85, 85)' vs 'none solid rgb(79, 79, 79)'. Unit probe: hasTextDecorationChange returns true for a 1-unit colour change, and so does hasVisibleIndicator (probe5.mjs). Code: detectors/invisible-wanderer.ts hasTextDecorationChange / hasVisibleColorChange; runner/tab-walker.ts line ~451 builds 'text-decoration'. Files: <scratch>, run.mjs, probe5.mjs

## 5. [minor] Severity core-task keyword match should not fire on substrings of unrelated id/class/snippet text

**Expected:** Per steering, the keyword rule is a case-insensitive NAME match. An unnamed icon button with class 'research-toggle', outside any form, dialog or checkout/cart region, should be Restless (4.1.2 is level A)

**Actual:** It is classified as Wraith. NamelessSpirit always has an empty name, so purposeText() falls back to id + class + aria-label + the full outerHTMLSnippet (attributes and children), and hasKeyword() matches by substring: 'research' contains 'search'. On a synthetic fixture, 'spaybutton' (contains 'pay') and 'paypal-express' also became Wraith. This fallback is also what turns the shop's six .add-to-cart-btn buttons into Wraith ('cart' in the class). The steering line 'a checkout button that is a Nameless Spirit is always Wraith' arguably requires some purpose inference, so this is a design interpretation, but it is substring-based and broader than the spec text.

**Evidence:** Same focus.html page: <button class="research-toggle" style="outline:2px solid #000"><svg width="16" height="16" aria-hidden="true"><rect width="16" height="16"/></svg></button>. Real Chromium output: 'P NamelessSpirit Wraith <button class="research-toggle" ...'. Code: severity.ts purposeText() and hasKeyword() (lower.includes(k)). Probe on a mutated fixture: probe3.mjs.

## 6. [minor] The Veiled case (a): a focusable element inside an aria-hidden subtree is flagged even when the container is positioned off-screen (steering puts no visibility condition on case (a))

**Expected:** Both aria-hidden containers holding a tabbable link are flagged as TheVeiled

**Actual:** Only the on-screen container is flagged. The off-screen one (left:-9999px) is missed because runner/collectors.ts mappingChunk drops every domAxMapping row with !r.visible before the classifier sees it. The visibility and intersection requirement belongs only to case (b). The root cause is in the runner, not in the classifier logic.

**Evidence:** Page (veiled.html): <main><h1>Probe</h1><div id="offscreen" aria-hidden="true" style="position:absolute;left:-9999px;top:0"><a href="#x">Hidden but tabbable</a></div><div id="onscreen" aria-hidden="true"><a href="#y">Visible hidden link</a></div></main>. Real Chromium output: only 'P TheVeiled Restless <div id="onscreen" aria-hidden="true">...'. File: <scratch>

## 7. [minor] Built public API exposes auditAndClassify

**Expected:** packages/core/dist/index.js exports auditAndClassify, as src/index.ts does

**Actual:** dist/index.js and dist/audit.js are stale: they export auditUrl, auditHtml and OriginScopedPolicy but not auditAndClassify, so importing it from the built package gives undefined ('auditAndClassify is not a function'). The dist classifier itself is current (no classifier src file is newer than dist/classifier/classify.js). Probes used dist auditUrl + dist classify, which is the same composition auditAndClassify performs in src/audit.ts.

**Evidence:** grep of dist/index.js line 3: "export { auditUrl, auditHtml, OriginScopedPolicy } from './audit.js'". src/index.ts line 3 additionally exports auditAndClassify. This needs a rebuild only. No repo files were edited.
