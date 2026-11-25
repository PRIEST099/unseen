**Workspace: the NEW sibling repo `D:\kiroween 2026\night-shift`** (not inside `the-unseen`). This is the entry for the **Best Kiro Crew App** bonus prize.

Create the Kiro spec `.kiro/specs/night-shift/` (`requirements.md`, `design.md`, `tasks.md`) in that repo. **Do not implement yet.** Use the same task format as `the-unseen/.kiro/specs/unseen-mcp-and-power/tasks.md`: checkboxes, requirement references, mandatory property-based test sub-tasks, and at most about 12 top-level tasks in demo-critical order. Never end with a menu or a question. Print `Next: implementation` when the spec is written.

Read `../the-unseen/docs/brief/prompts/17-night-shift-crew.md` for the product idea. The decisions below win over it.

## Product
**Night Shift** is a crew of Kiro agents. It patrols a list of websites overnight with THE UNSEEN and comes back in the morning with **accessibility fixes in source**, not just reports. It uses THE UNSEEN's MCP server as its eyes.

Roles:
- **Warden** (lead): reads `patrol.yaml`, assigns the work, and writes the morning report.
- **Seer**: audits each page and flags only **new or worsened** hauntings compared with the last patrol.
- **Scribe**: drafts a minimal source fix for each Wraith or Restless haunting.
- **Exorcist** (verifier): re-audits each fix. It keeps the fix only if the haunting is gone and no new one appeared; otherwise it rejects the fix and says why.

## What a Kiro Crew app is (from the official docs; the product lead checked them on 2026-11-25; design to this exactly)
- Kiro Crew (`kirocrew`, Crew 0.13.0 or later) is an open-source local agent gateway that drives kiro-cli. An **app** is a package with an **`app.json` manifest at the repo root**. It can contribute agents, skills, MCP servers, cron jobs, dashboard UI pages and backends. There is no `crew.yaml`.
- **`app.json`**:
  - Required: `name` (kebab-case), `version` (semver), `displayName`, `description`.
  - Recommended: `author`, `license`, `minKiroCrewVersion`, `tags`.
  - Resources: `agents` (paths to agent JSON files), `skills` (skill folders containing a `SKILL.md`), `mcpServers` (in mcp.json format).
  - `crons[]` entries: `{name, every | cron_expr, message, agent, enabled}`.
  - `ui`: `{entry: "dist/index.mjs", pages: [{route, label, icon}]}`.
  - `permissions`: for example `{api: [...]}`. Only `permissions.api` is enforced today.
  - Unknown fields are preserved.
- **Agent JSON files:** `{"name", "description", "model": "auto", "prompt", "tools": ["@kirocrew-core", ...]}`. Agents are validated offline with `kirocrew agent validate ./agents`.
- **Handoff between agents:** the lead spawns subagents through the `kirocrew-core` tools (`spawn`, `wait`, messaging). Subagent results are injected into the lead's conversation. The delegation gate needs a stated reason such as `specialist`. Workflows (Python scripts) and a conductor exist too. Pick the simplest documented mechanism that shows real handoffs, and justify it in `design.md`.
- **Cross-platform limits:**
  - Command crons run through `sh -c` on POSIX hosts, and exec backends are POSIX-only.
  - This machine is Windows, so use **message crons** (`message` + `agent`) only.
  - Use no exec backend.
  - Leave `platform` out of the manifest, because the Windows value is not documented.
- **Dashboard UI:**
  - The bundle is an ESM file that imports `@kirocrew/app-sdk` and `@kirocrew/app-sdk/ui`. These come from the host import map, not npm.
  - Mark react, react-dom, react/jsx-runtime, lucide-react and @kirocrew/app-sdk as Vite externals.
  - **Commit `ui/dist/`**.
- **Install:** `kirocrew app install <path or git URL>`, then `kirocrew app enable night-shift`.

## Decisions
1. **A deterministic core the agents call** keeps the crew honest and testable without Crew. It is a small Node/TypeScript CLI, `night-shift`, with these subcommands:
   - `validate`: checks `patrol.yaml` against a schema.
   - `audit`: calls THE UNSEEN through its MCP server or core and writes `.night-shift/history/<site>/<date>.json`.
   - `diff`: lists new and worsened hauntings using **stable fingerprints** (`type|kind|htmlSnippet` plus an occurrence index), never node ids. Reuse the idea from `the-unseen/packages/mcp/src/pure/baseline.ts` by importing it if practical, or re-implement it with property-based tests.
   - `verify <site> <fixDir>`: re-audits a fix and decides keep or reject.
   - `report`: writes `REPORT.md` and `report.json` with the score change per site, kept and rejected fixes, and the reasons.
   
   With `--no-agents`, the CLI runs the whole patrol except the fixes. This is the CI and test path.
2. **The agents** (`agents/warden.json`, `seer.json`, `scribe.json`, `exorcist.json`) use the CLI through skills (`skills/patrol`, `skills/draft-fix`, `skills/verify-fix`) and the THE UNSEEN MCP tools.
   - The Scribe never adds overlays or injected scripts, only source fixes.
   - The Exorcist must reject at least one bad fix in the demo. The demo includes one haunting whose obvious "fix" (for example `aria-hidden` on a focusable control) creates a new haunting (The Veiled), so the rejection is real, not staged.
3. **THE UNSEEN MCP server** is declared in `app.json` `mcpServers`. The command is `node` with the server path taken from env `UNSEEN_MCP_SERVER_JS`, defaulting to `../the-unseen/packages/mcp/dist/server.js`. Document both this and the global `unseen-mcp` bin.
4. **Demo target:**
   - Copy `../the-unseen/apps/cursed-shop` (HTML, CSS and img only) to `demo/cursed-shop-copy/`.
   - Serve it locally on a free port.
   - Fixes go to `demo/work/<patrol-id>/<haunting-id>/`. A kept fix is applied to `demo/cursed-shop-fixed/`.
   - Never touch `the-unseen`.
   - **No git pushes and no pull requests.** A `--open-prs` flag is documented as future work only.
5. **Cron:** `nightly-patrol`, `cron_expr` `"0 2 * * *"`, message `"Run the Night Shift patrol from patrol.yaml and write the morning report."`, agent `warden`, `enabled: false` by default. The README explains how to enable it.
6. **Dashboard page "Morning report"** (`/apps/night-shift`): shows the latest `report.json` with the score change per site, kept and rejected fixes, and the reasons. It reads the report through a documented app API route, or falls back to a static import of the last report if a backend is not possible without exec. Justify the choice. It must be accessible: THE UNSEEN would audit it.
7. **This repo's `.kiro/`:**
   - steering `crew.md` (roles and rules), `product.md`, `tech.md`
   - this spec
   - one hook (a test gate on Stop)
8. **Repo hygiene:** MIT `LICENSE`, and a README with a Mermaid architecture diagram, setup for macOS/Linux and Windows, the demo commands, and what the morning report looks like.
9. **Tests:** Vitest plus fast-check for the patrol schema, the diff, the report and the keep/reject decision. A test validates `app.json` against the documented required fields, and each agent file against the documented agent shape. One integration test runs `night-shift patrol --no-agents` against the served demo copy.

## Demo-critical order for tasks
1. The CLI core (validate, audit, diff, report)
2. Verify plus the keep/reject decision
3. `app.json` and the four agents and three skills
4. The demo copy and the planted "bad fix" case
5. The dashboard page
6. The README and `.kiro`
7. The cron
