# Requirements Document

## Introduction

The audit engine is the browser automation pipeline in `packages/core/src/runner/`. It accepts a URL or raw HTML string, launches a Playwright Chromium browser, and collects every raw signal the pure classifier needs to identify hauntings. The runner produces a single, serializable `RawAudit` object and returns it to the caller. No haunting classification, severity assignment, or scoring logic belongs here.

The runner comprises five files: `browser.ts` (page lifecycle), `ax-tree.ts` (accessibility tree), `axe.ts` (axe-core scanning), `tab-walker.ts` (Tab-key walk and focus indicator capture), and `safe-fetch.ts` (SSRF guard interface and request interception). The public entry points are `auditUrl(url, options)` and `auditHtml(html, options)`, both exported from `packages/core/src/index.ts`.

All requirements in this document use system names defined in the Glossary below.

---

## Glossary

- **Audit_Engine**: The runner layer of `packages/core/src/runner/` — the five modules that perform browser automation and return a `RawAudit`.
- **Browser_Pool**: A managed pool of Playwright Chromium browser instances shared across concurrent audit requests, with a configurable concurrency cap.
- **RawAudit**: The serializable TypeScript type (`packages/core/src/types.ts`) produced by the Audit_Engine and consumed exclusively by the classifier. It contains a schema version, timestamps, a screenshot buffer, bounding boxes, AX tree nodes, axe results, computed styles, event listener signals, tab walk results, page metadata, and resource usage counters.
- **AX_Tree_Collector**: The module in `ax-tree.ts` that reads the Chromium accessibility tree via CDP `Accessibility.getFullAXTree` and returns a typed `AXNode[]`.
- **Axe_Runner**: The module in `axe.ts` that injects axe-core into the page via `@axe-core/playwright` and returns normalized axe results tagged for WCAG 2.2 A and AA.
- **Tab_Walker**: The module in `tab-walker.ts` that simulates real Tab keypresses, records focus order, captures computed focus indicator styles before and after each keypress, and detects keyboard traps.
- **Safe_Fetch_Policy**: A TypeScript interface (`SafeFetchPolicy`) that the Audit_Engine depends on to decide whether a request should be allowed or blocked. The full SSRF guard implementation is defined in the `safe-fetch` spec; this spec defines only the interface contract and how the runner uses it.
- **Page_Loader**: The module in `browser.ts` responsible for launching a browser context, applying viewport and timeout settings, installing the Safe_Fetch_Policy route interceptor, navigating to the target, and collecting the screenshot and bounding boxes.
- **AXNode**: A typed representation of one node from CDP `Accessibility.getFullAXTree`, including `nodeId`, `backendDOMNodeId`, `role.value`, `name.value`, `name.sources`, `states`, `properties`, and `ignored`.
- **FocusSnapshot**: A pair of computed style maps — `before` and `after` — captured immediately before and after a Tab keypress lands focus on an element. Compared by the classifier to detect invisible focus indicators.
- **TabWalkResult**: The structured output of Tab_Walker: an ordered array of `TabStep` records (element handle, `backendDOMNodeId`, `FocusSnapshot`), a boolean `trapDetected`, and the `trapRegionNodeIds` array.
- **TabStep**: One step in the Tab walk sequence: the `backendDOMNodeId` of the focused element, its `FocusSnapshot`, and the step index.
- **SsrfBlockedError**: A typed error class thrown when Safe_Fetch_Policy blocks a request because the target resolves to a private, loopback, link-local, or metadata address range.
- **AuditTimeoutError**: A typed error class thrown when a DNS resolution, navigation, or full audit operation exceeds its configured timeout.
- **AuditResourceLimitError**: A typed error class thrown when total page weight, per-resource size, or request count exceeds the configured limits.
- **BoundingBox**: A rectangle in screenshot pixel coordinates (`x`, `y`, `width`, `height`) associated with a `backendDOMNodeId`.
- **EventListenerSignal**: A record of CDP `DOMDebugger.getEventListeners` output for one DOM node, filtered to `click`, `mousedown`, `pointerdown`, and `pointerup` event types, used as input for Lost Soul detection.
- **ComputedStyleMap**: A `Record<string, string>` of CSS property names to computed values for one element. The runner collects contrast-relevant styles (`color`, `background-color`) and focus indicator styles (`outline-style`, `outline-width`, `outline-color`, `outline-offset`, `box-shadow`, `border-color`, `background-color`, `text-decoration`) separately.
- **PageMetadata**: The `lang` attribute of the `<html>` element, the ordered list of heading elements (tag name and accessible name), and the set of landmark roles present on the page.
- **ResourceUsage**: Counters for total page weight (bytes), per-resource maximum size (bytes), and total request count, collected during the page load via Playwright's `response` event.

---

## Requirements

### Requirement 1: Page Loading and Rendering

**User Story:** As a developer using the Audit_Engine, I want the runner to load a URL or raw HTML in a consistent Chromium environment so that the screenshot and all data collections come from the same render.

#### Acceptance Criteria

