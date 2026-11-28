# New-idea research (2026-11-25)

We asked for a check on whether a different Kiroween 2026 idea would beat THE UNSEEN, because its niche (haunted accessibility) is crowded. **None of the ideas below was adopted: we chose to keep THE UNSEEN.**

Method:
- **First workflow, 12 agents:**
  - three recon agents: the 2026 field, what Kiro can do, and past winners;
  - three idea generators, each with a different angle, producing 12 ideas;
  - a shortlist judge;
  - four adversarial competitor hunters;
  - a final judge.
- **Second workflow, 4 agents:** independent sceptics checked the winning idea for novelty, data feasibility and facts, and argued against it as a hostile judge.

## Result in one line

No idea survived as "no competitor and clearly better". The best one, ROLL CALL, has real prior art, and its headline demo moment doesn't work with real data. **Recommendation: keep THE UNSEEN and win on execution and presentation.**

## The 12 ideas and what killed them

| Idea | Angle | Outcome |
|---|---|---|
| ROLL CALL / Ghost Census: find the ghost listings in an insurer's therapist directory, run a guided call roll call, generate a complaint | real impact | Picked by the first judge (41/50), then failed verification (below) |
| The Changeling: consented family drill against voice-clone scams | real impact / experience | Crowded: HughKnew won 1st at a 2026 hackathon with the same loop; CivAI and vishing simulators also exist |
| Doppelgänger: a hook stops the agent writing code the repo already has | Kiro-native | Crowded: ASTrograph, dupehound, Nonna, and GitHub and Elastic dedupe workflows |
| The Fox Sisters: a Crew séance that unmasks flaky tests | Kiro-native | Crowded: CircleCI Chunk, Datadog, Trunk, and 5+ hackathon clones |
| BRAINS: mutation-testing gate for agent-written tests | Kiro-native | Mutation testing is well known; slow and noisy to run |
| HERE LIES: guards bug-fix lines in git history | Kiro-native | Git-history ghosts appear twice already in 2026 |
| Cursed Objects: camera sweep for recalled products | real impact | Camera label reading is fragile; too big for the time left |
| Bodysnatcher: dead third-party domains a site still loads | real impact | Close to the crowded dead-link cluster; real cases are rare |
| Cold Spot: "ghost hunt" that finds real home hazards | experience | Too wide; carbon monoxide inference carries safety liability |
| Count the Doors: evacuation-map photo becomes a smoke-escape game | experience | Two hard problems (map vision and a 3D engine) in 8 days |

(The other two of the 12 were duplicate framings of ROLL CALL and the Changeling.)

## Why ROLL CALL failed verification

1. **Prior art the first pass missed:**
   - **Ghost Network Buster** ([github.com/tiffpvrl/ghost-network-buster](https://github.com/tiffpvrl/ghost-network-buster), a Columbia capstone from May 2026): a patient portal, AI calls to every listed therapist, and generated regulatory complaint letters.
   - **Ghost Network Watch** ([ghostnetworkwatch.org/methodology](https://ghostnetworkwatch.org/methodology)): already uses nearly the same automated flags on the same CMS files, plus a patient guide to logging calls and complaining.
   - **Provider Data Workbench** ([github.com/mlow-io/provider-data-workbench](https://github.com/mlow-io/provider-data-workbench), created 2026-11-21).
   - **Others:** AINPI and KallyAI.
2. **The data doesn't produce the demo.** A real test on one insurer (HMSA, 3,852 behavioural-health listings) found 2 deactivated NPIs and 0 exclusion-list hits. The shared-phone flag fires on normal central scheduling lines, so "windows going dark in waves" from federal data would be fake.
   - Coverage is only ACA marketplace plans in 29 HealthCare.gov states: no employer, Medicare Advantage or most large states.
   - About half the issuer files are blocked or broken, and some are 2 GB each.
3. **Ethics and rules:**
   - An honest demo means phoning real clinicians without intent to book.
   - Rules bar third-party trademarks in the video, so the insurer can't be named, and the project must "function as depicted".
   - Weak signals would darken named clinicians' windows, which is a defamation risk.
   - The haunted framing around a mental-health crisis risks reading as tone-deaf.
4. **Scope:** seven subsystems in 8 days, the opposite of the "simple, focused" tools that won Kiroween 2025 (Faxi, BlueKai).

The hostile-judge verifier's verdict was "broken; do not switch with 9 days left." The novelty, data and fact verifiers each said "holds only with fixes", and their fixes cut it down to a narrow call log plus one complaint form. That is not a stronger entry than THE UNSEEN.

## Facts confirmed along the way (useful whatever we decide)

- **Categories:** Resurrection, Frankenstein, Skeleton Crew and Costume Contest.
- **Bonus prizes:** Best Startup ($10k, real founders only), Best Kiro Crew App ($1k), Best Demo ($1k), Blog and Social.
- **Kiro credits:** 4,000 available. **Requests are due Dec 1, 12:00 PM PT**, and review takes up to 48 business hours, with Thanksgiving in between.
- **Starting late:** a project started now is allowed, but pre-existing code must be disclosed.
- **The video:** must not show third-party trademarks without permission, and the project must function as depicted.
- **Field saturation (about 1,000 Kiroween 2026 GitHub repos):**
  - Web accessibility: about 15 entries plus 8 or more Morse/AAC (THE UNSEEN's lane).
  - Agent safety: about 25. Agent replay and chaos: about 34.
  - Dependency and repo graveyards: about 38. BBS and retro protocols: about 40.
  - Costume-skinned productivity tools: about 45.
- **Kiroween 2025 winners** favoured real underserved audiences with a full end-to-end loop. Retro tropes only won blog prizes.

## What this means for THE UNSEEN

Same judge, same scale (1–10 per criterion):

| Option | Impact | Tech/Kiro | Design | Innovation | Presentation | Total /50 |
|---|---|---|---|---|---|---|
| ROLL CALL (before verification) | 9 | 8 | 8 | 8 | 8 | 41 |
| Keep THE UNSEEN, presentation fixed | 6 | 7 | 8 | 3 | 7 | 31 |

**Keep THE UNSEEN.** Innovation is its weakest score, and the lever available is the Kiro-native angle the generators rated highest: the auditor working inside the agent loop, not beside it. This idea is unverified for competitors, so check it before committing.

The rest of the earlier plan stands:
- request credits;
- merge to main and rewrite the README;
- deploy;
- video;
- write-up;
- disclose pre-existing code.

Raw workflow output (judge report, novelty checks) was kept in the session scratchpad, not in the repo.
