Workspace: `D:\kiroween 2026\night-shift`. Read `docs/crew-integration-notes.md`, written by you in run 49d.

**The owner decided:** make the crew run unattended **through MCP tools only, with no global Crew settings changed.** Kiro Crew was fully restarted, so the gateway now has a fresh PATH that includes `%APPDATA%\npm`, where the `night-shift` and `unseen-mcp` bins are installed.

Save after each item. Never end with a menu or a question.

## Hard rules (new; you broke the first one in run 49d)
- **Never approve anything in Crew on the owner's behalf.** Do not call any approval, trust, grant or enable endpoint: no `/api/approvals/*`, no `/api/security/*`, no `/api/apps/*/enable`, and no dashboard clicks. Do not use any other route that answers a permission prompt.
- If a step needs an approval or a trust grant, stop at that step and print exactly what the owner must click and where. Put `Next: owner <action>` on the last line.
- Do not uninstall the app; that withdraws the owner's trust grant. If changed agent files must reach Crew, use `kirocrew app install .` over the existing install, if Crew allows that. If Crew truly requires an uninstall, stop first and say so.
- Never change Crew's global config. Never modify `../the-unseen`.

## 1. A Night Shift MCP server
- Add `night-shift mcp`, a stdio MCP server using `@modelcontextprotocol/sdk` and Zod. It exposes every step the crew needs as a tool, backed by the existing CLI code and not duplicating it:
  - `validate`, `audit`, `diff`, `workdir`, `verify`, `report`
  - `read_source {site, path}`: reads only inside the site's `source` dir
  - `write_fix_file {workdir, path, content}`: writes only inside a work directory that `workdir` created
  - `list_source {site}`
- Every tool takes `home` (the repo root) and falls back to `NIGHT_SHIFT_HOME`. Path arguments are normalized and confined, rejecting `..`, absolute paths and symlinks out of the tree.
- Add property-based tests for the confinement. Add in-memory MCP client tests for every tool.

## 2. Wire the agents to MCP only
1. Declare the server in `app.json` `mcpServers` as `{"command": "night-shift", "args": ["mcp"]}`.
2. Give each agent only the MCP tools its role needs, and list them in `allowedTools` so they run without a prompt (per your notes, Crew carries `allowedTools` through and `kirocrew chat` honours it for MCP tools).
3. Remove the shell and file tools from all four agents.
4. Run the Seer, Scribe and Exorcist as **native sub-agents** of the Warden through `toolsSettings.subagent.availableAgents` / `trustedAgents`, as your notes on `acp/kas_subagent_rules.py` describe. They need MCP-only tools, since Crew refuses sub-agents whose limits only it enforces. If that mechanism also needs an approval, say so and stop. Do not work around it.
5. Keep the THE UNSEEN tools as `@night-shift:unseen/...`.

## 3. Prove it, unattended
1. Install over the existing app.
2. Confirm the generated `%USERPROFILE%\.kiro\agents\night-shift--*.json` files contain the `allowedTools` and sub-agent settings.
3. Run `kirocrew agent validate ./agents`.
4. Run this, with no person in the loop:
   ```
   kirocrew chat --agent night-shift--warden -m "Run the Night Shift patrol with home D:\kiroween 2026\night-shift. Limit this run to at most 2 fixes."
   ```
5. Save the transcript to `docs/patrol-transcripts/<date>-patrol-2.md`, removing only the Crew SECURITY warning lines.

**Success:**
- The Warden validates, the Seer audits and diffs, and the Scribe drafts a fix.
- The Exorcist keeps or rejects it with a real `verify`.
- `REPORT.md` and `report.json` are written.

If it stops anywhere, report exactly where and why. Never fake a transcript.

## 4. Tidy
- Update the README, `docs/crew-integration-notes.md` and the `tasks.md` Notes with what is now true.
- Run the full test suite: unit, integration, and typecheck.
