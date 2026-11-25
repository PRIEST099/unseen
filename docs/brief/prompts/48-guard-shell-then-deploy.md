Two jobs, in order. Save after each item. If you approach a limit, stop after a finished item and print `Next: <item>`. Never end with a menu or a question.

## Part A: close the shell loophole in the protected-files guard
In run 47 the write tool was refused for `.kiro/agents/` and `.kiro/hooks/`, as Kiro's settings intend, and the files were then placed with a shell copy. The content was correct and is accepted. But the run showed a real gap: `.kiro/hooks/guard-protected-files.json` only watches the **write tools**, so a shell command (`cp`, `mv`, `Copy-Item`, `Set-Content`, `>` redirection, `node -e "fs.writeFileSync(...)"`) could overwrite `apps/cursed-shop/expected-hauntings.json` or `docs/brief/**` and defeat the golden test.

1. **Extend the guard** to a `PreToolUse` hook on the shell tool(s), using the real tool IDs. Find them the same way run 31 did, and record them.
   - Block any shell command whose text names a protected path (`expected-hauntings.json`, `docs/brief`, `.env`) **together with** a writing operation: redirection `>`/`>>`, `cp`, `mv`, `rm`, `del`, `Copy-Item`, `Move-Item`, `Remove-Item`, `Set-Content`, `Out-File`, `tee`, `sed -i`, or `writeFile`/`appendFile`/`rmSync`/`unlink`.
   - Reading protected files must stay allowed: `cat`, `type`, `Get-Content`, `git diff`.
   - The same fail-closed/fail-open rules apply as for the write guard.
2. **Tests:** feed the script sample payloads.
   - Blocked: `cp x apps/cursed-shop/expected-hauntings.json`, `echo {} > docs/brief/x.md`, and `node -e "require('fs').writeFileSync('apps/cursed-shop/expected-hauntings.json','')"`.
   - Allowed: `cat apps/cursed-shop/expected-hauntings.json`, `git diff docs/brief`, and `npm test`.
   - Malformed JSON.
3. **Kiro surprised us:** add a short entry to the `tasks.md` Notes of `unseen-mcp-and-power` describing the run 47 workaround and this fix.
4. **Task 9:** the product lead applied the `unseen` entry to `.kiro/settings/mcp.json` and `kiro-cli mcp list` shows it enabled. Confirm the entry matches the spec, then tick task 9 in `tasks.md`.
5. **Doc fix:** `demo/cursed-shop-exorcised/README.md` says the scores come from `auditAndClassify` "through the unseen MCP server". Run 47 re-audited with core directly, and `exorcise.int.test.ts` recomputes them. Make the sentence say what actually happened.

## Part B: deployment and the always-up replay edition
Follow `docs/brief/prompts/45-deploy-and-replay.md` in full. It builds on `16-deploy.md`.
- `packages/mcp` now exists, so build it in the image.
- The replay edition's base path for GitHub Pages is `/unseen/`, because the repo is `PRIEST099/unseen`.

At the end, run and report pass counts for:
- `npm run build`
- `npm run typecheck`
- `npm test` (all workspaces)
- `npm run test:integration -w @the-unseen/mcp`
- `npm run e2e -w @the-unseen/web`
- the replay e2e
- the Docker image build plus the smoke test against it

Use `UNSEEN_CHROMIUM_CHANNEL=chromium` on this host (an empty value inside the Linux image). Never weaken a test. Print `Next: owner deploys`.
