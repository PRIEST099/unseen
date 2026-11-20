---
inclusion: always
---

# THE UNSEEN — Monorepo Structure

## Root layout

```
the-unseen/
├── packages/
│   ├── core/          # Audit engine (browser runner + classifier)
│   └── mcp/           # MCP server wrapping core
├── apps/
│   ├── web/           # React + Vite SPA + Fastify API + Docker image
│   └── cursed-shop/   # Deliberately haunted demo storefront
├── power/             # Kiro Power (POWER.md, MCP config, steering, hooks)
├── docs/
│   ├── brief/         # Product brief and session log (inputs, not generated code)
│   └── specs/         # Kiro-generated specs (requirements → design → tasks)
├── .kiro/
│   ├── steering/      # These files
│   ├── specs/         # Kiro specs
│   └── hooks/         # Kiro hooks
├── package.json       # Workspace root (workspaces: ["packages/*", "apps/*"])
└── tsconfig.base.json # Shared TS config extended by every package
```

## `packages/core`

The audit engine. No Express, no Fastify, no React. Pure Node + Playwright + axe-core.

```
packages/core/src/
├── runner/            # Browser I/O only
│   ├── browser.ts     # Playwright launch, page load, screenshot, viewport
│   ├── ax-tree.ts     # CDP Accessibility.getFullAXTree → typed AXNode[]
│   ├── axe.ts         # axe-core injection and result normalisation
│   ├── tab-walker.ts  # Real Tab-key walk; returns focus order and trap detection
│   └── safe-fetch.ts  # SSRF guard applied to Playwright request interception
├── classifier/        # Pure functions — no I/O allowed here
│   ├── hauntings.ts   # Maps raw findings → Haunting[]
│   ├── severity.ts    # Banished / Restless / Wraith rules
│   ├── score.ts       # Haunting Score (0–100, deterministic, monotonic)
│   └── speech.ts      # Role + name + state → announcement string
├── types.ts           # Shared domain types (AXNode, Finding, Haunting, etc.)
└── index.ts           # Exports: auditUrl(url, options), auditHtml(html, options)
packages/core/tests/   # Playwright integration tests against cursed-shop fixtures
```

**Rule:** nothing in `classifier/` may import from `runner/`. The boundary is enforced by a TypeScript path alias restriction and checked in CI.

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

A static storefront. Every haunting type must be present and verifiable. No build step required beyond bundling static assets; it must be loadable by Playwright from a local file server.

```
apps/cursed-shop/
├── index.html         # Home / product page (Nameless Spirits, Fog, Lost Souls, etc.)
├── checkout.html      # Checkout page (Whispering Fields, Cursed Loop in modal)
├── assets/
└── README.md          # Documents which haunting is on which element, with line refs
```

The cursed-shop's `README.md` must stay in sync with the HTML. When Kiro adds or changes a haunting element, it updates the README.

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
│   ├── PRODUCT_BRIEF.md      # Written by Claude Code (product lead); do not modify
│   └── KIRO_SESSION_LOG.md   # Log of instructions sent to Kiro; append only
└── specs/                    # Kiro-generated specs; source of truth for requirements
```

## Rules for placing new files

- Audit logic (browser, AX tree, axe, Tab walk) → `packages/core/src/runner/`
- Classification, scoring, speech text → `packages/core/src/classifier/`
- MCP tool handlers → `packages/mcp/src/tools/`
- React components → `apps/web/src/client/components/`
- Fastify route handlers → `apps/web/src/server/routes/`
- Domain types shared across packages → `packages/core/src/types.ts`, re-exported as needed
- Never put browser automation code in `apps/web/` — it always belongs in `packages/core/`
- Never put React components in `packages/core/` or `packages/mcp/`
