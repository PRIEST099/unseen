**Deliverable: an edited `.kiro/specs/spirit-sight-ui/tasks.md`.** No report files; the product lead checks `git diff`.

1. **Convert the task list to Kiro's task-list format**, so the Kiro IDE shows "Start task" and tracks progress. Use the same format as `.kiro/specs/haunting-classifier/tasks.md`: a `## Tasks` section containing checkbox items, `- [ ] 1. Title` for top-level tasks and indented `- [ ] 1.1 Title` for sub-tasks. Put the acceptance criteria, requirement and design references, and test commands as indented bullets under each item.
   - Keep the phase order (Phase 1 slice: 1.0 scaffold, 1.0a `buildSpeechTrack`, 1.1 `onProgress`, 1.2 samples, …), and keep every acceptance criterion. **Only the format changes.**
   - Phases can be top-level checkbox groups, for example `- [ ] 1. Phase 1: Vertical slice`, with their tasks as sub-items.
2. **Fix the npm workspace dependency.** This repo uses npm workspaces, which do not support the `workspace:*` protocol (pnpm/yarn only). Use `"@the-unseen/core": "0.1.0"` (the core package's version) or `"*"`. Remove `"workspaces": []` from the leaf `apps/web/package.json` criteria.
3. Make sure the Playwright e2e `webServer` in task 1.0 starts something the e2e tests can reach in the vertical slice. That means the API as well as Vite (for example `npm run build && npm run start` with `cross-env NODE_ENV=test` and `UNSEEN_DEV_ALLOW_PRIVATE=1`), consistent with the self-audit design.

**Verify:** `grep -c "^\s*- \[ \]" .kiro/specs/spirit-sight-ui/tasks.md` must be > 20, and `grep -c "workspace:\*"` must be 0. Paste both, plus `git diff --stat`. Do not ask questions.
