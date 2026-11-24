# Product-lead re-verification of run 19 (findings 1–24)

Date: 2026-11-24. Method: 4 adversarial verifiers re-ran each finding's original reproduction against Kiro's run-19 code in real Chromium, and mutation-tested Kiro's regression tests (reverting the fix in a temp copy to confirm the test fails).

| # | Status | Test meaningful |
|---|---|---|
| 1 | partially-fixed | yes |
| 2 | fixed | yes |
| 3 | fixed | yes |
| 4 | fixed | yes |
| 5 | partially-fixed | yes |
| 6 | partially-fixed | yes |
| 7 | partially-fixed | yes |
| 8 | fixed | yes |
| 9 | fixed | yes |
| 10 | fixed | yes |
| 11 | fixed | yes |
| 12 | partially-fixed | yes |
| 13 | fixed | yes |
| 14 | fixed | yes |
| 15 | partially-fixed | yes |
| 16 | partially-fixed | yes |
| 17 | fixed | yes |
| 18 | fixed | yes |
| 19 | partially-fixed | yes |
| 20 | partially-fixed | yes |
| 21 | fixed | yes |
| 22 | fixed | yes |
| 23 | fixed | yes |
| 24 | partially-fixed | yes |

## Finding 1: partially-fixed

**Evidence:** Re-ran both original setContent repros through walkTabs (source bundled with esbuild, real Chromium, channel=chromium). Iframe srcdoc page: trap:false, end 'body', steps one,x,y,z,two,three. Open-shadow page: trap:false, steps one,B1,B2,B3,two,three. Variants also pass with no false trap: closed shadow root, delegatesFocus, slotted content, shadow inside an iframe, nested iframes, iframe first or last, an iframe with no links, and cross-origin iframes (localhost vs 127.0.0.1, so out-of-process). Cross-origin and closed-shadow content is handled by the new 'repeat on a composite host is not a cycle' rule. Mutation check on a temp copy: making the deep-activeElement walk shallow fails 'same-origin frame and shadow contents are visited as steps', and removing the composite skip fails 'iframe-cross-origin.html is not a keyboard trap'.

**Remaining:** The composite-skip approach makes walks incomplete. (a) A cross-origin iframe counts as 1 focusable in stepCap, but every press inside it uses a step. Page: one + cross-origin iframe with 30 links + two, three, four. Result: end 'step-cap', 20 steps, 19 of them on the IFRAME, and 'two'/'three'/'four' never visited, so they would become false Lost Souls. Large embeds (video players, maps, ad frames) will hit this. (b) A real keyboard trap inside a cross-origin iframe or a closed shadow root is now never reported. Both end 'step-cap' with trapDetected:false. The same trap in an open shadow root is caught.

## Finding 2: fixed

**Evidence:** Probe pages were served with 'content-security-policy: style-src 'self'' (also 'style-src 'self'; script-src 'self'', 'default-src 'self'', 'default-src 'none'', 'sandbox; style-src 'self'', a meta-tag CSP, and a CSP page holding a cross-origin iframe). walkTabs never threw and no CSP violations were logged. On a CSP page whose external stylesheet sets 'a{transition: background-color 3s}', transitionDuration was '0s' after the walk and the focused background read rgb(0,0,0) at once, so the inspector stylesheet really applies. auditUrl and auditHtml on CSP pages resolved with collectionErrors []. I rebuilt audit.ts with walkTabs stubbed to throw the original addStyleTag CSP error. auditHtml resolved with collectionErrors [{step:'tab-walk', message:'page.addStyleTag: Applying inline style violates...'}] and an empty walk (endReason 'cdp-error'), so the audit-level wrap works. Mutation: swapping injectInspectorStyles back to page.addStyleTag fails 'findings 2 and 17: the walk works under style-src CSP'.

**Remaining:** Test-quality gaps only. The test's 'transitions really are off' check is vacuous: csp-style-src.html has no transition, so transitionDuration is '0s' by default. A mutation that keeps addStyleTag but swallows its error (CSP-blocked, so no rule applied) passed all 9 regression tests. Also, no test covers the audit.ts walkOrRecord path (walk failure becomes CollectionError 'tab-walk'); I verified it only with my stub.

## Finding 3: fixed

