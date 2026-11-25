# unseen-mcp-and-power spec review 1 (2026-11-25)

Two independent reviewers (Claude Code workflow) checked the run 44 spec against the current kiro.dev docs and the real core code. Findings are verbatim below. The product lead's decisions are in `prompts/46-mcp-power-amend-and-build.md` and win where they differ.

######## REVIEWER 1

[1.1] BLOCKER @ .kiro/specs/unseen-mcp-and-power/design.md lines 135-137 (Stop-hook semantics, option 1 'exits 2') and line 167 (demo step 4 'exits 2'); requirements.md 12.2/12.7 (line 109, 114); tasks.md 3.1 (lines 70-75) and 3.2 (line 82, 'exits with the code chosen in 3.1')
PROBLEM: The ghost gate's primary mechanism is a Stop hook that prints to stderr and exits 2. This is the one exit code that is documented to drop the output and end the turn in CLI V3. In the IDE, Stop is documented as unable to block. Task 3.1 also leaves this decision to the builder reading the docs at run time, but the builder has no doc access. As written, the 1:10-1:50 demo claim ('Kiro cannot finish while a ghost is in it') will not happen.
FIX: Replace design lines 135-137 and task 3.1 with the documented facts, so the builder does not need doc access.

(a) The gate reads stdin JSON (`hook_event_name`, `cwd`, `session_id`).

(b) On block, it exits 1 and writes the instruction to stderr. This is the only code that both CLI V3 (new turn) and the IDE (stderr sent to agent) forward. Alternatively it exits 0 with stdout exactly `{"decision":"block","reason":"<text>"}`, which works in CLI V3 only. Pick exit 1 + stderr. Never use 2.

(c) Keep the reason under 3,000 characters (for example the top 5 critical hauntings). CLI 3.6+ truncates longer hook output to a file.

(d) Requirement 12.2: 'exits 1 with the instruction on stderr'. DEMO step 4: 'exits 1'. Shim tests assert 1, not 2.

(e) Record the IDE risk in Notes and add an IDE rehearsal step to task 4. If the IDE does not start a new turn on a Stop exit 1, the documented IDE fallback is an `agent`-type Stop hook, because agent actions 'trigger a new agent loop' (hooks/actions). Its prompt would be: 'Run node .kiro/hooks/unseen-gate.mjs; if it prints gate passed or skipped, reply nothing more; otherwise fix the listed hauntings in source'. Also note it costs credits on every turn.

[1.2] BLOCKER @ requirements.md 1.1 (line 24), 7.3 (line 74), 10.2 (line 92); design.md line 133 (shims run `npx -y @the-unseen/mcp on-save|gate`), line 146 (mcp.json), line 183 (agent uses npx in CI); tasks.md 2 (line 59)
PROBLEM: The whole consumer path (Power mcp.json `unseen`, the hook shims and the CI agent) runs `npx -y @the-unseen/mcp`, but that package is not on npm, and no task publishes it or `@the-unseen/core`. The other entry, `unseen-local` (`node packages/mcp/dist/server.js`), is resolved against the Power's root, not the workspace. In the demo's fresh workspace, neither the MCP server nor the hooks would start.
FIX: Choose one route now and write it into the spec.

(a) Recommended: add a human-run task before task 4, 'Publish @the-unseen/core and @the-unseen/mcp 0.1.0 to npm (product lead runs npm publish)'. Make DEMO.md prerequisites check `npm view @the-unseen/mcp version`.

(b) If not publishing: change requirement 1.1 to drop the claim 'npx -y @the-unseen/mcp works'. Have DEMO.md set `UNSEEN_MCP_CMD` to the absolute path of `packages/mcp/dist/server.js`. Document that the Power's `unseen` server needs a user-level `~/.kiro/settings/mcp.json` entry with an absolute path.

In both cases, remove `unseen-local` from `power/mcp.json`. It resolves under the plugin root, and if it did start it would duplicate all four tools. Local development already uses `.kiro/settings/mcp.json`.

[1.3] MAJOR @ requirements.md 10.2 (line 92); tasks.md 2 (line 59) and its test (line 63); design.md line 146
PROBLEM: The spec's `power/mcp.json` omits two fields the Agent Plugins MCP schema requires: top-level `$schema` and `type: "stdio"` on each server. The task 2 test would therefore check the wrong required fields. The schema also forbids `disabled` and `autoApprove`, so the Power cannot auto-approve the unseen tools.
FIX: Requirement 10.2 and task 2 should read: `power/mcp.json` = {"$schema":"https://agent-plugins.org/schemas/1.0.0/mcp.schema.json","mcpServers":{"unseen":{"type":"stdio","command":"npx","args":["-y","@the-unseen/mcp"]}}}.

