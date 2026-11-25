# THE UNSEEN Power

Makes Kiro audit every UI it builds. It bundles the `unseen-mcp` server (tools `audit_url`, `audit_html`, `explain_haunting`, `suggest_fix`) with three skills: `audit-before-done`, `exorcise`, `install-unseen-hooks`.

Automated checks find roughly 30-40% of WCAG issues. A clean audit means the automated checks found nothing, not that a person has tested the page.

## Install

Nothing is published to npm. The server is installed from this repository.

1. `npx playwright install chromium`
2. In the repository root: `npm run unseen:install-global`. It packs `@the-unseen/core` and `@the-unseen/mcp` and installs both tarballs globally. The global command is `unseen-mcp`.
3. In Kiro: trust the workspace, then open the Powers panel, choose "Add Custom Power", then "Import power from a folder" and pick this `power/` folder. A public GitHub URL with the `power/` subdirectory also works.
4. In the workspace you want to guard, run `unseen-mcp install-hooks` (or ask Kiro to use the `install-unseen-hooks` skill). Approve the writes into `.kiro/hooks/`. Start a new chat session afterwards.

The installed server is named `power-the-unseen-unseen`. A Power cannot auto-approve tools, so Kiro asks before each tool call.

On Windows, set `UNSEEN_CHROMIUM_CHANNEL=chromium` if the auditor cannot find a browser.

## Hooks

Powers cannot ship hooks, so `unseen-mcp install-hooks [dir]` writes them: `.kiro/hooks/unseen-hooks.json` and the shims `.kiro/hooks/scripts/unseen-on-save.mjs` and `.kiro/hooks/scripts/unseen-gate.mjs`. The shims call the server by absolute path.

- On save (`PostFileSave`): audits changed UI files and prints only new hauntings. In the Kiro IDE this output reaches the agent; in the CLI it is informational.
- Ghost gate (`Stop`): before Kiro ends a turn, it re-audits changed UI files. If a critical haunting remains (a Wraith, a Nameless Spirit, a Whispering Field or a Cursed Loop), it exits 1 and writes the list to stderr, and Kiro keeps working. After 5 consecutive blocks it gives up.

A file counts as changed when its modification time is newer than the last gate pass (UI files: html, tsx, jsx, vue, svelte, css). When no pass is recorded yet, files changed in the last 30 minutes count.

## What gets audited

1. If a dev URL is configured and reachable, the gate audits it.
2. Otherwise it audits each changed `.html` file directly (newest first, at most 5).

Dev URL, in order: env `UNSEEN_DEV_URL`; `devServerUrl` in `.unseen/config.json`; the default `http://localhost:5173`. The default is never probed by the hooks, so an unrelated server is not audited by accident.

State lives in `.unseen/` in the workspace root (the `cwd` the hook receives, or `UNSEEN_WORKSPACE`). Add `.unseen/` to `.gitignore`. The MCP tools never write there.

## Demo

See `DEMO.md`.
