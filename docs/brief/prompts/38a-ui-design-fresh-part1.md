Part A of 3. First read `docs/brief/prompts/38-ui-design-fresh-common.md` (shared context, rules and decisions) and follow it exactly.

Write a **new** file, `.kiro/specs/spirit-sight-ui/design.md.new`, containing these sections:
1. **Overview** and the one obvious path.
2. **Architecture and file structure,** including the **`apps/web` scaffold**:
   - `package.json` with the `@the-unseen/core` workspace dependency, scripts, and `cross-env`
   - `tsconfig` for client and server
   - `vite.config` with the `/api` dev proxy
   - Vitest config (`src/**`)
   - `playwright.config` (`e2e/`)
3. **Data contract:** only real fields and public exports.
4. **Routing and app shell,** covering every view: one h1, `main`, a skip link, `lang`, focus-to-h1 on route change, and a "Keyboard help" button.
5. **Server:**
   - a Fastify factory plus `main.ts` with `listen`
   - helmet scoped to the app, and `/cursed-shop/` served without CSP
   - rate limit with `global: false` on `POST /api/audit` only
   - `/api/health`
   - samples metadata, `:id` and `screenshot.png`
   - the `UNSEEN_DEV_ALLOW_PRIVATE` guard
6. **Job store and worker:** `auditAndClassify` with `onProgress`, functional updates, and screenshot storage.
7. **`build-samples.mjs`,** using the real fixture-server approach from `packages/core/tests/fixtures/`.
