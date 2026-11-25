Two jobs in this run:
- **Part A:** amend the `unseen-mcp-and-power` spec using the product lead's decisions below.
- **Part B:** implement its demo-critical tasks.

Work in order and save after each item. If you approach a limit, stop after a finished item and print `Next: <item>`. Never end with a menu or a question.

Read first:
- `.kiro/specs/unseen-mcp-and-power/` (requirements, design, tasks)
- `docs/brief/review-notes/mcp-power-spec-review-1.md`: 33 findings from two reviewers. Reviewer 1 checked the current kiro.dev docs, which you could not read last run. Reviewer 2 checked the real core code.

The decisions below settle every blocker. **Apply every finding in the review note too**, unless a decision here overrides it.

## Part A: decisions (write them into requirements, design and tasks)

**D1. Ghost gate mechanism (from the docs, now settled).**
- **Behaviour:**
  - The Stop hook reads stdin JSON `{hook_event_name, cwd, session_id}`.
  - To make the agent keep working, it **exits 1 and writes the instruction to stderr**. Never use exit 2: it drops the output.
  - Keep the instruction under 3,000 characters, listing at most the top 5 critical hauntings.
  - The instruction ends with: "Fix the source, call audit_url (or audit_html) on the same page, and report the before score M and the new score before finishing."
  - A passing gate exits 0 and prints one line for the user.
- **Surface:** the demo is recorded in the **Kiro IDE**.
- **Fallback:** if the IDE does not start a new turn on a Stop exit 1, use an `agent`-type Stop hook. Implement it as a **second, disabled-by-default** hook entry in the same file and document how to switch to it in `DEMO.md`.