The power.test should validate `plugin.json` and `mcp.json` against the two published schemas, both of which have additionalProperties false. Note in README and DEMO that the installed server is named `power-the-unseen-unseen` and that tool calls will ask for approval, because autoApprove is not available in a Power.

[1.4] MAJOR @ requirements.md 10.3 and 10.6 (lines 93, 96); design.md lines 139, 155-157 (power/hooks/ tree), line 208; tasks.md 2 (line 60) and 3.3 (lines 91-93)
PROBLEM: Hooks are shipped as a top-level `power/hooks/` folder, and the `install-unseen-hooks` skill 'copies power/hooks/*'. Neither Kiro nor Agent Plugins defines `hooks/` as a component. In a consumer workspace the files are not at `power/hooks/`, and Kiro does not promise to copy unknown folders when it installs a Power. The spec still treats 'Agent Plugins hook support' as unknown, but the docs settle it: a Power cannot carry hooks.
FIX: Treat 'Powers cannot ship hooks' as settled and remove the risk at design line 208.

Move the hook JSON and shims into a component Kiro does load: `power/skills/install-unseen-hooks/references/unseen-hooks.json` and `power/skills/install-unseen-hooks/scripts/{unseen-on-save.mjs,unseen-gate.mjs}`. The SKILL.md body should also contain the full file contents inline, so the agent can write them even if it cannot resolve the install path.

A more robust option is a CLI sub-command `unseen-mcp install-hooks` that writes `.kiro/hooks/unseen-hooks.json` and `.kiro/hooks/scripts/unseen-*.mjs`; the skill then just runs it.

Also align names. Design line 157 names the scripts `on-save.mjs`/`gate.mjs`, but the hook commands at tasks line 91 run `node .kiro/hooks/unseen-on-save.mjs`/`unseen-gate.mjs`. Use one set of names, for example `.kiro/hooks/scripts/unseen-on-save.mjs`, to match the repo's existing `.kiro/hooks/scripts/` convention.

[1.5] MAJOR @ tasks.md 9 (line 152); requirements.md 17.1 (line 144)
PROBLEM: Task 9 has the Kiro builder edit `.kiro/settings/mcp.json`. Kiro always denies agent writes to `.kiro/settings/`, and no allow rule overrides this. Every run would end with task 9 failed.
FIX: Make task 9 a human step. Kiro builds, runs the stdio smoke test, then prints the exact JSON for the `unseen` entry: "disabled": false, args ["packages/mcp/dist/server.js"], autoApprove with the four tools. The product lead pastes it in. Kiro then confirms in the MCP panel. Requirement 17.1 should read 'the product lead applies…'.

[1.6] MAJOR @ requirements.md 2.8 (line 41); design.md line 118 ('Written by every audit_url and CLI audit') and line 11 (.unseen/ 'in the workspace')
PROBLEM: `audit_url` writes the Baseline to `.unseen/last-audit.json` relative to the MCP server process's working directory. When the server comes from the Power, that directory is the plugin root, not the workspace. The hooks read `.unseen/` from the project root, so the new-haunting diff and the gate's 'before M' score would read and write different files.
FIX: Drop requirement 2.8. Only the hook CLI sub-commands (`on-save`, `gate`, which run in the project root and get `cwd` on stdin) read and write `.unseen/`. Alternatively, have the MCP server write the Baseline only when it can resolve the workspace from the MCP client's `roots/list`, and skip the write otherwise. Update design line 118 to match.

[1.7] MAJOR @ design.md lines 168-169 (demo steps 5-6: 'gate passed (score 3, before 15)' then 'Kiro reports the before and after scores'); requirements.md 12.3 (line 110); prompt 44 acceptance step 4
PROBLEM: The demo has Kiro report before and after scores after the gate passes. A passing Stop hook (exit 0, no decision) ends the turn, so the agent gets no further turn to report anything. In the CLI its stdout is also not passed to the agent. The before/after report has to be produced in the turn that fixes the source, before the final Stop.
FIX: Make the block instruction (stderr, exit 1) end with: 'Fix the source, call audit_url on <devUrl>, and report the before score <M> and the new score before finishing.'