1. WHEN `auditUrl(url, options)` is called, THE Page_Loader SHALL launch a Chromium browser context with a fixed viewport of 1280px wide and 900px tall, then navigate to `url` and wait for the network to reach an idle state (no more than 2 in-flight network connections for at least 500 milliseconds) before collecting any data.
2. WHEN `auditHtml(html, options)` is called, THE Page_Loader SHALL serve the HTML string from a local in-process file server and load it at the same 1280×900 viewport, applying the same data collection pipeline as `auditUrl`.
3. WHEN the page has finished loading, THE Page_Loader SHALL take a full-page screenshot in PNG format and record each element's `BoundingBox` by querying layout geometry via CDP in the same JavaScript execution context used for the screenshot, so that pixel coordinates in the screenshot and bounding boxes are consistent.
4. THE Page_Loader SHALL attach a `backendDOMNodeId` to every collected `BoundingBox` so that the classifier can correlate visual position with AX tree nodes and DOM elements.
5. WHEN the page navigation does not reach idle within 30 seconds, THE Page_Loader SHALL throw `AuditTimeoutError` with operation name `"navigation"` and elapsed time in milliseconds, and SHALL close the browser context in a `finally` block before propagating the error.
6. WHEN the full audit (all data collection steps combined) does not complete within 60 seconds, THE Audit_Engine SHALL throw `AuditTimeoutError` with operation name `"full-audit"` and elapsed time in milliseconds, and SHALL close the browser context in a `finally` block.
7. IF the HTTP response Content-Type for the initial navigation is not `text/html` or `application/xhtml+xml`, THEN THE Page_Loader SHALL throw `NonHtmlContentError` with the actual Content-Type value and SHALL not proceed with data collection.
8. WHEN any browser context or page crashes during an audit, THE Audit_Engine SHALL catch the crash event, close the browser context, and throw `AuditTimeoutError` with operation name `"browser-crash"` and elapsed time in milliseconds so that callers receive a typed error rather than an unhandled rejection.
9. THE Page_Loader SHALL disable JavaScript-based service workers and browser cache for every audit context to prevent stale cached content from affecting data collection.
10. THE Page_Loader SHALL set the browser locale to `en-US` and time zone to `UTC` for every audit context so that locale-dependent rendering does not vary between runs.
11. WHEN `auditUrl(url, options)` is called with a `url` whose scheme is not `http` or `https`, THE Page_Loader SHALL throw `NonHtmlContentError` with the actual scheme value and SHALL not launch a browser context.
12. IF `auditHtml(html, options)` is called with an `html` argument whose length exceeds 10 MB (10,485,760 bytes), THEN THE Page_Loader SHALL throw a typed `HtmlSizeError` with the actual byte length and SHALL not proceed with data collection.

---

### Requirement 2: Browser Pool and Concurrency

**User Story:** As an operator of the hosted web app, I want the Audit_Engine to reuse Chromium instances within a bounded pool so that memory consumption and launch overhead are controlled.

#### Acceptance Criteria

1. THE Browser_Pool SHALL maintain at most `BrowserPoolOptions.maxConcurrency` concurrent Chromium browser instances at any time, where `maxConcurrency` accepts integer values in the range 1–20 inclusive and defaults to 5 when not specified.
2. WHEN a new audit is requested and all pool slots are occupied, THE Browser_Pool SHALL queue the request internally up to a maximum of 50 pending requests, and release it to a slot when one becomes available within 30 seconds of the request entering the queue.
3. IF a queued audit request has waited more than 30 seconds without acquiring a slot, THEN THE Browser_Pool SHALL reject that request with an error indicating a pool timeout, without launching a new browser instance.
4. IF the queue already holds 50 pending requests when a new audit is requested, THEN THE Browser_Pool SHALL reject the new request immediately with an error indicating the pool is at capacity, without enqueuing it.
5. WHEN an audit completes or throws and the browser instance is responsive, THE Browser_Pool SHALL return that instance to the available pool and release the slot, regardless of whether the audit succeeded or failed.
6. IF an audit completes or throws and the browser instance is unresponsive or its process has exited, THEN THE Browser_Pool SHALL discard that instance, close its process if still running, and launch a fresh replacement instance before releasing the slot.
7. WHEN a browser instance in the pool has completed more than 50 audit sessions, THE Browser_Pool SHALL allow the current audit to finish, then close that instance and replace it with a fresh one before returning the slot to the pool.
8. THE Browser_Pool SHALL be a singleton within a process; calling `auditUrl` or `auditHtml` concurrently SHALL draw from the same pool instance rather than creating independent pools.

---

### Requirement 3: Safe Fetch Policy Interface

**User Story:** As a security-conscious operator, I want all network requests made by audited pages to pass through a policy check so that the hosted auditor cannot be used as an SSRF vector.

#### Acceptance Criteria

