# THE UNSEEN: Kiroween 2026 standing report (2026-11-25, 9 days to deadline)

**Short answer:** yes, the entry ranks higher than in this morning's assessment, by a modest, real amount. Almost all of the gain is in Tech/Kiro and Impact. Presentation has not moved yet, and the entry still cannot be judged until it has a video and a Devpost submission.

## What I checked myself
- **Local README.md**
  - Lines 20-23 still say "Live app: *coming with the deploy run*" and "Demo video: *coming*". The README never links the replay site.
  - main is at d2d1c85 (the merge plus the docs commit).
- **Night Shift**
  - The README still says "Demo recording: _placeholder_" (line 9).
  - Line 202 still says "An unattended cron run has not been verified". That is contradicted by `docs/patrol-transcripts/2026-11-25-unattended-regression-run.md`, which exists.
  - `app.json:31` hard-codes `D:\kiroween 2026\night-shift`.
  - The working tree has an uncommitted change: `M demo/cursed-shop-copy/product.html`.
- **https://github.com/Siteimprove/si-a11y-kiro-power**
  - It exists: MIT, 2 commits, a Kiro Power with a Stop hook that has a "block" mode.
  - It checks statically, without a browser. Default mode is advisory.
  - In block mode it asks the developer to choose "Fix them now" or "Hand over with the block recorded", and gives the agent one more turn.
  - Its README states that Kiro has no hook that can stop an agent from ending its turn.

That last point matters for how THE UNSEEN describes its ghost gate (see red flags).

## 1. Scores (average of the three judge personas)

| Criterion | TAM | UX | Tech | Average | Field-adjusted | Prior |
|---|---|---|---|---|---|---|
| Potential Impact | 7 | 7 | 7 | **7.0** | 7.0 | ~6.5 |
| Tech / Kiro use | 8.5 | 8 | 9 | **8.5** | 8.5 | ~7.5 |
| Design | 7 | 7 | 7 | **7.0** | 7.0 | ~7 |
| Innovation | 7 | 6.5 | 7 | **6.8** | **~6.3** | 3 |
| Presentation | 3.5 | 4.5 | 3 | **3.7** | 3.7 | ~3-5 |
| **Total /50** | 33.0 | 33.0 | 33.0 | **~33.0** | **~32.5** | ~27-29 as is; ~31 with presentation fixed |

- **Why Innovation is adjusted down.** None of the three personas knew about the Siteimprove Power, which does the same mechanism (Power + MCP + Stop hook that blocks on an a11y finding). Ghost Crew also overlaps on circled-screenshot audits, keyboard reach and a midnight patrol. Innovation should be about 6.3, not 6.8.
- **Why Innovation still rose from 3.** Two things lift it: the gate checks the rendered page and is logged working live (15 to 0), and the Whisper walk, which no rival web-audit entry has.
- **With Presentation fixed** (a good video, READMEs, Devpost; Presentation around 7.5): about 7 + 8.5 + 7 + 6.3 + 7.5 = **~36/50**, against ~31 before. That is about +5 points, which is meaningful but not transformative.
- **Calibration caveat.** All three "judges" are simulations run from the same side as the builder, and they inspected the work generously (deep repo reads that real judges will not do in 5-10 minutes). Real-judge Tech/Kiro is probably 0.5-1 lower unless the video *shows* the Kiro features rather than listing them.

## 2. Probabilities (field: 19,359 registrants; likely 2,000-3,000 submissions, of which maybe 25-35% are complete and serious)

| Outcome | Today (no video or Devpost) | After the fixes below | Reasoning |
|---|---|---|---|
| Top-3 overall | ~0% (not judgeable) | **3-6%** | Kiro depth is top few percent. But Design and Innovation at 7/6.3 are not top-3 grade against entries like Ghostlight (390 commits, blind-user validation, real 3-minute video, live site). Overall winners usually need ~9 on four or more criteria. |
| Win best-fit category | ~0% | **10-18%** | See the category choice below. |
| Best Kiro Crew App | ~0% | **7-14%** (up to ~15-18% with several logged nights) | See below. |
| Best Demo | ~0% | **2-5%** | It all rests on the video. The ghost-gate block plus Whisper audio make strong demo material, but many entries are games built to show well on video. |
| Best Student (Costume Contest) | n/a | **20-35% only if the team is student-eligible** (0% otherwise) | The student subset of one category is small, and few student entries will match this Kiro depth. Eligibility must be confirmed against Devpost rules; nothing in the repos establishes it. |

**Category choice: stay in Costume Contest.**
- Costume Contest is the least crowded category: 61 GitHub repos and 37 Devpost pages. Its visible entries are mostly themed trackers, timers and pomodoros with shallow Kiro use. The main threat is a visually stunning game, not an a11y tool.
- Frankenstein is the most crowded (134 repos, 71 pages), with many "stitched audit pipeline or agent" entries (FrankenAudit, Chimera, LegacyLens and others). THE UNSEEN's stitching (accessibility tree + axe + Tab walk + MCP + Power + Crew) is good, but not more chimeric than theirs.
- The one Costume-specific risk is optics: the haunting UI that Costume Contest rewards is the layer Claude Code redesigned, not Kiro (see red flags).

