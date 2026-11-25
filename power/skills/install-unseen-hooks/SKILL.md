---
name: install-unseen-hooks
description: Install the THE UNSEEN ghost gate and on-save hooks into the current workspace by running unseen-mcp install-hooks. Use when the user asks to set up, install or enable the unseen hooks or the ghost gate.
---

# Install the unseen hooks

A Power cannot ship hooks, so the server writes them into the workspace.

1. Run this command in the workspace root:

   ```
   unseen-mcp install-hooks
   ```

   To install into another folder, pass it: `unseen-mcp install-hooks <dir>`.

2. It writes four files. Kiro asks before writing into `.kiro/hooks/`; approve the writes.
   - `.kiro/hooks/unseen-hooks.json` (the on-save hook and the ghost gate Stop hook, both command hooks)
   - `.kiro/hooks/unseen-gate-agent-fallback.json` (an agent-type Stop hook, disabled by a top-level `"enabled": false`; used only as a fallback)
   - `.kiro/hooks/scripts/unseen-on-save.mjs`
   - `.kiro/hooks/scripts/unseen-gate.mjs`

3. Add `.unseen/` to the workspace `.gitignore`. The hooks keep their state there.

4. Hooks start with a chat session. Tell the user to start a new chat session before relying on them.

If the command is not found, the user has not run `npm run unseen:install-global` in the THE UNSEEN repository. Do not try to patch around it.
