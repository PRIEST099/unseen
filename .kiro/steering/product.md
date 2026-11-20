---
inclusion: always
---

# THE UNSEEN — Product

## Purpose

THE UNSEEN shows developers and product owners what a screen-reader or keyboard-only user experiences on their site. Paste a URL: inaccessible elements become visible hauntings — fog, ghosts, cursed loops — so the failure is felt, not just listed. Kiro then exorcises the hauntings by fixing the source code.

The core insight: axe and Lighthouse already list violations. Developers ignore them because "missing accessible name on button" feels abstract. THE UNSEEN makes it visceral.

## Audiences

1. **Front-end developers and agencies** — the primary fixers. They need a clear haunting-to-fix path.
2. **PMs and founders** — they need to *see* why it matters before they prioritise it.
3. **AI coding agents (via the Kiro Power)** — the Power installs steering and hooks so Kiro never ships an inaccessible UI.

## Product surfaces

| ID | Surface | What it does |
|----|---------|-------------|
| A | **The Unseen web app** | Paste URL → Spirit Sight view, Whisper walk, Keyboard walk, Daylight report |
| B | **unseen-mcp** | MCP server (stdio) wrapping the audit engine: `audit_url`, `audit_html`, `explain_haunting`, `suggest_fix` |
| C | **The Unseen Kiro Power** | Bundles unseen-mcp + steering + hooks; installs into Kiro so it audits its own UI output |
| D | **The Cursed Shop** (`apps/cursed-shop`) | A deliberately haunted demo storefront with every haunting type; its exorcised version is produced by Kiro on camera |
| E | **Night Shift** (stretch, separate repo) | A Kiro Crew app that patrols sites on a schedule and drafts fix PRs |

## Non-negotiables

These rules are hard constraints, not preferences. Never generate code or content that violates them.

### 1. The app itself must be WCAG 2.2 AA

The web app (`apps/web`) must meet every criterion listed in `hauntings.md` for its own UI. Full keyboard support, visible focus indicators, correct accessible names on all interactive elements, proper form labels, live-region announcements for dynamic content, and `prefers-reduced-motion` respected throughout.

Fog, desaturation, and haunting overlays apply **only inside the screenshot canvas of the audited site**. They must never be applied to the app's own headings, body text, buttons, inputs, or navigation. A haunted accessibility tool is disqualifying.

The app audits itself: CI runs `unseen-mcp` against the app's own build, and a Kiro on-save hook runs it against the dev server for any UI file change.

### 2. No runtime overlay fixes

We show, explain, and fix **source code** via Kiro. We never inject accessibility fixes into a third-party site at runtime. This separates us from overlay widgets (accessiBe, UserWay), which the accessibility community actively opposes. Never generate code that patches another site's DOM at runtime.

### 3. Truthful speech

Whisper walk text comes from the **computed** accessible role, name, and state read from the Chromium accessibility tree. Never construct announcement text by guessing from the DOM alone. The exact announcement rules are in `hauntings.md` and are the single source of truth.

### 4. Safe fetching — no SSRF

The hosted auditor fetches only public `http(s)` URLs. It resolves DNS before fetching and blocks all private, loopback, link-local, and cloud-metadata address ranges in every encoding, for every network request the audited page makes (via Playwright request interception). Full rules are in `security.md`.

Local and `localhost` URLs are permitted **only** in the local MCP server running on a developer's own machine, never in the hosted web app.

### 5. Honest about automated-testing limits

Automated checks find roughly 30–40% of WCAG issues. The Daylight report must display this caveat prominently. Never claim a site is "compliant" or "accessible". The report says what was checked, what was found, and what requires manual testing.
