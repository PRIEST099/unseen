Make `apps/web` deployable as **one Docker image**. Follow `tech.md`, `security.md`, the `safe-fetch` design §defense-in-depth, and brief §7. No spec is needed: this is infrastructure, so vibe it, but test it.

1. **`apps/web/Dockerfile`:**
   - Multi-stage build. The build stage runs `npm ci` for the workspace and builds `packages/core`, `packages/mcp` and `apps/web`.
   - Runtime stage: the official Playwright image **pinned to the repo's exact Playwright version**. Today the lockfile resolves Playwright 1.65.1, so use `mcr.microsoft.com/playwright:v1.65.1-noble`, and pin `playwright` and `@playwright/test` to that exact version in `package.json`.
   - Run as the non-root `pwuser`, with `NODE_ENV=production` and `UNSEEN_CHROMIUM_CHANNEL=""` (the bundled browser).
   - `EXPOSE 8080`, plus a `HEALTHCHECK` on `/api/health`.
   - Add a `.dockerignore`.
2. **Resource limits** from `security.md`: concurrency cap 2 on a 1 GB instance, audit timeout, page-weight limit, and the rate limit. All are configurable by environment variables; document them in a table.
3. **`apps/web/DEPLOY.md`:**
   - Step-by-step for **Fly.io** (`fly.toml` included) and **Render** (`render.yaml` included): memory ≥ 1 GB, a single region, and the health check.
   - The egress firewall guidance (deny RFC 1918, link-local, CGNAT, metadata), written honestly for platforms that cannot enforce it: say the in-process proxy is then the only layer.
   - How to warm the sample JSON.
4. **Smoke test** `apps/web/scripts/smoke.mjs`: given a base URL, it checks:
   - `/api/health`
   - one audit of a sample, which must finish and return a score
   - `http://169.254.169.254/` returns a 4xx SSRF error
   - `/` serves the SPA with a CSP header
5. Build the image locally if Docker is available (`docker build -f apps/web/Dockerfile .`) and run the smoke test against `localhost:8080`. If Docker is not installed, say so; do not fake the result.

Do not create cloud accounts or deploy. The product lead and the owner will do that step.
