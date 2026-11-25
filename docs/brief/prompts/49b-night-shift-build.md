Implement every task in `.kiro/specs/night-shift/tasks.md`, in order, in this repo (`D:\kiroween 2026\night-shift`). Save after each task. If you approach a limit, stop after a finished task and print `Next: <task>`. Never end with a menu or a question.

Rules:
- Tick a task only when its tests pass. Never weaken a test.
- Never modify anything under `../the-unseen`. Read it only: the Cursed Shop HTML, CSS and images, and the unseen MCP server at `../the-unseen/packages/mcp/dist/server.js`.
- This is a Windows host. Set `UNSEEN_CHROMIUM_CHANNEL=chromium` for any browser step.
- Kiro Crew (`kirocrew`) is **not installed** on this machine yet. When a task says to run `kirocrew agent validate` or install the app, check whether `kirocrew` is on PATH. If it is not, rely on the structural tests the spec already requires and record "not run, kirocrew not installed" in the `tasks.md` Notes. Never fake a result.
- The planted `demo/bad-fix/` must be labelled in the README and the morning report as a recorded attempt, not an agent run. Its rejection must come from a real `night-shift verify` run.
- At the end, run the full test suite and `night-shift patrol --no-agents` against the served demo copy. Report the pass counts and paste the first 30 lines of the generated `REPORT.md`.