1. THE Audit_Engine SHALL depend on a `SafeFetchPolicy` interface with a single method `shouldBlock(url: string): Promise<{ block: boolean; reason: string }>` and SHALL install it on every Playwright `Page` before navigation using `page.route('**/*', handler)`.
2. WHEN `SafeFetchPolicy.shouldBlock` returns `{ block: true }` for a request URL, THE Audit_Engine SHALL abort that request via Playwright's route `abort()` call and SHALL record the blocked URL as an entry of shape `{ url: string; reason: string }` in `RawAudit.blockedRequests` without throwing.
3. WHEN `auditUrl` is called with `options.allowPrivate = false` (the default), THE Audit_Engine SHALL use a `SafeFetchPolicy` implementation that resolves each request hostname to its IP address(es) and rejects the request if any resolved IP falls in the private, loopback, link-local, or cloud-metadata address ranges defined in `security.md`, and that rejects any URL whose scheme is not `http:` or `https:`.
4. WHERE `options.allowPrivate = true` is set, THE Audit_Engine SHALL use a permissive `SafeFetchPolicy` implementation that allows all IP addresses including loopback and private ranges, while still rejecting any URL whose scheme is not `http:` or `https:`.
5. THE Audit_Engine SHALL apply `SafeFetchPolicy` to all resource types intercepted by `page.route`: navigation, fetch, XHR, image, script, stylesheet, font, media, and other — not only the initial page navigation.
6. IF the initial page navigation URL is blocked by `SafeFetchPolicy` — including DNS resolution of its hostname against the blocked ranges defined in `security.md` — THEN THE Audit_Engine SHALL throw `SsrfBlockedError` with the URL and block reason before launching the browser, without consuming a pool slot.
7. IF `SafeFetchPolicy.shouldBlock` throws an exception for any request URL, THEN THE Audit_Engine SHALL treat that request as blocked, abort it via Playwright's route `abort()` call, and record the entry in `RawAudit.blockedRequests` with the reason set to `"policy-error"`.

---

### Requirement 4: Resource Limits

**User Story:** As an operator of the hosted web app, I want the Audit_Engine to enforce page weight and request count limits so that a malicious or pathological page cannot exhaust server memory.

#### Acceptance Criteria

1. WHEN the page makes more than 500 network requests during an audit, THE Audit_Engine SHALL abort the page load, discard any partial `RawAudit`, and throw `AuditResourceLimitError` with `limitType: "request-count"` and the actual completed-and-intercepted request count at the time of the abort.
2. WHEN any single network response body exceeds 10 MB as measured by the cumulative bytes received for that response before interception, THE Audit_Engine SHALL abort that specific request via Playwright route interception, record the oversized resource URL in `RawAudit.abortedResources`, and continue auditing the rest of the page unless a total-weight limit is also reached.
3. WHEN the total cumulative received body bytes across all requests in the audit session — including bytes received from subsequently aborted responses before their abort point — exceeds 50 MB, THE Audit_Engine SHALL abort the page load, discard any partial `RawAudit`, and throw `AuditResourceLimitError` with `limitType: "total-weight"` and the cumulative byte count at the time of the abort.
4. THE Audit_Engine SHALL track resource size and request count using Playwright's `response` event and SHALL accumulate counters in a `ResourceUsage` object before writing the final counters to `RawAudit.resourceUsage` on audit completion.
5. IF `AuditResourceLimitError` is thrown due to either `"request-count"` or `"total-weight"` limits, THEN THE Audit_Engine SHALL NOT return a partial `RawAudit` to the caller; the error is the sole result of that audit invocation.

---

### Requirement 5: Accessibility Tree Collection

**User Story:** As a developer building the haunting classifier, I want the AX_Tree_Collector to return a complete, typed accessibility tree so that Nameless Spirit, Hollow Portrait, Whispering Field, The Veiled, and other AX-based hauntings can be detected without additional browser I/O.

#### Acceptance Criteria

1. WHEN the page has reached the `load` event (Playwright `waitForLoadState('load')`), THE AX_Tree_Collector SHALL request `Accessibility.getFullAXTree` via a CDP session opened on that page and SHALL return all nodes returned by CDP as a typed `AXNode[]` in the order CDP provides them, without filtering or omitting any node.
2. THE AX_Tree_Collector SHALL include the `backendDOMNodeId` field on every `AXNode`; IF a node returned by CDP is missing `backendDOMNodeId`, THEN THE AX_Tree_Collector SHALL throw a typed `AuditCollectionError` with `step: "ax-tree"` and a message indicating which node index was missing the field.
3. THE AX_Tree_Collector SHALL preserve the `ignored` field and `ignoredReasons` array on each `AXNode` so that the classifier can distinguish intentionally hidden nodes from missing ones when detecting The Veiled haunting.
4. THE AX_Tree_Collector SHALL request the AX tree with `fetchRelatedNodes: true` so that parent–child DOM-to-AX relationships needed for Hollow Portrait and Nameless Spirit parent checks are available.
5. THE AX_Tree_Collector SHALL record the `role.value`, `name.value`, `name.sources`, `description.value`, and `properties` array on each `AXNode` and SHALL NOT set any of these fields to `undefined` on a node for which CDP returned a value.
6. WHEN `Accessibility.getFullAXTree` returns zero nodes AND the page contains at least one element with a non-empty tag name (verified by querying `document.body.children.length > 0`), THE AX_Tree_Collector SHALL throw a typed `AuditCollectionError` with `step: "ax-tree"` to signal a CDP protocol failure rather than silently returning an empty array.
7. IF opening the CDP session on the page throws an error, THEN THE AX_Tree_Collector SHALL throw a typed `AuditCollectionError` with `step: "ax-tree"` and SHALL NOT return a partial or empty `AXNode[]`.

