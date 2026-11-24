Part B of 4. **Context:** we are amending `.kiro/specs/spirit-sight-ui/` after a review: `docs/brief/review-notes/spirit-sight-ui-spec-review-1.md` (52 findings) and decisions A–N in `docs/brief/prompts/29-spirit-sight-ui-spec-amend.md`. `requirements.md` is already amended and is the source of truth for this part. The real core types are in `packages/core/src/classifier/types.ts` and `packages/core/src/types.ts`.

**Step 0:** set `"enabled": false` in `.kiro/hooks/spec-types-drift.json`. Its agent action interrupts headless spec edits. **Last step:** set it back to `true`.

**Rules:**
- Rewrite only the sections named below. **Replace** stale sections, do not append, and delete obsolete text, so that `design.md` gets shorter, not longer.
- Do not ask questions. If you near a limit, stop after a completed section and write `Next: <section>`.
- Final message: the sections you rewrote, plus the grep results named below.

**Rewrite these design.md sections:**
- **Whisper walk (decision I):** the whole page in accessibility-tree order, through core's `announce` (or a `buildSpeechTrack` helper exported from core; specify it). Haunted nodes use their haunting speech and are highlighted. One "Hear what they hear" button is the user gesture. A visible caption mirrors every utterance. With sound off, a timed caption mode with step, back and pause. Remove every `alert(`.
- **Keyboard walk (decision K):** the ghost follows the real `TabStep`s. Lost Souls are shown behind glass and skipped. An escapable cycle circles once, then breaks free. A true Cursed Loop circles with the ember ring until the user stops it. Reduced motion uses manual step mode.
- **Route focus (decision L):** on every route change, focus moves to the h1 and the view is announced. A visible "Keyboard help" button; no single-character shortcuts.

**Grep afterwards:** `alert(` (0), `'?'` (only in "do not" lines).