**Best Kiro Crew App reasoning.**
- The field scan counts about 35-45 hackathon Crew apps. So "top-50 eligible with a Crew repo" is likely reachable *if* the main entry is complete, which makes the top-50 gate less binding than it sounds.
- ghostlight-crew is the clear favourite: 10 logged nights on a cloud VM, human approval through Discord, 5 bugs found, and a second target game.
- Night Shift's differentiators are verified source patches and the Exorcist rejecting aria-hidden cheats.
- It currently has one logged unattended run, and its README contradicts that run.

## 3. What moved the odds, and what still drags them down

**Moved them up (since the prior assessment):**
- main is merged and current, so the "stale main" problem is gone.
- The Power and ghost gate are live-tested in a real logged session: Kiro declined to fix the button, the gate fired, Kiro fixed it, 15 to 0. This is the best "Kiro surprised us" story in the entry.
- Night Shift exists as a real Crew app with an unattended run that fixed a shipped regression. That opens a bonus-prize path.
- The replay site is live and polished, with no console errors, and the app's own markup is accessible.
- The Innovation story now has two concrete differentiators: the rendered-page agent gate and verified overnight fixes.

**Still dragging them down:**
- No video and no Devpost entry. Presentation is 20% of the score, and the video decides whether the entry is judged at all. This single gap outweighs everything else.
- READMEs contradict reality:
  - The main README says live app and video are "coming" and never links the replay.
  - The Night Shift README says the run is "not verified" and the demo is a placeholder.
  - Neither README has screenshots.
  - The GitHub About section is empty on both repos.
- The live site's primary call to action is dead: the URL input and "Begin audit" are disabled, and judges' first click does nothing.
- Innovation is diluted. The Siteimprove Power pre-empts "first agent a11y gate", and Ghost Crew overlaps the visuals and the patrol. The real differentiators are buried under the haunting taxonomy.
- Authorship optics: Claude Code acted as product lead, wrote engine tasks 5-16, and did the UI fix pass and the gothic redesign.

## 4. The five highest-leverage moves before Dec 4, ranked

**1. Record and publish an under-3-minute video (Presentation +3.5 to +4.5; also Innovation +0.5 and Design +0.5 through perception).**
- **0:00-0:08:** the Checkout sample on Spirit Sight, with Whisper walk audio playing "button… button…" and a caption: "This is what a blind shopper hears at checkout."
- **0:08-0:20:** cut to the Kiro IDE in an unedited take. Kiro says "I can add it if you want", the Stop hook fires, and the haunting message is shown. One line of on-screen text: "Kiro can't call it done while a Nameless Spirit remains."
- **0:20-0:50:** Kiro fixes it, the counter goes 15 to 0, then 3 seconds of the hook JSON or Power.
- **0:50-1:40:** Spirit Sight, the Keyboard walk getting trapped in the Cursed Loop (the strongest 10 seconds in the product), the Whisper walk, and Daylight export.
- **1:40-2:20:** Night Shift. The cron fires, Seer hands to Scribe hands to Exorcist, the Exorcist rejects an aria-hidden cheat, the 1-line aria-label diff appears, and the morning report shows.
- **2:20-2:50:** a .kiro montage (10 steering docs, 5 specs, 6 hooks, 4 agents, Power, MCP, Crew) with one caption per surface naming what it achieved, plus a one-sentence authorship line.
- Before recording, fill the `[VERIFY: WebAIM…]` and `[LIVE URL]` slots in video-script.md.

**2. Save the Devpost submission today and fix every public surface (Presentation +1; removes the eligibility risk).**
- Write a Devpost section titled "How Kiro got us here" that maps each spec, steering doc and hook to an outcome, with log anchors (run 33 PreToolUse block, run 46 ghost gate, the Crew transcript). Add a "Kiro surprised us" list and the honest authorship paragraph.
- Main README:
  - Replace the placeholder rows with https://priest099.github.io/unseen/ ("Live replay edition, no install").
  - Add the YouTube link and 3-4 screenshots or GIFs.
  - Add a 60-second "Judge path" listing which sample to open and which views to try.
- Set the GitHub description, homepage and topics on both repos.

