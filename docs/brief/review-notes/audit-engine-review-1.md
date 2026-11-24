# Product-lead review: audit-engine tasks 5–16 (Claude-written code, before Kiro adoption)

Date: 2026-11-24. Method: Claude Code review workflow with 4 area reviewers (tab-walker, collectors, audit lifecycle, test quality). Each finding was re-checked by an independent skeptic. **47 confirmed findings**; 0 rejected as not real or not spec-required. Most were reproduced with probe pages in real Chromium.

Run 19 (`prompts/19-kiro-review-runs-10-11.md`) and run 19b must fix every finding below, in order, and add the regression test each one names.

## 1. [blocker] packages/core/src/runner/tab-walker.ts:230 (tab-walker)

**Issue:** False Cursed Loop on any page that has an iframe or a shadow-DOM component with 2 or more focusables. pressTab reads the top-level document.activeElement, which stays on the <iframe> or the shadow host while focus moves through its contents. The same id shows up twice, the escape test's Shift+Tab stays inside, and runWalk declares a trap. The rule in hauntings.md §5 is about focus that cannot leave a cycle, but here focus is moving normally.

**Evidence:** A probe ran walkTabs on setContent pages in a temp dir. Page `<a/><iframe srcdoc='3 links'/><a/><a/>` gave {trap:true,end:'trap',steps:['3','4','4'],cycles:[{nodeIds:['4'],escapable:false}],region:['4']}. Page `<a/><my-el>` (open shadow root with 3 buttons) `<a/><a/>` gave {trap:true,steps:['3','7','7'],cycles:[{nodeIds:['7'],escapable:false}]}. The cause is that activeElementBackendId (cdp.ts:48-51) never goes into shadowRoot.activeElement or the frame's own document.

**Fix:** Find the deepest focused element: follow shadowRoot.activeElement down, and for same-origin iframes walk contentDocument.activeElement (or use CDP DOM.getDocument with pierce plus per-frame sessions). For cross-origin frames, key the step on (frame element + an in-frame identity), or treat repeats on the same iframe/host id as 'inside a composite' instead of a cycle. Add integration fixtures for an iframe and a shadow component, and assert trapDetected === false for both.

**Verifier note:** Reproduced on Chromium: an iframe page with 3 in-frame links and an open-shadow component with 3 buttons both returned trapDetected:true, endReason:'trap' with a one-node cycle on the iframe/host id, because activeElementBackendId (cdp.ts:48-51) reads only the top-level document.activeElement. The fix is right: descend shadowRoot.activeElement, and use contentDocument for same-origin frames or per-frame/OOPIF CDP sessions for cross-origin ones. Also treat a repeat on an iframe/shadow-host id as 'inside a composite' rather than a cycle, and add fixtures asserting trapDetected===false.

## 2. [blocker] packages/core/src/runner/tab-walker.ts:258 (tab-walker)

**Issue:** page.addStyleTag throws on any site whose CSP has a style-src without 'unsafe-inline'. walkTabs does not catch the error, and audit.ts:122 calls walkTabs with no try/catch. The whole auditUrl rejects instead of recording a 'tab-walk' CollectionError. Strict style-src CSPs are common on production sites.

**Evidence:** Probe: a local server sent `content-security-policy: style-src 'self'`, then walkTabs(page) was called. It threw `page.addStyleTag: Applying inline style violates the following Content Security Policy directive 'style-src 'self''`. browser.ts:261 creates the context with bypassCSP:false.

**Fix:** Inject the transition-killing rule in a way CSP does not block, e.g. CDP `CSS.enable` + `CSS.createStyleSheet({frameId})` + `CSS.setStyleSheetText` (inspector stylesheets are exempt from CSP). Also wrap walkTabs in audit.ts so a failure becomes a CollectionError {step:'tab-walk'} with an empty TabWalkResult instead of failing the audit. Add a CSP integration test.

**Verifier note:** Reproduced: with a `style-src 'self'` header, walkTabs threw 'page.addStyleTag: Applying inline style violates ... Content Security Policy'. audit.ts:122 has no catch, so auditUrl rejects (only finally blocks run), and browser.ts:261 sets bypassCSP:false. The fix holds: inject through a CDP inspector stylesheet (CSS.createStyleSheet + CSS.setStyleSheetText, which CSP does not block), and wrap walkTabs so a failure becomes a CollectionError{step:'tab-walk'}.

## 3. [blocker] packages/core/src/runner/browser.ts:292 (audit-lifecycle)

**Issue:** The crash handler only covers loadPage. It is removed in the finally block, so if the renderer crashes later (during the collectors or the Tab walk) the error is not turned into AuditTimeoutError('browser-crash') (Req 1.8). Worse, CDP calls on the crashed page never settle, so runAudit hangs for good. Its finally blocks never run, which means the BrowserContext is never closed and the pool slot is never released. With the default concurrency of 2, two crashes wedge the whole pool permanently.

**Evidence:** I reproduced this in a scratch script. auditHtml ran with timeoutMs 15000, and I sent CDP Page.crash to the page 6 s in, during the walk. The call rejected at 15011 ms with AuditTimeoutError operation='full-audit', not 'browser-crash'. Then from t=20s to t=55s it kept reporting `busy=1 open contexts=1`. Separately, collectAxTree on a crashed page never resolved and was still hanging when the 120 s timeout killed the script, while runAxe returned {step:'axe', message:'page.evaluate: Target crashed'}, so a crash is also hidden as a non-fatal collection error.

**Fix:** Keep a crash/close listener (page 'crash' and 'close', plus browser 'disconnected') attached for the whole of runAudit. Race every collector and walkTabs against that crash promise, and throw AuditTimeoutError('browser-crash') from it. Combine this with the timeout fix in audit.ts so the context is always closed and the slot always released.

**Verifier note:** Confirmed: loadPage removes its page.on('crash') listener in its finally block (browser.ts:292), so a crash after loading has no handler. In my scratch run, collectAxTree on a page crashed with Page.crash was still pending after 10 s, so runAudit never reaches its finally blocks (context.close and pool.release); this breaks Req 1.8. The fix is right: keep a crash/close/disconnected rejection racing the whole of runAudit, and pair it with the timeout teardown from finding 2.

## 4. [blocker] packages/core/src/runner/ax-tree.ts:77 (audit-lifecycle)

**Issue:** collectAxTree throws a fatal AuditCollectionError whenever any non-InlineTextBox AX node lacks backendDOMNodeId. Chromium emits such nodes for list markers, CSS ::before/::after generated text and <details>. So any page with a default-styled <ul>/<ol>, generated content or <details> fails the whole audit. Almost every real site is affected. The cursed-shop fixtures pass only because they use `list-style: none` and `content: ''`.

**Evidence:** From a scratch run, PageLoader plus collectAxTree gave: pseudo `p::before{content:"Hi "}` THREW AuditCollectionError '1 AX node(s) lack backendDOMNodeId (first: -1000000003)'; `<ul><li>` THREW (3 nodes); `<details>` THREW; select/media/iframe/svg were ok. The nodes without an id were `StaticText:"Hi"` and role `none` (list marker). End to end: auditHtml('<main><h1>Shop</h1><ul><li>One</li></ul></main>') threw AuditCollectionError step='ax-tree'.

**Fix:** Only fail on nodes that should have a DOM node, or (simpler) keep pseudo/marker/generated nodes with backendDOMNodeId 0, as is already done for InlineTextBox. Add an integration test with a default <ul>, a ::before content rule and <details>. Raise the Req 5.2 wording with the spec owner, since taken literally it makes real pages unauditable.

**Verifier note:** Confirmed: in my scratch run, auditHtml threw AuditCollectionError step 'ax-tree' for a default <ul><li> and for p::before{content}. The code does follow the literal Req 5.2 (and already makes an off-spec exception for InlineTextBox), so the fix needs a spec amendment from the owner. Under Req 5.1 these nodes should be kept with backendDOMNodeId 0, not filtered out.

## 5. [major] packages/core/src/runner/tab-walker.ts:118 (tab-walker)

**Issue:** The walk starts from wherever focus already is and never resets to the start of the document. If a page autofocuses an element, or a collector leaves focus somewhere, every focusable before that point is missing from steps. That causes false Lost Soul results (it relies on absence from steps) and skips Invisible Wanderer checks for those elements.

**Evidence:** Probe page: `<a>a</a><input id=i><a>b</a><script>i.focus()</script>`. walkTabs returned steps ['6'] (only 'b') with endReason 'body'. Neither 'a' nor the input was ever recorded.

**Fix:** Before the first Tab, blur document.activeElement and move the sequential-navigation starting point to the top of the document, e.g. focus a temporary tabindex=-1 element at the top of body, then remove it, or collapse the selection to body start. Then start pressing Tab. A focusin-based trap like checkout's still redirects into the modal, so trap detection keeps working.

