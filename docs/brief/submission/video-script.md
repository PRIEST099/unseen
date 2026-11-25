# Demo video script (target 2:45, hard limit 3:00)

**Rules that shape it:**
- Show the real product working end to end.
- No third-party trademarks or logos: audit only our own fictional "Hollow & Vine" Cursed Shop and THE UNSEEN itself.
- No copyrighted music. Use the app's own ambient drone, or silence.
- The project must "function as depicted", so every shot is a real capture, not a mock-up.

**Capture setup:**
- 1920×1080 browser at 100% zoom, with the cursor highlighted.
- Speech captions on.
- Record the narration separately, in the entrant's own voice or with a clearly disclosed synthetic voice.

| Time | Picture | Narration (spoken) |
|---|---|---|
| 0:00–0:12 | Black screen. The Whisper walk audio of the Cursed Shop only: "button… button… link… button…" | "This is a shop, as a screen reader hears it. Which button pays? Nobody can tell." |
| 0:12–0:25 | Cut to the shop, looking normal and pretty. | "Most of the web fails basic accessibility checks [VERIFY: WebAIM Million, latest edition]. The tools that find this already exist. Developers still ship it, because they never see it and never hear it." |
| 0:25–0:40 | THE UNSEEN landing (manor painting, candle). Paste the shop URL. The séance stage labels advance. | "THE UNSEEN makes you see it. Paste a URL and the spirits walk the page in a real browser: the accessibility tree, axe-core and a real Tab walk." |
| 0:40–1:05 | Spirit Sight: hauntings drawn on the screenshot. Hover a Nameless Spirit, then open the dialog: WCAG, who it hurts, the offending HTML, the fix. | "Every failure becomes a haunting with a real WCAG criterion. This icon-only button is a Nameless Spirit: a screen reader says only 'button'." |
| 1:05–1:20 | Keyboard walk: the ghost Tabs, gets stuck in the newsletter Cursed Loop, and the chime repeats. | "Here is a keyboard user. The newsletter popup is a Cursed Loop, and they can never leave it." |
| 1:20–1:30 | Daylight: the parchment ledger and Export. | "In Daylight, it's a plain report you can hand to your team." |
| 1:30–2:15 | **Kiro IDE**, with the Power installed. Prompt: "build a checkout button". Kiro writes an icon-only button. The ghost gate fires: "Nameless Spirit, critical". Kiro fixes the source, re-audits, and the score rises. | "Seeing it isn't enough, so we put THE UNSEEN inside Kiro. It's a Kiro Power with an MCP server and a ghost gate: Kiro is not allowed to finish a UI task while a ghost is in it. Watch it catch its own mistake, fix the source, and prove the fix." |
| 2:15–2:35 | Quick montage: the `.kiro/` tree (steering, specs, hooks, agents); the `tasks.md` checkboxes ticking; the guard hook blocking a write to the golden file; the self-audit test going green. | "Kiro built all of this from specs, steering and hooks. One hook stops any agent cheating our golden test. And THE UNSEEN audits its own UI on every test run: zero hauntings." |
| 2:35–2:45 | The landing painting with the URL on screen. | "THE UNSEEN. See the web through their eyes, then make Kiro fix it. Try it at [LIVE URL]." |

## Shot list to capture
1. The Whisper walk audio of `checkout.html` (clean audio capture).
2. A full run from the landing page through the séance to Spirit Sight on the Cursed Shop (one continuous take).
3. A keyboard walk segment ending in the Cursed Loop.
4. Daylight, plus the Export click.
5. **The Kiro IDE Power demo (follow `power/DEMO.md` exactly; rehearse twice, and keep the best real take).**
6. B-roll: the `.kiro/` tree, `tasks.md`, the guard hook's stderr message, and the self-audit test output.

## Before recording, check
- The live URL works, and the samples load quickly (cached).
- No browser extensions or bookmarks bar are visible, and no personal tabs or notifications show.
- The statistic in 0:12 is checked against its source and cited in the description.
