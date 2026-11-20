# THE UNSEEN: Product Brief

> **Provenance:** Claude Code wrote this brief as the product lead. It is the *input* to Kiro: Kiro turns it into steering docs, specs, tasks and code. Claude Code does not write application code in this repo. Every instruction sent to Kiro is logged in `docs/brief/KIRO_SESSION_LOG.md`.

---

## 1. One line

**Paste any URL and see your site the way a screen-reader or keyboard user experiences it.** Content that assistive technology can't perceive sinks into fog. Unlabelled buttons become nameless spirits that whisper only "button… button…". Keyboard traps appear as cursed loops. Then Kiro exorcises them.

## 2. Why this matters (Potential Impact)

- About **1 in 6 people** (WHO, 1.3B) live with a significant disability. Screen-reader and keyboard-only users hit broken sites every day.
- Accessibility is now **legally enforced**:
  - The **European Accessibility Act** applies to e-commerce, banking and more in the EU (since 28 June 2025).
  - The **ADA Title II web rule** (WCAG 2.1 AA) has its first compliance deadline in **April 2026**.
  - Lawsuits under ADA Title III continue in the thousands each year.
- The gap is **empathy and comprehension, not detection.** axe, WAVE and Lighthouse already list violations, and developers ignore those lists because "missing accessible name on button" feels abstract. THE UNSEEN makes the failure *felt*: you watch your Add to Cart button vanish and hear what a blind customer hears.
- **Audiences:**
  1. Front-end developers and agencies, who fix issues.
  2. PMs and founders, who need to *see* why it matters.
  3. AI coding agents (via the Kiro Power), which should never ship an inaccessible UI again.

## 3. Product surfaces

| # | Surface | What it is | Judges experience it as |
|---|---|---|---|
| A | **The Unseen web app** | Paste URL → Spirit Sight view, Whisper walk, Keyboard walk, Daylight report | Live URL they can try |
| B | **unseen-mcp** | MCP server exposing the audit engine (`audit_url`, `audit_html`, `explain_haunting`, `suggest_fix`) | Used inside Kiro during the demo |
| C | **The Unseen Kiro Power** | Bundles unseen-mcp + steering ("audit every UI you build; never ship a nameless spirit") + hooks | The Kiro guardrail moment: Kiro audits and fixes its own UI |
| D | **The Cursed Shop** | A deliberately haunted demo storefront (`apps/cursed-shop`) that is the guaranteed demo target, plus its exorcised state after Kiro fixes it | Before/after in the video |
| E | **Night Shift** (stretch, separate repo) | A Kiro Crew app that patrols a list of sites on a schedule, runs unseen-mcp and drafts fix PRs | Best Kiro Crew App bonus |

## 4. The hauntings (the core idea)

> **Superseded for rules:** `.kiro/steering/hauntings.md` is the source of truth. It has **10** hauntings (it adds **The Veiled**: visible content hidden from assistive tech with `aria-hidden`), and its rules were refined in two steering reviews. The table below is the original pitch.

Every haunting is **grounded in real data**: the Chromium accessibility tree (CDP `Accessibility.getFullAXTree`), axe-core results, computed styles, and a real Tab-key walk. **No haunting may be decorative.** Each one maps to a WCAG 2.2 success criterion, the elements involved, a plain-language explanation, and a fix.

