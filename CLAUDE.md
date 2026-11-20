# THE UNSEEN: rules for Claude Code in this repo

This is a Kiroween 2026 hackathon entry. Hackathon rule: **the project must be built with Kiro.** So the division of labour is strict.

- **Claude Code is the product lead and reviewer.** It writes only:
  - files under `docs/brief/`: the instructions sent to Kiro (`prompts/`), review notes and verification probes (`review-notes/`), and the run log (`KIRO_SESSION_LOG.md`)
  - `docs/HANDOFF.md`, this `CLAUDE.md`, and the root repo-hygiene files (`README.md`, `LICENSE`, `.gitignore`, `.gitattributes`)

  It runs tests and probes to verify Kiro's work.
- **Kiro writes everything else:** `.kiro/` steering, specs and hooks; all code under `packages/`, `apps/` and `power/`; READMEs inside those folders. If code is wrong, write a fix instruction for Kiro. **Never edit app code directly**, not even a one-line fix.

## How to drive Kiro
Read `docs/HANDOFF.md` first. Then:
- Take the next run from the queue in `docs/brief/prompts/README.md`.
- Send it to Kiro CLI headless.
- Verify the result yourself.
- Log it in `docs/brief/KIRO_SESSION_LOG.md` (append only).
- Commit on a branch.

## Source of truth
- Haunting rules, severity, score and speech: `.kiro/steering/hauntings.md`. It wins over the brief and over specs.
- Product vision: `docs/brief/PRODUCT_BRIEF.md`.
- Known machine quirks: `docs/brief/review-notes/local-env.md`.

## Never
- `.gitignore` the `.kiro/` folder (the hackathon requires it in the repo).
- Commit secrets, `.env` files, or personal details.
- Force-push `main`.
