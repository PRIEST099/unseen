Your rewrite was interrupted by our own hook. `spec-types-drift.json` (PostFileSave with an agent action on `.kiro/specs/*/design.md`) fired as soon as you saved `design.md`. Its "compare types" prompt took over the turn, and the run ended after the drift report. `design.md` and `tasks.md` are still essentially the old versions; the grep shows no `/sample/:id`, `build-samples`, `UNSEEN_DEV_ALLOW_PRIVATE` or `global: false`.

Do this:
0. In `.kiro/hooks/spec-types-drift.json`, set `"enabled": false`. Add a `description` note: "paused during long spec rewrites; agent-action hooks on PostFileSave take over headless turns".
1. Do the complete work of `docs/brief/prompts/34-ui-spec-amend-continue.md`, steps 1–4: findings 45–52, the full `design.md` rewrite, and the full `tasks.md` rewrite in phase order. Save `design.md` as you go; with the hook paused, that is safe.
2. Run the step-4 grep checks.
3. **Last step:** set `spec-types-drift.json` back to `"enabled": true`. Then do the types-drift comparison yourself, once, as a final check, and report it.

Do not ask questions. If you near a limit, stop after a completed section and write `Next: <section>`. Leave the hook disabled in that case, and say so.