---

### Requirement 6: axe-core Scanning

**User Story:** As a developer building the haunting classifier, I want axe-core results scoped to WCAG 2.2 A and AA rules so that the classifier has a secondary conformance signal alongside the primary CDP-based detections.

#### Acceptance Criteria

1. WHEN the page has loaded, THE Axe_Runner SHALL inject axe-core via `@axe-core/playwright` and run it with `runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }` to scope results to WCAG 2.2 A/AA.
2. THE Axe_Runner SHALL return only `violations` and `incomplete` result arrays from the axe run; it SHALL discard `passes` and `inapplicable` to keep the `RawAudit` payload small.
3. THE Axe_Runner SHALL normalise each axe `Result` node into a typed `AxeViolation` that includes `id`, `impact`, `tags`, `description`, `helpUrl`, and a `nodes` array where each node contains `html`, `target` (CSS selector path), and `failureSummary`.
4. WHEN axe-core throws or times out during injection or execution, THE Axe_Runner SHALL catch the error, record it in `RawAudit.collectionErrors` with `step: "axe"`, and continue with the remaining data collection steps rather than aborting the whole audit.
5. IF the axe run completes but returns zero `violations` and zero `incomplete` entries, THEN THE Axe_Runner SHALL still return a valid `AxeScanResult` with empty arrays for both fields rather than returning `null` or `undefined`.
6. THE Axe_Runner SHALL complete the axe injection and execution within 30 seconds; IF this deadline is exceeded, THEN THE Axe_Runner SHALL abort the axe run, record the timeout in `RawAudit.collectionErrors` with `step: "axe"`, and continue with the remaining data collection steps.
7. IF an `AxeViolation` node's `impact` field is not one of `"minor"`, `"moderate"`, `"serious"`, or `"critical"`, THEN THE Axe_Runner SHALL coerce the value to `null` rather than passing an untyped string into the `AxeViolation`.

---

### Requirement 7: Computed Style Collection

**User Story:** As a developer building the haunting classifier, I want computed styles for contrast inputs and focus indicators pre-collected so that the pure classifier functions have no need to perform browser I/O.

#### Acceptance Criteria

1. WHEN the page has loaded, THE Audit_Engine SHALL collect `color` and `background-color` computed styles for every visible text node on the page via `page.evaluate`, and SHALL store them in `RawAudit.textNodeStyles` keyed by `backendDOMNodeId`, where "visible" means the text node's nearest element ancestor has a non-zero bounding box, `visibility` computed value other than `hidden`, `display` computed value other than `none`, and `opacity` greater than `0`.
2. WHEN a text node's `background-color` resolves to `transparent` or `rgba(0,0,0,0)`, THE Audit_Engine SHALL walk up the DOM ancestor chain via `page.evaluate` until a non-transparent background color is found or the `<body>` element is reached, and SHALL record that resolved color as the effective background color; IF no non-transparent ancestor exists up to and including `<body>`, THEN THE Audit_Engine SHALL record the effective background color as `rgb(255,255,255)`.
3. THE Audit_Engine SHALL record the computed `font-size` (in pixels) and `font-weight` (as a numeric value) for each text node in `RawAudit.textNodeStyles`, alongside `color` and `background-color`, so that the classifier can apply the WCAG large-text thresholds: text with `font-size` ≥ 24px, or `font-size` ≥ 18.67px and `font-weight` ≥ 700, qualifies as large text and requires a contrast ratio of at least 3:1 instead of 4.5:1.
4. THE Audit_Engine SHALL collect the `cursor` computed style for every element that has at least one CDP `DOMDebugger.getEventListeners` entry for `click`, `mousedown`, `pointerdown`, or `pointerup`, and SHALL store these values in `RawAudit.elementCursorStyles` keyed by `backendDOMNodeId`, to be used as a secondary signal only in Lost Soul detection.
5. WHEN the page contains more than 500 visible text nodes, THE Audit_Engine SHALL split the full set into sequential batches of at most 100 nodes and issue one `page.evaluate` call per batch, waiting for each call to resolve before issuing the next, so that no single call processes more than 100 nodes; IF any single `page.evaluate` call does not resolve within 10 seconds, THEN THE Audit_Engine SHALL record an error on `RawAudit.collectionErrors` for that batch and continue processing remaining batches.

---

### Requirement 8: Event Listener Signal Collection

**User Story:** As a developer building the haunting classifier, I want CDP event listener data for DOM elements so that Lost Soul candidates (clickable but keyboard-unreachable elements) can be identified.

#### Acceptance Criteria