In DEMO.md, step 5 becomes: 'Kiro fixes the source, calls audit_url and reports before/after.' Step 6 becomes: 'Kiro ends its turn; the gate re-audits, prints gate passed (visible in the hook output), and the turn ends.'

Requirement 12.3: the pass line is for the user, not the agent.

[1.8] MAJOR @ tasks.md 3.3 (line 91, Stop hook has no timeout); requirements.md 11.5 (line 103); design.md line 207
PROBLEM: The Power's Stop hook sets no `timeout`, so the documented 60-second default applies. The gate does a HEAD check, possibly an `npx -y` download, a Chromium launch and a full audit. That can exceed 60 s, and a killed Stop hook ends the turn without forwarding anything, so the gate silently passes.

The on-save hook has the same kind of problem. Its hook timeout and its internal deadline are both 90 s, so Kiro kills the process before the specified 'timeout prints one line and exits 0' branch can run.
FIX: In `unseen-hooks.json`, set `"timeout": 150` on the Stop hook and `"timeout": 90` on the PostFileSave hook. Requirement 11.5 and task 3.2 should give the CLI's internal audit deadline as about 75 s for on-save and about 130 s for the gate, so each is shorter than its hook timeout. Then the 'timed out' line and the exit 0 or exit 1 actually happen.

[1.9] MAJOR @ requirements.md 16.2 (line 139); design.md line 183; tasks.md 6 (line 122)
PROBLEM: The `unseen-auditor` rules allow `fs_read` and deny `fs_write` and `shell`, but grant nothing for `mcp`. MCP tool calls default to asking, and in a headless CI run every ask counts as a deny. The CI agent would therefore be refused every `audit_url` call.
FIX: Add to requirement 16.2 and task 6: { "capability": "mcp", "match": ["unseen/audit_url","unseen/audit_html","unseen/explain_haunting","unseen/suggest_fix"], "effect": "allow" }. Keep `tools: ["read", "@unseen"]`, inline `mcpServers.unseen`, no `includeMcpJson`, and no `allowedTools`.

Optionally add `"includePowers": false` so an installed The Unseen Power does not also add `power-the-unseen-unseen`. The agent.test should assert the mcp allow rule.

[1.10] MINOR @ tasks.md 7 checkpoint (line 135: 'one manual save of a file under apps/web/src/client/ prints the one-line summary'); requirements.md 15
PROBLEM: PostFileSave never fires on a manual editor save, so this checkpoint can never pass as written.
FIX: Change the checkpoint to: 'ask Kiro to make a whitespace edit to a file under apps/web/src/client/; the hook prints the one-line summary.' Say the same in the requirement 15 notes. The same applies to the DEMO: the on-save line appears only because Kiro writes the button.

[1.11] MINOR @ power/DEMO.md content per requirements.md 13 and tasks.md 4 (line 102); install-unseen-hooks skill (tasks line 93); tasks 6 and 7 (writes to .kiro/agents and .kiro/hooks)
PROBLEM: Three documented behaviours are missing from the demo steps and the implementation-run assumptions:
1. A fresh workspace is untrusted until the user trusts it. Until then Kiro does not load its Skills, steering or MCP configuration, and it asks before every MCP tool call and every Power activation.
2. Writes to `.kiro/hooks/` and `.kiro/agents/` always prompt, so `install-unseen-hooks` and tasks 6 and 7 need a person to approve them.
3. Hooks activate when a session starts, so hooks installed mid-session may not run until the next session.
FIX: In DEMO.md prerequisites, in order: trust the workspace, import the Power, run /install-unseen-hooks and approve the `.kiro/hooks` writes, then start a new chat session before the 'build a checkout button' prompt. Pre-approve or allow the unseen tools so no prompt interrupts the recording.

In tasks.md Notes: tasks 6 and 7 write to `.kiro/agents` and `.kiro/hooks`, which always prompt, so the implementation run must be attended (or those files are created by the lead).

[1.12] MINOR @ requirements.md 11.1-11.2 (lines 100-101); design.md line 166 (demo step 3 'PostFileSave prints: THE UNSEEN: 1 new haunting…')
PROBLEM: The on-save hook prints its summary to stdout and exits 0. In the IDE that stdout reaches the agent's context. In CLI V3 it is documented as ignored for PostFileSave, so 'the agent sees new hauntings on save' is IDE-only. The gate is the only part of the loop that works on both surfaces.
FIX: State in requirement 11 and DEMO.md that the demo is recorded in Kiro IDE. In the CLI, on-save output is informational only, and the Stop gate (exit 1 + stderr) is what feeds hauntings back to the agent. No code change is needed.

