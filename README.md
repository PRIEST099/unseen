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
| **Try it (replay edition, no install)** | https://priest099.github.io/unseen/ |
| **Demo video (2:59)** | https://youtu.be/pJzn-iEXGjg |
| **Kiro Crew app** | [Night Shift](https://github.com/PRIEST099/night-shift): four Kiro agents that patrol a site overnight with THE UNSEEN |
| **Category** | Costume Contest (haunting UI) |
| **License** | [MIT](LICENSE) |

## What you can do with it
- **Spirit Sight:** the audited page's screenshot with each haunting drawn on it. Open any haunting to get the WCAG criterion, who it hurts, the offending HTML, a fix, and a ready-made Kiro prompt.
- **Keyboard walk:** watch a ghost Tab through the page, get stuck in Cursed Loops, and walk straight past Lost Souls.
- **Whisper walk:** hear the page as a screen reader would announce it, with captions.
- **Daylight:** the morning-after report, a plain parchment ledger of every finding, exportable.
- **"Takes Form":** preview a fix and see the score rise. Nothing on the audited site is changed.
- **The ghosts in the margins:** on your first visit the lights come on and the ghosts scatter behind the page. Your pointer (or your keyboard focus) is a lantern that sends them away. They are decoration only, still under reduced motion, and the **Hide ghosts** button removes them.

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

## For judges

### Try it in 30 seconds
1. Open the [replay edition](https://priest099.github.io/unseen/) and click the **Cursed Shop — Checkout** sample.
2. In **Spirit Sight**, open a **Nameless Spirit**: the WCAG criterion, who it hurts, the broken HTML and the fix.
3. Switch to the **Keyboard walk** and press **Play**. The ghost gets trapped in the newsletter's **Cursed Loop**.

The replay edition plays back real recorded audits, so pasting your own URL is turned off there. To audit any public URL, [run it locally](#run-it-locally).

### How we built it with Kiro
We set the direction and made the key decisions: what to build, what to cut, the exceptions listed below, the visual direction and Night Shift's auto-approval. **Kiro wrote the product**, from steering, specs and hooks it also wrote. Claude Code was our planning and verification assistant: at our direction it drafted the product brief and each instruction to Kiro, ran the spec and code reviews in [`docs/brief/review-notes/`](docs/brief/review-notes/), and re-ran every test itself instead of trusting Kiro's own summary.

*A note on wording:* the numbered prompts, review notes and some of Kiro's steering call Claude Code "the product lead". That was its working title for this planning and verification seat. We kept the prompts exactly as Kiro received them.

Every run is logged in [`docs/brief/KIRO_SESSION_LOG.md`](docs/brief/KIRO_SESSION_LOG.md), including failures, credit stops and the places where Kiro over-claimed and was caught.

| Kiro surface | Where | What it did here |
|---|---|---|
| **Steering** (always, fileMatch, auto, manual) | [`.kiro/steering/`](.kiro/steering/) (10 docs) | The haunting taxonomy, security rules for the SSRF-hardened fetcher, testing conventions, a WCAG reference and the `#exorcise` workflow |
| **Specs** (requirements or bugfix → design → tasks) | [`.kiro/specs/`](.kiro/specs/) | `audit-engine`, `haunting-classifier`, `safe-fetch` (bugfix spec), `spirit-sight-ui` and `unseen-mcp-and-power`. Four were reviewed before they were built (30 to 52 findings each) and amended by Kiro; the audit engine was reviewed after it was built (47 findings, fixed by Kiro) |
| **Hooks** | [`.kiro/hooks/`](.kiro/hooks/) | Blocks writes to the golden test file ("Kiro cannot cheat the golden test"), a typecheck on save, a Cursed Shop check on save, a spec → types drift check, a test gate on Stop, and a self-audit on save |
| **Ghost gate** | [`power/skills/install-unseen-hooks/`](power/skills/install-unseen-hooks/) | A Stop hook that blocks Kiro from ending a turn while a changed UI file has a critical haunting |
| **Custom agents** | [`.kiro/agents/`](.kiro/agents/) | `unseen-builder` (git commit and push denied), `unseen-reviewer`, `unseen-spec-writer`, `unseen-auditor` (read-only, MCP tools only) |
| **MCP** | [`.kiro/settings/mcp.json`](.kiro/settings/mcp.json) | Playwright MCP while building the UI in the Kiro IDE, then THE UNSEEN's own MCP server |
| **Power** | `power/` | Installs THE UNSEEN into any Kiro workspace |
| **Property-based tests** | `*.test.ts` (fast-check) | Contrast maths, classifier precedence, SSRF address ranges, score monotonicity |
| **Kiro IDE Autopilot** | `spirit-sight-ui` | The whole 18-task UI list ran nonstop in the IDE, each task verified as it landed |
| **Kiro CLI headless** | `docs/brief/prompts/` | 50+ numbered runs, each sent with `kiro-cli chat --v3 --no-interactive` |
| **Kiro Crew** | [Night Shift](https://github.com/PRIEST099/night-shift) | Warden, Seer, Scribe and Exorcist agents that find, fix and re-check hauntings overnight |

### Moments where Kiro surprised us (from the log)
- **Kiro noticed the ghost and chose to leave it.** In a real `kiro-cli` session (run by Claude Code, in a throwaway workspace), Kiro was asked to add a quantity field to a checkout page whose button had no accessible name. It did, mentioned the button, offered "I can add it if you want", and tried to end its turn. THE UNSEEN's ghost gate blocked the turn. Kiro then audited the page, fixed the button and reported the score going from 15 to 0. This is why the gate exists: a good model that *knows* still moves on unless something holds it.
- Kiro's first demo shop claimed success while most hauntings did not fire. That failure is why a golden file exists, guarded by a `PreToolUse` hook so no agent can "fix" the test instead of the code.
- A hook that validated cleanly would have allowed every write: it read `toolInput` instead of `tool_input`. Lesson: verify agent and hook configs by exercising them, not by trusting validator output.
- In Kiro V3, **deny always wins**. A spec-writer agent with "allow specs, deny everything else" could write nothing.

### Code Kiro did not write
- Audit-engine tasks 5–16 were first written by Claude Code, at a teammate's request, while that teammate's Kiro account had no credits. Kiro then reviewed and adopted them (runs 19 and 22), and the result was re-checked with tests.
- After Kiro finished the UI, we had Claude Code apply a 28-item review fix list and the "gothic séance manor" visual redesign (original AI-generated paintings and period fonts). Those commits are labelled `fix-pass (Claude Code)` and `redesign (Claude Code)`.
- A few small config edits by Claude Code, each logged in the run log.

Everything else in `packages/`, `apps/`, `power/` and `.kiro/` is Kiro's. The planning and review files in `docs/brief/` (brief, prompts, review notes, verification probes) were written by Claude Code at our direction.

## The app audits itself
THE UNSEEN's own UI is audited by THE UNSEEN on every test run. `apps/web/e2e/self-audit.spec.ts` runs the real engine against 8 routes and fails on any haunting, any unmapped axe violation, or anything needing a manual check.

Test counts at submission:

| Package | Tests |
|---|---|
| `packages/core` | 649 unit, 109 Playwright |
| `packages/mcp` | 184 unit, 35 integration |
| `apps/web` | 580 unit, 118 end-to-end (8-route self-audit included), 18 replay |

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