1. WHEN the page has loaded, THE Audit_Engine SHALL query `DOMDebugger.getEventListeners` via CDP for every DOM node in the document, up to a maximum of 5,000 nodes, retaining only nodes that have at least one listener of type `click`, `mousedown`, `pointerdown`, or `pointerup` registered directly on that node.
2. THE Audit_Engine SHALL record each matching element as an `EventListenerSignal` in `RawAudit.eventListenerSignals`, including the `backendDOMNodeId`, the matched event type or types, and the element's tag name as a string.
3. THE Audit_Engine SHALL NOT record event listeners inherited from ancestor elements as belonging to a child element; each `EventListenerSignal` SHALL reflect only the listeners registered directly on that node, as returned by CDP with `includeAncestors: false`.
4. WHEN `DOMDebugger.getEventListeners` returns an error for a specific node, THE Audit_Engine SHALL skip that node and append a warning to `RawAudit.collectionErrors` containing `step: "event-listeners"`, the `backendDOMNodeId` of the failing node, and an error reason string, without aborting the audit.
5. IF the CDP session is unavailable or the `DOMDebugger.getEventListeners` command cannot be issued for the page as a whole, THEN THE Audit_Engine SHALL set `RawAudit.eventListenerSignals` to an empty array and append a single warning to `RawAudit.collectionErrors` with `step: "event-listeners"` and an error reason string indicating the session-level failure.

---

### Requirement 9: Page Metadata Collection

**User Story:** As a developer building the haunting classifier, I want the runner to extract the `lang` attribute, heading structure, and landmark roles so that Silent Tongue and Shattered Order can be detected without additional DOM traversal.

#### Acceptance Criteria

1. WHEN the page has loaded, THE Audit_Engine SHALL read the `lang` attribute of the `<html>` element via `page.evaluate` and SHALL record the raw attribute string (or `null` if absent) in `RawAudit.pageMetadata.htmlLang`.
2. WHEN the page has loaded, THE Audit_Engine SHALL collect all heading elements (`h1`–`h6`) in DOM order via `page.evaluate` and SHALL record each as a `HeadingRecord` containing the tag name, the accessible name from the AX tree (matched by `backendDOMNodeId`), and a zero-based integer DOM order index reflecting the element's position in document order across all heading elements collected.
3. WHEN the page has loaded, THE Audit_Engine SHALL collect all landmark roles present on the page from the `AXNode[]` array — specifically nodes with roles `main`, `navigation`, `banner`, `contentinfo`, `complementary`, `region`, and `form` — and SHALL record the deduplicated set of role strings (each role string appearing at most once regardless of how many elements carry that role) as an array in `RawAudit.pageMetadata.landmarkRoles`.
4. WHEN the page has loaded, THE Audit_Engine SHALL collect the DOM `alt` attribute for every `<img>` element via `page.evaluate` and SHALL record it in `RawAudit.imgAltAttributes` keyed by `backendDOMNodeId`, where the value is `null` if the `alt` attribute is absent and a string (including the empty string `""`) if the attribute is present, so that the classifier can distinguish decorative images (`alt=""`) from missing-alt images (`null`) when detecting Hollow Portrait.

### Requirement 10: DOM-to-AX Visibility Mapping

**User Story:** As a developer building the haunting classifier, I want a mapping of visible DOM nodes to their AX tree presence so that The Veiled haunting can be detected — identifying content that a sighted user sees but assistive technology cannot perceive.

#### Acceptance Criteria

1. WHEN the page has fully loaded, THE Audit_Engine SHALL build a `DomAxMapping` by enumerating all DOM nodes that have a non-zero bounding box (both `width > 0` and `height > 0`), have computed `visibility` not equal to `hidden`, have computed `display` not equal to `none`, and have computed `opacity` greater than `0`, and SHALL record for each such node whether a corresponding `AXNode` exists in the full AX tree with a matching `backendDOMNodeId` and an `ignored` property of `false`.
2. THE Audit_Engine SHALL record `aria-hidden="true"` as a boolean flag (`ariaHidden: true`) on each `DomAxMapping` entry where the DOM node or any of its ancestors carries the attribute `aria-hidden="true"`, so that the classifier can identify nodes explicitly excluded from the accessibility tree without additional DOM queries.
3. THE Audit_Engine SHALL record `role="presentation"` and `role="none"` as a boolean flag (`isPresentational: true`) on each `DomAxMapping` entry where the DOM node's `role` attribute is exactly `"presentation"` or `"none"`, so that the classifier can exclude intentionally presentational nodes from The Veiled haunting without additional DOM queries.
4. THE Audit_Engine SHALL record whether each visible DOM node is focusable as a boolean flag (`isFocusable: true`) on each `DomAxMapping` entry, where focusable means the node has a `tabindex` attribute whose numeric value is `>= 0`, or is one of the native interactive element types: `button`, `a[href]`, `input` (not `type="hidden"`), `select`, `textarea`, `summary`, or any element with `contenteditable="true"`.
5. WHEN building the `DomAxMapping`, THE Audit_Engine SHALL collect bounding boxes, computed styles (`visibility`, `display`, `opacity`), and attributes (`aria-hidden`, `role`, `tabindex`, `contenteditable`) for all candidate DOM nodes in a single `page.evaluate` call that iterates over the full `document.querySelectorAll('*')` result, rather than issuing one CDP or evaluate call per node.
6. IF the `Accessibility.getFullAXTree` CDP call returns an empty node list or throws, THEN THE Audit_Engine SHALL record an empty `DomAxMapping` and attach an error flag (`axTreeUnavailable: true`) to the mapping result so that the classifier can skip The Veiled haunting rather than produce false positives.

