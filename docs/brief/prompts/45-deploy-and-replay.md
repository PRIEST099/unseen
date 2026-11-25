Make THE UNSEEN deployable, and make sure the link judges click always works. Read `docs/brief/prompts/16-deploy.md` first: it is the base brief (Docker image, resource limits, `DEPLOY.md` with Fly.io and Render, smoke test). The updates below win over it where they differ. No spec is needed; this is infrastructure, so build it, but test it.

## Updates as of 2026-11-25
1. **Port.** The server reads `PORT` (default 3000). The image sets `PORT=8080` and exposes 8080.
2. **`packages/mcp`** may or may not exist when this runs. Build it in the image only if it is present (`--if-present`). Do not fail the build without it.
3. **Samples are pre-baked.** `apps/web/samples/*.json` already hold full audits of the Cursed Shop pages. The image must serve them; never re-audit samples at startup.
4. **New: static replay build (the always-up fallback).**
   - **Command:** `npm run build:replay -w @the-unseen/web` produces `apps/web/dist-replay/`, a fully static site that GitHub Pages or any static host can serve under a sub-path (the base path is configurable).
   - **What it contains:** the same React app, with the sample audits and their screenshots, thumbnails and speech tracks bundled as static files.
   - **What works:** every view: Spirit Sight, the keyboard walk, the whisper walk, Daylight, export, the haunting dialog and Takes Form.
   - **The URL form:** disabled, with one plain line: "This is the replay edition: pre-recorded audits of our haunted demo shop. The live auditor runs at [LIVE_URL]." The URL comes from a build-time env var. If it is empty, the second sentence is left out.
   - **Isolation:** no request to `/api` in replay mode, not even a failing one. Add a test that proves this.
   - **Accessibility:** the replay build passes the same self-audit (zero hauntings). Add or extend an e2e that runs against the replay build.
   - Add a GitHub Actions workflow `.github/workflows/replay-pages.yml` that builds the replay and deploys it to GitHub Pages on push to `main`. Do not enable Pages yourself; `DEPLOY.md` says how the owner turns it on.
5. **New: a scan record in exports.** The Daylight export (Markdown and JSON) and the Daylight view gain a short "Scan record". It lists:
   - the THE UNSEEN version
   - the axe-core version actually used
   - the Chromium version
   - the viewport
   - the audited URL
   - `auditedAt`

   It lets another tester rerun and confirm the findings. Take the values from the engine at audit time, not hard-coded. Add unit tests, and keep the self-audit clean.
6. **Docker.** Docker is installed on this machine. Build the image and run `scripts/smoke.mjs` against it. If the build or smoke test fails, fix it. Report the real output; do not fake a result. On Windows the Docker build runs Linux, so `UNSEEN_CHROMIUM_CHANNEL` is `""` inside the image.

Do not create cloud accounts or deploy. The owner does that step.

Run the full test suites at the end: typecheck, core unit, web unit, and web e2e (`UNSEEN_CHROMIUM_CHANNEL=chromium` on this Windows host). Never weaken a test. Never end with a menu or a question. Finish with a summary that lists each test command and its pass count, then `Next: owner deploys`.
