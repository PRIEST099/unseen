**THE UNSEEN lets web developers see and hear their site the way blind and keyboard-only users do.** Paste a URL and every accessibility failure becomes a ghost you can find, hear and fix. It also runs inside Kiro, so the agent that writes your UI cannot finish while a serious ghost is still on the page. It is for anyone who ships web pages, because most of the web still fails the people who use screen readers.

## Try it in 3 steps
1. Open the **replay edition** at https://priest099.github.io/unseen/ (no install, no sign-in) and click the **Cursed Shop — Checkout** sample.
2. In **Spirit Sight**, open a **Nameless Spirit**: an icon-only button a screen reader announces only as "button". You get the WCAG criterion, who it hurts, the broken HTML and the fix.
3. Switch to the **Keyboard walk** and press **Play**. The ghost gets trapped in the newsletter's **Cursed Loop**.

The replay edition plays back real recorded audits, so pasting your own URL is turned off there. To audit any public URL, run the full app locally (see the README).

## Inspiration
Imagine Sarah. She's blind and shops online with a screen reader. On most checkouts she hears "button, button" and can't tell which one pays. In 2026, **95.9% of the top million home pages** had detectable WCAG failures (WebAIM Million). The checkers have existed for years. The problem is that developers never *experience* the failure. A contrast ratio of 3.1 is just a number, but a checkout whose buttons all say "button" is a nightmare. We wanted to make that nightmare visible and audible, and then stop it at the source: inside the agent that writes the UI.

## What it does
- **Audits any public URL in a real headless Chromium,** behind a per-audit SSRF-guard proxy. It reads the accessibility tree, runs axe-core and does a real Tab-key walk. Ten WCAG 2.2 failure types become ten hauntings: Nameless Spirit, Hollow Portrait, The Fog, Lost Soul, Cursed Loop, Invisible Wanderer, Whispering Field, Silent Tongue, Shattered Order and The Veiled. Each one comes with its criterion, the people it hurts, the offending HTML and a fix in the source.
- **Spirit Sight** draws the hauntings on a screenshot of the page.
- **The Keyboard walk** sends a ghost Tabbing through the page, where it gets trapped in Cursed Loops.
- **The Whisper walk** plays what a screen reader would announce, with captions.
- **Daylight** drops the spooky look and gives a plain, exportable report with a scan record (the axe-core and Chromium versions, viewport and time), so anyone can re-run it.
- **It works inside Kiro.** An MCP server (`audit_url`, `audit_html`, `explain_haunting`, `suggest_fix`) and a **Kiro Power** audit every UI Kiro writes. The Power's install-hooks step adds a **ghost gate** (a Stop hook) that blocks Kiro from ending a turn while a changed UI file has a critical haunting, and tells it to fix the source, re-audit and report the score change.
- **It audits itself.** Our own UI has to score zero hauntings on 8 routes, or the end-to-end suite fails.
- **A little mischief, never in the way.** On your first visit the screen is dark while ghosts roam around a candle, then the lights come on and they scatter to hide behind the page and inside the paintings. Your pointer is a lantern: wherever it goes, they duck away and peek back somewhere else. They are pure decoration (hidden from screen readers, never focusable, still under reduced motion), and a **Hide ghosts** button removes them.