---

### Requirement 11: Tab Walker

**User Story:** As a developer building the haunting classifier, I want the Tab_Walker to simulate real keyboard navigation so that Cursed Loop, Invisible Wanderer, and Lost Soul detection have accurate focus-order and focus-indicator data.

#### Acceptance Criteria

1. WHEN the page has loaded, THE Tab_Walker SHALL wait for `networkidle` plus a **1500 ms settle window** before issuing the first Tab keypress, so that dialogs that open on a timer (e.g. newsletter popups) are present when the walk begins. THE Tab_Walker SHALL record the absolute timestamp at which the walk started as `walkStartedAtMs` (milliseconds since Unix epoch) in `TabWalkResult`.
2. THE Tab_Walker SHALL inject the CSS rule `*,*::before,*::after{transition:none!important;animation:none!important}` into the page before capturing any focus styles, to prevent transition durations from corrupting the before/after style comparison.
3. THE Tab_Walker SHALL simulate Tab keypresses using Playwright's `keyboard.press('Tab')` API and SHALL record the `backendDOMNodeId` of the focused element after each keypress by reading `document.activeElement` via CDP.
4. THE Tab_Walker SHALL capture a `FocusSnapshot` for each focused element containing a `before` `ComputedStyleMap` read immediately before the Tab keypress and an `after` `ComputedStyleMap` read immediately after focus arrives on the element. THE captured properties SHALL include exactly: `outline-style`, `outline-width`, `outline-color`, `outline-offset`, `box-shadow`, `border-color`, `background-color`, and `text-decoration`. Both `before` and `after` maps SHALL be non-null; if either cannot be read, THE Tab_Walker SHALL record the snapshot with the unreadable map set to an empty object and SHALL continue the walk.
5. THE Tab_Walker SHALL compute `focusableCount` before the walk begins as the count of elements that have a non-negative `tabindex` attribute or are natively interactive (`button`, `a[href]`, `input`, `select`, `textarea`, `summary`, `[contenteditable]`). THE Tab_Walker SHALL cap the walk at `focusableCount * 2 + 10` steps. WHEN the step cap is reached, THE Tab_Walker SHALL stop the walk and set `TabWalkResult.stepCapReached = true`. The step cap applies to the whole walk including any segments after escapable cycles.
6. WHEN the same `backendDOMNodeId` appears in the focus sequence for a second time before every element in the pre-walk focusable set has been visited at least once, THE Tab_Walker SHALL record the repeated `backendDOMNodeId` and the set of `backendDOMNodeId` values visited since the first occurrence as a candidate cycle, and SHALL immediately perform the escape test: press `Escape` once, then `Shift+Tab` once, and read `document.activeElement` via CDP to determine the resulting focused element.
7. WHEN the escape test produces a focused element whose `backendDOMNodeId` is not a member of the candidate cycle's node set, THE Tab_Walker SHALL mark the cycle as `escapable: true` in `TabWalkResult.cycles`, **reset cycle detection** (begin a new segment), and resume the Tab walk from that element so that elements appearing later in the page (footers, etc.) are still visited. The step cap continues to apply to the cumulative step count across all segments.
8. WHEN the escape test produces a focused element whose `backendDOMNodeId` is a member of the candidate cycle's node set, or when no element is focused after the escape test, THE Tab_Walker SHALL set `TabWalkResult.trapDetected = true` and SHALL record the `backendDOMNodeId` values of all elements in the candidate cycle in `TabWalkResult.trapRegionNodeIds`. THE Tab_Walker SHALL stop the walk immediately upon declaring a trap and SHALL not issue further Tab keypresses.
9. WHEN `document.activeElement` is `document.body` or when no element is focused after a Tab keypress, THE Tab_Walker SHALL treat this as the natural end of the walk, SHALL stop issuing Tab keypresses, and SHALL not set `trapDetected = true`, regardless of whether all focusable elements were visited.
10. THE Tab_Walker SHALL record every Tab step — including steps taken before, during, and after the escape test — in `TabWalkResult.steps` as an ordered `TabStep[]`. Each `TabStep` SHALL include the `backendDOMNodeId` of the focused element, the step index (0-based), and the `FocusSnapshot` captured for that step.
11. WHEN `focusableCount` is zero, THE Tab_Walker SHALL return a `TabWalkResult` with `steps: []`, `trapDetected: false`, `stepCapReached: false`, and `cycles: []` without issuing any Tab keypresses and without throwing.
12. IF the CDP call to read `document.activeElement` or to retrieve computed styles fails for any step, THEN THE Tab_Walker SHALL record the step with the available data, set a `cdpError: true` flag on that `TabStep`, and SHALL continue the walk rather than throwing.

