Create the Kiro spec **`unseen-mcp-and-power`** in `.kiro/specs/unseen-mcp-and-power/`. Do not implement yet. Keep `requirements.md` under about 15 KB.

## Part 1: `packages/mcp` (stdio MCP server)
Use the official `@modelcontextprotocol/sdk` with Zod input schemas. Tools:

- **`audit_url`** `{ url, page?: 'summary'|'full' }`
  - Uses the **Permissive** policy, because it runs on the developer's machine and should audit `localhost` dev servers.
  - Returns:
    - the score and counts
    - the top hauntings, each with `id`, type, severity, WCAG, selector, `htmlSnippet` and `fix`
    - a short Markdown summary written for an agent to act on
  - No screenshot by default; `full` adds the whole `ClassifiedAudit` minus the screenshot.
- **`audit_html`** `{ html }`: same output, for an unsaved component or snippet.
- **`explain_haunting`** `{ type | id }`: the plain-language explanation, the persona, the WCAG link and the speech example from the steering.
- **`suggest_fix`** `{ id, framework?: 'html'|'react'|'vue' }`: a minimal, source-level fix template. **Never a runtime overlay or injected script** (brief §6.2).

Errors are typed MCP errors: SSRF block, timeout, non-HTML.

Add a `bin` entry (`unseen-mcp`) so `npx` works. Tests:
- Call each tool through an in-memory MCP client against the Cursed Shop server.
- Snapshot the summary text for `checkout.html`.

## Part 2: `power/` (Kiro Power)
Use the **current official Kiro Power format**; you know it better than the brief does. Contents:

- `POWER.md`: name "The Unseen", what it does, when Kiro should activate it (keywords: accessibility, a11y, WCAG, screen reader, button, form, UI, component, HTML, React), and the install steps.
- The MCP config pointing at `unseen-mcp` (`npx -y @the-unseen/mcp`, plus a local-dev variant).
- Steering for Power consumers:
  - "Audit every UI you build or change with `audit_url` against the running dev server before saying the task is done."
  - "Never ship a Nameless Spirit, Whispering Field or Cursed Loop."
  - "Fix source, never inject overlays."
  - "Re-audit after fixing, and report the before/after score."
- Hooks for Power consumers:
  - **on save** of UI files (`**/*.{html,tsx,jsx,vue,svelte,css}`): audit the dev server URL and summarise new hauntings.
  - **manual "Exorcise"**: fix the hauntings from the last audit one at a time, re-auditing after each.

## Part 3: this repo's own `.kiro/hooks/`
Also create these hooks for THE UNSEEN itself, in the current Kiro hook format:
1. **App audits itself:** on save of `apps/web/src/client/**`, run the web app's self-audit test (spirit-sight-ui spec), report any haunting in the app's own UI, and fix it.
2. **Spec change → types:** on save of `.kiro/specs/**/design.md`, check that `packages/core/src/types.ts` still matches the design's data types, and list any drift.
3. **Test gate:** a manual "Before commit" hook that runs typecheck, Vitest and Playwright across the workspace and refuses to summarise success unless all three pass.
4. **Exorcise the Cursed Shop:** a manual hook that runs `audit_url` on the Cursed Shop and fixes a copy at `demo/cursed-shop-exorcised/` (outside the `apps/*` workspace glob, with no `package.json`, so npm workspaces are unaffected; add the path to `structure.md`), never touching the original, which must stay haunted for the demo.

Also add a read-only **auditor custom agent** in `.kiro/agents/`: only fs_read and the unseen MCP tools, used in CI to post an audit summary.

## Demo-critical acceptance criterion
In a fresh Kiro workspace with the Power installed:
1. Ask Kiro to "build a checkout button" for a tiny HTML page.
2. Kiro must call `audit_url`, detect the Nameless Spirit (an icon-only button), fix it with a real accessible name, re-audit and report a lower score.

Document the exact steps in `power/DEMO.md`, because this is the 1:10–1:50 segment of the video.
