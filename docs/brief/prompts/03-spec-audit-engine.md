Create the Kiro spec **`audit-engine`** for THE UNSEEN. Follow the steering docs (especially `hauntings.md`, `security.md`, `tech.md`, `structure.md`) and `docs/brief/PRODUCT_BRIEF.md`.

**Scope:** `packages/core`'s runner layer, i.e. everything that touches a browser:

- **Load** a URL (or raw HTML) in Playwright Chromium at a fixed viewport (1280 wide, full-page). Take a full-page screenshot and collect element bounding boxes **from the same render**, in screenshot pixel coordinates.
- **Collect raw data:**
  - the CDP `Accessibility.getFullAXTree` with `backendDOMNodeId` mapping to DOM nodes
  - axe-core results (WCAG 2.2 A/AA tags)
  - computed styles needed for contrast and focus
  - `DOMDebugger.getEventListeners` signals for Lost Soul candidates
  - the html `lang`, headings and landmarks
- **Tab walker:** a real Tab keypress walk with `:focus-visible` style capture before and after focus. Apply the Escape / Shift+Tab escape test before declaring a trap, the step cap, and the body/chrome end detection.
- **Output:** one serializable `RawAudit` object (typed, versioned) that the pure classifier consumes. No haunting logic in the runner.
- **Fetching:** goes through a `SafeFetchPolicy`. The hosted mode blocks private, loopback, link-local and metadata ranges for every request via `page.route`. `allowPrivate: true` is only for the local MCP. The SSRF guard itself will be its own spec (`safe-fetch`). Here, define the interface the runner depends on.
- **Limits:** timeouts, page-weight limits and a browser pool with a concurrency cap, per `security.md`.

**Requirements:** EARS format with acceptance criteria. Include requirements for:
- determinism: the same page gives the same `RawAudit` apart from timestamps
- failure modes: navigation timeout, blocked request, oversized page, non-HTML content type, crash recovery, each with typed errors

**Design:** module layout, data types (`RawAudit`, `AxNodeLite`, `ElementBox`, `TabStep`, …), the sequence diagram for one audit, the error model, and how it's tested.

**Testing strategy:**
- Playwright integration tests against static fixture pages that each contain exactly one known haunting (put fixtures under `packages/core/test/fixtures/`).
- Property-based tests with fast-check for any pure helpers: box-coordinate transforms, the tab-cycle detection function (extract it as a pure function over a sequence of focus IDs), and the step cap.

**Tasks:** small, ordered, each referencing requirements, each ending in passing tests. The first task scaffolds the npm-workspaces monorepo root (package.json, tsconfig base, vitest config, eslint) if it does not exist.

Write the spec files to `.kiro/specs/audit-engine/` (`requirements.md`, `design.md`, `tasks.md`). Do not implement code yet.
