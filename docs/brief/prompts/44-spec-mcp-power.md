Create the Kiro spec **`unseen-mcp-and-power`** in `.kiro/specs/unseen-mcp-and-power/` (`requirements.md`, `design.md`, `tasks.md`). **Do not implement yet.** Keep `requirements.md` under about 15 KB and use the same Kiro task format as `.kiro/specs/spirit-sight-ui/tasks.md`: checkboxes, requirement references, and property-based test sub-tasks that are **mandatory**, not optional.

Read `docs/brief/prompts/15-spec-unseen-mcp-and-power.md` first. It is the base brief, including its 2026-11-24 addendum on the current Power, hook and agent formats. The updates below win over it where they differ.

## Updates as of 2026-11-25

### 1. Reuse what exists
`packages/core` already exports `auditAndClassify`, `auditUrl`, `auditHtml`, `PermissiveSafeFetchPolicy`, `RestrictiveSafeFetchPolicy` and `buildSpeechTrack`. The MCP tools must call these and **must not duplicate any audit or classifier logic**.
- `explain_haunting` reads the haunting catalogue that the classifier and `apps/web` already use. Name the exact module in `design.md`.
- `suggest_fix` builds on each haunting's existing `fix` field. It may add React and Vue variants, but must never add runtime overlays.

### 2. This product's innovation story: the auditor lives inside the agent loop
The video's central claim is: *"Kiro cannot finish a UI task while a ghost is in it."* The spec must make this real and testable.
- **Power hook (`PostFileSave` on UI files):**
  - Audits the dev server URL, which comes from a documented setting or env var with a sensible default.
  - Reports only **new** hauntings compared with the last audit.
  - If the dev server is not reachable, it says so in one line and does not fail the save.
- **Power `Stop` hook (the ghost gate):**
  - Before Kiro ends a turn that changed UI files, it re-audits.
  - If any **critical** haunting remains, it prints the hauntings to the agent and exits non-zero. The agent then keeps working until they are fixed.
  - Use the documented Stop-hook semantics. If the docs say a Stop hook cannot block, use the documented mechanism that comes closest, and record the deviation.
- **Steering in the Power:** "Audit every UI you build or change before saying the task is done", plus the rules from prompt 15.
- **Acceptance (this is the 1:10–1:50 segment of the video, documented step by step in `power/DEMO.md`):**
  1. In a fresh workspace with the Power installed, ask Kiro to "build a checkout button".
  2. The gate catches the icon-only button (Nameless Spirit).
  3. Kiro fixes the source.
  4. Kiro re-audits and reports the before and after scores.

### 3. Hooks for this repo: only add what is missing
`.kiro/hooks/` already has `core-typecheck-on-save`, `guard-protected-files`, `shop-verify-on-save`, `spec-types-drift` and `stop-test-gate`. Do not recreate those. Add only:
- **`web-self-audit-on-save`:** a `PostFileSave` hook matching `apps/web/src/client/.*\.(tsx|ts|css)$`.
  - It runs the web app's self-audit (`apps/web/e2e/self-audit.spec.ts`, or a faster unit-level equivalent if that is more practical; justify the choice in `design.md`).
  - It prints a one-line summary.
- The **"Exorcise the Cursed Shop"** workflow, as a Power skill plus the existing `#exorcise` manual steering:
  - It writes a fixed copy to `demo/cursed-shop-exorcised/` (see prompt 15).
  - The original stays haunted.

### 4. Custom agent
Add a read-only `unseen-auditor` agent (CLI V3 schema): `fs_read` plus the unseen MCP tools only.

### 5. Enable THE UNSEEN on itself
In the implementation tasks, the last step enables the `unseen` entry in `.kiro/settings/mcp.json` (today it is `"disabled": true`). It also points that entry at the built server.

### 6. One housekeeping fix (put it in tasks as task 0)
`docs/LIVE_VERIFICATION_RESULTS.md` says `**Date:** 2025-01-31`. Run 32 actually happened on **2026-11-24**, so correct the date. Change nothing else in that file.

### 7. Scope guard
The deadline is Fri 4 Dec. Size the task list so the whole implementation fits in **one or two implementation runs**: at most about 12 top-level tasks. Put tasks in demo-critical order:
1. the MCP server's `audit_url` and `audit_html`
2. Power packaging
3. the ghost-gate and on-save hooks
4. `DEMO.md`
5. `explain_haunting` and `suggest_fix`
6. the auditor agent
7. the repo self-audit hook

Never end with a menu or a question. When the spec is written, print `Next: implementation` and stop.