**Evidence:** Ran the original repro against code built from the current source (auditUrlWithHooks with timeoutMs 15000, 150-link page, CDP Page.crash). I sent the crash at 300, 1000, 1700, 2000, 2300, 2600, 3000, 3500, 4500 and 6000 ms, which covers load, settle, collectors and the walk. Every run rejected with AuditTimeoutError operation='browser-crash', at most about 1.4 s after the crash. busyCount was 0 afterwards and the idle browser had 0 contexts. Before the fix, the same repro hung until 15011 ms with 'full-audit', and the slot stayed busy. A whole-browser crash (CDP Browser.crash at 4 s) also gave 'browser-crash', and the dead browser was dropped from the pool (busy=0, idle=0). I never saw a crash hidden as a collection error. Test check: in a temp copy I removed only the guard's page 'crash'/'close' listeners from collectAudit. The 'finding 3' test then failed with Expected 'browser-crash', Received 'full-audit'.

**Remaining:** None blocking. The test assumes the crash at 5 s lands after loadPage on many-links.html. If CI is slow and the crash lands during load, the test still passes, but through the old loadPage-only handler, so it would not catch a regression in that run.

## Finding 4: fixed

**Evidence:** The original repro now passes. auditHtml with a default <ul><li>, <ol>, p::before/::after content, <details> (closed and open), and a mixed page (li::marker, a::after url(), q quotes, input file, progress, meter, select, video) all RESOLVED with collectionErrors []. Nodes without a DOM node are kept with backendDOMNodeId 0: role none for list markers, StaticText 'Hi ', InlineTextBox. Before the fix these pages threw AuditCollectionError 'ax-tree'. Consumers in collectors.ts guard with backendDOMNodeId > 0 (lines 262, 319), so id-0 nodes are not mismatched. Req 5.2 was amended in the spec. Test check: in a temp copy I put back the throw for missing backendDOMNodeId on non-InlineTextBox nodes. The 'finding 4' test then failed with 'Collection error in step "ax-tree" ... 5 AX node(s) lack backendDOMNodeId'. If the nodes were filtered out instead, the some(id===0 && role!=='InlineTextBox') assertion would also fail.

## Finding 5: partially-fixed

**Evidence:** Original repro `<a>a</a><input id=i><a>b</a><script>i.focus()</script>` now gives steps a, i, b (end 'body'). Also correct: the autofocus attribute, focus parked inside a same-origin iframe, focus parked inside an open shadow root, and a tabindex=0 div first. Mutation: making prepare() a no-op fails 'finding 5: elements before an autofocused field are still walked' (and the finding 6 test).

**Remaining:** The reset (blur, then focus a temporary tabindex=-1 marker at the top of body) is undone by common patterns, and the first focused element is then missing from steps. (1) A focusin-based focus trap, the focus-trap-library pattern and what apps/cursed-shop/checkout.html uses (restoreFocus at line 1023): the marker's focusin redirects focus back to the input. Probe 'dialog [input, ok] + document focusin -> input.focus()' gave steps ['ok'] only, end 'body'. The input is reachable but never recorded, so it becomes a false Lost Soul with no Invisible Wanderer check. (2) A native <dialog> opened with showModal(): the marker in body is inert, so focus() fails and Tab resumes after the autofocused control. Steps were ['ok'] only, and the dialog's input was missing (dialog first or last in the DOM). (3) A blur handler that refocuses (contrived): steps ['b'] only. Suggested direction: after prepare(), verify activeElement is body/none; otherwise begin the walk by recording the current activeElement, or use Shift+Tab from it.

## Finding 6: partially-fixed

**Evidence:** The simple autofocus case is fixed. The original keydown-trapped dialog probe (input:focus{outline:none;background:rgb(0,0,0)}, i.focus() at load) now records before rgb(255,255,255) and after rgb(0,0,0). Mutation: reading the baseline before prepare() fails 'finding 6: an autofocused element has a different before and after background' (Expected white, Received rgb(0,0,0)), so the test pins the ordering.

**Remaining:** Not fixed for the case the finding names: checkout.html's email input (step id '3'). Ground truth on the served page: the unfocused input has outline-style 'none', and focused it has 'solid 2px'. walkTabs on checkout.html records step 1 (id 3, INPUT) as before 'solid 2px' and after 'solid 2px'. The baseline is still the focused look because checkout's focusin restoreFocus handler refocuses the input when prepare() focuses its marker. So before==after, and Invisible Wanderer can still fire falsely on the cited element. The same happens on any page with a focusin-based modal trap open at load. The regression fixture (autofocus-background.html) has no focusin trap, so it misses this. The finding's alternative fix would cover it: read 'before' only when the element is not document.activeElement, and otherwise re-read it after it loses focus.