**Verifier note:** Reproduced: `<a>a</a><input id=i><a>b</a><script>i.focus()</script>` gave steps ['b'] only with endReason 'body', so 'a' and the input are missing and would feed false Lost Soul results. The fix (blur, then move the sequential-focus start point to the top of the document) is right, with one correction: checkout.html's trap is keydown-based and only redirects from the first or last modal element, not focusin. So the walk from the top would cross page content before reaching the modal, and the checkout trap integration test must be rechecked after the change.

## 6. [major] packages/core/src/runner/tab-walker.ts:104 (tab-walker)

**Issue:** The 'before' styles are captured once before the walk for every focusable. An element that is already focused at that moment (autofocus, or a timer-opened modal that focuses its first field, as checkout.html does) gets its focused look recorded as 'before'. before then equals after, so a visible background or border change on focus is erased and Invisible Wanderer fires falsely. Req 11.4 and hauntings.md §6 compare the unfocused and focused looks.

**Evidence:** Probe: a modal with `input:focus{outline:none;background:rgb(0,0,0)}` and i.focus() at load. The step for the input shows `before rgb(0, 0, 0) -> after rgb(0, 0, 0)`, although its unfocused background is the default. checkout.html:991 does `firstInput.focus()` before the walk, and its email input (step id '3' in the checkout walk) is in the same situation.

**Fix:** Blur the active element (and reset the starting point, as in the previous finding) before taking the baseline. Alternatively, read 'before' for an element only when it is not document.activeElement, and otherwise re-read it after it loses focus. Add a test asserting before != after for an autofocused element with a background focus style.

**Verifier note:** Reproduced: in a keydown-trapped dialog whose input has `:focus{outline:none;background:rgb(0,0,0)}` and is focused at load, the input's step recorded before=rgb(0,0,0), after=rgb(0,0,0). The unfocused look was lost, which breaks the before/after comparison in Req 11.4 and hauntings.md §6 rule (c). The fix is right: blur the active element (or re-read the baseline once the element loses focus) before taking 'before', and add a test for it.

## 7. [major] packages/core/src/runner/tab-walker.ts:141 (tab-walker)

**Issue:** When no element is focused after the escape test, the code treats the cycle as escapable (`out === null || ...`). Req 11.8 and design.md ('or if no element is focused, a keyboard trap is declared') say this case must set trapDetected = true. The deviation is not listed in the tasks.md implementation notes. The walk then also resumes from body and re-walks the page from the top.

**Evidence:** tab-walker.ts:141 `const escaped = out === null || !cycleIds.includes(out)`. Probe 'escbody' (a dialog that removes itself on Escape) recorded cycles[0].escapable:true after escapeTest returned null. No unit test covers escapeTest returning null: fakeDriver.escapeTest always returns after[0], which is never null when after has at least one element.

**Fix:** Either follow Req 11.8 (null means trap), or, if the team decides that focus returning to body after Escape counts as escaping (arguably consistent with steering 'focus moving to body is the natural end'), amend requirements.md 11.8 and design.md and record it in the tasks.md notes. In both cases add a walk.test.ts case where escapeTest returns null.

**Verifier note:** Confirmed: line 141 treats out===null as escaped, which contradicts Req 11.8 and design.md ('or if no element is focused, a keyboard trap is declared'), and tasks.md does not record the deviation. In the escbody probe the first cycle was recorded escapable:true and the next segment started empty, which proves escapeTest returned null, and fakeDriver never returns null. The fix is right: follow 11.8, or amend requirements, design and the tasks notes, and add a null-escape unit test either way.

## 8. [major] packages/core/src/runner/walk.test.ts:54 (tab-walker)

**Issue:** The element focused by the escape test's Shift+Tab is never recorded as a TabStep, and its after styles are never captured. Req 11.10 requires every step, including those taken during the escape test, to be recorded. The segmenting property test is written around the gap: it checks only after.slice(1), so it would pass even if the first post-escape element were never visited. When after has length 1 the check is vacuous.

**Evidence:** tab-walker.ts:140-152 pushes no step for `out`, only `segment=[out]; visited.add(out)`. In fakeDriver, escapeTest returns after[0] and pressTab then does `ai++` first, so after[0] can never appear in steps. The property asserts `after.slice(1).every((x) => visited.has(x))`, which does not match the amendment wording 'visits all N'.

**Fix:** After escapeTest, record a TabStep for `out` (with styles and cdpError), counted toward the cap. Change the property to `after.every(...)` and use ids('x', 2, 30), or assert on the N elements after the landing element.

**Verifier note:** Confirmed: the element the escape test's Shift+Tab lands on is only added to the segment and visited set, and is never pushed as a TabStep with styles, although Req 11.10 requires steps 'during' the escape test to be recorded. The property checks after.slice(1), so it is vacuous when after has length 1 and can never see after[0], since the fake's pressTab skips it. The fix is right: record a TabStep for `out` (it counts toward the cap) and assert after.every(...) on steps.

## 9. [major] packages/core/src/runner/tab-walker.ts:181 (tab-walker)

**Issue:** adjacent-background-color only parses `rgb()/rgba()`. Chromium serializes CSS Color 4 values such as oklch(), lab() and color() in their own syntax, so those ancestors are skipped and the walker falls back to white or a further ancestor. Every Tailwind v4 site (oklch palette) gets the wrong adjacent background for the 3:1 checks in §6. A white focus ring on a dark oklch panel is then compared against white and flagged invisible.

**Evidence:** Probe page `<div style="background: oklch(0.2 0 0)"><a style="color:white">` produced after['adjacent-background-color'] = 'rgb(255, 255, 255)'.

**Fix:** Detect opacity without parsing the colour: e.g. paint it on a 1x1 canvas, or use CSS.getComputedStyleForNode / a color() normalisation through a temporary element. Or accept any colour function and read alpha from the `/ a` component, treating non-rgb functions with no alpha as opaque. Return the serialized value as-is and let the classifier convert.

**Verifier note:** Reproduced: `<div style="background:oklch(0.2 0 0)"><a style="color:white">` produced adjacent-background-color 'rgb(255, 255, 255)', because the regex accepts only rgb()/rgba(), so oklch/lab/color() ancestors are skipped. The fix is right. The simplest version: treat any non-rgb colour function as opaque unless it has a `/ alpha` component below 1 (and skip the keywords 'transparent' and rgba(...,0)), return the serialized value as-is, and let the classifier convert it.

## 10. [major] packages/core/src/runner/tab-walker.ts:227 (tab-walker)

**Issue:** Req 11.12 says a CDP failure while reading activeElement or styles must mark the step cdpError and continue the walk. Only the `after` styles read is caught. Failures in pressTab/activeElementBackendId, escapeTest, focusableIds and regionOf propagate out of runWalk/walkTabs, and because audit.ts:122 does not catch them, the whole audit fails. regionOf also always throws when every member fails to resolve, since it then calls Runtime.callFunctionOn with neither objectId nor executionContextId.

**Evidence:** tab-walker.ts:119 `const id = await driver.pressTab()` has no try. Lines 140 and 144 (escapeTest/regionOf) have no try. Line 244 `objectId: objectIds.find((o) => o) ?? undefined`. audit.ts:122 `const tabWalkResult = await walkTabs(page)` has no catch. Typical trigger: 'Execution context was destroyed' when a focus handler navigates mid-walk.

**Fix:** Catch inside the driver calls: on an activeElement failure, push a step with cdpError:true and continue (or end with a defined endReason). If regionOf fails, fall back to the cycle ids only. Wrap walkTabs in audit.ts and turn its failure into a CollectionError {step:'tab-walk'}. Add unit tests with a driver whose pressTab/styles throw.

**Verifier note:** Confirmed: pressTab/activeElementBackendId (line 119), escapeTest (140), regionOf (144) and focusableIds have no try/catch, and audit.ts:122 has no catch, so a CDP failure such as 'Execution context was destroyed' rejects the whole audit, against Req 11.12. regionOf also sends Runtime.callFunctionOn with neither objectId nor executionContextId when every resolve fails, and CDP rejects that call. The fix is right: catch per call, fall back to the cycle ids when regionOf fails, wrap walkTabs in a CollectionError, and add tests with a throwing driver.

## 11. [major] packages/core/src/runner/collectors.ts:87 (collectors)

**Issue:** The Fog background walk treats any background colour not written as rgb()/rgba() as transparent. It skips that layer without setting backgroundUncertain, so it reports the wrong 'effective' background as certain. Chromium keeps CSS Color 4 values in their own syntax (oklch(), lab(), color(srgb ...)). Tailwind v4's default palette is all oklch, so this hits a large share of modern sites. The result is false Fog hauntings, or missed ones, recorded with no uncertainty.

