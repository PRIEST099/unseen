**Deliverable: an edited `.kiro/specs/spirit-sight-ui/tasks.md`.** No report files; the product lead checks `git diff`.

Your format conversion (run 41) is good: 21 checkbox tasks, and the npm dependency is fixed. But it **compressed tasks 1.6 to 3.5 to a few lines each and dropped their acceptance criteria.** Task 1.6, for example, lost about 26 concrete criteria: `naturalWidth` geometry, the SVG `viewBox`, the overlays hidden before "Open Spirit Sight", the canvas wave timing, the 24 px targets, the focus ring, DOM order, the sidebar, and more.

The pre-conversion text is saved at **`docs/brief/review-notes/ui-tasks-before-format-conversion.md`** (read-only).

**For every task from 1.6 through 3.5**, restore its full **Acceptance Criteria** list from that file, as indented bullets under the checkbox item. Keep the new checkbox format, and keep the requirement, design, test and checkpoint lines you already have. While restoring, correct these known-stale criteria:
- **Coverage note:** show `audit.automatedCoverageNote` **verbatim**. Delete any invented sentence such as "Automated checks find approximately 30-40%…".
- **Reduced motion does not redirect to Daylight.** Spirit Sight uses its reduced-motion variant (`requirements.md` 16.x).
- **The clean-site copy** is exactly: "No hauntings found by automated checks; a manual review is still needed."
- **Sub-routes and views:** use the names in the current `design.md` (grep its headings). For example, if `AuditResultView` is not a design component, use the design's name instead.

**Verify:** `git diff --stat .kiro/specs/spirit-sight-ui/tasks.md`; `grep -c "^\s*- \[ \]"` must still be ≥ 21; the task 1.6 section must contain `naturalWidth`, `viewBox`, `aria-pressed`, `24` and `#spirit-sight`. Paste the results. Do not ask questions.
