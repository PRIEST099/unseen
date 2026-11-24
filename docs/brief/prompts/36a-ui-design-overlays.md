Part A of 4.

**Step -1 (fix first):** `.kiro/agents/unseen-spec-writer.json` has an allow rule for `fs_write` on `.kiro/specs/**` plus a deny rule for `**`. In the V3 permission model **deny wins**, so the spec-writer could not write anything (runs 36a–d all failed with a permission block). Remove the blanket deny. Keep it least-privilege: allow `fs_write` only on `.kiro/specs/**` and `.kiro/hooks/*.json`, and deny `apps/cursed-shop/expected-hauntings.json`, `docs/brief/**` and `.env*`. Validate by loading the agent and writing, then deleting, `.kiro/specs/spirit-sight-ui/.probe`. **Context:** we are amending `.kiro/specs/spirit-sight-ui/` after a review: `docs/brief/review-notes/spirit-sight-ui-spec-review-1.md` (52 findings) and decisions A–N in `docs/brief/prompts/29-spirit-sight-ui-spec-amend.md`. `requirements.md` is already amended and is the source of truth for this part. The real core types are in `packages/core/src/classifier/types.ts` and `packages/core/src/types.ts`.

**Step 0:** set `"enabled": false` in `.kiro/hooks/spec-types-drift.json`. Its agent action interrupts headless spec edits. **Last step:** set it back to `true`.

**Rules:**
- Rewrite only the sections named below. **Replace** stale sections, do not append, and delete obsolete text, so that `design.md` gets shorter, not longer.
- Do not ask questions. If you near a limit, stop after a completed section and write `Next: <section>`.
- Final message: the sections you rewrote, plus the grep results named below.

**Rewrite these design.md sections:**
- **Geometry:** `pngSize(base64)` and natural size, `scale = min(1, containerWidth / pngWidth)`, a vertical scroll stage. Remove every use of `viewportWidth`/`viewportHeight` for scaling.
- **The Spirit Sight signature moment (decision A):** the `<canvas id="spirit-sight">` noise fog, the 800 ms feathered wave, overlays fading in as the wave passes, the status line, the first Wraith whisper, and the reduced-motion variant.
- **The overlay layer (decision J):** `aria-hidden` SVG shapes; named buttons in reading order (`box.y`, then `box.x`); name format "<Haunting>: <element name or role>, <severity>"; pointer events on the buttons; a dual-tone focus ring; 24 px minimum targets.
- **A concrete visual treatment for each of the 10 hauntings,** derived from its "Visual" in `.kiro/steering/hauntings.md`: shape, token colours, motion, and the reduced-motion fallback.

**Grep afterwards:** `viewportWidth` (only in "do not" lines), `spirit-sight-canvas` (0), `pngSize` (≥ 1).