**Evidence:** parse() uses /rgba?\(([^)]+)\)/, returns null, and line 101 does `if (!col || col.a === 0) continue`. Probe (page.setContent, real collectTextNodeStyles): <div style=background:#000><p style='background-color:oklch(0.95 0.02 100);color:rgb(51,51,51)'> was reported as backgroundColor 'rgb(0, 0, 0)', backgroundUncertain false, but the computed value was 'oklch(0.95 0.02 100)', a near-white background. A color-mix(in srgb, white 50%, white) parent (computed 'color(srgb 1 1 1)') also came back as rgb(0,0,0) on black text, which is a certain 1:1 contrast failure on what is really a white background.

**Fix:** Normalise the colour in the page before testing alpha: paint it on a 1x1 canvas (ctx.fillStyle = c; read back with getImageData) or parse every CSS Color 4 form. If a colour cannot be resolved, set backgroundUncertain = true. Never treat it as transparent.

**Verifier note:** Confirmed by a probe through the real collectTextNodeStyles: a p with background-color oklch(0.95 0.02 100) inside a black div came back as backgroundColor rgb(0, 0, 0) with backgroundUncertain false, because parse() only matches rgb()/rgba() and line 101 treats null as transparent; this breaks amendment 1 ('the alpha of every background-color'). The fix is right: resolve the colour in the page (canvas fillStyle/getImageData, which also gives the alpha), and set uncertain = true when a colour cannot be resolved instead of skipping it.

## 12. [major] packages/core/src/runner/collectors.ts:97 (collectors)

**Issue:** backgroundUncertain only looks at each ancestor's own background-image and background-color. It misses image or gradient layers painted by pseudo-elements (::before/::after overlays) and by positioned sibling images under the text. That breaks amendment 1 and the steering rule (hauntings.md §3: when text sits on an image or gradient, mark it contrastUncertain and do not flag it). The project's own fixture shows the miss.

**Evidence:** In apps/cursed-shop/index.html (lines 111-133), .hero has background-color #4e342e, and .hero::before is an absolute radial-gradient + linear-gradient layer under .hero h1/p (z-index 1). Running collectTextNodeStyles on that fixture gives 'TOTAL 64 UNCERTAIN 0': the hero text is reported against #4e342e as certain. The common 'hero text over ::before photo overlay' pattern would be scored against the fallback colour and could be flagged.

**Fix:** During the ancestor walk, also read getComputedStyle(cur, '::before') and getComputedStyle(cur, '::after'). If either has content other than 'none' and a background-image other than 'none' (or a translucent colour), set uncertain = true. Optionally use document.elementsFromPoint at the text's centre to catch <img>/<video> or positioned layers under the text. Then add a fixture assertion for the hero.

**Verifier note:** Confirmed: on apps/cursed-shop/index.html all 64 entries have backgroundUncertain false, and the hero h1/p/eyebrow are reported as certain on rgb(78, 52, 46) even though .hero::before paints a gradient under them; the steering text (hauntings.md §3: an 'effective background' that is an image or gradient must be uncertain) is about what is actually painted, not just ancestor background-image. The fix is right: during the walk, check getComputedStyle(cur,'::before'/'::after') for content other than none plus a background-image or translucent colour; the elementsFromPoint check is optional hardening.

## 13. [major] packages/core/src/runner/collectors.ts:334 (collectors)

**Issue:** containsFocusable counts descendants that cannot take focus at all: display:none, visibility:hidden, and inputs inside a disabled <fieldset>. Hauntings.md §10(a) flags 'a focusable element inside an aria-hidden subtree', so a visible decorative aria-hidden wrapper holding a hidden dropdown or menu becomes a false Veiled haunting.

**Evidence:** isFocusable only checks a selector match, the element's own .disabled and tabindex. Probe with buildDomAxMapping: <div aria-hidden=true><button style=display:none>, <div aria-hidden=true><a href style=visibility:hidden>, and <div aria-hidden=true><fieldset disabled><input> all gave containsFocusable:true. A control with an off-screen span correctly gave false.

**Fix:** In isFocusable, require that the element renders and can focus: check el.checkVisibility({visibilityProperty:true}) (or a non-empty getClientRects() plus computed visibility not 'hidden'), and use el.matches(':disabled') instead of the .disabled property. Add a mapping test covering the display:none/fieldset cases.

**Verifier note:** Confirmed by a probe through buildDomAxMapping: an aria-hidden div holding a display:none button, a visibility:hidden link, or an input in a disabled fieldset all gave containsFocusable:true. None of those can take focus, so hauntings.md §10(a) (aria-hidden-focus) would raise false Veiled hauntings. The fix is right: require the element to render (checkVisibility with visibilityProperty, or non-empty client rects with visibility not hidden) and use matches(':disabled').

## 14. [major] packages/core/tests/collectors.int.spec.ts:26 (collectors)

**Issue:** The task 9 test is titled 'uncertain backgrounds' but only checks that backgroundUncertain is a boolean. It would pass if the flag were hard-coded to false, and in practice it is false for every entry on the fixture, even though the fixture's hero text sits on a gradient. The effective-background walk, the white fallback, invisible-text exclusion and the 100-node batching/timeout path are also untested.

**Evidence:** `expect(entries.every((s) => typeof s.backgroundUncertain === 'boolean')).toBe(true)`. Running the real collector on apps/cursed-shop/index.html gives UNCERTAIN 0 of 64 entries, and the test still passes.

**Fix:** Assert that a known hero text node (the h1 over .hero::before) has backgroundUncertain === true. Add small setContent cases: an opaque parent colour is resolved through a transparent child; a translucent rgba layer gives uncertain; an oklch background is resolved, not skipped; text inside opacity:0 or display:none is absent; more than 100 elements produce all entries.

**Verifier note:** Confirmed: line 26 only checks typeof boolean, and the fixture currently gives 0 of 64 uncertain entries, so a collector with the flag hard-coded to false would pass; the background walk, fallback, invisible-text exclusion and batching are also untested. The fix is right, with one correction: the hero h1 assertion only passes after finding 1 is fixed, so land it with that change.

## 15. [major] packages/core/src/audit.ts:84 (audit-lifecycle)

**Issue:** The 60 s full-audit timeout is only a Promise.race. When it fires, auditUrl rejects, but runAudit keeps running in the background: navigation, collectors and the Tab walk all continue against a page nobody is waiting for. The BrowserContext stays open and the pool slot stays busy until that work finishes, or forever if it hangs (see the crash finding). This breaks Req 1.6, which says close the context, and security.md: "Do not leave zombie Playwright instances". If the timeout fires while the caller is still queued in pool.acquire, the acquire later succeeds and a full audit runs for no one.

**Evidence:** From a scratch run: auditHtml(150 links, {timeoutMs: 800}) was 'rejected after 815 ms: Audit timeout: full-audit exceeded 800ms'. Then getPool().busyCount stayed 1 from t=1316 ms to t=12952 ms and only reached 0 at t=13455 ms.

**Fix:** Create an AbortController or 'timedOut' flag in auditUrl. On timeout, close the context (and so the page) right away, which makes the pending Playwright calls reject and lets runAudit's finally blocks release the slot. Check the flag after pool.acquire resolves so a late acquire is released at once. Add an integration test asserting that busyCount drops to 0 shortly after a timeout.

**Verifier note:** Confirmed: auditHtml with timeoutMs 800 rejected at 818 ms, but busyCount stayed 1 until about 10.6 s because runAudit keeps running after Promise.race settles. That breaks Req 1.6 and security.md's 'no zombie Playwright instances'. The fix is right: on timeout, close the context, and release a late pool acquire as soon as it resolves.

## 16. [major] packages/core/src/audit.ts:58 (audit-lifecycle)

**Issue:** The resource limits are not enforced as security.md and Req 4 require. (1) Total weight is summed from the content-length header only. Chunked or streamed responses count as 0 bytes, so the 50 MB limit is trivially bypassed (and so is the per-resource abortedResources record). (2) The request-count and total-weight limits only set tracker.limit, which is checked after loadPage and after walkTabs. Nothing aborts further requests or the page load, so a page can still make thousands of requests (amplification, SSRF fan-out) until networkidle or the navigation timeout. A flood that blocks networkidle also surfaces as a Playwright TimeoutError, not AuditResourceLimitError.

**Evidence:** From a scratch run: a page with three 20 MB images sent without content-length gave 'weight: RETURNED RawAudit; totalBytes= 0 abortedResources= 0', where it should have thrown 'total-weight'. A page with 700 <img> threw AuditResourceLimitError request-count=501, but the server got 701 requests, so none was aborted after the 500th.