| Haunting | Detection (data source) | Visual in Spirit Sight | Sound | WCAG |
|---|---|---|---|---|
| **Nameless Spirit** | Interactive role (button, link, menuitem, tab, checkbox…) with empty computed accessible name | Element becomes a faceless translucent ghost; label fades out | Whispers only the role: "button" | 4.1.2, 2.4.4, 1.1.1 (image buttons) |
| **Hollow Portrait** | `<img>` / `role=img` with no alt and no name (not `alt=""`) | Image goes hollow-eyed and desaturated | "unlabelled graphic" + filename, as many screen readers fall back to | 1.1.1 |
| **The Fog** | Text contrast below 4.5:1 (3:1 for large text) | Fog over the text, with density proportional to the contrast deficit | none | 1.4.3 |
| **Lost Soul** | Element with click handler/pointer cursor that is not keyboard-focusable and has no interactive role | A soul trapped behind glass; the Tab path walks straight past it | none | 2.1.1, 4.1.2 |
| **Cursed Loop** | Tab walk revisits a focus cycle before visiting all focusables (keyboard trap) | Glowing red cursed circle; the walking ghost gets stuck | Repeating chime | 2.1.2 |
| **Invisible Wanderer** | Focus indicator not visible (no outline/box-shadow change on focus, from a computed style diff) | Ghost footsteps with no light | none | 2.4.7 (2.4.13 AAA as guidance) |
| **Whispering Field** | Form control with no label / accessible name | Field with a ghostly mouth and no words | "edit text, blank" | 1.3.1, 3.3.2, 4.1.2 |
| **Silent Tongue** | `<html>` missing a valid `lang` | Page-level banner: the spirits speak a garbled tongue | Garbled whisper | 3.1.1 |
| **Shattered Order** | Heading levels skip, or no `<h1>`/landmarks | Broken gravestone headings in the outline view | none | 1.3.1, 2.4.6 (best practice) |

**Severity** (Banished / Restless / Wraith) is derived from WCAG level, the number of affected elements, and whether a core task is blocked (for example a checkout button that is a Nameless Spirit).

**Haunting Score** (0–100, lower is better) is a weighted sum of hauntings. It must be **deterministic, monotonic** (adding a haunting never lowers the score) and **order-independent**. These are perfect property-based testing targets.

## 5. Experience walkthrough

1. **Landing:** candle-lit dark page. One input: "Which site do you dare to see through their eyes?" Below it, the Cursed Shop is offered as a sample, plus 2–3 pre-audited public examples.
2. **Summoning (loading):** a progress séance shows real stages: loading the page → reading the accessibility tree → walking the keyboard path → consulting WCAG. No fake delays.
3. **Spirit Sight view:** a full-page screenshot with an SVG/canvas overlay. Hauntings render in place. Boxes come from the **same render** as the screenshot, so they never drift. On the side is a haunting list grouped by type, with severity and counts.
4. **Whisper walk ("Hear what they hear"):** the page is read in accessibility-tree order using **Web Speech**, highlighting each node as it speaks. Speech text is generated from the computed role, name and state (for example "Add to cart, button" vs "button"), so it is faithful. The speed and voice can be changed. Sound stays off until the user clicks (autoplay rules).
5. **Keyboard walk:** an animated ghost follows the real Tab order across the screenshot. It skips Lost Souls and gets stuck in Cursed Loops.
6. **Haunting detail:** what it is, who it hurts (a persona line, e.g. "A blind shopper using NVDA hears only 'button'"), the WCAG criterion with a link, the offending HTML snippet, and a suggested fix snippet.
7. **Daylight mode:** a toggle to a calm, high-contrast, motion-free report: a WCAG table with export (Markdown/JSON). It is also the reduced-motion default when `prefers-reduced-motion` is set.
8. **Exorcise (in Kiro):** with the Power installed, Kiro calls `unseen-mcp` against the dev server and fixes the code. On re-audit the ghost "takes form" and its real name is spoken.

## 6. Non-negotiables

1. **The app itself must be WCAG 2.2 AA.** A haunted accessibility tool that is inaccessible is instantly disqualifying to judges. Fog and effects apply **only to the screenshot of the audited site**, never to the app's own UI text. Full keyboard support, visible focus, proper labels, live-region announcements, and respect for `prefers-reduced-motion`. **The app audits itself in CI and in a Kiro hook.**
2. **No overlay-widget vibes.** We never inject fixes into other people's sites at runtime (that's the accessiBe anti-pattern the community hates). We show, explain, and fix **source** via Kiro.
3. **Truthful speech.** Whispers come from the real computed role, name and state. Document the announcement rules. Never invent.
4. **Safe fetching (SSRF).** The hosted auditor only loads public http(s) URLs. It resolves DNS and blocks private, loopback, link-local and cloud-metadata ranges for **every** request the page makes (Playwright request interception), with timeouts, page-weight limits, rate limiting and a concurrency cap. Local/dev URLs are allowed **only** in the local MCP server running on the developer's machine.
5. **Honest about limits.** Automated checks find about 30–40% of WCAG issues. Say so in Daylight mode, and never claim "compliant".

