Implement **tasks 1, 2, 3 and 4** of `.kiro/specs/audit-engine/tasks.md`, in order, exactly as specified there and in `design.md`. Follow all steering docs.

Rules:
- Work in this repo (Windows, PowerShell, Node 22, npm). Use npm workspaces. Run `npm install` at the root after scaffolding.
- After each task, run its acceptance checks yourself (`npx tsc --noEmit -p packages/core`, `npx vitest --run` in `packages/core`) and fix failures before moving on.
- When a task's acceptance passes, mark it `[x]` in `tasks.md`.
- Do not start task 5 or later.
- Do not create files outside what these tasks require. Add a root `.gitignore` for `node_modules/`, `dist/`, `coverage/`, `test-results/`, `playwright-report/`. **Never** ignore `.kiro/`.

At the end, print a short summary: files created, test results (number of tests and properties passing), and anything you were unsure about.