**Fix:** Count real body bytes (e.g. `await response.body()` length per response, or CDP Network.dataReceived/loadingFinished encodedDataLength). In the route handler, abort every request once tracker.limit is set. On the first limit breach, reject a promise that loadPage races against so the load stops at once. The per-resource mid-stream abort is deferred to the safe-fetch spec by the run-11 note, but the total-weight bypass and the missing request abort are not.

**Verifier note:** From the code: totalBytes adds up only the content-length header (audit.ts:60), and the request-count and total-weight limits only set tracker.limit, which is checked after loadPage and after walkTabs. Req 4.1 and 4.3 require aborting the page load and counting received body bytes. The run-11 note defers only the per-resource mid-stream abort, so the fix as stated is right.

## 17. [major] packages/core/src/runner/tab-walker.ts:258 (audit-lifecycle)

**Issue:** walkTabs injects the no-transition rule with page.addStyleTag({content}). The context keeps bypassCSP: false (Req 14.4), so on any site whose CSP forbids inline styles this throws a raw PlaywrightError. auditUrl does not catch it, so the whole audit fails with an untyped error instead of recording the problem or injecting the rule another way.

**Evidence:** From a scratch run: auditUrl on a page served with `content-security-policy: style-src 'self'; script-src 'self'` threw `PlaywrightError page.addStyleTag: Applying inline style violates the following Content Security Policy directive 'style-src 'self''...`.

**Fix:** Inject the rule in a way CSP does not block, e.g. CDP `CSS.createStyleSheet` + `CSS.setStyleSheetText`, or `page.evaluate` with a constructed stylesheet via `document.adoptedStyleSheets`, which runs as an isolated-world evaluation. Otherwise catch the failure, record a CollectionError and go on. Add a CSP fixture test.

**Verifier note:** Confirmed: auditHtml on a page with a meta CSP of style-src 'self' threw a raw 'page.addStyleTag: Applying inline style violates ... Content Security Policy' error from walkTabs. bypassCSP must stay false (Req 14.4), so injecting the rule through CDP CSS.setStyleSheetText or adoptedStyleSheets, plus a CSP fixture test, is the right fix.

## 18. [major] packages/core/src/runner/walk.test.ts:57 (test-quality)

**Issue:** The segmenting property test (amendment 4) only checks `after.slice(1)`. This hides a real Req 11.10 violation: the element that focus lands on after the escape test is never recorded as a TabStep. When N=1 the check passes on an empty slice.

**Evidence:** In runWalk (tab-walker.ts:148-152), the escapable branch does `segment = [out]; visited.add(out); continue`. It never pushes a TabStep for `out`. The fake driver's escapeTest returns after[0], and the next pressTab returns after[1], so after[0] never appears in r.steps. That is why the property needs `after.slice(1).every(...)`. Req 11.10 says every Tab step, 'including steps taken before, during, and after the escape test', must be recorded. Without a step, the landing element gets no FocusSnapshot, so Invisible Wanderer can never check it. The generator `ids('x', 1, 30)` also allows N=1, where the assertion checks nothing.

**Fix:** Record the escape-test landing element as a TabStep with a FocusSnapshot and the next index (count it against the cap). Change the property to `after.every(x => visited.has(x))`, and use min 2 for the `after` generator, or add an N=1 case.

**Verifier note:** Confirmed. In runWalk (tab-walker.ts:147-152), the escapable branch puts `out` into `segment` and `visited` but never pushes a TabStep for it. That breaks Req 11.10 ('steps taken ... during ... the escape test'), and the property only checks `after.slice(1)`, while amendment 4 asks it to check all N. The fix is right: record the landing element as a step with a FocusSnapshot that counts toward the cap, then assert `after.every(...)`.

## 19. [major] packages/core/tests/collectors.int.spec.ts:26 (test-quality)

**Issue:** The task 9 test does not exercise amendment 1 (The Fog: uncertain backgrounds). It only checks that `backgroundUncertain` is a boolean, so a collector that always returns false passes. That is exactly what happens today: the hero text over a gradient is reported as certain.

**Evidence:** I ran a probe with UNSEEN_CHROMIUM_CHANNEL=chromium against index.html: 'STYLES total 64 uncertain 0'. `.hero h1` returned {backgroundColor:'rgb(78, 52, 46)', backgroundUncertain:false}, but `.hero::before` paints `radial-gradient(rgba(255,183,77,0.25)...), linear-gradient(#3E2723,#6D4C41)` between the text and `.hero`'s background-color (index.html:120-130). collectors.ts:97-108 walks only ancestor elements' background-image and never pseudo-elements or positioned siblings. The test still passed (collectors.int 'task 9' ok). The `/^rgba?\(/` checks on color/backgroundColor are equally weak: they pass for any parsed colour, including the white fallback.

**Fix:** Assert that the `.hero h1` entry (look up its backendDOMNodeId by selector through CDP) has backgroundUncertain === true. Add an inline fixture (auditHtml or setContent with the policy installed) covering: text on a semi-transparent ancestor, text on a background-image, and a transparent chain that resolves to a known opaque ancestor colour (assert the exact rgb). Fix the collector so pseudo-element or overlay gradients count as uncertain.

**Verifier note:** Confirmed. The collector (collectors.ts:97-108) walks only the ancestors' background-image and background-color. The `.hero::before` gradient sits under the h1 (index.html:120-135) and `.hero` itself is opaque #4e342e, so the h1 is reported as certain, which goes against the hauntings.md §3 'Uncertain backgrounds' rule. The task 9 test only checks that the field is a boolean. The fix is right: check ancestors' ::before/::after background-image too, and assert the hero h1 is uncertain plus exact rgb cases in inline fixtures.

## 20. [major] packages/core/src/runner/tab-walker.test.ts:7 (test-quality)

**Issue:** Design Properties 1-3 test `detectCycle`, which no production code calls. The real Tab walk uses its own inline cycle detection with different semantics, so the required property tests cover nothing that runs.

**Evidence:** `grep detectCycle src` (excluding tests) finds only the definition at tab-walker.ts:26. runWalk (tab-walker.ts:132-139) detects cycles with `segment.indexOf(id)` and `focusables.every((f) => visited.has(f))`, which is set membership over the pre-walk list. detectCycle uses a `visitedSet.size < focusableCount` count comparison. Task 13 says the walker builds 'on the pure helpers from task 4' and runs the escape test 'when detectCycle returns hasCycle: true'. A regression in runWalk's cycle logic would leave Properties 1-3 green.

**Fix:** Make runWalk call detectCycle on the current segment, or port Properties 1-3 to runWalk through the fake TabDriver (no repeats means no cycles; a repeat before all focusables means a cycle with members drawn from the steps), so the property tests cover the code that runs.

**Verifier note:** Confirmed. detectCycle has no production caller, and runWalk does its own segment and set-membership cycle detection, so Properties 1-3 test dead code even though task 13 says the walk uses detectCycle. Prefer porting the properties to runWalk through the fake TabDriver. Calling detectCycle per segment as it stands would change the semantics, because it compares a count while runWalk checks membership against the pre-walk focusable set.

## 21. [major] packages/core/src/runner/safe-fetch.test.ts:106 (test-quality)

**Issue:** The 'Google Cloud metadata hostname' DNS-mock test is vacuous. No test covers the hostname-to-blocked-IP DNS path (the main SSRF vector) or installSafeFetchPolicy, including task 3's acceptance case 'shouldBlock throwing causes abort'.

**Evidence:** 'metadata.google.internal' is in the hard-coded CLOUD_METADATA_HOSTNAMES (safe-fetch.ts:36-40), which is checked at line 119 before any DNS lookup, so the mock never runs. The mock factory also supplies only `default: {resolve4, resolve6}`, while safe-fetch.ts:1 uses `import * as dns` and calls `dns.resolve4`, a named export the mock does not define. Every other 'blocked' case uses an IP literal. No test file calls installSafeFetchPolicy directly. The tasks.md notes record that an invalid abort code ('blocked' -> 'Route is already handled') shipped undetected for that reason, and the throwing-policy branch (safe-fetch.ts:309-313) is still untested.

**Fix:** Mock `dns/promises` at top level with named exports (resolve4/resolve6) and test a non-listed hostname that resolves to 10.x, 127.x and fe80::. Add an integration test that installs a policy whose shouldBlock throws and asserts the request fails with BLOCKED_BY_CLIENT and the page does not crash.

**Verifier note:** Confirmed. 'metadata.google.internal' is in CLOUD_METADATA_HOSTNAMES and is checked before any DNS call, so the mock never runs. vi.mock is also hoisted to file scope and supplies only `default`, while safe-fetch.ts uses `import * as dns` and calls dns.resolve4. Task 3's required acceptance case ('shouldBlock throwing causes abort') has no test, and nothing calls installSafeFetchPolicy directly. The fix is right: mock the named exports and add a throwing-policy integration test.

