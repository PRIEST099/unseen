Workspace: `D:\kiroween 2026\night-shift`. Kiro Crew 0.13.1 is now installed on this machine. `kirocrew` is on PATH, and the gateway is running from the desktop app. The product lead tried a real install, and two problems surfaced that the structural tests could not catch. Fix them, then prove the app installs. Save after each item. Never end with a menu or a question.

## 1. `permissions.cron`
`kirocrew app install "D:\kiroween 2026\night-shift"` refused:
> crons is declared but permissions.cron is not: add "cron": true under "permissions" in app.json

- Add it.
- Add a manifest test for the rule: if `crons` is non-empty, `permissions.cron` must be `true`.

## 2. The THE UNSEEN MCP server entry cannot start once installed
The product lead read Crew's installed source (`kiro_crew/apps/bridges_mcp.py`, `resolve_stdio_command`):
- Crew does **not** expand `${VAR:-default}` in `args` or `env`, so the literal string reaches `node`.
- Crew re-anchors relative paths only for `.py` launchers.
- `kirocrew app install` copies the app into Crew's own app folder, so `../the-unseen/...` no longer points anywhere.

Fix:
- Set `"mcpServers": {"unseen": {"command": "unseen-mcp", "env": {"UNSEEN_CHROMIUM_CHANNEL": "chromium"}}}`. That is the global bin from `npm run unseen:install-global` in THE UNSEEN; `chromium` also works on macOS and Linux.
- Put no shell-style placeholders anywhere in `app.json`.
- Add a manifest test that fails on any `${` in `app.json`.
- **README and the CLI:** keep the deterministic CLI's own way of finding THE UNSEEN (env or local path) for the CLI. Document in the README that the Crew app needs `unseen-mcp` on PATH, with the one-time command `npm run unseen:install-global` run in the THE UNSEEN checkout.
- **Running the installer:** you may run that command now (`npm run unseen:install-global` with `--prefix` "D:\kiroween 2026\the-unseen"). It packs and installs globally and changes no files in that repo. Then check that `unseen-mcp --help` works.

## 3. Prove it installs
1. Run `kirocrew app install "D:\kiroween 2026\night-shift"`, then `kirocrew app info night-shift`. Paste the outputs.
2. If enabling a third-party app needs the trust dialog in the desktop app, say so plainly. The owner will click it; do not try to bypass it.
3. Run `kirocrew agent validate ./agents` again.
4. Run the full test suite again.

**Rules:**
- Never modify files under `../the-unseen`. Running its install script is allowed.
- Tick nothing new in `tasks.md`. Record these fixes in its Notes as "found by the product lead's real Crew install".
- Finish with `Next: owner enables the app`, or `Next: patrol`.
