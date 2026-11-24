First read `docs/brief/prompts/38-ui-design-fresh-common.md` (shared context, rules and decisions) and follow its decisions exactly. **One change from that file:** the product lead has already **deleted every stale duplicate section** from `.kiro/specs/spirit-sight-ui/design.md`. That covered the second API Layer and Audit Job Queue, the old Routing table, the corrupted Haunting Sidebar treatments 4–10, Keyboard-Accessible Overlays, the old FogToggle, Keyboard Shortcuts, the Docker section and the stale component-API splice. So `design.md` (about 118 KB) now holds a single version of each section. **Edit it in place.** Do not rewrite from scratch, and do not re-add deleted sections.

Fix every remaining item in `docs/brief/review-notes/spirit-sight-ui-consistency-1.md` that touches `design.md`. Items 4, 8, 9, 16, 19, 20, 21, 27 and 56 were resolved by the deletion; check them quickly, but they should need nothing. The main remaining ones:
- **Item 1 (decision H):** replace the `/haunted/` demo logic with `/cursed-shop/`. The hosted demo audits the public URL with the default policy. Remove the `{ demo }` body and the `OriginScopedPolicy` wrapping, and scope helmet so `/cursed-shop/` has no CSP.
- **Items 2 and 6:** `buildSpeechTrack` is a new core export, so define it once.
- **Items 3 and 11:** the screenshot is served from `screenshot.png` and stored before stripping. Use `naturalWidth`; no base64 and no `Buffer` in the client.
- **Items 5, 24, 28, 29 and 30:** the Keyboard walk uses the real `TabStep`/`TabWalkResult` fields; playback must actually run; escapable cycles are as decided; reduced motion uses manual step mode.
- **Item 7 (routes):** `/audit/:id` and `/sample/:id`, plus their `/keyboard`, `/whisper` and `/daylight` children. Replace every remaining `/spirit-sight/:id` in the data flow diagram, the component hierarchy and the sample-card click behaviour.
- **Items 10 and 15:** the self-audit, as in the common file.
- **Items 12 and 17:** queue-full returns 429 before a job exists, and job updates are functional.
- **Items 18, 22, 23, 25 and 31–38:** helmet scoping, overlay pointer events and target size, Silent Tongue, the toggle labels, label-in-name, the reduced-motion default, deep imports (use `@the-unseen/core` only), product-state error codes, the clean-site copy, Property 1 for fit-to-width, and the alert-based test.
- **Items 47–55, 57 and 58:** fog density from real fields; status text; one skip link; result retention; Séance typing; the component file structure, which must match the new views; performance with the screenshot endpoint; Windows-safe run commands; and the dialog title using the display name.

**Grep when done.** Each of these must return 0 lines:
- `/haunted/`
- `spirit-sight/:id`
- `screenshotPng}`
- `Buffer.from`
- `prettyPrint`
- `__dirname`
- `@the-unseen/core/`
- `spyOn(window, 'alert')`
- `NODE_ENV=production PORT`

Do not touch `tasks.md` or `requirements.md`; part C handles those next. Do not ask questions. If you near a limit, stop after a completed item and write `Next: item N`.