## 22. [major] packages/core/tests/collectors.int.spec.ts:62 (test-quality)

**Issue:** The task 12 / amendment 2 (The Veiled) fields have no assertions. containsFocusable, isPresentational, isFocusable and the 'off-screen is not visible' rule could all be constant or wrong and the suite would still pass.

**Evidence:** `grep` over tests finds no reference to containsFocusable, isPresentational or isFocusable. The only checks are `mapping.length > 0`, `ariaHidden` on some entry, and `hasVisibleText && !hasAxNode` on some hidden entry. The fixture has the cases: `.promo-strip[aria-hidden=true]` contains the focusable `.promo-strip-link` (expected-hauntings controls.visibleFocus), and the feature-icon SVGs have role=presentation (index.html:950-967). Nothing asserts on them. No fixture has an off-screen-positioned element (no `left:-...` in cursed-shop), so the scrollable-area intersection in collectors.ts:309-311, which amendment 2 explicitly requires, never runs.

**Fix:** Assert that the `.promo-strip` entry has containsFocusable === true and that the feature icons have isPresentational === true with hasVisibleText/containsFocusable false. Add an inline fixture with an aria-hidden block at `position:absolute;left:-9999px` containing text, and assert it is absent from mapping (or has hasVisibleText false).

**Verifier note:** Confirmed. No test references containsFocusable, isPresentational or isFocusable. The cursed-shop pages have no off-screen element, so the scrollable-area intersection that amendment 2 requires never runs. The fixture already has the cases to assert: `.promo-strip[aria-hidden]` with a focusable link, and the role=presentation SVGs. The fix is right.

## 23. [major] packages/core/tests/tab-walker.int.spec.ts:55 (test-quality)

**Issue:** Several Req 11 criteria for the Tab walk have no test: the step cap (11.5, stepCapReached), cdpError (11.12), and the `before` half of FocusSnapshot (11.4). Req 11.12 is also violated for the activeElement read, and no test catches it.

**Evidence:** No test produces stepCapReached: true or cdpError: true (grep shows only the source lines). The int test checks keys only on `step.focusSnapshot.after`; `before` comes from a pre-walk baseline and falls back to `{}` when it fails (tab-walker.ts:104-110, 130), and nothing checks it. runWalk calls `await driver.pressTab()` (tab-walker.ts:119) outside any try, so a failing CDP activeElement read throws out of walkTabs and fails the whole audit. Req 11.12 says to set cdpError and continue.

**Fix:** With the fake driver in walk.test.ts, add: (a) a sequence longer than stepCap(n) with no repeats, asserting stepCapReached and steps.length === stepCap(n); (b) styles() throwing for one id, asserting cdpError true and the walk continuing; (c) pressTab throwing once, asserting cdpError with the walk continuing. In the int test, assert that `before` has the same keys as `after` and that `.logo` shows a before/after outline-style difference.

**Verifier note:** Confirmed. No test reaches stepCapReached or cdpError, and the int test checks only the keys of `after`. `driver.pressTab()` (tab-walker.ts:119) is outside any try, so a failing Runtime.evaluate in activeElementBackendId throws out of walkTabs, against Req 11.12. Separately, backendIdOfObject swallows its errors and returns null, which silently ends the walk as 'body' instead of setting cdpError. The fake-driver tests in the fix are right.

## 24. [major] packages/core/tests/audit.int.spec.ts:15 (test-quality)

**Issue:** Many task 14 acceptance criteria and their requirements have no test: the 60 s full-audit timeout (Req 1.6), resource limits (Req 4: >500 requests, >50 MB, >10 MB per resource into abortedResources), the browser-crash typed error (Req 1.8), the navigation-timeout typed error (Req 1.5), AuditContextError (Req 14.5), and context close / pool release on the failure path. One of these is already a spec violation.

**Evidence:** No test references FULL_AUDIT_TIMEOUT_MS, MAX_REQUESTS, MAX_TOTAL_BYTES, abortedResources, 'browser-crash' or AuditContextError. Req 1.5 requires AuditTimeoutError('navigation') when navigation misses idle within 30 s, but browser.ts:304-307 lets Playwright's TimeoutError from page.goto propagate unwrapped, and nothing catches this. On timeout, auditUrl's Promise.race (audit.ts:84) also leaves runAudit running, so the context stays open after the timeout fires. No test checks that the context is closed or the pool released.

**Fix:** Add an int test with `timeoutMs` set very low (and navigationTimeoutMs against a never-idle page), asserting AuditTimeoutError with operations 'full-audit'/'navigation' and pool.busyCount back to 0. Serve a page with 501 tiny subresources and one with a content-length over 10 MB, and assert AuditResourceLimitError / abortedResources. Use page.goto('chrome://crash') or a CDP Page.crash call for the crash path.

**Verifier note:** Confirmed. page.goto's Playwright TimeoutError is not wrapped as AuditTimeoutError('navigation') (browser.ts:304-307, Req 1.5). The Promise.race in auditUrl (audit.ts:84) rejects while runAudit keeps running, so the context and pool slot are only freed whenever runAudit finishes (Req 1.6 says close in finally). The resource-limit, crash and full-audit timeout paths have no tests. The fix is right, and should also make the timeout actually close the context, for example with an AbortSignal or by closing the context from the timeout handler.

## 25. [minor] packages/core/src/runner/tab-walker.ts:107 (tab-walker)

**Issue:** When the baseline (before) style read fails, the error is silently swallowed. The comment says it is 'recorded as cdpError when the element is reached', but cdpError is set only when the after read fails, so the step ends up with before:{} and cdpError:false. That breaks Req 11.12.

**Evidence:** Lines 105-109: `catch { /* recorded as cdpError when the element is reached */ }`. Line 130 builds the step with `cdpError` taken only from the `after` try/catch at 125-129.

**Fix:** Keep a Set of ids whose baseline failed, and set cdpError when the reached id is in that Set (or when it has no baseline because it was not readable).

**Verifier note:** Confirmed: lines 105-109 swallow a failed baseline read despite the comment, and line 130 takes cdpError only from the 'after' read, so the step ends up with before:{} and cdpError:false, contrary to Req 11.12. The fix is right: keep a set of ids whose baseline read failed and OR it into cdpError.

## 26. [minor] packages/core/src/runner/tab-walker.ts:162 (tab-walker)

**Issue:** Elements that Tab reaches but that are not in the TABBABLES_EXPR snapshot get `before: {}` with cdpError:false. Examples: keyboard-focusable scrollers, `video[controls]`, `contenteditable="plaintext-only"`, and elements inserted after enumeration (dialogs opened on focus). The classifier cannot tell 'not captured' from a real empty map. TABBABLES_EXPR also departs from Req 11.5's focusableCount definition, because it filters out disabled, inert and invisible elements and drops other [contenteditable] values. That changes the step cap.

**Evidence:** Probe page: `<a/><div style="overflow:auto;height:50px">…</div><video controls/><div contenteditable="plaintext-only"/><a/>`. Steps came back as [id, beforeKeyCount, cdpError] = [["3",8,false],["7",0,false],["8",0,false],["10",0,false],["4",8,false]].

**Fix:** For an element with no baseline, read its unfocused styles on demand. For example, before each Tab, read the styles of the next candidate, or after focus, blur temporarily, read, then refocus. Otherwise flag the gap explicitly (e.g. cdpError or a dedicated flag). Either align TABBABLES_EXPR with Req 11.5, or update the requirement to describe the visibility-filtered count.

**Verifier note:** Reproduced: a scroller, video[controls], a contenteditable=plaintext-only div, and open-shadow buttons (in the shadow probe) all got before:{} (0 keys) with cdpError:false, so 'not captured' cannot be told apart from a real empty map. TABBABLES_EXPR also departs from Req 11.5: it filters out disabled, inert and invisible elements, adds iframe, and drops other contenteditable values. The fix holds: capture the baseline on demand or flag the gap explicitly. The visibility-filtered count is arguably the better 'pre-walk set', so updating Req 11.5 is a reasonable alternative to changing the code.

## 27. [minor] packages/core/src/runner/tab-walker.ts:186 (tab-walker)

**Issue:** FOCUS_STYLES_FN does not capture outline-offset. Req 11.4 lists it in the 'exactly' captured set, as do design.md's FocusSnapshot comment and task 13. border-color is captured without border-style or border-width. Computed border-color is currentColor when no border is set, so a focus style that only changes text colour looks like a border-color change. The classifier then reads rule (c) as satisfied and misses an invisible indicator.

