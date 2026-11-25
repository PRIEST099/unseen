Workspace: `D:\kiroween 2026\night-shift`. Save after each item. Never end with a menu or a question. Hard rules unchanged: never approve anything in Crew; never call approval, trust or enable endpoints; never uninstall; never change Crew's config; never touch `../the-unseen`.

## What happened in the first real, fully unattended crew run with a regression (21:10, cron)
- The Warden validated.
- The Seer audited and diffed, and found **exactly one new Wraith**: `product-html-NamelessSpirit-e5f92791` on `.buy-now-btn`.
- The Warden spawned the Scribe. The Scribe ran `workdir`, `diff` and `read_source`, then stopped.
- The Warden's report, verbatim in substance: "the Scribe could not read the whole file. `product.html` is 33,444 characters, and the Scribe's limit is 30,000". So there was no fix and no Exorcist call.
- Everything was `auto_approved` in Crew's security log. **This is a tool-design bug, not a permission problem.** Real pages are often larger than 30 KB, so do not just raise the limit.

## 1. Targeted reading
- `read_source` gains an optional `{startLine, endLine}` range, and keeps its size cap per call.
- Add `find_in_source {site, path, query, context?}`. It returns the matching line numbers with a few lines of context, and is capped. The Scribe uses it with the haunting's `htmlSnippet` or selector to find the region.
- Both work on the work-directory copy as well (the existing `workdir` option).

## 2. Targeted editing
- Add `edit_fix_file {workdir, path, oldText, newText}`. It makes an exact, **unique** replacement in the work-directory copy; it fails if `oldText` is missing or matches more than once, and it reports the line changed. It has the same confinement as `write_fix_file`.
- The Scribe's prompt and skill switch to: `find_in_source`, then a ranged `read_source`, then `edit_fix_file`.
- `write_fix_file` stays for small new files only.

## 3. Agents, tests and the demo baseline
- Add the new tools to the Scribe's `tools` and `allowedTools` only, and pin them in `tests/grants.test.ts`.
- Add property tests for `edit_fix_file`: uniqueness, confinement, and no change on failure. Add MCP client tests.
- Add an integration test that replays the 21:10 case end to end with tool calls: the 33 KB `product.html` gets the `aria-label` fix through `find_in_source`, ranged `read_source`, `edit_fix_file` and `verify`, and the fix is kept.
- Add `npm run demo:rebaseline`. It moves the newest history file for the site aside (into `.night-shift/history-archive/`), so the next patrol compares against the patrol before the regression. Document it in `demo/README.md`.

## 4. Finish
- Run the full suite: unit, integration and typecheck.
- Agent files changed, so the owner must press **Sync** on the app's detail page. Print `Next: owner presses Sync`.
- Do not trigger the patrol.
