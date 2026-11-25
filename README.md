# THE UNSEEN

> *Which site do you dare to see through their eyes?*

THE UNSEEN is a haunted web-accessibility auditor for **Kiroween 2026**. Paste a URL and walk through the page the way a screen-reader or keyboard user experiences it:
- unlabelled buttons become **Nameless Spirits** that whisper only "button…"
- low-contrast text sinks into **The Fog**
- keyboard traps become **Cursed Loops** that the walking ghost cannot leave

Every haunting comes from real browser data, never a guess: the Chromium accessibility tree, axe-core and a real Tab-key walk. Each one maps to a WCAG 2.2 success criterion and a **source-level** fix.

Accessibility checkers already exist. What they lack is a way to make developers *feel* the problem, and a way to stop the problem being written in the first place. THE UNSEEN does both:
1. **You hear it.** Spirit Sight shows the page as assistive tech sees it, and the Whisper walk plays what a screen reader actually announces.
2. **Kiro can't leave it in.** THE UNSEEN ships as an MCP server and a Kiro Power that audit every UI Kiro builds before Kiro may call the task done.

| | |
|---|---|
| **Live app** | *coming with the deploy run* |
| **Demo video (under 3 min)** | *coming* |
| **Category** | Costume Contest (haunting UI) |
| **License** | [MIT](LICENSE) |

## What you can do with it
- **Spirit Sight:** the audited page's screenshot with each haunting drawn on it. Open any haunting to get the WCAG criterion, who it hurts, the offending HTML, a fix, and a ready-made Kiro prompt.
- **Keyboard walk:** watch a ghost Tab through the page, get stuck in Cursed Loops, and walk straight past Lost Souls.
- **Whisper walk:** hear the page as a screen reader would announce it, with captions.
- **Daylight:** the morning-after report, a plain parchment ledger of every finding, exportable.
- **"Takes Form":** preview a fix and see the score rise. Nothing on the audited site is changed.

### The ten hauntings
| Haunting | What is wrong | WCAG |
|---|---|---|
| Nameless Spirit | A control with no accessible name | 4.1.2, 2.4.4 |
| Hollow Portrait | An informative image with no text alternative | 1.1.1 |
| The Fog | Text contrast below AA | 1.4.3 |
| Lost Soul | Clickable, but unreachable by keyboard | 2.1.1 |
| Cursed Loop | A keyboard trap | 2.1.2 |
| Invisible Wanderer | Focus that cannot be seen | 2.4.7 |
| Whispering Field | A form field with no label | 3.3.2, 1.3.1 |
| Silent Tongue | The page language is missing | 3.1.1 |
| Shattered Order | A broken heading structure | 1.3.1, 2.4.6 |
| The Veiled | Focusable content hidden from assistive tech | 4.1.2 |

The rules are defined in [`.kiro/steering/hauntings.md`](.kiro/steering/hauntings.md), the single source of truth.

### What THE UNSEEN cannot catch
Automated checks cover only part of WCAG. THE UNSEEN cannot tell you:
- whether alt text is *accurate*
- whether a reading order *makes sense*
- whether captions match the audio
- whether a flow is understandable

Contrast over images or gradients can't be measured honestly, so it is reported as "needs a manual check", never as a haunting or a pass. **A clean audit is not proof of accessibility.** Test with real assistive-technology users too.

## For judges: how Kiro built it
**Claude Code acted as product lead:** it wrote every instruction sent to Kiro and independently verified each result. **Kiro wrote the product.**

Every run is logged in [`docs/brief/KIRO_SESSION_LOG.md`](docs/brief/KIRO_SESSION_LOG.md), including failures, credit stops and the places where Kiro over-claimed and was caught.

