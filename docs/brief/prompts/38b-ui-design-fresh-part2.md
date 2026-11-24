Part B of 3. First read `docs/brief/prompts/38-ui-design-fresh-common.md` (shared context, rules and decisions) and follow it exactly.

**Append** these sections to `.kiro/specs/spirit-sight-ui/design.md.new`, then **replace** `design.md` with it and delete `design.md.new`:

8. **Spirit Sight.** Geometry, then the signature moment:
   - state lives in `SpiritSightView`
   - canvas `#spirit-sight` with an 800 ms feathered noise wave
   - overlays fade in as the wave passes them
   - the status line, and the first Wraith whisper
   - the reduced-motion version
   - the acceptance test
9. **Overlay layer.** Give each of the 10 hauntings a concrete treatment, taken from its "Visual" in `hauntings.md`. Fog density comes from the real Fog fields.
10. **Whisper walk.** One "Hear what they hear" button. Speech in AX-tree order through `buildSpeechTrack`. Captions, plus a captions-only stepping mode.
11. **Keyboard walk.** Use the real `TabStep`/`TabWalkResult` fields:
    - Lost Souls are shown behind glass.
    - Escapable cycles come from `tabWalkResult.cycles[].escapable`.
    - A true Cursed Loop circles with the ember ring until the user stops it.
    - Reduced motion uses a manual step mode with no timers.
12. **Daylight and product states.** Group by every `wcag[]` entry, list the manual checks, quote the coverage note verbatim, and support export. Then the product states.
13. **Self-audit and testing strategy,** with Windows-safe commands.
14. **Correctness properties:**
    - geometry Property 1, rewritten for fit-to-width
    - reading order
    - the overlay name format

**Checks after replacing:**
- `design.md` is ≤ 70 KB and has no duplicate section headings.
- Grep for each of these; every count must be 0:
  - `/haunted/`
  - `screenshotPng` used as an `img` source
  - `alert(`
  - `prettyPrint`
  - `__dirname`
  - `classify(` as an import
  - deep `@the-unseen/core/` imports
  - `window.addEventListener('keydown'` used for shortcuts
