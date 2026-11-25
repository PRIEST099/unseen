Workspace: `D:\kiroween 2026\night-shift`. Night Shift is installed and **enabled** in Kiro Crew 0.13.1. `night-shift` (via `npm link`), `unseen-mcp` and `kirocrew` are all on PATH.

The product lead ran the first real crew patrol:
```
kirocrew chat --agent night-shift--warden -m "Run the Night Shift patrol. The repository is D:\kiroween 2026\night-shift ... at most 2 fixes."
```
The transcript is at `D:\kiroween 2026\kiro-logs\crew-patrol-1.log`; read it. The Warden behaved correctly, but every tool call was refused: "Denied automatically: night-shift validate ... needs approval, and this invocation cannot ask." The Warden refused to skip validation and stopped. Nothing was spawned.

Evidence:
- Crew writes each app agent to `%USERPROFILE%\.kiro\agents\night-shift--<role>.json` as a Kiro CLI agent.
- The generated Warden file has only `name`, `description`, `model`, `tools`, `includeMcpJson` and `mcpServers`. It has **no permission rules**.
- So a headless patrol, and the nightly cron, can never run.

Fix this so the crew can patrol unattended **with narrow pre-approvals only**. Save after each item. Never end with a menu or a question.

## 1. Find the supported mechanism in Crew's own source (read only)
Read the installed package under `C:\Program Files\KiroCrew\resources\backend-dist\kirocrew-backend\Lib\site-packages\kiro_crew\`, in particular:
- `apps/bridges_agents.py`
- `apps/agent_config_writer.py`
- `acp/kas_spec_grants.py`, `acp/kas_permissions.py`, `acp/client_permissions.py`, `acp/kas_auto_approve.py`
- `acp/kas_subagent_targets.py`
- the docs in that package, if present

Answer with file and line evidence:
- **(a)** Which fields of an app agent JSON carry into the generated Kiro CLI agent? Look for `permissions`/`rules`, `allowedTools`, `toolsSettings`, or anything else that pre-approves a shell command, a path read/write or an MCP tool.
- **(b)** How does `spawn` resolve a subagent name for an app agent? Does the Warden's `seer` reach `night-shift--seer`? Does the cron's `"agent": "warden"` resolve?
- **(c)** Which working directory does a Crew session run in?

Put the answers in `docs/crew-integration-notes.md`.

## 2. Pre-approve narrowly
Use the mechanism found in step 1:
- **Warden:** shell only for `night-shift validate|workdir|report ...` and `npm run build:ui`; read inside the repo; spawn and wait.
- **Seer:** `night-shift audit|diff ...` and the unseen MCP tools.
- **Scribe:** read inside the repo, and write only under `.night-shift/work/**` (or wherever `night-shift workdir` puts fixes).
- **Exorcist:** `night-shift verify ...` and the unseen MCP tools.

No blanket shell, no `yolo`, no global config changes.

**Check the result:**
1. Reinstall the app (`kirocrew app install .`), then confirm the generated `night-shift--*.json` files contain the grants.
2. Run `kirocrew agent validate ./agents`.
3. Add tests that pin the grants (no wildcard shell).

## 3. Names and working directory
- Fix any subagent or cron agent names that do not resolve.
- Make the repo location explicit for unattended runs. The CLI honours `NIGHT_SHIFT_HOME`, falling back to the cwd, and the agents `cd` there first.
- Update the cron message and the README to match.

## 4. Prove it with a real patrol
Run:
```
kirocrew chat --agent night-shift--warden -m "Run the Night Shift patrol from patrol.yaml in D:\kiroween 2026\night-shift. Limit this run to at most 2 fixes."
```
Save the transcript to `docs/patrol-transcripts/<date>-patrol.md`, with the Crew security warning lines removed and nothing else edited.

**Success criteria:**
- The Warden validates.
- It spawns the Seer, then the Scribe and the Exorcist at least once.
- `REPORT.md` is written.

If a step still fails, say exactly where, with the error. Never fake a transcript.

## 5. Tidy up
- The README's "Installing as a Crew app" section still says `kirocrew agent validate` was never run and the env syntax is unverified. Both are now done: update it with what is true.
- Run the full test suite.
- Record everything in the `tasks.md` Notes as "found by the product lead's real Crew run".

Rules: never modify `../the-unseen`. Never change Crew's global config.
