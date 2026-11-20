**Workspace: a NEW, separate sibling repo named `night-shift` next to `the-unseen` (`../night-shift`)**, not inside `the-unseen`. This is the entry for the **Best Kiro Crew App** bonus. Run this instruction with that folder as the working directory.

## Product: Night Shift
A crew of Kiro agents that patrols a list of websites overnight and comes back in the morning with **accessibility fix pull requests**, not just reports. It uses THE UNSEEN's MCP server (`@the-unseen/mcp`, or a local path to `the-unseen/packages/mcp`) as its eyes.

## Crew (use Kiro Crew / `kiro-cli crew` features as they actually exist; read the current docs first and design to them)
| Agent | Job | Tools |
|---|---|---|
| **Warden** (lead) | Reads `patrol.yaml` (sites, repos, page URLs, owners) and assigns the work. At the end it writes the morning `REPORT.md`, with the score change per site. | fs_read, fs_write |
| **Seer** | Runs `audit_url` on each page, diffs against the last patrol (`.night-shift/history/*.json`), and flags only **new or worsened** hauntings. | unseen MCP, fs |
| **Scribe** | For each Wraith/Restless haunting that maps to source in the linked repo, it finds the component and drafts a minimal **source** fix on a branch `night-shift/<date>-<haunting-id>`. It never adds overlays or injected scripts. | fs, git, shell |
| **Exorcist** (verifier) | Runs the target repo's dev server, re-audits, and keeps the Scribe's fix only if the haunting is gone and no new one appeared. Otherwise it reverts and notes why in the report. | unseen MCP, shell, git |

## Requirements
- Demo target: patrol `the-unseen/apps/cursed-shop`, served locally. Night Shift fixes a **copy** at `night-shift/demo/cursed-shop-copy`, never the original.
- Show the crew coordination in a short recording: handoffs, the Exorcist rejecting at least one bad fix, and the morning report.
- `patrol.yaml` schema and validation. Schedule example: Windows Task Scheduler and cron entries that run `kiro-cli crew …` headless.
- **No pushes and no PR creation by default.** Branches stay local, and `--open-prs` (opt-in) uses `gh`.
- `.kiro/` committed: steering (`crew.md` with the roles and rules), specs if needed, and the agent configs.
- MIT license, plus a README with an architecture diagram, setup and the demo GIF placeholder.

Start with a short spec in `.kiro/specs/night-shift/` (requirements, design, tasks), then implement it. Final message: the commands to run the demo patrol and what the morning report looks like.