## Finding 7: partially-fixed

**Evidence:** Line 141 now reads `if (out === null || nodeIds.includes(out))`, so trap per Req 11.8 (option A of the finding), and tasks.md run-19 notes record the decision. The unit test 'no element focused after the escape test is a trap (Req 11.8)' and the integration fixture escape-to-body.html (blur on Escape, Shift+Tab swallowed) both pass. Mutation back to 'null = escaped' fails the unit test and the 'finding 7' integration test.

**Remaining:** Following 11.8 literally now gives false Cursed Loops for compliant dialogs that close on Escape. Probe A: a role=dialog aria-modal=true with a keydown Tab trap, placed first in the DOM and removed on Escape (the 'escbody' shape from the original evidence). Result: trapDetected:true, end 'trap', cycle escapable:false. Probe D: the same dialog hidden plus blur() on Escape, also a trap. Before the fix these were escapable. hauntings.md §5 (which wins over specs) says a modal that lets the user press Escape is compliant, and that focus moving to body is the natural end. The same dialog placed mid-page or last is correctly escapable. This conflict between steering and Req 11.8 needs a product decision. One option: treat null after Escape as escaped when the cycle members are no longer connected or focusable.

## Finding 8: fixed

**Evidence:** resolveCycle now calls `await rec.record(out)` (with styles, counted toward the cap) before starting the new segment. Real-browser probe: page x, [a,b] Tab-trap that closes on Escape, y, z gave steps x,a,b,a,x(landing, index 4, 8 style keys),a,b,y,z, end 'body'. On cursed-shop index.html the cookie-banner cycle's landing element is recorded as a step with all 8 after-style keys. Mutation (drop the landing record) fails both the segmenting property and 'the escape landing element is recorded as a step with styles'.

**Remaining:** Outside this finding: a cycle that can only be left backwards (Tab wraps b->a, Shift+Tab free) loops until the step cap. Each escape lands on the previous element and Tab re-enters the cycle, so later elements (y) are never visited: end 'step-cap', 4 escapable cycles.

## Finding 9: fixed

**Evidence:** Original repro (oklch(0.2 0 0) parent, white link) now gives adjacent-background-color 'oklch(0.2 0 0)'. Sweep over 20 values on a body of rgb(1,2,3): lab, lch, oklab, color(srgb), color(display-p3), oklch(none none none), and opaque color-mix are returned as serialized. Translucent or transparent values are skipped to the body colour: oklch '/ 0.5' and '/ 50%', color(... / 0), rgba(...,0.5), color-mix with transparent (serialized as color(srgb 0 0 0 / 0.5) and oklch(0 0 none / 0.5)), and alpha 0.00001. Mutation (alphaOf treats non-rgb as transparent) fails 'finding 9: an oklch ancestor is the adjacent background' (received rgb(255, 255, 255)).

**Remaining:** Minor, as the verifier note allows: translucent layers are skipped, not composited, so a 50% dark layer over white reports the ancestor colour as if certain.

## Finding 10: fixed

**Evidence:** pressTab (nextFocus), escapeTest, regionOf (trapResult), focusableIds, isComposite and prepare are now caught. regionOf returns null when no member resolves, instead of sending callFunctionOn with no target, and the audit wraps walkTabs into CollectionError 'tab-walk' (checked with a throwing-walker stub). Real-browser probes with no throw: a focus handler that navigates mid-walk (location.href), document.open/write on focus, body.innerHTML replacement on focus, and a trap whose buttons are replaced on Escape. walkTabs returned each time, and auditUrl resolved with collectionErrors []. Mutations removing each try block fail the matching unit tests: pressTab gives 2 failures, escapeTest 1, regionOf 1.

**Remaining:** Not a throw, so outside Req 11.12: after a mid-walk navigation the walk ends 'body' after 1 step and does not flag that it was cut short, so later focusables are simply absent. A CDP call that hangs, rather than rejecting, still turns into a whole-audit full-audit timeout because walkOrRecord rethrows when the guard has failed.

## Finding 11: fixed