**Evidence:** The returned map at lines 186-195 has no 'outline-offset', 'border-style' or 'border-width'. In the oklch probe, a borderless link reported 'border-color':'rgb(255, 255, 255)', which is just its text colour.

**Fix:** Add 'outline-offset'. Add border-top-width/border-*-style (or a combined border-visible flag) so the classifier can ignore border-color deltas on zero-width or none borders, like the existing outline-style:none quirk. Update the integration test key list to match.

**Verifier note:** Confirmed: FOCUS_STYLES_FN omits outline-offset, which Req 11.4 ('exactly'), design.md:139/279 and task 13 all require; amendment 11 does not remove it. Computed border-color on a borderless element is currentColor: the oklch probe reported border-color equal to the white text colour, so a focus style that only changes text colour would satisfy hauntings.md rule (c). The fix is right: add outline-offset plus border width/style (or a border-visible flag), and update the integration key list.

## 28. [minor] packages/core/src/runner/tab-walker.ts:136 (tab-walker)

**Issue:** includesAllFocusables:true is set whenever every focusable has been visited cumulatively across segments. It does not check whether the cycle's own nodeIds cover all focusables, so after an escapable cycle the label is wrong. escapable:true is also recorded for that cycle even though no escape test ran.

**Evidence:** Probe 'escbody' gave cycles [{nodeIds:['3','4'],escapable:true},{nodeIds:['5','6','7'],escapable:true,includesAllFocusables:true}] with endReason 'cycle-includes-all'. The second cycle does not contain 3 or 4.

**Fix:** Either compute includesAllFocusables from the cycle members (or from the segment), or rename the field to something like 'allFocusablesVisited' and document it in tasks.md. Do not report escapable:true for a cycle whose escape was never tested.

**Verifier note:** Reproduced: escbody recorded the cycle {nodeIds:['5','6','7'], escapable:true, includesAllFocusables:true} although 3 and 4 are not members, and no escape test ran for it. The not-a-trap decision is correct under Req 11.6 (everything had been visited), but both labels are false data for the classifier. The fix is right: compute the flag from the members or rename it (e.g. allFocusablesVisited) and document it in tasks.md, and omit escapable (or leave it undefined) when no escape test ran.

## 29. [minor] packages/core/src/runner/walk.test.ts:44 (tab-walker)

**Issue:** The unit tests would pass even if key walk behaviours were broken. Nothing tests that the step cap spans segments: a per-segment counter reset would go unnoticed. Nothing covers stepCapReached, endReason 'no-focus' vs 'body', cdpError from failing styles, or escapeTest returning null. The detectCycle properties in tab-walker.test.ts (Properties 1-3) test a function runWalk never calls, so they give no coverage of the walker's real cycle detection. detectCycle also returns the first occurrence index as cycleStart, whereas design.md specifies `cycleStart: i` (the index of the repeat).

**Evidence:** runWalk (lines 95-158) has its own segment/indexOf logic and never calls detectCycle. walk.test.ts has 4 tests and none of them drives a non-terminating post-escape sequence or a throwing driver. detectCycle line 53: `const cycleStartIndex = steps.indexOf(stepId)`.

**Fix:** Add fake-driver tests: (1) an escapable cycle followed by an endless Tab sequence, asserting stepCapReached && steps.length === stepCap(n); (2) styles throwing gives cdpError:true and the walk continues; (3) pressTab returning null at step 0 gives 'no-focus'. Either have runWalk use detectCycle per segment, or note that Properties 1-3 apply only to the helper. Align cycleStart with design.md, or amend the design.

**Verifier note:** Confirmed: walk.test.ts has 4 tests and none covers a cumulative step cap after an escapable cycle, stepCapReached, 'no-focus' vs 'body', cdpError, a throwing driver, or escapeTest returning null. runWalk never calls detectCycle, contrary to task 13, so Properties 1-3 give the real walker no coverage. detectCycle returns the first occurrence via steps.indexOf, whereas design.md:719 specifies cycleStart: i. The fix is right as stated.

## 30. [minor] packages/core/src/runner/collectors.ts:230 (collectors)

**Issue:** collectPageMetadata gets heading and img backendNodeIds from one snapshot (CDP Runtime.evaluate plus a sequential describeNode loop) and the tag names and alt values from a second snapshot (page.evaluate). It then pairs them by array index. If the DOM changes between the two calls (carousels, lazy-loaded or ad images, timers; collectors run after networkidle and in parallel), alt values and heading tags are attached to the wrong backendDOMNodeId. That can turn a decorative alt="" image into a missing-alt Hollow Portrait, or the reverse. buildDomAxMapping and collectTextNodeStyles avoid this by reusing the array stored on window, but metadata does not.

**Evidence:** Probe: a page script toggles one <img alt='churn'> at the start of body on setInterval(0). Over 10 collectPageMetadata runs, re-resolving each returned id via DOM.resolveNode and reading its alt gave 'IMG ALT MISMATCHES over 10 runs: 12'.

**Fix:** Collect ids and attributes from the same element array. For example, store the NodeList on window inside the same expression used for backendIdsOf (as MAPPING_EXPR does) and read tagName/alt from that stored array. Or read alt and tagName for each element with DOM.describeNode/DOM.getAttributes on the same objectId.

**Verifier note:** Confirmed by code: headingIds/imgIds come from two Runtime.evaluate snapshots resolved with awaited describeNode round-trips, then tag names and alt values come from a third page.evaluate snapshot, and lines 238-251 pair them by index, so a DOM change in between misattributes alt values. I did not re-run the churn probe, but the race is clear from the code. The fix is right: read tagName/alt from the same stored element array (or per objectId) used for the ids.

## 31. [minor] packages/core/src/runner/collectors.ts:45 (collectors)

**Issue:** The text-visibility filter checks only the element's own opacity. CSS opacity is not inherited, so text inside an opacity:0 container (fade-in modals, tooltips, scroll-reveal content) is collected as visible and can produce Fog hauntings on text no one can see. buildDomAxMapping (line 306) does walk ancestors for opacity, so the two collectors disagree on 'visible'.

**Evidence:** Probe: <div style='opacity:0'><p style='color:#fff'>invisible text</p></div> produced a textNodeStyles entry (white on rgb(0,0,0), backgroundUncertain false).

**Fix:** Walk parentElement and treat the text as invisible if any ancestor has a computed opacity of 0 (or use el.checkVisibility({opacityProperty:true, visibilityProperty:true})).

**Verifier note:** Confirmed by a probe: <div style=opacity:0><p style=color:#fff> produced a textNodeStyles entry. Req 7.1 literally checks only the nearest element's own opacity, but opacity is not inherited, so this collects text no one can see; buildDomAxMapping already walks ancestors for opacity, so the two collectors disagree. The fix is right: walk ancestors for opacity 0, or use checkVisibility({opacityProperty:true, visibilityProperty:true}).

## 32. [minor] packages/core/src/runner/cdp.ts:25 (collectors)

**Issue:** backendIdsOf ignores Runtime.evaluate's exceptionDetails. If the expression throws, the exception object is enumerated, has no index properties, and the function returns [] with no error recorded. The collectors also pass element lists between calls through writable page-world globals (window.__unseenTextEls, window.__unseenMapEls), which the audited, untrusted page can intercept. Together these let the page silently empty The Fog's input: collectTextNodeStyles returns {} with errors [], which contradicts Req 7.5/12.5 (failures must be recorded in collectionErrors).

**Evidence:** Probe: a page that runs Object.defineProperty(window,'__unseenTextEls',{get(){return []},set(){throw new Error('nope')}}) got collectTextNodeStyles -> 'BLOCKED errors [] count 0'. The TEXT_ELEMENTS_EXPR assignment threw, cdp.ts line 28 saw an objectId (the Error object), and the function returned [].

**Fix:** In backendIdsOf, throw when exceptionDetails is present or result.subtype is 'error'. Return the element array by objectId and run the batch functions with Runtime.callFunctionOn on that objectId (or in an isolated world) instead of passing it through a named window global. Delete or skip the globals.

**Verifier note:** Confirmed by a probe: a page that defines a throwing setter for window.__unseenTextEls made collectTextNodeStyles return no entries and errors [], because backendIdsOf ignores exceptionDetails, treats the thrown Error's objectId as the array and returns [] (Req 12.5 requires failures to be recorded). The fix is right: throw on exceptionDetails or subtype 'error', and pass the array by objectId via Runtime.callFunctionOn rather than a writable window global. Running in an isolated world is the stronger option, since main-world callFunctionOn still sees page-patched built-ins.

## 33. [minor] packages/core/src/runner/collectors.ts:80 (collectors)