[1.13] MINOR @ requirements.md 12.5 (line 112: 'after 5 consecutive blocks in one session'); design.md line 120 (gate-state.json holds only { consecutiveBlocks })
PROBLEM: The loop guard is meant to count blocks 'in one session', but the state file has no session key. A counter left over from an earlier session would make a new session give up early, or the demo would start with a stale count.
FIX: Store `{ sessionId, consecutiveBlocks }` in `.unseen/gate-state.json`. The gate reads `session_id` from stdin and resets the counter when it changes; if stdin has no session_id, it falls back to resetting on pass. Add `sessionChanged` as an input to `decideGate` (pure) and to property P5.

######## REVIEWER 2

[2.1] BLOCKER @ .kiro/specs/unseen-mcp-and-power/requirements.md:24,74; design.md:133,146; tasks.md:59,92
PROBLEM: There is no working install route for the 'fresh workspace' demo. The Power's MCP entry and every hook shim run `npx -y @the-unseen/mcp`. That package depends on @the-unseen/core, which is marked private and never published, and no task publishes either package. The fallback `unseen-local` runs `node packages/mcp/dist/server.js` with a relative path, which only exists inside this repo, not in a fresh workspace.
FIX: Add a task and a DEMO.md step for one concrete route. Either (1) `npm pack` core and mcp and `npm i -g` both tarballs, then use the command `unseen-mcp`; or (2) make `unseen-local` and the shims use an absolute path from an env var (e.g. `UNSEEN_MCP_CMD="node \"D:/kiroween 2026/the-unseen/packages/mcp/dist/server.js\""`), documented in power/README.md; or (3) publish to npm, which is a user action that needs scope ownership and dropping `private`. Make DEMO.md prerequisites include `npx playwright install chromium`.

