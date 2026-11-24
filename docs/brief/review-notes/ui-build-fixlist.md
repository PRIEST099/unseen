# UI build (Kiro IDE): product-lead fix list

Issues found while verifying each task during the nonstop IDE run. These go to Kiro as one fix pass after Phase 1, so the batch run is not interrupted.

| # | Task | Issue | Fix |
|---|---|---|---|
| 1 | 1.1 | `onProgress` reports each stage when it **finishes** ("loading" fires after the page has loaded, "tree" after the AX tree is collected). Decision N and the spec say stages are emitted when each one **starts**. The séance would show nothing during the slowest step, then jump ahead. | Emit `loading` before `loadPage`, `tree` before `collectAxTree`, `walking` before the Tab walk and `classifying` before `classify`. Update `progress.int.spec.ts` to assert the start order. |
| 2 | 1.2 | `apps/web/samples/.gitignore` excludes `*.png` and `*.jpg`, but the spec and decisions say the sample screenshots and thumbnails are **committed**. Without them, the guaranteed sample demo path breaks on a fresh clone and on the deployed box. | Delete `samples/.gitignore` and commit the PNGs and JPGs. |
| 3 | 1.2 | The sample display URL is an invented real-looking domain, `https://the-unseen.app/cursed-shop/...`, which we do not own. | Use a relative `/cursed-shop/<page>.html` display URL, or `PUBLIC_BASE_URL` from env when set. Never hard-code a domain. |
| 4 | 1.5 (design) | The landing page is clean but plain: ink background, title, input, sample cards. It does not yet deliver the brief's "candle-lit dark page" and Victorian-séance mood (Costume Contest; Design is 20%). | Add atmosphere on the landing hero: a subtle candle glow (radial `--color-candle` gradient), a vignette, a faint noise texture and a larger display title. Keep it on-token and AA, and disable all of it under reduced motion. |
| 5 | 1.5 (design) | "Haunting Score: 98" on the sample cards does not say what the number means. Higher = more haunted, which first-time visitors will not guess. | Show "98 / 100 · heavily haunted", or similar severity wording, plus an accessible explanation ("Haunting Score out of 100; higher means more accessibility barriers"). |