**3. Make Night Shift consistent and stronger (Best Kiro Crew App odds roughly double; Tech +0.25).**
- Remove the "not verified" sentence and the demo placeholder, and link the transcript.
- Fix the Exorcist/Scribe role wording.
- Explain or fix the score math: 84.3 before and after, "Resolved: 0", page score 87 to 85.
- Remove the `D:\` path from app.json and use a relative path or a configurable home.
- Fix the `../the-unseen` link to github.com/PRIEST099/unseen.
- Commit or revert the dirty product.html.
- Run and log at least 3-4 more dated unattended nights before Dec 4, ideally with one night that finds nothing and one that rejects a cheat. This is the only way to compete with ghostlight-crew's 10 nights.

**4. Remove the home-page dead end and polish the replay (Design +0.5 to +1; Impact +0.25).**
- **Best:** a real audit backend on any free host (render.yaml and Docker already exist).
- **Minimum:**
  - Hide the disabled form and make the three samples the hero action.
  - Shrink the hero painting so the title, a one-line pitch that says "accessibility", and the samples sit above the fold at 1366x800.
- Quick polish fixes:
  - Voice select overflow (`max-width:100%`).
  - Put the view nav at the top on all views.
  - Replace "RootWebArea" with the page title.
  - Collapse zero-count categories.
- Add a small visible "Kiro can't leave it in" panel on the site, with a GIF of the gate, so the differentiator appears where judges actually look.

**5. Reposition the Innovation pitch around what is actually distinctive (Innovation +0.5).**
- Lead with "an a11y gate that audits the *rendered* page and puts findings back into the agent's turn, logged working live (15 to 0)", plus "you *hear* the page (Whisper walk)", plus "the night crew returns *verified source patches*, not reports".
- Do not claim the gate as a first, and drop it from any "world's first" wording.
- Treat the haunting names as the costume, not the idea.

## 5. Red flags, and how to neutralize each honestly

1. **No video or Devpost submission (an eligibility risk).** Fix: move 1 and move 2. Submit a complete draft early (by about Nov 30) and iterate. Do not wait for the Cloud Run deploy.
2. **Authorship optics (Claude Code as product lead; engine tasks 5-16, fix pass and redesign by Claude Code; co-author trailers rewritten out of history).**
   - Check the Kiroween rules on other AI tools and confirm compliance.
   - In Devpost and the README, keep one plain, confident paragraph: Claude Code wrote instructions and verified, Kiro wrote the product, and each exception is listed.
   - Do not hide the trailer rewrite. It is already in the public log, and concealment would look worse than disclosure. If it comes up, say it was done for clean history and the full attribution lives in the log.
   - Costume Contest judges the UI, so consider having Kiro do the remaining polish pass from move 4, so the latest UI work is Kiro-authored and logged.
3. **The gate claim could be read as an overclaim.** The Siteimprove README says Kiro has no hook that can stop an agent from ending its turn; the Stop hook feeds back findings and grants another turn. THE UNSEEN's own log notes a CLI Stop-hook quirk.
   - Describe it precisely: "the Stop hook re-audits changed UI, exits non-zero, and hands the findings back, so Kiro keeps working instead of finishing."
   - Avoid "Kiro cannot finish, ever".
   - Credit the existence of static-analysis gates such as Siteimprove's in one clause. Kiro-team judges may know it.
4. **Night Shift self-contradictions:** "not verified" vs the transcript, the placeholder, role wording, the 84.3-to-84.3 math, the `D:\` path, the broken `../the-unseen` link and the dirty tree. Fix: move 3. Any one of these gives an attentive Crew-prize judge reason to doubt the transcript.
5. **Safety-control optics:** all cron calls auto_approved, Kiro self-approving a spawn, and a trust grant re-applied. Present these as findings with the mitigations added (the rule against self-approval, role-scoped tools, path guards, deterministic CLI verification), not as features.
6. **The disabled live input reads as "it doesn't work".** Fix: move 4. At minimum, on submit show an explicit message explaining the replay edition and pointing to the samples and the one-line Docker or MCP route.
7. **Requirement hygiene:**
   - Confirm that `.kiro/` is committed and not gitignored in *both* repos and that both carry an OSI license.
   - Make the category stated in Devpost match the README (Costume Contest).
   - Back the video's statistics with a source (the WebAIM placeholder).
   - The Power needs tarballs from the repo, a global install and install-hooks. Add a short, tested "try the gate in 5 minutes" path, or show it fully in the video, so judges are not asked to do setup they will skip.

**Bottom line:**
- The recent work raised the entry's ceiling from about 31/50 to about 36/50, almost entirely through Kiro depth, the live-tested gate and Night Shift.
- On today's artifacts it would not place, because nothing is submittable yet.
- With the video, Devpost entry and README fixes done well, realistic outcomes are roughly:
  - a 1-in-6 to 1-in-10 shot at Costume Contest;
  - a 1-in-8 to 1-in-12 shot at Best Kiro Crew App, if more nights are logged;
  - low single digits for top-3 overall.

**Files and links cited:**
- D:\kiroween 2026\the-unseen\README.md
- D:\kiroween 2026\night-shift\README.md (lines 9 and 202)
- D:\kiroween 2026\night-shift\app.json (line 31)
- D:\kiroween 2026\night-shift\docs\patrol-transcripts\2026-11-25-unattended-regression-run.md
- https://github.com/Siteimprove/si-a11y-kiro-power