**Evidence:** I re-ran the original probe through the real collectTextNodeStyles in a temp copy at D:\Temp\claude\364d479b65fa9d75\1c3cd30b-9bc0-47aa-9772-e13c7eb3c677\scratchpad\v1114\ws, with UNSEEN_CHROMIUM_CHANNEL=chromium. collectors.ts now resolves every colour on a 1x1 canvas. Results: oklch(0.95 0.02 100) on black resolves to a light colour and is certain. color-mix(...white) gives rgb(255,255,255), certain. lab(95 0 0) and lch(95 0 0) both give rgb(241,241,241). color(display-p3 1 1 1) gives white, and out-of-gamut p3 red is clipped to rgb(255,0,0). A mix computed as oklch(0.299998 ... none) gives rgb(46,46,46). Relative colour (oklch(from white l c h)) and light-dark() also resolve. Translucent non-rgb backgrounds are marked uncertain and never skipped: oklch(... / 0.5) and Tailwind-style color-mix(in oklab, white 50%, transparent) both gave backgroundUncertain true. A colour the canvas cannot parse now sets uncertain instead of being treated as transparent. Test check by reasoning: the test in collectors-regressions.int.spec.ts requires #oklch to have every channel above 200 and #colormix to be exactly rgb(255, 255, 255). The old code returns rgb(0,0,0) for both, so both assertions fail if the fix is reverted. Dropping only the normalise() step would also fail them, because the raw 'oklch(0.95 0.02 100)' string yields the number list [0,95,0,02,100]. My automated mutation run was still running when I had to report, so this reverted-fix check is reasoned, not executed.

**Remaining:** Minor gaps, outside the original background finding: (1) A text colour with alpha written in non-rgb syntax is not normalised. For example 'oklch(0.3 0.1 250 / 0.4)' is returned raw, so a consumer that only parses rgb() cannot read it. (2) Translucent text colour never sets backgroundUncertain, which was already true before this run. (3) The 'unresolvable colour gives uncertain' branch has no test. In practice computed colours always resolve, so a mutant that treats null as transparent would pass the suite.

## Finding 12: partially-fixed

