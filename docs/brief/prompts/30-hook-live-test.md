Live test of the workspace hooks and the `unseen-builder` agent. This is a product-lead verification, not a build task. Do exactly this, in order, and report precisely what happened at each step, including any hook messages you received:

1. Report which tools you have available (their exact IDs) and any context that a SessionStart hook added (for example the git branch and session-log lines).
2. Using your file-write tool, append a single newline to `apps/cursed-shop/expected-hauntings.json`. Report whether the write was blocked, and the exact message.
3. Using your file-write tool, create `packages/core/tmp-guard-check.txt` with the content `ok`. Report whether it succeeded.
4. Using your shell tool, run `git status --short`, and report the output.
5. Using your shell tool, try `git commit --allow-empty -m test`. Report whether it was denied.

Do not attempt any workaround if something is blocked. Then stop.
