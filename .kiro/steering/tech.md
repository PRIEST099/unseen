---
inclusion: always
---

# THE UNSEEN — Tech Stack & Conventions

## Runtime and package management

- **Node.js 22** (LTS). Do not use features that require a later version.
- **npm workspaces** for the monorepo. No other package manager (no pnpm, no yarn).
- **TypeScript strict mode** everywhere (`"strict": true` in every `tsconfig.json`). No exceptions.

## Packages and frameworks

| Concern | Library/tool | Notes |
|---------|-------------|-------|
| Browser automation | **Playwright** (Chromium only) | Fixed viewport for screenshot + AX tree collection from the same render |
| Accessibility scanning | **axe-core** (via `@axe-core/playwright`) | Injected into the page; results fed to the classifier |
| Accessibility tree | **CDP `Accessibility.getFullAXTree`** | Via Playwright's CDP session; this is the ground truth for roles, names, states |
| Tab walk | Playwright keyboard simulation | Real `Tab` keypresses; detect traps by cycle detection on focus order |
| API server | **Fastify** | In `apps/web`; handles `POST /api/audit` → job, `GET /api/audit/:id` |
| Frontend | **React + Vite** | SPA in `apps/web`; no SSR required |
| Unit / property tests | **Vitest + fast-check** | fast-check for all pure modules; see testing policy below |
| Integration tests | **Playwright Test** | Against `apps/cursed-shop` fixtures; golden expectations |
| MCP server | **MCP TypeScript SDK** | In `packages/mcp`; transport: stdio |
| Container | **Official Playwright Docker image** | One image for `apps/web`; no other base image |

## TypeScript rules

- `"strict": true` — no overrides.
- No `any`. Use `unknown` and narrow, or define an explicit type. If a third-party type is `any`, wrap it.
- Explicit error types everywhere. Never `catch (e: any)`. Use `catch (e: unknown)` and narrow with `instanceof` or a type guard. Define typed error classes for domain errors (e.g. `SsrfBlockedError`, `AuditTimeoutError`).
- No type assertions (`as Foo`) except when narrowing from `unknown` after a runtime check. Never use `as unknown as Foo` to bypass the type system.
- All exported functions must have explicit return types.
- Prefer `type` over `interface` for plain data shapes; use `interface` for objects that will be extended or implemented.

## Code style rules

- **Pure functions for the classifier.** `packages/core/src/classifier/` must be side-effect free: no I/O, no globals, no `Date.now()`, no `Math.random()`. All inputs come in as parameters; outputs are return values. This is what makes property-based testing tractable.
- Keep Playwright/browser I/O strictly in `packages/core/src/runner/`. Nothing in `classifier/` may import from `runner/`.
- No barrel re-exports (`index.ts` that re-exports everything). Import from the specific module.
- Prefer named exports over default exports.
- File names: `kebab-case.ts`. Class names: `PascalCase`. Everything else: `camelCase`.
- Maximum function length: 40 lines. Split earlier when a function has distinct concerns.
- No inline `TODO` comments in generated code. Raise them as spec tasks instead.

## Testing policy

- **Every pure module in `packages/core/src/classifier/` must have property-based tests** using fast-check. The properties are defined in `hauntings.md`. Do not ship a classifier function without its fast-check suite.
- Property tests live alongside the source: `foo.ts` → `foo.test.ts`.
- Playwright integration tests live in `packages/core/tests/` and run against fixtures, not live URLs, in CI.
- Test files are never deployed. The `tsconfig.json` for each package excludes `**/*.test.ts` from the production build.
- Coverage is not a target number; meaningful invariant coverage is the target.

## Deployment

- `apps/web` ships as one Docker image: Fastify API + compiled React SPA served as static files from Fastify. Base image: `mcr.microsoft.com/playwright` (the official image with Chromium pre-installed).
- Target platforms: Fly.io / Render / Railway. The Dockerfile must accept `PORT` as an environment variable.
- `packages/mcp` is distributed as an npm package (stdio transport). It is not containerised; consumers run it via `npx` or install it locally.