**Evidence:** The ::before/::after check (paintsPseudo) works. On cursed-shop index.html, 3 of 64 entries are now uncertain: .hero h1, .hero p and .hero .eyebrow, still on rgb(78,52,46). An absolutely positioned ::after overlay of rgba(255,255,255,.6) also gives uncertain. The issue text also names 'positioned sibling images under the text', and that case is still missed. My probe put text in a black container over an absolutely positioned sibling <img> covering the container, and separately over a sibling div painting a linear-gradient. Both were reported as backgroundColor rgb(0, 0, 0) with backgroundUncertain:false. A ::before using content:url(image), positioned absolutely under the text, is also missed (certain on black). The check also over-marks text as uncertain. A 4x4px decorative corner ::before gradient marks the whole block uncertain. A ::before with display:none plus a background-image also marks the text uncertain, because getComputedStyle still reports the background-image. Both are conservative and lose recall rather than adding false hauntings. Test check: 'finding 12' (#pseudo-text) and 'findings 12/14/19' (.hero h1 uncertain) both fail if the paintsPseudo line is removed. The old code returned certain for both, as the review showed (0 of 64 uncertain).

**Remaining:** Text over positioned sibling layers is not detected: an <img>, <video>, or a div with a gradient or image, painted under the text but not an ancestor. The review called the elementsFromPoint hardening optional, but the issue explicitly lists this case. The same gap covers a ::before that uses content:url(). No test covers sibling overlays.

## Finding 13: fixed

**Evidence:** isFocusable now uses el.matches(':disabled') and el.checkVisibility({visibilityProperty:true}). My probe through buildDomAxMapping, each case inside an aria-hidden div: display:none button gives false; display:none ancestor gives false; visibility:hidden link and visibility:hidden ancestor give false; input in a disabled fieldset gives false; content-visibility:hidden gives false; a link inside a closed <details> with no summary gives false; a button with the hidden attribute gives false; a disabled button gives false. Cases that really can take focus are kept: a visibility:visible link inside a visibility:hidden parent gives true; an input in the first <legend> of a disabled fieldset gives true; an opacity:0 button gives true. Test check: veiled-mapping.html asserts #none, #hidden-link and #fieldset are false and #real is true. Reverting to the old (el as HTMLButtonElement).disabled check makes #fieldset true. Removing checkVisibility makes #none and #hidden-link true. Either revert fails the test.

**Remaining:** A control inside an inert subtree (<div inert><button>) still gives containsFocusable:true, although it cannot take focus. This case is not in the original finding; it is a small residual false-Veiled risk.

## Finding 14: fixed

**Evidence:** Every fix item from the review is now asserted. The .hero h1 entry on cursed-shop must have backgroundUncertain === true, and there must be more than 10 certain entries, so a hard-coded flag fails either way. The transparent chain must resolve to exactly rgb(10, 20, 30). Translucent rgba must give true. oklch must resolve to channels above 200. #invisible-opacity and #invisible-display must be absent. The fixture builds 150 .bulk paragraphs and the test requires exactly 157 entries, which needs two or more batches of 100. collectors.int.spec.ts now asserts some entries are uncertain and some are not, instead of only checking typeof. Test check by reasoning: a hard-coded false fails the hero assertion and the 'some uncertain' assertion; processing only the first batch gives at most 100 entries, not 157; removing the opacity:0 exclusion makes #invisible-opacity present. The full suite passes on the committed code: 12 of 12 in collectors.int and collectors-regressions.int.

**Remaining:** Still untested: (1) The white fallback. Both fixtures set an opaque body background, so changing the fallback to black would likely still pass. (2) The per-batch timeout and error path (withTimeout and the CollectionError push). (3) The display:none exclusion assertion is weak, because the zero-size check already excludes that element.

## Finding 15: partially-fixed

**Evidence:** The core fix is real. The original repro (auditHtml with 150 links, timeoutMs 800) now rejects at 840 ms with full-audit, and busyCount is 0 by the next 500 ms sample. Before the fix it stayed 1 until about 13 s. When the timeout fires during a queued acquire (UNSEEN_MAX_CONCURRENCY=1, audit B with timeoutMs 1000 queued behind audit A), B rejects at 1216 ms, its page is never requested (server hits only /a), and the pool ends with busy 0 and no queue. A renderer in an infinite JS loop is torn down at the timeout (6022 ms, 0 contexts left). Remaining hole, reproduced: on a warm pool, a timeout that fires while browser.newContext() is still pending leaks the context. runAudit does `await guard.race(loader.createContext(...))`, the race rejects, and the context that resolves later is never closed. With timeoutMs 1, 2 and 5, the pooled idle browser held 1, 2, then 3 orphan BrowserContexts. They were still open 3 s later, and the browser stays in the pool for up to 50 sessions. Test check: in a temp copy I put back the plain Promise.race timeout. The 'finding 15' test then failed (busyCount Expected 0, Received 1).

**Remaining:** Fix: if guard.race(createContext) rejects, attach a .then(ctx => ctx.close()) to the pending createContext promise, the same way acquireBrowser already handles a late pool slot. The window is narrow with the 60 s production timeout, but it breaks 'context always closed'. Also, the regression test only checks that the pool slot is freed. I removed the `await closeContext(context, browser)` call in a temp copy and all 7 audit-lifecycle tests still passed, so nothing checks that the context is actually closed despite the test's name. A browser.contexts().length assertion would catch both problems.

## Finding 16: partially-fixed

**Evidence:** What works: chunked bodies with no content-length in the main frame are now counted. Three 20 MB scripts gave AuditResourceLimitError total-weight=52429003 in 1.9 s. A same-origin iframe loading 3x20 MB also hit total-weight. The 700-<img> page gives request-count=501, and only 61 image requests reached the server (the original evidence was 701). The pool is freed in every case. What fails (new repro): the byte meter uses a CDP session on the top-level page target only, so out-of-process frames and workers are not metered. A cross-origin iframe (http://localhost:port/frame inside a 127.0.0.1 page, which is an OOPIF) loading 3x20 MB of scripts: the server sent 60 MB, the audit RESOLVED, and totalBytes=306. A dedicated Web Worker fetching 3x20 MB: the server sent 60 MB, the audit RESOLVED, and totalBytes=290. Requests from both are still counted (reqs=5), but the 50 MB weight limit can be bypassed by any page with a cross-site iframe or a worker. The original 3x20 MB invalid-PNG repro now gives totalBytes about 3 MB, because Chromium cancels images it cannot decode, so this is not a bypass. Test checks: zeroing the dataReceived accounting in a temp copy makes the chunked test fail. Removing both the post-breach blocking and the onLimit teardown makes the request-count test fail.

**Remaining:** Meter OOPIF and worker targets too, for example with Target.setAutoAttach {flatten:true} and Network.enable on each attached session, or with browser-level CDP. Add a cross-origin-iframe test and a worker test for the 50 MB limit. Test gaps: (a) with only the 'block every request once limit is set' line removed, the request-count test still passes, because the guard teardown alone keeps server hits at or below 500, so that part of the fix is not isolated. (b) The assertion imageHits <= 500 is off by one: the document is request 1, so at most 499 images should pass. In practice only about 61 do.

## Finding 17: fixed

**Evidence:** Same root cause as finding 2. auditUrl on a page served with 'content-security-policy: style-src 'self'; script-src 'self'' (the finding's exact header) resolved with 3 Tab steps and collectionErrors []. 'default-src 'none'' and a meta-CSP auditHtml also resolved cleanly. bypassCSP stays false, and the rule is injected through CDP CSS.createStyleSheet + setStyleSheetText; it really takes effect (a 3s stylesheet transition reads 0s after the walk). If walkTabs throws anyway, audit.ts records CollectionError {step:'tab-walk'} instead of a raw PlaywrightError (stub probe). The addStyleTag-revert mutation fails the CSP regression test.

**Remaining:** Same test gaps as finding 2: the transition assertion is vacuous because the fixture has no transition (a swallow-the-error 'fix' passes), and there is no audit-level CSP or tab-walk-CollectionError test.

## Finding 18: fixed

**Evidence:** The property now asserts `after.every((x) => visited.has(x))` (title: 'visits all N, landing element included'). The fake's escapeTest returns after[0] and pressTab skips it, so after[0] can appear in steps only through the new landing record, and the N=1 case is no longer vacuous. The step-index/cap property uses ids('x', 2, 30). A separate deterministic test asserts steps ['a','b','a','c'] with styles on the landing step. Mutation (remove `await rec.record(out)`) fails both the property and the deterministic test; the unchanged tests pass (21/21).

**Remaining:** The first property still allows N=1 through ids('x', 1, 30); that is fine now, since after.every covers the landing element.

## Finding 19: partially-fixed

**Evidence:** Test side: the requested assertions exist. .hero h1 must be uncertain (looked up by backendDOMNodeId via CDP in tests/fixtures/dom.ts). Inline cases cover a semi-transparent ancestor (#translucent gives true), a background-image (#gradient gives true) and an exact-rgb transparent chain (#chain gives rgb(10, 20, 30)). A test-local check: the old code reported .hero h1 as certain and the new test requires true, so a revert fails it. Collector side: the review's fix also says 'pseudo-element or overlay gradients count as uncertain'. Pseudo-element gradients now count, but a gradient on an absolutely positioned overlay sibling div is still reported as certain. My probe #sibdiv gave backgroundColor rgb(0,0,0), backgroundUncertain false.

**Remaining:** Overlay gradients and images painted by non-ancestor sibling elements are still treated as certain, and no test covers them. The weak /^rgba?\(/ assertion is still in collectors.int.spec.ts task 9, but the regressions spec now has exact-value cases alongside it.

## Finding 20: partially-fixed

**Evidence:** Method: I made a copy of packages/core and apps/cursed-shop at D:\Temp\claude\364d479b65fa9d75\1c3cd30b-9bc0-47aa-9772-e13c7eb3c677\scratchpad\v2023, with node_modules linked by a junction. I applied 23 single-line mutations to tab-walker.ts with D:\Temp\claude\364d479b65fa9d75\1c3cd30b-9bc0-47aa-9772-e13c7eb3c677\scratchpad\mut\mutate.mjs and ran walk.test.ts, tab-walker.test.ts and both tab-walker int specs (UNSEEN_CHROMIUM_CHANNEL=chromium). Baseline: 34/34 unit tests and 11/11 int tests pass. No repo files were changed.

What Kiro did: walk.test.ts gains a block 'Tab walk cycle detection (design properties 1-3, through runWalk)' with 3 fast-check properties (100 runs each) that drive runWalk through a scripted TabDriver.

These tests catch real regressions in runWalk's cycle logic:
- M1: cycle detection removed (first=-1). 10 unit tests fail.
- M4/M5: includes-all check forced to false or true. 2 and 7 fail.
- M6: visited.add dropped. 2 fail.
- M7: only consecutive repeats detected. 5 fail.
- M8: cycle nodeIds drop the first member. 5 fail.

So the main complaint, that the property tests cover nothing that runs, is resolved.

I also wrote a stronger probe property (probe20.test.ts, 300 runs): a repeat of element j at step k, before every focusable is visited, must give cycle nodeIds = seq[j..k) and startStepIndex = j. runWalk passes it, so the production logic is right.

The ported tests are weaker than the originals, and some regressions get through:
- The ported Property 2 always repeats all[0] with repeatAt in {1,2}, so every cycle starts at step 0.
- M3: cycle nodeIds set to the whole segment instead of seq[first..]. Every unit test passes; only the cookie-banner int test catches it.
- M9: startStepIndex hard-coded to 0. Every unit and int test passes.
- M10: no segment reset after an escapable cycle (Req 11.7). Every unit and int test passes.
- M2/M11: count semantics instead of membership, including literally calling detectCycle. Every test passes.

**Remaining:** 1) detectCycle is still exported dead code (tab-walker.ts:33, no production caller). Its semantics now differ from runWalk: for seq ['a','b','x','a'] with 3 focusables, detectCycle returns hasCycle:false while runWalk declares a trap. tab-walker.test.ts still labels its detectCycle tests 'Feature: audit-engine, Property 1/2/3'.
2) The spec still says the dead helper is used: design.md §Properties 1-3 (lines 730-746, 812-852) still target detectCycle, and tasks.md task 13 (line 136) still says the walk runs the escape test 'when detectCycle returns hasCycle: true'. The run-19 notes say nothing about it. Fix: delete or re-point detectCycle and amend the spec.
3) The ported properties should pick a random repeat index j (not always 0) and assert exact nodeIds and startStepIndex, so M3 and M9 fail at unit level.
4) A test for the Req 11.7 segment reset is needed, so M10 fails.

## Finding 21: fixed

**Evidence:** The vacuous test was removed. The metadata.google.internal test is now honestly named 'without a DNS lookup'. The new safe-fetch-dns.test.ts mocks 'dns/promises' at top level with named resolve4/resolve6 exports. It checks that a hostname not on the list, resolving to 10.x, 127.x, 169.254.169.254, 192.168.x, fe80::1, ::1, or a mix of public and private addresses, is blocked, and that resolve4 was called with that hostname. It also checks that a public-only name is allowed. All 8 tests plus 25 others pass. The new safe-fetch.int.spec.ts calls installSafeFetchPolicy directly with a policy that throws. Test checks in a temp copy: making the catch branch fail open (route.continue) made the test fail (Expected 'blocked', Received 'fetched'). Putting back the invalid abort code 'blocked' made it fail with 'route.abort: Unknown error code: blocked'. The DNS tests would fail if hostname resolution or the IPv6 check were removed.

**Remaining:** These are new safe-fetch.ts bugs that the mocks hide; they are not part of this finding. (1) The IPv6 cases mock resolve4 as resolving to []. With a resolver that rejects with ENODATA for AAAA-only names (c-ares commonly does), resolveAndCheck returns false in its catch before it calls resolve6. A probe test with resolve4 rejecting {code:'ENODATA'} and resolve6 returning ['::1'] gave {block:false}. On this machine, real resolve4('ipv6.google.com') returned [], so whether this happens depends on the resolver. (2) An AAAA record of ::ffff:127.0.0.1 (IPv4-mapped) is not blocked: the probe gave {block:false}. Both need tests with resolve4 rejecting ENODATA and with mapped addresses.

## Finding 22: fixed

**Evidence:** New assertions cover each requested case. The shop .promo-strip must match {ariaHidden:true, hasAxNode:false, hasVisibleText:true, containsFocusable:true}. Inline #icon (an svg with role=presentation) must have isPresentational true, hasVisibleText false and containsFocusable false. #real must have containsFocusable true, and #none/#hidden-link/#fieldset must have false. #offscreen (position:absolute; left:-9999px; aria-hidden, with text) must be absent from the mapping, which exercises the scrollable-area intersection. Test check by reasoning: isPresentational forced to false fails the #icon assertion. containsFocusable forced to false fails #real and the promo strip; forced to true fails #none and #icon. Removing the off-screen intersection lets #offscreen into the mapping and fails the test. I also confirmed the shop's own feature-icon svgs map to isPresentational true with hasVisibleText and containsFocusable false (14 svgs), though the test uses an inline svg instead.

**Remaining:** The DomAxMapping.isFocusable field (the element's own focusability) still has no direct assertion; only containsFocusable is tested. Shop isFocusable count is 36 on index.html, but nothing pins it. The review's fix list did not require this explicitly.

## Finding 23: fixed

**Evidence:** All three fake-driver tests the review asked for now exist in walk.test.ts:
- (a) step cap across segments, asserting stepCapReached and steps.length === stepCap(n);
- (b) a styles() failure marks cdpError and the walk continues, plus a separate test for a failed baseline read;
- (c) a pressTab failure records a cdpError step and the walk continues, plus repeated failures ending with cdp-error.

The int test tab-walker.int.spec.ts:60-68 asserts that `before` has the same keys as `after` for each non-cdpError step, and that .logo has before outline-style 'none' and after not 'none'.

Mutation results (reverting each part of the fix):
- N1: nextFocus try/catch removed, so pressTab throws again. 2 unit tests fail.
- N2/N3: styles() errors uncaught, or caught without flagging. 1 unit test fails each.
- N6: stepCapReached forced false. 2 fail.
- N7: cap off by one. 2 fail.
- N8: cap counted per segment. 1 fails.
- N9: baseline failure not flagged. 1 fails.
- N10: no failure step recorded. 1 fails.
- N11: no consecutive-failure cap. 1 fails.
- N4: before always {}. No unit test fails, but the new int assertion in the index test fails (plus the finding-6 test).
- N5: before = after. The int index test fails.

Real-browser probes (p23.int.spec.ts in the scratch copy) sabotage the walker's CDPSession.send:
- P1: the deep activeElement Runtime.evaluate fails once mid-walk. walkTabs does not throw, records step '-' with cdpError, continues, and ends 'body'.
- P1b: DOM.describeNode for the active element fails once. Same result. activeElementBackendId no longer swallows the error into null, which was the verifier-note issue.
- P1c: every activeElement read fails. endReason 'cdp-error', trapDetected false, no throw.
- P4: DOM.resolveNode fails for one link's step read. That step has cdpError true and the walk ends 'body'.
- P2: a page that appends a new focusable on every focusin. Real walk gives stepCapReached true, endReason 'step-cap', steps 12 = stepCap(1).

**Remaining:** Not regressions of the fix, but gaps next to it.

1) New defect, probe P3. Focusables that were not in the pre-walk set get focusSnapshot.before = {} with cdpError:false. Examples: submenu links revealed by :focus-within, or an escape-landing element outside the list. Page: nav.menu:focus-within .sub{display:block}. Result: steps s1 and s2 have beforeKeys=0, afterKeys=8, cdpError=false. This breaks the very invariant the new int test asserts ('before has same keys as after for every non-cdpError step'); it only holds on the cursed-shop fixture. The classifier cannot tell 'never read' from a real baseline.
2) Req 11.4 says the captured properties 'SHALL include exactly' outline-offset. FOCUS_STYLES_FN does not read outline-offset, and the int test's key list omits it too. hauntings.md's Chromium-quirk rule refers to outline-offset deltas. Either the spec or the code needs amending.
3) When a Tab press's activeElement read fails, the element that received focus is never recorded. In P1 link 'two' is skipped and its focus indicator is never checked. That is allowed by 'record with available data', but worth noting.
4) backendIdOfObject still swallows errors in backendIdsOf (focusableIds), so a CDP failure there silently shrinks focusableCount and the step cap.
5) cdpError and stepCapReached are reached only in unit tests with the fake driver, not in any real-browser test.

