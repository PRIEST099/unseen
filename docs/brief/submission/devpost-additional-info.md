# Devpost "Additional info" answers (draft)

The owner fills in the personal fields:
- country of residence
- age of majority
- eligible jurisdiction
- Kiroween 2025 registration
- submitter type
- AWS employee
- the two survey questions

The owner also chooses the bonus prizes. Blog and Social both need a URL to a post the owner wrote.

**Category:** Costume Contest

**Bonus prizes selected:**
- Best Ghost of Kiroween Past (the owner confirmed they registered for Kiroween 2025; "Registered for 2025" is set to Yes)
- Best Kiro Crew App (Night Shift, separate repo; URL to add)
- Bonus Blog Prize (blog URL to add)
- Social Blitz (URL of the owner's own post to add)
- Best Startup Project. The owner is a founder of a separate startup, and the answer states that THE UNSEEN is not its product.
- Best Student Project: Costume Contest. This is a solo team, so the rule that every member must be a student is met.

The owner's personal details are entered only in the Devpost form, never in this repo.

**Public GitHub repo URL:** https://github.com/PRIEST099/unseen

**Working demo URL:** [the Cloud Run URL, once deployed]

## Testing instructions
No login is needed.
1. Open the live app and click the "Cursed Shop — Checkout" sample, or paste any public URL.
2. **Spirit Sight:** open a Nameless Spirit. It shows the WCAG criterion, who it hurts, the HTML and the fix.
3. **Keyboard walk:** press Play. The ghost gets trapped in the newsletter's Cursed Loop.
4. **Daylight:** the plain report, with Markdown and JSON export.

If the live server is asleep, the replay edition on GitHub Pages (linked in the README) shows the same pre-recorded audits.

To try the Kiro Power and the ghost gate, follow `power/DEMO.md` in the repo. It takes about 5 minutes and needs Node 22 and Chromium.

## How the project meets the Kiro requirement
Kiro built the product, and THE UNSEEN also runs inside Kiro.
- **Kiro IDE:** the 18-task spirit-sight-ui spec ran nonstop on Autopilot with Playwright MCP.
- **Kiro CLI (headless, V3):** 45+ numbered runs from written instructions. Every run is logged in `docs/brief/KIRO_SESSION_LOG.md`.
- **Specs (requirements → design → tasks):**
  - audit-engine
  - haunting-classifier
  - safe-fetch
  - spirit-sight-ui
  - unseen-mcp-and-power
  
  Each spec was independently reviewed, then amended by Kiro.
- **Steering, in all four inclusion modes:**
  - `hauntings.md`, the single source of truth for detection rules, severity and score
  - security, testing and design-system rules
  - a WCAG reference
  - `#exorcise`
- **Hooks:**
  - a `PreToolUse` guard that blocks writes to the golden test expectations, whether by file tool or by shell
  - typecheck on save, the shop verifier on save, spec → types drift, a test gate on Stop, and a self-audit on save
  - **the ghost gate**, a Stop hook: Kiro can't end a UI turn while a critical haunting remains
- **Custom agents:**
  - `unseen-builder` (git commit and push denied)
  - `unseen-reviewer`
  - `unseen-spec-writer`
  - `unseen-auditor` (read-only; MCP tools only)
- **MCP:**
  - THE UNSEEN's own server (`audit_url`, `audit_html`, `explain_haunting`, `suggest_fix`), enabled in `.kiro/settings/mcp.json`
  - Playwright MCP
- **Powers:** `power/` is a Kiro Power in Agent Plugins format, with four skills:
  - audit-before-done
  - exorcise
  - install-unseen-hooks
  - exorcise-the-cursed-shop
- **Property-based tests (fast-check):** contrast maths, classifier precedence, SSRF address ranges, the baseline diff and gate decisions.

**In a live session:** Kiro noticed an unnamed checkout button, chose to leave it and tried to end its turn. The gate blocked the turn, and Kiro fixed the button. The score went from 15 to 0.

## Pre-existing code disclosure
There is no pre-existing project code. Everything was built during the Submission Period, starting 2026-11-19. The project uses only standard open-source libraries: Playwright, axe-core, React, Fastify, Vite, fast-check, Vitest and the MCP SDK.

**Authorship** (labelled in git and logged in `docs/brief/KIRO_SESSION_LOG.md`): Claude Code acted as product lead. It wrote the instructions to Kiro and verified the results, and Kiro wrote the product. There are two exceptions:
- **Audit-engine tasks 5–16** were first written by Claude Code while a teammate had no Kiro credits. Kiro then reviewed and adopted them (runs 19 and 22).
- **A UI review fix pass and the gothic visual redesign** were applied by Claude Code. The original paintings were AI-generated for this project with Figma AI.

The demo video was assembled with Remotion and narrated by Kokoro TTS.
