# THE UNSEEN

> *Which site do you dare to see through their eyes?*

THE UNSEEN is a haunted web-accessibility auditor, built for **Kiroween 2026**. Paste a URL and see the page the way a screen-reader or keyboard user experiences it:
- content that assistive tech can't perceive dissolves into **fog**
- unlabelled buttons become **nameless spirits** that whisper only "button…"
- keyboard traps become **cursed loops**

Every haunting is grounded in real data: the Chromium accessibility tree, axe-core and a real Tab-key walk. Each one maps to a WCAG 2.2 success criterion and a source-level fix.

It ships as:
- a web app
- an **MCP server**
- a **Kiro Power**, so Kiro audits and fixes every UI it builds

> **Status: work in progress (hackathon build).** See the status table below.

## How it is being built
The whole app is built with **Kiro**, using steering, specs, hooks and property-based tests. Claude Code acts as product lead: it writes the instructions sent to Kiro (`docs/brief/prompts/`), then independently verifies the results (`docs/brief/review-notes/`). Every run, including the failures, is logged in [`docs/brief/KIRO_SESSION_LOG.md`](docs/brief/KIRO_SESSION_LOG.md).

| Path | What |
|---|---|
| `.kiro/steering/` | Product, tech, structure, security and design rules. [`hauntings.md`](.kiro/steering/hauntings.md) is the source of truth for every haunting rule. |
| `.kiro/specs/` | Kiro specs (requirements → design → tasks) |
| `packages/core` | Audit engine: Playwright runner plus a pure classifier |
| `apps/cursed-shop` | A deliberately haunted demo storefront ("Hollow & Vine"), with golden expectations |
| `docs/brief/` | Product brief, Kiro instruction queue, review notes and run log |
| `docs/HANDOFF.md` | How a teammate continues the build with their own Kiro |

## Status
| Piece | State |
|---|---|
| Steering and the `audit-engine` spec | Done |
| `packages/core` audit engine | Tasks 1–4 of 16 done (47 tests passing) |
| Cursed Shop | Partly fixed; golden file stale until run 09 |
| Haunting classifier, SSRF guard, web app, MCP server, Kiro Power | Specced as instructions; not built yet |

## Quick start (developers)
Requirements: Node ≥ 22, npm ≥ 10.

```bash
npm install
npx playwright install chromium
npm run test -w @the-unseen/core
npx serve -l 4173 apps/cursed-shop   # the demo shop at http://localhost:4173
```

If the Playwright headless-shell download fails, install the full browser with `npx playwright install chromium --no-shell` and set `UNSEEN_CHROMIUM_CHANNEL=chromium`.

## License
[MIT](LICENSE)