**D2. Install route: no npm publish (that needs the owner's npm account and is out of scope).**
- **Packaging:**
  - Add a root script `npm run unseen:install-global`. It runs `npm pack` for `@the-unseen/core` and `@the-unseen/mcp`, then `npm i -g` both tarballs.
  - `@the-unseen/core` is `private` today. Make packing work without publishing anything; drop `private` from both only if packing requires it, and say so.
  - The global bin is `unseen-mcp`.
- **The Power's `power/mcp.json`:**
  - Must validate against the Agent Plugins schema: `$schema`, and `type: "stdio"` on each server.
  - It has one server: `unseen`, with `command: "unseen-mcp"`.
  - No `unseen-local`, no `disabled`, no `autoApprove`.
- **Hooks in other workspaces:** add the subcommand `unseen-mcp install-hooks [dir]`. It writes:
  - `.kiro/hooks/unseen-hooks.json`
  - `.kiro/hooks/scripts/unseen-on-save.mjs`
  - `.kiro/hooks/scripts/unseen-gate.mjs`
  
  into the target workspace.
  - The shims call the server by absolute path (`process.execPath` plus the resolved `server.js`), so no PATH or `npx` lookup is needed.
  - The Power skill `install-unseen-hooks` just runs that command.
  - Powers cannot ship hooks; do not ship a `power/hooks/` folder.
- **Windows:**
  - Spawn with `process.execPath` and an argument array.
  - Never split command strings on whitespace.
  - Add a test with a path that contains a space (this repo's own path has one).

**D3. Dirty detection and the page to audit (deterministic, no dev server needed).**
- **Dirty files:** the gate treats as dirty any UI file (`html, tsx, jsx, vue, svelte, css`) whose mtime is newer than the last gate pass, recorded in `.unseen/gate-state.json`.
  - This works even if PostFileSave does not fire for agent writes.
  - PostFileSave still prints the on-save summary.
- **What gets audited:**
  - If a dev URL is configured (`UNSEEN_DEV_URL`) and reachable, audit it.
  - **Otherwise, audit each dirty `.html` file directly with core** (`auditHtml` plus classification through one new core function `auditHtmlAndClassify` in `audit.ts`, mirroring `auditAndClassify`).
  - Skip only when nothing auditable is dirty.
- **The `.unseen/` folder:**
  - It is resolved from the hook's `cwd` (or `UNSEEN_WORKSPACE`), never the MCP server's cwd.
  - The MCP tools never write `.unseen/`; drop requirement 2.8.

**D4. Before/after scores.**
- On-save writes `.unseen/turn-start.json` only if it is absent.
- The gate reads "before" from it and deletes it on pass.
- The baseline diff uses a stable fingerprint (`type|kind|htmlSnippet` plus an occurrence index), not node ids.
- Gate state stores `{sessionId, consecutiveBlocks, lastBlockMs, lastPassMs}`, and resets when the session changes.

**D5. The demo is deterministic.**
- The demo workspace starts with a haunted page: `power/demo/checkout.html`, copied into the workspace by a `DEMO.md` step.
  - It has an icon-only `<button class="checkout">` with an SVG, which is a Wraith Nameless Spirit by the checkout-context rule.
- The prompt is: "Add a quantity selector next to the checkout button in checkout.html."
  - Kiro edits the page.
  - The gate audits it and blocks on the existing Nameless Spirit ("you touched a haunted page; the ghost stays your problem").
  - Kiro fixes the button, re-audits and reports before/after.
- **`DEMO.md` prerequisites, in order:**
  1. `npx playwright install chromium`
  2. `npm run unseen:install-global`
  3. Trust the workspace.
  4. Import the Power from the folder.
  5. Run `unseen-mcp install-hooks` and approve the writes.
  6. Delete `.unseen/`.
  7. Start a **new** chat session.
- **Recording note:** list the tool-approval prompts to expect.

**D6. Process hygiene.**
- **CLI subcommands:** wrap them in `try/finally { await getPool().close() }` and set `process.exitCode`.
- **Hook timeouts:** on-save `timeout: 90` with an internal deadline of 75 s; Stop `timeout: 150` with an internal deadline of 130 s.
- **`packages/mcp/vitest.config.ts`:** `testTimeout` 180000, `hookTimeout` 60000, single thread, and close the pool in `afterAll`.
- Build core before the mcp typecheck.

**D7. Fix the following properties and expectations (from review 2):**
- **P8:** bans claims (for example `/\b(is|are|now|fully)\s+(accessible|compliant)\b|passes WCAG|WCAG compliant/i`), not the word "accessible".
- **P11:** restated as in the review, and it reads `raw.axeViolations`.
- **P10 and P7:** strengthened as in the review.
- **`file:///` input:** expect `INVALID_INPUT` for it.
- **Task 1.1:** may append the new export names to the expected list in core's `index.test.ts`. No removals, and no other core test edits.
- **WCAG and sound-cue data:** `WCAG_BY_TYPE` and `SOUND_CUE_BY_TYPE` move into core, are used by the detectors and are exported. Behaviour must not change, and the core tests stay green.

**D8. Work the product lead does.**
- **Task 9 (enable `unseen` in `.kiro/settings/mcp.json`):** you cannot write `.kiro/settings/`. Print the exact JSON entry instead; the lead applies it.
- **`.gitignore`:** the lead has already added `.unseen/`.
- **If writes are refused:** writes to `.kiro/hooks/` and `.kiro/agents/` may be refused in headless mode. If one is, print the full file content in your summary and continue; the lead applies it verbatim.

## Part B: implement
Implement these amended tasks in order: **0, 1, 2, 3, 4** (the date fix, the MCP server and CLI, Power packaging, the gate and on-save hooks plus `install-hooks`, and `DEMO.md`). Then do **5** (`explain_haunting`, `suggest_fix`) if you still have room.

Rules:
- Tick a task only when its tests pass.
- Never weaken an existing test.
- Use `UNSEEN_CHROMIUM_CHANNEL=chromium` on this Windows host.
- **Acceptance for task 3:** a real end-to-end check (not stubbed).
  1. Copy `power/demo/checkout.html` into a temp workspace, then run `unseen-mcp install-hooks` there.
  2. Touch the file and pipe a Stop payload into the installed gate shim. It must exit 1 with the Nameless Spirit on stderr.
  3. Fix the button in the temp copy, touch it, and run the gate again. It must exit 0 and print the before/after.

  Put this check in an integration test.

**At the end:**
- Run, and report pass counts for:
  - `npm run typecheck`
  - `npm test -w @the-unseen/core`
  - `npm test -w @the-unseen/mcp`
  - the mcp integration tests
- Print the `.kiro/settings/mcp.json` entry for the lead.
- Print `Next: <first unfinished task>`.
