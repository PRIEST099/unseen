Part C of 3. First read `docs/brief/prompts/38-ui-design-fresh-common.md` (shared context, rules and decisions) and follow it exactly.

Make `tasks.md` and `requirements.md` match the **new** `design.md` (written in parts A and B).

**`tasks.md`:** fix items 11–15, 39–46 and 59–63 from `docs/brief/review-notes/spirit-sight-ui-consistency-1.md`.
- Add **task 0: scaffold `apps/web`**.
- Add the **`buildSpeechTrack` core task** next to the `onProgress` task.
- Make every checkpoint command Windows-safe (`npm run ... -w ...`).
- Make the Phase 1 slice self-contained: samples → Spirit Sight (overlays, score, fog toggle) → Daylight with export → an e2e test on the Cursed Shop sample.
- Point every task's design references at sections of the new `design.md`.

**`requirements.md`:** fix the contradictions the note lists, including:
- 1.4: health route
- 3.8 vs 5.7
- 8.1: base64 screenshot
- 10.2: name format
- 16.x: reduced-motion default
- 33.3: sound preference

**Last step:** set `spec-types-drift.json` back to `"enabled": true`. Then do one types-drift comparison yourself and report it.

Final message: a table of consistency items 1–63 → where each is resolved.
