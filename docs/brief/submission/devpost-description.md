## Try it in 3 steps
1. Open the live app and click the **Cursed Shop — Checkout** sample. You don't need a URL of your own. (The replay edition on GitHub Pages works even if the live server is asleep.)
2. In **Spirit Sight**, open a **Nameless Spirit**: an icon-only button a screen reader announces only as "button". You get the WCAG criterion, who it hurts, the broken HTML and the fix.
3. Switch to the **Keyboard walk** and press **Play**. The ghost gets trapped in the newsletter's **Cursed Loop**.

## Inspiration
In 2026, **95.9% of the top million home pages** had detectable WCAG failures (WebAIM Million). The checkers have existed for years. The problem is that developers never *experience* the failure. A contrast ratio of 3.1 is just a number, but a checkout whose buttons all say "button" is a nightmare. We wanted to make that nightmare visible and audible, and then stop it at the source: inside the agent that writes the UI.

## What it does
- **Audits any URL in a real, sandboxed Chromium.** It reads the accessibility tree, runs axe-core and does a real Tab-key walk. Ten WCAG 2.2 failure types become ten hauntings: Nameless Spirit, Hollow Portrait, The Fog, Lost Soul, Cursed Loop, Invisible Wanderer, Whispering Field, Silent Tongue, Shattered Order and The Veiled. Each one comes with its criterion, the people it hurts, the offending HTML and a fix in the source.
- **Spirit Sight** draws the hauntings on the page.
- **The Keyboard walk** sends a ghost Tabbing through the page, where it gets trapped in Cursed Loops.
- **The Whisper walk** plays what a screen reader announces.
- **Daylight** turns everything into a plain, exportable report with a scan record (the axe-core and Chromium versions, viewport and time), so anyone can re-run it.
- **It works inside Kiro.** An MCP server (`audit_url`, `audit_html`, `explain_haunting`, `suggest_fix`) and a **Kiro Power** audit every UI Kiro writes. A **ghost gate** (a Stop hook) won't let Kiro finish a UI task while a critical haunting remains. Kiro has to fix the source, re-audit, and report the score change.
- **It audits itself.** Our own UI has to score zero hauntings on 8 routes, or the test suite fails.

## The moment Kiro surprised us
In a real Kiro session, we asked it to add a quantity field to a checkout page whose button had no accessible name. Kiro added the field, *noticed* the button, said "I can add it if you want", and tried to end its turn. The ghost gate blocked the turn. Kiro then audited the page, added `aria-label="Checkout"`, and reported the score going from **15 to 0**. A good model that knows about a problem will still move on unless something holds it. That is why the gate exists.

## How we built it with Kiro
- **Steering first.**
  - `hauntings.md` is the single source of truth for every detection rule, severity and score.
  - `security.md` governs the SSRF-hardened fetcher.
  - Further files cover testing (property-based tests), a WCAG reference and a manual `#exorcise` workflow.
- **Five specs, each running requirements → design → tasks:**
  - audit engine
  - haunting classifier
  - safe-fetch
  - Spirit Sight UI
  - MCP server and Power
  
  Each spec was independently reviewed before it was built. Reviews found 24 to 52 issues per spec, and Kiro amended the specs to fix them.
- **Two ways of driving Kiro:**
  - 45+ headless Kiro CLI runs, using a custom `unseen-builder` agent whose permissions deny git commit and push.
  - The entire 18-task UI list, run nonstop in the **Kiro IDE on Autopilot** with Playwright MCP.
- **Hooks as guardrails:**
  - A `PreToolUse` guard blocks any write to the golden test expectations, by file tool *or* by shell command, so the agent has to fix the code, not the test.
  - Other hooks cover typecheck on save, a shop verifier on save, spec → types drift, a test gate on Stop, a self-audit on save, and the ghost gate.
- **Custom agents:** builder, reviewer, spec-writer, and a read-only auditor that can only read files and call THE UNSEEN's tools.
- **A golden haunted shop.** "Hollow & Vine" has exactly 30 expected hauntings, checked by a verifier. An "exorcised" copy, fixed in source, scores 0 on every page.

## Challenges we ran into
- **Kiro over-claimed success on our first haunted shop.** Most of the hauntings didn't fire. That is why the golden file and its guard exist.
- **A hook that validated cleanly would have allowed every write.** It read `toolInput` instead of `tool_input`. Lesson: verify agents and hooks by *exercising* them, not by trusting validators.
- **The ghost gate's first design used exit code 2.** The Kiro docs say that exit code drops a Stop hook's output. A doc-checking review caught it before the build.
- **Kiro V3 "deny always wins".** It silently disabled our spec-writer agent.
- **Contrast over images and gradients can't be measured honestly,** so THE UNSEEN reports it as "needs a manual check", never as a pass. That became a design rule for our own gothic UI: text only ever sits on solid panels.
- **SSRF.** Auditing arbitrary URLs from a server means blocking private ranges, metadata endpoints, DNS rebinding and redirects to loopback.

## Accomplishments we're proud of
- Every haunting comes from real browser data. There is no AI guessing in the detector.
- The app passes its own audit, and the test suite proves it.
- Kiro catching and fixing its own inaccessible button through the ghost gate, in a real session.
- **Test counts:** core 649 unit + 108 browser, MCP 184 unit + 35 integration, web 425 unit + 84 end-to-end + 13 replay.

## What we learned
- Specs plus independent review beat vibe coding for anything with correctness rules. Vibe mode was great for the haunted demo shop.
- Steering is where a product's truth lives.
- Verify agents by running them, and trust tests over summaries.

## What's next
- A CI action that comments hauntings on pull requests.
- More haunting types (motion, target size, timing).
- Publishing the Power and the MCP server.

## Honest notes
Claude Code acted as product lead: it wrote the instructions and verified the results. Kiro wrote the product.

Two exceptions are labelled in git and logged in `docs/brief/KIRO_SESSION_LOG.md`:
- Some early engine tasks were written by hand while a teammate was out of Kiro credits. Kiro later reviewed and adopted them.
- A final UI fix pass and a visual redesign were done by Claude Code.

The full log, failures included, is in the repo.