---

### Requirement 12: RawAudit Output Contract

**User Story:** As a developer building the haunting classifier, I want `RawAudit` to be a fully typed, serializable object with a schema version so that the classifier and future tooling can depend on a stable interface.

#### Acceptance Criteria

1. THE Audit_Engine SHALL produce a `RawAudit` object whose TypeScript definition is declared in `packages/core/src/types.ts` and that includes at minimum: `schemaVersion` (string literal `"1"`), `auditedUrl` (string), `auditedAt` (ISO 8601 timestamp string), `screenshotPng` (base64-encoded string), `boundingBoxes` (BoundingBox[]), `axNodes` (AXNode[]), `axeViolations` (AxeViolation[]), `axeIncomplete` (AxeViolation[]), `textNodeStyles` (record mapping a backend DOM node ID string to a `TextNodeStyle` object containing `color`, `backgroundColor`, `fontSize`, and `fontWeight` as strings), `imgAltAttributes` (record mapping a backend DOM node ID string to its `alt` attribute value as a string or `null` when the attribute is absent), `eventListenerSignals` (EventListenerSignal[]), `tabWalkResult` (TabWalkResult), `pageMetadata` (PageMetadata), `domAxMapping` (DomAxMapping[]), `resourceUsage` (ResourceUsage), `blockedRequests` (string[]), `abortedResources` (string[]), and `collectionErrors` (CollectionError[]).
2. THE Audit_Engine SHALL set `RawAudit.schemaVersion` to the string literal `"1"`. IF a change to the `RawAudit` type removes a field, renames a field, or changes the type of an existing field in a way that is not backward-compatible with all prior consumers of that field, THEN THE Audit_Engine SHALL increment `schemaVersion` to the next integer string (e.g., `"2"`, `"3"`) before the change is released. Adding a new optional field to `RawAudit` does not constitute a breaking change and does not require a version increment.
3. THE Audit_Engine SHALL ensure that `RawAudit` is JSON-serializable such that `JSON.stringify(rawAudit)` completes without throwing and produces a string from which `JSON.parse` reconstructs a value that is deep-equal to the original for every field except `screenshotPng`, which SHALL be a base64-encoded string rather than a binary Buffer. No field in `RawAudit` SHALL be a `Map`, `Set`, class instance, or circular reference.
4. WHEN all data collection steps succeed, THE Audit_Engine SHALL return a `RawAudit` where `collectionErrors` is an empty array.
5. WHEN one or more non-fatal data collection steps fail, THE Audit_Engine SHALL return a `RawAudit` with all successfully collected fields populated and the failed steps recorded in `collectionErrors` rather than throwing. The non-fatal steps are: axe-core injection and result collection, CDP `DOMDebugger.getEventListeners` queries, computed style collection for text nodes and images, and DOM-to-AX node mapping resolution. The fatal steps are: browser page navigation, CDP `Accessibility.getFullAXTree` retrieval, and screenshot capture; a failure in any fatal step SHALL cause `auditUrl` or `auditHtml` to throw rather than return a partial `RawAudit`.
6. WHEN `auditUrl` or `auditHtml` is called twice with the same URL and identical page content in the same environment, THE Audit_Engine SHALL produce two `RawAudit` objects that are deep-equal on every field when compared with `JSON.stringify` after both `auditedAt` values are replaced with the same placeholder string and both `resourceUsage.responseTimings` arrays are replaced with empty arrays; `screenshotPng` SHALL be byte-for-byte identical between the two runs when the page contains no animated or time-varying content.

---

### Requirement 13: Public API and Typed Error Classes

**User Story:** As a consumer of `packages/core`, I want a clean public API with typed errors so that I can handle failure modes explicitly and integrate the audit engine into the web app and MCP server.

#### Acceptance Criteria