## 7. Architecture (proposal; Kiro may refine it in the design spec)

- **Monorepo (npm workspaces, TypeScript, Node 22):**
  - `packages/core`: the audit engine.
    - Playwright (Chromium) loads the page at a fixed viewport, takes a full-page screenshot, and collects element boxes from the same render.
    - Runs axe-core, reads the AX tree via CDP, and runs the Tab walker.
    - A **pure, side-effect-free classifier** turns raw findings into hauntings and scores. This is where the property-based tests live.
  - `packages/mcp`: an MCP server (stdio) wrapping core. Tools: `audit_url`, `audit_html`, `explain_haunting`, `suggest_fix`.
  - `apps/web`: React + Vite SPA plus a small Fastify API (`POST /api/audit` → job, `GET /api/audit/:id`) in **one Docker image**, based on the official Playwright image. Deployable to Fly.io / Render / Railway.
  - `apps/cursed-shop`: a static, deliberately broken storefront with every haunting type present. Its fixed version is produced by Kiro on camera / in git history.
  - `power/`: the Kiro Power (POWER.md, MCP config, steering, hooks).
- **Testing:** Vitest + **fast-check** for property-based tests, plus Playwright tests of core against cursed-shop fixtures (golden expectations: "the shop has exactly N Nameless Spirits").
- **No paid APIs required.** LLM use is optional and only for prose explanations; the core is deterministic.

## 8. Design direction (Costume Contest)

- **Mood:** a Victorian séance meets a precision instrument. Elegant, eerie and *legible*, never Halloween-store clip-art.
- **Palette (tokens):**
  - `ink` #0B0A10 (background)
  - `bone` #ECE6D6 (text)
  - `ecto` #7CF5C8 (Spirit Sight accent, focus)
  - `ember` #FF5A4E (traps, critical)
  - `candle` #F4B860 (warnings)
  - `mist` #8E8AA8 (secondary text, still ≥4.5:1 on ink)
  - Every pair must be checked for AA contrast in a test.
- **Type:**
  - **Atkinson Hyperlegible** (designed by the Braille Institute for low-vision readers; a meaningful choice) for all UI and body text.
  - A restrained display serif (e.g. *Cormorant Garamond* or *IM Fell English SC*) for headings only.
- **Motion:** a WebGL/canvas noise fog on the screenshot layer only; spirits drift subtly; the "takes form" animation when a haunting is fixed. Everything is disabled under reduced motion.
- **Sound:** Web Speech whispers (lower pitch, slower rate) plus an optional ambient drone (Web Audio). Off by default and toggleable.
- **Signature moment:** toggling Spirit Sight. Page elements dissolve into fog in a wave from top to bottom, then the whispers begin.

## 9. The 3-minute demo (Presentation is 20%)

1. **0:00–0:15, hook:** a beautiful product page. "This store looks fine to you."
2. **0:15–0:45:** toggle Spirit Sight. Half the page fogs over, and Add to Cart becomes a nameless spirit: "button… button…". "This is what 2.2 million screen-reader users heard."
3. **0:45–1:10:** Keyboard walk. The ghost walks the Tab path and gets stuck in the newsletter-modal Cursed Loop.
4. **1:10–1:50, Kiro:** in Kiro, with the Power installed, ask Kiro to "build a checkout button". The on-save hook runs unseen-mcp, finds a Nameless Spirit, and Kiro fixes it. Re-audit: the ghost takes form and the real name is spoken.
5. **1:50–2:25:** run it on a real public site (pre-checked). Show the Daylight report and WCAG export.
6. **2:25–2:50:** how Kiro built it: specs, PBT, hooks, the Power, steering.
7. **2:50–3:00:** "Make the unseen seen." End card.

