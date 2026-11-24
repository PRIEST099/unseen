**Your deliverable is an edited `.kiro/specs/spirit-sight-ui/requirements.md`.** Do NOT create any report or summary file; the product lead verifies with `git diff`. First read `docs/brief/prompts/38-ui-design-fresh-common.md` (decisions), and use the current `design.md` as the reference.

Edit `requirements.md` in place so it agrees with `design.md` and the decisions:
- **1.4:** the health route is `GET /api/health`.
- **3.8 vs 5.7 (decision H):** demo audits use the public `/cursed-shop/` URL with the default policy, and the client can never pass a policy. `UNSEEN_DEV_ALLOW_PRIVATE` applies to dev and e2e only, and is refused in production.
- **8.1:** the screenshot comes from `GET /api/{audit|samples}/:id/screenshot.png`, sized by `naturalWidth`. It is not base64 in the client.
- **10.2:** overlay name: "Haunting display name: element name (or role when unnamed), severity".
- **16.x:** reduced motion does **not** redirect to Daylight; Spirit Sight has a reduced-motion variant.
- **33.3:** the sound preference is in-memory only.
- **Coverage note:** show `ClassifiedAudit.automatedCoverageNote` verbatim. **Clean site:** "No hauntings found by automated checks; a manual review is still needed."
- **Requirement 14 (Whisper):** speech comes from core `buildSpeechTrack` in AX-tree order.
- **Self-audit:** reword it to match design §13. It runs on the production build with `NODE_ENV=test`, on every route, with presence checks first.
- Scan the rest of the file, and fix any other statement that contradicts `design.md`.

**Verify before finishing:** run `git diff --stat .kiro/specs/spirit-sight-ui/requirements.md` and paste it, and grep for `/api/health`, `screenshot.png`, `buildSpeechTrack` and `automatedCoverageNote`. Do not ask questions.