## Finding 24: partially-fixed

**Evidence:** Most of the missing criteria now have tests: the full-audit timeout (timeoutMs 3000 then pool idle), the browser-crash typed error, the navigation timeout typed error (fetch('/hang'), navigationTimeoutMs 1500), more than 500 requests giving AuditResourceLimitError request-count, a chunked body over 50 MB giving total-weight, and one resource over 10 MB going into abortedResources while the audit continues. AuditContextError has a unit test in browser.test.ts with a fake browser whose newContext throws. All 7 audit-lifecycle tests pass on current code. Targeted reverts in a temp copy (crash listeners, the Promise.race timeout, byte counting, limit enforcement, the AX throw) each made the matching test fail.

**Remaining:** Context closure on the failure path is still not tested. With `await closeContext(context, browser)` replaced by a no-op, all 7 audit-lifecycle tests passed. They only check pool.busyCount, which drops to 0 whether or not the context is closed. That gap also hides the createContext-window context leak (see finding 15). Other gaps: no test for weight from cross-origin iframes or workers (see finding 16); the request-count test does not isolate post-breach blocking and has an off-by-one bound (500 should be 499); AuditContextError is only tested at unit level, and nothing checks that auditUrl does not navigate after the error (Req 14.5); FULL_AUDIT_TIMEOUT_MS, MAX_REQUESTS and MAX_TOTAL_BYTES are still not referenced by any test, which is acceptable.
