# Shared context for runs 38a–38c (fresh spirit-sight-ui design)

`.kiro/specs/spirit-sight-ui/design.md` (about 135 KB) contains stale sections **next to** their amended replacements, because past amendments appended instead of replacing. A final check found 63 contradictions: `docs/brief/review-notes/spirit-sight-ui-consistency-1.md`. We are therefore writing a **fresh, compact design** (target ≤ 70 KB in total) from the authoritative sources only:
1. `.kiro/specs/spirit-sight-ui/requirements.md` (fix it where the consistency note says it is wrong)
2. decisions A–N in `docs/brief/prompts/29-spirit-sight-ui-spec-amend.md`
3. the "Keep" column of the consistency note
4. the real core API: `packages/core/src/index.ts` (public exports; import only from `@the-unseen/core`), `packages/core/src/types.ts` and `packages/core/src/classifier/types.ts`

**Do NOT read the old `design.md`** apart from targeted `grep`s. Its stale text is the problem, and reading it fills your context.

## Rules
- **Step 0:** set `"enabled": false` in `.kiro/hooks/spec-types-drift.json`. Re-enable it only at the end of part C.
- Do not ask questions. If you near a limit, stop after a completed section and write `Next: <section>`.

## Decisions that settle the open conflicts
- **Demo audits (H):** the Fastify server serves `apps/cursed-shop` at `/cursed-shop/`, in an encapsulated context **without** the helmet CSP (the shop needs its inline scripts). The hosted demo audits the public `https://<host>/cursed-shop/<page>.html` with the default restrictive policy.
  - `UNSEEN_DEV_ALLOW_PRIVATE=1` maps to `allowPrivate: true` and is used only locally and in e2e; the server refuses it when `NODE_ENV=production`.
  - **Never pass an explicit `safeFetchPolicy`.** There is no `{ demo }` body and no `/haunted/` route.
- **Screenshot (B/D):** `<img src="/api/{audit|samples}/:id/screenshot.png">`. The intrinsic size comes from `img.naturalWidth`/`naturalHeight`, with `scale = min(1, containerWidth / naturalWidth)`. No base64 in the client, no `Buffer`. Store the PNG separately **before** stripping it from the job result.
- **Speech (I):** a new core task adds `buildSpeechTrack(raw): SpeechLine[]` in `packages/core/src/classifier/speech.ts`, built on `announce`/`announceNote` in AX-tree order. It and `SpeechLine` are exported by name from `src/index.ts`, with a test, and noted in the audit-engine Notes. `classify` is not public; use `auditAndClassify`.
- **Jobs (N):** use functional `update(id, j => ...)` everywhere. **Queue full** returns 429 before any job is created. `onProgress` stages are emitted when each stage **starts**.
- **Overlay name (J):** "Haunting display name: element name (or role when unnamed), severity". Fix requirements 10.2 to match. Buttons get pointer events and a 24 px minimum target. Silent Tongue has no text inside `aria-hidden` (use a shape plus the button name).
- **Self-audit (F):**
  - A Playwright global setup builds the app and starts `node apps/web/dist/server/main.js` with `NODE_ENV=test` (not production) on a free port.
  - It then runs `auditAndClassify(url, { allowPrivate: true })` on `/`, on `/sample/cursed-shop-index` (and its `/keyboard`, `/whisper` and `/daylight`), and on the 404 view, each in its initial render state.
  - It asserts the presence markers first (the h1 text, the "Open Spirit Sight" button), then `hauntings.length === 0`.
- **Windows-safe commands:** run scripts as `npm run <script> -w apps/web` / `-w @the-unseen/core`, never `npx ... -w`. Set env vars with `cross-env` (a devDependency) or inside Node scripts, never as POSIX `FOO=1 cmd` prefixes.
- **Text and copy:**
  - The clean-site copy is exactly: "No hauntings found by automated checks; a manual review is still needed."
  - The coverage note shows `ClassifiedAudit.automatedCoverageNote` verbatim; do not invent copy.
  - The sound preference is in-memory only, not `localStorage`.