| Kiro surface | Where | What it did here |
|---|---|---|
| **Steering** (always, fileMatch, auto, manual) | [`.kiro/steering/`](.kiro/steering/) (10 docs) | The haunting taxonomy, security rules for the SSRF-hardened fetcher, testing conventions, a WCAG reference and the `#exorcise` workflow |
| **Specs** (requirements → design → tasks) | [`.kiro/specs/`](.kiro/specs/) | `audit-engine`, `haunting-classifier`, `safe-fetch`, `spirit-sight-ui` and `unseen-mcp-and-power`, each reviewed before it was built |
| **Hooks** | [`.kiro/hooks/`](.kiro/hooks/) | Blocks writes to the golden test file ("Kiro cannot cheat the golden test"), a typecheck on save, a Cursed Shop check on save, a spec → types drift check, and a test gate on Stop |
| **Custom agents** | [`.kiro/agents/`](.kiro/agents/) | `unseen-builder` (git commit and push denied), `unseen-reviewer`, `unseen-spec-writer` |
| **MCP** | [`.kiro/settings/mcp.json`](.kiro/settings/mcp.json) | Playwright MCP while building the UI in the Kiro IDE, then THE UNSEEN's own MCP server |
| **Power** | `power/` | Installs THE UNSEEN into any Kiro workspace |
| **Property-based tests** | `*.test.ts` (fast-check) | Contrast maths, classifier precedence, SSRF address ranges, score monotonicity |
| **Kiro IDE Autopilot** | `spirit-sight-ui` | The whole 18-task UI list ran nonstop in the IDE, each task verified as it landed |
| **Kiro CLI headless** | `docs/brief/prompts/` | 40+ numbered runs, each sent with `kiro-cli chat --v3 --no-interactive` |

### Moments where Kiro surprised us (from the log)
- Kiro's first demo shop claimed success while most hauntings did not fire. That failure is why a golden file exists, guarded by a `PreToolUse` hook so no agent can "fix" the test instead of the code.
- A hook that validated cleanly would have allowed every write: it read `toolInput` instead of `tool_input`. Lesson: verify agent and hook configs by exercising them, not by trusting validator output.
- In Kiro V3, **deny always wins**. A spec-writer agent with "allow specs, deny everything else" could write nothing.

### Honest authorship notes
- Audit-engine tasks 5–16 were first written by Claude Code while a teammate's Kiro account had no credits. Kiro then reviewed and adopted them (runs 19 and 22), and independent verifiers re-checked the result.
- After Kiro finished the UI, Claude Code applied a 28-item review fix list and the "gothic séance manor" visual redesign (original AI-generated paintings and period fonts). Those commits are labelled `fix-pass (Claude Code)` and `redesign (Claude Code)`.

Everything else is Kiro's.

## The app audits itself
THE UNSEEN's own UI is audited by THE UNSEEN on every test run. `apps/web/e2e/self-audit.spec.ts` runs the real engine against 8 routes and fails on any haunting, any unmapped axe violation, or anything needing a manual check.

Verified on 2026-11-25:

| Package | Tests |
|---|---|
| `packages/core` | 644 unit, 108 Playwright |
| `apps/web` | 392 unit, 84 end-to-end (8-route self-audit included) |

Typecheck is clean.

## Repo map
| Path | What |
|---|---|
| `packages/core` | Audit engine: Playwright runner, SSRF-safe fetch, pure classifier, score, speech track |
| `apps/web` | Fastify API plus the React app (Spirit Sight, walks, Daylight) |
| `apps/cursed-shop` | "Hollow & Vine", a deliberately haunted demo storefront with golden expectations |
| `packages/mcp`, `power/` | The MCP server and the Kiro Power |
| `.kiro/` | Steering, specs, hooks, agents and MCP settings |
| `docs/brief/` | Product brief, the Kiro instruction queue, review notes and the run log |

## Run it locally
Requirements: Node 22 or later and npm 10 or later.

```bash
npm install
npx playwright install chromium
npm run build
npm run start -w @the-unseen/web        # http://localhost:3000 (PORT overrides it)
```

On Windows, if the headless-shell download fails, run `npx playwright install chromium --no-shell` and set `UNSEEN_CHROMIUM_CHANNEL=chromium`.

To run the tests:

```bash
npm run typecheck
npm test                                 # unit tests, every workspace
npm run test:integration -w @the-unseen/core
npm run e2e -w @the-unseen/web
```

## License
[MIT](LICENSE)
