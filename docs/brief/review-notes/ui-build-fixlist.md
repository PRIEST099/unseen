# UI build (Kiro IDE): product-lead fix list

Issues found while verifying each task during the nonstop IDE run. These go to Kiro as one fix pass after Phase 1, so the batch run is not interrupted.

| # | Task | Issue | Fix |
|---|---|---|---|
| 1 | 1.1 | `onProgress` reports each stage when it **finishes** ("loading" fires after the page has loaded, "tree" after the AX tree is collected). Decision N and the spec say stages are emitted when each one **starts**. The séance would show nothing during the slowest step, then jump ahead. | Emit `loading` before `loadPage`, `tree` before `collectAxTree`, `walking` before the Tab walk and `classifying` before `classify`. Update `progress.int.spec.ts` to assert the start order. |
| 2 | 1.2 | `apps/web/samples/.gitignore` excludes `*.png` and `*.jpg`, but the spec and decisions say the sample screenshots and thumbnails are **committed**. Without them, the guaranteed sample demo path breaks on a fresh clone and on the deployed box. | Delete `samples/.gitignore` and commit the PNGs and JPGs. |
| 3 | 1.2 | The sample display URL is an invented real-looking domain, `https://the-unseen.app/cursed-shop/...`, which we do not own. | Use a relative `/cursed-shop/<page>.html` display URL, or `PUBLIC_BASE_URL` from env when set. Never hard-code a domain. |