## Night Shift: our Kiro Crew app
Code keeps changing, and every change can bring ghosts back. **Night Shift** (https://github.com/PRIEST099/night-shift) is a Kiro Crew app with four agents that patrol a site:
- **The Warden** leads. It runs the other three as sub-agents and writes the morning report. It never edits source.
- **The Seer** audits the site with THE UNSEEN and returns only new or worsened hauntings.
- **The Scribe** drafts one minimal source fix in a work copy. It may never hide a problem with `aria-hidden`.
- **The Exorcist** re-audits. It keeps the fix only if the haunting is gone, no haunting count rose on any page, and the change is safe.

In a real unattended run (2026-11-25, the nightly cron job triggered by hand once at 22:10), `npm run demo:regress` had shipped an icon-only "Buy now" button. The crew found it, added `aria-label="Buy now"`, and kept the fix on the first attempt. Nobody approved anything during the run: we had turned on Crew's auto-approval for cron runs (`hooks.auto_approve_sources: ["cron"]`), and each agent has only the MCP tools of its own role, with no shell or file tools at all. The fix went to a local fixed copy, not a live site. The transcript and security log are in the repo.

## The moment Kiro surprised us
In a real Kiro CLI session, Kiro was asked to add a quantity field to a checkout page whose button had no accessible name. Kiro added the field, *noticed* the button, said "I can add it if you want", and tried to end its turn. The ghost gate blocked the turn. Kiro then audited the page, added `aria-label="Checkout"`, and reported the score going from **15 to 0**. A good model that knows about a problem will still move on unless something holds it. That is why the gate exists.

## How we built it with Kiro
- **Steering first.**
  - `hauntings.md` is the single source of truth for every detection rule, severity and score.
  - `security.md` governs the SSRF-hardened fetcher.
  - Further files cover testing (property-based tests), a WCAG reference and a manual `#exorcise` workflow.
- **Five specs** (four feature specs and one bugfix spec, each ending in design → tasks): audit engine, haunting classifier, safe-fetch, Spirit Sight UI, and the MCP server and Power. Four of them were reviewed by a separate Claude Code review workflow before they were built (30 to 52 issues each), and Kiro amended them. The audit engine got a 47-finding code review after it was built.
- **Two ways of driving Kiro:**
  - 50+ headless Kiro CLI runs; the later ones used a custom `unseen-builder` agent whose permissions deny git commit and push.
  - The entire 18-task UI list, run nonstop in the **Kiro IDE on Autopilot**, with Playwright MCP available to it.
- **Hooks as guardrails:**
  - A `PreToolUse` guard blocks writes to the golden test expectations through the file tools and through shell commands that name the file, so the agent has to fix the code, not the test.
  - Other hooks cover typecheck on save, a shop verifier on save, spec → types drift, a test gate on Stop, a self-audit on save, and the ghost gate.
- **Custom agents:** builder, reviewer, spec-writer, and a read-only auditor that can only read files and call THE UNSEEN's tools.
- **A golden haunted shop.** "Hollow & Vine" has 30 golden counts (10 haunting types on 3 pages, 97 hauntings in all), checked by a verifier. An "exorcised" copy, fixed in source, scores 0 on every page.

## Challenges we ran into
- **Kiro over-claimed success on our first haunted shop.** Most of the hauntings didn't fire. That is why the golden file and its guard exist.
- **A hook that looked correct would have allowed every write.** It read `toolInput` instead of `tool_input`, and Kiro had reported its agent configs as validated. Lesson: verify agents and hooks by *exercising* them, not by trusting reports.
- **The ghost gate's first design used exit code 2.** The Kiro docs say that exit code drops a Stop hook's output. A doc-checking review caught it before the build.
- **Kiro V3 "deny always wins".** Our spec-writer agent's catch-all deny blocked every write, even to the specs folder.
- **Contrast over images and gradients can't be measured honestly,** so THE UNSEEN reports it as "needs a manual check", never as a pass. That became a design rule for our own gothic UI: text only ever sits on solid panels.
- **SSRF.** Auditing arbitrary URLs from a server means blocking private ranges, metadata endpoints, DNS rebinding and redirects to loopback.

## Accomplishments we're proud of
- Every haunting comes from real browser data. There is no AI guessing in the detector.
- The app passes its own audit, and the test suite proves it.
- Kiro catching and fixing its own inaccessible button through the ghost gate, in a real session.
- Night Shift catching, fixing and checking a planted regression in an unattended run, with no human approving anything along the way.
- **Test counts:** core 649 unit + 109 browser, MCP 184 unit + 35 integration, web 580 unit + 118 end-to-end + 18 replay.

## What we learned
- Specs plus independent review beat vibe coding for anything with correctness rules. Vibe mode was fast for the haunted demo shop, but it needed three fix runs and a golden file.
- Steering is where a product's truth lives.
- Verify agents by running them, and trust tests over summaries.
- Automated checks catch only part of WCAG (roughly 30 to 40 percent of issues). Passing THE UNSEEN is a start, not a finish.

## What's next
- A CI action that comments hauntings on pull requests.
- More haunting types (motion, target size, timing).
- Publishing the Power and the MCP server.

## Honest notes
We set the direction and made the key decisions: what to build, what to cut, the exceptions below, the visual direction and Night Shift's auto-approval. Kiro wrote the product, from steering, specs and hooks it also wrote. Claude Code was our planning and verification assistant: at our direction it drafted the product brief and each instruction to Kiro, ran the spec and code reviews, and re-ran every test itself instead of trusting Kiro's summary.

Code Kiro did not write is labelled in git and logged in `docs/brief/KIRO_SESSION_LOG.md`:
- Audit-engine tasks 5–16 were written by Claude Code, at a teammate's request, while that teammate was out of Kiro credits. Kiro later reviewed and adopted them.
- A final UI fix pass and a visual redesign were done by Claude Code at our request. A few small config edits by Claude Code are logged too.

The demo video was made with Remotion; its narration and screen-reader voices are text-to-speech (Kokoro), and Sarah is an illustration. The full log, failures included, is in the repo.
