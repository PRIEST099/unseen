Your run-27 setup has defects that a **live test** exposed. Your report said "`kiro-cli agent validate` passed", but `kiro-cli chat --agent unseen-builder` refuses to load:

```
Error: agent "unseen-builder" has an invalid config, stopping (exit 4) — AgentFileFormatError: Schema validation failed: permissions.rules.0.capability: Required, permissions.rules.0.effect: Required, … (rules 0–4)
```

Fix all of the following. Verify each fix **for real**: load the agent with `kiro-cli chat --agent <name> --no-interactive` and a trivial prompt, not with a validator alone.

1. **Agents (all three): use the CLI V3 schema.**
   - `tools` uses the V3 selectors (`read`, `write`, `shell`, and `@builtin`/`@mcp`/`@playwright` where needed), not tool IDs like `read_file`/`fs_write`/`execute_pwsh`.
   - `permissions: { rules: [ { capability, match: [...], effect: "allow"|"ask"|"deny" } ] }`. The capabilities are `fs_read`, `fs_write`, `shell`, `web_fetch`, `mcp`, …, and deny wins.
   - Express the git-write denials and the protected-path denials (`apps/cursed-shop/expected-hauntings.json`, `docs/brief/**`, `.env*`) as deny rules.
2. **The `SessionStart` hook in `unseen-builder`:** it uses `tail`, which does not exist in PowerShell on Windows. Use a cross-platform `node -e` one-liner, or a script under `.kiro/hooks/scripts/`.
3. **`guard-protected-files.mjs`:**
   - Hook stdin uses **snake_case**: `tool_name` and `tool_input` (documented example: `{"hook_event_name":"PreToolUse","cwd","session_id","tool_name","tool_input":{...}}`). The script reads `data.toolInput`, so it never sees a path and **allows every write**. Read `tool_input` (and accept `toolInput` as a fallback), and resolve paths against `data.cwd`.
   - Find out the real V3 tool IDs and input field names for file writes and edits: log one real payload to a temp file outside the repo during a test, then remove the logging. Make the hook `matcher` match them. The docs also allow category selectors such as `write`.
   - **Fail closed** when stdin is malformed **and** any argument mentions a protected path. Otherwise fail open.
4. **`.kiro/settings/mcp.json`:** `autoApprove` belongs **inside each server entry**, not at the top level. Use the real Playwright MCP tool names (for `@playwright/mcp`, for example `browser_navigate`, `browser_snapshot`, `browser_take_screenshot`; check with `kiro-cli mcp list` or the tool list). Remove the non-standard `description` keys if the schema rejects them.
5. **Live re-test:** run `kiro-cli chat --agent unseen-builder --no-interactive` with the five steps of `docs/brief/prompts/30-hook-live-test.md`. The write to `expected-hauntings.json` must be blocked by the hook (quote the hook message). The temp file must be created, then **deleted** by you afterwards. `git commit` must be denied.

Final message: what was wrong, what you changed, and the verbatim output of the live re-test.