[2.2] BLOCKER @ requirements.md:78,102,111; design.md:164; tasks.md:101-102
PROBLEM: Nothing serves the demo page, and when no server answers the gate does not block. The gate and on-save audit only the dev URL (default http://localhost:5173/). A fresh workspace with a tiny HTML page has no dev server, and Req 12.4 makes an unreachable server exit 0, so the gate silently passes. Even with a server running, the root URL serves index.html, not checkout-start.html or whatever file Kiro writes. The fixture also lives in power/demo/ in this repo, not in the demo workspace.
FIX: Have on-save append the saved path to `.unseen/ui-dirty`. When the dev URL is unreachable and the dirty files are .html, the gate and on-save audit each file through Core `auditHtml(readFile(path))` instead of skipping. Alternatively, add `unseen-mcp serve <dir> --port 5173` (node:http, no dependencies) and make DEMO.md set `UNSEEN_DEV_URL=http://localhost:5173/checkout.html`. Add a step to copy the fixture into the demo workspace.

[2.3] MAJOR @ tasks.md:51 (task 1.3 test), tasks.md:101,104 (task 4 fixture/test)
PROBLEM: A Wraith Nameless Spirit needs a checkout context, which neither the task 1.3 test nor the fixture spec provides. Severity is Wraith only when the button is on a core task path: inside a form or dialog, an id/class containing 'checkout'/'cart', or (when unnamed) an id/class/aria-label containing a task keyword. A bare `<button><svg></svg></button>` is Restless, so task 1.3's assertion fails. The fixture spec ('a checkout <button> containing only an SVG icon') does not require that context either.
FIX: Task 1.3: use `<button class="checkout"><svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg></button>`. Task 4: the fixture's button must have `class="checkout"` (or id) or sit inside a `<form>`. State in DEMO.md why it is Wraith.

[2.4] MAJOR @ design.md:118; requirements.md:84-85 (Req 9.1); tasks.md:36 (P1/P2)
PROBLEM: The baseline diff is meaningless because haunting ids are not stable between audits. Ids are an FNV hash of type + backendDOMNodeId + kind, and backendDOMNodeIds are allocated by Chromium for each renderer, so they differ between audits of the same page. The design claims the ids are 'stable hashes … meaningful between audits'. In practice, every save reports every haunting as 'new' (or misses real ones), so Req 11.1 cannot hold. P1/P2 pass on synthetic data and hide this.
FIX: In pure/baseline.ts, diff on a fingerprint that survives a new run: `type|kind|htmlSnippet` plus an occurrence index for duplicates. Store `fingerprints[]` in last-audit.json and keep `ids` only for the session map. Add a PBT that renumbering every node id leaves `newHauntings` empty.

[2.5] MAJOR @ design.md:118,168; tasks.md:81-82; requirements.md:110
PROBLEM: 'gate passed (score N, before M)' will print M == N. on-save writes the baseline on every UI save, so when Kiro saves the fix, on-save overwrites last-audit.json with the fixed score before the Stop gate runs. The 'before' score the demo needs (15) is lost. audit_url (Req 2.8) also overwrites the same file. The MCP server's cwd under a Power is not guaranteed to be the workspace, so it may write somewhere else entirely.
FIX: Keep a turn baseline. On-save writes `.unseen/turn-start.json` only when it is absent (the first dirtying save). The gate reads 'before' from it and deletes it on pass. Add a stub-audit test: haunted save, then fixed save, then gate prints 'before 15'. Resolve `.unseen/` from an explicit workspace root (the hook's cwd, or `UNSEEN_WORKSPACE`), not the MCP server's cwd.

[2.6] MAJOR @ packages/core/src/runner/browser.ts:184,190; design.md:133; tasks.md:81-82
PROBLEM: The CLI process will not exit after an audit. getPool() keeps launched Chromium browsers idle in the pool, so the event loop stays alive. The `audit`, `on-save` and `gate` subcommands would hang until the hook timeout. on-save would always print its timeout line, and the Stop gate would time out instead of blocking. The spec never says to close the pool.
FIX: In CLI mode, wrap each subcommand in `try { … } finally { await getPool().close() }`, then set process.exitCode instead of calling process.exit before stdout flushes. Add a test that the stub-free CLI audit of the shop exits within N seconds.

[2.7] MAJOR @ design.md:92,99,196 (P8); tasks.md:36
PROBLEM: P8 cannot pass on the demo haunting. It requires the summary to contain no 'accessible', but the summary embeds each haunting's Core fix instruction, and Core's Nameless Spirit and Whispering Field instructions contain 'accessible name' / 'accessible label'. The test would either fail, or push Kiro to rewrite Core text, which breaks the no-duplication rule.
FIX: Restate P8 and Req 2.7/18.1 as a ban on claims, e.g. no match for /\b(is|are|now|fully)\s+(accessible|compliant)\b|passes WCAG|WCAG compliant/i. Or apply the substring ban only to text the formatter writes itself, not to Core's fix strings. Apply the same rule to the task 2 power.test text check.

[2.8] MAJOR @ design.md:81,199 (P11)
PROBLEM: P11 contradicts the design's own selector fallbacks, and the design names an axe field that does not exist. P11 says selectorFor never returns a string absent from the axe targets and htmlSnippet. But the fallback builds `tag#id.class` (e.g. `button.pay` from `<button class="pay">`), which is not a substring of either, and the last fallback is the literal '(see htmlSnippet)'. The design also reads `raw.axe`, but the field is `raw.axeViolations` (plus `axeIncomplete`), and node.backendDOMNodeId can be null.
FIX: Restate P11: the result is either an axe target joined by ' ', or derived only from tag/id/class tokens present in htmlSnippet, or exactly '(see htmlSnippet)'. Fix the design to read `raw.axeViolations` and skip null ids.

[2.9] MAJOR @ tasks.md:24,27-28 (task 1.1)
PROBLEM: Task 1.1 cannot be done as written. Adding exports to core index.ts breaks the existing exact-export-list test, yet the task demands core tests stay 'unchanged and green'. Kiro must either edit the test (against the checkpoint) or fail. The mcp typecheck also resolves @the-unseen/core from dist, which is stale until core is rebuilt.
FIX: Allow exactly one test change: append the new names to the expected list in index.test.ts, with no removals. Prefer adding one function, `auditHtmlAndClassify` in audit.ts (like auditAndClassify), over exporting `classify`. Allow the existing subpath `@the-unseen/core/speech` for `announce` in the import-guard test. Add `npm run build -w @the-unseen/core` before the mcp typecheck.

[2.10] MAJOR @ requirements.md:103,108; tasks.md:71-74 (task 3.1)
PROBLEM: Nothing checks that agent edits fire PostFileSave, and the gate depends on it. The gate only runs when `.unseen/ui-dirty` exists, and only the PostFileSave hook creates it. Task 3.1 verifies Stop-hook semantics but not whether Kiro fires PostFileSave for the agent's own fs_write/str_replace edits. If it doesn't, the marker never appears, the gate always returns 'skip', and the central claim fails silently.
FIX: Extend task 3.1 to also check PostFileSave behaviour for agent writes. Add a `PostToolUse` hook (matcher `fs_write|str_replace`) that creates the marker when the path is a UI file. Or have the gate treat any UI file with mtime > `.unseen/gate-state.json` lastPassMs as dirty.

[2.11] MAJOR @ tasks.md:91-93 vs design.md:139,157; requirements.md:93
PROBLEM: The hook install step is internally inconsistent and cannot reach its source files. Task 3.3's hook JSON runs `node .kiro/hooks/unseen-on-save.mjs` and `.kiro/hooks/unseen-gate.mjs`, but the shims are `power/hooks/scripts/on-save.mjs` and `gate.mjs`, and the skill 'copies power/hooks/*'. That produces `.kiro/hooks/scripts/on-save.mjs`, so the hooks hit 'Cannot find module'. Also, in a fresh workspace the Power's folder is not in the workspace, so a skill told to 'copy' files has no path to copy from.
FIX: Pick one layout, e.g. `.kiro/hooks/unseen-hooks.json` plus `.kiro/hooks/scripts/unseen-on-save.mjs` / `unseen-gate.mjs`, and use it in the JSON, the files and the test. Make install self-contained: either the SKILL.md embeds the full JSON and the ~20-line shims inline so Kiro writes them, or add `unseen-mcp install-hooks` that writes them into the cwd. Add a test that every `command` path in unseen-hooks.json exists after install.

[2.12] MAJOR @ design.md:164-168; requirements.md:118; tasks.md:101-102
PROBLEM: The demo's key beat isn't reproducible. Step 3 assumes Kiro, asked to 'build a checkout button', writes an icon-only button. A current model, especially with the audit-before-done skill loaded, will usually write visible 'Checkout' text or an aria-label, so no Nameless Spirit appears and the gate never blocks on camera. The starting fixture (already icon-only) conflicts with 'Kiro writes a button'.
FIX: Make the haunted state deterministic. Either the fixture is the starting page and the prompt is concrete ('build a checkout button for checkout.html using the cart icon in icons/cart.svg, icon only, matching the mock'), or the demo starts with the user saving the haunted fixture. Have DEMO.md say which step produces the haunting. Rehearse with the skill loaded and record the result in Notes.

[2.13] MAJOR @ design.md:133; tasks.md:92,94,131
PROBLEM: The shims and the self-audit hook will fail on Windows unless they spawn npx correctly. They run `npx …` or a string from `UNSEEN_MCP_CMD` from a Node script. On Windows, `child_process.spawn('npx', …)` without `shell: true` fails (ENOENT, or EINVAL for .cmd on Node ≥20.12). This repo's path contains a space ('D:\kiroween 2026\the-unseen'), so naive whitespace splitting of UNSEEN_MCP_CMD breaks the local route and the shim tests.
FIX: Have the shims use `spawnSync(cmd, { shell: true, stdio: 'inherit' })` with a quoted command, or better `spawnSync(process.execPath, [serverJsPath, sub])` when UNSEEN_MCP_JS (a path) is set. Add a shim test whose path contains a space. Use the same approach for web-self-audit.mjs.

[2.14] MINOR @ design.md:103,197-198 (P10), 195 (P7); tasks.md:115
PROBLEM: P10 and P7 are mandatory property tests that check almost nothing. P10 asserts speechExample(type) equals Core announce of the same synthetic node the implementation passes to announce, which is circular. P7 ranges over a fixed 10×3 enumeration of Core's own snippets, so fast-check adds nothing. P10's design also omits that `announce(node, raw)` needs a full `RawAudit` (about 20 required fields), so pure/speech-example.ts needs a synthetic RawAudit factory.
FIX: P10: assert, for each type, the expected role-label substring from hauntings.md (e.g. NamelessSpirit → 'button', HollowPortrait → 'unlabelled graphic'), and null for the five silent types. P7: generate arbitrary attribute-bearing HTML snippets (class/for/tabindex/aria-*, void elements) without forbidden tokens. Assert the react output has no ` class=`/` for=`, keeps every aria-* attribute, and adds no forbidden token. Add a `syntheticRaw()` helper task.

[2.15] MINOR @ requirements.md:52-53 (Req 4.3-4.4); design.md:22,103
PROBLEM: explain_haunting {type} needs data Core does not export. It must return each type's WCAG criteria and the soundCue for SilentTongue/CursedLoop, but Core has no type→WCAG table or soundCue constants: each detector sets them inline. MCP would have to hand-copy them, which Req 1.5 forbids.
FIX: In task 1.1, add `WCAG_BY_TYPE` and `SOUND_CUE_BY_TYPE` to core, used by the detectors, and export them. Or keep the map in MCP and add a test that cross-checks it against the hauntings returned for the Cursed Shop.

[2.16] MINOR @ design.md:201; tasks.md:51
PROBLEM: The expected error code for a `file:///` URL is wrong. The design expects SSRF_BLOCKED ('Permissive still rejects non-http schemes'). Zod (Req 2.1) rejects it as INVALID_INPUT, and if it reached Core, `validateUrl` throws a plain TypeError, which maps to AUDIT_FAILED, not SSRF_BLOCKED.
FIX: Expect INVALID_INPUT for file:///. Get SSRF_BLOCKED coverage from a unit test of toToolError with a constructed SsrfBlockedError.

[2.17] MINOR @ tasks.md:91; requirements.md:104,112
PROBLEM: Two gate/hook gaps. (1) Task 3.3's hook JSON sets no `timeout` for the Stop gate or on-save, although Req 11.5 says 90 s. A cold audit can exceed a short default; the existing Stop hook sets 180. (2) The loop guard only resets on a pass, so after one give-up the gate gives up immediately in every later turn. A rehearsal could leave the gate disabled for the recording.
FIX: Put `timeout: 90` on PostFileSave and `timeout: 150` on Stop in unseen-hooks.json. Store `{consecutiveBlocks, lastBlockMs}` and reset after a quiet gap or on the next ui-dirty creation. Add `rm -r .unseen` to the DEMO.md pre-recording checklist.

[2.18] MINOR @ requirements.md:42,144; design.md:179; .gitignore
PROBLEM: `.unseen/` would show up as untracked files in this repo. Once THE UNSEEN is enabled here (task 9), audit_url writes `.unseen/last-audit.json` in the repo, and the self-audit hook writes `.unseen/web-self-audit.lock` (design calls it 'the repo's untracked area'). But `.unseen/` is not in the repo's .gitignore and no task adds it.
FIX: Add `.unseen/` to the root .gitignore in task 7 or task 9.

[2.19] MINOR @ design.md:177-179; tasks.md:130-131
PROBLEM: The web self-audit hook may audit a stale build and exceed its time budget. Running the e2e spec reuses any server already on :3000 (reuseExistingServer is true outside CI), so it can audit the old build instead of the saved source. When no server is running, it does `npm run build` and then a full Core audit of about 9 routes inside a 170 s hook timeout, with per-test timeouts of 180 s.
FIX: Set CI=1 in the hook's env to force a fresh build, or document that it audits the running server. On timeout, print one line, e.g. 'web self-audit: timed out (>170 s)'. Consider limiting it with `--grep` to the routes affected by the saved file.

[2.20] MINOR @ tasks.md:15-52,97-117,137-146 (sizing/test infra)
PROBLEM: Test settings and file hashing are unspecified in ways that will cost a run. Task 1 alone covers the scaffold, core exports, six pure modules with eight PBTs, four handlers, a server/CLI and Chromium integration tests. The Chromium tests run under Vitest in `npm run test -w @the-unseen/mcp`, but no vitest config is specified, so Vitest's 5 s default timeout and parallel threads will cause flaky failures. Task 8's 'hashes recorded before the task' will differ on Windows if git autocrlf rewrites line endings.
FIX: In task 1.1, specify packages/mcp/vitest.config.ts with testTimeout 180_000, hookTimeout 60_000 and singleThread, and close the pool in afterAll. In task 8, replace the hash test with `git diff --exit-code -- apps/cursed-shop` plus `npm run verify -w apps/cursed-shop`. To protect the demo, consider splitting task 1 into 1a (audit_url + CLI) and 1b (audit_html + the remaining pure modules).