**Issue:** Req 7.5 says no single evaluate may process more than 100 nodes, and each call is bounded by 10 s. Only the second phase follows this. The first phase (TEXT_ELEMENTS_EXPR calls getBoundingClientRect and getComputedStyle on every element under body in one Runtime.evaluate), the sequential describeNode loop over every text element, and buildDomAxMapping's single page.evaluate all run with no timeout. On a very large page they can use up the 60 s full-audit budget. That turns the non-fatal text-styles / dom-ax-mapping steps (design.md, non-fatal list) into a fatal AuditTimeoutError.

**Evidence:** Line 80 `await backendIdsOf(cdp, TEXT_ELEMENTS_EXPR)` and line 287 `await page.evaluate(...)` have no withTimeout wrapper. cdp.ts lines 38-40 make one awaited DOM.describeNode round-trip per element. Also, openCdp at lines 78 and 284 sits outside the try, so a session failure throws out of these non-fatal collectors instead of being recorded.

**Fix:** Wrap the enumeration and id resolution (and the mapping evaluate) in withTimeout, recording a CollectionError on expiry. Move the visibility filtering into the 100-node batches. Move openCdp inside the try in collectTextNodeStyles and buildDomAxMapping.

**Verifier note:** Confirmed by code: TEXT_ELEMENTS_EXPR calls getBoundingClientRect/getComputedStyle on every element in one unbounded evaluate (against Req 7.5's 'no single call processes more than 100 nodes'), backendIdsOf makes one describeNode round-trip per element, and the mapping page.evaluate has no timeout. In addition, openCdp at lines 78/284 is outside the try and audit.ts:114-118 does not wrap these calls, so a CDP session failure escapes these non-fatal collectors. The fix is right: put the enumeration and the mapping evaluate under withTimeout with a recorded CollectionError, and move openCdp inside the try.

## 34. [minor] packages/core/tests/collectors.int.spec.ts:62 (collectors)

**Issue:** The task 12 tests never check containsFocusable or the off-screen exclusion in hasVisibleText (amendment 2). A collector that always returned containsFocusable:false, or counted off-screen text as visible, would still pass. The task 10 test also never checks Req 8.3 (a listener on a parent is not attributed to the child).

**Evidence:** The only mapping assertions are mapping.length > 0, some ariaHidden, and some(hasVisibleText && !hasAxNode). Nothing reads containsFocusable, and no fixture has off-screen text inside aria-hidden.

**Fix:** Add setContent cases: aria-hidden wrapper with a visible <button> -> containsFocusable true; with a display:none button -> false; with only a left:-9999px span -> hasVisibleText false. For listeners: parent has a click listener, child has none -> only the parent is signalled.

**Verifier note:** Confirmed: no assertion reads containsFocusable or checks that off-screen text gives hasVisibleText false, and the task 10 test never checks Req 8.3 (a listener on a parent is not attributed to the child), so a collector broken in those ways would still pass. The fix is right; the display:none case should land with the fix for finding 2.

## 35. [minor] packages/core/src/runner/browser.ts:304 (audit-lifecycle)

**Issue:** A navigation timeout is not converted to AuditTimeoutError with operation 'navigation' and the elapsed time (Req 1.5). The raw Playwright TimeoutError escapes, so callers (e.g. the web API's TIMEOUT error-code mapping) cannot tell it apart by type or operation.

**Evidence:** From a scratch run: auditUrl on a page that never finishes the response, with navigationTimeoutMs: 2000, threw `TimeoutError` with operation `undefined`: 'page.goto: Timeout 2000ms exceeded.'

**Fix:** Wrap page.goto in try/catch. If the error is Playwright's `errors.TimeoutError`, throw `new AuditTimeoutError('navigation', Date.now() - started)`.

**Verifier note:** From the code: browser.ts:304 lets page.goto's Playwright TimeoutError escape unwrapped, but Req 1.5 requires AuditTimeoutError('navigation', elapsedMs). The fix is right: catch errors.TimeoutError and rethrow it as the typed error.

## 36. [minor] packages/core/src/runner/browser.ts:171 (audit-lifecycle)

**Issue:** When launchFn rejects, checkout decrements `launching` but never calls dispatch(). Queued waiters are not served even though a slot is now free. They sit until another release happens or they hit the 30 s pool timeout, with no retry launch.

**Evidence:** From a scratch run: with maxConcurrency 1, acquireTimeoutMs 3000, and a launch that fails the first time only, I got 'A rejected: launch failed', then 'after A: busy 0 queue 1', then 'B rejected at 3006ms: AuditTimeoutError launch calls 1'.

**Fix:** In checkout's finally (or the catch path), call `this.dispatch()` after `this.launching--`, so the next waiter gets the freed slot. Add a unit test for this case.

**Verifier note:** From the code: checkout's finally block decrements launching, and neither checkout nor dispatch's rejection path calls dispatch(). After a failed launch, queued waiters are stranded until their 30 s timeout even though a slot is free. Call dispatch() after launching-- in the finally block.

## 37. [minor] packages/core/src/runner/browser.ts:130 (audit-lifecycle)

**Issue:** release() decrements `busy` before `await browser.close()` on the unhealthy or 50-session path, and only then calls dispatch(). During that await, a new acquire() takes the fast path (busy+launching < max) ahead of the FIFO queue. dispatch() then finds no free slot, and the queued waiter can run into its 30 s timeout while newer callers are served.

**Evidence:** From reading the code: lines 130 and 141 (`this.busy = Math.max(0, this.busy - 1)` then `await browser.close()`) run before `this.dispatch()` at line 145. acquire() at line 107 checks only the counts, not `this.queue.length`.

**Fix:** Call dispatch (or hand the slot straight to the queue head) before awaiting close, or have acquire() queue whenever the queue is not empty.

**Verifier note:** From the code: release() decrements busy and then awaits browser.close() before it calls dispatch(). In that window, acquire()'s fast path (which only checks the counts) lets a new caller take the slot ahead of queued waiters. This is a minor fairness or starvation issue under Req 2.2. Queuing in acquire() whenever the queue is non-empty is the simpler fix.

## 38. [minor] packages/core/src/audit.ts:54 (audit-lifecycle)

**Issue:** blockedRequests records any request whose failure text matches /BLOCKED_BY_CLIENT|blocked/i, and always gives the fixed reason 'blocked by safe-fetch policy'. Chromium's own blocks (ERR_BLOCKED_BY_ORB, ERR_BLOCKED_BY_RESPONSE) are wrongly reported as policy blocks. The policy's real reason is dropped, and the Req 3.7 reason 'policy-error' is never recorded when shouldBlock throws.

**Evidence:** From a scratch run: auditHtml with allowPrivate:true (the permissive policy allows everything) and `<img src="http://localhost:<port>/d.json">` served as nosniff JSON gave blockedRequests: [{"url":"http://localhost:64135/d.json","reason":"blocked by safe-fetch policy"}]. That was an ORB block, not the policy.

**Fix:** Record blocked entries in installSafeFetchPolicy's route handler itself, using the policy's `reason` or 'policy-error' in the catch, through a callback or shared tracker. Stop inferring them from requestfailed text.

**Verifier note:** From the code: /BLOCKED_BY_CLIENT|blocked/i also matches Chromium's own net::ERR_BLOCKED_BY_ORB and ERR_BLOCKED_BY_RESPONSE, and the reason is always a fixed string. Req 3.7's 'policy-error' reason is never recorded. The fix is right: record blocked entries in the route handler with the policy's reason or 'policy-error'.

## 39. [minor] packages/core/src/audit.ts:194 (audit-lifecycle)

**Issue:** auditHtml sets auditedUrl to `http://127.0.0.1:<random port>/`. Two auditHtml calls with the same HTML therefore never produce JSON-equal RawAudits, which breaks Req 12.6 (it names auditHtml explicitly). Any page-relative data that includes the origin also differs between runs.

**Evidence:** From a scratch run: two identical auditHtml calls gave auditedUrl `http://127.0.0.1:56436/` and `http://127.0.0.1:54660/`. The determinism test only covers auditUrl.

**Fix:** For auditHtml, put a stable value in auditedUrl (e.g. 'about:html' or a content hash), or add a field and note the port normalisation in the spec. Add an auditHtml determinism test.

**Verifier note:** auditedUrl contains the random port, so two identical auditHtml calls never compare equal under the Req 12.6 JSON check, and the determinism test covers only auditUrl. This is minor: either store a stable value or have the spec name the normalisation, and add an auditHtml determinism test.

## 40. [minor] packages/core/tests/audit.int.spec.ts:24 (audit-lifecycle)

**Issue:** The JSON round-trip check uses toEqual, which ignores keys whose value is undefined. RawAudit does contain such keys (AXValue `value: undefined` from EMPTY_VALUE in ax-tree.ts:19, `parentId: undefined`), so the strict round-trip in Req 12.3 actually fails, but this test passes.

**Evidence:** From a scratch run: `deepStrictEqual(JSON.parse(JSON.stringify(a1)), a1)` on an auditHtml result failed, with the diff showing `- value: undefined` on AX node role/name objects.

**Fix:** Assert with toStrictEqual (or node:assert deepStrictEqual). In mapAxNode/toValue, leave the keys out instead of setting them to undefined, e.g. EMPTY_VALUE = { type: 'none' } and only add parentId when present.

**Verifier note:** toEqual ignores keys whose value is undefined and does not check object types, so the round-trip assertion would also pass with class instances, which Req 12.3 forbids. RawAudit does carry undefined-valued keys (EMPTY_VALUE.value, parentId). No data is lost, so the impact is small, but the fix is right: use toStrictEqual and omit the undefined keys.

## 41. [minor] packages/core/src/audit.ts:188 (audit-lifecycle)

**Issue:** auditHtml waits on server.listen with no 'error' handler. If listen fails (e.g. EMFILE under load, or 127.0.0.1 not available in a sandbox), the server emits an unhandled 'error' event that crashes the Node process, and the awaited promise never settles.

**Evidence:** From reading the code: `await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()))`. There is no reject path and no server.on('error').

**Fix:** Use `new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok) })`, so the failure becomes a typed Error.

**Verifier note:** From the code: server.listen at audit.ts:188 has no 'error' listener and no reject path, so a listen failure becomes an uncaught 'error' event and the awaited promise never settles. The proposed once('error', fail) wrapper is the right fix.

## 42. [minor] packages/core/src/index.ts:3 (audit-lifecycle)

**Issue:** index.ts is a wildcard barrel (`export *` from types, safe-fetch, tab-walker, browser, ax-tree, axe). tech.md forbids this: "No barrel re-exports (index.ts that re-exports everything)". As a result, internals such as getPool, BrowserPool, PageLoader, collectBoundingBoxes, mapAxNode and the collector functions become public API.

**Evidence:** packages/core/src/index.ts lines 3-8: `export * from './types.js'`, `export * from './runner/safe-fetch.js'`, `export * from './runner/tab-walker.js'`, `export * from './runner/browser.js'`, `export * from './runner/ax-tree.js'`, `export * from './runner/axe.js'`.

**Fix:** Export only the public contract by name: auditUrl, auditHtml, OriginScopedPolicy, AuditOptions/RawAudit and related types, the typed error classes, SafeFetchPolicy and the two policies. Tests should import internals from their own modules.

**Verifier note:** tech.md says 'No barrel re-exports (index.ts that re-exports everything)', yet index.ts uses export * on six modules, which makes the pool, the loader and the collector internals public API. Req 13 needs only auditUrl, auditHtml, the types and the errors to be exported by name.

## 43. [minor] packages/core/tests/tab-walker.int.spec.ts:42 (test-quality)

**Issue:** The index test's escapable-cycle assertion does not show that the cookie banner produced it, as amendment 4 requires.

**Evidence:** `r.cycles.some((c) => c.escapable)` also matches the wrap-around cycle recorded at tab-walker.ts:137, which sets `escapable: true` with `includesAllFocusables: true`. The test never checks cycle membership in #cookieBanner (my probe showed the real cycle is [btn-close, btn] at step 19, but the test doesn't assert that). The checkout test also doesn't check the documented ordering (region element first, then members) from the tasks.md notes.

**Fix:** Assert the cycle has `escapable && !includesAllFocusables`, that every nodeId resolves inside #cookieBanner, and that endReason === 'body'. For checkout, assert trapRegionNodeIds[0] resolves to #newsletterModal.

**Verifier note:** Confirmed. `cycles.some(c => c.escapable)` is also satisfied by the wrap-around cycle recorded with includesAllFocusables: true, and nothing ties the cycle to #cookieBanner as amendment 4 asks. Assert `escapable && !includesAllFocusables` with members inside the banner, and trapRegionNodeIds[0] resolving to #newsletterModal. Only assert endReason === 'body' after confirming that is the actual end state.

## 44. [minor] packages/core/tests/determinism.int.spec.ts:96 (test-quality)

**Issue:** The screenshot half of the determinism test can never fail. Amendment 6 allowed record-only comparison only 'if byte-identical screenshots prove flaky', and they were not flaky in this environment.

**Evidence:** A mismatch only adds an annotation and a console.warn (lines 96-101). In my run the test passed with no 'screenshot SHA-256 mismatch' output, so the screenshots were identical. A regression such as dropping `animations: 'disabled'` or `caret: 'hide'` would go unnoticed. The JSON normalisation itself (id canonicalisation by DOM order, walkStartedAtMs, responseTimings) looks sound.

**Fix:** Assert SHA-256 equality, and fall back to annotate-only behind an explicit env flag (for example UNSEEN_ALLOW_SCREENSHOT_DRIFT) only where font-rasterisation drift is shown to occur.

**Verifier note:** Confirmed. Req 12.6 and task 15 require byte-identical screenshots, and amendment 6 allows record-only comparison only if they prove flaky. The test records a mismatch without condition and can never fail on the screenshot. Assert SHA-256 equality, and allow drift only behind an explicit opt-in flag.

## 45. [minor] packages/core/tests/axe.int.spec.ts:42 (test-quality)

**Issue:** The axe timeout test bypasses SafeFetchPolicy and accepts any error. The main axe test does not check the runOnly WCAG tag filter (task 8).

**Evidence:** Line 42 uses `browser.newContext()` / `context.newPage()` directly, without PageLoader or installSafeFetchPolicy, which goes against amendment 6 ('Tests must use PermissiveSafeFetchPolicy ... never disable the policy'). It asserts only `r.error?.step === 'axe'`, so any axe failure (injection error etc.) passes as a 'timeout'. The first test never checks that each violation carries one of AXE_TAGS, so dropping `.withTags(...)` would still pass.

**Fix:** Install PermissiveSafeFetchPolicy on that page (or use withPage) and assert `r.error.message` matches /timed out/. In the main test, assert every violation/incomplete has a tag in AXE_TAGS and that a best-practice-only rule (e.g. 'region') is absent.

**Verifier note:** The weak assertion is real: `r.error?.step === 'axe'` passes for any axe failure, and nothing checks the AXE_TAGS filter. The policy-bypass part matters little, because setContent makes no network requests. The main fix is to assert /timed out/ on the error message and that every violation and incomplete result carries one of AXE_TAGS.

## 46. [minor] packages/core/tests/collectors.int.spec.ts:18 (test-quality)

**Issue:** Error and limit paths for tasks 9-10 are untested: the 100-node batching and 10 s per-batch timeout (Req 7.5), per-node event-listener CDP errors and session-level failure (Req 8.4/8.5), and the 5,000-node cap.

**Evidence:** The tests only assert `errors` equals [] on index.html, which has 64 text elements, so it never reaches a second batch (BATCH_SIZE 100). No test drives withTimeout in collectors.ts:83-130 or the catch branches at lines 168-169, 201-203 and 206-207.

**Fix:** Add an inline fixture with more than 100 visible text elements and assert all are keyed (to catch batch-offset bugs). Close the CDP target or stub page.evaluate to hang, and assert that a CollectionError with step 'text-styles' / 'event-listeners' is returned instead of a throw.

**Verifier note:** A real but minor coverage gap. index.html yields 64 text elements, so only one batch of 100 ever runs. The withTimeout branch, the per-node and session-level listener error branches, and the 5,000-node cap are never exercised, so a batch-offset or error-handling regression would go unnoticed. The suggested inline >100-node fixture and the failure injection are appropriate.

## 47. [minor] packages/core/tests/audit.int.spec.ts:34 (test-quality)

**Issue:** The test titled 'blocks loopback under the restrictive policy before launching' does not check the 'before any pool acquire' part of task 14.

**Evidence:** It only asserts rejection with SsrfBlockedError. The singleton pool from getPool() has already launched a browser in earlier tests in the file, and nothing spies on acquire, so moving the policy check after `pool.acquire()` (audit.ts:75-76 vs 92) would still pass. Suite results for reference: tsc (src + tests) exit 0; vitest 5 files / 62 tests passed; playwright (UNSEEN_CHROMIUM_CHANNEL=chromium) 20/20 passed in 1.3 min.

**Fix:** Spy on getPool().acquire (or inject a pool) and assert it was not called when SsrfBlockedError is thrown.

**Verifier note:** Confirmed. The test only asserts the SsrfBlockedError rejection. Moving the shouldBlock check after pool.acquire() in audit.ts would still pass, so the 'before any pool acquire' clause in task 14 is unverified. Spying on getPool().acquire, or injecting a pool, is the right fix.
