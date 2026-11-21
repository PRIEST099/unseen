---
inclusion: always
---

# THE UNSEEN — Monorepo Structure

## Root layout

```
the-unseen/
├── packages/
│   ├── core/          # Audit engine (browser runner + classifier)
│   └── mcp/           # MCP server wrapping core (planned)
├── apps/
│   ├── web/           # React + Vite SPA + Fastify API + Docker image (planned)
│   └── cursed-shop/   # Deliberately haunted demo storefront
├── power/             # Kiro Power (POWER.md, MCP config, steering, hooks) (planned)
├── docs/
│   ├── brief/
│   │   ├── PRODUCT_BRIEF.md   # Written by the product lead; do not modify
│   │   ├── KIRO_SESSION_LOG.md# Log of instructions sent to Kiro; append only
│   │   ├── prompts/          # Ordered prompts that drove the build (inputs)
│   │   └── review-notes/      # Product-lead and probe review notes (inputs)
│   └── HANDOFF.md             # Handover notes between contributors
├── .kiro/
│   ├── steering/      # These files
│   ├── specs/         # Kiro specs — the single source of truth for requirements,
│   │                  # design and tasks. Specs live ONLY here, in .kiro/specs/<feature>/.
│   └── hooks/         # Kiro hooks (planned)
├── CLAUDE.md          # Agent guidance for Claude Code (the product lead)
├── README.md          # Project readme
├── LICENSE            # MIT
├── package.json       # Workspace root (workspaces: ["packages/*", "apps/*"])
└── tsconfig.base.json # Shared TS config extended by every package
```

## `packages/core`

The audit engine. No Express, no Fastify, no React. Pure Node + Playwright + axe-core.

```
packages/core/
├── src/
│   ├── runner/            # Browser I/O only
│   │   ├── browser.ts     # Playwright launch, page load, screenshot, viewport, pool
│   │   ├── ax-tree.ts     # CDP Accessibility.getFullAXTree → typed AXNode[]
│   │   ├── axe.ts         # axe-core injection and result normalisation
│   │   ├── tab-walker.ts  # Real Tab-key walk; returns focus order and trap detection
│   │   └── safe-fetch.ts  # SSRF guard applied to Playwright request interception
│   ├── classifier/        # Pure functions — no I/O allowed here (planned)
│   │   ├── hauntings.ts   # Maps raw findings → Haunting[]
│   │   ├── severity.ts    # Banished / Restless / Wraith rules
│   │   ├── score.ts       # Haunting Score (0–100, deterministic, monotonic)
│   │   └── speech.ts      # Role + name + state → announcement string
│   ├── types.ts           # Shared domain types (AXNode, Finding, Haunting, etc.)
│   └── index.ts           # Exports: auditUrl(url, options), auditHtml(html, options)
├── tests/                 # Playwright integration tests (planned)
│   └── fixtures/          # Shared test fixtures, e.g. the cursed-shop file server
├── vitest.config.ts       # Unit + property tests (src/**/*.test.ts)
├── playwright.config.ts   # Integration tests (tests/**/*.int.spec.ts)
└── tsconfig.json
```

**Rule:** nothing in `classifier/` may import from `runner/`. The `RawAudit` type (from `types.ts`) is the sole interface between them. The runner assembles data; the classifier interprets it. This boundary will be enforced by ESLint `no-restricted-imports` (forbidding any import path that resolves into `src/runner/` from `src/classifier/`) plus a test in the haunting-classifier spec that asserts no classifier file imports from `runner/`. There is no CI yet.

## `packages/mcp`

The MCP server. Thin wrapper: validates inputs, calls `packages/core`, formats results.

```
packages/mcp/src/
├── server.ts          # MCP server entry point (stdio transport)
├── tools/
│   ├── audit-url.ts   # audit_url tool handler
│   ├── audit-html.ts  # audit_html tool handler
│   ├── explain.ts     # explain_haunting tool handler
│   └── suggest-fix.ts # suggest_fix tool handler
└── types.ts           # MCP tool input/output schemas (Zod)
```

## `apps/web`

One deployable unit: React SPA + Fastify API + Docker image.

```
apps/web/
├── src/
│   ├── client/        # React + Vite SPA
│   │   ├── components/
│   │   ├── views/
│   │   ├── hooks/
│   │   └── main.tsx
│   └── server/        # Fastify API
│       ├── routes/
│       │   ├── audit.ts     # POST /api/audit, GET /api/audit/:id
│       │   └── health.ts
│       ├── jobs/            # Audit job queue / in-memory store
│       └── server.ts        # Fastify app factory
├── Dockerfile
├── vite.config.ts
└── tsconfig.json
```

The Fastify server serves the compiled Vite SPA from `dist/client/` in production. In development, Vite runs separately and the API proxies `/api/*`.

## `apps/cursed-shop`

A static storefront. Every haunting type must be present and verifiable. No build step required; it is loadable by Playwright from a local file server.

```
apps/cursed-shop/
├── index.html              # Home / product page (Nameless Spirits, Fog, Lost Souls, etc.)
├── product.html            # Single product page (Shattered Order, Lost Souls, etc.)
├── checkout.html          # Checkout page (Whispering Fields, Cursed Loop in modal)
├── img/                    # SVG product images (candle-*.svg)
├── expected-hauntings.json # Single source of truth: exact haunting counts per page
├── verify.mjs              # Recomputes hauntings from the rules and compares with the JSON
├── package.json            # `serve` devDependency + start/verify scripts
└── README.md               # Documents which haunting is on which element, by CSS selector
```

The cursed-shop's `README.md` documents each haunting element by **CSS selector** (not line references), and must stay in sync with `expected-hauntings.json` and the live DOM. When Kiro adds or changes a haunting element, it updates both the README and `expected-hauntings.json`.

## `power/`

The Kiro Power bundle. Not application code.

```
power/
├── POWER.md           # Power description and installation instructions
├── mcp.json           # Points to packages/mcp (local) or the published npm package
├── steering/          # Steering files copied / symlinked for Power consumers
└── hooks/             # on-save, on-spec-change, exorcise, pre-commit hooks
```

## `docs/`

```
docs/
├── brief/
│   ├── PRODUCT_BRIEF.md      # Written by the product lead; do not modify
│   ├── KIRO_SESSION_LOG.md   # Log of instructions sent to Kiro; append only
│   ├── prompts/              # Ordered prompts that drove the build (inputs)
│   └── review-notes/         # Product-lead and probe review notes (inputs)
└── HANDOFF.md                # Handover notes between contributors
```

## Rules for placing new files

- Audit logic (browser, AX tree, axe, Tab walk) → `packages/core/src/runner/`
- Classification, scoring, speech text → `packages/core/src/classifier/`
- MCP tool handlers → `packages/mcp/src/tools/`
- React components → `apps/web/src/client/components/`
- Fastify route handlers → `apps/web/src/server/routes/`
- Domain types shared across packages → `packages/core/src/types.ts`, re-exported as needed
- Integration tests and shared test fixtures → `packages/core/tests/` and `packages/core/tests/fixtures/`
- Never put browser automation code in `apps/web/` — it always belongs in `packages/core/`
- Never put React components in `packages/core/` or `packages/mcp/`