## 10. Kiro strategy (Technological Implementation is 20%)

Use Kiro the way judges want to see it, **for real**, not bolted on:

- **Steering:**
  - `product.md`, `tech.md`, `structure.md`
  - `hauntings.md`: the haunting taxonomy, so every generated component follows it
  - `design-system.md`: tokens, type, motion and reduced-motion rules
  - `security.md`: SSRF rules
- **Specs (requirements → design → tasks, EARS format):**
  1. `audit-engine`: render, AX tree, axe, Tab walker
  2. `haunting-classifier`: taxonomy, severity, score
  3. `spirit-sight-ui`: overlay, whisper walk, keyboard walk, Daylight
  4. `unseen-mcp-and-power`
  5. `cursed-shop`
  6. `safe-fetch`: SSRF guard
- **Property-based tests (fast-check), with real invariants:**
  - The contrast ratio is symmetric, bounded to [1, 21], and monotonic in luminance difference.
  - The score is deterministic, order-independent and monotonic.
  - The classifier maps every axe/AX finding to at most one primary haunting, and none is lost.
  - The Tab walker always terminates, and a trap is reported iff a focus cycle repeats before coverage.
  - The SSRF guard rejects every generated private/loopback/link-local/metadata address in all encodings (decimal, octal, IPv6-mapped).
  - Speech-text generation always includes the role, and includes the name iff the name is non-empty.
- **Hooks:**
  - On save of UI files → run unseen-mcp on the app's own dev build (**the app audits itself**).
  - On spec change → regenerate shared types.
  - Manual "Exorcise" hook → ask Kiro to fix the selected haunting.
  - Pre-commit-style test hook.
- **MCP:** Playwright MCP during development; **unseen-mcp** shipped as a product and as a Power.
- **Custom agent:** a read-only `medium` auditor agent for CI.
- **Kiro CLI headless:** used by the product lead (Claude Code) to direct Kiro. This is documented honestly in the write-up as an experiment in agent-to-agent development.
- **Kiro Crew (stretch):** Night Shift, a separate repo, for the Best Kiro Crew App bonus.

## 11. Milestones (deadline Fri 4 Dec 2026, 2:00 PM PT)

> **Actual progress is driven by Kiro credits.** See `docs/brief/prompts/README.md` (schedule) and `docs/brief/KIRO_SESSION_LOG.md` (status). As of Nov 21, only audit-engine tasks 1–4 are built.

| Days | Milestone | Cut line if behind |
|---|---|---|
| Nov 19–20 | Steering + specs; scaffold; core render + AX tree + axe on the Cursed Shop | — |
| Nov 21–24 | Classifier + score + PBT; Tab walker; SSRF guard; MCP server | Drop Shattered Order, Silent Tongue |
| Nov 25–28 | Spirit Sight UI, whisper walk, keyboard walk, Daylight; deploy | Drop the ambient sound; simpler fog |
| Nov 29–Dec 1 | Kiro Power + hooks; Exorcise loop on the Cursed Shop; real-site examples; polish | Drop Night Shift |
| Dec 2–3 | Video, write-up, README, blog draft (user writes the social post) | — |
| Dec 4 | Buffer; submit by noon PT | — |

## 12. Prize strategy

- **Main:** Overall 1st–3rd. Fallback: **Costume Contest** category (one or the other, never both).
- **Bonus (stackable):**
  - **Best Ghost of Kiroween Past:** the entrant registered for Kiroween 2025.
  - **Best Kiro Crew App:** Night Shift, separate repo.
  - **Best Demo**
  - **Bonus Blog**
  - **Social Blitz:** the entrant writes the post personally; it is judged on original thought.
- **Submission requirements checklist:**
  - Public GitHub repo with an OSI license (MIT) visible in the About section
  - `/.kiro` committed and not gitignored
  - Live URL
  - Public YouTube video under 3 minutes
  - Kiro write-up
