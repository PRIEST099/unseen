# Devpost write-up (draft)

An earlier draft. The final Devpost story is `devpost-description.md`.

## Tagline
See the web through a screen reader's ears, then make Kiro exorcise it.

## Try it in 3 steps (for judges)
1. Open https://priest099.github.io/unseen/ and click the **Cursed Shop — Checkout** sample. You don't need a URL of your own.
2. In **Spirit Sight**, open a **Nameless Spirit**: an icon-only button that a screen reader announces only as "button". You get the WCAG criterion, who it hurts, the broken HTML and the fix.
3. Switch to the **Keyboard walk** and press Play. The ghost gets trapped in the newsletter's Cursed Loop.

## Inspiration
Accessibility checkers have existed for years, and most of the web still fails them: in 2026, 95.9% of the top million home pages had detectable WCAG failures (WebAIM Million). The reason isn't a missing tool. Developers never *experience* the failure: a contrast ratio of 3.1 is a number, but a shop whose buttons all say "button" is a nightmare. We wanted to make that nightmare visible and audible, and then stop it at the source: in the agent that writes the UI.

## What it does
- **Audits any URL** in a real, sandboxed Chromium: the accessibility tree, axe-core and a real Tab walk. Ten WCAG 2.2 failure types become ten hauntings (Nameless Spirit, The Fog, Cursed Loop…), each with the criterion, who it hurts, the offending HTML and a source-level fix.
- **Spirit Sight** draws the hauntings on the page. The **Keyboard walk** sends a ghost Tabbing through it, where it gets trapped in Cursed Loops. The **Whisper walk** plays what a screen reader announces. **Daylight** turns it all into a plain, exportable report.
- **Inside Kiro**, through an MCP server and a Kiro Power, THE UNSEEN audits every UI Kiro writes. A ghost gate stops Kiro finishing a UI task while a critical haunting remains: Kiro fixes the source, re-audits and reports the score change.
- **It audits itself:** our own UI must score zero hauntings on 8 routes, or the test suite fails.

## How we built it (the Kiro story)
- **Steering first:**
  - `hauntings.md` is the single source of truth for every detection rule, severity and score.
  - `security.md` governs the SSRF-hardened fetcher.
  - Further docs cover testing (property-based tests), a WCAG reference, and a manual `#exorcise` workflow.
- **Five specs:** audit engine, haunting classifier, safe-fetch, the Spirit Sight UI, and the MCP server and Power.
  - Each went requirements → design → tasks.
  - Each was independently reviewed before it was built; reviews found 24 to 52 issues per spec, and Kiro amended the specs.
- **Two ways of driving Kiro:**
  - 40+ headless Kiro CLI runs (`kiro-cli chat --v3 --no-interactive`) with a custom `unseen-builder` agent whose permissions deny git commit and push.
  - The whole 18-task UI list run nonstop in the **Kiro IDE on Autopilot** with Playwright MCP, while a reviewer verified every task as it landed.
- **Hooks as guardrails:**
  - A `PreToolUse` hook blocks any write to the golden test expectations, so the agent must fix the code, not the test.
  - Further hooks run a typecheck on save, verify the shop on save, check spec → types drift, and gate on tests at Stop.
- **A golden haunted shop:** "Hollow & Vine" has 30 golden counts (10 haunting types on 3 pages, 97 hauntings in all), checked by a verifier.
- **Property-based tests (fast-check)** cover contrast maths, classifier precedence, SSRF address ranges and score monotonicity.
- **Tests:** core 649 unit + 109 browser, MCP 184 unit + 35 integration, web 580 unit + 118 end-to-end + 18 replay.

**Honest notes.**
- We set the direction and made the key decisions: what to build, what to cut, the exceptions below, the visual direction and Night Shift's auto-approval. Kiro wrote the product, from steering, specs and hooks it also wrote. Claude Code was our planning and verification assistant: at our direction it drafted the product brief and each instruction to Kiro, ran the spec and code reviews, and re-ran every test itself instead of trusting Kiro's summary.
- Code Kiro did not write is labelled in git and logged:
  - Early engine tasks were written by Claude Code, at a teammate's request, while that teammate was out of Kiro credits, then reviewed and adopted by Kiro.
  - A final UI fix pass and visual redesign were done by Claude Code at our request.
  - A few small config edits by Claude Code.
- The full log, failures included, is in `docs/brief/KIRO_SESSION_LOG.md`.

## Challenges we ran into
- **Kiro's first haunted shop over-claimed success.** That is why the golden file exists, and why a hook protects it.
- **A hook config that validated cleanly would have allowed every write:** it read `toolInput` instead of `tool_input`. We learned to verify agent and hook configs by *exercising* them.
- **Kiro V3 permission semantics (deny always wins)** silently disabled our spec-writer agent.
- **Contrast over images and gradients can't be measured honestly,** so THE UNSEEN reports it as "needs a manual check", never as a haunting. That led to a design rule for our own gothic UI: text only ever sits on solid panels.
- **SSRF:** auditing arbitrary URLs from a server means blocking private ranges, metadata endpoints, DNS rebinding and redirects to loopback.

## Accomplishments we're proud of
- Every haunting comes from real browser data, with no AI guessing in the detector.
- The app passes its own audit, and the test suite proves it.
- Kiro catching and fixing its own inaccessible button, live, through the ghost gate.

## What we learned
- Specs plus independent review beat vibe coding for anything with correctness rules. Vibe mode was great for the haunted demo shop.
- Steering is where the product's truth lives: once `hauntings.md` was right, every later spec inherited it.
- Verify agents by running them; trust tests over summaries.

## What's next
- A CI action that comments hauntings on pull requests.
- More haunting types (motion, target size, timing).
- Publishing the Power and the MCP server for anyone using Kiro.

## Built with
Kiro (IDE, CLI, specs, steering, hooks, custom agents, MCP, Powers), TypeScript, Playwright/Chromium, axe-core, fast-check, Vitest, Fastify, React, Vite, Web Audio, Web Speech.

## Links
- **Repo:** https://github.com/PRIEST099/unseen
- **Live:** [ ]
- **Video:** [ ]