1. THE Audit_Engine SHALL export `auditUrl(url: string, options?: AuditOptions): Promise<RawAudit>` and `auditHtml(html: string, options?: AuditOptions): Promise<RawAudit>` as named exports from `packages/core/src/index.ts`.
2. THE Audit_Engine SHALL export the `AuditOptions` type with the following optional fields: `allowPrivate: boolean` (default `false`), `timeoutMs: number` (default `60000`), `navigationTimeoutMs: number` (default `30000`), `safeFetchPolicy: SafeFetchPolicy` (optional override for testing), and `viewport: { width: number; height: number }` (default `{ width: 1280, height: 900 }`).
3. THE Audit_Engine SHALL define and export the following typed error classes in `packages/core/src/types.ts`: `AuditTimeoutError` (with `operation: string` and `elapsedMs: number` fields), `SsrfBlockedError` (with `url: string` and `reason: string` fields), `AuditResourceLimitError` (with `limitType: "request-count" | "total-weight" | "per-resource"` and `value: number` fields), `NonHtmlContentError` (with `contentType: string` field), and `AuditCollectionError` (with `step: string` and `cause: unknown` fields).
4. THE Audit_Engine SHALL define the `SafeFetchPolicy` interface in `packages/core/src/runner/safe-fetch.ts` with the signature `interface SafeFetchPolicy { shouldBlock(url: string): Promise<{ block: boolean; reason: string }> }` and SHALL export it as a named export.
5. WHEN `auditUrl` is called with a string that cannot be parsed by the WHATWG URL parser (i.e., `new URL(url)` throws), THE Audit_Engine SHALL throw a `TypeError` with a message indicating the invalid input before any Browser_Pool access occurs.
6. WHEN `auditUrl` is called with a URL whose parsed protocol is neither `http:` nor `https:`, THE Audit_Engine SHALL throw a `TypeError` with a message indicating the unsupported protocol before any Browser_Pool access occurs.
7. THE Audit_Engine SHALL ensure that every error thrown from `auditUrl` or `auditHtml` is an instance of one of the five typed error classes defined in criterion 3, a `TypeError`, or another standard built-in `Error` subclass; it SHALL never throw a plain string, a plain object, or an untyped value.

---

### Requirement 14: Concurrency and Isolation

**User Story:** As a developer running concurrent audits, I want each audit to run in an isolated browser context so that one audit's cookies, storage, and state cannot affect another's.

#### Acceptance Criteria

1. THE Audit_Engine SHALL create a new Playwright `BrowserContext` for every audit request rather than sharing a context between concurrent audits; each context SHALL be closed in a `finally` block at the end of the audit.
2. WHEN two audits run concurrently for different URLs, THE Audit_Engine SHALL ensure that cookies, localStorage, sessionStorage, and service worker registrations from one audit are not visible to the other.
3. WHEN a cross-origin resource request is initiated by the audited page, IF the request URL resolves to a private, loopback, link-local, or cloud-metadata address range as defined by `SafeFetchPolicy`, THEN THE Audit_Engine SHALL block the request; otherwise THE Audit_Engine SHALL permit the request so that CDN-hosted assets load normally.
4. THE Audit_Engine SHALL set `bypassCSP: false` in the browser context to preserve the page's Content Security Policy, ensuring that the audit environment reflects the production page behaviour.
5. IF the `BrowserContext` creation fails, THEN THE Audit_Engine SHALL throw an `AuditContextError` and SHALL NOT proceed with page navigation or any further audit steps.
6. THE Audit_Engine SHALL enforce a maximum of 10 concurrent `BrowserContext` instances per Browser instance; IF a new audit request arrives when the limit is reached, THEN THE Audit_Engine SHALL queue the request and begin it only when a running audit releases its context.

---

### Requirement 15: Integration Test Contract

**User Story:** As a developer maintaining the audit engine, I want integration tests against the Cursed Shop fixtures so that changes to the runner do not silently break the data collection pipeline.

#### Acceptance Criteria

1. THE Audit_Engine integration tests SHALL reside in `packages/core/tests/` and SHALL load pages from `apps/cursed-shop/` via a local static file server started within the test process, never from live URLs.
2. WHEN the integration tests run against `apps/cursed-shop/index.html`, THE Audit_Engine SHALL produce a `RawAudit` whose `axNodes` array contains at least one `AXNode` with an interactive role (one of: `button`, `link`, `menuitem`, `menuitemcheckbox`, `menuitemradio`, `tab`, `checkbox`, `radio`, `switch`, `option`, `combobox`, `listbox`, `treeitem`, `gridcell`) and a `name.value` that is an empty string after trimming, confirming that Nameless Spirit candidates are reachable.
3. WHEN the integration tests run against `apps/cursed-shop/checkout.html`, THE Audit_Engine SHALL produce a `RawAudit` whose `tabWalkResult.trapDetected` is `true` and whose `tabWalkResult.trapRegionNodeIds` array contains at least one element identifier, confirming that the Cursed Loop haunting data is collected with enough detail for the classifier to report the affected region.
4. THE Audit_Engine integration tests SHALL assert that `RawAudit.schemaVersion` strictly equals the string `"1"` on every result produced against either fixture, so that any breaking schema change is caught immediately.
5. THE Audit_Engine integration tests SHALL assert that `RawAudit.collectionErrors` is an empty array when running against the Cursed Shop fixtures under normal conditions, confirming that no data collection step silently fails on the reference fixtures.
6. IF the local static file server fails to start within 10 seconds of test process startup, THEN THE Audit_Engine integration tests SHALL abort the entire test suite with an error message indicating that the file server could not be reached, so that a port conflict or missing fixture directory is diagnosed immediately rather than producing misleading test failures.
7. WHEN the integration tests run against `apps/cursed-shop/index.html`, THE Audit_Engine SHALL produce a `RawAudit` whose `screenshotPng` is a non-empty string and whose `viewportWidth` and `viewportHeight` are positive integers, confirming that the browser runner completed a full render pass and that screenshot data flows through to the audit result.
